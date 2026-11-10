"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, CircleCheck, ClipboardList, FileSpreadsheet, PackageCheck, Send, TriangleAlert, Truck, X } from "lucide-react";
import type { BranchId, Product, Transfer } from "@/lib/api/types";
import { errorMessage } from "@/lib/api";
import { useSessionStore } from "@/lib/auth/session-store";
import { useBranchStock, useConfig, useProducts, useTransferAction, useTransfers, useVelocity } from "@/lib/queries";
import { dailyRates } from "@/lib/domain/expiry";
import { DEFAULT_THRESHOLDS, stockLabel } from "@/lib/domain/pharmacy";
import { suggestTransfers, transferActions, transferUnits, type TransferSuggestion } from "@/lib/domain/transfers";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Empty } from "@/components/ui/empty";
import { Field, Input } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { Table } from "@/components/ui/table";
import { notify } from "@/components/ui/toast";
import { useMediaQuery } from "@/lib/use-media-query";
import { useBranchLots, useBranchScope } from "@/features/shared/branch-scope";
import { VELOCITY_DAYS } from "@/features/expiry/use-expiry-data";
import { TransferDialog, type TransferSeed } from "./transfer-dialog";
import { exportTransfers } from "./export";
import { ActiveTransfer, HistoryCard, HistoryRow, SuggestionItem } from "./transfers-rows";

type Tab = "curso" | "sugeridos" | "historial";
const PERIODS = [30, 90] as const;
const fmtInt = (n: number) => n.toLocaleString("es-PE");

