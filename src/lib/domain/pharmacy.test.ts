import { describe, expect, it } from "vitest";
import type { Lot, Product } from "@/lib/api/types";
import {
  allocateFefo, buildCartLines, cartTotals, daysUntil, documentIsValid, expiryTone, presentationsOf, quickCashAmounts, stockLabel,
} from "./pharmacy";

const NOW = new Date(2026, 9, 27, 10, 0).getTime(); // 27/10/2026

const paracetamol: Product = {
  id: 1, name: "Paracetamol", active: "Paracetamol", conc: "500 mg", form: "Tableta", lab: "Genfar", category: "Analgésicos", rx: "libre",
  unitsPerBox: 100, unitsPerBlister: 10, unitName: "tableta", priceUnit: 0.2, priceBlister: 1.8, priceBox: 15, cost: 0.08, minStock: 100,
  location: "A-1", barcode: "7751", sanitaryReg: "EN-1", coldChain: false,
};
const jarabe: Product = { ...paracetamol, id: 2, name: "Jarabe", unitsPerBox: 1, unitsPerBlister: 0, unitName: "frasco", priceUnit: 5.5, priceBlister: 0, priceBox: 0 };

const lot = (id: number, productId: number, expiresOn: string, qty: number, discount = 0): Lot => ({ id, branchId: "principal", productId, code: `L${id}`, expiresOn, qty, cost: 0.08, discount, receivedOn: null, supplier: null });

describe("fechas y semáforo", () => {
  it("cuenta días hasta el vencimiento", () => {
    expect(daysUntil("2026-10-27", NOW)).toBe(0);
    expect(daysUntil("2026-11-26", NOW)).toBe(30);
    expect(daysUntil("2026-10-20", NOW)).toBe(-7);
  });
  it("asigna el tono correcto", () => {
    expect(expiryTone(-1)).toBe("vencido");
    expect(expiryTone(30)).toBe("critico");
    expect(expiryTone(31)).toBe("por_vencer");
    expect(expiryTone(91)).toBe("vigente");
  });
});

describe("presentaciones", () => {
  it("ofrece unidad, blíster y caja cuando tienen precio", () => {
    expect(presentationsOf(paracetamol).map((p) => p.id)).toEqual(["unidad", "blister", "caja"]);
    expect(presentationsOf(jarabe).map((p) => p.label)).toEqual(["Frasco"]);
  });
  it("muestra el stock en cajas y unidades", () => {
    expect(stockLabel(paracetamol, 250)).toBe("2 cj + 50 u");
    expect(stockLabel(paracetamol, 40)).toBe("40 unid.");
    expect(stockLabel(jarabe, 3)).toBe("3 frascos");
  });
});

describe("FEFO", () => {
  const lots = [lot(1, 1, "2027-05-01", 100), lot(2, 1, "2026-12-01", 30), lot(3, 1, "2026-10-01", 500)];

  it("vende primero el lote que vence antes e ignora los vencidos", () => {
    const { alloc, missing } = allocateFefo(lots, 1, 50, NOW);
    expect(missing).toBe(0);
    expect(alloc.map((a) => [a.lotId, a.units])).toEqual([[2, 30], [1, 20]]);
  });
  it("informa lo que falta cuando no alcanza", () => {
    expect(allocateFefo(lots, 1, 200, NOW).missing).toBe(70);
  });
  it("no reutiliza unidades ya reservadas por otra línea", () => {
    const taken = new Map<number, number>();
    allocateFefo(lots, 1, 30, NOW, taken);
    expect(allocateFefo(lots, 1, 10, NOW, taken).alloc[0]?.lotId).toBe(1);
  });
});

describe("carrito", () => {
  const products = new Map([[1, paracetamol]]);
  it("calcula totales, IGV y el descuento del lote por vencer", () => {
    const lots = [lot(1, 1, "2026-11-10", 10, 0.2), lot(2, 1, "2027-06-01", 500)];
    const lines = buildCartLines([{ key: "a", productId: 1, presentation: "blister", qty: 2 }], products, lots, NOW);
    // 20 unidades: 10 con 20 % de descuento y 10 sin descuento → 10 % promedio
    expect(lines[0]?.discount).toBeCloseTo(0.1);
    const t = cartTotals(lines);
    expect(t.subtotal).toBe(3.6);
    expect(t.total).toBe(3.24);
    expect(t.taxBase + t.igv).toBeCloseTo(3.24);
  });
});

describe("comprobantes", () => {
  it("valida boleta y factura", () => {
    expect(documentIsValid("boleta", "", "", 50)).toBe(true);
    expect(documentIsValid("boleta", "", "", 800)).toBe(false);
    expect(documentIsValid("factura", "20601122334", "Salud Total SAC", 50)).toBe(true);
    expect(documentIsValid("factura", "123", "X", 50)).toBe(false);
  });
  it("sugiere montos para el vuelto", () => {
    expect(quickCashAmounts(26.9)).toEqual([27, 30, 40, 50, 100]);
  });
});
