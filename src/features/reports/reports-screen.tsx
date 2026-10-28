"use client";

import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Banknote, CircleCheck, FileSpreadsheet, Lock, Package, Percent, Receipt, Stethoscope, TriangleAlert, type LucideIcon } from "lucide-react";
import type { Product, SalesReportLine } from "@/lib/api/types";
import { errorMessage } from "@/lib/api";
import { useConfig, useProducts, useSalesReport } from "@/lib/queries";
import { PAYMENT_LABEL } from "@/lib/domain/cash";
import { byDay, change, deadStock, groupLines, periodDays, periodFor, prescriptionBook, previousPeriod, totalsOf, type GroupRow, type Period, type PeriodPreset } from "@/lib/domain/reports";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty";
import { Input } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { Table, td } from "@/components/ui/table";
import { ColumnChart, type ChartDatum } from "@/components/charts/column-chart";
import { notify } from "@/components/ui/toast";
import { dateShort, soles, timeShort } from "@/lib/format";
import { branchColor, foldBranches } from "@/lib/chart-colors";
import { cn } from "@/lib/cn";
import { ScopeToggle, useBranchLots, useBranchScope } from "@/features/shared/branch-scope";
import { exportReport } from "./export";

type View = "producto" | "laboratorio" | "tipo" | "local" | "vendedor" | "pago" | "sin_movimiento" | "recetas";
const PRESETS: { id: PeriodPreset; label: string }[] = [
  { id: "hoy", label: "Hoy" },
  { id: "ayer", label: "Ayer" },
  { id: "7d", label: "7 días" },
  { id: "30d", label: "30 días" },
  { id: "mes", label: "Este mes" },
  { id: "mes_anterior", label: "Mes anterior" },
];
/* Periodos en curso: compararlos con uno completo engañaría */
const COMPARABLE: (PeriodPreset | "custom")[] = ["ayer", "7d", "30d", "mes_anterior", "custom"];
const DOW = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const sol0 = (n: number) => `S/ ${Math.round(n).toLocaleString("es-PE")}`;
const fmtInt = (n: number) => n.toLocaleString("es-PE");

