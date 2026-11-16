import { z } from "zod";
import { aiSearch } from "@/server/ai";
import { api, body } from "@/server/api";

export const POST = api({ rateLimit: { name: "ai", limit: 40, windowSec: 3600 } }, async ({ req, user }) =>
  aiSearch(user, (await body(req, z.object({ query: z.string().trim().min(2).max(300) }))).query),
);
