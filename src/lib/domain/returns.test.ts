import { describe, expect, it } from "vitest";
import type { CreditNote, CreditNoteItem, PaymentMethod, Sale, SaleLine, SalesReportLine } from "@/lib/api/types";
import { expectedCash } from "./cash";
import { IGV, round2 } from "./pharmacy";
import { byDay, deadStock, prescriptionBook, totalsOf } from "./reports";
import { isLiveNote, netPayments, netPurchase, returnLines, returnsByMethod, sumPayments } from "./returns";
import { creditedTotalOf, voidBlocker } from "./vouchers";

const SALE_DAY = "2026-10-26T10:00:00-05:00";
const NOTE_DAY = "2026-10-27T15:00:00-05:00";

const line = (productId: number, qty: number, units: number, total: number, lots: { lotId: number; units: number }[]): SaleLine => ({
  productId, presentation: "blister", presentationLabel: "Blíster", qty, units, unitPrice: total / qty, discount: 0, total,
  lots: lots.map((l) => ({ ...l, code: `L${l.lotId}`, expiresOn: "2027-06-30" })),
});
/* Línea 0: 3 blísteres, S/ 30 (lote 11: 18 u a 0.10, lote 12: 12 u a 0.20 → costo 4.20). Línea 1: 1 caja, S/ 20 (lote 21: 100 u a 0.05 → costo 5.00). Total S/ 50, costo 9.20 */
const COST: Record<number, number> = { 11: 0.1, 12: 0.2, 21: 0.05 };
const costOf = (lotId: number) => COST[lotId] ?? 0;

const mkSale = (method: PaymentMethod = "efectivo", items: SaleLine[] = [line(1, 3, 30, 30, [{ lotId: 11, units: 18 }, { lotId: 12, units: 12 }]), line(2, 1, 100, 20, [{ lotId: 21, units: 100 }])]): Sale =>
  ({
    id: "s1", branchId: "principal", number: "B001-000001", createdAt: new Date(SALE_DAY).toISOString(), sellerName: "Ana", items, total: round2(items.reduce((s, l) => s + l.total, 0)),
    taxBase: 0, igv: 0, payment: { method, received: 100, change: 0 }, document: { type: "boleta" }, customerId: null, prescription: null, approvedBy: null,
  }) as Sale;

const nit = (lineIndex: number, qty: number, units: number, total: number): CreditNoteItem => ({ lineIndex, productId: lineIndex + 1, presentationLabel: "Blíster", qty, units, total });
const mkNote = (patch: Partial<CreditNote>): CreditNote =>
  ({
    id: "n1", number: "BC01-000001", branchId: "principal", issuedAt: new Date(NOTE_DAY).toISOString(), voucherId: "s1", voucherNumber: "B001-000001", userName: "Ana",
    status: "aceptado", items: [], total: 0, returnedToStock: true, ...patch,
  }) as CreditNote;

/** Las líneas de reporte que genera la venta, como las arma el servidor. */
const saleLines = (sale: Sale): SalesReportLine[] =>
  sale.items.map((l) => ({
    saleId: sale.id, number: sale.number, at: sale.createdAt, branchId: sale.branchId, sellerName: sale.sellerName, method: sale.payment.method, documentType: "boleta", customerId: null,
    productId: l.productId, presentationLabel: l.presentationLabel, qty: l.qty, units: l.units, total: l.total,
    cost: round2(l.lots.reduce((s, x) => s + x.units * costOf(x.lotId), 0)), discount: 0, prescription: null,
  }));

const NOTE_1_BLISTER = (patch: Partial<CreditNote> = {}) => mkNote({ items: [nit(0, 1, 10, 10)], total: 10, ...patch });

