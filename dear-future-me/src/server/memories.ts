import type { Memory, Prisma } from "@prisma/client";
import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";
import { ACCEPTED, normalizeMime, type MediaKind } from "@/lib/media";
import { audit } from "./audit";
import type { SessionUser } from "./auth/session";
import { db } from "./db";
import { badRequest, conflict, notFound } from "./errors";
import { logger } from "./logger";
import { notify } from "./notifications";
import { storageWarning } from "./email/templates";
import { assertCanStore } from "./plans";
import { scanObject } from "./security/scan";
import { DOWNLOAD_URL_TTL, PART_SIZE, UPLOAD_URL_TTL, newObjectKey, storage } from "./storage";
import type { UploadedPart } from "./storage/types";

export type MemoryDTO = {
  id: string;
  title: string | null;
  description: string | null;
  mediaType: MediaKind;
  status: string;
  inVault: boolean;
  originalFilename: string | null;
  fileSize: number;
  mimeType: string | null;
  content: string | null;
  categoryId: string | null;
  tags: string[];
  captureDate: string | null;
  uploadedAt: string;
  width: number | null;
  height: number | null;
  thumbUrl: string | null;
  albumIds?: string[];
};

type Meta = { width?: number; height?: number };

export async function toMemoryDTO(m: Memory & { albums?: { albumId: string }[] }, opts: { signThumb?: boolean } = {}): Promise<MemoryDTO> {
  const meta = (m.metadata ?? {}) as Meta;
  return {
    id: m.id,
    title: m.title,
    description: m.description,
    mediaType: m.mediaType,
    status: m.status,
    inVault: m.inVault,
    originalFilename: m.originalFilename,
    fileSize: Number(m.fileSize),
    mimeType: m.mimeType,
    content: m.mediaType === "LETTER" ? m.content : null,
    categoryId: m.categoryId,
    tags: m.tags,
    captureDate: m.captureDate?.toISOString() ?? null,
    uploadedAt: m.uploadedAt.toISOString(),
    width: meta.width ?? null,
    height: meta.height ?? null,
    thumbUrl:
      opts.signThumb !== false && m.thumbnailKey
        ? await storage().signDownloadUrl(m.thumbnailKey, { ttlSec: DOWNLOAD_URL_TTL * 3, contentType: "image/webp" })
        : null,
    albumIds: m.albums?.map((a) => a.albumId),
  };
}

/** Looks up a memory the user owns. "Not yours" and "missing" look identical. */
export async function getOwnMemory(userId: string, id: string): Promise<Memory> {
  const m = await db.memory.findFirst({ where: { id, userId } });
  if (!m) throw notFound("Memory not found.");
  return m;
}

// ── Uploads ────────────────────────────────────────────────────────────────

export async function initUpload(
  user: SessionUser,
  input: { filename: string; mimeType: string; size: number; inVault: boolean; captureDate?: string | null },
) {
  const mime = normalizeMime(input.mimeType, input.filename);
  if (!mime) throw badRequest("That file type isn't supported. Use JPG, PNG, WEBP, HEIC, MP4, MOV, WEBM, MP3, WAV, M4A, AAC, PDF or TXT.");
  if (input.size <= 0) throw badRequest("That file is empty.");
  await assertCanStore(user.id, input.size);

  const key = newObjectKey("media");
  const uploadId = await storage().createMultipartUpload(key, mime);
  const captured = input.captureDate ? new Date(input.captureDate) : new Date();
  const memory = await db.memory.create({
    data: {
      userId: user.id,
      mediaType: ACCEPTED[mime].kind,
      status: "PENDING",
      inVault: input.inVault,
      storageKey: key,
      uploadId,
      originalFilename: input.filename.slice(0, 255),
      title: input.filename.replace(/\.[^.]+$/, "").slice(0, 120),
      fileSize: BigInt(input.size),
      mimeType: mime,
      captureDate: Number.isNaN(captured.getTime()) || captured.getTime() > Date.now() + 86_400_000 ? new Date() : captured,
    },
  });
  return { memoryId: memory.id, partSize: PART_SIZE, partCount: Math.max(1, Math.ceil(input.size / PART_SIZE)) };
}

async function getPendingUpload(userId: string, id: string) {
  const m = await getOwnMemory(userId, id);
  if (m.status !== "PENDING" || !m.storageKey || !m.uploadId) throw conflict("This upload is already finished.");
  return m as Memory & { storageKey: string; uploadId: string };
}

