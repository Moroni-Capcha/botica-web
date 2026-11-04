/**
 * Auditoría de la API simulada. Un solo envoltorio (`auditWrites`) registra las acciones importantes de todos los endpoints:
 * las reglas de abajo dicen qué se registra de cada uno. Así el registro no queda repartido por cada función del mock,
 * y el backend puede hacer lo mismo en un solo punto (middleware o interceptor).
 *
 * Se registra solo lo que se completó (menos el ingreso fallido). Nunca DNI, nombres de clientes, PIN ni contraseñas.
 */
import type { ApiClient } from "../contract";
import { ApiError } from "../errors";
import type { AuditAction, AuditEntity, AuditEntry, AuditFields, Branch, Lot, Pharmacy, Product, Role, RulesInput, Sale, Transfer } from "../types";
import { diffFields, maskEmail } from "@/lib/domain/audit";

/** Cuántas entradas conserva el mock (el navegador tiene poco espacio). El backend real las conserva todas. */
const MAX_ENTRIES = 5000;

export interface AuditActor {
  id: string | null;
  name: string;
  role: Role | null;
  branchId: string | null;
}

/** Acciones de Digi!HME sobre una botica: no hay cuenta de la botica detrás. */
export const PLATFORM_ACTOR: AuditActor = { id: null, name: "Digi!HME", role: null, branchId: null };
const UNKNOWN_ACTOR: AuditActor = { id: null, name: "Sin identificar", role: null, branchId: null };

export interface AuditDraft {
  action: AuditAction;
  entity: AuditEntity;
  entityId: string | null;
  entityLabel: string;
  branchId?: string | null;
  before?: AuditFields | null;
  after?: AuditFields | null;
  /** Quien lo hizo cuando no es la sesión abierta (el ingreso, Digi!HME). */
  actor?: AuditActor;
}

/** Lo que las reglas pueden consultar del estado actual (siempre copias o datos simples). */
export interface AuditLookup {
  staff(id: string): { name: string; role: Role; branchId: string | null; active: boolean } | undefined;
  product(id: number): Product | undefined;
  branch(id: string): Branch | undefined;
  lot(id: number): Lot | undefined;
  pharmacy(): Pharmacy;
  rules(): RulesInput;
}

export interface AuditHost {
  log(): AuditEntry[];
  /** Quien tiene la sesión abierta, sin fallar si no hay ninguna. */
  actor(): AuditActor | null;
  look(): AuditLookup;
  commit(): void;
}

export function appendAudit(log: AuditEntry[], draft: AuditDraft, actor: AuditActor, now: number): AuditEntry {
  const a = draft.actor ?? actor;
  const last = log[log.length - 1];
  const entry: AuditEntry = {
    id: `a${(Number(last?.id.slice(1)) || 0) + 1}`, at: new Date(now).toISOString(), userId: a.id, userName: a.name, role: a.role, branchId: draft.branchId ?? a.branchId,
    action: draft.action, entity: draft.entity, entityId: draft.entityId, entityLabel: draft.entityLabel, before: draft.before ?? null, after: draft.after ?? null,
  };
  log.push(entry);
  if (log.length > MAX_ENTRIES) log.splice(0, log.length - MAX_ENTRIES);
  return entry;
}

/* ------------------------------ Reglas: qué se registra de cada endpoint ------------------------------ */

type Args<K extends keyof ApiClient> = Parameters<ApiClient[K]>;
type Res<K extends keyof ApiClient> = Awaited<ReturnType<ApiClient[K]>>;

interface Rule<K extends keyof ApiClient, B> {
  /** Foto del estado antes de ejecutar (copias simples: la acción modifica los datos en su lugar). */
  before?: (args: Args<K>, look: AuditLookup) => B;
  ok?: (c: { args: Args<K>; result: Res<K>; before: B; look: AuditLookup }) => AuditDraft | AuditDraft[] | null;
  fail?: (c: { args: Args<K>; error: ApiError; look: AuditLookup }) => AuditDraft | null;
}
const rule = <K extends keyof ApiClient, B = undefined>(r: Rule<K, B>): Rule<K, B> => r;

const productName = (p: Pick<Product, "name" | "conc">) => `${p.name} ${p.conc}`.trim();
const pricesOf = (p: Product): AuditFields => ({ priceUnit: p.priceUnit, priceBlister: p.priceBlister, priceBox: p.priceBox });
const costOf = (p: Product): AuditFields => ({ cost: p.cost });
const detailsOf = (p: Product): AuditFields => ({ name: p.name, conc: p.conc, lab: p.lab, category: p.category, rx: p.rx, minStock: p.minStock, barcode: p.barcode });
const snapProduct = (p: Product | undefined) => (p ? { name: productName(p), prices: pricesOf(p), cost: costOf(p), details: detailsOf(p) } : null);

