"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ClockRequest, ContactRequest, CustomerInput, ManualMarkRequest, WorkerInput } from "@/lib/api";
import type { BranchId, CashCloseRequest, CashMovementRequest, Lot, Product, ProductInput, PurchaseRequest, SaleRequest, Supplier, SupplierInput, Transfer, TransferAskRequest, TransferSendRequest, WriteOffRequest } from "@/lib/api";
import type { NewCustomer, AccountInput, BranchCreateInput, BranchInput, Pharmacy, RulesInput, PublicConfig } from "@/lib/api";

export const qk = {
  config: ["config"] as const,
  staff: ["staff"] as const,
  products: ["products"] as const,
  lots: (b: BranchId) => ["lots", b] as const,
  branchStock: ["branch-stock"] as const,
  cash: (b: BranchId) => ["cash", b] as const,
  cashSummary: (b: BranchId) => ["cash-summary", b] as const,
  closings: (b: BranchId | null, days: number) => ["closings", b, days] as const,
  customers: (q: string) => ["customers", q] as const,
  velocity: (days: number) => ["velocity", days] as const,
  suppliers: ["suppliers"] as const,
  kiosk: (b: BranchId) => ["kiosk", b] as const,
  workers: ["workers"] as const,
  dashboard: (days: number) => ["dashboard", days] as const,
  customersAll: ["customers-all"] as const,
  salesReport: (from: string, to: string, branchId: BranchId | null) => ["sales-report", from, to, branchId] as const,
  refills: ["refills"] as const,
  accounts: ["accounts"] as const,
  branchSeries: ["branch-series"] as const,
  customerPurchases: (id: number) => ["customer-purchases", id] as const,
  marks: (from: string, to: string) => ["marks", from, to] as const,
  transfers: (days: number) => ["transfers", days] as const,
  purchases: (branchId: BranchId | null, days: number) => ["purchases", branchId, days] as const,
  kardex: (productId: number, branchId: BranchId | null, days: number) => ["kardex", productId, branchId, days] as const,
};

export const useConfig = () => useQuery({ queryKey: qk.config, queryFn: api.getPublicConfig, staleTime: 10 * 60_000 });
export const useStaff = () => useQuery({ queryKey: qk.staff, queryFn: api.listStaff, staleTime: 60_000 });
export const useProducts = () => useQuery({ queryKey: qk.products, queryFn: api.listProducts, staleTime: 5 * 60_000 });
export const useLots = (branchId: BranchId) => useQuery({ queryKey: qk.lots(branchId), queryFn: () => api.listLots(branchId), staleTime: 30_000 });
export const useBranchStock = () => useQuery({ queryKey: qk.branchStock, queryFn: api.listBranchStock, staleTime: 60_000 });
export const useVelocity = (days = 30) => useQuery({ queryKey: qk.velocity(days), queryFn: () => api.listVelocity(days), staleTime: 5 * 60_000 });
export const useKardex = (productId: number, branchId: BranchId | null, days = 30) =>
  useQuery({ queryKey: qk.kardex(productId, branchId, days), queryFn: () => api.getKardex(productId, { branchId: branchId ?? undefined, days }), staleTime: 30_000 });
export const useTransfers = (days: number) => useQuery({ queryKey: qk.transfers(days), queryFn: () => api.listTransfers(days), staleTime: 20_000, refetchInterval: 60_000 });
export const useCashSummary = (branchId: BranchId) => useQuery({ queryKey: qk.cashSummary(branchId), queryFn: () => api.getCashSummary(branchId), refetchInterval: 60_000 });
export const useCashClosings = (branchId: BranchId | null, days: number) =>
  useQuery({ queryKey: qk.closings(branchId, days), queryFn: () => api.listCashClosings({ branchId: branchId ?? undefined, days }), staleTime: 30_000 });
