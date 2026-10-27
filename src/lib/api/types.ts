/**
 * Tipos de dominio compartidos con el backend.
 * Fuente de verdad del contrato: docs/API.md (mantener ambos sincronizados).
 * Dinero en soles con IGV incluido, como número con 2 decimales. Fechas: ISO 8601.
 */

export type BranchId = string; // "principal" | "sucursal" en la botica actual
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

export interface Customer {
  id: number;
  name: string;
  dni: string;
  ruc: string;
  phone: string;
  points: number;
  chronicProductIds: number[];
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

export interface CashSession {
  branchId: BranchId;
  open: boolean;
  openedAt: string | null;
  openingAmount: number;
}

export interface ApiErrorBody {
  code: string; // p. ej. "STOCK_INSUFICIENTE", "PIN_INVALIDO", "CAJA_CERRADA"
  message: string; // texto listo para mostrar al usuario
  details?: Record<string, unknown>;
}
