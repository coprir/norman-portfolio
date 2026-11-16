"use client";

import { clsx } from "clsx";
import { RotateCcw, Upload, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { ACCEPT_ATTR, normalizeMime } from "@/lib/media";
import { errorMessage } from "@/lib/client/api";
import { uploadFile } from "@/lib/client/upload";
import { formatBytes } from "@/lib/format";
import type { MemoryDTO } from "@/server/memories";

type Item = { key: number; file: File; progress: number; status: "uploading" | "done" | "error" | "cancelled"; error?: string; memoryId?: string; cancel?: () => void };

/**
 * Drag-and-drop, multi-file uploader. Files go directly to private storage
 * in parts; a failed upload can be retried and picks up where it stopped.
 */
export function Uploader({ onUploaded, inVault = true, compact }: { onUploaded: (m: MemoryDTO) => void; inVault?: boolean; compact?: boolean }) {
  const [items, setItems] = useState<Item[]>([]);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  const patch = (key: number, p: Partial<Item>) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...p } : i)));

  const start = useCallback(
    (item: Item) => {
      const handle = uploadFile(item.file, {
        inVault,
        resumeId: item.memoryId,
        onStarted: (memoryId) => patch(item.key, { memoryId }),
        onProgress: (progress) => patch(item.key, { progress }),
      });
      patch(item.key, { status: "uploading", error: undefined, cancel: handle.cancel });
      handle.promise
        .then((m) => {
          patch(item.key, { status: "done", progress: 1 });
          onUploaded(m);
          setTimeout(() => setItems((list) => list.filter((i) => i.key !== item.key)), 2500);
        })
        .catch((err) => patch(item.key, (err as Error).name === "AbortError" ? { status: "cancelled" } : { status: "error", error: errorMessage(err) }));
    },
    [inVault, onUploaded],
  );

  const add = useCallback(
    (files: FileList | File[]) => {
      const next: Item[] = [];
      for (const file of Array.from(files)) {
        const key = ++seq.current;
        if (!normalizeMime(file.type, file.name)) next.push({ key, file, progress: 0, status: "error", error: "This file type isn't supported." });
        else next.push({ key, file, progress: 0, status: "uploading" });
      }
      setItems((list) => [...list, ...next]);
      next.filter((i) => i.status === "uploading").forEach(start);
    },
    [start],
  );

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files.length) add(e.dataTransfer.files); }}
        className={clsx("rounded-3xl border border-dashed text-center transition-colors", compact ? "px-5 py-6" : "px-6 py-10", over ? "border-blue bg-blue/10" : "border-line-strong bg-white/[0.02]")}
      >
        <Upload className="mx-auto size-6 text-silver" aria-hidden="true" />
        <p className="mt-3 text-[0.95rem]">
          Drop files here, or{" "}
          <button type="button" onClick={() => input.current?.click()} className="font-medium text-paper underline underline-offset-4">
            choose from your device
          </button>
        </p>
        <p className="mt-1.5 text-xs text-mute">Photographs, videos, audio, PDF and text files</p>
        <input ref={input} type="file" multiple accept={ACCEPT_ATTR} className="sr-only" aria-label="Choose files to upload" onChange={(e) => { if (e.target.files?.length) add(e.target.files); e.target.value = ""; }} />
      </div>

      {items.length > 0 && (
        <ul className="mt-3 space-y-2" aria-live="polite">
          {items.map((i) => (
            <li key={i.key} className="rounded-2xl border border-line bg-white/[0.02] px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{i.file.name}</p>
                  <p className={clsx("text-xs", i.status === "error" ? "text-danger" : "text-mute")}>
                    {i.status === "error" ? i.error : i.status === "cancelled" ? "Cancelled" : i.status === "done" ? "Saved" : `${formatBytes(i.file.size)} · ${Math.round(i.progress * 100)}%`}
                  </p>
                </div>
                {i.status === "uploading" && (
                  <button type="button" aria-label={`Cancel ${i.file.name}`} onClick={() => i.cancel?.()} className="grid size-8 place-items-center rounded-full text-mute hover:bg-white/8 hover:text-paper">
                    <X className="size-4" />
                  </button>
                )}
                {(i.status === "error" || i.status === "cancelled") && i.memoryId !== undefined && (
                  <button type="button" onClick={() => start(i)} className="flex h-8 items-center gap-1.5 rounded-full border border-line-strong px-3 text-xs hover:bg-white/8">
                    <RotateCcw className="size-3.5" /> Resume
                  </button>
                )}
                {(i.status === "error" || i.status === "cancelled") && (
                  <button type="button" aria-label="Dismiss" onClick={() => setItems((l) => l.filter((x) => x.key !== i.key))} className="grid size-8 place-items-center rounded-full text-mute hover:bg-white/8 hover:text-paper">
                    <X className="size-4" />
                  </button>
                )}
              </div>
              {i.status === "uploading" && (
                <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-white/8" role="progressbar" aria-valuenow={Math.round(i.progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`Uploading ${i.file.name}`}>
                  <div className="h-full rounded-full bg-paper transition-[width] duration-200" style={{ width: `${i.progress * 100}%` }} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
