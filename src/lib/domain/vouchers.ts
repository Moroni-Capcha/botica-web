/**
 * Comprobantes electrónicos (SUNAT): estado, reenvío, anulación y notas de crédito.
 * Reglas puras: el backend debería aplicar los mismos casos. Fechas: días locales de Lima (America/Lima).
 */
import type { CreditNote, CreditNoteItem, CreditReasonCode, DocType, Sale, SaleLine, Voucher, VoucherStatus } from "@/lib/api/types";
import { limaDay } from "./account";
import { IGV, round2 } from "./pharmacy";

const DAY = 86_400_000;

/** Días corridos (contando el de la emisión) en que aún se puede dar de baja un comprobante. */
export const VOID_WINDOW_DAYS = 7;

/** Código con que SUNAT acepta un comprobante. */
export const SUNAT_OK_CODE = "0";

export const STATUS_LABEL: Record<VoucherStatus, string> = {
  pendiente: "Pendiente",
  aceptado: "Aceptado",
  rechazado: "Rechazado",
  anulado: "Anulado",
};

export const DOC_LABEL: Record<DocType, string> = { boleta: "Boleta", factura: "Factura" };
export const KIND_LABEL: Record<RowKind, string> = { boleta: "Boleta", factura: "Factura", nota_credito: "Nota de crédito" };

export const splitIgv = (total: number) => {
  const taxBase = round2(total / (1 + IGV));
  return { taxBase, igv: round2(total - taxBase) };
};

/* ------------------------------ Estado y reenvío ------------------------------ */

/** Solo se reenvía lo que SUNAT no confirmó: pendiente (no hubo respuesta) o rechazado (ya corregido). */
export const canResend = (status: VoucherStatus): boolean => status === "pendiente" || status === "rechazado";

/** Respuesta de SUNAT cuando acepta el comprobante. */
export function acceptedResponse(kind: DocType | "nota_credito", number: string, at: number): { code: string; message: string; at: string } {
  const what = kind === "factura" ? "La Factura" : kind === "boleta" ? "La Boleta" : "La Nota de Crédito";
  return { code: SUNAT_OK_CODE, message: `${what} numero ${number}, ha sido aceptada`, at: new Date(at).toISOString() };
}

/* ------------------------------ Anulación (comunicación de baja) ------------------------------ */

const utcOf = (day: string): number => {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
};

/** Días calendario (Lima) entre la emisión y hoy. 0 = emitido hoy. */
export const daysSinceIssued = (issuedAt: string, now: number): number => Math.round((utcOf(limaDay(now)) - utcOf(limaDay(Date.parse(issuedAt)))) / DAY);

/** Último día (YYYY-MM-DD) en que se puede anular un comprobante emitido en `issuedAt`. */
export const voidDeadline = (issuedAt: string): string => new Date(utcOf(limaDay(Date.parse(issuedAt))) + VOID_WINDOW_DAYS * DAY).toISOString().slice(0, 10);

type VoidInput = Pick<Voucher, "status" | "issuedAt" | "creditedTotal">;

/** Por qué no se puede anular (texto para mostrar), o null si se puede. Boletas y facturas: 7 días desde la emisión. */
export function voidBlocker(v: VoidInput, now: number): string | null {
  if (v.status === "anulado") return "Este comprobante ya está anulado.";
  if (v.status === "rechazado") return "SUNAT lo rechazó, así que no es válido y no se anula. Reenvíalo cuando esté corregido.";
  if (v.status === "pendiente") return "SUNAT aún no lo confirma. Reenvíalo primero; después se puede anular.";
  if (v.creditedTotal > 0) return "Ya tiene una nota de crédito, por eso no se puede anular.";
  if (daysSinceIssued(v.issuedAt, now) > VOID_WINDOW_DAYS) return `Pasaron más de ${VOID_WINDOW_DAYS} días desde la emisión. Ya no se puede anular: emite una nota de crédito.`;
  return null;
}

export function voidReasonError(reason: string): string | null {
  const r = reason.trim();
  if (r.length < 5) return "Escribe el motivo de la anulación (al menos 5 letras).";
  if (r.length > 160) return "El motivo es muy largo (máximo 160 letras).";
  return null;
}

/* ------------------------------ Notas de crédito ------------------------------ */

/** Cómo se indica lo que se acredita: todo el comprobante, ciertos productos o solo un importe. */
export type CreditKind = "total" | "items" | "amount";

export interface CreditReason {
  code: CreditReasonCode;
  /** Texto del catálogo 09 de SUNAT. */
  label: string;
  kind: CreditKind;
  /** La mercadería puede volver al stock (kardex). */
  stock: boolean;
  hint: string;
}

