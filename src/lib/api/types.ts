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

/** Estado de la cuenta del cliente. `suspended` = solo lectura. */
export type AccountStatus = "trial" | "active" | "overdue" | "suspended";

/** Cuenta y facturación de la botica. Fechas como día local YYYY-MM-DD (America/Lima). */
export interface Account {
  status: AccountStatus;
  /** Último día de la prueba (solo en `trial`). */
  trialEndsAt?: string;
  /** Próxima renovación (solo en `active`). */
  renewsAt?: string;
  /** Ids de módulo (los de `src/lib/nav.ts`) que incluye el plan. */
  modules: string[];
}

/** Plan que se puede contratar (público, para el registro). Precio en soles por mes, con IGV. */
export interface PlanOffer {
  id: string;
  name: string;
  priceMonthly: number;
  maxBranches: number;
  /** Ids de módulo (los de `src/lib/nav.ts`) que incluye. */
  modules: string[];
}

export interface SignUpInput {
  boticaName: string;
  /** Código de la botica: minúsculas, números y guiones. */
  code: string;
  ownerName: string;
  email: string;
  password: string;
  /** `PlanOffer.id` */
  plan: string;
}

/** Pasos de la primera configuración, en orden. */
export type SetupStep = "botica" | "local" | "series" | "usuario" | "productos";

export interface Setup {
  done: SetupStep[];
}

/** Lo que se puede mostrar de una botica antes de ingresar (sin datos sensibles). */
export interface BoticaPublic {
  /** Código de la botica: "botica-huanuco". */
  code: string;
  name: string;
  tagline: string;
  brand: string;
  accent: string;
}

export interface Pharmacy {
  name: string;
  tagline: string;
  ruc: string;
  legalName: string; // razón social; vacío = aún no configurada (el ticket usa `name`)
  fiscalAddress: string; // dirección fiscal; vacío = el ticket usa la dirección del local
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
  /** Del más reciente al más antiguo. Con `page`, solo las de esa página. */
  entries: KardexEntry[];
  /* Solo cuando se pidió con `page` (paginación en el servidor): */
  /** Total de movimientos del periodo, no solo los de esta página. */
  total?: number;
  page?: number;
  pageSize?: number;
  /** Saldo después del movimiento más reciente de esta página (en la primera página es `closing`). */
  pageClosing?: number;
  /** Cifras del periodo completo: entradas, salidas, unidades vendidas y saldo inicial. */
  summary?: { inUnits: number; outUnits: number; sold: number; opening: number };
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
  /** Total comprado ya sin las devoluciones (notas de crédito). */
  totalSpent: number;
  /** Total devuelto por notas de crédito; ya está restado de `totalSpent`. */
  totalReturned: number;
  lastPurchaseAt: string | null;
}

/** Una compra del cliente (venta con el cliente asignado). */
export interface CustomerPurchase {
  saleId: string;
  number: string;
  branchId: BranchId;
  at: string;
  total: number;
  /** Lo que sigue comprado: ya sin lo devuelto. Si todo se devolvió, la compra no aparece. */
  items: { productId: number; units: number; total: number; presentationLabel: string; qty: number }[];
  /** Importe devuelto por notas de crédito (ya descontado de `total`). */
  returned?: number;
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
  /**
   * Clave de idempotencia generada por el front (UUID), una por venta. Si el backend ya registró una venta con esta clave,
   * devuelve esa misma venta en vez de crear otra. Sirve para reintentar sin duplicar (corte de internet, ventas sin conexión).
   */
  clientSaleId?: string;
  /** Momento real del cobro (ISO 8601). Solo viene en ventas hechas sin conexión; sin él, vale la hora del servidor. */
  soldAt?: string;
  /** Número provisional del ticket entregado sin conexión (OFF-0001). El número oficial lo asigna el backend. */
  offlineTicket?: string;
}

/** Venta que se envía en lote a POST /sales/sync: la clave de idempotencia es obligatoria. */
export type SaleSyncItem = SaleRequest & { clientSaleId: string };

