import { z } from "zod";
import { api, body } from "@/server/api";
import { lockCapsule } from "@/server/capsules/service";

/** Locking is irreversible, so it must be confirmed explicitly. */
export const POST = api<{ id: string }>({ rateLimit: { name: "capsule-lock", limit: 30, windowSec: 3600 } }, async ({ req, user, params, ip }) => {
  await body(req, z.object({ confirm: z.literal(true, "Confirm that you want to lock this capsule.") }));
  return lockCapsule(user, params.id, ip);
});
