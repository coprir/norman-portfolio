import { randomBytes } from "node:crypto";
import { SEALING_DECLARATION_VERSION } from "@/lib/declaration";
import { ScheduleError, computeUnlockAt, formatInZone, type ScheduleInput } from "@/lib/time/release";
import { audit } from "../audit";
import type { SessionUser } from "../auth/session";
import { hashToken, newToken } from "../auth/tokens";
import { canonicalJson, sealBuffer, sealStream, sha256Hex, type SealedObject } from "../crypto/seal";
import { canSeal, keyReference, newDataKey, wrapDataKey } from "../crypto/keys";
import { db } from "../db";
import { sendEmailSafe } from "../email/send";
import { capsuleInvite, capsuleLocked } from "../email/templates";
import { badRequest, conflict, forbidden, notFound, unavailable } from "../errors";
import { logger } from "../logger";
import { deleteObjects } from "../memories";
import { createNotification, notify } from "../notifications";
import { assertCanLock, assertCanStore } from "../plans";
import { enqueueJob, scheduleCapsuleJobs } from "../release/queue";
import { newObjectKey, storage } from "../storage";
import { recordEvent } from "./events";

const HOUR = 60 * 60 * 1000;
const REMINDERS = [
  { variant: "7d", ms: 7 * 24 * HOUR },
  { variant: "1d", ms: 24 * HOUR },
];

/** What the sealed, encrypted payload holds. Nothing here exists in the database while locked. */
export type SealedPayload = {
  version: 1;
  /** Where the plaintext is written at release. Secret until then. */
  releasePrefix: string;
  message: string | null;
  answers: { userId: string; promptKey: string; prompt: string; answer: string; createdAt: string }[];
  items: {
    index: number;
    mediaType: "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT" | "LETTER";
    title: string | null;
    description: string | null;
    originalFilename: string | null;
    mimeType: string | null;
    fileSize: number;
    content: string | null;
    captureDate: string | null;
    contributorName: string | null;
    metadata: unknown;
    sha256: string | null;
    thumbSha256: string | null;
  }[];
};

export type SealManifest = {
  version: 1;
  cipher: "AES-256-GCM";
  keyWrap: "RSA-OAEP-SHA256";
  objects: { name: string; size: number; sha256: string }[];
  itemCount: number;
  totalBytes: number;
};

export const sealedKey = (prefix: string, name: string) => `sealed/${prefix}/${name}`;

/**
 * Step 1 of sealing, in the web request: validate everything, fix the unlock
 * instant, freeze the recipient list and hand the capsule to the worker.
 * From this moment the capsule can no longer be edited.
 */
