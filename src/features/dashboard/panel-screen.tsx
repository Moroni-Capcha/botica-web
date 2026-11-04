"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useQueries } from "@tanstack/react-query";
import { ArrowRight, Banknote, CircleAlert, CircleCheck, Info, Receipt, ShoppingCart, TrendingUp, TriangleAlert, UserCheck, type LucideIcon } from "lucide-react";
import type { CashSummary } from "@/lib/api/types";
import { api, errorMessage } from "@/lib/api";
import { useSessionStore } from "@/lib/auth/session-store";
import { qk, useCustomers, useDashboard, useMarks, useProducts, useRefills, useTransfers, useWorkers } from "@/lib/queries";
import { refillRows, toNotify } from "@/lib/domain/customers";
import { buildAlerts, dailyTotals, greeting, isoLocal, sameDayLastWeek, averageDay } from "@/lib/domain/dashboard";
import { alertLook, goalProgress, type AlertShape } from "@/lib/domain/panel";
import { daySummary, DEFAULT_ATTENDANCE } from "@/lib/domain/attendance";
import { inventoryRows } from "@/lib/domain/inventory";
import { round2 } from "@/lib/domain/pharmacy";
import { ColumnChart, type ChartDatum } from "@/components/charts/column-chart";
import { Empty } from "@/components/ui/empty";
import { Button, buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Pulse } from "@/components/ui/pulse";
import { sectionLabelClass } from "@/components/ui/section-label";
import { Table, rowButtonClass, td } from "@/components/ui/table";
import { TONE_CLASS } from "@/components/ui/tone";
import { stagger } from "@/lib/motion";
import { branchColor, foldBranches } from "@/lib/chart-colors";
import { soles } from "@/lib/format";
import { cn } from "@/lib/cn";
import { allLabel, ScopeToggle, useBranchScope } from "@/features/shared/branch-scope";
import { useExpiryData } from "@/features/expiry/use-expiry-data";
import { SetupChecklist } from "@/features/onboarding/setup-checklist";

