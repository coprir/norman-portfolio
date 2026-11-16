import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListPartsCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import type { Readable } from "node:stream";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../env";
import type { StorageDriver, UploadedPart } from "./types";

/**
 * Cloudflare R2 / AWS S3 driver. The bucket must be private: every read and
 * write goes through a presigned URL issued after an authorization check.
 */
export class S3Storage implements StorageDriver {
  private client = new S3Client({
    region: env.s3.region,
    endpoint: env.s3.endpoint,
    forcePathStyle: Boolean(env.s3.endpoint),
    credentials: { accessKeyId: env.s3.accessKeyId, secretAccessKey: env.s3.secretAccessKey },
  });
  private bucket = env.s3.bucket;

  async createMultipartUpload(key: string, contentType: string) {
    const out = await this.client.send(
      new CreateMultipartUploadCommand({ Bucket: this.bucket, Key: key, ContentType: contentType, ServerSideEncryption: env.s3.endpoint ? undefined : "AES256" }),
    );
    if (!out.UploadId) throw new Error("storage did not return an upload id");
    return out.UploadId;
  }

  signPartUrl(key: string, uploadId: string, partNumber: number, ttlSec: number) {
    return getSignedUrl(
      this.client,
      new UploadPartCommand({ Bucket: this.bucket, Key: key, UploadId: uploadId, PartNumber: partNumber }),
      { expiresIn: ttlSec },
    );
  }

  async listParts(key: string, uploadId: string) {
    const parts: (UploadedPart & { size: number })[] = [];
    let marker: string | undefined;
    do {
      const out = await this.client.send(
        new ListPartsCommand({ Bucket: this.bucket, Key: key, UploadId: uploadId, PartNumberMarker: marker }),
      );
      for (const p of out.Parts ?? []) {
        if (p.PartNumber && p.ETag) parts.push({ partNumber: p.PartNumber, etag: p.ETag, size: p.Size ?? 0 });
      }
      marker = out.IsTruncated ? out.NextPartNumberMarker : undefined;
    } while (marker);
    return parts;
  }

  async completeMultipartUpload(key: string, uploadId: string, parts: UploadedPart[]) {
    await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: [...parts].sort((a, b) => a.partNumber - b.partNumber).map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
        },
      }),
    );
  }

  async abortMultipartUpload(key: string, uploadId: string) {
    await this.client.send(new AbortMultipartUploadCommand({ Bucket: this.bucket, Key: key, UploadId: uploadId }));
  }

  async head(key: string) {
    try {
      const out = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { size: out.ContentLength ?? 0 };
    } catch (err) {
      if ((err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null;
      throw err;
    }
  }

  async readRange(key: string, start: number, endInclusive: number) {
    const out = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key, Range: `bytes=${start}-${endInclusive}` }),
    );
    return Buffer.from(await out.Body!.transformToByteArray());
  }

  async getBuffer(key: string) {
    const out = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return Buffer.from(await out.Body!.transformToByteArray());
  }

  async getStream(key: string, range?: { start: number; end: number }) {
    const out = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key, Range: range ? `bytes=${range.start}-${range.end}` : undefined }),
    );
    return out.Body as Readable;
  }

  async putStream(key: string, body: Readable, contentType: string) {
    await new Upload({ client: this.client, params: { Bucket: this.bucket, Key: key, Body: body, ContentType: contentType } }).done();
  }

  async put(key: string, body: Buffer, contentType: string) {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
  }

  signDownloadUrl(key: string, opts: { ttlSec: number; contentType?: string; downloadName?: string }) {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentType: opts.contentType,
        ResponseContentDisposition: opts.downloadName
          ? `attachment; filename*=UTF-8''${encodeURIComponent(opts.downloadName)}`
          : undefined,
      }),
      { expiresIn: opts.ttlSec },
    );
  }

  async delete(keys: string[]) {
    for (let i = 0; i < keys.length; i += 1000) {
      await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: { Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })), Quiet: true },
        }),
      );
    }
  }

  async ping() {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }
}
