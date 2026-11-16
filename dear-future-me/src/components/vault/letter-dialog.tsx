"use client";

import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { inputClass } from "@/components/ui/field";
import { api, errorMessage } from "@/lib/client/api";
import type { MemoryDTO } from "@/server/memories";

/** A plain writing surface. Optional AI help appears only when it's enabled and consented to. */
export function LetterDialog({ open, onClose, onSaved, inVault = true, ai }: { open: boolean; onClose: () => void; onSaved: (m: MemoryDTO) => void; inVault?: boolean; ai?: boolean }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [helping, setHelping] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTitle("");
      setContent("");
      setSuggestion(null);
      setError(null);
    }
  }, [open]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      onSaved(await api<MemoryDTO>("/memories/letters", { body: { title: title || undefined, content, inVault } }));
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
    setBusy(false);
  }

  async function help() {
    setHelping(true);
    setError(null);
    try {
      const intent = content.trim().length < 20 ? "start" : "continue";
      setSuggestion((await api<{ text: string }>("/ai/assist", { body: { draft: content, intent } })).text);
    } catch (err) {
      setError(errorMessage(err));
    }
    setHelping(false);
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Write a letter"
      wide
      footer={
        <>
          {ai && <Button variant="ghost" loading={helping} onClick={help} className="mr-auto"><Sparkles className="size-4" /> {content.trim().length < 20 ? "Help me start" : "Suggest what's next"}</Button>}
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={busy} disabled={!content.trim()} onClick={save}>Save letter</Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Title (optional)" aria-label="Title" className={`${inputClass} h-11`} />
        <textarea value={content} onChange={(e) => setContent(e.target.value)} maxLength={50000} aria-label="Your letter" placeholder="Dear future me," className="min-h-[46dvh] w-full resize-y rounded-2xl border border-line bg-[#f3efe6] px-6 py-5 font-serif text-[1.2rem] leading-relaxed text-[#26231e] placeholder:text-[#a59d8e] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue" />
        {suggestion && (
          <div className="rounded-2xl border border-line-strong bg-white/[0.04] p-4">
            <p className="eyebrow">A suggestion — use it or ignore it</p>
            <p className="mt-2 whitespace-pre-wrap text-[0.95rem] leading-relaxed text-silver">{suggestion}</p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => { setContent((c) => (c.trim() ? `${c.trimEnd()}\n\n` : "") + suggestion.split("\n---\n")[0].trim()); setSuggestion(null); }}>Add to my letter</Button>
              <Button size="sm" variant="ghost" onClick={() => setSuggestion(null)}>Dismiss</Button>
            </div>
          </div>
        )}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      </div>
    </Dialog>
  );
}
