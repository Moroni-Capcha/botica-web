"use client";

import { useMemo, useState } from "react";
import { FileSpreadsheet, ScrollText, TriangleAlert } from "lucide-react";
import type { AuditAction, AuditEntity } from "@/lib/api/types";
import { errorMessage } from "@/lib/api";
import { useAccounts, useAuditLog, useConfig } from "@/lib/queries";
import { limaDay } from "@/lib/domain/account";
import { ACTION_GROUPS, ENTITY_LABEL, actionLabel, actorRole, auditRangeError, changeSummary, entityLabelOf } from "@/lib/domain/audit";
import { DEFAULT_PAGE_SIZE } from "@/lib/domain/pagination";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty";
import { Field, Input, Select } from "@/components/ui/field";
import { Pagination } from "@/components/ui/pagination";
import { Table, td } from "@/components/ui/table";
import { notify } from "@/components/ui/toast";
import { dateShort, timeShort } from "@/lib/format";
import { cn } from "@/lib/cn";
import { useBranchScope } from "@/features/shared/branch-scope";
import { collectAudit, exportAudit } from "./export";

const DAY = 86_400_000;
const PRESETS = [
  { id: "hoy", label: "Hoy", days: 1 },
  { id: "7", label: "7 días", days: 7 },
  { id: "30", label: "30 días", days: 30 },
] as const;

