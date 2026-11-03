"use client";

import { useMemo, useRef, useState } from "react";
import { FileSpreadsheet, FileText, Search, TriangleAlert, X } from "lucide-react";
import type { Product, VoucherStatus } from "@/lib/api/types";
import { errorMessage } from "@/lib/api";
import { useConfig, useCreditNotes, useProducts, useResendVoucher, useVouchers, useWritable } from "@/lib/queries";
import { limaDay } from "@/lib/domain/account";
import { KIND_LABEL, STATUS_LABEL, countByStatus, filterRows, toRows, type RowKind, type VoucherRow } from "@/lib/domain/vouchers";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { Field, Input, Select } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { Table } from "@/components/ui/table";
import { notify } from "@/components/ui/toast";
import { useMediaQuery } from "@/lib/use-media-query";
import { useStableCallback } from "@/lib/use-stable-callback";
import { ScopeToggle, useBranchScope } from "@/features/shared/branch-scope";
import { CreditNoteDialog } from "./credit-note-dialog";
import { exportVouchers } from "./export";
import { VoidDialog } from "./void-dialog";
import { VoucherDialog } from "./voucher-dialog";
import { VoucherCard, VoucherTableRow, type RowShared } from "./vouchers-rows";

const DAY = 86_400_000;
const MAX_DAYS = 370;
const dayOf = (t: number) => limaDay(t);
const spanDays = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY) + 1;
const fmtInt = (n: number) => n.toLocaleString("es-PE");

const PRESETS = [
  { id: "hoy", label: "Hoy", days: 1 },
  { id: "7", label: "7 días", days: 7 },
  { id: "30", label: "30 días", days: 30 },
] as const;

const STATUS_IDS = Object.keys(STATUS_LABEL) as VoucherStatus[];

type Dialog = { kind: "detail" | "void" | "credit"; key: string } | null;

