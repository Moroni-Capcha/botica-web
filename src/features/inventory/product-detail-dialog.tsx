"use client";

import { useMemo, useState } from "react";
import { Boxes, FileSpreadsheet, History, Pencil, Snowflake } from "lucide-react";
import type { Branch, BranchId, ExpiryThresholds, Lot, Pharmacy, Product } from "@/lib/api/types";
import { errorMessage } from "@/lib/api";
import { kardexBalances, kardexTotals, marginPct, minFor, MOVE_LABEL } from "@/lib/domain/inventory";
import { daysUntil, parseDay, presentationsOf, stockLabel } from "@/lib/domain/pharmacy";
import { useKardex } from "@/lib/queries";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty";
import { Segmented } from "@/components/ui/segmented";
import { Table, td } from "@/components/ui/table";
import { ExpiryBadge, RxBadge } from "@/components/ui/badges";
import { notify } from "@/components/ui/toast";
import { dateShort, soles, timeShort } from "@/lib/format";
import { cn } from "@/lib/cn";
import { exportKardex, RX_LABEL } from "./export";

const KARDEX_DAYS = [7, 30, 90] as const;
const fmtInt = (n: number) => n.toLocaleString("es-PE");

interface Props {
  product: Product;
  lots: Lot[];
  branchIds: BranchId[];
  branches: Branch[];
  scopeLabel: string;
  pharmacy: Pharmacy | undefined;
  thresholds: ExpiryThresholds;
  now: number;
  canEdit: boolean;
  onEdit: () => void;
  onClose: () => void;
}

