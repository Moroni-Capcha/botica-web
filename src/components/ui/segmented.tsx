import { useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";

export interface SegmentOption<T extends string> {
  id: T;
  label: string;
  count?: number;
}

export function Segmented<T extends string>({ options, value, onChange, full, label, size = "md" }: { options: SegmentOption<T>[]; value: T; onChange: (v: T) => void; full?: boolean; label?: string; size?: "md" | "lg" }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  // Grupo de opciones: las flechas cambian y mueven el foco; solo la elegida entra con Tab.
  const onKeyDown = (e: KeyboardEvent, index: number) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (index + step + options.length) % options.length;
    const target = options[next];
    if (!target) return;
    onChange(target.id);
    refs.current[next]?.focus();
  };

  return (
    <div role="radiogroup" aria-label={label} className={cn("flex gap-1 overflow-x-auto rounded-xl bg-sunken p-1", full ? "w-full" : "w-fit max-w-full")}>
      {options.map((o, i) => (
        <button
          key={o.id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          tabIndex={value === o.id ? 0 : -1}
          onClick={() => onChange(o.id)}
          onKeyDown={(e) => onKeyDown(e, i)}
          className={cn(
            "flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition",
            size === "lg" ? "min-h-11 py-2" : "py-1.5",
            full && "flex-1",
            value === o.id ? "bg-surface text-fg shadow-subtle" : "text-muted hover:text-fg",
          )}
        >
          {o.label}
          {o.count !== undefined && <span className="rounded-full bg-sunken-strong px-1.5 text-micro font-bold tabular-nums">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}
