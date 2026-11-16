import { z } from "zod";
import { api, body } from "@/server/api";
import { db } from "@/server/db";
import { deleteMemory, getOwnMemory, toMemoryDTO, updateMemory } from "@/server/memories";

type P = { id: string };

export const GET = api<P>({}, async ({ user, params }) => {
  const m = await getOwnMemory(user.id, params.id);
  const albums = await db.albumMemory.findMany({ where: { memoryId: m.id }, select: { albumId: true } });
  return toMemoryDTO({ ...m, albums });
});

const schema = z.object({
  title: z.string().max(120).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  categoryId: z.string().nullable().optional(),
  tags: z.array(z.string().max(40)).max(30).optional(),
  captureDate: z.string().nullable().optional(),
  content: z.string().max(50_000).optional(),
});

export const PATCH = api<P>({}, async ({ req, user, params }) => updateMemory(user, params.id, await body(req, schema)));

export const DELETE = api<P>({}, async ({ user, params }) => {
  await deleteMemory(user, params.id);
  return { ok: true };
});
