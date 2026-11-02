import { describe, expect, it } from "vitest";
import type { CreditNote, CreditNoteItem, Sale, SaleLine, Voucher } from "@/lib/api/types";
import {
  VOID_WINDOW_DAYS, acceptedResponse, allocateReturn, canResend, countByStatus, creditNoteNumber, creditedTotalOf, creditableLines, daysSinceIssued, filterRows, noteSeries,
  planCreditNote, splitIgv, toRows, voidBlocker, voidDeadline, voidReasonError,
} from "./vouchers";

/* Lima es UTC−5 todo el año */
const at = (iso: string) => Date.parse(`${iso}-05:00`);
const NOW = at("2026-10-27T10:00:00");

const line = (productId: number, qty: number, units: number, total: number, lots: { lotId: number; units: number }[]): SaleLine => ({
  productId, presentation: "blister", presentationLabel: "Blíster", qty, units, unitPrice: total / qty, discount: 0, total,
  lots: lots.map((l) => ({ ...l, code: `L${l.lotId}`, expiresOn: "2027-06-30" })),
});
/* Línea 0: 3 blísteres de S/ 10 (30 unidades en dos lotes). Línea 1: 1 caja de S/ 20. Total S/ 50 */
const sale: Pick<Sale, "items" | "total"> = {
  items: [line(1, 3, 30, 30, [{ lotId: 11, units: 18 }, { lotId: 12, units: 12 }]), line(2, 1, 100, 20, [{ lotId: 21, units: 100 }])],
  total: 50,
};

const item = (lineIndex: number, qty: number, units: number, total: number): CreditNoteItem => ({ lineIndex, productId: lineIndex + 1, presentationLabel: "Blíster", qty, units, total });
const note = (patch: Partial<CreditNote>): Pick<CreditNote, "status" | "items" | "total" | "returnedToStock"> => ({ status: "aceptado", items: [], total: 0, returnedToStock: true, ...patch });

describe("estado y reenvío", () => {
  it("solo se reenvía lo pendiente o rechazado", () => {
    expect(canResend("pendiente")).toBe(true);
    expect(canResend("rechazado")).toBe(true);
    expect(canResend("aceptado")).toBe(false);
    expect(canResend("anulado")).toBe(false);
  });
  it("la respuesta de aceptación lleva el código 0 y el número", () => {
    const r = acceptedResponse("factura", "F001-000045", NOW);
    expect(r.code).toBe("0");
    expect(r.message).toContain("F001-000045");
    expect(r.message).toContain("Factura");
    expect(acceptedResponse("nota_credito", "BC01-000001", NOW).message).toContain("Nota de Crédito");
  });
});

describe("plazo de anulación (7 días, hora de Lima)", () => {
  it("cuenta días calendario de Lima, no horas", () => {
    expect(daysSinceIssued("2026-10-27T00:05:00-05:00", NOW)).toBe(0);
    // 23:50 de Lima del día 26 (04:50 UTC del 27) y ahora 10:00 del 27: un día calendario
    expect(daysSinceIssued("2026-10-26T23:50:00-05:00", NOW)).toBe(1);
    expect(daysSinceIssued("2026-10-20T08:00:00-05:00", NOW)).toBe(7);
    expect(daysSinceIssued("2026-10-19T23:59:00-05:00", NOW)).toBe(8);
  });
  it("el último día para anular es 7 días después de la emisión", () => {
    expect(VOID_WINDOW_DAYS).toBe(7);
    expect(voidDeadline("2026-10-20T08:00:00-05:00")).toBe("2026-10-27");
    // 22:00 de Lima ya es el día siguiente en UTC: el plazo se cuenta con el día de Lima
    expect(voidDeadline("2026-10-20T22:00:00-05:00")).toBe("2026-10-27");
  });
  it("se puede anular un comprobante aceptado dentro del plazo, boleta o factura", () => {
    expect(voidBlocker({ status: "aceptado", issuedAt: "2026-10-20T08:00:00-05:00", creditedTotal: 0 }, NOW)).toBeNull();
    expect(voidBlocker({ status: "aceptado", issuedAt: "2026-10-27T09:00:00-05:00", creditedTotal: 0 }, NOW)).toBeNull();
  });
  it("pasado el plazo se indica la nota de crédito", () => {
    const msg = voidBlocker({ status: "aceptado", issuedAt: "2026-10-19T23:59:00-05:00", creditedTotal: 0 }, NOW);
    expect(msg).toContain("7 días");
    expect(msg).toContain("nota de crédito");
  });
  it("no se anula lo pendiente, rechazado, ya anulado o con nota de crédito", () => {
    const base = { issuedAt: "2026-10-27T09:00:00-05:00", creditedTotal: 0 };
    expect(voidBlocker({ ...base, status: "pendiente" }, NOW)).toContain("Reenvíalo");
    expect(voidBlocker({ ...base, status: "rechazado" }, NOW)).toContain("rechazó");
    expect(voidBlocker({ ...base, status: "anulado" }, NOW)).toContain("ya está anulado");
    expect(voidBlocker({ ...base, status: "aceptado", creditedTotal: 10 }, NOW)).toContain("nota de crédito");
  });
  it("el motivo de la baja pide al menos 5 letras", () => {
    expect(voidReasonError("   err ")).not.toBeNull();
    expect(voidReasonError("Cliente equivocado")).toBeNull();
    expect(voidReasonError("x".repeat(161))).not.toBeNull();
  });
});

