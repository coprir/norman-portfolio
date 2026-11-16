# Security

## The promise, stated precisely

> A sealed capsule cannot be read, changed, rescheduled or removed through any function of the product before its release time — by its creator, its recipients, or administrators.

This is enforced by encryption with separated keys and by database constraints, not by hiding buttons.

**It is not a cryptographic time-lock.** Whoever controls the key service's private key can technically decrypt a capsule early. The product copy, the FAQ and `/legal/sealing` all say so. Do not weaken that wording until the roadmap below is delivered.

## Sealing

| Property | Mechanism |
|---|---|
| Per-capsule key | 256-bit random data key, generated in the worker for one capsule, zeroed after use |
| Content encryption | AES-256-GCM, streamed; format `IV ‖ ciphertext ‖ tag` |
| Binding | Additional authenticated data names the capsule and the object slot, so ciphertext can't be moved or swapped |
| Private text | Titles, letters, message and answers are inside an encrypted payload; the database holds none of it while locked |
| Dedicated storage | Ciphertext lives under an unguessable `sealed/<random>/` prefix, separate from vault media |
| Integrity | Manifest lists each object's size and SHA-256; `content_integrity_hash` is the SHA-256 of the canonical manifest |
| Key wrapping | Data key wrapped with RSA-OAEP-SHA256 under the key service's public key, with a label binding it to the capsule id and release time |

## Separation of key management

| Component | Has | Can seal | Can unseal |
|---|---|---|---|
| Web application | `SEALING_PUBLIC_KEY` | yes (requests it) | **no** |
| Admin console | nothing | no | **no** |
| Worker / key service | `KEY_RELEASE_PRIVATE_KEY` | yes | only at or after `not_before` |

`releaseDataKey` (`src/server/crypto/keys.ts`) refuses before `not_before`, checked against its own clock regardless of what the caller claims. The web tier has no private key, so a full compromise of the web application, or of an administrator's account, does not expose sealed content.

**Deployment rule:** `KEY_RELEASE_PRIVATE_KEY` is set on the worker only. Keep an offline backup: if it is lost, every locked capsule is permanently unrecoverable.

## Defence in depth at the database

Migration `capsule_guards` installs triggers that reject, regardless of application code:

- illegal lifecycle transitions;
- release before `unlock_at`;
- modification of a sealed capsule's identity, dates, seal or recipients;
- deletion of sealed capsules;
- any update or delete on `capsule_events`; updates/deletes on `capsule_items` and `capsule_keys`.

The single exception is account erasure (GDPR Art. 17), which sets `dfm.erasure` for its transaction. It can only destroy a capsule, still encrypted. It cannot reveal one.

## Access control

- One function decides capsule permissions: `getCapsuleAccess` (`src/server/capsules/access.ts`). `canViewContents` is false for everyone until release.
- One function gates vault files: `canReadMemory`. Sealed content isn't reachable from it at all — the rows and files no longer exist.
- "Not yours" and "doesn't exist" both return 404.
- Recipients are matched by account id, or by an email address the account has **verified**. Invitation links are single-use and stored hashed.
- Media is never public. Reads use signed URLs valid for five minutes, issued after the access check. Object keys are random and contain no ids or filenames.
- Locked capsules expose only: title, optional description, cover label, dates, status, recipients (to the creator).

## Application security

| Area | Measure |
|---|---|
| Passwords | bcrypt (cost 12), minimum 10 characters |
| Sessions | Encrypted HTTP-only cookie; re-validated against the database on every request; `session_version` revokes all sessions on password or role change |
| CSRF | Same-origin check on every mutating API request, plus SameSite cookies |
| Rate limiting | Redis-backed, per IP and per user, on auth and sensitive routes |
| Input | Zod validation on every route |
| Uploads | Type allow-list, real content sniffing (declared type is not trusted), per-plan size limits, quota reserved before upload |
| Served files | `nosniff` and a sandboxing CSP on the local driver; signed, expiring URLs |
| Malware scanning | Seam at `src/server/security/scan.ts`; every upload passes through it. **No scanner is wired in yet** — connect ClamAV or a storage-side scanner before launch |
| Tokens | Verification, reset and invite tokens are random, single-use, expiring, stored as SHA-256 hashes |
| Enumeration | Password reset gives the same answer for any address |
| Headers | HSTS, `X-Frame-Options: DENY`, `nosniff`, restrictive Permissions-Policy |
| Audit | `audit_logs` for security-relevant actions; `capsule_events` for capsule history |
| Secrets | Environment variables only; none in client bundles |

Encryption at rest for vault media, the database and backups is provided by the storage and database platforms (R2/S3 server-side encryption, managed Postgres disk encryption) — confirm it is enabled when provisioning.

## Threat model

| Threat | Outcome |
|---|---|
| Creator tries to peek, edit or cancel | Refused by API (403/409) and by database triggers; content is ciphertext they have no key for |
| Another user guesses ids or URLs | 404; storage keys are unguessable and unsigned URLs are refused |
| Recipient tries to open early | 403; nothing decrypted exists yet |
| Administrator account compromised | Sees counts, job state and audit logs; cannot view media or decrypt capsules; cannot release early (the job itself refuses) |
| Web application fully compromised | Attacker can read vault media and database rows, but **not** sealed capsule contents (no private key on that tier) |
| Database dump leaked | Sealed content is absent; wrapped keys are useless without the private key |
| Storage bucket leaked | Sealed objects are ciphertext. Vault media relies on the provider's access control and at-rest encryption |
| Ciphertext tampered with or swapped | Release aborts on hash or authentication failure; capsule stays locked; operators alerted |
| Worker crashes mid-release | Conditional update means it opens at most once; sweeper resumes; notifications are deduplicated |
| **Operator with the private key, or the key service compromised** | **Can decrypt early. Not prevented today.** |
| Legal compulsion | We could be compelled to use the key. Disclosed to users |
| Private key lost | Locked capsules unrecoverable. Mitigate with offline, split backups |

## Roadmap to stronger time-lock guarantees

Investigated options, in the order they should be adopted:

1. **Move key release into an HSM/KMS** (AWS KMS, GCP KMS or CloudHSM) with the private key non-exportable and decrypt permission granted only to the release worker's role. Removes "someone copied the key file"; every unwrap is logged by the provider. The `encryption_key_reference` column and the `dfm-kms:v1:` scheme exist so key backends can change per capsule.
2. **Independent key-release service.** Run key release as a separate service under separate administrative control (a different cloud account and team, or a contracted escrow provider) that enforces `not_before` itself and exposes only "release key for capsule X". Early opening then needs two organisations to collude.
3. **Public time-lock encryption as a second wrap.** Wrap the data key additionally with timelock encryption against the drand / League of Entropy beacon (`tlock`), so the key cannot be derived by *anyone* before the chosen round. Trade-offs to resolve first: it depends on that network operating at the release date, which is a real risk over 10–20 years, so it should be a second layer over (1)/(2), not a replacement; and the scheme is not post-quantum secure.
4. **Threshold release.** Split the unwrap capability (Shamir or threshold RSA) between the operator, the independent service and, optionally, the user's own device.

Only after (2) or (3) is live and independently reviewed should marketing describe capsules as cryptographically time-locked.

## Before launch

- [ ] Wire a malware scanner into `scanObject`.
- [ ] Independent security review and penetration test.
- [ ] Confirm at-rest encryption and private access on the production bucket and database.
- [ ] Store `KEY_RELEASE_PRIVATE_KEY` in a secrets manager; make and test an offline backup.
- [ ] Legal review of the policies under `/legal`.
