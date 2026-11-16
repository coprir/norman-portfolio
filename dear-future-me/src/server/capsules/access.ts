import type { Capsule, CapsuleRecipient } from "@prisma/client";
import type { SessionUser } from "../auth/session";

export type CapsuleAccess = {
  isCreator: boolean;
  recipient: CapsuleRecipient | null;
  /** May know the capsule exists (title, cover, dates, countdown). */
  canSee: boolean;
  /** May read what is inside. Only ever true after release. */
  canViewContents: boolean;
  /** May add memories. Only ever true while the capsule is still a draft. */
  canContribute: boolean;
  isReleased: boolean;
};

export const isReleased = (status: Capsule["status"]) => status === "AVAILABLE" || status === "OPENED";

/**
 * A recipient row belongs to a user when it is linked to their id, or when it
 * is still unclaimed and addressed to an email address they have verified.
 */
export function matchRecipient(user: Pick<SessionUser, "id" | "email" | "emailVerified">, recipients: CapsuleRecipient[]) {
  return (
    recipients.find((r) => r.userId === user.id) ??
    recipients.find((r) => r.userId == null && user.emailVerified && r.email === user.email) ??
    null
  );
}

/**
 * The one place capsule permissions are decided. Every API route and page
 * goes through this; nothing else may hand out capsule contents.
 *
 * Between sealing and release `canViewContents` is false for everyone —
 * creator, recipients and administrators alike. There is no override.
 */
export function getCapsuleAccess(
  user: Pick<SessionUser, "id" | "email" | "emailVerified">,
  capsule: Capsule & { recipients: CapsuleRecipient[] },
): CapsuleAccess {
  const isCreator = capsule.creatorId === user.id;
  const matched = matchRecipient(user, capsule.recipients);
  const active = matched && matched.invitationStatus !== "DECLINED" ? matched : null;
  const released = isReleased(capsule.status);
  const draft = capsule.status === "DRAFT";
  // In a draft, only people the creator has actually invited to contribute exist as far as others are concerned.
  const draftContributor = draft && capsule.allowContributions && active?.permission === "CONTRIBUTE" && active.invitedAt != null ? active : null;
  const recipient = draft ? draftContributor : matched;
  return {
    isCreator,
    recipient,
    isReleased: released,
    canSee: isCreator || Boolean(recipient),
    canViewContents: released && (isCreator || Boolean(active)),
    canContribute: Boolean(draftContributor) && draftContributor!.invitationStatus === "ACCEPTED",
  };
}
