/**
 * Devoluciones (notas de crédito) en los resúmenes de dinero: venta neta = venta bruta − devoluciones.
 * Reglas puras; el backend debería aplicar los mismos casos.
 *
 * - Una nota resta en el día y el turno en que se EMITIÓ, no el de la venta original.
 * - Se cuenta por el método de pago de la venta original: solo el efectivo toca la caja.
 * - Una nota que devuelve mercadería revierte el costo al costo del lote de origen; una sin devolución
 *   de stock (descuento, disminución o `returnStock: false`) resta venta pero no costo.
 * - Una nota rechazada o anulada por SUNAT no cuenta (igual que en `creditedTotalOf`).
 */
import type { CreditNote, PaymentMethod, PaymentTotals, Sale, SalesReportLine } from "@/lib/api/types";
import { cents, fromCents } from "./cash";
import { round2 } from "./pharmacy";
import { allocateReturn, creditableLines } from "./vouchers";

export const isLiveNote = (n: Pick<CreditNote, "status">): boolean => n.status !== "rechazado" && n.status !== "anulado";

/** Marca de las líneas de reporte que vienen de una nota de crédito (importes en negativo). */
export const isReturnLine = (l: Pick<SalesReportLine, "kind">): boolean => l.kind === "devolucion";

const ZERO: PaymentTotals = { efectivo: 0, yape: 0, tarjeta: 0 };

/** Reparte un importe entre pesos, en céntimos, sin perder ni inventar centavos. */
function prorate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (!(sum > 0)) return weights.map(() => 0);
  let left = cents(total);
  return weights.map((w, i) => {
    const part = i === weights.length - 1 ? left : Math.round((cents(total) * w) / sum);
    left -= part;
    return fromCents(part);
  });
}

/** Costo de cada lote (sin IGV) para revertirlo al devolver mercadería. */
export type LotCost = (lotId: number, productId: number) => number;

/**
 * Líneas de reporte (en negativo) de las notas válidas de UNA venta. Cada línea lleva la fecha, el local y el
 * usuario de la venta original, pero `at` es el momento en que se emitió la nota.
 */
export function returnLines(sale: Sale, notes: CreditNote[], costOf: LotCost): SalesReportLine[] {
  const out: SalesReportLine[] = [];
  const stockBack = new Map<number, number>(); // unidades que ya volvieron al stock, por línea
  const mine = notes.filter((n) => n.voucherId === sale.id && isLiveNote(n)).sort((a, b) => a.issuedAt.localeCompare(b.issuedAt));
  for (const n of mine) {
    const base = {
      saleId: sale.id, number: n.number, at: n.issuedAt, branchId: n.branchId, sellerName: sale.sellerName, method: sale.payment.method, documentType: sale.document.type,
      customerId: sale.customerId, discount: 0, prescription: null, kind: "devolucion" as const,
    };
    if (n.items.length) {
      for (const it of n.items) {
        const line = sale.items[it.lineIndex];
        if (!line) continue;
        let cost = 0;
        if (n.returnedToStock) {
          const back = stockBack.get(it.lineIndex) ?? 0;
          for (const a of allocateReturn(line.lots.map((l) => ({ lotId: l.lotId, units: l.units })), back, it.units)) cost += a.units * costOf(a.lotId, line.productId);
          stockBack.set(it.lineIndex, back + it.units);
        }
        out.push({ ...base, productId: it.productId, presentationLabel: it.presentationLabel, qty: -it.qty, units: -it.units, total: -it.total, cost: cost ? -round2(cost) : 0 });
      }
    } else {
      // Descuento o disminución: se reparte entre los productos de la venta según lo que pesaba cada uno.
      const parts = prorate(n.total, sale.items.map((l) => l.total));
      sale.items.forEach((l, i) => {
        if (parts[i]) out.push({ ...base, productId: l.productId, presentationLabel: l.presentationLabel, qty: 0, units: 0, total: -parts[i]!, cost: 0 });
      });
    }
  }
  return out;
}

/** Devoluciones por método de pago (el de la venta original) y cuántas notas son. */
export function returnsByMethod(notes: Pick<CreditNote, "status" | "total" | "voucherId">[], methodOf: (voucherId: string) => PaymentMethod | undefined): PaymentTotals & { count: number } {
  const t = { ...ZERO };
  let count = 0;
  for (const n of notes) {
    if (!isLiveNote(n)) continue;
    const m = methodOf(n.voucherId);
    if (!m) continue;
    t[m] += cents(n.total);
    count++;
  }
  return { efectivo: fromCents(t.efectivo), yape: fromCents(t.yape), tarjeta: fromCents(t.tarjeta), count };
}

/** Venta neta por método de pago: lo cobrado menos lo devuelto. */
export const netPayments = (gross: PaymentTotals, returns: PaymentTotals): PaymentTotals => ({
  efectivo: fromCents(cents(gross.efectivo) - cents(returns.efectivo)),
  yape: fromCents(cents(gross.yape) - cents(returns.yape)),
  tarjeta: fromCents(cents(gross.tarjeta) - cents(returns.tarjeta)),
});

export const sumPayments = (p: PaymentTotals): number => fromCents(cents(p.efectivo) + cents(p.yape) + cents(p.tarjeta));

/** Compra de un cliente descontando lo que devolvió. Una compra devuelta por completo queda en 0. */
export function netPurchase(sale: Sale, notes: Pick<CreditNote, "status" | "items" | "total" | "returnedToStock">[]) {
  const live = notes.filter(isLiveNote);
  const returned = round2(live.reduce((s, n) => s + n.total, 0));
  const items = creditableLines(sale, notes)
    .filter((c) => c.remainingQty > 0)
    .map((c) => ({
      productId: c.line.productId, presentationLabel: c.line.presentationLabel, qty: c.remainingQty,
      units: Math.round((c.line.units * c.remainingQty) / c.line.qty), total: c.remainingTotal,
    }));
  return { total: round2(sale.total - returned), returned, items };
}