/** Ficha del producto: stock por local, precios y margen, lotes en orden de salida y kardex. */
export function ProductDetailDialog({ product: p, lots, branchIds, branches, scopeLabel, pharmacy, thresholds, now, canEdit, onEdit, onClose }: Props) {
  const [days, setDays] = useState<(typeof KARDEX_DAYS)[number]>(30);
  const multi = branchIds.length > 1;
  const kardex = useKardex(p.id, multi ? null : (branchIds[0] ?? null), days);
  const name = (id: BranchId) => branches.find((b) => b.id === id)?.name ?? id;

  const productLots = useMemo(
    () => lots.filter((l) => l.productId === p.id && l.qty > 0 && branchIds.includes(l.branchId)).sort((a, b) => parseDay(a.expiresOn) - parseDay(b.expiresOn) || a.id - b.id),
    [lots, p.id, branchIds],
  );
  const vigente = (b: BranchId) => productLots.filter((l) => l.branchId === b && daysUntil(l.expiresOn, now) >= 0).reduce((s, l) => s + l.qty, 0);

  const { lines, opening } = useMemo(() => (kardex.data ? kardexBalances(kardex.data.entries, kardex.data.closing) : { lines: [], opening: 0 }), [kardex.data]);
  const totals = useMemo(() => kardexTotals(lines), [lines]);

  const doExport = () => {
    exportKardex({ product: p, lines, opening, days, scopeLabel, branches, pharmacy });
    notify("Kardex descargado");
  };

  return (
    <Dialog
      title={`${p.name} ${p.conc}`}
      description={`${p.active} · ${p.form} · ${p.lab} · RS ${p.sanitaryReg || "—"}`}
      onClose={onClose}
      size="xl"
      footer={
        <>
          <Button onClick={doExport} disabled={!kardex.data || lines.length === 0}>
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Exportar kardex
          </Button>
          {canEdit && (
            <Button variant="primary" onClick={onEdit}>
              <Pencil className="h-4 w-4" /> Editar producto
            </Button>
          )}
        </>
      }
    >
      <div className="grid gap-6">
        <div className="flex flex-wrap items-center gap-2">
          <RxBadge rx={p.rx} />
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-600">{p.category}</span>
          {p.coldChain && (
            <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
              <Snowflake className="h-3 w-3" /> 2–8 °C
            </span>
          )}
          <span className="text-xs text-zinc-500">Ubicación {p.location || "—"} · Código {p.barcode || "—"}</span>
        </div>

        <div className={cn("grid gap-3", multi ? "sm:grid-cols-4" : "sm:grid-cols-3")}>
          {branchIds.map((b) => {
            const st = vigente(b);
            const low = st <= minFor(p, b);
            return (
              <Stat key={b} label={`Stock ${name(b)}`} value={stockLabel(p, st)} hint={`Mínimo ${fmtInt(minFor(p, b))} unid.`} tone={st === 0 ? "dark" : low ? "amber" : undefined} />
            );
          })}
          <Stat label={`Vendido · ${days} días`} value={kardex.data ? `${fmtInt(totals.sold)} unid.` : "…"} hint={kardex.data ? `${(totals.sold / days).toLocaleString("es-PE", { maximumFractionDigits: 1 })} por día` : undefined} />
          <Stat label="Condición de venta" value={RX_LABEL[p.rx]} />
        </div>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Precios y margen</h3>
          <div className="grid gap-2 sm:grid-cols-3">
            {presentationsOf(p).map((ps) => {
              const m = marginPct(ps.price, ps.units, p.cost);
              return (
                <div key={ps.id} className="rounded-xl border border-zinc-200 p-3">
                  <p className="text-xs text-zinc-500">{ps.label}</p>
                  <p className="text-lg font-semibold tabular-nums">{soles(ps.price)}</p>
                  <p className="text-[11px] text-zinc-500">
                    Costo {soles(p.cost * ps.units)} sin IGV · margen <b className={m < 15 ? "text-rose-600" : "text-emerald-700"}>{m.toFixed(0)} %</b>
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Lotes en orden de salida (FEFO)</h3>
          <div className="overflow-hidden rounded-xl border border-zinc-200">
            {productLots.length === 0 ? (
              <Empty icon={Boxes} title="Sin lotes con stock" />
            ) : (
              <Table minWidth={620} head={["#", ...(multi ? ["Local"] : []), "Lote", "Vencimiento", { label: "Cantidad", align: "right" }, { label: "Costo u.", align: "right" }, "Descuento", "Proveedor"]}>
                {productLots.map((l, i) => (
                  <tr key={l.id}>
                    <td className={cn(td, "text-xs text-zinc-400")}>{i + 1}</td>
                    {multi && <td className={cn(td, "text-xs font-semibold")}>{name(l.branchId)}</td>}
                    <td className={cn(td, "tabular-nums")}>{l.code}</td>
                    <td className={td}>
                      <div className="flex items-center gap-2">
                        <span className="tabular-nums">{dateShort(l.expiresOn)}</span>
                        <ExpiryBadge days={daysUntil(l.expiresOn, now)} short thresholds={thresholds} />
                      </div>
                    </td>
                    <td className={cn(td, "text-right tabular-nums")}>{fmtInt(l.qty)}</td>
                    <td className={cn(td, "text-right tabular-nums")}>{soles(l.cost)}</td>
                    <td className={cn(td, "text-xs")}>{l.discount ? `-${Math.round(l.discount * 100)} %` : "—"}</td>
                    <td className={cn(td, "max-w-[180px] truncate text-xs text-zinc-500")}>{l.supplier ?? "—"}</td>
                  </tr>
                ))}
              </Table>
            )}
          </div>
        </section>

        <section>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Kardex (unidades)</h3>
            <Segmented label="Periodo del kardex" value={String(days)} onChange={(v) => setDays(Number(v) as (typeof KARDEX_DAYS)[number])} options={KARDEX_DAYS.map((d) => ({ id: String(d), label: `${d} días` }))} />
          </div>
          {kardex.data && (
            <p className="mb-2 text-xs text-zinc-500">
              Entradas <b className="tabular-nums text-emerald-700">{fmtInt(totals.inUnits)}</b> · Salidas <b className="tabular-nums text-zinc-800">{fmtInt(totals.outUnits)}</b> · Saldo inicial{" "}
              <b className="tabular-nums text-zinc-800">{fmtInt(opening)}</b> · Saldo actual <b className="tabular-nums text-zinc-800">{fmtInt(kardex.data.closing)}</b>
            </p>
          )}
          <div className="max-h-80 overflow-y-auto rounded-xl border border-zinc-200">
            {kardex.isLoading ? (
              <div className="grid gap-2 p-3">
                {Array.from({ length: 5 }, (_, i) => (
                  <div key={i} className="h-9 animate-pulse rounded-lg bg-zinc-100" />
                ))}
              </div>
            ) : kardex.error ? (
              <Empty icon={History} title="No se pudo cargar el kardex">
                {errorMessage(kardex.error)}
              </Empty>
            ) : lines.length === 0 ? (
              <Empty icon={History} title={`Sin movimientos en ${days} días`} />
            ) : (
              <Table minWidth={760} head={["Fecha", "Movimiento", "Documento / motivo", "Lote", { label: "Entrada", align: "right" }, { label: "Salida", align: "right" }, { label: "Saldo", align: "right" }]}>
                {lines.map((r) => (
                  <tr key={r.id}>
                    <td className={cn(td, "whitespace-nowrap text-xs tabular-nums text-zinc-500")}>
                      {dateShort(r.at)} {timeShort(r.at)}
                    </td>
                    <td className={td}>
                      <span className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold", r.delta > 0 ? "bg-emerald-50 text-emerald-700" : r.type === "venta" ? "bg-zinc-100 text-zinc-600" : "bg-rose-50 text-rose-700")}>
                        {MOVE_LABEL[r.type]}
                      </span>
                    </td>
                    <td className={cn(td, "text-xs")}>
                      {multi && <span className="mr-1.5 rounded bg-brand/10 px-1.5 py-px text-[10.5px] font-semibold text-brand">{name(r.branchId)}</span>}
                      {r.reference}
                      <span className="block text-[11px] text-zinc-400">{r.userName}</span>
                    </td>
                    <td className={cn(td, "text-xs tabular-nums text-zinc-500")}>{r.lotCode ?? "—"}</td>
                    <td className={cn(td, "text-right tabular-nums text-emerald-700")}>{r.delta > 0 ? fmtInt(r.delta) : ""}</td>
                    <td className={cn(td, "text-right tabular-nums")}>{r.delta < 0 ? fmtInt(-r.delta) : ""}</td>
                    <td className={cn(td, "text-right font-semibold tabular-nums")}>{fmtInt(r.balance)}</td>
                  </tr>
                ))}
                <tr className="bg-zinc-50">
                  <td className={cn(td, "text-xs text-zinc-500")} colSpan={6}>
                    Saldo inicial del periodo
                  </td>
                  <td className={cn(td, "text-right font-semibold tabular-nums")}>{fmtInt(opening)}</td>
                </tr>
              </Table>
            )}
          </div>
        </section>
      </div>
    </Dialog>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "amber" | "dark" }) {
  return (
    <div className={cn("rounded-xl p-3", tone === "amber" ? "bg-amber-50" : tone === "dark" ? "bg-zinc-900 text-white" : "bg-zinc-50")}>
      <p className={cn("text-[11px] font-medium", tone === "dark" ? "text-white/60" : "text-zinc-500")}>{label}</p>
      <p className="mt-0.5 truncate text-sm font-semibold tabular-nums">{value}</p>
      {hint && <p className={cn("text-[11px]", tone === "dark" ? "text-white/60" : tone === "amber" ? "text-amber-800" : "text-zinc-500")}>{hint}</p>}
    </div>
  );
}
