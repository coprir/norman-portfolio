"use client";

import { clsx } from "clsx";
import { Check, Download } from "lucide-react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { PageHeader } from "@/components/app/shell";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { SelectField, TextField } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/client/api";
import { formatBytes, formatDate } from "@/lib/format";

type Profile = {
  name: string; email: string; emailVerified: boolean; timezone: string; dateOfBirth: string | null; createdAt: string; hasPassword: boolean; aiConsent: boolean;
  notificationPrefs: Record<string, { email?: boolean }>; avatarUrl: string | null;
  plan: { id: string; name: string }; storage: { usedBytes: number; limitBytes: number }; activeCapsules: number;
};
type Plan = { id: string; name: string; description: string; priceCentsMonthly: number; currency: string; highlights: string[]; purchasable: boolean };
type Props = { profile: Profile; plans: Plan[]; billingEnabled: boolean; aiAvailable: boolean; notificationTypes: { type: string; label: string; locked: boolean; defaultOn: boolean }[]; hasBilling: boolean };

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-24 border-t border-line py-10 first:border-t-0 lg:grid lg:grid-cols-[16rem_1fr] lg:gap-10">
      <div>
        <h2 id={`${id}-h`} className="font-serif text-2xl">{title}</h2>
        {description && <p className="mt-1.5 text-sm leading-relaxed text-mute">{description}</p>}
      </div>
      <div className="mt-5 lg:mt-0">{children}</div>
    </section>
  );
}

function Toggle({ checked, onChange, disabled, label, hint }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string; hint?: string }) {
  return (
    <label className={clsx("flex items-center justify-between gap-5 py-3.5", disabled ? "opacity-60" : "cursor-pointer")}>
      <span>
        <span className="block">{label}</span>
        {hint && <span className="block text-sm text-mute">{hint}</span>}
      </span>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span aria-hidden="true" className={clsx("relative h-6 w-11 shrink-0 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-blue peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-ink", checked ? "bg-blue" : "bg-white/15")}>
        <span className={clsx("absolute top-0.5 size-5 rounded-full bg-paper transition-[left]", checked ? "left-[1.375rem]" : "left-0.5")} />
      </span>
    </label>
  );
}

