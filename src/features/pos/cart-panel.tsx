"use client";

import { Banknote, Box, Minus, Plus, ScanBarcode, ShoppingCart, Sparkles, Stethoscope, Trash2, X } from "lucide-react";
import type { Customer, Product } from "@/lib/api/types";
import type { CartLine, Totals } from "@/lib/domain/pharmacy";
import { Button } from "@/components/ui/button";
import { RxBadge } from "@/components/ui/badges";
import { Empty } from "@/components/ui/empty";
import { Chip } from "@/components/ui/chip";
import { hitArea, IconButton } from "@/components/ui/icon-button";
import { CustomerPicker } from "./customer-picker";
import { dateShort, soles } from "@/lib/format";
import { cn } from "@/lib/cn";

interface CartPanelProps {
  lines: CartLine[];
  totals: Totals;
  customer: Customer | null;
  onCustomer: (c: Customer | null) => void;
  onQty: (key: string, qty: number) => void;
  onClear: () => void;
  onCharge: () => void;
  canCharge: boolean;
  writable?: boolean;
  cashOpen: boolean;
  equivalents: { base: Product; options: Product[] } | null;
  onAddEquivalent: (p: Product) => void;
  onClose?: () => void;
}

export function CartPanel({ lines, totals, customer, onCustomer, onQty, onClear, onCharge, canCharge, writable = true, cashOpen, equivalents, onAddEquivalent, onClose }: CartPanelProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-line-soft px-4 py-3">
        <ShoppingCart className="h-4 w-4 text-muted" aria-hidden />
        <p className="flex-1 text-sm font-semibold">Venta actual</p>
        {lines.length > 0 && (
          <button type="button" onClick={onClear} className={cn(hitArea, "rounded text-xs font-medium text-muted transition-colors duration-[var(--dur-fast)] hover:text-danger-fg")}>
            Vaciar
          </button>
        )}
        {onClose && (
          <IconButton size="xs" onClick={onClose} className="lg:hidden" aria-label="Cerrar venta">
            <X className="h-4 w-4" aria-hidden />
          </IconButton>
        )}
      </div>
      <div className="border-b border-line-soft px-4 py-2.5">
        <CustomerPicker customer={customer} onChange={onCustomer} />
        {customer && <p className="mt-1.5 text-micro text-muted">{customer.points} puntos</p>}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {lines.length === 0 ? (
          <Empty icon={ScanBarcode} title="Escanea o busca un producto">
            Busca por nombre, principio activo, laboratorio o código de barras. Enter agrega una unidad.
          </Empty>
        ) : (
          <ul className="divide-y divide-line-soft">
            {lines.map((l) => (
              <li key={l.key} className="px-4 py-3">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold leading-tight">
                      {l.product.name} <span className="font-normal text-muted">{l.product.conc}</span>
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                      {l.pres.label} · {soles(l.pres.price)} <RxBadge rx={l.product.rx} />
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular-nums">{soles(l.total)}</p>
                    {l.discount > 0 && <p className="text-micro tabular-nums text-muted line-through">{soles(l.gross)}</p>}
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex items-center rounded-lg border border-line">
                    <IconButton size="sm" onClick={() => onQty(l.key, l.qty - 1)} className="rounded-r-none text-fg-2" aria-label="Quitar uno">
                      <Minus className="h-3.5 w-3.5" aria-hidden />
                    </IconButton>
                    <span className="w-8 text-center text-sm font-semibold tabular-nums" aria-live="polite">{l.qty}</span>
                    <IconButton size="sm" onClick={() => onQty(l.key, l.qty + 1)} className="rounded-l-none text-fg-2" aria-label="Agregar uno">
                      <Plus className="h-3.5 w-3.5" aria-hidden />
                    </IconButton>
                  </div>
                  <span className="text-micro text-muted">{l.units} unid.</span>
                  <IconButton size="sm" tone="danger" onClick={() => onQty(l.key, 0)} className="ml-auto" aria-label={`Quitar ${l.product.name}`}>
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </IconButton>
                </div>
                <div className="mt-2 grid gap-1">
                  {l.alloc.map((a) => (
                    <p key={a.lotId} className="flex items-center gap-1.5 text-micro text-muted">
                      <Box className="h-3 w-3" aria-hidden /> Lote {a.code} · vence {dateShort(a.expiresOn)} · {a.units} u
                      {a.discount > 0 && <Chip tone="danger" className="rounded px-1 py-0">-{Math.round(a.discount * 100)} %</Chip>}
                    </p>
                  ))}
                  {l.missing > 0 && <p className="text-micro font-semibold text-danger-fg">Faltan {l.missing} unidades en este local</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
        {equivalents && equivalents.options.length > 0 && (
          <div className="m-3 rounded-xl border border-dashed border-success-border bg-success-bg/60 p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-success-fg">
              <Sparkles className="h-3.5 w-3.5" aria-hidden /> Mismo principio activo ({equivalents.base.active} {equivalents.base.conc})
            </p>
            <ul className="mt-2 grid gap-1.5">
              {equivalents.options.map((x) => (
                <li key={x.id} className="flex items-center gap-2 text-xs">
                  <span className="min-w-0 flex-1 truncate">
                    <b>{x.name}</b> · {x.lab}
                  </span>
                  <span className="tabular-nums text-fg-2">{soles(x.priceUnit)} c/u</span>
                  <button type="button" onClick={() => onAddEquivalent(x)} className={cn(hitArea, "rounded-md bg-surface px-2 py-1 font-semibold text-success-fg shadow-subtle transition-colors duration-[var(--dur-fast)] hover:bg-success-bg")}>
                    Agregar
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="border-t border-line bg-subtle px-4 py-3">
        {totals.needsRx && (
          <p className="mb-2 flex items-center gap-1.5 rounded-lg bg-info-bg px-2.5 py-1.5 text-micro font-medium text-info-fg">
            <Stethoscope className="h-3.5 w-3.5" aria-hidden />
            {totals.needsControlled ? "Incluye un controlado: se pedirá la receta especial." : "Incluye productos con receta: se registrará la receta al cobrar."}
          </p>
        )}
        <dl className="grid gap-1 text-sm">
          <div className="flex justify-between text-fg-2">
            <dt>Subtotal</dt>
            <dd className="tabular-nums">{soles(totals.subtotal)}</dd>
          </div>
          {totals.savings > 0 && (
            <div className="flex justify-between text-danger-fg">
              <dt>Descuento por vencimiento</dt>
              <dd className="tabular-nums">−{soles(totals.savings)}</dd>
            </div>
          )}
          <div className="flex justify-between text-xs text-muted">
            <dt>Op. gravada {soles(totals.taxBase)} · IGV 18 %</dt>
            <dd className="tabular-nums">{soles(totals.igv)}</dd>
          </div>
          <div className="mt-1 flex items-end justify-between">
            <dt className="text-sm font-semibold">Total</dt>
            <dd className="text-2xl font-semibold tracking-tight tabular-nums">{soles(totals.total)}</dd>
          </div>
        </dl>
        <Button variant="primary" size="lg" className="mt-3 w-full" disabled={!canCharge} onClick={onCharge}>
          <Banknote className="h-5 w-5" aria-hidden /> Cobrar {lines.length ? soles(totals.total) : ""}
        </Button>
        {!writable && <p className="mt-2 text-center text-micro text-danger-fg">Tu cuenta está en solo lectura. No se puede cobrar.</p>}
        {!cashOpen && <p className="mt-2 text-center text-micro text-warning-fg">La caja está cerrada. Ábrela arriba para poder cobrar.</p>}
      </div>
    </div>
  );
}