export async function requestSeal(user: SessionUser, id: string, ip?: string) {
  if (!user.emailVerified) throw forbidden("Confirm your email address before sealing a capsule, so it can find you when it opens.");
  if (!canSeal()) throw unavailable("Sealing isn't available right now. Please try again shortly.");
  const c = await db.capsule.findFirst({
    where: { id, creatorId: user.id },
    include: { recipients: true, memories: { include: { memory: true } }, contributions: true, _count: { select: { answers: true } } },
  });
  if (!c) throw notFound("Capsule not found.");
  if (c.status !== "DRAFT") throw conflict("This capsule is already sealed.");
  if (!c.title.trim()) throw badRequest("Give your capsule a title.");
  if (!c.schedule) throw badRequest("Choose when this capsule should open.");
  if (!c.memories.length && !c.message?.trim() && !c._count.answers) throw badRequest("Add at least one memory or a message before sealing.");

  // Ownership: every item is the creator's own, or was contributed to this capsule by an invited contributor.
  const contributed = new Set(c.contributions.map((x) => x.memoryId));
  for (const { memory } of c.memories) {
    if (memory.status !== "READY") throw badRequest("One of the memories in this capsule is still uploading or is no longer available.");
    if (memory.userId !== user.id && !contributed.has(memory.id)) throw badRequest("One of the memories in this capsule doesn't belong to it.");
  }
  const elsewhere = await db.capsuleMemory.findFirst({
    where: { memoryId: { in: c.memories.map((m) => m.memoryId) }, capsuleId: { not: c.id } },
    select: { memory: { select: { title: true } }, capsule: { select: { title: true } } },
  });
  if (elsewhere) {
    throw conflict(`“${elsewhere.memory.title ?? "A memory"}” is also in your draft “${elsewhere.capsule.title}”. A memory can only be sealed into one capsule — remove it from one of them.`);
  }

  const others = c.recipients.filter((r) => r.email !== user.email);
  if (!c.includeSelf && !others.length) throw badRequest("Choose who will receive this capsule.");
  await assertCanLock(user.id, others.length);
  // Contributed memories count against the creator's storage once sealed.
  const incoming = c.memories.filter((m) => m.memory.userId !== user.id).reduce((n, m) => n + Number(m.memory.fileSize), 0);
  if (incoming) await assertCanStore(user.id, 0, incoming);

  const now = new Date();
  let unlockAt: Date;
  try {
    // Computed here, on the server, at the moment of sealing: "in one year" counts from now.
    unlockAt = computeUnlockAt(c.schedule as ScheduleInput, now);
  } catch (err) {
    if (err instanceof ScheduleError) throw badRequest(err.message);
    throw err;
  }

  const registered = await db.user.findMany({ where: { email: { in: others.map((r) => r.email) }, emailVerifiedAt: { not: null } }, select: { id: true, email: true } });
  const byEmail = new Map(registered.map((u) => [u.email, u.id]));

  const job = await db.$transaction(async (tx) => {
    // Recipients are frozen first; the database refuses changes once the capsule leaves DRAFT.
    await tx.capsuleRecipient.deleteMany({ where: { capsuleId: c.id, email: user.email } });
    if (c.includeSelf) {
      await tx.capsuleRecipient.create({
        data: { capsuleId: c.id, userId: user.id, email: user.email, recipientName: user.name, permission: "VIEW", invitationStatus: "ACCEPTED", acceptedAt: now },
      });
    }
    for (const r of others) {
      if (!r.userId && byEmail.has(r.email)) await tx.capsuleRecipient.update({ where: { id: r.id }, data: { userId: byEmail.get(r.email) } });
    }
    const moved = await tx.capsule.updateMany({
      where: { id: c.id, status: "DRAFT" },
      data: {
        status: "SEALING",
        unlockAt,
        sealPrefix: randomBytes(24).toString("hex"),
        visibility: !others.length ? "PRIVATE" : c.visibility === "PRIVATE" ? "SHARED" : c.visibility,
      },
    });
    if (moved.count !== 1) throw conflict("This capsule is already sealed.");
    const j = await tx.scheduledJob.upsert({
      where: { capsuleId_type_variant: { capsuleId: c.id, type: "SEAL", variant: "" } },
      update: { status: "PENDING", scheduledAt: now, lastError: null, completedAt: null },
      create: { capsuleId: c.id, type: "SEAL", scheduledAt: now },
    });
    await recordEvent(tx, c.id, "seal_requested", user.id, {
      declarationAccepted: true,
      declarationVersion: SEALING_DECLARATION_VERSION,
      unlockAt: unlockAt.toISOString(),
      items: c.memories.length,
      recipients: others.length + (c.includeSelf ? 1 : 0),
    });
    return j;
  });
  await audit({ userId: user.id, action: "capsule.seal_requested", resourceId: c.id, ip, metadata: { unlockAt: unlockAt.toISOString() } });
  await enqueueJob(job).catch((err) => logger.warn({ err: err.message, capsuleId: c.id }, "could not enqueue seal job; sweeper will"));
}

/**
 * Step 2 of sealing, in the worker. All-or-nothing:
 *
 *  1. every selected file is streamed out of the vault, encrypted with a
 *     fresh per-capsule key and written to the dedicated sealed store;
 *  2. titles, letters, the message and guided answers are encrypted into a
 *     payload — none of it stays in the database;
 *  3. in ONE transaction the wrapped key, manifest and integrity hash are
 *     recorded, the capsule becomes LOCKED, and the vault originals' rows are
 *     deleted;
 *  4. only after that commit are the original files removed from storage.
 *
 * Any failure before the commit removes the partial ciphertext and returns
 * the capsule to DRAFT with the vault untouched.
 */
