import { DateTime, IANAZone } from "luxon";

export const PRESETS = {
  tomorrow: { label: "Tomorrow", plus: { days: 1 } },
  "7d": { label: "In 7 days", plus: { days: 7 } },
  "30d": { label: "In 30 days", plus: { days: 30 } },
  "6m": { label: "In 6 months", plus: { months: 6 } },
  "1y": { label: "In 1 year", plus: { years: 1 } },
  "5y": { label: "In 5 years", plus: { years: 5 } },
  "10y": { label: "In 10 years", plus: { years: 10 } },
  "20y": { label: "In 20 years", plus: { years: 20 } },
} as const;
export type PresetKey = keyof typeof PRESETS;

export type ScheduleInput =
  | { kind: "preset"; preset: PresetKey; timezone: string }
  /** `local` is a wall-clock time in `timezone`, e.g. "2031-06-01T09:00". */
  | { kind: "custom"; local: string; timezone: string }
  /**
   * `baseDate` is the date being counted from (a birth date, a wedding date);
   * the capsule opens on its `years`-th anniversary at `time` local.
   */
  | { kind: "milestone"; milestone: "birthday" | "anniversary" | "date"; label?: string; baseDate: string; years: number; time?: string; timezone: string };

export class ScheduleError extends Error {}

export const MIN_LEAD_MS = 60 * 1000;
export const MAX_YEARS = 100;

export function isValidTimezone(tz: string): boolean {
  return typeof tz === "string" && tz.length > 0 && IANAZone.isValidZone(tz);
}

/**
 * Resolves a wall-clock time to an instant.
 * - A time skipped by a spring-forward jump is moved forward by the gap.
 * - A time repeated by a fall-back change resolves to its first occurrence.
 */
function resolveLocal(fields: { year: number; month: number; day: number; hour: number; minute: number }, zone: string): DateTime {
  const dt = DateTime.fromObject({ ...fields, second: 0, millisecond: 0 }, { zone });
  if (!dt.isValid) throw new ScheduleError("That date doesn't exist.");
  // Luxon picks the later offset for ambiguous times; prefer the earlier one.
  const earlier = dt.minus({ hours: 1 });
  if (earlier.offset !== dt.offset && earlier.hour === dt.hour && earlier.minute === dt.minute) return earlier;
  return dt;
}

/** Anniversary of a date in a given year; 29 Feb falls back to 28 Feb. */
function anniversary(base: DateTime, year: number): { year: number; month: number; day: number } {
  const daysInMonth = DateTime.fromObject({ year, month: base.month }).daysInMonth ?? 28;
  return { year, month: base.month, day: Math.min(base.day, daysInMonth) };
}

/**
 * Computes the exact release instant (UTC) for a schedule. This runs on the
 * server at lock time; clients only ever send intent, never a timestamp.
 */
export function computeUnlockAt(input: ScheduleInput, now: Date = new Date()): Date {
  if (!isValidTimezone(input.timezone)) throw new ScheduleError("Unknown timezone.");
  const zone = input.timezone;
  const nowLocal = DateTime.fromJSDate(now, { zone });
  let target: DateTime;

  if (input.kind === "preset") {
    const preset = PRESETS[input.preset];
    if (!preset) throw new ScheduleError("Unknown preset.");
    // Calendar arithmetic in the user's zone keeps the same wall-clock time
    // across DST changes ("a year from now" is the same time of day).
    target = nowLocal.plus(preset.plus).set({ second: 0, millisecond: 0 });
  } else if (input.kind === "custom") {
    const parsed = DateTime.fromISO(input.local, { zone, setZone: false });
    if (!parsed.isValid || /[zZ]|[+-]\d\d:?\d\d$/.test(input.local)) {
      throw new ScheduleError("Enter a date and time like 2031-06-01T09:00.");
    }
    target = resolveLocal(
      { year: parsed.year, month: parsed.month, day: parsed.day, hour: parsed.hour, minute: parsed.minute },
      zone,
    );
  } else {
    const base = DateTime.fromISO(input.baseDate, { zone });
    if (!base.isValid) throw new ScheduleError("Enter a valid date for this milestone.");
    if (!Number.isInteger(input.years) || input.years < 0 || input.years > 150) {
      throw new ScheduleError("Enter a whole number of years.");
    }
    const [h, m] = (input.time ?? "09:00").split(":").map(Number);
    if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) {
      throw new ScheduleError("Enter a valid time.");
    }
    target = resolveLocal({ ...anniversary(base, base.year + input.years), hour: h, minute: m }, zone);
  }

  const ms = target.toMillis();
  if (ms - now.getTime() < MIN_LEAD_MS) throw new ScheduleError("Choose a moment in the future.");
  if (target > nowLocal.plus({ years: MAX_YEARS })) throw new ScheduleError(`Choose a date within the next ${MAX_YEARS} years.`);
  return new Date(ms);
}

export function describeSchedule(input: ScheduleInput): string {
  if (input.kind === "preset") return PRESETS[input.preset]?.label ?? "Custom date";
  if (input.kind === "custom") return "Custom date";
  if (input.label) return input.label;
  if (input.milestone === "birthday") return `${ordinal(input.years)} birthday`;
  if (input.milestone === "anniversary") return `${ordinal(input.years)} anniversary`;
  return "A special date";
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** Formats an instant in a zone for display, e.g. "1 June 2031 at 09:00 BST". */
export function formatInZone(date: Date | string, zone: string, withTime = true): string {
  const dt = (typeof date === "string" ? DateTime.fromISO(date) : DateTime.fromJSDate(date)).setZone(isValidTimezone(zone) ? zone : "UTC");
  return withTime ? dt.toFormat("d LLLL yyyy 'at' HH:mm ZZZZ") : dt.toFormat("d LLLL yyyy");
}
