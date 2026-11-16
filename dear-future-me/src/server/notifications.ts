import { Prisma, type NotificationType } from "@prisma/client";
import { db } from "./db";
import { sendEmailSafe } from "./email/send";
import type { EmailContent } from "./email/templates";

export type NotificationPrefs = Partial<Record<NotificationType, { email?: boolean }>>;

export const NOTIFICATION_LABELS: Record<NotificationType, string> = {
  CAPSULE_CREATED: "A capsule is created",
  CAPSULE_LOCKED: "A capsule is locked",
  CAPSULE_REMINDER: "A capsule is about to open",
  CAPSULE_UNLOCKED: "A capsule opens",
  CAPSULE_INVITE: "Someone invites you to a capsule",
  CAPSULE_CONTRIBUTION: "Someone adds to your shared capsule",
  STORAGE_WARNING: "Storage is nearly full",
};

/** Emails for these can't be switched off: they are the product's promise. */
export const ALWAYS_EMAILED: NotificationType[] = ["CAPSULE_UNLOCKED"];

export function wantsEmail(prefs: unknown, type: NotificationType): boolean {
  if (ALWAYS_EMAILED.includes(type)) return true;
  if (type === "CAPSULE_CREATED") return (prefs as NotificationPrefs)?.[type]?.email === true;
  return (prefs as NotificationPrefs)?.[type]?.email !== false;
}

/**
 * Creates an in-app notification exactly once per dedupeKey. Returns false if
 * it already existed, which lets retried jobs skip work they already did.
 */
export async function createNotification(n: {
  userId: string;
  type: NotificationType;
  capsuleId?: string | null;
  title: string;
  body: string;
  dedupeKey: string;
}): Promise<boolean> {
  try {
    await db.notification.create({ data: { ...n, capsuleId: n.capsuleId ?? null, deliveredAt: new Date() } });
    return true;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return false;
    throw err;
  }
}

/** In-app notification plus a best-effort email, honouring preferences. */
export async function notify(
  n: Parameters<typeof createNotification>[0],
  email?: (user: { name: string; email: string }) => EmailContent,
): Promise<void> {
  const created = await createNotification(n);
  if (!created || !email) return;
  const user = await db.user.findUnique({ where: { id: n.userId }, select: { name: true, email: true, notificationPrefs: true } });
  if (!user || !wantsEmail(user.notificationPrefs, n.type)) return;
  const ok = await sendEmailSafe(user.email, email(user));
  await db.notification.updateMany({ where: { dedupeKey: n.dedupeKey }, data: { emailStatus: ok ? "SENT" : "FAILED" } });
}
