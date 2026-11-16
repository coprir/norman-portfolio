import { Prisma } from "@prisma/client";
import { canonicalJson, sha256Hex } from "../crypto/seal";
import { db } from "../db";

type Client = Prisma.TransactionClient | typeof db;

export type CapsuleEventType =
  | "created"
  | "seal_requested"
  | "sealing_failed"
  | "sealed"
  | "release_verified"
  | "released"
  | "release_failed"
  | "opened"
  | "invitation_accepted"
  | "invitation_declined"
  | "erased";

/**
 * Appends to a capsule's history. Each event carries the hash of the one
 * before it, so removing or altering any entry breaks the chain; the table
 * itself rejects UPDATE and DELETE.
 */
export async function recordEvent(client: Client, capsuleId: string, type: CapsuleEventType, actorId: string | null, data: Record<string, unknown> = {}) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const last = await client.capsuleEvent.findFirst({ where: { capsuleId }, orderBy: { seq: "desc" }, select: { seq: true, hash: true } });
    const seq = (last?.seq ?? 0) + 1;
    const createdAt = new Date();
    const hash = sha256Hex(canonicalJson({ capsuleId, seq, type, actorId, data, prevHash: last?.hash ?? null, createdAt: createdAt.toISOString() }));
    try {
      await client.capsuleEvent.create({ data: { capsuleId, seq, type, actorId, data: data as Prisma.InputJsonValue, prevHash: last?.hash ?? null, hash, createdAt } });
      return;
    } catch (err) {
      // Two writers raced for the same sequence number: recompute and retry.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002" && client === db) continue;
      throw err;
    }
  }
  throw new Error("Could not append capsule event");
}

/** Recomputes the chain and reports whether the history is intact. */
export async function verifyEventChain(capsuleId: string): Promise<{ ok: boolean; events: number; brokenAt?: number }> {
  const events = await db.capsuleEvent.findMany({ where: { capsuleId }, orderBy: { seq: "asc" } });
  let prev: string | null = null;
  for (const e of events) {
    const expected = sha256Hex(canonicalJson({ capsuleId, seq: e.seq, type: e.type, actorId: e.actorId, data: e.data, prevHash: prev, createdAt: e.createdAt.toISOString() }));
    if (e.prevHash !== prev || e.hash !== expected) return { ok: false, events: events.length, brokenAt: e.seq };
    prev = e.hash;
  }
  return { ok: true, events: events.length };
}