describe("notas de crédito", () => {
  it("numera con serie BC o FC según el comprobante", () => {
    expect(noteSeries("boleta", "001")).toBe("BC01");
    expect(noteSeries("factura", "002")).toBe("FC02");
    expect(creditNoteNumber("boleta", "001", 7)).toBe("BC01-000007");
  });
  it("separa el IGV del total", () => {
    expect(splitIgv(11.8)).toEqual({ taxBase: 10, igv: 1.8 });
  });

  it("devolución total acredita todo el comprobante", () => {
    const p = planCreditNote(sale, [], { reasonCode: "06", note: "Devuelve todo" });
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.total).toBe(50);
    expect(p.items.map((i) => [i.lineIndex, i.qty, i.units, i.total])).toEqual([[0, 3, 30, 30], [1, 1, 100, 20]]);
    expect(p.taxBase + p.igv).toBeCloseTo(50, 2);
  });
  it("la devolución total no procede si ya hay otra nota válida, pero sí si esa fue rechazada", () => {
    const prior = note({ total: 10, items: [item(0, 1, 10, 10)] });
    const blocked = planCreditNote(sale, [prior], { reasonCode: "01", note: "Anular operación" });
    expect(blocked.ok).toBe(false);
    const rejected = planCreditNote(sale, [{ ...prior, status: "rechazado" }], { reasonCode: "01", note: "Anular operación" });
    expect(rejected.ok).toBe(true);
  });
  it("devolución por ítem acredita lo pedido", () => {
    const p = planCreditNote(sale, [], { reasonCode: "07", note: "Devuelve uno", items: [{ lineIndex: 0, qty: 1 }] });
    expect(p.ok && p.total).toBe(10);
    if (p.ok) expect(p.items).toEqual([{ lineIndex: 0, productId: 1, presentationLabel: "Blíster", qty: 1, units: 10, total: 10 }]);
  });
  it("no deja devolver más de lo vendido ni de lo que falta", () => {
    expect(planCreditNote(sale, [], { reasonCode: "07", note: "Devuelve", items: [{ lineIndex: 0, qty: 4 }] }).ok).toBe(false);
    const prior = note({ total: 20, items: [item(0, 2, 20, 20)] });
    const p = planCreditNote(sale, [prior], { reasonCode: "07", note: "Devuelve", items: [{ lineIndex: 0, qty: 2 }] });
    expect(p).toEqual({ ok: false, error: "Solo se puede devolver hasta 1 de ese producto." });
    expect(planCreditNote(sale, [], { reasonCode: "07", note: "Devuelve", items: [{ lineIndex: 5, qty: 1 }] }).ok).toBe(false);
    expect(planCreditNote(sale, [], { reasonCode: "07", note: "Devuelve", items: [] }).ok).toBe(false);
    expect(planCreditNote(sale, [], { reasonCode: "07", note: "Devuelve", items: [{ lineIndex: 0, qty: 1.5 }] }).ok).toBe(false);
  });
  it("al devolver lo que falta de una línea toma el saldo exacto, sin centavos sueltos", () => {
    const odd: Pick<Sale, "items" | "total"> = { items: [line(1, 3, 3, 10, [{ lotId: 1, units: 3 }])], total: 10 };
    const first = planCreditNote(odd, [], { reasonCode: "07", note: "Devuelve", items: [{ lineIndex: 0, qty: 1 }] });
    expect(first.ok && first.total).toBe(3.33);
    if (!first.ok) return;
    const n1 = note({ total: first.total, items: first.items });
    const second = planCreditNote(odd, [n1], { reasonCode: "07", note: "Devuelve", items: [{ lineIndex: 0, qty: 2 }] });
    expect(second.ok && second.total).toBe(6.67);
  });
  it("descuento y disminución piden un importe que no pase de lo que falta", () => {
    expect(planCreditNote(sale, [], { reasonCode: "04", note: "Descuento", amount: 5 })).toMatchObject({ ok: true, total: 5, items: [] });
    expect(planCreditNote(sale, [], { reasonCode: "09", note: "Cobro de más", amount: 0 }).ok).toBe(false);
    expect(planCreditNote(sale, [], { reasonCode: "09", note: "Cobro de más" }).ok).toBe(false);
    const prior = note({ total: 45, items: [] });
    const p = planCreditNote(sale, [prior], { reasonCode: "04", note: "Descuento", amount: 6 });
    expect(p).toEqual({ ok: false, error: "El importe no puede pasar de S/ 5.00, lo que falta acreditar." });
  });
  it("un comprobante ya acreditado completo no admite más notas", () => {
    const p = planCreditNote(sale, [note({ total: 50 })], { reasonCode: "04", note: "Descuento", amount: 1 });
    expect(p).toEqual({ ok: false, error: "Este comprobante ya se acreditó completo." });
  });
  it("exige motivo válido y detalle", () => {
    expect(planCreditNote(sale, [], { reasonCode: "99", note: "Algo" }).ok).toBe(false);
    expect(planCreditNote(sale, [], { reasonCode: "06", note: " a " }).ok).toBe(false);
  });
  it("suma solo las notas válidas", () => {
    expect(creditedTotalOf([{ status: "aceptado", total: 10 }, { status: "pendiente", total: 5 }, { status: "rechazado", total: 99 }])).toBe(15);
  });
  it("calcula lo que queda por línea", () => {
    const prior = note({ total: 10, items: [item(0, 1, 10, 10)] });
    const [a, b] = creditableLines(sale, [prior]);
    expect(a).toMatchObject({ creditedQty: 1, remainingQty: 2, remainingTotal: 20, returnedUnits: 10 });
    expect(b).toMatchObject({ creditedQty: 0, remainingQty: 1, remainingTotal: 20, returnedUnits: 0 });
    const noStock = creditableLines(sale, [{ ...prior, returnedToStock: false }]);
    expect(noStock[0]!.returnedUnits).toBe(0);
  });
});

