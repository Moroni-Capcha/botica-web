"use client";

import { memo } from "react";
import { ChevronRight, ListFilter, MapPin, PackageX, Pencil, Snowflake, TriangleAlert, type LucideIcon } from "lucide-react";
import type { BranchId, ExpiryThresholds, Product } from "@/lib/api/types";
import { minFor, type InventoryRow } from "@/lib/domain/inventory";
import { daysUntil, stockLabel } from "@/lib/domain/pharmacy";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { IconButton } from "@/components/ui/icon-button";
import { rowButtonClass, td } from "@/components/ui/table";
import { ExpiryBadge, RxBadge } from "@/components/ui/badges";
import { cn } from "@/lib/cn";
import { dateShort, soles } from "@/lib/format";
import { stagger } from "@/lib/motion";
import { useValuePulse } from "@/lib/use-value-pulse";
import { STATUS_LABEL } from "./export";
import { BRANCH_STOCK_CLASS, branchStockTone, STOCK_TONE } from "./stock-tone";

const fmtInt = (n: number) => n.toLocaleString("es-PE");

export interface RowShared {
  multi: boolean;
  branchIds: BranchId[];
  /** Nombre de cada local por id (incluye los desactivados). */
  names: Record<string, string>;
  operating: BranchId;
  thresholds: ExpiryThresholds;
  now: number;
  canEdit: boolean;
  onOpen: (id: number) => void;
  onEdit: (p: Product) => void;
}

interface ItemProps extends RowShared {
  row: InventoryRow;
  /** Posición para el escalonado de la primera carga; -1 = sin animación. */
  stag: number;
}

/** Estado de stock: tono + icono + texto. Lo normal no lleva chip. */
function StatusChip({ row, multi, names }: { row: InventoryRow; multi: boolean; names: Record<string, string> }) {
  if (row.status === "ok") return null;
  const c = STOCK_TONE[row.status];
  const Icon = row.status === "agotado" ? PackageX : TriangleAlert;
  const where = multi && row.status === "bajo" ? row.low.map((b) => names[b] ?? b).join(", ") : "";
  return (
    <Chip tone={c.tone} solid={c.solid}>
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      {STATUS_LABEL[row.status]}
      {where && <span className="max-w-40 truncate font-medium"> · {where}</span>}
    </Chip>
  );
}

function ProductMeta({ p, expired }: { p: Product; expired: number }) {
  return (
    <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-caption text-muted">
      <span>
        {p.active} · {p.lab} · {p.form}
      </span>
      {p.location && (
        <span className="inline-flex items-center gap-0.5">
          <MapPin className="h-3 w-3" aria-hidden /> <span className="sr-only">Ubicación </span>
          {p.location}
        </span>
      )}
      {expired > 0 && <span className="font-semibold text-danger-fg">· {fmtInt(expired)} u vencidas</span>}
    </p>
  );
}

function NameLine({ p }: { p: Product }) {
  return (
    <p className="flex flex-wrap items-center gap-1.5 text-fg">
      <span className="font-semibold">{p.name}</span>
      {p.conc && <span className="text-fg-2">{p.conc}</span>}
      <RxBadge rx={p.rx} />
      {p.coldChain && <Snowflake className="h-3.5 w-3.5 text-info-fg" role="img" aria-label="Cadena de frío" />}
    </p>
  );
}

