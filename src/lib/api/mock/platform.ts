/**
 * Consola interna de Digi!HME simulada. Trabaja sobre las mismas boticas que la API de la botica (`tenantDb`), así que
 * suspender o cambiar el plan se ve de inmediato en esa botica. El operador y su token son distintos de los de una botica.
 *
 * Operador de prueba (solo en este mock): soporte@digi-hme.pe · Consola2026!
 */
import type { PlatformClient } from "../contract";
import { ApiError } from "../errors";
import { platformTokenStore } from "../token";
import type { AuditAction, AuditFields, PlatformOperator, PlatformSession, TenantAction, TenantSummary } from "../types";
import { limaDay } from "@/lib/domain/account";
import { isValidEmail, normalizeEmail } from "@/lib/domain/auth";
import { applyTenantAction, buildPlatformMetrics, countTenants, filterTenants, tenantActivity, tenantHistory, tenantStatus } from "@/lib/domain/platform";
import { paginate } from "@/lib/domain/pagination";
import { PLAN_CATALOG } from "@/lib/domain/plans";
import { PLATFORM_ACTOR, appendAudit } from "./audit";
import { commitTenantDb, knownTenantCodes, tenantDb, type MockDb } from "./client";

export const MOCK_OPERATOR: PlatformOperator & { password: string } = { id: "op1", name: "Soporte Digi!HME", email: "soporte@digi-hme.pe", password: "Consola2026!" };

const SESSION_MS = 8 * 3600_000;
const TOKEN_PREFIX = "mock.platform.";
const wait = (ms = 140 + Math.random() * 120) => new Promise((r) => setTimeout(r, ms));
const fail = (code: string, message: string, status = 400): never => {
  throw new ApiError({ code, message }, status);
};

/** Un token de operador es `mock.platform.<id>.<vence>`. El de una botica (`mock.u1.…`) nunca pasa por aquí. */
function requireOperator(): PlatformOperator {
  const token = platformTokenStore.get() ?? "";
  const [id, expires] = token.startsWith(TOKEN_PREFIX) ? token.slice(TOKEN_PREFIX.length).split(".") : [];
  if (id !== MOCK_OPERATOR.id || !expires || parseInt(expires, 36) <= Date.now()) {
    platformTokenStore.clear();
    platformTokenStore.notifyExpired();
    return fail("NO_AUTORIZADO", "Tu sesión terminó. Vuelve a ingresar.", 401);
  }
  return { id: MOCK_OPERATOR.id, name: MOCK_OPERATOR.name, email: MOCK_OPERATOR.email };
}

const lastActivity = (db: MockDb): string | null => {
  let last: string | null = null;
  for (const e of db.audit) if (e.userId !== null && e.action !== "sesion_fallida" && (!last || e.at > last)) last = e.at;
  return last;
};

function summarize(db: MockDb, today: string): TenantSummary {
  const plan = PLAN_CATALOG.find((p) => p.name === db.plan.name);
  const a = db.account;
  return {
    code: db.boticaCode, name: db.pharmacy.name, planId: plan?.id ?? null, planName: db.plan.name, maxBranches: db.plan.maxBranches, status: tenantStatus(a, today),
    ...(a.trialEndsAt ? { trialEndsAt: a.trialEndsAt } : {}), ...(a.renewsAt ? { renewsAt: a.renewsAt } : {}),
    createdAt: db.createdAt, lastActivityAt: lastActivity(db), branches: db.branches.filter((b) => b.active).length, users: db.staff.filter((s) => s.active).length,
  };
}

const AUDIT_ACTION: Record<TenantAction["action"], AuditAction> = { change_plan: "plan_cambiado", extend_trial: "prueba_extendida", suspend: "cuenta_suspendida", reactivate: "cuenta_reactivada" };

