import { clsx } from "clsx";
import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

export const inputClass =
  "w-full rounded-xl border border-line bg-white/[0.03] px-3.5 text-[0.95rem] text-paper placeholder:text-mute/70 transition-colors hover:border-line-strong focus:border-blue/70 focus:bg-white/[0.05] focus:outline-none disabled:opacity-50";

export function Field({ label, hint, error, children, className }: { label: string; hint?: ReactNode; error?: string | null; children: (id: string, describedBy: string | undefined) => ReactNode; className?: string }) {
  const id = useId();
  const noteId = `${id}-note`;
  return (
    <div className={clsx("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-[0.82rem] font-medium text-silver">
        {label}
      </label>
      {children(id, hint || error ? noteId : undefined)}
      {(error || hint) && (
        <p id={noteId} role={error ? "alert" : undefined} className={clsx("text-[0.8rem] leading-snug", error ? "text-danger" : "text-mute")}>
          {error || hint}
        </p>
      )}
    </div>
  );
}

type TextProps = InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: ReactNode; error?: string | null; wrapClassName?: string };
export function TextField({ label, hint, error, className, wrapClassName, ...rest }: TextProps) {
  return (
    <Field label={label} hint={hint} error={error} className={wrapClassName}>
      {(id, describedBy) => <input id={id} aria-describedby={describedBy} aria-invalid={error ? true : undefined} {...rest} className={clsx(inputClass, "h-11", className)} />}
    </Field>
  );
}

type AreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: ReactNode; error?: string | null };
export function TextArea({ label, hint, error, className, ...rest }: AreaProps) {
  return (
    <Field label={label} hint={hint} error={error}>
      {(id, describedBy) => <textarea id={id} aria-describedby={describedBy} {...rest} className={clsx(inputClass, "min-h-28 resize-y py-3 leading-relaxed", className)} />}
    </Field>
  );
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: ReactNode; error?: string | null; wrapClassName?: string };
export function SelectField({ label, hint, error, className, wrapClassName, children, ...rest }: SelectProps) {
  return (
    <Field label={label} hint={hint} error={error} className={wrapClassName}>
      {(id, describedBy) => (
        <select id={id} aria-describedby={describedBy} {...rest} className={clsx(inputClass, "h-11 appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 12 12%22><path d=%22M2.5 4.5 6 8l3.5-3.5%22 fill=%22none%22 stroke=%22%23A8B0C4%22 stroke-width=%221.5%22 stroke-linecap=%22round%22/></svg>')] bg-[position:right_0.9rem_center] bg-no-repeat pr-9 [&>option]:bg-charcoal", className)}>
          {children}
        </select>
      )}
    </Field>
  );
}
