/**
 * API simulada: guarda todo en localStorage del navegador y aplica las mismas reglas que debe aplicar el backend
 * (FEFO, stock, caja abierta, receta, series por local). Sirve para avanzar el front y para demos.
 */
import type { ApiClient, BranchStock, NewCustomer, PublicConfig } from "../contract";
import { ApiError } from "../errors";
import type { Branch, CashSession, Customer, ExpiryThresholds, KardexEntry, Lot, MoveType, Product, ProductInput, ProductVelocity, Sale, SaleRequest, Session, StaffSummary, User, Role } from "../types";
import { tokenStore } from "../token";
import { allocateFefo, daysUntil, findPresentation, isValidCmp, documentIsValid, parseDay, round2, IGV, weightedDiscount } from "@/lib/domain/pharmacy";
import { normalizeProduct, validateProduct } from "@/lib/domain/inventory";
import { SEED_DAILY_UNITS, SEED_LOT_PLAN, SEED_PRODUCTS, SEED_SUC_MISSING } from "./seed-data";

const KEY = "bh.mock.v1";
const VERSION = 3; // subir cuando cambie la forma de los datos: se regeneran
const DAY = 86_400_000;

interface StaffRecord extends StaffSummary {
  pin: string;
}

/** Movimiento de stock que no sale de una venta registrada (ingresos, bajas, devoluciones y el historial de ejemplo). */
interface StockMove {
  id: number;
  at: string;
  branchId: string;
  productId: number;
  lotId: number | null;
  lotCode: string | null;
  type: MoveType;
  delta: number; // + entra, − sale
  note: string;
  userName: string;
}

interface MockDb {
  version: typeof VERSION;
  expiry: ExpiryThresholds;
  pharmacy: PublicConfig["pharmacy"];
  branches: Branch[];
  staff: StaffRecord[];
  products: Product[];
  lots: Lot[];
  customers: Customer[];
  cash: Record<string, CashSession>;
  sales: Sale[];
  moves: StockMove[];
  seq: Record<string, { b: number; f: number }>;
  sessions: Record<string, string>; // token → userId
}

const PERMISSIONS: Record<Role, string[]> = {
  admin: ["panel", "pos", "vencimientos", "inventario", "traslados", "compras", "clientes", "caja", "asistencia", "reportes", "ajustes"],
  encargado: ["pos", "vencimientos", "inventario", "traslados", "compras", "clientes", "caja"],
};

/* Generador estable para que los datos de ejemplo sean iguales en cada carga */
const mulberry = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const isoDay = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const SUPPLIERS = ["Droguería Los Andes S.A.C.", "Distribuidora Farma Sur E.I.R.L.", "Corporación MediPerú S.A."];

/** Venta diaria de ejemplo; la sucursal vende menos y con otro ritmo por producto. */
const seedDailyRate = (branchId: string, productId: number) => {
  const base = SEED_DAILY_UNITS[productId] ?? 0;
  if (branchId === "principal") return base;
  const factor = [0.35, 0.5, 0.8, 1.6][productId % 4]!;
  return base * factor;
};

