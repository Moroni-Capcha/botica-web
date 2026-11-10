"use client";

import { useMemo, useState } from "react";
import type { User } from "@/lib/api/types";
import { useOperatingBranch } from "@/lib/auth/session-store";
import { useBranchLots } from "@/features/shared/branch-scope";
import { useCash, useConfig, useVouchers } from "@/lib/queries";
import { cashBadge, expiryBadge, voucherBadge, type NavBadge } from "@/lib/domain/nav-badges";
import { countByStatus, toRows } from "@/lib/domain/vouchers";
import { DEFAULT_THRESHOLDS } from "@/lib/domain/pharmacy";
import { limaDay } from "@/lib/domain/account";

const dayOf = (t: number) => limaDay(t);
const DAY = 86_400_000;
const VOUCHER_DAYS = 7;

/**
 * Avisos por módulo para el menú, por id de `NAV`. Solo consulta lo que el usuario puede ver
 * (cada pantalla sigue siendo la fuente de verdad; esto reutiliza sus mismas consultas y caché).
 */
export function useNavBadges(user: User, visible: readonly string[]): Partial<Record<string, NavBadge>> {
  const [now] = useState(() => Date.now());
  const config = useConfig();
  const operating = useOperatingBranch();
  const isAdmin = !user.branchId;
  const sees = (id: string) => visible.includes(id);

  const branchIds = useMemo(() => (isAdmin ? (config.data?.branches.map((b) => b.id) ?? [operating]) : [operating]), [isAdmin, config.data, operating]);
  const lots = useBranchLots(sees("vencimientos") ? branchIds : []);
  const cash = useCash(operating, sees("caja"));
  const vouchers = useVouchers(dayOf(now - (VOUCHER_DAYS - 1) * DAY), dayOf(now), isAdmin ? null : operating, sees("comprobantes"));

  return useMemo(() => {
    const out: Partial<Record<string, NavBadge>> = {};
    if (sees("vencimientos") && !lots.isLoading) {
      const b = expiryBadge(lots.lots, now, config.data?.expiry ?? DEFAULT_THRESHOLDS);
      if (b) out.vencimientos = b;
    }
    if (sees("caja")) {
      const b = cashBadge(cash.data);
      if (b) out.caja = b;
    }
    if (sees("comprobantes") && vouchers.data) {
      const b = voucherBadge(countByStatus(toRows(vouchers.data, [])));
      if (b) out.comprobantes = b;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `visible` cambia de identidad en cada render
  }, [visible.join(","), lots.lots, lots.isLoading, cash.data, vouchers.data, config.data?.expiry, now]);
}
