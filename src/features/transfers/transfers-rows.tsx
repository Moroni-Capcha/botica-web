"use client";

import { memo } from "react";
import { ArrowRight, Ban, ClipboardList, Hourglass, PackageCheck, PackageX, Send, Truck, type LucideIcon } from "lucide-react";
import type { Product, Transfer } from "@/lib/api/types";
import type { TransferSuggestion } from "@/lib/domain/transfers";
import { transferUnits, transferValue } from "@/lib/domain/transfers";
import { stockLabel } from "@/lib/domain/pharmacy";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { td } from "@/components/ui/table";
import type { Tone } from "@/components/ui/tone";
import { cn } from "@/lib/cn";
import { dateShort, soles, timeShort } from "@/lib/format";
import { STATUS_LABEL } from "./export";

const fmtInt = (n: number) => n.toLocaleString("es-PE");
const fmtRate = (n: number) => `${n.toLocaleString("es-PE", { maximumFractionDigits: 1 })} u/día`;

/** Estado del traslado: tono + icono + texto (el color nunca va solo). */
const STATUS_UI: Record<Transfer["status"], { tone: Tone; icon: LucideIcon }> = {
  solicitado: { tone: "info", icon: ClipboardList },
  en_transito: { tone: "special", icon: Truck },
  recibido: { tone: "success", icon: PackageCheck },
  anulado: { tone: "neutral", icon: Ban },
};

export function TransferStatus({ status }: { status: Transfer["status"] }) {
  const { tone, icon: Icon } = STATUS_UI[status];
  return (
    <Chip tone={tone}>
      <Icon className="h-3 w-3 shrink-0" aria-hidden /> {STATUS_LABEL[status]}
    </Chip>
  );
}

/** Origen → destino con flecha decorativa. */
function Route({ from, to, className }: { from: string; to: string; className?: string }) {
  return (
    <span className={cn("flex items-center gap-1.5 text-xs font-semibold text-fg-2", className)}>
      {from} <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden /> {to}
    </span>
  );
}

export interface TransferActs {
  dispatch: boolean;
  receive: boolean;
  cancel: boolean;
}

interface ActiveProps {
  transfer: Transfer;
  acts: TransferActs;
  busy: boolean;
  productById: Map<number, Product>;
  stock: Map<string, number>;
  branchName: (id: string) => string;
  onRun: (t: Transfer, kind: "dispatch" | "receive") => void;
  onCancel: (t: Transfer) => void;
}

/** Traslado en curso: líneas, estado y la acción que le toca a esta cuenta. */
export const ActiveTransfer = memo(function ActiveTransfer({ transfer: t, acts, busy, productById, stock, branchName, onRun, onCancel }: ActiveProps) {
  const lines = t.items.length ? t.items.map((it) => ({ productId: it.productId, units: it.units, lot: it })) : (t.requested ?? []).map((r) => ({ productId: r.productId, units: r.units, lot: null }));
  return (
    <Card as="section" padding="none" className={cn("min-w-0", (acts.dispatch || acts.receive) && "border-brand/40 ring-1 ring-brand/20")} aria-label={`Traslado ${t.code}`}>
      <header className="flex flex-wrap items-center gap-2 border-b border-line-soft px-4 py-3 sm:px-5">
        <span className="text-sm font-semibold tabular-nums">{t.code}</span>
        <TransferStatus status={t.status} />
        <Route className="ml-auto" from={branchName(t.fromBranchId)} to={branchName(t.toBranchId)} />
      </header>
      <ul className="divide-y divide-line-soft px-4 sm:px-5">
        {lines.map((it, i) => {
          const p = productById.get(it.productId);
          return (
            <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-2.5 text-sm">
              <span className="min-w-0 flex-1 basis-48">
                <b className="font-medium">{p?.name ?? `Producto ${it.productId}`}</b> <span className="text-muted">{p?.conc} · {p?.lab}</span>
              </span>
              {it.lot ? (
                <span className="text-xs tabular-nums text-muted">
                  Lote {it.lot.lotCode} · vence {it.lot.expiresOn ? dateShort(it.lot.expiresOn) : "—"}
                </span>
              ) : (
                p && <span className="text-xs text-muted">{branchName(t.fromBranchId)} tiene {stockLabel(p, stock.get(`${t.fromBranchId}:${p.id}`) ?? 0)}</span>
              )}
              <span className="ml-auto min-w-16 text-right font-semibold tabular-nums">{p ? stockLabel(p, it.units) : fmtInt(it.units)}</span>
            </li>
          );
        })}
      </ul>
      <footer className="flex flex-wrap items-center gap-2 border-t border-line-soft px-4 py-3 text-xs text-muted sm:px-5">
        <span className="min-w-0 flex-1 basis-56">
          {t.status === "solicitado" ? `Pedido por ${t.createdBy}` : `Despachado por ${t.dispatchedBy ?? t.createdBy}`} · {dateShort(t.dispatchedAt ?? t.createdAt)} {timeShort(t.dispatchedAt ?? t.createdAt)} · {fmtInt(transferUnits(t))} u · {soles(transferValue(t, productById))}
          {t.note && <span className="block text-fg-2">“{t.note}”</span>}
        </span>
        {t.status === "solicitado" &&
          (acts.dispatch ? (
            <Button size="sm" variant="primary" loading={busy} onClick={() => onRun(t, "dispatch")}>
              <Send className="h-3.5 w-3.5" aria-hidden /> Despachar (FEFO)
            </Button>
          ) : (
            <Chip tone="info">
              <ClipboardList className="h-3 w-3 shrink-0" aria-hidden /> Esperando a {branchName(t.fromBranchId)}
            </Chip>
          ))}
        {t.status === "en_transito" &&
          (acts.receive ? (
            <Button size="sm" variant="primary" loading={busy} onClick={() => onRun(t, "receive")}>
              <PackageCheck className="h-3.5 w-3.5" aria-hidden /> Confirmar recepción
            </Button>
          ) : (
            <Chip tone="special">
              <Truck className="h-3 w-3 shrink-0" aria-hidden /> Esperando que {branchName(t.toBranchId)} reciba
            </Chip>
          ))}
        {acts.cancel && (
          <Button size="sm" onClick={() => onCancel(t)} disabled={busy}>
            Anular
          </Button>
        )}
      </footer>
    </Card>
  );
});

