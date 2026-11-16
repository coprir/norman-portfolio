"use client";

import { clsx } from "clsx";
import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

/** Modal built on the native <dialog>: focus trap, Escape and backdrop for free. */
export function Dialog({ open, onClose, title, children, wide, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-label={title}
      className={clsx(
        "m-auto w-[calc(100vw-1.5rem)] rounded-3xl border border-line bg-navy p-0 text-paper shadow-2xl shadow-black/60 backdrop:bg-ink/75 backdrop:backdrop-blur-sm open:flex open:flex-col max-h-[calc(100dvh-1.5rem)]",
        wide ? "max-w-3xl" : "max-w-lg",
      )}
    >
      {open && (
        <>
          <header className="flex shrink-0 items-center justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
            <h2 className="text-[1.02rem] font-medium">{title}</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="-mr-1.5 grid size-9 place-items-center rounded-full text-mute hover:bg-white/8 hover:text-paper">
              <X className="size-4.5" />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
          {footer && <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2.5 border-t border-line px-5 py-4 sm:px-6">{footer}</footer>}
        </>
      )}
    </dialog>
  );
}
