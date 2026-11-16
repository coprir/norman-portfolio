import Link from "next/link";
import { Logo } from "@/components/logo";

export default function NotFound() {
  return (
    <main id="main" className="grid min-h-dvh place-items-center px-5 text-center">
      <div>
        <Logo className="justify-center" />
        <h1 className="display mt-10 text-6xl">Nothing here.</h1>
        <p className="mt-4 text-silver">This page doesn't exist, or isn't yours to see.</p>
        <Link href="/" className="mt-8 inline-flex h-11 items-center rounded-full bg-paper px-5 text-sm font-medium text-ink hover:bg-white">Go home</Link>
      </div>
    </main>
  );
}
