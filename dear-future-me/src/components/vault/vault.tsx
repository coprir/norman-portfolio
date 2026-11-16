"use client";

import { clsx } from "clsx";
import { Camera, FolderPlus, LayoutGrid, Mic, PenLine, Rows3, Search, Sparkles, Upload, X, GalleryVerticalEnd } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageHeader, pageClass } from "@/components/app/shell";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { TextField, inputClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/client/api";
import { formatBytes, formatDate } from "@/lib/format";
import type { MemoryDTO } from "@/server/memories";
import { LetterDialog } from "./letter-dialog";
import { MemoryCard } from "./memory-card";
import { MemoryDetail, type Album, type Category } from "./memory-detail";
import { Recorder } from "./recorder";
import { Uploader } from "./uploader";

type View = "grid" | "masonry" | "timeline";
type Props = { initial: { items: MemoryDTO[]; total: number; hasMore: boolean }; categories: Category[]; albums: Album[]; storage: { usedBytes: number; limitBytes: number }; ai: { suggest: boolean; search: boolean } };

const TYPES = [["", "Everything"], ["IMAGE", "Photographs"], ["VIDEO", "Videos"], ["AUDIO", "Audio"], ["LETTER", "Letters"], ["DOCUMENT", "Documents"]] as const;
const SORTS = [["newest", "Newest first"], ["oldest", "Oldest first"], ["uploaded", "Recently added"], ["name", "Name"], ["size", "Largest"]] as const;

export function Vault({ initial, categories: initialCategories, albums: initialAlbums, storage, ai }: Props) {
  const toast = useToast();
  const [items, setItems] = useState(initial.items);
  const [total, setTotal] = useState(initial.total);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ q: "", type: "", category: "", album: "", sort: "newest", from: "", to: "" });
  const [view, setView] = useState<View>("grid");
  const [categories, setCategories] = useState(initialCategories);
  const [albums, setAlbums] = useState(initialAlbums);
  const [open, setOpen] = useState<MemoryDTO | null>(null);
  const [panel, setPanel] = useState<"upload" | "letter" | "video" | "audio" | "album" | "category" | null>(null);
  const [aiMode, setAiMode] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [used, setUsed] = useState(storage.usedBytes);
  const first = useRef(true);

  const load = useCallback(
    async (nextPage: number, f = filters) => {
      setLoading(true);
      try {
        const qs = new URLSearchParams(Object.entries({ ...f, page: String(nextPage) }).filter(([, v]) => v));
        const res = await api<{ items: MemoryDTO[]; total: number; hasMore: boolean }>(`/memories?${qs}`);
        setItems((cur) => (nextPage === 0 ? res.items : [...cur, ...res.items]));
        setTotal(res.total);
        setHasMore(res.hasMore);
        setPage(nextPage);
      } catch (err) {
        toast(errorMessage(err), "error");
      }
      setLoading(false);
    },
    [filters, toast],
  );

  // Debounced reload when filters change (not on first paint: the server rendered it).
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (aiMode) return;
    const t = setTimeout(() => load(0, filters), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, aiMode]);

  const added = useCallback((m: MemoryDTO) => {
    setItems((cur) => [m, ...cur.filter((x) => x.id !== m.id)]);
    setTotal((t) => t + 1);
    setUsed((u) => u + m.fileSize);
  }, []);

  async function aiSearch() {
    if (!filters.q.trim()) return;
    setLoading(true);
    setAiNote(null);
    try {
      const res = await api<{ items: MemoryDTO[]; interpretation: { keywords: string[]; mediaType: string; category: string | null; from: string | null; to: string | null } }>("/ai/search", { body: { query: filters.q } });
      setItems(res.items);
      setTotal(res.items.length);
      setHasMore(false);
      const i = res.interpretation;
      setAiNote(["Looked for", i.mediaType !== "ANY" ? i.mediaType.toLowerCase() + "s" : "memories", i.keywords.length ? `matching “${i.keywords.join("”, “")}”` : "", i.category ? `in ${i.category}` : "", i.from || i.to ? `between ${i.from ?? "the beginning"} and ${i.to ?? "today"}` : ""].filter(Boolean).join(" ") + ".");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
    setLoading(false);
  }

  const groups = useMemo(() => {
    if (view !== "timeline") return [];
    const map = new Map<string, MemoryDTO[]>();
    for (const m of items) {
      const key = m.captureDate ? m.captureDate.slice(0, 7) : "undated";
      map.set(key, [...(map.get(key) ?? []), m]);
    }
    return [...map];
  }, [items, view]);

  const pct = Math.min(100, Math.round((used / storage.limitBytes) * 100));
  const filtering = Boolean(filters.q || filters.type || filters.category || filters.album || filters.from || filters.to);
  const set = (k: keyof typeof filters) => (e: { target: { value: string } }) => setFilters((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className={pageClass}>
      <PageHeader
        eyebrow="Memory Vault"
        title="Everything you've kept."
        description="Your photographs, videos, recordings and letters. View, organise and edit them freely — until you seal them in a capsule."
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => setPanel("letter")}><PenLine className="size-4" /> Write</Button>
            <Button variant="secondary" size="sm" onClick={() => setPanel("audio")} aria-label="Record audio"><Mic className="size-4" /> <span className="max-sm:hidden">Record</span></Button>
            <Button variant="secondary" size="sm" onClick={() => setPanel("video")} aria-label="Record video"><Camera className="size-4" /> <span className="max-sm:hidden">Film</span></Button>
            <Button size="sm" onClick={() => setPanel("upload")}><Upload className="size-4" /> Upload</Button>
          </>
        }
      />

      <div className="mt-6 flex items-center gap-3 text-xs text-mute">
        <div className="h-1 w-32 overflow-hidden rounded-full bg-white/8" role="img" aria-label={`${pct}% of storage used`}>
          <div className={clsx("h-full rounded-full", pct > 90 ? "bg-danger" : "bg-silver")} style={{ width: `${pct}%` }} />
        </div>
        {formatBytes(used)} of {formatBytes(storage.limitBytes)} used
      </div>

      {/* Albums */}
      <div className="scrollbar-none -mx-5 mt-7 flex gap-2 overflow-x-auto px-5 sm:mx-0 sm:flex-wrap sm:px-0">
        <Chip on={!filters.album} onClick={() => setFilters((f) => ({ ...f, album: "" }))}>All memories</Chip>
        {albums.map((a) => (
          <Chip key={a.id} on={filters.album === a.id} onClick={() => setFilters((f) => ({ ...f, album: a.id }))}>{a.name}</Chip>
        ))}
        <button type="button" onClick={() => setPanel("album")} className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-dashed border-line-strong px-3.5 text-sm text-silver hover:text-paper">
          <FolderPlus className="size-4" /> New album
        </button>
      </div>

      {/* Toolbar */}
      <div className="mt-5 grid gap-2.5 lg:grid-cols-[1fr_auto]">
        <form className="relative" onSubmit={(e) => { e.preventDefault(); if (aiMode) void aiSearch(); }}>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-mute" aria-hidden="true" />
          <input value={filters.q} onChange={set("q")} type="search" aria-label="Search memories" placeholder={aiMode ? "Describe what you're looking for, then press Enter" : "Search titles, notes and tags"} className={`${inputClass} h-11 pl-10 ${ai.search ? "pr-28" : ""}`} />
          {ai.search && (
            <button type="button" aria-pressed={aiMode} onClick={() => { setAiMode((m) => !m); setAiNote(null); if (aiMode) void load(0); }} className={clsx("absolute right-1.5 top-1/2 flex h-8 -translate-y-1/2 items-center gap-1.5 rounded-full px-3 text-xs", aiMode ? "bg-blue text-ink" : "text-silver hover:bg-white/8")}>
              <Sparkles className="size-3.5" /> Ask AI
            </button>
          )}
        </form>
        <div className="scrollbar-none -mx-5 flex gap-2 overflow-x-auto px-5 sm:mx-0 sm:px-0">
          <MiniSelect label="Type" value={filters.type} onChange={set("type")} options={TYPES} />
          <MiniSelect label="Category" value={filters.category} onChange={(e) => (e.target.value === "__new" ? setPanel("category") : set("category")(e))} options={[["", "Any category"], ...categories.map((c) => [c.id, c.name] as const), ["__new", "+ New category…"]]} />
          <MiniSelect label="Sort" value={filters.sort} onChange={set("sort")} options={SORTS} />
          <input type="date" aria-label="From date" value={filters.from} onChange={set("from")} className={`${inputClass} h-11 w-auto shrink-0 text-sm`} />
          <input type="date" aria-label="To date" value={filters.to} onChange={set("to")} className={`${inputClass} h-11 w-auto shrink-0 text-sm`} />
          <div role="group" aria-label="View" className="flex shrink-0 rounded-xl border border-line p-1">
            {([["grid", LayoutGrid, "Grid"], ["masonry", GalleryVerticalEnd, "Masonry"], ["timeline", Rows3, "By date"]] as const).map(([v, Icon, label]) => (
              <button key={v} type="button" aria-label={label} title={label} aria-pressed={view === v} onClick={() => setView(v)} className={clsx("grid size-9 place-items-center rounded-lg", view === v ? "bg-white/10 text-paper" : "text-mute hover:text-paper")}>
                <Icon className="size-4" />
              </button>
            ))}
          </div>
        </div>
      </div>
      {aiNote && <p className="mt-3 text-sm text-silver">{aiNote}</p>}

      {/* Results */}
      <div className="mt-6" aria-busy={loading}>
        {items.length === 0 ? (
          <div className="rounded-3xl border border-line px-6 py-16 text-center">
            <p className="font-serif text-3xl">{filtering ? "Nothing matches that." : "Your vault is empty."}</p>
            <p className="mx-auto mt-3 max-w-sm text-silver">{filtering ? "Try a different search, or clear the filters." : "Add a few photographs, a video, or write a letter. They'll be here whenever you want them."}</p>
            <div className="mt-6 flex justify-center gap-2.5">
              {filtering ? <Button variant="secondary" onClick={() => setFilters({ q: "", type: "", category: "", album: "", sort: "newest", from: "", to: "" })}><X className="size-4" /> Clear filters</Button> : <Button onClick={() => setPanel("upload")}><Upload className="size-4" /> Upload your first memories</Button>}
            </div>
          </div>
        ) : view === "timeline" ? (
          <div className="space-y-10">
            {groups.map(([key, list]) => (
              <section key={key}>
                <h2 className="sticky top-14 z-10 -mx-1 bg-ink/90 px-1 py-2 font-serif text-2xl backdrop-blur md:top-0">{key === "undated" ? "Undated" : formatDate(`${key}-15`, { month: "long", year: "numeric" })}</h2>
                <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3 lg:grid-cols-6">
                  {list.map((m) => <MemoryCard key={m.id} memory={m} onClick={() => setOpen(m)} />)}
                </div>
              </section>
            ))}
          </div>
        ) : view === "masonry" ? (
          <div className="columns-2 gap-3 sm:columns-3 lg:columns-4 [&>*]:mb-3 [&>*]:break-inside-avoid">
            {items.map((m) => <MemoryCard key={m.id} memory={m} natural onClick={() => setOpen(m)} />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-5">
            {items.map((m) => <MemoryCard key={m.id} memory={m} onClick={() => setOpen(m)} />)}
          </div>
        )}
        {items.length > 0 && (
          <div className="mt-8 flex items-center justify-between gap-4 text-sm text-mute">
            <span>{total} {total === 1 ? "memory" : "memories"}</span>
            {hasMore && <Button variant="secondary" size="sm" loading={loading} onClick={() => load(page + 1)}>Show more</Button>}
          </div>
        )}
      </div>

      <Dialog open={panel === "upload"} onClose={() => setPanel(null)} title="Upload memories">
        <Uploader onUploaded={added} />
        <p className="mt-4 text-xs leading-relaxed text-mute">Files are stored privately. Large files upload in parts, so a dropped connection won't lose your progress.</p>
      </Dialog>
      <LetterDialog open={panel === "letter"} onClose={() => setPanel(null)} onSaved={added} ai={ai.suggest} />
      {(panel === "video" || panel === "audio") && <Recorder kind={panel} open onClose={() => setPanel(null)} onSaved={added} />}
      <NameDialog
        open={panel === "album"}
        title="New album"
        label="Album name"
        onClose={() => setPanel(null)}
        onSubmit={async (name) => {
          const a = await api<Album>("/albums", { body: { name } });
          setAlbums((l) => [a, ...l]);
        }}
      />
      <NameDialog
        open={panel === "category"}
        title="New category"
        label="Category name"
        onClose={() => setPanel(null)}
        onSubmit={async (name) => {
          const c = await api<Category>("/categories", { body: { name } });
          setCategories((l) => [...l, c]);
          setFilters((f) => ({ ...f, category: c.id }));
        }}
      />
      <MemoryDetail
        memory={open}
        categories={categories}
        albums={albums}
        ai={ai.suggest}
        onClose={() => setOpen(null)}
        onChanged={(m) => setItems((cur) => cur.map((x) => (x.id === m.id ? m : x)))}
        onDeleted={(id) => {
          const gone = items.find((x) => x.id === id);
          setItems((cur) => cur.filter((x) => x.id !== id));
          setTotal((t) => Math.max(0, t - 1));
          if (gone) setUsed((u) => Math.max(0, u - gone.fileSize));
        }}
      />
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={clsx("h-9 shrink-0 rounded-full border px-3.5 text-sm transition-colors", on ? "border-paper bg-paper text-ink" : "border-line-strong text-silver hover:text-paper")}>
      {children}
    </button>
  );
}

function MiniSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (e: { target: { value: string } }) => void; options: readonly (readonly [string, string])[] }) {
  return (
    <select aria-label={label} value={value} onChange={onChange} className={`${inputClass} h-11 w-auto shrink-0 appearance-none pr-8 text-sm [&>option]:bg-charcoal`}>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

function NameDialog({ open, title, label, onClose, onSubmit }: { open: boolean; title: string; label: string; onClose: () => void; onSubmit: (name: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setName(""); setError(null); } }, [open]);
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await onSubmit(name.trim());
            onClose();
          } catch (err) {
            setError(errorMessage(err));
          }
          setBusy(false);
        }}
      >
        <TextField label={label} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} error={error} autoFocus required />
        <Button type="submit" loading={busy} disabled={!name.trim()} className="self-end">Create</Button>
      </form>
    </Dialog>
  );
}
