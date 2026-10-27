"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { BranchId, Lot, Product, ProductInput, SaleRequest, WriteOffRequest } from "@/lib/api";
import type { NewCustomer } from "@/lib/api";

export const qk = {
  config: ["config"] as const,
  staff: ["staff"] as const,
  products: ["products"] as const,
  lots: (b: BranchId) => ["lots", b] as const,
  branchStock: ["branch-stock"] as const,
  cash: (b: BranchId) => ["cash", b] as const,
  customers: (q: string) => ["customers", q] as const,
  velocity: (days: number) => ["velocity", days] as const,
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
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["customers"] }),
  });
}

export function useOpenCash(branchId: BranchId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (amount: number) => api.openCash(branchId, amount),
    onSuccess: (s) => qc.setQueryData(qk.cash(branchId), s),
  });
}
