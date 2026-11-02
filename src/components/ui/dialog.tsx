"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { IconButton } from "./icon-button";

interface DialogProps {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: "md" | "lg" | "xl";
}

/** Diálogo modal accesible: foco inicial, Escape para cerrar y foco atrapado en el contenido. */
export function Dialog({ title, description, onClose, children, footer, size = "md" }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const node = ref.current;
    node?.querySelector<HTMLElement>("input, select, textarea, button:not([data-close])")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key !== "Tab" || !node) return;
      const items = [...node.querySelectorAll<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")].filter((el) => !el.hasAttribute("disabled"));
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      prev?.focus();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 animate-fade bg-scrim" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "relative flex max-h-[92dvh] w-full animate-pop flex-col overflow-hidden rounded-t-3xl border border-line bg-surface shadow-overlay sm:rounded-3xl",
          size === "md" && "sm:max-w-lg",
          size === "lg" && "sm:max-w-3xl",
          size === "xl" && "sm:max-w-5xl",
        )}
      >
        <div className="flex items-start gap-3 border-b border-line-soft px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-base font-semibold tracking-tight">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
          </div>
          <IconButton data-close size="sm" onClick={onClose} aria-label="Cerrar">
            <X className="h-5 w-5" aria-hidden />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line-soft px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}
