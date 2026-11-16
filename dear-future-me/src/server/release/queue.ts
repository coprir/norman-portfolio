import { Queue } from "bullmq";
import type { JobType } from "@prisma/client";
import { db } from "../db";
import { redis } from "../redis";

export const JOBS_QUEUE = "capsule-jobs";
export const DEAD_LETTER_QUEUE = "capsule-dead-letter";

/** Attempts before a job is declared dead and surfaced to administrators. */
export const JOB_ATTEMPTS = Number(process.env.RELEASE_JOB_ATTEMPTS ?? 6);
export const JOB_BACKOFF_MS = Number(process.env.RELEASE_JOB_BACKOFF_MS ?? 15_000);
/**
 * Only jobs due within this window live in Redis. A capsule locked for twenty
 * years is a row in Postgres until its final hour; Redis is never the record
 * of what must happen, only the mechanism that makes it happen on time.
 */
export const ENQUEUE_HORIZON_MS = 60 * 60 * 1000;

export type JobPayload = { scheduledJobId: string };

const g = globalThis as unknown as { __jobsQueue?: Queue<JobPayload>; __dlq?: Queue };

export function jobsQueue(): Queue<JobPayload> {
  g.__jobsQueue ??= new Queue<JobPayload>(JOBS_QUEUE, { connection: redis() });
  return g.__jobsQueue;
}
export function deadLetterQueue(): Queue {
  g.__dlq ??= new Queue(DEAD_LETTER_QUEUE, { connection: redis() });
  return g.__dlq;
}

/**
 * Puts a scheduled job on the queue. The BullMQ job id is the Postgres row id,
 * so enqueueing the same job twice is a no-op.
 */
export async function enqueueJob(job: { id: string; type: JobType; scheduledAt: Date; capsuleId: string }, opts: { force?: boolean } = {}) {
  const q = jobsQueue();
  if (opts.force) {
    const existing = await q.getJob(job.id);
    await existing?.remove().catch(() => {});
  }
  await q.add(
    job.type.toLowerCase(),
    { scheduledJobId: job.id },
    {
      jobId: job.id,
      delay: Math.max(0, job.scheduledAt.getTime() - Date.now()),
      attempts: JOB_ATTEMPTS,
      backoff: { type: "exponential", delay: JOB_BACKOFF_MS },
      removeOnComplete: true,
      removeOnFail: true,
    },
  );
  await db.scheduledJob.updateMany({ where: { id: job.id, status: "PENDING" }, data: { status: "QUEUED" } });
  if (job.type === "RELEASE") {
    await db.capsule.updateMany({ where: { id: job.capsuleId, status: "LOCKED" }, data: { status: "SCHEDULED" } });
  }
}

/** Called right after locking: enqueue whatever is already inside the horizon. */
export async function scheduleCapsuleJobs(capsuleId: string) {
  const due = await db.scheduledJob.findMany({
    where: { capsuleId, status: "PENDING", scheduledAt: { lte: new Date(Date.now() + ENQUEUE_HORIZON_MS) } },
  });
  for (const job of due) await enqueueJob(job);
}
