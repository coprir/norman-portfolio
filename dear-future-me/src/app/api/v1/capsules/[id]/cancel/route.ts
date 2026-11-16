import { z } from "zod";
import { api, body } from "@/server/api";
import { cancelCapsule } from "@/server/capsules/service";

export const POST = api<{ id: string }>({}, async ({ req, user, params, ip }) => {
  await body(req, z.object({ confirm: z.literal(true) }));
  await cancelCapsule(user, params.id, ip);
  return { ok: true };
});