export async function signUploadParts(user: SessionUser, memoryId: string, partNumbers: number[]) {
  const m = await getPendingUpload(user.id, memoryId);
  const partCount = Math.max(1, Math.ceil(Number(m.fileSize) / PART_SIZE));
  if (partNumbers.some((n) => n < 1 || n > partCount)) throw badRequest("Part number out of range.");
  const urls = await Promise.all(
    partNumbers.map(async (n) => ({ partNumber: n, url: await storage().signPartUrl(m.storageKey, m.uploadId, n, UPLOAD_URL_TTL) })),
  );
  return { parts: urls };
}

export async function listUploadedParts(user: SessionUser, memoryId: string) {
  const m = await getPendingUpload(user.id, memoryId);
  return { parts: await storage().listParts(m.storageKey, m.uploadId) };
}

/** Sniffs the real file type from its first bytes; the declared type is never trusted. */
async function verifyContentType(key: string, declared: string, size: number): Promise<void> {
  const head = await storage().readRange(key, 0, Math.min(size, 8192) - 1);
  const detected = await fileTypeFromBuffer(head);
  if (declared === "text/plain") {
    if (detected || head.includes(0)) throw badRequest("This file doesn't look like plain text.");
    return;
  }
  const sniffed = detected ? normalizeMime(detected.mime) : null;
  if (!sniffed) throw badRequest("We couldn't recognise this file. It may be damaged or an unsupported format.");
  const a = ACCEPTED[declared].kind;
  const b = ACCEPTED[sniffed].kind;
  // Audio is often carried in a video container (m4a → mp4, recordings → webm).
  const compatible = a === b || (a === "AUDIO" && b === "VIDEO") || (a === "VIDEO" && b === "AUDIO");
  if (!compatible) throw badRequest("This file's contents don't match its type.");
}

