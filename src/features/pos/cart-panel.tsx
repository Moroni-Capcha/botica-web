"use client";

import { memo, useId, useRef } from "react";
import { Banknote, Box, Minus, Plus, ScanBarcode, ShoppingCart, Sparkles, Stethoscope, Trash2, X } from "lucide-react";
import type { Customer, Product } from "@/lib/api/types";
import type { CartLine, Totals } from "@/lib/domain/pharmacy";
import { Button } from "@/components/ui/button";
import { RxBadge } from "@/components/ui/badges";
import { Empty } from "@/components/ui/empty";
import { Chip, chipClass } from "@/components/ui/chip";
import { hitArea, IconButton } from "@/components/ui/icon-button";
import { CustomerPicker } from "./customer-picker";
import { dateShort, soles } from "@/lib/format";
import { cn } from "@/lib/cn";
import { useAnimatedList } from "@/lib/use-animated-list";
import { useValuePulse } from "@/lib/use-value-pulse";
import { useFlipList } from "@/lib/use-flip-list";
import { stagger } from "@/lib/motion";

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
  /** Lo que el cliente suele llevar (ya sin lo que está en el carrito ni lo agotado). Vacío: no se muestra la fila. */
  usual?: Product[];
  onAddUsual?: (p: Product, el: HTMLElement) => void;
  onClose?: () => void;
  /** Id para el título cuando el panel va dentro de la hoja (la nombra como diálogo). */
  titleId?: string;
  /** Las líneas que ya estaban entran escalonadas (para la hoja del móvil, que se arma al abrirla). */
  staggerLines?: boolean;
}

