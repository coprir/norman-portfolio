import { z } from "zod";
import { aiYearSummary } from "@/server/ai";
import { api, body } from "@/server/api";

export const POST = api({ rateLimit: { name: "ai", limit: 40, windowSec: 3600 } }, async ({ req, user }) =>
  aiYearSummary(user, (await body(req, z.object({ year: z.number().int().min(1900).max(2200) }))).year),
);
