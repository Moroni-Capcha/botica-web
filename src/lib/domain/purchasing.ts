/**
 * Compras: pedido sugerido y validación del ingreso de mercadería (reglas puras, se prueban con Vitest).
 */
import type { BranchId, Lot, Product } from "@/lib/api/types";
import { minFor } from "./inventory";
import { daysUntil, IGV, parseDay, round2 } from "./pharmacy";
import { rateOf } from "./expiry";

/* ------------------------------ Pedido sugerido ------------------------------ */

export interface OrderSuggestion {
  branchId: BranchId;
  product: Product;
  /** Stock vigente del local, en unidades. */
  stock: number;
  /** Venta diaria del local. */
  rate: number;
  /** Días que alcanza el stock al ritmo actual (Infinity si no se vende). */
  cover: number;
  min: number;
  /** Unidades a pedir, redondeadas a cajas completas. */
  units: number;
  /** Cajas (o unidades si el producto se compra suelto). */
  packs: number;
  /** Costo estimado sin IGV. */
  cost: number;
  /** Proveedor del último lote recibido en el local (o en cualquier local). */
  supplier: string | null;
}

/**
 * Cuánto pedir por local para cubrir `coverDays` de venta más el stock mínimo.
 * Se compra por caja completa. Ordenado por los que se acaban primero.
 */
export function suggestOrder(products: Product[], lots: Lot[], branchIds: BranchId[], rates: Map<string, number>, now: number, coverDays: number): OrderSuggestion[] {
  const out: OrderSuggestion[] = [];
  for (const branchId of branchIds) {
    for (const product of products) {
      const own = lots.filter((l) => l.productId === product.id && l.branchId === branchId);
      const stock = own.filter((l) => l.qty > 0 && daysUntil(l.expiresOn, now) >= 0).reduce((s, l) => s + l.qty, 0);
      const rate = rateOf(rates, branchId, product.id);
      const min = minFor(product, branchId);
      const need = rate * coverDays + min;
      const missing = Math.ceil(need - stock);
      if (missing <= 0) continue;
      const pack = Math.max(1, product.unitsPerBox);
      const packs = Math.ceil(missing / pack);
      out.push({
        branchId, product, stock, rate, cover: rate > 0 ? stock / rate : Number.POSITIVE_INFINITY, min,
        units: packs * pack, packs, cost: round2(packs * pack * product.cost), supplier: lastSupplier(lots, product.id, branchId),
      });
    }
  }
  return out.sort((a, b) => a.cover - b.cover || b.cost - a.cost);
}

/** Proveedor del lote más reciente del producto: primero en el local, si no en cualquiera. */
export function lastSupplier(lots: Lot[], productId: number, branchId: BranchId): string | null {
  const withSupplier = lots.filter((l) => l.productId === productId && l.supplier && l.receivedOn);
  const latest = (list: Lot[]) => list.sort((a, b) => parseDay(b.receivedOn!) - parseDay(a.receivedOn!))[0]?.supplier ?? null;
  return latest(withSupplier.filter((l) => l.branchId === branchId)) ?? latest(withSupplier);
}

/* ------------------------------ Ingreso de mercadería ------------------------------ */

export type QtyMode = "caja" | "unidad";

export interface ReceiptLineDraft {
  key: string;
  productId: number | null;
  lotCode: string;
  expiresOn: string; // YYYY-MM-DD o ""
  qty: number;
  mode: QtyMode;
  unitCost: number;
}

export interface ReceiptLineCheck {
  units: number;
  subtotal: number;
  /** Impide guardar. */
  error: string | null;
  /** Se puede guardar, pero conviene revisar. */
  warning: string | null;
}

export const normalizeLotCode = (s: string) => s.trim().toUpperCase().replace(/\s+/g, "");
export const isValidLotCode = (s: string) => /^[A-Z0-9][A-Z0-9./-]{1,23}$/.test(normalizeLotCode(s));

const fmtDay = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

/**
 * Revisa una fila del ingreso. `branchLots` son los lotes que ya existen en el local que recibe
 * y `lines` todas las filas del mismo ingreso (para detectar lotes repetidos).
 */
export function checkReceiptLine(line: ReceiptLineDraft, product: Product | undefined, ctx: { now: number; minShelfDays: number; branchLots: Lot[]; lines: ReceiptLineDraft[] }): ReceiptLineCheck {
  const units = product ? (line.mode === "caja" ? line.qty * Math.max(1, product.unitsPerBox) : line.qty) : 0;
  const subtotal = round2(units * line.unitCost);
  const result = (error: string | null, warning: string | null = null): ReceiptLineCheck => ({ units, subtotal, error, warning });
  if (!product) return result("Elige el producto");
  const code = normalizeLotCode(line.lotCode);
  if (!code) return result("Falta el número de lote");
  if (!isValidLotCode(code)) return result("Lote no válido: letras, números, punto o guion");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(line.expiresOn)) return result("Falta el vencimiento");
  const days = daysUntil(line.expiresOn, ctx.now);
  if (days <= 0) return result("Ese lote ya está vencido o vence hoy");
  if (!Number.isInteger(line.qty) || line.qty <= 0) return result("Falta la cantidad");
  if (!(line.unitCost >= 0)) return result("Costo no válido");
  if (ctx.lines.some((o) => o.key !== line.key && o.productId === line.productId && normalizeLotCode(o.lotCode) === code)) return result("Este lote está repetido en el ingreso");
  const existing = ctx.branchLots.find((l) => l.productId === product.id && normalizeLotCode(l.code) === code);
  if (existing && existing.expiresOn !== line.expiresOn) return result(`El lote ${code} ya existe con vencimiento ${fmtDay(existing.expiresOn)}`);

  const warnings: string[] = [];
  if (days < ctx.minShelfDays) warnings.push(`Vencimiento corto: ${days} días. Considera pedir canje.`);
  if (line.unitCost > 0 && product.cost > 0) {
    const diff = (line.unitCost - product.cost) / product.cost;
    if (diff > 0.15) warnings.push(`Costo ${Math.round(diff * 100)} % mayor que el anterior (${product.cost.toFixed(2)}).`);
  }
  if (line.unitCost > 0 && line.unitCost * (1 + IGV) >= product.priceUnit) warnings.push("Con este costo no hay margen: revisa el precio de venta.");
  if (existing) warnings.push(`Se suma al lote ${code} que ya está en stock.`);
  return result(null, warnings.join(" ") || null);
}

export function receiptTotals(checks: ReceiptLineCheck[]) {
  const subtotal = round2(checks.reduce((s, c) => s + c.subtotal, 0));
  const igv = round2(subtotal * IGV);
  return { subtotal, igv, total: round2(subtotal + igv), units: checks.reduce((s, c) => s + c.units, 0) };
}

/** Factura o guía del proveedor: serie y número, p. ej. F001-00012345, E001-123, 0001-0004567. */
export const isValidSupplierDocument = (s: string) => /^[A-Z0-9]{1,4}-\d{1,10}$/.test(s.trim().toUpperCase());
