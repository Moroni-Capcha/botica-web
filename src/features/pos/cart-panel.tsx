"use client";

import { Banknote, Box, Minus, Plus, ScanBarcode, ShoppingCart, Sparkles, Stethoscope, Trash2, X } from "lucide-react";
import type { Customer, Product } from "@/lib/api/types";
import type { CartLine, Totals } from "@/lib/domain/pharmacy";
import { Button } from "@/components/ui/button";
import { RxBadge } from "@/components/ui/badges";
import { Empty } from "@/components/ui/empty";
import { CustomerPicker } from "./customer-picker";
import { dateShort, soles } from "@/lib/format";

interface CartPanelProps {
  lines: CartLine[];
  totals: Totals;
  customer: Customer | null;
  onCustomer: (c: Customer | null) => void;
  onQty: (key: string, qty: number) => void;
  onClear: () => void;
  onCharge: () => void;
  canCharge: boolean;
  cashOpen: boolean;
  equivalents: { base: Product; options: Product[] } | null;
  onAddEquivalent: (p: Product) => void;
  onClose?: () => void;
}

export function CartPanel({ lines, totals, customer, onCustomer, onQty, onClear, onCharge, canCharge, cashOpen, equivalents, onAddEquivalent, onClose }: CartPanelProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-zinc-100 px-4 py-3">
        <ShoppingCart className="h-4 w-4 text-zinc-500" />
        <p className="flex-1 text-sm font-semibold">Venta actual</p>
        {lines.length > 0 && (
          <button type="button" onClick={onClear} className="text-xs font-medium text-zinc-500 hover:text-rose-600">
            Vaciar
          </button>
        )}
        {onClose && (
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-zinc-500 hover:bg-zinc-100 lg:hidden" aria-label="Cerrar venta">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="border-b border-zinc-100 px-4 py-2.5">
        <CustomerPicker customer={customer} onChange={onCustomer} />
        {customer && <p className="mt-1.5 text-[11px] text-zinc-500">{customer.points} puntos</p>}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {lines.length === 0 ? (
          <Empty icon={ScanBarcode} title="Escanea o busca un producto">
            Busca por nombre, principio activo, laboratorio o código de barras. Enter agrega una unidad.
          </Empty>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {lines.map((l) => (
              <li key={l.key} className="px-4 py-3">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold leading-tight">
                      {l.product.name} <span className="font-normal text-zinc-500">{l.product.conc}</span>
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
                      {l.pres.label} · {soles(l.pres.price)} <RxBadge rx={l.product.rx} />
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular-nums">{soles(l.total)}</p>
                    {l.discount > 0 && <p className="text-[11px] tabular-nums text-zinc-400 line-through">{soles(l.gross)}</p>}
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex items-center rounded-lg border border-zinc-200">
                    <button type="button" onClick={() => onQty(l.key, l.qty - 1)} className="grid h-8 w-8 place-items-center text-zinc-600 hover:bg-zinc-50" aria-label="Quitar uno">
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-8 text-center text-sm font-semibold tabular-nums" aria-live="polite">{l.qty}</span>
                    <button type="button" onClick={() => onQty(l.key, l.qty + 1)} className="grid h-8 w-8 place-items-center text-zinc-600 hover:bg-zinc-50" aria-label="Agregar uno">
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <span className="text-[11px] text-zinc-500">{l.units} unid.</span>
                  <button type="button" onClick={() => onQty(l.key, 0)} className="ml-auto rounded-lg p-1.5 text-zinc-400 hover:bg-rose-50 hover:text-rose-600" aria-label={`Quitar ${l.product.name}`}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-2 grid gap-1">
                  {l.alloc.map((a) => (
                    <p key={a.lotId} className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                      <Box className="h-3 w-3" /> Lote {a.code} · vence {dateShort(a.expiresOn)} · {a.units} u
                      {a.discount > 0 && <span className="rounded bg-rose-100 px-1 font-semibold text-rose-700">-{Math.round(a.discount * 100)} %</span>}
                    </p>
                  ))}
                  {l.missing > 0 && <p className="text-[11px] font-semibold text-rose-600">Faltan {l.missing} unidades en este local</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
        {equivalents && equivalents.options.length > 0 && (
          <div className="m-3 rounded-xl border border-dashed border-emerald-300 bg-emerald-50/60 p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
              <Sparkles className="h-3.5 w-3.5" /> Mismo principio activo ({equivalents.base.active} {equivalents.base.conc})
            </p>
            <ul className="mt-2 grid gap-1.5">
              {equivalents.options.map((x) => (
                <li key={x.id} className="flex items-center gap-2 text-xs">
                  <span className="min-w-0 flex-1 truncate">
                    <b>{x.name}</b> · {x.lab}
                  </span>
                  <span className="tabular-nums text-zinc-600">{soles(x.priceUnit)} c/u</span>
                  <button type="button" onClick={() => onAddEquivalent(x)} className="rounded-md bg-white px-2 py-1 font-semibold text-emerald-800 shadow-sm hover:bg-emerald-100">
                    Agregar
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="border-t border-zinc-200 bg-zinc-50/70 px-4 py-3">
        {totals.needsRx && (
          <p className="mb-2 flex items-center gap-1.5 rounded-lg bg-sky-50 px-2.5 py-1.5 text-[11px] font-medium text-sky-800">
            <Stethoscope className="h-3.5 w-3.5" />
            {totals.needsControlled ? "Incluye un controlado: se pedirá la receta especial." : "Incluye productos con receta: se registrará la receta al cobrar."}
          </p>
        )}
        <dl className="grid gap-1 text-sm">
          <div className="flex justify-between text-zinc-600">
            <dt>Subtotal</dt>
            <dd className="tabular-nums">{soles(totals.subtotal)}</dd>
          </div>
          {totals.savings > 0 && (
            <div className="flex justify-between text-rose-600">
              <dt>Descuento por vencimiento</dt>
              <dd className="tabular-nums">−{soles(totals.savings)}</dd>
            </div>
          )}
          <div className="flex justify-between text-xs text-zinc-500">
            <dt>Op. gravada {soles(totals.taxBase)} · IGV 18 %</dt>
            <dd className="tabular-nums">{soles(totals.igv)}</dd>
          </div>
          <div className="mt-1 flex items-end justify-between">
            <dt className="text-sm font-semibold">Total</dt>
            <dd className="text-2xl font-semibold tracking-tight tabular-nums">{soles(totals.total)}</dd>
          </div>
        </dl>
        <Button variant="primary" size="lg" className="mt-3 w-full" disabled={!canCharge} onClick={onCharge}>
          <Banknote className="h-5 w-5" /> Cobrar {lines.length ? soles(totals.total) : ""}
        </Button>
        {!cashOpen && <p className="mt-2 text-center text-[11px] text-amber-700">La caja está cerrada. Ábrela arriba para poder cobrar.</p>}
      </div>
    </div>
  );
}
