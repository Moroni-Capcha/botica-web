/**
 * Tipos de dominio compartidos con el backend.
 * Fuente de verdad del contrato: docs/API.md (mantener ambos sincronizados).
 * Dinero en soles con IGV incluido, como número con 2 decimales. Fechas: ISO 8601.
 */

export type BranchId = string; // lo genera el backend al crear el local: "principal", "sucursal-norte"…
export type Role = "admin" | "encargado";
export type RxCondition = "libre" | "receta" | "controlado";
export type PresentationId = "unidad" | "blister" | "caja";
export type PaymentMethod = "efectivo" | "yape" | "tarjeta";
export type DocType = "boleta" | "factura";

export interface Branch {
  id: BranchId;
  name: string;
  address: string;
  /** Serie de comprobantes: "001" → B001 / F001 */
  series: string;
  /** Un local desactivado no opera, pero su historial se conserva. */
  active: boolean;
}

/** Lo que permite el plan contratado. */
export interface Plan {
  name: string;
  /** Locales activos que se pueden tener a la vez. */
  maxBranches: number;
}

/** Lo mínimo que la pantalla de login necesita para listar usuarios (sin PIN). */
export interface StaffSummary {
  id: string;
  name: string;
  role: Role;
  branchId: BranchId | null;
}

export interface User extends StaffSummary {
  /** Vistas a las que tiene acceso (las define el backend según el rol). */
  permissions: string[];
}

export interface Session {
  token: string;
  user: User;
  /** ISO. El front cierra la sesión al vencer. */
  expiresAt: string;
}

export interface Pharmacy {
  name: string;
  tagline: string;
  ruc: string;
  phone: string;
  brand: string; // color principal, hex
  accent: string; // color de acento, hex
}

export interface Product {
  id: number;
  name: string;
  active: string; // principio activo (DCI)
  conc: string; // concentración
  form: string; // forma farmacéutica
  lab: string; // laboratorio o marca
  category: string; // tipo
  rx: RxCondition;
  unitsPerBox: number;
  unitsPerBlister: number; // 0 si no se vende por blíster
  unitName: string; // tableta, frasco, sobre…
  priceUnit: number;
  priceBlister: number; // 0 si no aplica
  priceBox: number; // 0 si no aplica
  cost: number; // costo por unidad, sin IGV
  minStock: number; // en unidades; mínimo por defecto
  /** Mínimo propio de cada local (unidades). Si un local no figura, se usa `minStock`. */
  minStockByBranch?: Partial<Record<BranchId, number>>;
  location: string;
  barcode: string;
  sanitaryReg: string;
  coldChain: boolean;
}

export interface Lot {
  id: number;
  branchId: BranchId;
  productId: number;
  code: string;
  expiresOn: string; // YYYY-MM-DD
  qty: number; // unidades disponibles
  cost: number;
  discount: number; // 0..1, descuento por vencimiento próximo
  receivedOn: string | null; // YYYY-MM-DD, fecha de ingreso al local
  supplier: string | null; // razón social del proveedor
}

/** Días que marcan el semáforo de vencimientos. Se configuran en Ajustes. */
export interface ExpiryThresholds {
  red: number; // hasta estos días: crítico
  yellow: number; // hasta estos días: por vencer
}

/** Unidades vendidas de un producto en un local durante los últimos `days` días. */
export interface ProductVelocity {
  branchId: BranchId;
  productId: number;
  units: number;
  days: number;
}

export type WriteOffType = "merma" | "devolucion";

/** Datos editables de un producto (todo menos el id). */
export type ProductInput = Omit<Product, "id">;

export type MoveType = "ingreso" | "venta" | "merma" | "devolucion" | "ajuste" | "traslado_salida" | "traslado_ingreso";

/** Una línea del kardex, en unidades. `delta` es positivo si entra y negativo si sale. */
export interface KardexEntry {
  id: string;
  at: string; // ISO
  branchId: BranchId;
  type: MoveType;
  /** Documento o motivo: "Boleta B001-003121", "Compra a Droguería Los Andes", "Producto vencido…" */
  reference: string;
  lotCode: string | null;
  delta: number;
  userName: string;
}

export interface Kardex {
  productId: number;
  /** null = todos los locales (solo administrador) */
  branchId: BranchId | null;
  from: string; // ISO, inicio del periodo
  to: string; // ISO
  /** Stock actual en unidades, incluidos lotes vencidos: es el saldo final del periodo. */
  closing: number;
  /** Del más reciente al más antiguo. */
  entries: KardexEntry[];
}

