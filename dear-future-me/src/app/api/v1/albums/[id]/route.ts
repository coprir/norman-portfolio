import { z } from "zod";
import { api, body } from "@/server/api";
import { db } from "@/server/db";
import { notFound } from "@/server/errors";

type P = { id: string };

async function own(userId: string, id: string) {
  const a = await db.album.findFirst({ where: { id, userId } });
  if (!a) throw notFound("Album not found.");
  return a;
}

export const PATCH = api<P>({}, async ({ req, user, params }) => {
  await own(user.id, params.id);
  const input = await body(req, z.object({ name: z.string().trim().min(1).max(80).optional(), description: z.string().trim().max(300).nullable().optional() }));
  await db.album.update({ where: { id: params.id }, data: input });
  return { ok: true };
});

/** Deletes the album only; the memories in it stay in the vault. */
export const DELETE = api<P>({}, async ({ user, params }) => {
  await own(user.id, params.id);
  await db.album.delete({ where: { id: params.id } });
  return { ok: true };
});
