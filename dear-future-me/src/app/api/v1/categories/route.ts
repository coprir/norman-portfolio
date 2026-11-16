import { z } from "zod";
import { api, body } from "@/server/api";
import { db } from "@/server/db";
import { conflict } from "@/server/errors";

export const GET = api({}, async ({ user }) => {
  const rows = await db.category.findMany({ where: { OR: [{ userId: null }, { userId: user.id }] }, orderBy: [{ userId: { sort: "asc", nulls: "first" } }, { name: "asc" }] });
  return { categories: rows.map((c) => ({ id: c.id, name: c.name, custom: c.userId != null })) };
});

export const POST = api({}, async ({ req, user }) => {
  const { name } = await body(req, z.object({ name: z.string().trim().min(1).max(40) }));
  const clash = await db.category.findFirst({ where: { name: { equals: name, mode: "insensitive" }, OR: [{ userId: null }, { userId: user.id }] } });
  if (clash) throw conflict("You already have a category with that name.");
  const c = await db.category.create({ data: { userId: user.id, name } });
  return { id: c.id, name: c.name, custom: true };
});
