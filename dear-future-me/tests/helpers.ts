import { randomBytes } from "node:crypto";
import type { SessionUser } from "@/server/auth/session";
import { requestSeal, performSeal } from "@/server/capsules/seal";
import { createDraft, updateDraft } from "@/server/capsules/service";
import { db } from "@/server/db";
import { completeUpload, createLetter, initUpload, signUploadParts } from "@/server/memories";
import { ensureSubscription } from "@/server/plans";
import { storage } from "@/server/storage";
import { LocalStorage } from "@/server/storage/local";

export async function makeUser(over: Partial<{ name: string; email: string; verified: boolean; role: "USER" | "ADMIN" | "SUPER_ADMIN" }> = {}): Promise<SessionUser> {
  const email = over.email ?? `user-${randomBytes(5).toString("hex")}@example.test`;
  const u = await db.user.create({
    data: { name: over.name ?? "Test User", email, emailVerifiedAt: over.verified === false ? null : new Date(), role: over.role ?? "USER", timezone: "Europe/London" },
  });
  await ensureSubscription(u.id);
  return {
    id: u.id, name: u.name, email: u.email, role: u.role, timezone: u.timezone, emailVerified: over.verified !== false,
    avatarKey: null, dateOfBirth: null, aiConsent: false, hasPassword: false, createdAt: u.createdAt,
  };
}

// A real 1×1 PNG, so type sniffing and thumbnailing run for real.
export const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

/** Uploads a file through the real pipeline: init → signed part → complete. */
export async function uploadMemory(user: SessionUser, data: Buffer = PNG, filename = "photo.png", mimeType = "image/png", inVault = true) {
  const init = await initUpload(user, { filename, mimeType, size: data.length, inVault });
  const { parts } = await signUploadParts(user, init.memoryId, [1]);
  const u = new URL(parts[0].url, "http://localhost");
  const etag = await (storage() as LocalStorage).writePart(u.searchParams.get("u")!, 1, data);
  return completeUpload(user, init.memoryId, [{ partNumber: 1, etag }]);
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Creates a draft with a photo, a letter and a message, then seals it for
 * real. The unlock time is set directly on the draft (drafts are editable)
 * so tests don't have to wait a minute; `unlockInMs` may be negative.
 */
export async function sealedCapsule(user: SessionUser, opts: { unlockInMs?: number; recipients?: { email: string; name?: string }[]; includeSelf?: boolean } = {}) {
  const photo = await uploadMemory(user);
  const letter = await createLetter(user, { title: "To me", content: "The secret letter text", inVault: false });
  const { id } = await createDraft(user, { kind: "STANDARD", title: "Test capsule" });
  await updateDraft(user, id, {
    message: "The secret message",
    memoryIds: [photo.id, letter.id],
    coverMemoryId: photo.id,
    schedule: { kind: "preset", preset: "1y", timezone: "Europe/London" },
    recipients: (opts.recipients ?? []).map((r) => ({ ...r, permission: "VIEW" as const })),
    includeSelf: opts.includeSelf ?? true,
    answers: [{ promptKey: "proud", prompt: "What are you most proud of today?", answer: "Finishing the test suite" }],
  });
  await requestSeal(user, id);
  // The schedule fixed unlock_at a year out; pull it in while the capsule is still SEALING (not yet immutable).
  await db.capsule.update({ where: { id }, data: { unlockAt: new Date(Date.now() + (opts.unlockInMs ?? 1500)) } });
  await performSeal(id);
  return { id, photoId: photo.id, letterId: letter.id };
}
