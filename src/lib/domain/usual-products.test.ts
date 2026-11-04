import { describe, expect, it } from "vitest";
import { usualProducts, type UsualHistoryEntry } from "./usual-products";

const sale = (at: string, ...ids: number[]): UsualHistoryEntry => ({ at, items: ids.map((productId) => ({ productId })) });

describe("productos que suele llevar", () => {
  it("devuelve vacío sin historial", () => {
    expect(usualProducts([])).toEqual([]);
  });

  it("no sugiere lo comprado una sola vez (minTimes por defecto es 2)", () => {
    expect(usualProducts([sale("2026-10-01T10:00:00Z", 1, 2), sale("2026-10-05T10:00:00Z", 1)])).toEqual([
      { productId: 1, times: 2, lastAt: "2026-10-05T10:00:00Z" },
    ]);
  });

  it("respeta un minTimes distinto", () => {
    const h = [sale("2026-10-01T10:00:00Z", 1), sale("2026-10-02T10:00:00Z", 1), sale("2026-10-03T10:00:00Z", 1, 2)];
    expect(usualProducts(h, { minTimes: 3 }).map((u) => u.productId)).toEqual([1]);
    expect(usualProducts(h, { minTimes: 1 }).map((u) => u.productId)).toEqual([1, 2]);
  });

  it("cuenta una compra una sola vez aunque repita el producto o lleve varias unidades", () => {
    const h = [sale("2026-10-01T10:00:00Z", 1, 1, 1)];
    expect(usualProducts(h)).toEqual([]);
    expect(usualProducts([...h, sale("2026-10-02T10:00:00Z", 1, 1)])[0]?.times).toBe(2);
  });

  it("ordena por veces compradas, de más a menos", () => {
    const h = [sale("2026-10-01T10:00:00Z", 1, 2), sale("2026-10-02T10:00:00Z", 1, 2), sale("2026-10-03T10:00:00Z", 2)];
    expect(usualProducts(h).map((u) => u.productId)).toEqual([2, 1]);
  });

  it("a igual cantidad, primero el comprado más recientemente", () => {
    const h = [sale("2026-10-01T10:00:00Z", 1, 2), sale("2026-10-09T10:00:00Z", 2), sale("2026-10-05T10:00:00Z", 1)];
    expect(usualProducts(h).map((u) => u.productId)).toEqual([2, 1]);
  });

  it("a igual veces y fecha, desempata por id", () => {
    const h = [sale("2026-10-01T10:00:00Z", 9, 3), sale("2026-10-01T10:00:00Z", 9, 3)];
    expect(usualProducts(h).map((u) => u.productId)).toEqual([3, 9]);
  });

  it("aplica el límite (4 por defecto)", () => {
    const h = [1, 2, 3, 4, 5].flatMap((id) => [sale("2026-10-01T10:00:00Z", id), sale("2026-10-02T10:00:00Z", id)]);
    expect(usualProducts(h)).toHaveLength(4);
    expect(usualProducts(h, { limit: 2 })).toHaveLength(2);
    expect(usualProducts(h, { limit: 0 })).toEqual([]);
  });

  it("toma lastAt de la compra más reciente aunque el historial llegue desordenado", () => {
    const h = [sale("2026-10-09T10:00:00Z", 1), sale("2026-10-01T10:00:00Z", 1)];
    expect(usualProducts(h)[0]?.lastAt).toBe("2026-10-09T10:00:00Z");
  });

  it("devuelve objetos planos y no modifica el historial", () => {
    const h = [sale("2026-10-01T10:00:00Z", 1), sale("2026-10-02T10:00:00Z", 1)];
    const copy = JSON.parse(JSON.stringify(h));
    const out = usualProducts(h);
    expect(h).toEqual(copy);
    expect(Object.getPrototypeOf(out[0])).toBe(Object.prototype);
    expect(Object.keys(out[0] ?? {}).sort()).toEqual(["lastAt", "productId", "times"]);
  });
});
