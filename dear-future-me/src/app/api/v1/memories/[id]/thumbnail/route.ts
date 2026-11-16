import { api } from "@/server/api";
import { badRequest } from "@/server/errors";
import { setThumbnail } from "@/server/memories";

const MAX = 4 * 1024 * 1024;

/** Accepts a poster frame the browser captured from a video. */
export const POST = api<{ id: string }>({}, async ({ req, user, params }) => {
  const buf = Buffer.from(await req.arrayBuffer());
  if (!buf.length || buf.length > MAX) throw badRequest("Preview image is too large.");
  return setThumbnail(user, params.id, buf);
});