/** Cambios de un producto: el precio y el costo se registran aparte porque son lo que más se vigila. */
function productChanges(before: ReturnType<typeof snapProduct>, p: Product): AuditDraft[] {
  if (!before) return [];
  const base = { entity: "producto" as const, entityId: String(p.id), entityLabel: productName(p) };
  const drafts: AuditDraft[] = [];
  const price = diffFields(before.prices, pricesOf(p));
  if (price) drafts.push({ ...base, action: "precio_cambiado", ...price });
  const cost = diffFields(before.cost, costOf(p));
  if (cost) drafts.push({ ...base, action: "costo_cambiado", ...cost });
  const other = diffFields(before.details, detailsOf(p));
  if (other) drafts.push({ ...base, action: "producto_editado", ...other });
  return drafts;
}

const saleDraft = (s: Sale): AuditDraft => ({
  action: "venta_registrada", entity: "venta", entityId: s.id, entityLabel: s.number, branchId: s.branchId,
  after: { total: s.total, method: s.payment.method, document: s.document.type, items: s.items.length, offline: !!s.offlineTicket },
});

const transferDraft = (action: AuditAction, t: Transfer, branchId: string): AuditDraft => ({
  action, entity: "traslado", entityId: String(t.id), entityLabel: t.code, branchId,
  after: { status: t.status, from: t.fromBranchId, to: t.toBranchId, items: t.items.length || t.requested?.length || 0 },
});

const flattenRules = (r: RulesInput): AuditFields => {
  const out: AuditFields = {};
  for (const [group, values] of Object.entries(r)) for (const [k, v] of Object.entries(values as Record<string, number>)) out[`${group}.${k}`] = v;
  return out;
};

const accountFields = (a: { name: string; role: Role; branchId: string | null; active: boolean }): AuditFields => ({ name: a.name, role: a.role, branchId: a.branchId, active: a.active });
const pharmacyFields = (p: Pharmacy): AuditFields => ({ name: p.name, tagline: p.tagline, ruc: p.ruc, legalName: p.legalName, fiscalAddress: p.fiscalAddress, phone: p.phone, brand: p.brand, accent: p.accent });
const branchFields = (b: Pick<Branch, "name" | "address" | "series">): AuditFields => ({ name: b.name, address: b.address, series: b.series });