/** Motivos del catálogo 09 de SUNAT que usa una botica en el día a día. */
export const CREDIT_REASONS: readonly CreditReason[] = [
  { code: "01", label: "Anulación de la operación", kind: "total", stock: true, hint: "Se deja sin efecto toda la venta." },
  { code: "06", label: "Devolución total", kind: "total", stock: true, hint: "El cliente devuelve todo lo que compró." },
  { code: "07", label: "Devolución por ítem", kind: "items", stock: true, hint: "El cliente devuelve solo algunos productos." },
  { code: "04", label: "Descuento global", kind: "amount", stock: false, hint: "Se rebaja un importe del total, sin devolver productos." },
  { code: "09", label: "Disminución en el valor", kind: "amount", stock: false, hint: "Se corrige un cobro de más, sin devolver productos." },
];

export const creditReasonOf = (code: string): CreditReason | undefined => CREDIT_REASONS.find((r) => r.code === code);

/** Una nota rechazada por SUNAT no es válida y no cuenta como crédito dado. */
type LiveNote = Pick<CreditNote, "status" | "items" | "total" | "returnedToStock">;
const isLive = (n: Pick<CreditNote, "status">) => n.status !== "rechazado" && n.status !== "anulado";

export const creditedTotalOf = (notes: Pick<CreditNote, "status" | "total">[]): number => round2(notes.filter(isLive).reduce((s, n) => s + n.total, 0));

export interface CreditableLine {
  lineIndex: number;
  line: SaleLine;
  creditedQty: number;
  remainingQty: number;
  creditedTotal: number;
  remainingTotal: number;
  /** Unidades de esta línea que ya volvieron al stock por otras notas. */
  returnedUnits: number;
}

/** Lo que aún se puede acreditar de cada línea de la venta, descontando las notas válidas ya emitidas. */
export function creditableLines(sale: Pick<Sale, "items">, notes: LiveNote[]): CreditableLine[] {
  const live = notes.filter(isLive);
  return sale.items.map((line, lineIndex) => {
    const mine = live.flatMap((n) => n.items.filter((it) => it.lineIndex === lineIndex).map((it) => ({ it, stock: n.returnedToStock })));
    const creditedQty = mine.reduce((s, x) => s + x.it.qty, 0);
    const creditedTotal = round2(mine.reduce((s, x) => s + x.it.total, 0));
    return {
      lineIndex, line, creditedQty, remainingQty: line.qty - creditedQty, creditedTotal, remainingTotal: round2(line.total - creditedTotal),
      returnedUnits: mine.filter((x) => x.stock).reduce((s, x) => s + x.it.units, 0),
    };
  });
}

/** Importe de `qty` unidades de una línea. Si se acredita lo que falta, se toma el saldo exacto para no dejar centavos sueltos. */
export function creditItemTotal(c: CreditableLine, qty: number): number {
  return qty === c.remainingQty ? c.remainingTotal : round2((c.line.total * qty) / c.line.qty);
}

export interface CreditPlanInput {
  reasonCode: string;
  note: string;
  items?: { lineIndex: number; qty: number }[];
  amount?: number;
}

export type CreditPlan = { ok: true; reason: CreditReason; items: CreditNoteItem[]; total: number; taxBase: number; igv: number } | { ok: false; error: string };

/** Valida la nota de crédito y calcula qué se acredita. Es lo que usa el servidor y lo que muestra la vista previa. */
export function planCreditNote(sale: Pick<Sale, "items" | "total">, notes: LiveNote[], input: CreditPlanInput): CreditPlan {
  const reason = creditReasonOf(input.reasonCode);
  if (!reason) return { ok: false, error: "Elige el motivo de la nota de crédito." };
  if (input.note.trim().length < 3) return { ok: false, error: "Escribe el detalle del motivo (al menos 3 letras)." };
  if (input.note.trim().length > 160) return { ok: false, error: "El detalle es muy largo (máximo 160 letras)." };
  const lines = creditableLines(sale, notes);
  const remaining = round2(sale.total - creditedTotalOf(notes));
  if (remaining <= 0) return { ok: false, error: "Este comprobante ya se acreditó completo." };

  const toItem = (c: CreditableLine, qty: number): CreditNoteItem => ({
    lineIndex: c.lineIndex, productId: c.line.productId, presentationLabel: c.line.presentationLabel, qty,
    units: Math.round((c.line.units * qty) / c.line.qty), total: creditItemTotal(c, qty),
  });
  const done = (items: CreditNoteItem[], total: number): CreditPlan => ({ ok: true, reason, items, total: round2(total), ...splitIgv(round2(total)) });

  if (reason.kind === "total") {
    if (creditedTotalOf(notes) > 0) return { ok: false, error: "Ya hay una nota de crédito sobre esta venta. Para el resto usa «Devolución por ítem» o un descuento." };
    const items = lines.filter((c) => c.remainingQty > 0).map((c) => toItem(c, c.remainingQty));
    return done(items, sale.total);
  }

  if (reason.kind === "items") {
    const asked = (input.items ?? []).filter((x) => x.qty > 0);
    if (!asked.length) return { ok: false, error: "Elige al menos un producto y cuántos devuelve." };
    if (new Set(asked.map((x) => x.lineIndex)).size !== asked.length) return { ok: false, error: "Un producto no puede repetirse en la nota." };
    const items: CreditNoteItem[] = [];
    for (const a of asked) {
      const c = lines[a.lineIndex];
      if (!c) return { ok: false, error: "Uno de los productos no pertenece a esta venta." };
      if (!Number.isInteger(a.qty)) return { ok: false, error: "Las cantidades deben ser números enteros." };
      if (a.qty > c.remainingQty) return { ok: false, error: c.remainingQty === 0 ? "Ese producto ya se devolvió completo." : `Solo se puede devolver hasta ${c.remainingQty} de ese producto.` };
      items.push(toItem(c, a.qty));
    }
    return done(items, items.reduce((s, it) => s + it.total, 0));
  }

  const amount = round2(input.amount ?? 0);
  if (!(amount > 0)) return { ok: false, error: "Escribe el importe a acreditar." };
  if (amount > remaining) return { ok: false, error: `El importe no puede pasar de S/ ${remaining.toFixed(2)}, lo que falta acreditar.` };
  return done([], amount);
}

