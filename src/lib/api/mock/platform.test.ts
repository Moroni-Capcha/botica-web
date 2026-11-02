import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ApiClient, PlatformClient } from "../contract";
import { ALL_MODULES } from "@/lib/domain/account";

/** Almacenamiento en memoria para que el mock funcione sin navegador. */
const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};

let api: ApiClient;
let platform: PlatformClient;
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
const reason = "Pidió más tiempo para decidir";
const recent = () => ({ from: new Date(Date.now() - 30 * 86_400_000).toLocaleDateString("en-CA"), to: new Date(Date.now() + 86_400_000).toLocaleDateString("en-CA") });
const setBotica = (token: string) => sessionStorage.setItem("bh.session", JSON.stringify({ token }));
const setOperator = (token: string) => sessionStorage.setItem("bh.platform.session", JSON.stringify({ token }));
let operatorToken = "";
let boticaToken = "";

describe("mock: consola interna de Digi!HME", () => {
  beforeAll(async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", memory());
    vi.stubGlobal("sessionStorage", memory());
    const { createMockClient } = await import("./client");
    const { createMockPlatformClient } = await import("./platform");
    api = createMockClient();
    platform = createMockPlatformClient();
    operatorToken = (await run(platform.login("SOPORTE@digi-hme.pe", "Consola2026!"))).token;
    boticaToken = (await run(api.loginOwner("dueno@botica-huanuco.pe", "Clave2026!"))).token;
    setOperator(operatorToken);
    setBotica(boticaToken);
  });
  afterAll(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("el ingreso del operador valida correo y contraseña", async () => {
    expect((await rejects(platform.login("soporte@digi-hme.pe", "otra-clave"))).code).toBe("CREDENCIALES_INVALIDAS");
    expect((await rejects(platform.login("dueno@botica-huanuco.pe", "Clave2026!"))).code).toBe("CREDENCIALES_INVALIDAS");
    const s = await run(platform.login("soporte@digi-hme.pe", "Consola2026!"));
    expect(s.operator.email).toBe("soporte@digi-hme.pe");
    expect(Date.parse(s.expiresAt)).toBeGreaterThan(Date.now());
  });

  it("una sesión de botica nunca sirve en la consola, ni al revés", async () => {
    setOperator(boticaToken);
    expect((await rejects(platform.listTenants())).code).toBe("NO_AUTORIZADO");
    setOperator("");
    expect((await rejects(platform.listTenants())).status).toBe(401);
    setBotica(operatorToken);
    expect((await rejects(api.me())).code).toBe("NO_AUTORIZADO");
    setOperator(operatorToken);
    setBotica(boticaToken);
    expect((await run(api.me())).role).toBe("admin");
  });

  it("lista las boticas con su plan, estado y conteos", async () => {
    const page = await run(platform.listTenants());
    const t = page.items.find((x) => x.code === "botica-huanuco")!;
    expect(t).toMatchObject({ planId: "crece", planName: "Plan Crece", maxBranches: 3, status: "active", branches: 2, users: 3 });
    expect(Date.parse(t.createdAt)).toBeLessThan(Date.now());
    expect(t.lastActivityAt).toBeTruthy();
    expect(page.counts.active).toBeGreaterThanOrEqual(1);
    expect(page.page).toBe(1);
  });

  describe("una botica nueva en prueba", () => {
    const code = "farmacia-prueba";
    beforeAll(async () => {
      await run(api.signUp({ boticaName: "Farmacia Prueba", code, ownerName: "Luis Mamani", email: "luis@prueba.pe", password: "Clave2026!", plan: "inicio" }));
    });

    it("aparece en la lista como en prueba y se busca por nombre", async () => {
      const page = await run(platform.listTenants({ q: "prueba" }));
      expect(page.items.map((t) => t.code)).toEqual([code]);
      const t = page.items[0]!;
      expect(t).toMatchObject({ status: "trial", planId: "inicio", branches: 1, users: 1 });
      expect(t.trialEndsAt).toBeTruthy();
      expect(page.counts).toMatchObject({ trial: 1, active: 0 });
      expect((await run(platform.listTenants({ q: "prueba", status: "suspended" }))).items).toEqual([]);
    });

    it("extiende la prueba desde su fecha de fin", async () => {
      const before = (await run(platform.listTenants({ q: "prueba" }))).items[0]!;
      const t = await run(platform.updateTenant(code, { action: "extend_trial", days: 7, reason }));
      const end = Date.parse(`${before.trialEndsAt}T00:00:00Z`) + 7 * 86_400_000;
      expect(t.trialEndsAt).toBe(new Date(end).toISOString().slice(0, 10));
      expect(t.status).toBe("trial");
    });

    it("exige un motivo y valida los días", async () => {
      expect((await rejects(platform.updateTenant(code, { action: "suspend", reason: "no" }))).code).toBe("DATOS_INVALIDOS");
      expect((await rejects(platform.updateTenant(code, { action: "extend_trial", days: 500, reason }))).code).toBe("DATOS_INVALIDOS");
      expect((await rejects(platform.updateTenant("no-existe", { action: "suspend", reason }))).code).toBe("BOTICA_NO_ENCONTRADA");
    });

    it("suspender la deja en solo lectura y reactivar la devuelve; ambas quedan en su auditoría con el motivo", async () => {
      const suspended = await run(platform.updateTenant(code, { action: "suspend", reason: "Pago pendiente de la factura de octubre" }));
      expect(suspended.status).toBe("suspended");
      expect((await rejects(platform.updateTenant(code, { action: "suspend", reason }))).code).toBe("ESTADO_INVALIDO");

      localStorage.setItem("bh.botica", code);
      const owner = await run(api.loginOwner("luis@prueba.pe", "Clave2026!"));
      setBotica(owner.token);
      expect((await run(api.getAccount())).status).toBe("suspended");
      expect((await rejects(api.createSupplier({ name: "Droguería X", ruc: "20512345671", contact: "A", phone: "1", visitDays: "Lun", active: true }))).code).toBe("CUENTA_SUSPENDIDA");

      const back = await run(platform.updateTenant(code, { action: "reactivate", reason: "Pagó la factura" }));
      expect(back.status).toBe("trial");
      expect((await run(api.getAccount())).status).toBe("trial");

      const log = await run(api.listAudit({ ...recent(), action: "cuenta_suspendida" }));
      expect(log.items[0]).toMatchObject({ userId: null, userName: "Digi!HME", role: null, entity: "plan" });
      expect(log.items[0]!.after).toMatchObject({ status: "suspended", reason: "Pago pendiente de la factura de octubre" });
      const reactivated = await run(api.listAudit({ ...recent(), action: "cuenta_reactivada" }));
      expect(reactivated.items).toHaveLength(1);

      localStorage.removeItem("bh.botica");
      setBotica(boticaToken);
    });
  });

  describe("cambio de plan", () => {
    it("no baja a un plan donde no caben los locales activos", async () => {
      const e = await rejects(platform.updateTenant("botica-huanuco", { action: "change_plan", planId: "inicio", reason }));
      expect(e).toMatchObject({ code: "LIMITE_DEL_PLAN", status: 409 });
    });

    it("sube de plan: cambia el límite y los módulos que ve la botica", async () => {
      const t = await run(platform.updateTenant("botica-huanuco", { action: "change_plan", planId: "cadena", reason }));
      expect(t).toMatchObject({ planName: "Plan Cadena", maxBranches: 10, planId: "cadena" });
      expect((await run(api.getAccount())).modules).toEqual([...ALL_MODULES]);
      expect((await run(api.getPublicConfig())).plan).toEqual({ name: "Plan Cadena", maxBranches: 10 });
      const log = await run(api.listAudit({ ...recent(), action: "plan_cambiado" }));
      expect(log.items[0]!.before).toEqual({ plan: "Plan Crece", maxBranches: 3 });
      expect(log.items[0]!.after).toMatchObject({ plan: "Plan Cadena", maxBranches: 10, reason });
    });
  });

  it("pagina la lista de boticas", async () => {
    const all = await run(platform.listTenants({ pageSize: 100 }));
    expect(all.total).toBeGreaterThanOrEqual(2);
    const first = await run(platform.listTenants({ page: 1, pageSize: 1 }));
    const second = await run(platform.listTenants({ page: 2, pageSize: 1 }));
    expect(first).toMatchObject({ page: 1, pageSize: 1, total: all.total });
    expect(first.items[0]!.code).not.toBe(second.items[0]!.code);
    expect(first.counts).toEqual(all.counts);
  });
});