const sessionActor = (u: { id: string; name: string; role: Role; branchId: string | null }): AuditActor => ({ id: u.id, name: u.name, role: u.role, branchId: u.branchId });

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- cada regla fija su propio tipo de "antes"
export const AUDIT_RULES: { [K in keyof ApiClient]?: Rule<K, any> } = {
  /* Acceso */
  login: rule<"login">({
    ok: ({ result }) => ({ action: "sesion_iniciada", entity: "sesion", entityId: result.user.id, entityLabel: result.user.name, after: { via: "pin" }, actor: sessionActor(result.user) }),
    fail: ({ args, look }) => {
      const s = look.staff(args[0]);
      return { action: "sesion_fallida", entity: "sesion", entityId: s ? args[0] : null, entityLabel: s?.name ?? "Usuario desconocido", after: { via: "pin" }, actor: s ? { id: args[0], name: s.name, role: s.role, branchId: s.branchId } : UNKNOWN_ACTOR };
    },
  }),
  loginOwner: rule<"loginOwner">({
    ok: ({ result }) => ({ action: "sesion_iniciada", entity: "sesion", entityId: result.user.id, entityLabel: result.user.name, after: { via: "correo" }, actor: sessionActor(result.user) }),
    fail: ({ args }) => ({ action: "sesion_fallida", entity: "sesion", entityId: null, entityLabel: "Ingreso del dueño", after: { via: "correo", email: maskEmail(args[0]) }, actor: UNKNOWN_ACTOR }),
  }),

  /* Ventas y comprobantes */
  createSale: rule<"createSale">({ ok: ({ result }) => saleDraft(result) }),
  syncSales: rule<"syncSales">({ ok: ({ result }) => result.results.flatMap((r) => (r.status === "created" && r.sale ? [saleDraft(r.sale)] : [])) }),
  voidVoucher: rule<"voidVoucher">({
    ok: ({ args, result }) => ({ action: "comprobante_anulado", entity: "comprobante", entityId: result.id, entityLabel: result.number, branchId: result.branchId, before: { status: "aceptado" }, after: { status: "anulado", reason: args[1].reason.trim(), returnStock: !!args[1].returnStock } }),
  }),
  createCreditNote: rule<"createCreditNote">({
    ok: ({ result }) => ({ action: "nota_credito_emitida", entity: "nota_credito", entityId: result.id, entityLabel: result.number, branchId: result.branchId, after: { total: result.total, reason: result.reasonLabel, voucher: result.voucherNumber } }),
  }),

  resendVoucher: rule<"resendVoucher">({
    ok: ({ result }) => ({ action: "comprobante_reenviado", entity: "comprobante", entityId: result.id, entityLabel: result.number, branchId: result.branchId, after: { status: result.status, attempts: result.attempts, sunatCode: result.sunat?.code ?? null } }),
  }),
  resendCreditNote: rule<"resendCreditNote">({
    ok: ({ result }) => ({ action: "nota_credito_reenviada", entity: "nota_credito", entityId: result.id, entityLabel: result.number, branchId: result.branchId, after: { status: result.status, attempts: result.attempts, sunatCode: result.sunat?.code ?? null } }),
  }),

  /* Catálogo, precios y costos */
  createProduct: rule<"createProduct">({
    ok: ({ result }) => ({ action: "producto_creado", entity: "producto", entityId: String(result.id), entityLabel: productName(result), after: { ...pricesOf(result), ...costOf(result) } }),
  }),
  updateProduct: rule<"updateProduct", ReturnType<typeof snapProduct>>({
    before: (args, look) => snapProduct(look.product(args[0])),
    ok: ({ before, result }) => productChanges(before, result),
  }),

  /* Stock */
  createPurchase: rule<"createPurchase">({
    ok: ({ result }) => ({ action: "compra_registrada", entity: "compra", entityId: String(result.id), entityLabel: result.document, branchId: result.branchId, after: { total: result.total, items: result.items.length, supplier: result.supplierName } }),
  }),
  writeOffLot: rule<"writeOffLot", number | null>({
    before: (args, look) => look.lot(args[0])?.qty ?? null,
    ok: ({ args, result, before }) => ({
      action: "baja_registrada", entity: "lote", entityId: String(result.id), entityLabel: result.code, branchId: result.branchId,
      before: before === null ? null : { qty: before }, after: { qty: result.qty, type: args[1].type, units: args[1].units, reason: args[1].note.trim() },
    }),
  }),
  setLotDiscount: rule<"setLotDiscount">({
    ok: ({ args, result }) => ({ action: "descuento_lote", entity: "lote", entityId: args[1].join(","), entityLabel: result.length === 1 ? `Lote ${result[0]!.code}` : `${result.length} lotes`, branchId: args[0], after: { discount: args[2], lots: result.length } }),
  }),
  sendTransfer: rule<"sendTransfer">({ ok: ({ result }) => transferDraft("traslado_enviado", result, result.fromBranchId) }),
  askTransfer: rule<"askTransfer">({ ok: ({ result }) => transferDraft("traslado_pedido", result, result.toBranchId) }),
  dispatchTransfer: rule<"dispatchTransfer">({ ok: ({ result }) => transferDraft("traslado_despachado", result, result.fromBranchId) }),
  receiveTransfer: rule<"receiveTransfer">({ ok: ({ result }) => transferDraft("traslado_recibido", result, result.toBranchId) }),
  cancelTransfer: rule<"cancelTransfer">({
    ok: ({ args, result }) => ({ ...transferDraft("traslado_anulado", result, result.fromBranchId), after: { status: result.status, from: result.fromBranchId, to: result.toBranchId, reason: args[1].trim() } }),
  }),

  /* Caja */
  openCash: rule<"openCash">({
    ok: ({ args, result, look }) => ({ action: "caja_abierta", entity: "caja", entityId: args[0], entityLabel: look.branch(args[0])?.name ?? args[0], branchId: args[0], after: { openingAmount: result.openingAmount } }),
  }),
  closeCash: rule<"closeCash">({
    ok: ({ args, result, look }) => ({
      action: "caja_cerrada", entity: "caja", entityId: args[0], entityLabel: look.branch(args[0])?.name ?? args[0], branchId: args[0],
      after: { expected: result.expected, counted: result.counted, difference: result.difference, tickets: result.tickets },
    }),
  }),
  addCashMovement: rule<"addCashMovement">({
    ok: ({ args, result, look }) => ({ action: "movimiento_caja", entity: "caja", entityId: args[0], entityLabel: look.branch(args[0])?.name ?? args[0], branchId: args[0], after: { type: result.type, amount: result.amount, note: result.note } }),
  }),

  /* Cuentas y usuarios */
  createAccount: rule<"createAccount">({
    ok: ({ result }) => ({ action: "cuenta_creada", entity: "cuenta", entityId: result.id, entityLabel: result.name, branchId: result.branchId, after: accountFields(result) }),
  }),
  updateAccount: rule<"updateAccount", AuditFields | null>({
    before: (args, look) => {
      const s = look.staff(args[0]);
      return s ? accountFields(s) : null;
    },
    ok: ({ args, result, before }) => {
      const after: AuditFields = { ...accountFields(result), ...(args[1].pin ? { pinChanged: true } : {}) };
      const change = diffFields(before ?? {}, after);
      return change ? { action: "cuenta_editada", entity: "cuenta", entityId: result.id, entityLabel: result.name, branchId: result.branchId, ...change } : null;
    },
  }),

  /* Ajustes */
  updatePharmacy: rule<"updatePharmacy", AuditFields>({
    before: (_a, look) => pharmacyFields(look.pharmacy()),
    ok: ({ before, result }) => {
      const change = diffFields(before, pharmacyFields(result));
      return change ? { action: "botica_editada", entity: "botica", entityId: null, entityLabel: result.name, ...change } : null;
    },
  }),
  updateRules: rule<"updateRules", AuditFields>({
    before: (_a, look) => flattenRules(look.rules()),
    ok: ({ before, result }) => {
      const change = diffFields(before, flattenRules(result));
      return change ? { action: "reglas_editadas", entity: "reglas", entityId: null, entityLabel: "Reglas de la botica", ...change } : null;
    },
  }),
  createBranch: rule<"createBranch">({
    ok: ({ result }) => ({ action: "local_creado", entity: "local", entityId: result.branch.id, entityLabel: result.branch.name, branchId: result.branch.id, after: branchFields(result.branch) }),
  }),
  updateBranch: rule<"updateBranch", AuditFields | null>({
    before: (args, look) => {
      const b = look.branch(args[0]);
      return b ? branchFields(b) : null;
    },
    ok: ({ before, result }) => {
      const change = diffFields(before ?? {}, branchFields(result));
      return change ? { action: "local_editado", entity: "local", entityId: result.id, entityLabel: result.name, branchId: result.id, ...change } : null;
    },
  }),
  deactivateBranch: rule<"deactivateBranch", boolean>({
    // Si ya estaba desactivado, la llamada no hace nada y no se registra.
    before: (args, look) => look.branch(args[0])?.active ?? false,
    ok: ({ args, result, before }) => (before ? { action: "local_desactivado", entity: "local", entityId: result.id, entityLabel: result.name, branchId: result.id, before: { active: true }, after: { active: false, reason: args[1].trim() } } : null),
  }),
  activateBranch: rule<"activateBranch", boolean>({
    before: (args, look) => look.branch(args[0])?.active ?? true,
    ok: ({ result, before }) => (before ? null : { action: "local_activado", entity: "local", entityId: result.id, entityLabel: result.name, branchId: result.id, before: { active: false }, after: { active: true } }),
  }),
};

