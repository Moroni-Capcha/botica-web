/** Implementación del contrato contra la API REST del backend. Endpoints: docs/API.md */
import type { ApiClient, BranchStock, NewCustomer, PlatformClient, PublicConfig } from "./contract";
import { ApiError } from "./errors";
import type { PlanOffer, SignUpInput, Setup, SetupStep, Account, AccountInput, BoticaPublic, Branch, BranchCreateInput, BranchCreated, BranchInput, BranchSeries, Pharmacy, RulesInput, StaffAccount, SalesReportLine, ContactRequest, CustomerInput, CustomerPurchase, CustomerSummary, RefillInfo, Dashboard, AttendanceMark, ClockRequest, KioskWorker, ManualMarkRequest, Worker, WorkerInput } from "./types";
import type { ApiErrorBody, BranchId, CashCloseRequest, CashClosing, CashMovement, CashMovementRequest, CashSession, CashSummary, Customer, Kardex, Lot, Product, ProductInput, ProductVelocity, Purchase, PurchaseRequest, Supplier, SupplierInput, Transfer, TransferAskRequest, TransferSendRequest, Sale, SaleRequest, Session, StaffSummary, User, WriteOffRequest } from "./types";
import type { CreditNote, CreditNoteRequest, Voucher, VoidRequest, SaleSyncRequest, SaleSyncResponse, AuditEntry, AuditQuery, CustomersQuery, Page, PlatformSession, TenantAction, TenantPage, TenantSummary, TenantsQuery } from "./types";
import { tenantStore } from "./tenant";
import { platformTokenStore, tokenStore, type TokenStore } from "./token";
import { connection } from "./connection";

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type Requester = <T>(method: Method, path: string, body?: unknown, timeoutMs?: number) => Promise<T>;

/**
 * Arma la función que hace las peticiones. La API de la botica lleva `X-Botica` y su token, y avisa el estado de la conexión;
 * la de la consola de Digi!HME lleva su propio token y no elige botica.
 */
function makeRequester(base: string, { tenant, store }: { tenant: boolean; store: TokenStore }): Requester {
  return async function request<T>(method: Method, path: string, body?: unknown, timeoutMs?: number): Promise<T> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const botica = tenant ? tenantStore.get() : null;
    if (botica) headers["X-Botica"] = botica;
    const token = store.get();
    if (token) headers.Authorization = `Bearer ${token}`;

    let res: Response;
    try {
      res = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined });
    } catch {
      if (tenant) connection.reportUnreachable();
      throw new ApiError({ code: "SIN_CONEXION", message: "No hay conexión con el servidor. Revisa el internet del local." }, 0);
    }

    if (tenant) connection.reportReachable();
    if (res.status === 401) {
      store.clear();
      store.notifyExpired();
    }
    if (res.status === 204) return undefined as T;

    const data: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const err = (data ?? {}) as Partial<ApiErrorBody>;
      throw new ApiError({ code: err.code ?? `HTTP_${res.status}`, message: err.message ?? "El servidor no pudo completar la operación.", details: err.details }, res.status);
    }
    return data as T;
  };
}

const query = (params: Record<string, string>) => `?${new URLSearchParams(params).toString()}`;

/** Implementación de la consola interna de Digi!HME contra `/platform/*`. */
export function createHttpPlatformClient(baseUrl: string): PlatformClient {
  const request = makeRequester(baseUrl.replace(/\/$/, ""), { tenant: false, store: platformTokenStore });
  return {
    login: (email, password) => request<PlatformSession>("POST", "/platform/login", { email, password }),
    logout: () => request<void>("POST", "/platform/logout"),
    listTenants: ({ q, status, page, pageSize }: TenantsQuery = {}) =>
      request<TenantPage>("GET", `/platform/tenants${query({ ...(q ? { q } : {}), ...(status ? { status } : {}), ...(page ? { page: String(page) } : {}), ...(pageSize ? { pageSize: String(pageSize) } : {}) })}`),
    updateTenant: (code, input: TenantAction) => request<TenantSummary>("PATCH", `/platform/tenants/${encodeURIComponent(code)}`, input),
  };
}

