"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { api, errorMessage } from "@/lib/client/api";

/** Only ever redirect to a path on this site. */
function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/app";
}

function Notice({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "error" }) {
  return (
    <p role={tone === "error" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-sm leading-relaxed ${tone === "error" ? "border-danger/40 bg-danger/10 text-[#ffd0d0]" : "border-line-strong bg-white/5 text-silver"}`}>
      {children}
    </p>
  );
}

function GoogleButton({ next }: { next: string }) {
  return (
    <>
      <Button type="button" variant="secondary" className="w-full" onClick={() => signIn("google", { callbackUrl: next })}>
        <svg viewBox="0 0 18 18" className="size-4" aria-hidden="true">
          <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
          <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.33-1.58-5.04-3.7H.96v2.33A9 9 0 0 0 9 18z" />
          <path fill="#FBBC05" d="M3.96 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3-2.33z" />
          <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59A9 9 0 0 0 .96 4.95l3 2.33C4.67 5.16 6.66 3.58 9 3.58z" />
        </svg>
        Continue with Google
      </Button>
      <div className="flex items-center gap-3 text-xs text-mute" aria-hidden="true">
        <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
      </div>
    </>
  );
}

export function LoginForm({ google }: { google: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [error, setError] = useState<string | null>(params.get("error") ? "We couldn't sign you in. Please try again." : null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const f = new FormData(e.currentTarget);
    const res = await signIn("credentials", { email: f.get("email"), password: f.get("password"), redirect: false });
    if (res?.error) {
      setError("That email and password don't match. Check them and try again.");
      setBusy(false);
      return;
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="display text-4xl">Welcome back.</h1>
        <p className="mt-2 text-silver">Sign in to see what's waiting for you.</p>
      </div>
      {params.get("reset") && <Notice>Your password has been changed. Sign in with the new one.</Notice>}
      {params.get("deleted") && <Notice>Your account and everything in it has been deleted.</Notice>}
      {google && <GoogleButton next={next} />}
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <TextField label="Email" name="email" type="email" autoComplete="email" required autoFocus />
        <TextField label="Password" name="password" type="password" autoComplete="current-password" required />
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" loading={busy} className="mt-1 w-full">Sign in</Button>
      </form>
      <div className="flex items-center justify-between text-sm text-silver">
        <Link href="/forgot-password" className="hover:text-paper">Forgot your password?</Link>
        <Link href={`/register${next !== "/app" ? `?next=${encodeURIComponent(next)}` : ""}`} className="text-paper hover:underline">Create an account</Link>
      </div>
    </div>
  );
}

export function RegisterForm({ google }: { google: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email"));
    const password = String(f.get("password"));
    if (password.length < 10) return setError("Choose a password with at least 10 characters.");
    setBusy(true);
    setError(null);
    try {
      await api("/auth/register", { body: { name: f.get("name"), email, password, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } });
      const res = await signIn("credentials", { email, password, redirect: false });
      if (res?.error) throw new Error("Your account was created. Please sign in.");
      router.replace(next);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="display text-4xl">Begin with today.</h1>
        <p className="mt-2 text-silver">Create your account. It's free, and takes a minute.</p>
      </div>
      {google && <GoogleButton next={next} />}
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <TextField label="Your name" name="name" autoComplete="name" required maxLength={80} autoFocus />
        <TextField label="Email" name="email" type="email" autoComplete="email" required hint="This is where your capsules will find you, so use one you expect to keep." />
        <TextField label="Password" name="password" type="password" autoComplete="new-password" required minLength={10} hint="At least 10 characters." />
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" loading={busy} className="mt-1 w-full">Create account</Button>
      </form>
      <p className="text-xs leading-relaxed text-mute">
        By creating an account you agree to our <Link href="/legal/terms" className="underline hover:text-silver">Terms</Link> and <Link href="/legal/privacy" className="underline hover:text-silver">Privacy Policy</Link>.
      </p>
      <p className="text-sm text-silver">
        Already have an account? <Link href="/login" className="text-paper hover:underline">Sign in</Link>
      </p>
    </div>
  );
}

export function ForgotForm() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/auth/forgot-password", { body: { email: new FormData(e.currentTarget).get("email") } });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    }
    setBusy(false);
  }
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="display text-4xl">Reset your password.</h1>
        <p className="mt-2 text-silver">Enter your email and we'll send you a link to choose a new one.</p>
      </div>
      {sent ? (
        <Notice>If there's an account for that address, a reset link is on its way. It works for one hour.</Notice>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <TextField label="Email" name="email" type="email" autoComplete="email" required autoFocus />
          {error && <Notice tone="error">{error}</Notice>}
          <Button type="submit" loading={busy} className="w-full">Send reset link</Button>
        </form>
      )}
      <Link href="/login" className="text-sm text-silver hover:text-paper">Back to sign in</Link>
    </div>
  );
}

export function ResetForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [error, setError] = useState<string | null>(token ? null : "This reset link is incomplete. Request a new one.");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const password = String(new FormData(e.currentTarget).get("password"));
    if (password.length < 10) return setError("Choose a password with at least 10 characters.");
    setBusy(true);
    setError(null);
    try {
      await api("/auth/reset-password", { body: { token, password } });
      router.replace("/login?reset=1");
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col gap-5">
      <h1 className="display text-4xl">Choose a new password.</h1>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <TextField label="New password" name="password" type="password" autoComplete="new-password" required minLength={10} hint="At least 10 characters. You'll be signed out everywhere else." autoFocus />
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" loading={busy} disabled={!token} className="w-full">Change password</Button>
      </form>
      <Link href="/forgot-password" className="text-sm text-silver hover:text-paper">Request a new link</Link>
    </div>
  );
}

export function VerifyEmail() {
  const token = useSearchParams().get("token") ?? "";
  const [state, setState] = useState<"working" | "ok" | "error">("working");
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!token) {
      setState("error");
      setMessage("This confirmation link is incomplete.");
      return;
    }
    let cancelled = false;
    api("/auth/verify-email", { body: { token } })
      .then(() => !cancelled && setState("ok"))
      .catch((err) => {
        if (cancelled) return;
        setState("error");
        setMessage(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [token]);
  return (
    <div className="flex flex-col gap-5" aria-live="polite">
      <h1 className="display text-4xl">{state === "ok" ? "Email confirmed." : state === "error" ? "That link didn't work." : "Confirming your email…"}</h1>
      {state === "ok" && <p className="text-silver">Thank you. Your capsules will know where to find you.</p>}
      {state === "error" && <Notice tone="error">{message}</Notice>}
      {state !== "working" && (
        <Link href="/app" className="inline-flex h-11 items-center justify-center rounded-full bg-paper px-5 text-sm font-medium text-ink hover:bg-white">
          Continue
        </Link>
      )}
    </div>
  );
}
