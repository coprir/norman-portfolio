"use client";

import { FileText } from "lucide-react";
import { useEffect, useState } from "react";
import { Spinner } from "@/components/ui/button";
import { api } from "@/lib/client/api";

type Viewable = { id: string; mediaType: string; mimeType: string | null; title: string | null; content: string | null; thumbUrl: string | null; originalFilename: string | null };

/**
 * Shows one memory or capsule item. The file URL is requested only when the
 * item is displayed, is valid for five minutes, and is fetched again if it
 * has gone stale.
 */
export function MediaView({ item, urlPath, autoPlay, className, onEnded }: { item: Viewable; urlPath: string; autoPlay?: boolean; className?: string; onEnded?: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (item.mediaType === "LETTER") return;
    let cancelled = false;
    setUrl(null);
    setFailed(false);
    api<{ url: string | null }>(urlPath)
      .then(async (r) => {
        if (cancelled || !r.url) return;
        setUrl(r.url);
        if (item.mimeType === "text/plain") setText(await fetch(r.url).then((x) => x.text()).catch(() => null));
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [item.id, item.mediaType, item.mimeType, urlPath, attempt]);

  // A signed link may have expired while the viewer sat open: ask for a fresh one, once.
  const refresh = () => (attempt < 2 ? setAttempt((a) => a + 1) : setFailed(true));
  const label = item.title || item.originalFilename || "Memory";

  if (item.mediaType === "LETTER") {
    return (
      <article className={`mx-auto w-full max-w-2xl rounded-2xl bg-[#f3efe6] px-7 py-9 text-[#26231e] sm:px-12 sm:py-12 ${className ?? ""}`}>
        {item.title && <h3 className="font-serif text-3xl leading-tight">{item.title}</h3>}
        <div className="mt-5 whitespace-pre-wrap font-serif text-[1.25rem] leading-[1.7]">{item.content}</div>
      </article>
    );
  }
  if (failed) return <p role="alert" className="py-16 text-center text-silver">This couldn't be loaded. Check your connection and try again.</p>;
  if (!url) return <div className="grid min-h-48 place-items-center"><Spinner className="size-6 text-silver" /></div>;

  if (item.mediaType === "IMAGE") {
    // HEIC can't be decoded by most browsers; the preview thumbnail stands in.
    const heic = item.mimeType === "image/heic" || item.mimeType === "image/heif";
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={heic && item.thumbUrl ? item.thumbUrl : url} alt={label} onError={refresh} className={`mx-auto max-h-[72dvh] w-auto max-w-full rounded-xl object-contain ${className ?? ""}`} />;
  }
  if (item.mediaType === "VIDEO") {
    return <video key={url} src={url} poster={item.thumbUrl ?? undefined} controls playsInline autoPlay={autoPlay} onError={refresh} onEnded={onEnded} aria-label={label} className={`mx-auto max-h-[72dvh] w-full rounded-xl bg-black ${className ?? ""}`} />;
  }
  if (item.mediaType === "AUDIO") {
    return (
      <div className={`mx-auto w-full max-w-xl rounded-3xl border border-line bg-white/[0.03] p-7 text-center ${className ?? ""}`}>
        <p className="eyebrow">Voice recording</p>
        <p className="mt-2 font-serif text-2xl">{label}</p>
        <audio key={url} src={url} controls autoPlay={autoPlay} onError={refresh} onEnded={onEnded} className="mt-6 w-full" />
      </div>
    );
  }
  if (text !== null) return <pre className={`mx-auto max-h-[70dvh] w-full max-w-2xl overflow-auto whitespace-pre-wrap rounded-2xl border border-line bg-white/[0.03] p-6 font-sans text-[0.95rem] leading-relaxed ${className ?? ""}`}>{text}</pre>;
  return (
    <div className={`mx-auto w-full max-w-xl rounded-3xl border border-line bg-white/[0.03] p-8 text-center ${className ?? ""}`}>
      <FileText className="mx-auto size-8 text-silver" aria-hidden="true" />
      <p className="mt-3 font-medium">{label}</p>
      <a href={url} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex h-10 items-center rounded-full border border-line-strong px-4 text-sm hover:bg-white/8">Open document</a>
    </div>
  );
}
