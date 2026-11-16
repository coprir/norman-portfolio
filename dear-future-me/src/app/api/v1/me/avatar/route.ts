import { setAvatar } from "@/server/account";
import { api } from "@/server/api";
import { badRequest } from "@/server/errors";

const MAX = 8 * 1024 * 1024;

export const POST = api({ rateLimit: { name: "avatar", limit: 20, windowSec: 3600 } }, async ({ req, user }) => {
  if (Number(req.headers.get("content-length") ?? 0) > MAX) throw badRequest("Choose an image under 8 MB.");
  const buf = Buffer.from(await req.arrayBuffer());
  if (!buf.length || buf.length > MAX) throw badRequest("Choose an image under 8 MB.");
  await setAvatar(user, buf);
  return { ok: true };
});
