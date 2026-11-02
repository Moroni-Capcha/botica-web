"use client";

import { useMemo, useState } from "react";
import { Eye, FileSpreadsheet, FileText, Send, TriangleAlert } from "lucide-react";
import type { Product, VoucherStatus } from "@/lib/api/types";
import { errorMessage } from "@/lib/api";
import { useConfig, useCreditNotes, useProducts, useResendVoucher, useVouchers, useWritable } from "@/lib/queries";
import { limaDay } from "@/lib/domain/account";
import { KIND_LABEL, STATUS_LABEL, canResend, countByStatus, filterRows, toRows, type RowKind, type VoucherRow } from "@/lib/domain/vouchers";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty";
import { Field, Input, Select } from "@/components/ui/field";
import { Table, td } from "@/components/ui/table";
import { notify } from "@/components/ui/toast";
import { dateShort, soles, timeShort } from "@/lib/format";
import { cn } from "@/lib/cn";
import { ScopeToggle, useBranchScope } from "@/features/shared/branch-scope";
import { CreditNoteDialog } from "./credit-note-dialog";
import { exportVouchers } from "./export";
import { StatusBadge } from "./status-badge";
import { VoidDialog } from "./void-dialog";
import { VoucherDialog } from "./voucher-dialog";

const DAY = 86_400_000;
const MAX_DAYS = 370;
const dayOf = (t: number) => limaDay(t);
const spanDays = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY) + 1;

const PRESETS = [
  { id: "hoy", label: "Hoy", days: 1 },
  { id: "7", label: "7 días", days: 7 },
  { id: "30", label: "30 días", days: 30 },
] as const;

type Dialog = { kind: "detail" | "void" | "credit"; key: string } | null;

export function VouchersScreen() {
  const scope = useBranchScope();
  const { allBranches, branches, branchName, isAdmin, operating } = scope;
  const config = useConfig();
  const products = useProducts();
  const writable = useWritable();
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

  const loading = vouchers.isLoading || notes.isLoading;
  const error = vouchers.error ?? notes.error;
  const preset = PRESETS.find((p) => to === today && from === dayOf(now - (p.days - 1) * DAY))?.id;

  return (
    <div className="mx-auto grid max-w-7xl gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Desde" className="w-40">
          <Input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} />
        </Field>
        <Field label="Hasta" className="w-40">
          <Input type="date" value={to} min={from} max={today} onChange={(e) => e.target.value && setTo(e.target.value)} />
        </Field>
        <div className="flex gap-1.5" role="group" aria-label="Periodos rápidos">
          {PRESETS.map((p) => (
            <Button
              key={p.id}
              size="sm"
              variant={preset === p.id ? "dark" : "secondary"}
              onClick={() => {
                setTo(today);
                setFrom(dayOf(now - (p.days - 1) * DAY));
              }}
            >
              {p.label}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          {isAdmin && <ScopeToggle scope={scope.scope} onChange={scope.setScope} operatingName={branchName(operating)} />}
          <Button
            disabled={!rows.length}
            onClick={() => {
              exportVouchers({ rows, branches: allBranches, scopeLabel: scope.label, from, to, pharmacy: config.data?.pharmacy });
              notify("Comprobantes descargados");
            }}
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Excel
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_12rem_12rem]">
        <Field label="Buscar">
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Número, cliente o DNI/RUC" />
        </Field>
        <Field label="Tipo">
          <Select value={kind} onChange={(e) => setKind(e.target.value as RowKind | "todos")}>
            <option value="todos">Todos</option>
            {(Object.keys(KIND_LABEL) as RowKind[]).map((k) => (
              <option key={k} value={k}>{KIND_LABEL[k]}</option>
            ))}
          </Select>
        </Field>
        <Field label="Estado">
          <Select value={status} onChange={(e) => setStatus(e.target.value as VoucherStatus | "todos")}>
            <option value="todos">Todos</option>
            {(Object.keys(STATUS_LABEL) as VoucherStatus[]).map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </Select>
        </Field>
      </div>

      {rangeError && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800" role="alert">{rangeError}</p>}

      {!rangeError && toAttend > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">
          <TriangleAlert className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1">
            {counts.pendiente > 0 && `${counts.pendiente} ${counts.pendiente === 1 ? "comprobante espera" : "comprobantes esperan"} la respuesta de SUNAT`}
            {counts.pendiente > 0 && counts.rechazado > 0 && " y "}
            {counts.rechazado > 0 && `${counts.rechazado} ${counts.rechazado === 1 ? "fue rechazado" : "fueron rechazados"}`}
            . Ábrelos y reenvíalos.
          </span>
          <Button size="sm" onClick={() => setStatus(counts.pendiente ? "pendiente" : "rechazado")}>Ver {counts.pendiente ? "pendientes" : "rechazados"}</Button>
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white" aria-label="Lista de comprobantes">
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
              <div key={i} className="h-12 animate-pulse rounded-xl bg-zinc-100" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <Empty icon={FileText} title={all.length ? "Ningún comprobante coincide con los filtros" : "No hay comprobantes en este periodo"}>
            {all.length ? "Cambia el tipo, el estado o la búsqueda." : "Aparecen aquí apenas se cobra una venta."}
          </Empty>
        ) : (
          <Table
            minWidth={showBranch ? 980 : 860}
            head={["Fecha", "Comprobante", "Cliente", ...(showBranch ? ["Local"] : []), { label: "Importe", align: "right" }, "Estado", { label: "Acciones", align: "right" }]}
          >
            {rows.map((r) => (
              <tr key={r.key} className={cn(r.status === "anulado" && "text-zinc-400")}>
                <td className={cn(td, "whitespace-nowrap text-xs tabular-nums text-zinc-600")}>
                  {dateShort(r.issuedAt)} {timeShort(r.issuedAt)}
                </td>
                <td className={td}>
                  <span className="block font-semibold tabular-nums">{r.number}</span>
                  <span className="block text-xs text-zinc-500">{KIND_LABEL[r.kind]}{r.refNumber ? ` sobre ${r.refNumber}` : ""}</span>
                </td>
                <td className={cn(td, "max-w-[240px] truncate text-xs")}>{r.customerName || "Cliente varios"}{r.customerDocId ? ` · ${r.customerDocId}` : ""}</td>
                {showBranch && <td className={cn(td, "whitespace-nowrap text-xs")}>{branchName(r.branchId)}</td>}
                <td className={cn(td, "whitespace-nowrap text-right tabular-nums", r.kind === "nota_credito" && "text-rose-700")}>
                  {r.kind === "nota_credito" ? "−" : ""}{soles(r.total)}
                </td>
                <td className={td}>
                  <StatusBadge status={r.status} title={r.sunat ? `${r.sunat.code}: ${r.sunat.message}` : "Sin respuesta de SUNAT"} />
                  {r.status === "rechazado" && r.sunat && <span className="mt-0.5 block max-w-[220px] truncate text-[11px] text-rose-700">{r.sunat.code} · {r.sunat.message}</span>}
                </td>
                <td className={cn(td, "whitespace-nowrap text-right")}>
                  <span className="inline-flex gap-1.5">
                    {canResend(r.status) && (
                      <Button size="sm" variant="primary" loading={busyKey === r.key} disabled={!writable} title={writable ? undefined : "Tu cuenta está en solo lectura"} onClick={() => doResend(r)}>
                        <Send className="h-3.5 w-3.5" /> Reenviar
                      </Button>
                    )}
                    <Button size="sm" onClick={() => setDialog({ kind: "detail", key: r.key })}>
                      <Eye className="h-3.5 w-3.5" /> Ver
                    </Button>
                  </span>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </section>

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
