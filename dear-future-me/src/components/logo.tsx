import { clsx } from "clsx";

/**
 * The mark: an open orbit (time, still moving) around a sealed capsule, with
 * a single point of light at the moment the orbit will close.
 */
export function LogoMark({ size = 28, className, accent = "#648BFF" }: { size?: number; className?: string; accent?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true" className={className}>
      <path d="M26.4 9.5A12 12 0 1 0 28 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="26.4" cy="9.5" r="2.2" fill={accent} />
      <rect x="12.5" y="9" width="7" height="14" rx="3.5" stroke="currentColor" strokeWidth="2" />
      <path d="M12.5 16h7" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function Logo({ className, size = 26 }: { className?: string; size?: number }) {
  return (
    <span className={clsx("inline-flex items-center gap-2.5 text-paper", className)}>
      <LogoMark size={size} />
      <span className="whitespace-nowrap text-[0.72rem] font-semibold tracking-[0.18em] sm:text-[0.78rem] sm:tracking-[0.2em]">DEAR FUTURE ME</span>
    </span>
  );
}
