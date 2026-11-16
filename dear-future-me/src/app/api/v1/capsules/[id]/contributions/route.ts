import { z } from "zod";
import { api, body } from "@/server/api";
import { addContribution } from "@/server/capsules/service";

export const POST = api<{ id: string }>({ rateLimit: { name: "contribute", limit: 200, windowSec: 3600 } }, async ({ req, user, params }) => {
  const { memoryId } = await body(req, z.object({ memoryId: z.string() }));
  return addContribution(user, params.id, memoryId);
});
