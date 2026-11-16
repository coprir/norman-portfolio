import fs from "node:fs/promises";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { deleteAccount } from "@/server/account";
import { verifyEventChain } from "@/server/capsules/events";
import { sealedKey } from "@/server/capsules/seal";
import { acceptInviteToken, getCapsule, getContents, getItemUrl, openCapsule, respondToInvitation, saveNowAnswers } from "@/server/capsules/service";
import { db } from "@/server/db";
import { processScheduledJob, retryJob } from "@/server/release/processor";
import { jobsQueue } from "@/server/release/queue";
import { releaseCapsule } from "@/server/release/release";
import { sweep } from "@/server/release/sweeper";
import { signParams, verifyParams } from "@/server/storage/signing";
import { PNG, makeUser, sealedCapsule, sleep } from "./helpers";
import { emailControl, outbox } from "./setup";

const objectFile = (key: string) => path.resolve(".data/test-storage/objects", key);
const localFile = (url: string) => objectFile(new URL(url, "http://x").searchParams.get("k")!);

beforeEach(async () => {
  outbox.length = 0;
  emailControl.failFor.clear();
  await jobsQueue().obliterate({ force: true });
});

describe("automated release", () => {
  it("does nothing before the unlock time", async () => {
    const user = await makeUser();
    const { id } = await sealedCapsule(user, { unlockInMs: 60_000 });
    expect(await releaseCapsule(id)).toBe("not_releasable");
    expect((await db.capsule.findUniqueOrThrow({ where: { id } })).status).toBe("LOCKED");
    expect(await db.capsuleItem.count({ where: { capsuleId: id } })).toBe(0);
    expect(outbox.filter((e) => e.template === "capsule-unlocked")).toHaveLength(0);
  });

  it("verifies the seal, restores the exact contents and notifies once", async () => {
    const user = await makeUser({ name: "Ada" });
    const { id } = await sealedCapsule(user, { unlockInMs: 300 });
    await sleep(400);
    expect(await releaseCapsule(id)).toBe("released");

    const c = await db.capsule.findUniqueOrThrow({ where: { id } });
    expect(c.status).toBe("AVAILABLE");
    expect(c.message).toBe("The secret message");
    expect(c.releasedAt!.getTime()).toBeGreaterThanOrEqual(c.unlockAt!.getTime());

    const contents = await getContents(user, id);
    expect(contents.message).toBe("The secret message");
    expect(contents.items.map((i) => i.mediaType)).toEqual(["IMAGE", "LETTER"]);
    expect(contents.items[1].content).toBe("The secret letter text");
    expect(contents.answers).toMatchObject([{ promptKey: "proud", then: "Finishing the test suite", now: null }]);

    // The released file is byte-for-byte what was uploaded.
    const { url } = await getItemUrl(user, id, contents.items[0].id);
    expect(Buffer.compare(await fs.readFile(localFile(url)), PNG)).toBe(0);

    // Ciphertext is cleaned up once the plaintext is safely in private storage.
    await expect(fs.access(objectFile(sealedKey(c.sealPrefix!, "payload")))).rejects.toThrow();

    expect(await db.notification.count({ where: { capsuleId: id, type: "CAPSULE_UNLOCKED" } })).toBe(1);
    const unlocked = outbox.filter((e) => e.template === "capsule-unlocked");
    expect(unlocked).toHaveLength(1);
    expect(unlocked[0]).toMatchObject({ to: user.email, subject: "A message from your past is waiting." });
    expect(unlocked[0].text).toContain("With love from your past self.");
    expect(unlocked[0].text).not.toContain("secret"); // links only, never content

    const events = (await db.capsuleEvent.findMany({ where: { capsuleId: id }, orderBy: { seq: "asc" } })).map((e) => e.type);
    expect(events).toEqual(["created", "seal_requested", "sealed", "release_verified", "released"]);
    expect((await verifyEventChain(id)).ok).toBe(true);
  });

  it("is idempotent: repeated and concurrent releases open once and notify once", async () => {
    const user = await makeUser();
    const { id } = await sealedCapsule(user, { unlockInMs: -1000, recipients: [{ email: "friend@example.test", name: "Friend" }] });
    const results = await Promise.all(Array.from({ length: 6 }, () => releaseCapsule(id).catch((e) => `error: ${e.message}`)));
    expect(results.filter((r) => r === "released")).toHaveLength(1);
    expect(results.every((r) => r === "released" || r === "already_released")).toBe(true);
    expect(await releaseCapsule(id)).toBe("already_released");

    expect(await db.capsuleItem.count({ where: { capsuleId: id } })).toBe(2);
    expect(await db.auditLog.count({ where: { resourceId: id, action: "capsule.released" } })).toBe(1);
    expect(await db.notification.count({ where: { capsuleId: id, type: "CAPSULE_UNLOCKED" } })).toBe(1);
    const unlocked = outbox.filter((e) => e.template === "capsule-unlocked");
    expect(unlocked.map((e) => e.to).sort()).toEqual(["friend@example.test", user.email].sort());
  });

  it("refuses to release a capsule whose sealed content was tampered with", async () => {
    const user = await makeUser();
    const { id } = await sealedCapsule(user, { unlockInMs: -1000 });
    const c = await db.capsule.findUniqueOrThrow({ where: { id } });
    const file = objectFile(sealedKey(c.sealPrefix!, "item-0"));
    const bytes = await fs.readFile(file);
    bytes[20] ^= 0xff;
    await fs.writeFile(file, bytes);

    await expect(releaseCapsule(id)).rejects.toThrow(/authentication|manifest hash/);
    expect((await db.capsule.findUniqueOrThrow({ where: { id } })).status).toBe("LOCKED");
    expect(await db.capsuleItem.count({ where: { capsuleId: id } })).toBe(0);
    expect(outbox.filter((e) => e.template === "capsule-unlocked")).toHaveLength(0);
    expect((await db.capsuleEvent.findFirst({ where: { capsuleId: id }, orderBy: { seq: "desc" } }))!.type).toBe("release_failed");
  });

  it("retries only the notifications that failed", async () => {
    const user = await makeUser();
    emailControl.failFor.add("flaky@example.test");
    const { id } = await sealedCapsule(user, { unlockInMs: -1000, recipients: [{ email: "flaky@example.test" }, { email: "steady@example.test" }] });
    outbox.length = 0;
    await expect(releaseCapsule(id)).rejects.toThrow(/1 notification\(s\) failed/);
    expect((await db.capsule.findUniqueOrThrow({ where: { id } })).status).toBe("AVAILABLE"); // open regardless
    expect(outbox.filter((e) => e.template === "capsule-unlocked").map((e) => e.to).sort()).toEqual(["steady@example.test", user.email].sort());

    emailControl.failFor.clear();
    outbox.length = 0;
    expect(await releaseCapsule(id)).toBe("already_released");
    expect(outbox.map((e) => e.to)).toEqual(["flaky@example.test"]);
  });
});

