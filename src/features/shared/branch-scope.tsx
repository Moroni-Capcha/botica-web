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
 * el administrador puede ver solo el local donde opera o ambos.
 */
export function useBranchScope() {
  const isAdmin = useSessionStore((s) => s.session?.user.role) === "admin";
  const operating = useOperatingBranch();
  const config = useConfig();
  const [all, setAll] = useState(false);
  const scope: Scope = isAdmin && all ? "all" : "one";
  const branches = config.data?.branches ?? [];
  const ids = useMemo<BranchId[]>(() => (scope === "all" ? (config.data?.branches.map((b) => b.id) ?? [operating]) : [operating]), [scope, config.data, operating]);
  const branchName = (id: BranchId) => branches.find((b) => b.id === id)?.name ?? id;
  return {
    scope,
    setScope: (v: Scope) => setAll(v === "all"),
    ids,
    multi: scope === "all",
    isAdmin,
    operating,
    branches,
    branchName,
    label: scope === "all" ? "Ambos locales" : `Local ${branchName(operating)}`,
  };
}

/** Selector "Solo Principal / Ambos locales" (solo para el administrador). */
export function ScopeToggle({ scope, onChange, operatingName }: { scope: Scope; onChange: (v: Scope) => void; operatingName: string }) {
  return (
    <Segmented<Scope>
      label="Locales"
      value={scope}
      onChange={onChange}
      options={[
        { id: "one", label: `Solo ${operatingName}` },
        { id: "all", label: "Ambos locales" },
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
