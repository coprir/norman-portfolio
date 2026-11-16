import { createHash, randomBytes } from "node:crypto";
import type { TokenType } from "@prisma/client";
import { db } from "../db";

export const newToken = () => randomBytes(32).toString("base64url");
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

const TTL_MS: Record<TokenType, number> = {
  EMAIL_VERIFY: 24 * 60 * 60 * 1000,
  PASSWORD_RESET: 60 * 60 * 1000,
};

/** Issues a single-use token; only its hash is stored. */
export async function issueToken(userId: string, type: TokenType): Promise<string> {
  const token = newToken();
  await db.token.deleteMany({ where: { userId, type } });
  await db.token.create({
    data: { userId, type, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + TTL_MS[type]) },
  });
  return token;
}

/** Atomically consumes a token. Returns the user id, or null if invalid. */
export async function consumeToken(token: string, type: TokenType): Promise<string | null> {
  const tokenHash = hashToken(token);
  const row = await db.token.findUnique({ where: { tokenHash } });
  if (!row || row.type !== type) return null;
  const claimed = await db.token.updateMany({
    where: { id: row.id, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });
  return claimed.count === 1 ? row.userId : null;
}
