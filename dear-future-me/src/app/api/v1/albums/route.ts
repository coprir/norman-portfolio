import { z } from "zod";
import { api, body } from "@/server/api";
import { db } from "@/server/db";

export const GET = api({}, async ({ user }) => {
  const albums = await db.album.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, include: { _count: { select: { memories: true } } } });
  return { albums: albums.map((a) => ({ id: a.id, name: a.name, description: a.description, count: a._count.memories })) };
});

export const POST = api({}, async ({ req, user }) => {
  const input = await body(req, z.object({ name: z.string().trim().min(1).max(80), description: z.string().trim().max(300).optional() }));
  const a = await db.album.create({ data: { userId: user.id, name: input.name, description: input.description || null } });
  return { id: a.id, name: a.name, description: a.description, count: 0 };
});
