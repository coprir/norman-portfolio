import { clsx } from "clsx";
import { Lock, LockOpen, PenLine, Users } from "lucide-react";
import Link from "next/link";
import { Countdown } from "@/components/countdown";
import { LogoMark } from "@/components/logo";
import { formatDate } from "@/lib/format";
import type { CapsuleDTO } from "@/server/capsules/service";

export const STATUS_LABEL: Record<CapsuleDTO["status"], string> = { DRAFT: "Draft", SEALING: "Sealing…", LOCKED: "Sealed", AVAILABLE: "Ready to open", OPENED: "Opened" };

export function StatusPill({ status }: { status: CapsuleDTO["status"] }) {
  const Icon = status === "DRAFT" ? PenLine : status === "LOCKED" || status === "SEALING" ? Lock : LockOpen;
  return (
    <span className={clsx("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.72rem] font-medium", status === "AVAILABLE" ? "border-blue/60 bg-blue/15 text-[#cfd9ff]" : status === "DRAFT" ? "border-dashed border-line-strong text-silver" : "border-line-strong text-silver")}>
      <Icon className="size-3" aria-hidden="true" />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function recipientLabel(c: CapsuleDTO): string {
  if (!c.isCreator) return `From ${c.creator.name}`;
  const others = (c.recipients ?? []).filter((r) => !r.isSelf);
  if (!others.length) return "For you";
  const first = others[0].name || others[0].email;
  const rest = others.length - 1 + (c.includeSelf ? 1 : 0);
  return `For ${first}${rest > 0 ? ` and ${rest} ${rest === 1 ? "other" : "others"}` : ""}`;
}

export function capsuleHref(c: CapsuleDTO) {
  return c.status === "DRAFT" && c.isCreator ? `/app/capsules/${c.id}/edit` : `/app/capsules/${c.id}`;
}

/** The outside of a capsule: label, dates, countdown. Never anything from inside. */
export function CapsuleCard({ capsule: c }: { capsule: CapsuleDTO }) {
  return (
    <Link href={capsuleHref(c)} className="group flex flex-col overflow-hidden rounded-3xl border border-line bg-white/[0.02] transition-colors hover:border-line-strong">
      <div className="relative aspect-[16/10] overflow-hidden bg-gradient-to-br from-[#1a2140] via-navy to-ink">
        {c.coverThumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.coverThumbUrl} alt="" className={clsx("size-full object-cover transition-transform duration-700 group-hover:scale-[1.03]", (c.status === "LOCKED" || c.status === "SEALING") && "opacity-70 saturate-50")} />
        ) : (
          <div className="grid size-full place-items-center text-white/15"><LogoMark size={64} accent="currentColor" /></div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-transparent" />
        <div className="absolute left-4 top-4"><StatusPill status={c.status} /></div>
        {c.status === "LOCKED" && c.unlockAt && (
          <div className="absolute inset-x-4 bottom-3.5"><Countdown to={c.unlockAt} size="sm" refreshOnElapsed /></div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <h3 className="font-serif text-2xl leading-tight">{c.title}</h3>
        <dl className="mt-auto grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          {c.sealedAt && (
            <div>
              <dt className="text-xs text-mute">Sealed</dt>
              <dd className="text-silver">{formatDate(c.sealedAt, { day: "numeric", month: "short", year: "numeric" })}</dd>
            </div>
          )}
          {c.unlockAt && (
            <div>
              <dt className="text-xs text-mute">{c.isReleased ? "Opened on" : c.status === "DRAFT" ? "Planned for" : "Opens"}</dt>
              <dd className="text-silver">{formatDate(c.unlockAt, { day: "numeric", month: "short", year: "numeric" })}</dd>
            </div>
          )}
        </dl>
        <p className="flex items-center gap-1.5 text-xs text-mute"><Users className="size-3.5" aria-hidden="true" /> {recipientLabel(c)}</p>
      </div>
    </Link>
  );
}
