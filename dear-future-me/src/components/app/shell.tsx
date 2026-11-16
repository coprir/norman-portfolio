"use client";

import { clsx } from "clsx";
import { Archive, Bell, Clock, Home, LogOut, PenLine, Settings, ShieldCheck, Hourglass } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useState } from "react";
import { Logo, LogoMark } from "@/components/logo";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/client/api";

type Me = { name: string; email: string; emailVerified: boolean; isAdmin: boolean; avatarUrl: string | null; unread: number };

const NAV = [
  { href: "/app", label: "Home", icon: Home, exact: true },
  { href: "/app/vault", label: "Memory Vault", short: "Vault", icon: Archive },
  { href: "/app/capsules", label: "Time Capsules", short: "Capsules", icon: Hourglass },
  { href: "/app/time-machine", label: "Time Machine", short: "Timeline", icon: Clock },
  { href: "/app/future-me", label: "Dear Future Me", short: "Write", icon: PenLine },
];

function VerifyBanner() {
  const toast = useToast();
  const [sent, setSent] = useState(false);
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line bg-blue/10 px-5 py-2.5 text-sm text-[#cfd9ff] sm:px-8">
      <span>Confirm your email address so your capsules can find you. You'll need to before you can seal one.</span>
      <button
        type="button"
        disabled={sent}
        onClick={async () => {
          try {
            await api("/auth/resend-verification", { method: "POST" });
            setSent(true);
            toast("Confirmation email sent. Check your inbox.");
          } catch (err) {
            toast(errorMessage(err), "error");
          }
        }}
        className="font-medium text-paper underline underline-offset-4 disabled:no-underline disabled:opacity-60"
      >
        {sent ? "Sent" : "Resend the email"}
      </button>
    </div>
  );
}

export function AppShell({ me, children }: { me: Me; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = (href: string, exact?: boolean) => (exact ? pathname === href : pathname.startsWith(href));
  const initial = me.name.trim().charAt(0).toUpperCase() || "·";

  return (
    <ToastProvider>
      <div className="flex min-h-dvh">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line px-3 py-5 md:flex">
          <Link href="/app" className="px-3 py-1" aria-label="Dear Future Me — home">
            <Logo size={24} />
          </Link>
          <nav aria-label="App" className="mt-8 flex flex-1 flex-col gap-0.5">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} aria-current={active(n.href, n.exact) ? "page" : undefined} className={clsx("flex h-10 items-center gap-3 rounded-xl px-3 text-[0.92rem] transition-colors", active(n.href, n.exact) ? "bg-white/8 text-paper" : "text-silver hover:bg-white/5 hover:text-paper")}>
                <n.icon className="size-[1.1rem]" aria-hidden="true" />
                {n.label}
              </Link>
            ))}
            {me.isAdmin && (
              <Link href="/admin" className="mt-4 flex h-10 items-center gap-3 rounded-xl px-3 text-[0.92rem] text-silver hover:bg-white/5 hover:text-paper">
                <ShieldCheck className="size-[1.1rem]" aria-hidden="true" /> Admin
              </Link>
            )}
          </nav>
          <div className="flex flex-col gap-0.5 border-t border-line pt-3">
            <Link href="/app/notifications" aria-current={active("/app/notifications") ? "page" : undefined} className={clsx("flex h-10 items-center gap-3 rounded-xl px-3 text-[0.92rem]", active("/app/notifications") ? "bg-white/8 text-paper" : "text-silver hover:bg-white/5 hover:text-paper")}>
              <Bell className="size-[1.1rem]" aria-hidden="true" /> Notifications
              {me.unread > 0 && <span className="ml-auto rounded-full bg-blue px-1.5 py-0.5 text-[0.68rem] font-semibold text-ink tnum">{me.unread}</span>}
            </Link>
            <Link href="/app/settings" aria-current={active("/app/settings") ? "page" : undefined} className={clsx("flex h-10 items-center gap-3 rounded-xl px-3 text-[0.92rem]", active("/app/settings") ? "bg-white/8 text-paper" : "text-silver hover:bg-white/5 hover:text-paper")}>
              <Settings className="size-[1.1rem]" aria-hidden="true" /> Settings
            </Link>
            <div className="mt-2 flex items-center gap-3 px-3 py-2">
              {me.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={me.avatarUrl} alt="" className="size-8 rounded-full object-cover" />
              ) : (
                <span className="grid size-8 place-items-center rounded-full bg-white/10 text-sm">{initial}</span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{me.name}</span>
                <span className="block truncate text-xs text-mute">{me.email}</span>
              </span>
              <button type="button" aria-label="Sign out" title="Sign out" onClick={() => signOut({ callbackUrl: "/" })} className="grid size-8 place-items-center rounded-full text-mute hover:bg-white/8 hover:text-paper">
                <LogOut className="size-4" />
              </button>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile top bar */}
          <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-line bg-ink/85 px-4 backdrop-blur md:hidden">
            <Link href="/app" aria-label="Home" className="flex items-center gap-2">
              <LogoMark size={24} />
            </Link>
            <div className="flex items-center gap-1">
              <Link href="/app/notifications" aria-label={`Notifications${me.unread ? `, ${me.unread} unread` : ""}`} className="relative grid size-10 place-items-center rounded-full text-silver">
                <Bell className="size-5" />
                {me.unread > 0 && <span className="absolute right-2 top-2 size-2 rounded-full bg-blue" />}
              </Link>
              <Link href="/app/settings" aria-label="Settings" className="grid size-10 place-items-center rounded-full text-silver">
                <Settings className="size-5" />
              </Link>
            </div>
          </header>
          {!me.emailVerified && <VerifyBanner />}
          <main id="main" className="flex-1 pb-24 md:pb-0">
            {children}
          </main>
        </div>

        {/* Mobile tab bar */}
        <nav aria-label="App" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-ink/92 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={active(n.href, n.exact) ? "page" : undefined} className={clsx("flex h-16 flex-col items-center justify-center gap-1 text-[0.66rem]", active(n.href, n.exact) ? "text-paper" : "text-mute")}>
              <n.icon className="size-5" aria-hidden="true" />
              {n.short ?? n.label}
            </Link>
          ))}
        </nav>
      </div>
    </ToastProvider>
  );
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="display mt-2 text-4xl sm:text-5xl">{title}</h1>
        {description && <p className="mt-3 max-w-xl leading-relaxed text-silver">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
    </div>
  );
}

export const pageClass = "mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-12";
