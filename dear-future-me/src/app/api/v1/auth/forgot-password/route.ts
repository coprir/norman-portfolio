import { z } from "zod";
import { api, body } from "@/server/api";
import { audit } from "@/server/audit";
import { issueToken } from "@/server/auth/tokens";
import { db } from "@/server/db";
import { sendEmailSafe } from "@/server/email/send";
import { passwordReset } from "@/server/email/templates";
import { rateLimit } from "@/server/ratelimit";

export const POST = api({ auth: "none", rateLimit: { name: "forgot", limit: 8, windowSec: 900 } }, async ({ req, ip }) => {
  const { email } = await body(req, z.object({ email: z.email().transform((e) => e.toLowerCase().trim()) }));
  await rateLimit(`forgot:email:${email}`, 3, 900);
  const user = await db.user.findUnique({ where: { email } });
  if (user) {
    await sendEmailSafe(user.email, passwordReset(user.name, await issueToken(user.id, "PASSWORD_RESET")));
    await audit({ userId: user.id, action: "auth.password_reset_requested", ip });
  }
  // Same answer whether or not the address is registered.
  return { ok: true };
});
