"use client";

import { memo } from "react";
import Link from "next/link";
import { ArrowLeftRight, Pill, Snowflake, TrendingUp } from "lucide-react";
import type { Lot, PresentationId, Product } from "@/lib/api/types";
import { daysUntil, presentationsOf, stockLabel, DEFAULT_THRESHOLDS } from "@/lib/domain/pharmacy";
import { ExpiryBadge, RxBadge } from "@/components/ui/badges";
import { soles } from "@/lib/format";
import { cn } from "@/lib/cn";

export interface ProductCardProps {
  product: Product;
  stock: number; // unidades vigentes en este local
  minStock: number; // mínimo de este local
  nextLot: Lot | undefined; // el que sale primero (FEFO)
  hasExpiredOnly: boolean;
  /** Otro local con stock de este producto (el que más tiene) */
  otherBranch: { id: string; name: string; units: number; toId: string } | null;
  sellFirst: boolean;
  now: number;
  onAdd: (product: Product, presentation: PresentationId, el: HTMLButtonElement) => void;
}

export const ProductCard = memo(function ProductCard({ product: p, stock, minStock, nextLot, hasExpiredOnly, otherBranch, sellFirst, now, onAdd }: ProductCardProps) {
  const days = nextLot ? daysUntil(nextLot.expiresOn, now) : null;
  const low = stock > 0 && stock <= minStock;
  return (
    <article className={cn("rounded-2xl border bg-white p-3.5", sellFirst ? "border-rose-200" : "border-zinc-200")}>
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-zinc-100 text-zinc-500">
          {p.coldChain ? <Snowflake className="h-5 w-5 text-sky-600" aria-label="Cadena de frío" /> : <Pill className="h-5 w-5" aria-hidden />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="text-sm font-semibold leading-tight">{p.name}</h3>
            <span className="text-sm text-zinc-500">{p.conc}</span>
            <RxBadge rx={p.rx} />
          </div>
          <p className="mt-0.5 truncate text-xs text-zinc-500">
            {p.active !== "—" ? `${p.active} · ` : ""}
            {p.form} · {p.lab} · Ubic. {p.location}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", stock === 0 ? "bg-zinc-900 text-white" : low ? "bg-amber-100 text-amber-800" : "bg-zinc-100 text-zinc-600")}>
              {stock === 0 ? (hasExpiredOnly ? "Solo stock vencido" : "Agotado") : `Stock ${stockLabel(p, stock)}`}
            </span>
            {days !== null && <ExpiryBadge days={days} short />}
            {nextLot && nextLot.discount > 0 && <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[11px] font-bold text-white">-{Math.round(nextLot.discount * 100)} %</span>}
            {sellFirst && days !== null && days <= DEFAULT_THRESHOLDS.yellow && (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 ring-1 ring-rose-200">
                <TrendingUp className="h-3 w-3" />
                Vender primero
              </span>
            )}
            {stock === 0 && otherBranch && otherBranch.units > 0 && (
              <Link href={`/traslados?from=${otherBranch.id}&to=${otherBranch.toId}&productId=${p.id}`} className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700 ring-1 ring-violet-200 hover:bg-violet-100">
                <ArrowLeftRight className="h-3 w-3" />
                {stockLabel(p, otherBranch.units)} en {otherBranch.name} · pedir traslado
              </Link>
            )}
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {presentationsOf(p).map((ps) => (
          <button
            key={ps.id}
            type="button"
            disabled={stock < ps.units}
            onClick={(e) => onAdd(p, ps.id, e.currentTarget)}
            className="flex min-w-[96px] flex-1 flex-col items-start rounded-xl border border-zinc-200 px-3 py-1.5 text-left transition hover:border-zinc-400 hover:bg-zinc-50 active:scale-[0.98] disabled:opacity-40"
            aria-label={`Agregar ${ps.label} de ${p.name} a ${soles(ps.price)}`}
          >
            <span className="text-[11px] font-medium text-zinc-500">{ps.label}</span>
            <span className="text-sm font-semibold tabular-nums">{soles(ps.price)}</span>
          </button>
        ))}
      </div>
    </article>
  );
});
