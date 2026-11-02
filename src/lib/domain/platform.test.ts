import { describe, expect, it } from "vitest";
import type { Account, TenantAction, TenantSummary } from "@/lib/api/types";
import { ALL_MODULES } from "./account";
import { findPlan } from "./plans";
import { MAX_TRIAL_EXTENSION_DAYS, accountDeadline, activityLabel, addDays, applyTenantAction, countTenants, filterTenants, reasonError, tenantActions, type TenantState } from "./platform";

const TODAY = "2026-11-02";
const reason = "Pidió más tiempo para decidir";

const state = (account: Partial<Account> = {}, extra: Partial<TenantState> = {}): TenantState => ({
  planName: "Plan Inicio", activeBranches: 1, account: { status: "trial", trialEndsAt: "2026-11-05", modules: ["panel", "pos"], ...account }, ...extra,
});
const run = (st: TenantState, input: TenantAction) => applyTenantAction(st, input, TODAY);
const okOf = (r: ReturnType<typeof run>) => {
  if (!r.ok) throw new Error(`Debía aplicarse: ${r.message}`);
  return r;
};
const failOf = (r: ReturnType<typeof run>) => {
  if (r.ok) throw new Error("Debía rechazarse");
  return r;
};

describe("consola · motivo y fechas", () => {
  it("el motivo es obligatorio y acotado", () => {
    expect(reasonError("   ")).toMatch(/motivo/);
    expect(reasonError("abc")).toMatch(/motivo/);
    expect(reasonError(reason)).toBeNull();
    expect(reasonError("x".repeat(201))).toMatch(/motivo/);
    expect(failOf(run(state(), { action: "suspend", reason: "no" })).code).toBe("DATOS_INVALIDOS");
  });

  it("suma días a un día local, también al cruzar mes y año", () => {
    expect(addDays("2026-11-02", 14)).toBe("2026-11-16");
    expect(addDays("2026-12-25", 10)).toBe("2027-01-04");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });
});

describe("consola · cambiar de plan", () => {
  it("cambia nombre, límite de locales y módulos al plan nuevo", () => {
    const r = okOf(run(state(), { action: "change_plan", planId: "crece", reason }));
    expect(r.planName).toBe("Plan Crece");
    expect(r.maxBranches).toBe(3);
    expect(r.account.modules).toEqual(findPlan("crece")!.modules);
    expect(r.account.status).toBe("trial");
  });

  it("el plan más grande incluye todos los módulos", () => {
    expect(okOf(run(state(), { action: "change_plan", planId: "cadena", reason })).account.modules).toEqual([...ALL_MODULES]);
  });

  it("rechaza un plan que no existe o el mismo que ya tiene", () => {
    expect(failOf(run(state(), { action: "change_plan", planId: "nada", reason })).code).toBe("DATOS_INVALIDOS");
    expect(failOf(run(state(), { action: "change_plan", planId: "inicio", reason })).code).toBe("ESTADO_INVALIDO");
  });

  it("no baja a un plan donde no caben sus locales activos", () => {
    const r = failOf(run(state({}, { planName: "Plan Cadena", activeBranches: 4 }), { action: "change_plan", planId: "crece", reason }));
    expect(r.code).toBe("LIMITE_DEL_PLAN");
    expect(r.status).toBe(409);
    expect(r.message).toMatch(/4 locales/);
    expect(okOf(run(state({}, { planName: "Plan Cadena", activeBranches: 3 }), { action: "change_plan", planId: "crece", reason })).planName).toBe("Plan Crece");
  });
});

describe("consola · extender la prueba", () => {
  it("suma desde el fin de la prueba si todavía no termina", () => {
    const r = okOf(run(state(), { action: "extend_trial", days: 7, reason }));
    expect(r.account).toMatchObject({ status: "trial", trialEndsAt: "2026-11-12" });
  });

  it("si la prueba ya venció, cuenta desde hoy y la botica vuelve a estar en prueba", () => {
    const r = okOf(run(state({ trialEndsAt: "2026-10-20" }), { action: "extend_trial", days: 7, reason }));
    expect(r.account).toMatchObject({ status: "trial", trialEndsAt: "2026-11-09" });
  });

  it("valida los días y el estado", () => {
    for (const days of [0, -1, 1.5, MAX_TRIAL_EXTENSION_DAYS + 1]) expect(failOf(run(state(), { action: "extend_trial", days, reason })).code).toBe("DATOS_INVALIDOS");
    expect(okOf(run(state(), { action: "extend_trial", days: MAX_TRIAL_EXTENSION_DAYS, reason })).account.trialEndsAt).toBe(addDays("2026-11-05", MAX_TRIAL_EXTENSION_DAYS));
    expect(failOf(run(state({ status: "active", trialEndsAt: undefined, renewsAt: "2026-12-01" }), { action: "extend_trial", days: 5, reason })).code).toBe("ESTADO_INVALIDO");
    expect(failOf(run(state({ status: "suspended" }), { action: "extend_trial", days: 5, reason })).message).toMatch(/reactívala/);
  });
});

