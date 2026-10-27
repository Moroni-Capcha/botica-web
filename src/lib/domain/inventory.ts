/**
 * Inventario y kardex (reglas puras, se prueban con Vitest).
 */
import type { BranchId, KardexEntry, Lot, Product, ProductInput } from "@/lib/api/types";
import { IGV, parseDay, round2, sellableLots } from "./pharmacy";

/* ------------------------------ Stock mínimo ------------------------------ */

/** Mínimo del producto en un local: el propio del local o, si no tiene, el general. */
export const minFor = (p: Product, branchId: BranchId): number => p.minStockByBranch?.[branchId] ?? p.minStock;

/* ------------------------------ Inventario por producto ------------------------------ */

export type StockStatus = "agotado" | "bajo" | "ok";

export interface InventoryRow {
  product: Product;
  /** Unidades vigentes (no vencidas) por local. */
  perBranch: Record<BranchId, number>;
  /** Suma de los locales analizados. */
  stock: number;
  /** Unidades vencidas que siguen en stock (pendientes de baja). */
  expired: number;
  /** Lotes con stock, vigentes o vencidos. */
  lots: number;
  /** Valor a costo de todo lo que hay (incluye vencidos). */
  valueCost: number;
  /** Valor a precio de venta por unidad, solo lo vigente. */
  valueRetail: number;
  /** Lote que sale primero (FEFO) entre los locales analizados. */
  next: Lot | undefined;
  /** Locales donde el stock vigente está en el mínimo o por debajo. */
  low: BranchId[];
  status: StockStatus;
}

export function inventoryRows(products: Product[], lots: Lot[], branchIds: BranchId[], now: number): InventoryRow[] {
  const inScope = new Set(branchIds);
  const byProduct = new Map<number, Lot[]>();
  for (const l of lots) {
    if (l.qty <= 0 || !inScope.has(l.branchId)) continue;
    const g = byProduct.get(l.productId);
    if (g) g.push(l);
    else byProduct.set(l.productId, [l]);
  }
  return products.map((product) => {
    const pl = byProduct.get(product.id) ?? [];
    const sell = sellableLots(pl, product.id, now);
    const perBranch = Object.fromEntries(branchIds.map((b) => [b, 0])) as Record<BranchId, number>;
    for (const l of sell) perBranch[l.branchId] = (perBranch[l.branchId] ?? 0) + l.qty;
    const stock = sell.reduce((s, l) => s + l.qty, 0);
    const all = pl.reduce((s, l) => s + l.qty, 0);
    const low = branchIds.filter((b) => (perBranch[b] ?? 0) <= minFor(product, b));
    return {
      product,
      perBranch,
      stock,
      expired: all - stock,
      lots: pl.length,
      valueCost: round2(pl.reduce((s, l) => s + l.qty * l.cost, 0)),
      valueRetail: round2(stock * product.priceUnit),
      next: sell[0],
      low,
      status: stock === 0 ? "agotado" : low.length ? "bajo" : "ok",
    };
  });
}

export interface InventoryGroup {
  key: string;
  products: number;
  withStock: number;
  /** Productos agotados o bajo el mínimo en algún local. */
  alerts: number;
  valueCost: number;
  valueRetail: number;
  /** Valor a costo del stock vigente por local. */
  costPerBranch: Record<BranchId, number>;
}

/** Agrupa por laboratorio o por tipo, de mayor a menor valor a costo. */
export function groupInventory(rows: InventoryRow[], by: "lab" | "category", branchIds: BranchId[]): InventoryGroup[] {
  const m = new Map<string, InventoryGroup>();
  for (const r of rows) {
    const key = by === "lab" ? r.product.lab : r.product.category;
    let g = m.get(key);
    if (!g) {
      g = { key, products: 0, withStock: 0, alerts: 0, valueCost: 0, valueRetail: 0, costPerBranch: Object.fromEntries(branchIds.map((b) => [b, 0])) as Record<BranchId, number> };
      m.set(key, g);
    }
    g.products++;
    if (r.stock > 0) g.withStock++;
    if (r.status !== "ok") g.alerts++;
    g.valueCost += r.valueCost;
    g.valueRetail += r.valueRetail;
    for (const b of branchIds) g.costPerBranch[b] = (g.costPerBranch[b] ?? 0) + (r.perBranch[b] ?? 0) * r.product.cost;
  }
  return [...m.values()]
    .map((g) => ({ ...g, valueCost: round2(g.valueCost), valueRetail: round2(g.valueRetail), costPerBranch: Object.fromEntries(Object.entries(g.costPerBranch).map(([k, v]) => [k, round2(v)])) }))
    .sort((a, b) => b.valueCost - a.valueCost || a.key.localeCompare(b.key));
}

/* ------------------------------ Kardex ------------------------------ */

export interface KardexLine extends KardexEntry {
  /** Saldo después del movimiento. */
  balance: number;
}

/**
 * Calcula el saldo de cada movimiento recorriendo desde el stock actual hacia atrás.
 * `entries` viene del más reciente al más antiguo. Devuelve las líneas en el mismo orden y el saldo inicial del periodo.
 */
