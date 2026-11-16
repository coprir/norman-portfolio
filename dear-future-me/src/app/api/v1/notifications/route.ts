import { z } from "zod";
import { api, body } from "@/server/api";
import { db } from "@/server/db";

export const GET = api({}, async ({ user }) => {
  const [items, unread] = await Promise.all([
    db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);
  return {
    unread,
    items: items.map((n) => ({ id: n.id, type: n.type, title: n.title, body: n.body, capsuleId: n.capsuleId, read: Boolean(n.readAt), createdAt: n.createdAt.toISOString() })),
  };
});

/** Marks notifications read: specific ids, or everything when none are given. */
export const POST = api({}, async ({ req, user }) => {
  const { ids } = await body(req, z.object({ ids: z.array(z.string()).max(100).optional() }));
  await db.notification.updateMany({ where: { userId: user.id, readAt: null, ...(ids ? { id: { in: ids } } : {}) }, data: { readAt: new Date() } });
  return { ok: true };
});