/** Saca unidades de un lote: baja (vencido, roto, deteriorado) o devolución/canje al proveedor. */
export interface WriteOffRequest {
  type: WriteOffType;
  units: number;
  note: string;
}

/** Medicamento de uso continuo: sirve para avisar al cliente cuando le toca reponer. */
export interface Treatment {
  productId: number;
  /** Cada cuántos días suele comprarlo (30 = una caja al mes). */
  everyDays: number;
}

export interface Customer {
  id: number;
  name: string;
  dni: string;
  ruc: string;
  phone: string;
  points: number;
  treatments: Treatment[];
  /** Aceptó recibir recordatorios por WhatsApp o llamada (Ley 29733 de datos personales). */
  contactConsent: boolean;
  notes: string;
  createdAt: string;
}

export interface CustomerInput {
  name: string;
  dni: string;
  ruc: string;
  phone: string;
  treatments: Treatment[];
  contactConsent: boolean;
  notes: string;
}

/** Cliente con sus totales, para la cartera. */
export interface CustomerSummary extends Customer {
  purchases: number;
  totalSpent: number;
  lastPurchaseAt: string | null;
}

/** Una compra del cliente (venta con el cliente asignado). */
export interface CustomerPurchase {
  saleId: string;
  number: string;
  branchId: BranchId;
  at: string;
  total: number;
  items: { productId: number; units: number; total: number; presentationLabel: string; qty: number }[];
}

/** Última compra de cada tratamiento y último aviso enviado, para calcular las recompras. */
export interface RefillInfo {
  customerId: number;
  productId: number;
  lastPurchaseAt: string | null;
  lastUnits: number;
  lastContactAt: string | null;
}

export type ContactChannel = "whatsapp" | "llamada";

export interface ContactRequest {
  productId: number;
  channel: ContactChannel;
  note: string;
}

export interface Prescription {
  number: string;
  doctor: string;
  cmp: string; // colegiatura del médico
}

/** Lo que el front envía al cobrar. El backend reparte por lote (FEFO) y es la autoridad final. */
export interface SaleRequest {
  branchId: BranchId;
  items: { productId: number; presentation: PresentationId; qty: number }[];
  payment: { method: PaymentMethod; received?: number; reference?: string };
  document: { type: DocType; customerDocId?: string; customerName?: string };
  customerId?: number | null;
  prescription?: Prescription | null;
  /** PIN de un Q.F. cuando quien cobra no puede dispensar controlados. */
  approverPin?: string | null;
}

export interface SaleLine {
  productId: number;
  presentation: PresentationId;
  presentationLabel: string;
  qty: number;
  units: number;
  unitPrice: number;
  discount: number; // 0..1 promedio aplicado
  total: number;
  lots: { lotId: number; code: string; expiresOn: string; units: number }[];
}

export interface Sale {
  id: string;
  branchId: BranchId;
  number: string; // B001-001234
  createdAt: string;
  sellerName: string;
  items: SaleLine[];
  total: number;
  taxBase: number; // operación gravada
  igv: number;
  payment: { method: PaymentMethod; received: number; change: number; reference?: string };
  document: { type: DocType; customerDocId?: string; customerName?: string };
  customerId: number | null;
  prescription: Prescription | null;
  approvedBy: string | null;
}

/** Reglas de compra. Se configuran en Ajustes. */
export interface PurchasingSettings {
  /** Días de venta que debe cubrir el pedido sugerido (además del stock mínimo). */
  coverDays: number;
  /** Vida útil mínima al recibir: un lote que vence antes recibe una advertencia. */
  minShelfDays: number;
}

export interface Supplier {
  id: number;
  name: string; // razón social
  ruc: string;
  contact: string;
  phone: string;
  /** Días en que visita o despacha: "Lun · Jue" */
  visitDays: string;
  active: boolean;
}

export type SupplierInput = Omit<Supplier, "id">;

/** Un lote recibido en una compra. Costo por unidad sin IGV. */
export interface PurchaseItemInput {
  productId: number;
  lotCode: string;
  expiresOn: string; // YYYY-MM-DD
  units: number;
  unitCost: number;
}

export interface PurchaseRequest {
  branchId: BranchId;
  supplierId: number;
  /** Factura o guía del proveedor: "F001-00012345" */
  document: string;
  items: PurchaseItemInput[];
}

export interface PurchaseItem extends PurchaseItemInput {
  lotId: number;
  subtotal: number;
}

