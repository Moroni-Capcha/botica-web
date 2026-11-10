"use client";

import { memo, type ReactNode } from "react";
import { AlarmClock, ChevronRight, Clock, Pencil, Phone, Truck, User } from "lucide-react";
import type { Product, Purchase, Supplier } from "@/lib/api/types";
import type { OrderSuggestion } from "@/lib/domain/purchasing";
import { stockLabel } from "@/lib/domain/pharmacy";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { IconButton } from "@/components/ui/icon-button";
import { rowButtonClass, td } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { dateShort, soles, timeShort } from "@/lib/format";

const fmtInt = (n: number) => n.toLocaleString("es-PE");

/** Cobertura del stock: si es corta, tono + icono + texto (el color nunca va solo). */
function Cover({ cover }: { cover: number }) {
  const text = Number.isFinite(cover) ? `${Math.floor(cover)} días` : "—";
  if (cover < 3) {
    return (
      <Chip tone="danger">
        <AlarmClock className="h-3 w-3 shrink-0" aria-hidden /> {text}
      </Chip>
    );
  }
  if (cover < 7) {
    return (
      <Chip tone="warning">
        <Clock className="h-3 w-3 shrink-0" aria-hidden /> {text}
      </Chip>
    );
  }
  return <span>{text}</span>;
}

const orderQty = (s: OrderSuggestion) => (s.product.unitsPerBox > 1 ? `${s.packs} cj` : `${s.units} ${s.product.unitName}${s.units === 1 ? "" : "s"}`);

export interface SuggestionShared {
  suggestion: OrderSuggestion;
  checked: boolean;
  multi: boolean;
  branchName: (id: string) => string;
  onToggle: () => void;
}

/** Fila del pedido sugerido (tabla ancha). */
export const SuggestionRow = memo(function SuggestionRow({ suggestion: s, checked, multi, branchName, onToggle }: SuggestionShared) {
  return (
    <tr className={checked ? "bg-subtle" : "hover:bg-subtle"}>
      <td className={td}>
        <input type="checkbox" checked={checked} onChange={onToggle} className="h-4 w-4 accent-[var(--brand)]" aria-label={`Elegir ${s.product.name} ${s.product.conc}`} />
      </td>
      <td className={td}>
        <p className="font-medium">
          {s.product.name} <span className="text-muted">{s.product.conc}</span>
        </p>
        <p className="text-xs text-muted">
          {s.product.lab} · mínimo {fmtInt(s.min)} unid.
        </p>
      </td>
      {multi && <td className={cn(td, "text-xs font-semibold")}>{branchName(s.branchId)}</td>}
      <td className={cn(td, "max-w-[220px] truncate text-xs text-fg-2")}>{s.supplier ?? "—"}</td>
      <td className={cn(td, "whitespace-nowrap text-right tabular-nums", s.stock === 0 && "font-semibold text-muted")}>{s.stock === 0 ? "Agotado" : stockLabel(s.product, s.stock)}</td>
      <td className={cn(td, "text-right tabular-nums")}>{s.rate.toLocaleString("es-PE", { maximumFractionDigits: 1 })}</td>
      <td className={cn(td, "whitespace-nowrap text-right tabular-nums")}>
        <Cover cover={s.cover} />
      </td>
      <td className={cn(td, "whitespace-nowrap text-right font-semibold tabular-nums")}>{orderQty(s)}</td>
      <td className={cn(td, "whitespace-nowrap text-right tabular-nums")}>{soles(s.cost)}</td>
    </tr>
  );
});

