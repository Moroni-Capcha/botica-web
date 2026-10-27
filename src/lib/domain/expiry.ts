/**
 * Vencimientos y prioridad de venta (reglas puras, se prueban con Vitest).
 *
 * Idea: con la venta diaria reciente de cada producto y el orden FEFO, se estima cuántas unidades
 * de cada lote no alcanzarán a venderse antes de su fecha. Esas unidades están "en riesgo" y su
 * costo es la pérdida que la botica evita si actúa a tiempo (descuento, traslado o canje).
 */
import type { BranchId, ExpiryThresholds, Lot, Product, ProductVelocity } from "@/lib/api/types";
import { daysUntil, expiryTone, parseDay, round2, type ExpiryTone } from "./pharmacy";

export interface LotRisk {
  lot: Lot;
  product: Product;
  branchId: BranchId;
  days: number;
  tone: ExpiryTone;
  /** Venta diaria actual del producto en el local (unidades por día). */
  rate: number;
  /** Unidades del lote que no se venderían antes de vencer al ritmo actual. */
  atRisk: number;
  /** Costo de las unidades en riesgo. */
  loss: number;
  /** Valor del lote a costo. */
  value: number;
  /** Unidades por día que habría que vender para no perder nada (incluye los lotes que salen antes). */
  needRate: number;
}

const key = (branchId: BranchId, productId: number) => `${branchId}:${productId}`;

/** Convierte la venta de los últimos días en un ritmo diario por local y producto. */
export function dailyRates(velocity: ProductVelocity[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const v of velocity) if (v.days > 0) m.set(key(v.branchId, v.productId), v.units / v.days);
  return m;
}

export const rateOf = (rates: Map<string, number>, branchId: BranchId, productId: number) => rates.get(key(branchId, productId)) ?? 0;

/** Analiza todos los lotes con stock. Los lotes de cada producto se recorren por FEFO dentro de su local. */
export function lotRisk(products: Product[], lots: Lot[], rates: Map<string, number>, now: number, thresholds: ExpiryThresholds): LotRisk[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  const groups = new Map<string, Lot[]>();
  for (const l of lots) {
    if (l.qty <= 0 || !byId.has(l.productId)) continue;
    const k = key(l.branchId, l.productId);
    const g = groups.get(k);
    if (g) g.push(l);
    else groups.set(k, [l]);
  }

  const rows: LotRisk[] = [];
  for (const group of groups.values()) {
    group.sort((a, b) => parseDay(a.expiresOn) - parseDay(b.expiresOn) || a.id - b.id);
    const first = group[0]!;
    const product = byId.get(first.productId)!;
    const rate = rateOf(rates, first.branchId, first.productId);
    let ahead = 0; // unidades vigentes que salen antes que este lote
    for (const lot of group) {
      const days = daysUntil(lot.expiresOn, now);
      let atRisk: number;
      let needRate = Infinity;
      if (days < 0) {
        atRisk = lot.qty;
      } else {
        const canSell = Math.max(0, rate * days - ahead);
        atRisk = Math.max(0, Math.min(lot.qty, Math.round(lot.qty - canSell)));
        ahead += lot.qty;
        if (days > 0) needRate = ahead / days;
      }
      rows.push({
        lot, product, branchId: lot.branchId, days, tone: expiryTone(days, thresholds), rate, atRisk,
        loss: round2(atRisk * lot.cost), value: round2(lot.qty * lot.cost), needRate,
      });
    }
  }
  return rows;
}

/** Lotes vigentes con unidades en riesgo, de mayor a menor pérdida. */
export const priorityList = (rows: LotRisk[]) => rows.filter((r) => r.tone !== "vencido" && r.atRisk > 0).sort((a, b) => b.loss - a.loss || a.days - b.days);

export const TONE_ORDER: ExpiryTone[] = ["vencido", "critico", "por_vencer", "vigente"];

export interface ToneSummary {
  tone: ExpiryTone;
  lots: number;
  units: number;
  value: number;
}

export function summarizeByTone(rows: LotRisk[]): ToneSummary[] {
  return TONE_ORDER.map((tone) => {
    const g = rows.filter((r) => r.tone === tone);
    return { tone, lots: g.length, units: g.reduce((s, r) => s + r.lot.qty, 0), value: round2(g.reduce((s, r) => s + r.value, 0)) };
  });
}

/** Rango de días de cada tono, para mostrar en las tarjetas. */
export function toneRange(tone: ExpiryTone, t: ExpiryThresholds): string {
  if (tone === "vencido") return "Ya vencidos";
  if (tone === "critico") return `0 a ${t.red} días`;
  if (tone === "por_vencer") return `${t.red + 1} a ${t.yellow} días`;
  return `Más de ${t.yellow} días`;
}

/**
 * Sugiere trasladar el lote a otro local cuando allá el producto se vende claramente más rápido
 * (al menos 30 % más y con venta real). Devuelve el local con mejor ritmo o null.
 */
export function transferSuggestion(row: LotRisk, branchIds: BranchId[], rates: Map<string, number>): { branchId: BranchId; rate: number } | null {
  let best: { branchId: BranchId; rate: number } | null = null;
  for (const b of branchIds) {
    if (b === row.branchId) continue;
    const r = rateOf(rates, b, row.product.id);
    if (r > 0 && r > row.rate * 1.3 && (!best || r > best.rate)) best = { branchId: b, rate: r };
  }
  return best;
}

/** Descuentos rápidos que ofrece la pantalla. El backend acepta de 0 a 0.5. */
export const DISCOUNT_STEPS = [0.1, 0.2, 0.3] as const;
export const MAX_LOT_DISCOUNT = 0.5;
