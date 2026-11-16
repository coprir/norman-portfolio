import { Prisma, type Capsule } from "@prisma/client";
import { z } from "zod";
import { PRESETS, ScheduleError, computeUnlockAt, describeSchedule, formatInZone, isValidTimezone, type ScheduleInput } from "@/lib/time/release";
import { audit } from "../audit";
import type { SessionUser } from "../auth/session";
import { hashToken, newToken } from "../auth/tokens";
import { db } from "../db";
import { sendEmailSafe } from "../email/send";
import { capsuleContribution, capsuleInvite } from "../email/templates";
import { badRequest, conflict, forbidden, notFound } from "../errors";
import { assertCategory, deleteObjects, toMemoryDTO, type MemoryDTO } from "../memories";
import { notify } from "../notifications";
import { DOWNLOAD_URL_TTL, storage } from "../storage";
import { getCapsuleAccess, isReleased, matchRecipient } from "./access";
import { recordEvent } from "./events";

// ── Validation ─────────────────────────────────────────────────────────────

const tz = z.string().refine(isValidTimezone, "Unknown timezone.");
export const scheduleSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("preset"), preset: z.enum(Object.keys(PRESETS) as [keyof typeof PRESETS, ...(keyof typeof PRESETS)[]]), timezone: tz }),
  z.object({ kind: z.literal("custom"), local: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Use the format YYYY-MM-DDTHH:mm."), timezone: tz }),
  z.object({
    kind: z.literal("milestone"),
    milestone: z.enum(["birthday", "anniversary", "date"]),
    label: z.string().trim().max(80).optional(),
    baseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    years: z.number().int().min(0).max(150),
    time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    timezone: tz,
  }),
]);

export const THEMES = ["midnight", "aurora", "ember", "paper"] as const;

export const draftPatchSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  message: z.string().max(20_000).nullable().optional(),
  categoryId: z.string().nullable().optional(),
  coverMemoryId: z.string().nullable().optional(),
  theme: z.enum(THEMES).optional(),
  schedule: scheduleSchema.nullable().optional(),
  visibility: z.enum(["PRIVATE", "SHARED", "FAMILY"]).optional(),
  includeSelf: z.boolean().optional(),
  allowContributions: z.boolean().optional(),
  memoryIds: z.array(z.string()).max(500).optional(),
  recipients: z
    .array(
      z.object({
        email: z.email().transform((e) => e.toLowerCase().trim()),
        name: z.string().trim().max(80).optional(),
        permission: z.enum(["VIEW", "CONTRIBUTE"]).default("VIEW"),
      }),
    )
    .max(100)
    .optional(),
  answers: z.array(z.object({ promptKey: z.string().max(60), prompt: z.string().max(300), answer: z.string().max(5000) })).max(30).optional(),
});
export type DraftPatch = z.infer<typeof draftPatchSchema>;

// ── DTOs ───────────────────────────────────────────────────────────────────

const include = {
  recipients: true,
  creator: { select: { id: true, name: true, email: true } },
  _count: { select: { memories: true } },
} satisfies Prisma.CapsuleInclude;
type CapsuleRow = Prisma.CapsuleGetPayload<{ include: typeof include }>;

export type CapsuleDTO = {
  id: string;
  title: string;
  description: string | null;
  kind: Capsule["kind"];
  status: Capsule["status"];
  visibility: Capsule["visibility"];
  theme: string;
  categoryId: string | null;
  unlockAt: string | null;
  timezone: string;
  scheduleLabel: string | null;
  createdAt: string;
  sealedAt: string | null;
  releasedAt: string | null;
  openedAt: string | null;
  creator: { id: string; name: string };
  isCreator: boolean;
  isReleased: boolean;
  canViewContents: boolean;
  canContribute: boolean;
  includeSelf: boolean;
  allowContributions: boolean;
  /** How many items are inside. Only the creator, or anyone after release, is told. */
  itemCount: number | null;
  recipientCount: number;
  recipients: { id: string; email: string; name: string | null; permission: string; invitationStatus: string; isSelf: boolean }[] | null;
  myInvitation: { status: string; permission: string } | null;
  iHaveOpened: boolean;
  coverThumbUrl: string | null;
};

