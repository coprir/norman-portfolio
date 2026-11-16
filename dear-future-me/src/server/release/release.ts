import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { formatInZone } from "@/lib/time/release";
import { audit } from "../audit";
import { hashToken, newToken } from "../auth/tokens";
import { recordEvent } from "../capsules/events";
import { sealedKey, type SealManifest, type SealedPayload } from "../capsules/seal";
import { releaseDataKey } from "../crypto/keys";
import { IntegrityError, canonicalJson, sha256Hex, unsealBuffer, unsealStream } from "../crypto/seal";
import { db } from "../db";
import { sendEmail } from "../email/send";
import { capsuleReminder, capsuleUnlocked } from "../email/templates";
import { logger } from "../logger";
import { deleteObjects } from "../memories";
import { createNotification, notify } from "../notifications";
import { redis } from "../redis";
import { storage } from "../storage";

export type ReleaseResult = "released" | "already_released" | "not_releasable";

const releasedKey = (prefix: string, name: string) => `released/${prefix}/${name}`;

/**
 * Verifies and opens the seal. Runs only where the key service's private key
 * is available (the release worker), and only at or after unlock_at.
 *
 *  1. The manifest must hash to the value recorded at sealing.
 *  2. The key service releases the data key (it refuses before unlock_at).
 *  3. Every object is decrypted with its ciphertext hash, GCM tag and
 *     plaintext hash all checked. One mismatch aborts the release.
 *  4. One conditional UPDATE moves LOCKED → AVAILABLE together with the
 *     released items, so two workers can never both win. The database itself
 *     rejects that UPDATE if unlock_at is still in the future.
 */
