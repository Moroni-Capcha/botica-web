import { describe, expect, it } from "vitest";
import type { KardexEntry, Lot, Product } from "@/lib/api/types";
import { SEED_PRODUCTS } from "@/lib/api/mock/seed-data";
import { groupInventory, inventoryRows, kardexBalances, kardexSummary, kardexTotals, kardexView, marginPct, minFor, validateProduct } from "./inventory";

const NOW = new Date(2026, 9, 27, 10, 0).getTime(); // 27/10/2026

const base: Product = {
  id: 1, name: "Paracetamol", active: "Paracetamol", conc: "500 mg", form: "Tableta", lab: "Genfar", category: "Analgésicos", rx: "libre",
  unitsPerBox: 100, unitsPerBlister: 10, unitName: "tableta", priceUnit: 0.2, priceBlister: 1.8, priceBox: 15, cost: 0.08, minStock: 100,
  minStockByBranch: { sucursal: 50 }, location: "A-1", barcode: "7751000007919", sanitaryReg: "EN-1", coldChain: false,
};
const other: Product = { ...base, id: 2, name: "Amoxicilina", lab: "Medifarma", category: "Antibióticos", priceUnit: 0.6, cost: 0.25, barcode: "7751000000002", minStockByBranch: undefined, minStock: 10 };

const lot = (id: number, productId: number, branchId: string, expiresOn: string, qty: number, cost = 0.08): Lot => ({
  id, branchId, productId, code: `L${id}`, expiresOn, qty, cost, discount: 0, receivedOn: null, supplier: null,
});

describe("inventario", () => {
  const lots = [
    lot(1, 1, "principal", "2027-05-01", 300),
    lot(2, 1, "principal", "2026-10-01", 40), // vencido
    lot(3, 1, "sucursal", "2027-01-15", 50),
    lot(4, 2, "principal", "2027-03-01", 8, 0.25),
  ];

  it("usa el mínimo propio de cada local", () => {
    expect(minFor(base, "principal")).toBe(100);
    expect(minFor(base, "sucursal")).toBe(50);
    expect(minFor(other, "sucursal")).toBe(10);
  });

  it("suma stock vigente por local, separa lo vencido y marca el estado", () => {
    const [p1, p2] = inventoryRows([base, other], lots, ["principal", "sucursal"], NOW);
    expect(p1!.perBranch).toEqual({ principal: 300, sucursal: 50 });
    expect(p1!.stock).toBe(350);
    expect(p1!.expired).toBe(40);
    expect(p1!.valueCost).toBe(31.2); // (300 + 40 + 50) × 0.08
    expect(p1!.valueRetail).toBe(70);
    expect(p1!.next?.id).toBe(3); // la sucursal vence antes
    expect(p1!.low).toEqual(["sucursal"]); // 50 ≤ 50
    expect(p1!.status).toBe("bajo");
    expect(p2!.status).toBe("bajo"); // la sucursal no tiene
    expect(p2!.low).toEqual(["principal", "sucursal"]);
  });

  it("solo mira los locales pedidos", () => {
    const [p1] = inventoryRows([base], lots, ["principal"], NOW);
    expect(p1!.stock).toBe(300);
    expect(p1!.status).toBe("ok");
    const [none] = inventoryRows([other], lots, ["sucursal"], NOW);
    expect(none!.status).toBe("agotado");
  });

  it("agrupa por laboratorio con el valor por local", () => {
    const rows = inventoryRows([base, other], lots, ["principal", "sucursal"], NOW);
    const g = groupInventory(rows, "lab", ["principal", "sucursal"]);
    expect(g.map((x) => x.key)).toEqual(["Genfar", "Medifarma"]);
    expect(g[0]!.costPerBranch).toEqual({ principal: 24, sucursal: 4 });
    expect(g[1]!.alerts).toBe(1);
  });
});

