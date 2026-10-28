/**
 * API simulada: guarda todo en localStorage del navegador y aplica las mismas reglas que debe aplicar el backend
 * (FEFO, stock, caja abierta, receta, series por local). Sirve para avanzar el front y para demos.
 */
import type { ApiClient, BranchStock, NewCustomer, PublicConfig } from "../contract";
import { ApiError } from "../errors";
import type {
  SalesReportLine, AttendanceMark, AttendanceSettings, KioskWorker, Worker, CustomerPurchase, CustomerInput,
  Branch, CashClosing, CashMovement, CashSession, Customer, ExpiryThresholds, KardexEntry, Lot, MoveType, Product, ProductInput, ProductVelocity, Purchase, PurchasingSettings, Sale, SaleRequest, Session,
  StaffSummary, Supplier, SupplierInput, Transfer, TransferItem, User, Role, StaffAccount, AccountInput, BranchInput, RulesInput, Pharmacy, Plan,
} from "../types";
import { tokenStore } from "../token";
import { allocateFefo, daysUntil, findPresentation, isValidCmp, documentIsValid, parseDay, round2, IGV, weightedDiscount } from "@/lib/domain/pharmacy";
import { normalizeProduct, validateProduct } from "@/lib/domain/inventory";
import { isValidLotCode, isValidSupplierDocument, normalizeLotCode } from "@/lib/domain/purchasing";
import { transferActions, transferCode } from "@/lib/domain/transfers";
import { allowedMarks, scheduleError, MARK_LABEL } from "@/lib/domain/attendance";
import { pointsFor, validateCustomer } from "@/lib/domain/customers";
import { closeDifference, countDenominations, expectedCash, movementError, movementTotals, paymentTotals } from "@/lib/domain/cash";
import { accountErrors, accountGuard, branchErrors, branchSlug, deactivateBlockers, planUsage, hasErrors, normalizePharmacy, pharmacyErrors, rulesErrors } from "@/lib/domain/settings";
import { SEED_DAILY_UNITS, SEED_LOT_PLAN, SEED_PRODUCTS, SEED_SUC_MISSING } from "./seed-data";

const KEY = "bh.mock.v1";
const VERSION = 11; // subir cuando cambie la forma de los datos: se regeneran
const DAY = 86_400_000;

interface StaffRecord extends StaffSummary {
  pin: string;
  active: boolean;
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
  purchasing: PurchasingSettings;
  pharmacy: PublicConfig["pharmacy"];
  branches: Branch[];
  plan: Plan;
  staff: StaffRecord[];
  products: Product[];
  lots: Lot[];
  customers: Customer[];
  cash: Record<string, CashSession>;
  /** Movimientos del turno abierto de cada local. */
  cashMovements: Record<string, CashMovement[]>;
  closings: CashClosing[];
  attendanceSettings: AttendanceSettings;
  workers: (Worker & { pin: string })[];
  marks: AttendanceMark[];
  /** Compras anteriores de clientes (las nuevas salen de `sales`). */
  customerHistory: CustomerPurchase[];
  /** Avisos de recompra enviados: cliente:producto → fecha */
  contacts: Record<string, string>;
  sales: Sale[];
  moves: StockMove[];
  suppliers: Supplier[];
  purchases: Purchase[];
  transfers: Transfer[];
  seq: Record<string, { b: number; f: number }>;
  /** Correlativos de series que un local dejó de usar: "principal:001" → último emitido. Si vuelve a esa serie, sigue desde ahí. */
  seriesArchive: Record<string, { b: number; f: number }>;
  sessions: Record<string, string>; // token → userId
}

const PERMISSIONS: Record<Role, string[]> = {
  admin: ["panel", "pos", "vencimientos", "inventario", "traslados", "compras", "clientes", "caja", "asistencia", "reportes", "ajustes"],
  encargado: ["panel", "pos", "vencimientos", "inventario", "traslados", "compras", "clientes", "caja"],
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

const SEED_SUPPLIERS: Supplier[] = [
  { id: 1, name: "Droguería Los Andes S.A.C.", ruc: "20512345671", contact: "Rosa Quispe", phone: "01 445 2210", visitDays: "Lun · Jue", active: true },
  { id: 2, name: "Distribuidora Farma Sur E.I.R.L.", ruc: "20603456782", contact: "Jorge Medina", phone: "984 221 330", visitDays: "Mar · Vie", active: true },
  { id: 3, name: "Corporación MediPerú S.A.", ruc: "20487654323", contact: "Ana Torres", phone: "01 617 8800", visitDays: "Miércoles", active: true },
];
const SUPPLIERS = SEED_SUPPLIERS.map((x) => x.name);

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
  const purchases = seedPurchases(moves, lots, rnd);
  const transfers = seedTransfers(lots, moves, t0);
  const opened = new Date(t0 + 8 * 3600_000).toISOString();
  const db: MockDb = {
    version: VERSION,
    expiry: { red: 30, yellow: 90 },
    purchasing: { coverDays: 15, minShelfDays: 180 },
    pharmacy: { name: "Botica Huánuco", tagline: "Botica · Atención farmacéutica", ruc: "20609876543", phone: "987 654 321", brand: "#0B4F45", accent: "#3DDC97" },
    branches: [
      { id: "principal", name: "Principal", address: "Av. Los Próceres 1240", series: "001", active: true },
      { id: "sucursal", name: "Sucursal", address: "Av. Canto Grande 3150", series: "002", active: true },
    ],
    plan: { name: "Plan Crece", maxBranches: 3 },
    staff: [
      { id: "u1", name: "Carmen Salazar", role: "admin", branchId: null, pin: "1234", active: true },
      { id: "u2", name: "Q.F. Daniel Rojas", role: "encargado", branchId: "principal", pin: "1111", active: true },
      { id: "u3", name: "Q.F. Lucía Ramos", role: "encargado", branchId: "sucursal", pin: "2222", active: true },
    ],
    products: SEED_PRODUCTS.map((p) => ({ ...p, minStockByBranch: { principal: p.minStock, sucursal: Math.ceil(p.minStock * 0.5) } })),
    lots,
    customers: [],
    customerHistory: [],
    contacts: {},
    cash: {
      principal: { branchId: "principal", open: true, openedAt: opened, openedBy: "Q.F. Daniel Rojas", openingAmount: 150 },
      sucursal: { branchId: "sucursal", open: true, openedAt: opened, openedBy: "Q.F. Lucía Ramos", openingAmount: 150 },
    },
    cashMovements: {
      principal: [{ id: 1, at: new Date(t0 + 11 * 3600_000).toISOString(), type: "egreso", amount: 12, note: "Movilidad para recoger pedido", userName: "Q.F. Daniel Rojas" }],
      sucursal: [],
    },
    closings: [],
    attendanceSettings: { toleranceMinutes: 10, breakMinutes: 60, overtimeAfterMinutes: 15 },
    workers: SEED_WORKERS.map((w) => ({ ...w, schedule: { ...w.schedule, days: [...w.schedule.days] } })),
    marks: [],
    sales: [],
    moves,
    suppliers: SEED_SUPPLIERS.map((x) => ({ ...x })),
    purchases,
    transfers,
    seq: { principal: { b: 3120, f: 236 }, sucursal: { b: 1288, f: 54 } },
    seriesArchive: {},
    sessions: {},
  };
  seedTodaySales(db, t0, now, rnd);
  db.closings = seedClosings(db, t0, rnd);
  db.marks = seedMarks(db.workers, t0, now);
  seedCustomers(db, t0);
  return db;
}

/**
 * 12 clientes: con tratamientos continuos en distintos momentos (atrasados, hoy, por vencer, al día, sin compra),
 * uno sin consentimiento de contacto, una empresa con RUC y compradores frecuentes sin tratamiento.
 * El historial de compras es coherente con su ciclo.
 */
