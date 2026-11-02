import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MonitoringReporter } from "./monitoring";

type Mon = typeof import("./monitoring");

const fake = () => {
  const calls = { exceptions: [] as { error: Error; hint: { tags?: Record<string, string>; extra?: Record<string, unknown> } | undefined }[], messages: [] as { message: string; hint: unknown }[], users: [] as unknown[], tags: {} as Record<string, string> };
  const reporter: MonitoringReporter = {
    captureException: (error, hint) => void calls.exceptions.push({ error: error as Error, hint }),
    captureMessage: (message, hint) => void calls.messages.push({ message, hint }),
    setUser: (u) => void calls.users.push(u),
    setTag: (k, v) => void (calls.tags[k] = v),
  };
  return { calls, reporter };
};

let mon: Mon;
beforeEach(async () => {
  vi.resetModules();
  mon = await import("./monitoring");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("monitoreo · apagado por defecto", () => {
  it("no hace nada sin DSN, aunque haya un reporter", () => {
    const { calls, reporter } = fake();
    mon.setMonitoringReporter(reporter);
    mon.captureException(new Error("falló"));
    mon.captureMessage("hola");
    mon.setMonitoringUser({ tenant: "botica-huanuco", userId: "u1" });
    expect(mon.isMonitoringEnabled()).toBe(false);
    expect(calls.exceptions).toHaveLength(0);
    expect(calls.messages).toHaveLength(0);
    expect(calls.users).toHaveLength(0);
  });

  it("no hace nada con DSN pero sin SDK, y no falla", () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://abc@o1.ingest.sentry.io/1");
    expect(mon.isMonitoringEnabled()).toBe(false);
    expect(() => mon.captureException(new Error("falló"))).not.toThrow();
  });

  it("un DSN vacío o en blanco cuenta como apagado", () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "   ");
    mon.setMonitoringReporter(fake().reporter);
    expect(mon.isMonitoringEnabled()).toBe(false);
  });
});

