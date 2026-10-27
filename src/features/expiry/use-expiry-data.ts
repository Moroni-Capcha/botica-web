"use client";

import { useMemo, useState } from "react";
import type { BranchId } from "@/lib/api/types";
import { useConfig, useProducts, useVelocity } from "@/lib/queries";
import { useBranchLots } from "@/features/shared/branch-scope";
import { dailyRates, lotRisk } from "@/lib/domain/expiry";
import { DEFAULT_THRESHOLDS } from "@/lib/domain/pharmacy";

/** Días de venta con los que se calcula el ritmo de cada producto. */
export const VELOCITY_DAYS = 30;

/** Junta catálogo, lotes de los locales elegidos y ritmo de venta, y calcula el riesgo de cada lote. */
export function useExpiryData(branchIds: BranchId[]) {
  const [now] = useState(() => Date.now());
  const config = useConfig();
  const products = useProducts();
  const velocity = useVelocity(VELOCITY_DAYS);
  const lotsQ = useBranchLots(branchIds);
  const lots = lotsQ.lots;

  const thresholds = config.data?.expiry ?? DEFAULT_THRESHOLDS;
  const rates = useMemo(() => dailyRates(velocity.data ?? []), [velocity.data]);
  const rows = useMemo(() => lotRisk(products.data ?? [], lots, rates, now, thresholds), [products.data, lots, rates, now, thresholds]);

  const queries = [config, products, velocity];
  return {
    now,
    rows,
    rates,
    thresholds,
    products: products.data ?? [],
    branches: config.data?.branches ?? [],
    pharmacy: config.data?.pharmacy,
    isLoading: lotsQ.isLoading || queries.some((q) => q.isLoading),
    error: lotsQ.error ?? queries.find((q) => q.error)?.error ?? null,
    refetch: () => Promise.all([lotsQ.refetch(), ...queries.map((q) => q.refetch())]),
  };
}
