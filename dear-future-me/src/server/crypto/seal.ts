import { createCipheriv, createDecipheriv, createHash, randomBytes, type Hash } from "node:crypto";
import { Readable, Transform, type TransformCallback } from "node:stream";
import { pipeline } from "node:stream/promises";
import { storage } from "../storage";

/**
 * Sealed object format:  IV (12 bytes) ‖ ciphertext ‖ GCM tag (16 bytes)
 * AES-256-GCM with the capsule's data key. The additional authenticated data
 * names the capsule and the object, so ciphertext can't be moved between
 * capsules or swapped between slots without failing authentication.
 */
const IV_LEN = 12;
const TAG_LEN = 16;

const aad = (capsuleId: string, name: string) => Buffer.from(`dfm:v1:${capsuleId}:${name}`);

class HashTap extends Transform {
  bytes = 0;
  constructor(private hash: Hash) {
    super();
  }
  _transform(chunk: Buffer, _enc: BufferEncoding, cb: TransformCallback) {
    this.hash.update(chunk);
    this.bytes += chunk.length;
    cb(null, chunk);
  }
}

export type SealedObject = { name: string; key: string; size: number; sha256: string; plaintextSha256: string; plaintextSize: number };

/** Encrypts a stream into the sealed store. Returns hashes of both sides. */
export async function sealStream(opts: { source: Readable; destKey: string; dataKey: Buffer; capsuleId: string; name: string }): Promise<SealedObject> {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", opts.dataKey, iv);
  cipher.setAAD(aad(opts.capsuleId, opts.name));
  const plainTap = new HashTap(createHash("sha256"));
  const cipherHash = createHash("sha256");
  let size = 0;

  async function* framed() {
    yield iv;
    for await (const chunk of opts.source.pipe(plainTap).pipe(cipher)) yield chunk as Buffer;
    yield cipher.getAuthTag();
  }
  const out = Readable.from(
    (async function* () {
      for await (const chunk of framed()) {
        cipherHash.update(chunk);
        size += chunk.length;
        yield chunk;
      }
    })(),
  );
  // Surface read errors from the source instead of hanging the upload.
  opts.source.on("error", (err) => out.destroy(err));
  await storage().putStream(opts.destKey, out, "application/octet-stream");
  return {
    name: opts.name,
    key: opts.destKey,
    size,
    sha256: cipherHash.digest("hex"),
    plaintextSha256: plainTap["hash"].digest("hex"),
    plaintextSize: plainTap.bytes,
  };
}

export function sealBuffer(opts: { data: Buffer; destKey: string; dataKey: Buffer; capsuleId: string; name: string }) {
  return sealStream({ ...opts, source: Readable.from([opts.data]) });
}

export class IntegrityError extends Error {}

/**
 * Decrypts a sealed object, verifying on the way:
 *  - the ciphertext hash recorded in the manifest at sealing,
 *  - GCM authentication (key, capsule and slot all match),
 *  - optionally the plaintext hash recorded inside the sealed payload.
 * `sink` receives plaintext; if verification fails the caller must discard it.
 */
export async function unsealStream(opts: {
  object: { key: string; size: number; sha256: string; name: string };
  dataKey: Buffer;
  capsuleId: string;
  expectPlaintextSha256?: string;
  sink: (plaintext: Readable) => Promise<void>;
}): Promise<void> {
  const s = storage();
  const { key, size } = opts.object;
  const head = await s.head(key);
  if (!head || head.size !== size || size < IV_LEN + TAG_LEN) throw new IntegrityError(`Sealed object ${opts.object.name} is missing or has the wrong size`);
  const iv = await s.readRange(key, 0, IV_LEN - 1);
  const tag = await s.readRange(key, size - TAG_LEN, size - 1);

  const cipherHash = createHash("sha256").update(iv);
  const decipher = createDecipheriv("aes-256-gcm", opts.dataKey, iv);
  decipher.setAAD(aad(opts.capsuleId, opts.object.name));
  decipher.setAuthTag(tag);
  const plainTap = new HashTap(createHash("sha256"));

  const body = size > IV_LEN + TAG_LEN ? await s.getStream(key, { start: IV_LEN, end: size - TAG_LEN - 1 }) : Readable.from([]);
  const cipherTap = new HashTap(cipherHash);
  const plaintext = body.pipe(cipherTap).pipe(decipher).pipe(plainTap);
  body.on("error", (err) => plaintext.destroy(err));
  decipher.on("error", () => plaintext.destroy(new IntegrityError(`Sealed object ${opts.object.name} failed authentication`)));

  await opts.sink(plaintext);

  cipherHash.update(tag);
  if (cipherHash.digest("hex") !== opts.object.sha256) throw new IntegrityError(`Sealed object ${opts.object.name} does not match its manifest hash`);
  if (opts.expectPlaintextSha256 && plainTap["hash"].digest("hex") !== opts.expectPlaintextSha256) {
    throw new IntegrityError(`Sealed object ${opts.object.name} decrypted to unexpected content`);
  }
}

export async function unsealBuffer(opts: Omit<Parameters<typeof unsealStream>[0], "sink">): Promise<Buffer> {
  const chunks: Buffer[] = [];
  await unsealStream({
    ...opts,
    sink: async (plaintext) => {
      await pipeline(plaintext, async function (src) {
        for await (const c of src) chunks.push(c as Buffer);
      });
    },
  });
  return Buffer.concat(chunks);
}

/** Deterministic JSON so a manifest always hashes to the same value. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",")}}`;
}

export const sha256Hex = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
