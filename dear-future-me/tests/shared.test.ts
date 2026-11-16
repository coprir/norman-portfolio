import { describe, expect, it } from "vitest";
import { performSeal, requestSeal } from "@/server/capsules/seal";
import { acceptInviteToken, addContribution, createDraft, getCapsule, getContents, getDraftDetail, inviteContributors, updateDraft } from "@/server/capsules/service";
import { db } from "@/server/db";
import { createLetter, getMemoryUrls } from "@/server/memories";
import { releaseCapsule } from "@/server/release/release";
import { makeUser, uploadMemory } from "./helpers";
import { outbox } from "./setup";

describe("collaborative capsules", () => {
  it("friends contribute to a draft, the creator previews, and everything is sealed and released together", async () => {
    const creator = await makeUser({ name: "Ada" });
    const friendEmail = `friend-${Date.now()}@example.test`;
    const friend = await makeUser({ name: "Grace", email: friendEmail });
    const outsider = await makeUser();

    const { id } = await createDraft(creator, { kind: "STANDARD", title: "Graduation" });
    const mine = await uploadMemory(creator);
    await updateDraft(creator, id, {
      memoryIds: [mine.id],
      allowContributions: true,
      recipients: [{ email: friendEmail, name: "Grace", permission: "CONTRIBUTE" }],
      schedule: { kind: "preset", preset: "5y", timezone: "UTC" },
    });

    // Until invited, the draft doesn't exist as far as the friend is concerned.
    await expect(getCapsule(friend, id)).rejects.toMatchObject({ status: 404 });
    outbox.length = 0;
    expect(await inviteContributors(creator, id)).toEqual({ invited: 1 });
    const token = /\/invite\/([\w-]+)/.exec(outbox.find((e) => e.to === friendEmail)!.text)![1];
    await acceptInviteToken(friend, token);

    const theirs = await createLetter(friend, { title: "From Grace", content: "We made it.", inVault: false });
    expect(await addContribution(friend, id, theirs.id)).toEqual({ contributions: 1 });
    await expect(addContribution(outsider, id, (await uploadMemory(outsider)).id)).rejects.toMatchObject({ status: 404 });
    // A contributor can't read the draft or anyone else's items.
    await expect(getDraftDetail(friend, id)).rejects.toMatchObject({ status: 404 });
    await expect(getMemoryUrls(friend, mine.id)).rejects.toMatchObject({ status: 404 });

    // The creator must be able to preview every item before sealing.
    const draft = await getDraftDetail(creator, id);
    expect(draft.memories.map((m) => m.id)).toEqual([mine.id, theirs.id]);
    expect((await getMemoryUrls(creator, theirs.id)).expiresInSec).toBe(300);

    await requestSeal(creator, id);
    await db.capsule.update({ where: { id }, data: { unlockAt: new Date(Date.now() - 1000) } });
    await performSeal(id);

    // Sealed: the contribution has left its author's hands too, and nothing more can be added.
    expect(await db.memory.count({ where: { id: { in: [mine.id, theirs.id] } } })).toBe(0);
    await expect(addContribution(friend, id, (await createLetter(friend, { content: "late", inVault: false })).id)).rejects.toMatchObject({ status: 403 });
    await expect(getContents(friend, id)).rejects.toMatchObject({ status: 403 });

    await releaseCapsule(id);
    const contents = await getContents(friend, id);
    expect(contents.items.map((i) => [i.mediaType, i.contributedBy])).toEqual([["IMAGE", null], ["LETTER", "Grace"]]);
    expect(contents.items[1].content).toBe("We made it.");
  });

  it("one memory can't be sealed into two capsules", async () => {
    const user = await makeUser();
    const photo = await uploadMemory(user);
    const a = await createDraft(user, { kind: "STANDARD", title: "A" });
    const b = await createDraft(user, { kind: "STANDARD", title: "B" });
    for (const d of [a, b]) await updateDraft(user, d.id, { memoryIds: [photo.id], schedule: { kind: "preset", preset: "1y", timezone: "UTC" } });
    await expect(requestSeal(user, a.id)).rejects.toMatchObject({ status: 409 });
  });
});