function seedCustomers(db: MockDb, t0: number) {
  const rnd = mulberry(5150);
  type Seed = { name: string; dni?: string; ruc?: string; phone: string; branch: string; consent: boolean; notes?: string; t?: [number, number, number, number][] }; // [producto, cada días, días desde la última compra, unidades]
  const seeds: Seed[] = [
    { name: "Rosa Huamán Quispe", dni: "40125588", phone: "987 112 334", branch: "principal", consent: true, notes: "Prefiere genérico. Viene los sábados.", t: [[17, 30, 28, 30], [18, 30, 28, 60]] },
    { name: "Jorge Castillo Vega", dni: "09874521", phone: "956 330 118", branch: "principal", consent: true, t: [[21, 30, 37, 1], [18, 30, 10, 60]] },
    { name: "María Elena Paredes", dni: "45330987", phone: "945 671 220", branch: "principal", consent: true, t: [[19, 30, 30, 30]] },
    { name: "Inversiones Salud Total S.A.C.", ruc: "20601122334", phone: "01 330 4455", branch: "principal", consent: false, notes: "Compra botiquines para su personal. Siempre factura." },
    { name: "Pedro Alvarado Cueto", dni: "22415903", phone: "964 228 017", branch: "principal", consent: false, notes: "No desea recibir mensajes.", t: [[20, 30, 25, 30], [17, 30, 31, 30]] },
    { name: "Carmen Ticse Laurente", dni: "41877652", phone: "991 540 286", branch: "principal", consent: true, t: [[22, 45, 44, 1]] },
    { name: "Luis Espinoza Robles", dni: "70122984", phone: "943 118 760", branch: "sucursal", consent: true, t: [[17, 30, 15, 30]] },
    { name: "Gladys Ponce Mallqui", dni: "22971340", phone: "962 004 551", branch: "sucursal", consent: true, t: [[19, 30, 33, 30]] },
    { name: "Teodoro Cárdenas Ríos", dni: "04011876", phone: "954 772 309", branch: "sucursal", consent: true, notes: "Insulina en refrigeración; llamar antes de que venga.", t: [[21, 30, 29, 1]] },
    { name: "Nancy Rivera Huaranga", dni: "46530218", phone: "987 650 443", branch: "sucursal", consent: true },
    { name: "Wilmer Soto Aguirre", dni: "71455320", phone: "972 336 115", branch: "sucursal", consent: true, notes: "Empieza tratamiento: primera compra pendiente.", t: [[18, 30, -1, 60]] },
    { name: "Sofía Chávez Durand", dni: "73810455", phone: "948 210 397", branch: "principal", consent: false },
  ];
  const product = new Map(db.products.map((p) => [p.id, p]));
  const priceOf = (pid: number, units: number) => {
    const p = product.get(pid)!;
    if (p.unitsPerBox > 1 && units % p.unitsPerBox === 0 && p.priceBox > 0) return { total: round2((units / p.unitsPerBox) * p.priceBox), qty: units / p.unitsPerBox, label: `Caja x${p.unitsPerBox}` };
    return { total: round2(units * p.priceUnit), qty: units, label: p.unitsPerBox === 1 ? p.unitName : "Unidad" };
  };
  const extras = [1, 3, 5, 11, 13, 23, 27, 30, 31];
  const history: Omit<CustomerPurchase, "number">[] = [];
  seeds.forEach((sd, i) => {
    const id = i + 1;
    for (const [pid, every, last, units] of sd.t ?? []) {
      if (last < 0) continue;
      for (let k = 0, ago = last; ago <= 150; k++, ago += every + (k ? Math.round(rnd() * 4 - 2) : 0)) {
        const at = t0 - ago * DAY + (10 + Math.floor(rnd() * 9)) * 3600_000;
        const pr = priceOf(pid, units);
        history.push({ saleId: `h${id}-${pid}-${k}`, branchId: sd.branch, at: new Date(at).toISOString(), total: pr.total, items: [{ productId: pid, units, total: pr.total, presentationLabel: pr.label, qty: pr.qty }] });
      }
    }
    const extraVisits = sd.ruc ? 5 : sd.t ? 2 : 6;
    for (let k = 0; k < extraVisits; k++) {
      const ago = 2 + Math.floor(rnd() * 120);
      const pid = extras[Math.floor(rnd() * extras.length)]!;
      const p = product.get(pid)!;
      const units = sd.ruc ? Math.max(1, p.unitsPerBox) * 2 : p.unitsPerBlister > 1 ? p.unitsPerBlister : 1;
      const pr = priceOf(pid, units);
      history.push({ saleId: `x${id}-${k}`, branchId: sd.branch, at: new Date(t0 - ago * DAY + (9 + Math.floor(rnd() * 10)) * 3600_000).toISOString(), total: pr.total, items: [{ productId: pid, units, total: pr.total, presentationLabel: pr.label, qty: pr.qty }] });
    }
  });
  history.sort((a, b) => a.at.localeCompare(b.at));
  const seq: Record<string, number> = { principal: 1900, sucursal: 700 };
  db.customerHistory = history.map((h) => {
    const series = db.branches.find((b) => b.id === h.branchId)?.series ?? "001";
    return { ...h, number: `B${series}-${String(++seq[h.branchId]!).padStart(6, "0")}` };
  });
  db.customers = seeds.map((sd, i) => {
    const id = i + 1;
    const mine = history.filter((h) => h.saleId.startsWith(`h${id}-`) || h.saleId.startsWith(`x${id}-`));
    const first = mine[0]?.at ?? new Date(t0 - 30 * DAY).toISOString();
    return {
      id, name: sd.name, dni: sd.dni ?? "", ruc: sd.ruc ?? "", phone: sd.phone, points: mine.reduce((a, h) => a + pointsFor(h.total), 0),
      treatments: (sd.t ?? []).map(([productId, everyDays]) => ({ productId, everyDays })), contactConsent: sd.consent, notes: sd.notes ?? "", createdAt: first,
    };
  });
  // Gladys ya fue avisada ayer: no se le debe repetir el mensaje
  db.contacts["8:19"] = new Date(t0 - DAY + 17 * 3600_000).toISOString();
}

/** Compras del cliente: historial de ejemplo más las ventas con el cliente asignado. */
function purchasesOf(d: MockDb, customerId: number): CustomerPurchase[] {
  const fromSales: CustomerPurchase[] = d.sales
    .filter((s) => s.customerId === customerId)
    .map((s) => ({ saleId: s.id, number: s.number, branchId: s.branchId, at: s.createdAt, total: s.total, items: s.items.map((it) => ({ productId: it.productId, units: it.units, total: it.total, presentationLabel: it.presentationLabel, qty: it.qty })) }));
  const idPrefix = [`h${customerId}-`, `x${customerId}-`];
  const history = d.customerHistory.filter((h) => idPrefix.some((p) => h.saleId.startsWith(p)) || (h as CustomerPurchase & { customerId?: number }).customerId === customerId);
  return [...fromSales, ...history].sort((a, b) => b.at.localeCompare(a.at));
}

const SEED_WORKERS: (Worker & { pin: string })[] = [
  { id: "w1", name: "Q.F. Daniel Rojas", role: "Químico farmacéutico", branchId: "principal", pin: "4101", schedule: { start: "08:00", end: "16:00", days: [1, 2, 3, 4, 5, 6] }, active: true },
  { id: "w2", name: "Milagros Pérez", role: "Técnica en farmacia", branchId: "principal", pin: "4102", schedule: { start: "08:00", end: "16:00", days: [1, 2, 3, 4, 5, 6] }, active: true },
  { id: "w3", name: "José Huamán", role: "Técnico en farmacia", branchId: "principal", pin: "4103", schedule: { start: "14:00", end: "22:00", days: [1, 2, 3, 4, 5, 6] }, active: true },
  { id: "w4", name: "Rocío Vargas", role: "Cajera", branchId: "principal", pin: "4104", schedule: { start: "14:00", end: "22:00", days: [0, 2, 3, 4, 5, 6] }, active: true },
  { id: "w5", name: "Q.F. Lucía Ramos", role: "Químico farmacéutico", branchId: "sucursal", pin: "4201", schedule: { start: "09:00", end: "17:00", days: [1, 2, 3, 4, 5, 6] }, active: true },
  { id: "w6", name: "Ana Quispe", role: "Técnica en farmacia", branchId: "sucursal", pin: "4202", schedule: { start: "09:00", end: "17:00", days: [0, 1, 2, 3, 4, 5] }, active: true },
  { id: "w7", name: "Kevin Torres", role: "Técnico en farmacia", branchId: "sucursal", pin: "4203", schedule: { start: "14:00", end: "22:00", days: [1, 2, 3, 4, 5, 6] }, active: true },
];

/** 30 días de marcas con un poco de todo: puntuales, tardanzas, faltas, horas extra, un olvido de salida y una marca manual. */
function seedMarks(workers: Worker[], t0: number, now: number): AttendanceMark[] {
  const rnd = mulberry(77031);
  const gauss = () => (rnd() + rnd() + rnd() - 1.5) / 1.5;
  const marks: AttendanceMark[] = [];
  const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
  const push = (w: Worker, t: number, type: AttendanceMark["type"], extra: Partial<AttendanceMark> = {}) => {
    if (t <= now) marks.push({ id: marks.length + 1, workerId: w.id, branchId: w.branchId, at: new Date(t).toISOString(), type, manual: false, note: "", registeredBy: null, ...extra });
  };
  for (let d = 30; d >= 0; d--) {
    const day = new Date(t0 - d * DAY + 12 * 3600_000);
    day.setHours(0, 0, 0, 0);
    const dayStart = day.getTime();
    for (const w of workers) {
      if (!w.schedule.days.includes(day.getDay())) continue;
      if ((w.id === "w4" && (d === 9 || d === 23)) || (w.id === "w7" && d === 16) || (w.id === "w6" && d === 0) || (d > 0 && rnd() < 0.015)) continue;
      const start = dayStart + toMin(w.schedule.start) * 60_000;
      const end = dayStart + toMin(w.schedule.end) * 60_000;
      const prone = w.id === "w3" ? 0.32 : w.id === "w7" ? 0.18 : 0.08;
      const forcedLate = w.id === "w2" && d === 0;
      const late = forcedLate || rnd() < prone;
      const inMin = forcedLate ? 17 : late ? 11 + rnd() * 22 : -3 - Math.abs(gauss() * 9);
      const tIn = start + inMin * 60_000;
      if (w.id === "w2" && d === 5) push(w, tIn, "entrada", { manual: true, note: "Olvidó marcar; validado por el administrador", registeredBy: "Carmen Salazar" });
      else push(w, tIn, "entrada");
      const tBreak = start + (240 + gauss() * 20) * 60_000;
      const breakLen = 42 + rnd() * 22;
      push(w, tBreak, "ref_ini");
      push(w, tBreak + breakLen * 60_000, "ref_fin");
      if (w.id === "w3" && d === 3) continue; // olvidó marcar la salida
      const extra = rnd() < 0.1 ? 30 + rnd() * 50 : -2 + Math.abs(gauss() * 10);
      push(w, end + extra * 60_000, "salida");
    }
  }
  return marks.sort((a, b) => a.at.localeCompare(b.at)).map((m, i) => ({ ...m, id: i + 1 }));
}

