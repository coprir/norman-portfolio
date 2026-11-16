import { Bell } from "lucide-react";
import Link from "next/link";
import { PageHeader, pageClass } from "@/components/app/shell";
import { relativeTime } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const user = await requireUser();
  const items = await db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 60 });
  // Viewing the list marks everything in it as read.
  if (items.some((n) => !n.readAt)) await db.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-8 sm:py-12">
      <PageHeader eyebrow="Notifications" title="What's happened." />
      {items.length === 0 ? (
        <div className="mt-10 rounded-3xl border border-line px-6 py-16 text-center">
          <Bell className="mx-auto size-6 text-mute" aria-hidden="true" />
          <p className="mt-4 font-serif text-3xl">All quiet.</p>
          <p className="mt-2 text-silver">We'll tell you here, and by email, when a capsule opens.</p>
        </div>
      ) : (
        <ul className="mt-9 divide-y divide-line rounded-3xl border border-line">
          {items.map((n) => {
            const href = n.capsuleId ? (n.type === "CAPSULE_UNLOCKED" ? `/app/capsules/${n.capsuleId}/open` : `/app/capsules/${n.capsuleId}`) : n.type === "STORAGE_WARNING" ? "/app/settings#plan" : null;
            const body = (
              <>
                <span className={`mt-2 size-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-blue"}`} aria-label={n.readAt ? undefined : "New"} />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{n.title}</span>
                  <span className="block text-sm text-silver">{n.body}</span>
                </span>
                <span className="shrink-0 text-xs text-mute">{relativeTime(n.createdAt)}</span>
              </>
            );
            return <li key={n.id}>{href ? <Link href={href} className="flex gap-3.5 px-5 py-4 hover:bg-white/[0.03]">{body}</Link> : <div className="flex gap-3.5 px-5 py-4">{body}</div>}</li>;
          })}
        </ul>
      )}
    </div>
  );
}
