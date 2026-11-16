import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { exportUserData } from "@/server/account";
import { verifyEventChain } from "@/server/capsules/events";
import { performSeal, requestSeal, sealedKey } from "@/server/capsules/seal";
import { createDraft, deleteDraft, getCapsule, getContents, getItemUrl, listCapsules, openCapsule, updateDraft } from "@/server/capsules/service";
import { KeyNotYetReleasable, releaseDataKey } from "@/server/crypto/keys";
import { db } from "@/server/db";
import { getMemoryUrls, listMemories } from "@/server/memories";
import { storage } from "@/server/storage";
import { makeUser, sealedCapsule, uploadMemory } from "./helpers";

const objectFile = (key: string) => path.resolve(".data/test-storage/objects", key);

describe("sealing", () => {
  it("moves content out of the vault and leaves nothing readable behind", async () => {
    const user = await makeUser();
    const { id, photoId, letterId } = await sealedCapsule(user, { unlockInMs: 60_000 });

    const c = await db.capsule.findUniqueOrThrow({ where: { id }, include: { key: true } });
    expect(c.status).toBe("LOCKED");
    expect(c.sealedAt).toBeInstanceOf(Date);
    expect(c.message).toBeNull(); // the message is in the encrypted payload, not the database
    expect(c.encryptionKeyReference).toMatch(/^dfm-kms:v1:/);
    expect(c.contentIntegrityHash).toMatch(/^[a-f0-9]{64}$/);
    expect(c.releaseJobId).toBeTruthy();
    expect(c.itemCount).toBe(2);

    // Vault originals are gone: rows, files and thumbnails.
    expect(await db.memory.count({ where: { id: { in: [photoId, letterId] } } })).toBe(0);
    expect((await listMemories(user.id, {})).total).toBe(0);
    await expect(getMemoryUrls(user, photoId)).rejects.toMatchObject({ status: 404 });
    expect(await db.capsuleAnswer.count({ where: { capsuleId: id } })).toBe(0);

    // Nothing in the database holds the private text.
    const dump = JSON.stringify(await db.capsule.findUniqueOrThrow({ where: { id } }), (_k, v) => (typeof v === "bigint" ? Number(v) : v));
    expect(dump).not.toContain("secret");

    // The sealed store holds only ciphertext.
    const manifest = c.sealedContentManifest as { objects: { name: string; size: number }[] };
    expect(manifest.objects.map((o) => o.name).sort()).toEqual(["item-0", "payload", "thumb-0"]);
    for (const o of manifest.objects) {
      const bytes = await fs.readFile(objectFile(sealedKey(c.sealPrefix!, o.name)));
      expect(bytes.length).toBe(o.size);
      expect(bytes.includes(Buffer.from("secret"))).toBe(false);
      expect(bytes.includes(Buffer.from("PNG"))).toBe(false);
    }
  });

  it("refuses the creator any access to a sealed capsule's contents", async () => {
    const user = await makeUser();
    const { id } = await sealedCapsule(user, { unlockInMs: 60_000 });
    await expect(getContents(user, id)).rejects.toMatchObject({ status: 403 });
    await expect(openCapsule(user, id)).rejects.toMatchObject({ status: 403 });
    await expect(getItemUrl(user, id, "anything")).rejects.toMatchObject({ status: 403 });
    await expect(updateDraft(user, id, { title: "Changed" })).rejects.toMatchObject({ status: 409 });
    await expect(deleteDraft(user, id)).rejects.toMatchObject({ status: 409 });
    await expect(requestSeal(user, id)).rejects.toMatchObject({ status: 409 });

    // The summary a locked capsule exposes: label only, no content fields.
    const dto = await getCapsule(user, id);
    expect(dto).toMatchObject({ status: "LOCKED", canViewContents: false, title: "Test capsule" });
    expect(dto.coverThumbUrl).toBeTruthy();
    expect(JSON.stringify(dto)).not.toContain("secret");
    expect(JSON.stringify(await listCapsules(user))).not.toContain("secret");
    expect(JSON.stringify(await exportUserData(user))).not.toContain("secret");
  });

  it("the key service will not release a key before the unlock time", async () => {
    const user = await makeUser();
    const { id } = await sealedCapsule(user, { unlockInMs: 60_000 });
    const c = await db.capsule.findUniqueOrThrow({ where: { id } });
    await expect(releaseDataKey(c.encryptionKeyReference!, id)).rejects.toBeInstanceOf(KeyNotYetReleasable);
    // Lying about the time doesn't help: the service also checks its own clock.
    await expect(releaseDataKey(c.encryptionKeyReference!, id, new Date(Date.now() + 10 * 365 * 86_400_000))).rejects.toBeInstanceOf(KeyNotYetReleasable);
  });

  it("a tier without the private key cannot unseal at all", async () => {
    const user = await makeUser();
    const { id } = await sealedCapsule(user, { unlockInMs: -1000 });
    const c = await db.capsule.findUniqueOrThrow({ where: { id } });
    const saved = process.env.KEY_RELEASE_PRIVATE_KEY;
    delete process.env.KEY_RELEASE_PRIVATE_KEY;
    try {
      await expect(releaseDataKey(c.encryptionKeyReference!, id)).rejects.toThrow(/not configured/);
    } finally {
      process.env.KEY_RELEASE_PRIVATE_KEY = saved;
    }
  });

  it("the database itself rejects edits, early release, illegal transitions and deletion", async () => {
    const user = await makeUser();
    const { id } = await sealedCapsule(user, { unlockInMs: 60_000 });
    await expect(db.capsule.update({ where: { id }, data: { unlockAt: new Date() } })).rejects.toThrow(/cannot be modified/);
    await expect(db.capsule.update({ where: { id }, data: { title: "x" } })).rejects.toThrow(/cannot be modified/);
    await expect(db.capsule.update({ where: { id }, data: { contentIntegrityHash: "0".repeat(64) } })).rejects.toThrow(/cannot be modified/);
    await expect(db.capsule.update({ where: { id }, data: { message: "peek" } })).rejects.toThrow(/no readable message/);
    await expect(db.capsule.update({ where: { id }, data: { status: "AVAILABLE" } })).rejects.toThrow(/before unlock_at/);
    await expect(db.capsule.update({ where: { id }, data: { status: "DRAFT" } })).rejects.toThrow(/Illegal capsule transition/);
    await expect(db.capsule.update({ where: { id }, data: { status: "OPENED" } })).rejects.toThrow(/Illegal capsule transition/);
    await expect(db.capsule.delete({ where: { id } })).rejects.toThrow(/cannot be deleted/);
    await expect(db.capsuleRecipient.create({ data: { capsuleId: id, email: "late@example.test" } })).rejects.toThrow(/cannot be changed/);
    await expect(db.capsuleRecipient.deleteMany({ where: { capsuleId: id } })).rejects.toThrow(/cannot be changed/);
    await expect(db.capsuleKey.deleteMany({ where: { capsuleId: id } })).rejects.toThrow(/immutable/);
    await expect(db.capsuleKey.updateMany({ where: { capsuleId: id }, data: { notBefore: new Date(0) } })).rejects.toThrow(/immutable/);
    await expect(db.capsuleEvent.deleteMany({ where: { capsuleId: id } })).rejects.toThrow(/append-only/);
    await expect(db.capsuleEvent.updateMany({ where: { capsuleId: id }, data: { type: "x" } })).rejects.toThrow(/append-only/);
  });

  it("keeps a verifiable, hash-chained history", async () => {
    const user = await makeUser();
    const { id } = await sealedCapsule(user, { unlockInMs: 60_000 });
    const events = await db.capsuleEvent.findMany({ where: { capsuleId: id }, orderBy: { seq: "asc" } });
    expect(events.map((e) => e.type)).toEqual(["created", "seal_requested", "sealed"]);
    expect(events[1].data).toMatchObject({ declarationAccepted: true });
    expect(await verifyEventChain(id)).toMatchObject({ ok: true, events: 3 });
  });

  it("a failed seal rolls back completely: draft restored, vault untouched, nothing sealed", async () => {
    const user = await makeUser();
    const a = await uploadMemory(user);
    const b = await uploadMemory(user);
    const { id } = await createDraft(user, { kind: "STANDARD", title: "Will fail" });
    await updateDraft(user, id, { message: "keep me", memoryIds: [a.id, b.id], schedule: { kind: "preset", preset: "1y", timezone: "UTC" } });
    await requestSeal(user, id);
    expect((await db.capsule.findUniqueOrThrow({ where: { id } })).status).toBe("SEALING");
    const sealing = await db.capsule.findUniqueOrThrow({ where: { id } });

    // Break the second file so sealing fails after the first was already encrypted.
    const second = await db.memory.findUniqueOrThrow({ where: { id: b.id } });
    await storage().delete([second.storageKey!]);
    await expect(performSeal(id)).rejects.toThrow();

    const after = await db.capsule.findUniqueOrThrow({ where: { id }, include: { key: true, memories: true } });
    expect(after.status).toBe("DRAFT");
    expect(after.message).toBe("keep me");
    expect(after.key).toBeNull();
    expect(after.sealedAt).toBeNull();
    expect(after.memories).toHaveLength(2);
    expect(await db.memory.count({ where: { id: { in: [a.id, b.id] } } })).toBe(2);
    await expect(fs.access(objectFile(sealedKey(sealing.sealPrefix!, "item-0")))).rejects.toThrow(); // partial ciphertext removed
    expect(await db.scheduledJob.count({ where: { capsuleId: id, type: "RELEASE" } })).toBe(0);
    expect((await db.capsuleEvent.findMany({ where: { capsuleId: id }, orderBy: { seq: "asc" } })).map((e) => e.type)).toEqual(["created", "seal_requested", "sealing_failed"]);
  });

  it("requires a verified email, content, a date and a recipient", async () => {
    const unverified = await makeUser({ verified: false });
    const d1 = await createDraft(unverified, { kind: "STANDARD", title: "x" });
    await expect(requestSeal(unverified, d1.id)).rejects.toMatchObject({ status: 403 });

    const user = await makeUser();
    const { id } = await createDraft(user, { kind: "STANDARD", title: "Empty" });
    await expect(requestSeal(user, id)).rejects.toThrow(/when this capsule should open/);
    await updateDraft(user, id, { schedule: { kind: "preset", preset: "1y", timezone: "UTC" } });
    await expect(requestSeal(user, id)).rejects.toThrow(/at least one memory/);
    await updateDraft(user, id, { message: "hello", includeSelf: false });
    await expect(requestSeal(user, id)).rejects.toThrow(/who will receive/);
  });

  it("will not seal another user's memory into a capsule", async () => {
    const owner = await makeUser();
    const thief = await makeUser();
    const theirs = await uploadMemory(owner);
    const { id } = await createDraft(thief, { kind: "STANDARD", title: "Stolen" });
    await expect(updateDraft(thief, id, { memoryIds: [theirs.id] })).rejects.toMatchObject({ status: 400 });
    await expect(getMemoryUrls(thief, theirs.id)).rejects.toMatchObject({ status: 404 });
  });
});
