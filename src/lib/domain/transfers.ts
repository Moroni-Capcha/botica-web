/**
 * Traslados entre locales (reglas puras, se prueban con Vitest).
 */
import type { BranchId, ExpiryThresholds, Lot, Product, Transfer, User } from "@/lib/api/types";
import { lotRisk, rateOf, transferSuggestion } from "./expiry";
import { minFor } from "./inventory";
import { round2, sellableLots } from "./pharmacy";

export const transferCode = (id: number) => `T-${String(id).padStart(4, "0")}`;

export const transferUnits = (t: Pick<Transfer, "items" | "requested">) =>
  t.items.length ? t.items.reduce((s, it) => s + it.units, 0) : (t.requested ?? []).reduce((s, it) => s + it.units, 0);

/** Valor a costo de lo que viaja (o de lo pedido, con el costo del catálogo). */
export function transferValue(t: Pick<Transfer, "items" | "requested">, products: Map<number, Product>): number {
  if (t.items.length) return round2(t.items.reduce((s, it) => s + it.units * (it.unitCost ?? products.get(it.productId)?.cost ?? 0), 0));
  return round2((t.requested ?? []).reduce((s, it) => s + it.units * (products.get(it.productId)?.cost ?? 0), 0));
}

/* ------------------------------ Permisos ------------------------------ */

const operates = (user: Pick<User, "role" | "branchId">, branchId: BranchId) => user.role === "admin" || user.branchId === branchId;

/** Qué puede hacer la cuenta con un traslado. El backend aplica las mismas reglas. */
export function transferActions(t: Pick<Transfer, "status" | "fromBranchId" | "toBranchId">, user: Pick<User, "role" | "branchId">) {
  const fromOk = operates(user, t.fromBranchId);
  const toOk = operates(user, t.toBranchId);
  return {
    dispatch: t.status === "solicitado" && fromOk,
    receive: t.status === "en_transito" && toOk,
    /* Un pedido lo anula cualquiera de los dos locales; un envío en camino, solo el que lo despachó */
    cancel: (t.status === "solicitado" && (fromOk || toOk)) || (t.status === "en_transito" && fromOk),
  };
}

/** Si la cuenta solo puede pedir (encargado del destino) o también enviar (encargado del origen o administrador). */
export const transferMode = (user: Pick<User, "role" | "branchId">, fromBranchId: BranchId): "send" | "ask" => (operates(user, fromBranchId) ? "send" : "ask");

/* ------------------------------ Sugerencias ------------------------------ */

export interface TransferSuggestion {
  key: string;
  kind: "stock" | "vencimiento";
  product: Product;
  from: BranchId;
  to: BranchId;
  units: number;
  /** Lote concreto a enviar (solo en sugerencias por vencimiento). */
  lotId: number | null;
  /** Pérdida que se evita (solo por vencimiento). */
  loss: number;
  /** Datos para explicar la sugerencia. */
  detail: { fromStock: number; toStock: number; toMin: number; fromRate: number; toRate: number; days?: number; lotCode?: string };
}

/**
 * Dos casos:
 *  - stock: el destino está en su mínimo o debajo y el origen tiene de sobra (más que su mínimo y `coverDays` de venta).
 *  - vencimiento: un lote crítico o por vencer no se venderá a tiempo y el otro local lo vende claramente más rápido.
 */
