import { describe, expect, it } from "vitest";
import { buildSearchIndex, compareText, matchesSearch } from "./product-search";

const products = [
  { id: 1, name: "Paracetamol", active: "Paracetamol", lab: "Genfar", barcode: "7751000007919", conc: "500 mg" },
  { id: 2, name: "Panadol Forte", active: "Paracetamol", lab: "GSK", barcode: "7751000015838", conc: "1 g" },
  { id: 3, name: "Ibuprofeno", active: "Ibuprofeno", lab: "Medifarma", barcode: "7751000023757", conc: "400 mg" },
];
const index = buildSearchIndex(products);
const ids = (q: string) => products.filter((p) => matchesSearch(index, p.id, q)).map((p) => p.id);

describe("búsqueda de productos", () => {
  it("vacío devuelve todos", () => {
    expect(ids("")).toEqual([1, 2, 3]);
  });
  it("busca por nombre, principio activo, laboratorio, código y concentración", () => {
    expect(ids("panadol")).toEqual([2]);
    expect(ids("paracetamol")).toEqual([1, 2]);
    expect(ids("medifarma")).toEqual([3]);
    expect(ids("7751000015838")).toEqual([2]);
    expect(ids("400 mg")).toEqual([3]);
  });
  it("no mezcla el final de un campo con el inicio del siguiente", () => {
    // "Paracetamol" termina en "l" y el siguiente campo empieza con "P": "lp" no debe encontrar nada
    expect(ids("lp")).toEqual([]);
  });
  it("un producto fuera del índice no coincide con nada, salvo la búsqueda vacía", () => {
    expect(matchesSearch(index, 99, "para")).toBe(false);
    expect(matchesSearch(index, 99, "")).toBe(true);
  });
});

describe("compareText", () => {
  it("ordena con reglas del español (la ñ después de la n, sin importar tildes ni mayúsculas)", () => {
    expect(["Ñandú", "Zinc", "nube", "Álamo", "abeja"].sort(compareText)).toEqual(["abeja", "Álamo", "nube", "Ñandú", "Zinc"]);
  });
});
