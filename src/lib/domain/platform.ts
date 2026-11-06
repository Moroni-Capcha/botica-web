/**
 * Consola interna de Digi!HME: reglas puras para cambiar de plan, extender la prueba, suspender y reactivar una botica.
 * El backend debería aplicar los mismos casos (ver "Consola interna de Digi!HME" en docs/API.md).
 * Reutiliza el estado de cuenta de `account.ts` (prueba, activa, vencida, suspendida).
 */
import type { Account, AccountStatus, AuditEntry, Role, TenantAction, TenantDetail, TenantHistoryAction, TenantSummary, VoucherStatus } from "@/lib/api/types";
import { daysLeft, effectiveStatus } from "./account";
import { findPlan } from "./plans";

export const MAX_TRIAL_EXTENSION_DAYS = 60;
export const REASON_MIN = 5;
export const REASON_MAX = 200;
/** Días hasta la próxima renovación cuando una cuenta vuelve a estar activa sin fecha guardada. */
const RENEWAL_DAYS = 30;

const DAY = 86_400_000;

/** Suma días a un día local YYYY-MM-DD. */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + n)).toISOString().slice(0, 10);
}

/** Lo que hace falta saber de una botica para decidir si se le puede aplicar una acción. */
export interface TenantState {
  planName: string;
  /** Cuenta tal como está guardada (sin calcular el vencimiento de la prueba). */
  account: Account;
  /** Locales activos hoy. */
  activeBranches: number;
}

export type TenantChange =
  | { ok: true; planName: string; maxBranches: number | null; account: Account }
  | { ok: false; code: string; message: string; status: number };

const bad = (code: string, message: string, status = 400): TenantChange => ({ ok: false, code, message, status });

export function reasonError(reason: string): string | null {
  const n = reason.trim().length;
  return n < REASON_MIN || n > REASON_MAX ? `Escribe el motivo (de ${REASON_MIN} a ${REASON_MAX} caracteres).` : null;
}

/**
 * Aplica una acción de Digi!HME a una botica y devuelve su cuenta nueva, o el error que debe responder la API.
 * - Cambiar de plan: el plan existe, es distinto y los locales activos caben; los módulos pasan a ser los del plan nuevo.
 * - Extender la prueba: solo una botica en prueba (también si ya pasó el último día); suma desde hoy o desde el fin de la prueba, lo que sea más tarde.
 * - Suspender: pasa a solo lectura. Se conservan las fechas para poder reactivar.
 * - Reactivar: solo una suspendida. Vuelve a prueba si tenía fecha de prueba (si ya pasó, queda como vencida) y, si no, a activa.
 */
export function applyTenantAction(state: TenantState, input: TenantAction, today: string): TenantChange {
  const rErr = reasonError(input.reason);
  if (rErr) return bad("DATOS_INVALIDOS", rErr);
  const { account } = state;
  switch (input.action) {
    case "change_plan": {
      const plan = findPlan(input.planId);
      if (!plan) return bad("DATOS_INVALIDOS", "Elige un plan.");
      if (plan.name === state.planName) return bad("ESTADO_INVALIDO", `La botica ya tiene el ${plan.name}.`, 409);
      if (state.activeBranches > plan.maxBranches)
        return bad("LIMITE_DEL_PLAN", `La botica tiene ${state.activeBranches} locales activos y el ${plan.name} permite ${plan.maxBranches}. Debe desactivar locales antes del cambio.`, 409);
      return { ok: true, planName: plan.name, maxBranches: plan.maxBranches, account: { ...account, modules: [...plan.modules] } };
    }
    case "extend_trial": {
      if (!Number.isInteger(input.days) || input.days < 1 || input.days > MAX_TRIAL_EXTENSION_DAYS) return bad("DATOS_INVALIDOS", `Los días de extensión van de 1 a ${MAX_TRIAL_EXTENSION_DAYS}.`);
      if (account.status === "suspended") return bad("ESTADO_INVALIDO", "La cuenta está suspendida: reactívala antes de extender la prueba.", 409);
      if (account.status !== "trial") return bad("ESTADO_INVALIDO", "Solo se puede extender la prueba de una botica en prueba.", 409);
      const from = account.trialEndsAt && account.trialEndsAt > today ? account.trialEndsAt : today;
      return { ok: true, planName: state.planName, maxBranches: null, account: { ...account, status: "trial", trialEndsAt: addDays(from, input.days) } };
    }
    case "suspend":
      if (account.status === "suspended") return bad("ESTADO_INVALIDO", "La cuenta ya está suspendida.", 409);
      return { ok: true, planName: state.planName, maxBranches: null, account: { ...account, status: "suspended" } };
    case "reactivate": {
      if (account.status !== "suspended") return bad("ESTADO_INVALIDO", "La cuenta no está suspendida.", 409);
      const next: Account = account.trialEndsAt ? { ...account, status: "trial" } : { ...account, status: "active", renewsAt: account.renewsAt ?? addDays(today, RENEWAL_DAYS) };
      return { ok: true, planName: state.planName, maxBranches: null, account: next };
    }
  }
}

/**
 * Acciones que la consola ofrece para una botica. La prueba se puede extender si está en prueba o si ya venció
 * (llega como `overdue` pero conserva su fecha de prueba); el servidor decide en último término.
 */