function seed(now: number): MockDb {
  const rnd = mulberry(20261023);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const t0 = today.getTime();
  const L = "ABCDEFGHJKLMNPRSTUVWXYZ";
  const code = () => `${L[Math.floor(rnd() * L.length)]}${L[Math.floor(rnd() * L.length)]}${Math.floor(rnd() * 90000) + 10000}`;
  const lots: Lot[] = [];
  let id = 1;
  for (const p of SEED_PRODUCTS) {
    const plan = SEED_LOT_PLAN[p.id] ?? [];
    for (const [dExp, qty, dIn, sup] of plan) {
      lots.push({
        id: id++, branchId: "principal", productId: p.id, code: code(), expiresOn: isoDay(t0 + dExp * DAY), qty, cost: p.cost, discount: 0,
        receivedOn: isoDay(t0 - dIn * DAY), supplier: SUPPLIERS[sup - 1] ?? null,
      });
    }
    if (SEED_SUC_MISSING.includes(p.id)) continue;
    plan.forEach(([dExp, qty, dIn, sup], i) => {
      const shift = ((p.id * 37 + i * 11) % 70) - 15;
      const step = Math.max(1, p.unitsPerBlister || 1);
      const q = p.unitsPerBox > 1 ? Math.round((qty * 0.33) / step) * step : Math.max(1, Math.round(qty * 0.4));
      if (q > 0)
        lots.push({
          id: id++, branchId: "sucursal", productId: p.id, code: code(), expiresOn: isoDay(t0 + (dExp < 0 ? dExp + 30 : dExp + shift) * DAY), qty: q, cost: p.cost, discount: 0,
          receivedOn: isoDay(t0 - Math.max(1, dIn - 2) * DAY), supplier: SUPPLIERS[sup - 1] ?? null,
        });
    });
  }
  const moves = seedHistory(lots, t0, rnd, code);
  const opened = new Date(t0 + 8 * 3600_000).toISOString();
  return {
    version: VERSION,
    expiry: { red: 30, yellow: 90 },
    pharmacy: { name: "Botica Huánuco", tagline: "Botica · Atención farmacéutica", ruc: "20609876543", phone: "987 654 321", brand: "#0B4F45", accent: "#3DDC97" },
    branches: [
      { id: "principal", name: "Principal", address: "Av. Los Próceres 1240", series: "001" },
      { id: "sucursal", name: "Sucursal", address: "Av. Canto Grande 3150", series: "002" },
    ],
    staff: [
      { id: "u1", name: "Carmen Salazar", role: "admin", branchId: null, pin: "1234" },
      { id: "u2", name: "Q.F. Daniel Rojas", role: "encargado", branchId: "principal", pin: "1111" },
      { id: "u3", name: "Q.F. Lucía Ramos", role: "encargado", branchId: "sucursal", pin: "2222" },
    ],
    products: SEED_PRODUCTS.map((p) => ({ ...p, minStockByBranch: { principal: p.minStock, sucursal: Math.ceil(p.minStock * 0.5) } })),
    lots,
    customers: [
      { id: 1, name: "Rosa Huamán Quispe", dni: "40125588", ruc: "", phone: "987 112 334", points: 64, chronicProductIds: [17, 18] },
      { id: 2, name: "Jorge Castillo Vega", dni: "09874521", ruc: "", phone: "956 330 118", points: 41, chronicProductIds: [21, 18] },
      { id: 3, name: "María Elena Paredes", dni: "45330987", ruc: "", phone: "945 671 220", points: 12, chronicProductIds: [19] },
      { id: 4, name: "Inversiones Salud Total S.A.C.", dni: "", ruc: "20601122334", phone: "01 330 4455", points: 0, chronicProductIds: [] },
    ],
    cash: {
      principal: { branchId: "principal", open: true, openedAt: opened, openingAmount: 150 },
      sucursal: { branchId: "sucursal", open: true, openedAt: opened, openingAmount: 150 },
    },
    sales: [],
    moves,
    seq: { principal: { b: 3120, f: 236 }, sucursal: { b: 1288, f: 54 } },
    sessions: {},
  };
}

const HISTORY_DAYS = 45;
const SELLER: Record<string, string> = { principal: "Q.F. Daniel Rojas", sucursal: "Q.F. Lucía Ramos" };

/**
 * Historial de ejemplo de los últimos días: ventas diarias (resumidas por día y lote, en orden FEFO) e ingresos de compra.
 * El ingreso de cada lote suma lo que queda más lo que se vendió de él, así el kardex cuadra con el stock actual.
 * Si un día no había lote disponible, la venta sale de un lote anterior ya agotado.
 */