export function ReportsScreen() {
  const scope = useBranchScope();
  const { allBranches, ids, multi, isAdmin, operating, branches, branchName } = scope;
  const allIds = useMemo(() => branches.map((b) => b.id), [branches]);
  const config = useConfig();
  const products = useProducts();
  const [now] = useState(() => Date.now());
  const [preset, setPreset] = useState<PeriodPreset | "custom">("30d");
  const [custom, setCustom] = useState<Period>(() => periodFor("30d", now));
  const period: Period = preset === "custom" ? { ...custom, label: `Del ${dateShort(custom.from)} al ${dateShort(custom.to)}` } : periodFor(preset, now);
  const validRange = period.from <= period.to && periodDays(period) <= 366;
  const branchParam = multi ? null : operating;
  const report = useSalesReport(period.from, period.to, branchParam, validRange);
  const prev = previousPeriod(period);
  const prevReport = useSalesReport(prev.from, prev.to, branchParam, validRange && COMPARABLE.includes(preset));
  const lotsQ = useBranchLots(ids);
  const [view, setView] = useState<View>("producto");

  const productList: Product[] = products.data ?? [];
  const pm = useMemo(() => new Map(productList.map((p) => [p.id, p])), [productList]);
  const lines: SalesReportLine[] = report.data ?? [];
  const totals = useMemo(() => totalsOf(lines), [lines]);
  const prevTotals = useMemo(() => (prevReport.data ? totalsOf(prevReport.data) : null), [prevReport.data]);

  const groups = useMemo(() => {
    const p = (id: number) => pm.get(id);
    switch (view) {
      case "producto":
        return groupLines(lines, (l) => String(l.productId), (k) => { const x = p(Number(k)); return x ? `${x.name} ${x.conc}` : k; });
      case "laboratorio":
        return groupLines(lines, (l) => p(l.productId)?.lab ?? "—");
      case "tipo":
        return groupLines(lines, (l) => p(l.productId)?.category ?? "—");
      case "local":
        return groupLines(lines, (l) => l.branchId, branchName);
      case "vendedor":
        return groupLines(lines, (l) => l.sellerName || "—");
      case "pago":
        return groupLines(lines, (l) => l.method, (k) => PAYMENT_LABEL[k as keyof typeof PAYMENT_LABEL] ?? k);
      default:
        return [];
    }
    // branchName cambia de identidad en cada render, pero solo depende de la configuración
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, view, pm]);
  const dead = useMemo(() => deadStock(productList, lotsQ.lots, lines, ids, now), [productList, lotsQ.lots, lines, ids, now]);
  const book = useMemo(() => prescriptionBook(lines, pm), [lines, pm]);

  const days = byDay(lines, period, ids);
  const chartData: ChartDatum[] = days.map((d) => {
    const dt = new Date(`${d.date}T12:00:00`);
    return { key: d.date, label: days.length > 31 ? `${dt.getDate()}/${dt.getMonth() + 1}` : `${DOW[dt.getDay()]} ${dt.getDate()}`, title: dt.toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" }), values: d.byBranch };
  });
  const series = ids.map((b) => ({ key: b, label: branchName(b), color: branchColor(allIds, b) }));
  const oneDay = days.length === 1;
  const hourData: ChartDatum[] = oneDay
    ? Array.from({ length: 16 }, (_, i) => i + 7).map((h) => ({
        key: String(h),
        label: String(h),
        title: `${h}:00 a ${h}:59`,
        values: Object.fromEntries(ids.map((b) => [b, Math.round(lines.filter((l) => l.branchId === b && new Date(l.at).getHours() === h).reduce((s, l) => s + l.total, 0) * 100) / 100])),
      }))
    : [];

  const doExport = () => {
    exportReport({ lines, products: productList, deadRows: dead, period, branches: allBranches, branchIds: ids, scopeLabel: scope.label, pharmacy: config.data?.pharmacy });
    notify("Reporte de ventas descargado");
  };

  const delta = (cur: number, key: "total" | "profit" | "tickets" | "avgTicket") => (prevTotals ? change(cur, prevTotals[key]) : null);
  const loading = report.isLoading || products.isLoading;

  if (report.error) {
    return (
      <Empty icon={TriangleAlert} title="No se pudo cargar el reporte">
        {errorMessage(report.error)}{" "}
        <button type="button" className="font-semibold underline" onClick={() => void report.refetch()}>
          Reintentar
        </button>
      </Empty>
    );
  }

  return (
    <div className="mx-auto grid max-w-7xl gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<PeriodPreset | "custom"> label="Periodo" value={preset} onChange={setPreset} options={[...PRESETS, { id: "custom", label: "Elegir fechas" }]} />
        {isAdmin && <ScopeToggle scope={scope.scope} onChange={scope.setScope} operatingName={branchName(operating)} />}
        <Button className="sm:ml-auto" onClick={doExport} disabled={loading || !validRange}>
          <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Excel completo
        </Button>
      </div>
      {preset === "custom" && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-medium text-zinc-600">
            Desde
            <Input type="date" value={custom.from} max={custom.to} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} className="mt-1 w-44" />
          </label>
          <label className="text-xs font-medium text-zinc-600">
            Hasta
            <Input type="date" value={custom.to} min={custom.from} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} className="mt-1 w-44" />
          </label>
          {!validRange && <p className="pb-2.5 text-xs text-rose-600">Elige un rango válido de hasta un año.</p>}
        </div>
      )}
      <p className="-mt-1 text-sm text-zinc-500">
        <b className="font-semibold capitalize text-zinc-800">{period.label}</b> · {scope.label} · {periodDays(period)} {periodDays(period) === 1 ? "día" : "días"}
        {prevTotals && ` · comparado con los ${periodDays(prev)} días anteriores`}
      </p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={Banknote} label="Venta con IGV" value={soles(totals.total)} hint={`Sin IGV ${soles(totals.taxBase)}`} delta={delta(totals.total, "total")} loading={loading} strong />
        <Kpi icon={Percent} label="Utilidad bruta" value={soles(totals.profit)} hint={`Margen ${totals.margin.toLocaleString("es-PE", { maximumFractionDigits: 1 })} % · costo ${sol0(totals.cost)}`} delta={delta(totals.profit, "profit")} loading={loading} />
        <Kpi icon={Receipt} label="Comprobantes" value={fmtInt(totals.tickets)} hint={`Ticket promedio ${soles(totals.avgTicket)}`} delta={delta(totals.tickets, "tickets")} loading={loading} />
        <Kpi icon={Package} label="Unidades vendidas" value={fmtInt(totals.units)} hint={`${new Set(lines.map((l) => l.productId)).size} productos distintos`} loading={loading} />
      </div>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5" aria-label={oneDay ? "Venta por hora" : "Venta por día"}>
        <h2 className="mb-1 font-semibold tracking-tight">{oneDay ? "Venta por hora" : "Venta por día"}</h2>
        {loading ? (
          <div className="h-[220px] animate-pulse rounded-xl bg-zinc-50" />
        ) : (
          <ColumnChart {...foldBranches(series, oneDay ? hourData : chartData)} format={soles} formatTick={sol0} labelEvery={oneDay ? 2 : Math.max(1, Math.ceil(chartData.length / 12))} ariaLabel={oneDay ? "Venta por hora" : "Venta por día"} height={220} emptyText="Sin ventas en el periodo" />
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white" aria-label="Detalle del reporte">
        <div className="border-b border-zinc-100 p-3 sm:px-5">
          <Segmented<View>
            label="Ver por"
            value={view}
            onChange={setView}
            options={[
              { id: "producto", label: "Producto" },
              { id: "laboratorio", label: "Laboratorio" },
              { id: "tipo", label: "Tipo" },
              ...(multi ? [{ id: "local" as const, label: "Local" }] : []),
              { id: "vendedor", label: "Quién atendió" },
              { id: "pago", label: "Pago" },
              { id: "sin_movimiento", label: "Sin movimiento", count: loading ? undefined : dead.length },
              { id: "recetas", label: "Libro de recetas", count: loading ? undefined : book.length },
            ]}
          />
        </div>
        {loading ? (
          <div className="grid gap-2 p-4">{Array.from({ length: 6 }, (_, i) => <div key={i} className="h-11 animate-pulse rounded-xl bg-zinc-100" />)}</div>
        ) : view === "sin_movimiento" ? (
          <DeadStockTable rows={dead} multi={multi} branchName={branchName} />
        ) : view === "recetas" ? (
          <PrescriptionTable entries={book} pm={pm} multi={multi} branchName={branchName} />
        ) : groups.length === 0 ? (
          <Empty icon={Receipt} title="Sin ventas en el periodo" />
        ) : (
          <GroupTable rows={groups} first={{ producto: "Producto", laboratorio: "Laboratorio o marca", tipo: "Tipo", local: "Local", vendedor: "Atendió", pago: "Método de pago" }[view]} />
        )}
      </section>
    </div>
  );
}

