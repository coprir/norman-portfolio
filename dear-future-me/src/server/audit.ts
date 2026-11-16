import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { logger } from "./logger";

/** Append-only record of security-relevant actions. Never blocks the caller. */
export async function audit(entry: {
  userId?: string | null;
  action: string;
  resourceId?: string | null;
  ip?: string | null;
  metadata?: Prisma.InputJsonValue;
}) {
  try {
    await db.auditLog.create({
      data: {
        userId: entry.userId ?? null,
        action: entry.action,
        resourceId: entry.resourceId ?? null,
        ip: entry.ip ?? null,
        metadata: entry.metadata ?? {},
      },
    });
  } catch (err) {
    logger.error({ err, action: entry.action }, "failed to write audit log");
  }
}
