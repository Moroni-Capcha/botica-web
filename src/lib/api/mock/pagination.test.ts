import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ApiClient } from "../contract";
import { kardexView } from "@/lib/domain/inventory";
import { byRecentPurchase } from "@/lib/domain/customers";

/** Almacenamiento en memoria para que el mock funcione sin navegador. */
const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};

let api: ApiClient;
/** Las llamadas del mock esperan un rato simulado: con relojes falsos se adelantan al instante. */
const run = <T>(p: Promise<T>): Promise<T> => {
  p.catch(() => undefined);
  return vi.runAllTimersAsync().then(() => p);
};

describe("mock: paginación en el servidor", () => {
  beforeAll(async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", memory());
    vi.stubGlobal("sessionStorage", memory());
    const { createMockClient } = await import("./client");
    api = createMockClient();
    const session = await run(api.loginOwner("dueno@botica-huanuco.pe", "Clave2026!"));
    sessionStorage.setItem("bh.session", JSON.stringify({ token: session.token }));
  });
  afterAll(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe("kardex", () => {
    const options = { branchId: "principal", days: 90 };
    let productId = 0;
    beforeAll(async () => {
      // El producto con más movimientos del periodo
      let best = 0;
      for (const p of (await run(api.listProducts())).slice(0, 12)) {
        const n = (await run(api.getKardex(p.id, options))).entries.length;
        if (n > best) [best, productId] = [n, p.id];
      }
    });

    it("sin página responde igual que siempre: todos los movimientos y nada de paginación", async () => {
      const k = await run(api.getKardex(productId, options));
      expect(k.entries.length).toBeGreaterThan(15);
      expect(k.total).toBeUndefined();
      expect(k.summary).toBeUndefined();
      expect(k.pageClosing).toBeUndefined();
    });

    it("con página trae solo esos movimientos, el total y las cifras del periodo", async () => {
      const whole = await run(api.getKardex(productId, options));
      const p1 = await run(api.getKardex(productId, { ...options, page: 1, pageSize: 7 }));
      expect(p1).toMatchObject({ total: whole.entries.length, page: 1, pageSize: 7, closing: whole.closing, pageClosing: whole.closing });
      expect(p1.entries).toEqual(whole.entries.slice(0, 7));
      const full = kardexView(whole);
      expect(p1.summary).toEqual(full.totals);
    });

    it("las páginas juntas dan el mismo kardex y los saldos continúan de una página a la otra", async () => {
      const whole = await run(api.getKardex(productId, options));
      const pages = Math.ceil(whole.entries.length / 7);
      const lines = [];
      for (let page = 1; page <= pages; page++) {
        const k = await run(api.getKardex(productId, { ...options, page, pageSize: 7 }));
        lines.push(...kardexView(k).lines);
        if (page === pages) expect(kardexView(k).opening).toBe(kardexView(whole).opening);
      }
      expect(lines).toEqual(kardexView(whole).lines);
    });

    it("una página fuera de rango se corrige a la última", async () => {
      const whole = await run(api.getKardex(productId, options));
      const k = await run(api.getKardex(productId, { ...options, page: 999, pageSize: 7 }));
      expect(k.page).toBe(Math.ceil(whole.entries.length / 7));
      expect(k.entries.length).toBeGreaterThan(0);
    });
  });

  describe("clientes", () => {
    it("sin página, la cartera completa; con página, el mismo contenido recortado y ordenado por compra reciente", async () => {
      const all = await run(api.listCustomers());
      expect(Array.isArray(all)).toBe(true);
      const expected = [...all].sort(byRecentPurchase);
      const pageSize = 5;
      const pages = Math.ceil(all.length / pageSize);
      const seen = [];
      for (let page = 1; page <= pages; page++) {
        const res = await run(api.listCustomersPage({ page, pageSize }));
        expect(res).toMatchObject({ total: all.length, page, pageSize });
        seen.push(...res.items);
      }
      expect(seen.map((c) => c.id)).toEqual(expected.map((c) => c.id));
    });

    it("busca en el servidor por nombre, documento o celular", async () => {
      const byName = await run(api.listCustomersPage({ q: "rosa", page: 1 }));
      expect(byName.total).toBeGreaterThan(0);
      expect(byName.items.every((c) => c.name.toLowerCase().includes("rosa"))).toBe(true);
      const byDni = await run(api.listCustomersPage({ q: "40125588", page: 1 }));
      expect(byDni.items.map((c) => c.name)).toEqual(["Rosa Huamán Quispe"]);
      const none = await run(api.listCustomersPage({ q: "zzzz", page: 3 }));
      expect(none).toMatchObject({ total: 0, items: [], page: 1 });
    });
  });
});