describe("líneas de devolución", () => {
  it("nota total: resta toda la venta y todo el costo, y el neto queda en cero", () => {
    const sale = mkSale();
    const note = mkNote({ items: [nit(0, 3, 30, 30), nit(1, 1, 100, 20)], total: 50 });
    const back = returnLines(sale, [note], costOf);
    expect(back.map((l) => [l.total, l.cost, l.units])).toEqual([[-30, -4.2, -30], [-20, -5, -100]]);
    expect(back.every((l) => l.kind === "devolucion" && l.at === note.issuedAt && l.number === note.number)).toBe(true);
    const t = totalsOf([...saleLines(sale), ...back]);
    expect(t).toMatchObject({ gross: 50, returns: 50, total: 0, cost: 0, profit: 0, margin: 0, tickets: 1, units: 0 });
  });

  it("nota parcial: resta lo devuelto y el costo sale del lote de origen, en orden", () => {
    const sale = mkSale();
    const first = NOTE_1_BLISTER({ id: "n1", issuedAt: new Date("2026-10-27T10:00:00-05:00").toISOString() });
    const second = NOTE_1_BLISTER({ id: "n2", number: "BC01-000002", issuedAt: new Date("2026-10-27T11:00:00-05:00").toISOString() });
    const back = returnLines(sale, [second, first], costOf); // llegan desordenadas
    expect(back.map((l) => [l.number, l.total, l.cost])).toEqual([["BC01-000001", -10, -1], ["BC01-000002", -10, -1.2]]); // 10 u del lote 11; luego 8 del 11 y 2 del 12
    const t = totalsOf([...saleLines(sale), ...back]);
    expect(t).toMatchObject({ gross: 50, returns: 20, total: 30, cost: round2(9.2 - 2.2), tickets: 1 });
    expect(t.taxBase).toBeCloseTo(30 / (1 + IGV), 2);
    expect(t.igv).toBeCloseTo(30 - 30 / (1 + IGV), 2);
  });

  it("la nota resta el día en que se emitió, no el de la venta", () => {
    const sale = mkSale();
    const back = returnLines(sale, [NOTE_1_BLISTER()], costOf);
    const days = byDay([...saleLines(sale), ...back], { from: "2026-10-26", to: "2026-10-27" }, ["principal"]);
    expect(days).toEqual([
      { date: "2026-10-26", total: 50, byBranch: { principal: 50 }, tickets: 1 },
      { date: "2026-10-27", total: -10, byBranch: { principal: -10 }, tickets: 0 },
    ]);
  });

  it("margen con devolución de stock: el costo se revierte y el margen sigue igual para lo que quedó", () => {
    const sale = mkSale();
    const back = returnLines(sale, [NOTE_1_BLISTER()], costOf);
    const t = totalsOf([...saleLines(sale), ...back]);
    const base = 40 / (1 + IGV);
    expect(t.cost).toBe(8.2);
    expect(t.margin).toBeCloseTo(((base - 8.2) / base) * 100, 1);
  });

  it("margen sin devolución de stock: resta venta pero no costo, así que el margen baja", () => {
    const sale = mkSale();
    const back = returnLines(sale, [NOTE_1_BLISTER({ returnedToStock: false })], costOf);
    expect(back.map((l) => l.cost)).toEqual([0]);
    const t = totalsOf([...saleLines(sale), ...back]);
    const base = 40 / (1 + IGV);
    expect(t.cost).toBe(9.2);
    expect(t.margin).toBeCloseTo(((base - 9.2) / base) * 100, 1);
    expect(t.margin).toBeLessThan(totalsOf(saleLines(sale)).margin);
  });

  it("descuento o disminución: se reparte entre los productos según su peso y no toca costo ni unidades", () => {
    const sale = mkSale();
    const back = returnLines(sale, [mkNote({ items: [], total: 5, returnedToStock: false })], costOf);
    expect(back.map((l) => [l.productId, l.total, l.cost, l.units])).toEqual([[1, -3, 0, 0], [2, -2, 0, 0]]);
  });

  it("redondeo: un céntimo repartido entre tres productos no se pierde ni se inventa", () => {
    const sale = mkSale("efectivo", [line(1, 1, 1, 10, [{ lotId: 11, units: 1 }]), line(2, 1, 1, 10, [{ lotId: 11, units: 1 }]), line(3, 1, 1, 10, [{ lotId: 11, units: 1 }])]);
    const back = returnLines(sale, [mkNote({ items: [], total: 0.01, returnedToStock: false })], costOf);
    expect(round2(back.reduce((s, l) => s + l.total, 0))).toBe(-0.01);
    const odd = returnLines(sale, [mkNote({ items: [], total: 10.01, returnedToStock: false })], costOf);
    expect(round2(odd.reduce((s, l) => s + l.total, 0))).toBe(-10.01);
    expect(odd.every((l) => Math.abs(l.total * 100 - Math.round(l.total * 100)) < 1e-9)).toBe(true);
  });

  it("una nota rechazada o anulada por SUNAT no resta", () => {
    const sale = mkSale();
    expect(returnLines(sale, [NOTE_1_BLISTER({ status: "rechazado" }), NOTE_1_BLISTER({ id: "n3", status: "anulado" })], costOf)).toEqual([]);
    expect(isLiveNote({ status: "pendiente" })).toBe(true);
  });

  it("ignora notas de otra venta y las devoluciones no cuentan como comprobantes, ni receta, ni venta del producto", () => {
    const sale = mkSale();
    expect(returnLines(sale, [NOTE_1_BLISTER({ voucherId: "otra" })], costOf)).toEqual([]);
    const back = returnLines(sale, [mkNote({ items: [nit(0, 3, 30, 30), nit(1, 1, 100, 20)], total: 50 })], costOf);
    expect(totalsOf(back).tickets).toBe(0);
    expect(prescriptionBook(back, new Map())).toEqual([]);
    const product = { id: 1, unitsPerBox: 1 } as never;
    // el producto 1 se vendió y se devolvió el mismo día: sigue contando como vendido (no está "sin movimiento")
    expect(deadStock([product], [], [...saleLines(sale), ...back], ["principal"], Date.now()).length).toBe(0);
    expect(deadStock([product], [{ id: 1, productId: 1, branchId: "principal", qty: 5, cost: 1, expiresOn: "2030-01-01", receivedOn: "2026-01-01" } as never], back, ["principal"], Date.parse("2026-11-01T12:00:00-05:00")).length).toBe(1);
  });
});