/** Envuelve el cliente: cada endpoint con regla deja su entrada después de completarse (y el ingreso fallido, al rechazarse). */
export function auditWrites(client: ApiClient, host: AuditHost): ApiClient {
  const wrapped = {} as Record<string, unknown>;
  for (const [name, fn] of Object.entries(client) as [string, (...a: unknown[]) => Promise<unknown>][]) {
    // Las reglas se escribieron con tipos exactos por endpoint; aquí se usan sin ellos porque recorremos todos por nombre.
    const r = (AUDIT_RULES as Record<string, Rule<keyof ApiClient, unknown> | undefined>)[name];
    if (!r) {
      wrapped[name] = fn;
      continue;
    }
    const record = (drafts: AuditDraft | AuditDraft[] | null | undefined, actor: AuditActor | null) => {
      const list = drafts ? (Array.isArray(drafts) ? drafts : [drafts]) : [];
      let written = false;
      for (const d of list) {
        const who = d.actor ?? actor;
        if (!who) continue;
        appendAudit(host.log(), d, who, Date.now());
        written = true;
      }
      if (written) host.commit();
    };
    wrapped[name] = async (...args: unknown[]) => {
      const look = host.look();
      const actor = host.actor();
      const a = args as never;
      const before = r.before?.(a, look);
      let result: unknown;
      try {
        result = await fn(...args);
      } catch (e) {
        if (r.fail && e instanceof ApiError) record(r.fail({ args: a, error: e, look }), actor);
        throw e;
      }
      record(r.ok?.({ args: a, result: result as never, before: before as never, look }), actor);
      return result;
    };
  }
  return wrapped as unknown as ApiClient;
}

