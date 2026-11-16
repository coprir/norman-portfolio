"use client";

import { clsx } from "clsx";
import { ArrowLeft, ArrowRight, Download, RotateCcw, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CapsuleVisual } from "@/components/capsule/capsule";
import { Button, Spinner } from "@/components/ui/button";
import { ToastProvider } from "@/components/ui/toast";
import { MediaView } from "@/components/vault/media-view";
import { api, errorMessage } from "@/lib/client/api";
import { formatDate } from "@/lib/format";
import { KIND_LABEL } from "@/lib/media";
import type { CapsuleDTO, ContentsDTO } from "@/server/capsules/service";
import { Reflection } from "./reflection";

const BACKDROP: Record<string, string> = {
  midnight: "bg-[radial-gradient(70%_60%_at_50%_30%,#16204a_0%,#080a12_70%)]",
  aurora: "bg-[radial-gradient(70%_60%_at_30%_20%,#17404f_0%,transparent_60%),radial-gradient(60%_60%_at_80%_70%,#2a1c55_0%,#080a12_70%)]",
  ember: "bg-[radial-gradient(70%_60%_at_50%_30%,#4a2424_0%,#0d090c_70%)]",
  paper: "bg-[radial-gradient(70%_60%_at_50%_30%,#2a2620_0%,#0c0b0a_70%)]",
};

type Stage = { kind: "intro" } | { kind: "opening" } | { kind: "message" } | { kind: "item"; index: number } | { kind: "reflect" } | { kind: "end" };

/**
 * The opening. Nothing is fetched until the person chooses to open, nothing
 * plays sound on its own, and with reduced motion the animation is replaced
 * by a simple fade.
 */