export async function performSeal(capsuleId: string): Promise<"sealed" | "skipped"> {
  const c = await db.capsule.findUnique({
    where: { id: capsuleId },
    include: {
      creator: { select: { id: true, name: true, email: true } },
      recipients: true,
      answers: { where: { phase: "THEN" } },
      memories: { orderBy: { displayOrder: "asc" }, include: { memory: { include: { user: { select: { name: true } } } } } },
    },
  });
  if (!c || c.status !== "SEALING" || !c.sealPrefix || !c.unlockAt) return "skipped";

  const s = storage();
  const prefix = c.sealPrefix;
  const dataKey = newDataKey();
  const written: string[] = [];
  let coverKey: string | null = null;

  try {
    const objects: SealedObject[] = [];
    const items: SealedPayload["items"] = [];
    for (const [index, { memory: m }] of c.memories.entries()) {
      if (m.status !== "READY") throw new Error(`memory ${m.id} is not ready`);
      let file: SealedObject | null = null;
      let thumb: SealedObject | null = null;
      if (m.storageKey) {
        const destKey = sealedKey(prefix, `item-${index}`);
        written.push(destKey);
        file = await sealStream({ source: await s.getStream(m.storageKey), destKey, dataKey, capsuleId, name: `item-${index}` });
        if (file.plaintextSize !== Number(m.fileSize)) throw new Error(`memory ${m.id} changed size while sealing`);
        objects.push(file);
      }
      if (m.thumbnailKey) {
        const destKey = sealedKey(prefix, `thumb-${index}`);
        written.push(destKey);
        thumb = await sealStream({ source: await s.getStream(m.thumbnailKey), destKey, dataKey, capsuleId, name: `thumb-${index}` });
        objects.push(thumb);
      }
      items.push({
        index,
        mediaType: m.mediaType,
        title: m.title,
        description: m.description,
        originalFilename: m.originalFilename,
        mimeType: m.mimeType,
        fileSize: Number(m.fileSize),
        content: m.content,
        captureDate: m.captureDate?.toISOString() ?? null,
        contributorName: m.userId !== c.creatorId ? m.user.name : null,
        metadata: m.metadata,
        sha256: file?.plaintextSha256 ?? null,
        thumbSha256: thumb?.plaintextSha256 ?? null,
      });
    }

    const payload: SealedPayload = {
      version: 1,
      releasePrefix: randomBytes(24).toString("hex"),
      message: c.message,
      answers: c.answers.map((a) => ({ userId: a.userId, promptKey: a.promptKey, prompt: a.prompt, answer: a.answer, createdAt: a.createdAt.toISOString() })),
      items,
    };
    const payloadKey = sealedKey(prefix, "payload");
    written.push(payloadKey);
    objects.push(await sealBuffer({ data: Buffer.from(JSON.stringify(payload)), destKey: payloadKey, dataKey, capsuleId, name: "payload" }));

    // The cover is the label on the outside. It is copied deliberately, unencrypted, and is the only image visible while locked.
    if (c.coverMemoryId) {
      const cover = await db.memory.findFirst({ where: { id: c.coverMemoryId, userId: c.creatorId, thumbnailKey: { not: null } } });
      if (cover?.thumbnailKey) {
        coverKey = newObjectKey("covers");
        await s.put(coverKey, await s.getBuffer(cover.thumbnailKey), "image/webp");
      }
    }

    const manifest: SealManifest = {
      version: 1,
      cipher: "AES-256-GCM",
      keyWrap: "RSA-OAEP-SHA256",
      objects: objects.map((o) => ({ name: o.name, size: o.size, sha256: o.sha256 })),
      itemCount: items.length,
      totalBytes: objects.reduce((n, o) => n + o.size, 0),
    };
    const contentIntegrityHash = sha256Hex(canonicalJson(manifest));
    const sealedAt = new Date();
    const unlockAt = c.unlockAt;
    const originals = c.memories.map((l) => l.memory);

    await db.$transaction(
      async (tx) => {
        const key = await tx.capsuleKey.create({ data: wrapDataKey(dataKey, capsuleId, unlockAt) });
        const release = await tx.scheduledJob.create({ data: { capsuleId, type: "RELEASE", scheduledAt: unlockAt } });
        const reminders = REMINDERS.filter((r) => unlockAt.getTime() - r.ms > sealedAt.getTime() + HOUR);
        if (reminders.length) {
          await tx.scheduledJob.createMany({
            data: reminders.map((r) => ({ capsuleId, type: "REMINDER" as const, variant: r.variant, scheduledAt: new Date(unlockAt.getTime() - r.ms) })),
          });
        }
        await tx.capsuleAnswer.deleteMany({ where: { capsuleId } });
        await tx.memory.deleteMany({ where: { id: { in: originals.map((m) => m.id) } } });
        const locked = await tx.capsule.updateMany({
          where: { id: capsuleId, status: "SEALING" },
          data: {
            status: "LOCKED",
            sealedAt,
            message: null,
            coverMemoryId: null,
            coverKey,
            encryptionKeyReference: keyReference(key.id),
            sealedContentManifest: manifest,
            contentIntegrityHash,
            releaseJobId: release.id,
            sealedBytes: BigInt(manifest.totalBytes),
            itemCount: items.length,
          },
        });
        if (locked.count !== 1) throw new Error("capsule left SEALING during the seal");
        await recordEvent(tx, capsuleId, "sealed", null, { contentIntegrityHash, itemCount: items.length, sealedBytes: manifest.totalBytes, unlockAt: unlockAt.toISOString(), kekId: (await tx.capsuleKey.findUniqueOrThrow({ where: { id: key.id } })).kekId });
      },
      { timeout: 60_000, maxWait: 10_000 },
    );

    // Committed: the capsule is LOCKED. Everything below is clean-up and courtesy.
    await deleteObjects(originals.flatMap((m) => [m.storageKey, m.thumbnailKey]));
    await audit({ action: "capsule.sealed", resourceId: capsuleId, metadata: { items: items.length, bytes: manifest.totalBytes } });
    await scheduleCapsuleJobs(capsuleId).catch((err) => logger.warn({ err: err.message, capsuleId }, "could not enqueue release at seal time; sweeper will"));
    await announce(c, unlockAt).catch((err) => logger.error({ err: err.message, capsuleId }, "post-seal notifications failed"));
    logger.info({ capsuleId, items: items.length }, "capsule sealed");
    return "sealed";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ capsuleId, err: message }, "sealing failed; rolling back to draft");
    await deleteObjects([...written, coverKey]);
    const reverted = await db.capsule.updateMany({ where: { id: capsuleId, status: "SEALING" }, data: { status: "DRAFT", sealPrefix: null } });
    if (reverted.count === 1) {
      await recordEvent(db, capsuleId, "sealing_failed", null, { error: message.slice(0, 300) });
      await createNotification({
        userId: c.creatorId,
        type: "CAPSULE_CREATED",
        capsuleId,
        title: "Sealing didn't complete",
        body: `“${c.title}” is still a draft and nothing was changed. Please try sealing it again.`,
        dedupeKey: `seal-failed:${capsuleId}:${Date.now()}`,
      });
    }
    throw err;
  } finally {
    dataKey.fill(0);
  }
}

