"use client";

import { Sparkles } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/client/api";
import { formatDate } from "@/lib/format";
import type { ContentsDTO } from "@/server/capsules/service";

type Answer = ContentsDTO["answers"][number];

/** Past versus present: the answers sealed in the capsule beside the ones you'd give today. */
export function Reflection({ capsuleId, answers: initial, ai }: { capsuleId: string; answers: Answer[]; ai: boolean }) {
  const toast = useToast();
  const [answers, setAnswers] = useState(initial);
  const [draft, setDraft] = useState<Record<string, string>>(Object.fromEntries(initial.map((a) => [a.promptKey, a.now ?? ""])));
  const [editing, setEditing] = useState(initial.every((a) => !a.now));
  const [busy, setBusy] = useState(false);
  const [insight, setInsight] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);

  if (!answers.length) return null;

  async function save() {
    setBusy(true);
    try {
      const res = await api<ContentsDTO>(`/capsules/${capsuleId}/answers`, { body: { answers: Object.entries(draft).map(([promptKey, answer]) => ({ promptKey, answer })) } });
      setAnswers(res.answers);
      setEditing(false);
      toast("Your answers are saved beside the originals.");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
    setBusy(false);
  }

  async function reflect() {
    setThinking(true);
    try {
      setInsight((await api<{ text: string }>("/ai/reflect", { body: { capsuleId } })).text);
    } catch (err) {
      toast(errorMessage(err), "error");
    }
    setThinking(false);
  }

  const answered = answers.some((a) => a.now);

  return (
    <section aria-labelledby="reflect-h" className="text-left">
      <p className="eyebrow">Then and now</p>
      <h2 id="reflect-h" className="display mt-3 text-4xl sm:text-5xl">{editing ? "How would you answer today?" : "What changed, and what didn't."}</h2>
      <p className="mt-3 max-w-xl text-silver">{editing ? "Read what you wrote, then answer the same questions as the person you are now." : "Your words from the day you sealed this capsule, beside your words from today."}</p>

      <div className="mt-9 space-y-5">
        {answers.map((a) => (
          <article key={a.promptKey} className="overflow-hidden rounded-3xl border border-line">
            <h3 className="border-b border-line bg-white/[0.03] px-6 py-4 font-serif text-2xl leading-snug">{a.prompt}</h3>
            <div className="grid md:grid-cols-2">
              <div className="border-b border-line p-6 md:border-b-0 md:border-r">
                <p className="eyebrow">Then{a.thenAt && ` · ${formatDate(a.thenAt)}`}</p>
                <p className="mt-3 whitespace-pre-wrap font-serif text-[1.2rem] leading-relaxed">{a.then}</p>
              </div>
              <div className="p-6">
                <p className="eyebrow !text-[#b9c9ff]">Now{!editing && a.nowAt && ` · ${formatDate(a.nowAt)}`}</p>
                {editing ? (
                  <textarea value={draft[a.promptKey] ?? ""} onChange={(e) => setDraft((d) => ({ ...d, [a.promptKey]: e.target.value }))} aria-label={`Your answer today: ${a.prompt}`} rows={4} maxLength={5000} className={`${inputClass} mt-3 resize-y py-3 leading-relaxed`} />
                ) : (
                  <p className="mt-3 whitespace-pre-wrap font-serif text-[1.2rem] leading-relaxed">{a.now || <span className="font-sans text-base text-mute">Not answered</span>}</p>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {editing ? (
          <>
            <Button loading={busy} onClick={save} disabled={!Object.values(draft).some((v) => v.trim())}>Save my answers</Button>
            {answered && <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>}
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={() => setEditing(true)}>Edit today's answers</Button>
            {ai && answered && <Button variant="ghost" loading={thinking} onClick={reflect}><Sparkles className="size-4" /> Reflect on the difference</Button>}
          </>
        )}
      </div>
      {insight && (
        <div className="mt-6 rounded-3xl border border-line-strong bg-white/[0.04] p-6">
          <p className="eyebrow">Written by AI from your two sets of answers</p>
          <p className="mt-3 whitespace-pre-wrap leading-relaxed text-silver">{insight}</p>
        </div>
      )}
    </section>
  );
}
