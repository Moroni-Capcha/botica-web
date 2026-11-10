"use client";

import { memo } from "react";
import Link from "next/link";
import { ArrowLeftRight, Pill, Snowflake, TrendingUp } from "lucide-react";
import type { Lot, PresentationId, Product } from "@/lib/api/types";
import { daysUntil, presentationsOf, stockLabel, DEFAULT_THRESHOLDS } from "@/lib/domain/pharmacy";
import { ExpiryBadge, RxBadge } from "@/components/ui/badges";
import { Card } from "@/components/ui/card";
import { Chip, chipClass } from "@/components/ui/chip";
import { hitArea } from "@/components/ui/icon-button";
import { pickPrimaryPresentation } from "./primary-presentation";
import { soles } from "@/lib/format";
import { cn } from "@/lib/cn";
import { stagger } from "@/lib/motion";

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
  /** Posición en la primera carga del catálogo: solo esas tarjetas entran escalonadas. */
  introIndex?: number;
}

export const ProductCard = memo(function ProductCard({ product: p, stock, minStock, nextLot, hasExpiredOnly, otherBranch, sellFirst, now, onAdd, introIndex }: ProductCardProps) {
  const days = nextLot ? daysUntil(nextLot.expiresOn, now) : null;
  const low = stock > 0 && stock <= minStock;
  const presentations = presentationsOf(p);
  const main = pickPrimaryPresentation(presentations);
  return (
    <Card as="article" padding="sm" className={cn(sellFirst && "border-danger-border", introIndex !== undefined && "animate-stagger-in")} style={introIndex !== undefined ? stagger(introIndex) : undefined}>
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sunken text-muted">
          {p.coldChain ? <Snowflake className="h-5 w-5 text-info-fg" role="img" aria-label="Cadena de frío" /> : <Pill className="h-5 w-5" aria-hidden />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="text-base font-semibold leading-tight">{p.name}</h3>
            <span className="text-sm font-medium text-fg-2">{p.conc}</span>
            <RxBadge rx={p.rx} />
          </div>
          <p className="mt-0.5 truncate text-caption text-muted">
            {p.active !== "—" ? `${p.active} · ` : ""}
            {p.form} · {p.lab} · Ubic. {p.location}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Chip tone={stock === 0 ? "neutral" : low ? "warning" : "neutral"} solid={stock === 0}>
              {stock === 0 ? (hasExpiredOnly ? "Solo stock vencido" : "Agotado") : `Stock ${stockLabel(p, stock)}`}
            </Chip>
            {days !== null && <ExpiryBadge days={days} short />}
            {nextLot && nextLot.discount > 0 && <Chip tone="danger" solid className="font-bold">-{Math.round(nextLot.discount * 100)} %</Chip>}
            {sellFirst && days !== null && days <= DEFAULT_THRESHOLDS.yellow && (
              <Chip tone="danger" ring>
                <TrendingUp className="h-3 w-3" aria-hidden />
                Vender primero
              </Chip>
            )}
            {stock === 0 && otherBranch && otherBranch.units > 0 && (
              <Link href={`/traslados?from=${otherBranch.id}&to=${otherBranch.toId}&productId=${p.id}`} className={cn(chipClass("special", { ring: true }), hitArea, "transition-colors duration-[var(--dur-fast)] hover:bg-special-border")}>
                <ArrowLeftRight className="h-3 w-3" aria-hidden />
                {stockLabel(p, otherBranch.units)} en {otherBranch.name} · pedir traslado
              </Link>
            )}
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-stretch gap-1.5">
        {presentations.map((ps) => {
          const primary = ps.id === main?.id;
          const blocked = stock < ps.units;
          const why = stock === 0 ? "Sin stock vigente en este local" : `Solo quedan ${stockLabel(p, stock)}: no alcanza para ${ps.label}`;
          return (
            <button
              key={ps.id}
              type="button"
              disabled={blocked}
              onClick={(e) => onAdd(p, ps.id, e.currentTarget)}
              title={blocked ? why : undefined}
              className={cn(
                "flex flex-col items-start justify-center rounded-xl border text-left transition-[transform,opacity,border-color,background-color] duration-[var(--dur-fast)] ease-[var(--ease-out)] active:scale-[0.97]",
                "disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100",
                primary
                  ? "min-h-14 min-w-[9rem] flex-[2_1_9rem] border-brand-ink/25 bg-brand/5 px-3.5 py-2 enabled:hover:border-brand-ink/60 enabled:hover:bg-brand/10"
                  : "min-h-12 min-w-24 flex-1 self-end border-line px-3 py-1.5 enabled:hover:border-brand-ink/40 enabled:hover:bg-subtle",
              )}
              aria-label={blocked ? `${ps.label} de ${p.name}: ${why}` : `Agregar ${ps.label} de ${p.name} a ${soles(ps.price)}`}
            >
              <span className={cn("text-micro font-medium", primary ? "text-fg-2" : "text-muted")}>{ps.label}</span>
              <span className={cn("tabular-nums", primary ? "text-lg font-semibold leading-tight text-fg" : "text-sm font-medium text-fg-2")}>{soles(ps.price)}</span>
            </button>
          );
        })}
      </div>
    </Card>
  );
});
