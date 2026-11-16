"use client";

import { clsx } from "clsx";
import { ArrowLeft, ArrowRight, Camera, Check, ImagePlus, Lock, Mail, Mic, PenLine, Trash2, Upload, UserPlus, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CapsuleVisual } from "@/components/capsule/capsule";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { SelectField, TextArea, TextField, inputClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { LetterDialog } from "@/components/vault/letter-dialog";
import { MediaView } from "@/components/vault/media-view";
import { MemoryCard } from "@/components/vault/memory-card";
import { Recorder } from "@/components/vault/recorder";
import { Uploader } from "@/components/vault/uploader";
import { api, errorMessage } from "@/lib/client/api";
import { SEALING_DECLARATION } from "@/lib/declaration";
import { formatDate } from "@/lib/format";
import { FUTURE_SELF_PROMPTS } from "@/lib/prompts";
import { PRESETS, type PresetKey, type ScheduleInput } from "@/lib/time/release";
import type { CapsuleDTO, DraftDetail } from "@/server/capsules/service";
import type { MemoryDTO } from "@/server/memories";

type Recipient = { email: string; name: string; permission: "VIEW" | "CONTRIBUTE" };
type Category = { id: string; name: string };
type Props = { draft: DraftDetail; categories: Category[]; user: { name: string; email: string; timezone: string; dateOfBirth: string | null; emailVerified: boolean }; ai: boolean };

const STEPS = ["Memories", "Details", "Recipients", "Date", "Preview", "Seal"] as const;
const THEMES = [
  { id: "midnight", name: "Midnight", swatch: "from-[#1a2140] to-[#080a12]" },
  { id: "aurora", name: "Aurora", swatch: "from-[#1d3a4f] to-[#1a1438]" },
  { id: "ember", name: "Ember", swatch: "from-[#4a2a2a] to-[#1a1016]" },
  { id: "paper", name: "Paper", swatch: "from-[#f3efe6] to-[#d9d2c3]" },
] as const;

export function CapsuleWizard({ draft, categories, user, ai }: Props) {
  const router = useRouter();
  const toast = useToast();
  const c = draft.capsule;
  const futureSelf = c.kind === "FUTURE_SELF";

  const [step, setStep] = useState(0);
  const [memories, setMemories] = useState<MemoryDTO[]>(draft.memories);
  const [message, setMessage] = useState(draft.message ?? "");
  const [answers, setAnswers] = useState<Record<string, string>>(Object.fromEntries(draft.answers.map((a) => [a.promptKey, a.answer])));
  const [details, setDetails] = useState({ title: c.title, description: c.description ?? "", categoryId: c.categoryId ?? "", theme: c.theme });
  const [coverId, setCoverId] = useState<string | null>(draft.coverMemoryId);
  const [includeSelf, setIncludeSelf] = useState(c.includeSelf);
  const [recipients, setRecipients] = useState<Recipient[]>((c.recipients ?? []).filter((r) => !r.isSelf).map((r) => ({ email: r.email, name: r.name ?? "", permission: r.permission as Recipient["permission"] })));
  const [allowContributions, setAllowContributions] = useState(c.allowContributions);
  const [visibility, setVisibility] = useState<CapsuleDTO["visibility"]>(c.visibility);
  const [schedule, setSchedule] = useState<ScheduleInput | null>(draft.schedule);
  const [resolved, setResolved] = useState<{ unlockAt: string; display: string; label: string } | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [panel, setPanel] = useState<"vault" | "upload" | "letter" | "video" | "audio" | null>(null);
  const [viewing, setViewing] = useState<MemoryDTO | null>(null);
  const [agreed, setAgreed] = useState<boolean[]>(SEALING_DECLARATION.map(() => false));
  const [sealing, setSealing] = useState<"idle" | "sealing" | "done">("idle");

  const add = useCallback((m: MemoryDTO) => setMemories((cur) => (cur.some((x) => x.id === m.id) ? cur : [...cur, m])), []);
  const covers = memories.filter((m) => m.thumbUrl && (m.mediaType === "IMAGE" || m.mediaType === "VIDEO"));

  // Ask the server what the chosen schedule resolves to. The browser never decides the unlock time.
  useEffect(() => {
    if (!schedule) return setResolved(null);
    let cancelled = false;
    const t = setTimeout(() => {
      api<{ unlockAt: string; display: string; label: string }>("/schedule/preview", { body: schedule })
        .then((r) => !cancelled && (setResolved(r), setScheduleError(null)))
        .catch((err) => !cancelled && (setResolved(null), setScheduleError(errorMessage(err))));
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [schedule]);

  const payload = useMemo(
    () => ({
      title: details.title.trim() || (futureSelf ? "Dear future me" : "Untitled capsule"),
      description: details.description.trim() || null,
      categoryId: details.categoryId || null,
      theme: details.theme,
      message: message.trim() ? message : null,
      memoryIds: memories.map((m) => m.id),
      coverMemoryId: coverId && memories.some((m) => m.id === coverId) ? coverId : null,
      includeSelf,
      allowContributions,
      visibility: recipients.length ? (visibility === "PRIVATE" ? "SHARED" : visibility) : "PRIVATE",
      recipients: recipients.map((r) => ({ email: r.email, name: r.name || undefined, permission: allowContributions ? r.permission : "VIEW" })),
      ...(schedule && !scheduleError ? { schedule } : {}),
      answers: FUTURE_SELF_PROMPTS.filter((p) => answers[p.key]?.trim()).map((p) => ({ promptKey: p.key, prompt: p.prompt, answer: answers[p.key] })),
    }),
    [details, message, memories, coverId, includeSelf, allowContributions, visibility, recipients, schedule, scheduleError, answers, futureSelf],
  );

  const save = useCallback(async () => {
    setSaving(true);
    try {
      await api(`/capsules/${c.id}`, { method: "PATCH", body: payload });
      return true;
    } catch (err) {
      toast(errorMessage(err), "error");
      return false;
    } finally {
      setSaving(false);
    }
  }, [c.id, payload, toast]);

  const hasContent = memories.length > 0 || message.trim().length > 0 || Object.values(answers).some((a) => a.trim());
  const problems = [
    !hasContent && "Add at least one memory or a message.",
    !details.title.trim() && "Give your capsule a title.",
    !includeSelf && recipients.length === 0 && "Choose who will receive this capsule.",
    (!schedule || !resolved) && "Choose when it should open.",
    !user.emailVerified && "Confirm your email address (see the banner above) before sealing.",
  ].filter(Boolean) as string[];

  async function go(to: number) {
    if (to > step && !(await save())) return;
    setStep(Math.max(0, Math.min(STEPS.length - 1, to)));
    window.scrollTo({ top: 0 });
  }

  // After sealing is requested, watch the server until the worker has locked it (or rolled it back).
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => { if (poll.current) clearInterval(poll.current); }, []);

  async function seal() {
    if (!(await save())) return;
    setSealing("sealing");
    try {
      await api(`/capsules/${c.id}/seal`, { body: { declaration: true } });
    } catch (err) {
      toast(errorMessage(err), "error");
      setSealing("idle");
      return;
    }
    const started = Date.now();
    poll.current = setInterval(async () => {
      try {
        const cur = await api<CapsuleDTO>(`/capsules/${c.id}`);
        if (cur.status === "LOCKED" || cur.isReleased) {
          clearInterval(poll.current!);
          setSealing("done");
          setTimeout(() => router.replace(`/app/capsules/${c.id}?sealed=1`), 2600);
        } else if (cur.status === "DRAFT") {
          clearInterval(poll.current!);
          setSealing("idle");
          toast("Sealing didn't complete, and nothing was changed. Please try again.", "error");
        } else if (Date.now() - started > 10 * 60_000) {
          clearInterval(poll.current!);
          router.replace(`/app/capsules/${c.id}`);
        }
      } catch {
        /* keep waiting */
      }
    }, 1500);
  }

  if (sealing !== "idle") {
    return (
      <div className="fixed inset-0 z-[60] grid place-items-center bg-ink px-6 text-center" role="status" aria-live="polite">
        <div className="starfield absolute inset-0 opacity-60" />
        <div className="relative flex max-w-md flex-col items-center">
          <CapsuleVisual className="size-64 sm:size-80" />
          <p className="eyebrow mt-2">{sealing === "done" ? "Sealed" : "Sealing"}</p>
          <h1 className="display mt-3 text-4xl sm:text-5xl">{sealing === "done" ? "It's out of your hands now." : "Encrypting your memories…"}</h1>
          <p className="mt-4 text-silver">{sealing === "done" ? `See you on ${resolved ? formatDate(resolved.unlockAt) : "the day"}.` : "Please keep this page open. Large videos can take a few minutes."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-7 sm:px-8 sm:py-10">
      <div className="flex items-center justify-between gap-4">
        <Link href="/app/capsules" className="flex items-center gap-1.5 text-sm text-silver hover:text-paper"><ArrowLeft className="size-4" /> Capsules</Link>
        <span className="text-xs text-mute" aria-live="polite">{saving ? "Saving…" : "Draft — saved as you go"}</span>
      </div>

      <ol className="mt-6 flex gap-1.5" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s} className="flex-1">
            <button type="button" onClick={() => go(i)} aria-current={i === step ? "step" : undefined} className="group block w-full text-left">
              <span className={clsx("block h-0.5 rounded-full transition-colors", i <= step ? "bg-paper" : "bg-white/12 group-hover:bg-white/25")} />
              <span className={clsx("mt-2 hidden text-xs sm:block", i === step ? "text-paper" : "text-mute")}>{s}</span>
            </button>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-mute sm:hidden">Step {step + 1} of {STEPS.length} · {STEPS[step]}</p>

      <div className="mt-9">
        {/* 1 — Memories */}
        {step === 0 && (
          <section aria-labelledby="s0">
            <h1 id="s0" className="display text-4xl sm:text-5xl">{futureSelf ? "What do you want to tell yourself?" : "What goes inside?"}</h1>
            <p className="mt-3 text-silver">{futureSelf ? "Answer as many questions as you like, in your own words. You'll answer them again when this opens." : "Choose from your vault, or make something new just for this capsule."}</p>

            {futureSelf && (
              <div className="mt-8 space-y-6">
                {FUTURE_SELF_PROMPTS.map((p) => (
                  <label key={p.key} className="block">
                    <span className="font-serif text-2xl leading-snug">{p.prompt}</span>
                    <textarea value={answers[p.key] ?? ""} onChange={(e) => setAnswers((a) => ({ ...a, [p.key]: e.target.value }))} maxLength={5000} rows={3} className={`${inputClass} mt-3 resize-y py-3 leading-relaxed`} />
                  </label>
                ))}
              </div>
            )}

            <div className={clsx("grid grid-cols-2 gap-2.5 sm:grid-cols-5", futureSelf ? "mt-10" : "mt-8")}>
              {([["vault", ImagePlus, "From vault"], ["upload", Upload, "Upload"], ["video", Camera, "Record video"], ["audio", Mic, "Record voice"], ["letter", PenLine, "Write a letter"]] as const).map(([key, Icon, label]) => (
                <button key={key} type="button" onClick={() => setPanel(key)} className="flex flex-col items-start gap-3 rounded-2xl border border-line bg-white/[0.02] p-4 text-left text-sm transition-colors hover:border-line-strong hover:bg-white/[0.05]">
                  <Icon className="size-5 text-silver" aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>

            {memories.length > 0 && (
              <div className="mt-7">
                <p className="text-sm text-silver">{memories.length} {memories.length === 1 ? "item" : "items"} in this capsule</p>
                <ul className="mt-3 grid grid-cols-3 gap-2.5 sm:grid-cols-4">
                  {memories.map((m) => (
                    <li key={m.id} className="relative">
                      <MemoryCard memory={m} onClick={() => setViewing(m)} />
                      <button type="button" aria-label={`Remove ${m.title ?? "item"}`} onClick={() => setMemories((cur) => cur.filter((x) => x.id !== m.id))} className="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-full bg-ink/80 text-paper backdrop-blur hover:bg-ink">
                        <X className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-8">
              <TextArea label={futureSelf ? "Anything else you want to say" : "A personal message (shown first when the capsule opens)"} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={20000} rows={5} placeholder="By the time you read this…" className="font-serif text-lg" />
            </div>
          </section>
        )}

        {/* 2 — Details */}
        {step === 1 && (
          <section aria-labelledby="s1" className="space-y-6">
            <div>
              <h1 id="s1" className="display text-4xl sm:text-5xl">Label the capsule.</h1>
              <p className="mt-3 text-silver">The title and cover are the outside of the capsule. They stay visible while it's sealed — to you and to anyone receiving it — so choose something that won't give the inside away.</p>
            </div>
            <TextField label="Title" value={details.title} onChange={(e) => setDetails((d) => ({ ...d, title: e.target.value }))} maxLength={120} required />
            <TextArea label="Description (optional, visible while sealed)" value={details.description} onChange={(e) => setDetails((d) => ({ ...d, description: e.target.value }))} maxLength={500} rows={2} />
            <SelectField label="Category" value={details.categoryId} onChange={(e) => setDetails((d) => ({ ...d, categoryId: e.target.value }))}>
              <option value="">None</option>
              {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
            </SelectField>
            <fieldset>
              <legend className="text-[0.82rem] font-medium text-silver">Cover photograph</legend>
              {covers.length ? (
                <div className="mt-2 grid grid-cols-4 gap-2.5 sm:grid-cols-6">
                  <button type="button" aria-pressed={!coverId} onClick={() => setCoverId(null)} className={clsx("aspect-square rounded-2xl border text-xs text-silver", !coverId ? "border-blue ring-2 ring-blue/50" : "border-line hover:border-line-strong")}>No cover</button>
                  {covers.map((m) => <MemoryCard key={m.id} memory={m} selectable selected={coverId === m.id} onClick={() => setCoverId(m.id)} />)}
                </div>
              ) : (
                <p className="mt-2 text-sm text-mute">Add a photograph or video on the first step to choose a cover.</p>
              )}
              {coverId && <p className="mt-2 text-xs text-mute">A small copy of this image will stay visible on the outside of the sealed capsule.</p>}
            </fieldset>
            <fieldset>
              <legend className="text-[0.82rem] font-medium text-silver">Background when it opens</legend>
              <div className="mt-2 grid grid-cols-4 gap-2.5">
                {THEMES.map((t) => (
                  <button key={t.id} type="button" aria-pressed={details.theme === t.id} onClick={() => setDetails((d) => ({ ...d, theme: t.id }))} className={clsx("overflow-hidden rounded-2xl border text-left", details.theme === t.id ? "border-blue ring-2 ring-blue/50" : "border-line hover:border-line-strong")}>
                    <span className={`block h-14 bg-gradient-to-br ${t.swatch}`} />
                    <span className="block px-3 py-2 text-xs">{t.name}</span>
                  </button>
                ))}
              </div>
            </fieldset>
          </section>
        )}

        {/* 3 — Recipients */}
        {step === 2 && (
          <RecipientsStep
            capsuleId={c.id}
            user={user}
            includeSelf={includeSelf}
            setIncludeSelf={setIncludeSelf}
            recipients={recipients}
            setRecipients={setRecipients}
            allowContributions={allowContributions}
            setAllowContributions={setAllowContributions}
            visibility={visibility}
            setVisibility={setVisibility}
            save={save}
          />
        )}

        {/* 4 — Date */}
        {step === 3 && <DateStep schedule={schedule} setSchedule={setSchedule} resolved={resolved} error={scheduleError} user={user} />}

        {/* 5 — Preview */}
        {step === 4 && (
          <section aria-labelledby="s4">
            <h1 id="s4" className="display text-4xl sm:text-5xl">Look at everything once more.</h1>
            <p className="mt-3 text-silver">This is the last time you'll see what's inside until it opens. Tap any item to view it in full.</p>
            <div className="mt-8 overflow-hidden rounded-3xl border border-line">
              <div className="flex gap-5 border-b border-line p-5 sm:p-6">
                <div className="size-20 shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-[#1a2140] to-ink sm:size-24">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {coverId && covers.find((m) => m.id === coverId)?.thumbUrl && <img src={covers.find((m) => m.id === coverId)!.thumbUrl!} alt="" className="size-full object-cover" />}
                </div>
                <div className="min-w-0">
                  <h2 className="font-serif text-3xl leading-tight">{details.title || "Untitled capsule"}</h2>
                  {details.description && <p className="mt-1 text-sm text-silver">{details.description}</p>}
                </div>
              </div>
              <dl className="grid gap-x-8 gap-y-5 p-5 sm:grid-cols-2 sm:p-6">
                <Row term="Opens">{resolved ? resolved.display : <span className="text-danger">Not chosen yet</span>}</Row>
                <Row term="For">{[includeSelf && "You", ...recipients.map((r) => r.name || r.email)].filter(Boolean).join(", ") || <span className="text-danger">Nobody yet</span>}</Row>
                <Row term="Privacy">{recipients.length === 0 ? "Private — only you" : visibility === "FAMILY" ? "Family capsule" : "Shared with the people above"}</Row>
                <Row term="Inside">{memories.length} {memories.length === 1 ? "item" : "items"}{message.trim() ? " and a message" : ""}{payload.answers.length ? ` · ${payload.answers.length} answers` : ""}</Row>
              </dl>
            </div>
            {message.trim() && (
              <div className="mt-5 rounded-3xl bg-[#f3efe6] px-7 py-8 font-serif text-[1.15rem] leading-relaxed text-[#26231e]">
                <p className="mb-3 font-sans text-xs uppercase tracking-[0.16em] text-[#8a8275]">Your message</p>
                <p className="whitespace-pre-wrap">{message}</p>
              </div>
            )}
            {payload.answers.length > 0 && (
              <div className="mt-5 space-y-5 rounded-3xl border border-line p-6">
                {payload.answers.map((a) => (
                  <div key={a.promptKey}>
                    <p className="font-serif text-xl italic text-silver">{a.prompt}</p>
                    <p className="mt-1.5 whitespace-pre-wrap leading-relaxed">{a.answer}</p>
                  </div>
                ))}
              </div>
            )}
            {memories.length > 0 && (
              <ul className="mt-5 grid grid-cols-3 gap-2.5 sm:grid-cols-4">
                {memories.map((m) => <li key={m.id}><MemoryCard memory={m} onClick={() => setViewing(m)} /></li>)}
              </ul>
            )}
          </section>
        )}

        {/* 6 — Seal */}
        {step === 5 && (
          <section aria-labelledby="s5">
            <Lock className="size-7 text-silver" aria-hidden="true" />
            <h1 id="s5" className="display mt-4 text-4xl sm:text-5xl">Seal this capsule?</h1>
            <p className="mt-3 text-lg text-silver">
              “{details.title}” will open on <span className="text-paper">{resolved?.display ?? "—"}</span>. Sealing is permanent.
            </p>
            {problems.length > 0 ? (
              <div className="mt-8 rounded-2xl border border-danger/40 bg-danger/10 p-5" role="alert">
                <p className="font-medium text-[#ffd0d0]">Before you can seal it:</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[#ffd0d0]">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
              </div>
            ) : (
              <fieldset className="mt-8 space-y-3">
                <legend className="text-sm text-silver">Please confirm each of these.</legend>
                {SEALING_DECLARATION.map((line, i) => (
                  <label key={i} className={clsx("flex cursor-pointer gap-4 rounded-2xl border p-5 transition-colors", agreed[i] ? "border-paper/50 bg-white/[0.05]" : "border-line hover:border-line-strong")}>
                    <input type="checkbox" checked={agreed[i]} onChange={(e) => setAgreed((a) => a.map((v, j) => (j === i ? e.target.checked : v)))} className="peer sr-only" />
                    <span className={clsx("mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border peer-focus-visible:ring-2 peer-focus-visible:ring-blue", agreed[i] ? "border-paper bg-paper text-ink" : "border-line-strong")}>
                      {agreed[i] && <Check className="size-3.5" strokeWidth={3} />}
                    </span>
                    <span className="leading-relaxed">{line}</span>
                  </label>
                ))}
              </fieldset>
            )}
            <p className="mt-6 text-xs leading-relaxed text-mute">Sealing encrypts everything in this capsule with a key of its own and removes the originals from your vault. <Link href="/legal/sealing" target="_blank" className="underline hover:text-silver">How sealing works</Link></p>
          </section>
        )}
      </div>

      <div className="sticky bottom-16 z-30 -mx-5 mt-10 flex items-center justify-between gap-3 border-t border-line bg-ink/92 px-5 py-4 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 md:bottom-0">
        <Button variant="ghost" onClick={() => go(step - 1)} disabled={step === 0}><ArrowLeft className="size-4" /> Back</Button>
        {step < STEPS.length - 1 ? (
          <Button onClick={() => go(step + 1)} loading={saving}>{step === 4 ? "Continue to sealing" : "Continue"} <ArrowRight className="size-4" /></Button>
        ) : (
          <Button onClick={seal} disabled={problems.length > 0 || agreed.some((a) => !a)} loading={saving}><Lock className="size-4" /> Seal capsule</Button>
        )}
      </div>

      <VaultPicker open={panel === "vault"} onClose={() => setPanel(null)} selected={memories} onDone={(picked) => setMemories((cur) => [...cur.filter((m) => !m.inVault || picked.some((p) => p.id === m.id)), ...picked.filter((p) => !cur.some((m) => m.id === p.id))])} />
      <Dialog open={panel === "upload"} onClose={() => setPanel(null)} title="Upload for this capsule">
        <Uploader onUploaded={add} inVault={false} />
        <p className="mt-4 text-xs leading-relaxed text-mute">Files added here go straight into this capsule and won't appear in your vault.</p>
      </Dialog>
      <LetterDialog open={panel === "letter"} onClose={() => setPanel(null)} onSaved={add} inVault={false} ai={ai} />
      {(panel === "video" || panel === "audio") && <Recorder kind={panel} open onClose={() => setPanel(null)} onSaved={add} inVault={false} />}
      <Dialog open={Boolean(viewing)} onClose={() => setViewing(null)} title={viewing?.title ?? "Preview"} wide>
        {viewing && <MediaView item={viewing} urlPath={`/memories/${viewing.id}/url`} />}
      </Dialog>
    </div>
  );
}

function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-[0.14em] text-mute">{term}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}

function VaultPicker({ open, onClose, selected, onDone }: { open: boolean; onClose: () => void; selected: MemoryDTO[]; onDone: (picked: MemoryDTO[]) => void }) {
  const [items, setItems] = useState<MemoryDTO[]>([]);
  const [picked, setPicked] = useState<Map<string, MemoryDTO>>(new Map());
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (p: number, query: string) => {
    setLoading(true);
    try {
      const res = await api<{ items: MemoryDTO[]; hasMore: boolean }>(`/memories?${new URLSearchParams({ q: query, page: String(p) })}`);
      setItems((cur) => (p === 0 ? res.items : [...cur, ...res.items]));
      setHasMore(res.hasMore);
      setPage(p);
    } catch {
      /* the grid simply stays as it was */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    setPicked(new Map(selected.filter((m) => m.inVault).map((m) => [m.id, m])));
    setQ("");
    void load(0, "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => load(0, q), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <Dialog open={open} onClose={onClose} title="Choose from your vault" wide footer={<><span className="mr-auto text-sm text-silver">{picked.size} selected</span><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={() => { onDone([...picked.values()]); onClose(); }}>Add to capsule</Button></>}>
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your vault" aria-label="Search your vault" className={`${inputClass} h-11`} />
      {items.length === 0 && !loading ? (
        <p className="py-14 text-center text-silver">{q ? "Nothing matches that." : "Your vault is empty. Upload something, or record a message instead."}</p>
      ) : (
        <div className="mt-4 grid grid-cols-3 gap-2.5 sm:grid-cols-5">
          {items.map((m) => (
            <MemoryCard key={m.id} memory={m} selectable selected={picked.has(m.id)} onClick={() => setPicked((cur) => { const n = new Map(cur); if (n.has(m.id)) n.delete(m.id); else n.set(m.id, m); return n; })} />
          ))}
        </div>
      )}
      {hasMore && <div className="mt-4 flex justify-center"><Button variant="secondary" size="sm" loading={loading} onClick={() => load(page + 1, q)}>Show more</Button></div>}
      <p className="mt-5 text-xs leading-relaxed text-mute">Memories you seal are moved out of your vault and can't be seen again until the capsule opens.</p>
    </Dialog>
  );
}

function RecipientsStep(p: {
  capsuleId: string;
  user: Props["user"];
  includeSelf: boolean;
  setIncludeSelf: (v: boolean) => void;
  recipients: Recipient[];
  setRecipients: React.Dispatch<React.SetStateAction<Recipient[]>>;
  allowContributions: boolean;
  setAllowContributions: (v: boolean) => void;
  visibility: CapsuleDTO["visibility"];
  setVisibility: (v: CapsuleDTO["visibility"]) => void;
  save: () => Promise<boolean>;
}) {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);

  function addRecipient() {
    const e = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return setError("Enter a valid email address.");
    if (e === p.user.email) return setError("That's you — use the “Myself” option above.");
    if (p.recipients.some((r) => r.email === e)) return setError("They're already on the list.");
    p.setRecipients((cur) => [...cur, { email: e, name: name.trim(), permission: "VIEW" }]);
    setEmail("");
    setName("");
    setError(null);
  }

  return (
    <section aria-labelledby="s2" className="space-y-7">
      <div>
        <h1 id="s2" className="display text-4xl sm:text-5xl">Who is it for?</h1>
        <p className="mt-3 text-silver">The list is fixed when you seal. Nobody can be added or removed afterwards.</p>
      </div>

      <label className={clsx("flex cursor-pointer items-center gap-4 rounded-2xl border p-5", p.includeSelf ? "border-paper/50 bg-white/[0.05]" : "border-line")}>
        <input type="checkbox" checked={p.includeSelf} onChange={(e) => p.setIncludeSelf(e.target.checked)} className="size-5 accent-[#648BFF]" />
        <span>
          <span className="block font-medium">Myself</span>
          <span className="block text-sm text-mute">{p.user.email}</span>
        </span>
      </label>

      <div>
        <h2 className="text-[0.82rem] font-medium text-silver">Other people</h2>
        {p.recipients.length > 0 && (
          <ul className="mt-2 divide-y divide-line rounded-2xl border border-line">
            {p.recipients.map((r) => (
              <li key={r.email} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Mail className="size-4 text-mute" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{r.name || r.email}</span>
                  {r.name && <span className="block truncate text-xs text-mute">{r.email}</span>}
                </span>
                {p.allowContributions && (
                  <select aria-label={`Permission for ${r.email}`} value={r.permission} onChange={(e) => p.setRecipients((cur) => cur.map((x) => (x.email === r.email ? { ...x, permission: e.target.value as Recipient["permission"] } : x)))} className={`${inputClass} h-9 w-auto text-sm [&>option]:bg-charcoal`}>
                    <option value="VIEW">Can open it</option>
                    <option value="CONTRIBUTE">Can add memories first</option>
                  </select>
                )}
                <button type="button" aria-label={`Remove ${r.email}`} onClick={() => p.setRecipients((cur) => cur.filter((x) => x.email !== r.email))} className="grid size-8 place-items-center rounded-full text-mute hover:bg-white/8 hover:text-paper"><Trash2 className="size-4" /></button>
              </li>
            ))}
          </ul>
        )}
        <form className="mt-3 grid gap-2.5 sm:grid-cols-[1fr_1fr_auto]" onSubmit={(e) => { e.preventDefault(); addRecipient(); }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Their name" aria-label="Recipient's name" maxLength={80} className={`${inputClass} h-11`} />
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Their email" aria-label="Recipient's email" className={`${inputClass} h-11`} />
          <Button type="submit" variant="secondary"><UserPlus className="size-4" /> Add</Button>
        </form>
        {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
        <p className="mt-2 text-xs leading-relaxed text-mute">They'll get an email when you seal it saying something is waiting for them and when it opens — nothing about what's inside. They don't need an account until the day.</p>
      </div>

      {p.recipients.length > 0 && (
        <>
          <fieldset>
            <legend className="text-[0.82rem] font-medium text-silver">Kind of capsule</legend>
            <div className="mt-2 grid gap-2.5 sm:grid-cols-2">
              {([["SHARED", "Shared capsule", "For friends, a partner, or anyone you choose."], ["FAMILY", "Family capsule", "For your family, to keep and pass on."]] as const).map(([v, t, d]) => (
                <label key={v} className={clsx("cursor-pointer rounded-2xl border p-4", (p.visibility === v || (v === "SHARED" && p.visibility === "PRIVATE")) ? "border-paper/50 bg-white/[0.05]" : "border-line")}>
                  <input type="radio" name="visibility" className="sr-only" checked={p.visibility === v || (v === "SHARED" && p.visibility === "PRIVATE")} onChange={() => p.setVisibility(v)} />
                  <span className="block font-medium">{t}</span>
                  <span className="block text-sm text-mute">{d}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="rounded-2xl border border-line p-5">
            <label className="flex cursor-pointer items-start gap-4">
              <input type="checkbox" checked={p.allowContributions} onChange={(e) => p.setAllowContributions(e.target.checked)} className="mt-1 size-5 accent-[#648BFF]" />
              <span>
                <span className="block font-medium">Let others add their own memories before it's sealed</span>
                <span className="block text-sm leading-relaxed text-mute">Choose “Can add memories first” for the people you want to contribute, then send them an invitation. You'll see everything they add before you seal.</span>
              </span>
            </label>
            {p.allowContributions && p.recipients.some((r) => r.permission === "CONTRIBUTE") && (
              <Button
                variant="secondary"
                size="sm"
                className="mt-4"
                loading={inviting}
                onClick={async () => {
                  setInviting(true);
                  if (await p.save()) {
                    try {
                      const { invited } = await api<{ invited: number }>(`/capsules/${p.capsuleId}/invite-contributors`, { method: "POST" });
                      toast(invited ? `Invitation sent to ${invited} ${invited === 1 ? "person" : "people"}.` : "Everyone has already been invited.");
                    } catch (err) {
                      toast(errorMessage(err), "error");
                    }
                  }
                  setInviting(false);
                }}
              >
                <Mail className="size-4" /> Send invitations to contribute
              </Button>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function DateStep({ schedule, setSchedule, resolved, error, user }: { schedule: ScheduleInput | null; setSchedule: (s: ScheduleInput | null) => void; resolved: { display: string } | null; error: string | null; user: Props["user"] }) {
  const [timezone, setTimezone] = useState(schedule?.timezone ?? user.timezone);
  const mode = schedule?.kind ?? "preset";
  const zones = useMemo(() => {
    try {
      return Intl.supportedValuesOf("timeZone");
    } catch {
      return [timezone];
    }
  }, [timezone]);
  const tomorrow = useMemo(() => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10), []);

  const custom = schedule?.kind === "custom" ? schedule.local : "";
  const ms = schedule?.kind === "milestone" ? schedule : null;
  const setMilestone = (patch: Partial<Extract<ScheduleInput, { kind: "milestone" }>>) =>
    setSchedule({ kind: "milestone", milestone: ms?.milestone ?? "birthday", baseDate: ms?.baseDate ?? user.dateOfBirth ?? "", years: ms?.years ?? 30, time: ms?.time ?? "09:00", label: ms?.label, timezone, ...patch });

  useEffect(() => {
    if (schedule && schedule.timezone !== timezone) setSchedule({ ...schedule, timezone });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timezone]);

  return (
    <section aria-labelledby="s3" className="space-y-7">
      <div>
        <h1 id="s3" className="display text-4xl sm:text-5xl">When should it open?</h1>
        <p className="mt-3 text-silver">Choose carefully. Once sealed, the date can't be moved — not earlier, not later.</p>
      </div>

      <fieldset>
        <legend className="text-[0.82rem] font-medium text-silver">From today</legend>
        <div className="mt-2 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {(Object.keys(PRESETS) as PresetKey[]).map((k) => {
            const on = schedule?.kind === "preset" && schedule.preset === k;
            return (
              <button key={k} type="button" aria-pressed={on} onClick={() => setSchedule({ kind: "preset", preset: k, timezone })} className={clsx("h-12 rounded-2xl border text-sm transition-colors", on ? "border-paper bg-paper text-ink" : "border-line hover:border-line-strong")}>
                {PRESETS[k].label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className={clsx("rounded-2xl border p-5", mode === "milestone" ? "border-paper/50" : "border-line")}>
        <legend className="px-1 text-[0.82rem] font-medium text-silver">On a milestone</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField label="Occasion" value={ms?.milestone ?? ""} onChange={(e) => e.target.value && setMilestone({ milestone: e.target.value as "birthday" | "anniversary" | "date", years: e.target.value === "date" ? 0 : (ms?.years ?? (e.target.value === "birthday" ? 30 : 10)) })}>
            <option value="">Choose…</option>
            <option value="birthday">A birthday</option>
            <option value="anniversary">An anniversary</option>
          </SelectField>
          {ms && (
            <>
              <TextField label={ms.milestone === "birthday" ? "Date of birth" : "Date it began (wedding, graduation…)"} type="date" value={ms.baseDate} onChange={(e) => setMilestone({ baseDate: e.target.value })} />
              <TextField label={ms.milestone === "birthday" ? "Which birthday?" : "Which anniversary?"} type="number" min={1} max={120} value={ms.years} onChange={(e) => setMilestone({ years: Math.max(0, Math.round(Number(e.target.value) || 0)) })} hint={ms.milestone === "birthday" ? "For example 18, 30 or 50" : "For example 1, 10 or 25"} />
              <TextField label="Time of day" type="time" value={ms.time ?? "09:00"} onChange={(e) => setMilestone({ time: e.target.value })} />
              <TextField wrapClassName="sm:col-span-2" label="What to call it (optional)" value={ms.label ?? ""} onChange={(e) => setMilestone({ label: e.target.value || undefined })} placeholder={ms.milestone === "birthday" ? "Maya's 18th birthday" : "Our 10th anniversary"} maxLength={80} />
            </>
          )}
        </div>
      </fieldset>

      <fieldset className={clsx("rounded-2xl border p-5", mode === "custom" ? "border-paper/50" : "border-line")}>
        <legend className="px-1 text-[0.82rem] font-medium text-silver">On an exact date and time</legend>
        <input type="datetime-local" aria-label="Exact date and time" min={`${tomorrow}T00:00`} value={custom} onChange={(e) => (e.target.value ? setSchedule({ kind: "custom", local: e.target.value.slice(0, 16), timezone }) : setSchedule(null))} className={`${inputClass} h-11 sm:w-auto`} />
      </fieldset>

      <SelectField label="Timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)} hint="The capsule opens at this moment wherever its recipients are. Daylight-saving changes are handled for you.">
        {zones.map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
      </SelectField>

      <div className="rounded-2xl border border-line bg-white/[0.03] p-5" aria-live="polite">
        <p className="eyebrow">It will open</p>
        {error ? <p className="mt-2 text-danger" role="alert">{error}</p> : resolved ? <p className="mt-2 font-serif text-3xl leading-tight">{resolved.display}</p> : <p className="mt-2 text-mute">Choose an option above.</p>}
        {schedule?.kind === "preset" && resolved && <p className="mt-2 text-xs text-mute">Counted from the moment you seal, so the exact minute is fixed then.</p>}
      </div>
    </section>
  );
}
