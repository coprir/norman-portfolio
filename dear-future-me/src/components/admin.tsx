"use client";

import { clsx } from "clsx";
import { RotateCcw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/field";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/client/api";
import { formatBytes, formatDateTime, relativeTime } from "@/lib/format";
import type { adminAudit, adminJobs, adminOverview, adminUsers } from "@/server/admin";

type Overview = Awaited<ReturnType<typeof adminOverview>>;
type Job = Awaited<ReturnType<typeof adminJobs>>[number];
type User = Awaited<ReturnType<typeof adminUsers>>[number];
type Log = Awaited<ReturnType<typeof adminAudit>>[number];
const TABS = ["Overview", "Jobs", "Users", "Audit log"] as const;

function Stat({ label, value, note }: { label: string; value: React.ReactNode; note?: string }) {
  return (
    <div className="rounded-2xl border border-line p-5">
      <p className="eyebrow">{label}</p>
      <p className="mt-2 font-serif text-4xl tnum">{value}</p>
      {note && <p className="mt-1 text-xs text-mute">{note}</p>}
    </div>
  );
}

function Health({ name, state }: { name: string; state: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-line px-4 py-3">
      <span>{name}</span>
      <span className={clsx("flex items-center gap-2 text-sm", state === "ok" ? "text-ok" : "text-danger")}><span className={clsx("size-2 rounded-full", state === "ok" ? "bg-ok" : "bg-danger")} />{state === "ok" ? "Healthy" : "Down"}</span>
    </div>
  );
}

const th = "px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-mute";
const td = "px-4 py-3 align-top text-sm";

function AdminInner({ overview, isSuper }: { overview: Overview; isSuper: boolean }) {
  const toast = useToast();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobFilter, setJobFilter] = useState<"problem" | "upcoming" | "all">("problem");
  const [users, setUsers] = useState<User[]>([]);
  const [q, setQ] = useState("");
  const [logs, setLogs] = useState<Log[]>([]);
  const [action, setAction] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const loadJobs = useCallback(() => api<{ jobs: Job[] }>(`/admin/jobs?filter=${jobFilter}`).then((r) => setJobs(r.jobs)).catch((e) => toast(errorMessage(e), "error")), [jobFilter, toast]);
  useEffect(() => { if (tab === "Jobs") void loadJobs(); }, [tab, loadJobs]);
  useEffect(() => {
    if (tab !== "Users") return;
    const t = setTimeout(() => api<{ users: User[] }>(`/admin/users?q=${encodeURIComponent(q)}`).then((r) => setUsers(r.users)).catch((e) => toast(errorMessage(e), "error")), 250);
    return () => clearTimeout(t);
  }, [tab, q, toast]);
  useEffect(() => {
    if (tab !== "Audit log") return;
    const t = setTimeout(() => api<{ logs: Log[] }>(`/admin/audit?action=${encodeURIComponent(action)}`).then((r) => setLogs(r.logs)).catch((e) => toast(errorMessage(e), "error")), 250);
    return () => clearTimeout(t);
  }, [tab, action, toast]);

  const jobCount = (status: string[]) => overview.jobs.filter((j) => status.includes(j.status)).reduce((n, j) => n + j.count, 0);
  const failed = jobCount(["FAILED", "DEAD"]);

  return (
    <div className="mx-auto w-full max-w-7xl px-5 py-6 sm:px-8">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4"><Logo /><span className="rounded-full border border-line-strong px-2.5 py-1 text-xs text-silver">Admin</span></div>
        <Link href="/app" className="text-sm text-silver hover:text-paper">Back to app</Link>
      </header>
      <p className="mt-6 max-w-3xl rounded-2xl border border-line bg-white/[0.03] px-4 py-3 text-sm leading-relaxed text-silver">This console shows operational data only. It has no way to view, download or decrypt anyone's memories or capsule contents, and it cannot open a capsule before its date.</p>

      <div role="tablist" aria-label="Admin sections" className="mt-6 flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={clsx("-mb-px border-b-2 px-4 py-3 text-sm", tab === t ? "border-paper text-paper" : "border-transparent text-silver hover:text-paper")}>
            {t}{t === "Jobs" && failed > 0 && <span className="ml-2 rounded-full bg-danger px-1.5 py-0.5 text-[0.68rem] font-semibold text-ink">{failed}</span>}
          </button>
        ))}
      </div>

      {tab === "Overview" && (
        <div className="mt-6 space-y-8">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Registered users" value={overview.users.total} note={`${overview.users.verified} verified`} />
            <Stat label="Active, last 7 days" value={overview.users.active7d} />
            <Stat label="New registrations" value={overview.users.new7d} note={`${overview.users.new30d} in the last 30 days`} />
            <Stat label="Stored memories" value={overview.storage.memories} note={`${formatBytes(overview.storage.vaultBytes)} in vaults · ${formatBytes(overview.storage.sealedBytes)} sealed`} />
            <Stat label="Sealed capsules" value={overview.capsules.LOCKED ?? 0} note={`${overview.capsules.SEALING ?? 0} sealing now`} />
            <Stat label="Released" value={(overview.capsules.AVAILABLE ?? 0) + (overview.capsules.OPENED ?? 0)} note={`${overview.capsules.OPENED ?? 0} opened`} />
            <Stat label="Failed jobs" value={<span className={failed ? "text-danger" : undefined}>{failed}</span>} note={`${jobCount(["PENDING", "QUEUED"])} scheduled`} />
            <Stat label="Emails, last 7 days" value={overview.emails7d.SENT ?? 0} note={`${overview.emails7d.FAILED ?? 0} failed`} />
          </div>
          <div className="grid gap-8 lg:grid-cols-2">
            <section>
              <h2 className="font-serif text-2xl">System health</h2>
              <div className="mt-3 grid gap-2">
                <Health name="Database" state={overview.health.database} />
                <Health name="Queue (Redis)" state={overview.health.queue} />
                <Health name={`Object storage (${overview.storage.driver})`} state={overview.health.storage} />
                <Health name="Release worker" state={overview.health.worker} />
              </div>
              <p className="mt-2 text-xs text-mute">Worker heartbeat: {overview.health.workerHeartbeat ? relativeTime(overview.health.workerHeartbeat) : "never seen"}</p>
              <h2 className="mt-8 font-serif text-2xl">Subscriptions</h2>
              <ul className="mt-3 divide-y divide-line rounded-2xl border border-line">
                {overview.subscriptions.map((s) => <li key={s.plan + s.status} className="flex justify-between px-4 py-3 text-sm"><span className="capitalize">{s.plan} <span className="text-mute">· {s.status.toLowerCase().replace("_", " ")}</span></span><span className="tnum">{s.count}</span></li>)}
                {!overview.subscriptions.length && <li className="px-4 py-3 text-sm text-mute">None yet.</li>}
              </ul>
            </section>
            <section>
              <h2 className="font-serif text-2xl">Releases in the next 30 days</h2>
              <ul className="mt-3 divide-y divide-line rounded-2xl border border-line">
                {overview.upcoming.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                    <span className="font-mono text-xs text-silver">{c.id.slice(0, 12)}…</span>
                    <span className="text-mute">{c.items} items · {formatBytes(c.bytes)} · {c.recipients} recipients</span>
                    <span className="tnum">{relativeTime(c.unlockAt)}</span>
                  </li>
                ))}
                {!overview.upcoming.length && <li className="px-4 py-3 text-sm text-mute">Nothing scheduled.</li>}
              </ul>
            </section>
          </div>
        </div>
      )}

      {tab === "Jobs" && (
        <div className="mt-6">
          <div className="flex flex-wrap items-center gap-2">
            {([["problem", "Failed"], ["upcoming", "Scheduled"], ["all", "All recent"]] as const).map(([v, l]) => (
              <button key={v} aria-pressed={jobFilter === v} onClick={() => setJobFilter(v)} className={clsx("h-9 rounded-full border px-3.5 text-sm", jobFilter === v ? "border-paper bg-paper text-ink" : "border-line-strong text-silver")}>{l}</button>
            ))}
            <Button variant="ghost" size="sm" onClick={() => loadJobs()} className="ml-auto"><RotateCcw className="size-4" /> Refresh</Button>
          </div>
          <div className="mt-4 overflow-x-auto rounded-2xl border border-line">
            <table className="w-full min-w-[52rem]">
              <thead className="border-b border-line"><tr><th className={th}>Job</th><th className={th}>Capsule</th><th className={th}>Status</th><th className={th}>Scheduled</th><th className={th}>Attempts</th><th className={th}>Last error</th><th className={th}></th></tr></thead>
              <tbody className="divide-y divide-line">
                {jobs.map((j) => (
                  <tr key={j.id}>
                    <td className={td}>{j.type.toLowerCase()}{j.variant && ` (${j.variant})`}</td>
                    <td className={`${td} font-mono text-xs text-silver`}>{j.capsuleId.slice(0, 12)}… <span className="font-sans text-mute">{j.capsuleStatus.toLowerCase()}</span></td>
                    <td className={td}><span className={clsx(j.status === "DEAD" || j.status === "FAILED" ? "text-danger" : j.status === "COMPLETED" ? "text-ok" : "text-silver")}>{j.status.toLowerCase()}</span></td>
                    <td className={`${td} whitespace-nowrap text-silver`}>{formatDateTime(j.scheduledAt)}</td>
                    <td className={`${td} tnum`}>{j.attempts}</td>
                    <td className={`${td} max-w-xs break-words text-xs text-silver`}>{j.lastError ?? "—"}</td>
                    <td className={td}>
                      {(j.status === "DEAD" || j.status === "FAILED") && j.type !== "SEAL" && (
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={busy === j.id}
                          onClick={async () => {
                            setBusy(j.id);
                            try {
                              await api(`/admin/jobs/${j.id}/retry`, { method: "POST" });
                              toast("Job queued for another attempt.");
                              await loadJobs();
                            } catch (e) {
                              toast(errorMessage(e), "error");
                            }
                            setBusy(null);
                          }}
                        >
                          Retry
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {!jobs.length && <tr><td className={`${td} text-mute`} colSpan={7}>{jobFilter === "problem" ? "No failed jobs." : "Nothing to show."}</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-mute">Retrying re-runs a release or reminder. A release job still refuses to run before the capsule's unlock time.</p>
        </div>
      )}

      {tab === "Users" && (
        <div className="mt-6">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or email" aria-label="Search users" className={`${inputClass} h-11 max-w-sm`} />
          <div className="mt-4 overflow-x-auto rounded-2xl border border-line">
            <table className="w-full min-w-[48rem]">
              <thead className="border-b border-line"><tr><th className={th}>User</th><th className={th}>Plan</th><th className={th}>Memories</th><th className={th}>Capsules</th><th className={th}>Joined</th><th className={th}>Last active</th><th className={th}>Role</th></tr></thead>
              <tbody className="divide-y divide-line">
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className={td}>{u.name}<span className="block text-xs text-mute">{u.email}{!u.verified && " · unverified"}</span></td>
                    <td className={`${td} capitalize`}>{u.plan}</td>
                    <td className={`${td} tnum`}>{u.memories}</td>
                    <td className={`${td} tnum`}>{u.capsules}</td>
                    <td className={`${td} whitespace-nowrap text-silver`}>{relativeTime(u.createdAt)}</td>
                    <td className={`${td} whitespace-nowrap text-silver`}>{u.lastActiveAt ? relativeTime(u.lastActiveAt) : "—"}</td>
                    <td className={td}>
                      {isSuper ? (
                        <select
                          aria-label={`Role for ${u.email}`}
                          value={u.role}
                          onChange={async (e) => {
                            const role = e.target.value;
                            try {
                              await api(`/admin/users/${u.id}`, { method: "PATCH", body: { role } });
                              setUsers((l) => l.map((x) => (x.id === u.id ? { ...x, role: role as User["role"] } : x)));
                              toast("Role updated.");
                            } catch (err) {
                              toast(errorMessage(err), "error");
                            }
                          }}
                          className={`${inputClass} h-9 w-auto text-sm [&>option]:bg-charcoal`}
                        >
                          <option value="USER">User</option>
                          <option value="ADMIN">Administrator</option>
                          <option value="SUPER_ADMIN">Super administrator</option>
                        </select>
                      ) : (
                        <span className="text-silver">{u.role.toLowerCase().replace("_", " ")}</span>
                      )}
                    </td>
                  </tr>
                ))}
                {!users.length && <tr><td className={`${td} text-mute`} colSpan={7}>No users found.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "Audit log" && (
        <div className="mt-6">
          <input type="search" value={action} onChange={(e) => setAction(e.target.value)} placeholder="Filter by action, e.g. capsule. or auth." aria-label="Filter by action" className={`${inputClass} h-11 max-w-sm`} />
          <div className="mt-4 overflow-x-auto rounded-2xl border border-line">
            <table className="w-full min-w-[48rem]">
              <thead className="border-b border-line"><tr><th className={th}>When</th><th className={th}>Action</th><th className={th}>User</th><th className={th}>Resource</th><th className={th}>Details</th></tr></thead>
              <tbody className="divide-y divide-line">
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td className={`${td} whitespace-nowrap text-silver`}>{formatDateTime(l.at)}</td>
                    <td className={`${td} font-mono text-xs`}>{l.action}</td>
                    <td className={`${td} text-silver`}>{l.user ?? "system"}</td>
                    <td className={`${td} font-mono text-xs text-mute`}>{l.resourceId?.slice(0, 14) ?? "—"}</td>
                    <td className={`${td} max-w-sm break-words font-mono text-xs text-mute`}>{l.metadata && Object.keys(l.metadata as object).length ? JSON.stringify(l.metadata) : ""}</td>
                  </tr>
                ))}
                {!logs.length && <tr><td className={`${td} text-mute`} colSpan={5}>No entries.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export function Admin(props: { overview: Overview; isSuper: boolean }) {
  return <ToastProvider><AdminInner {...props} /></ToastProvider>;
}
