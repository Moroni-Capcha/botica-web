import { describe, expect, it } from "vitest";
import type { Account, TenantAction, TenantSummary } from "@/lib/api/types";
import { ALL_MODULES } from "./account";
import { findPlan } from "./plans";
import { MAX_TRIAL_EXTENSION_DAYS, accountDeadline, activityLabel, addDays, applyTenantAction, countTenants, filterTenants, reasonError, tenantActions, tenantActivity, tenantHistory, roleLabel, HISTORY_LABEL, type TenantState } from "./platform";
import { INACTIVE_DAYS, addMonths, buildPlatformMetrics, inactiveTenants, limaMonth, monthlyRecurringRevenue, newTenantsByMonth, trialsEndingSoon } from "./platform";

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

describe("consola · detalle de una botica", () => {
  const NOW = Date.parse("2026-11-06T12:00:00Z");
  const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

  it("cuenta solo los últimos 30 días y los comprobantes por estado; los anulados no cuentan", () => {
    const sales = [
      { id: "a", createdAt: daysAgo(1) },
      { id: "b", createdAt: daysAgo(10) },
      { id: "c", createdAt: daysAgo(20) },
      { id: "d", createdAt: daysAgo(25) },
      { id: "old", createdAt: daysAgo(45) },
    ];
    const status = { a: "aceptado", b: "pendiente", c: "rechazado", d: "anulado", old: "aceptado" } as const;
    const r = tenantActivity(sales, (id) => status[id as keyof typeof status], NOW);
    expect(r).toEqual({ salesLast30Days: 4, vouchersLast30Days: { accepted: 1, pending: 1, rejected: 1 }, lastSaleAt: daysAgo(1) });
  });

  it("sin ventas, la última venta es null", () => {
    expect(tenantActivity([], () => "aceptado", NOW)).toEqual({ salesLast30Days: 0, vouchersLast30Days: { accepted: 0, pending: 0, rejected: 0 }, lastSaleAt: null });
  });

  it("el historial solo trae acciones de Digi!HME, de la más reciente a la más antigua, máximo 20", () => {
    const log = [
      { at: daysAgo(30), action: "plan_cambiado" as const, userId: null, after: { reason: "Subió de plan" } },
      { at: daysAgo(2), action: "cuenta_suspendida" as const, userId: null, after: { reason: "Pago pendiente" } },
      { at: daysAgo(1), action: "venta_registrada" as const, userId: "u1", after: null },
      { at: daysAgo(5), action: "plan_cambiado" as const, userId: "u1", after: { reason: "no es de Digi!HME" } },
      ...Array.from({ length: 25 }, (_, i) => ({ at: daysAgo(40 + i), action: "prueba_extendida" as const, userId: null, after: { reason: `r${i}` } })),
    ];
    const h = tenantHistory(log);
    expect(h).toHaveLength(20);
    expect(h.slice(0, 2).map((e) => e.action)).toEqual(["cuenta_suspendida", "plan_cambiado"]);
    expect(h[0]!.reason).toBe("Pago pendiente");
    expect(h.every((e, i) => i === 0 || Date.parse(h[i - 1]!.at) >= Date.parse(e.at))).toBe(true);
  });

  it("etiquetas en español claro", () => {
    expect(HISTORY_LABEL.cuenta_reactivada).toBe("Cuenta reactivada");
    expect(roleLabel("admin")).toBe("Administrador");
    expect(roleLabel("encargado")).toBe("Encargado");
  });
});