const DOCTORS = [["Dra. Lucía Fernández", "45123"], ["Dr. Martín Soto", "38207"], ["Dra. Patricia Inga", "51960"]] as const;

/**
 * Ventas reales de hoy desde que se abrió la caja, para que el turno no empiece vacío.
 * Descuentan stock por FEFO igual que una venta normal.
 */
function seedTodaySales(db: MockDb, t0: number, now: number, rnd: () => number) {
  const start = t0 + 8 * 3600_000 + 20 * 60_000;
  const end = Math.min(now - 5 * 60_000, t0 + 20 * 3600_000);
  if (end <= start) return;
  const popular = SEED_PRODUCTS.filter((p) => (SEED_DAILY_UNITS[p.id] ?? 0) >= 3);
  for (const branch of db.branches) {
    const count = Math.round(((end - start) / 3600_000) * (branch.id === "principal" ? 2.2 : 1.3));
    const times = Array.from({ length: count }, () => start + rnd() * (end - start)).sort((a, b) => a - b);
    for (const at of times) {
      const taken = new Map<number, number>();
      const lines = Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => popular[Math.floor(rnd() * popular.length)]!);
      const items: Sale["items"] = [];
      for (const p of [...new Set(lines)]) {
        const pres = findPresentation(p, p.unitsPerBlister > 1 && rnd() < 0.5 ? "blister" : "unidad");
        const qty = pres.id === "unidad" && p.unitsPerBox > 1 ? 2 + Math.floor(rnd() * 8) : 1;
        const units = qty * pres.units;
        const { alloc, missing } = allocateFefo(db.lots.filter((l) => l.branchId === branch.id), p.id, units, at, taken);
        if (missing > 0) continue;
        for (const a of alloc) db.lots.find((l) => l.id === a.lotId)!.qty -= a.units;
        const discount = weightedDiscount(alloc, units);
        items.push({ productId: p.id, presentation: pres.id, presentationLabel: pres.label, qty, units, unitPrice: pres.price, discount, total: round2(qty * pres.price * (1 - discount)), lots: alloc.map((a) => ({ lotId: a.lotId, code: a.code, expiresOn: a.expiresOn, units: a.units })) });
      }
      if (!items.length) continue;
      const total = round2(items.reduce((a, it) => a + it.total, 0));
      const r = rnd();
      const method = r < 0.58 ? "efectivo" : r < 0.9 ? "yape" : "tarjeta";
      const received = method === "efectivo" ? Math.max(total, Math.ceil(total / 10) * 10) : total;
      const needsRx = items.some((it) => SEED_PRODUCTS.find((p) => p.id === it.productId)?.rx !== "libre");
      const doc = DOCTORS[Math.floor(rnd() * DOCTORS.length)]!;
      const sq = db.seq[branch.id]!;
      const taxBase = round2(total / (1 + IGV));
      db.sales.push({
        id: `s_seed_${branch.id}_${db.sales.length}`, branchId: branch.id, number: `B${branch.series}-${String(++sq.b).padStart(6, "0")}`, createdAt: new Date(at).toISOString(),
        sellerName: SELLER[branch.id] ?? "", items, total, taxBase, igv: round2(total - taxBase),
        payment: { method, received, change: round2(received - total) }, document: { type: "boleta" }, customerId: null,
        prescription: needsRx ? { number: `R-${10000 + Math.floor(rnd() * 89999)}`, doctor: doc[0], cmp: doc[1] } : null, approvedBy: null,
      });
    }
  }
}

