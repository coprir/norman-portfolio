import { randomBytes } from "node:crypto";
import { env } from "../env";
import { LocalStorage } from "./local";
import { S3Storage } from "./s3";
import type { StorageDriver } from "./types";

const g = globalThis as unknown as { __storage?: StorageDriver };

export function storage(): StorageDriver {
  if (!g.__storage) g.__storage = env.storageDriver === "s3" ? new S3Storage() : new LocalStorage();
  return g.__storage;
}

/**
 * Unguessable object key. It contains no user-supplied text and nothing
 * derivable from ids, so paths can't be predicted or enumerated.
 */
export function newObjectKey(prefix: "media" | "thumbs" | "avatars" | "covers" | "sealed" | "released"): string {
  const id = randomBytes(24).toString("hex");
  return `${prefix}/${id.slice(0, 2)}/${id}`;
}

export const PART_SIZE = 8 * 1024 * 1024;
export const UPLOAD_URL_TTL = 15 * 60;
/** Reads are signed for five minutes: long enough to start playback, short enough not to be a shareable link. */
export const DOWNLOAD_URL_TTL = 5 * 60;
