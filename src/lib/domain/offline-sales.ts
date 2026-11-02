/**
 * Cola de ventas sin conexión: reglas puras (sin red, sin reloj, sin almacenamiento).
 * Una venta cobrada sin internet se guarda aquí con su clave de idempotencia y un ticket provisional (OFF-0001).
 * Cuando vuelve la conexión se envía en orden (FIFO) a `POST /sales/sync`; el backend asigna el comprobante oficial.
 * Nunca se pierde una venta: solo se descarta a mano y solo si falló.
 */
import type { BranchId, DocType, Lot, PaymentMethod, Prescription, Sale, SaleLine, SaleSyncItem } from "@/lib/api/types";
import type { CartLine, Totals } from "./pharmacy";
import { sellableLots } from "./pharmacy";

export type QueueStatus = "pending" | "syncing" | "failed" | "synced";

/**
 * Qué hacer con un error al enviar:
 *  - retry: la red o el servidor fallaron; se reintenta solo, con espera creciente.
 *  - hold: no es culpa de la venta (sesión vencida, cuenta en solo lectura); espera sin contar intentos.
 *  - conflict: el servidor la rechazó por una regla (sin stock, caja cerrada, receta…); una persona debe decidir.
 */
export type FailureKind = "retry" | "hold" | "conflict";

export interface QueueError {
  code: string;
  message: string;
  /** ISO del momento del error. */
  at: string;
  kind: FailureKind;
}

export interface QueuedSale {
  clientSaleId: string;
  /** Orden de llegada. Nunca se reutiliza, aunque se descarte una venta. */
  seq: number;
  /** Ticket provisional entregado al cliente, p. ej. OFF-0007. */
  ticket: string;
  request: SaleSyncItem;
  branchId: BranchId;
  total: number;
  itemCount: number;
  /** Unidades que la venta sacó del stock, por producto (para no vender dos veces el mismo lote sin conexión). */
  reserve: { productId: number; units: number }[];
  status: QueueStatus;
  attempts: number;
  /** Epoch ms desde el que se puede reintentar. null = ya. */
  nextAttemptAt: number | null;
  lastError: QueueError | null;
  createdAt: number;
  syncedAt: number | null;
  /** Número oficial (B001-000123) y id de la venta, una vez enviada. */
  saleNumber: string | null;
  saleId: string | null;
}

export interface QueueState {
  items: QueuedSale[];
  nextSeq: number;
}

export const SYNC_BATCH_MAX = 50;
export const BACKOFF_BASE_MS = 5_000;
export const BACKOFF_MAX_MS = 5 * 60_000;
/** Espera de las ventas retenidas (sesión vencida, cuenta en solo lectura) antes de volver a mirar. */
export const HOLD_MS = 60_000;
/** Cuánto se muestran en la lista las ventas ya enviadas. */
export const SYNCED_KEEP_MS = 24 * 60 * 60_000;

export const emptyQueue = (): QueueState => ({ items: [], nextSeq: 1 });

export const provisionalTicket = (seq: number): string => `OFF-${String(seq).padStart(4, "0")}`;

/** UUID v4. Usa el del navegador cuando existe; si no, uno aleatorio con la misma forma. */
export function newClientSaleId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/* ------------------------------ Errores ------------------------------ */

interface ErrorLike {
  code?: string;
  status?: number;
  message?: string;
}

/** true cuando no se llegó al servidor (sin red, tiempo agotado). Es el único caso en que una venta se guarda sin conexión. */
export function isConnectionError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const x = e as ErrorLike & { name?: string };
  return x.code === "SIN_CONEXION" || x.status === 0 || (x.name === "TypeError" && x.code === undefined && x.status === undefined);
}

const HOLD_CODES = new Set(["NO_AUTORIZADO", "CUENTA_SUSPENDIDA"]);
const RETRY_CODES = new Set(["SIN_CONEXION", "ERROR_INTERNO", "SERVICIO_NO_DISPONIBLE", "TIEMPO_AGOTADO"]);

export function classifyFailure(e: ErrorLike): FailureKind {
  const code = e.code ?? "";
  const status = e.status;
  if (HOLD_CODES.has(code) || status === 401) return "hold";
  if (RETRY_CODES.has(code) || status === 0 || status === 408 || status === 429 || (status !== undefined && status >= 500)) return "retry";
  /* Sin código ni estado (error inesperado): se reintenta; mejor insistir que descartar. */
  if (!code && status === undefined) return "retry";
  return "conflict";
}

/** Espera antes del intento número `attempts` (1 = tras el primer fallo): 5 s, 10 s, 20 s… hasta 5 min. */
export const backoffDelay = (attempts: number): number => Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1));

/* ------------------------------ Cola ------------------------------ */

export interface EnqueueInput {
  /** Venta ya armada; se le agrega `soldAt` y `offlineTicket`. Debe traer `clientSaleId`. */
  request: SaleSyncItem;
  total: number;
  reserve: { productId: number; units: number }[];
  now: number;
}