export function createMockPlatformClient(): PlatformClient {
  const allTenants = (today: string): TenantSummary[] =>
    knownTenantCodes()
      .map((code) => tenantDb(code))
      .flatMap((db) => (db ? [summarize(db, today)] : []))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));

  return {
    async login(email, password) {
      await wait(260);
      const e = normalizeEmail(email);
      if (!isValidEmail(e) || e !== MOCK_OPERATOR.email || password !== MOCK_OPERATOR.password) return fail("CREDENCIALES_INVALIDAS", "Correo o contraseña incorrectos. Intenta de nuevo.", 401);
      const expires = Date.now() + SESSION_MS;
      const session: PlatformSession = { token: `${TOKEN_PREFIX}${MOCK_OPERATOR.id}.${expires.toString(36)}`, operator: { id: MOCK_OPERATOR.id, name: MOCK_OPERATOR.name, email: MOCK_OPERATOR.email }, expiresAt: new Date(expires).toISOString() };
      return session;
    },
    async logout() {
      /* El token del mock se valida por su fecha: al salir basta con olvidarlo en el navegador. */
    },
    async listTenants(query = {}) {
      await wait();
      requireOperator();
      const today = limaDay(Date.now());
      const searched = filterTenants(allTenants(today), { q: query.q });
      const counts = countTenants(searched);
      const page = paginate(filterTenants(searched, { status: query.status }), query);
      return { ...page, counts };
    },
    async getTenant(code) {
      await wait();
      requireOperator();
      const db = tenantDb(code) ?? fail("BOTICA_NO_ENCONTRADA", "No encontramos una botica con ese código.", 404);
      const now = Date.now();
      const lastLogin = new Map<string, string>();
      for (const e of db.audit) if (e.action === "sesion_iniciada" && e.userId && (lastLogin.get(e.userId) ?? "") < e.at) lastLogin.set(e.userId, e.at);
      // Solo nombres para mostrar, roles, conteos y fechas: nunca PIN, correo, DNI ni nombres de clientes.
      return {
        tenant: summarize(db, limaDay(now)),
        branches: db.branches.map((b) => ({ id: b.id, name: b.name, active: b.active, closed: !b.active })),
        staff: db.staff.map((s) => ({ name: s.name, role: s.role, active: s.active, lastLoginAt: lastLogin.get(s.id) ?? null })),
        activity: tenantActivity(db.sales, (id) => db.vouchers[id]?.status ?? "aceptado", now),
        history: tenantHistory(db.audit),
      };
    },
    async getMetrics() {
      await wait();
      requireOperator();
      const now = Date.now();
      return buildPlatformMetrics(allTenants(limaDay(now)), now);
    },
    async updateTenant(code, input) {
      await wait(260);
      requireOperator();
      const db = tenantDb(code) ?? fail("BOTICA_NO_ENCONTRADA", "No encontramos una botica con ese código.", 404);
      const now = Date.now();
      const today = limaDay(now);
      const before = summarize(db, today);
      const change = applyTenantAction({ planName: db.plan.name, account: db.account, activeBranches: db.branches.filter((b) => b.active).length }, input, today);
      if (!change.ok) return fail(change.code, change.message, change.status);

      db.account = change.account;
      if (input.action === "change_plan" && change.maxBranches !== null) db.plan = { name: change.planName, maxBranches: change.maxBranches };
      const after = summarize(db, today);

      const reason = input.reason.trim();
      const fields: Record<TenantAction["action"], { before: AuditFields; after: AuditFields }> = {
        change_plan: { before: { plan: before.planName, maxBranches: before.maxBranches }, after: { plan: after.planName, maxBranches: after.maxBranches, reason } },
        extend_trial: { before: { trialEndsAt: before.trialEndsAt ?? null }, after: { trialEndsAt: after.trialEndsAt ?? null, days: input.action === "extend_trial" ? input.days : 0, reason } },
        suspend: { before: { status: before.status }, after: { status: after.status, reason } },
        reactivate: { before: { status: before.status }, after: { status: after.status, reason } },
      };
      appendAudit(db.audit, { action: AUDIT_ACTION[input.action], entity: "plan", entityId: null, entityLabel: after.planName, ...fields[input.action] }, PLATFORM_ACTOR, now);
      commitTenantDb(db);
      return after;
    },
  };
}
