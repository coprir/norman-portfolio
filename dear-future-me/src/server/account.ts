import sharp from "sharp";
import { audit } from "./audit";
import type { SessionUser } from "./auth/session";
import { db } from "./db";
import { badRequest } from "./errors";
import { deleteObjects } from "./memories";
import { getUsage } from "./plans";
import { DOWNLOAD_URL_TTL, newObjectKey, storage } from "./storage";

export async function getProfile(user: SessionUser) {
  const [row, usage] = await Promise.all([db.user.findUniqueOrThrow({ where: { id: user.id } }), getUsage(user.id)]);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    role: user.role,
    timezone: user.timezone,
    dateOfBirth: user.dateOfBirth?.toISOString().slice(0, 10) ?? null,
    createdAt: user.createdAt.toISOString(),
    hasPassword: user.hasPassword,
    aiConsent: user.aiConsent,
    notificationPrefs: row.notificationPrefs as Record<string, { email?: boolean }>,
    avatarUrl: user.avatarKey ? await storage().signDownloadUrl(user.avatarKey, { ttlSec: DOWNLOAD_URL_TTL * 3, contentType: "image/webp" }) : null,
    plan: { id: usage.plan.id, name: usage.plan.name, features: usage.features, maxActiveCapsules: usage.plan.maxActiveCapsules },
    storage: { usedBytes: Number(usage.used), limitBytes: Number(usage.plan.storageLimitBytes) },
    activeCapsules: usage.activeCapsules,
  };
}

export async function setAvatar(user: SessionUser, image: Buffer) {
  let data: Buffer;
  try {
    data = await sharp(image, { limitInputPixels: 100_000_000 }).rotate().resize(256, 256, { fit: "cover" }).webp({ quality: 82 }).toBuffer();
  } catch {
    throw badRequest("That image couldn't be read. Try a JPG or PNG.");
  }
  const key = newObjectKey("avatars");
  await storage().put(key, data, "image/webp");
  await db.user.update({ where: { id: user.id }, data: { avatarKey: key } });
  await deleteObjects([user.avatarKey]);
}

/**
 * A complete, machine-readable copy of the user's data (GDPR Art. 20).
 * Media files are listed with download links valid for one hour. Content
 * sealed in a capsule that hasn't opened yet is listed without a link.
 */
export async function exportUserData(user: SessionUser) {
  const [profile, memories, albums, capsules, received, notifications, auditLogs] = await Promise.all([
    getProfile(user),
    db.memory.findMany({ where: { userId: user.id, status: "READY" }, include: { category: true, capsules: { select: { capsule: { select: { id: true, status: true } } } } }, orderBy: { captureDate: "asc" } }),
    db.album.findMany({ where: { userId: user.id }, include: { memories: { select: { memoryId: true } } } }),
    db.capsule.findMany({ where: { creatorId: user.id }, include: { recipients: true, memories: { select: { memoryId: true, displayOrder: true } }, answers: { where: { userId: user.id } } } }),
    db.capsuleRecipient.findMany({ where: { userId: user.id, capsule: { creatorId: { not: user.id } } }, include: { capsule: { select: { id: true, title: true, status: true, unlockAt: true } } } }),
    db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } }),
    db.auditLog.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } }),
  ]);
  const s = storage();
  const HOUR = 3600;
  const out = {
    exportedAt: new Date().toISOString(),
    notice: "Download links expire one hour after this export was generated. Request a new export for fresh links.",
    profile: { ...profile, avatarUrl: undefined },
    memories: await Promise.all(
      memories.map(async (m) => {
        const sealed = !m.inVault && m.capsules.some((c) => ["LOCKED", "SCHEDULED", "FAILED"].includes(c.capsule.status));
        return {
          id: m.id,
          title: m.title,
          description: m.description,
          mediaType: m.mediaType,
          originalFilename: m.originalFilename,
          mimeType: m.mimeType,
          fileSizeBytes: Number(m.fileSize),
          category: m.category?.name ?? null,
          tags: m.tags,
          captureDate: m.captureDate,
          uploadedAt: m.uploadedAt,
          inVault: m.inVault,
          sealedUntilCapsuleOpens: sealed,
          letter: sealed ? null : m.content,
          downloadUrl: !sealed && m.storageKey ? absolute(await s.signDownloadUrl(m.storageKey, { ttlSec: HOUR, contentType: m.mimeType ?? undefined, downloadName: m.originalFilename ?? undefined })) : null,
        };
      }),
    ),
    albums: albums.map((a) => ({ id: a.id, name: a.name, description: a.description, memoryIds: a.memories.map((m) => m.memoryId) })),
    capsules: capsules.map((c) => {
      const sealed = ["LOCKED", "SCHEDULED", "FAILED"].includes(c.status);
      return {
        id: c.id,
        title: c.title,
        description: c.description,
        kind: c.kind,
        status: c.status,
        visibility: c.visibility,
        createdAt: c.createdAt,
        lockedAt: c.lockedAt,
        unlockAt: c.unlockAt,
        releasedAt: c.releasedAt,
        openedAt: c.openedAt,
        timezone: c.timezone,
        message: sealed ? "[sealed until this capsule opens]" : c.message,
        memoryIds: c.memories.sort((a, b) => a.displayOrder - b.displayOrder).map((m) => m.memoryId),
        recipients: c.recipients.map((r) => ({ email: r.email, name: r.recipientName, permission: r.permission, invitationStatus: r.invitationStatus })),
        answers: sealed ? "[sealed until this capsule opens]" : c.answers.map((a) => ({ prompt: a.prompt, answer: a.answer, phase: a.phase, at: a.createdAt })),
      };
    }),
    capsulesSharedWithMe: received.map((r) => ({ capsuleId: r.capsule.id, title: r.capsule.title, status: r.capsule.status, unlockAt: r.capsule.unlockAt, invitationStatus: r.invitationStatus })),
    notifications: notifications.map((n) => ({ type: n.type, title: n.title, body: n.body, createdAt: n.createdAt, readAt: n.readAt })),
    activityLog: auditLogs.map((a) => ({ action: a.action, resourceId: a.resourceId, at: a.createdAt })),
  };
  await audit({ userId: user.id, action: "account.exported" });
  return out;
}

function absolute(url: string) {
  return url.startsWith("/") ? `${process.env.APP_URL?.replace(/\/$/, "") ?? ""}${url}` : url;
}

/**
 * Erases the account: every stored object first, then the user row, whose
 * foreign keys cascade to memories, capsules, notifications and tokens.
 * Audit entries are kept with the user reference removed.
 */
export async function deleteAccount(user: SessionUser, ip?: string) {
  const memories = await db.memory.findMany({ where: { userId: user.id }, select: { storageKey: true, thumbnailKey: true, uploadId: true } });
  for (const m of memories) {
    if (m.uploadId && m.storageKey) await storage().abortMultipartUpload(m.storageKey, m.uploadId).catch(() => {});
  }
  await deleteObjects([...memories.flatMap((m) => [m.storageKey, m.thumbnailKey]), user.avatarKey]);
  await audit({ userId: user.id, action: "account.deleted", ip, metadata: { objects: memories.length } });
  await db.user.delete({ where: { id: user.id } });
}