export interface SaleSyncRequest {
  sales: SaleSyncItem[];
}

/** Resultado de una venta del lote. 'created' = se registró ahora; 'replayed' = ya existía con esa clave y se devuelve la original. */
export type SaleSyncResult =
  | { clientSaleId: string; status: "created" | "replayed"; sale: Sale }
  | { clientSaleId: string; status: "failed"; error: ApiErrorBody };

export interface SaleSyncResponse {
  /** Un resultado por venta enviada, en el mismo orden. */
  results: SaleSyncResult[];
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
  /** Clave de idempotencia con la que se registró, si el front la envió. */
  clientSaleId?: string | null;
  /** Número provisional del ticket entregado sin conexión, si la venta se hizo offline. */
  offlineTicket?: string | null;
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
  /**
   * `devolucion` = viene de una nota de crédito: `at` es cuándo se emitió la nota, `qty`, `units`, `total` y `cost` van en negativo
   * (el costo solo si la mercadería volvió al stock). Si falta, es una venta.
   */
  kind?: "venta" | "devolucion";
}

/* ------------------------------ Panel del día ------------------------------ */

/** Venta cerrada de un día y local (lo vendido, con IGV). */
export interface DailySales {
  date: string; // YYYY-MM-DD, hora de Lima
  branchId: BranchId;
  /** Venta neta: lo vendido menos las devoluciones. */
  total: number;
  /** Devoluciones (notas de crédito) del día; ya están restadas de `total`. */
  returns: number;
  tickets: number;
}

