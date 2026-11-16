import { redis } from "./redis";
import { tooMany } from "./errors";

const memory = new Map<string, { count: number; resetAt: number }>();

/**
 * Fixed-window limiter backed by Redis. If Redis is unreachable it degrades to
 * a per-process window rather than failing open or taking the site down.
 */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<void> {
  const k = `rl:${key}`;
  let count: number;
  try {
    const r = redis();
    if (r.status !== "ready") throw new Error("redis not ready");
    count = await r.incr(k);
    if (count === 1) await r.expire(k, windowSec);
  } catch {
    const now = Date.now();
    const cur = memory.get(k);
    if (!cur || cur.resetAt < now) {
      memory.set(k, { count: 1, resetAt: now + windowSec * 1000 });
      count = 1;
    } else {
      count = ++cur.count;
    }
    if (memory.size > 10_000) for (const [mk, v] of memory) if (v.resetAt < now) memory.delete(mk);
  }
  if (count > limit) throw tooMany();
}
