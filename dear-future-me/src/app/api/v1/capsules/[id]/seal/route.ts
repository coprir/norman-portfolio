import { z } from "zod";
import { api, body } from "@/server/api";
import { requestSeal } from "@/server/capsules/seal";
import { getCapsule } from "@/server/capsules/service";

/**
 * Seals a capsule. Irreversible, so every line of the declaration must be
 * accepted explicitly. Returns the capsule in SEALING; the worker moves it to
 * LOCKED, or back to DRAFT if sealing fails.
 */
export const POST = api<{ id: string }>({ rateLimit: { name: "capsule-seal", limit: 30, windowSec: 3600 } }, async ({ req, user, params, ip }) => {
  await body(req, z.object({ declaration: z.literal(true, "Accept the sealing declaration to continue.") }));
  await requestSeal(user, params.id, ip);
  return getCapsule(user, params.id);
});
