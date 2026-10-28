/** Implementación del contrato contra la API REST del backend. Endpoints: docs/API.md */
import type { ApiClient, BranchStock, NewCustomer, PublicConfig } from "./contract";
import { ApiError } from "./errors";
import type { AccountInput, Branch, BranchCreateInput, BranchCreated, BranchInput, BranchSeries, Pharmacy, RulesInput, StaffAccount, SalesReportLine, ContactRequest, CustomerInput, CustomerPurchase, CustomerSummary, RefillInfo, Dashboard, AttendanceMark, ClockRequest, KioskWorker, ManualMarkRequest, Worker, WorkerInput } from "./types";
import type { ApiErrorBody, BranchId, CashCloseRequest, CashClosing, CashMovement, CashMovementRequest, CashSession, CashSummary, Customer, Kardex, Lot, Product, ProductInput, ProductVelocity, Purchase, PurchaseRequest, Supplier, SupplierInput, Transfer, TransferAskRequest, TransferSendRequest, Sale, SaleRequest, Session, StaffSummary, User, WriteOffRequest } from "./types";
import { tokenStore } from "./token";

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export function createHttpClient(baseUrl: string): ApiClient {
  const base = baseUrl.replace(/\/$/, "");

  async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const token = tokenStore.get();
    if (token) headers.Authorization = `Bearer ${token}`;

    let res: Response;
    try {
      res = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      throw new ApiError({ code: "SIN_CONEXION", message: "No hay conexión con el servidor. Revisa el internet del local." }, 0);
    }

    if (res.status === 401) {
      tokenStore.clear();
      tokenStore.notifyExpired();
    }
    if (res.status === 204) return undefined as T;

    const data: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const err = (data ?? {}) as Partial<ApiErrorBody>;
      throw new ApiError({ code: err.code ?? `HTTP_${res.status}`, message: err.message ?? "El servidor no pudo completar la operación.", details: err.details }, res.status);
    }
    return data as T;
  }

  const q = (params: Record<string, string>) => `?${new URLSearchParams(params).toString()}`;

  return {
    getPublicConfig: () => request<PublicConfig>("GET", "/public/config"),
    listStaff: () => request<StaffSummary[]>("GET", "/auth/staff"),
    login: (userId, pin) => request<Session>("POST", "/auth/login", { userId, pin }),
    listKioskWorkers: (branchId: BranchId) => request<KioskWorker[]>("GET", `/public/attendance/workers${q({ branchId })}`),
    clock: (input: ClockRequest) => request<AttendanceMark>("POST", "/public/attendance/clock", input),
    me: () => request<User>("GET", "/auth/me"),
    logout: () => request<void>("POST", "/auth/logout"),

    updatePharmacy: (input: Pharmacy) => request<Pharmacy>("PUT", "/settings/pharmacy", input),
    createBranch: (input: BranchCreateInput) => request<BranchCreated>("POST", "/settings/branches", input),
    deactivateBranch: (id: BranchId, reason: string) => request<Branch>("POST", `/settings/branches/${encodeURIComponent(id)}/deactivate`, { reason }),
    activateBranch: (id: BranchId) => request<Branch>("POST", `/settings/branches/${encodeURIComponent(id)}/activate`),
    updateBranch: (id: BranchId, input: BranchInput) => request<Branch>("PUT", `/settings/branches/${encodeURIComponent(id)}`, input),
    listBranchSeries: () => request<BranchSeries[]>("GET", "/settings/series"),
    updateRules: (input: RulesInput) => request<RulesInput>("PUT", "/settings/rules", input),
    listAccounts: () => request<StaffAccount[]>("GET", "/settings/accounts"),
    createAccount: (input: AccountInput) => request<StaffAccount>("POST", "/settings/accounts", input),
    updateAccount: (id: string, input: AccountInput) => request<StaffAccount>("PUT", `/settings/accounts/${encodeURIComponent(id)}`, input),
    getSalesReport: ({ from, to, branchId }: { from: string; to: string; branchId?: BranchId }) => request<SalesReportLine[]>("GET", `/reports/sales${q({ from, to, ...(branchId ? { branchId } : {}) })}`),
    getDashboard: (days: number) => request<Dashboard>("GET", `/dashboard${q({ days: String(days) })}`),
    listProducts: () => request<Product[]>("GET", "/products"),
    listLots: (branchId: BranchId) => request<Lot[]>("GET", `/lots${q({ branchId })}`),
    listBranchStock: () => request<BranchStock[]>("GET", "/stock/summary"),
    createProduct: (input: ProductInput) => request<Product>("POST", "/products", input),
    updateProduct: (id: number, input: ProductInput) => request<Product>("PUT", `/products/${id}`, input),
    getKardex: (productId: number, { branchId, days }: { branchId?: BranchId; days: number }) =>
      request<Kardex>("GET", `/kardex${q({ productId: String(productId), days: String(days), ...(branchId ? { branchId } : {}) })}`),

    listVelocity: (days: number) => request<ProductVelocity[]>("GET", `/sales/velocity${q({ days: String(days) })}`),
    setLotDiscount: (branchId: BranchId, lotIds: number[], discount: number) => request<Lot[]>("PATCH", "/lots/discount", { branchId, lotIds, discount }),
    writeOffLot: (lotId: number, input: WriteOffRequest) => request<Lot>("POST", `/lots/${lotId}/write-off`, input),

    listSuppliers: () => request<Supplier[]>("GET", "/suppliers"),
    createSupplier: (input: SupplierInput) => request<Supplier>("POST", "/suppliers", input),
    updateSupplier: (id: number, input: SupplierInput) => request<Supplier>("PUT", `/suppliers/${id}`, input),
    listPurchases: ({ branchId, days }: { branchId?: BranchId; days: number }) => request<Purchase[]>("GET", `/purchases${q({ days: String(days), ...(branchId ? { branchId } : {}) })}`),
    createPurchase: (input: PurchaseRequest) => request<Purchase>("POST", "/purchases", input),

    listTransfers: (days: number) => request<Transfer[]>("GET", `/transfers${q({ days: String(days) })}`),
    sendTransfer: (input: TransferSendRequest) => request<Transfer>("POST", "/transfers", input),
    askTransfer: (input: TransferAskRequest) => request<Transfer>("POST", "/transfers/requests", input),
    dispatchTransfer: (id: number) => request<Transfer>("POST", `/transfers/${id}/dispatch`),
    receiveTransfer: (id: number) => request<Transfer>("POST", `/transfers/${id}/receive`),
    cancelTransfer: (id: number, reason: string) => request<Transfer>("POST", `/transfers/${id}/cancel`, { reason }),

    listWorkers: () => request<Worker[]>("GET", "/attendance/workers"),
    createWorker: (input: WorkerInput) => request<Worker>("POST", "/attendance/workers", input),
    updateWorker: (id: string, input: WorkerInput) => request<Worker>("PUT", `/attendance/workers/${encodeURIComponent(id)}`, input),
    listMarks: ({ from, to, branchId }: { from: string; to: string; branchId?: BranchId }) => request<AttendanceMark[]>("GET", `/attendance/marks${q({ from, to, ...(branchId ? { branchId } : {}) })}`),
    addManualMark: (input: ManualMarkRequest) => request<AttendanceMark>("POST", "/attendance/marks/manual", input),

    searchCustomers: (query: string) => request<Customer[]>("GET", `/customers${q({ q: query })}`),
    createCustomer: (input: NewCustomer) => request<Customer>("POST", "/customers", input),
    listCustomers: () => request<CustomerSummary[]>("GET", "/customers/all"),
    updateCustomer: (id: number, input: CustomerInput) => request<Customer>("PUT", `/customers/${id}`, input),
    listCustomerPurchases: (id: number) => request<CustomerPurchase[]>("GET", `/customers/${id}/purchases`),
    listRefills: () => request<RefillInfo[]>("GET", "/customers/refills"),
    logContact: (customerId: number, input: ContactRequest) => request<void>("POST", `/customers/${customerId}/contacts`, input),

    getCashSession: (branchId: BranchId) => request<CashSession>("GET", `/cash/${encodeURIComponent(branchId)}`),
    openCash: (branchId: BranchId, amount: number) => request<CashSession>("POST", `/cash/${encodeURIComponent(branchId)}/open`, { amount }),
    getCashSummary: (branchId: BranchId) => request<CashSummary>("GET", `/cash/${encodeURIComponent(branchId)}/summary`),
    addCashMovement: (branchId: BranchId, input: CashMovementRequest) => request<CashMovement>("POST", `/cash/${encodeURIComponent(branchId)}/movements`, input),
    closeCash: (branchId: BranchId, input: CashCloseRequest) => request<CashClosing>("POST", `/cash/${encodeURIComponent(branchId)}/close`, input),
    listCashClosings: ({ branchId, days }: { branchId?: BranchId; days: number }) => request<CashClosing[]>("GET", `/cash/closings${q({ days: String(days), ...(branchId ? { branchId } : {}) })}`),
    createSale: (input: SaleRequest) => request<Sale>("POST", "/sales", input),
  };
}