export function createHttpClient(baseUrl: string): ApiClient {
  const base = baseUrl.replace(/\/$/, "");

  /** Tiempo máximo de espera de las ventas: con internet débil, mejor guardar la venta sin conexión que dejar al cajero esperando. */
  const SALE_TIMEOUT_MS = 20_000;

  const request = makeRequester(base, { tenant: true, store: tokenStore });

  const q = (params: Record<string, string>) => `?${new URLSearchParams(params).toString()}`;

  return {
    resolveBotica: (code: string) => request<BoticaPublic>("GET", `/public/botica/${encodeURIComponent(code)}`),
    getPublicConfig: () => request<PublicConfig>("GET", "/public/config"),
    listStaff: () => request<StaffSummary[]>("GET", "/auth/staff"),
    login: (userId, pin) => request<Session>("POST", "/auth/login", { userId, pin }),
    loginOwner: (email, password) => request<Session>("POST", "/auth/owner-login", { email, password }),
    listKioskWorkers: (branchId: BranchId) => request<KioskWorker[]>("GET", `/public/attendance/workers${q({ branchId })}`),
    clock: (input: ClockRequest) => request<AttendanceMark>("POST", "/public/attendance/clock", input),
    me: () => request<User>("GET", "/auth/me"),
    logout: () => request<void>("POST", "/auth/logout"),
    getAccount: () => request<Account>("GET", "/account"),
    listPlans: () => request<PlanOffer[]>("GET", "/public/plans"),
    signUp: (input: SignUpInput) => request<Session>("POST", "/public/signup", input),
    getSetup: () => request<Setup>("GET", "/setup"),
    completeSetupStep: (step: SetupStep) => request<Setup>("POST", `/setup/steps/${encodeURIComponent(step)}`),

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
    getKardex: (productId: number, { branchId, days, page, pageSize }: { branchId?: BranchId; days: number; page?: number; pageSize?: number }) =>
      request<Kardex>("GET", `/kardex${q({ productId: String(productId), days: String(days), ...(branchId ? { branchId } : {}), ...(page ? { page: String(page) } : {}), ...(pageSize ? { pageSize: String(pageSize) } : {}) })}`),

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
    listCustomersPage: ({ q: text, page, pageSize }: CustomersQuery) =>
      request<Page<CustomerSummary>>("GET", `/customers/all${q({ page: String(page ?? 1), ...(pageSize ? { pageSize: String(pageSize) } : {}), ...(text?.trim() ? { q: text.trim() } : {}) })}`),
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
    createSale: (input: SaleRequest) => request<Sale>("POST", "/sales", input, SALE_TIMEOUT_MS),
    syncSales: (input: SaleSyncRequest) => request<SaleSyncResponse>("POST", "/sales/sync", input, SALE_TIMEOUT_MS * 3),

    listVouchers: ({ from, to, branchId }: { from: string; to: string; branchId?: BranchId }) => request<Voucher[]>("GET", `/vouchers${q({ from, to, ...(branchId ? { branchId } : {}) })}`),
    listCreditNotes: ({ from, to, branchId }: { from: string; to: string; branchId?: BranchId }) => request<CreditNote[]>("GET", `/credit-notes${q({ from, to, ...(branchId ? { branchId } : {}) })}`),
    resendVoucher: (id: string) => request<Voucher>("POST", `/vouchers/${encodeURIComponent(id)}/resend`),
    resendCreditNote: (id: string) => request<CreditNote>("POST", `/credit-notes/${encodeURIComponent(id)}/resend`),
    voidVoucher: (id: string, input: VoidRequest) => request<Voucher>("POST", `/vouchers/${encodeURIComponent(id)}/void`, input),
    createCreditNote: (voucherId: string, input: CreditNoteRequest) => request<CreditNote>("POST", `/vouchers/${encodeURIComponent(voucherId)}/credit-notes`, input),

    listAudit: ({ from, to, userId, action, entity, page, pageSize }: AuditQuery) =>
      request<Page<AuditEntry>>("GET", `/audit${q({ from, to, ...(userId ? { userId } : {}), ...(action ? { action } : {}), ...(entity ? { entity } : {}), ...(page ? { page: String(page) } : {}), ...(pageSize ? { pageSize: String(pageSize) } : {}) })}`),
  };
}
