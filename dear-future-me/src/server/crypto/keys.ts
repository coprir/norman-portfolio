import { constants, createHash, createPublicKey, privateDecrypt, publicEncrypt, randomBytes } from "node:crypto";
import { db } from "../db";

/**
 * Key service.
 *
 * Every capsule is encrypted with its own random 256-bit data key. That key
 * is never stored: it is wrapped (RSA-OAEP-SHA256) under the key service's
 * PUBLIC key and only the wrapped form is kept.
 *
 *  - The web application holds only the public key. It can seal; it cannot
 *    unseal — there is no code path or credential on that tier that turns a
 *    locked capsule back into readable content.
 *  - The private key lives only where KEY_RELEASE_PRIVATE_KEY is configured
 *    (the release worker today; a separately operated key-release service
 *    later). `releaseDataKey` refuses to unwrap before `notBefore`.
 *
 * What this is NOT: a cryptographic time-lock. Whoever operates the key
 * service — and anyone who obtains its private key — can technically unwrap a
 * key early. See docs/SECURITY.md for the threat model and the planned
 * independent key-release / drand time-lock layer.
 */

export class KeyNotYetReleasable extends Error {}

const ALGORITHM = "RSA-OAEP-SHA256/AES-256-GCM";

function pem(name: string): string {
  const raw = process.env[name];
  if (!raw) throw new Error(`${name} is not configured`);
  return raw.includes("BEGIN") ? raw.replace(/\\n/g, "\n") : Buffer.from(raw, "base64").toString("utf8");
}

function fingerprint(publicPem: string): string {
  const der = createPublicKey(publicPem).export({ type: "spki", format: "der" });
  return createHash("sha256").update(der).digest("hex").slice(0, 16);
}

/** Binds a wrapped key to one capsule and one release time; it won't unwrap for any other. */
const label = (capsuleId: string, notBefore: Date) => Buffer.from(`dfm:v1:${capsuleId}:${notBefore.toISOString()}`);

export function newDataKey(): Buffer {
  return randomBytes(32);
}

/** Wraps a capsule's data key. Needs only the public key. Returns the row to store. */
export function wrapDataKey(dataKey: Buffer, capsuleId: string, notBefore: Date) {
  const publicPem = pem("SEALING_PUBLIC_KEY");
  const wrappedKey = publicEncrypt(
    { key: publicPem, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256", oaepLabel: label(capsuleId, notBefore) },
    dataKey,
  );
  return { capsuleId, algorithm: ALGORITHM, kekId: fingerprint(publicPem), wrappedKey, notBefore };
}

export const keyReference = (keyRowId: string) => `dfm-kms:v1:${keyRowId}`;

/**
 * Releases a capsule's data key. Only callable where the private key is
 * present, and never before the capsule's release time.
 */
export async function releaseDataKey(reference: string, capsuleId: string, now: Date = new Date()): Promise<Buffer> {
  const id = /^dfm-kms:v1:(.+)$/.exec(reference)?.[1];
  const row = id ? await db.capsuleKey.findUnique({ where: { id } }) : null;
  if (!row || row.capsuleId !== capsuleId) throw new Error("Unknown key reference");
  // Checked against the key service's own clock, independently of whatever the caller believes.
  if (now.getTime() < row.notBefore.getTime() || Date.now() < row.notBefore.getTime()) {
    throw new KeyNotYetReleasable(`Key for capsule ${capsuleId} is not releasable before ${row.notBefore.toISOString()}`);
  }
  const dataKey = privateDecrypt(
    { key: pem("KEY_RELEASE_PRIVATE_KEY"), padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256", oaepLabel: label(capsuleId, row.notBefore) },
    row.wrappedKey,
  );
  if (!row.releasedAt) await db.capsuleKey.update({ where: { id: row.id }, data: { releasedAt: new Date() } });
  return dataKey;
}

export const canReleaseKeys = () => Boolean(process.env.KEY_RELEASE_PRIVATE_KEY);
export const canSeal = () => Boolean(process.env.SEALING_PUBLIC_KEY);
