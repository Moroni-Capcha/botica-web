"use client";

import type { ReactNode } from "react";
import { ListFilter, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { useValuePulse } from "@/lib/use-value-pulse";

/** Cifra del resumen. La grande (`strong`) usa el color de la botica; las demás pueden ser filtros rápidos (`onClick`). */
export function Kpi({ icon: Icon, label, value, hint, strong, valueClass, iconClass, loading, active, onClick }: { icon: LucideIcon; label: string; value: string; hint?: ReactNode; strong?: boolean; valueClass?: string; iconClass?: string; loading?: boolean; active?: boolean; onClick?: () => void }) {
  const ref = useValuePulse<HTMLParagraphElement>(value);
  const body = (
    <>
      <p className={cn("flex items-center gap-2 text-caption font-semibold", strong ? "text-white/85" : "text-muted")}>
        <Icon className={cn("h-4 w-4 shrink-0", strong ? "text-accent" : "text-muted", iconClass)} aria-hidden />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {active && <ListFilter className="h-3.5 w-3.5 shrink-0 text-brand-ink" aria-hidden />}
      </p>
      {loading ? (
        <div className={cn("mt-2 animate-pulse rounded bg-sunken", strong ? "h-9 w-32 bg-white/20" : "h-6 w-20")} />
      ) : (
        <p ref={ref} className={cn("mt-2 w-fit max-w-full origin-left break-words font-semibold tracking-tight tabular-nums", strong ? "text-4xl" : "text-xl", valueClass)}>
          {value}
        </p>
      )}
      {hint && !loading && <div className={cn("mt-1 text-caption", strong ? "text-white/80" : "text-muted")}>{hint}</div>}
    </>
  );
  const base = "min-w-0 rounded-2xl border p-4 text-left";
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={!!active}
        className={cn(base, "border-line bg-surface transition-colors duration-[var(--dur-fast)] hover:bg-subtle", active && "border-brand-ink ring-1 ring-brand-ink")}
      >
        {body}
      </button>
    );
  }
  return <div className={cn(base, strong ? "col-span-2 border-transparent bg-brand p-5 text-white lg:col-span-1" : "border-line bg-surface")}>{body}</div>;
}