interface SuggestionProps {
  suggestion: TransferSuggestion;
  branchName: (id: string) => string;
  actionLabel: string;
  onPrepare: (s: TransferSuggestion) => void;
}

/** Traslado sugerido: por vencimiento (rojo) o por faltante (ámbar), siempre con icono y texto. */
export function SuggestionItem({ suggestion: s, branchName, actionLabel, onPrepare }: SuggestionProps) {
  const venc = s.kind === "vencimiento";
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-5">
      <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", venc ? "bg-danger-bg text-danger-fg" : "bg-warning-bg text-warning-fg")} title={venc ? "Por vencer" : "Faltante"}>
        {venc ? <Hourglass className="h-4 w-4" aria-hidden /> : <PackageX className="h-4 w-4" aria-hidden />}
        <span className="sr-only">{venc ? "Por vencimiento" : "Por faltante"}</span>
      </span>
      <div className="min-w-0 flex-1 basis-60">
        <p className="text-sm font-semibold">
          {s.product.name} <span className="font-normal text-muted">{s.product.conc} · {s.product.lab}</span>
        </p>
        <p className="text-xs text-muted">
          {s.kind === "vencimiento"
            ? `Lote ${s.detail.lotCode} vence en ${s.detail.days} días. ${branchName(s.from)} vende ${fmtRate(s.detail.fromRate)} y ${branchName(s.to)} ${fmtRate(s.detail.toRate)}. Evita perder ${soles(s.loss)}.`
            : `${branchName(s.to)} tiene ${stockLabel(s.product, s.detail.toStock)} (mínimo ${fmtInt(s.detail.toMin)}) y ${branchName(s.from)} tiene ${stockLabel(s.product, s.detail.fromStock)}.`}
        </p>
      </div>
      <Route from={branchName(s.from)} to={branchName(s.to)} />
      <span className="min-w-16 text-right text-sm font-semibold tabular-nums">{stockLabel(s.product, s.units)}</span>
      <Button size="sm" variant="ghost" onClick={() => onPrepare(s)}>
        {actionLabel}
      </Button>
    </li>
  );
}

const productsText = (t: Transfer, productById: Map<number, Product>) =>
  (t.items.length ? t.items.map((it) => `${productById.get(it.productId)?.name ?? it.productId}${it.lotCode ? ` (L:${it.lotCode})` : ""}`) : (t.requested ?? []).map((r) => productById.get(r.productId)?.name ?? String(r.productId))).join(", ");

const closing = (t: Transfer) => (t.receivedBy ? `${t.receivedBy} · ${dateShort(t.receivedAt!)}` : t.cancelledBy ? `Anuló ${t.cancelledBy}${t.cancelReason ? `: ${t.cancelReason}` : ""}` : "—");

interface HistoryProps {
  transfer: Transfer;
  productById: Map<number, Product>;
  branchName: (id: string) => string;
}

/** Fila del historial (tabla ancha). */
export const HistoryRow = memo(function HistoryRow({ transfer: t, productById, branchName }: HistoryProps) {
  return (
    <tr>
      <td className={cn(td, "font-semibold tabular-nums")}>{t.code}</td>
      <td className={cn(td, "whitespace-nowrap text-xs tabular-nums text-fg-2")}>{dateShort(t.createdAt)}</td>
      <td className={cn(td, "whitespace-nowrap text-xs font-semibold")}>
        {branchName(t.fromBranchId)} → {branchName(t.toBranchId)}
      </td>
      <td className={cn(td, "max-w-[320px] text-xs")}>{productsText(t, productById)}</td>
      <td className={cn(td, "text-right tabular-nums")}>{fmtInt(transferUnits(t))}</td>
      <td className={cn(td, "whitespace-nowrap text-right tabular-nums")}>{soles(transferValue(t, productById))}</td>
      <td className={td}>
        <TransferStatus status={t.status} />
      </td>
      <td className={cn(td, "text-xs text-fg-2")}>{closing(t)}</td>
    </tr>
  );
});

/** Tarjeta del historial para pantallas angostas: mismos datos que la fila, sin desplazamiento horizontal. */
export const HistoryCard = memo(function HistoryCard({ transfer: t, productById, branchName }: HistoryProps) {
  return (
    <li>
      <Card padding="sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold tabular-nums">{t.code}</span>
          <TransferStatus status={t.status} />
          <span className="ml-auto text-xs tabular-nums text-muted">{dateShort(t.createdAt)}</span>
        </div>
        <Route className="mt-1" from={branchName(t.fromBranchId)} to={branchName(t.toBranchId)} />
        <p className="mt-1 text-xs text-muted">{productsText(t, productById)}</p>
        <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-line-soft pt-2 text-caption text-muted">
          <div>
            <dt>Unidades</dt>
            <dd className="text-small font-semibold tabular-nums text-fg">{fmtInt(transferUnits(t))}</dd>
          </div>
          <div className="text-right">
            <dt>Valor</dt>
            <dd className="text-small font-semibold tabular-nums text-fg">{soles(transferValue(t, productById))}</dd>
          </div>
        </dl>
        <p className="mt-1 text-caption text-muted">Cierre: {closing(t)}</p>
      </Card>
    </li>
  );
});
