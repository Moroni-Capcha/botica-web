import { describe, expect, it } from "vitest";
import type { Lot, Product } from "@/lib/api/types";
import { dailyRates, lotRisk, priorityList, summarizeByTone, transferSuggestion } from "./expiry";
import { DEFAULT_THRESHOLDS } from "./pharmacy";

const NOW = new Date(2026, 9, 27, 10, 0).getTime(); // 27/10/2026

const product: Product = {
  id: 7, name: "Amoxicilina", active: "Amoxicilina", conc: "500 mg", form: "Cápsula", lab: "Genfar", category: "Antibióticos", rx: "receta",
  unitsPerBox: 100, unitsPerBlister: 10, unitName: "cápsula", priceUnit: 0.6, priceBlister: 5, priceBox: 45, cost: 0.25, minStock: 100,
  location: "B-2", barcode: "7752", sanitaryReg: "EN-2", coldChain: false,
};

const lot = (id: number, expiresOn: string, qty: number, branchId = "principal"): Lot => ({
  id, branchId, productId: 7, code: `L${id}`, expiresOn, qty, cost: 0.25, discount: 0, receivedOn: null, supplier: null,
});

/** 2 unidades por día en la principal, 5 en la sucursal. */
const rates = dailyRates([
  { branchId: "principal", productId: 7, units: 60, days: 30 },
  { branchId: "sucursal", productId: 7, units: 150, days: 30 },
]);

describe("riesgo por lote", () => {
  it("calcula las unidades que no se venderán antes de vencer, siguiendo FEFO", () => {
    // L1 vence en 10 días con 30 u: a 2 u/día se venden 20 → 10 en riesgo.
    // L2 vence en 100 días: después de L1 caben 170 u → 0 en riesgo.
    const rows = lotRisk([product], [lot(2, "2027-02-04", 100), lot(1, "2026-11-06", 30)], rates, NOW, DEFAULT_THRESHOLDS);
    const l1 = rows.find((r) => r.lot.id === 1)!;
    const l2 = rows.find((r) => r.lot.id === 2)!;
    expect(l1.days).toBe(10);
    expect(l1.atRisk).toBe(10);
    expect(l1.loss).toBe(2.5);
    expect(l1.needRate).toBe(3);
    expect(l1.tone).toBe("critico");
    expect(l2.atRisk).toBe(0);
    expect(l2.needRate).toBeCloseTo(130 / 100);
  });

  it("un lote vencido está en riesgo completo y no entra en la prioridad de venta", () => {
    const rows = lotRisk([product], [lot(1, "2026-10-20", 12), lot(2, "2026-11-06", 30)], rates, NOW, DEFAULT_THRESHOLDS);
    const expired = rows.find((r) => r.lot.id === 1)!;
    expect(expired.tone).toBe("vencido");
    expect(expired.atRisk).toBe(12);
    // El vencido no ocupa ventas: L2 sigue con 10 en riesgo
    expect(rows.find((r) => r.lot.id === 2)!.atRisk).toBe(10);
    expect(priorityList(rows).map((r) => r.lot.id)).toEqual([2]);
  });

  it("sin ventas, todo lo vigente queda en riesgo", () => {
    const rows = lotRisk([product], [lot(1, "2027-01-01", 40)], new Map(), NOW, DEFAULT_THRESHOLDS);
    expect(rows[0]!.atRisk).toBe(40);
    expect(rows[0]!.rate).toBe(0);
  });

  it("separa el análisis por local", () => {
    const rows = lotRisk([product], [lot(1, "2026-11-06", 30), lot(2, "2026-11-06", 30, "sucursal")], rates, NOW, DEFAULT_THRESHOLDS);
    expect(rows.find((r) => r.branchId === "principal")!.atRisk).toBe(10);
    expect(rows.find((r) => r.branchId === "sucursal")!.atRisk).toBe(0); // 5 u/día × 10 días = 50
  });

  it("resume lotes, unidades y valor por semáforo", () => {
    const rows = lotRisk([product], [lot(1, "2026-10-20", 12), lot(2, "2026-11-06", 30), lot(3, "2027-06-01", 100)], rates, NOW, DEFAULT_THRESHOLDS);
    const s = summarizeByTone(rows);
    expect(s.map((x) => x.lots)).toEqual([1, 1, 0, 1]);
    expect(s[0]!.value).toBe(3);
  });
});

describe("sugerencia de traslado", () => {
  it("sugiere el local que vende más rápido", () => {
    const [row] = lotRisk([product], [lot(1, "2026-11-06", 30)], rates, NOW, DEFAULT_THRESHOLDS);
    expect(transferSuggestion(row!, ["principal", "sucursal"], rates)).toEqual({ branchId: "sucursal", rate: 5 });
  });
  it("no sugiere si el otro local no vende claramente más", () => {
    const [row] = lotRisk([product], [lot(1, "2026-11-06", 30, "sucursal")], rates, NOW, DEFAULT_THRESHOLDS);
    expect(transferSuggestion(row!, ["principal", "sucursal"], rates)).toBeNull();
  });
});
