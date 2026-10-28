import { describe, expect, it } from "vitest";
import type { Lot, Product } from "@/lib/api/types";
import { dailyRates } from "./expiry";
import { cellToIsoDate, parseImportSheet } from "./product-import";
import { checkReceiptLine, isValidSupplierDocument, lastSupplier, receiptTotals, suggestOrder, type ReceiptLineDraft } from "./purchasing";

const NOW = new Date(2026, 9, 27, 10, 0).getTime(); // 27/10/2026

const amox: Product = {
  id: 7, name: "Amoxicilina", active: "Amoxicilina", conc: "500 mg", form: "Cápsula", lab: "Genfar", category: "Antibióticos", rx: "receta",
  unitsPerBox: 100, unitsPerBlister: 10, unitName: "cápsula", priceUnit: 0.6, priceBlister: 5, priceBox: 45, cost: 0.25, minStock: 100,
  minStockByBranch: { sucursal: 40 }, location: "B-2", barcode: "7751000000007", sanitaryReg: "EN-2", coldChain: false,
};
const lot = (id: number, branchId: string, expiresOn: string, qty: number, receivedOn: string | null = null, supplier: string | null = null): Lot => ({
  id, branchId, productId: 7, code: `L${id}`, expiresOn, qty, cost: 0.25, discount: 0, receivedOn, supplier,
});

describe("pedido sugerido", () => {
  // 10 u/día en la principal, nada en la sucursal
  const rates = dailyRates([{ branchId: "principal", productId: 7, units: 300, days: 30 }]);
  const lots = [lot(1, "principal", "2027-06-01", 120, "2026-09-01", "Droguería A"), lot(2, "principal", "2026-10-01", 500), lot(3, "sucursal", "2027-06-01", 60, "2026-10-20", "Droguería B")];

  it("cubre los días pedidos más el mínimo, en cajas completas, sin contar lo vencido", () => {
    const [s] = suggestOrder([amox], lots, ["principal"], rates, NOW, 15);
    // necesita 10 × 15 + 100 = 250; tiene 120 vigentes → faltan 130 → 2 cajas de 100
    expect(s!.stock).toBe(120);
    expect(s!.packs).toBe(2);
    expect(s!.units).toBe(200);
    expect(s!.cost).toBe(50);
    expect(s!.cover).toBe(12);
    expect(s!.supplier).toBe("Droguería A");
  });

  it("no sugiere si el local tiene más que el mínimo y no vende", () => {
    expect(suggestOrder([amox], lots, ["sucursal"], rates, NOW, 15)).toEqual([]);
  });

  it("toma el proveedor del local y si no hay, el de otro local", () => {
    expect(lastSupplier(lots, 7, "sucursal")).toBe("Droguería B");
    expect(lastSupplier([lots[0]!], 7, "sucursal")).toBe("Droguería A");
  });
});

