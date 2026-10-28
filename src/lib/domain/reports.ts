/**
 * Reportes de venta (reglas puras, se prueban con Vitest). Todo se calcula a partir de las líneas de venta.
 * Precios con IGV; costos sin IGV. La utilidad se mide sobre la venta sin IGV.
 */
import type { BranchId, Lot, Product, SalesReportLine } from "@/lib/api/types";
import { IGV, parseDay, round2, sellableLots, startOfDay } from "./pharmacy";

const DAY = 86_400_000;
const iso = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/* ------------------------------ Periodos ------------------------------ */

export type PeriodPreset = "hoy" | "ayer" | "7d" | "30d" | "mes" | "mes_anterior";

export interface Period {
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD, incluido
  label: string;
}

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export function periodFor(preset: PeriodPreset, now: number): Period {
  const today = startOfDay(now);
  const d = new Date(today);
  switch (preset) {
    case "hoy":
      return { from: iso(today), to: iso(today), label: "Hoy" };
    case "ayer": {
      const y = startOfDay(today - DAY / 2);
      return { from: iso(y), to: iso(y), label: "Ayer" };
    }
    case "7d":
      return { from: iso(today - 6 * DAY), to: iso(today), label: "Últimos 7 días" };
    case "30d":
      return { from: iso(today - 29 * DAY), to: iso(today), label: "Últimos 30 días" };
    case "mes":
      return { from: iso(new Date(d.getFullYear(), d.getMonth(), 1).getTime()), to: iso(today), label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}` };
    case "mes_anterior": {
      const first = new Date(d.getFullYear(), d.getMonth() - 1, 1);
      const last = new Date(d.getFullYear(), d.getMonth(), 0);
      return { from: iso(first.getTime()), to: iso(last.getTime()), label: `${MONTHS[first.getMonth()]} ${first.getFullYear()}` };
    }
  }
}

/** Días del periodo, incluidos ambos extremos. */
export const periodDays = (p: Pick<Period, "from" | "to">) => Math.round((parseDay(p.to) - parseDay(p.from)) / DAY) + 1;

/* ------------------------------ Totales ------------------------------ */

export interface Totals {
  total: number;
  taxBase: number;
  igv: number;
  cost: number;
  /** Venta sin IGV − costo */
  profit: number;
  /** Utilidad / venta sin IGV, en % */
  margin: number;
  units: number;
  tickets: number;
  avgTicket: number;
}

export function totalsOf(lines: SalesReportLine[]): Totals {
  const total = round2(lines.reduce((s, l) => s + l.total, 0));
  const cost = round2(lines.reduce((s, l) => s + l.cost, 0));
  const taxBase = round2(total / (1 + IGV));
  const profit = round2(taxBase - cost);
  const tickets = new Set(lines.map((l) => l.saleId)).size;
  return {
    total, taxBase, igv: round2(total - taxBase), cost, profit, margin: taxBase > 0 ? round2((profit / taxBase) * 100) : 0,
    units: lines.reduce((s, l) => s + l.units, 0), tickets, avgTicket: tickets ? round2(total / tickets) : 0,
  };
}

export interface GroupRow extends Totals {
  key: string;
  label: string;
  /** Participación en la venta total, 0..1 */
  share: number;
}

/** Agrupa las líneas por una clave y ordena de mayor a menor venta. */
export function groupLines(lines: SalesReportLine[], keyOf: (l: SalesReportLine) => string, labelOf: (key: string) => string = (k) => k): GroupRow[] {
  const m = new Map<string, SalesReportLine[]>();
  for (const l of lines) {
    const k = keyOf(l);
    const g = m.get(k);
    if (g) g.push(l);
    else m.set(k, [l]);
  }
  const grand = lines.reduce((s, l) => s + l.total, 0);
  return [...m]
    .map(([key, g]) => {
      const t = totalsOf(g);
      return { ...t, key, label: labelOf(key), share: grand > 0 ? t.total / grand : 0 };
    })
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
}

/** Venta por día con todos los días del periodo (los que no tienen venta van en 0), separada por local. */
export function byDay(lines: SalesReportLine[], period: Pick<Period, "from" | "to">, branchIds: BranchId[]): { date: string; total: number; byBranch: Record<BranchId, number>; tickets: number }[] {
  const days: string[] = [];
  for (let t = parseDay(period.from); t <= parseDay(period.to); t = startOfDay(t + DAY + 3600_000)) days.push(iso(t));
  const rows = new Map(days.map((d) => [d, { date: d, total: 0, byBranch: Object.fromEntries(branchIds.map((b) => [b, 0])) as Record<BranchId, number>, tickets: new Set<string>() }]));
  for (const l of lines) {
    const r = rows.get(iso(new Date(l.at).getTime()));
    if (!r) continue;
    r.total += l.total;
    r.byBranch[l.branchId] = (r.byBranch[l.branchId] ?? 0) + l.total;
    r.tickets.add(l.saleId);
  }
  return [...rows.values()].map((r) => ({ date: r.date, total: round2(r.total), byBranch: Object.fromEntries(Object.entries(r.byBranch).map(([k, v]) => [k, round2(v)])), tickets: r.tickets.size }));
}

/* ------------------------------ Sin movimiento ------------------------------ */

export interface DeadStockRow {
  product: Product;
  branchId: BranchId;
  units: number;
  /** Valor a costo inmovilizado */
  value: number;
  /** Días desde el ingreso más antiguo que sigue en stock */
  daysInStock: number | null;
}

/** Productos con stock vigente en un local que no se vendieron ahí en todo el periodo. Ordenado por plata inmovilizada. */
export function deadStock(products: Product[], lots: Lot[], lines: SalesReportLine[], branchIds: BranchId[], now: number): DeadStockRow[] {
  const sold = new Set(lines.map((l) => `${l.branchId}:${l.productId}`));
  const out: DeadStockRow[] = [];
  for (const branchId of branchIds) {
    const own = lots.filter((l) => l.branchId === branchId);
    for (const product of products) {
      if (sold.has(`${branchId}:${product.id}`)) continue;
      const sell = sellableLots(own, product.id, now);
      const units = sell.reduce((s, l) => s + l.qty, 0);
      if (!units) continue;
      const received = sell.map((l) => (l.receivedOn ? parseDay(l.receivedOn) : null)).filter((x): x is number => x !== null);
      out.push({ product, branchId, units, value: round2(sell.reduce((s, l) => s + l.qty * l.cost, 0)), daysInStock: received.length ? Math.round((startOfDay(now) - Math.min(...received)) / DAY) : null });
    }
  }
  return out.sort((a, b) => b.value - a.value);
}

/* ------------------------------ Libro de recetas ------------------------------ */

export interface PrescriptionEntry {
  saleId: string;
  number: string;
  at: string;
  branchId: BranchId;
  sellerName: string;
  prescription: NonNullable<SalesReportLine["prescription"]>;
  items: { productId: number; units: number; presentationLabel: string; qty: number }[];
  controlled: boolean;
}

/** Una entrada por venta con receta, con los productos que la requerían. Para la inspección de DIGEMID. */
export function prescriptionBook(lines: SalesReportLine[], products: Map<number, Product>): PrescriptionEntry[] {
  const m = new Map<string, PrescriptionEntry>();
  for (const l of lines) {
    const p = products.get(l.productId);
    if (!l.prescription || !p || p.rx === "libre") continue;
    const e = m.get(l.saleId) ?? { saleId: l.saleId, number: l.number, at: l.at, branchId: l.branchId, sellerName: l.sellerName, prescription: l.prescription, items: [], controlled: false };
    e.items.push({ productId: l.productId, units: l.units, presentationLabel: l.presentationLabel, qty: l.qty });
    if (p.rx === "controlado") e.controlled = true;
    m.set(l.saleId, e);
  }
  return [...m.values()].sort((a, b) => b.at.localeCompare(a.at));
}

/** Variación porcentual frente a otro periodo; null si no hay base. */
export const change = (current: number, previous: number) => (previous > 0 ? round2(((current - previous) / previous) * 100) : null);

/** Periodo anterior de la misma duración, para comparar. */
export function previousPeriod(p: Pick<Period, "from" | "to">): Period {
  const days = periodDays(p);
  const to = parseDay(p.from) - DAY / 2;
  const from = to - (days - 1) * DAY;
  return { from: iso(startOfDay(from)), to: iso(startOfDay(to)), label: "Periodo anterior" };
}