function seedHistory(lots: Lot[], t0: number, rnd: () => number, code: () => string): StockMove[] {
  const moves: Omit<StockMove, "id">[] = [];
  const groups = new Map<string, Lot[]>();
  for (const l of lots) groups.set(`${l.branchId}:${l.productId}`, [...(groups.get(`${l.branchId}:${l.productId}`) ?? []), l]);
  for (const group of groups.values()) {
    const first = group[0]!;
    const rate = seedDailyRate(first.branchId, first.productId);
    const sorted = [...group].sort((a, b) => parseDay(a.expiresOn) - parseDay(b.expiresOn));
    const sold = new Map<number, number>();
    const oldCode = code();
    for (let d = HISTORY_DAYS; d >= 1; d--) {
      const day = t0 - d * DAY;
      const units = Math.round(rate * (0.55 + rnd() * 0.9));
      if (units <= 0) continue;
      const lot = sorted.find((l) => l.receivedOn !== null && parseDay(l.receivedOn) <= day && parseDay(l.expiresOn) >= day);
      if (lot) sold.set(lot.id, (sold.get(lot.id) ?? 0) + units);
      const tickets = Math.max(1, Math.round(units / Math.max(1, rate / 6)));
      moves.push({
        at: new Date(day + 21 * 3600_000).toISOString(), branchId: first.branchId, productId: first.productId, lotId: lot?.id ?? null, lotCode: lot?.code ?? oldCode,
        type: "venta", delta: -units, note: `Ventas del día · ${tickets} ${tickets === 1 ? "comprobante" : "comprobantes"}`, userName: SELLER[first.branchId] ?? "",
      });
    }
    for (const l of group) {
      if (!l.receivedOn) continue;
      const received = parseDay(l.receivedOn);
      if (received < t0 - HISTORY_DAYS * DAY) continue;
      moves.push({
        at: new Date(received + 9 * 3600_000 + 30 * 60_000).toISOString(), branchId: l.branchId, productId: l.productId, lotId: l.id, lotCode: l.code,
        type: "ingreso", delta: l.qty + (sold.get(l.id) ?? 0), note: `Compra a ${l.supplier ?? "proveedor"}`, userName: SELLER[l.branchId] ?? "",
      });
    }
  }
  return moves.sort((a, b) => a.at.localeCompare(b.at)).map((m, i) => ({ ...m, id: i + 1 }));
}

function load(): MockDb {
  if (typeof window === "undefined") return seed(Date.now());
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const db = JSON.parse(raw) as MockDb;
      if (db.version === VERSION) return db;
    }
  } catch {
    /* datos dañados o sin acceso: se regenera */
  }
  const db = seed(Date.now());
  save(db);
  return db;
}

function save(db: MockDb) {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    /* sin almacenamiento: sigue en memoria */
  }
}

const wait = (ms = 180 + Math.random() * 160) => new Promise((r) => setTimeout(r, ms));
const fail = (code: string, message: string, status = 400): never => {
  throw new ApiError({ code, message }, status);
};

/** Reglas para crear o editar un producto: solo el administrador, datos válidos y código de barras único. */
function checkProduct(u: StaffRecord, input: ProductInput, products: Product[], selfId?: number): ProductInput {
  if (u.role !== "admin") fail("SIN_PERMISO", "Solo el administrador puede cambiar el catálogo y los precios.", 403);
  const p = normalizeProduct(input);
  const errors = validateProduct(p, products, selfId);
  if (errors.barcode && p.barcode && products.some((o) => o.id !== selfId && o.barcode === p.barcode)) fail("CODIGO_DUPLICADO", errors.barcode, 409);
  const first = Object.values(errors)[0];
  if (first) fail("DATOS_INVALIDOS", first);
  return p;
}

