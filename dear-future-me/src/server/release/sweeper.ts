import { db } from "../db";
import { logger } from "../logger";
import { cleanupStaleUploads } from "../memories";
import { redis } from "../redis";
import { ENQUEUE_HORIZON_MS, enqueueJob, jobsQueue } from "./queue";

const STUCK_RUNNING_MS = 10 * 60 * 1000;
const OVERDUE_GRACE_MS = 90 * 1000;

/**
 * Reconciles Postgres (the record of what must happen) with Redis (what is
 * actually queued). Runs on worker start and every 30 seconds after, which is
 * what makes releases survive restarts, deploys and even a wiped Redis:
 *
 *  - jobs entering the horizon are enqueued with their exact delay;
 *  - jobs that should have run but are missing from Redis are re-enqueued;
 *  - jobs stuck RUNNING after a crash are reset.
 */
export async function sweep(): Promise<{ enqueued: number; recovered: number; reset: number }> {
  const now = Date.now();
  const stats = { enqueued: 0, recovered: 0, reset: 0 };

  const reset = await db.scheduledJob.updateMany({
    where: { status: "RUNNING", startedAt: { lt: new Date(now - STUCK_RUNNING_MS) } },
    data: { status: "PENDING" },
  });
  stats.reset = reset.count;

  const candidates = await db.scheduledJob.findMany({
    where: {
      status: { in: ["PENDING", "QUEUED", "FAILED"] },
      scheduledAt: { lte: new Date(now + ENQUEUE_HORIZON_MS) },
    },
    orderBy: { scheduledAt: "asc" },
    take: 500,
  });
  const q = jobsQueue();
  for (const job of candidates) {
    if (job.status === "PENDING") {
      await enqueueJob(job);
      stats.enqueued++;
      continue;
    }
    // QUEUED or FAILED (awaiting a retry): fine as long as Redis still has it.
    if (job.scheduledAt.getTime() > now - OVERDUE_GRACE_MS) continue;
    if (await q.getJob(job.id)) continue;
    await db.scheduledJob.updateMany({ where: { id: job.id, status: job.status }, data: { status: "PENDING" } });
    await enqueueJob({ ...job, scheduledAt: new Date() }, { force: true });
    stats.recovered++;
  }
  if (stats.enqueued || stats.recovered || stats.reset) logger.info(stats, "sweep");
  return stats;
}

/** Runs the sweep under a short Redis lock so several workers don't overlap. */
export async function sweepWithLock(): Promise<void> {
  const r = redis();
  const got = await r.set("dfm:sweep:lock", String(process.pid), "PX", 25_000, "NX");
  if (!got) return;
  try {
    await sweep();
    const hourly = await r.set("dfm:cleanup:lock", "1", "EX", 3600, "NX");
    if (hourly) {
      const removed = await cleanupStaleUploads();
      if (removed) logger.info({ removed }, "removed unfinished uploads");
    }
    await r.set("dfm:worker:heartbeat", new Date().toISOString(), "EX", 120);
  } finally {
    await r.del("dfm:sweep:lock");
  }
}