/** Signed URLs for capsule covers: the draft's chosen memory, or the sealed capsule's outside label. */
async function coverUrls(rows: { id: string; status: Capsule["status"]; coverMemoryId: string | null; coverKey: string | null }[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const sign = (key: string) => storage().signDownloadUrl(key, { ttlSec: DOWNLOAD_URL_TTL * 3, contentType: "image/webp" });
  const draftIds = rows.filter((r) => r.status === "DRAFT" && r.coverMemoryId).map((r) => r.coverMemoryId!);
  const covers = draftIds.length ? await db.memory.findMany({ where: { id: { in: draftIds }, thumbnailKey: { not: null } }, select: { id: true, thumbnailKey: true } }) : [];
  const byMemory = new Map(covers.map((c) => [c.id, c.thumbnailKey!]));
  for (const r of rows) {
    const key = r.status === "DRAFT" ? (r.coverMemoryId ? byMemory.get(r.coverMemoryId) : undefined) : r.coverKey;
    if (key) out.set(r.id, await sign(key));
  }
  return out;
}

function shape(user: SessionUser, c: CapsuleRow, covers: Map<string, string>): CapsuleDTO {
  const access = getCapsuleAccess(user, c);
  const others = c.recipients.filter((r) => r.userId !== c.creatorId && r.email !== c.creator.email);
  return {
    id: c.id,
    title: c.title,
    description: c.description,
    kind: c.kind,
    status: c.status,
    visibility: c.visibility,
    theme: c.theme,
    categoryId: c.categoryId,
    unlockAt: c.unlockAt?.toISOString() ?? null,
    timezone: c.timezone,
    scheduleLabel: c.schedule ? describeSchedule(c.schedule as ScheduleInput) : null,
    createdAt: c.createdAt.toISOString(),
    sealedAt: c.sealedAt?.toISOString() ?? null,
    releasedAt: c.releasedAt?.toISOString() ?? null,
    openedAt: c.openedAt?.toISOString() ?? null,
    creator: { id: c.creator.id, name: c.creator.name },
    isCreator: access.isCreator,
    isReleased: access.isReleased,
    canViewContents: access.canViewContents,
    canContribute: access.canContribute,
    includeSelf: c.includeSelf,
    allowContributions: c.allowContributions,
    itemCount: c.status === "DRAFT" ? (access.isCreator ? c._count.memories : null) : access.isCreator || access.canViewContents ? c.itemCount : null,
    recipientCount: others.length,
    recipients: access.isCreator
      ? c.recipients.map((r) => ({
          id: r.id,
          email: r.email,
          name: r.recipientName,
          permission: r.permission,
          invitationStatus: r.invitationStatus,
          isSelf: r.userId === c.creatorId,
        }))
      : null,
    myInvitation: !access.isCreator && access.recipient ? { status: access.recipient.invitationStatus, permission: access.recipient.permission } : null,
    iHaveOpened: Boolean(access.recipient?.openedAt) || (access.isCreator && !c.includeSelf && Boolean(c.openedAt)),
    coverThumbUrl: covers.get(c.id) ?? null,
  };
}

export async function toCapsuleDTOs(user: SessionUser, rows: CapsuleRow[]): Promise<CapsuleDTO[]> {
  const covers = await coverUrls(rows);
  return rows.map((c) => shape(user, c, covers));
}

// ── Reading ────────────────────────────────────────────────────────────────

/** Loads a capsule the user may know about; otherwise behaves as if it doesn't exist. */
export async function getCapsuleRow(user: SessionUser, id: string): Promise<CapsuleRow> {
  const c = await db.capsule.findUnique({ where: { id }, include });
  if (!c || !getCapsuleAccess(user, c).canSee) throw notFound("Capsule not found.");
  return c;
}

export async function getCapsule(user: SessionUser, id: string): Promise<CapsuleDTO> {
  const row = await getCapsuleRow(user, id);
  await claimRecipient(user, row);
  return (await toCapsuleDTOs(user, [row]))[0];
}

/** Binds an email-addressed invitation to the verified account that owns that email. */
async function claimRecipient(user: SessionUser, c: CapsuleRow) {
  const r = matchRecipient(user, c.recipients);
  if (r && r.userId == null && c.status !== "DRAFT") {
    await db.capsuleRecipient.update({ where: { id: r.id }, data: { userId: user.id } });
    r.userId = user.id;
  }
}

export async function listCapsules(user: SessionUser) {
  const [created, received] = await Promise.all([
    db.capsule.findMany({ where: { creatorId: user.id }, include, orderBy: [{ unlockAt: "asc" }, { createdAt: "desc" }] }),
    db.capsule.findMany({
      where: {
        creatorId: { not: user.id },
        status: { not: "DRAFT" },
        recipients: { some: { OR: [{ userId: user.id }, ...(user.emailVerified ? [{ userId: null, email: user.email }] : [])] } },
      },
      include,
      orderBy: { unlockAt: "asc" },
    }),
  ]);
  // Drafts the user has been invited to add memories to.
  const contributing = await db.capsule.findMany({
    where: { creatorId: { not: user.id }, status: "DRAFT", allowContributions: true, recipients: { some: { userId: user.id, permission: "CONTRIBUTE", invitedAt: { not: null }, invitationStatus: "ACCEPTED" } } },
    include,
    orderBy: { createdAt: "desc" },
  });
  const all = await toCapsuleDTOs(user, [...created, ...received, ...contributing]);
  return { created: all.slice(0, created.length), received: all.slice(created.length, created.length + received.length), contributing: all.slice(created.length + received.length) };
}

export type DraftDetail = {
  capsule: CapsuleDTO;
  message: string | null;
  schedule: ScheduleInput | null;
  coverMemoryId: string | null;
  memories: MemoryDTO[];
  answers: { promptKey: string; prompt: string; answer: string }[];
};

/** Everything the creator needs to keep editing a draft. */
export async function getDraftDetail(user: SessionUser, id: string): Promise<DraftDetail> {
  const c = await db.capsule.findFirst({
    where: { id, creatorId: user.id, status: "DRAFT" },
    include: { ...include, memories: { orderBy: { displayOrder: "asc" }, include: { memory: true } }, answers: { where: { phase: "THEN", userId: user.id } } },
  });
  if (!c) throw notFound("Draft not found.");
  return {
    capsule: (await toCapsuleDTOs(user, [c]))[0],
    message: c.message,
    schedule: (c.schedule as ScheduleInput | null) ?? null,
    coverMemoryId: c.coverMemoryId,
    memories: await Promise.all(c.memories.map((cm) => toMemoryDTO(cm.memory))),
    answers: c.answers.map((a) => ({ promptKey: a.promptKey, prompt: a.prompt, answer: a.answer })),
  };
}

export type ItemDTO = {
  id: string;
  mediaType: MemoryDTO["mediaType"];
  title: string | null;
  description: string | null;
  originalFilename: string | null;
  mimeType: string | null;
  fileSize: number;
  content: string | null;
  captureDate: string | null;
  width: number | null;
  height: number | null;
  thumbUrl: string | null;
  contributedBy: string | null;
};

export type ContentsDTO = {
  message: string | null;
  items: ItemDTO[];
  answers: { promptKey: string; prompt: string; then: string | null; now: string | null; thenAt: string | null; nowAt: string | null }[];
};

async function assertCanView(user: SessionUser, id: string) {
  const row = await getCapsuleRow(user, id);
  if (!getCapsuleAccess(user, row).canViewContents) {
    throw forbidden(isReleased(row.status) ? "You don't have access to this capsule." : "This capsule is sealed. It can't be opened before its date.");
  }
  return row;
}

/**
 * What is inside a capsule. Refuses unless the capsule has been released and
 * the caller is its creator or one of its recipients. Before release there is
 * nothing to return in any case: the contents exist only as ciphertext.
 */
export async function getContents(user: SessionUser, id: string): Promise<ContentsDTO> {
  const row = await assertCanView(user, id);
  const [items, answers] = await Promise.all([
    db.capsuleItem.findMany({ where: { capsuleId: id }, orderBy: { displayOrder: "asc" } }),
    db.capsuleAnswer.findMany({ where: { capsuleId: id, OR: [{ phase: "THEN" }, { phase: "NOW", userId: user.id }] }, orderBy: { createdAt: "asc" } }),
  ]);
  const prompts = new Map<string, ContentsDTO["answers"][number]>();
  for (const a of answers) {
    const cur = prompts.get(a.promptKey) ?? { promptKey: a.promptKey, prompt: a.prompt, then: null, now: null, thenAt: null, nowAt: null };
    if (a.phase === "THEN") Object.assign(cur, { then: a.answer, thenAt: a.createdAt.toISOString() });
    else Object.assign(cur, { now: a.answer, nowAt: a.createdAt.toISOString() });
    prompts.set(a.promptKey, cur);
  }
  const s = storage();
  return {
    message: row.message,
    items: await Promise.all(
      items.map(async (i) => {
        const meta = (i.metadata ?? {}) as { width?: number; height?: number };
        return {
          id: i.id,
          mediaType: i.mediaType,
          title: i.title,
          description: i.description,
          originalFilename: i.originalFilename,
          mimeType: i.mimeType,
          fileSize: Number(i.fileSize),
          content: i.content,
          captureDate: i.captureDate?.toISOString() ?? null,
          width: meta.width ?? null,
          height: meta.height ?? null,
          thumbUrl: i.thumbnailKey ? await s.signDownloadUrl(i.thumbnailKey, { ttlSec: DOWNLOAD_URL_TTL * 3, contentType: "image/webp" }) : null,
          contributedBy: i.contributorName,
        };
      }),
    ),
    answers: [...prompts.values()].filter((p) => p.then),
  };
}

/** A five-minute signed URL for one released item, issued only after the access check. */
export async function getItemUrl(user: SessionUser, capsuleId: string, itemId: string, opts: { download?: boolean } = {}) {
  await assertCanView(user, capsuleId);
  const item = await db.capsuleItem.findFirst({ where: { id: itemId, capsuleId } });
  if (!item?.storageKey) throw notFound("Item not found.");
  return {
    url: await storage().signDownloadUrl(item.storageKey, {
      ttlSec: DOWNLOAD_URL_TTL,
      contentType: item.mimeType ?? undefined,
      downloadName: opts.download ? (item.originalFilename ?? item.title ?? "memory") : undefined,
    }),
    expiresInSec: DOWNLOAD_URL_TTL,
  };
}

// ── Drafts ─────────────────────────────────────────────────────────────────

export async function createDraft(user: SessionUser, input: { kind: Capsule["kind"]; title?: string }) {
  const c = await db.capsule.create({
    data: {
      creatorId: user.id,
      kind: input.kind,
      title: input.title?.trim() || (input.kind === "FUTURE_SELF" ? "Dear future me" : "Untitled capsule"),
      timezone: user.timezone,
    },
  });
  await notify({
    userId: user.id,
    type: "CAPSULE_CREATED",
    capsuleId: c.id,
    title: "Capsule created",
    body: `“${c.title}” is saved as a draft. Lock it when you're ready.`,
    dedupeKey: `created:${c.id}`,
  });
  await recordEvent(db, c.id, "created", user.id, { kind: c.kind });
  await audit({ userId: user.id, action: "capsule.created", resourceId: c.id });
  return { id: c.id };
}

async function getOwnDraft(userId: string, id: string) {
  const c = await db.capsule.findFirst({ where: { id, creatorId: userId } });
  if (!c) throw notFound("Capsule not found.");
  if (c.status !== "DRAFT") throw conflict("This capsule is sealed and can no longer be changed.");
  return c;
}

export async function updateDraft(user: SessionUser, id: string, patch: DraftPatch): Promise<DraftDetail> {
  const c = await getOwnDraft(user.id, id);
  if (patch.categoryId) await assertCategory(user.id, patch.categoryId);

  let unlockAt: Date | null | undefined;
  if (patch.schedule === null) unlockAt = null;
  else if (patch.schedule) {
    try {
      unlockAt = computeUnlockAt(patch.schedule);
    } catch (err) {
      if (err instanceof ScheduleError) throw badRequest(err.message);
      throw err;
    }
  }

  if (patch.memoryIds) {
    const owned = await db.memory.count({
      where: { id: { in: patch.memoryIds }, status: "READY", OR: [{ userId: user.id }, { contributions: { some: { capsuleId: c.id } } }] },
    });
    if (owned !== new Set(patch.memoryIds).size) throw badRequest("One of the selected memories isn't available.");
  }
  const memoryIds = patch.memoryIds ? [...new Set(patch.memoryIds)] : undefined;
  if (patch.coverMemoryId) {
    const cover = await db.memory.findFirst({ where: { id: patch.coverMemoryId, userId: user.id, mediaType: { in: ["IMAGE", "VIDEO"] } } });
    if (!cover) throw badRequest("The cover must be one of your photographs or videos.");
  }

  await db.$transaction(async (tx) => {
    await tx.capsule.update({
      where: { id: c.id },
      data: {
        title: patch.title,
        description: patch.description,
        message: patch.message,
        categoryId: patch.categoryId,
        coverMemoryId: patch.coverMemoryId,
        theme: patch.theme,
        schedule: patch.schedule === undefined ? undefined : (patch.schedule ?? Prisma.JsonNull),
        unlockAt,
        timezone: patch.schedule?.timezone,
        visibility: patch.visibility,
        includeSelf: patch.includeSelf,
        allowContributions: patch.allowContributions,
      },
    });
    if (memoryIds) {
      await tx.capsuleMemory.deleteMany({ where: { capsuleId: c.id } });
      await tx.capsuleMemory.createMany({ data: memoryIds.map((memoryId, i) => ({ capsuleId: c.id, memoryId, displayOrder: i })) });
    }
    if (patch.recipients) {
      const unique = new Map(patch.recipients.filter((r) => r.email !== user.email).map((r) => [r.email, r]));
      // Keep existing rows (and any invitation already accepted); only add, update and remove the difference.
      await tx.capsuleRecipient.deleteMany({ where: { capsuleId: c.id, email: { notIn: [...unique.keys()] } } });
      for (const r of unique.values()) {
        await tx.capsuleRecipient.upsert({
          where: { capsuleId_email: { capsuleId: c.id, email: r.email } },
          update: { recipientName: r.name || null, permission: r.permission },
          create: { capsuleId: c.id, email: r.email, recipientName: r.name || null, permission: r.permission },
        });
      }
    }
    if (patch.answers) {
      await tx.capsuleAnswer.deleteMany({ where: { capsuleId: c.id, userId: user.id, phase: "THEN" } });
      const seen = new Set<string>();
      const rows = patch.answers.filter((a) => a.answer.trim() && !seen.has(a.promptKey) && seen.add(a.promptKey));
      await tx.capsuleAnswer.createMany({
        data: rows.map((a) => ({ capsuleId: c.id, userId: user.id, promptKey: a.promptKey, prompt: a.prompt, answer: a.answer.trim(), phase: "THEN" as const })),
      });
    }
  });
  return getDraftDetail(user, id);
}

/** Deletes capsule-only memories (never in a vault) that exist solely for this draft. */
async function deleteDraftOnlyMemories(capsuleId: string) {
  const sealed = await db.memory.findMany({
    where: { inVault: false, capsules: { some: { capsuleId }, every: { capsuleId } } },
    select: { id: true, storageKey: true, thumbnailKey: true },
  });
  await db.memory.deleteMany({ where: { id: { in: sealed.map((m) => m.id) } } });
  await deleteObjects(sealed.flatMap((m) => [m.storageKey, m.thumbnailKey]));
}

export async function deleteDraft(user: SessionUser, id: string) {
  const c = await getOwnDraft(user.id, id);
  await deleteDraftOnlyMemories(c.id);
  await db.capsule.delete({ where: { id: c.id } });
  await audit({ userId: user.id, action: "capsule.draft_deleted", resourceId: c.id });
}

// ── Gathering contributions (draft only) ───────────────────────────────────

/**
 * Invites the draft's CONTRIBUTE recipients to add their own memories before
 * it is sealed. After sealing nobody can add anything.
 */
export async function inviteContributors(user: SessionUser, id: string) {
  if (!user.emailVerified) throw forbidden("Confirm your email address before inviting others.");
  const c = await db.capsule.findFirst({ where: { id, creatorId: user.id }, include: { recipients: true } });
  if (!c) throw notFound("Capsule not found.");
  if (c.status !== "DRAFT") throw conflict("This capsule is sealed; nobody can add to it now.");
  if (!c.allowContributions) throw badRequest("Turn on contributions for this capsule first.");
  const pending = c.recipients.filter((r) => r.permission === "CONTRIBUTE" && !r.invitedAt && r.email !== user.email);
  const when = c.unlockAt ? formatInZone(c.unlockAt, c.timezone) : "a date still to be chosen";
  for (const r of pending) {
    const token = newToken();
    const account = await db.user.findFirst({ where: { email: r.email, emailVerifiedAt: { not: null } }, select: { id: true, name: true } });
    await db.capsuleRecipient.update({ where: { id: r.id }, data: { inviteTokenHash: hashToken(token), invitedAt: new Date(), userId: account?.id ?? null } });
    const content = capsuleInvite({ name: r.recipientName || account?.name || "there", creatorName: user.name, capsule: c, unlockLabel: when, canContribute: true, inviteToken: token });
    if (account) {
      await notify(
        { userId: account.id, type: "CAPSULE_INVITE", capsuleId: c.id, title: `${user.name} invited you to add to a capsule`, body: `Add your memories to “${c.title}” before it is sealed.`, dedupeKey: `contrib-invite:${r.id}` },
        () => content,
      );
    } else {
      await sendEmailSafe(r.email, content);
    }
  }
  await audit({ userId: user.id, action: "capsule.contributors_invited", resourceId: c.id, metadata: { count: pending.length } });
  return { invited: pending.length };
}

// ── After release ──────────────────────────────────────────────────────────

/** Records that the caller opened a released capsule and returns what's inside. */
export async function openCapsule(user: SessionUser, id: string, ip?: string): Promise<ContentsDTO> {
  const row = await getCapsuleRow(user, id);
  await claimRecipient(user, row);
  const contents = await getContents(user, id);
  const now = new Date();
  const first = await db.capsule.updateMany({ where: { id, status: "AVAILABLE" }, data: { status: "OPENED", openedAt: now } });
  const mine = matchRecipient(user, row.recipients);
  if (mine && !mine.openedAt) {
    await db.capsuleRecipient.update({
      where: { id: mine.id },
      data: { openedAt: now, userId: user.id, invitationStatus: "ACCEPTED", acceptedAt: mine.acceptedAt ?? now, inviteTokenHash: null },
    });
  }
  if (first.count === 1 || (mine && !mine.openedAt)) {
    await recordEvent(db, id, "opened", user.id, { first: first.count === 1 });
    await audit({ userId: user.id, action: "capsule.opened", resourceId: id, ip });
  }
  return contents;
}

export async function saveNowAnswers(user: SessionUser, id: string, answers: { promptKey: string; answer: string }[]) {
  const row = await getCapsuleRow(user, id);
  if (!getCapsuleAccess(user, row).canViewContents) throw forbidden("This capsule is sealed. It can't be opened before its date.");
  const then = await db.capsuleAnswer.findMany({ where: { capsuleId: id, phase: "THEN" } });
  const prompts = new Map(then.map((a) => [a.promptKey, a.prompt]));
  for (const a of answers) {
    const prompt = prompts.get(a.promptKey);
    if (!prompt) continue;
    const where = { capsuleId_userId_promptKey_phase: { capsuleId: id, userId: user.id, promptKey: a.promptKey, phase: "NOW" as const } };
    if (!a.answer.trim()) await db.capsuleAnswer.deleteMany({ where: { capsuleId: id, userId: user.id, promptKey: a.promptKey, phase: "NOW" } });
    else await db.capsuleAnswer.upsert({ where, update: { answer: a.answer.trim(), createdAt: new Date() }, create: { capsuleId: id, userId: user.id, promptKey: a.promptKey, prompt, answer: a.answer.trim(), phase: "NOW" } });
  }
  return getContents(user, id);
}

// ── Invitations and contributions ──────────────────────────────────────────

export async function respondToInvitation(user: SessionUser, capsuleId: string, action: "accept" | "decline") {
  const row = await getCapsuleRow(user, capsuleId);
  const r = matchRecipient(user, row.recipients);
  if (!r || row.creatorId === user.id) throw notFound("Invitation not found.");
  await db.capsuleRecipient.update({
    where: { id: r.id },
    data: {
      userId: user.id,
      invitationStatus: action === "accept" ? "ACCEPTED" : "DECLINED",
      acceptedAt: action === "accept" ? new Date() : null,
      inviteTokenHash: null,
    },
  });
  await recordEvent(db, capsuleId, action === "accept" ? "invitation_accepted" : "invitation_declined", user.id);
  await audit({ userId: user.id, action: `capsule.invite_${action}ed`, resourceId: capsuleId });
}

/** What an invitation link points at, shown before the visitor signs in. */
export async function peekInvite(token: string) {
  const r = await db.capsuleRecipient.findUnique({
    where: { inviteTokenHash: hashToken(token) },
    include: { capsule: { select: { id: true, title: true, status: true, unlockAt: true, timezone: true, creator: { select: { name: true } } } } },
  });
  if (!r) return null;
  return {
    draft: r.capsule.status === "DRAFT", capsuleId: r.capsule.id, title: r.capsule.title, creatorName: r.capsule.creator.name, unlockAt: r.capsule.unlockAt, timezone: r.capsule.timezone, released: isReleased(r.capsule.status), email: r.email, recipientName: r.recipientName };
}

/**
 * Accepts an invitation link. The link is a single-use bearer credential that
 * was sent to the recipient's inbox; accepting binds it to the signed-in
 * account and invalidates the token.
 */
export async function acceptInviteToken(user: SessionUser, token: string): Promise<{ capsuleId: string }> {
  const r = await db.capsuleRecipient.findUnique({ where: { inviteTokenHash: hashToken(token) }, include: { capsule: true } });
  if (!r) throw notFound("This invitation is no longer valid.");
  if (r.capsule.creatorId === user.id) return { capsuleId: r.capsuleId };
  const already = await db.capsuleRecipient.findFirst({ where: { capsuleId: r.capsuleId, userId: user.id, id: { not: r.id } } });
  if (already) return { capsuleId: r.capsuleId };
  const claimed = await db.capsuleRecipient.updateMany({
    where: { id: r.id, inviteTokenHash: hashToken(token), OR: [{ userId: null }, { userId: user.id }] },
    data: { userId: user.id, invitationStatus: "ACCEPTED", acceptedAt: new Date(), inviteTokenHash: null },
  });
  if (claimed.count !== 1) throw notFound("This invitation has already been used.");
  await recordEvent(db, r.capsuleId, "invitation_accepted", user.id, { via: "link" });
  await audit({ userId: user.id, action: "capsule.invite_accepted", resourceId: r.capsuleId, metadata: { via: "link" } });
  return { capsuleId: r.capsuleId };
}

/** Adds one of the caller's memories to a shared capsule that hasn't been sealed yet. */
export async function addContribution(user: SessionUser, capsuleId: string, memoryId: string) {
  const row = await getCapsuleRow(user, capsuleId);
  if (!getCapsuleAccess(user, row).canContribute) throw forbidden("This capsule isn't accepting contributions from you.");
  const memory = await db.memory.findFirst({ where: { id: memoryId, userId: user.id, status: "READY" } });
  if (!memory) throw notFound("Memory not found.");
  const last = await db.capsuleMemory.aggregate({ where: { capsuleId }, _max: { displayOrder: true } });
  try {
    await db.$transaction([
      db.capsuleMemory.create({ data: { capsuleId, memoryId, displayOrder: (last._max.displayOrder ?? -1) + 1 } }),
      db.capsuleContribution.create({ data: { capsuleId, memoryId, contributorId: user.id } }),
    ]);
  } catch {
    throw conflict("That memory is already in this capsule.");
  }
  await audit({ userId: user.id, action: "capsule.contribution_added", resourceId: capsuleId, metadata: { memoryId } });
  if (row.creatorId !== user.id) {
    await notify(
      {
        userId: row.creatorId,
        type: "CAPSULE_CONTRIBUTION",
        capsuleId,
        title: `${user.name} added to your capsule`,
        body: `A new memory is waiting in “${row.title}”. Preview it before you seal.`,
        dedupeKey: `contrib:${capsuleId}:${memoryId}`,
      },
      (u) => capsuleContribution(u.name, user.name, row),
    );
  }
  const mine = await db.capsuleContribution.count({ where: { capsuleId, contributorId: user.id } });
  return { contributions: mine };
}

export async function countMyContributions(userId: string, capsuleId: string) {
  return db.capsuleContribution.count({ where: { capsuleId, contributorId: userId } });
}
