import { describe, expect, it } from "vitest";
import type { Lot, Product, SalesReportLine } from "@/lib/api/types";
import { byDay, change, deadStock, groupLines, periodDays, periodFor, prescriptionBook, previousPeriod, totalsOf } from "./reports";

const NOW = new Date(2026, 9, 27, 15, 0).getTime(); // martes 27/10/2026

const p = (id: number, over: Partial<Product> = {}): Product => ({
  id, name: `P${id}`, active: "", conc: "", form: "Tableta", lab: "Genfar", category: "Analgésicos", rx: "libre", unitsPerBox: 1, unitsPerBlister: 0, unitName: "u",
  priceUnit: 1, priceBlister: 0, priceBox: 0, cost: 0.5, minStock: 0, location: "", barcode: "", sanitaryReg: "", coldChain: false, ...over,
});
const line = (saleId: string, productId: number, total: number, cost: number, over: Partial<SalesReportLine> = {}): SalesReportLine => ({
  saleId, number: saleId, at: new Date(2026, 9, 26, 10).toISOString(), branchId: "principal", sellerName: "Ana", method: "efectivo", documentType: "boleta", customerId: null,
  productId, presentationLabel: "Unidad", qty: 1, units: 2, total, cost, discount: 0, prescription: null, ...over,
});

describe("periodos", () => {
  it("arma los periodos rápidos", () => {
    expect(periodFor("hoy", NOW)).toMatchObject({ from: "2026-10-27", to: "2026-10-27" });
    expect(periodFor("ayer", NOW)).toMatchObject({ from: "2026-10-26", to: "2026-10-26" });
    expect(periodFor("7d", NOW)).toMatchObject({ from: "2026-10-21", to: "2026-10-27" });
    expect(periodFor("mes", NOW)).toEqual({ from: "2026-10-01", to: "2026-10-27", label: "octubre 2026" });
    expect(periodFor("mes_anterior", NOW)).toEqual({ from: "2026-09-01", to: "2026-09-30", label: "septiembre 2026" });
    expect(periodDays({ from: "2026-10-01", to: "2026-10-27" })).toBe(27);
    expect(previousPeriod({ from: "2026-10-21", to: "2026-10-27" })).toMatchObject({ from: "2026-10-14", to: "2026-10-20" });
  });
});

describe("totales y grupos", () => {
  const lines = [line("a", 1, 11.8, 5), line("a", 2, 23.6, 10), line("b", 1, 11.8, 5, { branchId: "sucursal", at: new Date(2026, 9, 27, 9).toISOString() })];

  it("calcula venta sin IGV, utilidad y margen", () => {
    expect(totalsOf(lines)).toEqual({ total: 47.2, taxBase: 40, igv: 7.2, cost: 20, profit: 20, margin: 50, units: 6, tickets: 2, avgTicket: 23.6 });
    expect(totalsOf([])).toMatchObject({ total: 0, margin: 0, avgTicket: 0 });
  });

  it("agrupa y calcula la participación", () => {
    const g = groupLines(lines, (l) => String(l.productId), (k) => `Producto ${k}`);
    expect(g.map((x) => [x.label, x.total, x.tickets, Math.round(x.share * 100)])).toEqual([
      ["Producto 1", 23.6, 2, 50],
      ["Producto 2", 23.6, 1, 50],
    ]);
  });

  it("llena los días sin venta", () => {
    const d = byDay(lines, { from: "2026-10-25", to: "2026-10-27" }, ["principal", "sucursal"]);
    expect(d.map((x) => [x.date, x.total, x.tickets])).toEqual([["2026-10-25", 0, 0], ["2026-10-26", 35.4, 1], ["2026-10-27", 11.8, 1]]);
    expect(d[2]!.byBranch).toEqual({ principal: 0, sucursal: 11.8 });
  });

  it("compara con el periodo anterior", () => {
    expect(change(120, 100)).toBe(20);
    expect(change(5, 0)).toBeNull();
  });
});

describe("sin movimiento y recetas", () => {
  it("lista lo que tiene stock pero no se vendió, por valor inmovilizado", () => {
    const lot = (id: number, productId: number, qty: number, cost: number): Lot => ({ id, branchId: "principal", productId, code: `L${id}`, expiresOn: "2028-01-01", qty, cost, discount: 0, receivedOn: "2026-08-28", supplier: null });
    const rows = deadStock([p(1), p(2), p(3)], [lot(1, 1, 10, 1), lot(2, 2, 40, 0.5), lot(3, 3, 5, 10)], [line("a", 1, 2, 1)], ["principal"], NOW);
    expect(rows.map((r) => [r.product.id, r.units, r.value, r.daysInStock])).toEqual([[3, 5, 50, 60], [2, 40, 20, 60]]);
  });

  it("arma el libro de recetas por venta y marca los controlados", () => {
    const products = new Map([[1, p(1)], [7, p(7, { rx: "receta" })], [34, p(34, { rx: "controlado" })]]);
    const rx = { number: "R-1", doctor: "Dra. Soto", cmp: "45123" };
    const book = prescriptionBook([line("a", 1, 2, 1, { prescription: rx }), line("a", 7, 5, 2, { prescription: rx }), line("b", 34, 9, 4, { prescription: rx, at: new Date(2026, 9, 27).toISOString() })], products);
    expect(book.map((e) => [e.saleId, e.items.map((i) => i.productId), e.controlled])).toEqual([["b", [34], true], ["a", [7], false]]);
  });
});
