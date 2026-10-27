/**
 * Reglas de negocio puras (sin React ni red). Se prueban con Vitest.
 * El backend aplica las mismas reglas al registrar la venta; aquí sirven para la vista previa del carrito.
 */
import type { ExpiryThresholds, Lot, PresentationId, Product } from "@/lib/api/types";

export const IGV = 0.18;
const DAY = 86_400_000;

export const round2 = (n: number) => Math.round(n * 100) / 100;

/* ------------------------------ Fechas ------------------------------ */

export const parseDay = (iso: string): number => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1).getTime();
};

export const startOfDay = (t: number): number => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export const daysUntil = (expiresOn: string, now: number): number => Math.round((parseDay(expiresOn) - startOfDay(now)) / DAY);

export type ExpiryTone = "vencido" | "critico" | "por_vencer" | "vigente";

export const DEFAULT_THRESHOLDS: ExpiryThresholds = { red: 30, yellow: 90 };

export const expiryTone = (days: number, t: ExpiryThresholds = DEFAULT_THRESHOLDS): ExpiryTone =>
  days < 0 ? "vencido" : days <= t.red ? "critico" : days <= t.yellow ? "por_vencer" : "vigente";

/* ------------------------------ Presentaciones ------------------------------ */

export interface Presentation {
  id: PresentationId;
  label: string;
  units: number;
  price: number;
}

const capitalize = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

/** Fracciones de venta disponibles: unidad siempre; blíster y caja si tienen precio. */
export function presentationsOf(p: Product): Presentation[] {
  const list: Presentation[] = [{ id: "unidad", label: p.unitsPerBox === 1 ? capitalize(p.unitName) : "Unidad", units: 1, price: p.priceUnit }];
  if (p.unitsPerBlister > 1 && p.priceBlister > 0) list.push({ id: "blister", label: `Blíster x${p.unitsPerBlister}`, units: p.unitsPerBlister, price: p.priceBlister });
  if (p.unitsPerBox > 1 && p.priceBox > 0) list.push({ id: "caja", label: `Caja x${p.unitsPerBox}`, units: p.unitsPerBox, price: p.priceBox });
  return list;
}

export const findPresentation = (p: Product, id: PresentationId): Presentation => presentationsOf(p).find((x) => x.id === id) ?? presentationsOf(p)[0]!;

/** "3 cj + 20 u", "18 frascos", "45 unid." */
export function stockLabel(p: Product, units: number): string {
  if (p.unitsPerBox <= 1) {
    const plural = units === 1 ? p.unitName : /[lr]$/.test(p.unitName) ? `${p.unitName}es` : `${p.unitName}s`;
    return `${units.toLocaleString("es-PE")} ${plural}`;
  }
  const boxes = Math.floor(units / p.unitsPerBox);
  const rest = units % p.unitsPerBox;
  if (!boxes) return `${units.toLocaleString("es-PE")} unid.`;
  return `${boxes} cj${rest ? ` + ${rest} u` : ""}`;
}

/* ------------------------------ Lotes y FEFO ------------------------------ */

/** Lotes con stock y no vencidos, del que vence primero al último (FEFO). */
export const sellableLots = (lots: Lot[], productId: number, now: number): Lot[] =>
  lots
    .filter((l) => l.productId === productId && l.qty > 0 && daysUntil(l.expiresOn, now) >= 0)
    .sort((a, b) => parseDay(a.expiresOn) - parseDay(b.expiresOn) || a.id - b.id);

export const stockOf = (lots: Lot[], productId: number, now: number): number => sellableLots(lots, productId, now).reduce((s, l) => s + l.qty, 0);

export interface Allocation {
  lotId: number;
  code: string;
  expiresOn: string;
  units: number;
  discount: number;
}

/**
 * Reparte `units` entre los lotes por FEFO.
 * `taken` acumula lo ya reservado por otras líneas del mismo carrito (se modifica).
 */
