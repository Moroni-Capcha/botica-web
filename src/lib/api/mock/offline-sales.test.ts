import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ApiClient } from "../contract";
import type { SaleSyncItem } from "../types";

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
const rejects = async (p: Promise<unknown>) => {
  try {
    await run(p);
  } catch (e) {
    return e as { code: string; status: number; message: string };
  }
  throw new Error("Debía fallar");
};

describe("mock: ventas sin conexión (clientSaleId y POST /sales/sync)", () => {
  beforeAll(async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", memory());
    vi.stubGlobal("sessionStorage", memory());
    const { createMockClient } = await import("./client");
    api = createMockClient();
    const session = await run(api.login("u2", "1111")); // Q.F. de Principal
    sessionStorage.setItem("bh.session", JSON.stringify({ token: session.token }));
  });
  afterAll(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const req = (clientSaleId: string, qty = 1, productId = 1): SaleSyncItem => ({
    clientSaleId,
    branchId: "principal",
    items: [{ productId, presentation: "unidad", qty }],
    payment: { method: "efectivo", received: 500 },
    document: { type: "boleta" },
  });
  const stockOf = async (productId: number) => (await run(api.listLots("principal"))).filter((l) => l.productId === productId).reduce((s, l) => s + l.qty, 0);

  it("repetir la clave devuelve la venta original y no descuenta dos veces", async () => {
    const before = await stockOf(1);
    const first = await run(api.createSale(req("clave-0001-aaaa", 2)));
    const again = await run(api.createSale(req("clave-0001-aaaa", 2)));
    expect(again.id).toBe(first.id);
    expect(again.number).toBe(first.number);
    expect(first.clientSaleId).toBe("clave-0001-aaaa");
    expect(await stockOf(1)).toBe(before - 2);
  });

  it("la misma clave con otros datos es CLAVE_REPETIDA (409)", async () => {
    await run(api.createSale(req("clave-0002-bbbb", 1)));
    const err = await rejects(api.createSale(req("clave-0002-bbbb", 3)));
    expect(err).toMatchObject({ code: "CLAVE_REPETIDA", status: 409 });
  });

  it("rechaza una clave mal formada o una hora de venta en el futuro", async () => {
    expect((await rejects(api.createSale(req("corta")))).code).toBe("DATOS_INVALIDOS");
    const future = { ...req("clave-0003-cccc"), soldAt: new Date(Date.now() + 3_600_000).toISOString() };
    expect((await rejects(api.createSale(future))).code).toBe("DATOS_INVALIDOS");
  });

  it("una venta sin conexión conserva la hora real del cobro y el ticket provisional", async () => {
    const soldAt = new Date(Date.now() - 2 * 3_600_000).toISOString();
    const sale = await run(api.createSale({ ...req("clave-0004-dddd"), soldAt, offlineTicket: "OFF-0012" }));
    expect(sale.createdAt).toBe(soldAt);
    expect(sale.offlineTicket).toBe("OFF-0012");
    expect(sale.number).toMatch(/^B\d+-\d{6}$/); // el número oficial lo asigna el servidor
  });

  it("sincroniza un lote en orden: crea, repite y reporta cada fallo sin frenar las demás", async () => {
    const before = await stockOf(1);
    const batch: SaleSyncItem[] = [
      req("lote-0001-aaaa", 1),
      req("lote-0002-bbbb", 999_999), // sin stock
      req("clave-0001-aaaa", 2), // ya registrada antes
      req("lote-0003-cccc", 1),
    ];
    const { results } = await run(api.syncSales({ sales: batch }));
    expect(results.map((r) => [r.clientSaleId, r.status])).toEqual([
      ["lote-0001-aaaa", "created"],
      ["lote-0002-bbbb", "failed"],
      ["clave-0001-aaaa", "replayed"],
      ["lote-0003-cccc", "created"],
    ]);
    const failed = results[1]!;
    expect(failed.status === "failed" && failed.error.code).toBe("STOCK_INSUFICIENTE");
    const [a, , replay, c] = results;
    expect(a!.status !== "failed" && c!.status !== "failed" && Number(a!.sale.number.slice(-6)) < Number(c!.sale.number.slice(-6))).toBe(true);
    expect(replay!.status !== "failed" && replay!.sale.clientSaleId).toBe("clave-0001-aaaa");
    expect(await stockOf(1)).toBe(before - 2);

    /* Reenviar el mismo lote entero no duplica nada */
    const second = await run(api.syncSales({ sales: [batch[0]!, batch[3]!] }));
    expect(second.results.map((r) => r.status)).toEqual(["replayed", "replayed"]);
    expect(await stockOf(1)).toBe(before - 2);
  });

  it("rechaza un lote vacío o demasiado grande", async () => {
    expect((await rejects(api.syncSales({ sales: [] }))).code).toBe("DATOS_INVALIDOS");
    const big = Array.from({ length: 51 }, (_, i) => req(`masivo-${String(i).padStart(4, "0")}`));
    expect((await rejects(api.syncSales({ sales: big }))).code).toBe("DATOS_INVALIDOS");
  });
});
