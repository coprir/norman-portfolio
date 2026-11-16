"use client";

import { clsx } from "clsx";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { countdownParts } from "@/lib/format";

/**
 * Display only. The countdown never unlocks anything — the server does — so
 * when it reaches zero it simply asks the server what the state is now.
 */
export function Countdown({ to, size = "md", onElapsed, refreshOnElapsed }: { to: string; size?: "sm" | "md" | "lg"; onElapsed?: () => void; refreshOnElapsed?: boolean }) {
  const target = new Date(to).getTime();
  const [now, setNow] = useState<number | null>(null);
  const fired = useRef(false);
  const router = useRouter();

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (now === null || now < target || fired.current) return;
    fired.current = true;
    onElapsed?.();
    if (!refreshOnElapsed) return;
    // The worker releases within moments of the unlock time; poll gently until it has.
    router.refresh();
    const poll = setInterval(() => router.refresh(), 4000);
    const stop = setTimeout(() => clearInterval(poll), 120_000);
    return () => {
      clearInterval(poll);
      clearTimeout(stop);
    };
  }, [now, target, onElapsed, refreshOnElapsed, router]);

  const p = countdownParts(target, now ?? target);
  const cells: [number, string][] = p.years > 0 ? [[p.years, "years"], [p.days, "days"], [p.hours, "hours"], [p.minutes, "min"]] : [[p.totalDays, "days"], [p.hours, "hours"], [p.minutes, "min"], [p.seconds, "sec"]];
  const label = now === null ? "" : p.total === 0 ? "Opening now" : cells.map(([v, l]) => `${v} ${l}`).join(", ");

  return (
    <div role="timer" aria-label={label} className={clsx("flex tnum", size === "lg" ? "gap-5 sm:gap-8" : size === "md" ? "gap-4" : "gap-3")}>
      {cells.map(([value, unit]) => (
        <div key={unit} aria-hidden="true" className="flex flex-col items-start">
          <span className={clsx("font-serif leading-none", size === "lg" ? "text-5xl sm:text-7xl" : size === "md" ? "text-3xl" : "text-xl", now === null && "opacity-0")}>
            {String(value).padStart(2, "0")}
          </span>
          <span className={clsx("mt-1.5 uppercase tracking-[0.16em] text-mute", size === "sm" ? "text-[0.58rem]" : "text-[0.65rem]")}>{unit}</span>
        </div>
      ))}
    </div>
  );
}
