import Link from "next/link";
import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative isolate flex min-h-dvh flex-col">
      <div className="starfield absolute inset-0 -z-10 opacity-50" />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(50%_40%_at_50%_0%,rgb(100_139_255/0.12),transparent_70%)]" />
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center px-5 sm:px-8">
        <Link href="/" aria-label="Dear Future Me — home">
          <Logo />
        </Link>
      </header>
      <main id="main" className="flex flex-1 items-center justify-center px-5 py-10">
        <div className="w-full max-w-[26rem]">{children}</div>
      </main>
    </div>
  );
}