describe("devolución al stock por lote", () => {
  const lots = [{ lotId: 11, units: 18 }, { lotId: 12, units: 12 }];
  it("vuelve primero al lote que salió primero", () => {
    expect(allocateReturn(lots, 0, 10)).toEqual([{ lotId: 11, units: 10 }]);
  });
  it("pasa al siguiente lote cuando el primero ya se cubrió", () => {
    expect(allocateReturn(lots, 0, 20)).toEqual([{ lotId: 11, units: 18 }, { lotId: 12, units: 2 }]);
  });
  it("respeta lo que ya volvió por otras notas", () => {
    expect(allocateReturn(lots, 10, 10)).toEqual([{ lotId: 11, units: 8 }, { lotId: 12, units: 2 }]);
    expect(allocateReturn(lots, 18, 12)).toEqual([{ lotId: 12, units: 12 }]);
  });
  it("nunca devuelve más de lo que salió", () => {
    expect(allocateReturn(lots, 0, 99).reduce((s, x) => s + x.units, 0)).toBe(30);
  });
});

describe("lista de comprobantes", () => {
  const voucher = (id: string, number: string, type: Voucher["type"], status: Voucher["status"], issuedAt: string, customerName = ""): Voucher => ({
    id, number, type, branchId: "principal", issuedAt, customerName, customerDocId: "", total: 10, taxBase: 8.47, igv: 1.53, status, sunat: null, attempts: 1, voided: null, creditedTotal: 0, creditNotes: [], sale: {} as Sale,
  });
  const credit = (id: string, number: string, voucherNumber: string, issuedAt: string): CreditNote => ({
    id, number, type: "boleta", branchId: "principal", issuedAt, userName: "Q.F.", voucherId: "x", voucherNumber, customerName: "Ñandú Pérez", customerDocId: "", reasonCode: "06", reasonLabel: "Devolución total",
    note: "Devuelve", items: [], total: 10, taxBase: 8.47, igv: 1.53, returnedToStock: true, status: "pendiente", sunat: null, attempts: 1,
  });
  const rows = toRows(
    [voucher("a", "B001-000001", "boleta", "aceptado", "2026-10-25T10:00:00-05:00", "Rosa Huamán"), voucher("b", "F001-000002", "factura", "rechazado", "2026-10-26T10:00:00-05:00", "Inversiones Sol")],
    [credit("n1", "BC01-000001", "B001-000001", "2026-10-27T09:00:00-05:00")],
  );

  it("junta ventas y notas, de la más reciente a la más antigua", () => {
    expect(rows.map((r) => r.number)).toEqual(["BC01-000001", "F001-000002", "B001-000001"]);
    expect(rows[0]).toMatchObject({ kind: "nota_credito", refNumber: "B001-000001" });
  });
  it("filtra por tipo y estado", () => {
    expect(filterRows(rows, { kind: "factura", status: "todos", text: "" }).map((r) => r.id)).toEqual(["b"]);
    expect(filterRows(rows, { kind: "todos", status: "pendiente", text: "" }).map((r) => r.id)).toEqual(["n1"]);
    expect(filterRows(rows, { kind: "nota_credito", status: "aceptado", text: "" })).toEqual([]);
  });
  it("busca por número, cliente o comprobante de origen, sin tildes ni mayúsculas", () => {
    expect(filterRows(rows, { kind: "todos", status: "todos", text: "huaman" }).map((r) => r.id)).toEqual(["a"]);
    expect(filterRows(rows, { kind: "todos", status: "todos", text: "ñandu" }).map((r) => r.id)).toEqual(["n1"]);
    expect(filterRows(rows, { kind: "todos", status: "todos", text: "b001-000001" }).map((r) => r.id)).toEqual(["n1", "a"]);
  });
  it("cuenta por estado", () => {
    expect(countByStatus(rows)).toEqual({ pendiente: 1, aceptado: 1, rechazado: 1, anulado: 0 });
  });
});