/** Auditoría: quién hizo qué y cuándo. Los filtros y las páginas se resuelven en el servidor. */
export function AuditScreen() {
  const { allBranches, branchName } = useBranchScope();
  const config = useConfig();
  const accounts = useAccounts();
  const [now] = useState(() => Date.now());
  const today = limaDay(now);

  const [from, setFrom] = useState(() => limaDay(now - 6 * DAY));
  const [to, setTo] = useState(today);
  const [userId, setUserId] = useState("");
  const [action, setAction] = useState<AuditAction | "">("");
  const [entity, setEntity] = useState<AuditEntity | "">("");
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  /** Cualquier filtro nuevo vuelve a la primera página. */
  const filter = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  const rangeError = auditRangeError(from, to);
  const query = useMemo(
    () => ({ from, to, page, pageSize: DEFAULT_PAGE_SIZE, ...(userId ? { userId } : {}), ...(action ? { action } : {}), ...(entity ? { entity } : {}) }),
    [from, to, page, userId, action, entity],
  );
  const log = useAuditLog(query, !rangeError);
  const rows = log.data?.items ?? [];
  const preset = PRESETS.find((p) => to === today && from === limaDay(now - (p.days - 1) * DAY))?.id;
  const hasFilters = !!(userId || action || entity);
  const people = accounts.data ?? [];

  const filtersLabel = [
    userId && `Persona: ${people.find((p) => p.id === userId)?.name ?? userId}`,
    action && `Acción: ${actionLabel(action)}`,
    entity && `Sobre: ${entityLabelOf(entity)}`,
  ].filter(Boolean).join(" · ") || "Sin filtros";

  const doExport = async () => {
    setExporting(true);
    try {
      const { entries, truncated } = await collectAudit({ from, to, ...(userId ? { userId } : {}), ...(action ? { action } : {}), ...(entity ? { entity } : {}) });
      exportAudit({ entries, branches: allBranches, from, to, filtersLabel, truncated, pharmacy: config.data?.pharmacy });
      notify(truncated ? "Auditoría descargada (solo las más recientes: acota el periodo para ver el resto)" : "Auditoría descargada", truncated ? "warn" : "ok");
    } catch (e) {
      notify(errorMessage(e), "warn");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="mx-auto grid max-w-7xl gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Desde" className="w-40">
          <Input type="date" value={from} max={to} onChange={(e) => e.target.value && filter(setFrom)(e.target.value)} />
        </Field>
        <Field label="Hasta" className="w-40">
          <Input type="date" value={to} min={from} max={today} onChange={(e) => e.target.value && filter(setTo)(e.target.value)} />
        </Field>
        <div className="flex gap-1.5" role="group" aria-label="Periodos rápidos">
          {PRESETS.map((p) => (
            <Button
              key={p.id}
              size="sm"
              variant={preset === p.id ? "dark" : "secondary"}
              onClick={() => {
                setTo(today);
                setFrom(limaDay(now - (p.days - 1) * DAY));
                setPage(1);
              }}
            >
              {p.label}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          <Button onClick={() => void doExport()} loading={exporting} disabled={!!rangeError || !log.data?.total}>
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Excel
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Persona">
          <Select value={userId} onChange={(e) => filter(setUserId)(e.target.value)}>
            <option value="">Todas</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Acción">
          <Select value={action} onChange={(e) => filter(setAction)(e.target.value as AuditAction | "")}>
            <option value="">Todas</option>
            {ACTION_GROUPS.map((g) => (
              <optgroup key={g.id} label={g.label}>
                {g.actions.map((a) => (
                  <option key={a.id} value={a.id}>{a.label}</option>
                ))}
              </optgroup>
            ))}
          </Select>
        </Field>
        <Field label="Sobre">
          <Select value={entity} onChange={(e) => filter(setEntity)(e.target.value as AuditEntity | "")}>
            <option value="">Todo</option>
            {(Object.keys(ENTITY_LABEL) as AuditEntity[]).map((k) => (
              <option key={k} value={k}>{ENTITY_LABEL[k]}</option>
            ))}
          </Select>
        </Field>
      </div>

      {rangeError && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800" role="alert">{rangeError}</p>}

      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white" aria-label="Registro de auditoría">
        {rangeError ? null : log.error ? (
          <Empty icon={TriangleAlert} title="No se pudo cargar la auditoría">
            {errorMessage(log.error)}{" "}
            <button type="button" className="font-semibold underline" onClick={() => void log.refetch()}>
              Reintentar
            </button>
          </Empty>
        ) : log.isLoading ? (
          <div className="grid gap-2 p-4 sm:p-5" aria-busy="true">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-xl bg-zinc-100" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <Empty icon={ScrollText} title={hasFilters ? "Nada coincide con los filtros" : "No hay movimientos en este periodo"}>
            {hasFilters ? "Quita algún filtro o amplía las fechas." : "Aquí aparece cada ingreso, venta, cambio de precio y ajuste, con quién lo hizo."}
          </Empty>
        ) : (
          <div className={cn("transition-opacity", log.isFetching && "opacity-60")} aria-busy={log.isFetching}>
            <Table minWidth={880} head={["Fecha", "Persona", "Acción", "Detalle"]}>
              {rows.map((e) => {
                const detail = changeSummary(e.before, e.after, { branchName });
                return (
                  <tr key={e.id}>
                    <td className={cn(td, "whitespace-nowrap text-xs tabular-nums text-zinc-600")}>
                      {dateShort(e.at)} {timeShort(e.at)}
                    </td>
                    <td className={td}>
                      <span className="block font-medium">{e.userName}</span>
                      <span className="block text-xs text-zinc-500">
                        {actorRole(e)}
                        {e.branchId ? ` · ${branchName(e.branchId)}` : ""}
                      </span>
                    </td>
                    <td className={td}>
                      <span className={cn("block font-medium", e.action === "sesion_fallida" && "text-rose-700")}>{actionLabel(e.action)}</span>
                      <span className="block text-xs text-zinc-500">{entityLabelOf(e.entity)}</span>
                    </td>
                    <td className={cn(td, "max-w-[460px] text-xs")}>
                      <span className="block font-medium text-zinc-800">{e.entityLabel}</span>
                      {detail && <span className="block break-words text-zinc-500">{detail}</span>}
                    </td>
                  </tr>
                );
              })}
            </Table>
          </div>
        )}
        {!rangeError && log.data && <Pagination page={log.data.page} pageSize={log.data.pageSize} total={log.data.total} onPage={setPage} busy={log.isFetching} noun="registros" />}
      </section>
    </div>
  );
}
