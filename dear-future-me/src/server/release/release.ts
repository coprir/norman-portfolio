import { formatInZone } from "@/lib/time/release";
import { audit } from "../audit";
import { hashToken, newToken } from "../auth/tokens";
import { db } from "../db";
import { sendEmail } from "../email/send";
import { capsuleReminder, capsuleUnlocked } from "../email/templates";
import { logger } from "../logger";
import { createNotification, notify } from "../notifications";

export type ReleaseResult = "released" | "already_released" | "not_releasable";

/**
 * Releases a capsule. Safe to call any number of times, concurrently, and
 * after a crash at any point:
 *
 *  1. The LOCKED → AVAILABLE transition is one conditional UPDATE, so exactly
 *     one caller wins it and it can never happen before unlock_at.
 *  2. Each recipient's in-app notification is keyed by a unique dedupe key.
 *  3. Each recipient's email is claimed (release_notified_at) before sending
 *     and un-claimed if the send fails, so a retry sends only what is missing.
 */
export async function releaseCapsule(capsuleId: string, now: Date = new Date()): Promise<ReleaseResult> {
  const transition = await db.capsule.updateMany({
    where: { id: capsuleId, status: { in: ["LOCKED", "SCHEDULED", "FAILED"] }, unlockAt: { lte: now } },
    data: { status: "AVAILABLE", releasedAt: now },
  });
  const capsule = await db.capsule.findUnique({
    where: { id: capsuleId },
    include: { creator: { select: { id: true, name: true, email: true } }, recipients: true },
  });
  if (!capsule) return "not_releasable";
  if (capsule.status !== "AVAILABLE" && capsule.status !== "OPENED") return "not_releasable";

  if (transition.count === 1) {
    await audit({ action: "capsule.released", resourceId: capsuleId, metadata: { unlockAt: capsule.unlockAt?.toISOString(), recipients: capsule.recipients.length } });
    logger.info({ capsuleId }, "capsule released");
  }

  const failures: string[] = [];
  for (const r of capsule.recipients) {
    if (r.invitationStatus === "DECLINED") continue;
    try {
      // Re-validate who this recipient is at release time: an address may
      // have been registered (and verified) since the capsule was locked.
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
  return transition.count === 1 ? "released" : "already_released";
}

export async function sendReminder(capsuleId: string, variant: string): Promise<void> {
  const capsule = await db.capsule.findUnique({ where: { id: capsuleId }, include: { recipients: { where: { userId: { not: null }, invitationStatus: { not: "DECLINED" } } } } });
  if (!capsule || !capsule.unlockAt || !["LOCKED", "SCHEDULED"].includes(capsule.status)) return;
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
