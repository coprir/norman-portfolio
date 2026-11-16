# Dear Future Me

**Capture today. Meet yourself tomorrow.**

A digital time capsule platform. People seal photographs, videos, voice recordings and letters into a capsule, choose the day it opens, and receive it then — next week or twenty years from now.

The product's whole value is the wait. Once a capsule is sealed it cannot be opened, edited, rescheduled, downloaded or deleted until its date, by anyone.

| | |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How the system is put together, the capsule lifecycle, the data model |
| [docs/SECURITY.md](docs/SECURITY.md) | Sealing, key management, threat model, and what is *not* guaranteed |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Production setup, backups, monitoring, operations runbook |

## Two separate experiences

- **Memory Vault** — ordinary, accessible memories. Upload, preview, organise, edit, delete.
- **Time Capsules** — sealed. Selecting memories for a capsule and confirming the sealing declaration *moves* them out of the vault, encrypts them with a key unique to that capsule, and locks them until release.

Lifecycle, enforced by a database trigger: `DRAFT → SEALING → LOCKED → AVAILABLE → OPENED`.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · React Three Fiber · PostgreSQL + Prisma · Auth.js · BullMQ + Redis · S3/R2 object storage · Resend · Stripe-ready billing · optional Claude-powered AI features.

Two processes run from this one codebase:

| Process | Command | Role |
|---|---|---|
| Web | `npm run start` | Pages and the `/api/v1` REST API. Can seal; **cannot** unseal. |
| Worker | `npm run worker` | Long-running. Seals, releases capsules on time, sends notifications, recovers missed jobs. |

## Run it locally

Requires Node 22+, PostgreSQL 14+ and Redis 6+.

```bash
cp .env.example .env
```

Fill in `AUTH_SECRET` and `STORAGE_SIGNING_SECRET` (`openssl rand -base64 32` for each), then generate the sealing key pair and paste both lines into `.env`:

```bash
npm run keys:generate
```

```bash
npm install
```

```bash
npm run db:migrate
```

```bash
npm run db:seed
```

```bash
npm run dev
```

`npm run dev` starts the web app on http://localhost:3000 and the worker together.

With the defaults, files are stored on disk under `.data/storage` and emails are written to `.data/outbox/` instead of being sent — open the newest `verify-email` file there to confirm a new account.

To make yourself a super administrator, register, set `SUPER_ADMIN_EMAIL` in `.env`, and run `npm run db:seed` again. The admin console is at `/admin`.

## Optional integrations

Each is off until its variables are set, and the interface hides or disables what isn't available — there are no buttons that pretend.

| Feature | Variables | Without it |
|---|---|---|
| Cloud storage (R2/S3) | `STORAGE_DRIVER=s3`, `S3_*` | Files on local disk (development only) |
| Email delivery | `RESEND_API_KEY`, `EMAIL_FROM` | Written to `.data/outbox`; refused in production |
| Google sign-in | `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | Button hidden |
| Paid plans | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*` | "Paid plans aren't open yet" |
| AI features | `ANTHROPIC_API_KEY` | Hidden; also requires per-user consent |
| Error monitoring | `SENTRY_DSN` | Structured logs only |

## Testing

```bash
npm test
```

Runs 33 integration tests against a real Postgres database (`dfm_test`) and Redis: time-zone and daylight-saving maths, sealing and its rollback, database-level immutability, key release, tamper detection, idempotent and concurrent release, job retry and recovery, access control, invitations, signed-link expiry, and account erasure.

```bash
npm run test:e2e
```

Drives a real browser through the whole journey against a running app and worker: register, verify, upload, seal a capsule due in two minutes, confirm nothing can get inside early, wait for the automatic release, open it. Start the app first with `DFM_ALLOW_OUTBOX=1` so verification emails land in the outbox.

## What has and hasn't been verified

Verified by the automated tests and the end-to-end run, using local Postgres, Redis and the local storage driver: everything in the two test suites above.

**Written but not exercised against the live service** (no credentials were available): the S3/R2 storage driver, Resend delivery, Google sign-in, Stripe checkout and webhooks, the AI features, and Sentry reporting. Treat each as untested until you have run it once with real keys. The legal pages are a careful first draft and need review by a lawyer before launch.

## Plans and pricing

Plans, limits and display prices live in the `plans` table (seeded from `prisma/seed.ts`). Nothing in the business logic refers to a price. Edit the seed or the rows to change them.
