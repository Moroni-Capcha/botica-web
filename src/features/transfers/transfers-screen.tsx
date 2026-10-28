"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, ArrowRight, CircleCheck, ClipboardList, FileSpreadsheet, Hourglass, PackageCheck, PackageX, Send, TriangleAlert, Truck, X } from "lucide-react";
import type { BranchId, Product, Transfer } from "@/lib/api/types";
import { errorMessage } from "@/lib/api";
import { useSessionStore } from "@/lib/auth/session-store";
import { useBranchStock, useConfig, useProducts, useTransferAction, useTransfers, useVelocity } from "@/lib/queries";
import { dailyRates } from "@/lib/domain/expiry";
import { DEFAULT_THRESHOLDS, stockLabel } from "@/lib/domain/pharmacy";
import { suggestTransfers, transferActions, transferUnits, transferValue, type TransferSuggestion } from "@/lib/domain/transfers";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Empty } from "@/components/ui/empty";
import { Field, Input } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { Table, td } from "@/components/ui/table";
import { notify } from "@/components/ui/toast";
import { dateShort, soles, timeShort } from "@/lib/format";
import { cn } from "@/lib/cn";
import { useBranchLots, useBranchScope } from "@/features/shared/branch-scope";
import { VELOCITY_DAYS } from "@/features/expiry/use-expiry-data";
import { TransferDialog, type TransferSeed } from "./transfer-dialog";
import { exportTransfers, STATUS_LABEL } from "./export";

type Tab = "curso" | "sugeridos" | "historial";
const PERIODS = [30, 90] as const;
const STATUS_CLASS: Record<Transfer["status"], string> = {
  solicitado: "bg-sky-100 text-sky-800",
  en_transito: "bg-violet-100 text-violet-800",
  recibido: "bg-emerald-100 text-emerald-700",
  anulado: "bg-zinc-100 text-zinc-500",
};
const fmtInt = (n: number) => n.toLocaleString("es-PE");
const fmtRate = (n: number) => `${n.toLocaleString("es-PE", { maximumFractionDigits: 1 })} u/día`;

