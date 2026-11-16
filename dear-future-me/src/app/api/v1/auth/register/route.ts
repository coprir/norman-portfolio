import { z } from "zod";
import { api, body } from "@/server/api";
import { audit } from "@/server/audit";
import { hashPassword } from "@/server/auth/passwords";
import { issueToken } from "@/server/auth/tokens";
import { db } from "@/server/db";
import { sendEmailSafe } from "@/server/email/send";
import { verifyEmail } from "@/server/email/templates";
import { conflict } from "@/server/errors";
import { ensureSubscription } from "@/server/plans";
import { isValidTimezone } from "@/lib/time/release";

const passwordSchema = z.string().min(10, "Use at least 10 characters.").max(200);

const schema = z.object({
  name: z.string().trim().min(1, "Tell us your name.").max(80),
  email: z.email("Enter a valid email address.").transform((e) => e.toLowerCase().trim()),
  password: passwordSchema,
  timezone: z.string().refine(isValidTimezone).catch("UTC"),
});

export const POST = api({ auth: "none", rateLimit: { name: "register", limit: 10, windowSec: 3600 } }, async ({ req, ip }) => {
  const input = await body(req, schema);
  if (await db.user.findUnique({ where: { email: input.email } })) {
    throw conflict("An account with this email already exists. Try signing in instead.");
  }
  const user = await db.user.create({
    data: { name: input.name, email: input.email, passwordHash: await hashPassword(input.password), timezone: input.timezone },
  });
  await ensureSubscription(user.id);
  await audit({ userId: user.id, action: "auth.register", ip });
  await sendEmailSafe(user.email, verifyEmail(user.name, await issueToken(user.id, "EMAIL_VERIFY")));
  return { ok: true };
});
