import { z } from "zod";
import { api, body } from "@/server/api";
import { listUploadedParts, signUploadParts } from "@/server/memories";

type P = { id: string };

/** Parts the server already holds, so an interrupted upload can resume. */
export const GET = api<P>({}, async ({ user, params }) => listUploadedParts(user, params.id));

/** Short-lived signed URLs for the requested parts. */
export const POST = api<P>({}, async ({ req, user, params }) => {
  const { partNumbers } = await body(req, z.object({ partNumbers: z.array(z.number().int().min(1).max(10_000)).min(1).max(50) }));
  return signUploadParts(user, params.id, partNumbers);
});
