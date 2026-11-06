/**
 * Contrato entre el front y la API. Hay dos implementaciones:
 *  - http.ts → la API real del backend (ver docs/API.md)
 *  - mock/   → datos de ejemplo en el navegador, para avanzar sin backend
 * Las pantallas solo conocen esta interfaz.
 */
import type {
  Account, BoticaPublic, PlanOffer, SignUpInput, Setup, SetupStep, Branch, CashCloseRequest, CashClosing, CashMovement, CashMovementRequest, CashSession, CashSummary, Customer, ExpiryThresholds, Kardex, Lot, Pharmacy, Product, ProductInput, ProductVelocity, Purchase, PurchaseRequest, PurchasingSettings, Sale, SaleRequest, Session,
  Dashboard, SalesReportLine, AttendanceMark, ContactRequest, CustomerInput, CustomerPurchase, CustomerSummary, RefillInfo, AttendanceSettings, ClockRequest, KioskWorker, ManualMarkRequest, Worker, WorkerInput,
  AccountInput, BranchCreateInput, BranchCreated, Plan, BranchInput, BranchSeries, RulesInput, StaffAccount,
  StaffSummary, Supplier, SupplierInput, Transfer, TransferAskRequest, TransferSendRequest, User, BranchId, WriteOffRequest,
  CreditNote, CreditNoteRequest, Voucher, VoidRequest, SaleSyncRequest, SaleSyncResponse,
  AuditEntry, AuditQuery, CustomersQuery, Page, PlatformSession, TenantAction, TenantDetail, TenantPage, TenantSummary, TenantsQuery,
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
  /* Público (antes del login). Cada llamada lleva la botica elegida en el header X-Botica (ver tenant.ts). */
  /** Datos públicos de una botica por su código. Error BOTICA_NO_ENCONTRADA (404) si no existe. */
  resolveBotica(code: string): Promise<BoticaPublic>;
  getPublicConfig(): Promise<PublicConfig>;
  listStaff(): Promise<StaffSummary[]>;
  login(userId: string, pin: string): Promise<Session>;
  /** Ingreso del dueño (administrador) con correo y contraseña. CREDENCIALES_INVALIDAS (401) si no coinciden. */
  loginOwner(email: string, password: string): Promise<Session>;

  /** Planes que se pueden contratar (público). */
  listPlans(): Promise<PlanOffer[]>;
  /** Crea una botica en prueba de 14 días y devuelve la sesión del dueño. CODIGO_EN_USO (409), CORREO_EN_USO (409) o DATOS_INVALIDOS (400). */
  signUp(input: SignUpInput): Promise<Session>;

  /* Marcación de asistencia (sin sesión: el equipo del local, con el PIN personal del trabajador) */
  listKioskWorkers(branchId: BranchId): Promise<KioskWorker[]>;
  clock(input: ClockRequest): Promise<AttendanceMark>;

  /* Sesión */
  me(): Promise<User>;
  logout(): Promise<void>;
  /** Estado de la cuenta y módulos del plan. Lo puede leer cualquier sesión (el aviso se muestra a todos). */
  getAccount(): Promise<Account>;

  /* Primera configuración (solo administrador) */
  getSetup(): Promise<Setup>;
  completeSetupStep(step: SetupStep): Promise<Setup>;

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
  /**
   * Movimientos de un producto en los últimos `days` días. Sin `branchId`, todos los locales (solo administrador).
   * Con `page` (y `pageSize`) devuelve solo esa página de movimientos más el total y las cifras del periodo (`Kardex.summary`).
   */
  getKardex(productId: number, options: { branchId?: BranchId; days: number; page?: number; pageSize?: number }): Promise<Kardex>;

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
  /** La misma cartera por páginas y con búsqueda en el servidor, de la compra más reciente a la más antigua. */
  listCustomersPage(query: CustomersQuery): Promise<Page<CustomerSummary>>;
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
  /** Con `clientSaleId`, repetir la llamada devuelve la venta original (idempotente). Con otros datos y la misma clave: CLAVE_REPETIDA (409). */
  createSale(input: SaleRequest): Promise<Sale>;
  /** Registra en orden un lote de ventas hechas sin conexión (máx. 50). Cada una responde por separado; un fallo no frena a las demás. */
  syncSales(input: SaleSyncRequest): Promise<SaleSyncResponse>;

  /* Comprobantes electrónicos (SUNAT) */
  /** Boletas y facturas emitidas entre dos fechas (YYYY-MM-DD, ambas incluidas), con su estado ante SUNAT. El encargado recibe solo su local. */
  listVouchers(options: { from: string; to: string; branchId?: BranchId }): Promise<Voucher[]>;
  /** Notas de crédito emitidas entre dos fechas. El encargado recibe solo las de su local. */
  listCreditNotes(options: { from: string; to: string; branchId?: BranchId }): Promise<CreditNote[]>;
  /** Vuelve a enviar a SUNAT un comprobante pendiente o rechazado. ESTADO_INVALIDO (409) si ya está aceptado o anulado. */
  resendVoucher(id: string): Promise<Voucher>;
  /** Igual que resendVoucher, para una nota de crédito. */
  resendCreditNote(id: string): Promise<CreditNote>;
  /** Comunicación de baja: anula un comprobante aceptado dentro de los 7 días de su emisión. */
  voidVoucher(id: string, input: VoidRequest): Promise<Voucher>;
  /** Emite una nota de crédito sobre un comprobante aceptado. Devuelve la nota. */
  createCreditNote(voucherId: string, input: CreditNoteRequest): Promise<CreditNote>;

  /* Auditoría (solo administrador) */
  /** Quién hizo qué y cuándo, del más reciente al más antiguo, siempre por páginas. */
  listAudit(query: AuditQuery): Promise<Page<AuditEntry>>;
}

/**
 * API de la consola interna de Digi!HME. Es otra puerta, separada de `ApiClient`: otro inicio de sesión, otro token
 * y ninguna botica elegida (no lleva `X-Botica`). Una sesión de botica nunca sirve aquí, ni al revés.
 */
export interface PlatformClient {
  /** Ingreso del operador con correo y contraseña. CREDENCIALES_INVALIDAS (401) si no coinciden. */
  login(email: string, password: string): Promise<PlatformSession>;
  logout(): Promise<void>;
  /** Boticas clientes, siempre por páginas, con el conteo por estado. */
  listTenants(query?: TenantsQuery): Promise<TenantPage>;
  /** Detalle de solo lectura de una botica. BOTICA_NO_ENCONTRADA (404) si el código no existe. */
  getTenant(code: string): Promise<TenantDetail>;
  /** Cambiar de plan, extender la prueba, suspender o reactivar. Devuelve la botica ya actualizada. */
  updateTenant(code: string, input: TenantAction): Promise<TenantSummary>;
}