/* ------------------------------ Historial de ejemplo ------------------------------ */

interface SeedInput {
  closings: { branchId: string; openedAt: string; openedBy: string; closedAt: string; closedBy: string; openingAmount: number; expected: number; counted: number; difference: number; tickets: number }[];
  staff: { id: string; name: string; role: Role; branchId: string | null }[];
  branches: { id: string; name: string }[];
  /** Hoy a las 00:00 */
  t0: number;
}

/** Historial para que la pantalla de auditoría no empiece vacía: ingresos y cajas de los últimos días, más algunos cambios del administrador. */
export function seedAudit({ closings, staff, branches, t0 }: SeedInput): AuditEntry[] {
  const DAY = 86_400_000;
  const drafts: { at: number; draft: AuditDraft; actor: AuditActor }[] = [];
  const actorByName = (name: string): AuditActor => {
    const s = staff.find((x) => x.name === name);
    return s ? sessionActor(s) : { id: null, name, role: null, branchId: null };
  };
  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? id;
  for (const c of closings) {
    const opener = actorByName(c.openedBy);
    const closer = actorByName(c.closedBy);
    const base = { entity: "caja" as const, entityId: c.branchId, entityLabel: branchName(c.branchId), branchId: c.branchId };
    drafts.push({ at: Date.parse(c.openedAt) - 4 * 60_000, actor: opener, draft: { action: "sesion_iniciada", entity: "sesion", entityId: opener.id, entityLabel: opener.name, branchId: c.branchId, after: { via: "pin" } } });
    drafts.push({ at: Date.parse(c.openedAt), actor: opener, draft: { ...base, action: "caja_abierta", after: { openingAmount: c.openingAmount } } });
    drafts.push({ at: Date.parse(c.closedAt), actor: closer, draft: { ...base, action: "caja_cerrada", after: { expected: c.expected, counted: c.counted, difference: c.difference, tickets: c.tickets } } });
  }
  const admin = staff.find((s) => s.role === "admin");
  if (admin) {
    const a = sessionActor(admin);
    const at = (daysAgo: number, hour: number) => t0 - daysAgo * DAY + hour * 3_600_000;
    for (const d of [1, 3, 5, 8, 10, 13]) drafts.push({ at: at(d, 7.5), actor: a, draft: { action: "sesion_iniciada", entity: "sesion", entityId: a.id, entityLabel: a.name, after: { via: "correo" } } });
    drafts.push({ at: at(9, 10), actor: a, draft: { action: "precio_cambiado", entity: "producto", entityId: "17", entityLabel: "Producto de ejemplo", before: { priceUnit: 0.5, priceBox: 12 }, after: { priceUnit: 0.6, priceBox: 15 } } });
    drafts.push({ at: at(6, 11), actor: a, draft: { action: "costo_cambiado", entity: "producto", entityId: "17", entityLabel: "Producto de ejemplo", before: { cost: 0.2 }, after: { cost: 0.25 } } });
    const enc = staff.find((s) => s.role === "encargado");
    if (enc) drafts.push({ at: at(12, 9), actor: a, draft: { action: "cuenta_editada", entity: "cuenta", entityId: enc.id, entityLabel: enc.name, branchId: enc.branchId, before: { active: true }, after: { active: true, pinChanged: true } } });
    drafts.push({ at: at(4, 16), actor: UNKNOWN_ACTOR, draft: { action: "sesion_fallida", entity: "sesion", entityId: null, entityLabel: "Ingreso del dueño", after: { via: "correo", email: "d***@botica.pe" } } });
  }
  return drafts
    .sort((x, y) => x.at - y.at)
    .map((d, i) => ({
      id: `a${i + 1}`, at: new Date(d.at).toISOString(), userId: d.actor.id, userName: d.actor.name, role: d.actor.role, branchId: d.draft.branchId ?? d.actor.branchId,
      action: d.draft.action, entity: d.draft.entity, entityId: d.draft.entityId, entityLabel: d.draft.entityLabel, before: d.draft.before ?? null, after: d.draft.after ?? null,
    }));
}