/**
 * Agrega una venta al final de la cola. Idempotente: si la clave ya está, devuelve la que había
 * (un doble clic o un reintento no duplica la venta ni gasta otro número de ticket).
 */
export function enqueueSale(state: QueueState, input: EnqueueInput): { state: QueueState; item: QueuedSale } {
  const existing = state.items.find((i) => i.clientSaleId === input.request.clientSaleId);
  if (existing) return { state, item: existing };
  const seq = state.nextSeq;
  const ticket = provisionalTicket(seq);
  const request: SaleSyncItem = { ...input.request, soldAt: new Date(input.now).toISOString(), offlineTicket: ticket };
  const item: QueuedSale = {
    clientSaleId: request.clientSaleId,
    seq,
    ticket,
    request,
    branchId: request.branchId,
    total: input.total,
    itemCount: request.items.length,
    reserve: input.reserve,
    status: "pending",
    attempts: 0,
    nextAttemptAt: null,
    lastError: null,
    createdAt: input.now,
    syncedAt: null,
    saleNumber: null,
    saleId: null,
  };
  return { state: { items: [...state.items, item], nextSeq: seq + 1 }, item };
}

const byId = (state: QueueState, id: string) => state.items.find((i) => i.clientSaleId === id);
const patch = (state: QueueState, id: string, fn: (i: QueuedSale) => QueuedSale): QueueState =>
  byId(state, id) ? { ...state, items: state.items.map((i) => (i.clientSaleId === id ? fn(i) : i)) } : state;

/**
 * Ventas que toca enviar ahora, en el orden en que se cobraron. Se detiene en la primera pendiente
 * que aún está esperando su reintento, para no enviar una venta posterior antes que una anterior.
 */
export function dueItems(state: QueueState, now: number, limit = SYNC_BATCH_MAX): QueuedSale[] {
  const out: QueuedSale[] = [];
  for (const i of [...state.items].sort((a, b) => a.seq - b.seq)) {
    if (i.status !== "pending") continue;
    if (i.nextAttemptAt !== null && i.nextAttemptAt > now) break;
    out.push(i);
    if (out.length >= limit) break;
  }
  return out;
}

export function markSyncing(state: QueueState, ids: string[]): QueueState {
  const set = new Set(ids);
  return { ...state, items: state.items.map((i) => (set.has(i.clientSaleId) && i.status === "pending" ? { ...i, status: "syncing" as const } : i)) };
}

export type SyncOutcome = { ok: true; saleNumber: string; saleId: string } | { ok: false; error: ErrorLike & { message: string } };

/** Aplica la respuesta del servidor para una venta. */
export function applyOutcome(state: QueueState, id: string, outcome: SyncOutcome, now: number): QueueState {
  return patch(state, id, (i) => {
    if (outcome.ok) return { ...i, status: "synced", syncedAt: now, saleNumber: outcome.saleNumber, saleId: outcome.saleId, lastError: null, nextAttemptAt: null };
    const kind = classifyFailure(outcome.error);
    const lastError: QueueError = { code: outcome.error.code ?? "ERROR", message: outcome.error.message, at: new Date(now).toISOString(), kind };
    if (kind === "conflict") return { ...i, status: "failed", attempts: i.attempts + 1, lastError, nextAttemptAt: null };
    if (kind === "hold") return { ...i, status: "pending", lastError, nextAttemptAt: now + HOLD_MS };
    const attempts = i.attempts + 1;
    return { ...i, status: "pending", attempts, lastError, nextAttemptAt: now + backoffDelay(attempts) };
  });
}

/**
 * Falló la llamada completa (sin red, servidor caído, sesión vencida): todas las del lote vuelven a pendientes.
 * Un rechazo del lote entero nunca descarta ventas: se trata como reintento para que ninguna se pierda.
 */
export function applyBatchError(state: QueueState, ids: string[], error: ErrorLike & { message: string }, now: number): QueueState {
  const e = classifyFailure(error) === "hold" ? error : { ...error, status: 0 };
  return ids.reduce((s, id) => applyOutcome(s, id, { ok: false, error: e }, now), state);
}

/** "Sincronizar ahora": las pendientes dejan de esperar su turno de reintento. */
export function forceDue(state: QueueState): QueueState {
  return { ...state, items: state.items.map((i) => (i.status === "pending" ? { ...i, nextAttemptAt: null } : i)) };
}

/** Una venta fallida vuelve a pendiente para reintentarla. */
export function retryFailed(state: QueueState, id: string): QueueState {
  return patch(state, id, (i) => (i.status === "failed" ? { ...i, status: "pending", nextAttemptAt: null } : i));
}

/** Descarta una venta, y solo si falló. Las pendientes o en envío nunca se pueden descartar. */
export function discardFailed(state: QueueState, id: string): QueueState {
  const i = byId(state, id);
  return i && i.status === "failed" ? { ...state, items: state.items.filter((x) => x.clientSaleId !== id) } : state;
}

