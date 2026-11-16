import { z } from "zod";
import { api, body } from "@/server/api";
import { saveNowAnswers } from "@/server/capsules/service";

const schema = z.object({ answers: z.array(z.object({ promptKey: z.string().max(60), answer: z.string().max(5000) })).max(30) });

/** Saves the "now" side of the past-versus-present comparison. */
export const POST = api<{ id: string }>({}, async ({ req, user, params }) => saveNowAnswers(user, params.id, (await body(req, schema)).answers));
