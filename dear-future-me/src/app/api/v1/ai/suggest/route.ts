import { z } from "zod";
import { aiSuggest } from "@/server/ai";
import { api, body } from "@/server/api";

export const POST = api({ rateLimit: { name: "ai", limit: 40, windowSec: 3600 } }, async ({ req, user }) =>
  aiSuggest(user, (await body(req, z.object({ memoryId: z.string() }))).memoryId),
);
