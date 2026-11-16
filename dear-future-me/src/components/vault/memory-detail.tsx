"use client";

import { Download, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { SelectField, TextArea, TextField } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/client/api";
import { formatBytes } from "@/lib/format";
import { KIND_LABEL } from "@/lib/media";
import type { MemoryDTO } from "@/server/memories";
import { MediaView } from "./media-view";

export type Category = { id: string; name: string; custom: boolean };
export type Album = { id: string; name: string; description: string | null; count: number };

export function MemoryDetail({ memory, categories, albums, ai, onClose, onChanged, onDeleted }: { memory: MemoryDTO | null; categories: Category[]; albums: Album[]; ai: boolean; onClose: () => void; onChanged: (m: MemoryDTO) => void; onDeleted: (id: string) => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ title: "", description: "", categoryId: "", tags: "", captureDate: "", content: "" });
  const [albumIds, setAlbumIds] = useState<string[]>([]);
  const [busy, setBusy] = useState<"save" | "delete" | "ai" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!memory) return;
    setForm({ title: memory.title ?? "", description: memory.description ?? "", categoryId: memory.categoryId ?? "", tags: memory.tags.join(", "), captureDate: memory.captureDate?.slice(0, 10) ?? "", content: memory.content ?? "" });
    setAlbumIds(memory.albumIds ?? []);
    setConfirmDelete(false);
  }, [memory]);

  if (!memory) return <Dialog open={false} onClose={onClose} title="Memory">{null}</Dialog>;
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    if (!memory) return;
    setBusy("save");
    try {
      const updated = await api<MemoryDTO>(`/memories/${memory.id}`, {
        method: "PATCH",
        body: {
          title: form.title || null,
          description: form.description || null,
          categoryId: form.categoryId || null,
          tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
          captureDate: form.captureDate ? new Date(`${form.captureDate}T12:00:00`).toISOString() : null,
          ...(memory.mediaType === "LETTER" && form.content !== memory.content ? { content: form.content } : {}),
        },
      });
      const before = new Set(memory.albumIds ?? []);
      const after = new Set(albumIds);
      await Promise.all([
        ...albumIds.filter((a) => !before.has(a)).map((a) => api(`/albums/${a}/memories`, { body: { memoryIds: [memory.id] } })),
        ...[...before].filter((a) => !after.has(a)).map((a) => api(`/albums/${a}/memories`, { method: "DELETE", body: { memoryIds: [memory.id] } })),
      ]);
      onChanged({ ...updated, albumIds });
      toast("Saved.");
      onClose();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
    setBusy(null);
  }

  async function remove() {
    if (!memory) return;
    setBusy("delete");
    try {
      await api(`/memories/${memory.id}`, { method: "DELETE" });
      onDeleted(memory.id);
      toast("Memory deleted.");
      onClose();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
    setBusy(null);
  }

  async function suggest() {
    if (!memory) return;
    setBusy("ai");
    try {
      const s = await api<{ title: string; categoryId: string | null; tags: string[] }>("/ai/suggest", { body: { memoryId: memory.id } });
      setForm((f) => ({ ...f, title: f.title && f.title !== memory.title ? f.title : s.title, categoryId: s.categoryId ?? f.categoryId, tags: [...new Set([...f.tags.split(",").map((t) => t.trim()).filter(Boolean), ...s.tags])].join(", ") }));
      toast("Suggestions added. Review them, then save.");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
    setBusy(null);
  }

  async function download() {
    if (!memory) return;
    try {
      const { url } = await api<{ url: string | null }>(`/memories/${memory.id}/url?download=1`);
      if (url) window.location.assign(url);
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={memory.title || memory.originalFilename || "Memory"}
      wide
      footer={
        confirmDelete ? (
          <>
            <span className="mr-auto text-sm text-silver">Delete this memory for good?</span>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Keep it</Button>
            <Button variant="danger" loading={busy === "delete"} onClick={remove}>Delete</Button>
          </>
        ) : (
          <>
            <Button variant="ghost" aria-label="Delete memory" onClick={() => setConfirmDelete(true)} className="mr-auto"><Trash2 className="size-4" /> Delete</Button>
            {memory.mediaType !== "LETTER" && <Button variant="secondary" onClick={download}><Download className="size-4" /> Download</Button>}
            <Button loading={busy === "save"} onClick={save}>Save</Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-6">
        {memory.mediaType === "LETTER" ? (
          <textarea value={form.content} onChange={set("content")} aria-label="Letter" className="min-h-64 w-full resize-y rounded-2xl bg-[#f3efe6] px-6 py-5 font-serif text-[1.15rem] leading-relaxed text-[#26231e] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue" />
        ) : (
          <MediaView item={memory} urlPath={`/memories/${memory.id}/url`} />
        )}
        <p className="text-xs text-mute">
          {KIND_LABEL[memory.mediaType]}
          {memory.fileSize > 0 && memory.mediaType !== "LETTER" && ` · ${formatBytes(memory.fileSize)}`}
          {memory.width && memory.height ? ` · ${memory.width}×${memory.height}` : ""}
          {memory.originalFilename ? ` · ${memory.originalFilename}` : ""}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Title" value={form.title} onChange={set("title")} maxLength={120} />
          <TextField label="Date of this memory" type="date" value={form.captureDate} onChange={set("captureDate")} max={new Date().toISOString().slice(0, 10)} />
          <SelectField label="Category" value={form.categoryId} onChange={set("categoryId")}>
            <option value="">None</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </SelectField>
          <TextField label="Tags" value={form.tags} onChange={set("tags")} hint="Separate with commas" placeholder="summer, grandma, lisbon" />
          <div className="sm:col-span-2">
            <TextArea label="Description" value={form.description} onChange={set("description")} maxLength={2000} rows={3} />
          </div>
        </div>
        {albums.length > 0 && (
          <fieldset>
            <legend className="text-[0.82rem] font-medium text-silver">Albums</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {albums.map((a) => {
                const on = albumIds.includes(a.id);
                return (
                  <button key={a.id} type="button" aria-pressed={on} onClick={() => setAlbumIds((ids) => (on ? ids.filter((i) => i !== a.id) : [...ids, a.id]))} className={`h-9 rounded-full border px-3.5 text-sm ${on ? "border-paper bg-paper text-ink" : "border-line-strong text-silver hover:text-paper"}`}>
                    {a.name}
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}
        {ai && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white/[0.02] px-4 py-3">
            <p className="text-sm text-silver">Let AI suggest a title, category and tags. This sends this memory's preview and details to our AI provider.</p>
            <Button size="sm" variant="secondary" loading={busy === "ai"} onClick={suggest}><Sparkles className="size-4" /> Suggest</Button>
          </div>
        )}
      </div>
    </Dialog>
  );
}
