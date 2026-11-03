/** Reglas de presentación de Vencimientos (puras, con prueba). Los umbrales y el riesgo siguen en `lib/domain/expiry`. */
import type { Tone } from "@/components/ui/tone";
import type { ExpiryTone } from "@/lib/domain/pharmacy";

/** Texto de los días que quedan: el mismo que muestra `ExpiryBadge`. */
export function daysLabel(days: number): string {
  if (days < 0) return `Vencido hace ${-days} d`;
  if (days === 0) return "Vence hoy";
  return `Vence en ${days} d`;
}

/** Tono del chip de cada grupo del semáforo (igual que `TONE` de los distintivos). */
export const CHIP_TONE: Record<ExpiryTone, { tone: Tone; solid?: boolean }> = {
  vencido: { tone: "neutral", solid: true },
  critico: { tone: "danger" },
  por_vencer: { tone: "warning" },
  vigente: { tone: "success" },
};

export type RowAction = "traslado" | "vender" | "baja";

/**
 * Acción principal de un lote: lo vencido solo se da de baja; lo demás se traslada si otro local lo vende más rápido,
 * si no se ofrece en el mostrador (si hay permiso) y, por último, se da de baja o se canjea.
 */
export function primaryAction(tone: ExpiryTone, opts: { hasMove: boolean; canSell: boolean }): RowAction {
  if (tone === "vencido") return "baja";
  if (opts.hasMove) return "traslado";
  return opts.canSell ? "vender" : "baja";
}

/** Agrupa filas consecutivas por tono, sin reordenar (la lista ya viene ordenada por días). */
export function groupByTone<T extends { tone: ExpiryTone }>(rows: T[]): { tone: ExpiryTone; rows: T[] }[] {
  const out: { tone: ExpiryTone; rows: T[] }[] = [];
  for (const r of rows) {
    const last = out[out.length - 1];
    if (last && last.tone === r.tone) last.rows.push(r);
    else out.push({ tone: r.tone, rows: [r] });
  }
  return out;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
export const unitsText = (n: number) => plural(n, "unidad", "unidades");