export async function makeThumbnail(input: Buffer): Promise<{ data: Buffer; width: number; height: number } | null> {
  try {
    const img = sharp(input, { failOn: "none", limitInputPixels: 268_402_689 }).rotate();
    const meta = await img.metadata();
    const data = await img.resize({ width: 720, height: 720, fit: "inside", withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
    const rotated = (meta.orientation ?? 1) >= 5;
    return { data, width: (rotated ? meta.height : meta.width) ?? 0, height: (rotated ? meta.width : meta.height) ?? 0 };
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "thumbnail generation failed");
    return null;
  }
}

const THUMBNAIL_SOURCE_LIMIT = 80 * 1024 * 1024;

export async function completeUpload(user: SessionUser, memoryId: string, parts: UploadedPart[]): Promise<MemoryDTO> {
  const m = await getPendingUpload(user.id, memoryId);
  const s = storage();
  await s.completeMultipartUpload(m.storageKey, m.uploadId, parts);

  const reject = async (message: string) => {
    await s.delete([m.storageKey]).catch(() => {});
    await db.memory.delete({ where: { id: m.id } });
    throw badRequest(message);
  };

  const head = await s.head(m.storageKey);
  if (!head) return reject("The upload didn't complete. Please try again.");
  // The quota was checked against the declared size; hold the client to it.
  if (head.size > Number(m.fileSize)) return reject("The uploaded file is larger than declared.");
  try {
    await verifyContentType(m.storageKey, m.mimeType!, head.size);
  } catch (err) {
    return reject((err as Error).message);
  }
  const scan = await scanObject(m.storageKey, head.size);
  if (scan === "INFECTED") {
    await audit({ userId: user.id, action: "memory.rejected_malware", resourceId: m.id });
    return reject("This file was flagged as unsafe and wasn't saved.");
  }

  let thumbnailKey: string | null = null;
  let metadata: Meta = {};
  if (m.mediaType === "IMAGE" && head.size <= THUMBNAIL_SOURCE_LIMIT) {
    const thumb = await makeThumbnail(await s.getBuffer(m.storageKey));
    if (thumb) {
      thumbnailKey = newObjectKey("thumbs");
      await s.put(thumbnailKey, thumb.data, "image/webp");
      metadata = { width: thumb.width, height: thumb.height };
    }
  }

  const updated = await db.memory.update({
    where: { id: m.id },
    data: { status: "READY", scanStatus: scan, uploadId: null, fileSize: BigInt(head.size), thumbnailKey, metadata },
  });
  await audit({ userId: user.id, action: "memory.uploaded", resourceId: m.id, metadata: { mediaType: m.mediaType, size: head.size } });
  void maybeWarnStorage(user.id);
  return toMemoryDTO(updated);
}

/** Poster frame for a video, captured in the browser and re-encoded here. */
export async function setThumbnail(user: SessionUser, memoryId: string, image: Buffer): Promise<MemoryDTO> {
  const m = await getOwnMemory(user.id, memoryId);
  if (m.status !== "READY" || m.mediaType !== "VIDEO") throw badRequest("A preview can only be set for a video.");
  const thumb = await makeThumbnail(image);
  if (!thumb) throw badRequest("That preview image couldn't be read.");
  const key = newObjectKey("thumbs");
  await storage().put(key, thumb.data, "image/webp");
  if (m.thumbnailKey) await storage().delete([m.thumbnailKey]).catch(() => {});
  const updated = await db.memory.update({
    where: { id: m.id },
    data: { thumbnailKey: key, metadata: { ...((m.metadata ?? {}) as object), width: thumb.width, height: thumb.height } },
  });
  return toMemoryDTO(updated);
}

async function maybeWarnStorage(userId: string) {
  try {
    const { plan, used } = await assertCanStore(userId, 0);
    const percent = Math.floor((Number(used) / Number(plan.storageLimitBytes)) * 100);
    if (percent < 85) return;
    const month = new Date().toISOString().slice(0, 7);
    await notify(
      {
        userId,
        type: "STORAGE_WARNING",
        title: "Storage is nearly full",
        body: `You've used ${percent}% of your ${plan.name} storage.`,
        dedupeKey: `storage:${userId}:${month}`,
      },
      (u) => storageWarning(u.name, percent),
    );
  } catch {
    /* advisory only */
  }
}

export async function createLetter(user: SessionUser, input: { title?: string; content: string; inVault: boolean }): Promise<MemoryDTO> {
  const size = Buffer.byteLength(input.content, "utf8");
  await assertCanStore(user.id, size);
  const m = await db.memory.create({
    data: {
      userId: user.id,
      mediaType: "LETTER",
      status: "READY",
      inVault: input.inVault,
      title: input.title?.trim() || "A letter",
      content: input.content,
      fileSize: BigInt(size),
      mimeType: "text/plain",
      captureDate: new Date(),
    },
  });
  return toMemoryDTO(m);
}

// ── Reading ────────────────────────────────────────────────────────────────

export type MemoryQuery = {
  q?: string;
  type?: MediaKind;
  categoryId?: string;
  albumId?: string;
  tag?: string;
  from?: string;
  to?: string;
  sort?: "newest" | "oldest" | "uploaded" | "name" | "size";
  page?: number;
  take?: number;
};

export async function listMemories(userId: string, query: MemoryQuery) {
  const take = Math.min(Math.max(query.take ?? 60, 1), 120);
  const page = Math.max(query.page ?? 0, 0);
  const where: Prisma.MemoryWhereInput = { userId, inVault: true, status: "READY" };
  if (query.type) where.mediaType = query.type;
  if (query.categoryId) where.categoryId = query.categoryId;
  if (query.albumId) where.albums = { some: { albumId: query.albumId } };
  if (query.tag) where.tags = { has: query.tag.toLowerCase() };
  if (query.from || query.to) {
    where.captureDate = {
      ...(query.from ? { gte: new Date(query.from) } : {}),
      ...(query.to ? { lte: new Date(query.to) } : {}),
    };
  }
  const q = query.q?.trim();
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
      { originalFilename: { contains: q, mode: "insensitive" } },
      { content: { contains: q, mode: "insensitive" } },
      { tags: { has: q.toLowerCase() } },
      { category: { name: { contains: q, mode: "insensitive" } } },
    ];
  }
  const orderBy: Prisma.MemoryOrderByWithRelationInput[] =
    query.sort === "oldest"
      ? [{ captureDate: "asc" }]
      : query.sort === "uploaded"
        ? [{ uploadedAt: "desc" }]
        : query.sort === "name"
          ? [{ title: "asc" }]
          : query.sort === "size"
            ? [{ fileSize: "desc" }]
            : [{ captureDate: "desc" }];
  const [rows, total] = await Promise.all([
    db.memory.findMany({ where, orderBy: [...orderBy, { id: "asc" }], skip: page * take, take, include: { albums: { select: { albumId: true } } } }),
    db.memory.count({ where }),
  ]);
  return { items: await Promise.all(rows.map((m) => toMemoryDTO(m))), total, page, hasMore: (page + 1) * take < total };
}

/**
 * The single gate for reading a vault memory's bytes: its owner, or the
 * creator of a draft capsule it was contributed to (who must be able to
 * preview everything before sealing).
 *
 * Sealed content is not reachable from here at all: sealing deletes the
 * memory row and its files, so there is nothing left for this to return.
 */