export function TransfersScreen() {
  const user = useSessionStore((s) => s.session?.user);
  const scope = useBranchScope();
  const { allBranches, operating, branches, branchName, isAdmin } = scope;
  const config = useConfig();
  const products = useProducts();
  const branchStock = useBranchStock();
  const velocity = useVelocity(VELOCITY_DAYS);
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30);
  const transfers = useTransfers(days);
  /* Para sugerencias por vencimiento: los lotes que la cuenta puede ver */
  const visibleBranches = useMemo(() => (isAdmin ? branches.map((b) => b.id) : [operating]), [isAdmin, branches, operating]);
  const lotsQ = useBranchLots(visibleBranches);
  const [now] = useState(() => Date.now());

  const [tab, setTab] = useState<Tab>("curso");
  const [dialog, setDialog] = useState<TransferSeed | null>(null);
  const [cancelling, setCancelling] = useState<Transfer | null>(null);
  const action = useTransferAction();

  const productList: Product[] = products.data ?? [];
  const productById = useMemo(() => new Map(productList.map((p) => [p.id, p])), [productList]);
  const stock = useMemo(() => new Map((branchStock.data ?? []).map((s) => [`${s.branchId}:${s.productId}`, s.units])), [branchStock.data]);
  const rates = useMemo(() => dailyRates(velocity.data ?? []), [velocity.data]);
  const other = (b: BranchId) => branches.find((x) => x.id !== b)?.id ?? b;

  /* Llega desde Vencimientos con un traslado preparado: /traslados?from=…&to=…&productId=…&lotId=…&units=… */
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const from = p.get("from");
    const to = p.get("to");
    if (from && to) {
      setDialog({ from, to, productId: Number(p.get("productId")) || undefined, lotId: Number(p.get("lotId")) || null, units: Number(p.get("units")) || undefined });
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  const suggestions = useMemo(() => {
    const all = suggestTransfers({ products: productList, lots: lotsQ.lots, stock, branchIds: branches.map((b) => b.id), rates, now, coverDays: config.data?.purchasing.coverDays ?? 15, thresholds: config.data?.expiry ?? DEFAULT_THRESHOLDS });
    return isAdmin ? all : all.filter((s) => s.from === operating || s.to === operating);
  }, [productList, lotsQ.lots, stock, branches, rates, now, config.data, isAdmin, operating]);

  const list = transfers.data ?? [];
  const active = list.filter((t) => t.status === "solicitado" || t.status === "en_transito");
  const history = list.filter((t) => t.status === "recibido" || t.status === "anulado");
  /* Lo que le toca hacer a esta cuenta, primero */
  const pendingForMe = user ? active.filter((t) => { const a = transferActions(t, user); return a.dispatch || a.receive; }).length : 0;
  const sortedActive = user ? [...active].sort((a, b) => Number(transferActions(b, user).dispatch || transferActions(b, user).receive) - Number(transferActions(a, user).dispatch || transferActions(a, user).receive)) : active;

  const run = (t: Transfer, kind: "dispatch" | "receive") =>
    action.mutate(
      { kind, id: t.id },
      {
        onSuccess: (r) => notify(kind === "dispatch" ? `${r.code} despachado por FEFO: ${fmtInt(transferUnits(r))} unid. en camino a ${branchName(r.toBranchId)}` : `${r.code} recibido: el stock ya está disponible en ${branchName(r.toBranchId)}`),
        onError: (e) => notify(errorMessage(e), "warn"),
      },
    );

  const prepare = (s: TransferSuggestion) => setDialog({ from: s.from, to: s.to, productId: s.product.id, lotId: s.lotId, units: s.units });

  const isLoading = products.isLoading || transfers.isLoading || branchStock.isLoading;
  const error = products.error ?? transfers.error ?? branchStock.error;

  if (error) {
    return (
      <Empty icon={TriangleAlert} title="No se pudieron cargar los traslados">
        {errorMessage(error)}{" "}
        <button type="button" className="font-semibold underline" onClick={() => void Promise.all([products.refetch(), transfers.refetch(), branchStock.refetch()])}>
          Reintentar
        </button>
      </Empty>
    );
  }

  const otherName = branches.length > 2 ? "otro local" : branchName(other(operating));
  const canTransfer = branches.length > 1;

  return (
    <div className="mx-auto grid max-w-7xl gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<Tab>
          label="Vista"
          value={tab}
          onChange={setTab}
          options={[
            { id: "curso", label: pendingForMe ? `En curso · ${pendingForMe} por atender` : "En curso", count: transfers.data ? active.length : undefined },
            { id: "sugeridos", label: "Sugeridos", count: isLoading ? undefined : suggestions.length },
            { id: "historial", label: "Historial", count: transfers.data ? history.length : undefined },
          ]}
        />
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          {!isAdmin && canTransfer && (
            <Button onClick={() => setDialog({ from: other(operating), to: operating })} disabled={!products.data}>
              <ClipboardList className="h-4 w-4" /> Pedir a {otherName}
            </Button>
          )}
          <Button variant="primary" onClick={() => setDialog({ from: operating, to: other(operating) })} disabled={!products.data || !canTransfer} title={canTransfer ? undefined : "Hace falta un segundo local activo"}>
            <Send className="h-4 w-4" /> {isAdmin ? "Nuevo traslado" : `Enviar a ${otherName}`}
          </Button>
          <Button
            disabled={!list.length}
            onClick={() => {
              exportTransfers({ transfers: list, products: productList, branches: allBranches, scopeLabel: isAdmin ? "Todos los locales" : `Local ${branchName(operating)}`, days, pharmacy: config.data?.pharmacy });
              notify("Traslados descargados");
            }}
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Excel
          </Button>
        </div>
      </div>

      <ol className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-4 text-xs text-zinc-600 sm:grid-cols-3 sm:p-5">
        {[
          { icon: ClipboardList, t: "1. Pedir o enviar", d: "Un local pide mercadería o el otro la envía eligiendo lote y cantidad." },
          { icon: Truck, t: "2. En camino", d: "Al despachar, el stock sale del origen por FEFO y viaja con su lote y vencimiento." },
          { icon: PackageCheck, t: "3. Recibir", d: "El destino confirma y el stock entra con el mismo lote. Todo queda en el kardex de ambos." },
        ].map(({ icon: Icon, t, d }) => (
          <li key={t} className="flex gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand">
              <Icon className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-zinc-900">{t}</p>
              <p className="mt-0.5">{d}</p>
            </div>
          </li>
        ))}
      </ol>

      {tab === "curso" &&
        (transfers.isLoading ? (
          <Skeleton />
        ) : active.length === 0 ? (
          <section className="rounded-2xl border border-zinc-200 bg-white">
            <Empty icon={ArrowLeftRight} title="No hay traslados en curso">
              Crea uno o revisa la pestaña de sugeridos.
            </Empty>
          </section>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {sortedActive.map((t) => {
              const acts = user ? transferActions(t, user) : { dispatch: false, receive: false, cancel: false };
              const lines = t.items.length ? t.items.map((it) => ({ productId: it.productId, units: it.units, lot: it })) : (t.requested ?? []).map((r) => ({ productId: r.productId, units: r.units, lot: null }));
              const busy = action.isPending && action.variables && "id" in action.variables && action.variables.id === t.id;
              return (
                <section key={t.id} className={cn("min-w-0 rounded-2xl border bg-white", acts.dispatch || acts.receive ? "border-brand/40 ring-1 ring-brand/20" : "border-zinc-200")} aria-label={`Traslado ${t.code}`}>
                  <header className="flex flex-wrap items-center gap-2 border-b border-zinc-100 px-4 py-3 sm:px-5">
                    <span className="text-sm font-semibold tabular-nums">{t.code}</span>
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", STATUS_CLASS[t.status])}>{STATUS_LABEL[t.status]}</span>
                    <span className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-zinc-700">
                      {branchName(t.fromBranchId)} <ArrowRight className="h-3.5 w-3.5 text-zinc-400" /> {branchName(t.toBranchId)}
                    </span>
                  </header>
                  <ul className="divide-y divide-zinc-100 px-4 sm:px-5">
                    {lines.map((it, i) => {
                      const p = productById.get(it.productId);
                      return (
                        <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-2.5 text-sm">
                          <span className="min-w-0 flex-1">
                            <b className="font-medium">{p?.name ?? `Producto ${it.productId}`}</b> <span className="text-zinc-500">{p?.conc} · {p?.lab}</span>
                          </span>
                          {it.lot ? (
                            <span className="text-xs tabular-nums text-zinc-500">
                              Lote {it.lot.lotCode} · vence {it.lot.expiresOn ? dateShort(it.lot.expiresOn) : "—"}
                            </span>
                          ) : (
                            p && <span className="text-xs text-zinc-500">{branchName(t.fromBranchId)} tiene {stockLabel(p, stock.get(`${t.fromBranchId}:${p.id}`) ?? 0)}</span>
                          )}
                          <span className="w-24 text-right font-semibold tabular-nums">{p ? stockLabel(p, it.units) : fmtInt(it.units)}</span>
                        </li>
                      );
                    })}
                  </ul>
                  <footer className="flex flex-wrap items-center gap-2 border-t border-zinc-100 px-4 py-3 text-xs text-zinc-500 sm:px-5">
                    <span className="min-w-0 flex-1">
                      {t.status === "solicitado" ? `Pedido por ${t.createdBy}` : `Despachado por ${t.dispatchedBy ?? t.createdBy}`} · {dateShort(t.dispatchedAt ?? t.createdAt)} {timeShort(t.dispatchedAt ?? t.createdAt)} · {fmtInt(transferUnits(t))} u · {soles(transferValue(t, productById))}
                      {t.note && <span className="block text-zinc-600">“{t.note}”</span>}
                    </span>
                    {t.status === "solicitado" &&
                      (acts.dispatch ? (
                        <Button size="sm" variant="primary" loading={!!busy} onClick={() => run(t, "dispatch")}>
                          <Send className="h-3.5 w-3.5" /> Despachar (FEFO)
                        </Button>
                      ) : (
                        <span className="font-semibold text-sky-800">Esperando a {branchName(t.fromBranchId)}</span>
                      ))}
                    {t.status === "en_transito" &&
                      (acts.receive ? (
                        <Button size="sm" variant="primary" loading={!!busy} onClick={() => run(t, "receive")}>
                          <PackageCheck className="h-3.5 w-3.5" /> Confirmar recepción
                        </Button>
                      ) : (
                        <span className="font-semibold text-violet-800">Esperando que {branchName(t.toBranchId)} reciba</span>
                      ))}
                    {acts.cancel && (
                      <Button size="sm" onClick={() => setCancelling(t)} disabled={!!busy}>
                        Anular
                      </Button>
                    )}
                  </footer>
                </section>
              );
            })}
          </div>
        ))}

      {tab === "sugeridos" && (
        <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white" aria-labelledby="sug-tr">
          <div className="border-b border-zinc-100 p-4 sm:p-5">
            <h2 id="sug-tr" className="text-base font-semibold tracking-tight">Traslados sugeridos</h2>
            <p className="mt-1 text-xs text-zinc-500">Antes de comprar o de perder un lote por vencimiento, revisa si el otro local lo tiene de sobra o lo vende más rápido.</p>
          </div>
          {isLoading || velocity.isLoading ? (
            <Skeleton />
          ) : suggestions.length === 0 ? (
            <Empty icon={CircleCheck} title="Sin sugerencias por ahora" />
          ) : (
            <ul className="divide-y divide-zinc-100">
              {suggestions.map((s) => (
                <li key={s.key} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                  <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", s.kind === "vencimiento" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-800")}>
                    {s.kind === "vencimiento" ? <Hourglass className="h-4 w-4" /> : <PackageX className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0 flex-1 basis-60">
                    <p className="text-sm font-semibold">
                      {s.product.name} <span className="font-normal text-zinc-500">{s.product.conc} · {s.product.lab}</span>
                    </p>
                    <p className="text-xs text-zinc-500">
                      {s.kind === "vencimiento"
                        ? `Lote ${s.detail.lotCode} vence en ${s.detail.days} días. ${branchName(s.from)} vende ${fmtRate(s.detail.fromRate)} y ${branchName(s.to)} ${fmtRate(s.detail.toRate)}. Evita perder ${soles(s.loss)}.`
                        : `${branchName(s.to)} tiene ${stockLabel(s.product, s.detail.toStock)} (mínimo ${fmtInt(s.detail.toMin)}) y ${branchName(s.from)} tiene ${stockLabel(s.product, s.detail.fromStock)}.`}
                    </p>
                  </div>
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-700">
                    {branchName(s.from)} <ArrowRight className="h-3.5 w-3.5 text-zinc-400" /> {branchName(s.to)}
                  </span>
                  <span className="w-24 text-right text-sm font-semibold tabular-nums">{stockLabel(s.product, s.units)}</span>
                  <Button size="sm" variant="ghost" onClick={() => prepare(s)}>
                    {user && (user.role === "admin" || user.branchId === s.from) ? "Preparar envío" : "Pedir"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === "historial" && (
        <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white" aria-label="Historial de traslados">
          <div className="flex justify-end border-b border-zinc-100 p-3 sm:px-5">
            <Segmented label="Periodo" value={String(days)} onChange={(v) => setDays(Number(v) as (typeof PERIODS)[number])} options={PERIODS.map((d) => ({ id: String(d), label: `${d} días` }))} />
          </div>
          {transfers.isLoading ? (
            <Skeleton />
          ) : history.length === 0 ? (
            <Empty icon={ArrowLeftRight} title={`Sin traslados cerrados en ${days} días`} />
          ) : (
            <Table minWidth={900} head={["N.º", "Fecha", "Ruta", "Productos", { label: "Unidades", align: "right" }, { label: "Valor", align: "right" }, "Estado", "Cierre"]}>
              {history.map((t) => (
                <tr key={t.id}>
                  <td className={cn(td, "font-semibold tabular-nums")}>{t.code}</td>
                  <td className={cn(td, "whitespace-nowrap text-xs tabular-nums text-zinc-600")}>{dateShort(t.createdAt)}</td>
                  <td className={cn(td, "whitespace-nowrap text-xs font-semibold")}>
                    {branchName(t.fromBranchId)} → {branchName(t.toBranchId)}
                  </td>
                  <td className={cn(td, "max-w-[320px] text-xs")}>
                    {(t.items.length ? t.items.map((it) => `${productById.get(it.productId)?.name ?? it.productId}${it.lotCode ? ` (L:${it.lotCode})` : ""}`) : (t.requested ?? []).map((r) => productById.get(r.productId)?.name ?? String(r.productId))).join(", ")}
                  </td>
                  <td className={cn(td, "text-right tabular-nums")}>{fmtInt(transferUnits(t))}</td>
                  <td className={cn(td, "whitespace-nowrap text-right tabular-nums")}>{soles(transferValue(t, productById))}</td>
                  <td className={td}>
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", STATUS_CLASS[t.status])}>{STATUS_LABEL[t.status]}</span>
                  </td>
                  <td className={cn(td, "text-xs text-zinc-600")}>
                    {t.receivedBy ? `${t.receivedBy} · ${dateShort(t.receivedAt!)}` : t.cancelledBy ? `Anuló ${t.cancelledBy}${t.cancelReason ? `: ${t.cancelReason}` : ""}` : "—"}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </section>
      )}

      {dialog && user && products.data && (
        <TransferDialog
          seed={dialog}
          user={user}
          branches={allBranches}
          products={productList}
          stock={stock}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            setTab("curso");
          }}
        />
      )}
      {cancelling && (
        <CancelDialog
          transfer={cancelling}
          onClose={() => setCancelling(null)}
          onConfirm={(reason) =>
            action.mutate(
              { kind: "cancel", id: cancelling.id, reason },
              {
                onSuccess: (r) => {
                  notify(r.items.length && cancelling.status === "en_transito" ? `${r.code} anulado: el stock volvió a ${branchName(r.fromBranchId)}` : `${r.code} anulado`);
                  setCancelling(null);
                },
              },
            )
          }
          pending={action.isPending}
          error={action.error && action.variables?.kind === "cancel" ? errorMessage(action.error) : null}
        />
      )}
    </div>
  );
}

function CancelDialog({ transfer, onClose, onConfirm, pending, error }: { transfer: Transfer; onClose: () => void; onConfirm: (reason: string) => void; pending: boolean; error: string | null }) {
  const [reason, setReason] = useState("");
  const ok = reason.trim().length >= 3;
  return (
    <Dialog
      title={`Anular ${transfer.code}`}
      description={transfer.status === "en_transito" ? "El stock vuelve a los mismos lotes del local de origen." : "El pedido se cierra sin mover stock."}
      onClose={onClose}
      footer={
        <>
          {error && <p className="mr-auto text-sm text-rose-600" role="alert">{error}</p>}
          <Button onClick={onClose}>Volver</Button>
          <Button variant="danger" disabled={!ok} loading={pending} onClick={() => onConfirm(reason.trim())}>
            <X className="h-4 w-4" /> Anular traslado
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (ok) onConfirm(reason.trim());
        }}
      >
        <Field label="Motivo">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej.: se envió por error, cantidad equivocada" maxLength={160} />
        </Field>
      </form>
    </Dialog>
  );
}

function Skeleton() {
  return (
    <div className="grid gap-2 p-4 sm:p-5" aria-busy="true">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="h-14 animate-pulse rounded-xl bg-zinc-100" />
      ))}
    </div>
  );
}
