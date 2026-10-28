import { describe, expect, it } from "vitest";
import { accountNotice, allowedModules, daysLeft, effectiveStatus, isReadOnly, limaDay } from "./account";

describe("cuenta", () => {
  it("solo la suspendida es de solo lectura", () => {
    expect(isReadOnly("suspended")).toBe(true);
    for (const s of ["trial", "active", "overdue"] as const) expect(isReadOnly(s)).toBe(false);
  });

  it("cuenta los días de prueba que quedan", () => {
    expect(daysLeft("2026-11-10", "2026-10-28")).toBe(13);
    expect(daysLeft("2026-10-28", "2026-10-28")).toBe(0);
    expect(daysLeft("2026-10-27", "2026-10-28")).toBe(-1);
    expect(daysLeft("2027-03-01", "2027-02-28")).toBe(1);
  });

  it("la prueba pasada de su último día queda vencida", () => {
    expect(effectiveStatus({ status: "trial", trialEndsAt: "2026-10-28" }, "2026-10-28")).toBe("trial");
    expect(effectiveStatus({ status: "trial", trialEndsAt: "2026-10-27" }, "2026-10-28")).toBe("overdue");
    expect(effectiveStatus({ status: "trial" }, "2026-10-28")).toBe("trial");
    expect(effectiveStatus({ status: "active", trialEndsAt: "2020-01-01" }, "2026-10-28")).toBe("active");
    expect(effectiveStatus({ status: "suspended" }, "2026-10-28")).toBe("suspended");
  });

  it("deja solo los módulos del rol que incluye el plan", () => {
    expect(allowedModules(["panel", "pos", "caja"], ["panel", "pos", "reportes", "caja"])).toEqual(["panel", "pos", "caja"]);
    expect(allowedModules([], ["panel"])).toEqual([]);
  });

  it("toma el día de Lima, no el UTC", () => {
    expect(limaDay(Date.parse("2026-10-28T03:00:00Z"))).toBe("2026-10-27"); // 22:00 en Lima
    expect(limaDay(Date.parse("2026-10-28T06:00:00Z"))).toBe("2026-10-28");
  });
});

describe("aviso de cuenta", () => {
  const today = "2026-10-28";
  it("no avisa si la cuenta está activa", () => {
    expect(accountNotice({ status: "active" }, today)).toBeNull();
  });
  it("avisa los días de prueba y se pone en alerta cerca del final", () => {
    expect(accountNotice({ status: "trial", trialEndsAt: "2026-11-10" }, today)).toMatchObject({ tone: "info", message: "Te quedan 13 días de prueba gratis." });
    expect(accountNotice({ status: "trial", trialEndsAt: "2026-10-29" }, today)).toMatchObject({ tone: "warn", message: "Te queda 1 día de prueba gratis." });
    expect(accountNotice({ status: "trial", trialEndsAt: today }, today)?.message).toBe("Tu prueba gratis termina hoy.");
  });
  it("una prueba pasada se avisa como vencida", () => {
    expect(accountNotice({ status: "trial", trialEndsAt: "2026-10-01" }, today)?.tone).toBe("warn");
  });
  it("suspendida es error de solo lectura", () => {
    expect(accountNotice({ status: "suspended" }, today)).toMatchObject({ tone: "error" });
  });
});