describe("job processing and recovery", () => {
  it("the worker path releases a due capsule and completes the job", async () => {
    const user = await makeUser();
    const { id } = await sealedCapsule(user, { unlockInMs: -1000 });
    const job = await db.scheduledJob.findFirstOrThrow({ where: { capsuleId: id, type: "RELEASE" } });
    await db.scheduledJob.update({ where: { id: job.id }, data: { scheduledAt: new Date() } });
    expect(await processScheduledJob(job.id, { attemptsMade: 0, maxAttempts: 3 })).toBe("completed");
    expect((await db.scheduledJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("COMPLETED");
    // A duplicate delivery of the same job is a no-op.
    expect(await processScheduledJob(job.id, { attemptsMade: 0, maxAttempts: 3 })).toBe("skipped");
    expect(outbox.filter((e) => e.template === "capsule-unlocked")).toHaveLength(1);
  });

  it("defers a job delivered early instead of releasing", async () => {
    const user = await makeUser();
    const { id } = await sealedCapsule(user, { unlockInMs: 60_000 });
    const job = await db.scheduledJob.findFirstOrThrow({ where: { capsuleId: id, type: "RELEASE" } });
    expect(await processScheduledJob(job.id, { attemptsMade: 0, maxAttempts: 3 })).toBe("deferred");
    expect((await db.capsule.findUniqueOrThrow({ where: { id } })).status).toBe("LOCKED");
  });

  it("marks a job DEAD after its final attempt, keeps the capsule sealed, and lets an admin retry", async () => {
    const user = await makeUser();
    const admin = await makeUser({ role: "ADMIN" });
    const { id } = await sealedCapsule(user, { unlockInMs: -1000 });
    const job = await db.scheduledJob.findFirstOrThrow({ where: { capsuleId: id, type: "RELEASE" } });
    await db.scheduledJob.update({ where: { id: job.id }, data: { scheduledAt: new Date() } });
    const saved = process.env.KEY_RELEASE_PRIVATE_KEY;
    delete process.env.KEY_RELEASE_PRIVATE_KEY; // simulate the key service being unavailable
    try {
      await expect(processScheduledJob(job.id, { attemptsMade: 0, maxAttempts: 2 })).rejects.toThrow();
      expect((await db.scheduledJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("FAILED");
      await expect(processScheduledJob(job.id, { attemptsMade: 1, maxAttempts: 2 })).rejects.toThrow();
    } finally {
      process.env.KEY_RELEASE_PRIVATE_KEY = saved;
    }
    const dead = await db.scheduledJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(dead).toMatchObject({ status: "DEAD", attempts: 2 });
    expect(dead.lastError).toContain("not configured");
    expect((await db.capsule.findUniqueOrThrow({ where: { id } })).status).toBe("LOCKED");

    expect(await retryJob(job.id, admin.id)).toBe(true);
    expect(await jobsQueue().getJob(job.id)).toBeTruthy();
    expect(await processScheduledJob(job.id, { attemptsMade: 0, maxAttempts: 2 })).toBe("completed");
    expect((await db.capsule.findUniqueOrThrow({ where: { id } })).status).toBe("AVAILABLE");
  });

  it("the sweeper re-enqueues jobs that Redis lost and resets stuck ones", async () => {
    const user = await makeUser();
    const { id } = await sealedCapsule(user, { unlockInMs: -1000 });
    const job = await db.scheduledJob.findFirstOrThrow({ where: { capsuleId: id, type: "RELEASE" } });
    // As if it had been queued, then Redis was wiped during downtime.
    await db.scheduledJob.update({ where: { id: job.id }, data: { status: "QUEUED", scheduledAt: new Date(Date.now() - 10 * 60_000) } });
    await (await jobsQueue().getJob(job.id))?.remove();
    expect(await jobsQueue().getJob(job.id)).toBeFalsy();
    const stats = await sweep();
    expect(stats.recovered).toBeGreaterThanOrEqual(1);
    expect(await jobsQueue().getJob(job.id)).toBeTruthy();

    // A job left RUNNING by a crashed worker goes back to PENDING and is enqueued again.
    await jobsQueue().obliterate({ force: true });
    await db.scheduledJob.update({ where: { id: job.id }, data: { status: "RUNNING", startedAt: new Date(Date.now() - 30 * 60_000) } });
    const again = await sweep();
    expect(again.reset).toBeGreaterThanOrEqual(1);
    expect(await jobsQueue().getJob(job.id)).toBeTruthy();
  });

  it("the sweeper leaves far-future capsules in Postgres only", async () => {
    const user = await makeUser();
    const { id } = await sealedCapsule(user, { unlockInMs: 3 * 60 * 60_000 });
    const job = await db.scheduledJob.findFirstOrThrow({ where: { capsuleId: id, type: "RELEASE" } });
    await db.scheduledJob.update({ where: { id: job.id }, data: { scheduledAt: new Date(Date.now() + 3 * 60 * 60_000) } });
    await sweep();
    expect(await jobsQueue().getJob(job.id)).toBeFalsy();
    expect((await db.scheduledJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("PENDING");
  });
});

describe("who can open a released capsule", () => {
  it("recipients can; strangers, unverified look-alikes and decliners cannot", async () => {
    const creator = await makeUser({ name: "Creator" });
    await db.subscription.update({ where: { userId: creator.id }, data: { planId: "premium" } });
    const friend = await makeUser({ email: `friend-${Date.now()}@example.test` });
    const decliner = await makeUser({ email: `decliner-${Date.now()}@example.test` });
    const stranger = await makeUser();
    const pendingEmail = `late-${Date.now()}@example.test`;
    const { id } = await sealedCapsule(creator, { unlockInMs: 60_000, recipients: [{ email: friend.email }, { email: decliner.email }, { email: pendingEmail }] });

    // While sealed: recipients see the label, nobody sees inside, strangers see nothing.
    expect(await getCapsule(friend, id)).toMatchObject({ status: "LOCKED", canViewContents: false, itemCount: null, recipients: null });
    await expect(getContents(friend, id)).rejects.toMatchObject({ status: 403 });
    await expect(getCapsule(stranger, id)).rejects.toMatchObject({ status: 404 });
    await respondToInvitation(decliner, id, "decline");

    // Fast-forward is impossible on a sealed capsule, so release a second one that is already due.
    const due = await sealedCapsule(creator, { unlockInMs: -1000, recipients: [{ email: friend.email }, { email: decliner.email }, { email: pendingEmail }] });
    await respondToInvitation(decliner, due.id, "decline");
    await releaseCapsule(due.id);

    expect((await openCapsule(friend, due.id)).message).toBe("The secret message");
    expect((await getCapsule(friend, due.id)).iHaveOpened).toBe(true);
    await expect(getContents(stranger, due.id)).rejects.toMatchObject({ status: 404 });
    await expect(getContents(decliner, due.id)).rejects.toMatchObject({ status: 403 });
    const items = (await getContents(friend, due.id)).items;
    await expect(getItemUrl(stranger, due.id, items[0].id)).rejects.toMatchObject({ status: 404 });

    // Someone who registers the invited address but hasn't verified it gets nothing…
    const impostor = await makeUser({ email: pendingEmail, verified: false });
    await expect(getContents(impostor, due.id)).rejects.toMatchObject({ status: 404 });
    // …until the address is verified.
    await db.user.update({ where: { id: impostor.id }, data: { emailVerifiedAt: new Date() } });
    expect((await getContents({ ...impostor, emailVerified: true }, due.id)).items).toHaveLength(2);
  });

  it("an emailed invitation link is single-use and binds to the account that accepts it", async () => {
    const creator = await makeUser({ name: "Creator" });
    const { id } = await sealedCapsule(creator, { unlockInMs: -1000, recipients: [{ email: "someone-new@example.test" }] });
    outbox.length = 0;
    await releaseCapsule(id);
    const mail = outbox.find((e) => e.to === "someone-new@example.test")!;
    const token = /\/invite\/([\w-]+)/.exec(mail.text)![1];
    const claimer = await makeUser();
    const other = await makeUser();
    expect(await acceptInviteToken(claimer, token)).toEqual({ capsuleId: id });
    await expect(acceptInviteToken(other, token)).rejects.toMatchObject({ status: 404 });
    expect((await openCapsule(claimer, id)).items).toHaveLength(2);
    await expect(getContents(other, id)).rejects.toMatchObject({ status: 404 });
  });

  it("stores the 'now' answers beside the originals for comparison", async () => {
    const user = await makeUser();
    const { id } = await sealedCapsule(user, { unlockInMs: -1000 });
    await releaseCapsule(id);
    const out = await saveNowAnswers(user, id, [{ promptKey: "proud", answer: "Something new" }, { promptKey: "invented", answer: "ignored" }]);
    expect(out.answers).toMatchObject([{ promptKey: "proud", then: "Finishing the test suite", now: "Something new" }]);
  });
});

describe("storage links and erasure", () => {
  it("signed links expire and can't be altered", () => {
    const exp = String(Math.floor(Date.now() / 1000) + 300);
    const params = { k: "media/ab/abcdef0123456789", exp };
    const good = new URLSearchParams({ ...params, sig: signParams(params) });
    expect(verifyParams(good)).toMatchObject({ k: params.k });
    expect(verifyParams(good, Date.now() + 301_000)).toBeNull(); // expired
    expect(verifyParams(new URLSearchParams({ ...params, k: "media/ab/someoneelses000000", sig: signParams(params) }))).toBeNull();
    expect(verifyParams(new URLSearchParams({ ...params, exp: String(Number(exp) + 9999), sig: signParams(params) }))).toBeNull();
    expect(verifyParams(new URLSearchParams(params))).toBeNull(); // unsigned
  });

  it("account deletion destroys sealed capsules without revealing them, and keeps the history", async () => {
    const user = await makeUser();
    const { id } = await sealedCapsule(user, { unlockInMs: 60_000 });
    const c = await db.capsule.findUniqueOrThrow({ where: { id } });
    await deleteAccount(user);
    expect(await db.user.count({ where: { id: user.id } })).toBe(0);
    expect(await db.capsule.count({ where: { id } })).toBe(0);
    expect(await db.capsuleKey.count({ where: { capsuleId: id } })).toBe(0);
    await expect(fs.access(objectFile(sealedKey(c.sealPrefix!, "payload")))).rejects.toThrow();
    await expect(fs.access(objectFile(c.coverKey!))).rejects.toThrow();
    const events = await db.capsuleEvent.findMany({ where: { capsuleId: id }, orderBy: { seq: "asc" } });
    expect(events.at(-1)!.type).toBe("erased");
  });
});