describe("caja: devoluciones por método de pago", () => {
  const methods: Record<string, PaymentMethod> = { a: "efectivo", b: "yape", c: "tarjeta" };
  const notes = [
    { voucherId: "a", total: 12.5, status: "aceptado" as const },
    { voucherId: "b", total: 7.3, status: "aceptado" as const },
    { voucherId: "c", total: 4, status: "aceptado" as const },
    { voucherId: "a", total: 99, status: "rechazado" as const },
    { voucherId: "zz", total: 5, status: "aceptado" as const },
  ];

  it("separa lo devuelto por el método de la venta original y cuenta solo las válidas", () => {
    expect(returnsByMethod(notes, (id) => methods[id])).toEqual({ efectivo: 12.5, yape: 7.3, tarjeta: 4, count: 3 });
  });

  it("solo el efectivo baja lo que debe haber en caja; Yape y tarjeta no", () => {
    const gross = { efectivo: 100, yape: 40, tarjeta: 20 };
    const ret = returnsByMethod(notes, (id) => methods[id]);
    expect(netPayments(gross, ret)).toEqual({ efectivo: 87.5, yape: 32.7, tarjeta: 16 });
    expect(expectedCash(150, netPayments(gross, ret).efectivo, [])).toBe(237.5);
    expect(expectedCash(150, gross.efectivo, [])).toBe(250); // sin devoluciones
    expect(sumPayments(gross) - sumPayments(ret)).toBeCloseTo(sumPayments(netPayments(gross, ret)), 10);
  });

  it("no arrastra errores de coma flotante (10.30 − 0.10)", () => {
    expect(netPayments({ efectivo: 10.3, yape: 0, tarjeta: 0 }, { efectivo: 0.1, yape: 0, tarjeta: 0 }).efectivo).toBe(10.2);
    expect(sumPayments({ efectivo: 0.1, yape: 0.2, tarjeta: 0 })).toBe(0.3);
  });
});

describe("compras del cliente", () => {
  it("nota total: la compra queda en cero y sin productos", () => {
    const sale = mkSale();
    expect(netPurchase(sale, [mkNote({ items: [nit(0, 3, 30, 30), nit(1, 1, 100, 20)], total: 50 })])).toEqual({ total: 0, returned: 50, items: [] });
  });

  it("nota parcial: descuenta importe, cantidad y unidades", () => {
    const sale = mkSale();
    const net = netPurchase(sale, [NOTE_1_BLISTER()]);
    expect(net.total).toBe(40);
    expect(net.returned).toBe(10);
    expect(net.items).toEqual([
      { productId: 1, presentationLabel: "Blíster", qty: 2, units: 20, total: 20 },
      { productId: 2, presentationLabel: "Blíster", qty: 1, units: 100, total: 20 },
    ]);
  });

  it("descuento global: baja el total pero no los productos; una nota rechazada no cuenta", () => {
    const sale = mkSale();
    const net = netPurchase(sale, [mkNote({ items: [], total: 5, returnedToStock: false }), NOTE_1_BLISTER({ status: "rechazado" })]);
    expect(net.total).toBe(45);
    expect(net.items.map((x) => x.qty)).toEqual([3, 1]);
  });
});

describe("anulación y nota de crédito no se mezclan", () => {
  const voucher = (creditedTotal: number) => ({ status: "aceptado" as const, issuedAt: SALE_DAY, creditedTotal });

  it("un comprobante con nota válida no se puede anular; si la nota fue rechazada, sí", () => {
    const now = Date.parse("2026-10-27T12:00:00-05:00");
    expect(voidBlocker(voucher(creditedTotalOf([NOTE_1_BLISTER()])), now)).toMatch(/nota de crédito/);
    expect(voidBlocker(voucher(creditedTotalOf([NOTE_1_BLISTER({ status: "rechazado" })])), now)).toBeNull();
  });

  it("un comprobante anulado no admite nota: queda fuera de las devoluciones porque la venta ya salió del reporte", () => {
    expect(voidBlocker({ status: "anulado", issuedAt: SALE_DAY, creditedTotal: 0 }, Date.parse("2026-10-27T12:00:00-05:00"))).toMatch(/anulado/);
  });
});
