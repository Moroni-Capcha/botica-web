"use client";

import { memo } from "react";
import Link from "next/link";
import { ArrowLeftRight, CalendarX, CircleCheck, Clock, PackageMinus, ShoppingCart, Tag, TriangleAlert, type LucideIcon } from "lucide-react";
import type { BranchId } from "@/lib/api/types";
import { transferSuggestion, type LotRisk } from "@/lib/domain/expiry";
import { stockLabel, type ExpiryTone } from "@/lib/domain/pharmacy";
import { Button, buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { td } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { dateShort, soles } from "@/lib/format";
import { stagger } from "@/lib/motion";
import { CHIP_TONE, daysLabel, primaryAction } from "./expiry-view";

export const fmtInt = (n: number) => n.toLocaleString("es-PE");
export const fmtRate = (n: number) => `${n.toLocaleString("es-PE", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} u/d`;

export const TONE_ICON: Record<ExpiryTone, LucideIcon> = { vencido: CalendarX, critico: TriangleAlert, por_vencer: Clock, vigente: CircleCheck };

/** Lo que comparten todas las filas. Cada valor es estable entre pintados para que `memo` evite repintar la lista. */
export interface ExpShared {
  multi: boolean;
  /** Nombre de cada local por id (incluye los desactivados). */
  names: Record<string, string>;
  branchIds: BranchId[];
  rates: Map<string, number>;
  canSell: boolean;
  onToggle: (lotId: number) => void;
  onWriteOff: (row: LotRisk) => void;
  onSell: (branchId: BranchId) => void;
}

interface ItemProps extends ExpShared {
  row: LotRisk;
  /** Está saliendo de la lista (baja total): se desvanece y no se puede usar. */
  exiting: boolean;
  /** Posición para el escalonado de la primera carga; -1 = sin animación. */
  stag: number;
  checked: boolean;
}

const rowMotion = "transition-[opacity,transform,background-color] duration-[var(--dur-fast)] ease-[var(--ease-out)]";
const exitingClass = "will-change-[transform,opacity] opacity-0 [transform:translate3d(-12px,0,0)]";
const hitBox = "relative grid h-5 w-5 cursor-pointer place-items-center before:absolute before:-inset-3 before:content-['']";

/** Días que quedan: tono + icono + texto, nunca solo color. */
export function DaysChip({ days, tone }: { days: number; tone: ExpiryTone }) {
  const v = CHIP_TONE[tone];
  const Icon = TONE_ICON[tone];
  return (
    <Chip tone={v.tone} solid={v.solid}>
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      {daysLabel(days)}
    </Chip>
  );
}

function DiscountChip({ value }: { value: number }) {
  if (!value) return null;
  return (
    <Chip tone="info" className="ml-1.5 align-middle">
      <Tag className="h-3 w-3 shrink-0" aria-hidden />-{Math.round(value * 100)} %<span className="sr-only"> de descuento</span>
    </Chip>
  );
}

function LotTitle({ row, branch, detail }: { row: LotRisk; branch: string | null; detail: string }) {
  return (
    <div className="min-w-0">
      <p className="text-fg">
        <span className="font-semibold">{row.product.name}</span> <span className="text-fg-2">{row.product.conc}</span>
      </p>
      <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-caption text-muted">
        {branch && (
          <Chip tone="neutral" className="bg-brand/10 text-brand">
            {branch}
          </Chip>
        )}
        {detail}
      </p>
    </div>
  );
}

function PickBox({ checked, label, onChange }: { checked: boolean; label: string; onChange: () => void }) {
  return (
    <label className={hitBox}>
      <input type="checkbox" checked={checked} onChange={onChange} className="h-4 w-4 accent-brand" aria-label={label} />
    </label>
  );
}

/** Acciones de un lote por riesgo de venta: la principal va llena, las demás son secundarias. */
function PriorityActions({ row: r, shared: s }: { row: LotRisk; shared: ExpShared }) {
  const move = transferSuggestion(r, s.branchIds, s.rates);
  const main = primaryAction(r.tone, { hasMove: !!move, canSell: s.canSell });
  const target = move ? (s.names[move.branchId] ?? move.branchId) : "";
  return (
    <div className="flex flex-col items-end gap-1.5">
      {move && (
        <Link
          href={`/traslados?${new URLSearchParams({ from: r.branchId, to: move.branchId, productId: String(r.product.id), lotId: String(r.lot.id), units: String(Math.min(r.atRisk, r.lot.qty)) })}`}
          className={cn(buttonClass(main === "traslado" ? "primary" : "secondary", "sm"), "whitespace-nowrap")}
          title={`${target} vende ${fmtRate(move.rate)}. Prepara el traslado de este lote.`}
        >
          <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden /> Trasladar a {target} · {fmtRate(move.rate)}
        </Link>
      )}
      {s.canSell && (
        <Link href={`/pos?q=${encodeURIComponent(r.product.name)}`} onClick={() => s.onSell(r.branchId)} className={cn(buttonClass(main === "vender" ? "primary" : "secondary", "sm"), "whitespace-nowrap")}>
          <ShoppingCart className="h-3.5 w-3.5" aria-hidden /> Vender
        </Link>
      )}
      <Button
        size="sm"
        variant={main === "baja" ? "primary" : "secondary"}
        onClick={() => s.onWriteOff(r)}
        className="whitespace-nowrap"
        title="Baja o devolución al proveedor"
        aria-label={`Baja o canje del lote ${r.lot.code} de ${r.product.name}`}
      >
        <PackageMinus className="h-3.5 w-3.5" aria-hidden /> Baja o canje
      </Button>
    </div>
  );
}

/** Fila de "Prioridad de venta" (tabla). `memo` + valores estables: marcar un lote no repinta las demás filas. */
export const PriorityRow = memo(function PriorityRow({ row: r, exiting, stag, checked, ...s }: ItemProps) {
  return (
    <tr
      data-flip-key={r.lot.id}
      inert={exiting}
      aria-hidden={exiting || undefined}
      className={cn(rowMotion, checked ? "bg-subtle" : "hover:bg-subtle", exiting && exitingClass, stag >= 0 && "animate-stagger-in")}
      style={stag >= 0 ? stagger(stag) : undefined}
    >
      <td className={cn(td, "w-10")}>
        <PickBox checked={checked} label={`Elegir lote ${r.lot.code} de ${r.product.name}`} onChange={() => s.onToggle(r.lot.id)} />
      </td>
      <td className={td}>
        <LotTitle row={r} branch={s.multi ? (s.names[r.branchId] ?? r.branchId) : null} detail={`${r.product.lab} · ${r.product.category} · Ubic. ${r.product.location}`} />
      </td>
      <td className={cn(td, "whitespace-nowrap tabular-nums text-muted")}>
        {r.lot.code}
        <DiscountChip value={r.lot.discount} />
      </td>
      <td className={td}>
        <div className="grid justify-items-start gap-0.5">
          <DaysChip days={r.days} tone={r.tone} />
          <span className="text-caption tabular-nums text-muted">{dateShort(r.lot.expiresOn)}</span>
        </div>
      </td>
      <td className={cn(td, "whitespace-nowrap text-right tabular-nums")}>{stockLabel(r.product, r.lot.qty)}</td>
      <td className={cn(td, "whitespace-nowrap text-right tabular-nums text-fg-2")}>{fmtRate(r.rate)}</td>
      <td className={cn(td, "whitespace-nowrap text-right font-semibold tabular-nums")}>{Number.isFinite(r.needRate) ? fmtRate(r.needRate) : "—"}</td>
      <td className={cn(td, "whitespace-nowrap text-right tabular-nums")}>{fmtInt(r.atRisk)} u</td>
      <td className={cn(td, "whitespace-nowrap text-right font-semibold tabular-nums text-danger-fg")}>{soles(r.loss)}</td>
      <td className={cn(td, "text-right")}>
        <PriorityActions row={r} shared={s} />
      </td>
    </tr>
  );
});

/** Tarjeta de "Prioridad de venta" para pantallas angostas: mismos datos, sin desplazamiento horizontal. */
export const PriorityCard = memo(function PriorityCard({ row: r, exiting, stag, checked, ...s }: ItemProps) {
  return (
    <li
      data-flip-key={r.lot.id}
      inert={exiting}
      aria-hidden={exiting || undefined}
      className={cn(rowMotion, exiting && exitingClass, stag >= 0 && "animate-stagger-in")}
      style={stag >= 0 ? stagger(stag) : undefined}
    >
      <Card padding="sm" className={cn(checked && "bg-subtle")}>
        <div className="flex items-start gap-3">
          <div className="pt-0.5">
            <PickBox checked={checked} label={`Elegir lote ${r.lot.code} de ${r.product.name}`} onChange={() => s.onToggle(r.lot.id)} />
          </div>
          <div className="min-w-0 flex-1">
            <LotTitle row={r} branch={s.multi ? (s.names[r.branchId] ?? r.branchId) : null} detail={`${r.product.lab} · Ubic. ${r.product.location}`} />
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <DaysChip days={r.days} tone={r.tone} />
              <span className="text-caption tabular-nums text-muted">
                {dateShort(r.lot.expiresOn)} · lote {r.lot.code}
              </span>
              <DiscountChip value={r.lot.discount} />
            </p>
          </div>
        </div>
        <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-line-soft pt-2 text-caption text-muted">
          <div>
            <dt>Stock lote</dt>
            <dd className="text-small font-semibold tabular-nums text-fg">{stockLabel(r.product, r.lot.qty)}</dd>
          </div>
          <div>
            <dt>En riesgo</dt>
            <dd className="text-small font-semibold tabular-nums text-fg">{fmtInt(r.atRisk)} u</dd>
          </div>
          <div className="text-right">
            <dt>Pérdida</dt>
            <dd className="text-small font-semibold tabular-nums text-danger-fg">{soles(r.loss)}</dd>
          </div>
        </dl>
        <div className="mt-3">
          <PriorityActions row={r} shared={s} />
        </div>
      </Card>
    </li>
  );
});

function LotAction({ row: r, onWriteOff }: { row: LotRisk; onWriteOff: (row: LotRisk) => void }) {
  const expired = r.tone === "vencido";
  return (
    <Button size="sm" variant={expired ? "danger" : "secondary"} onClick={() => onWriteOff(r)} className="whitespace-nowrap" aria-label={`${expired ? "Dar de baja" : "Baja o canje"}: lote ${r.lot.code} de ${r.product.name}`}>
      <PackageMinus className="h-3.5 w-3.5" aria-hidden /> {expired ? "Dar de baja" : "Baja o canje"}
    </Button>
  );
}

/** Fila de "Todos los lotes" (tabla). */
export const LotRow = memo(function LotRow({ row: r, exiting, stag, multi, names, onWriteOff }: ItemProps) {
  return (
    <tr
      data-flip-key={r.lot.id}
      inert={exiting}
      aria-hidden={exiting || undefined}
      className={cn(rowMotion, "hover:bg-subtle", exiting && exitingClass, stag >= 0 && "animate-stagger-in")}
      style={stag >= 0 ? stagger(stag) : undefined}
    >
      <td className={td}>
        <LotTitle row={r} branch={multi ? (names[r.branchId] ?? r.branchId) : null} detail={`${r.product.active} · ${r.product.lab} · RS ${r.product.sanitaryReg}`} />
      </td>
      <td className={cn(td, "whitespace-nowrap tabular-nums text-muted")}>
        {r.lot.code}
        <DiscountChip value={r.lot.discount} />
      </td>
      <td className={td}>
        <div className="flex flex-wrap items-center gap-2">
          <DaysChip days={r.days} tone={r.tone} />
          <span className="text-caption tabular-nums text-muted">{dateShort(r.lot.expiresOn)}</span>
        </div>
      </td>
      <td className={cn(td, "whitespace-nowrap text-right tabular-nums")}>{stockLabel(r.product, r.lot.qty)}</td>
      <td className={cn(td, "whitespace-nowrap text-right tabular-nums")}>{soles(r.value)}</td>
      <td className={cn(td, "max-w-[200px] truncate text-caption text-fg-2")} title={r.lot.supplier ?? undefined}>
        {r.lot.supplier ?? "—"}
      </td>
      <td className={cn(td, "whitespace-nowrap text-caption tabular-nums text-muted")}>{r.lot.receivedOn ? dateShort(r.lot.receivedOn) : "—"}</td>
      <td className={cn(td, "text-right")}>
        <LotAction row={r} onWriteOff={onWriteOff} />
      </td>
    </tr>
  );
});

/** Tarjeta de "Todos los lotes" para pantallas angostas. */
export const LotCard = memo(function LotCard({ row: r, exiting, stag, multi, names, onWriteOff }: ItemProps) {
  return (
    <li
      data-flip-key={r.lot.id}
      inert={exiting}
      aria-hidden={exiting || undefined}
      className={cn(rowMotion, exiting && exitingClass, stag >= 0 && "animate-stagger-in")}
      style={stag >= 0 ? stagger(stag) : undefined}
    >
      <Card padding="sm">
        <LotTitle row={r} branch={multi ? (names[r.branchId] ?? r.branchId) : null} detail={`${r.product.lab} · lote ${r.lot.code}`} />
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <DaysChip days={r.days} tone={r.tone} />
          <span className="text-caption tabular-nums text-muted">{dateShort(r.lot.expiresOn)}</span>
          <DiscountChip value={r.lot.discount} />
        </p>
        <dl className="mt-3 flex justify-between gap-3 border-t border-line-soft pt-2 text-caption text-muted">
          <div>
            <dt>Cantidad</dt>
            <dd className="text-small font-semibold tabular-nums text-fg">{stockLabel(r.product, r.lot.qty)}</dd>
          </div>
          <div className="text-right">
            <dt>Valor costo</dt>
            <dd className="text-small font-semibold tabular-nums text-fg">{soles(r.value)}</dd>
          </div>
        </dl>
        <div className="mt-3 flex justify-end">
          <LotAction row={r} onWriteOff={onWriteOff} />
        </div>
      </Card>
    </li>
  );
});
