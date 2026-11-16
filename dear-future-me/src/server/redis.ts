import IORedis from "ioredis";
import { env } from "./env";
import { logger } from "./logger";

const g = globalThis as unknown as { __redis?: IORedis };

/** Shared connection. `maxRetriesPerRequest: null` is required by BullMQ. */
export function redis(): IORedis {
  if (!g.__redis) {
    g.__redis = new IORedis(env.redisUrl, { maxRetriesPerRequest: null, enableReadyCheck: true, lazyConnect: false });
    g.__redis.on("error", (err) => logger.warn({ err: err.message }, "redis connection error"));
  }
  return g.__redis;
}

/** A fresh connection, for BullMQ workers which need a blocking client. */
export function newRedis(): IORedis {
  const c = new IORedis(env.redisUrl, { maxRetriesPerRequest: null });
  c.on("error", (err) => logger.warn({ err: err.message }, "redis connection error"));
  return c;
}
