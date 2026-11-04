import { describe, expect, it } from "vitest";
import type { Product } from "@/lib/api/types";
import { minFor } from "./inventory";
import { copyMinStock } from "./min-stock";

const base: Product = {
  id: 1, name: "Paracetamol", active: "Paracetamol", conc: "500 mg", form: "Tableta", lab: "Genfar", category: "Analgésicos", rx: "libre",
  unitsPerBox: 100, unitsPerBlister: 10, unitName: "tableta", priceUnit: 0.2, priceBlister: 1.8, priceBox: 15, cost: 0.08, minStock: 100,
  minStockByBranch: { principal: 80, sucursal: 50 }, location: "A-1", barcode: "7751000007919", sanitaryReg: "EN-1", coldChain: false,
};
const noMap: Product = { ...base, id: 2, minStock: 10, minStockByBranch: undefined };
const noSource: Product = { ...base, id: 3, minStock: 30, minStockByBranch: { sucursal: 7 } };

describe("copyMinStock", () => {
  it("copia el mínimo propio del local de origen", () => {
    const [p] = copyMinStock([base], "principal", "nuevo");
    expect(p!.minStockByBranch?.nuevo).toBe(80);
  });

  it("si el origen no tiene mínimo propio, usa el general del producto", () => {
    const [p] = copyMinStock([noSource], "principal", "nuevo");
    expect(p!.minStockByBranch?.nuevo).toBe(30);
  });

  it("crea el mapa cuando el producto no lo tenía", () => {
    const [p] = copyMinStock([noMap], "principal", "nuevo");
    expect(p!.minStockByBranch).toEqual({ nuevo: 10 });
  });

  it("conserva los mínimos de los demás locales", () => {
    const [p] = copyMinStock([base], "principal", "nuevo");
    expect(p!.minStockByBranch).toEqual({ principal: 80, sucursal: 50, nuevo: 80 });
  });

  it("no modifica los productos recibidos", () => {
    const input = [base, noMap];
    const snapshot = JSON.parse(JSON.stringify(input));
    const out = copyMinStock(input, "principal", "nuevo");
    expect(input).toEqual(snapshot);
    expect(out[0]).not.toBe(base);
    expect(out[0]!.minStockByBranch).not.toBe(base.minStockByBranch);
  });

  it("si origen y destino son iguales, devuelve los productos sin cambios", () => {
    const input = [base];
    expect(copyMinStock(input, "principal", "principal")).toBe(input);
  });

  it("si el origen está vacío, devuelve los productos sin cambios", () => {
    const input = [base];
    expect(copyMinStock(input, "", "nuevo")).toBe(input);
  });

  it("deja la lista vacía como está", () => {
    expect(copyMinStock([], "principal", "nuevo")).toEqual([]);
  });

  it("minFor lee el valor copiado en el local nuevo", () => {
    const out = copyMinStock([base, noMap], "principal", "nuevo");
    expect(out.map((p) => minFor(p, "nuevo"))).toEqual([80, 10]);
  });
});