export function VouchersScreen() {
  const scope = useBranchScope();
  const { allBranches, branches, branchName, isAdmin, operating } = scope;
  const config = useConfig();
  const products = useProducts();
  const writable = useWritable();
  const wide = useMediaQuery("(min-width: 768px)");
  const [now] = useState(() => Date.now());
  const today = dayOf(now);

  const [from, setFrom] = useState(() => dayOf(now - 6 * DAY));
  const [to, setTo] = useState(today);
  const [kind, setKind] = useState<RowKind | "todos">("todos");
  const [status, setStatus] = useState<VoucherStatus | "todos">("todos");
  const [text, setText] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);

  const rangeError = from > to ? "La fecha «Desde» no puede ser posterior a «Hasta»." : spanDays(from, to) > MAX_DAYS ? "El rango puede ser de hasta un año." : null;
  const branchId = scope.scope === "all" ? null : operating;
  const vouchers = useVouchers(from, to, branchId, !rangeError);
  const notes = useCreditNotes(from, to, branchId, !rangeError);
  const resend = useResendVoucher();

  const productById = useMemo<Map<number, Product>>(() => new Map((products.data ?? []).map((p) => [p.id, p])), [products.data]);
  const all = useMemo(() => toRows(vouchers.data ?? [], notes.data ?? []), [vouchers.data, notes.data]);
  const rows = useMemo(() => filterRows(all, { kind, status, text }), [all, kind, status, text]);
  const counts = useMemo(() => countByStatus(all), [all]);
  /* Cuántos hay por estado con el tipo y la búsqueda ya aplicados (los números del filtro "Estado") */
  const statusCounts = useMemo(() => countByStatus(filterRows(all, { kind, status: "todos", text })), [all, kind, text]);
  const toAttend = counts.pendiente + counts.rechazado;
  const showBranch = isAdmin && scope.scope === "all" && branches.length > 1;

  const selected = dialog ? all.find((r) => r.key === dialog.key) ?? null : null;
  const busyKey = resend.isPending && resend.variables ? `${resend.variables.kind === "voucher" ? "v" : "n"}:${resend.variables.id}` : null;

  const doResend = (r: VoucherRow) =>
    resend.mutate(
      { kind: r.kind === "nota_credito" ? "note" : "voucher", id: r.id },
      {
        onSuccess: (res) => notify(res.status === "aceptado" ? `${res.number}: SUNAT lo aceptó` : `${res.number}: SUNAT sigue sin confirmarlo`, res.status === "aceptado" ? "ok" : "warn"),
        onError: (e) => notify(errorMessage(e), "warn"),
      },
    );

  const onOpen = useStableCallback((key: string) => setDialog({ kind: "detail", key }));
  const onResend = useStableCallback((r: VoucherRow) => doResend(r));
  const branchLabel = useStableCallback((id: string) => branchName(id));

  const loading = vouchers.isLoading || notes.isLoading;
  const error = vouchers.error ?? notes.error;
  const preset = PRESETS.find((p) => to === today && from === dayOf(now - (p.days - 1) * DAY))?.id;
  const hasFilters = text.trim() !== "" || kind !== "todos" || status !== "todos";
  const clearFilters = () => {
    setText("");
    setKind("todos");
    setStatus("todos");
  };

  /* Escalonado de la primera carga: solo las primeras 8 filas y una vez por montaje. Filtrar o buscar no lo repite. */
  const staggerKeys = useRef<Map<string, number> | null>(null);
  if (!loading && !error && staggerKeys.current === null) staggerKeys.current = new Map(rows.slice(0, 8).map((r, i) => [r.key, i]));

  const countText = loading || error ? "" : `${fmtInt(rows.length)}${rows.length !== all.length ? ` de ${fmtInt(all.length)}` : ""} ${all.length === 1 ? "comprobante" : "comprobantes"}`;

  return (
    <div className="mx-auto grid max-w-7xl gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        {isAdmin && <ScopeToggle scope={scope.scope} onChange={scope.setScope} operatingName={branchName(operating)} />}
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          <Button
            disabled={!rows.length}
            onClick={() => {
              exportVouchers({ rows, branches: allBranches, scopeLabel: scope.label, from, to, pharmacy: config.data?.pharmacy });
              notify("Comprobantes descargados");
            }}
          >
            <FileSpreadsheet className="h-4 w-4 text-success-fg" aria-hidden /> Excel
          </Button>
        </div>
      </div>

      {rangeError && (
        <p className="rounded-xl border border-warning-border bg-warning-bg p-3 text-sm text-warning-fg" role="alert">
          {rangeError}
        </p>
      )}

      {!rangeError && toAttend > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-warning-border bg-warning-bg p-3 text-sm text-warning-fg" role="status">
          <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">
            {counts.pendiente > 0 && `${counts.pendiente} ${counts.pendiente === 1 ? "comprobante espera" : "comprobantes esperan"} la respuesta de SUNAT`}
            {counts.pendiente > 0 && counts.rechazado > 0 && " y "}
            {counts.rechazado > 0 && `${counts.rechazado} ${counts.rechazado === 1 ? "fue rechazado" : "fueron rechazados"}`}
            . Ábrelos y reenvíalos.
          </span>
          <Button size="sm" onClick={() => setStatus(counts.pendiente ? "pendiente" : "rechazado")}>
            Ver {counts.pendiente ? "pendientes" : "rechazados"}
          </Button>
        </div>
      )}

      <Card as="section" padding="none" className="overflow-hidden" aria-labelledby="vouchers-title">
        <div className="grid gap-3 border-b border-line-soft p-4 sm:px-5">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <h2 id="vouchers-title" className="font-semibold tracking-tight">
              Comprobantes
            </h2>
            <p className="text-caption tabular-nums text-muted" role="status" aria-live="polite">
              {countText}
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <Field label="Desde" className="w-40">
              <Input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} />
            </Field>
            <Field label="Hasta" className="w-40">
              <Input type="date" value={to} min={from} max={today} onChange={(e) => e.target.value && setTo(e.target.value)} />
            </Field>
            <div className="flex items-center gap-1.5 pb-1" role="group" aria-label="Periodos rápidos">
              {PRESETS.map((p) => (
                <Button
                  key={p.id}
                  size="sm"
                  variant={preset === p.id ? "dark" : "secondary"}
                  aria-pressed={preset === p.id}
                  onClick={() => {
                    setTo(today);
                    setFrom(dayOf(now - (p.days - 1) * DAY));
                  }}
                >
                  {p.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-0 flex-1 basis-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
              <Input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Número, cliente o DNI/RUC" className="pl-9" aria-label="Buscar comprobante" />
            </div>
            <Select value={kind} onChange={(e) => setKind(e.target.value as RowKind | "todos")} className="min-w-0 flex-1 sm:w-48 sm:flex-none" aria-label="Tipo de comprobante">
              <option value="todos">Todos los tipos</option>
              {(Object.keys(KIND_LABEL) as RowKind[]).map((k) => (
                <option key={k} value={k}>{KIND_LABEL[k]}</option>
              ))}
            </Select>
            {hasFilters && (
              <Button variant="ghost" onClick={clearFilters}>
                <X className="h-4 w-4" aria-hidden /> Limpiar filtros
              </Button>
            )}
          </div>

          <Segmented<VoucherStatus | "todos">
            label="Estado ante SUNAT"
            value={status}
            onChange={setStatus}
            options={[
              { id: "todos", label: "Todos", count: loading ? undefined : Object.values(statusCounts).reduce((a, b) => a + b, 0) },
              ...STATUS_IDS.map((s) => ({ id: s, label: STATUS_LABEL[s], count: loading ? undefined : statusCounts[s] })),
            ]}
          />
        </div>

        {error ? (
          <Empty icon={TriangleAlert} title="No se pudieron cargar los comprobantes">
            {errorMessage(error)}{" "}
            <button type="button" className="font-semibold underline" onClick={() => void Promise.all([vouchers.refetch(), notes.refetch()])}>
              Reintentar
            </button>
          </Empty>
        ) : loading ? (
          <div className="grid gap-2 p-4 sm:p-5" aria-busy="true">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-xl bg-sunken" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <Empty icon={FileText} title={all.length ? "Ningún comprobante coincide con los filtros" : "No hay comprobantes en este periodo"}>
            {all.length ? (
              <>
                Cambia el tipo, el estado o la búsqueda.{" "}
                {hasFilters && (
                  <button type="button" className="font-semibold underline" onClick={clearFilters}>
                    Limpiar filtros
                  </button>
                )}
              </>
            ) : (
              "Aparecen aquí apenas se cobra una venta."
            )}
          </Empty>
        ) : wide ? (
          <Table
            maxHeight={640}
            minWidth={showBranch ? 980 : 860}
            head={["Fecha", "Comprobante", "Cliente", ...(showBranch ? ["Local"] : []), { label: "Importe", align: "right" }, "Estado", { label: "Acciones", align: "right" }]}
          >
            {rows.map((r) => (
              <VoucherTableRow key={r.key} row={r} busy={busyKey === r.key} stag={staggerKeys.current?.get(r.key) ?? -1} {...rowShared(showBranch, branchLabel, writable, onOpen, onResend)} />
            ))}
          </Table>
        ) : (
          <ul className="grid gap-2 p-3">
            {rows.map((r) => (
              <VoucherCard key={r.key} row={r} busy={busyKey === r.key} stag={staggerKeys.current?.get(r.key) ?? -1} {...rowShared(showBranch, branchLabel, writable, onOpen, onResend)} />
            ))}
          </ul>
        )}
      </Card>

      {selected && dialog && (
        <>
          {dialog.kind === "detail" && (
            <VoucherDialog
              row={selected}
              now={now}
              pharmacy={config.data?.pharmacy}
              branch={allBranches.find((b) => b.id === selected.branchId)}
              products={productById}
              writable={writable}
              resending={busyKey === selected.key}
              onResend={() => doResend(selected)}
              onVoid={() => setDialog({ kind: "void", key: selected.key })}
              onCredit={() => setDialog({ kind: "credit", key: selected.key })}
              onClose={() => setDialog(null)}
            />
          )}
          {dialog.kind === "void" && selected.voucher && <VoidDialog voucher={selected.voucher} onClose={() => setDialog({ kind: "detail", key: selected.key })} onDone={() => setDialog({ kind: "detail", key: selected.key })} />}
          {dialog.kind === "credit" && selected.voucher && (
            <CreditNoteDialog voucher={selected.voucher} products={productById} onClose={() => setDialog({ kind: "detail", key: selected.key })} onDone={() => setDialog({ kind: "detail", key: selected.key })} />
          )}
        </>
      )}
    </div>
  );
}

/** Lo que comparten todas las filas (las props primitivas y los manejadores estables no repintan filas que no cambiaron). */
function rowShared(showBranch: boolean, branchName: RowShared["branchName"], writable: boolean, onOpen: RowShared["onOpen"], onResend: RowShared["onResend"]): RowShared {
  return { showBranch, branchName, writable, onOpen, onResend };
}
