import { Lock, Stethoscope } from "lucide-react";
import type { ExpiryThresholds, RxCondition } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { expiryTone, type ExpiryTone } from "@/lib/domain/pharmacy";

export const TONE: Record<ExpiryTone, { label: string; className: string; dot: string }> = {
  vencido: { label: "Vencido", className: "bg-zinc-900 text-white", dot: "bg-white" },
  critico: { label: "Crítico", className: "bg-rose-100 text-rose-700", dot: "bg-rose-500" },
  por_vencer: { label: "Por vencer", className: "bg-amber-100 text-amber-800", dot: "bg-amber-400" },
  vigente: { label: "Vigente", className: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
};

export function ExpiryBadge({ days, short, thresholds }: { days: number; short?: boolean; thresholds?: ExpiryThresholds }) {
  const t = TONE[expiryTone(days, thresholds)];
  const text = days < 0 ? `Vencido hace ${-days} d` : days === 0 ? "Vence hoy" : short ? `${days} d` : `Vence en ${days} d`;
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold", t.className)} title={t.label}>
      <span className={cn("h-1.5 w-1.5 rounded-full", t.dot)} />
      {text}
    </span>
  );
}

export function RxBadge({ rx }: { rx: RxCondition }) {
  if (rx === "libre") return null;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold", rx === "controlado" ? "bg-violet-100 text-violet-700" : "bg-sky-100 text-sky-700")}>
      {rx === "controlado" ? <Lock className="h-3 w-3" /> : <Stethoscope className="h-3 w-3" />}
      {rx === "controlado" ? "Controlado" : "Receta"}
    </span>
  );
}
