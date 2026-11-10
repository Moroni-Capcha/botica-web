import { describe, expect, it } from "vitest";
import { searchNav } from "./nav-search";

const items = [
  { id: "panel", label: "Panel del día", short: "Panel", group: "Día a día" },
  { id: "pos", label: "Punto de venta", short: "Vender", group: "Día a día" },
  { id: "venc", label: "Vencimientos", short: "Venc.", group: "Productos" },
  { id: "comp", label: "Comprobantes", short: "SUNAT", group: "Gestión" },
  { id: "compras", label: "Compras", short: "Compras", group: "Productos" },
];

const ids = (q: string) => searchNav(items, q).map((i) => i.id);

describe("searchNav", () => {
  it("sin texto devuelve todo en el orden del menú", () => {
    expect(ids("  ")).toEqual(["panel", "pos", "venc", "comp", "compras"]);
  });
  it("ignora tildes y mayúsculas", () => {
    expect(ids("DIA")).toEqual(["panel", "pos"]);
    expect(ids("gestion")).toEqual(["comp"]);
  });
  it("busca por nombre corto y por sección", () => {
    expect(ids("sunat")).toEqual(["comp"]);
    expect(ids("vender")).toEqual(["pos"]);
    expect(ids("productos")).toEqual(["venc", "compras"]);
  });
  it("exige todas las palabras", () => {
    expect(ids("punto venta")).toEqual(["pos"]);
    expect(ids("punto caja")).toEqual([]);
  });
  it("los que empiezan con lo escrito van primero", () => {
    expect(ids("comp")).toEqual(["comp", "compras"]);
    expect(ids("venta")).toEqual(["pos"]);
  });
});
