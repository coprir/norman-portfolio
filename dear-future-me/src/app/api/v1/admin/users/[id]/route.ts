import { z } from "zod";
import { api, body } from "@/server/api";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { badRequest, notFound } from "@/server/errors";

/** Role changes are reserved for super administrators. */
export const PATCH = api<{ id: string }>({ auth: "superadmin" }, async ({ req, user, params, ip }) => {
  const { role } = await body(req, z.object({ role: z.enum(["USER", "ADMIN", "SUPER_ADMIN"]) }));
  if (params.id === user.id) throw badRequest("You can't change your own role.");
  const target = await db.user.findUnique({ where: { id: params.id } });
  if (!target) throw notFound("User not found.");
  // A role change signs the user out everywhere so the new role applies cleanly.
  await db.user.update({ where: { id: target.id }, data: { role, sessionVersion: { increment: 1 } } });
  await audit({ userId: user.id, action: "admin.role_changed", resourceId: target.id, ip, metadata: { from: target.role, to: role } });
  return { ok: true };
});