export interface TodayStats {
  branchId: BranchId;
  /** Venta neta de hoy: `gross − returns`. */
  total: number;
  gross: number;
  /** Devoluciones (notas de crédito) emitidas hoy en este local. */
  returns: number;
  tickets: number;
  /** Neto por método de pago (cada devolución resta del método de la venta original). */
  byMethod: PaymentTotals;
  /** Venta neta por hora del día, índice 0 a 23 (la devolución resta en la hora en que se emitió). */
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

/** Nota de crédito emitida durante el turno, para la lista de devoluciones. */
export interface CashReturnRow {
  id: string;
  /** Número de la nota, p. ej. BC01-000001. */
  number: string;
  /** Comprobante que modifica. */
  voucherNumber: string;
  issuedAt: string;
  total: number;
  /** Método con que se pagó la venta original. */
  method: PaymentMethod;
  userName: string;
}

/** Devoluciones del turno por método de pago. */
export type ReturnTotals = PaymentTotals & { count: number };

/** Estado del turno abierto: lo que se vendió, los movimientos y cuánto efectivo debe haber. */
export interface CashSummary {
  session: CashSession;
  sales: CashSaleRow[];
  /** Vendido (bruto) por método de pago. */
  totals: PaymentTotals & { tickets: number };
  /** Notas de crédito emitidas en este turno, por método de pago de la venta original. */
  returns: ReturnTotals;
  returnRows: CashReturnRow[];
  movements: CashMovement[];
  /** Fondo + ventas en efectivo − devoluciones en efectivo + ingresos − egresos − retiros */
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
  /** Vendido (bruto) por método de pago. */
  sales: PaymentTotals;
  /** Devoluciones del turno por método de pago (notas emitidas mientras estuvo abierto). */
  returns: ReturnTotals;
  tickets: number;
  ingresos: number;
  egresos: number;
  retiros: number;
  /** Fondo + ventas en efectivo − devoluciones en efectivo + ingresos − egresos − retiros */
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
  /** Local activo del que se copian los stock mínimos por producto (nunca el stock). Sin él, el local nuevo usa el mínimo general de cada producto. */
  copyMinStockFrom?: BranchId;
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

/* ------------------------------ Comprobantes (SUNAT) ------------------------------ */

/**
 * pendiente: se envió y SUNAT aún no responde (o no hubo conexión).
 * aceptado: SUNAT lo validó. rechazado: SUNAT lo devolvió con un error. anulado: se dio de baja.
 */
export type VoucherStatus = "pendiente" | "aceptado" | "rechazado" | "anulado";

/** Última respuesta de SUNAT (vía el proveedor de facturación electrónica). `code` "0" = aceptado. */
export interface SunatResponse {
  code: string;
  message: string;
  at: string; // ISO
}

/** Estado electrónico de un comprobante. `sunat` es null mientras no hay respuesta. */
export interface ElectronicState {
  status: VoucherStatus;
  sunat: SunatResponse | null;
  /** Veces que se envió a SUNAT (el envío original cuenta como 1). */
  attempts: number;
}

export interface VoidInfo {
  at: string; // ISO
  by: string;
  reason: string;
  /** Ticket de la comunicación de baja que devolvió SUNAT. */
  ticket: string;
}

/** Boleta o factura emitida por una venta, con su estado ante SUNAT. */
export interface Voucher extends ElectronicState {
  /** Es el mismo id de la venta. */
  id: string;
  number: string;
  type: DocType;
  branchId: BranchId;
  issuedAt: string; // ISO
  customerName: string;
  customerDocId: string;
  total: number;
  taxBase: number;
  igv: number;
  voided: VoidInfo | null;
  /** Suma de las notas de crédito válidas (no rechazadas). */
  creditedTotal: number;
  /** Notas de crédito emitidas sobre este comprobante, de cualquier fecha (la más antigua primero). */
  creditNotes: CreditNote[];
  /** La venta completa: sirve para armar el ticket y elegir qué productos se devuelven. */
  sale: Sale;
}

export interface VoidRequest {
  reason: string;
  /** Si la mercadería vuelve al stock (entra al kardex como devolución de cliente). */
  returnStock: boolean;
}

/** Catálogo 09 de SUNAT (motivos de nota de crédito) que usa el sistema. */
export type CreditReasonCode = "01" | "04" | "06" | "07" | "09";

export interface CreditNoteItem {
  /** Posición de la línea en `Voucher.sale.items`. */
  lineIndex: number;
  productId: number;
  presentationLabel: string;
  qty: number;
  units: number;
  total: number;
}

export interface CreditNote extends ElectronicState {
  id: string;
  /** "BC01-000001" para boletas, "FC01-000001" para facturas. */
  number: string;
  /** Tipo del comprobante que modifica. */
  type: DocType;
  branchId: BranchId;
  issuedAt: string; // ISO
  userName: string;
  voucherId: string;
  voucherNumber: string;
  customerName: string;
  customerDocId: string;
  reasonCode: CreditReasonCode;
  reasonLabel: string;
  /** Detalle que escribió quien la emitió. */
  note: string;
  items: CreditNoteItem[];
  total: number;
  taxBase: number;
  igv: number;
  /** Las unidades volvieron al stock. */
  returnedToStock: boolean;
}

/**
 * Según el motivo, se indica `items` (devolución por ítem), `amount` (descuento o disminución)
 * o nada (anulación y devolución total: se acredita todo el comprobante).
 */
export interface CreditNoteRequest {
  reasonCode: CreditReasonCode;
  note: string;
  items?: { lineIndex: number; qty: number }[];
  amount?: number;
  /** Solo motivos con mercadería (01, 06, 07). Por defecto true. */
  returnStock?: boolean;
}

/* ------------------------------ Paginación ------------------------------ */

/** Parámetros opcionales de las listas paginadas en el servidor (ver "Paginación en el servidor" en docs/API.md). */
export interface PageQuery {
  /** Desde 1. */
  page?: number;
  /** Por defecto 25, máximo 100. */
  pageSize?: number;
}

export interface Page<T> {
  items: T[];
  /** Todo lo que cumple los filtros, no solo esta página. */
  total: number;
  page: number;
  pageSize: number;
}

/** Búsqueda de clientes por páginas (nombre, DNI, RUC o celular). */
export interface CustomersQuery extends PageQuery {
  q?: string;
}

/* ------------------------------ Auditoría ------------------------------ */

export type AuditAction =
  | "sesion_iniciada" | "sesion_fallida"
  | "venta_registrada" | "comprobante_anulado" | "nota_credito_emitida" | "comprobante_reenviado" | "nota_credito_reenviada"
  | "producto_creado" | "producto_editado" | "precio_cambiado" | "costo_cambiado"
  | "compra_registrada" | "baja_registrada" | "descuento_lote"
  | "traslado_enviado" | "traslado_pedido" | "traslado_despachado" | "traslado_recibido" | "traslado_anulado"
  | "caja_abierta" | "caja_cerrada" | "movimiento_caja"
  | "cuenta_creada" | "cuenta_editada"
  | "botica_editada" | "reglas_editadas" | "local_creado" | "local_editado" | "local_desactivado" | "local_activado"
  | "plan_cambiado" | "prueba_extendida" | "cuenta_suspendida" | "cuenta_reactivada";

export type AuditEntity = "sesion" | "venta" | "comprobante" | "nota_credito" | "producto" | "lote" | "compra" | "traslado" | "caja" | "cuenta" | "local" | "botica" | "reglas" | "plan";

export type AuditValue = string | number | boolean | null;
/** Resumen corto de un estado (antes o después). Nunca lleva DNI, nombres de clientes, PIN ni contraseñas. */
export type AuditFields = Record<string, AuditValue>;

export interface AuditEntry {
  id: string;
  at: string; // ISO
  /** null = sin cuenta (intento fallido con un usuario inexistente) o una acción de Digi!HME. */
  userId: string | null;
  userName: string;
  role: Role | null;
  branchId: BranchId | null;
  action: AuditAction;
  entity: AuditEntity;
  entityId: string | null;
  /** Nombre legible de lo afectado: "Boleta B001-000123", "Losartán 50 mg". */
  entityLabel: string;
  before: AuditFields | null;
  after: AuditFields | null;
}

export interface AuditQuery extends PageQuery {
  /** Días locales YYYY-MM-DD, ambos incluidos. */
  from: string;
  to: string;
  userId?: string;
  action?: AuditAction;
  entity?: AuditEntity;
}

/* ------------------------------ Consola interna de Digi!HME (plataforma) ------------------------------ */

/** Persona de Digi!HME que opera la plataforma. No es una cuenta de ninguna botica. */
export interface PlatformOperator {
  id: string;
  name: string;
  email: string;
}

export interface PlatformSession {
  token: string;
  operator: PlatformOperator;
  /** ISO. La consola cierra la sesión al vencer. */
  expiresAt: string;
}

/** Una botica cliente, vista desde la consola. */
export interface TenantSummary {
  /** Código de la botica: "botica-huanuco". */
  code: string;
  name: string;
  /** `PlanOffer.id`; null si el plan ya no está en el catálogo. */
  planId: string | null;
  planName: string;
  maxBranches: number;
  /** Estado ya calculado (una prueba pasada de su último día llega como `overdue`). */
  status: AccountStatus;
  /** Día local YYYY-MM-DD (solo en prueba o si quedó guardado). */
  trialEndsAt?: string;
  renewsAt?: string;
  createdAt: string; // ISO
  /** Última vez que alguien de la botica hizo algo; null si nunca. */
  lastActivityAt: string | null;
  /** Locales activos. */
  branches: number;
  /** Cuentas de usuario activas. */
  users: number;
}

export interface TenantsQuery extends PageQuery {
  /** Busca en el nombre y el código. */
  q?: string;
  status?: AccountStatus;
}

/** Página de boticas, con cuántas hay por estado (de todas las que cumplen la búsqueda, no solo de la página). */
export interface TenantPage extends Page<TenantSummary> {
  counts: Record<AccountStatus, number>;
}

/** Lo que Digi!HME puede hacer con una botica. Siempre lleva un motivo (queda en la auditoría de la botica). */
export type TenantAction =
  | { action: "change_plan"; planId: string; reason: string }
  | { action: "extend_trial"; days: number; reason: string }
  | { action: "suspend"; reason: string }
  | { action: "reactivate"; reason: string };
