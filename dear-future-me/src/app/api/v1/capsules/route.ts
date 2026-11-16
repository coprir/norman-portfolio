import { z } from "zod";
import { api, body } from "@/server/api";
import { createDraft, listCapsules } from "@/server/capsules/service";

export const GET = api({}, async ({ user }) => listCapsules(user));

export const POST = api({ rateLimit: { name: "capsule-create", limit: 60, windowSec: 3600 } }, async ({ req, user }) =>
  createDraft(user, await body(req, z.object({ kind: z.enum(["STANDARD", "FUTURE_SELF"]).default("STANDARD"), title: z.string().max(120).optional() }))),
);