async function openSeal(capsuleId: string): Promise<boolean> {
  const c = await db.capsule.findUniqueOrThrow({ where: { id: capsuleId } });
  if (c.status !== "LOCKED") return false;
  const manifest = c.sealedContentManifest as SealManifest | null;
  if (!manifest || !c.sealPrefix || !c.encryptionKeyReference || !c.unlockAt) throw new IntegrityError("Capsule has no seal");
  if (sha256Hex(canonicalJson(manifest)) !== c.contentIntegrityHash) throw new IntegrityError("Manifest does not match its integrity hash");

  const dataKey = await releaseDataKey(c.encryptionKeyReference, capsuleId);
  const s = storage();
  try {
    const object = (name: string) => {
      const o = manifest.objects.find((x) => x.name === name);
      if (!o) throw new IntegrityError(`Manifest has no object ${name}`);
      return { ...o, key: sealedKey(c.sealPrefix!, name) };
    };
    const payload = JSON.parse((await unsealBuffer({ object: object("payload"), dataKey, capsuleId })).toString("utf8")) as SealedPayload;
    if (payload.items.length !== manifest.itemCount) throw new IntegrityError("Payload and manifest disagree on item count");

    const rows: Prisma.CapsuleItemCreateManyInput[] = [];
    for (const item of payload.items) {
      let storageKey: string | null = null;
      let thumbnailKey: string | null = null;
      if (item.sha256) {
        storageKey = releasedKey(payload.releasePrefix, `item-${item.index}`);
        await unsealStream({
          object: object(`item-${item.index}`),
          dataKey,
          capsuleId,
          expectPlaintextSha256: item.sha256,
          sink: (plaintext) => s.putStream(storageKey!, plaintext, item.mimeType ?? "application/octet-stream"),
        });
      }
      if (item.thumbSha256) {
        thumbnailKey = releasedKey(payload.releasePrefix, `thumb-${item.index}`);
        await unsealStream({
          object: object(`thumb-${item.index}`),
          dataKey,
          capsuleId,
          expectPlaintextSha256: item.thumbSha256,
          sink: (plaintext) => s.putStream(thumbnailKey!, plaintext, "image/webp"),
        });
      }
      rows.push({
        capsuleId,
        displayOrder: item.index,
        mediaType: item.mediaType,
        title: item.title,
        description: item.description,
        originalFilename: item.originalFilename,
        mimeType: item.mimeType,
        fileSize: BigInt(item.fileSize),
        content: item.content,
        captureDate: item.captureDate ? new Date(item.captureDate) : null,
        storageKey,
        thumbnailKey,
        contributorName: item.contributorName,
        metadata: (item.metadata ?? {}) as Prisma.InputJsonValue,
      });
    }

    const stillThere = new Set((await db.user.findMany({ where: { id: { in: payload.answers.map((a) => a.userId) } }, select: { id: true } })).map((u) => u.id));
    const won = await db.$transaction(
      async (tx) => {
        const moved = await tx.capsule.updateMany({
          where: { id: capsuleId, status: "LOCKED", unlockAt: { lte: new Date() } },
          data: { status: "AVAILABLE", releasedAt: new Date(), message: payload.message },
        });
        if (moved.count !== 1) return false;
        if (rows.length) await tx.capsuleItem.createMany({ data: rows });
        const answers = payload.answers.filter((a) => stillThere.has(a.userId));
        if (answers.length) {
          await tx.capsuleAnswer.createMany({
            data: answers.map((a) => ({ capsuleId, userId: a.userId, promptKey: a.promptKey, prompt: a.prompt, answer: a.answer, phase: "THEN" as const, createdAt: new Date(a.createdAt) })),
          });
        }
        await recordEvent(tx, capsuleId, "release_verified", null, { objects: manifest.objects.length, contentIntegrityHash: c.contentIntegrityHash });
        await recordEvent(tx, capsuleId, "released", null, { unlockAt: c.unlockAt!.toISOString(), items: rows.length });
        return true;
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
    if (won) {
      // Plaintext now lives in private storage behind short-lived URLs; the ciphertext is no longer needed.
      await deleteObjects(manifest.objects.map((o) => sealedKey(c.sealPrefix!, o.name)));
      await audit({ action: "capsule.released", resourceId: capsuleId, metadata: { unlockAt: c.unlockAt.toISOString(), items: rows.length } });
      logger.info({ capsuleId }, "capsule released");
    }
    return won;
  } finally {
    dataKey.fill(0);
  }
}

/**
 * Only one process opens a given seal at a time. Anyone else waits for it to
 * finish and then carries on to the (idempotent) notification step. The lock
 * is a courtesy that avoids duplicate decryption work; correctness rests on
 * the conditional UPDATE inside `openSeal`.
 */
async function withReleaseLock(capsuleId: string, fn: () => Promise<boolean>): Promise<boolean> {
  const r = redis();
  const key = `dfm:release:${capsuleId}`;
  const token = randomBytes(8).toString("hex");
  const deadline = Date.now() + 15 * 60_000;
  while (!(await r.set(key, token, "PX", 15 * 60_000, "NX"))) {
    if (Date.now() > deadline) throw new Error("Timed out waiting for another worker to release this capsule");
    await new Promise((res) => setTimeout(res, 150));
  }
  try {
    return await fn();
  } finally {
    if ((await r.get(key)) === token) await r.del(key);
  }
}

/**
 * Releases a capsule and tells its recipients. Safe to call any number of
 * times, concurrently, and after a crash at any point: the seal is opened at
 * most once, each in-app notification is keyed by a unique dedupe key, and
 * each email is claimed before sending and un-claimed if the send fails.
 */
export async function releaseCapsule(capsuleId: string): Promise<ReleaseResult> {
  const before = await db.capsule.findUnique({ where: { id: capsuleId }, select: { status: true, unlockAt: true } });
  if (!before) return "not_releasable";
  let released = false;
  if (before.status === "LOCKED") {
    if (!before.unlockAt || before.unlockAt.getTime() > Date.now()) return "not_releasable";
    try {
      released = await withReleaseLock(capsuleId, () => openSeal(capsuleId));
    } catch (err) {
      await recordEvent(db, capsuleId, "release_failed", null, { error: (err as Error).message.slice(0, 300) }).catch(() => {});
      throw err;
    }
  }
  const capsule = await db.capsule.findUnique({
    where: { id: capsuleId },
    include: { creator: { select: { id: true, name: true, email: true } }, recipients: true },
  });
  if (!capsule || (capsule.status !== "AVAILABLE" && capsule.status !== "OPENED")) return "not_releasable";

  const now = new Date();
  const failures: string[] = [];
  for (const r of capsule.recipients) {
    if (r.invitationStatus === "DECLINED") continue;
    try {
      // Re-validate who this recipient is at release time: an address may
      // have been registered (and verified) since the capsule was sealed.
      const account = r.userId
        ? await db.user.findUnique({ where: { id: r.userId }, select: { id: true, name: true, email: true } })
        : await db.user.findFirst({ where: { email: r.email, emailVerifiedAt: { not: null } }, select: { id: true, name: true, email: true } });
      if (account && !r.userId) await db.capsuleRecipient.update({ where: { id: r.id }, data: { userId: account.id } });
      const fromSelf = account?.id === capsule.creatorId;

      if (account) {
        await createNotification({
          userId: account.id,
          type: "CAPSULE_UNLOCKED",
          capsuleId,
          title: fromSelf ? "A message from your past is waiting" : `${capsule.creator.name} left something for you`,
          body: `“${capsule.title}” is ready to open.`,
          dedupeKey: `released:${capsuleId}:${account.id}`,
        });
      }

      const claim = await db.capsuleRecipient.updateMany({ where: { id: r.id, releaseNotifiedAt: null }, data: { releaseNotifiedAt: now } });
      if (claim.count !== 1) continue;
      try {
        // People who never accepted get a fresh single-use link to claim it.
        let inviteToken: string | undefined;
        if (!account || (r.invitationStatus === "PENDING" && !fromSelf)) {
          inviteToken = newToken();
          await db.capsuleRecipient.update({ where: { id: r.id }, data: { inviteTokenHash: hashToken(inviteToken) } });
        }
        await sendEmail(
          account?.email ?? r.email,
          capsuleUnlocked({ name: account?.name ?? r.recipientName ?? "there", capsule, fromSelf, creatorName: capsule.creator.name, inviteToken }),
        );
      } catch (err) {
        await db.capsuleRecipient.update({ where: { id: r.id }, data: { releaseNotifiedAt: null } });
        throw err;
      }
    } catch (err) {
      failures.push(`${r.id}: ${(err as Error).message}`);
    }
  }
  // The capsule is open either way; a thrown error only makes the job retry
  // the deliveries that are still outstanding.
  if (failures.length) throw new Error(`Released, but ${failures.length} notification(s) failed: ${failures.join("; ").slice(0, 400)}`);
  return released ? "released" : "already_released";
}

export async function sendReminder(capsuleId: string, variant: string): Promise<void> {
  const capsule = await db.capsule.findUnique({ where: { id: capsuleId }, include: { recipients: { where: { userId: { not: null }, invitationStatus: { not: "DECLINED" } } } } });
  if (!capsule || !capsule.unlockAt || capsule.status !== "LOCKED") return;
  const when = variant === "1d" ? "tomorrow" : `on ${formatInZone(capsule.unlockAt, capsule.timezone, false)}`;
  for (const r of capsule.recipients) {
    await notify(
      {
        userId: r.userId!,
        type: "CAPSULE_REMINDER",
        capsuleId,
        title: variant === "1d" ? "A capsule opens tomorrow" : "A capsule opens in a week",
        body: `“${capsule.title}” opens ${when}.`,
        dedupeKey: `reminder:${capsuleId}:${variant}:${r.userId}`,
      },
      (u) => capsuleReminder(u.name, capsule, when),
    );
  }
}
