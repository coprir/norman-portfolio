import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../env";

/** HMAC signature over the sorted query parameters of a local-driver URL. */
export function signParams(params: Record<string, string>): string {
  const canonical = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return createHmac("sha256", env.storageSigningSecret).update(canonical).digest("base64url");
}

export function verifyParams(search: URLSearchParams, now = Date.now()): Record<string, string> | null {
  const params: Record<string, string> = {};
  for (const [k, v] of search) if (k !== "sig") params[k] = v;
  const sig = search.get("sig");
  const exp = Number(params.exp);
  if (!sig || !Number.isFinite(exp)) return null;
  const expected = Buffer.from(signParams(params));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  if (exp * 1000 < now) return null;
  return params;
}