export function allocateFefo(lots: Lot[], productId: number, units: number, now: number, taken: Map<number, number> = new Map()) {
  const alloc: Allocation[] = [];
  let left = units;
  for (const l of sellableLots(lots, productId, now)) {
    if (left <= 0) break;
    const avail = l.qty - (taken.get(l.id) ?? 0);
    if (avail <= 0) continue;
    const u = Math.min(avail, left);
    alloc.push({ lotId: l.id, code: l.code, expiresOn: l.expiresOn, units: u, discount: l.discount });
    taken.set(l.id, (taken.get(l.id) ?? 0) + u);
    left -= u;
  }
  return { alloc, missing: left };
}

/** Descuento promedio ponderado por unidades (lotes por vencer con rebaja). */
export const weightedDiscount = (alloc: Allocation[], units: number) => (units ? alloc.reduce((s, a) => s + a.units * a.discount, 0) / units : 0);

/* ------------------------------ Carrito ------------------------------ */

export interface CartItem {
  key: string;
  productId: number;
  presentation: PresentationId;
  qty: number;
}

export interface CartLine extends CartItem {
  product: Product;
  pres: Presentation;
  units: number;
  alloc: Allocation[];
  missing: number;
  discount: number;
  gross: number;
  total: number;
}

export function buildCartLines(items: CartItem[], products: Map<number, Product>, lots: Lot[], now: number): CartLine[] {
  const taken = new Map<number, number>();
  const out: CartLine[] = [];
  for (const it of items) {
    const product = products.get(it.productId);
    if (!product) continue;
    const pres = findPresentation(product, it.presentation);
    const units = it.qty * pres.units;
    const { alloc, missing } = allocateFefo(lots, product.id, units, now, taken);
    const discount = weightedDiscount(alloc, units);
    const gross = round2(it.qty * pres.price);
    out.push({ ...it, product, pres, units, alloc, missing, discount, gross, total: round2(gross * (1 - discount)) });
  }
  return out;
}

export interface Totals {
  subtotal: number;
  savings: number;
  total: number;
  taxBase: number;
  igv: number;
  needsRx: boolean;
  needsControlled: boolean;
}

export function cartTotals(lines: CartLine[]): Totals {
  const subtotal = round2(lines.reduce((s, l) => s + l.gross, 0));
  const total = round2(lines.reduce((s, l) => s + l.total, 0));
  const taxBase = round2(total / (1 + IGV));
  return {
    subtotal,
    savings: round2(subtotal - total),
    total,
    taxBase,
    igv: round2(total - taxBase),
    needsRx: lines.some((l) => l.product.rx !== "libre"),
    needsControlled: lines.some((l) => l.product.rx === "controlado"),
  };
}

/** Unidades del mismo producto ya pedidas en otras líneas del carrito. */
export const unitsInCart = (lines: CartLine[], productId: number, exceptKey?: string) =>
  lines.filter((l) => l.productId === productId && l.key !== exceptKey).reduce((s, l) => s + l.units, 0);

/* ------------------------------ Comprobantes ------------------------------ */

export const isValidDni = (s: string) => /^\d{8}$/.test(s);
export const isValidRuc = (s: string) => /^(10|20)\d{9}$/.test(s);
export const isValidCmp = (s: string) => /^\d{4,6}$/.test(s);

/** Boleta: DNI opcional, obligatorio desde S/ 700. Factura: RUC y razón social. */
export function documentIsValid(type: "boleta" | "factura", docId: string, name: string, total: number): boolean {
  if (type === "factura") return isValidRuc(docId) && name.trim().length > 2;
  if (total > 700) return isValidDni(docId);
  return !docId || isValidDni(docId);
}

/** Montos rápidos para el vuelto: exacto y billetes redondos por encima del total. */
export function quickCashAmounts(total: number): number[] {
  const opts = [Math.ceil(total), Math.ceil(total / 10) * 10, Math.ceil(total / 20) * 20, Math.ceil(total / 50) * 50, 100, 200];
  return [...new Set(opts.filter((v) => v >= total))].slice(0, 5);
}
