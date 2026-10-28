import type { ChartDatum, ChartSeries } from "@/components/charts/column-chart";
/**
 * Colores de los gráficos, validados para daltonismo y separación entre sí (skill de visualización).
 * Cada local tiene siempre el mismo color, en el orden en que aparece en la configuración.
 * El texto nunca usa estos colores: van solo en las marcas (barras, puntos).
 */
export const SERIES_COLORS = ["#1baf7a", "#2a78d6", "#eb6834", "#6250d6"] as const;

export const branchColor = (branchIds: string[], branchId: string) => SERIES_COLORS[Math.max(0, branchIds.indexOf(branchId)) % SERIES_COLORS.length]!;

/**
 * Con más de 4 locales no hay colores que se distingan bien: el gráfico muestra el total
 * (una sola serie) y el detalle por local queda en las tablas y en "Ver tabla".
 */
export function foldBranches(series: ChartSeries[], data: ChartDatum[]): { series: ChartSeries[]; data: ChartDatum[] } {
  if (series.length <= SERIES_COLORS.length) return { series, data };
  const keys = series.map((s) => s.key);
  return {
    series: [{ key: "total", label: `Todos los locales (${series.length})`, color: SERIES_COLORS[0] }],
    data: data.map((d) => ({ ...d, values: { total: Math.round(keys.reduce((s, k) => s + (d.values[k] ?? 0), 0) * 100) / 100 } })),
  };
}