export function Settings({ profile: initial, plans, billingEnabled, aiAvailable, notificationTypes, hasBilling }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [profile, setProfile] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const zones = useMemo(() => {
    try {
      return Intl.supportedValuesOf("timeZone");
    } catch {
      return [initial.timezone];
    }
  }, [initial.timezone]);

  async function patch(body: Record<string, unknown>, key: string, message = "Saved.") {
    setBusy(key);
    try {
      setProfile(await api<Profile>("/me", { method: "PATCH", body }));
      toast(message);
      router.refresh();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
    setBusy(null);
  }

  async function saveProfile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await patch({ name: f.get("name"), timezone: f.get("timezone"), dateOfBirth: f.get("dateOfBirth") || null }, "profile");
  }

  async function changePassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setBusy("password");
    try {
      await api("/me/password", { body: { currentPassword: f.get("current") || undefined, newPassword: f.get("next") } });
      toast("Password changed. Please sign in again.");
      await signOut({ callbackUrl: "/login?reset=1" });
    } catch (err) {
      toast(errorMessage(err), "error");
      setBusy(null);
    }
  }

  async function uploadAvatar(f: File) {
    setBusy("avatar");
    try {
      const res = await fetch("/api/v1/me/avatar", { method: "POST", body: f, headers: { "Content-Type": f.type || "application/octet-stream" } });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error?.message ?? "That image couldn't be uploaded.");
      setProfile(await api<Profile>("/me"));
      router.refresh();
      toast("Profile picture updated.");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
    setBusy(null);
  }

  async function billing(path: string, body?: unknown) {
    setBusy(path);
    try {
      const { url } = await api<{ url: string }>(path, { method: "POST", body });
      window.location.assign(url);
    } catch (err) {
      toast(errorMessage(err), "error");
      setBusy(null);
    }
  }

  const pct = Math.min(100, Math.round((profile.storage.usedBytes / profile.storage.limitBytes) * 100));
  const prefOn = (t: { type: string; defaultOn: boolean }) => profile.notificationPrefs[t.type]?.email ?? t.defaultOn;

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8 sm:py-12">
      <PageHeader eyebrow="Settings" title="Your account." description={`With us since ${formatDate(profile.createdAt)}.`} />
      <div className="mt-8">
        <Section id="profile" title="Profile">
          <div className="mb-6 flex items-center gap-4">
            {profile.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatarUrl} alt="" className="size-16 rounded-full object-cover" />
            ) : (
              <span className="grid size-16 place-items-center rounded-full bg-white/10 font-serif text-2xl">{profile.name.charAt(0).toUpperCase()}</span>
            )}
            <div>
              <Button variant="secondary" size="sm" loading={busy === "avatar"} onClick={() => file.current?.click()}>Change picture</Button>
              <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Choose a profile picture" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadAvatar(f); e.target.value = ""; }} />
            </div>
          </div>
          <form onSubmit={saveProfile} className="grid gap-4 sm:grid-cols-2">
            <TextField label="Full name" name="name" defaultValue={profile.name} maxLength={80} required />
            <TextField label="Email" value={profile.email} readOnly disabled hint={profile.emailVerified ? "Confirmed" : "Not confirmed yet — check your inbox"} />
            <SelectField label="Timezone" name="timezone" defaultValue={profile.timezone}>
              {zones.map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
            </SelectField>
            <TextField label="Date of birth (optional)" name="dateOfBirth" type="date" defaultValue={profile.dateOfBirth ?? ""} max={new Date().toISOString().slice(0, 10)} hint="Only used to work out birthday milestones." />
            <div className="sm:col-span-2"><Button type="submit" loading={busy === "profile"}>Save profile</Button></div>
          </form>
        </Section>

        <Section id="password" title="Password" description="Changing it signs you out on every device.">
          <form onSubmit={changePassword} className="grid max-w-md gap-4">
            {profile.hasPassword && <TextField label="Current password" name="current" type="password" autoComplete="current-password" required />}
            <TextField label="New password" name="next" type="password" autoComplete="new-password" minLength={10} required hint="At least 10 characters." />
            <div><Button type="submit" variant="secondary" loading={busy === "password"}>{profile.hasPassword ? "Change password" : "Set a password"}</Button></div>
          </form>
        </Section>

        <Section id="notifications" title="Email notifications" description="You'll always see these inside the app. Choose which also arrive by email.">
          <div className="divide-y divide-line">
            {notificationTypes.map((t) => (
              <Toggle key={t.type} label={t.label} hint={t.locked ? "Always sent — it's how your capsule reaches you." : undefined} checked={t.locked || prefOn(t)} disabled={t.locked || busy === "prefs"} onChange={(v) => patch({ notificationPrefs: { ...profile.notificationPrefs, [t.type]: { email: v } } }, "prefs")} />
            ))}
          </div>
        </Section>

        <Section id="privacy" title="Privacy and AI" description="AI is optional. Nothing about your capsules depends on it.">
          <Toggle
            label="Allow AI features"
            hint={aiAvailable ? "Search your vault in plain language, get tag suggestions and writing help." : "AI features aren't enabled on this service at the moment."}
            checked={profile.aiConsent}
            disabled={!aiAvailable || busy === "ai"}
            onChange={(v) => patch({ aiConsent: v }, "ai", v ? "AI features are on." : "AI features are off.")}
          />
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-mute">
            <li>When you use an AI feature, only the content that feature needs is sent to our AI provider (Anthropic) to produce the result.</li>
            <li>Your memories are never used to train AI models.</li>
            <li>Sealed capsules can't be processed by AI — or by anything else — until they open.</li>
            <li>You can switch this off at any time.</li>
          </ul>
        </Section>

        <Section id="plan" title="Plan and storage" description="Storage and long-term safekeeping have real, ongoing costs. Paid plans are what cover them.">
          <div className="rounded-3xl border border-line p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <p className="font-serif text-3xl">{profile.plan.name}</p>
              <p className="text-sm text-silver">{profile.activeCapsules} sealed {profile.activeCapsules === 1 ? "capsule" : "capsules"} waiting</p>
            </div>
            <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/8" role="img" aria-label={`${pct}% of storage used`}>
              <div className={clsx("h-full rounded-full", pct > 90 ? "bg-danger" : "bg-paper")} style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-2 text-sm text-mute">{formatBytes(profile.storage.usedBytes)} of {formatBytes(profile.storage.limitBytes)} used, including what's sealed in your capsules</p>
            {hasBilling && <Button variant="secondary" size="sm" className="mt-5" loading={busy === "/billing/portal"} onClick={() => billing("/billing/portal")}>Manage billing</Button>}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {plans.filter((p) => p.id !== profile.plan.id && p.priceCentsMonthly > 0).map((p) => (
              <div key={p.id} className="flex flex-col rounded-3xl border border-line p-5">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-medium">{p.name}</p>
                  <p className="text-sm text-silver">{new Intl.NumberFormat("en", { style: "currency", currency: p.currency.toUpperCase(), minimumFractionDigits: 0 }).format(p.priceCentsMonthly / 100)} / month</p>
                </div>
                <ul className="mt-3 flex-1 space-y-1.5 text-sm text-silver">
                  {p.highlights.slice(0, 3).map((h) => <li key={h} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-blue" aria-hidden="true" />{h}</li>)}
                </ul>
                {p.purchasable ? (
                  <Button size="sm" className="mt-4" loading={busy === "/billing/checkout"} onClick={() => billing("/billing/checkout", { planId: p.id })}>Upgrade to {p.name}</Button>
                ) : (
                  <p className="mt-4 text-xs text-mute">{billingEnabled ? "Not available to purchase yet." : "Paid plans aren't open yet. We'll email you when they are."}</p>
                )}
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs leading-relaxed text-mute">If a paid plan ends, nothing is deleted. Your account returns to the Free plan: sealed capsules still open on their dates and everything stays downloadable, but you can't add more until you're within the Free limits.</p>
        </Section>

        <Section id="data" title="Your data" description="Take a copy, or erase everything.">
          <div className="flex flex-wrap gap-3">
            <a href="/api/v1/me/export" className="inline-flex h-11 items-center gap-2 rounded-full border border-line-strong px-5 text-sm font-medium hover:bg-white/6"><Download className="size-4" /> Export my data</a>
            <Button variant="danger" onClick={() => setDeleting(true)}>Delete my account</Button>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-mute">The export is a file listing everything you can currently read, with download links for your media that work for one hour. Capsules that are still sealed are listed but their contents can't be exported until they open.</p>
        </Section>
      </div>
      <DeleteDialog open={deleting} onClose={() => setDeleting(false)} hasPassword={profile.hasPassword} email={profile.email} sealed={profile.activeCapsules} />
    </div>
  );
}

function DeleteDialog({ open, onClose, hasPassword, email, sealed }: { open: boolean; onClose: () => void; hasPassword: boolean; email: string; sealed: number }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/me", { method: "DELETE", body: hasPassword ? { password: value } : { confirmEmail: value } });
      await signOut({ callbackUrl: "/login?deleted=1" });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onClose={onClose} title="Delete your account">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <p className="leading-relaxed text-silver">This permanently erases your account, your vault and every capsule you created. It cannot be undone.</p>
        {sealed > 0 && (
          <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm leading-relaxed text-[#ffd0d0]">
            You have {sealed} sealed {sealed === 1 ? "capsule" : "capsules"}. Deleting your account destroys {sealed === 1 ? "it" : "them"} unopened — you won't get to see what's inside, and neither will anyone {sealed === 1 ? "it was" : "they were"} meant for.
          </p>
        )}
        <TextField label={hasPassword ? "Enter your password to confirm" : `Type ${email} to confirm`} type={hasPassword ? "password" : "email"} autoComplete={hasPassword ? "current-password" : "off"} value={value} onChange={(e) => setValue(e.target.value)} error={error} required />
        <div className="flex justify-end gap-2.5">
          <Button type="button" variant="ghost" onClick={onClose}>Keep my account</Button>
          <Button type="submit" variant="danger" loading={busy} disabled={!value}>Delete everything</Button>
        </div>
      </form>
    </Dialog>
  );
}
