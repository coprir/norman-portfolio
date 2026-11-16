import { z } from "zod";
import { api, body } from "@/server/api";
import { respondToInvitation } from "@/server/capsules/service";

export const POST = api<{ id: string }>({}, async ({ req, user, params }) => {
  const { action } = await body(req, z.object({ action: z.enum(["accept", "decline"]) }));
  await respondToInvitation(user, params.id, action);
  return { ok: true };
});
