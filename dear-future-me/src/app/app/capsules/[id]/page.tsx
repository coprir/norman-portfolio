import { ArrowLeft, Check, Lock, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CapsuleVisual } from "@/components/capsule/capsule";
import { recipientLabel, StatusPill } from "@/components/capsules/capsule-card";
import { ContributePanel, InvitationActions, SealingWatcher } from "@/components/capsules/detail-actions";
import { Reflection } from "@/components/capsules/reflection";
import { Countdown } from "@/components/countdown";
import { LinkButton } from "@/components/ui/button";
import { formatDate, formatDateTime } from "@/lib/format";
import { aiConfigured } from "@/server/ai";
import { requireUser } from "@/server/auth/session";
import { verifyEventChain } from "@/server/capsules/events";
import { countMyContributions, getCapsule, getContents } from "@/server/capsules/service";
import { db } from "@/server/db";
import { ApiError } from "@/server/errors";

export const metadata = { title: "Capsule" };

const EVENT_LABEL: Record<string, string> = {
  created: "Draft created",
  seal_requested: "Sealing declaration accepted",
  sealing_failed: "Sealing did not complete — nothing was changed",
  sealed: "Contents encrypted and sealed",
  release_verified: "Seal verified against its fingerprint",
  released: "Released on schedule",
  release_failed: "A release attempt failed and will be retried",
  opened: "Opened",
  invitation_accepted: "A recipient accepted",
  invitation_declined: "A recipient declined",
};

