import { api } from "@/server/api";
import { issueToken } from "@/server/auth/tokens";
import { sendEmail } from "@/server/email/send";
import { verifyEmail } from "@/server/email/templates";
import { conflict } from "@/server/errors";

export const POST = api({ rateLimit: { name: "resend-verify", limit: 4, windowSec: 900 } }, async ({ user }) => {
  if (user.emailVerified) throw conflict("Your email is already confirmed.");
  await sendEmail(user.email, verifyEmail(user.name, await issueToken(user.id, "EMAIL_VERIFY")));
  return { ok: true };
});
