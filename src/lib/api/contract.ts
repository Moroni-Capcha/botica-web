/**
 * Contrato entre el front y la API. Hay dos implementaciones:
 *  - http.ts → la API real del backend (ver docs/API.md)
 *  - mock/   → datos de ejemplo en el navegador, para avanzar sin backend
 * Las pantallas solo conocen esta interfaz.
 */
import type {
  Branch, CashCloseRequest, CashClosing, CashMovement, CashMovementRequest, CashSession, CashSummary, Customer, ExpiryThresholds, Kardex, Lot, Pharmacy, Product, ProductInput, ProductVelocity, Purchase, PurchaseRequest, PurchasingSettings, Sale, SaleRequest, Session,
  Dashboard, SalesReportLine, AttendanceMark, ContactRequest, CustomerInput, CustomerPurchase, CustomerSummary, RefillInfo, AttendanceSettings, ClockRequest, KioskWorker, ManualMarkRequest, Worker, WorkerInput,
  AccountInput, BranchCreateInput, BranchCreated, Plan, BranchInput, BranchSeries, RulesInput, StaffAccount,
  StaffSummary, Supplier, SupplierInput, Transfer, TransferAskRequest, TransferSendRequest, User, BranchId, WriteOffRequest,
} from "./types";

export interface PublicConfig {
  pharmacy: Pharmacy;
  /** Locales activos: los únicos donde se vende, se traslada y se elige. */
  branches: Branch[];
  /** Locales desactivados: solo para mostrar su nombre en el historial. */
  closedBranches: Branch[];
  plan: Plan;
  expiry: ExpiryThresholds;
  purchasing: PurchasingSettings;
  attendance: AttendanceSettings;
}

export interface BranchStock {
  branchId: BranchId;
  productId: number;
  units: number; // vigente (no vencido)
}

export interface NewCustomer {
  name: string;
  dni?: string;
  ruc?: string;
  phone?: string;
  contactConsent?: boolean;
}

export interface ApiClient {
  /* Público (antes del login) */
  getPublicConfig(): Promise<PublicConfig>;
  listStaff(): Promise<StaffSummary[]>;
  login(userId: string, pin: string): Promise<Session>;

  /* Marcación de asistencia (sin sesión: el equipo del local, con el PIN personal del trabajador) */
  listKioskWorkers(branchId: BranchId): Promise<KioskWorker[]>;
  clock(input: ClockRequest): Promise<AttendanceMark>;

  /* Sesión */
  me(): Promise<User>;
  logout(): Promise<void>;

  /* Panel */
  /** Venta de hoy y de los `days` días anteriores. El encargado recibe solo su local. */
  getDashboard(days: number): Promise<Dashboard>;

  /* Ajustes (solo administrador). Los cambios se ven en todos los equipos al volver a leer getPublicConfig. */
  updatePharmacy(input: Pharmacy): Promise<Pharmacy>;
  createBranch(input: BranchCreateInput): Promise<BranchCreated>;
  updateBranch(id: BranchId, input: BranchInput): Promise<Branch>;
  /** Exige que no tenga stock, caja abierta ni traslados pendientes. Desactiva también sus cuentas y trabajadores. */
  deactivateBranch(id: BranchId, reason: string): Promise<Branch>;
  activateBranch(id: BranchId): Promise<Branch>;
  listBranchSeries(): Promise<BranchSeries[]>;
  updateRules(input: RulesInput): Promise<RulesInput>;
  listAccounts(): Promise<StaffAccount[]>;
  createAccount(input: AccountInput): Promise<StaffAccount>;
  updateAccount(id: string, input: AccountInput): Promise<StaffAccount>;

  /* Reportes */
  /** Líneas de venta entre dos fechas (YYYY-MM-DD, ambas incluidas). El encargado recibe solo su local. */
  getSalesReport(options: { from: string; to: string; branchId?: BranchId }): Promise<SalesReportLine[]>;

  /* Catálogo e inventario */
  listProducts(): Promise<Product[]>;
  listLots(branchId: BranchId): Promise<Lot[]>;
  /** Stock vigente por local y producto (resumen; lo ven todos los roles). */
  listBranchStock(): Promise<BranchStock[]>;
  /** Alta y edición del catálogo (solo administrador). */
  createProduct(input: ProductInput): Promise<Product>;
  updateProduct(id: number, input: ProductInput): Promise<Product>;
  /** Movimientos de un producto en los últimos `days` días. Sin `branchId`, todos los locales (solo administrador). */
  getKardex(productId: number, options: { branchId?: BranchId; days: number }): Promise<Kardex>;

