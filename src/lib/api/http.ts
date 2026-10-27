/** Implementación del contrato contra la API REST del backend. Endpoints: docs/API.md */
import type { ApiClient, BranchStock, NewCustomer, PublicConfig } from "./contract";
import { ApiError } from "./errors";
import type { ApiErrorBody, BranchId, CashSession, Customer, Kardex, Lot, Product, ProductInput, ProductVelocity, Sale, SaleRequest, Session, StaffSummary, User, WriteOffRequest } from "./types";
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
    me: () => request<User>("GET", "/auth/me"),
    logout: () => request<void>("POST", "/auth/logout"),

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

    searchCustomers: (query: string) => request<Customer[]>("GET", `/customers${q({ q: query })}`),
    createCustomer: (input: NewCustomer) => request<Customer>("POST", "/customers", input),

    getCashSession: (branchId: BranchId) => request<CashSession>("GET", `/cash/${encodeURIComponent(branchId)}`),
    openCash: (branchId: BranchId, amount: number) => request<CashSession>("POST", `/cash/${encodeURIComponent(branchId)}/open`, { amount }),
    createSale: (input: SaleRequest) => request<Sale>("POST", "/sales", input),
  };
}
