export type UploadedPart = { partNumber: number; etag: string };

export interface StorageDriver {
  createMultipartUpload(key: string, contentType: string): Promise<string>;
  /** A short-lived URL the browser PUTs one part to. */
  signPartUrl(key: string, uploadId: string, partNumber: number, ttlSec: number): Promise<string>;
  /** Parts already stored, so an interrupted upload can resume. */
  listParts(key: string, uploadId: string): Promise<(UploadedPart & { size: number })[]>;
  completeMultipartUpload(key: string, uploadId: string, parts: UploadedPart[]): Promise<void>;
  abortMultipartUpload(key: string, uploadId: string): Promise<void>;
  head(key: string): Promise<{ size: number } | null>;
  readRange(key: string, start: number, endInclusive: number): Promise<Buffer>;
  getBuffer(key: string): Promise<Buffer>;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  /** A short-lived URL for reading a private object. */
  signDownloadUrl(key: string, opts: { ttlSec: number; contentType?: string; downloadName?: string }): Promise<string>;
  delete(keys: string[]): Promise<void>;
  /** Cheap connectivity probe for health checks. */
  ping(): Promise<void>;
}

/** Object keys are generated server-side only and always match this shape. */
export const KEY_PATTERN = /^[a-z0-9][a-z0-9/_-]{8,200}$/;