type SealedCapsule = NonNullable<Awaited<ReturnType<typeof db.capsule.findUnique>>> & {
  creator: { id: string; name: string; email: string };
  recipients: { id: string; email: string; userId: string | null; recipientName: string | null; permission: string; invitationStatus: string }[];
};

async function announce(c: SealedCapsule, unlockAt: Date) {
  const unlockLabel = formatInZone(unlockAt, c.timezone);
  await notify(
    { userId: c.creatorId, type: "CAPSULE_LOCKED", capsuleId: c.id, title: "Capsule sealed", body: `“${c.title}” will open on ${unlockLabel}.`, dedupeKey: `locked:${c.id}` },
    (u) => capsuleLocked(u.name, c, unlockLabel),
  );
  for (const r of c.recipients) {
    if (r.userId === c.creatorId || r.invitationStatus !== "PENDING") continue;
    const token = newToken();
    await db.capsuleRecipient.update({ where: { id: r.id }, data: { inviteTokenHash: hashToken(token), invitedAt: new Date() } });
    const account = r.userId ? await db.user.findUnique({ where: { id: r.userId }, select: { id: true, name: true } }) : null;
    const content = capsuleInvite({ name: r.recipientName || account?.name || "there", creatorName: c.creator.name, capsule: c, unlockLabel, canContribute: false, inviteToken: token });
    if (account) {
      await notify(
        { userId: account.id, type: "CAPSULE_INVITE", capsuleId: c.id, title: `${c.creator.name} sealed a capsule for you`, body: `“${c.title}” opens on ${unlockLabel}.`, dedupeKey: `invite:${r.id}` },
        () => content,
      );
    } else {
      await sendEmailSafe(r.email, content);
    }
  }
}