export function Reveal({ capsule, ai }: { capsule: CapsuleDTO; ai: boolean }) {
  const [stage, setStage] = useState<Stage>({ kind: "intro" });
  const [contents, setContents] = useState<ContentsDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  const sequence = useCallback((c: ContentsDTO): Stage[] => [...(c.message?.trim() ? [{ kind: "message" } as Stage] : []), ...c.items.map((_, index) => ({ kind: "item", index }) as Stage), ...(c.answers.length ? [{ kind: "reflect" } as Stage] : []), { kind: "end" }], []);

  async function open() {
    setError(null);
    setStage({ kind: "opening" });
    try {
      const [c] = await Promise.all([api<ContentsDTO>(`/capsules/${capsule.id}/open`, { method: "POST" }), new Promise((r) => setTimeout(r, reduced.current ? 400 : 3400))]);
      setContents(c);
      setStage(sequence(c)[0]);
    } catch (err) {
      setError(errorMessage(err));
      setStage({ kind: "intro" });
    }
  }

  const steps = contents ? sequence(contents) : [];
  const at = steps.findIndex((s) => s.kind === stage.kind && (s.kind !== "item" || (stage.kind === "item" && s.index === stage.index)));
  const move = useCallback((d: number) => { const next = steps[at + d]; if (next) setStage(next); }, [steps, at]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("textarea, input, video, audio")) return;
      if (e.key === "ArrowRight") move(1);
      if (e.key === "ArrowLeft") move(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move]);

  // Move focus to each new stage's heading so screen readers announce it.
  useEffect(() => {
    heading.current?.focus();
  }, [stage]);

  async function download(itemId: string) {
    setDownloading(itemId);
    try {
      const { url } = await api<{ url: string }>(`/capsules/${capsule.id}/items/${itemId}/url?download=1`);
      const a = document.createElement("a");
      a.href = url;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      setError(errorMessage(err));
    }
    setTimeout(() => setDownloading(null), 800);
  }

  const item = stage.kind === "item" && contents ? contents.items[stage.index] : null;
  const sealedOn = capsule.sealedAt ? formatDate(capsule.sealedAt) : null;
  const inside = stage.kind !== "intro" && stage.kind !== "opening";

  return (
    <ToastProvider>
      <div className={clsx("fixed inset-0 z-[70] flex flex-col overflow-y-auto text-paper", BACKDROP[capsule.theme] ?? BACKDROP.midnight)}>
        <div className="starfield pointer-events-none fixed inset-0 opacity-50" aria-hidden="true" />

        <header className="relative z-10 flex h-16 shrink-0 items-center justify-between px-4 sm:px-6">
          <Link href={`/app/capsules/${capsule.id}`} aria-label="Close" className="grid size-10 place-items-center rounded-full text-silver hover:bg-white/10 hover:text-paper">
            <X className="size-5" />
          </Link>
          {inside && steps.length > 1 && (
            <div className="flex max-w-[60vw] flex-1 justify-center gap-1" role="img" aria-label={`Part ${at + 1} of ${steps.length}`}>
              {steps.map((_, i) => <span key={i} className={clsx("h-0.5 max-w-10 flex-1 rounded-full", i <= at ? "bg-paper" : "bg-white/20")} />)}
            </div>
          )}
          <span className="w-10" />
        </header>

        <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-5 pb-28 pt-2 sm:px-8">
          {(stage.kind === "intro" || stage.kind === "opening") && (
            <div className="flex w-full max-w-xl flex-col items-center text-center">
              <CapsuleVisual open={stage.kind === "opening" ? 1 : 0} className="h-[38dvh] w-full max-w-md" />
              <div className={clsx("transition-opacity duration-1000", stage.kind === "opening" && "opacity-0")}>
                <p className="eyebrow">{capsule.isCreator ? (sealedOn ? `You sealed this on ${sealedOn}` : "From you") : `From ${capsule.creator.name}${sealedOn ? ` · sealed ${sealedOn}` : ""}`}</p>
                <h1 ref={heading} tabIndex={-1} className="display mt-4 text-5xl outline-none sm:text-6xl">{capsule.title}</h1>
                <p className="mt-4 text-silver">{capsule.isCreator ? "It has waited for today. Open it when you're ready." : "It was made for you, to be opened today."}</p>
                {error && <p role="alert" className="mt-5 text-danger">{error}</p>}
                <Button size="lg" className="mt-9" onClick={open} disabled={stage.kind === "opening"}>Open your capsule</Button>
              </div>
              {stage.kind === "opening" && <p role="status" className="sr-only">Opening your capsule…</p>}
            </div>
          )}

          {stage.kind === "message" && contents && (
            <article key="message" className="w-full max-w-2xl animate-[fadein_1.4s_ease-out]">
              <p className="eyebrow text-center">{sealedOn ? `Written ${sealedOn}` : "A message"}</p>
              <h2 ref={heading} tabIndex={-1} className="sr-only">Message</h2>
              <div className="mt-6 rounded-3xl bg-[#f3efe6] px-7 py-10 text-[#26231e] shadow-2xl shadow-black/50 sm:px-14 sm:py-14">
                <p className="whitespace-pre-wrap font-serif text-[1.35rem] leading-[1.75] first-letter:float-left first-letter:mr-2 first-letter:font-serif first-letter:text-6xl first-letter:leading-[0.9]">{contents.message}</p>
                <p className="mt-10 font-serif text-lg italic text-[#8a8275]">— {capsule.creator.name}{sealedOn && `, ${sealedOn}`}</p>
              </div>
            </article>
          )}

          {item && (
            <div key={item.id} className="flex w-full max-w-4xl animate-[fadein_1.2s_ease-out] flex-col items-center">
              <MediaView item={item} urlPath={`/capsules/${capsule.id}/items/${item.id}/url`} />
              <div className="mt-6 w-full max-w-2xl text-center">
                <h2 ref={heading} tabIndex={-1} className="font-serif text-3xl leading-tight outline-none">{item.mediaType === "LETTER" ? "" : item.title || KIND_LABEL[item.mediaType]}</h2>
                {item.description && <p className="mt-2 leading-relaxed text-silver">{item.description}</p>}
                <p className="mt-2 text-xs text-mute">
                  {[item.captureDate && formatDate(item.captureDate), item.contributedBy && `Added by ${item.contributedBy}`].filter(Boolean).join(" · ")}
                </p>
              </div>
            </div>
          )}

          {stage.kind === "reflect" && contents && (
            <div className="w-full max-w-4xl animate-[fadein_1.2s_ease-out]">
              <h2 ref={heading} tabIndex={-1} className="sr-only">Then and now</h2>
              <Reflection capsuleId={capsule.id} answers={contents.answers} ai={ai} />
            </div>
          )}

          {stage.kind === "end" && contents && (
            <div className="w-full max-w-2xl animate-[fadein_1.4s_ease-out] text-center">
              <p className="eyebrow">{capsule.unlockAt && `Opened ${formatDate(new Date())}`}</p>
              <h2 ref={heading} tabIndex={-1} className="display mt-4 text-5xl outline-none sm:text-6xl">That was you.</h2>
              <p className="mx-auto mt-4 max-w-md text-silver">Everything in this capsule is yours to keep. You can come back to it whenever you like.</p>
              <div className="mt-9 flex flex-wrap justify-center gap-3">
                <Button variant="secondary" onClick={() => setStage(steps[0])}><RotateCcw className="size-4" /> Watch again</Button>
                <Link href="/app/capsules/new" className="inline-flex h-11 items-center rounded-full bg-paper px-5 text-sm font-medium text-ink hover:bg-white">Seal something new</Link>
              </div>
              {contents.items.some((i) => i.mediaType !== "LETTER") && (
                <div className="mt-12 text-left">
                  <h3 className="eyebrow">Download</h3>
                  <ul className="mt-3 divide-y divide-line rounded-2xl border border-line">
                    {contents.items.filter((i) => i.mediaType !== "LETTER").map((i) => (
                      <li key={i.id} className="flex items-center gap-3 px-4 py-3">
                        <span className="min-w-0 flex-1 truncate text-sm">{i.title || i.originalFilename || KIND_LABEL[i.mediaType]}</span>
                        <button type="button" onClick={() => download(i.id)} aria-label={`Download ${i.title ?? "item"}`} className="grid size-9 place-items-center rounded-full text-silver hover:bg-white/10 hover:text-paper">
                          {downloading === i.id ? <Spinner /> : <Download className="size-4" />}
                        </button>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-mute">Download links are created when you ask and expire after five minutes.</p>
                </div>
              )}
            </div>
          )}
        </main>

        {inside && steps.length > 1 && (
          <nav aria-label="Capsule contents" className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-between gap-3 bg-gradient-to-t from-black/70 to-transparent px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-10 sm:px-8">
            <Button variant="secondary" onClick={() => move(-1)} disabled={at <= 0} aria-label="Previous"><ArrowLeft className="size-4" /> <span className="max-sm:hidden">Previous</span></Button>
            {at < steps.length - 1 && <Button onClick={() => move(1)}>{at === steps.length - 2 ? "Finish" : "Next"} <ArrowRight className="size-4" /></Button>}
          </nav>
        )}
      </div>
    </ToastProvider>
  );
}