describe("monitoreo · encendido", () => {
  beforeEach(() => vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://abc@o1.ingest.sentry.io/1"));

  it("usa el reporter entregado y lo etiqueta con botica, rol y local", () => {
    const { calls, reporter } = fake();
    mon.setMonitoringReporter(reporter);
    mon.setMonitoringUser({ tenant: "botica-huanuco", role: "encargado", branchId: "principal", userId: "u2" });
    mon.captureException(new Error("falló"), { scope: "query" });
    expect(mon.isMonitoringEnabled()).toBe(true);
    expect(calls.exceptions).toHaveLength(1);
    expect(calls.exceptions[0]!.hint?.tags).toEqual({ tenant: "botica-huanuco", role: "encargado", branch: "principal" });
    expect(calls.exceptions[0]!.hint?.extra).toEqual({ scope: "query" });
    expect(calls.users).toEqual([{ id: "u2" }]);
    expect(calls.tags).toEqual({ tenant: "botica-huanuco", role: "encargado", branch: "principal" });
  });

  it("usa window.Sentry si nadie entregó un reporter", () => {
    const { calls, reporter } = fake();
    vi.stubGlobal("Sentry", reporter);
    mon.captureMessage("sin conexión por 20 min", "warning");
    expect(calls.messages).toEqual([{ message: "sin conexión por 20 min", hint: { level: "warning", tags: {}, extra: {} } }]);
  });

  it("un reporter entregado gana sobre window.Sentry", () => {
    const a = fake();
    const b = fake();
    vi.stubGlobal("Sentry", a.reporter);
    mon.setMonitoringReporter(b.reporter);
    mon.captureException(new Error("x"));
    expect(a.calls.exceptions).toHaveLength(0);
    expect(b.calls.exceptions).toHaveLength(1);
  });

  it("si la sesión se abrió antes de entregar el reporter, se aplica al entregarlo", () => {
    mon.setMonitoringUser({ tenant: "botica-huanuco", role: "admin", userId: "u1" });
    const { calls, reporter } = fake();
    mon.setMonitoringReporter(reporter);
    expect(calls.users).toEqual([{ id: "u1" }]);
    expect(calls.tags.tenant).toBe("botica-huanuco");
  });

  it("al cerrar la sesión se quita el usuario", () => {
    const { calls, reporter } = fake();
    mon.setMonitoringReporter(reporter);
    mon.setMonitoringUser({ tenant: "botica-huanuco", userId: "u1" });
    mon.setMonitoringUser(null);
    expect(calls.users).toEqual([{ id: "u1" }, null]);
    mon.captureException(new Error("x"));
    expect(calls.exceptions[0]!.hint?.tags).toEqual({});
  });

  it("nunca envía DNI, RUC, celulares, correos ni nombres de clientes", () => {
    const { calls, reporter } = fake();
    mon.setMonitoringReporter(reporter);
    const err = new Error("Boleta rechazada para el DNI 40125588 (rosa@correo.pe, 987 654 321)");
    err.stack = "Error: Boleta rechazada para el DNI 40125588\n    at venta (https://x.pe/app.js:1:1)";
    mon.captureException(err, { customerName: "Rosa Huamán", dni: "40125588", scope: "mutation", note: "RUC 20601122334" });
    mon.captureMessage("Cliente 40125588 sin consentimiento", "info", { phone: "987654321" });
    const text = JSON.stringify([calls.exceptions.map((c) => ({ m: c.error.message, s: c.error.stack, h: c.hint })), calls.messages]);
    for (const secret of ["40125588", "rosa@correo.pe", "987 654 321", "987654321", "Rosa Huamán", "20601122334"]) expect(text).not.toContain(secret);
    expect(calls.exceptions[0]!.error.message).toBe("Boleta rechazada para el DNI [dni] ([correo], [celular])");
    expect(calls.exceptions[0]!.hint?.extra).toMatchObject({ scope: "mutation" });
  });

  it("conserva el nombre del error y agrega el código y el estado de un error de la API", () => {
    const { calls, reporter } = fake();
    mon.setMonitoringReporter(reporter);
    const api = Object.assign(new TypeError("El servidor no pudo completar la operación."), { code: "ERROR_INTERNO", status: 500 });
    mon.captureException(api);
    expect(calls.exceptions[0]!.error.name).toBe("TypeError");
    expect(calls.exceptions[0]!.hint?.extra).toEqual({ code: "ERROR_INTERNO", status: 500 });
  });

  it("acepta valores que no son errores", () => {
    const { calls, reporter } = fake();
    mon.setMonitoringReporter(reporter);
    mon.captureException("algo falló");
    mon.captureException({ raro: true });
    expect(calls.exceptions.map((c) => c.error.message)).toEqual(["algo falló", "Error no identificado"]);
  });

  it("un reporter que falla no rompe la app", () => {
    const boom = () => {
      throw new Error("SDK roto");
    };
    mon.setMonitoringReporter({ captureException: boom, captureMessage: boom, setUser: boom, setTag: boom });
    expect(() => {
      mon.captureException(new Error("x"));
      mon.captureMessage("x");
      mon.setMonitoringUser({ userId: "u1" });
    }).not.toThrow();
  });
});

describe("monitoreo · qué errores se reportan", () => {
  it("no reporta reglas del negocio (4xx) ni la falta de conexión; sí los 5xx y los errores de código", async () => {
    expect(mon.isReportableError(Object.assign(new Error("x"), { status: 409 }))).toBe(false);
    expect(mon.isReportableError(Object.assign(new Error("x"), { status: 401 }))).toBe(false);
    expect(mon.isReportableError(Object.assign(new Error("x"), { status: 0 }))).toBe(false);
    expect(mon.isReportableError(Object.assign(new Error("x"), { status: 500 }))).toBe(true);
    expect(mon.isReportableError(Object.assign(new Error("x"), { status: 503 }))).toBe(true);
    expect(mon.isReportableError(new TypeError("undefined is not a function"))).toBe(true);
    expect(mon.isReportableError(null)).toBe(true);
  });

  it("instalar los manejadores globales fuera del navegador no hace nada", () => {
    expect(mon.installGlobalErrorHandlers()()).toBeUndefined();
  });
});
