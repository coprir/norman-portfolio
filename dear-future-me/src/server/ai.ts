import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { audit } from "./audit";
import type { SessionUser } from "./auth/session";
import { getCapsuleAccess } from "./capsules/access";
import { db } from "./db";
import { env } from "./env";
import { ApiError, forbidden, notFound, unavailable } from "./errors";
import { listMemories, toMemoryDTO, type MemoryQuery } from "./memories";
import { getUsage } from "./plans";
import { storage } from "./storage";

/**
 * Optional AI features. Nothing here is required for a capsule to work.
 *
 * Rules that every function in this file follows:
 *  - AI is off unless ANTHROPIC_API_KEY is configured AND the user has given
 *    explicit consent in Settings (and can withdraw it at any time).
 *  - Only the specific content needed for the request is sent, and only the
 *    user's own readable content. Sealed capsules cannot be sent: they are
 *    ciphertext that this tier has no key for.
 *  - Content is sent to Anthropic's API for processing only. Under
 *    Anthropic's commercial terms API inputs are not used to train models.
 */
const MODEL = "claude-opus-5-5";

let client: Anthropic | null = null;
export const aiConfigured = () => Boolean(env.anthropicKey);

function anthropic(): Anthropic {
  if (!env.anthropicKey) throw unavailable("AI features aren't enabled on this deployment.");
  client ??= new Anthropic({ apiKey: env.anthropicKey });
  return client;
}

async function gate(user: SessionUser, feature?: "aiDiscovery") {
  anthropic();
  if (!user.aiConsent) throw forbidden("Turn on AI features in Settings → Privacy to use this.");
  if (feature) {
    const { features, plan } = await getUsage(user.id);
    if (!features[feature]) throw new ApiError(402, "plan_limit", `AI memory discovery isn't included in the ${plan.name} plan.`);
  }
}

function rethrow(err: unknown): never {
  if (err instanceof ApiError) throw err;
  if (err instanceof Anthropic.RateLimitError) throw new ApiError(429, "rate_limited", "The AI service is busy. Please try again in a moment.");
  if (err instanceof Anthropic.APIError) throw unavailable("The AI service couldn't complete this request. Please try again.");
  throw err;
}

/** Free-text completion, with server-side refusal fallback enabled. */
async function complete(system: string, user: string, maxTokens = 4000): Promise<string> {
  try {
    const res = await anthropic().beta.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium" },
      system,
      messages: [{ role: "user", content: user }],
    });
    if (res.stop_reason === "refusal") throw new ApiError(422, "ai_declined", "The assistant couldn't help with this one.");
    return res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();
  } catch (err) {
    rethrow(err);
  }
}

// ── A. Memory discovery ────────────────────────────────────────────────────

const SearchPlan = z.object({
  keywords: z.array(z.string()).describe("Up to 4 distinctive words or short phrases likely to appear in titles, descriptions or tags. Empty if the request is only about type or date."),
  mediaType: z.enum(["IMAGE", "VIDEO", "AUDIO", "DOCUMENT", "LETTER", "ANY"]),
  category: z.string().nullable().describe("Exactly one of the provided category names, or null."),
  from: z.string().nullable().describe("ISO date (YYYY-MM-DD) lower bound, or null."),
  to: z.string().nullable().describe("ISO date (YYYY-MM-DD) upper bound, or null."),
});