export function tenantActions(t: Pick<TenantSummary, "status" | "trialEndsAt">): { changePlan: boolean; extendTrial: boolean; suspend: boolean; reactivate: boolean } {
  return { changePlan: true, extendTrial: t.status === "trial" || (t.status === "overdue" && !!t.trialEndsAt), suspend: t.status !== "suspended", reactivate: t.status === "suspended" };
}

export const ACTION_TITLE: Record<TenantAction["action"], string> = {
  change_plan: "Cambiar de plan",
  extend_trial: "Extender la prueba",
  suspend: "Suspender la cuenta",
  reactivate: "Reactivar la cuenta",
};

/** Cuenta cuántas boticas hay por estado (con el estado ya calculado). */
export function countTenants(list: Pick<TenantSummary, "status">[]): Record<AccountStatus, number> {
  const counts: Record<AccountStatus, number> = { trial: 0, active: 0, overdue: 0, suspended: 0 };
  for (const t of list) counts[t.status] += 1;
  return counts;
}

/** Filtra por nombre o código (sin importar mayúsculas ni tildes) y por estado. */
export function filterTenants(list: TenantSummary[], { q, status }: { q?: string; status?: AccountStatus }): TenantSummary[] {
  const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const needle = plain((q ?? "").trim());
  return list.filter((t) => (!status || t.status === status) && (!needle || plain(t.name).includes(needle) || plain(t.code).includes(needle)));
}

/** Estado a mostrar de una cuenta guardada: calcula si la prueba ya venció. */
export const tenantStatus = (account: Pick<Account, "status" | "trialEndsAt">, today: string): AccountStatus => effectiveStatus(account, today);

/** "hace 5 min", "hace 3 h", "ayer", "hace 12 días", "nunca": para la columna de última actividad. */
export function activityLabel(iso: string | null, now: number): string {
  if (!iso) return "Nunca";
  const diff = now - Date.parse(iso);
  if (!Number.isFinite(diff)) return "Nunca";
  if (diff < 60_000) return "Ahora";
  if (diff < 3_600_000) return `Hace ${Math.floor(diff / 60_000)} min`;
  if (diff < DAY) return `Hace ${Math.floor(diff / 3_600_000)} h`;
  const days = Math.floor(diff / DAY);
  if (days === 1) return "Ayer";
  if (days < 60) return `Hace ${days} días`;
  return `Hace ${Math.floor(days / 30)} meses`;
}

/** Texto corto del plazo de una cuenta: "Prueba: 5 días", "Renueva el 2026-11-30", "Prueba vencida hace 2 días". */
export function accountDeadline(t: Pick<TenantSummary, "status" | "trialEndsAt" | "renewsAt">, today: string): string {
  if (t.trialEndsAt && (t.status === "trial" || t.status === "overdue")) {
    const d = daysLeft(t.trialEndsAt, today);
    if (d > 1) return `Prueba: ${d} días`;
    if (d === 1) return "Prueba: 1 día";
    if (d === 0) return "La prueba termina hoy";
    return d === -1 ? "Prueba vencida ayer" : `Prueba vencida hace ${-d} días`;
  }
  if (t.renewsAt && t.status === "active") return `Renueva el ${t.renewsAt}`;
  return "";
}

/* ------------------------------ Detalle de una botica (solo lectura) ------------------------------ */

const HISTORY_LIMIT = 20;
const ACTIVITY_DAYS = 30;

/** Lo que el historial muestra de cada acción de Digi!HME. */
export const HISTORY_LABEL: Record<TenantHistoryAction, string> = {
  plan_cambiado: "Cambio de plan",
  prueba_extendida: "Prueba extendida",
  cuenta_suspendida: "Cuenta suspendida",
  cuenta_reactivada: "Cuenta reactivada",
};

export const isTenantHistoryAction = (action: string): action is TenantHistoryAction => action in HISTORY_LABEL;

export const roleLabel = (role: Role): string => (role === "admin" ? "Administrador" : "Encargado");

/** Acciones de Digi!HME de la auditoría de una botica: la más reciente primero, máximo 20. Solo la fecha, la acción y el motivo. */
export function tenantHistory(log: Pick<AuditEntry, "at" | "action" | "userId" | "after">[]): TenantDetail["history"] {
  return log
    .flatMap((e) => (e.userId === null && isTenantHistoryAction(e.action) ? [{ at: e.at, action: e.action, reason: typeof e.after?.reason === "string" ? e.after.reason : "" }] : []))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, HISTORY_LIMIT);
}

/** Ventas de los últimos 30 días y sus comprobantes por estado ante SUNAT (los anulados no cuentan). */
export function tenantActivity(
  sales: { id: string; createdAt: string }[],
  voucherStatus: (saleId: string) => VoucherStatus,
  now: number,
): TenantDetail["activity"] {
  const since = now - ACTIVITY_DAYS * DAY;
  const vouchers = { accepted: 0, pending: 0, rejected: 0 };
  let count = 0;
  let last: string | null = null;
  for (const s of sales) {
    if (!last || Date.parse(s.createdAt) > Date.parse(last)) last = s.createdAt;
    if (Date.parse(s.createdAt) < since) continue;
    count += 1;
    const st = voucherStatus(s.id);
    if (st === "aceptado") vouchers.accepted += 1;
    else if (st === "pendiente") vouchers.pending += 1;
    else if (st === "rechazado") vouchers.rejected += 1;
  }
  return { salesLast30Days: count, vouchersLast30Days: vouchers, lastSaleAt: last };
}