export default async function CapsulePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sealed?: string }> }) {
  const { id } = await params;
  const { sealed: justSealed } = await searchParams;
  const user = await requireUser();
  const c = await getCapsule(user, id).catch((err) => {
    if (err instanceof ApiError) notFound();
    throw err;
  });
  if (c.status === "DRAFT" && c.isCreator) redirect(`/app/capsules/${id}/edit`);

  const sealed = c.status === "LOCKED" || c.status === "SEALING";
  const [events, chain, contents, myContributions] = await Promise.all([
    c.isCreator ? db.capsuleEvent.findMany({ where: { capsuleId: id }, orderBy: { seq: "asc" } }) : [],
    c.isCreator ? verifyEventChain(id) : null,
    c.canViewContents && c.iHaveOpened ? getContents(user, id) : null,
    c.status === "DRAFT" ? countMyContributions(user.id, id) : 0,
  ]);
  const row = c.isCreator ? await db.capsule.findUnique({ where: { id }, select: { contentIntegrityHash: true } }) : null;

  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-7 sm:px-8 sm:py-10">
      <Link href="/app/capsules" className="inline-flex items-center gap-1.5 text-sm text-silver hover:text-paper"><ArrowLeft className="size-4" /> Capsules</Link>

      <section className="relative mt-6 overflow-hidden rounded-[2rem] border border-line bg-navy/60">
        <div className="starfield absolute inset-0 opacity-50" aria-hidden="true" />
        {c.coverThumbUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.coverThumbUrl} alt="" className="absolute inset-0 size-full object-cover opacity-25 blur-sm saturate-50" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/70 to-ink/30" aria-hidden="true" />
        <div className="relative grid gap-6 p-6 sm:p-10 md:grid-cols-[1fr_15rem] md:items-center">
          <div>
            <StatusPill status={c.status} />
            <h1 className="display mt-5 text-4xl sm:text-6xl">{c.title}</h1>
            {c.description && <p className="mt-3 max-w-lg text-silver">{c.description}</p>}
            <p className="mt-3 text-sm text-mute">{recipientLabel(c)}</p>

            {c.status === "SEALING" && (
              <div className="mt-8" role="status">
                <SealingWatcher />
                <p className="font-serif text-2xl">Sealing…</p>
                <p className="mt-1 text-sm text-silver">Your memories are being encrypted. This page will update on its own.</p>
              </div>
            )}
            {c.status === "LOCKED" && c.unlockAt && (
              <div className="mt-9">
                <p className="eyebrow mb-4">Opens in</p>
                <Countdown to={c.unlockAt} size="lg" refreshOnElapsed />
              </div>
            )}
            {c.isReleased && (
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <LinkButton href={`/app/capsules/${id}/open`} size="lg">{c.iHaveOpened ? "Open it again" : "Open your capsule"}</LinkButton>
                {!c.iHaveOpened && <p className="text-sm text-silver">It's ready whenever you are.</p>}
              </div>
            )}
          </div>
          <CapsuleVisual open={c.isReleased ? 0.35 : 0} particles={false} className="mx-auto hidden size-60 md:block" />
        </div>
      </section>

      {justSealed && sealed && (
        <p role="status" className="mt-5 flex items-start gap-3 rounded-2xl border border-line-strong bg-white/[0.04] p-5 text-silver">
          <Check className="mt-0.5 size-5 shrink-0 text-ok" aria-hidden="true" />
          Sealed. Everything inside has been encrypted and removed from your vault. There's nothing more to do but wait.
        </p>
      )}

      <dl className="mt-5 grid gap-px overflow-hidden rounded-3xl border border-line bg-line sm:grid-cols-3">
        {[
          ["Sealed", c.sealedAt ? formatDate(c.sealedAt, undefined, c.timezone) : "Not yet"],
          [c.isReleased ? "Opened on" : "Opens", c.unlockAt ? formatDateTime(c.unlockAt, c.timezone) : "No date yet"],
          ["Inside", c.itemCount == null ? "You'll find out" : `${c.itemCount} ${c.itemCount === 1 ? "item" : "items"}`],
        ].map(([k, v]) => (
          <div key={k} className="bg-ink p-5">
            <dt className="eyebrow">{k}</dt>
            <dd className="mt-2">{v}</dd>
          </div>
        ))}
      </dl>

      {sealed && (
        <section className="mt-5 flex gap-4 rounded-3xl border border-line p-6">
          <Lock className="mt-0.5 size-5 shrink-0 text-silver" aria-hidden="true" />
          <div className="text-sm leading-relaxed text-silver">
            <p className="text-base text-paper">This capsule is sealed.</p>
            <p className="mt-1.5">It can't be opened, edited, rescheduled, downloaded or deleted before its date — by you, by its recipients, or by our team. Its contents exist only in encrypted form until then. <Link href="/legal/sealing" className="underline hover:text-paper">How sealing works</Link></p>
          </div>
        </section>
      )}

      {c.status === "DRAFT" && !c.isCreator && c.canContribute && (
        <section className="mt-8">
          <h2 className="font-serif text-3xl">Add your memories</h2>
          <p className="mb-5 mt-2 text-silver">{c.creator.name} invited you to add to this capsule before it's sealed{c.unlockAt ? `. It's planned to open on ${formatDate(c.unlockAt)}` : ""}.</p>
          <ContributePanel capsuleId={id} initialCount={myContributions} />
        </section>
      )}

      {!c.isCreator && c.myInvitation && c.status !== "DRAFT" && !c.isReleased && (
        <section className="mt-5 rounded-3xl border border-line p-6">
          <h2 className="text-lg font-medium">{c.creator.name} made this for you</h2>
          <p className="mb-4 mt-1 text-sm text-silver">You can't see inside until it opens. Accept, and we'll let you know on the day.</p>
          <InvitationActions capsuleId={id} status={c.myInvitation.status} />
        </section>
      )}

      {c.isCreator && c.recipients && c.recipients.length > 0 && (
        <section className="mt-8">
          <h2 className="font-serif text-3xl">Recipients</h2>
          <ul className="mt-4 divide-y divide-line rounded-3xl border border-line">
            {c.recipients.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-4 px-5 py-4">
                <span className="min-w-0">
                  <span className="block truncate">{r.isSelf ? "You" : r.name || r.email}</span>
                  {!r.isSelf && r.name && <span className="block truncate text-xs text-mute">{r.email}</span>}
                </span>
                <span className="shrink-0 text-xs text-mute">{r.isSelf ? "" : r.invitationStatus === "ACCEPTED" ? "Accepted" : r.invitationStatus === "DECLINED" ? "Declined" : "Invited"}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {contents && contents.answers.length > 0 && (
        <div className="mt-12"><Reflection capsuleId={id} answers={contents.answers} ai={aiConfigured() && user.aiConsent} /></div>
      )}

      {c.isCreator && events.length > 0 && (
        <section className="mt-12">
          <h2 className="font-serif text-3xl">History</h2>
          <p className="mt-2 flex items-center gap-2 text-sm text-silver">
            <ShieldCheck className={`size-4 ${chain?.ok ? "text-ok" : "text-danger"}`} aria-hidden="true" />
            {chain?.ok ? "This record is permanent and its chain of entries is intact." : "Warning: this record failed its integrity check."}
          </p>
          <ol className="mt-5 space-y-4 border-l border-line pl-6">
            {events.map((e) => (
              <li key={e.seq} className="relative">
                <span className="absolute -left-[1.72rem] top-1.5 size-2 rounded-full bg-silver" aria-hidden="true" />
                <p>{EVENT_LABEL[e.type] ?? e.type}</p>
                <p className="text-xs text-mute">{formatDateTime(e.createdAt, c.timezone)}</p>
              </li>
            ))}
          </ol>
          {row?.contentIntegrityHash && (
            <p className="mt-6 break-all text-xs text-mute">Content fingerprint (SHA-256): <span className="font-mono">{row.contentIntegrityHash}</span></p>
          )}
        </section>
      )}
    </div>
  );
}