/** Turns "videos from my trip to Greece" into filters, then runs an ordinary, owner-scoped query. */
export async function aiSearch(user: SessionUser, query: string) {
  await gate(user, "aiDiscovery");
  const categories = await db.category.findMany({ where: { OR: [{ userId: null }, { userId: user.id }] }, select: { id: true, name: true } });
  let plan: z.infer<typeof SearchPlan>;
  try {
    const res = await anthropic().messages.parse({
      model: MODEL,
      max_tokens: 2000,
      output_config: { effort: "low", format: zodOutputFormat(SearchPlan) },
      system: `You convert a person's request to find their own memories into search filters. Today is ${new Date().toISOString().slice(0, 10)}. Categories available: ${categories.map((c) => c.name).join(", ")}.`,
      messages: [{ role: "user", content: query }],
    });
    if (!res.parsed_output) throw unavailable("The AI service couldn't understand that search.");
    plan = res.parsed_output;
  } catch (err) {
    rethrow(err);
  }
  const base: MemoryQuery = {
    type: plan.mediaType === "ANY" ? undefined : plan.mediaType,
    categoryId: categories.find((c) => c.name.toLowerCase() === plan.category?.toLowerCase())?.id,
    from: plan.from ?? undefined,
    to: plan.to ?? undefined,
    take: 60,
  };
  // The model never sees or chooses memory ids: results come from the same owner-scoped query the vault uses.
  const seen = new Map<string, Awaited<ReturnType<typeof listMemories>>["items"][number]>();
  for (const q of plan.keywords.length ? plan.keywords.slice(0, 4) : [undefined]) {
    for (const m of (await listMemories(user.id, { ...base, q })).items) seen.set(m.id, m);
  }
  if (!seen.size && plan.keywords.length) for (const m of (await listMemories(user.id, base)).items) seen.set(m.id, m);
  await audit({ userId: user.id, action: "ai.search" });
  return { interpretation: plan, items: [...seen.values()] };
}

// ── B. Memory organisation ─────────────────────────────────────────────────

const Suggestion = z.object({
  title: z.string().describe("A short, natural title (max 8 words)."),
  category: z.string().nullable().describe("Exactly one of the provided category names, or null."),
  tags: z.array(z.string()).describe("3 to 6 lowercase tags."),
});

export async function aiSuggest(user: SessionUser, memoryId: string) {
  await gate(user);
  const m = await db.memory.findFirst({ where: { id: memoryId, userId: user.id, status: "READY" } });
  if (!m) throw notFound("Memory not found.");
  const categories = await db.category.findMany({ where: { OR: [{ userId: null }, { userId: user.id }] }, select: { id: true, name: true } });
  const content: Anthropic.ContentBlockParam[] = [];
  if (m.mediaType === "IMAGE" && m.thumbnailKey) {
    const thumb = await storage().getBuffer(m.thumbnailKey);
    content.push({ type: "image", source: { type: "base64", media_type: "image/webp", data: thumb.toString("base64") } });
  }
  content.push({
    type: "text",
    text: JSON.stringify({ filename: m.originalFilename, currentTitle: m.title, description: m.description, type: m.mediaType, capturedOn: m.captureDate?.toISOString().slice(0, 10), letter: m.content?.slice(0, 4000) }),
  });
  try {
    const res = await anthropic().messages.parse({
      model: MODEL,
      max_tokens: 2000,
      output_config: { effort: "low", format: zodOutputFormat(Suggestion) },
      system: `You help someone organise a personal memory archive. Suggest a title, one category and a few tags for this memory. Describe only what is evident; never guess who a person is. Categories available: ${categories.map((c) => c.name).join(", ")}.`,
      messages: [{ role: "user", content }],
    });
    if (!res.parsed_output) throw unavailable("The AI service couldn't suggest anything for this memory.");
    const s = res.parsed_output;
    await audit({ userId: user.id, action: "ai.suggest", resourceId: m.id });
    return {
      title: s.title.slice(0, 120),
      categoryId: categories.find((c) => c.name.toLowerCase() === s.category?.toLowerCase())?.id ?? null,
      tags: s.tags.map((t) => t.toLowerCase().trim()).filter(Boolean).slice(0, 6),
      memory: await toMemoryDTO(m),
    };
  } catch (err) {
    rethrow(err);
  }
}

// ── F. Capsule creation assistant ──────────────────────────────────────────