export const useKioskWorkers = (branchId: BranchId, enabled = true) => useQuery({ queryKey: qk.kiosk(branchId), queryFn: () => api.listKioskWorkers(branchId), enabled, staleTime: 10_000 });
export const useWorkers = (enabled = true) => useQuery({ queryKey: qk.workers, queryFn: api.listWorkers, staleTime: 60_000, enabled });
export const useMarks = (from: string, to: string, enabled = true) => useQuery({ queryKey: qk.marks(from, to), queryFn: () => api.listMarks({ from, to }), staleTime: 20_000, refetchInterval: 60_000, enabled });
export const useDashboard = (days: number) => useQuery({ queryKey: qk.dashboard(days), queryFn: () => api.getDashboard(days), staleTime: 30_000, refetchInterval: 60_000 });
export const useSalesReport = (from: string, to: string, branchId: BranchId | null, enabled = true) =>
  useQuery({ queryKey: qk.salesReport(from, to, branchId), queryFn: () => api.getSalesReport({ from, to, branchId: branchId ?? undefined }), staleTime: 60_000, enabled, placeholderData: (prev) => prev });
export const useCustomers = () => useQuery({ queryKey: qk.customersAll, queryFn: api.listCustomers, staleTime: 30_000 });
export const useRefills = () => useQuery({ queryKey: qk.refills, queryFn: api.listRefills, staleTime: 30_000 });
export const useCustomerPurchases = (id: number | null) => useQuery({ queryKey: qk.customerPurchases(id ?? 0), queryFn: () => api.listCustomerPurchases(id!), enabled: id !== null, staleTime: 30_000 });
export const useSuppliers = () => useQuery({ queryKey: qk.suppliers, queryFn: api.listSuppliers, staleTime: 5 * 60_000 });
export const usePurchases = (branchId: BranchId | null, days: number) =>
  useQuery({ queryKey: qk.purchases(branchId, days), queryFn: () => api.listPurchases({ branchId: branchId ?? undefined, days }), staleTime: 30_000 });
export const useCash = (branchId: BranchId) => useQuery({ queryKey: qk.cash(branchId), queryFn: () => api.getCashSession(branchId) });
export const useCustomerSearch = (q: string, enabled: boolean) =>
  useQuery({ queryKey: qk.customers(q), queryFn: () => api.searchCustomers(q), enabled, staleTime: 30_000 });

export function useCreateSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: SaleRequest) => api.createSale(req),
    onSuccess: (sale) => {
      void qc.invalidateQueries({ queryKey: qk.lots(sale.branchId) });
      void qc.invalidateQueries({ queryKey: qk.branchStock });
      void qc.invalidateQueries({ queryKey: ["velocity"] });
      void qc.invalidateQueries({ queryKey: ["kardex"] });
      void qc.invalidateQueries({ queryKey: qk.cashSummary(sale.branchId) });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      if (sale.customerId) for (const key of [qk.customersAll, qk.refills, qk.customerPurchases(sale.customerId)]) void qc.invalidateQueries({ queryKey: key });
    },
  });
}

/** Crea o edita un producto y actualiza el catálogo en la caché. */
export function useSaveProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: number; input: ProductInput }) => (id ? api.updateProduct(id, input) : api.createProduct(input)),
    onSuccess: (p) =>
      qc.setQueryData<Product[]>(qk.products, (old) => (old ? (old.some((x) => x.id === p.id) ? old.map((x) => (x.id === p.id ? p : x)) : [...old, p]) : old)),
  });
}

/** Reemplaza en la caché los lotes que devolvió el servidor, sin volver a pedir toda la lista. */
function patchLots(qc: ReturnType<typeof useQueryClient>, updated: Lot[]) {
  const byBranch = new Map<BranchId, Lot[]>();
  for (const l of updated) byBranch.set(l.branchId, [...(byBranch.get(l.branchId) ?? []), l]);
  for (const [branchId, list] of byBranch) {
    const ids = new Map(list.map((l) => [l.id, l]));
    qc.setQueryData<Lot[]>(qk.lots(branchId), (old) => old?.map((l) => ids.get(l.id) ?? l).filter((l) => l.qty > 0));
  }
}