export function createMockClient(): ApiClient {
  let db: MockDb | null = null;
  const get = () => (db ??= load());
  const commit = () => db && save(db);

  const currentUser = (): StaffRecord => {
    const token = tokenStore.get();
    const userId = token ? get().sessions[token] : undefined;
    const u = get().staff.find((s) => s.id === userId);
    if (!u) {
      tokenStore.clear();
      tokenStore.notifyExpired();
      return fail("NO_AUTORIZADO", "Tu sesión terminó. Vuelve a ingresar con tu PIN.", 401);
    }
    return u;
  };
  const toUser = (s: StaffRecord): User => ({ id: s.id, name: s.name, role: s.role, branchId: s.branchId, permissions: PERMISSIONS[s.role] });
  const assertBranch = (u: StaffRecord, branchId: string) => {
    if (u.role !== "admin" && u.branchId !== branchId) fail("SIN_PERMISO", "Tu cuenta solo puede operar en tu local.", 403);
  };

  return {
    async getPublicConfig() {
      await wait(80);
      const d = get();
      return { pharmacy: d.pharmacy, branches: d.branches, expiry: d.expiry };
    },
    async listStaff() {
      await wait(80);
      return get().staff.map(({ pin: _pin, ...s }) => s);
    },
    async login(userId, pin) {
      await wait(260);
      const s = get().staff.find((x) => x.id === userId);
      if (!s || s.pin !== pin) return fail("PIN_INVALIDO", "PIN incorrecto. Intenta de nuevo.", 401);
      const token = `mock.${userId}.${Date.now().toString(36)}`;
      get().sessions[token] = userId;
      commit();
      const session: Session = { token, user: toUser(s), expiresAt: new Date(Date.now() + 12 * 3600_000).toISOString() };
      return session;
    },
    async me() {
      await wait(60);
      return toUser(currentUser());
    },
    async logout() {
      const token = tokenStore.get();
      if (token) {
        delete get().sessions[token];
        commit();
      }
    },

    async listProducts() {
      await wait();
      currentUser();
      return get().products;
    },
    async listLots(branchId) {
      await wait();
      const u = currentUser();
      assertBranch(u, branchId);
      return get().lots.filter((l) => l.branchId === branchId && l.qty > 0);
    },
    async listBranchStock() {
      await wait(120);
      currentUser();
      const now = Date.now();
      const m = new Map<string, BranchStock>();
      for (const l of get().lots) {
        if (l.qty <= 0 || daysUntil(l.expiresOn, now) < 0) continue;
        const k = `${l.branchId}:${l.productId}`;
        const cur = m.get(k) ?? { branchId: l.branchId, productId: l.productId, units: 0 };
        cur.units += l.qty;
        m.set(k, cur);
      }
      return [...m.values()];
    },

    async createProduct(input) {
      await wait(260);
      const u = currentUser();
      const d = get();
      const p = checkProduct(u, input, d.products);
      const product: Product = { ...p, id: Math.max(0, ...d.products.map((x) => x.id)) + 1 };
      d.products.push(product);
      commit();
      return product;
    },
    async updateProduct(id, input) {
      await wait(260);
      const u = currentUser();
      const d = get();
      const i = d.products.findIndex((x) => x.id === id);
      if (i < 0) fail("PRODUCTO_NO_EXISTE", "El producto ya no existe.", 404);
      const product: Product = { ...checkProduct(u, input, d.products, id), id };
      d.products[i] = product;
      commit();
      return product;
    },
    async getKardex(productId, { branchId, days }) {
      await wait(180);
      const u = currentUser();
      if (branchId) assertBranch(u, branchId);
      else if (u.role !== "admin") fail("SIN_PERMISO", "Tu cuenta solo puede ver el kardex de tu local.", 403);
      const d = get();
      if (!d.products.some((p) => p.id === productId)) fail("PRODUCTO_NO_EXISTE", "El producto ya no existe.", 404);
      const span = Math.max(1, Math.min(365, Math.round(days)));
      const to = Date.now();
      const from = to - span * DAY;
      const inScope = (b: string) => !branchId || b === branchId;
      const entries: KardexEntry[] = [];
      for (const m of d.moves) {
        if (m.productId !== productId || !inScope(m.branchId) || new Date(m.at).getTime() < from) continue;
        entries.push({ id: `m${m.id}`, at: m.at, branchId: m.branchId, type: m.type, reference: m.note, lotCode: m.lotCode, delta: m.delta, userName: m.userName });
      }
      for (const s of d.sales) {
        if (!inScope(s.branchId) || new Date(s.createdAt).getTime() < from) continue;
        s.items.forEach((it, i) => {
          if (it.productId !== productId) return;
          entries.push({
            id: `${s.id}-${i}`, at: s.createdAt, branchId: s.branchId, type: "venta", reference: `${s.document.type === "factura" ? "Factura" : "Boleta"} ${s.number}`,
            lotCode: it.lots.map((l) => l.code).join(", ") || null, delta: -it.units, userName: s.sellerName,
          });
        });
      }
      entries.sort((a, b) => b.at.localeCompare(a.at));
      const closing = d.lots.filter((l) => l.productId === productId && inScope(l.branchId)).reduce((sum, l) => sum + l.qty, 0);
      return { productId, branchId: branchId ?? null, from: new Date(from).toISOString(), to: new Date(to).toISOString(), closing, entries };
    },

    async listVelocity(days) {
      await wait(140);
      currentUser();
      const d = get();
      const span = Math.max(1, Math.min(365, Math.round(days)));
      const from = Date.now() - span * DAY;
      const m = new Map<string, ProductVelocity>();
      const add = (branchId: string, productId: number, units: number) => {
        const k = `${branchId}:${productId}`;
        const v = m.get(k) ?? { branchId, productId, units: 0, days: span };
        v.units += units;
        m.set(k, v);
      };
      for (const mv of d.moves) if (mv.type === "venta" && new Date(mv.at).getTime() >= from) add(mv.branchId, mv.productId, -mv.delta);
      for (const sale of d.sales) {
        if (new Date(sale.createdAt).getTime() < from) continue;
        for (const it of sale.items) add(sale.branchId, it.productId, it.units);
      }
      return [...m.values()].filter((v) => v.units > 0);
    },
    async setLotDiscount(branchId, lotIds, discount) {
      await wait(220);
      assertBranch(currentUser(), branchId);
      if (!(discount >= 0 && discount <= 0.5)) fail("DATOS_INVALIDOS", "El descuento debe estar entre 0 % y 50 %.");
      const d = get();
      const ids = new Set(lotIds);
      const found = d.lots.filter((l) => ids.has(l.id));
      if (found.length !== ids.size || found.some((l) => l.branchId !== branchId)) fail("LOTE_NO_EXISTE", "Uno de los lotes no existe en este local.", 404);
      for (const l of found) l.discount = Math.round(discount * 100) / 100;
      commit();
      return found;
    },
    async writeOffLot(lotId, input) {
      await wait(260);
      const u = currentUser();
      const d = get();
      const lot = d.lots.find((l) => l.id === lotId) ?? fail("LOTE_NO_EXISTE", "El lote no existe.", 404);
      assertBranch(u, lot.branchId);
      if (!Number.isInteger(input.units) || input.units < 1) fail("DATOS_INVALIDOS", "Indica cuántas unidades salen del lote.");
      if (input.units > lot.qty) fail("STOCK_INSUFICIENTE", `El lote ${lot.code} solo tiene ${lot.qty} unidades.`, 409);
      if (input.note.trim().length < 3) fail("DATOS_INVALIDOS", "Escribe el motivo de la salida.");
      lot.qty -= input.units;
      d.moves.push({ id: d.moves.length + 1, at: new Date().toISOString(), branchId: lot.branchId, productId: lot.productId, lotId: lot.id, lotCode: lot.code, type: input.type, delta: -input.units, note: input.note.trim(), userName: u.name });
      commit();
      return lot;
    },

    async searchCustomers(query) {
      await wait(120);
      currentUser();
      const q = query.trim().toLowerCase();
      const list = get().customers;
      return (q ? list.filter((c) => c.name.toLowerCase().includes(q) || c.dni.includes(q) || c.ruc.includes(q)) : list).slice(0, 8);
    },
    async createCustomer(input: NewCustomer) {
      await wait();
      currentUser();
      if (!input.name || input.name.trim().length < 3) fail("DATOS_INVALIDOS", "Escribe el nombre completo del cliente.");
      const d = get();
      const c: Customer = { id: Math.max(0, ...d.customers.map((x) => x.id)) + 1, name: input.name.trim(), dni: input.dni ?? "", ruc: input.ruc ?? "", phone: input.phone ?? "", points: 0, chronicProductIds: [] };
      d.customers.push(c);
      commit();
      return c;
    },

    async getCashSession(branchId) {
      await wait(100);
      assertBranch(currentUser(), branchId);
      return get().cash[branchId] ?? { branchId, open: false, openedAt: null, openingAmount: 0 };
    },
    async openCash(branchId, amount) {
      await wait();
      assertBranch(currentUser(), branchId);
      const s: CashSession = { branchId, open: true, openedAt: new Date().toISOString(), openingAmount: amount };
      get().cash[branchId] = s;
      commit();
      return s;
    },

    async createSale(req: SaleRequest) {
      await wait(320);
      const u = currentUser();
      assertBranch(u, req.branchId);
      const d = get();
      if (!d.cash[req.branchId]?.open) fail("CAJA_CERRADA", "La caja de este local está cerrada. Ábrela para poder cobrar.");
      if (!req.items.length) fail("VENTA_VACIA", "Agrega al menos un producto.");
      const now = Date.now();
      const branchLots = d.lots.filter((l) => l.branchId === req.branchId);
      const taken = new Map<number, number>();
      const items = req.items.map((it) => {
        const p = d.products.find((x) => x.id === it.productId) ?? fail("PRODUCTO_NO_EXISTE", "Uno de los productos ya no existe.");
        const pres = findPresentation(p, it.presentation);
        const units = it.qty * pres.units;
        const { alloc, missing } = allocateFefo(branchLots, p.id, units, now, taken);
        if (missing > 0) fail("STOCK_INSUFICIENTE", `No hay stock suficiente de ${p.name} ${p.conc} en este local.`, 409);
        const discount = weightedDiscount(alloc, units);
        const total = round2(it.qty * pres.price * (1 - discount));
        return { p, line: { productId: p.id, presentation: pres.id, presentationLabel: pres.label, qty: it.qty, units, unitPrice: pres.price, discount, total, lots: alloc.map((a) => ({ lotId: a.lotId, code: a.code, expiresOn: a.expiresOn, units: a.units })) } };
      });
      const needsRx = items.some((x) => x.p.rx !== "libre");
      const needsControlled = items.some((x) => x.p.rx === "controlado");
      if (needsRx) {
        const rx = req.prescription;
        if (!rx || !rx.number.trim() || !rx.doctor.trim() || !isValidCmp(rx.cmp)) fail("RECETA_REQUERIDA", "Completa los datos de la receta: número, médico y CMP.");
      }
      const total = round2(items.reduce((s, x) => s + x.line.total, 0));
      if (!documentIsValid(req.document.type, req.document.customerDocId ?? "", req.document.customerName ?? "", total))
        fail("DOCUMENTO_INVALIDO", req.document.type === "factura" ? "La factura necesita un RUC válido y la razón social." : "Revisa el DNI del cliente.");
      if (req.payment.method === "efectivo" && (req.payment.received ?? 0) < total) fail("PAGO_INSUFICIENTE", "El monto recibido es menor que el total.");
      // En la botica, las cuentas de local son de químicos farmacéuticos: pueden dispensar controlados.
      const approvedBy = needsControlled ? u.name : null;

      for (const x of items) for (const a of x.line.lots) {
        const lot = d.lots.find((l) => l.id === a.lotId);
        if (lot) lot.qty -= a.units;
      }
      const branch = d.branches.find((b) => b.id === req.branchId)!;
      const sq = (d.seq[req.branchId] ??= { b: 0, f: 0 });
      const number = req.document.type === "factura" ? `F${branch.series}-${String(++sq.f).padStart(6, "0")}` : `B${branch.series}-${String(++sq.b).padStart(6, "0")}`;
      const taxBase = round2(total / (1 + IGV));
      const received = req.payment.method === "efectivo" ? req.payment.received ?? total : total;
      const sale: Sale = {
        id: `s_${now.toString(36)}`, branchId: req.branchId, number, createdAt: new Date(now).toISOString(), sellerName: u.name,
        items: items.map((x) => x.line), total, taxBase, igv: round2(total - taxBase),
        payment: { method: req.payment.method, received, change: round2(received - total), reference: req.payment.reference },
        document: req.document, customerId: req.customerId ?? null, prescription: needsRx ? req.prescription ?? null : null, approvedBy,
      };
      d.sales.push(sale);
      if (sale.customerId) {
        const c = d.customers.find((x) => x.id === sale.customerId);
        if (c) c.points += Math.floor(total / 10);
      }
      commit();
      return sale;
    },
  };
}

/** Para la pantalla de ajustes o pruebas: borra los datos simulados. */
export function resetMockData() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nada */
  }
}
