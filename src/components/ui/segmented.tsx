import { cn } from "@/lib/cn";

export interface SegmentOption<T extends string> {
  id: T;
  label: string;
  count?: number;
}

export function Segmented<T extends string>({ options, value, onChange, full, label }: { options: SegmentOption<T>[]; value: T; onChange: (v: T) => void; full?: boolean; label?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("flex gap-1 overflow-x-auto rounded-xl bg-sunken p-1", full ? "w-full" : "w-fit max-w-full")}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            "flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition",
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