const SERIES_DAYS = 14;
const DOW = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const ALERT_ICON: Record<AlertShape, LucideIcon> = { "circle-alert": CircleAlert, "triangle-alert": TriangleAlert, info: Info };
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
  const returnsToday = round2(todayStats.reduce((a, t) => a + t.returns, 0));
  const grossToday = round2(todayStats.reduce((a, t) => a + t.gross, 0));
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

  const loading = dashboard.isLoading;
  const alertsLoading = expiry.isLoading || transfers.isLoading;
  const firstName = user?.name.replace(/^Q\.F\.\s*/, "").split(" ")[0] ?? "";
  const vsWeek = lastWeek ? round2(totalToday - lastWeek.total) : null;
  const lastWeekDow = lastWeek ? DOW[new Date(`${lastWeek.date}T12:00:00`).getDay()] : "";
  const critical = alerts.filter((a) => a.tone === "critical").length;
  const dateLabel = new Date(now).toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" });
  const scopeLabel = multi ? allLabel(ids.length) : branchName(operating);

  if (dashboard.error) {
    return (
      <div className="mx-auto grid max-w-7xl gap-4 p-4 sm:p-6">
        <Card role="alert" className="flex flex-wrap items-center gap-4 border-danger-border bg-danger-bg">
          <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", TONE_CLASS.danger.soft)}>
            <TriangleAlert className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-danger-fg">No se pudo cargar el panel</p>
            <p className="text-caption text-danger-fg">{errorMessage(dashboard.error)}</p>
          </div>
          <Button variant="danger" onClick={() => void dashboard.refetch()}>
            Reintentar
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-7xl gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[14rem] flex-1">
          <p className="text-xl font-semibold tracking-tight text-fg">
            {greeting(now)}, {firstName}
          </p>
          <p className="text-small text-muted">
            <span className="inline-block first-letter:uppercase">{dateLabel}</span> · Resumen de {multi ? scopeLabel.toLowerCase() : scopeLabel} · se actualiza cada minuto
          </p>
        </div>
        {isAdmin && <ScopeToggle scope={scope.scope} onChange={scope.setScope} operatingName={branchName(operating)} />}
        {user?.permissions.includes("pos") && (
          <Link href="/pos" className={buttonClass("primary", "md")}>
            <ShoppingCart className="h-4 w-4" aria-hidden /> Vender
          </Link>
        )}
      </div>
      {/* Solo cambia cuando la persona cambia de local: es el único aviso en voz alta del panel */}
      {isAdmin && (
        <p className="sr-only" aria-live="polite">
          Mostrando {scopeLabel}
        </p>
      )}

      <SetupChecklist />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-[1.6fr_repeat(3,1fr)]">
        <Kpi
          index={0}
          focal
          icon={TrendingUp}
          label="Venta de hoy"
          value={soles(totalToday)}
          loading={loading}
          hint={lastWeek ? (vsWeek! >= 0 ? `Ya supera al ${lastWeekDow} pasado (${sol0(lastWeek.total)})` : `Faltan ${sol0(-vsWeek!)} para igualar el ${lastWeekDow} pasado`) : `Promedio diario: ${sol0(avg)}`}
          progress={goalProgress(totalToday, lastWeek?.total)}
        />
        <Kpi index={1} icon={Receipt} label="Comprobantes" value={String(ticketsToday)} loading={loading} hint={ticketsToday ? `Ticket promedio ${soles(totalToday / ticketsToday)}` : "Aún no hay ventas hoy"} />
        <Kpi index={2} icon={Banknote} label="Efectivo en caja" value={soles(cashExpected)} loading={cashQ.some((q) => q.isLoading)} hint={`Yape/Plin ${sol0(digital.yape)} · Tarjeta ${sol0(digital.tarjeta)}`} />
        {isAdmin ? (
          <Kpi index={3} wide icon={UserCheck} label="Personal en turno" value={attendanceToday ? `${onShift} de ${scheduled}` : "—"} loading={workers.isLoading || marks.isLoading} hint={attendanceToday ? `${attendanceToday.filter((s) => s.late > 0).length} tardanzas hoy` : ""} href="/asistencia" />
        ) : (
          <Kpi index={3} wide icon={CircleAlert} label="Pendientes" value={String(alerts.length)} loading={expiry.isLoading} hint={critical ? `${critical} urgentes` : "Nada urgente"} />
        )}
      </div>

      {returnsToday > 0 && (
        <p className="rounded-xl bg-sunken px-4 py-2 text-caption tabular-nums text-fg-2">
          Hoy: vendido {soles(grossToday)} − devoluciones / notas de crédito {soles(returnsToday)} = venta neta {soles(totalToday)}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="grid min-w-0 content-start gap-4">
          <PanelCard title="Venta por hora · hoy" subtitle={`Hasta las ${new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}`}>
            {loading ? <ChartSkeleton height={200} /> : <ColumnChart {...foldBranches(seriesDef, hourData)} grow format={soles} formatTick={sol0} highlightKey={String(currentHour)} labelEvery={2} ariaLabel="Venta de hoy por hora" emptyText="Aún no hay ventas hoy" height={200} />}
          </PanelCard>
          <PanelCard title={`Últimos ${SERIES_DAYS} días`} subtitle={`Venta neta por día${multi ? " y local" : ""}, ya sin devoluciones. Promedio: ${soles(avg)}`}>
            {loading ? <ChartSkeleton height={220} /> : <ColumnChart {...foldBranches(seriesDef, dayData)} grow format={soles} formatTick={sol0} highlightKey={today} labelEvery={2} ariaLabel={`Venta de los últimos ${SERIES_DAYS} días`} height={220} />}
          </PanelCard>
        </div>

        <div className="grid min-w-0 content-start gap-4">
          <PanelCard
            title="Para atender hoy"
            flush
            scroll
            badge={!alertsLoading && alerts.length > 0 ? <Chip tone={critical ? "danger" : "neutral"}>{alerts.length} {alerts.length === 1 ? "pendiente" : "pendientes"}</Chip> : undefined}
          >
            {alertsLoading ? (
              <div className="grid gap-2 p-4" aria-hidden>
                {Array.from({ length: 4 }, (_, i) => (
                  <div key={i} className="h-12 animate-pulse rounded-xl bg-sunken" />
                ))}
              </div>
            ) : alerts.length === 0 ? (
              <Empty compact icon={CircleCheck} title="Todo en orden por hoy">
                No hay nada que atender en este momento.
              </Empty>
            ) : (
              <ul className="divide-y divide-line-soft">
                {alerts.map((a) => {
                  const look = alertLook(a.tone);
                  const Icon = ALERT_ICON[look.shape];
                  return (
                    <li key={a.id}>
                      <Link href={a.href} className={cn(rowButtonClass, "group flex min-h-11 items-start gap-3 px-4 py-3 sm:px-5")}>
                        <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", TONE_CLASS[look.tone].soft)}>
                          <Icon className="h-4 w-4" aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-small font-medium text-fg">
                            <span className="sr-only">{look.label}: </span>
                            {a.title}
                          </span>
                          <span className="block text-caption text-muted">{a.detail}</span>
                        </span>
                        <ArrowRight className="mt-1.5 h-4 w-4 shrink-0 text-muted transition-transform duration-[var(--dur-fast)] ease-[var(--ease-out)] group-hover:translate-x-0.5" aria-hidden />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </PanelCard>

          <PanelCard title="Lo más vendido hoy" subtitle="Por importe">
            {loading ? (
              <div className="mt-2 grid gap-2" aria-hidden>
                {Array.from({ length: 4 }, (_, i) => (
                  <div key={i} className="h-8 animate-pulse rounded-lg bg-sunken" />
                ))}
              </div>
            ) : topProducts.length === 0 ? (
              <Empty compact icon={Receipt} title="Aún no hay ventas hoy" />
            ) : (
              <ol className="mt-2 grid gap-2.5">
                {topProducts.map((t) => {
                  const p = productById.get(t.productId);
                  return (
                    <li key={t.productId} className="grid gap-1">
                      <div className="flex items-baseline justify-between gap-2 text-small">
                        <span className="min-w-0 truncate">
                          <b className="font-medium">{p?.name ?? `Producto ${t.productId}`}</b> <span className="text-muted">{p?.conc}</span>
                        </span>
                        <span className="shrink-0 tabular-nums">{soles(t.total)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken">
                          <div className="h-full rounded-full bg-brand" style={{ width: `${(t.total / maxTop) * 100}%` }} />
                        </div>
                        <span className="w-14 text-right text-micro tabular-nums text-muted">{t.units.toLocaleString("es-PE")} u</span>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </PanelCard>
        </div>
      </div>

      {multi && (
        <PanelCard title="Por local" flush>
          <Table
            minWidth={640}
            head={["Local", { label: "Venta hoy (neta)", align: "right" }, { label: "Devoluciones", align: "right" }, { label: "Comprobantes", align: "right" }, { label: "Promedio diario", align: "right" }, "Caja", { label: "Efectivo en caja", align: "right" }]}
          >
            {ids.map((b) => {
              const t = todayStats.find((x) => x.branchId === b);
              const c = cash.find((x) => x.session.branchId === b);
              return (
                <tr key={b}>
                  <th scope="row" className={cn(td, "text-left text-small font-medium")}>
                    <span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: branchColor(allIds, b) }} aria-hidden />
                    {branchName(b)}
                  </th>
                  <td className={cn(td, "text-right font-semibold tabular-nums")}>{soles(t?.total ?? 0)}</td>
                  <td className={cn(td, "text-right tabular-nums text-fg-2")}>{t?.returns ? `−${soles(t.returns)}` : "—"}</td>
                  <td className={cn(td, "text-right tabular-nums")}>{t?.tickets ?? 0}</td>
                  <td className={cn(td, "text-right tabular-nums text-fg-2")}>{soles(averageDay(series, [b]))}</td>
                  <td className={td}>{c ? <Chip tone={c.session.open ? "success" : "warning"}>{c.session.open ? `Abierta · ${c.session.openedBy ?? ""}` : "Cerrada"}</Chip> : "—"}</td>
                  <td className={cn(td, "text-right tabular-nums")}>{c?.session.open ? soles(c.expected) : "—"}</td>
                </tr>
              );
            })}
          </Table>
        </PanelCard>
      )}
    </div>
  );
}

/** Tarjeta con título (h2) y subtítulo. `flush`: el contenido va de borde a borde. `scroll`: altura máxima con desplazamiento y encabezado fijo. */
function PanelCard({ title, subtitle, badge, children, flush, scroll }: { title: string; subtitle?: string; badge?: ReactNode; children: ReactNode; flush?: boolean; scroll?: boolean }) {
  const id = useId();
  return (
    <Card as="section" padding="none" aria-labelledby={id} className="min-w-0 overflow-hidden">
      <div className={cn(scroll && "max-h-[32rem] overflow-y-auto")}>
        <div className={cn("flex items-start justify-between gap-3 px-4 pt-4 sm:px-5", flush ? "border-b border-line-soft pb-3" : "pb-1", scroll && "sticky top-0 z-10 bg-surface")}>
          <div className="min-w-0">
            <h2 id={id} className={sectionLabelClass}>
              {title}
            </h2>
            {subtitle && <p className="mt-0.5 text-caption text-muted">{subtitle}</p>}
          </div>
          {badge}
        </div>
        <div className={flush ? undefined : "px-4 pb-4 sm:px-5"}>{children}</div>
      </div>
    </Card>
  );
}

/** Cifra del panel. La principal ("focal") va rellena con el color de la botica; las demás, más calladas. Entran escalonadas una sola vez al abrir. */
function Kpi({ icon: Icon, label, value, hint, loading, focal, wide, progress, href, index }: { icon: LucideIcon; label: string; value: string; hint?: string; loading?: boolean; focal?: boolean; wide?: boolean; progress?: number; href?: string; index: number }) {
  const body = (
    <>
      <p className={cn("flex items-center gap-2 text-caption font-semibold", focal ? "text-white/85" : "text-muted")}>
        <Icon className={cn("h-4 w-4 shrink-0", focal ? "text-accent" : "text-muted")} aria-hidden /> {label}
      </p>
      {loading ? (
        <div className={cn("mt-2 animate-pulse rounded-lg", focal ? "h-10 w-44 bg-white/15" : "h-7 w-24 bg-sunken")} aria-hidden />
      ) : (
        <p className={cn("mt-2 max-w-full break-words font-semibold tracking-tight tabular-nums", focal ? "text-4xl" : "text-xl")}>
          <Pulse value={value}>{value}</Pulse>
        </p>
      )}
      {progress !== undefined && !loading && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/20" role="meter" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Avance frente al mismo día de la semana pasada">
          <div className="h-full origin-left rounded-full bg-accent transition-transform duration-[var(--dur-base)] ease-[var(--ease-out)]" style={{ transform: `scaleX(${progress})` }} />
        </div>
      )}
      {hint && <p className={cn("mt-2 text-caption", focal ? "text-white/85" : "line-clamp-2 text-muted")}>{hint}</p>}
    </>
  );
  const cls = cn("min-w-0 animate-stagger-in", focal ? "col-span-2 border-transparent bg-brand p-5 text-white sm:col-span-3 lg:col-span-1" : cn("p-4", wide && "col-span-2 sm:col-span-1"));
  const style = stagger(index);
  return href ? (
    <Link href={href} style={style} className={cn("rounded-2xl border border-line bg-surface transition-colors duration-[var(--dur-fast)] hover:bg-subtle", cls)}>
      {body}
    </Link>
  ) : (
    <Card padding="none" style={style} className={cls}>
      {body}
    </Card>
  );
}

function ChartSkeleton({ height }: { height: number }) {
  return <div className="mt-2 animate-pulse rounded-xl bg-sunken" style={{ height }} aria-hidden />;
}
