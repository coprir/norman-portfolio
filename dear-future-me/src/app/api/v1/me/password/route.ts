import { z } from "zod";
import { api, body } from "@/server/api";
import { audit } from "@/server/audit";
import { hashPassword, verifyPassword } from "@/server/auth/passwords";
import { db } from "@/server/db";
import { badRequest } from "@/server/errors";

const schema = z.object({ currentPassword: z.string().max(200).optional(), newPassword: z.string().min(10, "Use at least 10 characters.").max(200) });

export const POST = api({ rateLimit: { name: "change-password", limit: 8, windowSec: 900 } }, async ({ req, user, ip }) => {
  const input = await body(req, schema);
  const row = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true } });
  if (row.passwordHash && !(await verifyPassword(input.currentPassword ?? "", row.passwordHash))) {
    throw badRequest("Your current password isn't right.");
  }
  // Bumping sessionVersion invalidates every session, including this one.
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(input.newPassword), sessionVersion: { increment: 1 } } });
  await audit({ userId: user.id, action: "auth.password_changed", ip });
  return { ok: true, signedOut: true };
});
