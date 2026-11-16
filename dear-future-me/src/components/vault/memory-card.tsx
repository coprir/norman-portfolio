"use client";

import { clsx } from "clsx";
import { Check, FileText, Mic, Play, ScrollText } from "lucide-react";
import type { MemoryDTO } from "@/server/memories";

const ICON = { AUDIO: Mic, DOCUMENT: FileText, LETTER: ScrollText } as const;

/** Thumbnail tile for any memory type. `natural` keeps the image's own aspect ratio (masonry). */
export function MemoryCard({ memory, onClick, selected, selectable, natural }: { memory: Pick<MemoryDTO, "id" | "title" | "mediaType" | "thumbUrl" | "content" | "width" | "height" | "originalFilename">; onClick?: () => void; selected?: boolean; selectable?: boolean; natural?: boolean }) {
  const Icon = ICON[memory.mediaType as keyof typeof ICON];
  const label = memory.title || memory.originalFilename || "Untitled";
  const ratio = natural && memory.width && memory.height ? memory.width / memory.height : 1;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selectable ? Boolean(selected) : undefined}
      aria-label={`${label}${selectable ? (selected ? ", selected" : "") : ""}`}
      style={{ aspectRatio: natural ? Math.min(1.9, Math.max(0.6, ratio)) : 1 }}
      className={clsx(
        "group relative block w-full overflow-hidden rounded-2xl border bg-charcoal text-left transition-[border-color,transform] duration-200",
        selected ? "border-blue ring-2 ring-blue/50" : "border-line hover:border-line-strong",
      )}
    >
      {memory.thumbUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={memory.thumbUrl} alt="" loading="lazy" decoding="async" className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
      ) : memory.mediaType === "LETTER" ? (
        <div className="size-full bg-[#f3efe6] p-4 font-serif text-[0.95rem] leading-snug text-[#3a362f]">
          <p className="line-clamp-6">{memory.content}</p>
        </div>
      ) : (
        <div className="grid size-full place-items-center bg-gradient-to-br from-[#1c2340] to-charcoal text-silver">
          {Icon ? <Icon className="size-7" aria-hidden="true" /> : <Play className="size-7" aria-hidden="true" />}
        </div>
      )}
      {memory.mediaType === "VIDEO" && (
        <span className="absolute left-2.5 top-2.5 grid size-7 place-items-center rounded-full bg-ink/70 backdrop-blur">
          <Play className="size-3.5 fill-paper text-paper" aria-hidden="true" />
        </span>
      )}
      <span className={clsx("pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t px-3 pb-2.5 pt-8 text-[0.8rem]", memory.mediaType === "LETTER" && !memory.thumbUrl ? "from-[#f3efe6] text-[#5b554b]" : "from-ink/90 text-paper opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100", !memory.thumbUrl && memory.mediaType !== "LETTER" && "opacity-100")}>
        {label}
      </span>
      {selectable && (
        <span className={clsx("absolute right-2.5 top-2.5 grid size-6 place-items-center rounded-full border transition-colors", selected ? "border-blue bg-blue text-ink" : "border-white/50 bg-ink/50 text-transparent")}>
          <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
        </span>
      )}
    </button>
  );
}