function GroupTable({ rows, first }: { rows: GroupRow[]; first: string }) {
  const max = Math.max(...rows.map((r) => r.share), 0.0001);
  return (
    <div className="max-h-[560px] overflow-y-auto">
      <Table minWidth={860} head={[first, { label: "Unidades", align: "right" }, { label: "Comprob.", align: "right" }, { label: "Venta", align: "right" }, { label: "Utilidad", align: "right" }, { label: "Margen", align: "right" }, "Participación"]}>
        {rows.map((r) => (
          <tr key={r.key}>
            <td className={cn(td, "font-medium")}>{r.label}</td>
            <td className={cn(td, "text-right tabular-nums")}>{fmtInt(r.units)}</td>
            <td className={cn(td, "text-right tabular-nums text-zinc-600")}>{fmtInt(r.tickets)}</td>
            <td className={cn(td, "whitespace-nowrap text-right font-semibold tabular-nums")}>{soles(r.total)}</td>
            <td className={cn(td, "whitespace-nowrap text-right tabular-nums")}>{soles(r.profit)}</td>
            <td className={cn(td, "text-right tabular-nums", r.margin < 15 ? "font-semibold text-rose-600" : "text-zinc-600")}>{r.margin.toLocaleString("es-PE", { maximumFractionDigits: 1 })} %</td>
            <td className={td}>
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-28 rounded-full bg-zinc-100">
                  <div className="h-full rounded-full bg-brand" style={{ width: `${(r.share / max) * 100}%` }} />
                </div>
                <span className="w-12 text-right text-xs tabular-nums text-zinc-500">{(r.share * 100).toLocaleString("es-PE", { maximumFractionDigits: 1 })} %</span>
              </div>
            </td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

function DeadStockTable({ rows, multi, branchName }: { rows: ReturnType<typeof deadStock>; multi: boolean; branchName: (id: string) => string }) {
  if (!rows.length) return <Empty icon={CircleCheck} title="Todo lo que hay en stock se vendió en el periodo" />;
  const total = rows.reduce((s, r) => s + r.value, 0);
  return (
    <>
      <p className="flex items-center gap-2 px-4 pt-3 text-xs text-zinc-500 sm:px-5">
        <Lock className="h-3.5 w-3.5" /> {soles(total)} a costo inmovilizado en {rows.length} {rows.length === 1 ? "producto" : "productos"} que no se vendieron. Considera trasladarlos, ponerlos en exhibición o no volver a comprarlos.
      </p>
      <div className="max-h-[560px] overflow-y-auto">
        <Table minWidth={760} head={["Producto", ...(multi ? ["Local"] : []), "Tipo", { label: "Stock", align: "right" }, { label: "Valor a costo", align: "right" }, { label: "Días en stock", align: "right" }]}>
          {rows.map((r) => (
            <tr key={`${r.branchId}-${r.product.id}`}>
              <td className={td}>
                <p className="font-medium">
                  {r.product.name} <span className="text-zinc-500">{r.product.conc}</span>
                </p>
                <p className="text-xs text-zinc-500">{r.product.lab}</p>
              </td>
              {multi && <td className={cn(td, "text-xs font-semibold")}>{branchName(r.branchId)}</td>}
              <td className={cn(td, "text-xs text-zinc-600")}>{r.product.category}</td>
              <td className={cn(td, "text-right tabular-nums")}>{fmtInt(r.units)}</td>
              <td className={cn(td, "whitespace-nowrap text-right font-semibold tabular-nums")}>{soles(r.value)}</td>
              <td className={cn(td, "text-right tabular-nums text-zinc-600")}>{r.daysInStock ?? "—"}</td>
            </tr>
          ))}
        </Table>
      </div>
    </>
  );
}

function PrescriptionTable({ entries, pm, multi, branchName }: { entries: ReturnType<typeof prescriptionBook>; pm: Map<number, Product>; multi: boolean; branchName: (id: string) => string }) {
  if (!entries.length) return <Empty icon={Stethoscope} title="Sin ventas con receta en el periodo" />;
  return (
    <>
      <p className="px-4 pt-3 text-xs text-zinc-500 sm:px-5">Registro de dispensación con receta para la inspección de DIGEMID. Los controlados van marcados.</p>
      <div className="max-h-[560px] overflow-y-auto">
        <Table minWidth={900} head={["Fecha", ...(multi ? ["Local"] : []), "Comprobante", "Receta", "Médico (CMP)", "Productos", "Dispensó"]}>
          {entries.map((e) => (
            <tr key={e.saleId}>
              <td className={cn(td, "whitespace-nowrap text-xs tabular-nums text-zinc-600")}>
                {dateShort(e.at)} {timeShort(e.at)}
              </td>
              {multi && <td className={cn(td, "text-xs font-semibold")}>{branchName(e.branchId)}</td>}
              <td className={cn(td, "whitespace-nowrap tabular-nums")}>{e.number}</td>
              <td className={cn(td, "whitespace-nowrap tabular-nums")}>
                {e.prescription.number}
                {e.controlled && <span className="ml-1.5 rounded-full bg-violet-100 px-1.5 py-px text-[10px] font-semibold text-violet-700">Controlado</span>}
              </td>
              <td className={cn(td, "text-xs")}>
                {e.prescription.doctor} <span className="tabular-nums text-zinc-500">({e.prescription.cmp})</span>
              </td>
              <td className={cn(td, "text-xs text-zinc-600")}>{e.items.map((i) => `${i.qty} ${i.presentationLabel.toLowerCase()} ${pm.get(i.productId)?.name ?? ""}`).join(" · ")}</td>
              <td className={cn(td, "text-xs text-zinc-600")}>{e.sellerName}</td>
            </tr>
          ))}
        </Table>
      </div>
    </>
  );
}

function Kpi({ icon: Icon, label, value, hint, delta, loading, strong }: { icon: LucideIcon; label: string; value: string; hint?: string; delta?: number | null; loading?: boolean; strong?: boolean }) {
  return (
    <div className={cn("min-w-0 rounded-2xl border p-4", strong ? "border-transparent bg-brand text-white" : "border-zinc-200 bg-white")}>
      <p className={cn("flex items-center gap-2 text-xs font-semibold", strong ? "text-white/80" : "text-zinc-600")}>
        <Icon className={cn("h-4 w-4", strong ? "text-accent" : "text-brand")} /> {label}
      </p>
      {loading ? <div className={cn("mt-2 h-8 w-28 animate-pulse rounded", strong ? "bg-white/15" : "bg-zinc-100")} /> : <p className="mt-1.5 truncate text-2xl font-semibold tracking-tight tabular-nums">{value}</p>}
      <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs">
        {delta !== undefined && delta !== null && (
          <span className={cn("inline-flex items-center gap-0.5 font-semibold tabular-nums", strong ? "text-white" : delta >= 0 ? "text-emerald-700" : "text-rose-600")}>
            {delta >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
            {delta > 0 ? "+" : ""}
            {delta.toLocaleString("es-PE", { maximumFractionDigits: 1 })} %
          </span>
        )}
        {hint && <span className={cn("truncate", strong ? "text-white/70" : "text-zinc-500")}>{hint}</span>}
      </div>
    </div>
  );
}