export async function canReadMemory(user: SessionUser, m: Memory): Promise<boolean> {
  if (m.status !== "READY") return false;
  if (m.userId === user.id) return true;
  const link = await db.capsuleContribution.findFirst({
    where: { memoryId: m.id, capsule: { creatorId: user.id, status: "DRAFT" } },
    select: { id: true },
  });
  return Boolean(link);
}

export async function getMemoryUrls(user: SessionUser, memoryId: string, opts: { download?: boolean } = {}) {
  const m = await db.memory.findUnique({ where: { id: memoryId } });
  if (!m || !(await canReadMemory(user, m))) throw notFound("Memory not found.");
  const s = storage();
  return {
    url: m.storageKey
      ? await s.signDownloadUrl(m.storageKey, {
          ttlSec: DOWNLOAD_URL_TTL,
          contentType: m.mimeType ?? undefined,
          downloadName: opts.download ? (m.originalFilename ?? `${m.title ?? "memory"}`) : undefined,
        })
      : null,
    thumbUrl: m.thumbnailKey ? await s.signDownloadUrl(m.thumbnailKey, { ttlSec: DOWNLOAD_URL_TTL, contentType: "image/webp" }) : null,
    expiresInSec: DOWNLOAD_URL_TTL,
  };
}

// ── Editing ────────────────────────────────────────────────────────────────

export async function assertCategory(userId: string, categoryId: string) {
  const c = await db.category.findFirst({ where: { id: categoryId, OR: [{ userId: null }, { userId }] } });
  if (!c) throw badRequest("Unknown category.");
}

export async function updateMemory(
  user: SessionUser,
  id: string,
  patch: { title?: string | null; description?: string | null; categoryId?: string | null; tags?: string[]; captureDate?: string | null; content?: string },
) {
  const m = await getOwnMemory(user.id, id);
  if (patch.categoryId) await assertCategory(user.id, patch.categoryId);
  if (patch.content !== undefined && m.mediaType !== "LETTER") throw badRequest("Only letters have editable text.");
  if (await db.capsuleMemory.count({ where: { memoryId: m.id, capsule: { status: "SEALING" } } })) throw conflict("This memory is being sealed and can't be changed.");
  const tags = patch.tags ? [...new Set(patch.tags.map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 30) : undefined;
  const updated = await db.memory.update({
    where: { id: m.id },
    data: {
      title: patch.title === undefined ? undefined : patch.title?.trim() || null,
      description: patch.description === undefined ? undefined : patch.description?.trim() || null,
      categoryId: patch.categoryId === undefined ? undefined : patch.categoryId,
      tags,
      captureDate: patch.captureDate ? new Date(patch.captureDate) : undefined,
      content: patch.content,
      fileSize: patch.content !== undefined ? BigInt(Buffer.byteLength(patch.content, "utf8")) : undefined,
    },
    include: { albums: { select: { albumId: true } } },
  });
  return toMemoryDTO(updated);
}

export async function deleteMemory(user: SessionUser, id: string) {
  const m = await getOwnMemory(user.id, id);
  const sealing = await db.capsuleMemory.findFirst({ where: { memoryId: m.id, capsule: { status: "SEALING" } }, select: { capsule: { select: { title: true } } } });
  if (sealing) throw conflict(`This memory is being sealed into “${sealing.capsule.title}” and can't be changed.`);
  await db.memory.delete({ where: { id: m.id } });
  await deleteObjects([m.storageKey, m.thumbnailKey]);
  if (m.uploadId && m.storageKey) await storage().abortMultipartUpload(m.storageKey, m.uploadId).catch(() => {});
  await audit({ userId: user.id, action: "memory.deleted", resourceId: m.id });
}

export async function deleteObjects(keys: (string | null | undefined)[]) {
  const list = keys.filter((k): k is string => Boolean(k));
  if (list.length) await storage().delete(list).catch((err) => logger.error({ err }, "failed to delete storage objects"));
}

/** Removes uploads that were started but never finished. Run by the worker. */
export async function cleanupStaleUploads(olderThanMs = 24 * 60 * 60 * 1000): Promise<number> {
  const stale = await db.memory.findMany({ where: { status: "PENDING", uploadedAt: { lt: new Date(Date.now() - olderThanMs) } }, take: 200 });
  for (const m of stale) {
    if (m.storageKey && m.uploadId) await storage().abortMultipartUpload(m.storageKey, m.uploadId).catch(() => {});
    await deleteObjects([m.storageKey]);
    await db.memory.delete({ where: { id: m.id } }).catch(() => {});
  }
  return stale.length;
}
