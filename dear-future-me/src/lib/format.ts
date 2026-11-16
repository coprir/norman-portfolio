export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 || Number.isInteger(v) ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

export function formatDate(iso: string | Date | null | undefined, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" }, timeZone?: string): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-GB", { ...opts, timeZone }).format(typeof iso === "string" ? new Date(iso) : iso);
}

export function formatDateTime(iso: string | Date, timeZone?: string): string {
  return formatDate(iso, { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" }, timeZone);
}

/** "in 3 years", "in 12 days", "2 hours ago". */
export function relativeTime(iso: string | Date, now = Date.now()): string {
  const diff = (typeof iso === "string" ? new Date(iso) : iso).getTime() - now;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [["year", 31_557_600_000], ["month", 2_629_800_000], ["day", 86_400_000], ["hour", 3_600_000], ["minute", 60_000]];
  for (const [unit, ms] of units) if (abs >= ms) return rtf.format(Math.round(diff / ms), unit);
  return diff >= 0 ? "in a moment" : "just now";
}

export function countdownParts(targetMs: number, nowMs: number) {
  const total = Math.max(0, targetMs - nowMs);
  const s = Math.floor(total / 1000);
  const days = Math.floor(s / 86_400);
  return { total, years: Math.floor(days / 365), days: days % 365, totalDays: days, hours: Math.floor((s % 86_400) / 3600), minutes: Math.floor((s % 3600) / 60), seconds: s % 60 };
}
