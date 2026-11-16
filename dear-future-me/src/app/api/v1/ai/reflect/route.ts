import { z } from "zod";
import { aiReflect } from "@/server/ai";
import { api, body } from "@/server/api";

export const POST = api({ rateLimit: { name: "ai", limit: 40, windowSec: 3600 } }, async ({ req, user }) =>
  aiReflect(user, (await body(req, z.object({ capsuleId: z.string() }))).capsuleId),
);