function Expiry({ r, now, thresholds }: { r: InventoryRow; now: number; thresholds: ExpiryThresholds }) {
  if (!r.next) {
    return (
      <span className="text-muted">
        <span aria-hidden>—</span>
        <span className="sr-only">Sin lotes con stock</span>
      </span>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <ExpiryBadge days={daysUntil(r.next.expiresOn, now)} short thresholds={thresholds} />
      <span className="text-caption tabular-nums text-muted">{dateShort(r.next.expiresOn)}</span>
    </div>
  );
}

function EditButton({ p, onEdit, revealed }: { p: Product; onEdit: (p: Product) => void; revealed?: boolean }) {
  return (
    <IconButton
      size="sm"
      aria-label={`Editar ${p.name} ${p.conc}`}
      title="Editar producto"
      onClick={(e) => {
        e.stopPropagation();
        onEdit(p);
      }}
      onKeyDown={(e) => e.stopPropagation()}
      className={cn(
        "transition-[opacity,background-color,color] duration-[var(--dur-fast)]",
        revealed && "opacity-0 focus-visible:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100",
      )}
    >
      <Pencil className="h-4 w-4" aria-hidden />
    </IconButton>
  );
}

/** Fila de la tabla. `memo` + manejadores estables: escribir en el buscador no repinta las filas que siguen igual. */
export const ProductRow = memo(function ProductRow({ row: r, multi, branchIds, names, operating, thresholds, now, canEdit, stag, onOpen, onEdit }: ItemProps) {
  const p = r.product;
  return (
    <tr
      tabIndex={0}
      onClick={() => onOpen(p.id)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(p.id);
        }
      }}
      className={cn(rowButtonClass, "group h-12", stag >= 0 && "animate-stagger-in")}
      style={stag >= 0 ? stagger(stag) : undefined}
      aria-label={`Ver ficha de ${p.name} ${p.conc}`}
    >
      <td className={cn(td, "py-2")}>
        <NameLine p={p} />
        <ProductMeta p={p} expired={r.expired} />
      </td>
      <td className={cn(td, "py-2 text-caption text-fg-2")}>{p.category}</td>
      {multi ? (
        <>
          {branchIds.map((b) => {
            const v = r.perBranch[b] ?? 0;
            return (
              <td key={b} className={cn(td, "whitespace-nowrap py-2 text-right tabular-nums", BRANCH_STOCK_CLASS[branchStockTone(v, r.low.includes(b))])}>
                {v === 0 ? "—" : stockLabel(p, v)}
              </td>
            );
          })}
          <td className={cn(td, "py-2")}>
            <div className="flex items-center justify-end gap-2 whitespace-nowrap">
              <StatusChip row={r} multi names={names} />
              <span className="font-semibold tabular-nums">{stockLabel(p, r.stock)}</span>
            </div>
          </td>
        </>
      ) : (
        <>
          <td className={cn(td, "py-2")}>
            <div className="flex items-center justify-end gap-2 whitespace-nowrap">
              <StatusChip row={r} multi={false} names={names} />
              <span className="font-semibold tabular-nums">{stockLabel(p, r.stock)}</span>
            </div>
          </td>
          <td className={cn(td, "py-2 text-right tabular-nums text-muted")}>{fmtInt(minFor(p, operating))}</td>
        </>
      )}
      <td className={cn(td, "py-2")}>
        <Expiry r={r} now={now} thresholds={thresholds} />
      </td>
      <td className={cn(td, "whitespace-nowrap py-2 text-right tabular-nums")}>{soles(r.valueCost)}</td>
      <td className={cn(td, "whitespace-nowrap py-2 text-right tabular-nums")}>{soles(p.priceUnit)}</td>
      <td className={cn(td, "py-2")}>
        <div className="flex items-center justify-end gap-1">
          {canEdit && <EditButton p={p} onEdit={onEdit} revealed />}
          <ChevronRight className="h-4 w-4 text-muted" aria-hidden />
        </div>
      </td>
    </tr>
  );
});

