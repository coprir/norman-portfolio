import { z } from "zod";
import { api, body } from "@/server/api";
import { audit } from "@/server/audit";
import { consumeToken } from "@/server/auth/tokens";
import { db } from "@/server/db";
import { badRequest } from "@/server/errors";

export const POST = api({ auth: "none", rateLimit: { name: "verify", limit: 20, windowSec: 600 } }, async ({ req, ip }) => {
  const { token } = await body(req, z.object({ token: z.string().min(10).max(200) }));
  const userId = await consumeToken(token, "EMAIL_VERIFY");
  if (!userId) throw badRequest("This confirmation link has expired or was already used. Request a new one from Settings.");
  await db.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
  await audit({ userId, action: "auth.email_verified", ip });
  return { ok: true };
});