export const CartPanel = memo(function CartPanel({ lines, totals, customer, onCustomer, onQty, onClear, onCharge, canCharge, writable = true, cashOpen, equivalents, onAddEquivalent, usual = [], onAddUsual, onClose, titleId, staggerLines }: CartPanelProps) {
  const usualId = useId();
  const rows = useAnimatedList(lines);
  const listRef = useRef<HTMLUListElement>(null);
  useFlipList(listRef, rows);
  const totalRef = useValuePulse<HTMLSpanElement>(totals.total);
  const chargeRef = useValuePulse<HTMLSpanElement>(totals.total);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-line-soft px-4 py-3">
        <ShoppingCart className="h-4 w-4 text-muted" aria-hidden />
        <p id={titleId} className="flex-1 text-sm font-semibold">Venta actual</p>
        {lines.length > 0 && (
          <button type="button" onClick={onClear} className={cn(hitArea, "rounded text-xs font-medium text-muted transition-colors duration-[var(--dur-fast)] hover:text-danger-fg")}>
            Vaciar
          </button>
        )}
        {onClose && (
          <IconButton size="xs" data-autofocus onClick={onClose} className="lg:hidden" aria-label="Cerrar venta">
            <X className="h-4 w-4" aria-hidden />
          </IconButton>
        )}
      </div>
      <div className="border-b border-line-soft px-4 py-2.5">
        <CustomerPicker customer={customer} onChange={onCustomer} />
        {customer && <p className="mt-1.5 text-micro text-muted">{customer.points} puntos</p>}
        {customer && onAddUsual && usual.length > 0 && (
          <div role="group" aria-labelledby={usualId} className="mt-2">
            <p id={usualId} className="text-micro font-semibold text-muted">Suele llevar</p>
            <ul className="mt-1 flex flex-wrap gap-2">
              {usual.map((p, i) => (
                <li key={p.id} className="animate-stagger-in" style={stagger(i)}>
                  <button
                    type="button"
                    onClick={(e) => onAddUsual(p, e.currentTarget)}
                    aria-label={`Agregar ${p.name} ${p.conc} al carrito`}
                    className={cn(chipClass("neutral", { ring: true }), hitArea, "max-w-full gap-1.5 whitespace-normal py-1.5 text-left text-xs transition-colors duration-[var(--dur-fast)] hover:bg-line-soft")}
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden />
                    {p.name} <span className="font-normal text-muted">{p.conc}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <>
            <Empty icon={ScanBarcode} title="Escanea o busca un producto">
              Busca por nombre, principio activo, laboratorio o código de barras.
            </Empty>
            <p className="-mt-6 pb-8 text-center text-caption text-muted">F2 para buscar · Enter para agregar</p>
          </>
        ) : (
          <ul ref={listRef} className="divide-y divide-line-soft">
            {rows.map(({ key, item, exiting, isNew }, idx) => (
              <CartLineRow key={key} line={item} exiting={exiting} isNew={isNew} intro={staggerLines && !isNew && !exiting && idx < 6 ? idx : undefined} onQty={onQty} />
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
            <dd className="text-2xl font-semibold tracking-tight tabular-nums">
              <span ref={totalRef} className="inline-block origin-right">{soles(totals.total)}</span>
            </dd>
          </div>
        </dl>
        <Button variant="primary" size="lg" className="mt-3 w-full" disabled={!canCharge} onClick={onCharge}>
          <Banknote className="h-5 w-5" aria-hidden /> Cobrar{" "}
          {lines.length > 0 && <span ref={chargeRef} className="inline-block tabular-nums">{soles(totals.total)}</span>}
        </Button>
        {!writable && <p className="mt-2 text-center text-micro text-danger-fg">Tu cuenta está en solo lectura. No se puede cobrar.</p>}
        {!cashOpen && <p className="mt-2 text-center text-micro text-warning-fg">La caja está cerrada. Ábrela arriba para poder cobrar.</p>}
      </div>
    </div>
  );
});

interface CartLineRowProps {
  line: CartLine;
  exiting: boolean;
  isNew: boolean;
  /** Posición para la entrada escalonada (solo la hoja del móvil); sin valor, no se escalona. */
  intro: number | undefined;
  onQty: (key: string, qty: number) => void;
}

/**
 * Una línea del carrito. Con `memo` y `onQty` estable, escribir en el buscador o cambiar otra línea no la vuelve a pintar.
 * La salida es solo opacidad + translate3d; el resto de la lista sube con FLIP (`useFlipList`), nunca animando alto ni márgenes.
 */
const CartLineRow = memo(function CartLineRow({ line, exiting, isNew, intro, onQty }: CartLineRowProps) {
  return (
    <li
      data-flip-key={line.key}
      inert={exiting}
      aria-hidden={exiting || undefined}
      className={cn(
        "transition-[opacity,transform] duration-[var(--dur-fast)] ease-[var(--ease-out)]",
        exiting && "will-change-[transform,opacity] opacity-0 [transform:translate3d(-12px,0,0)]",
        isNew && "animate-line-in",
        intro !== undefined && "animate-stagger-in",
      )}
      style={intro !== undefined ? stagger(intro) : undefined}
    >
      <div className="px-4 py-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-tight">
              {line.product.name} <span className="font-normal text-muted">{line.product.conc}</span>
            </p>
            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
              {line.pres.label} · {soles(line.pres.price)} <RxBadge rx={line.product.rx} />
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold tabular-nums">{soles(line.total)}</p>
            {line.discount > 0 && <p className="text-micro tabular-nums text-muted line-through">{soles(line.gross)}</p>}
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-line">
            <IconButton size="sm" onClick={() => onQty(line.key, line.qty - 1)} className="rounded-r-none text-fg-2" aria-label="Quitar uno">
              <Minus className="h-3.5 w-3.5" aria-hidden />
            </IconButton>
            <span className="w-8 text-center text-sm font-semibold tabular-nums" aria-live="polite">{line.qty}</span>
            <IconButton size="sm" onClick={() => onQty(line.key, line.qty + 1)} className="rounded-l-none text-fg-2" aria-label="Agregar uno">
              <Plus className="h-3.5 w-3.5" aria-hidden />
            </IconButton>
          </div>
          <span className="text-micro text-muted">{line.units} unid.</span>
          <IconButton size="sm" tone="danger" onClick={() => onQty(line.key, 0)} className="ml-auto" aria-label={`Quitar ${line.product.name}`}>
            <Trash2 className="h-4 w-4" aria-hidden />
          </IconButton>
        </div>
        <div className="mt-2 grid gap-1">
          {line.alloc.map((a) => (
            <p key={a.lotId} className="flex items-center gap-1.5 text-micro text-muted">
              <Box className="h-3 w-3" aria-hidden /> Lote {a.code} · vence {dateShort(a.expiresOn)} · {a.units} u
              {a.discount > 0 && <Chip tone="danger" className="rounded px-1 py-0">-{Math.round(a.discount * 100)} %</Chip>}
            </p>
          ))}
          {line.missing > 0 && <p className="text-micro font-semibold text-danger-fg">Faltan {line.missing} unidades en este local</p>}
        </div>
      </div>
    </li>
  );
});