/** Tarjeta de producto para pantallas angostas: mismos datos que la fila, sin desplazamiento horizontal. */
export const ProductCard = memo(function ProductCard({ row: r, multi, branchIds, names, operating, thresholds, now, canEdit, stag, onOpen, onEdit }: ItemProps) {
  const p = r.product;
  return (
    <li>
      <Card
        padding="sm"
        tabIndex={0}
        role="button"
        aria-label={`Ver ficha de ${p.name} ${p.conc}`}
        onClick={() => onOpen(p.id)}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen(p.id);
          }
        }}
        className={cn("cursor-pointer transition-colors duration-[var(--dur-fast)] hover:bg-subtle focus-visible:outline-2 focus-visible:outline-brand", stag >= 0 && "animate-stagger-in")}
        style={stag >= 0 ? stagger(stag) : undefined}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <NameLine p={p} />
            <ProductMeta p={p} expired={r.expired} />
          </div>
          {canEdit && <EditButton p={p} onEdit={onEdit} />}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold tabular-nums">{stockLabel(p, r.stock)}</span>
            <StatusChip row={r} multi={multi} names={names} />
          </div>
          <Expiry r={r} now={now} thresholds={thresholds} />
        </div>
        {multi && (
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-caption">
            {branchIds.map((b) => {
              const v = r.perBranch[b] ?? 0;
              return (
                <div key={b} className="flex justify-between gap-2">
                  <dt className="text-muted">{names[b] ?? b}</dt>
                  <dd className={cn("tabular-nums", BRANCH_STOCK_CLASS[branchStockTone(v, r.low.includes(b))])}>{v === 0 ? "—" : stockLabel(p, v)}</dd>
                </div>
              );
            })}
          </dl>
        )}
        <dl className="mt-3 flex justify-between gap-3 border-t border-line-soft pt-2 text-caption text-muted">
          <div>
            <dt>{multi ? "Valor costo" : `Valor costo · mín. ${fmtInt(minFor(p, operating))}`}</dt>
            <dd className="text-small font-semibold tabular-nums text-fg">{soles(r.valueCost)}</dd>
          </div>
          <div className="text-right">
            <dt>Precio u.</dt>
            <dd className="text-small font-semibold tabular-nums text-fg">{soles(p.priceUnit)}</dd>
          </div>
        </dl>
      </Card>
    </li>
  );
});

/** Cifra del resumen. La grande (`strong`) usa el color de la botica; las demás pueden ser filtros rápidos (`onClick`). */
export function Kpi({ icon: Icon, label, value, hint, strong, valueClass, loading, active, onClick }: { icon: LucideIcon; label: string; value: string; hint?: string; strong?: boolean; valueClass?: string; loading?: boolean; active?: boolean; onClick?: () => void }) {
  const ref = useValuePulse<HTMLParagraphElement>(value);
  const body = (
    <>
      <p className={cn("flex items-center gap-2 text-caption font-semibold", strong ? "text-white/85" : "text-muted")}>
        <Icon className={cn("h-4 w-4 shrink-0", strong ? "text-accent" : "text-muted")} aria-hidden />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {active && <ListFilter className="h-3.5 w-3.5 shrink-0 text-brand" aria-hidden />}
      </p>
      {loading ? (
        <div className={cn("mt-2 animate-pulse rounded bg-sunken", strong ? "h-9 w-32 bg-white/20" : "h-6 w-20")} />
      ) : (
        <p ref={ref} className={cn("mt-2 w-fit max-w-full origin-left break-words font-semibold tracking-tight tabular-nums", strong ? "text-4xl" : "text-xl", valueClass)}>
          {value}
        </p>
      )}
      {hint && !loading && <p className={cn("mt-1 text-caption", strong ? "text-white/80" : "text-muted")}>{hint}</p>}
    </>
  );
  const base = "min-w-0 rounded-2xl border p-4 text-left";
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={!!active}
        className={cn(base, "border-line bg-surface transition-colors duration-[var(--dur-fast)] hover:bg-subtle", active && "border-brand ring-1 ring-brand")}
      >
        {body}
      </button>
    );
  }
  return <div className={cn(base, strong ? "col-span-2 border-transparent bg-brand p-5 text-white lg:col-span-1" : "border-line bg-surface")}>{body}</div>;
}