export interface Purchase {
  id: number;
  branchId: BranchId;
  supplierId: number;
  supplierName: string;
  document: string;
  receivedAt: string; // ISO
  userName: string;
  items: PurchaseItem[];
  /** Sin IGV */
  subtotal: number;
  igv: number;
  total: number;
}

/* ------------------------------ Traslados ------------------------------ */

/**
 * solicitado: el local destino pidió y espera que el origen despache.
 * en_transito: el stock ya salió del origen (con su lote) y espera que el destino lo reciba.
 */
export type TransferStatus = "solicitado" | "en_transito" | "recibido" | "anulado";

export interface TransferItem {
  productId: number;
  units: number;
  /** Lote de origen. null mientras es un pedido sin despachar. */
  lotId: number | null;
  lotCode: string | null;
  expiresOn: string | null;
  unitCost: number | null;
}

export interface Transfer {
  id: number;
  /** "T-0012" */
  code: string;
  fromBranchId: BranchId;
  toBranchId: BranchId;
  status: TransferStatus;
  note: string;
  /** Lo que se pidió (solo si empezó como pedido). */
  requested: { productId: number; units: number }[] | null;
  /** Lo que viaja o viajó, por lote. Vacío mientras es un pedido. */
  items: TransferItem[];
  createdAt: string;
  createdBy: string;
  dispatchedAt: string | null;
  dispatchedBy: string | null;
  receivedAt: string | null;
  receivedBy: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancelReason: string | null;
}

/** Envío directo: sale ya del origen. Sin `lotId`, se reparte por FEFO. */
export interface TransferSendRequest {
  fromBranchId: BranchId;
  toBranchId: BranchId;
  note: string;
  items: { productId: number; units: number; lotId?: number | null }[];
}

/** Pedido del local destino al origen. */
export interface TransferAskRequest {
  fromBranchId: BranchId;
  toBranchId: BranchId;
  note: string;
  items: { productId: number; units: number }[];
}

/* ------------------------------ Asistencia ------------------------------ */

export interface AttendanceSettings {
  /** Minutos después de la hora de ingreso que aún no cuentan como tardanza. */
  toleranceMinutes: number;
  /** Refrigerio que se descuenta del horario para calcular las horas programadas. */
  breakMinutes: number;
  /** Minutos sobre el horario a partir de los cuales se cuentan horas extra. */
  overtimeAfterMinutes: number;
}

export interface WorkSchedule {
  start: string; // "08:00"
  end: string; // "16:00"
  /** Días que trabaja: 0 = domingo … 6 = sábado */
  days: number[];
}

export interface Worker {
  id: string;
  name: string;
  /** Cargo: Químico farmacéutico, Técnico en farmacia, Cajera… */
  role: string;
  branchId: BranchId;
  schedule: WorkSchedule;
  active: boolean;
}

/** Al crear un trabajador el PIN es obligatorio; al editar, vacío = no cambia. */
export interface WorkerInput extends Omit<Worker, "id"> {
  pin: string;
}

export type MarkType = "entrada" | "ref_ini" | "ref_fin" | "salida";

export interface AttendanceMark {
  id: number;
  workerId: string;
  branchId: BranchId;
  at: string; // ISO, hora del servidor
  type: MarkType;
  /** Registrada a mano por el administrador (olvido o falla del equipo). */
  manual: boolean;
  note: string;
  registeredBy: string | null;
}

/** Lo que ve el equipo de marcación del local, sin iniciar sesión. */
export interface KioskWorker {
  id: string;
  name: string;
  role: string;
  branchId: BranchId;
  schedule: WorkSchedule;
  /** Marcas de hoy, en orden. */
  today: { type: MarkType; at: string }[];
}

export interface ClockRequest {
  workerId: string;
  pin: string;
  type: MarkType;
}

export interface ManualMarkRequest {
  workerId: string;
  type: MarkType;
  at: string; // ISO
  note: string;
}

/* ------------------------------ Reportes ------------------------------ */

/** Una línea de venta con su costo, para armar todos los reportes en el front. */
export interface SalesReportLine {
  saleId: string;
  number: string;
  at: string; // ISO
  branchId: BranchId;
  sellerName: string;
  method: PaymentMethod;
  documentType: DocType;
  customerId: number | null;
  productId: number;
  presentationLabel: string;
  qty: number;
  units: number;
  /** Importe cobrado, con IGV y descuento aplicado. */
  total: number;
  /** Costo de los lotes que salieron (sin IGV). */
  cost: number;
  /** Descuento promedio aplicado (0..1). */
  discount: number;
  prescription: Prescription | null;
}

/* ------------------------------ Panel del día ------------------------------ */

