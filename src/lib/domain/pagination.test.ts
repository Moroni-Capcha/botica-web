import { describe, expect, it } from "vitest";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, normalizePage, pageBounds, pageCount, pageWindow, paginate } from "./pagination";

describe("paginación", () => {
  it("usa los valores por defecto y limita el tamaño", () => {
    expect(normalizePage()).toEqual({ page: 1, pageSize: DEFAULT_PAGE_SIZE });
    expect(normalizePage({ page: 0, pageSize: 0 })).toEqual({ page: 1, pageSize: DEFAULT_PAGE_SIZE });
    expect(normalizePage({ page: -3, pageSize: Number.NaN })).toEqual({ page: 1, pageSize: DEFAULT_PAGE_SIZE });
    expect(normalizePage({ page: 2.9, pageSize: 10.7 })).toEqual({ page: 2, pageSize: 10 });
    expect(normalizePage({ page: 1, pageSize: 5000 }).pageSize).toBe(MAX_PAGE_SIZE);
  });

  it("cuenta las páginas, y una lista vacía tiene una", () => {
    expect(pageCount(0, 25)).toBe(1);
    expect(pageCount(25, 25)).toBe(1);
    expect(pageCount(26, 25)).toBe(2);
    expect(pageCount(187, 25)).toBe(8);
  });

  const rows = Array.from({ length: 53 }, (_, i) => i + 1);

  it("recorta en orden y sin repetir filas entre páginas", () => {
    const p1 = paginate(rows, { page: 1, pageSize: 20 });
    const p3 = paginate(rows, { page: 3, pageSize: 20 });
    expect(p1).toMatchObject({ total: 53, page: 1, pageSize: 20 });
    expect(p1.items[0]).toBe(1);
    expect(p3.items).toEqual([41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53]);
    const all = [1, 2, 3].flatMap((page) => paginate(rows, { page, pageSize: 20 }).items);
    expect(all).toEqual(rows);
  });

  it("corrige una página fuera de rango a la última", () => {
    const r = paginate(rows, { page: 99, pageSize: 20 });
    expect(r.page).toBe(3);
    expect(r.items).toHaveLength(13);
    expect(paginate([], { page: 4 })).toEqual({ items: [], total: 0, page: 1, pageSize: DEFAULT_PAGE_SIZE });
  });

  it("dice qué filas se están mostrando", () => {
    expect(pageBounds(1, 25, 187)).toEqual({ first: 1, last: 25 });
    expect(pageBounds(8, 25, 187)).toEqual({ first: 176, last: 187 });
    expect(pageBounds(1, 25, 0)).toEqual({ first: 0, last: 0 });
  });

  it("arma los números de página con huecos resumidos", () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(1, 4)).toEqual([1, 2, 3, 4]);
    expect(pageWindow(1, 10)).toEqual([1, 2, "…", 10]);
    expect(pageWindow(5, 10)).toEqual([1, "…", 4, 5, 6, "…", 10]);
    expect(pageWindow(3, 10)).toEqual([1, 2, 3, 4, "…", 10]);
    expect(pageWindow(10, 10)).toEqual([1, "…", 9, 10]);
  });
});
