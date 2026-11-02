import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ApiClient } from "../contract";
import { round2 } from "@/lib/domain/pharmacy";
import type { AuditEntry, Page, Product, ProductInput } from "../types";

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
const day = (t: number) => new Date(t).toLocaleDateString("en-CA");
const query = (extra: Record<string, unknown> = {}) => ({ from: day(Date.now() - 30 * 86_400_000), to: day(Date.now() + 86_400_000), ...extra });
const useToken = (token: string) => sessionStorage.setItem("bh.session", JSON.stringify({ token }));

let adminToken = "";
let encargadoToken = "";
const asAdmin = () => useToken(adminToken);
const asEncargado = () => useToken(encargadoToken);
const audit = async (extra: Record<string, unknown> = {}): Promise<Page<AuditEntry>> => {
  asAdmin();
  return run(api.listAudit({ ...query(), pageSize: 100, ...extra }));
};

describe("mock: auditoría", () => {
  beforeAll(async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", memory());
    vi.stubGlobal("sessionStorage", memory());
    const { createMockClient } = await import("./client");
    api = createMockClient();
    adminToken = (await run(api.loginOwner("dueno@botica-huanuco.pe", "Clave2026!"))).token;
    encargadoToken = (await run(api.login("u2", "1111"))).token;
  });
  afterAll(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("solo el administrador puede leer la auditoría", async () => {
    asEncargado();
    expect((await rejects(api.listAudit(query()))).code).toBe("SIN_PERMISO");
  });

  it("valida el rango de fechas", async () => {
    asAdmin();
    expect((await rejects(api.listAudit({ from: "2026-10-28", to: "2026-10-27" }))).code).toBe("DATOS_INVALIDOS");
  });

  it("deja historial de ejemplo y registra los ingresos", async () => {
    const all = await audit();
    expect(all.total).toBeGreaterThan(50);
    const logins = (await audit({ action: "sesion_iniciada" })).items;
    expect(logins.some((e) => e.userId === "u1" && e.after?.via === "correo")).toBe(true);
    expect(logins.some((e) => e.userId === "u2" && e.after?.via === "pin")).toBe(true);
  });

  it("un ingreso fallido queda registrado sin guardar el PIN ni el correo completo", async () => {
    await rejects(api.login("u3", "0000"));
    await rejects(api.loginOwner("alguien@correo.pe", "ClaveMala1!"));
    const failed = (await audit({ action: "sesion_fallida" })).items;
    const pin = failed.find((e) => e.userId === "u3" && e.entityLabel === "Q.F. Lucía Ramos");
    expect(pin).toBeTruthy();
    const mail = failed.find((e) => e.after?.email);
    expect(mail?.after?.email).toBe("a***@correo.pe");
    expect(mail?.userId).toBeNull();
    const text = JSON.stringify(failed);
    expect(text).not.toContain("0000");
    expect(text).not.toContain("ClaveMala1!");
    expect(text).not.toContain("alguien@");
  });

  it("una venta queda registrada con su total y sin datos del cliente", async () => {
    asEncargado();
    const sale = await run(
      api.createSale({ branchId: "principal", items: [{ productId: 1, presentation: "unidad", qty: 1 }], payment: { method: "efectivo", received: 500 }, document: { type: "boleta", customerDocId: "40125588", customerName: "Rosa Huamán" } }),
    );
    const e = (await audit({ action: "venta_registrada" })).items.find((x) => x.entityId === sale.id);
    expect(e).toMatchObject({ userId: "u2", role: "encargado", branchId: "principal", entity: "venta", entityLabel: sale.number, before: null });
    expect(e?.after).toMatchObject({ total: sale.total, method: "efectivo", document: "boleta" });
    const text = JSON.stringify(e);
    expect(text).not.toContain("40125588");
    expect(text).not.toContain("Rosa");
  });

  it("una venta rechazada no deja registro", async () => {
    const before = (await audit({ action: "venta_registrada" })).total;
    asEncargado();
    expect((await rejects(api.createSale({ branchId: "principal", items: [{ productId: 1, presentation: "unidad", qty: 999_999 }], payment: { method: "efectivo", received: 1e9 }, document: { type: "boleta" } }))).code).toBe("STOCK_INSUFICIENTE");
    expect((await audit({ action: "venta_registrada" })).total).toBe(before);
  });

  it("anular un comprobante y dar de baja un lote quedan con su motivo", async () => {
    asEncargado();
    const sale = await run(api.createSale({ branchId: "principal", items: [{ productId: 1, presentation: "unidad", qty: 1 }], payment: { method: "efectivo", received: 500 }, document: { type: "boleta" } }));
    await run(api.voidVoucher(sale.id, { reason: "Se cobró dos veces", returnStock: true }));
    const lot = (await run(api.listLots("principal")))[0]!;
    const qtyBefore = lot.qty; // el mock devuelve el objeto vivo: se anota antes de la baja
    await run(api.writeOffLot(lot.id, { type: "merma", units: 1, note: "Frasco roto" }));
    const voided = (await audit({ action: "comprobante_anulado" })).items.find((x) => x.entityId === sale.id);
    expect(voided?.after).toMatchObject({ status: "anulado", reason: "Se cobró dos veces", returnStock: true });
    expect(voided?.before).toEqual({ status: "aceptado" });
    const off = (await audit({ action: "baja_registrada" })).items.find((x) => x.entityId === String(lot.id));
    expect(off?.before).toEqual({ qty: qtyBefore });
    expect(off?.after).toMatchObject({ qty: qtyBefore - 1, type: "merma", units: 1, reason: "Frasco roto" });
  });

  describe("precios y costos", () => {
    const input = (p: Product): ProductInput => {
      const { id: _id, ...rest } = p;
      return rest;
    };
    let product: Product;
    beforeAll(async () => {
      asAdmin();
      product = (await run(api.listProducts()))[0]!;
    });

    it("un cambio de precio y uno de costo se registran aparte, con antes y después", async () => {
      asAdmin();
      const next = { ...input(product), priceUnit: round2(product.priceUnit + 0.1), cost: round2(product.cost + 0.01) };
      await run(api.updateProduct(product.id, next));
      const items = (await audit({ entity: "producto" })).items.filter((e) => e.entityId === String(product.id));
      const price = items.find((e) => e.action === "precio_cambiado");
      const cost = items.find((e) => e.action === "costo_cambiado");
      expect(price?.before).toEqual({ priceUnit: product.priceUnit });
      expect(price?.after).toEqual({ priceUnit: next.priceUnit });
      expect(cost?.before).toEqual({ cost: product.cost });
      expect(cost?.after).toEqual({ cost: next.cost });
      expect(items.some((e) => e.action === "producto_editado")).toBe(false);
    });

    it("guardar sin cambiar nada no deja registro", async () => {
      asAdmin();
      const current = (await run(api.listProducts())).find((p) => p.id === product.id)!;
      const total = (await audit()).total;
      await run(api.updateProduct(current.id, input(current)));
      expect((await audit()).total).toBe(total);
    });
  });

  it("los cambios de cuentas y ajustes dejan el antes y el después, sin PIN", async () => {
    asAdmin();
    await run(api.updateAccount("u3", { name: "Q.F. Lucía Ramos", role: "encargado", branchId: "sucursal", pin: "7391", active: true }));
    const e = (await audit({ action: "cuenta_editada" })).items.find((x) => x.entityId === "u3" && x.after?.pinChanged === true);
    expect(e?.after).toEqual({ pinChanged: true });
    expect(JSON.stringify(e)).not.toContain("7391");

    const cfg = await run(api.getPublicConfig());
    await run(api.updateRules({ expiry: { red: cfg.expiry.red + 5, yellow: cfg.expiry.yellow }, purchasing: cfg.purchasing, attendance: cfg.attendance }));
    const rules = (await audit({ action: "reglas_editadas" })).items[0]!;
    expect(rules.before).toEqual({ "expiry.red": cfg.expiry.red });
    expect(rules.after).toEqual({ "expiry.red": cfg.expiry.red + 5 });
  });

  it("la caja queda registrada al abrir y cerrar", async () => {
    asAdmin();
    await run(api.closeCash("sucursal", { counted: 0, denominations: {}, note: "Cierre de prueba, diferencia explicada" }));
    await run(api.openCash("sucursal", 120));
    const items = (await audit({ entity: "caja" })).items;
    expect(items[0]).toMatchObject({ action: "caja_abierta", entityId: "sucursal", after: { openingAmount: 120 } });
    expect(items.some((e) => e.action === "caja_cerrada" && e.entityId === "sucursal" && e.after?.counted === 0)).toBe(true);
  });

  it("pagina en el servidor: sin repetir ni saltar filas, y corrige una página fuera de rango", async () => {
    const full = await audit({ pageSize: 100 });
    const pageSize = 10;
    const pages = Math.ceil(full.total / pageSize);
    const seen: string[] = [];
    for (let page = 1; page <= pages; page++) {
      const res = await audit({ page, pageSize });
      expect(res).toMatchObject({ total: full.total, page, pageSize });
      seen.push(...res.items.map((e) => e.id));
    }
    expect(seen).toHaveLength(full.total);
    expect(new Set(seen).size).toBe(full.total);
    const ordered = full.items.map((e) => e.at);
    expect([...ordered].sort().reverse()).toEqual(ordered);
    const beyond = await audit({ page: 9999, pageSize });
    expect(beyond.page).toBe(pages);
    expect(beyond.items.length).toBeGreaterThan(0);
  });

  it("filtra por persona, acción y entidad", async () => {
    const byUser = await audit({ userId: "u2" });
    expect(byUser.total).toBeGreaterThan(0);
    expect(byUser.items.every((e) => e.userId === "u2")).toBe(true);
    const byAction = await audit({ action: "caja_cerrada" });
    expect(byAction.items.every((e) => e.action === "caja_cerrada")).toBe(true);
    const none = await audit({ userId: "u2", entity: "plan" });
    expect(none).toMatchObject({ total: 0, items: [], page: 1 });
  });

  it("leer la auditoría no deja registro", async () => {
    const total = (await audit()).total;
    await audit();
    expect((await audit()).total).toBe(total);
  });
});