  /* Vencimientos */
  /** Unidades vendidas por local y producto en los últimos `days` días (todos los locales; sirve para sugerir traslados). */
  listVelocity(days: number): Promise<ProductVelocity[]>;
  /** Aplica (o quita, con 0) un descuento a varios lotes de un local. Devuelve los lotes actualizados. */
  setLotDiscount(branchId: BranchId, lotIds: number[], discount: number): Promise<Lot[]>;
  /** Baja o devolución de unidades de un lote. Devuelve el lote actualizado. */
  writeOffLot(lotId: number, input: WriteOffRequest): Promise<Lot>;

  /* Compras */
  listSuppliers(): Promise<Supplier[]>;
  createSupplier(input: SupplierInput): Promise<Supplier>;
  updateSupplier(id: number, input: SupplierInput): Promise<Supplier>;
  /** Ingresos de los últimos `days` días. Sin `branchId`, todos los locales (solo administrador). */
  listPurchases(options: { branchId?: BranchId; days: number }): Promise<Purchase[]>;
  /** Registra el ingreso: crea los lotes, suma al kardex y devuelve la compra. */
  createPurchase(input: PurchaseRequest): Promise<Purchase>;

  /* Traslados */
  /** Traslados de los últimos `days` días más todos los que siguen en curso. El encargado solo ve los de su local. */
  listTransfers(days: number): Promise<Transfer[]>;
  /** Envío directo desde el origen: el stock sale ya (en tránsito). */
  sendTransfer(input: TransferSendRequest): Promise<Transfer>;
  /** Pedido al otro local: no mueve stock hasta que el origen lo despache. */
  askTransfer(input: TransferAskRequest): Promise<Transfer>;
  /** El origen despacha un pedido por FEFO (lo que alcance). */
  dispatchTransfer(id: number): Promise<Transfer>;
  /** El destino confirma que llegó: el stock entra con el mismo lote. */
  receiveTransfer(id: number): Promise<Transfer>;
  /** Anula un pedido o un envío en tránsito (el stock vuelve al origen). */
  cancelTransfer(id: number, reason: string): Promise<Transfer>;

  /* Asistencia (administrador) */
  listWorkers(): Promise<Worker[]>;
  createWorker(input: WorkerInput): Promise<Worker>;
  updateWorker(id: string, input: WorkerInput): Promise<Worker>;
  /** Marcas entre dos fechas (YYYY-MM-DD, ambas incluidas). */
  listMarks(options: { from: string; to: string; branchId?: BranchId }): Promise<AttendanceMark[]>;
  addManualMark(input: ManualMarkRequest): Promise<AttendanceMark>;

  /* Clientes */
  searchCustomers(query: string): Promise<Customer[]>;
  createCustomer(input: NewCustomer): Promise<Customer>;
  /** Cartera completa con totales de compra. */
  listCustomers(): Promise<CustomerSummary[]>;
  updateCustomer(id: number, input: CustomerInput): Promise<Customer>;
  /** Compras del cliente, de la más reciente a la más antigua (máximo 50). */
  listCustomerPurchases(id: number): Promise<CustomerPurchase[]>;
  /** Una fila por cliente y tratamiento. */
  listRefills(): Promise<RefillInfo[]>;
  /** Registra que se avisó al cliente (para no repetir el mensaje). */
  logContact(customerId: number, input: ContactRequest): Promise<void>;

  /* Caja y ventas */
  getCashSession(branchId: BranchId): Promise<CashSession>;
  openCash(branchId: BranchId, amount: number): Promise<CashSession>;
  /** Detalle del turno abierto. */
  getCashSummary(branchId: BranchId): Promise<CashSummary>;
  addCashMovement(branchId: BranchId, input: CashMovementRequest): Promise<CashMovement>;
  /** Arqueo y cierre del turno. */
  closeCash(branchId: BranchId, input: CashCloseRequest): Promise<CashClosing>;
  /** Cierres de los últimos `days` días. Sin `branchId`, todos los locales (solo administrador). */
  listCashClosings(options: { branchId?: BranchId; days: number }): Promise<CashClosing[]>;
  createSale(input: SaleRequest): Promise<Sale>;
}