export function useSetLotDiscount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ branchId, lotIds, discount }: { branchId: BranchId; lotIds: number[]; discount: number }) => api.setLotDiscount(branchId, lotIds, discount),
    onSuccess: (lots) => patchLots(qc, lots),
  });
}

export function useWriteOffLot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ lotId, input }: { lotId: number; input: WriteOffRequest }) => api.writeOffLot(lotId, input),
    onSuccess: (lot) => {
      patchLots(qc, [lot]);
      void qc.invalidateQueries({ queryKey: qk.branchStock });
      void qc.invalidateQueries({ queryKey: ["kardex"] });
    },
  });
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (c: NewCustomer) => api.createCustomer(c),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["customers"] });
      void qc.invalidateQueries({ queryKey: qk.customersAll });
    },
  });
}

export function useOpenCash(branchId: BranchId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (amount: number) => api.openCash(branchId, amount),
    onSuccess: (s) => {
      qc.setQueryData(qk.cash(branchId), s);
      void qc.invalidateQueries({ queryKey: qk.cashSummary(branchId) });
    },
  });
}

export function useSaveSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: number; input: SupplierInput }) => (id ? api.updateSupplier(id, input) : api.createSupplier(input)),
    onSuccess: (sup) => {
      qc.setQueryData<Supplier[]>(qk.suppliers, (old) => (old ? (old.some((x) => x.id === sup.id) ? old.map((x) => (x.id === sup.id ? sup : x)) : [...old, sup]) : old));
      void qc.invalidateQueries({ queryKey: ["purchases"] });
    },
  });
}

/** Registra un ingreso: refresca lotes, stock, kardex, compras y el catálogo (el costo cambia con la última compra). */
export function useCreatePurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: PurchaseRequest) => api.createPurchase(req),
    onSuccess: (p) => {
      for (const key of [qk.lots(p.branchId), qk.branchStock, qk.products, ["kardex"], ["purchases"]]) void qc.invalidateQueries({ queryKey: key });
    },
  });
}

/** Acciones de traslado: cualquiera cambia el stock de ambos locales, así que se refresca todo lo relacionado. */
export function useTransferAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: { kind: "send"; input: TransferSendRequest } | { kind: "ask"; input: TransferAskRequest } | { kind: "dispatch" | "receive"; id: number } | { kind: "cancel"; id: number; reason: string }): Promise<Transfer> => {
      switch (a.kind) {
        case "send":
          return api.sendTransfer(a.input);
        case "ask":
          return api.askTransfer(a.input);
        case "dispatch":
          return api.dispatchTransfer(a.id);
        case "receive":
          return api.receiveTransfer(a.id);
        case "cancel":
          return api.cancelTransfer(a.id, a.reason);
      }
    },
    onSuccess: (t) => {
      for (const key of [qk.lots(t.fromBranchId), qk.lots(t.toBranchId), qk.branchStock, ["kardex"], ["transfers"]]) void qc.invalidateQueries({ queryKey: key });
    },
  });
}

export function useAddCashMovement(branchId: BranchId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CashMovementRequest) => api.addCashMovement(branchId, input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.cashSummary(branchId) }),
  });
}

export function useCloseCash(branchId: BranchId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CashCloseRequest) => api.closeCash(branchId, input),
    onSuccess: () => {
      for (const key of [qk.cash(branchId), qk.cashSummary(branchId), ["closings"]]) void qc.invalidateQueries({ queryKey: key });
    },
  });
}

export function useClock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ClockRequest) => api.clock(input),
    onSuccess: (m) => {
      void qc.invalidateQueries({ queryKey: qk.kiosk(m.branchId) });
      void qc.invalidateQueries({ queryKey: ["marks"] });
    },
  });
}

