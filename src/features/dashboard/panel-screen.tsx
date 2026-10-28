"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useQueries } from "@tanstack/react-query";
import { ArrowRight, Banknote, CircleAlert, CircleCheck, Info, Receipt, ShoppingCart, TrendingUp, TriangleAlert, UserCheck, type LucideIcon } from "lucide-react";
import type { CashSummary } from "@/lib/api/types";
import { api, errorMessage } from "@/lib/api";
import { useSessionStore } from "@/lib/auth/session-store";
import { qk, useCustomers, useDashboard, useMarks, useProducts, useRefills, useTransfers, useWorkers } from "@/lib/queries";
import { refillRows, toNotify } from "@/lib/domain/customers";
import { buildAlerts, dailyTotals, greeting, isoLocal, sameDayLastWeek, averageDay, type AlertTone } from "@/lib/domain/dashboard";
import { daySummary, DEFAULT_ATTENDANCE } from "@/lib/domain/attendance";
import { inventoryRows } from "@/lib/domain/inventory";
import { round2 } from "@/lib/domain/pharmacy";
import { ColumnChart, type ChartDatum } from "@/components/charts/column-chart";
import { Empty } from "@/components/ui/empty";
import { branchColor, foldBranches } from "@/lib/chart-colors";
import { soles } from "@/lib/format";
import { cn } from "@/lib/cn";
import { allLabel, ScopeToggle, useBranchScope } from "@/features/shared/branch-scope";
import { useExpiryData } from "@/features/expiry/use-expiry-data";

const SERIES_DAYS = 14;
const DOW = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const TONE: Record<AlertTone, { icon: LucideIcon; className: string; label: string }> = {
  critical: { icon: CircleAlert, className: "text-rose-600", label: "Urgente" },
  warning: { icon: TriangleAlert, className: "text-amber-600", label: "Atender" },
  info: { icon: Info, className: "text-sky-600", label: "Para saber" },
};
const sol0 = (n: number) => `S/ ${Math.round(n).toLocaleString("es-PE")}`;