/** Tarjeta del pedido sugerido para pantallas angostas: mismos datos que la fila. */
export const SuggestionCard = memo(function SuggestionCard({ suggestion: s, checked, multi, branchName, onToggle }: SuggestionShared) {
  return (
    <li>
      <Card padding="sm" className={cn(checked && "border-brand-ink/40 bg-subtle")}>
        <label className="flex min-h-10 cursor-pointer items-start gap-3">
          <input type="checkbox" checked={checked} onChange={onToggle} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--brand)]" aria-label={`Elegir ${s.product.name} ${s.product.conc}`} />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-fg">
              {s.product.name} <span className="font-normal text-muted">{s.product.conc}</span>
            </span>
            <span className="block text-caption text-muted">
              {s.product.lab} · mínimo {fmtInt(s.min)} unid.
              {multi && ` · ${branchName(s.branchId)}`}
            </span>
            <span className="block text-caption text-muted">Proveedor: {s.supplier ?? "—"}</span>
          </span>
        </label>
        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-line-soft pt-2 text-caption text-muted">
          <div>
            <dt>Stock</dt>
            <dd className={cn("text-small font-semibold tabular-nums text-fg", s.stock === 0 && "text-muted")}>{s.stock === 0 ? "Agotado" : stockLabel(s.product, s.stock)}</dd>
          </div>
          <div className="text-right">
            <dt>Venta/día</dt>
            <dd className="text-small font-semibold tabular-nums text-fg">{s.rate.toLocaleString("es-PE", { maximumFractionDigits: 1 })}</dd>
          </div>
          <div>
            <dt>Alcanza</dt>
            <dd className="text-small font-semibold tabular-nums text-fg">
              <Cover cover={s.cover} />
            </dd>
          </div>
          <div className="text-right">
            <dt>Pedir</dt>
            <dd className="text-small font-semibold tabular-nums text-fg">{orderQty(s)}</dd>
          </div>
        </dl>
        <p className="mt-1 text-caption tabular-nums text-muted">Costo {soles(s.cost)}</p>
      </Card>
    </li>
  );
});

export interface PurchaseShared {
  purchase: Purchase;
  multi: boolean;
  branchName: (id: string) => string;
  onOpen: (p: Purchase) => void;
}

/** Fila de un ingreso (tabla ancha); se abre con clic o Enter. */
export const PurchaseRow = memo(function PurchaseRow({ purchase: p, multi, branchName, onOpen }: PurchaseShared) {
  return (
    <tr tabIndex={0} onClick={() => onOpen(p)} onKeyDown={(e) => e.key === "Enter" && onOpen(p)} className={rowButtonClass} aria-label={`Ver ingreso ${p.document}`}>
      <td className={cn(td, "whitespace-nowrap tabular-nums")}>
        {dateShort(p.receivedAt)} <span className="text-xs text-muted">{timeShort(p.receivedAt)}</span>
      </td>
      {multi && <td className={cn(td, "text-xs font-semibold")}>{branchName(p.branchId)}</td>}
      <td className={cn(td, "max-w-[260px] truncate")}>{p.supplierName}</td>
      <td className={cn(td, "tabular-nums text-fg-2")}>{p.document}</td>
      <td className={cn(td, "text-right tabular-nums")}>{p.items.length}</td>
      <td className={cn(td, "whitespace-nowrap text-right font-semibold tabular-nums")}>{soles(p.total)}</td>
      <td className={cn(td, "text-xs text-muted")}>{p.userName}</td>
      <td className={cn(td, "text-right")}>
        <ChevronRight className="ml-auto h-4 w-4 text-muted" aria-hidden />
      </td>
    </tr>
  );
});

/** Tarjeta de un ingreso para pantallas angostas. */
export const PurchaseCard = memo(function PurchaseCard({ purchase: p, multi, branchName, onOpen }: PurchaseShared) {
  return (
    <li>
      <Card
        padding="sm"
        tabIndex={0}
        role="button"
        aria-label={`Ver ingreso ${p.document}`}
        onClick={() => onOpen(p)}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen(p);
          }
        }}
        className="cursor-pointer transition-colors duration-[var(--dur-fast)] hover:bg-subtle focus-visible:outline-2 focus-visible:outline-brand-ink"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-fg">{p.supplierName}</p>
            <p className="text-caption tabular-nums text-muted">
              {p.document} · {dateShort(p.receivedAt)} {timeShort(p.receivedAt)}
            </p>
          </div>
          <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted" aria-hidden />
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-line-soft pt-2 text-caption text-muted">
          <div>
            <dt>Lotes</dt>
            <dd className="text-small font-semibold tabular-nums text-fg">{p.items.length}</dd>
          </div>
          <div className="text-right">
            <dt>Total</dt>
            <dd className="text-small font-semibold tabular-nums text-fg">{soles(p.total)}</dd>
          </div>
        </dl>
        <p className="mt-1 text-caption text-muted">
          Recibió {p.userName}
          {multi && ` · ${branchName(p.branchId)}`}
        </p>
      </Card>
    </li>
  );
});