/** Series de las notas: BC01 para boletas, FC01 para facturas (sale de las dos últimas cifras de la serie del local). */
export const noteSeries = (type: DocType, series: string): string => `${type === "factura" ? "F" : "B"}C${series.slice(-2).padStart(2, "0")}`;
export const creditNoteNumber = (type: DocType, series: string, n: number): string => `${noteSeries(type, series)}-${String(n).padStart(6, "0")}`;

/**
 * Reparte unidades que vuelven al stock entre los lotes de la venta, en el mismo orden en que salieron.
 * `alreadyReturned` son las que ya volvieron por otras notas.
 */
export function allocateReturn(lots: { lotId: number; units: number }[], alreadyReturned: number, units: number): { lotId: number; units: number }[] {
  let skip = alreadyReturned;
  let left = units;
  const out: { lotId: number; units: number }[] = [];
  for (const l of lots) {
    const free = Math.max(0, l.units - skip);
    skip = Math.max(0, skip - l.units);
    const take = Math.min(free, left);
    if (take > 0) out.push({ lotId: l.lotId, units: take });
    left -= take;
    if (left <= 0) break;
  }
  return out;
}

/* ------------------------------ Lista de comprobantes ------------------------------ */

export type RowKind = DocType | "nota_credito";

/** Una fila de la pantalla: una venta (boleta o factura) o una nota de crédito. */
export interface VoucherRow {
  key: string;
  id: string;
  kind: RowKind;
  number: string;
  issuedAt: string;
  branchId: string;
  customerName: string;
  customerDocId: string;
  total: number;
  status: VoucherStatus;
  sunat: Voucher["sunat"];
  attempts: number;
  /** Número del comprobante que modifica (solo notas). */
  refNumber: string | null;
  voucher: Voucher | null;
  note: CreditNote | null;
}

export function toRows(vouchers: Voucher[], notes: CreditNote[]): VoucherRow[] {
  const sales: VoucherRow[] = vouchers.map((v) => ({
    key: `v:${v.id}`, id: v.id, kind: v.type, number: v.number, issuedAt: v.issuedAt, branchId: v.branchId, customerName: v.customerName, customerDocId: v.customerDocId,
    total: v.total, status: v.status, sunat: v.sunat, attempts: v.attempts, refNumber: null, voucher: v, note: null,
  }));
  const credits: VoucherRow[] = notes.map((n) => ({
    key: `n:${n.id}`, id: n.id, kind: "nota_credito", number: n.number, issuedAt: n.issuedAt, branchId: n.branchId, customerName: n.customerName, customerDocId: n.customerDocId,
    total: n.total, status: n.status, sunat: n.sunat, attempts: n.attempts, refNumber: n.voucherNumber, voucher: null, note: n,
  }));
  return [...sales, ...credits].sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
}

export interface VoucherFilter {
  kind: RowKind | "todos";
  status: VoucherStatus | "todos";
  text: string;
}

const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function filterRows(rows: VoucherRow[], f: VoucherFilter): VoucherRow[] {
  const q = plain(f.text.trim());
  return rows.filter(
    (r) =>
      (f.kind === "todos" || r.kind === f.kind) &&
      (f.status === "todos" || r.status === f.status) &&
      (!q || plain(`${r.number} ${r.customerName} ${r.customerDocId} ${r.refNumber ?? ""}`).includes(q)),
  );
}

/** Cuántos comprobantes hay por estado (para los avisos de la pantalla). */
export function countByStatus(rows: Pick<VoucherRow, "status">[]): Record<VoucherStatus, number> {
  const out: Record<VoucherStatus, number> = { pendiente: 0, aceptado: 0, rechazado: 0, anulado: 0 };
  for (const r of rows) out[r.status]++;
  return out;
}
