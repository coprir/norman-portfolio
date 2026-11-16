import type { Capsule, CapsuleRecipient } from "@prisma/client";
import type { SessionUser } from "../auth/session";

export type CapsuleAccess = {
  isCreator: boolean;
  recipient: CapsuleRecipient | null;
  /** May know the capsule exists (title, date, countdown). */
  canSee: boolean;
  /** May read what is inside. Only ever true after release. */
  canViewContents: boolean;
  canContribute: boolean;
  isReleased: boolean;
};

export const isReleased = (status: Capsule["status"]) => status === "AVAILABLE" || status === "OPENED";
export const isSealed = (status: Capsule["status"]) => status === "LOCKED" || status === "SCHEDULED" || status === "FAILED";

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
 */
export function getCapsuleAccess(
  user: Pick<SessionUser, "id" | "email" | "emailVerified">,
  capsule: Capsule & { recipients: CapsuleRecipient[] },
): CapsuleAccess {
  const isCreator = capsule.creatorId === user.id;
  const recipient = capsule.status === "DRAFT" ? null : matchRecipient(user, capsule.recipients);
  const activeRecipient = recipient && recipient.invitationStatus !== "DECLINED" ? recipient : null;
  const released = isReleased(capsule.status);
  return {
    isCreator,
    recipient,
    isReleased: released,
    canSee: isCreator || Boolean(recipient),
    canViewContents: released && (isCreator || Boolean(activeRecipient)),
    canContribute:
      (capsule.status === "LOCKED" || capsule.status === "SCHEDULED") &&
      ((isCreator && capsule.allowContributions) ||
        (capsule.allowContributions && activeRecipient?.permission === "CONTRIBUTE" && activeRecipient.invitationStatus === "ACCEPTED")),
  };
}