export function kardexBalances(entries: KardexEntry[], closing: number): { lines: KardexLine[]; opening: number } {
  const sorted = [...entries].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  let run = closing;
  const lines = sorted.map((e) => {
    const line = { ...e, balance: run };
    run -= e.delta;
    return line;
  });
  return { lines, opening: run };
}

export const MOVE_LABEL: Record<KardexEntry["type"], string> = {
  ingreso: "Ingreso",
  venta: "Venta",
  merma: "Baja",
  devolucion: "Devolución",
  ajuste: "Ajuste",
  traslado_salida: "Traslado (sale)",
  traslado_ingreso: "Traslado (entra)",
};

/** Totales del periodo: entradas, salidas y unidades vendidas. */
export function kardexTotals(entries: KardexEntry[]) {
  let inUnits = 0;
  let outUnits = 0;
  let sold = 0;
  for (const e of entries) {
    if (e.delta > 0) inUnits += e.delta;
    else outUnits -= e.delta;
    if (e.type === "venta") sold -= e.delta;
  }
  return { inUnits, outUnits, sold };
}

/* ------------------------------ Precios y margen ------------------------------ */

/** Margen sobre el precio sin IGV, en %. Costo por unidad sin IGV. */
export function marginPct(price: number, units: number, unitCost: number): number {
  const net = price / (1 + IGV);
  if (net <= 0) return 0;
  return round2(((net - unitCost * units) / net) * 100);
}

/* ------------------------------ Validación del producto ------------------------------ */

export type ProductErrors = Partial<Record<keyof ProductInput, string>>;

/** Mismas reglas que aplica el backend al guardar. Devuelve un mensaje por campo con error. */
export function validateProduct(p: ProductInput, others: Product[] = [], selfId?: number): ProductErrors {
  const e: ProductErrors = {};
  if (p.name.trim().length < 2) e.name = "Escribe el nombre comercial.";
  if (!p.lab.trim()) e.lab = "Indica el laboratorio o marca.";
  if (!p.category.trim()) e.category = "Elige el tipo.";
  if (!Number.isInteger(p.unitsPerBox) || p.unitsPerBox < 1) e.unitsPerBox = "Mínimo 1.";
  if (!Number.isInteger(p.unitsPerBlister) || p.unitsPerBlister < 0) e.unitsPerBlister = "0 o más.";
  else if (p.unitsPerBlister > 1 && p.unitsPerBox > 1 && p.unitsPerBox % p.unitsPerBlister !== 0) e.unitsPerBlister = "La caja debe tener blísteres completos.";
  if (!(p.priceUnit > 0)) e.priceUnit = "El precio debe ser mayor a 0.";
  if (p.priceBlister < 0) e.priceBlister = "No puede ser negativo.";
  else if (p.priceBlister > 0 && p.unitsPerBlister < 2) e.priceBlister = "Indica cuántas unidades trae el blíster.";
  if (p.priceBox < 0) e.priceBox = "No puede ser negativo.";
  else if (p.priceBox > 0 && p.unitsPerBox < 2) e.priceBox = "Indica cuántas unidades trae la caja.";
  if (!(p.cost >= 0)) e.cost = "No puede ser negativo.";
  else if (p.cost > 0 && p.cost * (1 + IGV) >= p.priceUnit) e.cost = "El costo con IGV supera el precio de venta.";
  if (!Number.isInteger(p.minStock) || p.minStock < 0) e.minStock = "0 o más.";
  const bar = p.barcode.trim();
  if (bar && !/^\d{8,14}$/.test(bar)) e.barcode = "De 8 a 14 dígitos.";
  else if (bar && others.some((o) => o.id !== selfId && o.barcode === bar)) e.barcode = "Otro producto ya usa este código.";
  return e;
}

/** Normaliza textos y números del formulario antes de enviarlo. */
export function normalizeProduct(p: ProductInput): ProductInput {
  return {
    ...p,
    name: p.name.trim(),
    active: p.active.trim() || "—",
    conc: p.conc.trim(),
    form: p.form.trim(),
    lab: p.lab.trim(),
    category: p.category.trim(),
    unitName: p.unitName.trim() || "unidad",
    location: p.location.trim().toUpperCase(),
    barcode: p.barcode.trim(),
    sanitaryReg: p.sanitaryReg.trim().toUpperCase(),
    priceUnit: round2(p.priceUnit),
    priceBlister: round2(p.priceBlister),
    priceBox: round2(p.priceBox),
    cost: Math.round(p.cost * 10000) / 10000,
  };
}

export const DEFAULT_CATEGORIES = ["Analgésicos", "Antibióticos", "Antigripales", "Digestivo", "Crónicos", "Alergias", "Vitaminas", "Infantil", "Cuidado personal", "Primeros auxilios", "Controlados"];

/** Fecha más próxima de vencimiento entre lotes (para ordenar). */
export const nextExpiry = (r: InventoryRow) => (r.next ? parseDay(r.next.expiresOn) : Number.POSITIVE_INFINITY);