/** Venta cerrada de un día y local (lo vendido, con IGV). */
export interface DailySales {
  date: string; // YYYY-MM-DD, hora de Lima
  branchId: BranchId;
  total: number;
  tickets: number;
}

export interface TodayStats {
  branchId: BranchId;
  total: number;
  tickets: number;
  byMethod: PaymentTotals;
  /** Venta por hora del día, índice 0 a 23. */
  byHour: number[];
  /** Los más vendidos de hoy por importe, máximo 8. */
  topProducts: { productId: number; units: number; total: number }[];
}

export interface Dashboard {
  /** Días anteriores a hoy, del más antiguo al más reciente. */
  series: DailySales[];
  today: TodayStats[];
}

export interface CashSession {
  branchId: BranchId;
  open: boolean;
  openedAt: string | null;
  /** Quién abrió el turno. */
  openedBy: string | null;
  openingAmount: number;
}

/**
 * Movimientos de efectivo que no son ventas.
 * egreso: pago menor (movilidad, útiles, limpieza). retiro: el dueño o administrador saca efectivo.
 * ingreso: se agrega sencillo a la caja.
 */
export type CashMovementType = "egreso" | "retiro" | "ingreso";

export interface CashMovement {
  id: number;
  at: string;
  type: CashMovementType;
  amount: number;
  note: string;
  userName: string;
}

export interface CashMovementRequest {
  type: CashMovementType;
  amount: number;
  note: string;
}

/** Totales cobrados por método de pago. */
export interface PaymentTotals {
  efectivo: number;
  yape: number;
  tarjeta: number;
}

/** Venta resumida para la lista del turno. */
export interface CashSaleRow {
  id: string;
  number: string;
  createdAt: string;
  total: number;
  method: PaymentMethod;
  sellerName: string;
  hasPrescription: boolean;
}

/** Estado del turno abierto: lo que se vendió, los movimientos y cuánto efectivo debe haber. */
export interface CashSummary {
  session: CashSession;
  sales: CashSaleRow[];
  totals: PaymentTotals & { tickets: number };
  movements: CashMovement[];
  /** Fondo + ventas en efectivo + ingresos − egresos − retiros */
  expected: number;
}

/** Billetes y monedas contados: denominación en soles ("0.5") → cantidad. */
export type Denominations = Record<string, number>;

export interface CashCloseRequest {
  counted: number;
  denominations: Denominations;
  /** Obligatoria si la diferencia es de S/ 1 o más. */
  note: string;
}

export interface CashClosing {
  id: number;
  branchId: BranchId;
  openedAt: string;
  openedBy: string;
  closedAt: string;
  closedBy: string;
  openingAmount: number;
  sales: PaymentTotals;
  tickets: number;
  ingresos: number;
  egresos: number;
  retiros: number;
  expected: number;
  counted: number;
  /** contado − esperado: negativo = faltante, positivo = sobrante */
  difference: number;
  denominations: Denominations;
  note: string;
  movements: CashMovement[];
}

export interface ApiErrorBody {
  code: string; // p. ej. "STOCK_INSUFICIENTE", "PIN_INVALIDO", "CAJA_CERRADA"
  message: string; // texto listo para mostrar al usuario
  details?: Record<string, unknown>;
}

/* ------------------------------ Ajustes ------------------------------ */

export interface BranchInput {
  name: string;
  address: string;
  /** 3 dígitos: "001" → B001 / F001. Cambiarla reinicia la numeración en la nueva serie. */
  series: string;
}

export interface BranchCreateInput extends BranchInput {
  /** Si viene, se crea también la cuenta de local para ingresar. */
  account: { name: string; pin: string } | null;
}

export interface BranchCreated {
  branch: Branch;
  account: StaffAccount | null;
}

/** Último correlativo emitido de cada tipo de comprobante en la serie actual del local. */
export interface BranchSeries {
  branchId: BranchId;
  series: string;
  lastBoleta: number;
  lastFactura: number;
}

/** Cuenta para ingresar al sistema (administrador o cuenta de local). El PIN nunca viaja de vuelta. */
export interface StaffAccount extends StaffSummary {
  active: boolean;
}

export interface AccountInput {
  name: string;
  role: Role;
  /** null para el administrador */
  branchId: BranchId | null;
  /** 4 dígitos. Al editar, vacío = no cambia. */
  pin: string;
  active: boolean;
}

export interface RulesInput {
  expiry: ExpiryThresholds;
  purchasing: PurchasingSettings;
  attendance: AttendanceSettings;
}
