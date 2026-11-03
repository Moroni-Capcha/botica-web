import type { AlertTone } from "./dashboard";

export type AlertShape = "circle-alert" | "triangle-alert" | "info";

export interface AlertLook {
  /** Tono visual (tokens semánticos). */
  tone: "danger" | "warning" | "info";
  /** Palabra que se lee en voz alta antes del título: la gravedad no depende solo del color. */
  label: string;
  /** Forma del ícono: cada gravedad tiene una distinta. */
  shape: AlertShape;
}

const LOOK: Record<AlertTone, AlertLook> = {
  critical: { tone: "danger", label: "Urgente", shape: "circle-alert" },
  warning: { tone: "warning", label: "Atención", shape: "triangle-alert" },
  info: { tone: "info", label: "Aviso", shape: "info" },
};

/** Cómo se ve y se anuncia cada gravedad de una alerta del panel. */
export const alertLook = (tone: AlertTone): AlertLook => LOOK[tone];

/** Avance de hoy frente a una meta (por ejemplo el mismo día de la semana pasada), de 0 a 1. Sin meta válida no hay barra. */
export function goalProgress(total: number, goal: number | null | undefined): number | undefined {
  if (goal == null || !Number.isFinite(goal) || goal <= 0 || !Number.isFinite(total)) return undefined;
  return Math.min(1, Math.max(0, total / goal));
}