describe("consola · suspender y reactivar", () => {
  it("suspender deja la cuenta en solo lectura y conserva las fechas", () => {
    const r = okOf(run(state(), { action: "suspend", reason }));
    expect(r.account).toMatchObject({ status: "suspended", trialEndsAt: "2026-11-05" });
    expect(failOf(run(state({ status: "suspended" }), { action: "suspend", reason })).code).toBe("ESTADO_INVALIDO");
  });

  it("reactivar devuelve a prueba si tenía prueba, o a activa si pagaba", () => {
    expect(okOf(run(state({ status: "suspended" }), { action: "reactivate", reason })).account).toMatchObject({ status: "trial", trialEndsAt: "2026-11-05" });
    const paid = okOf(run(state({ status: "suspended", trialEndsAt: undefined, renewsAt: "2026-12-01" }), { action: "reactivate", reason })).account;
    expect(paid).toMatchObject({ status: "active", renewsAt: "2026-12-01" });
    const noDate = okOf(run(state({ status: "suspended", trialEndsAt: undefined }), { action: "reactivate", reason })).account;
    expect(noDate).toMatchObject({ status: "active", renewsAt: "2026-12-02" });
  });

  it("solo se reactiva una cuenta suspendida", () => {
    expect(failOf(run(state(), { action: "reactivate", reason })).code).toBe("ESTADO_INVALIDO");
  });
});

const tenant = (over: Partial<TenantSummary>): TenantSummary => ({
  code: "botica-a", name: "Botica Andina", planId: "inicio", planName: "Plan Inicio", maxBranches: 1, status: "active", createdAt: "2026-01-01T00:00:00Z", lastActivityAt: null, branches: 1, users: 2, ...over,
});

describe("consola · lista", () => {
  const list = [tenant({}), tenant({ code: "farma-sol", name: "Farmacia del Sol", status: "trial" }), tenant({ code: "mi-botica", name: "Botica Ñandú", status: "suspended" }), tenant({ code: "otra", name: "Otra", status: "trial" })];

  it("cuenta por estado", () => {
    expect(countTenants(list)).toEqual({ trial: 2, active: 1, overdue: 0, suspended: 1 });
  });

  it("busca por nombre o código sin importar mayúsculas ni tildes, y por estado", () => {
    expect(filterTenants(list, { q: "SOL" }).map((t) => t.code)).toEqual(["farma-sol"]);
    expect(filterTenants(list, { q: "nandu" }).map((t) => t.code)).toEqual(["mi-botica"]);
    expect(filterTenants(list, { q: "botica-a" }).map((t) => t.code)).toEqual(["botica-a"]);
    expect(filterTenants(list, { status: "trial" })).toHaveLength(2);
    expect(filterTenants(list, { q: "", status: undefined })).toHaveLength(4);
  });

  it("ofrece solo las acciones que corresponden al estado", () => {
    expect(tenantActions({ status: "trial" })).toEqual({ changePlan: true, extendTrial: true, suspend: true, reactivate: false });
    expect(tenantActions({ status: "overdue", trialEndsAt: "2026-10-01" }).extendTrial).toBe(true);
    expect(tenantActions({ status: "overdue" }).extendTrial).toBe(false);
    expect(tenantActions({ status: "active" })).toMatchObject({ extendTrial: false, suspend: true, reactivate: false });
    expect(tenantActions({ status: "suspended" })).toMatchObject({ extendTrial: false, suspend: false, reactivate: true });
  });

  it("describe la última actividad en español", () => {
    const now = Date.parse("2026-11-02T12:00:00Z");
    const ago = (ms: number) => new Date(now - ms).toISOString();
    expect(activityLabel(null, now)).toBe("Nunca");
    expect(activityLabel(ago(10_000), now)).toBe("Ahora");
    expect(activityLabel(ago(5 * 60_000), now)).toBe("Hace 5 min");
    expect(activityLabel(ago(3 * 3_600_000), now)).toBe("Hace 3 h");
    expect(activityLabel(ago(30 * 3_600_000), now)).toBe("Ayer");
    expect(activityLabel(ago(12 * 86_400_000), now)).toBe("Hace 12 días");
    expect(activityLabel(ago(95 * 86_400_000), now)).toBe("Hace 3 meses");
  });

  it("resume el plazo de la cuenta", () => {
    expect(accountDeadline({ status: "trial", trialEndsAt: "2026-11-09" }, TODAY)).toBe("Prueba: 7 días");
    expect(accountDeadline({ status: "trial", trialEndsAt: "2026-11-03" }, TODAY)).toBe("Prueba: 1 día");
    expect(accountDeadline({ status: "trial", trialEndsAt: TODAY }, TODAY)).toBe("La prueba termina hoy");
    expect(accountDeadline({ status: "overdue", trialEndsAt: "2026-10-31" }, TODAY)).toBe("Prueba vencida hace 2 días");
    expect(accountDeadline({ status: "active", renewsAt: "2026-12-01" }, TODAY)).toBe("Renueva el 2026-12-01");
    expect(accountDeadline({ status: "suspended" }, TODAY)).toBe("");
  });
});
