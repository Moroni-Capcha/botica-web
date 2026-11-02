import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ApiClient } from "../contract";
import type { Sale } from "../types";

/** Almacenamiento en memoria para que el mock funcione sin navegador. */
const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};

let api: ApiClient;
/** Las llamadas del mock esperan un rato simulado: con relojes falsos se adelantan al instante. */
const run = <T>(p: Promise<T>): Promise<T> => {
  p.catch(() => undefined);
  return vi.runAllTimersAsync().then(() => p);
};
const range = () => {
  const d = new Date();
  const f = (t: number) => new Date(t).toLocaleDateString("en-CA");
  return { from: f(d.getTime() - 2 * 86_400_000), to: f(d.getTime() + 86_400_000) };
};
const rejects = async (p: Promise<unknown>) => {
  try {
    await run(p);
  } catch (e) {
    return e as { code: string; status: number; message: string };
  }
  throw new Error("Debía fallar");
};

describe("mock: comprobantes SUNAT", () => {
  beforeAll(async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", memory());
    vi.stubGlobal("sessionStorage", memory());
    const { createMockClient } = await import("./client");
    api = createMockClient();
    const session = await run(api.login("u2", "1111")); // Q.F. de Principal
    sessionStorage.setItem("bh.session", JSON.stringify({ token: session.token }));
  });
  afterAll(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const sell = (qty: number, productId = 1): Promise<Sale> =>
    run(api.createSale({ branchId: "principal", items: [{ productId, presentation: "unidad", qty }], payment: { method: "efectivo", received: 500 }, document: { type: "boleta" } }));
  const stockOf = async (productId: number) => (await run(api.listLots("principal"))).filter((l) => l.productId === productId).reduce((s, l) => s + l.qty, 0);

  it("una venta nueva aparece aceptada por SUNAT y no se puede reenviar", async () => {
    const sale = await sell(2);
    const list = await run(api.listVouchers(range()));
    const v = list.find((x) => x.id === sale.id)!;
    expect(v).toMatchObject({ number: sale.number, status: "aceptado", attempts: 1, creditedTotal: 0, voided: null });
    expect(v.sunat?.code).toBe("0");
    expect((await rejects(api.resendVoucher(sale.id))).code).toBe("ESTADO_INVALIDO");
  });

  it("reenvía lo pendiente o rechazado y suma un envío", async () => {
    const list = await run(api.listVouchers(range()));
    const open = list.filter((v) => v.status === "pendiente" || v.status === "rechazado");
    for (const v of open) {
      const after = await run(api.resendVoucher(v.id));
      expect(after).toMatchObject({ status: "aceptado", attempts: v.attempts + 1 });
    }
  });

  it("anula dentro del plazo, devuelve el stock al kardex y la saca de la caja", async () => {
    const before = await stockOf(1);
    const sale = await sell(3);
    expect(await stockOf(1)).toBe(before - 3);
    const cashBefore = (await run(api.getCashSummary("principal"))).sales.length;
    expect((await rejects(api.voidVoucher(sale.id, { reason: "x", returnStock: true }))).code).toBe("DATOS_INVALIDOS");

    const v = await run(api.voidVoucher(sale.id, { reason: "Cliente equivocado", returnStock: true }));
    expect(v.status).toBe("anulado");
    expect(v.voided).toMatchObject({ reason: "Cliente equivocado", by: "Q.F. Daniel Rojas" });
    expect(await stockOf(1)).toBe(before);
    const kardex = await run(api.getKardex(1, { branchId: "principal", days: 1 }));
    expect(kardex.entries.some((e) => e.type === "devolucion" && e.delta === 3 && e.reference === `Anulación de ${sale.number}`)).toBe(true);
    expect((await run(api.getCashSummary("principal"))).sales.length).toBe(cashBefore - 1);

    expect((await rejects(api.voidVoucher(sale.id, { reason: "Otra vez", returnStock: true }))).code).toBe("ESTADO_INVALIDO");
    expect((await rejects(api.createCreditNote(sale.id, { reasonCode: "06", note: "Devolución" }))).code).toBe("ESTADO_INVALIDO");
  });

  it("anular sin devolver al stock deja el stock como está", async () => {
    const sale = await sell(1);
    const after = await stockOf(1);
    await run(api.voidVoucher(sale.id, { reason: "Se rompió en la caja", returnStock: false }));
    expect(await stockOf(1)).toBe(after);
  });

  it("emite una nota de crédito por ítem, la numera y devuelve el stock", async () => {
    const sale = await sell(4);
    const before = await stockOf(1);
    const n = await run(api.createCreditNote(sale.id, { reasonCode: "07", note: "Devuelve dos", items: [{ lineIndex: 0, qty: 2 }] }));
    expect(n).toMatchObject({ number: expect.stringMatching(/^BC01-\d{6}$/), status: "aceptado", voucherNumber: sale.number, returnedToStock: true, reasonLabel: "Devolución por ítem" });
    expect(n.total).toBeCloseTo((sale.items[0]!.total * 2) / 4, 2);
    expect(n.taxBase + n.igv).toBeCloseTo(n.total, 2);
    expect(await stockOf(1)).toBe(before + 2);

    const v = (await run(api.listVouchers(range()))).find((x) => x.id === sale.id)!;
    expect(v.creditedTotal).toBe(n.total);
    expect(v.creditNotes.map((x) => x.id)).toEqual([n.id]);
    expect((await run(api.listCreditNotes(range()))).some((x) => x.id === n.id)).toBe(true);

    // ya tiene nota: no se anula, no admite más de lo que falta, y la total ya no procede
    expect((await rejects(api.voidVoucher(sale.id, { reason: "Quiero anular", returnStock: true }))).code).toBe("ESTADO_INVALIDO");
    expect((await rejects(api.createCreditNote(sale.id, { reasonCode: "07", note: "Devuelve", items: [{ lineIndex: 0, qty: 3 }] }))).code).toBe("DATOS_INVALIDOS");
    expect((await rejects(api.createCreditNote(sale.id, { reasonCode: "06", note: "Devuelve todo" }))).code).toBe("DATOS_INVALIDOS");

    // lo que falta vuelve a los lotes en orden, sin pasarse
    const rest = await run(api.createCreditNote(sale.id, { reasonCode: "07", note: "Devuelve el resto", items: [{ lineIndex: 0, qty: 2 }], returnStock: false }));
    expect(rest.returnedToStock).toBe(false);
    expect(rest.number).not.toBe(n.number);
    expect(n.total + rest.total).toBeCloseTo(sale.total, 2);
    expect(await stockOf(1)).toBe(before + 2);
  });

  it("descuento global: acredita un importe sin mover stock", async () => {
    const sale = await sell(2);
    const before = await stockOf(1);
    const n = await run(api.createCreditNote(sale.id, { reasonCode: "04", note: "Descuento por demora", amount: 0.1, returnStock: true }));
    expect(n).toMatchObject({ total: 0.1, items: [], returnedToStock: false });
    expect(await stockOf(1)).toBe(before);
    expect((await rejects(api.createCreditNote(sale.id, { reasonCode: "09", note: "Cobro de más", amount: sale.total }))).code).toBe("DATOS_INVALIDOS");
  });

  it("las notas de crédito restan en la caja, el panel y el reporte el día en que se emiten", async () => {
    const sale = await sell(4);
    const cash0 = await run(api.getCashSummary("principal"));
    const today = (await run(api.getDashboard(7))).today.find((t) => t.branchId === "principal")!;
    const sum = (ls: { total: number }[]) => ls.reduce((s, l) => s + l.total, 0);
    const rep0 = await run(api.getSalesReport(range()));

    const n = await run(api.createCreditNote(sale.id, { reasonCode: "07", note: "Devuelve dos", items: [{ lineIndex: 0, qty: 2 }] }));

    const cash1 = await run(api.getCashSummary("principal"));
    expect(cash1.totals).toEqual(cash0.totals); // lo vendido no cambia
    expect(cash1.returns.count).toBe(cash0.returns.count + 1);
    expect(cash1.returns.efectivo).toBeCloseTo(cash0.returns.efectivo + n.total, 2); // la venta fue en efectivo
    expect(cash1.returns.yape).toBe(cash0.returns.yape);
    expect(cash1.returnRows.some((r) => r.number === n.number && r.method === "efectivo" && r.total === n.total)).toBe(true);
    if (cash1.session.open) expect(cash1.expected).toBeCloseTo(cash0.expected - n.total, 2);

    const today1 = (await run(api.getDashboard(7))).today.find((t) => t.branchId === "principal")!;
    expect(today1.gross).toBe(today.gross);
    expect(today1.returns).toBeCloseTo(today.returns + n.total, 2);
    expect(today1.total).toBeCloseTo(today.total - n.total, 2);
    expect(today1.byMethod.efectivo).toBeCloseTo(today.byMethod.efectivo - n.total, 2);
    expect(today1.tickets).toBe(today.tickets);

    const rep1 = await run(api.getSalesReport(range()));
    const back = rep1.filter((l) => l.kind === "devolucion" && l.number === n.number);
    expect(back).toHaveLength(1);
    expect(back[0]).toMatchObject({ qty: -2, productId: 1, saleId: sale.id });
    expect(back[0]!.cost).toBeLessThan(0); // volvió al stock: el costo se revierte
    expect(sum(rep1)).toBeCloseTo(sum(rep0) - n.total, 2);

    // sin devolución de stock: resta venta pero no costo
    const sale2 = await sell(2);
    const n2 = await run(api.createCreditNote(sale2.id, { reasonCode: "07", note: "Producto dañado", items: [{ lineIndex: 0, qty: 1 }], returnStock: false }));
    const back2 = (await run(api.getSalesReport(range()))).filter((l) => l.kind === "devolucion" && l.number === n2.number);
    expect(back2.map((l) => l.cost)).toEqual([0]);
  });

  it("una venta de hoy aparece en el rango de hoy y no en uno pasado; rechaza rangos inválidos", async () => {
    const sale = await sell(1);
    expect((await run(api.listVouchers(range()))).some((v) => v.id === sale.id)).toBe(true);
    const past = await run(api.listVouchers({ from: "2020-01-01", to: "2020-01-31" }));
    expect(past.some((v) => v.id === sale.id)).toBe(false);
    expect((await rejects(api.listVouchers({ from: "2026-02-01", to: "2026-01-01" }))).code).toBe("DATOS_INVALIDOS");
    expect((await rejects(api.resendVoucher("no-existe"))).code).toBe("COMPROBANTE_NO_EXISTE");
  });

  it("una cuenta de local no ve ni toca otro local", async () => {
    const other = await run(api.login("u3", "2222")); // Sucursal
    sessionStorage.setItem("bh.session", JSON.stringify({ token: other.token }));
    try {
      expect((await rejects(api.listVouchers({ ...range(), branchId: "principal" }))).code).toBe("SIN_PERMISO");
      const mine = await run(api.listVouchers(range()));
      expect(mine.every((v) => v.branchId === "sucursal")).toBe(true);
    } finally {
      const back = await run(api.login("u2", "1111"));
      sessionStorage.setItem("bh.session", JSON.stringify({ token: back.token }));
    }
  });
});
