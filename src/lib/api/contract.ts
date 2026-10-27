/**
 * Contrato entre el front y la API. Hay dos implementaciones:
 *  - http.ts → la API real del backend (ver docs/API.md)
 *  - mock/   → datos de ejemplo en el navegador, para avanzar sin backend
 * Las pantallas solo conocen esta interfaz.
 */
import type {
  Branch, CashSession, Customer, ExpiryThresholds, Kardex, Lot, Pharmacy, Product, ProductInput, ProductVelocity, Sale, SaleRequest, Session, StaffSummary, User, BranchId, WriteOffRequest,
} from "./types";

export interface PublicConfig {
  pharmacy: Pharmacy;
  branches: Branch[];
  expiry: ExpiryThresholds;
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
}

export interface ApiClient {
  /* Público (antes del login) */
  getPublicConfig(): Promise<PublicConfig>;
  listStaff(): Promise<StaffSummary[]>;
  login(userId: string, pin: string): Promise<Session>;

  /* Sesión */
  me(): Promise<User>;
  logout(): Promise<void>;

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

  /* Clientes */
  searchCustomers(query: string): Promise<Customer[]>;
  createCustomer(input: NewCustomer): Promise<Customer>;

  /* Caja y ventas */
  getCashSession(branchId: BranchId): Promise<CashSession>;
  openCash(branchId: BranchId, amount: number): Promise<CashSession>;
  createSale(input: SaleRequest): Promise<Sale>;
}
