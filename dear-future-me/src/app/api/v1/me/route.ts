import { z } from "zod";
import { deleteAccount, getProfile } from "@/server/account";
import { api, body } from "@/server/api";
import { audit } from "@/server/audit";
import { verifyPassword } from "@/server/auth/passwords";
import { db } from "@/server/db";
import { badRequest } from "@/server/errors";
import { isValidTimezone } from "@/lib/time/release";

export const GET = api({}, async ({ user }) => getProfile(user));

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  timezone: z.string().refine(isValidTimezone, "Unknown timezone.").optional(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  notificationPrefs: z.record(z.string(), z.object({ email: z.boolean() })).optional(),
  aiConsent: z.boolean().optional(),
});

export const PATCH = api({}, async ({ req, user }) => {
  const input = await body(req, patchSchema);
  if (input.dateOfBirth && new Date(input.dateOfBirth) > new Date()) throw badRequest("Date of birth can't be in the future.");
  await db.user.update({
    where: { id: user.id },
    data: {
      name: input.name,
      timezone: input.timezone,
      dateOfBirth: input.dateOfBirth === undefined ? undefined : input.dateOfBirth ? new Date(input.dateOfBirth) : null,
      notificationPrefs: input.notificationPrefs,
      aiConsentAt: input.aiConsent === undefined ? undefined : input.aiConsent ? new Date() : null,
    },
  });
  if (input.aiConsent !== undefined) await audit({ userId: user.id, action: input.aiConsent ? "ai.consent_granted" : "ai.consent_withdrawn" });
  return getProfile({ ...user, ...(await fresh(user.id)) });
});

async function fresh(id: string) {
  const u = await db.user.findUniqueOrThrow({ where: { id } });
  return { name: u.name, timezone: u.timezone, dateOfBirth: u.dateOfBirth, aiConsent: Boolean(u.aiConsentAt) };
}

const deleteSchema = z.object({ password: z.string().max(200).optional(), confirmEmail: z.string().max(320).optional() });

export const DELETE = api({ rateLimit: { name: "delete-account", limit: 5, windowSec: 900 } }, async ({ req, user, ip }) => {
  const input = await body(req, deleteSchema);
  if (user.hasPassword) {
    const row = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true } });
    if (!(await verifyPassword(input.password ?? "", row.passwordHash))) throw badRequest("That password isn't right.");
  } else if (input.confirmEmail?.toLowerCase().trim() !== user.email) {
    throw badRequest("Type your email address to confirm.");
  }
  await deleteAccount(user, ip);
  return { ok: true };
});
