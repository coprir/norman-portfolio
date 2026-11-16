import { api } from "@/server/api";
import { verifyEventChain } from "@/server/capsules/events";
import { getCapsuleRow } from "@/server/capsules/service";
import { db } from "@/server/db";
import { notFound } from "@/server/errors";

/** The capsule's permanent history, for its creator. Contains no content. */
export const GET = api<{ id: string }>({}, async ({ user, params }) => {
  const row = await getCapsuleRow(user, params.id);
  if (row.creatorId !== user.id) throw notFound("Capsule not found.");
  const [events, chain] = await Promise.all([
    db.capsuleEvent.findMany({ where: { capsuleId: row.id }, orderBy: { seq: "asc" } }),
    verifyEventChain(row.id),
  ]);
  return { intact: chain.ok, contentIntegrityHash: row.contentIntegrityHash, events: events.map((e) => ({ seq: e.seq, type: e.type, at: e.createdAt.toISOString(), hash: e.hash })) };
});
