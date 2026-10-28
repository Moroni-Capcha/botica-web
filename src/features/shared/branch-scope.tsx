"use client";

import { useMemo, useState } from "react";
import { useQueries, type UseQueryResult } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { BranchId, Lot } from "@/lib/api/types";
import { useOperatingBranch, useSessionStore } from "@/lib/auth/session-store";
import { qk, useConfig } from "@/lib/queries";
import { Segmented } from "@/components/ui/segmented";

export type Scope = "one" | "all";

/**
 * Locales que mira una pantalla de consulta. El encargado siempre ve el suyo;
 * el administrador puede ver solo el local donde opera o todos los activos.
 */
export function useBranchScope() {
  const isAdmin = useSessionStore((s) => s.session?.user.role) === "admin";
  const operating = useOperatingBranch();
  const config = useConfig();
  const [all, setAll] = useState(false);
  const scope: Scope = isAdmin && all ? "all" : "one";
  const branches = config.data?.branches ?? [];
  const allBranches = useMemo(() => [...(config.data?.branches ?? []), ...(config.data?.closedBranches ?? [])], [config.data]);
  const ids = useMemo<BranchId[]>(() => (scope === "all" ? (config.data?.branches.map((b) => b.id) ?? [operating]) : [operating]), [scope, config.data, operating]);
  const branchName = (id: BranchId) => allBranches.find((b) => b.id === id)?.name ?? id;
  return {
    scope,
    setScope: (v: Scope) => setAll(v === "all"),
    ids,
    multi: scope === "all",
    isAdmin,
    operating,
    /** Locales activos */
    branches,
    /** Activos y desactivados: para nombrar locales en el historial */
    allBranches,
    branchName,
    label: scope === "all" ? allLabel(branches.length) : `Local ${branchName(operating)}`,
  };
}

/** "Ambos locales" si son dos; "Todos los locales (4)" si son más. */
export const allLabel = (count: number) => (count === 2 ? "Ambos locales" : count > 2 ? `Todos los locales (${count})` : "Todos los locales");

/** Selector "Solo Principal / Todos los locales" (solo para el administrador, si hay más de un local). */
export function ScopeToggle({ scope, onChange, operatingName }: { scope: Scope; onChange: (v: Scope) => void; operatingName: string }) {
  const count = useConfig().data?.branches.length ?? 0;
  if (count < 2) return null;
  return (
    <Segmented<Scope>
      label="Locales"
      value={scope}
      onChange={onChange}
      options={[
        { id: "one", label: `Solo ${operatingName}` },
        { id: "all", label: allLabel(count) },
      ]}
    />
  );
}

/** Une los lotes de varios locales. Fuera del componente para que React Query memorice el resultado. */
const combineLots = (results: UseQueryResult<Lot[]>[]) => ({
  lots: results.flatMap((r) => r.data ?? []),
  isLoading: results.some((r) => r.isLoading),
  error: results.find((r) => r.error)?.error ?? null,
  refetch: () => Promise.all(results.map((r) => r.refetch())),
});

/** Lotes de los locales pedidos (comparte la caché con el punto de venta). */
export function useBranchLots(branchIds: BranchId[]) {
  return useQueries({
    queries: branchIds.map((b) => ({ queryKey: qk.lots(b), queryFn: () => api.listLots(b), staleTime: 30_000 })),
    combine: combineLots,
  });
}
