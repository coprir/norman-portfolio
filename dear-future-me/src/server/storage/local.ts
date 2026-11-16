import { createHash, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { env } from "../env";
import { KEY_PATTERN, type StorageDriver, type UploadedPart } from "./types";
import { signParams } from "./signing";

/**
 * Filesystem driver for development and tests. Objects live outside the web
 * root and are only reachable through HMAC-signed, expiring URLs served by
 * /api/v1/storage/*, which mirrors how the S3 driver behaves.
 */
export class LocalStorage implements StorageDriver {
  private root = path.resolve(env.storageLocalDir);

  objectPath(key: string) {
    if (!KEY_PATTERN.test(key) || key.includes("..")) throw new Error("invalid storage key");
    return path.join(this.root, "objects", key);
  }
  partDir(uploadId: string) {
    if (!/^[a-f0-9]{32}$/.test(uploadId)) throw new Error("invalid upload id");
    return path.join(this.root, "uploads", uploadId);
  }

  async createMultipartUpload(): Promise<string> {
    const uploadId = randomBytes(16).toString("hex");
    await fs.mkdir(this.partDir(uploadId), { recursive: true });
    return uploadId;
  }

  async signPartUrl(key: string, uploadId: string, partNumber: number, ttlSec: number) {
    const params = { k: key, u: uploadId, n: String(partNumber), exp: String(Math.floor(Date.now() / 1000) + ttlSec) };
    const qs = new URLSearchParams({ ...params, sig: signParams(params) });
    return `/api/v1/storage/part?${qs}`;
  }

  async writePart(uploadId: string, partNumber: number, data: Buffer): Promise<string> {
    const dir = this.partDir(uploadId);
    await fs.access(dir);
    const etag = createHash("md5").update(data).digest("hex");
    const tmp = path.join(dir, `${partNumber}.tmp`);
    await fs.writeFile(tmp, data);
    await fs.rename(tmp, path.join(dir, `${partNumber}.${etag}`));
    return etag;
  }

  async listParts(_key: string, uploadId: string) {
    const dir = this.partDir(uploadId);
    const names = await fs.readdir(dir).catch(() => [] as string[]);
    const latest = new Map<number, { etag: string; size: number; mtime: number }>();
    for (const name of names) {
      const m = /^(\d+)\.([a-f0-9]{32})$/.exec(name);
      if (!m) continue;
      const st = await fs.stat(path.join(dir, name));
      const n = Number(m[1]);
      const cur = latest.get(n);
      if (!cur || cur.mtime < st.mtimeMs) latest.set(n, { etag: m[2], size: st.size, mtime: st.mtimeMs });
    }
    return [...latest].map(([partNumber, v]) => ({ partNumber, etag: v.etag, size: v.size })).sort((a, b) => a.partNumber - b.partNumber);
  }

  async completeMultipartUpload(key: string, uploadId: string, parts: UploadedPart[]) {
    const dir = this.partDir(uploadId);
    const dest = this.objectPath(key);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    const tmp = `${dest}.assembling`;
    const out = createWriteStream(tmp);
    try {
      for (const p of [...parts].sort((a, b) => a.partNumber - b.partNumber)) {
        const etag = p.etag.replace(/"/g, "");
        if (!/^[a-f0-9]{32}$/.test(etag)) throw new Error("invalid part etag");
        await pipeline(createReadStream(path.join(dir, `${p.partNumber}.${etag}`)), out, { end: false });
      }
    } finally {
      await new Promise<void>((resolve) => out.end(resolve));
    }
    await fs.rename(tmp, dest);
    await fs.rm(dir, { recursive: true, force: true });
  }

  async abortMultipartUpload(_key: string, uploadId: string) {
    await fs.rm(this.partDir(uploadId), { recursive: true, force: true });
  }

  async head(key: string) {
    const st = await fs.stat(this.objectPath(key)).catch(() => null);
    return st ? { size: st.size } : null;
  }

  async readRange(key: string, start: number, endInclusive: number) {
    const fh = await fs.open(this.objectPath(key), "r");
    try {
      const len = endInclusive - start + 1;
      const buf = Buffer.alloc(len);
      const { bytesRead } = await fh.read(buf, 0, len, start);
      return buf.subarray(0, bytesRead);
    } finally {
      await fh.close();
    }
  }

  getBuffer(key: string) {
    return fs.readFile(this.objectPath(key));
  }

  async getStream(key: string, range?: { start: number; end: number }) {
    await fs.access(this.objectPath(key));
    return createReadStream(this.objectPath(key), range);
  }

  async putStream(key: string, body: Readable) {
    const dest = this.objectPath(key);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    const tmp = `${dest}.${randomBytes(6).toString("hex")}.writing`;
    try {
      await pipeline(body, createWriteStream(tmp));
      await fs.rename(tmp, dest);
    } catch (err) {
      await fs.rm(tmp, { force: true });
      throw err;
    }
  }

  async put(key: string, body: Buffer) {
    const dest = this.objectPath(key);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, body);
  }

  async signDownloadUrl(key: string, opts: { ttlSec: number; contentType?: string; downloadName?: string }) {
    const params: Record<string, string> = { k: key, exp: String(Math.floor(Date.now() / 1000) + opts.ttlSec) };
    if (opts.contentType) params.ct = opts.contentType;
    if (opts.downloadName) params.dn = opts.downloadName;
    const qs = new URLSearchParams({ ...params, sig: signParams(params) });
    return `/api/v1/storage/object?${qs}`;
  }

  async delete(keys: string[]) {
    await Promise.all(keys.map((k) => fs.rm(this.objectPath(k), { force: true })));
  }

  async ping() {
    await fs.mkdir(this.root, { recursive: true });
    await fs.access(this.root);
  }
}
