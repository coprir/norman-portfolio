import { z } from "zod";
import { api, body } from "@/server/api";
import { completeUpload } from "@/server/memories";

const schema = z.object({ parts: z.array(z.object({ partNumber: z.number().int().min(1).max(10_000), etag: z.string().min(1).max(200) })).min(1).max(10_000) });

export const maxDuration = 120;

export const POST = api<{ id: string }>({}, async ({ req, user, params }) => {
  const { parts } = await body(req, schema);
  return completeUpload(user, params.id, parts);
});
