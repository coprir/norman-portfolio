import Link from "next/link";
import { Logo } from "@/components/logo";
import { LinkButton } from "@/components/ui/button";

export function MarketingNav({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
        <Link href="/" aria-label="Dear Future Me — home" className="rounded-full py-2">
          <Logo />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-7 text-sm text-silver md:flex">
          <a href="/#how" className="hover:text-paper">How it works</a>
          <a href="/#shared" className="hover:text-paper">For others</a>
          <a href="/#privacy" className="hover:text-paper">Privacy</a>
          <a href="/#plans" className="hover:text-paper">Plans</a>
        </nav>
        <div className="flex items-center gap-1.5">
          {signedIn ? (
            <LinkButton href="/app" size="sm">Open app</LinkButton>
          ) : (
            <>
              <LinkButton href="/login" variant="ghost" size="sm" className="max-[400px]:hidden">Sign in</LinkButton>
              <LinkButton href="/register" size="sm">Get started</LinkButton>
            </>
          )}
        </div>
      </div>
      <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-ink via-ink/80 to-transparent" />
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:px-8 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-mute">Capture today. Meet yourself tomorrow.</p>
        </div>
        <FooterCol title="Product" links={[["How it works", "/#how"], ["Plans", "/#plans"], ["Questions", "/#faq"], ["Create an account", "/register"]]} />
        <FooterCol title="Trust" links={[["Privacy policy", "/legal/privacy"], ["Data retention", "/legal/retention"], ["How sealing works", "/legal/sealing"]]} />
        <FooterCol title="Legal" links={[["Terms of service", "/legal/terms"], ["Cookie policy", "/legal/cookies"]]} />
      </div>
      <div className="mx-auto max-w-6xl px-5 pb-10 text-xs text-mute sm:px-8">© {new Date().getFullYear()} Dear Future Me</div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <p className="eyebrow">{title}</p>
      <ul className="mt-4 space-y-2.5 text-sm text-silver">
        {links.map(([label, href]) => (
          <li key={href}>
            <Link href={href} className="hover:text-paper">{label}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