export function useManualMark() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ManualMarkRequest) => api.addManualMark(input),
    onSuccess: (m) => {
      void qc.invalidateQueries({ queryKey: ["marks"] });
      void qc.invalidateQueries({ queryKey: qk.kiosk(m.branchId) });
    },
  });
}

export function useSaveWorker() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: WorkerInput }) => (id ? api.updateWorker(id, input) : api.createWorker(input)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.workers });
      void qc.invalidateQueries({ queryKey: ["kiosk"] });
    },
  });
}

export function useSaveCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: number; input: CustomerInput }) =>
      id ? api.updateCustomer(id, input) : api.createCustomer(input).then((c) => (input.treatments.length || input.notes ? api.updateCustomer(c.id, input) : c)),
    onSuccess: () => {
      for (const key of [qk.customersAll, qk.refills, ["customers"]]) void qc.invalidateQueries({ queryKey: key });
    },
  });
}

export function useLogContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ customerId, input }: { customerId: number; input: ContactRequest }) => api.logContact(customerId, input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.refills }),
  });
}

/* ------------------------------ Ajustes ------------------------------ */

export const useAccounts = () => useQuery({ queryKey: qk.accounts, queryFn: api.listAccounts, staleTime: 60_000 });
export const useBranchSeries = () => useQuery({ queryKey: qk.branchSeries, queryFn: api.listBranchSeries, staleTime: 30_000 });

/** Los ajustes viven en la configuración pública: se actualiza la caché al instante y se vuelve a leer. */
function useConfigPatch() {
  const qc = useQueryClient();
  return (patch: (c: PublicConfig) => PublicConfig) => {
    qc.setQueryData<PublicConfig>(qk.config, (old) => (old ? patch(old) : old));
    void qc.invalidateQueries({ queryKey: qk.config });
  };
}

export function useUpdatePharmacy() {
  const patch = useConfigPatch();
  return useMutation({ mutationFn: (input: Pharmacy) => api.updatePharmacy(input), onSuccess: (pharmacy) => patch((c) => ({ ...c, pharmacy })) });
}

export function useUpdateBranch() {
  const patch = useConfigPatch();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: BranchId; input: BranchInput }) => api.updateBranch(id, input),
    onSuccess: (b) => {
      patch((c) => ({ ...c, branches: c.branches.map((x) => (x.id === b.id ? b : x)), closedBranches: c.closedBranches.map((x) => (x.id === b.id ? b : x)) }));
      void qc.invalidateQueries({ queryKey: qk.branchSeries });
    },
  });
}

/** Crear, desactivar o reactivar un local cambia los locales activos, las cuentas y el personal: se vuelve a leer todo eso. */
function useRefreshBranches() {
  const qc = useQueryClient();
  return () => {
    for (const key of [qk.config, qk.branchSeries, qk.accounts, qk.staff, qk.workers, qk.branchStock, ["kiosk"], ["dashboard"], ["transfers"]]) void qc.invalidateQueries({ queryKey: key });
  };
}

export function useCreateBranch() {
  const refresh = useRefreshBranches();
  return useMutation({ mutationFn: (input: BranchCreateInput) => api.createBranch(input), onSuccess: refresh });
}

export function useSetBranchActive() {
  const refresh = useRefreshBranches();
  return useMutation({
    mutationFn: ({ id, active, reason }: { id: BranchId; active: boolean; reason?: string }) => (active ? api.activateBranch(id) : api.deactivateBranch(id, reason ?? "")),
    onSuccess: refresh,
  });
}

export function useUpdateRules() {
  const patch = useConfigPatch();
  return useMutation({ mutationFn: (input: RulesInput) => api.updateRules(input), onSuccess: (r) => patch((c) => ({ ...c, ...r })) });
}

export function useSaveAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: AccountInput }) => (id ? api.updateAccount(id, input) : api.createAccount(input)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.accounts });
      void qc.invalidateQueries({ queryKey: qk.staff });
    },
  });
}
