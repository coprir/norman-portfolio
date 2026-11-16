import { z } from "zod";
import { api, body } from "@/server/api";
import { db } from "@/server/db";
import { badRequest, notFound } from "@/server/errors";

type P = { id: string };
const schema = z.object({ memoryIds: z.array(z.string()).min(1).max(500) });

async function check(userId: string, albumId: string, memoryIds: string[]) {
  if (!(await db.album.findFirst({ where: { id: albumId, userId } }))) throw notFound("Album not found.");
  const owned = await db.memory.count({ where: { id: { in: memoryIds }, userId, inVault: true } });
  if (owned !== new Set(memoryIds).size) throw badRequest("One of those memories isn't in your vault.");
}

export const POST = api<P>({}, async ({ req, user, params }) => {
  const { memoryIds } = await body(req, schema);
  await check(user.id, params.id, memoryIds);
  await db.albumMemory.createMany({ data: memoryIds.map((memoryId) => ({ albumId: params.id, memoryId })), skipDuplicates: true });
  return { ok: true };
});

export const DELETE = api<P>({}, async ({ req, user, params }) => {
  const { memoryIds } = await body(req, schema);
  await check(user.id, params.id, memoryIds);
  await db.albumMemory.deleteMany({ where: { albumId: params.id, memoryId: { in: memoryIds } } });
  return { ok: true };
});
