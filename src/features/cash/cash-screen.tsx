"use client";

import { useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Banknote, ChevronRight, CreditCard, FileSpreadsheet, History, Lock, Plus, Receipt, Smartphone, Stethoscope, TriangleAlert, Wallet, type LucideIcon } from "lucide-react";
import type { CashClosing, CashMovementType, PaymentMethod } from "@/lib/api/types";
import { netPayments, sumPayments } from "@/lib/domain/returns";
import { errorMessage } from "@/lib/api";
import { useAddCashMovement, useCashClosings, useCashSummary, useConfig, useOpenCash } from "@/lib/queries";
import { closeDifference, denominationLabel, DENOMINATIONS, MOVEMENT_LABEL, movementError, PAYMENT_LABEL } from "@/lib/domain/cash";
import { round2 } from "@/lib/domain/pharmacy";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionLabel } from "@/components/ui/section-label";
import { Dialog } from "@/components/ui/dialog";
import { Empty } from "@/components/ui/empty";
import { Field, Input, inputClass } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { Table, rowButtonClass, td } from "@/components/ui/table";
import { notify } from "@/components/ui/toast";
import { dateShort, soles, timeShort } from "@/lib/format";
import { cn } from "@/lib/cn";
import { ScopeToggle, useBranchScope } from "@/features/shared/branch-scope";
import { CloseDialog, TONE_LABEL, TONE_TEXT } from "./close-dialog";
import { exportClosings } from "./export";

const PERIODS = [7, 30, 90] as const;
const MOVE_HINT: Record<CashMovementType, string> = {
  egreso: "Pagos menores: movilidad, útiles, limpieza",
  retiro: "Efectivo que se saca para depositar o entregar",
  ingreso: "Sencillo que se agrega a la caja",
};