/** Al abrir la app, lo que quedó "enviándose" por un cierre brusco vuelve a pendiente (la clave evita duplicarlo). */
export function recoverInterrupted(state: QueueState): QueueState {
  return { ...state, items: state.items.map((i) => (i.status === "syncing" ? { ...i, status: "pending" as const, nextAttemptAt: null } : i)) };
}

/** Quita de la lista las ventas enviadas hace más de un día. */
export function pruneSynced(state: QueueState, now: number, keepMs = SYNCED_KEEP_MS): QueueState {
  const items = state.items.filter((i) => !(i.status === "synced" && i.syncedAt !== null && now - i.syncedAt > keepMs));
  return items.length === state.items.length ? state : { ...state, items };
}

export interface QueueSummary {
  pending: number;
  syncing: number;
  failed: number;
  synced: number;
  /** Ventas que el servidor aún no tiene: pendientes, enviándose o fallidas. */
  unsent: number;
}

export function queueSummary(state: QueueState): QueueSummary {
  const s = { pending: 0, syncing: 0, failed: 0, synced: 0 };
  for (const i of state.items) s[i.status]++;
  return { ...s, unsent: s.pending + s.syncing + s.failed };
}

/** Normaliza lo leído del almacenamiento (puede venir dañado o de una versión anterior). */
export function restoreQueue(raw: unknown): QueueState {
  if (!raw || typeof raw !== "object") return emptyQueue();
  const r = raw as Partial<QueueState>;
  const items = Array.isArray(r.items) ? r.items.filter((i): i is QueuedSale => !!i && typeof i.clientSaleId === "string" && typeof i.seq === "number") : [];
  const maxSeq = items.reduce((m, i) => Math.max(m, i.seq), 0);
  return recoverInterrupted({ items, nextSeq: Math.max(typeof r.nextSeq === "number" ? r.nextSeq : 1, maxSeq + 1) });
}

/* ------------------------------ Stock reservado ------------------------------ */

/** Unidades por producto de las ventas que el servidor aún no descontó (todas menos las ya enviadas). */
export function reservedUnits(state: QueueState, branchId: BranchId): Map<number, number> {
  const m = new Map<number, number>();
  for (const i of state.items) {
    if (i.status === "synced" || i.branchId !== branchId) continue;
    for (const r of i.reserve) m.set(r.productId, (m.get(r.productId) ?? 0) + r.units);
  }
  return m;
}

/** Copia de los lotes con lo reservado ya descontado, por FEFO, para no vender dos veces lo mismo sin conexión. */
export function applyReserved(lots: Lot[], reserved: Map<number, number>, now: number): Lot[] {
  if (reserved.size === 0) return lots;
  const out = lots.map((l) => ({ ...l }));
  for (const [productId, units] of reserved) {
    let left = units;
    for (const l of sellableLots(out, productId, now)) {
      if (left <= 0) break;
      const take = Math.min(l.qty, left);
      l.qty -= take;
      left -= take;
    }
  }
  return out;
}

/* ------------------------------ Ticket provisional ------------------------------ */

export interface ProvisionalSaleInput {
  clientSaleId: string;
  ticket: string;
  branchId: BranchId;
  soldAt: string;
  sellerName: string;
  lines: CartLine[];
  totals: Totals;
  payment: { method: PaymentMethod; received?: number; reference?: string };
  document: { type: DocType; customerDocId?: string; customerName?: string };
  customerId: number | null;
  prescription: Prescription | null;
}

/** Venta tal como se verá en el ticket provisional. El número oficial y el estado ante SUNAT llegan al sincronizar. */
export function buildProvisionalSale(input: ProvisionalSaleInput): Sale {
  const items: SaleLine[] = input.lines.map((l) => ({
    productId: l.productId,
    presentation: l.presentation,
    presentationLabel: l.pres.label,
    qty: l.qty,
    units: l.units,
    unitPrice: l.pres.price,
    discount: l.discount,
    total: l.total,
    lots: l.alloc.map((a) => ({ lotId: a.lotId, code: a.code, expiresOn: a.expiresOn, units: a.units })),
  }));
  const received = input.payment.method === "efectivo" ? input.payment.received ?? input.totals.total : input.totals.total;
  return {
    id: `off_${input.clientSaleId}`,
    branchId: input.branchId,
    number: input.ticket,
    createdAt: input.soldAt,
    sellerName: input.sellerName,
    items,
    total: input.totals.total,
    taxBase: input.totals.taxBase,
    igv: input.totals.igv,
    payment: { method: input.payment.method, received, change: Math.round((received - input.totals.total) * 100) / 100, reference: input.payment.reference },
    document: input.document,
    customerId: input.customerId,
    prescription: input.prescription,
    approvedBy: null,
    clientSaleId: input.clientSaleId,
    offlineTicket: input.ticket,
  };
}

/** true si la venta es el ticket provisional armado en el equipo (todavía sin comprobante oficial). */
export const isProvisionalSale = (sale: Pick<Sale, "id">): boolean => sale.id.startsWith("off_");
