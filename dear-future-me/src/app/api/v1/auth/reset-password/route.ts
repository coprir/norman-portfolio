import { z } from "zod";
import { api, body } from "@/server/api";
import { audit } from "@/server/audit";
import { hashPassword } from "@/server/auth/passwords";
import { consumeToken } from "@/server/auth/tokens";
import { db } from "@/server/db";
import { badRequest } from "@/server/errors";

const schema = z.object({ token: z.string().min(10).max(200), password: z.string().min(10, "Use at least 10 characters.").max(200) });

export const POST = api({ auth: "none", rateLimit: { name: "reset", limit: 10, windowSec: 900 } }, async ({ req, ip }) => {
  const input = await body(req, schema);
  const userId = await consumeToken(input.token, "PASSWORD_RESET");
  if (!userId) throw badRequest("This reset link has expired or was already used. Request a new one.");
  await db.user.update({
    where: { id: userId },
    // Receiving the link proves the address; bumping sessionVersion signs out every device.
    data: { passwordHash: await hashPassword(input.password), sessionVersion: { increment: 1 }, emailVerifiedAt: new Date() },
  });
  await audit({ userId, action: "auth.password_reset", ip });
  return { ok: true };
});
