/**
 * Panel del día: comparación de la venta y lista de pendientes (reglas puras, se prueban con Vitest).
 */
import type { BranchId, CashSummary, DailySales, Transfer, User } from "@/lib/api/types";
import type { DaySummary } from "./attendance";
import type { LotRisk } from "./expiry";
import type { InventoryRow } from "./inventory";
import { transferActions } from "./transfers";
import { round2 } from "./pharmacy";

const DAY = 86_400_000;
export const isoLocal = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Total por día sumando los locales pedidos, del más antiguo al más reciente. */
export function dailyTotals(series: DailySales[], branchIds: BranchId[]): { date: string; total: number; byBranch: Record<BranchId, number> }[] {
  const m = new Map<string, { date: string; total: number; byBranch: Record<BranchId, number> }>();
  for (const s of series) {
    if (!branchIds.includes(s.branchId)) continue;
    const row = m.get(s.date) ?? { date: s.date, total: 0, byBranch: Object.fromEntries(branchIds.map((b) => [b, 0])) };
    row.total = round2(row.total + s.total);
    row.byBranch[s.branchId] = round2((row.byBranch[s.branchId] ?? 0) + s.total);
    m.set(s.date, row);
  }
  return [...m.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Referencia para la venta de hoy: el mismo día de la semana pasada (cerrado).
 * No se calcula un porcentaje contra un día completo porque hoy todavía no termina:
 * se muestra cuánto falta para igualarlo.
 */
export function sameDayLastWeek(series: DailySales[], branchIds: BranchId[], now: number): { date: string; total: number } | null {
  const date = isoLocal(now - 7 * DAY);
  const rows = series.filter((s) => s.date === date && branchIds.includes(s.branchId));
  if (!rows.length) return null;
  return { date, total: round2(rows.reduce((a, s) => a + s.total, 0)) };
}

/** Promedio de los días con venta del periodo (ignora días sin cierre). */
export function averageDay(series: DailySales[], branchIds: BranchId[]): number {
  const totals = dailyTotals(series, branchIds).filter((d) => d.total > 0);
  return totals.length ? round2(totals.reduce((a, d) => a + d.total, 0) / totals.length) : 0;
}

/* ------------------------------ Pendientes ------------------------------ */

export type AlertTone = "critical" | "warning" | "info";

export interface PanelAlert {
  id: string;
  tone: AlertTone;
  title: string;
  detail: string;
  href: string;
  /** Para ordenar dentro del mismo tono: mayor primero. */
  weight: number;
}

export interface AlertInput {
  user: Pick<User, "role" | "branchId">;
  branchName: (id: BranchId) => string;
  expiry: LotRisk[];
  inventory: InventoryRow[];
  transfers: Transfer[];
  cash: CashSummary[];
  /** Solo para el administrador. */
  attendance?: DaySummary[];
  /** Clientes con tratamiento a los que toca avisar su recompra. */
  refillsToNotify?: number;
  now: number;
}

const soles = (n: number) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Lo que conviene atender hoy, de lo más urgente a lo informativo. Cada pendiente lleva al módulo que lo resuelve. */
export function buildAlerts({ user, branchName, expiry, inventory, transfers, cash, attendance, refillsToNotify = 0, now }: AlertInput): PanelAlert[] {
  const out: PanelAlert[] = [];

  const expired = expiry.filter((r) => r.tone === "vencido");
  if (expired.length) {
    const value = round2(expired.reduce((a, r) => a + r.value, 0));
    out.push({ id: "vencidos", tone: "critical", title: `${plural(expired.length, "lote vencido", "lotes vencidos")} en anaquel`, detail: `${soles(value)} a costo. Retíralos y dales de baja: no se pueden vender.`, href: "/vencimientos", weight: value });
  }

  const atRisk = expiry.filter((r) => r.tone !== "vencido" && r.atRisk > 0);
  if (atRisk.length) {
    const loss = round2(atRisk.reduce((a, r) => a + r.loss, 0));
    out.push({ id: "riesgo", tone: loss >= 100 ? "critical" : "warning", title: `${soles(loss)} en riesgo por vencimiento`, detail: `${plural(atRisk.length, "lote no alcanza", "lotes no alcanzan")} a venderse antes de su fecha. Aplica descuento o trasládalos.`, href: "/vencimientos", weight: loss });
  }

  const out0 = inventory.filter((r) => r.status === "agotado");
  const low = inventory.filter((r) => r.status === "bajo");
  if (out0.length) out.push({ id: "agotados", tone: "critical", title: `${plural(out0.length, "producto agotado", "productos agotados")}`, detail: out0.slice(0, 3).map((r) => r.product.name).join(", ") + (out0.length > 3 ? "…" : ""), href: "/compras", weight: out0.length });
  if (low.length) out.push({ id: "bajo", tone: "warning", title: `${plural(low.length, "producto", "productos")} bajo el mínimo`, detail: "Revisa el pedido sugerido o pide un traslado al otro local.", href: "/compras", weight: low.length });

  for (const t of transfers) {
    const a = transferActions(t, user);
    if (a.receive) out.push({ id: `tr-${t.id}`, tone: "warning", title: `${t.code} en camino desde ${branchName(t.fromBranchId)}`, detail: "Cuando llegue, confirma la recepción para que el stock entre al local.", href: "/traslados", weight: 2 });
    else if (a.dispatch) out.push({ id: `tr-${t.id}`, tone: "warning", title: `${branchName(t.toBranchId)} pidió mercadería (${t.code})`, detail: t.note || "Despáchalo por FEFO desde Traslados.", href: "/traslados", weight: 3 });
  }

  for (const c of cash) {
    const b = branchName(c.session.branchId);
    if (!c.session.open) {
      out.push({ id: `caja-${c.session.branchId}`, tone: "warning", title: `Caja de ${b} cerrada`, detail: "Ábrela con el fondo de sencillo para poder cobrar.", href: "/caja", weight: 4 });
      continue;
    }
    const opened = c.session.openedAt ? new Date(c.session.openedAt) : null;
    if (opened && isoLocal(opened.getTime()) !== isoLocal(now)) out.push({ id: `caja-old-${c.session.branchId}`, tone: "critical", title: `Caja de ${b} abierta desde el ${opened.toLocaleDateString("es-PE")}`, detail: "Haz el arqueo y ciérrala antes de seguir vendiendo.", href: "/caja", weight: 5 });
  }

  if (attendance) {
    const missing = attendance.filter((s) => s.status === "no_llega");
    if (missing.length) out.push({ id: "asistencia", tone: "warning", title: `${plural(missing.length, "trabajador no ha", "trabajadores no han")} marcado entrada`, detail: missing.map((s) => s.worker.name.replace(/^Q\.F\.\s*/, "")).join(", "), href: "/asistencia", weight: missing.length });
    const late = attendance.filter((s) => s.late > 0);
    if (late.length) out.push({ id: "tardanzas", tone: "info", title: `${plural(late.length, "tardanza", "tardanzas")} hoy`, detail: late.map((s) => `${s.worker.name.replace(/^Q\.F\.\s*/, "").split(" ")[0]} ${s.late} min`).join(" · "), href: "/asistencia", weight: late.length });
  }

  if (refillsToNotify > 0)
    out.push({ id: "recompras", tone: "info", title: `${plural(refillsToNotify, "cliente por avisar", "clientes por avisar")} su recompra`, detail: "Se les termina su medicamento de uso continuo. Envíales el recordatorio por WhatsApp.", href: "/clientes", weight: refillsToNotify });

  const order: Record<AlertTone, number> = { critical: 0, warning: 1, info: 2 };
  return out.sort((a, b) => order[a.tone] - order[b.tone] || b.weight - a.weight);
}

/** "Buenos días" según la hora. */
export const greeting = (now: number) => {
  const h = new Date(now).getHours();
  return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
};
