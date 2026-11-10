import type { BadgeTone } from "@/lib/domain/nav-badges";
import { cn } from "@/lib/cn";

const DOT: Record<BadgeTone, string> = {
  danger: "bg-red-400",
  warn: "bg-amber-400",
  ok: "bg-emerald-400",
  idle: "bg-white/50",
};

/** Punto de estado; el significado lo lleva el texto del enlace, no el color. */
export function BadgeDot({ tone, className }: { tone: BadgeTone; className?: string }) {
  return <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-full ring-2 ring-brand", DOT[tone], className)} />;
}

/** Número en una píldora (99+ si pasa de 99). */
export function BadgeCount({ count, tone }: { count: number; tone: BadgeTone }) {
  return (
    <span aria-hidden className={cn("ml-auto min-w-5 shrink-0 rounded-full px-1.5 text-center text-[11px] font-semibold leading-5 tabular-nums", tone === "danger" ? "bg-red-400" : "bg-amber-400", "text-fg")}>
      {count > 99 ? "99+" : count}
    </span>
  );
}
