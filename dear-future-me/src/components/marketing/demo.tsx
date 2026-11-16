"use client";

import { clsx } from "clsx";
import { Lock, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CapsuleVisual } from "@/components/capsule/capsule";
import { Button } from "@/components/ui/button";

const OPTIONS = [
  { key: "1y", label: "1 year", years: 1 },
  { key: "5y", label: "5 years", years: 5 },
  { key: "10y", label: "10 years", years: 10 },
  { key: "20y", label: "20 years", years: 20 },
];

/**
 * A harmless rehearsal of the product on the landing page. Nothing is saved;
 * time is simulated so a visitor can feel the wait and the opening in seconds.
 */
export function CapsuleDemo() {
  const [note, setNote] = useState("");
  const [choice, setChoice] = useState(OPTIONS[1]);
  const [phase, setPhase] = useState<"write" | "sealed" | "open">("write");
  const [progress, setProgress] = useState(0);
  const raf = useRef(0);

  const today = useMemo(() => new Date(), []);
  const opens = useMemo(() => new Date(today.getFullYear() + choice.years, today.getMonth(), today.getDate()), [today, choice]);
  const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  useEffect(() => {
    if (phase !== "sealed") return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = reduce ? 600 : 5200;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      setProgress(p);
      if (p < 1) raf.current = requestAnimationFrame(tick);
      else setPhase("open");
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [phase]);

  const simulated = new Date(today.getTime() + (opens.getTime() - today.getTime()) * (progress * progress));
  const text = note.trim() || "I hope you still take the long way home.";

  return (
    <div className="grid overflow-hidden rounded-[2rem] border border-line bg-navy/60 lg:grid-cols-[1.05fr_1fr]">
      <div className="relative min-h-72 border-b border-line lg:min-h-[30rem] lg:border-b-0 lg:border-r">
        <div className="starfield absolute inset-0 opacity-60" />
        <CapsuleVisual open={phase === "open" ? 1 : 0} particles={false} className="absolute inset-0" />
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-5 sm:p-7">
          <div>
            <p className="eyebrow">{phase === "write" ? "Today" : phase === "sealed" ? "Time passing" : "Opened"}</p>
            <p className="mt-1 font-serif text-2xl tnum sm:text-3xl" aria-live="polite">
              {fmt(phase === "write" ? today : phase === "sealed" ? simulated : opens)}
            </p>
          </div>
          {phase === "sealed" && (
            <span className="flex items-center gap-1.5 rounded-full border border-line-strong bg-ink/60 px-3 py-1.5 text-xs text-silver backdrop-blur">
              <Lock className="size-3.5" /> Sealed
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col justify-center gap-6 p-6 sm:p-10">
        {phase === "write" && (
          <>
            <div>
              <h3 className="text-xl font-medium">Try it with one sentence</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-silver">This is only a rehearsal — nothing you type here is saved or sent anywhere.</p>
            </div>
            <label className="flex flex-col gap-2">
              <span className="text-[0.82rem] font-medium text-silver">A line to your future self</span>
              <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 180))} rows={3} placeholder="I hope you still take the long way home." className="w-full resize-none rounded-2xl border border-line bg-white/[0.03] px-4 py-3 font-serif text-xl leading-snug text-paper placeholder:text-mute/60 focus:border-blue/70 focus:outline-none" />
            </label>
            <fieldset>
              <legend className="text-[0.82rem] font-medium text-silver">Open it in</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {OPTIONS.map((o) => (
                  <button key={o.key} type="button" aria-pressed={choice.key === o.key} onClick={() => setChoice(o)} className={clsx("h-10 rounded-full border px-4 text-sm transition-colors", choice.key === o.key ? "border-paper bg-paper text-ink" : "border-line-strong text-silver hover:border-white/30 hover:text-paper")}>
                    {o.label}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="flex flex-wrap items-center gap-4">
              <Button onClick={() => { setProgress(0); setPhase("sealed"); }}>
                <Lock className="size-4" /> Seal it
              </Button>
              <p className="text-sm text-mute">Opens {fmt(opens)}</p>
            </div>
          </>
        )}

        {phase === "sealed" && (
          <div aria-live="polite">
            <p className="eyebrow">Sealed</p>
            <p className="mt-3 font-serif text-3xl leading-tight sm:text-4xl">Now you wait.</p>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-silver">In the real thing, this takes {choice.label}. You can't peek, edit or change the date. We're skipping ahead for you.</p>
            <div className="mt-7 h-px w-full bg-line">
              <div className="h-px bg-paper transition-[width] duration-100" style={{ width: `${progress * 100}%` }} />
            </div>
          </div>
        )}

        {phase === "open" && (
          <div className="animate-[fadein_1.6s_ease-out]" aria-live="polite">
            <p className="eyebrow">Written {fmt(today)}</p>
            <blockquote className="mt-4 font-serif text-3xl leading-tight sm:text-[2.4rem]">“{text}”</blockquote>
            <p className="mt-5 font-serif text-lg italic text-silver">— you, {choice.label} ago</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="/register" className="inline-flex h-11 items-center rounded-full bg-paper px-5 text-sm font-medium text-ink hover:bg-white">
                Create your first capsule
              </a>
              <Button variant="ghost" onClick={() => { setPhase("write"); setProgress(0); }}>
                <RotateCcw className="size-4" /> Again
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
