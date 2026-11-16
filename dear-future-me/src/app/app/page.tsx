import { Archive, Clock, PenLine } from "lucide-react";
import Link from "next/link";
import { pageClass } from "@/components/app/shell";
import { CapsuleCard, capsuleHref, recipientLabel } from "@/components/capsules/capsule-card";
import { NewCapsuleButton } from "@/components/capsules/new-capsule-button";
import { Countdown } from "@/components/countdown";
import { LinkButton } from "@/components/ui/button";
import { MemoryCard } from "@/components/vault/memory-card";
import { formatDate } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { listCapsules } from "@/server/capsules/service";
import { listMemories } from "@/server/memories";

export const metadata = { title: "Home" };

export default async function Dashboard() {
  const user = await requireUser();
  const [{ created, received, contributing }, recent] = await Promise.all([listCapsules(user), listMemories(user.id, { take: 6, sort: "uploaded" })]);
  const all = [...created, ...received];
  const ready = all.filter((c) => c.status === "AVAILABLE" && !c.iHaveOpened);
  const sealed = all.filter((c) => c.status === "LOCKED" && c.unlockAt).sort((a, b) => a.unlockAt!.localeCompare(b.unlockAt!));
  const next = sealed[0];
  const drafts = created.filter((c) => c.status === "DRAFT");
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: user.timezone }).format(new Date()));
  const greeting = hour < 5 ? "Still up" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className={pageClass}>
      <p className="eyebrow">{formatDate(new Date(), { weekday: "long", day: "numeric", month: "long", year: "numeric" }, user.timezone)}</p>
      <h1 className="display mt-2 text-4xl sm:text-5xl">{greeting}, {user.name.split(" ")[0]}.</h1>

      {ready.length > 0 && (
        <section className="mt-9 rounded-[2rem] border border-blue/40 bg-blue/[0.07] p-6 sm:p-8" aria-labelledby="ready-h">
          <p className="eyebrow !text-[#b9c9ff]">Today</p>
          <h2 id="ready-h" className="display mt-3 text-3xl sm:text-4xl">{ready.length === 1 ? "A capsule is ready to open." : `${ready.length} capsules are ready to open.`}</h2>
          <ul className="mt-6 divide-y divide-white/10">
            {ready.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
                <div>
                  <p className="text-lg font-medium">{c.title}</p>
                  <p className="text-sm text-silver">{recipientLabel(c)}{c.sealedAt && ` · sealed ${formatDate(c.sealedAt)}`}</p>
                </div>
                <LinkButton href={`/app/capsules/${c.id}/open`}>Open it</LinkButton>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-9 grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <div className="relative overflow-hidden rounded-[2rem] border border-line bg-navy/60 p-6 sm:p-9">
          <div className="starfield absolute inset-0 opacity-40" aria-hidden="true" />
          <div className="relative">
            {next ? (
              <>
                <p className="eyebrow">Next to open</p>
                <h2 className="mt-3 font-serif text-3xl leading-tight sm:text-4xl">{next.title}</h2>
                <p className="mt-1.5 text-sm text-silver">{recipientLabel(next)} · {formatDate(next.unlockAt!, undefined, next.timezone)}</p>
                <div className="mt-9"><Countdown to={next.unlockAt!} size="lg" refreshOnElapsed /></div>
                <Link href={capsuleHref(next)} className="mt-9 inline-block text-sm text-silver underline underline-offset-4 hover:text-paper">View capsule</Link>
              </>
            ) : (
              <>
                <p className="eyebrow">Nothing sealed yet</p>
                <h2 className="mt-3 max-w-md font-serif text-3xl leading-tight sm:text-4xl">Leave something for the person you'll be.</h2>
                <p className="mt-3 max-w-md text-silver">Pick a few memories and a date. It takes a few minutes, and then it's out of your hands.</p>
                <div className="mt-8"><NewCapsuleButton>Create a capsule</NewCapsuleButton></div>
              </>
            )}
          </div>
        </div>
        <div className="grid gap-4">
          {[
            { href: "/app/future-me", icon: PenLine, title: "Write to your future self", body: "Answer a few questions about your life right now." },
            { href: "/app/vault", icon: Archive, title: "Add to your vault", body: "Upload photographs, videos or a voice note." },
            { href: "/app/time-machine", icon: Clock, title: "Open the Time Machine", body: `${sealed.length} sealed · ${recent.total} ${recent.total === 1 ? "memory" : "memories"} kept` },
          ].map((a) => (
            <Link key={a.href} href={a.href} className="flex items-center gap-4 rounded-3xl border border-line bg-white/[0.02] p-5 transition-colors hover:border-line-strong">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/6"><a.icon className="size-5 text-silver" aria-hidden="true" /></span>
              <span>
                <span className="block font-medium">{a.title}</span>
                <span className="block text-sm text-mute">{a.body}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      {(drafts.length > 0 || contributing.length > 0) && (
        <section className="mt-12">
          <h2 className="font-serif text-3xl">Unfinished</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...drafts, ...contributing].slice(0, 3).map((c) => <CapsuleCard key={c.id} capsule={c} />)}
          </div>
        </section>
      )}

      {sealed.length > 1 && (
        <section className="mt-12">
          <div className="flex items-baseline justify-between">
            <h2 className="font-serif text-3xl">Also waiting</h2>
            <Link href="/app/capsules" className="text-sm text-silver hover:text-paper">All capsules</Link>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sealed.slice(1, 4).map((c) => <CapsuleCard key={c.id} capsule={c} />)}
          </div>
        </section>
      )}

      {recent.items.length > 0 && (
        <section className="mt-12">
          <div className="flex items-baseline justify-between">
            <h2 className="font-serif text-3xl">Recently added to your vault</h2>
            <Link href="/app/vault" className="text-sm text-silver hover:text-paper">Open vault</Link>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-2.5 sm:grid-cols-6 sm:gap-3">
            {recent.items.map((m) => (
              <Link key={m.id} href="/app/vault" aria-label={m.title ?? "Memory"} className="[&>button]:pointer-events-none">
                <MemoryCard memory={m} />
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
