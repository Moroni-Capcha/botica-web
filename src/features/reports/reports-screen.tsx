"use client";

import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Banknote, FileSpreadsheet, Package, Percent, Receipt, TriangleAlert } from "lucide-react";
import type { Product, SalesReportLine } from "@/lib/api/types";
import { errorMessage } from "@/lib/api";
import { useConfig, useProducts, useSalesReport } from "@/lib/queries";
import { PAYMENT_LABEL } from "@/lib/domain/cash";
import { byDay, change, deadStock, groupLines, periodDays, periodFor, prescriptionBook, previousPeriod, totalsOf, type Period, type PeriodPreset } from "@/lib/domain/reports";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { Input } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { ColumnChart, type ChartDatum } from "@/components/charts/column-chart";
import { notify } from "@/components/ui/toast";
import { dateShort, soles } from "@/lib/format";
import { branchColor, foldBranches } from "@/lib/chart-colors";
import { cn } from "@/lib/cn";
import { useMediaQuery } from "@/lib/use-media-query";
import { ScopeToggle, useBranchLots, useBranchScope } from "@/features/shared/branch-scope";
import { Kpi } from "@/features/shared/kpi";
import { exportReport } from "./export";
import { DeadStockTable, GroupTable, PrescriptionTable } from "./reports-tables";

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
  const wide = useMediaQuery("(min-width: 768px)");
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
      <div className="mx-auto max-w-7xl p-4 sm:p-6">
        <Card padding="none">
          <Empty icon={TriangleAlert} title="No se pudo cargar el reporte">
            {errorMessage(report.error)}{" "}
            <button type="button" className="font-semibold underline" onClick={() => void report.refetch()}>
              Reintentar
            </button>
          </Empty>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-7xl gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<PeriodPreset | "custom"> label="Periodo" value={preset} onChange={setPreset} options={[...PRESETS, { id: "custom", label: "Elegir fechas" }]} />
        {isAdmin && <ScopeToggle scope={scope.scope} onChange={scope.setScope} operatingName={branchName(operating)} />}
        <Button className="sm:ml-auto" onClick={doExport} disabled={loading || !validRange}>
          <FileSpreadsheet className="h-4 w-4 text-success-fg" aria-hidden /> Excel completo
        </Button>
      </div>
      {preset === "custom" && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-medium text-fg-2">
            Desde
            <Input type="date" value={custom.from} max={custom.to} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} className="mt-1 w-44" />
          </label>
          <label className="text-xs font-medium text-fg-2">
            Hasta
            <Input type="date" value={custom.to} min={custom.from} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} className="mt-1 w-44" />
          </label>
          {!validRange && <p className="pb-2.5 text-xs text-danger-fg" role="alert">Elige un rango válido de hasta un año.</p>}
        </div>
      )}
      <p className="-mt-1 text-sm text-muted" role="status" aria-live="polite">
        <b className="font-semibold capitalize text-fg">{period.label}</b> · {scope.label} · {periodDays(period)} {periodDays(period) === 1 ? "día" : "días"}
        {prevTotals && ` · comparado con los ${periodDays(prev)} días anteriores`}
      </p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={Banknote} label={totals.returns > 0 ? "Venta neta con IGV" : "Venta con IGV"} value={soles(totals.total)} hint={kpiHint(`Sin IGV ${soles(totals.taxBase)}`, delta(totals.total, "total"), true)} loading={loading} strong />
        <Kpi icon={Percent} label="Utilidad bruta" value={soles(totals.profit)} hint={kpiHint(`Margen ${totals.margin.toLocaleString("es-PE", { maximumFractionDigits: 1 })} % · costo ${sol0(totals.cost)}`, delta(totals.profit, "profit"))} loading={loading} />
        <Kpi icon={Receipt} label="Comprobantes" value={fmtInt(totals.tickets)} hint={kpiHint(`Ticket promedio ${soles(totals.avgTicket)}`, delta(totals.tickets, "tickets"))} loading={loading} />
        <Kpi icon={Package} label="Unidades vendidas" value={fmtInt(totals.units)} hint={`${new Set(lines.map((l) => l.productId)).size} productos distintos`} loading={loading} />
      </div>

      {!loading && totals.returns > 0 && (
        <p className="rounded-xl bg-sunken px-4 py-2 text-caption tabular-nums text-fg-2" role="status">
          Vendido {soles(totals.gross)} − devoluciones / notas de crédito {soles(totals.returns)} = venta neta {soles(totals.total)}. Cada nota resta en el día en que se emitió.
        </p>
      )}

      <Card as="section" aria-labelledby="rep-chart">
        <h2 id="rep-chart" className="mb-1 font-semibold tracking-tight">{oneDay ? "Venta por hora" : "Venta por día"}</h2>
        {loading ? (
          <div className="h-[220px] animate-pulse rounded-xl bg-sunken" />
        ) : (
          <ColumnChart {...foldBranches(series, oneDay ? hourData : chartData)} format={soles} formatTick={sol0} labelEvery={oneDay ? 2 : Math.max(1, Math.ceil(chartData.length / 12))} ariaLabel={oneDay ? "Venta por hora" : "Venta por día"} height={220} emptyText="Sin ventas en el periodo" />
        )}
      </Card>

      <Card as="section" padding="none" className="overflow-hidden" aria-label="Detalle del reporte">
        <div className="border-b border-line-soft p-3 sm:px-5">
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
          <div className="grid gap-2 p-4">{Array.from({ length: 6 }, (_, i) => <div key={i} className="h-11 animate-pulse rounded-xl bg-sunken" />)}</div>
        ) : (
          <div key={view} className="animate-swap-in">
            {view === "sin_movimiento" ? (
              <DeadStockTable rows={dead} multi={multi} branchName={branchName} wide={wide} />
            ) : view === "recetas" ? (
              <PrescriptionTable entries={book} pm={pm} multi={multi} branchName={branchName} wide={wide} />
            ) : groups.length === 0 ? (
              <Empty icon={Receipt} title="Sin ventas en el periodo" />
            ) : (
              <GroupTable rows={groups} wide={wide} first={{ producto: "Producto", laboratorio: "Laboratorio o marca", tipo: "Tipo", local: "Local", vendedor: "Atendió", pago: "Método de pago" }[view]} />
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

/** Pie de cada cifra: variación contra el periodo anterior (flecha + signo + %) y el texto de apoyo. */
function kpiHint(text: string, delta?: number | null, strong?: boolean) {
  return (
    <span className="flex flex-wrap items-center gap-x-2">
      {delta !== undefined && delta !== null && (
        <span className={cn("inline-flex items-center gap-0.5 font-semibold tabular-nums", strong ? "text-white" : delta >= 0 ? "text-success-fg" : "text-danger-fg")}>
          {delta >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" aria-hidden /> : <ArrowDownRight className="h-3.5 w-3.5" aria-hidden />}
          {delta > 0 ? "+" : ""}
          {delta.toLocaleString("es-PE", { maximumFractionDigits: 1 })} %
        </span>
      )}
      <span>{text}</span>
    </span>
  );
}
