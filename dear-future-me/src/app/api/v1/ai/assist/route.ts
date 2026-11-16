import { z } from "zod";
import { aiLetterAssist } from "@/server/ai";
import { api, body } from "@/server/api";

const schema = z.object({ draft: z.string().max(20_000), intent: z.enum(["start", "continue", "polish"]), recipient: z.string().max(80).optional(), opensIn: z.string().max(80).optional() });

export const POST = api({ rateLimit: { name: "ai", limit: 40, windowSec: 3600 } }, async ({ req, user }) => aiLetterAssist(user, await body(req, schema)));
