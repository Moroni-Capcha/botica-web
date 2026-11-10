import { Lock, Stethoscope } from "lucide-react";
import type { ExpiryThresholds, RxCondition } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { expiryTone, type ExpiryTone } from "@/lib/domain/pharmacy";
import { Chip } from "./chip";
import { TONE_CLASS } from "./tone";

export const TONE: Record<ExpiryTone, { label: string; className: string; dot: string }> = {
  vencido: { label: "Vencido", className: TONE_CLASS.neutral.solid, dot: "bg-surface" },
  critico: { label: "Crítico", className: TONE_CLASS.danger.soft, dot: TONE_CLASS.danger.dot },
  por_vencer: { label: "Por vencer", className: TONE_CLASS.warning.soft, dot: TONE_CLASS.warning.dot },
  vigente: { label: "Vigente", className: TONE_CLASS.success.soft, dot: TONE_CLASS.success.dot },
};

export function ExpiryBadge({ days, short, thresholds }: { days: number; short?: boolean; thresholds?: ExpiryThresholds }) {
  const t = TONE[expiryTone(days, thresholds)];
  const text = days < 0 ? `Vencido hace ${-days} d` : days === 0 ? "Vence hoy" : short ? `${days} d` : `Vence en ${days} d`;
  return (
    <Chip className={cn("gap-1.5", t.className)} title={t.label}>
      <span className={cn("h-1.5 w-1.5 rounded-full", t.dot)} aria-hidden />
      {text}
    </Chip>
  );
}

export function RxBadge({ rx }: { rx: RxCondition }) {
  if (rx === "libre") return null;
  return (
    <Chip tone={rx === "controlado" ? "special" : "info"}>
      {rx === "controlado" ? <Lock className="h-3 w-3" aria-hidden /> : <Stethoscope className="h-3 w-3" aria-hidden />}
      {rx === "controlado" ? "Controlado" : "Receta"}
    </Chip>
  );
}
