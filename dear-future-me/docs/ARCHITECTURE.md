# Architecture

## Shape of the system

```
Browser ──► Web (Next.js)  ──► PostgreSQL   record of truth: users, vault, capsules, jobs, history
              │   │
              │   └──────────► Redis/BullMQ  carries work that is due soon
              │                      │
              ▼                      ▼
        Object storage ◄──── Worker (Node)   seals, releases, notifies, reconciles
        (R2 / S3, private)        │
                                  └─ holds the key-release private key (web does not)
```

- **Web** renders pages and serves the versioned REST API under `/api/v1`. Pages read through the same service functions the API uses (`src/server/**`), so there is one implementation of every rule. A future mobile app uses the same API.
- **Worker** (`worker/index.ts`) is a persistent process. It is the only component that can open a seal.
- **PostgreSQL** is the source of truth for *what must happen and when*. **Redis** only holds jobs due within the next hour.

## Code layout

```
prisma/                 schema, migrations (incl. guard triggers), seed
worker/index.ts         the release worker entry point
src/app/                pages and API routes
  (marketing)/          landing page and legal pages
  (auth)/               sign in, register, verify, reset
  app/                  the signed-in product
  admin/                operations console
  api/v1/               REST API
src/components/         UI
src/lib/                code shared by browser and server (time maths, media types)
src/server/             everything that touches data
  api.ts                route wrapper: auth, CSRF origin check, rate limit, errors
  auth/                 sessions, passwords, single-use tokens
  memories.ts           Memory Vault
  capsules/             access rules, drafts, sealing, event history
  crypto/               per-capsule encryption, key service
  release/              queue, release, job processor, sweeper
  storage/              storage interface, S3 and local drivers
  email/                templates and delivery
tests/                  integration tests (real Postgres + Redis)
e2e/                    browser journey
```

## Memory Vault vs Time Capsules

Two different things, deliberately:

| | Memory Vault | Time Capsule (sealed) |
|---|---|---|
| Table | `memories` | `capsules` + ciphertext in the sealed store |
| Viewable | Yes, by the owner | No, by anyone |
| Editable / deletable | Yes | No |
| Thumbnails / URLs | Short-lived signed URLs | None exist |

A draft capsule *points at* vault memories. Sealing *consumes* them.

## Capsule lifecycle

```
DRAFT ──seal requested──► SEALING ──sealed──► LOCKED ──unlock_at──► AVAILABLE ──first open──► OPENED
                             │
                             └──sealing failed──► DRAFT   (rolled back; nothing changed)
```

There are no other transitions and no flexible modes. A trigger (`dfm_capsule_guard`, migration `capsule_guards`) rejects anything else at the database level, including:

- any status change not on the diagram;
- `LOCKED → AVAILABLE` while `unlock_at` is still in the future;
- any change to title, dates, recipients' identity, manifest, integrity hash or key reference once sealed;
- deletion of a non-draft capsule (except account erasure, see SECURITY.md).

### Sealing (`src/server/capsules/seal.ts`)

1. **Request (web).** Validates ownership of every item, content, recipients, plan limits and the declaration; computes `unlock_at` on the server; freezes recipients; moves the capsule to `SEALING`; records `seal_requested` in the history.
2. **Seal (worker).** Streams each file out of the vault, encrypts it with a fresh per-capsule key, writes it to the sealed store. Encrypts all private text (titles, letters, message, guided answers) into a payload object. Copies the chosen cover to a small public-to-recipients label image.
3. **Commit.** In one transaction: store the wrapped key, the manifest and its hash, the release job; set `LOCKED`; delete the vault rows.
4. Only after the commit, delete the original files.

Any failure before step 3 deletes the partial ciphertext and returns the capsule to `DRAFT`. There is no partially sealed state.

### Release (`src/server/release/`)

1. A release job exists in Postgres from the moment of sealing (`scheduled_jobs`, referenced by `capsules.release_job_id`).
2. The **sweeper** runs on worker start and every 30 seconds. It enqueues jobs entering the one-hour horizon with their exact delay, re-enqueues any job Redis has lost, and resets jobs left running by a crash. This is what makes release survive restarts, deploys and a wiped Redis.
3. The **processor** runs the job: verifies the manifest against its hash, asks the key service for the key (refused before `unlock_at`), decrypts every object while checking ciphertext hash, authentication tag and plaintext hash, then performs one conditional `UPDATE` to `AVAILABLE`.
4. Notifications fan out idempotently: in-app notifications are unique per `(capsule, user)`; each email is claimed before sending and un-claimed on failure, so a retry sends only what is missing.
5. Failures retry with exponential backoff (6 attempts). A job that exhausts them is marked `DEAD`, copied to a dead-letter queue and shown in the admin console for retry. The capsule stays `LOCKED` — never half-open.

Browser countdowns are display only. They never unlock anything.

## Time

Clients send intent ("in 5 years", "09:00 on her 18th birthday, Europe/London"), never a timestamp. `src/lib/time/release.ts` resolves it on the server with Luxon: calendar arithmetic in the user's zone, skipped times moved forward, repeated times resolved to the first occurrence, 29 February handled.

## Data model

See `prisma/schema.prisma`, which is commented. Beyond the obvious entities:

- `capsule_keys` — the wrapped per-capsule key and its `not_before`. Write-once.
- `capsule_items` — a capsule's contents, materialised only at release. Write-once.
- `capsule_events` — append-only, hash-chained history. No foreign key, so it outlives the capsule.
- `scheduled_jobs` — the durable schedule: seal, release, reminders.
- `plans` — limits and display prices as data.

## Roles

`USER`, `ADMIN`, `SUPER_ADMIN` on the user row. "Premium" is an entitlement that comes from the subscription's plan, not a role. Administrators see operational data only; only super administrators can change roles.

## AI

Optional and isolated in `src/server/ai.ts`. Requires an API key *and* per-user consent. Search never lets the model choose records: the model turns a sentence into filters, and the ordinary owner-scoped query runs them.