describe("ingreso de mercadería", () => {
  const line = (over: Partial<ReceiptLineDraft> = {}): ReceiptLineDraft => ({ key: "a", productId: 7, lotCode: "ab123", expiresOn: "2028-01-31", qty: 2, mode: "caja", unitCost: 0.25, ...over });
  const ctx = (lines: ReceiptLineDraft[], branchLots: Lot[] = []) => ({ now: NOW, minShelfDays: 180, branchLots, lines });

  it("convierte cajas a unidades y calcula el subtotal", () => {
    const l = line();
    const c = checkReceiptLine(l, amox, ctx([l]));
    expect(c).toEqual({ units: 200, subtotal: 50, error: null, warning: null });
    expect(receiptTotals([c, c])).toEqual({ subtotal: 100, igv: 18, total: 118, units: 400 });
  });

  it("rechaza lotes vencidos, sin datos o repetidos", () => {
    expect(checkReceiptLine(line({ expiresOn: "2026-10-27" }), amox, ctx([])).error).toBeTruthy();
    expect(checkReceiptLine(line({ lotCode: " " }), amox, ctx([])).error).toBeTruthy();
    expect(checkReceiptLine(line({ qty: 0 }), amox, ctx([])).error).toBeTruthy();
    expect(checkReceiptLine(line(), undefined, ctx([])).error).toBe("Elige el producto");
    const a = line();
    const b = line({ key: "b", lotCode: "AB123" });
    expect(checkReceiptLine(a, amox, ctx([a, b])).error).toBe("Este lote está repetido en el ingreso");
  });

  it("no deja cambiar el vencimiento de un lote que ya existe, pero sí sumarle", () => {
    const existing = { ...lot(9, "principal", "2027-12-31", 50), code: "AB123" };
    expect(checkReceiptLine(line(), amox, ctx([], [existing])).error).toBe("El lote AB123 ya existe con vencimiento 31/12/2027");
    expect(checkReceiptLine(line({ expiresOn: "2027-12-31" }), amox, ctx([], [existing])).warning).toContain("Se suma al lote");
  });

  it("advierte vencimiento corto y costo más alto", () => {
    const w = checkReceiptLine(line({ expiresOn: "2027-01-15", unitCost: 0.32 }), amox, ctx([])).warning!;
    expect(w).toContain("Vencimiento corto: 80 días");
    expect(w).toContain("Costo 28 % mayor");
  });

  it("valida el documento del proveedor", () => {
    expect(isValidSupplierDocument("F001-00012345")).toBe(true);
    expect(isValidSupplierDocument("e001-12")).toBe(true);
    expect(isValidSupplierDocument("12345")).toBe(false);
  });
});

describe("importar desde Excel", () => {
  it("convierte fechas de celdas", () => {
    expect(cellToIsoDate(46477)).toBe("2027-03-31");
    expect(cellToIsoDate("31/03/2027")).toBe("2027-03-31");
    expect(cellToIsoDate("5-4-28")).toBe("2028-04-05");
    expect(cellToIsoDate("08/2027")).toBe("2027-08-31");
    expect(cellToIsoDate("31/02/2027")).toBe("");
  });

  it("encuentra el encabezado, reconoce productos del catálogo y valida cada fila", () => {
    const sheet = [
      ["Plantilla de productos"],
      [],
      ["Código de barras", "Nombre comercial", "Concentración", "Laboratorio", "Tipo", "Unidades por caja", "Unidades por blíster", "Precio unidad", "Costo unidad sin IGV", "Lote", "Vencimiento (dd/mm/aaaa)", "Cantidad (unidades)"],
      ["7751000000007", "Amoxicilina", "500 mg", "Genfar", "Antibióticos", 100, 10, 0.6, 0.25, "gx-123", "31/03/2028", 300],
      [null, "Ibuprofeno", "400 mg", "Medifarma", "Analgésicos", 100, 10, "0,30", "0,12", null, null, null],
      [null, "Jarabe X", "120 ml", "Lab Y", "Infantil", 1, 0, 8.5, 3, "J1", "01/01/2020", 10],
      ["Total"],
    ];
    const { rows, fatal } = parseImportSheet(sheet, [amox], NOW);
    expect(fatal).toBeNull();
    expect(rows).toHaveLength(3);
    expect(rows[0]!.matchId).toBe(7);
    expect(rows[0]!.lot).toEqual({ lotCode: "GX-123", expiresOn: "2028-03-31", units: 300, unitCost: 0.25 });
    expect(rows[0]!.errors).toEqual([]);
    expect(rows[0]!.product.rx).toBe("receta"); // se conserva del catálogo
    expect(rows[1]!.matchId).toBeNull();
    expect(rows[1]!.product.priceUnit).toBe(0.3);
    expect(rows[1]!.lot).toBeNull();
    expect(rows[1]!.warnings[0]).toContain("Producto nuevo");
    expect(rows[2]!.errors).toContain("El lote ya está vencido");
    expect(rows[2]!.line).toBe(6);
  });

  it("avisa si el archivo no tiene la columna del nombre", () => {
    expect(parseImportSheet([["a", "b"]], [], NOW).fatal).toContain("Nombre comercial");
  });
});