export async function aiLetterAssist(user: SessionUser, input: { draft: string; intent: "start" | "continue" | "polish"; recipient?: string; opensIn?: string }) {
  await gate(user);
  const system = [
    "You help someone write a letter that will be sealed in a time capsule and read in the future.",
    "Write in their voice, not yours: plain, warm, specific, first person. No clichés about time, no grand statements, no advice.",
    input.intent === "start"
      ? "They have a blank page. Offer three short, different opening paragraphs they could continue from, separated by a line containing only ---. Each should end mid-thought, inviting them to go on."
      : input.intent === "continue"
        ? "Suggest the next paragraph only, continuing naturally from where their draft stops. Then, on a new line, one question that might help them keep writing."
        : "Lightly edit their draft for clarity and flow. Keep every fact, name and feeling; keep their phrasing wherever it already works. Return only the edited letter.",
  ].join(" ");
  const text = await complete(system, JSON.stringify({ recipient: input.recipient ?? "my future self", opensIn: input.opensIn ?? "some years", draft: input.draft }), 3000);
  await audit({ userId: user.id, action: "ai.letter_assist" });
  return { text };
}

// ── D. Future-self reflection ──────────────────────────────────────────────

export async function aiReflect(user: SessionUser, capsuleId: string) {
  await gate(user);
  const c = await db.capsule.findUnique({ where: { id: capsuleId }, include: { recipients: true } });
  if (!c || !getCapsuleAccess(user, c).canViewContents) throw notFound("Capsule not found.");
  const answers = await db.capsuleAnswer.findMany({ where: { capsuleId, OR: [{ phase: "THEN" }, { phase: "NOW", userId: user.id }] } });
  const pairs = new Map<string, { prompt: string; then?: string; now?: string }>();
  for (const a of answers) pairs.set(a.promptKey, { ...(pairs.get(a.promptKey) ?? { prompt: a.prompt }), [a.phase === "THEN" ? "then" : "now"]: a.answer });
  const both = [...pairs.values()].filter((p) => p.then && p.now);
  if (!both.length) throw new ApiError(400, "bad_request", "Answer at least one question again first, so there's something to compare.");
  const text = await complete(
    "Someone answered the same questions twice, years apart: once when sealing a time capsule and again on opening it. Reflect back, in the second person, what changed and what held steady. Be specific and quote their own words briefly. Three short paragraphs at most. Do not judge, diagnose or give advice.",
    JSON.stringify({ sealedOn: c.sealedAt?.toISOString().slice(0, 10), openedOn: new Date().toISOString().slice(0, 10), answers: both }),
    3000,
  );
  await audit({ userId: user.id, action: "ai.reflect", resourceId: capsuleId });
  return { text };
}

// ── C / E. Year summaries ──────────────────────────────────────────────────

export async function aiYearSummary(user: SessionUser, year: number) {
  await gate(user, "aiDiscovery");
  const memories = await db.memory.findMany({
    where: { userId: user.id, inVault: true, status: "READY", captureDate: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } },
    orderBy: { captureDate: "asc" },
    take: 400,
    include: { category: { select: { name: true } } },
  });
  if (!memories.length) throw new ApiError(400, "bad_request", `There are no memories from ${year} in your vault yet.`);
  const text = await complete(
    "Write a short, warm recap of a year in someone's life, in the second person, based only on the titles, notes and dates of the memories they saved. Follow the year in order. Mention specifics; never invent events, people or feelings that aren't in the data. 150–250 words, plain paragraphs.",
    JSON.stringify({
      year,
      memories: memories.map((m) => ({ date: m.captureDate?.toISOString().slice(0, 10), type: m.mediaType, title: m.title, note: m.description, category: m.category?.name, tags: m.tags, letter: m.mediaType === "LETTER" ? m.content?.slice(0, 1500) : undefined })),
    }),
    3000,
  );
  await audit({ userId: user.id, action: "ai.year_summary", metadata: { year, memories: memories.length } });
  return { year, count: memories.length, text };
}