describe("kardex", () => {
  const e = (id: string, at: string, type: KardexEntry["type"], delta: number): KardexEntry => ({ id, at, branchId: "principal", type, reference: id, lotCode: null, delta, userName: "Q.F." });

  it("calcula el saldo de cada movimiento desde el stock actual", () => {
    const entries = [e("venta2", "2026-10-26T10:00:00-05:00", "venta", -20), e("ingreso", "2026-10-20T09:00:00-05:00", "ingreso", 100), e("venta1", "2026-10-22T18:00:00-05:00", "venta", -5)];
    const { lines, opening } = kardexBalances(entries, 125);
    expect(lines.map((l) => [l.id, l.balance])).toEqual([["venta2", 125], ["venta1", 145], ["ingreso", 150]]);
    expect(opening).toBe(50);
    expect(kardexTotals(entries)).toEqual({ inUnits: 100, outUnits: 25, sold: 25 });
  });

  it("una página de kardex parte del saldo de la página y las cifras salen del periodo completo", () => {
    const all = [e("v3", "2026-10-26T10:00:00-05:00", "venta", -20), e("v2", "2026-10-25T10:00:00-05:00", "venta", -5), e("v1", "2026-10-22T10:00:00-05:00", "venta", -10), e("c1", "2026-10-21T10:00:00-05:00", "ingreso", 100)];
    const closing = 65;
    const summary = kardexSummary(all, closing);
    expect(summary).toEqual({ inUnits: 100, outUnits: 35, sold: 35, opening: 0 });

    // Página 1 (2 movimientos) y página 2 (los 2 siguientes), como las entregaría el servidor
    const p1 = kardexView({ entries: all.slice(0, 2), closing, pageClosing: closing, summary });
    const p2 = kardexView({ entries: all.slice(2), closing, pageClosing: 90, summary });
    expect(p1.lines.map((l) => [l.id, l.balance])).toEqual([["v3", 65], ["v2", 85]]);
    expect(p2.lines.map((l) => [l.id, l.balance])).toEqual([["v1", 90], ["c1", 100]]);
    expect([...p1.lines, ...p2.lines]).toEqual(kardexView({ entries: all, closing }).lines);
    expect(p2.opening).toBe(0);
    expect(p1.totals).toEqual(summary);
  });

  it("sin paginar, las cifras salen de los movimientos recibidos", () => {
    const entries = [e("v", "2026-10-26T10:00:00-05:00", "venta", -20), e("i", "2026-10-20T09:00:00-05:00", "ingreso", 100)];
    const v = kardexView({ entries, closing: 80 });
    expect(v.opening).toBe(0);
    expect(v.totals).toEqual({ inUnits: 100, outUnits: 20, sold: 20, opening: 0 });
    expect(v.lines.map((l) => l.balance)).toEqual([80, 100]);
  });
});

describe("producto", () => {
  it("calcula el margen sin IGV", () => {
    expect(marginPct(1.18, 1, 0.5)).toBe(50);
    expect(marginPct(0, 1, 0.5)).toBe(0);
  });

  it("valida precios, presentaciones y código de barras", () => {
    const { id: _id, ...input } = base;
    expect(validateProduct(input)).toEqual({});
    expect(validateProduct({ ...input, priceUnit: 0 }).priceUnit).toBeTruthy();
    expect(validateProduct({ ...input, unitsPerBlister: 7 }).unitsPerBlister).toBeTruthy();
    expect(validateProduct({ ...input, cost: 0.5 }).cost).toBeTruthy();
    expect(validateProduct(input, [other, { ...other, id: 9, barcode: input.barcode }]).barcode).toBeTruthy();
    expect(validateProduct(input, [base], 1).barcode).toBeUndefined();
  });

  it("los productos de ejemplo pasan la validación", () => {
    const bad = SEED_PRODUCTS.map(({ id, ...p }) => [id, validateProduct(p, SEED_PRODUCTS, id)] as const).filter(([, err]) => Object.keys(err).length);
    expect(bad).toEqual([]);
  });
});
