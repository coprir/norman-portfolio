import { z } from "zod";
import { api, body } from "@/server/api";
import { createLetter } from "@/server/memories";

const schema = z.object({ title: z.string().max(120).optional(), content: z.string().trim().min(1, "Write something first.").max(50_000), inVault: z.boolean().default(true) });

export const POST = api({}, async ({ req, user }) => createLetter(user, await body(req, schema)));
