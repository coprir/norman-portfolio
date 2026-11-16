"use client";

import { clsx } from "clsx";
import { Box, Lock, LockOpen, Rows3 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { PageHeader, pageClass } from "@/components/app/shell";
import { inputClass } from "@/components/ui/field";
import { formatDate, relativeTime } from "@/lib/format";

export type TimelineEntry = {
  id: string;
  kind: "memory" | "sealed" | "opens" | "opened";
  date: string;
  title: string;
  note?: string;
  thumbUrl?: string | null;
  href: string;
  categoryId?: string | null;
  mediaType?: string;
};

const FILTERS = [["all", "Everything"], ["past", "Past memories"], ["upcoming", "Upcoming releases"], ["sealed", "Sealed capsules"], ["opened", "Recently opened"]] as const;

/** One line through a life: memories behind, sealed capsules ahead, and today in between. */
export function TimeMachine({ entries, categories, today }: { entries: TimelineEntry[]; categories: { id: string; name: string }[]; today: string }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("all");
  const [category, setCategory] = useState("");
  const [order, setOrder] = useState<"future-first" | "past-first">("future-first");
  const [depth, setDepth] = useState(false);
  const [jump, setJump] = useState("");
  const refs = useRef(new Map<string, HTMLElement>());
  const now = new Date(today).getTime();

  const shown = useMemo(() => {
    const list = entries.filter((e) => {
      const t = new Date(e.date).getTime();
      if (category && e.categoryId !== category) return false;
      if (filter === "past") return e.kind === "memory";
      if (filter === "upcoming") return e.kind === "opens" && t > now;
      if (filter === "sealed") return e.kind === "sealed" || e.kind === "opens";
      if (filter === "opened") return e.kind === "opened";
      return true;
    });
    return list.sort((a, b) => (order === "future-first" ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)));
  }, [entries, filter, category, order, now]);

  const years = useMemo(() => {
    const map = new Map<number, Map<number, TimelineEntry[]>>();
    for (const e of shown) {
      const d = new Date(e.date);
      const y = map.get(d.getFullYear()) ?? new Map<number, TimelineEntry[]>();
      y.set(d.getMonth(), [...(y.get(d.getMonth()) ?? []), e]);
      map.set(d.getFullYear(), y);
    }
    return [...map];
  }, [shown]);

  const scrollTo = (key: string) => refs.current.get(key)?.scrollIntoView({ behavior: "smooth", block: "start" });

  // Start at today rather than at the far future.
  useEffect(() => {
    const y = new Date(today).getFullYear();
    const t = setTimeout(() => refs.current.get(`y${y}`)?.scrollIntoView({ block: "start" }), 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onJump(value: string) {
    setJump(value);
    if (!value) return;
    const [y, m] = value.split("-").map(Number);
    if (refs.current.has(`y${y}m${m - 1}`)) return scrollTo(`y${y}m${m - 1}`);
    // Nearest year that has anything in it.
    const nearest = years.map(([yr]) => yr).sort((a, b) => Math.abs(a - y) - Math.abs(b - y))[0];
    if (nearest !== undefined) scrollTo(`y${nearest}`);
  }

  const thisYear = new Date(today).getFullYear();

  return (
    <div className={pageClass}>
      <PageHeader eyebrow="The Time Machine" title="Behind you, and ahead." description="Everything you've kept and everything that's waiting, on one line." />

      <div className="mt-8 flex flex-wrap items-center gap-2.5">
        <div className="scrollbar-none -mx-5 flex gap-2 overflow-x-auto px-5 sm:mx-0 sm:flex-wrap sm:px-0">
          {FILTERS.map(([v, l]) => (
            <button key={v} type="button" aria-pressed={filter === v} onClick={() => setFilter(v)} className={clsx("h-9 shrink-0 rounded-full border px-3.5 text-sm", filter === v ? "border-paper bg-paper text-ink" : "border-line-strong text-silver hover:text-paper")}>{l}</button>
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2.5">
        <select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)} className={`${inputClass} h-10 w-auto appearance-none pr-8 text-sm [&>option]:bg-charcoal`}>
          <option value="">Any category</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select aria-label="Order" value={order} onChange={(e) => setOrder(e.target.value as typeof order)} className={`${inputClass} h-10 w-auto appearance-none pr-8 text-sm [&>option]:bg-charcoal`}>
          <option value="future-first">Future first</option>
          <option value="past-first">Past first</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-silver">
          Go to
          <input type="month" value={jump} onChange={(e) => onJump(e.target.value)} className={`${inputClass} h-10 w-auto text-sm`} />
        </label>
        <button type="button" aria-pressed={depth} onClick={() => setDepth((d) => !d)} className={clsx("ml-auto flex h-10 items-center gap-2 rounded-full border px-3.5 text-sm", depth ? "border-paper bg-paper text-ink" : "border-line-strong text-silver hover:text-paper")}>
          {depth ? <Rows3 className="size-4" /> : <Box className="size-4" />} {depth ? "Flat view" : "Depth view"}
        </button>
      </div>

      {years.length > 0 && (
        <nav aria-label="Years" className="scrollbar-none sticky top-14 z-20 -mx-5 mt-6 flex gap-1 overflow-x-auto border-y border-line bg-ink/90 px-5 py-2 backdrop-blur sm:mx-0 sm:rounded-full sm:border sm:px-2 md:top-3">
          {years.map(([y]) => (
            <button key={y} type="button" onClick={() => scrollTo(`y${y}`)} className={clsx("h-8 shrink-0 rounded-full px-3 text-sm tnum hover:bg-white/8", y === thisYear ? "text-paper" : y > thisYear ? "text-[#b9c9ff]" : "text-silver")}>{y}</button>
          ))}
        </nav>
      )}

      {shown.length === 0 ? (
        <div className="mt-8 rounded-3xl border border-line px-6 py-16 text-center">
          <p className="font-serif text-3xl">Nothing on the line yet.</p>
          <p className="mx-auto mt-3 max-w-sm text-silver">Add memories to your vault or seal a capsule, and it will appear here.</p>
        </div>
      ) : (
        <div className={clsx("mt-8", depth && "[perspective:1400px]")}>
          <div className={clsx("space-y-14 transition-transform duration-700 ease-out-soft", depth && "origin-top [transform:rotateX(14deg)] motion-reduce:[transform:none]")}>
            {years.map(([year, months]) => (
              <section key={year} ref={(el) => { if (el) refs.current.set(`y${year}`, el); }} className="scroll-mt-32 md:scroll-mt-20" aria-label={String(year)}>
                <h2 className={clsx("font-serif text-7xl leading-none tnum sm:text-8xl", year > thisYear ? "text-[#b9c9ff]/50" : year === thisYear ? "text-paper" : "text-white/25")}>{year}</h2>
                <div className="relative mt-6 space-y-9 border-l border-line pl-6 sm:pl-10">
                  {[...months].map(([month, list]) => (
                    <div key={month} ref={(el) => { if (el) refs.current.set(`y${year}m${month}`, el); }} className="scroll-mt-32 md:scroll-mt-20">
                      <h3 className="eyebrow">{formatDate(new Date(year, month, 15), { month: "long" })}</h3>
                      <ul className="mt-3 space-y-2.5">
                        {list.map((e) => {
                          const future = new Date(e.date).getTime() > now;
                          return (
                            <li key={`${e.kind}-${e.id}`} className="relative">
                              <span className={clsx("absolute top-6 size-2.5 -translate-x-1/2 rounded-full -left-6 sm:-left-10", e.kind === "memory" ? "bg-silver" : future ? "border border-[#b9c9ff] bg-ink" : "bg-paper")} aria-hidden="true" />
                              <Link href={e.href} className={clsx("flex items-center gap-4 rounded-2xl border p-3 pr-5 transition-colors hover:border-line-strong", e.kind === "opens" && future ? "border-blue/30 bg-blue/[0.05]" : "border-line bg-white/[0.02]")}>
                                <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-charcoal text-mute">
                                  {e.thumbUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={e.thumbUrl} alt="" loading="lazy" className={clsx("size-full object-cover", e.kind !== "memory" && e.kind !== "opened" && "opacity-60 saturate-50")} />
                                  ) : e.kind === "memory" ? (
                                    <span className="text-[0.6rem] uppercase tracking-wider">{e.mediaType?.toLowerCase()}</span>
                                  ) : e.kind === "opened" ? (
                                    <LockOpen className="size-5" />
                                  ) : (
                                    <Lock className="size-5" />
                                  )}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate font-medium">{e.title}</span>
                                  <span className="block truncate text-sm text-mute">
                                    {e.kind === "sealed" ? "Sealed" : e.kind === "opens" ? (future ? `Opens ${relativeTime(e.date, now)}` : "Opening") : e.kind === "opened" ? "Opened" : e.note || "Memory"}
                                    {e.kind !== "memory" && e.note ? ` · ${e.note}` : ""}
                                  </span>
                                </span>
                                <span className="shrink-0 text-sm text-mute tnum">{formatDate(e.date, { day: "numeric", month: "short" })}</span>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
