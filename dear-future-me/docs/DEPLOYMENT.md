# Deployment and operations

## What production needs

| Component | Recommended | Notes |
|---|---|---|
| Web | Vercel, or the Docker image on Render / Fly / Railway | `npm run start` |
| Worker | A **persistent** container (Render background worker, Fly machine, ECS service) | `npm run worker`. Not a serverless function or cron. Run at least one; several are safe |
| PostgreSQL 14+ | Managed, with point-in-time recovery | |
| Redis 6+ | Managed, persistence on, `maxmemory-policy noeviction` | Losing it is recoverable (see below) but shouldn't be routine |
| Object storage | Cloudflare R2 or AWS S3, **private** bucket | |
| Email | Resend, with a verified sending domain | |

`render.yaml` in this folder is a blueprint for web + worker + Postgres + Redis on Render. A `Dockerfile` builds one image used for both roles.

## First deployment

1. Generate secrets: `openssl rand -base64 32` for `AUTH_SECRET` and `STORAGE_SIGNING_SECRET`; `npm run keys:generate` for the sealing key pair.
2. Create a private bucket. Add a CORS rule allowing `PUT` and `GET` from your site's origin and **exposing the `ETag` header** (browser uploads read it).
3. Set the environment variables from `.env.example` on both services — with one difference: **`KEY_RELEASE_PRIVATE_KEY` goes on the worker only.**
4. Run `npm run db:migrate`, then `npm run db:seed` (plans and default categories).
5. Deploy web and worker. Check `GET /api/health` reports `ok` for database, queue, storage and worker.
6. Register your own account, set `SUPER_ADMIN_EMAIL`, run `npm run db:seed` again.
7. Seal a test capsule due in a few minutes and watch it open.

If the web app is on Vercel, the worker still needs a persistent host; point both at the same database, Redis and bucket.

## Backups and disaster recovery

| Asset | Backup | Recovery |
|---|---|---|
| PostgreSQL | Provider PITR, at least 7 days (35 recommended) plus a daily logical dump to a second region | Restore; start the worker. The sweeper re-enqueues everything due |
| Object storage | Bucket versioning plus cross-region replication | Repoint `S3_*` |
| Redis | AOF persistence | **Not required for recovery.** Start empty; the sweeper rebuilds the queue from Postgres |
| `KEY_RELEASE_PRIVATE_KEY` | Offline, split between two people, tested | Without it, locked capsules cannot ever be opened |
| `AUTH_SECRET` | Secrets manager | Rotating it signs everyone out; nothing is lost |

Restore the database and the bucket to the same point in time where possible. A capsule whose ciphertext is missing or altered fails verification at release and stays locked with a `DEAD` job, rather than opening incorrectly.

Rehearse a restore before launch and at least yearly.

## Monitoring

- **Health:** point an uptime monitor at `/api/health`. `degraded` means the worker's heartbeat is older than two minutes — page someone.
- **Errors:** set `SENTRY_DSN` on both services. Dead jobs are reported.
- **Logs:** structured JSON (pino) on stdout from both processes; ship to your log platform. Media, tokens and passwords are never logged.
- **Admin console (`/admin`):** users, storage, upcoming releases, failed jobs with a retry button, email delivery counts, system health, audit log.

Alert on: worker heartbeat stale; any `scheduled_jobs` row `DEAD`; `email_logs` failures rising; a capsule `LOCKED` more than 10 minutes past `unlock_at`.

## Runbook

**A release failed.** `/admin` → Jobs → Failed shows the error. Fix the cause (usually email provider or storage), press Retry. Retrying cannot open a capsule early; the job re-checks the time.

**"Sealed object failed authentication" / "does not match its manifest hash".** The ciphertext has been altered or lost. Do not retry blindly: restore the affected objects from bucket versioning, then retry.

**Worker was down.** Start it. On startup it sweeps and releases everything that came due, once each.

**Redis was wiped.** Nothing to do. Within 30 seconds the sweeper re-enqueues due jobs from Postgres.

**A capsule is stuck in `SEALING`.** The worker died mid-seal. On restart the sweeper re-runs the job, which starts the seal again from scratch; if it fails it rolls back to `DRAFT` and tells the user.

**Rotating the sealing key pair.** New capsules pick up the new public key at once (`capsule_keys.kek_id` records which). Keep the old private key available to the worker until every capsule sealed under it has opened; supporting several private keys by `kek_id` is a small change in `src/server/crypto/keys.ts`.

**Deleting a user on request.** The user can do it themselves in Settings. It erases storage objects, then the account; sealed capsules are destroyed unopened.

## Scaling notes

- Web is stateless; scale horizontally.
- Workers are safe to run in parallel: jobs are deduplicated by id, release is a conditional update, and the sweeper takes a short lock.
- Sealing and release stream files, so memory use is flat regardless of file size. Very large capsules take minutes; give the worker enough CPU.
- Only jobs due within an hour sit in Redis, so twenty-year capsules cost nothing there.