/** Tarjeta de un proveedor con su contacto y lo comprado en el periodo. */
export const SupplierCard = memo(function SupplierCard({ supplier: s, purchases: ps, days, isAdmin, onEdit }: { supplier: Supplier; purchases: Purchase[]; days: number; isAdmin: boolean; onEdit: (s: Supplier) => void }) {
  return (
    <Card as="article" className={cn("grid gap-3", !s.active && "opacity-60")}>
      <header className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand-ink">
          <Truck className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold leading-tight">{s.name}</h3>
          <p className="text-xs tabular-nums text-muted">
            RUC {s.ruc}
            {!s.active && " · Inactivo"}
          </p>
        </div>
        {isAdmin && (
          <IconButton size="sm" onClick={() => onEdit(s)} aria-label={`Editar ${s.name}`}>
            <Pencil className="h-4 w-4" aria-hidden />
          </IconButton>
        )}
      </header>
      <dl className="grid gap-1.5 text-sm">
        <div className="flex items-center gap-2">
          <User className="h-3.5 w-3.5 text-muted" aria-hidden />
          <dt className="sr-only">Contacto</dt>
          <dd>{s.contact || "—"}</dd>
        </div>
        <div className="flex items-center gap-2">
          <Phone className="h-3.5 w-3.5 text-muted" aria-hidden />
          <dt className="sr-only">Teléfono</dt>
          <dd className="tabular-nums">
            {s.phone ? (
              <a href={`tel:${s.phone.replace(/\s/g, "")}`} className="inline-flex min-h-10 items-center hover:underline">
                {s.phone}
              </a>
            ) : (
              "—"
            )}
          </dd>
        </div>
        <div className="flex justify-between gap-2 border-t border-line-soft pt-2 text-xs">
          <dt className="text-muted">Visita</dt>
          <dd>{s.visitDays || "—"}</dd>
        </div>
        <div className="flex justify-between gap-2 text-xs">
          <dt className="text-muted">Compras · {days} días</dt>
          <dd className="tabular-nums">
            {ps.length} · {soles(ps.reduce((a, p) => a + p.total, 0))}
          </dd>
        </div>
      </dl>
    </Card>
  );
});

/** Líneas de un ingreso en tarjetas (detalle en pantallas angostas). */
export function PurchaseItemCard({ item: it, product, expiry }: { item: Purchase["items"][number]; product: Product | undefined; expiry: ReactNode }) {
  return (
    <li>
      <Card padding="sm">
        <p className="font-semibold text-fg">
          {product ? product.name : `Producto ${it.productId}`} <span className="font-normal text-muted">{product?.conc}</span>
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption tabular-nums text-muted">
          Lote {it.lotCode} · vence {dateShort(it.expiresOn)} {expiry}
        </p>
        <dl className="mt-2 grid grid-cols-3 gap-2 border-t border-line-soft pt-2 text-caption text-muted">
          <div>
            <dt>Unidades</dt>
            <dd className="text-small font-semibold tabular-nums text-fg">{fmtInt(it.units)}</dd>
          </div>
          <div>
            <dt>Costo u.</dt>
            <dd className="text-small font-semibold tabular-nums text-fg">{soles(it.unitCost)}</dd>
          </div>
          <div className="text-right">
            <dt>Subtotal</dt>
            <dd className="text-small font-semibold tabular-nums text-fg">{soles(it.subtotal)}</dd>
          </div>
        </dl>
      </Card>
    </li>
  );
}