export function TransfersScreen() {
  const user = useSessionStore((s) => s.session?.user);
  const scope = useBranchScope();
  const { allBranches, operating, branches, branchName, isAdmin } = scope;
  const wide = useMediaQuery("(min-width: 768px)");
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
      <div className="mx-auto max-w-7xl p-4 sm:p-6">
        <Card padding="none">
          <Empty icon={TriangleAlert} title="No se pudieron cargar los traslados">
            {errorMessage(error)}{" "}
            <button type="button" className="font-semibold underline" onClick={() => void Promise.all([products.refetch(), transfers.refetch(), branchStock.refetch()])}>
              Reintentar
            </button>
          </Empty>
        </Card>
      </div>
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
              <ClipboardList className="h-4 w-4" aria-hidden /> Pedir a {otherName}
            </Button>
          )}
          <Button variant="primary" onClick={() => setDialog({ from: operating, to: other(operating) })} disabled={!products.data || !canTransfer} title={canTransfer ? undefined : "Hace falta un segundo local activo"}>
            <Send className="h-4 w-4" aria-hidden /> {isAdmin ? "Nuevo traslado" : `Enviar a ${otherName}`}
          </Button>
          <Button
            disabled={!list.length}
            onClick={() => {
              exportTransfers({ transfers: list, products: productList, branches: allBranches, scopeLabel: isAdmin ? "Todos los locales" : `Local ${branchName(operating)}`, days, pharmacy: config.data?.pharmacy });
              notify("Traslados descargados");
            }}
          >
            <FileSpreadsheet className="h-4 w-4 text-success-fg" aria-hidden /> Excel
          </Button>
        </div>
      </div>

      <Card as="aside" aria-label="Cómo funciona un traslado" className="text-xs text-fg-2">
      <ol className="grid gap-3 sm:grid-cols-3">
        {[
          { icon: ClipboardList, t: "1. Pedir o enviar", d: "Un local pide mercadería o el otro la envía eligiendo lote y cantidad." },
          { icon: Truck, t: "2. En camino", d: "Al despachar, el stock sale del origen por FEFO y viaja con su lote y vencimiento." },
          { icon: PackageCheck, t: "3. Recibir", d: "El destino confirma y el stock entra con el mismo lote. Todo queda en el kardex de ambos." },
        ].map(({ icon: Icon, t, d }) => (
          <li key={t} className="flex gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand-ink">
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-semibold text-fg">{t}</p>
              <p className="mt-0.5">{d}</p>
            </div>
          </li>
        ))}
      </ol>
      </Card>

      {tab === "curso" && (
        <div className="animate-swap-in">
          {transfers.isLoading ? (
            <Card padding="none">
              <Skeleton />
            </Card>
          ) : active.length === 0 ? (
            <Card as="section" padding="none">
              <Empty icon={ArrowLeftRight} title="No hay traslados en curso">
                Crea uno o revisa la pestaña de sugeridos.
              </Empty>
            </Card>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {sortedActive.map((t) => {
                const acts = user ? transferActions(t, user) : { dispatch: false, receive: false, cancel: false };
                const busy = !!(action.isPending && action.variables && "id" in action.variables && action.variables.id === t.id);
                return <ActiveTransfer key={t.id} transfer={t} acts={acts} busy={busy} productById={productById} stock={stock} branchName={branchName} onRun={run} onCancel={setCancelling} />;
              })}
            </div>
          )}
        </div>
      )}

      {tab === "sugeridos" && (
        <Card as="section" padding="none" className="animate-swap-in overflow-hidden" aria-labelledby="sug-tr">
          <div className="border-b border-line-soft p-4 sm:p-5">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <h2 id="sug-tr" className="text-base font-semibold tracking-tight">Traslados sugeridos</h2>
              <p className="text-caption tabular-nums text-muted" role="status" aria-live="polite">
                {isLoading || velocity.isLoading ? "" : `${fmtInt(suggestions.length)} ${suggestions.length === 1 ? "sugerencia" : "sugerencias"}`}
              </p>
            </div>
            <p className="mt-1 text-xs text-muted">Antes de comprar o de perder un lote por vencimiento, revisa si el otro local lo tiene de sobra o lo vende más rápido.</p>
          </div>
          {isLoading || velocity.isLoading ? (
            <Skeleton />
          ) : suggestions.length === 0 ? (
            <Empty icon={CircleCheck} title="Sin sugerencias por ahora" />
          ) : (
            <ul className="divide-y divide-line-soft">
              {suggestions.map((s) => (
                <SuggestionItem key={s.key} suggestion={s} branchName={branchName} actionLabel={user && (user.role === "admin" || user.branchId === s.from) ? "Preparar envío" : "Pedir"} onPrepare={prepare} />
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === "historial" && (
        <Card as="section" padding="none" className="animate-swap-in overflow-hidden" aria-labelledby="hist-tr">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line-soft p-3 sm:px-5">
            <h2 id="hist-tr" className="text-base font-semibold tracking-tight">Historial de traslados</h2>
            <p className="text-caption tabular-nums text-muted" role="status" aria-live="polite">
              {transfers.isLoading ? "" : `${fmtInt(history.length)} ${history.length === 1 ? "traslado" : "traslados"}`}
            </p>
            <div className="ml-auto">
              <Segmented label="Periodo" value={String(days)} onChange={(v) => setDays(Number(v) as (typeof PERIODS)[number])} options={PERIODS.map((d) => ({ id: String(d), label: `${d} días` }))} />
            </div>
          </div>
          {transfers.isLoading ? (
            <Skeleton />
          ) : history.length === 0 ? (
            <Empty icon={ArrowLeftRight} title={`Sin traslados cerrados en ${days} días`} />
          ) : wide ? (
            <Table maxHeight={640} minWidth={900} head={["N.º", "Fecha", "Ruta", "Productos", { label: "Unidades", align: "right" }, { label: "Valor", align: "right" }, "Estado", "Cierre"]}>
              {history.map((t) => (
                <HistoryRow key={t.id} transfer={t} productById={productById} branchName={branchName} />
              ))}
            </Table>
          ) : (
            <ul className="grid gap-2 p-3">
              {history.map((t) => (
                <HistoryCard key={t.id} transfer={t} productById={productById} branchName={branchName} />
              ))}
            </ul>
          )}
        </Card>
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
          {error && <p className="mr-auto text-sm text-danger-fg" role="alert">{error}</p>}
          <Button onClick={onClose}>Volver</Button>
          <Button variant="danger" disabled={!ok} loading={pending} onClick={() => onConfirm(reason.trim())}>
            <X className="h-4 w-4" aria-hidden /> Anular traslado
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
        <div key={i} className="h-14 animate-pulse rounded-xl bg-sunken" />
      ))}
    </div>
  );
}
