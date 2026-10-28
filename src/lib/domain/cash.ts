/**
 * Caja: totales del turno, efectivo esperado y arqueo (reglas puras, se prueban con Vitest).
 * Se calcula en céntimos enteros para que S/ 0.10 + S/ 0.20 no dé 0.30000000004.
 */
import type { CashMovement, Denominations, PaymentMethod, PaymentTotals } from "@/lib/api/types";

export const cents = (n: number) => Math.round(n * 100);
export const fromCents = (c: number) => c / 100;

/** Billetes y monedas en circulación en el Perú, de mayor a menor. */
export const DENOMINATIONS: { value: number; kind: "billete" | "moneda" }[] = [
  { value: 200, kind: "billete" },
  { value: 100, kind: "billete" },
  { value: 50, kind: "billete" },
  { value: 20, kind: "billete" },
  { value: 10, kind: "billete" },
  { value: 5, kind: "moneda" },
  { value: 2, kind: "moneda" },
  { value: 1, kind: "moneda" },
  { value: 0.5, kind: "moneda" },
  { value: 0.2, kind: "moneda" },
  { value: 0.1, kind: "moneda" },
];

export const denominationLabel = (v: number) => (v >= 1 ? `S/ ${v}` : `${Math.round(v * 100)} cts`);

/** Total contado por denominación. Ignora cantidades negativas o no enteras. */
export function countDenominations(d: Denominations): number {
  let c = 0;
  for (const [k, qty] of Object.entries(d)) {
    const v = Number(k);
    if (!Number.isFinite(v) || !Number.isInteger(qty) || qty <= 0) continue;
    c += cents(v) * qty;
  }
  return fromCents(c);
}

export function paymentTotals(sales: { method: PaymentMethod; total: number }[]): PaymentTotals {
  const t = { efectivo: 0, yape: 0, tarjeta: 0 };
  for (const s of sales) t[s.method] += cents(s.total);
  return { efectivo: fromCents(t.efectivo), yape: fromCents(t.yape), tarjeta: fromCents(t.tarjeta) };
}

export function movementTotals(movements: Pick<CashMovement, "type" | "amount">[]) {
  const t = { ingreso: 0, egreso: 0, retiro: 0 };
  for (const m of movements) t[m.type] += cents(m.amount);
  return { ingresos: fromCents(t.ingreso), egresos: fromCents(t.egreso), retiros: fromCents(t.retiro) };
}

/** Efectivo que debe haber: fondo + ventas en efectivo + ingresos − egresos − retiros. */
export function expectedCash(opening: number, cashSales: number, movements: Pick<CashMovement, "type" | "amount">[]): number {
  const m = movementTotals(movements);
  return fromCents(cents(opening) + cents(cashSales) + cents(m.ingresos) - cents(m.egresos) - cents(m.retiros));
}

export type CloseTone = "cuadra" | "faltante" | "sobrante";

/** Diferencia del arqueo. Menos de 5 céntimos se considera cuadrado (redondeo de sencillo). */
export function closeDifference(counted: number, expected: number): { difference: number; tone: CloseTone; needsNote: boolean } {
  const difference = fromCents(cents(counted) - cents(expected));
  const abs = Math.abs(difference);
  return { difference, tone: abs < 0.05 ? "cuadra" : difference < 0 ? "faltante" : "sobrante", needsNote: abs >= 1 };
}

/** Un egreso o retiro no puede dejar la caja en negativo. */
export function movementError(type: CashMovement["type"], amount: number, note: string, available: number): string | null {
  if (!(amount > 0)) return "Escribe el monto";
  if (Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6) return "Máximo dos decimales";
  if (amount > 10_000) return "Monto demasiado alto para la caja";
  if (note.trim().length < 3) return "Escribe el motivo";
  if (type !== "ingreso" && cents(amount) > cents(available)) return `Solo hay ${available.toFixed(2)} en efectivo`;
  return null;
}

export const MOVEMENT_LABEL: Record<CashMovement["type"], string> = { egreso: "Egreso", retiro: "Retiro", ingreso: "Ingreso" };
export const PAYMENT_LABEL: Record<PaymentMethod, string> = { efectivo: "Efectivo", yape: "Yape / Plin", tarjeta: "Tarjeta" };
