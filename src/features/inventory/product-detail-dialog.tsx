"use client";

import { useMemo, useState } from "react";
import { Boxes, FileSpreadsheet, History, Pencil, Snowflake } from "lucide-react";
import type { Branch, BranchId, ExpiryThresholds, Lot, Pharmacy, Product } from "@/lib/api/types";
import { api, errorMessage } from "@/lib/api";
import { kardexBalances, kardexView, marginPct, minFor, MOVE_LABEL } from "@/lib/domain/inventory";
import { pageCount } from "@/lib/domain/pagination";
import { daysUntil, parseDay, presentationsOf, stockLabel } from "@/lib/domain/pharmacy";
import { useKardex } from "@/lib/queries";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { Segmented } from "@/components/ui/segmented";
import { Table, td } from "@/components/ui/table";
import { Chip } from "@/components/ui/chip";
import { SectionLabel } from "@/components/ui/section-label";
import { TONE_CLASS } from "@/components/ui/tone";
import { ExpiryBadge, RxBadge } from "@/components/ui/badges";
import { notify } from "@/components/ui/toast";
import { dateShort, soles, timeShort } from "@/lib/format";
import { cn } from "@/lib/cn";
import { exportKardex, RX_LABEL } from "./export";

const KARDEX_DAYS = [7, 30, 90] as const;
/** Movimientos por página del kardex: el servidor entrega solo estos. */
const KARDEX_PAGE_SIZE = 20;
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
  const [kPage, setKPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const kardexBranch = multi ? null : (branchIds[0] ?? null);
  const kardex = useKardex(p.id, kardexBranch, days, kPage, KARDEX_PAGE_SIZE);
  const name = (id: BranchId) => branches.find((b) => b.id === id)?.name ?? id;

  const productLots = useMemo(
    () => lots.filter((l) => l.productId === p.id && l.qty > 0 && branchIds.includes(l.branchId)).sort((a, b) => parseDay(a.expiresOn) - parseDay(b.expiresOn) || a.id - b.id),
    [lots, p.id, branchIds],
  );
  const vigente = (b: BranchId) => productLots.filter((l) => l.branchId === b && daysUntil(l.expiresOn, now) >= 0).reduce((s, l) => s + l.qty, 0);

  const { lines, opening, totals } = useMemo(() => (kardex.data ? kardexView(kardex.data) : { lines: [], opening: 0, totals: { inUnits: 0, outUnits: 0, sold: 0, opening: 0 } }), [kardex.data]);
  const total = kardex.data?.total ?? lines.length;
  const lastPage = !kardex.data?.pageSize || (kardex.data.page ?? 1) >= pageCount(total, kardex.data.pageSize);

  /** El Excel lleva todo el periodo, no solo la página que se está viendo: se pide completo (sin `page`). */
  const doExport = async () => {
    setExporting(true);
    try {
      const full = await api.getKardex(p.id, { branchId: kardexBranch ?? undefined, days });
      const view = kardexBalances(full.entries, full.closing);
      exportKardex({ product: p, lines: view.lines, opening: view.opening, days, scopeLabel, branches, pharmacy });
      notify("Kardex descargado");
    } catch (e) {
      notify(errorMessage(e), "warn");
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog
      title={`${p.name} ${p.conc}`}
      description={`${p.active} · ${p.form} · ${p.lab} · RS ${p.sanitaryReg || "—"}`}
      onClose={onClose}
      size="xl"
      footer={
        <>
          <Button onClick={() => void doExport()} loading={exporting} disabled={!kardex.data || total === 0}>
            <FileSpreadsheet className="h-4 w-4 text-success-fg" /> Exportar kardex
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
          <Chip>{p.category}</Chip>
          {p.coldChain && (
            <Chip tone="info">
              <Snowflake className="h-3 w-3" aria-hidden /> 2–8 °C
            </Chip>
          )}
          <span className="text-caption text-muted">Ubicación {p.location || "—"} · Código {p.barcode || "—"}</span>
        </div>

        <div className={cn("grid gap-3", multi ? "sm:grid-cols-4" : "sm:grid-cols-3")}>
          {branchIds.map((b) => {
            const st = vigente(b);
            const low = st <= minFor(p, b);
            return (
              <Stat key={b} label={`Stock ${name(b)}`} value={stockLabel(p, st)} hint={`Mínimo ${fmtInt(minFor(p, b))} unid.${st === 0 ? " · Agotado" : low ? " · Bajo mínimo" : ""}`} tone={st === 0 ? "danger" : low ? "warning" : undefined} />
            );
          })}
          <Stat label={`Vendido · ${days} días`} value={kardex.data ? `${fmtInt(totals.sold)} unid.` : "…"} hint={kardex.data ? `${(totals.sold / days).toLocaleString("es-PE", { maximumFractionDigits: 1 })} por día` : undefined} />
          <Stat label="Condición de venta" value={RX_LABEL[p.rx]} />
        </div>

        <section>
          <SectionLabel as="h3" className="mb-2">Precios y margen</SectionLabel>
          <div className="grid gap-2 sm:grid-cols-3">
            {presentationsOf(p).map((ps) => {
              const m = marginPct(ps.price, ps.units, p.cost);
              return (
                <div key={ps.id} className="rounded-xl border border-line p-3">
                  <p className="text-caption text-muted">{ps.label}</p>
                  <p className="text-lg font-semibold tabular-nums">{soles(ps.price)}</p>
                  <p className="text-micro text-muted">
                    Costo {soles(p.cost * ps.units)} sin IGV · margen <b className={m < 15 ? "text-danger-fg" : "text-success-fg"}>{m.toFixed(0)} %</b>
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <SectionLabel as="h3" className="mb-2">Lotes en orden de salida (FEFO)</SectionLabel>
          <div className="overflow-hidden rounded-xl border border-line">
            {productLots.length === 0 ? (
              <Empty icon={Boxes} title="Sin lotes con stock" />
            ) : (
              <Table minWidth={620} head={["#", ...(multi ? ["Local"] : []), "Lote", "Vencimiento", { label: "Cantidad", align: "right" }, { label: "Costo u.", align: "right" }, "Descuento", "Proveedor"]}>
                {productLots.map((l, i) => (
                  <tr key={l.id}>
                    <td className={cn(td, "text-caption text-muted")}>{i + 1}</td>
                    {multi && <td className={cn(td, "text-caption font-semibold")}>{name(l.branchId)}</td>}
                    <td className={cn(td, "tabular-nums")}>{l.code}</td>
                    <td className={td}>
                      <div className="flex items-center gap-2">
                        <span className="tabular-nums">{dateShort(l.expiresOn)}</span>
                        <ExpiryBadge days={daysUntil(l.expiresOn, now)} short thresholds={thresholds} />
                      </div>
                    </td>
                    <td className={cn(td, "text-right tabular-nums")}>{fmtInt(l.qty)}</td>
                    <td className={cn(td, "text-right tabular-nums")}>{soles(l.cost)}</td>
                    <td className={cn(td, "text-caption")}>{l.discount ? `-${Math.round(l.discount * 100)} %` : "—"}</td>
                    <td className={cn(td, "max-w-44 truncate text-caption text-muted")}>{l.supplier ?? "—"}</td>
                  </tr>
                ))}
              </Table>
            )}
          </div>
        </section>

        <section>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <SectionLabel as="h3">Kardex (unidades)</SectionLabel>
            <Segmented label="Periodo del kardex" value={String(days)} onChange={(v) => { setDays(Number(v) as (typeof KARDEX_DAYS)[number]); setKPage(1); }} options={KARDEX_DAYS.map((d) => ({ id: String(d), label: `${d} días` }))} />
          </div>
          {kardex.data && (
            <p className="mb-2 text-caption text-muted">
              Entradas <b className="tabular-nums text-success-fg">{fmtInt(totals.inUnits)}</b> · Salidas <b className="tabular-nums text-fg">{fmtInt(totals.outUnits)}</b> · Saldo inicial{" "}
              <b className="tabular-nums text-fg">{fmtInt(opening)}</b> · Saldo actual <b className="tabular-nums text-fg">{fmtInt(kardex.data.closing)}</b>
            </p>
          )}
          <div className="max-h-80 overflow-y-auto rounded-xl border border-line">
            {kardex.isLoading ? (
              <div className="grid gap-2 p-3">
                {Array.from({ length: 5 }, (_, i) => (
                  <div key={i} className="h-9 animate-pulse rounded-lg bg-sunken" />
                ))}
              </div>
            ) : kardex.error ? (
              <Empty icon={History} title="No se pudo cargar el kardex">
                {errorMessage(kardex.error)}
              </Empty>
            ) : total === 0 ? (
              <Empty icon={History} title={`Sin movimientos en ${days} días`} />
            ) : (
              <Table minWidth={760} head={["Fecha", "Movimiento", "Documento / motivo", "Lote", { label: "Entrada", align: "right" }, { label: "Salida", align: "right" }, { label: "Saldo", align: "right" }]}>
                {lines.map((r) => (
                  <tr key={r.id}>
                    <td className={cn(td, "whitespace-nowrap text-caption tabular-nums text-muted")}>
                      {dateShort(r.at)} {timeShort(r.at)}
                    </td>
                    <td className={td}>
                      <Chip tone={r.delta > 0 ? "success" : r.type === "venta" ? "neutral" : "danger"}>{MOVE_LABEL[r.type]}</Chip>
                    </td>
                    <td className={cn(td, "text-caption")}>
                      {multi && <span className="mr-1.5 rounded bg-brand/10 px-1.5 py-px text-micro font-semibold text-brand">{name(r.branchId)}</span>}
                      {r.reference}
                      <span className="block text-micro text-muted">{r.userName}</span>
                    </td>
                    <td className={cn(td, "text-caption tabular-nums text-muted")}>{r.lotCode ?? "—"}</td>
                    <td className={cn(td, "text-right tabular-nums text-success-fg")}>{r.delta > 0 ? fmtInt(r.delta) : ""}</td>
                    <td className={cn(td, "text-right tabular-nums")}>{r.delta < 0 ? fmtInt(-r.delta) : ""}</td>
                    <td className={cn(td, "text-right font-semibold tabular-nums")}>{fmtInt(r.balance)}</td>
                  </tr>
                ))}
                {lastPage && (
                  <tr className="bg-subtle">
                    <td className={cn(td, "text-caption text-muted")} colSpan={6}>
                      Saldo inicial del periodo
                    </td>
                    <td className={cn(td, "text-right font-semibold tabular-nums")}>{fmtInt(opening)}</td>
                  </tr>
                )}
              </Table>
            )}
          </div>
          {kardex.data?.pageSize && <Pagination page={kardex.data.page ?? 1} pageSize={kardex.data.pageSize} total={total} onPage={setKPage} busy={kardex.isFetching} noun="movimientos" className="rounded-b-xl border-x border-b border-t-0" />}
        </section>
      </div>
    </Dialog>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "warning" | "danger" }) {
  return (
    <div className={cn("rounded-xl p-3", tone ? TONE_CLASS[tone].soft : "bg-subtle")}>
      <p className={cn("text-micro font-medium", !tone && "text-muted")}>{label}</p>
      <p className="mt-0.5 truncate text-small font-semibold tabular-nums">{value}</p>
      {hint && <p className={cn("text-micro", !tone && "text-muted")}>{hint}</p>}
    </div>
  );
}