/** Cierres de los últimos 14 días, con importes coherentes con la venta de cada día. */
function seedClosings(db: MockDb, t0: number, rnd: () => number): CashClosing[] {
  const price = new Map(SEED_PRODUCTS.map((p) => [p.id, p.priceUnit]));
  const out: CashClosing[] = [];
  let id = 1;
  for (let d = 14; d >= 1; d--) {
    const day = t0 - d * DAY;
    for (const branch of db.branches) {
      const revenue = db.moves.filter((m) => m.type === "venta" && m.branchId === branch.id && m.at.slice(0, 10) === new Date(day + 21 * 3600_000).toISOString().slice(0, 10)).reduce((a, m) => a + -m.delta * (price.get(m.productId) ?? 0), 0);
      const efectivo = round2(revenue * (0.52 + rnd() * 0.1));
      const tarjeta = round2(revenue * (0.06 + rnd() * 0.06));
      const yape = round2(revenue - efectivo - tarjeta);
      const movements: CashMovement[] = rnd() < 0.6 ? [{ id: 1, at: new Date(day + 13 * 3600_000).toISOString(), type: "egreso", amount: round2(5 + Math.floor(rnd() * 6) * 2.5), note: rnd() < 0.5 ? "Movilidad" : "Útiles de limpieza", userName: SELLER[branch.id] ?? "" }] : [];
      if (branch.id === "principal" && d % 3 === 0) movements.push({ id: 2, at: new Date(day + 17 * 3600_000).toISOString(), type: "retiro", amount: 300, note: "Retiro para depósito en banco", userName: "Carmen Salazar" });
      const m = movementTotals(movements);
      const expected = expectedCash(150, efectivo, movements);
      const roll = rnd();
      const counted = round2(expected + (roll < 0.7 ? 0 : roll < 0.85 ? -2.5 : roll < 0.95 ? 0.3 : -10));
      const { difference } = closeDifference(counted, expected);
      out.push({
        id: id++, branchId: branch.id, openedAt: new Date(day + 8 * 3600_000).toISOString(), openedBy: SELLER[branch.id] ?? "", closedAt: new Date(day + 21 * 3600_000 + 10 * 60_000).toISOString(), closedBy: SELLER[branch.id] ?? "",
        openingAmount: 150, sales: { efectivo, yape, tarjeta }, tickets: Math.max(1, Math.round(revenue / 9)), ...m, expected, counted, difference, denominations: {},
        note: Math.abs(difference) >= 1 ? (difference < 0 ? "Vuelto mal dado en hora punta" : "Cliente dejó el vuelto") : "", movements,
      });
    }
  }
  return out;
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

/** Agrupa los ingresos de ejemplo en compras (una por local, proveedor y día) y pone el documento en el kardex. */
function seedPurchases(moves: StockMove[], lots: Lot[], rnd: () => number): Purchase[] {
  const groups = new Map<string, StockMove[]>();
  for (const m of moves) {
    if (m.type !== "ingreso") continue;
    const lot = lots.find((l) => l.id === m.lotId);
    const k = `${m.branchId}|${lot?.supplier ?? ""}|${m.at.slice(0, 10)}`;
    groups.set(k, [...(groups.get(k) ?? []), m]);
  }
  let id = 1;
  const out: Purchase[] = [];
  for (const [k, ms] of [...groups].sort((a, b) => a[1][0]!.at.localeCompare(b[1][0]!.at))) {
    const [branchId, supplierName] = k.split("|") as [string, string];
    const supplier = SEED_SUPPLIERS.find((x) => x.name === supplierName) ?? SEED_SUPPLIERS[0]!;
    const document = `F${String(supplier.id).padStart(3, "0")}-${String(10_000 + Math.floor(rnd() * 80_000)).padStart(8, "0")}`;
    const items = ms.map((m) => {
      const lot = lots.find((l) => l.id === m.lotId)!;
      m.note = `Compra ${document} · ${supplier.name}`;
      return { productId: m.productId, lotId: lot.id, lotCode: lot.code, expiresOn: lot.expiresOn, units: m.delta, unitCost: lot.cost, subtotal: round2(m.delta * lot.cost) };
    });
    const subtotal = round2(items.reduce((a, it) => a + it.subtotal, 0));
    const igv = round2(subtotal * IGV);
    out.push({ id: id++, branchId, supplierId: supplier.id, supplierName: supplier.name, document, receivedAt: ms[0]!.at, userName: ms[0]!.userName, items, subtotal, igv, total: round2(subtotal + igv) });
  }
  return out;
}

const BRANCH_NAME: Record<string, string> = { principal: "Principal", sucursal: "Sucursal" };

/** Saca unidades de lotes del origen por FEFO (o del lote indicado) y devuelve lo que viaja. */
function takeFromLots(lots: Lot[], branchId: string, productId: number, units: number, now: number, lotId?: number | null): { items: TransferItem[]; missing: number } {
  const source = lotId ? lots.filter((l) => l.id === lotId && l.branchId === branchId && l.productId === productId && l.qty > 0 && daysUntil(l.expiresOn, now) >= 0) : lots.filter((l) => l.branchId === branchId);
  const { alloc, missing } = lotId ? { alloc: source.map((l) => ({ lotId: l.id, units: Math.min(l.qty, units) })), missing: Math.max(0, units - (source[0]?.qty ?? 0)) } : allocateFefo(source, productId, units, now);
  const items: TransferItem[] = [];
  for (const a of alloc) {
    const lot = lots.find((l) => l.id === a.lotId)!;
    lot.qty -= a.units;
    items.push({ productId, units: a.units, lotId: lot.id, lotCode: lot.code, expiresOn: lot.expiresOn, unitCost: lot.cost });
  }
  return { items, missing };
}

/** El stock entra al destino con el mismo lote: se suma si ya existe con igual vencimiento, si no se crea. */
function putIntoLots(lots: Lot[], branchId: string, items: TransferItem[], day: string, nextId: () => number): { lot: Lot; it: TransferItem }[] {
  return items.map((it) => {
    const origin = lots.find((l) => l.id === it.lotId);
    let lot = lots.find((l) => l.branchId === branchId && l.productId === it.productId && l.code === it.lotCode && l.expiresOn === it.expiresOn);
    if (lot) {
      lot.cost = Math.round(((lot.cost * lot.qty + (it.unitCost ?? lot.cost) * it.units) / Math.max(1, lot.qty + it.units)) * 10000) / 10000;
      lot.qty += it.units;
    } else {
      lot = { id: nextId(), branchId, productId: it.productId, code: it.lotCode ?? "S/L", expiresOn: it.expiresOn!, qty: it.units, cost: it.unitCost ?? 0, discount: 0, receivedOn: day, supplier: origin?.supplier ?? null };
      lots.push(lot);
    }
    return { lot, it };
  });
}

/** Tres traslados de ejemplo: uno recibido, uno en camino a la sucursal y un pedido de la sucursal. */
function seedTransfers(lots: Lot[], moves: StockMove[], t0: number): Transfer[] {
  const out: Transfer[] = [];
  let moveId = Math.max(0, ...moves.map((m) => m.id));
  let lotId = Math.max(0, ...lots.map((l) => l.id));
  const base = (id: number, from: string, to: string, at: number, by: string, note: string): Transfer => ({
    id, code: transferCode(id), fromBranchId: from, toBranchId: to, status: "en_transito", note, requested: null, items: [], createdAt: new Date(at).toISOString(), createdBy: by,
    dispatchedAt: new Date(at).toISOString(), dispatchedBy: by, receivedAt: null, receivedBy: null, cancelledAt: null, cancelledBy: null, cancelReason: null,
  });
  const dispatch = (t: Transfer, productId: number, units: number, at: number) => {
    const { items } = takeFromLots(lots, t.fromBranchId, productId, units, at);
    for (const it of items)
      moves.push({ id: ++moveId, at: new Date(at).toISOString(), branchId: t.fromBranchId, productId, lotId: it.lotId, lotCode: it.lotCode, type: "traslado_salida", delta: -it.units, note: `Traslado ${t.code} a ${BRANCH_NAME[t.toBranchId]}`, userName: t.dispatchedBy ?? "" });
    t.items.push(...items);
  };

  // 1. Recibido hace 5 días: Principal → Sucursal
  const at1 = t0 - 5 * DAY + 10 * 3600_000;
  const t1 = base(1, "principal", "sucursal", at1, SELLER.principal!, "Reposición semanal");
  dispatch(t1, 3, 100, at1);
  dispatch(t1, 13, 50, at1);
  const rec1 = at1 + 4 * 3600_000;
  for (const { lot, it } of putIntoLots(lots, "sucursal", t1.items, isoDay(rec1), () => ++lotId))
    moves.push({ id: ++moveId, at: new Date(rec1).toISOString(), branchId: "sucursal", productId: it.productId, lotId: lot.id, lotCode: lot.code, type: "traslado_ingreso", delta: it.units, note: `Traslado ${t1.code} desde Principal`, userName: SELLER.sucursal! });
  Object.assign(t1, { status: "recibido", receivedAt: new Date(rec1).toISOString(), receivedBy: SELLER.sucursal });
  out.push(t1);

  // 2. En camino desde ayer: Principal → Sucursal
  const at2 = t0 - DAY + 16 * 3600_000;
  const t2 = base(2, "principal", "sucursal", at2, SELLER.principal!, "Lo lleva el motorizado");
  dispatch(t2, 18, 60, at2);
  out.push(t2);

  // 3. Pedido de la Sucursal a la Principal, hoy
  const at3 = t0 + 9 * 3600_000;
  out.push({ ...base(3, "principal", "sucursal", at3, SELLER.sucursal!, "Se nos acabó, hay clientes esperando"), status: "solicitado", dispatchedAt: null, dispatchedBy: null, requested: [{ productId: 21, units: 6 }, { productId: 34, units: 20 }] });
  return out;
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

/** Reglas para crear o editar un proveedor: solo el administrador, RUC válido y no repetido. */
function checkSupplier(u: StaffRecord, input: SupplierInput, list: Supplier[], selfId?: number): SupplierInput {
  if (u.role !== "admin") fail("SIN_PERMISO", "Solo el administrador puede cambiar los proveedores.", 403);
  const s: SupplierInput = { ...input, name: input.name.trim(), ruc: input.ruc.trim(), contact: input.contact.trim(), phone: input.phone.trim(), visitDays: input.visitDays.trim() };
  if (s.name.length < 3) fail("DATOS_INVALIDOS", "Escribe la razón social.");
  if (!/^(10|20)\d{9}$/.test(s.ruc)) fail("DATOS_INVALIDOS", "El RUC debe tener 11 dígitos y empezar en 10 o 20.");
  if (list.some((x) => x.id !== selfId && x.ruc === s.ruc)) fail("RUC_DUPLICADO", "Ya hay un proveedor con ese RUC.", 409);
  return s;
}

/** El local existe y está activo (para todo lo que mueve stock, caja o personal). */
function assertOpen(d: MockDb, branchId: string) {
  const b = d.branches.find((x) => x.id === branchId) ?? fail("DATOS_INVALIDOS", "El local no existe.");
  if (!b.active) fail("LOCAL_INACTIVO", `El local ${b.name} está desactivado.`, 409);
  return b;
}
const activeBranches = (d: MockDb) => d.branches.filter((b) => b.active);

function checkRoute(d: MockDb, from: string, to: string) {
  if (from === to) fail("DATOS_INVALIDOS", "El origen y el destino deben ser locales distintos.");
  assertOpen(d, from);
  assertOpen(d, to);
}

function newTransfer(d: MockDb, u: StaffRecord, from: string, to: string, note: string, now: number): Transfer {
  const id = Math.max(0, ...d.transfers.map((t) => t.id)) + 1;
  return {
    id, code: transferCode(id), fromBranchId: from, toBranchId: to, status: "solicitado", note: note.trim(), requested: null, items: [], createdAt: new Date(now).toISOString(), createdBy: u.name,
    dispatchedAt: null, dispatchedBy: null, receivedAt: null, receivedBy: null, cancelledAt: null, cancelledBy: null, cancelReason: null,
  };
}

/** Registra en el kardex del origen la salida de cada lote. */
function recordExit(d: MockDb, t: Transfer, userName: string, now: number) {
  let moveId = Math.max(0, ...d.moves.map((m) => m.id));
  for (const it of t.items)
    d.moves.push({ id: ++moveId, at: new Date(now).toISOString(), branchId: t.fromBranchId, productId: it.productId, lotId: it.lotId, lotCode: it.lotCode, type: "traslado_salida", delta: -it.units, note: `Traslado ${t.code} a ${BRANCH_NAME[t.toBranchId] ?? t.toBranchId}`, userName });
}

const closedSession = (branchId: string): CashSession => ({ branchId, open: false, openedAt: null, openedBy: null, openingAmount: 0 });

/** Ventas y movimientos del turno abierto y el efectivo que debe haber. */
function summaryOf(d: MockDb, branchId: string) {
  const session = d.cash[branchId] ?? closedSession(branchId);
  const since = session.openedAt ? new Date(session.openedAt).getTime() : Number.POSITIVE_INFINITY;
  const sales = d.sales
    .filter((s) => s.branchId === branchId && new Date(s.createdAt).getTime() >= since)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((s) => ({ id: s.id, number: s.number, createdAt: s.createdAt, total: s.total, method: s.payment.method, sellerName: s.sellerName, hasPrescription: !!s.prescription }));
  const totals = paymentTotals(sales);
  const movements = session.open ? (d.cashMovements[branchId] ?? []) : [];
  return { session, sales, totals: { ...totals, tickets: sales.length }, movements: [...movements].reverse(), expected: session.open ? expectedCash(session.openingAmount, totals.efectivo, movements) : 0 };
}

function requireAdmin(u: StaffRecord, what = "la asistencia") {
  if (u.role !== "admin") fail("SIN_PERMISO", `Solo el administrador puede ver y cambiar ${what}.`, 403);
}

function checkAccount(d: MockDb, input: AccountInput, selfId: string | null, currentUserId: string): Omit<StaffAccount, "id"> {
  const a = { name: input.name.trim(), role: input.role, branchId: input.role === "admin" ? null : input.branchId, active: input.active };
  if (a.role !== "admin" && a.role !== "encargado") fail("DATOS_INVALIDOS", "Elige el rol.");
  const accounts = d.staff.map(({ pin: _pin, ...s }) => s);
  const e = accountErrors({ ...input, name: a.name }, accounts, activeBranches(d), selfId);
  if (hasErrors(e)) fail("DATOS_INVALIDOS", Object.values(e)[0]!);
  const guard = accountGuard(accounts, selfId, { ...input, branchId: a.branchId }, currentUserId);
  if (guard) fail("CUENTA_PROTEGIDA", guard, 409);
  return a;
}

const todayMarks = (d: MockDb, workerId: string, dayStart: number) =>
  d.marks.filter((m) => m.workerId === workerId && new Date(m.at).getTime() >= dayStart && new Date(m.at).getTime() < dayStart + DAY).sort((a, b) => a.at.localeCompare(b.at));

function checkWorker(d: MockDb, input: Omit<Worker, "id">, selfId?: string): Omit<Worker, "id"> {
  const w = { name: input.name.trim(), role: input.role.trim(), branchId: input.branchId, schedule: { start: input.schedule.start, end: input.schedule.end, days: [...new Set(input.schedule.days)].sort() }, active: input.active };
  if (w.name.length < 3) fail("DATOS_INVALIDOS", "Escribe el nombre completo.");
  if (!w.role) fail("DATOS_INVALIDOS", "Escribe el cargo.");
  if (!activeBranches(d).some((b) => b.id === w.branchId)) fail("DATOS_INVALIDOS", "Elige un local activo.");
  const err = scheduleError(w.schedule);
  if (err) fail("DATOS_INVALIDOS", err);
  if (d.workers.some((x) => x.id !== selfId && x.name.toLowerCase() === w.name.toLowerCase())) fail("DATOS_INVALIDOS", "Ya hay un trabajador con ese nombre.");
  return w;
}

export function createMockClient(): ApiClient {
  let db: MockDb | null = null;
  const get = () => (db ??= load());
  const commit = () => db && save(db);

  const currentUser = (): StaffRecord => {
    const token = tokenStore.get();
    const userId = token ? get().sessions[token] : undefined;
    const u = get().staff.find((s) => s.id === userId && s.active);
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
      return { pharmacy: d.pharmacy, branches: activeBranches(d), closedBranches: d.branches.filter((b) => !b.active), plan: d.plan, expiry: d.expiry, purchasing: d.purchasing, attendance: d.attendanceSettings };
    },
    async updatePharmacy(input) {
      await wait(200);
      requireAdmin(currentUser(), "los datos de la botica");
      const p: Pharmacy = normalizePharmacy(input);
      const e = pharmacyErrors(p);
      if (hasErrors(e)) fail("DATOS_INVALIDOS", Object.values(e)[0]!);
      const d = get();
      d.pharmacy = p;
      commit();
      return p;
    },
    async createBranch(input) {
      await wait(260);
      const u = currentUser();
      requireAdmin(u, "los locales");
      const d = get();
      if (!planUsage(d.branches, d.plan.maxBranches).canAdd) fail("LIMITE_DEL_PLAN", `Tu ${d.plan.name} permite ${d.plan.maxBranches} locales activos. Para abrir otro, amplía el plan o desactiva uno.`, 409);
      const next: BranchInput = { name: input.name.trim(), address: input.address.trim(), series: input.series };
      const e = branchErrors(next, d.branches, "");
      if (hasErrors(e)) fail("DATOS_INVALIDOS", Object.values(e)[0]!);
      const id = branchSlug(next.name, d.branches.map((b) => b.id));
      const accounts = d.staff.map(({ pin: _pin, ...s }) => s);
      const accInput: AccountInput | null = input.account ? { name: input.account.name.trim(), role: "encargado", branchId: id, pin: input.account.pin, active: true } : null;
      if (accInput) {
        const ae = accountErrors(accInput, accounts, [...d.branches, { id, ...next, active: true }], null);
        if (hasErrors(ae)) fail("DATOS_INVALIDOS", `Cuenta del local: ${Object.values(ae)[0]!}`);
      }
      const branch: Branch = { id, ...next, active: true };
      d.branches.push(branch);
      d.seq[id] = { b: 0, f: 0 };
      d.cashMovements[id] = [];
      let account: StaffAccount | null = null;
      if (accInput) {
        const uid = `u${Math.max(0, ...d.staff.map((x) => Number(x.id.slice(1)) || 0)) + 1}`;
        d.staff.push({ id: uid, name: accInput.name, role: "encargado", branchId: id, pin: accInput.pin, active: true });
        account = { id: uid, name: accInput.name, role: "encargado", branchId: id, active: true };
      }
      commit();
      return { branch: { ...branch }, account };
    },
    async deactivateBranch(id, reason) {
      await wait(260);
      const u = currentUser();
      requireAdmin(u, "los locales");
      const d = get();
      const b = d.branches.find((x) => x.id === id) ?? fail("LOCAL_NO_EXISTE", "El local no existe.", 404);
      if (!b.active) return { ...b };
      if (reason.trim().length < 5) fail("DATOS_INVALIDOS", "Escribe el motivo del cierre.");
      const blockers = deactivateBlockers({
        stockUnits: d.lots.filter((l) => l.branchId === id).reduce((s, l) => s + Math.max(0, l.qty), 0),
        cashOpen: !!d.cash[id]?.open,
        pendingTransfers: d.transfers.filter((t) => (t.fromBranchId === id || t.toBranchId === id) && (t.status === "solicitado" || t.status === "en_transito")).length,
        activeBranches: activeBranches(d).length,
      });
      if (blockers.length) fail("LOCAL_NO_SE_PUEDE_CERRAR", blockers.join(" "), 409);
      b.active = false;
      for (const s of d.staff) if (s.branchId === id && s.active) {
        s.active = false;
        for (const [t, uid] of Object.entries(d.sessions)) if (uid === s.id) delete d.sessions[t];
      }
      for (const w of d.workers) if (w.branchId === id) w.active = false;
      commit();
      return { ...b };
    },
    async activateBranch(id) {
      await wait(220);
      requireAdmin(currentUser(), "los locales");
      const d = get();
      const b = d.branches.find((x) => x.id === id) ?? fail("LOCAL_NO_EXISTE", "El local no existe.", 404);
      if (b.active) return { ...b };
      if (!planUsage(d.branches, d.plan.maxBranches).canAdd) fail("LIMITE_DEL_PLAN", `Tu ${d.plan.name} permite ${d.plan.maxBranches} locales activos. Desactiva otro o amplía el plan.`, 409);
      b.active = true;
      commit();
      return { ...b };
    },
    async updateBranch(id, input) {
      await wait(200);
      requireAdmin(currentUser(), "los locales");
      const d = get();
      const b = d.branches.find((x) => x.id === id) ?? fail("LOCAL_NO_EXISTE", "El local no existe.", 404);
      const next: BranchInput = { name: input.name.trim(), address: input.address.trim(), series: input.series };
      const e = branchErrors(next, d.branches, id);
      if (hasErrors(e)) fail("DATOS_INVALIDOS", Object.values(e)[0]!);
      if (next.series !== b.series) {
        d.seriesArchive[`${id}:${b.series}`] = d.seq[id] ?? { b: 0, f: 0 };
        d.seq[id] = d.seriesArchive[`${id}:${next.series}`] ?? { b: 0, f: 0 };
      }
      Object.assign(b, next);
      commit();
      return { ...b };
    },
    async listBranchSeries() {
      await wait(100);
      requireAdmin(currentUser(), "los locales");
      const d = get();
      return d.branches.map((b) => ({ branchId: b.id, series: b.series, lastBoleta: d.seq[b.id]?.b ?? 0, lastFactura: d.seq[b.id]?.f ?? 0 }));
    },
    async updateRules(input) {
      await wait(200);
      requireAdmin(currentUser(), "las reglas");
      const r: RulesInput = { expiry: { ...input.expiry }, purchasing: { ...input.purchasing }, attendance: { ...input.attendance } };
      const e = rulesErrors(r);
      if (hasErrors(e)) fail("DATOS_INVALIDOS", Object.values(e)[0]!);
      const d = get();
      d.expiry = r.expiry;
      d.purchasing = r.purchasing;
      d.attendanceSettings = r.attendance;
      commit();
      return r;
    },
    async listAccounts() {
      await wait(120);
      requireAdmin(currentUser(), "las cuentas");
      return get().staff.map(({ pin: _pin, ...s }): StaffAccount => s);
    },
    async createAccount(input) {
      await wait(220);
      const u = currentUser();
      requireAdmin(u, "las cuentas");
      const d = get();
      const a = checkAccount(d, input, null, u.id);
      if (!input.pin) fail("DATOS_INVALIDOS", "El PIN debe tener 4 dígitos.");
      const id = `u${Math.max(0, ...d.staff.map((x) => Number(x.id.slice(1)) || 0)) + 1}`;
      d.staff.push({ ...a, id, pin: input.pin });
      commit();
      return { ...a, id };
    },
    async updateAccount(id, input) {
      await wait(220);
      const u = currentUser();
      requireAdmin(u, "las cuentas");
      const d = get();
      const i = d.staff.findIndex((x) => x.id === id);
      if (i < 0) fail("CUENTA_NO_EXISTE", "La cuenta no existe.", 404);
      const prev = d.staff[i]!;
      const a = checkAccount(d, input, id, u.id);
      d.staff[i] = { ...a, id, pin: input.pin || prev.pin };
      /* Si cambió el PIN, el rol, el local o se desactivó, sus sesiones abiertas se cierran (menos la tuya) */
      if (id !== u.id && (input.pin || !a.active || a.role !== prev.role || a.branchId !== prev.branchId))
        for (const [t, uid] of Object.entries(d.sessions)) if (uid === id) delete d.sessions[t];
      commit();
      return { ...a, id };
    },
    async listStaff() {
      await wait(80);
      return get().staff.filter((s) => s.active).map(({ pin: _pin, active: _a, ...s }) => s);
    },
    async login(userId, pin) {
      await wait(260);
      const s = get().staff.find((x) => x.id === userId);
      if (!s || !s.active || s.pin !== pin) return fail("PIN_INVALIDO", "PIN incorrecto. Intenta de nuevo.", 401);
      const token = `mock.${userId}.${Date.now().toString(36)}`;
      get().sessions[token] = userId;
      commit();
      const session: Session = { token, user: toUser(s), expiresAt: new Date(Date.now() + 12 * 3600_000).toISOString() };
      return session;
    },
    async listKioskWorkers(branchId) {
      await wait(100);
      const d = get();
      assertOpen(d, branchId);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return d.workers
        .filter((w) => w.active && w.branchId === branchId)
        .map((w): KioskWorker => ({ id: w.id, name: w.name, role: w.role, branchId: w.branchId, schedule: w.schedule, today: todayMarks(d, w.id, today.getTime()).map((m) => ({ type: m.type, at: m.at })) }));
    },
    async clock({ workerId, pin, type }) {
      await wait(220);
      const d = get();
      const w = d.workers.find((x) => x.id === workerId && x.active);
      if (!w || w.pin !== pin) return fail("PIN_INVALIDO", "PIN incorrecto. Intenta de nuevo.", 401);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const allowed = allowedMarks(todayMarks(d, w.id, today.getTime()));
      if (!allowed.includes(type)) fail("MARCA_FUERA_DE_ORDEN", `Ahora te toca marcar: ${allowed.map((t) => MARK_LABEL[t].toLowerCase()).join(" o ")}.`, 409);
      const m: AttendanceMark = { id: Math.max(0, ...d.marks.map((x) => x.id)) + 1, workerId: w.id, branchId: w.branchId, at: new Date().toISOString(), type, manual: false, note: "", registeredBy: null };
      d.marks.push(m);
      commit();
      return m;
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

    async getSalesReport({ from, to, branchId }) {
      await wait(220);
      const u = currentUser();
      const d = get();
      if (branchId) assertBranch(u, branchId);
      const scope = branchId ? [branchId] : u.role === "admin" ? d.branches.map((b) => b.id) : [u.branchId!];
      const a = parseDay(from);
      const b = parseDay(to) + DAY;
      if (!(a < b) || b - a > 370 * DAY) fail("DATOS_INVALIDOS", "Rango de fechas no válido (máximo un año).");
      const inRange = (iso: string) => {
        const t = new Date(iso).getTime();
        return t >= a && t < b;
      };
      const product = new Map(d.products.map((p) => [p.id, p]));
      const lotCost = new Map(d.lots.map((l) => [l.id, l.cost]));
      const methodFor = (key: string): "efectivo" | "yape" | "tarjeta" => {
        let h = 0;
        for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
        const r = (h % 100) / 100;
        return r < 0.58 ? "efectivo" : r < 0.9 ? "yape" : "tarjeta";
      };
      const lines: SalesReportLine[] = [];
      /* Historial de ejemplo: ventas del día resumidas por producto, repartidas en sus comprobantes */
      for (const m of d.moves) {
        if (m.type !== "venta" || !scope.includes(m.branchId) || !inRange(m.at)) continue;
        const p = product.get(m.productId);
        if (!p) continue;
        const units = -m.delta;
        const tickets = Math.max(1, Number(/(\d+) comprobante/.exec(m.note)?.[1] ?? 1));
        const day = isoDay(new Date(m.at).getTime());
        const saleId = `${m.branchId}-${day}-${(m.id * 7919) % tickets}`;
        lines.push({
          saleId, number: "Resumen del día", at: m.at, branchId: m.branchId, sellerName: m.userName, method: methodFor(saleId), documentType: "boleta", customerId: null,
          productId: p.id, presentationLabel: "Unidad", qty: units, units, total: round2(units * p.priceUnit), cost: round2(units * (lotCost.get(m.lotId ?? -1) ?? p.cost)), discount: 0, prescription: null,
        });
      }
      /* Ventas registradas */
      for (const sale of d.sales) {
        if (!scope.includes(sale.branchId) || !inRange(sale.createdAt)) continue;
        for (const it of sale.items) {
          lines.push({
            saleId: sale.id, number: sale.number, at: sale.createdAt, branchId: sale.branchId, sellerName: sale.sellerName, method: sale.payment.method, documentType: sale.document.type, customerId: sale.customerId,
            productId: it.productId, presentationLabel: it.presentationLabel, qty: it.qty, units: it.units, total: it.total,
            cost: round2(it.lots.reduce((s2, l) => s2 + l.units * (lotCost.get(l.lotId) ?? product.get(it.productId)?.cost ?? 0), 0)), discount: it.discount, prescription: sale.prescription,
          });
        }
      }
      return lines.sort((x, y) => x.at.localeCompare(y.at));
    },
    async getDashboard(days) {
      await wait(180);
      const u = currentUser();
      const d = get();
      const branchIds = u.role === "admin" ? activeBranches(d).map((b) => b.id) : [u.branchId!];
      const span = Math.max(1, Math.min(60, Math.round(days)));
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const t0 = today.getTime();
      const series = [];
      for (let i = span; i >= 1; i--) {
        const date = isoDay(t0 - i * DAY + 12 * 3600_000);
        for (const branchId of branchIds) {
          const cs = d.closings.filter((c) => c.branchId === branchId && isoDay(new Date(c.closedAt).getTime()) === date);
          series.push({ date, branchId, total: round2(cs.reduce((a, c) => a + c.sales.efectivo + c.sales.yape + c.sales.tarjeta, 0)), tickets: cs.reduce((a, c) => a + c.tickets, 0) });
        }
      }
      const todayStats = branchIds.map((branchId) => {
        const sales = d.sales.filter((x) => x.branchId === branchId && new Date(x.createdAt).getTime() >= t0);
        const byHour = Array.from({ length: 24 }, () => 0);
        const top = new Map<number, { productId: number; units: number; total: number }>();
        for (const x of sales) {
          const h = new Date(x.createdAt).getHours();
          byHour[h] = round2((byHour[h] ?? 0) + x.total);
          for (const it of x.items) {
            const cur = top.get(it.productId) ?? { productId: it.productId, units: 0, total: 0 };
            cur.units += it.units;
            cur.total = round2(cur.total + it.total);
            top.set(it.productId, cur);
          }
        }
        return {
          branchId, total: round2(sales.reduce((a, x) => a + x.total, 0)), tickets: sales.length, byMethod: paymentTotals(sales.map((x) => ({ method: x.payment.method, total: x.total }))), byHour,
          topProducts: [...top.values()].sort((a, b) => b.total - a.total).slice(0, 8),
        };
      });
      return { series, today: todayStats };
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

    async listSuppliers() {
      await wait(120);
      currentUser();
      return get().suppliers;
    },
    async createSupplier(input) {
      await wait(220);
      const u = currentUser();
      const d = get();
      const sup: Supplier = { ...checkSupplier(u, input, d.suppliers), id: Math.max(0, ...d.suppliers.map((x) => x.id)) + 1 };
      d.suppliers.push(sup);
      commit();
      return sup;
    },
    async updateSupplier(id, input) {
      await wait(220);
      const u = currentUser();
      const d = get();
      const i = d.suppliers.findIndex((x) => x.id === id);
      if (i < 0) fail("PROVEEDOR_NO_EXISTE", "El proveedor ya no existe.", 404);
      const sup: Supplier = { ...checkSupplier(u, input, d.suppliers, id), id };
      d.suppliers[i] = sup;
      for (const p of d.purchases) if (p.supplierId === id) p.supplierName = sup.name;
      commit();
      return sup;
    },
    async listPurchases({ branchId, days }) {
      await wait(160);
      const u = currentUser();
      if (branchId) assertBranch(u, branchId);
      else if (u.role !== "admin") fail("SIN_PERMISO", "Tu cuenta solo puede ver las compras de tu local.", 403);
      const from = Date.now() - Math.max(1, Math.min(365, Math.round(days))) * DAY;
      return get()
        .purchases.filter((p) => (!branchId || p.branchId === branchId) && new Date(p.receivedAt).getTime() >= from)
        .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
    },
    async createPurchase(req) {
      await wait(360);
      const u = currentUser();
      assertBranch(u, req.branchId);
      const d = get();
      assertOpen(d, req.branchId);
      const supplier = d.suppliers.find((x) => x.id === req.supplierId && x.active) ?? fail("PROVEEDOR_NO_EXISTE", "Elige un proveedor activo.", 404);
      const document = req.document.trim().toUpperCase();
      if (!isValidSupplierDocument(document)) fail("DATOS_INVALIDOS", "Escribe la factura o guía con serie y número, por ejemplo F001-00012345.");
      if (d.purchases.some((p) => p.supplierId === supplier.id && p.document === document)) fail("DOCUMENTO_DUPLICADO", `La ${document} de ${supplier.name} ya fue ingresada.`, 409);
      if (!req.items.length) fail("DATOS_INVALIDOS", "Agrega al menos un lote.");
      const now = Date.now();
      const seen = new Set<string>();
      const checked = req.items.map((it) => {
        const product = d.products.find((p) => p.id === it.productId) ?? fail("PRODUCTO_NO_EXISTE", "Uno de los productos ya no existe.", 404);
        const lotCode = normalizeLotCode(it.lotCode);
        const label = `${product.name} ${product.conc}`;
        if (!isValidLotCode(lotCode)) fail("DATOS_INVALIDOS", `Lote no válido en ${label}.`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(it.expiresOn) || daysUntil(it.expiresOn, now) <= 0) fail("FECHA_VENCIDA", `El lote ${lotCode} de ${label} ya está vencido o la fecha no es válida.`);
        if (!Number.isInteger(it.units) || it.units <= 0) fail("DATOS_INVALIDOS", `Falta la cantidad del lote ${lotCode}.`);
        if (!(it.unitCost >= 0)) fail("DATOS_INVALIDOS", `Costo no válido en el lote ${lotCode}.`);
        const k = `${product.id}|${lotCode}`;
        if (seen.has(k)) fail("DATOS_INVALIDOS", `El lote ${lotCode} de ${label} está repetido.`);
        seen.add(k);
        const existing = d.lots.find((l) => l.branchId === req.branchId && l.productId === product.id && normalizeLotCode(l.code) === lotCode);
        if (existing && existing.expiresOn !== it.expiresOn) fail("LOTE_CONFLICTO", `El lote ${lotCode} de ${label} ya existe con otra fecha de vencimiento.`, 409);
        return { it, product, lotCode, existing };
      });

      const at = new Date(now).toISOString();
      const today = isoDay(now);
      let lotId = Math.max(0, ...d.lots.map((l) => l.id));
      let moveId = Math.max(0, ...d.moves.map((m) => m.id));
      const items = checked.map(({ it, product, lotCode, existing }) => {
        let lot = existing;
        if (lot) {
          // Mismo lote y vencimiento: se suma y el costo queda promediado
          lot.cost = Math.round(((lot.cost * lot.qty + it.unitCost * it.units) / (lot.qty + it.units)) * 10000) / 10000;
          lot.qty += it.units;
          lot.receivedOn = today;
          lot.supplier = supplier.name;
        } else {
          lot = { id: ++lotId, branchId: req.branchId, productId: product.id, code: lotCode, expiresOn: it.expiresOn, qty: it.units, cost: it.unitCost, discount: 0, receivedOn: today, supplier: supplier.name };
          d.lots.push(lot);
        }
        if (it.unitCost > 0) product.cost = it.unitCost; // el costo del catálogo es el de la última compra
        d.moves.push({ id: ++moveId, at, branchId: req.branchId, productId: product.id, lotId: lot.id, lotCode, type: "ingreso", delta: it.units, note: `Compra ${document} · ${supplier.name}`, userName: u.name });
        return { productId: product.id, lotId: lot.id, lotCode, expiresOn: it.expiresOn, units: it.units, unitCost: it.unitCost, subtotal: round2(it.units * it.unitCost) };
      });
      const subtotal = round2(items.reduce((a, x) => a + x.subtotal, 0));
      const igv = round2(subtotal * IGV);
      const purchase: Purchase = {
        id: Math.max(0, ...d.purchases.map((p) => p.id)) + 1, branchId: req.branchId, supplierId: supplier.id, supplierName: supplier.name, document, receivedAt: at, userName: u.name,
        items, subtotal, igv, total: round2(subtotal + igv),
      };
      d.purchases.push(purchase);
      commit();
      return purchase;
    },

    async listTransfers(days) {
      await wait(150);
      const u = currentUser();
      const from = Date.now() - Math.max(1, Math.min(365, Math.round(days))) * DAY;
      return get()
        .transfers.filter((t) => (u.role === "admin" || t.fromBranchId === u.branchId || t.toBranchId === u.branchId) && (t.status === "solicitado" || t.status === "en_transito" || new Date(t.createdAt).getTime() >= from))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async sendTransfer(input) {
      await wait(320);
      const u = currentUser();
      const d = get();
      checkRoute(d, input.fromBranchId, input.toBranchId);
      assertBranch(u, input.fromBranchId);
      if (!input.items.length) fail("DATOS_INVALIDOS", "Agrega al menos un producto.");
      const now = Date.now();
      /* Primero se valida todo sobre una copia; si algo falla, no se toca el stock */
      const draft = d.lots.map((l) => ({ ...l }));
      const items: TransferItem[] = [];
      for (const it of input.items) {
        const p = d.products.find((x) => x.id === it.productId) ?? fail("PRODUCTO_NO_EXISTE", "Uno de los productos ya no existe.", 404);
        if (!Number.isInteger(it.units) || it.units <= 0) fail("DATOS_INVALIDOS", `Indica la cantidad de ${p.name}.`);
        const r = takeFromLots(draft, input.fromBranchId, p.id, it.units, now, it.lotId ?? null);
        if (r.missing > 0) fail("STOCK_INSUFICIENTE", `No hay stock vigente suficiente de ${p.name} ${p.conc} ${it.lotId ? "en ese lote" : "en el local de origen"}.`, 409);
        items.push(...r.items);
      }
      d.lots = draft;
      const t = newTransfer(d, u, input.fromBranchId, input.toBranchId, input.note, now);
      Object.assign(t, { status: "en_transito", items, dispatchedAt: t.createdAt, dispatchedBy: u.name });
      recordExit(d, t, u.name, now);
      d.transfers.push(t);
      commit();
      return t;
    },
    async askTransfer(input) {
      await wait(260);
      const u = currentUser();
      const d = get();
      checkRoute(d, input.fromBranchId, input.toBranchId);
      assertBranch(u, input.toBranchId);
      if (!input.items.length) fail("DATOS_INVALIDOS", "Agrega al menos un producto.");
      for (const it of input.items) {
        const p = d.products.find((x) => x.id === it.productId) ?? fail("PRODUCTO_NO_EXISTE", "Uno de los productos ya no existe.", 404);
        if (!Number.isInteger(it.units) || it.units <= 0) fail("DATOS_INVALIDOS", `Indica la cantidad de ${p.name}.`);
      }
      const t = newTransfer(d, u, input.fromBranchId, input.toBranchId, input.note, Date.now());
      t.requested = input.items.map((it) => ({ productId: it.productId, units: it.units }));
      d.transfers.push(t);
      commit();
      return t;
    },
    async dispatchTransfer(id) {
      await wait(300);
      const u = currentUser();
      const d = get();
      const t = d.transfers.find((x) => x.id === id) ?? fail("TRASLADO_NO_EXISTE", "El traslado no existe.", 404);
      if (t.status !== "solicitado") fail("ESTADO_INVALIDO", `El traslado ${t.code} ya no está pendiente de despacho.`, 409);
      if (!transferActions(t, u).dispatch) fail("SIN_PERMISO", "Solo el local de origen puede despachar este pedido.", 403);
      const now = Date.now();
      const items: TransferItem[] = [];
      for (const r of t.requested ?? []) items.push(...takeFromLots(d.lots, t.fromBranchId, r.productId, r.units, now).items);
      if (!items.length) fail("STOCK_INSUFICIENTE", `${BRANCH_NAME[t.fromBranchId] ?? t.fromBranchId} no tiene stock vigente de lo pedido.`, 409);
      Object.assign(t, { status: "en_transito", items, dispatchedAt: new Date(now).toISOString(), dispatchedBy: u.name });
      recordExit(d, t, u.name, now);
      commit();
      return t;
    },
    async receiveTransfer(id) {
      await wait(300);
      const u = currentUser();
      const d = get();
      const t = d.transfers.find((x) => x.id === id) ?? fail("TRASLADO_NO_EXISTE", "El traslado no existe.", 404);
      if (t.status !== "en_transito") fail("ESTADO_INVALIDO", `El traslado ${t.code} no está en camino.`, 409);
      if (!transferActions(t, u).receive) fail("SIN_PERMISO", "Solo el local de destino puede confirmar la recepción.", 403);
      const now = Date.now();
      const conflict = t.items.find((it) => d.lots.some((l) => l.branchId === t.toBranchId && l.productId === it.productId && l.code === it.lotCode && l.expiresOn !== it.expiresOn));
      if (conflict) fail("LOTE_CONFLICTO", `El lote ${conflict.lotCode} ya existe en el destino con otra fecha de vencimiento. Revisa el stock antes de recibir.`, 409);
      let lotId = Math.max(0, ...d.lots.map((l) => l.id));
      let moveId = Math.max(0, ...d.moves.map((m) => m.id));
      for (const { lot, it } of putIntoLots(d.lots, t.toBranchId, t.items, isoDay(now), () => ++lotId))
        d.moves.push({ id: ++moveId, at: new Date(now).toISOString(), branchId: t.toBranchId, productId: it.productId, lotId: lot.id, lotCode: lot.code, type: "traslado_ingreso", delta: it.units, note: `Traslado ${t.code} desde ${BRANCH_NAME[t.fromBranchId] ?? t.fromBranchId}`, userName: u.name });
      Object.assign(t, { status: "recibido", receivedAt: new Date(now).toISOString(), receivedBy: u.name });
      commit();
      return t;
    },
    async cancelTransfer(id, reason) {
      await wait(260);
      const u = currentUser();
      const d = get();
      const t = d.transfers.find((x) => x.id === id) ?? fail("TRASLADO_NO_EXISTE", "El traslado no existe.", 404);
      if (t.status !== "solicitado" && t.status !== "en_transito") fail("ESTADO_INVALIDO", `El traslado ${t.code} ya está cerrado.`, 409);
      if (!transferActions(t, u).cancel) fail("SIN_PERMISO", t.status === "en_transito" ? "Solo el local que lo envió puede anular un traslado en camino." : "No puedes anular este traslado.", 403);
      if (reason.trim().length < 3) fail("DATOS_INVALIDOS", "Escribe el motivo de la anulación.");
      const now = Date.now();
      if (t.status === "en_transito") {
        let moveId = Math.max(0, ...d.moves.map((m) => m.id));
        for (const it of t.items) {
          const lot = d.lots.find((l) => l.id === it.lotId);
          if (lot) lot.qty += it.units;
          d.moves.push({ id: ++moveId, at: new Date(now).toISOString(), branchId: t.fromBranchId, productId: it.productId, lotId: it.lotId, lotCode: it.lotCode, type: "ajuste", delta: it.units, note: `Traslado ${t.code} anulado: vuelve al stock`, userName: u.name });
        }
      }
      Object.assign(t, { status: "anulado", cancelledAt: new Date(now).toISOString(), cancelledBy: u.name, cancelReason: reason.trim() });
      commit();
      return t;
    },

    async listWorkers() {
      await wait(120);
      requireAdmin(currentUser());
      return get().workers.map(({ pin: _pin, ...w }) => w);
    },
    async createWorker(input) {
      await wait(220);
      requireAdmin(currentUser());
      const d = get();
      const w = checkWorker(d, input);
      if (!/^\d{4}$/.test(input.pin)) fail("DATOS_INVALIDOS", "El PIN debe tener 4 dígitos.");
      const id = `w${Math.max(0, ...d.workers.map((x) => Number(x.id.slice(1)) || 0)) + 1}`;
      d.workers.push({ ...w, id, pin: input.pin });
      commit();
      return { ...w, id };
    },
    async updateWorker(id, input) {
      await wait(220);
      requireAdmin(currentUser());
      const d = get();
      const i = d.workers.findIndex((x) => x.id === id);
      if (i < 0) fail("TRABAJADOR_NO_EXISTE", "El trabajador no existe.", 404);
      const w = checkWorker(d, input, id);
      if (input.pin && !/^\d{4}$/.test(input.pin)) fail("DATOS_INVALIDOS", "El PIN debe tener 4 dígitos.");
      d.workers[i] = { ...w, id, pin: input.pin || d.workers[i]!.pin };
      commit();
      return { ...w, id };
    },
    async listMarks({ from, to, branchId }) {
      await wait(160);
      requireAdmin(currentUser());
      const a = parseDay(from);
      const b = parseDay(to) + DAY;
      if (!(a < b) || b - a > 370 * DAY) fail("DATOS_INVALIDOS", "Rango de fechas no válido (máximo un año).");
      return get().marks.filter((m) => (!branchId || m.branchId === branchId) && new Date(m.at).getTime() >= a && new Date(m.at).getTime() < b);
    },
    async addManualMark(input) {
      await wait(220);
      const u = currentUser();
      requireAdmin(u);
      const d = get();
      const w = d.workers.find((x) => x.id === input.workerId) ?? fail("TRABAJADOR_NO_EXISTE", "El trabajador no existe.", 404);
      const t = new Date(input.at).getTime();
      if (!Number.isFinite(t) || t > Date.now() + 60_000) fail("DATOS_INVALIDOS", "La marca manual no puede ser en el futuro.");
      if (t < Date.now() - 62 * DAY) fail("DATOS_INVALIDOS", "Solo se pueden corregir marcas de los últimos 60 días.");
      if (input.note.trim().length < 5) fail("DATOS_INVALIDOS", "Explica el motivo de la marca manual.");
      const m: AttendanceMark = { id: Math.max(0, ...d.marks.map((x) => x.id)) + 1, workerId: w.id, branchId: w.branchId, at: new Date(t).toISOString(), type: input.type, manual: true, note: input.note.trim(), registeredBy: u.name };
      d.marks.push(m);
      commit();
      return m;
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
      const data: CustomerInput = { name: input.name.trim(), dni: input.dni ?? "", ruc: input.ruc ?? "", phone: input.phone ?? "", treatments: [], contactConsent: input.contactConsent ?? false, notes: "" };
      const first = Object.values(validateCustomer(data, d.customers))[0];
      if (first) fail("DATOS_INVALIDOS", first);
      const c: Customer = { id: Math.max(0, ...d.customers.map((x) => x.id)) + 1, ...data, points: 0, createdAt: new Date().toISOString() };
      d.customers.push(c);
      commit();
      return c;
    },
    async listCustomers() {
      await wait(160);
      currentUser();
      const d = get();
      return d.customers.map((c) => {
        const ps = purchasesOf(d, c.id);
        return { ...c, purchases: ps.length, totalSpent: round2(ps.reduce((a, p) => a + p.total, 0)), lastPurchaseAt: ps[0]?.at ?? null };
      });
    },
    async updateCustomer(id, input) {
      await wait(220);
      currentUser();
      const d = get();
      const i = d.customers.findIndex((c) => c.id === id);
      if (i < 0) fail("CLIENTE_NO_EXISTE", "El cliente no existe.", 404);
      const data: CustomerInput = { ...input, name: input.name.trim(), notes: input.notes.trim() };
      const first = Object.values(validateCustomer(data, d.customers, id))[0];
      if (first) fail("DATOS_INVALIDOS", first);
      if (data.treatments.some((t) => !d.products.some((p) => p.id === t.productId))) fail("PRODUCTO_NO_EXISTE", "Uno de los medicamentos ya no existe.", 404);
      const c: Customer = { ...d.customers[i]!, ...data };
      d.customers[i] = c;
      commit();
      return c;
    },
    async listCustomerPurchases(id) {
      await wait(140);
      currentUser();
      const d = get();
      if (!d.customers.some((c) => c.id === id)) fail("CLIENTE_NO_EXISTE", "El cliente no existe.", 404);
      return purchasesOf(d, id).slice(0, 50);
    },
    async listRefills() {
      await wait(150);
      currentUser();
      const d = get();
      return d.customers.flatMap((c) => {
        const ps = c.treatments.length ? purchasesOf(d, c.id) : [];
        return c.treatments.map((t) => {
          const last = ps.find((p) => p.items.some((it) => it.productId === t.productId));
          return { customerId: c.id, productId: t.productId, lastPurchaseAt: last?.at ?? null, lastUnits: last?.items.filter((it) => it.productId === t.productId).reduce((a, it) => a + it.units, 0) ?? 0, lastContactAt: d.contacts[`${c.id}:${t.productId}`] ?? null };
        });
      });
    },
    async logContact(customerId, input) {
      await wait(120);
      currentUser();
      const d = get();
      const c = d.customers.find((x) => x.id === customerId) ?? fail("CLIENTE_NO_EXISTE", "El cliente no existe.", 404);
      if (!c.contactConsent) fail("SIN_CONSENTIMIENTO", "Este cliente no aceptó recibir avisos.", 403);
      d.contacts[`${customerId}:${input.productId}`] = new Date().toISOString();
      commit();
    },

    async getCashSession(branchId) {
      await wait(100);
      assertBranch(currentUser(), branchId);
      return get().cash[branchId] ?? closedSession(branchId);
    },
    async openCash(branchId, amount) {
      await wait();
      const u = currentUser();
      assertBranch(u, branchId);
      const d = get();
      assertOpen(d, branchId);
      if (d.cash[branchId]?.open) fail("CAJA_ABIERTA", "La caja de este local ya está abierta.", 409);
      if (!(amount >= 0) || amount > 5000) fail("DATOS_INVALIDOS", "El fondo inicial debe estar entre S/ 0 y S/ 5,000.");
      const s: CashSession = { branchId, open: true, openedAt: new Date().toISOString(), openedBy: u.name, openingAmount: round2(amount) };
      d.cash[branchId] = s;
      d.cashMovements[branchId] = [];
      commit();
      return s;
    },
    async getCashSummary(branchId) {
      await wait(140);
      assertBranch(currentUser(), branchId);
      return summaryOf(get(), branchId);
    },
    async addCashMovement(branchId, input) {
      await wait(200);
      const u = currentUser();
      assertBranch(u, branchId);
      const d = get();
      if (!d.cash[branchId]?.open) fail("CAJA_CERRADA", "Abre la caja antes de registrar movimientos.");
      const sum = summaryOf(d, branchId);
      const err = movementError(input.type, input.amount, input.note, sum.expected);
      if (err) fail(err.startsWith("Solo hay") ? "CAJA_SIN_EFECTIVO" : "DATOS_INVALIDOS", err);
      const list = (d.cashMovements[branchId] ??= []);
      const m: CashMovement = { id: Math.max(0, ...list.map((x) => x.id)) + 1, at: new Date().toISOString(), type: input.type, amount: round2(input.amount), note: input.note.trim(), userName: u.name };
      list.push(m);
      commit();
      return m;
    },
    async closeCash(branchId, input) {
      await wait(320);
      const u = currentUser();
      assertBranch(u, branchId);
      const d = get();
      const session = d.cash[branchId];
      if (!session?.open || !session.openedAt) fail("CAJA_CERRADA", "La caja de este local ya está cerrada.");
      const sum = summaryOf(d, branchId);
      const counted = Object.keys(input.denominations).length ? countDenominations(input.denominations) : input.counted;
      if (!(counted >= 0)) fail("DATOS_INVALIDOS", "Indica cuánto efectivo contaste.");
      const { difference, needsNote } = closeDifference(counted, sum.expected);
      if (needsNote && input.note.trim().length < 5) fail("DIFERENCIA_SIN_MOTIVO", "Hay una diferencia de S/ 1 o más: explica el motivo antes de cerrar.");
      const movements = d.cashMovements[branchId] ?? [];
      const closing: CashClosing = {
        id: Math.max(0, ...d.closings.map((c) => c.id)) + 1, branchId, openedAt: session!.openedAt!, openedBy: session!.openedBy ?? "", closedAt: new Date().toISOString(), closedBy: u.name,
        openingAmount: session!.openingAmount, sales: { efectivo: sum.totals.efectivo, yape: sum.totals.yape, tarjeta: sum.totals.tarjeta }, tickets: sum.totals.tickets,
        ...movementTotals(movements), expected: sum.expected, counted: round2(counted), difference, denominations: input.denominations, note: input.note.trim(), movements,
      };
      d.closings.push(closing);
      d.cash[branchId] = closedSession(branchId);
      d.cashMovements[branchId] = [];
      commit();
      return closing;
    },
    async listCashClosings({ branchId, days }) {
      await wait(140);
      const u = currentUser();
      if (branchId) assertBranch(u, branchId);
      else if (u.role !== "admin") fail("SIN_PERMISO", "Tu cuenta solo puede ver los cierres de tu local.", 403);
      const from = Date.now() - Math.max(1, Math.min(365, Math.round(days))) * DAY;
      return get()
        .closings.filter((c) => (!branchId || c.branchId === branchId) && new Date(c.closedAt).getTime() >= from)
        .sort((a, b) => b.closedAt.localeCompare(a.closedAt));
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
        if (c) c.points += pointsFor(total);
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
