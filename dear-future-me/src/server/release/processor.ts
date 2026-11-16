import { audit } from "../audit";
import { performSeal } from "../capsules/seal";
import { db } from "../db";
import { logger } from "../logger";
import { deadLetterQueue } from "./queue";
import { releaseCapsule, sendReminder } from "./release";

export type ProcessOutcome = "completed" | "skipped" | "deferred" | "failed";

/**
 * Runs one scheduled job. Idempotent: a duplicate delivery of a finished job
 * is a no-op, and a job delivered early is put back for the sweeper.
 */
export async function processScheduledJob(scheduledJobId: string, attempt: { attemptsMade: number; maxAttempts: number }): Promise<ProcessOutcome> {
  const job = await db.scheduledJob.findUnique({ where: { id: scheduledJobId }, include: { capsule: { select: { status: true } } } });
  if (!job) return "skipped";
  if (["COMPLETED", "CANCELLED", "DEAD"].includes(job.status)) return "skipped";
  const early = job.scheduledAt.getTime() - Date.now();
  if (early > 5_000) {
    await db.scheduledJob.update({ where: { id: job.id }, data: { status: "PENDING" } });
    return "deferred";
  }
  if (early > 0) await new Promise((r) => setTimeout(r, early));

  await db.scheduledJob.update({ where: { id: job.id }, data: { status: "RUNNING", startedAt: new Date(), attempts: { increment: 1 } } });
  try {
    if (job.type === "SEAL") await performSeal(job.capsuleId);
    else if (job.type === "RELEASE") await releaseCapsule(job.capsuleId);
    else await sendReminder(job.capsuleId, job.variant);
    await db.scheduledJob.update({ where: { id: job.id }, data: { status: "COMPLETED", completedAt: new Date(), lastError: null } });
    return "completed";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // A failed seal has already been rolled back to DRAFT; the user retries it, the queue doesn't.
    const final = job.type === "SEAL" || attempt.attemptsMade + 1 >= attempt.maxAttempts;
    await db.scheduledJob.update({ where: { id: job.id }, data: { status: final ? "DEAD" : "FAILED", lastError: message.slice(0, 1000) } });
    logger.error({ scheduledJobId, capsuleId: job.capsuleId, type: job.type, attempt: attempt.attemptsMade + 1, final, err: message }, "scheduled job failed");
    if (final) {
      // A capsule whose release keeps failing stays LOCKED — sealed and safe —
      // until an administrator retries the job. It is never left half-open.
      await audit({ action: "job.dead", resourceId: job.capsuleId, metadata: { scheduledJobId, type: job.type, error: message.slice(0, 300) } });
      await deadLetterQueue()
        .add("dead", { scheduledJobId, capsuleId: job.capsuleId, type: job.type, error: message.slice(0, 1000), at: new Date().toISOString() }, { removeOnComplete: 1000 })
        .catch(() => {});
      const Sentry = await import("@sentry/nextjs").catch(() => null);
      Sentry?.captureException(err);
    }
    if (job.type === "SEAL") return "failed";
    throw err;
  }
}

/** Administrator action: give a failed or dead job a fresh set of attempts. */
export async function retryJob(scheduledJobId: string, adminId: string) {
  const job = await db.scheduledJob.findUnique({ where: { id: scheduledJobId } });
  if (!job || job.type === "SEAL" || !["FAILED", "DEAD"].includes(job.status)) return false;
  await db.scheduledJob.update({ where: { id: job.id }, data: { status: "PENDING", lastError: null } });
  await audit({ userId: adminId, action: "admin.job_retried", resourceId: job.capsuleId, metadata: { scheduledJobId } });
  const { enqueueJob } = await import("./queue");
  await enqueueJob({ ...job, scheduledAt: new Date() }, { force: true }).catch((err) => logger.warn({ err: err.message }, "retry enqueue failed; sweeper will pick it up"));
  return true;
}
