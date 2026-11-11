/** Escala del eje Y de los gráficos de columnas (regla pura, se prueba con Vitest). */

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Escala "bonita" para el eje: 0 y 3 a 4 marcas redondas.
 * Con `integer`, las marcas son números enteros: para conteos (boticas, ventas), donde 0,25 no existe.
 */
export function niceTicks(max: number, integer = false): number[] {
  if (max <= 0) return [0];
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  let step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  if (integer) step = Math.max(1, Math.ceil(step));
  const top = Math.ceil(max / step) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => round(i * step));
}
