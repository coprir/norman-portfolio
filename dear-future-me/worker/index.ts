/**
 * The delivery worker. A long-running process (not a serverless function):
 * it holds the BullMQ worker that opens capsules on time and the sweeper that
 * reconciles Redis with Postgres. Run one or more with `npm run worker`.
 */
process.env.DFM_SERVICE = "worker";
try {
  process.loadEnvFile?.(".env");
} catch {
  /* env comes from the platform in production */
}

async function main() {
  const { Worker } = await import("bullmq");
  const { logger } = await import("../src/server/logger");
  const { newRedis } = await import("../src/server/redis");
  const { db } = await import("../src/server/db");
  const { JOBS_QUEUE, JOB_ATTEMPTS } = await import("../src/server/release/queue");
  const { processScheduledJob } = await import("../src/server/release/processor");
  const { sweepWithLock } = await import("../src/server/release/sweeper");

  if (process.env.SENTRY_DSN) {
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0 });
  }

  const worker = new Worker(
    JOBS_QUEUE,
    async (job) => {
      const outcome = await processScheduledJob(job.data.scheduledJobId, {
        attemptsMade: job.attemptsMade,
        maxAttempts: job.opts.attempts ?? JOB_ATTEMPTS,
      });
      logger.info({ jobId: job.id, name: job.name, outcome }, "job processed");
      return outcome;
    },
    { connection: newRedis(), concurrency: Number(process.env.WORKER_CONCURRENCY ?? 5) },
  );
  worker.on("error", (err) => logger.error({ err: err.message }, "worker error"));

  const runSweep = () => sweepWithLock().catch((err) => logger.error({ err: err.message }, "sweep failed"));
  await runSweep(); // catch up on anything that came due while we were down
  const timer = setInterval(runSweep, Number(process.env.SWEEP_INTERVAL_MS ?? 30_000));
  logger.info({ queue: JOBS_QUEUE }, "worker started");

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "worker shutting down");
    clearInterval(timer);
    await worker.close(); // waits for in-flight jobs
    await db.$disconnect();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