export function PanelScreen() {
  const user = useSessionStore((s) => s.session?.user);
  const scope = useBranchScope();
  const { ids, multi, isAdmin, operating, branches, branchName } = scope;
  const allIds = useMemo(() => branches.map((b) => b.id), [branches]);
  const [now] = useState(() => Date.now());
  const today = isoLocal(now);

  const dashboard = useDashboard(SERIES_DAYS);
  const products = useProducts();
  const expiry = useExpiryData(ids);
  const transfers = useTransfers(30);
  const cashQ = useQueries({ queries: ids.map((b) => ({ queryKey: qk.cashSummary(b), queryFn: () => api.getCashSummary(b), refetchInterval: 60_000 })) });
  const workers = useWorkers(isAdmin);
  const marks = useMarks(today, today, isAdmin);
  const customers = useCustomers();
  const refills = useRefills();

  const cash = cashQ.map((q) => q.data).filter((x): x is CashSummary => !!x);
  const todayStats = (dashboard.data?.today ?? []).filter((t) => ids.includes(t.branchId));
  const series = dashboard.data?.series ?? [];
  const totalToday = round2(todayStats.reduce((a, t) => a + t.total, 0));
  const ticketsToday = todayStats.reduce((a, t) => a + t.tickets, 0);
  const lastWeek = sameDayLastWeek(series, ids, now);
  const avg = averageDay(series, ids);
  const cashExpected = round2(cash.reduce((a, c) => a + (c.session.open ? c.expected : 0), 0));
  const digital = todayStats.reduce((a, t) => ({ yape: a.yape + t.byMethod.yape, tarjeta: a.tarjeta + t.byMethod.tarjeta }), { yape: 0, tarjeta: 0 });

  const inv = useMemo(() => inventoryRows(products.data ?? [], expiry.rows.map((r) => r.lot), ids, now), [products.data, expiry.rows, ids, now]);
  const attendanceToday = useMemo(
    () => (isAdmin && workers.data && marks.data ? workers.data.filter((w) => w.active && ids.includes(w.branchId)).map((w) => daySummary(w, now, marks.data, now, DEFAULT_ATTENDANCE)) : undefined),
    [isAdmin, workers.data, marks.data, ids, now],
  );
  const onShift = attendanceToday?.filter((s) => s.status === "en_turno" || s.status === "refrigerio").length ?? 0;
  const scheduled = attendanceToday?.filter((s) => s.scheduled).length ?? 0;

  /* Cálculo liviano: se rehace en cada render con lo que ya está en caché */
  const alerts = user
    ? buildAlerts({
        user, branchName, expiry: expiry.rows, inventory: inv, now, cash, attendance: attendanceToday,
        refillsToNotify: customers.data && refills.data && products.data ? toNotify(refillRows(customers.data, refills.data, products.data, now)).length : 0,
        transfers: (transfers.data ?? []).filter((t) => (t.status === "solicitado" || t.status === "en_transito") && (ids.includes(t.fromBranchId) || ids.includes(t.toBranchId))),
      })
    : [];

  /* Gráfico por hora: de 7 a 22 h, apilado por local */
  const seriesDef = ids.map((b) => ({ key: b, label: branchName(b), color: branchColor(allIds, b) }));
  const currentHour = new Date().getHours();
  const hourData: ChartDatum[] = Array.from({ length: 16 }, (_, i) => i + 7).map((h) => ({
    key: String(h),
    label: `${h}`,
    title: `${h}:00 a ${h}:59`,
    values: Object.fromEntries(todayStats.map((t) => [t.branchId, t.byHour[h] ?? 0])),
  }));
  const dayData: ChartDatum[] = [
    ...dailyTotals(series, ids).map((d) => {
      const dt = new Date(`${d.date}T12:00:00`);
      return { key: d.date, label: `${DOW[dt.getDay()]} ${dt.getDate()}`, title: dt.toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" }), values: d.byBranch };
    }),
    { key: today, label: "Hoy", title: "Hoy (en curso)", values: Object.fromEntries(todayStats.map((t) => [t.branchId, t.total])) },
  ];

  const topProducts = useMemo(() => {
    const m = new Map<number, { productId: number; units: number; total: number }>();
    for (const t of todayStats) for (const p of t.topProducts) {
      const cur = m.get(p.productId) ?? { productId: p.productId, units: 0, total: 0 };
      cur.units += p.units;
      cur.total = round2(cur.total + p.total);
      m.set(p.productId, cur);
    }
    return [...m.values()].sort((a, b) => b.total - a.total).slice(0, 6);
  }, [todayStats]);
  const productById = useMemo(() => new Map((products.data ?? []).map((p) => [p.id, p])), [products.data]);
  const maxTop = Math.max(1, ...topProducts.map((p) => p.total));

  if (dashboard.error) {
    return (
      <Empty icon={TriangleAlert} title="No se pudo cargar el panel">
        {errorMessage(dashboard.error)}{" "}
        <button type="button" className="font-semibold underline" onClick={() => void dashboard.refetch()}>
          Reintentar
        </button>
      </Empty>
    );
  }
  const loading = dashboard.isLoading;
  const firstName = user?.name.replace(/^Q\.F\.\s*/, "").split(" ")[0] ?? "";
  const vsWeek = lastWeek ? round2(totalToday - lastWeek.total) : null;

  return (
    <div className="mx-auto grid max-w-7xl gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold tracking-tight">
            {greeting(now)}, {firstName}
          </h2>
          <p className="text-sm text-zinc-500">{multi ? `Resumen de ${allLabel(ids.length).toLowerCase()}` : `Resumen de ${branchName(operating)}`} · se actualiza cada minuto</p>
        </div>
        {isAdmin && <ScopeToggle scope={scope.scope} onChange={scope.setScope} operatingName={branchName(operating)} />}
        {user?.permissions.includes("pos") && (
          <Link href="/pos" className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white transition hover:brightness-110">
            <ShoppingCart className="h-4 w-4" /> Vender
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          icon={TrendingUp}
          label="Venta de hoy"
          value={soles(totalToday)}
          loading={loading}
          strong
          hint={lastWeek ? (vsWeek! >= 0 ? `Ya supera al ${DOW[new Date(`${lastWeek.date}T12:00:00`).getDay()]} pasado (${sol0(lastWeek.total)})` : `Faltan ${sol0(-vsWeek!)} para igualar el ${DOW[new Date(`${lastWeek.date}T12:00:00`).getDay()]} pasado`) : `Promedio diario: ${sol0(avg)}`}
          progress={lastWeek && lastWeek.total > 0 ? Math.min(1, totalToday / lastWeek.total) : undefined}
        />
        <Kpi icon={Receipt} label="Comprobantes" value={String(ticketsToday)} loading={loading} hint={ticketsToday ? `Ticket promedio ${soles(totalToday / ticketsToday)}` : "Aún no hay ventas hoy"} />
        <Kpi icon={Banknote} label="Efectivo en caja" value={soles(cashExpected)} loading={cashQ.some((q) => q.isLoading)} hint={`Yape/Plin ${sol0(digital.yape)} · Tarjeta ${sol0(digital.tarjeta)}`} />
        {isAdmin ? (
          <Kpi icon={UserCheck} label="Personal en turno" value={attendanceToday ? `${onShift} de ${scheduled}` : "—"} loading={workers.isLoading || marks.isLoading} hint={attendanceToday ? `${attendanceToday.filter((s) => s.late > 0).length} tardanzas hoy` : ""} href="/asistencia" />
        ) : (
          <Kpi icon={CircleAlert} label="Pendientes" value={String(alerts.length)} loading={expiry.isLoading} hint={alerts.filter((a) => a.tone === "critical").length ? `${alerts.filter((a) => a.tone === "critical").length} urgentes` : "Nada urgente"} />
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="grid min-w-0 content-start gap-4">
          <Card title="Venta por hora · hoy" subtitle={`Hasta las ${new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}`}>
            {loading ? <ChartSkeleton /> : <ColumnChart {...foldBranches(seriesDef, hourData)} format={soles} formatTick={sol0} highlightKey={String(currentHour)} labelEvery={2} ariaLabel="Venta de hoy por hora" emptyText="Aún no hay ventas hoy" height={200} />}
          </Card>
          <Card title={`Últimos ${SERIES_DAYS} días`} subtitle={`Venta cerrada por día${multi ? " y local" : ""}. Promedio: ${soles(avg)}`}>
            {loading ? <ChartSkeleton /> : <ColumnChart {...foldBranches(seriesDef, dayData)} format={soles} formatTick={sol0} highlightKey={today} labelEvery={2} ariaLabel={`Venta de los últimos ${SERIES_DAYS} días`} height={220} />}
          </Card>
        </div>

        <div className="grid min-w-0 content-start gap-4">
          <Card title="Para atender hoy" subtitle={alerts.length ? `${alerts.length} ${alerts.length === 1 ? "pendiente" : "pendientes"}` : undefined} flush>
            {expiry.isLoading || transfers.isLoading ? (
              <div className="grid gap-2 p-4">{Array.from({ length: 4 }, (_, i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-zinc-100" />)}</div>
            ) : alerts.length === 0 ? (
              <div className="flex items-center gap-3 p-4 text-sm text-zinc-600">
                <CircleCheck className="h-5 w-5 text-emerald-600" /> Todo en orden por ahora.
              </div>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {alerts.map((a) => {
                  const T = TONE[a.tone];
                  return (
                    <li key={a.id}>
                      <Link href={a.href} className="group flex items-start gap-3 px-4 py-3 transition hover:bg-zinc-50 sm:px-5">
                        <T.icon className={cn("mt-0.5 h-4 w-4 shrink-0", T.className)} aria-label={T.label} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold">{a.title}</span>
                          <span className="block text-xs text-zinc-500">{a.detail}</span>
                        </span>
                        <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-zinc-300 transition group-hover:translate-x-0.5 group-hover:text-zinc-500" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card title="Lo más vendido hoy" subtitle="Por importe">
            {loading ? (
              <div className="grid gap-2">{Array.from({ length: 4 }, (_, i) => <div key={i} className="h-8 animate-pulse rounded-lg bg-zinc-100" />)}</div>
            ) : topProducts.length === 0 ? (
              <p className="text-sm text-zinc-400">Aún no hay ventas hoy.</p>
            ) : (
              <ol className="grid gap-2.5">
                {topProducts.map((t) => {
                  const p = productById.get(t.productId);
                  return (
                    <li key={t.productId} className="grid gap-1">
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="min-w-0 truncate">
                          <b className="font-medium">{p?.name ?? `Producto ${t.productId}`}</b> <span className="text-zinc-500">{p?.conc}</span>
                        </span>
                        <span className="shrink-0 tabular-nums">{soles(t.total)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 rounded-full bg-zinc-100">
                          <div className="h-full rounded-full bg-brand" style={{ width: `${(t.total / maxTop) * 100}%` }} />
                        </div>
                        <span className="w-14 text-right text-[11px] tabular-nums text-zinc-500">{t.units.toLocaleString("es-PE")} u</span>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>
        </div>
      </div>

      {multi && (
        <Card title="Por local" flush>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  <th scope="col" className="px-5 py-2.5">Local</th>
                  <th scope="col" className="px-3 py-2.5 text-right">Venta hoy</th>
                  <th scope="col" className="px-3 py-2.5 text-right">Comprobantes</th>
                  <th scope="col" className="px-3 py-2.5 text-right">Promedio diario</th>
                  <th scope="col" className="px-3 py-2.5">Caja</th>
                  <th scope="col" className="px-5 py-2.5 text-right">Efectivo en caja</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {ids.map((b) => {
                  const t = todayStats.find((x) => x.branchId === b);
                  const c = cash.find((x) => x.session.branchId === b);
                  return (
                    <tr key={b}>
                      <th scope="row" className="px-5 py-3 text-left font-medium">
                        <span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: branchColor(allIds, b) }} aria-hidden />
                        {branchName(b)}
                      </th>
                      <td className="px-3 py-3 text-right font-semibold tabular-nums">{soles(t?.total ?? 0)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{t?.tickets ?? 0}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-zinc-600">{soles(averageDay(series, [b]))}</td>
                      <td className="px-3 py-3">
                        {c ? (
                          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", c.session.open ? "bg-emerald-50 text-emerald-700" : "bg-amber-100 text-amber-800")}>
                            {c.session.open ? `Abierta · ${c.session.openedBy ?? ""}` : "Cerrada"}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums">{c?.session.open ? soles(c.expected) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function Card({ title, subtitle, children, flush }: { title: string; subtitle?: string; children: ReactNode; flush?: boolean }) {
  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-zinc-200 bg-white" aria-label={title}>
      <div className={cn("px-4 pt-4 sm:px-5", flush ? "pb-3" : "pb-1")}>
        <h3 className="font-semibold tracking-tight">{title}</h3>
        {subtitle && <p className="text-xs text-zinc-500">{subtitle}</p>}
      </div>
      <div className={flush ? "border-t border-zinc-100" : "px-4 pb-4 sm:px-5"}>{children}</div>
    </section>
  );
}

function Kpi({ icon: Icon, label, value, hint, loading, strong, progress, href }: { icon: LucideIcon; label: string; value: string; hint?: string; loading?: boolean; strong?: boolean; progress?: number; href?: string }) {
  const body = (
    <>
      <p className={cn("flex items-center gap-2 text-xs font-semibold", strong ? "text-white/80" : "text-zinc-600")}>
        <Icon className={cn("h-4 w-4", strong ? "text-accent" : "text-brand")} /> {label}
      </p>
      {loading ? <div className={cn("mt-2 h-8 w-28 animate-pulse rounded", strong ? "bg-white/15" : "bg-zinc-100")} /> : <p className="mt-1.5 truncate text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">{value}</p>}
      {progress !== undefined && (
        <div className="mt-2 h-1 rounded-full bg-white/15" role="meter" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Avance frente al mismo día de la semana pasada">
          <div className="h-full rounded-full bg-accent" style={{ width: `${progress * 100}%` }} />
        </div>
      )}
      {hint && <p className={cn("mt-1 line-clamp-2 text-xs", strong ? "text-white/70" : "text-zinc-500")}>{hint}</p>}
    </>
  );
  const cls = cn("min-w-0 rounded-2xl border p-4", strong ? "border-transparent bg-brand text-white" : "border-zinc-200 bg-white");
  return href ? (
    <Link href={href} className={cn(cls, "transition hover:border-zinc-300")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function ChartSkeleton() {
  return <div className="h-[200px] animate-pulse rounded-xl bg-zinc-50" />;
}