describe("consola · métricas de la plataforma", () => {
  // 2 de noviembre de 2026, mediodía en Lima (UTC-5).
  const NOW = Date.parse("2026-11-02T12:00:00-05:00");
  const DAYMS = 86_400_000;
  const tenant = (code: string, extra: Partial<TenantSummary> = {}): TenantSummary => ({
    code, name: code, planId: "inicio", planName: "Plan Inicio", maxBranches: 1, status: "active", createdAt: "2026-10-01T10:00:00-05:00",
    lastActivityAt: "2026-11-01T10:00:00-05:00", branches: 1, users: 1, ...extra,
  });
  const codes = (l: TenantSummary[]) => l.map((t) => t.code);

  it("el mes se calcula en hora de Lima, no en UTC", () => {
    expect(limaMonth(Date.parse("2026-10-01T04:59:59Z"))).toBe("2026-09");
    expect(limaMonth(Date.parse("2026-10-01T05:00:00Z"))).toBe("2026-10");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-11", 2)).toBe("2027-01");
  });

  it("altas por mes: 6 meses, el actual al final y con ceros", () => {
    const r = newTenantsByMonth([], NOW);
    expect(r.map((m) => m.month)).toEqual(["2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"]);
    expect(r.every((m) => m.count === 0)).toBe(true);
  });

  it("altas por mes: cuenta por mes de Lima, respeta los bordes y ignora lo anterior a 6 meses", () => {
    const r = newTenantsByMonth(
      [
        "2026-10-01T04:59:59Z", // 30 sep 23:59 en Lima -> septiembre
        "2026-10-01T05:00:00Z", // 1 oct 00:00 en Lima -> octubre
        "2026-11-01T04:59:59Z", // 31 oct 23:59 en Lima -> octubre
        "2026-11-02T10:00:00Z", // noviembre
        "2026-06-01T05:00:00Z", // 1 jun en Lima -> junio (primer mes)
        "2026-06-01T04:59:59Z", // 31 may en Lima -> fuera
        "no es una fecha",
      ],
      NOW,
    );
    expect(Object.fromEntries(r.map((m) => [m.month, m.count]))).toEqual({ "2026-06": 1, "2026-07": 0, "2026-08": 0, "2026-09": 1, "2026-10": 2, "2026-11": 1 });
  });

  it("altas por mes: cambio de año", () => {
    const r = newTenantsByMonth(["2026-01-15T10:00:00-05:00"], Date.parse("2026-02-10T10:00:00-05:00"));
    expect(r.map((m) => m.month)).toEqual(["2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(r[4]!.count).toBe(1);
  });

  it("sin actividad: el umbral es de 14 días exactos", () => {
    expect(INACTIVE_DAYS).toBe(14);
    const exact = tenant("exacto", { lastActivityAt: new Date(NOW - 14 * DAYMS).toISOString() });
    const justUnder = tenant("casi", { lastActivityAt: new Date(NOW - 14 * DAYMS + 1).toISOString() });
    expect(codes(inactiveTenants([exact, justUnder], NOW))).toEqual(["exacto"]);
  });

  it("sin actividad: solo activas o en prueba, y las que nunca tuvieron van primero", () => {
    const list = [
      tenant("vieja", { lastActivityAt: new Date(NOW - 40 * DAYMS).toISOString() }),
      tenant("nunca-prueba", { status: "trial", trialEndsAt: "2026-11-20", lastActivityAt: null }),
      tenant("media", { lastActivityAt: new Date(NOW - 20 * DAYMS).toISOString() }),
      tenant("vencida", { status: "overdue", lastActivityAt: null }),
      tenant("suspendida", { status: "suspended", lastActivityAt: null }),
      tenant("reciente"),
    ];
    expect(codes(inactiveTenants(list, NOW))).toEqual(["nunca-prueba", "vieja", "media"]);
  });

  it("sin actividad: máximo 10", () => {
    const list = Array.from({ length: 15 }, (_, i) => tenant(`b${String(i).padStart(2, "0")}`, { lastActivityAt: null }));
    expect(inactiveTenants(list, NOW)).toHaveLength(10);
  });

  it("pruebas por vencer: de hoy a 7 días, la que vence antes primero", () => {
    const trial = (code: string, trialEndsAt: string) => tenant(code, { status: "trial", trialEndsAt });
    const list = [trial("d7", "2026-11-09"), trial("d8", "2026-11-10"), trial("hoy", "2026-11-02"), trial("d3", "2026-11-05"), trial("ayer", "2026-11-01")];
    expect(codes(trialsEndingSoon(list, "2026-11-02"))).toEqual(["hoy", "d3", "d7"]);
  });

  it("pruebas por vencer: ignora las que no están en prueba y limita a 10", () => {
    const list = [tenant("activa", { status: "active", trialEndsAt: "2026-11-04" }), tenant("vencida", { status: "overdue", trialEndsAt: "2026-11-01" }), tenant("sin-fecha", { status: "trial" })];
    expect(trialsEndingSoon(list, "2026-11-02")).toEqual([]);
    const many = Array.from({ length: 12 }, (_, i) => tenant(`t${i}`, { status: "trial", trialEndsAt: "2026-11-05" }));
    expect(trialsEndingSoon(many, "2026-11-02")).toHaveLength(10);
  });

  it("ingreso mensual: suma solo las activas, con IGV y sin IGV", () => {
    expect(monthlyRecurringRevenue([])).toEqual({ withIgv: 0, withoutIgv: 0 });
    const r = monthlyRecurringRevenue([
      { status: "active", planId: "inicio" }, // 59,00
      { status: "active", planId: "crece" }, // 129,80
      { status: "active", planId: "cadena" }, // 247,80
      { status: "trial", planId: "cadena" },
      { status: "overdue", planId: "crece" },
      { status: "suspended", planId: "inicio" },
      { status: "active", planId: null },
      { status: "active", planId: "plan-que-ya-no-existe" },
    ]);
    expect(r).toEqual({ withIgv: 436.6, withoutIgv: 370 });
  });

  it("ingreso mensual: redondea a 2 decimales", () => {
    const r = monthlyRecurringRevenue(Array.from({ length: 7 }, () => ({ status: "active" as const, planId: "crece" })));
    expect(r.withIgv).toBe(908.6);
    expect(r.withoutIgv).toBe(770);
    const odd = monthlyRecurringRevenue([{ status: "active", planId: "inicio" }, { status: "active", planId: "inicio" }, { status: "active", planId: "inicio" }]);
    expect(odd.withIgv).toBe(177);
    expect(Number.isInteger(Math.round(odd.withoutIgv * 100))).toBe(true);
    expect(odd.withoutIgv).toBe(150);
  });

  it("arma el resumen completo con la misma lista", () => {
    const list = [
      tenant("a", { createdAt: "2026-11-01T10:00:00-05:00" }),
      tenant("b", { status: "trial", trialEndsAt: "2026-11-04", lastActivityAt: null, createdAt: "2026-10-20T10:00:00-05:00" }),
      tenant("c", { status: "suspended" }),
    ];
    const m = buildPlatformMetrics(list, NOW);
    expect(m.counts).toEqual({ trial: 1, active: 1, overdue: 0, suspended: 1 });
    expect(m.newTenantsByMonth.slice(-2).map((x) => x.count)).toEqual([2, 1]);
    expect(codes(m.inactive)).toEqual(["b"]);
    expect(codes(m.trialsEndingSoon)).toEqual(["b"]);
    expect(m.monthlyRecurringRevenue).toEqual({ withIgv: 59, withoutIgv: 50 });
  });
});