export function suggestTransfers({ products, lots, stock, branchIds, rates, now, coverDays, thresholds }: {
  products: Product[];
  /** Lotes que la cuenta puede ver (para las sugerencias por vencimiento). */
  lots: Lot[];
  /** Stock vigente por local y producto, clave `${branchId}:${productId}` (resumen de todos los locales). */
  stock: Map<string, number>;
  branchIds: BranchId[];
  rates: Map<string, number>;
  now: number;
  coverDays: number;
  thresholds: ExpiryThresholds;
}): TransferSuggestion[] {
  const out: TransferSuggestion[] = [];
  const stockAt = (b: BranchId, pid: number) => stock.get(`${b}:${pid}`) ?? 0;

  for (const product of products) {
    for (const from of branchIds) {
      for (const to of branchIds) {
        if (from === to) continue;
        const toStock = stockAt(to, product.id);
        const toMin = minFor(product, to);
        if (toStock > toMin) continue;
        const fromStock = stockAt(from, product.id);
        const fromRate = rateOf(rates, from, product.id);
        const toRate = rateOf(rates, to, product.id);
        const need = Math.ceil(toMin + toRate * 7 - toStock);
        const surplus = Math.floor(fromStock - (minFor(product, from) + fromRate * coverDays));
        const units = Math.min(need, surplus);
        if (units > 0) out.push({ key: `s-${product.id}-${from}-${to}`, kind: "stock", product, from, to, units, lotId: null, loss: 0, detail: { fromStock, toStock, toMin, fromRate, toRate } });
      }
    }
  }

  for (const r of lotRisk(products, lots, rates, now, thresholds)) {
    // Solo lotes críticos o por vencer: un lote vigente aún tiene tiempo de venderse donde está
    if (r.tone === "vencido" || r.tone === "vigente" || r.atRisk <= 0) continue;
    const best = transferSuggestion(r, branchIds, rates);
    if (!best || best.rate * r.days < r.atRisk * 0.5) continue;
    const units = Math.min(r.atRisk, Math.floor(best.rate * Math.max(1, r.days - 3)), r.lot.qty);
    if (units <= 0 || units * r.lot.cost < 1) continue; // menos de S/ 1 no vale el viaje
    out.push({
      key: `v-${r.lot.id}-${best.branchId}`, kind: "vencimiento", product: r.product, from: r.branchId, to: best.branchId, units, lotId: r.lot.id, loss: round2(units * r.lot.cost),
      detail: { fromStock: stockAt(r.branchId, r.product.id), toStock: stockAt(best.branchId, r.product.id), toMin: minFor(r.product, best.branchId), fromRate: r.rate, toRate: best.rate, days: r.days, lotCode: r.lot.code },
    });
  }

  return out.sort((a, b) => (a.kind === b.kind ? b.loss - a.loss || a.product.name.localeCompare(b.product.name) : a.kind === "vencimiento" ? -1 : 1));
}

/* ------------------------------ Formulario ------------------------------ */

export interface TransferLineDraft {
  key: string;
  productId: number | null;
  /** null = automático (FEFO) */
  lotId: number | null;
  qty: number;
  mode: "caja" | "unidad";
}

export interface TransferLineCheck {
  units: number;
  /** Unidades vigentes disponibles en el origen para esta fila (descontando otras filas). */
  available: number;
  error: string | null;
}

export function checkTransferLine(line: TransferLineDraft, product: Product | undefined, ctx: { mode: "send" | "ask"; originLots: Lot[]; lines: TransferLineDraft[]; now: number }): TransferLineCheck {
  if (!product) return { units: 0, available: 0, error: "Elige el producto" };
  const units = line.mode === "caja" ? line.qty * Math.max(1, product.unitsPerBox) : line.qty;
  const sellable = sellableLots(ctx.originLots, product.id, ctx.now);
  const others = ctx.lines.filter((o) => o.key !== line.key && o.productId === line.productId);
  const unitsOf = (o: TransferLineDraft) => (o.mode === "caja" ? o.qty * Math.max(1, product.unitsPerBox) : o.qty);
  let available: number;
  if (line.lotId !== null) {
    const lot = sellable.find((l) => l.id === line.lotId);
    available = (lot?.qty ?? 0) - others.filter((o) => o.lotId === line.lotId).reduce((s, o) => s + unitsOf(o), 0);
  } else {
    available = sellable.reduce((s, l) => s + l.qty, 0) - others.reduce((s, o) => s + unitsOf(o), 0);
  }
  available = Math.max(0, available);
  if (!Number.isInteger(line.qty) || line.qty <= 0) return { units, available, error: "Indica la cantidad" };
  if (ctx.mode === "send" && units > available) return { units, available, error: available ? `Solo hay ${available.toLocaleString("es-PE")} unid. ${line.lotId !== null ? "en ese lote" : "vigentes"}` : "Sin stock vigente en el origen" };
  return { units, available, error: null };
}