export function CashScreen() {
  const scope = useBranchScope();
  const { allBranches, operating, branchName, isAdmin, multi, branches } = scope;
  const config = useConfig();
  const summary = useCashSummary(operating);
  const openCash = useOpenCash(operating);
  const addMove = useAddCashMovement(operating);
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30);
  const closings = useCashClosings(multi ? null : operating, days);

  const lastOpening = (closings.data ?? []).find((c) => c.branchId === operating)?.openingAmount;
  const [opening, setOpening] = useState<string | null>(null);
  const [moveType, setMoveType] = useState<CashMovementType>("egreso");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [moveTried, setMoveTried] = useState(false);
  const [closing, setClosing] = useState(false);
  const [detail, setDetail] = useState<CashClosing | null>(null);

  const data = summary.data;
  const isOpen = data?.session.open ?? false;
  const net = data ? netPayments(data.totals, data.returns) : { efectivo: 0, yape: 0, tarjeta: 0 };
  const methodHint = (m: PaymentMethod) => {
    const n = data?.sales.filter((s) => s.method === m).length ?? 0;
    const back = data?.returns[m] ?? 0;
    return back > 0 ? `${n} ventas · devuelto ${soles(back)}` : `${n} ventas`;
  };
  const moveErr = data ? movementError(moveType, Number(amount) || 0, note, data.expected) : null;

  const addMovement = () => {
    setMoveTried(true);
    if (moveErr) return;
    addMove.mutate(
      { type: moveType, amount: round2(Number(amount)), note: note.trim() },
      {
        onSuccess: (m) => {
          notify(`${MOVEMENT_LABEL[m.type]} de ${soles(m.amount)} registrado`);
          setAmount("");
          setNote("");
          setMoveTried(false);
        },
        onError: (e) => notify(errorMessage(e), "warn"),
      },
    );
  };

  if (summary.error) {
    return (
      <Empty icon={TriangleAlert} title="No se pudo cargar la caja">
        {errorMessage(summary.error)}{" "}
        <button type="button" className="font-semibold underline" onClick={() => void summary.refetch()}>
          Reintentar
        </button>
      </Empty>
    );
  }

  return (
    <div className="mx-auto grid max-w-7xl gap-4 p-4 sm:p-6">
      {summary.isLoading || !data ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-surface" />)}
        </div>
      ) : !isOpen ? (
        <section className="flex flex-wrap items-end gap-4 rounded-2xl border border-warning-border bg-warning-bg p-5" aria-labelledby="cash-closed">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-surface text-warning-fg">
            <Wallet className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1 basis-56">
            <h2 id="cash-closed" className="font-semibold">La caja de {branchName(operating)} está cerrada</h2>
            <p className="text-sm text-warning-fg/80">Cuenta el sencillo con el que empiezas el turno. Mientras esté cerrada no se puede cobrar.</p>
          </div>
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const v = Number(opening ?? lastOpening ?? 150);
              openCash.mutate(v, { onSuccess: () => notify(`Caja de ${branchName(operating)} abierta con ${soles(v)}`), onError: (er) => notify(errorMessage(er), "warn") });
            }}
          >
            <Field label="Fondo inicial (S/)">
              <Input inputMode="decimal" value={opening ?? String(lastOpening ?? 150)} onChange={(e) => setOpening(e.target.value.replace(/[^\d.]/g, ""))} className="w-32 bg-surface tabular-nums" />
            </Field>
            <Button type="submit" variant="dark" loading={openCash.isPending}>
              <Wallet className="h-4 w-4" aria-hidden /> Abrir caja
            </Button>
          </form>
        </section>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Kpi icon={Wallet} label="Fondo inicial" value={soles(data.session.openingAmount)} hint={`Abrió ${data.session.openedBy ?? ""} · ${data.session.openedAt ? timeShort(data.session.openedAt) : ""}`} />
            <Kpi icon={Banknote} label="Efectivo" value={soles(net.efectivo)} hint={methodHint("efectivo")} />
            <Kpi icon={Smartphone} label="Yape / Plin" value={soles(net.yape)} hint={methodHint("yape")} />
            <Kpi icon={CreditCard} label="Tarjeta" value={soles(net.tarjeta)} hint={methodHint("tarjeta")} />
            <Kpi icon={Lock} label="Debe haber en caja" value={soles(data.expected)} hint="Fondo + efectivo − devoluciones ± movimientos" strong />
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
            <Card as="section" padding="none" className="min-w-0 overflow-hidden" aria-labelledby="turn-sales">
              <div className="border-b border-line-soft p-4 sm:px-5">
                <h2 id="turn-sales" className="font-semibold tracking-tight">
                  Ventas del turno · <span className="tabular-nums">{soles(sumPayments(net))}</span>
                </h2>
                <p className="text-xs text-muted">{data.totals.tickets} comprobantes emitidos</p>
                {data.returns.count > 0 && (
                  <p className="mt-1 text-xs tabular-nums text-fg-2">
                    Vendido {soles(sumPayments(data.totals))} − Devoluciones / notas de crédito {soles(sumPayments(data.returns))} = Venta neta {soles(sumPayments(net))}
                  </p>
                )}
              </div>
              {data.sales.length === 0 ? (
                <Empty icon={Receipt} title="Aún no hay ventas en este turno" />
              ) : (
                <div className="max-h-[460px] overflow-y-auto">
                  <Table minWidth={520} head={["Hora", "Comprobante", "Pago", "Atendió", { label: "Total", align: "right" }]}>
                    {data.sales.map((s) => (
                      <tr key={s.id}>
                        <td className={cn(td, "tabular-nums text-fg-2")}>{timeShort(s.createdAt)}</td>
                        <td className={cn(td, "whitespace-nowrap tabular-nums")}>
                          {s.number}
                          {s.hasPrescription && <Stethoscope className="ml-1.5 inline h-3.5 w-3.5 text-info-fg" role="img" aria-label="Con receta" />}
                        </td>
                        <td className={cn(td, "text-xs")}>{PAYMENT_LABEL[s.method]}</td>
                        <td className={cn(td, "text-xs text-fg-2")}>{s.sellerName}</td>
                        <td className={cn(td, "text-right font-semibold tabular-nums")}>{soles(s.total)}</td>
                      </tr>
                    ))}
                  </Table>
                </div>
              )}
            </Card>

            <div className="grid content-start gap-4">
              {data.returnRows.length > 0 && (
                <Card as="section" aria-labelledby="cash-returns">
                  <h2 id="cash-returns" className="font-semibold tracking-tight">Devoluciones / notas de crédito · <span className="tabular-nums">{soles(sumPayments(data.returns))}</span></h2>
                  <p className="mb-3 text-xs text-muted">Solo lo devuelto en efectivo ({soles(data.returns.efectivo)}) sale de la caja. Yape y tarjeta se devuelven por su propio medio.</p>
                  <ul className="grid gap-1.5 text-sm">
                    {data.returnRows.map((r) => (
                      <li key={r.id} className="flex items-start justify-between gap-2">
                        <span className="min-w-0 text-fg-2">
                          {timeShort(r.issuedAt)} · {r.number} <span className="text-xs text-muted">sobre {r.voucherNumber} · {PAYMENT_LABEL[r.method]}</span>
                        </span>
                        <span className="shrink-0 tabular-nums text-danger-fg">−{soles(r.total)}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
              <Card as="section" aria-labelledby="cash-moves">
                <h2 id="cash-moves" className="font-semibold tracking-tight">Movimientos de caja</h2>
                <p className="mb-3 text-xs text-muted">{MOVE_HINT[moveType]}.</p>
                <form
                  className="grid gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    addMovement();
                  }}
                >
                  <Segmented<CashMovementType> full label="Tipo de movimiento" value={moveType} onChange={setMoveType} options={(["egreso", "retiro", "ingreso"] as const).map((t) => ({ id: t, label: MOVEMENT_LABEL[t] }))} />
                  <div className="flex gap-2">
                    <input aria-label="Monto" inputMode="decimal" placeholder="S/" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} className={cn(inputClass, "w-24 shrink-0 tabular-nums")} />
                    <Input aria-label="Motivo" placeholder="Motivo" value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} />
                    <Button type="submit" variant="dark" loading={addMove.isPending} aria-label="Registrar movimiento" className="shrink-0 px-3">
                      <Plus className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                  {moveTried && moveErr && <p className="text-xs text-danger-fg" role="alert">{moveErr}</p>}
                </form>
                <ul className="mt-3 grid gap-1.5 text-sm">
                  {data.movements.map((m) => (
                    <li key={m.id} className="flex items-start justify-between gap-2">
                      <span className="flex min-w-0 items-start gap-1.5 text-fg-2">
                        {m.type === "ingreso" ? <ArrowDownLeft className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success-fg" aria-hidden /> : <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" aria-hidden />}
                        <span className="min-w-0">
                          {timeShort(m.at)} · {MOVEMENT_LABEL[m.type]}: {m.note}
                          <span className="block text-micro text-muted">{m.userName}</span>
                        </span>
                      </span>
                      <span className={cn("shrink-0 tabular-nums", m.type === "ingreso" ? "text-success-fg" : "")}>
                        {m.type === "ingreso" ? "+" : "−"}
                        {soles(m.amount)}
                      </span>
                    </li>
                  ))}
                  {!data.movements.length && <li className="text-xs text-muted">Sin movimientos en este turno</li>}
                </ul>
              </Card>

              <Card as="section" aria-labelledby="cash-close">
                <h2 id="cash-close" className="font-semibold tracking-tight">Cierre de caja</h2>
                <p className="mb-3 text-xs text-muted">Al terminar el turno, cuenta el efectivo por billete y moneda. El cierre queda en el historial con la diferencia.</p>
                <Button variant="dark" className="w-full" onClick={() => setClosing(true)}>
                  <Lock className="h-4 w-4" aria-hidden /> Hacer arqueo y cerrar
                </Button>
              </Card>
            </div>
          </div>
        </>
      )}

      <Card as="section" padding="none" className="overflow-hidden" aria-labelledby="closings-title">
        <div className="flex flex-wrap items-center gap-2 border-b border-line-soft p-4 sm:px-5">
          <h2 id="closings-title" className="mr-auto font-semibold tracking-tight">
            Historial de cierres
          </h2>
          {isAdmin && <ScopeToggle scope={scope.scope} onChange={scope.setScope} operatingName={branchName(operating)} />}
          <Segmented label="Periodo" value={String(days)} onChange={(v) => setDays(Number(v) as (typeof PERIODS)[number])} options={PERIODS.map((d) => ({ id: String(d), label: `${d} días` }))} />
          <Button
            size="sm"
            disabled={!closings.data?.length}
            onClick={() => {
              exportClosings({ closings: closings.data ?? [], branches: allBranches, scopeLabel: scope.label, days, pharmacy: config.data?.pharmacy });
              notify("Cierres de caja descargados");
            }}
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-success-fg" aria-hidden /> Excel
          </Button>
        </div>
        {closings.isLoading ? (
          <div className="grid gap-2 p-4">{Array.from({ length: 4 }, (_, i) => <div key={i} className="h-11 animate-pulse rounded-xl bg-sunken" />)}</div>
        ) : closings.error ? (
          <Empty icon={TriangleAlert} title="No se pudo cargar el historial">{errorMessage(closings.error)}</Empty>
        ) : !closings.data?.length ? (
          <Empty icon={History} title={`Sin cierres en ${days} días`} />
        ) : (
          <Table minWidth={multi ? 1060 : 980} head={["Fecha", ...(multi ? ["Local"] : []), "Cerró", { label: "Tickets", align: "right" }, { label: "Efectivo", align: "right" }, { label: "Yape / Plin", align: "right" }, { label: "Tarjeta", align: "right" }, { label: "Devuelto", align: "right" }, { label: "Debe haber", align: "right" }, { label: "Contado", align: "right" }, { label: "Diferencia", align: "right" }, { label: <span className="sr-only">Ver</span> }]}>
            {closings.data.map((c) => {
              const { tone } = closeDifference(c.counted, c.expected);
              return (
                <tr key={c.id} tabIndex={0} onClick={() => setDetail(c)} onKeyDown={(e) => e.key === "Enter" && setDetail(c)} className={rowButtonClass} aria-label={`Ver cierre del ${dateShort(c.closedAt)}`}>
                  <td className={cn(td, "whitespace-nowrap tabular-nums")}>
                    {dateShort(c.closedAt)} <span className="text-xs text-muted">{timeShort(c.closedAt)}</span>
                  </td>
                  {multi && <td className={cn(td, "text-xs font-semibold")}>{branchName(c.branchId)}</td>}
                  <td className={cn(td, "text-xs text-fg-2")}>{c.closedBy}</td>
                  <td className={cn(td, "text-right tabular-nums")}>{c.tickets}</td>
                  <td className={cn(td, "whitespace-nowrap text-right tabular-nums")}>{soles(c.sales.efectivo)}</td>
                  <td className={cn(td, "whitespace-nowrap text-right tabular-nums")}>{soles(c.sales.yape)}</td>
                  <td className={cn(td, "whitespace-nowrap text-right tabular-nums")}>{soles(c.sales.tarjeta)}</td>
                  <td className={cn(td, "whitespace-nowrap text-right tabular-nums")}>{c.returns.count ? `−${soles(sumPayments(c.returns))}` : "—"}</td>
                  <td className={cn(td, "whitespace-nowrap text-right tabular-nums")}>{soles(c.expected)}</td>
                  <td className={cn(td, "whitespace-nowrap text-right tabular-nums")}>{soles(c.counted)}</td>
                  <td className={cn(td, "whitespace-nowrap text-right font-semibold tabular-nums", TONE_TEXT[tone])}>
                    {c.difference > 0 ? "+" : ""}
                    {soles(c.difference)}
                  </td>
                  <td className={cn(td, "text-right")}>
                    <ChevronRight className="ml-auto h-4 w-4 text-muted" aria-hidden />
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>

      {closing && data && (
        <CloseDialog
          summary={data}
          branchName={branchName(operating)}
          onClose={() => setClosing(false)}
          onClosed={(c) => {
            setClosing(false);
            setDetail(c);
            notify(`Caja de ${branchName(c.branchId)} cerrada`);
          }}
        />
      )}
      {detail && <ClosingDetail closing={detail} branchName={branchName(detail.branchId)} onClose={() => setDetail(null)} />}
    </div>
  );
}

function ClosingDetail({ closing: c, branchName, onClose }: { closing: CashClosing; branchName: string; onClose: () => void }) {
  const { tone } = closeDifference(c.counted, c.expected);
  const counted = DENOMINATIONS.filter((d) => (c.denominations[String(d.value)] ?? 0) > 0);
  const row = (label: string, value: number, sign?: "+" | "−", bold?: boolean) => (
    <div className={cn("flex justify-between", bold && "border-t border-line pt-1 font-semibold")}>
      <dt className={bold ? "" : "text-fg-2"}>{label}</dt>
      <dd className="tabular-nums">
        {sign ?? ""} {soles(value)}
      </dd>
    </div>
  );
  return (
    <Dialog title={`Cierre de caja · ${branchName}`} description={`${dateShort(c.openedAt)} ${timeShort(c.openedAt)} a ${timeShort(c.closedAt)} · Abrió ${c.openedBy} · Cerró ${c.closedBy}`} onClose={onClose} size="lg">
      <div className="grid gap-5 sm:grid-cols-2">
        <dl className="grid content-start gap-1 text-sm">
          <SectionLabel className="mb-1">Efectivo</SectionLabel>
          {row("Fondo inicial", c.openingAmount)}
          {row("Ventas en efectivo", c.sales.efectivo, "+")}
          {c.returns.efectivo > 0 && row("Devoluciones en efectivo", c.returns.efectivo, "−")}
          {c.ingresos > 0 && row("Ingresos", c.ingresos, "+")}
          {c.egresos > 0 && row("Egresos", c.egresos, "−")}
          {c.retiros > 0 && row("Retiros", c.retiros, "−")}
          {row("Debe haber", c.expected, undefined, true)}
          {row("Contado", c.counted)}
          <div className="flex justify-between font-semibold">
            <dt>Diferencia</dt>
            <dd className={cn("tabular-nums", TONE_TEXT[tone])}>
              {c.difference > 0 ? "+" : ""}
              {soles(c.difference)} · {TONE_LABEL[tone]}
            </dd>
          </div>
          {c.note && <p className="mt-2 rounded-xl bg-subtle p-2.5 text-xs text-fg-2">“{c.note}”</p>}
        </dl>
        <div className="grid content-start gap-4">
          <dl className="grid gap-1 text-sm">
            <SectionLabel className="mb-1">Venta del turno · {c.tickets} comprobantes</SectionLabel>
            {row("Efectivo", c.sales.efectivo)}
            {row("Yape / Plin", c.sales.yape)}
            {row("Tarjeta", c.sales.tarjeta)}
            {row("Total vendido", sumPayments(c.sales), undefined, true)}
            {c.returns.count > 0 && (
              <>
                {row(`Devoluciones / notas de crédito (${c.returns.count})`, sumPayments(c.returns), "−")}
                <p className="pl-3 text-xs text-muted">En efectivo {soles(c.returns.efectivo)} · Yape / Plin {soles(c.returns.yape)} · Tarjeta {soles(c.returns.tarjeta)}</p>
                {row("Venta neta", sumPayments(netPayments(c.sales, c.returns)), undefined, true)}
              </>
            )}
          </dl>
          {counted.length > 0 && (
            <div>
              <SectionLabel className="mb-1">Arqueo</SectionLabel>
              <ul className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs tabular-nums text-fg-2">
                {counted.map((d) => (
                  <li key={d.value} className="flex justify-between">
                    <span>
                      {denominationLabel(d.value)} × {c.denominations[String(d.value)]}
                    </span>
                    <span>{soles(d.value * (c.denominations[String(d.value)] ?? 0))}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {c.movements.length > 0 && (
            <div>
              <SectionLabel className="mb-1">Movimientos</SectionLabel>
              <ul className="grid gap-0.5 text-xs text-fg-2">
                {c.movements.map((m) => (
                  <li key={`${m.id}-${m.at}`} className="flex justify-between gap-2">
                    <span className="min-w-0 truncate">
                      {timeShort(m.at)} · {MOVEMENT_LABEL[m.type]}: {m.note}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {m.type === "ingreso" ? "+" : "−"}
                      {soles(m.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}

function Kpi({ icon: Icon, label, value, hint, strong }: { icon: LucideIcon; label: string; value: string; hint?: string; strong?: boolean }) {
  return (
    <Card padding="none" className={cn("min-w-0 p-4", strong && "border-transparent bg-brand text-white")}>
      <p className={cn("flex items-center gap-2 text-xs font-semibold", strong ? "text-white/80" : "text-fg-2")}>
        <Icon className={cn("h-4 w-4", strong ? "text-accent" : "text-brand")} aria-hidden /> {label}
      </p>
      <p className="mt-2 truncate text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      {hint && <p className={cn("mt-0.5 truncate text-xs", strong ? "text-white/70" : "text-muted")}>{hint}</p>}
    </Card>
  );
}
