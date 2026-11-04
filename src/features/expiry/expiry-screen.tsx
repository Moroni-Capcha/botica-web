"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { CircleCheck, FileSpreadsheet, Search, TrendingDown, TriangleAlert, X } from "lucide-react";
import type { BranchId } from "@/lib/api/types";
import { errorMessage } from "@/lib/api";
import { useSessionStore } from "@/lib/auth/session-store";
import { useSetLotDiscount } from "@/lib/queries";
import { DISCOUNT_STEPS, TONE_ORDER, priorityList, summarizeByTone, toneRange, type LotRisk } from "@/lib/domain/expiry";
import type { ExpiryTone } from "@/lib/domain/pharmacy";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { IconButton } from "@/components/ui/icon-button";
import { Input, Select } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { TONE } from "@/components/ui/badges";
import { notify } from "@/components/ui/toast";
import { soles } from "@/lib/format";
import { useMediaQuery } from "@/lib/use-media-query";
import { useStableCallback } from "@/lib/use-stable-callback";
import { useExpiryData, VELOCITY_DAYS } from "./use-expiry-data";
import { WriteOffDialog } from "./write-off-dialog";
import { exportExpiry } from "./export";
import { LotList, PriorityList } from "./expiry-lists";
import { TONE_ICON, fmtInt, type ExpShared } from "./expiry-rows";
import { ScopeToggle, useBranchScope } from "@/features/shared/branch-scope";
import { Kpi } from "@/features/shared/kpi";

type Tab = "prioridad" | "lotes";
type ToneFilter = ExpiryTone | "todos";

/** Color del número de cada grupo del semáforo (el texto y el icono siempre dicen cuál es). */
const TONE_VALUE_CLASS: Record<ExpiryTone, string> = { vencido: "text-fg", critico: "text-danger-fg", por_vencer: "text-warning-fg", vigente: "text-success-fg" };
const TONE_ICON_CLASS: Record<ExpiryTone, string> = { vencido: "text-fg", critico: "text-danger", por_vencer: "text-warning", vigente: "text-success" };

export function ExpiryScreen() {
  const user = useSessionStore((s) => s.session?.user);
  const setAdminBranch = useSessionStore((s) => s.setAdminBranch);
  const { allBranches, scope, setScope, ids: scopeIds, multi, isAdmin, operating, branches, branchName, label: scopeLabel } = useBranchScope();
  const { rows: allRows, rates, thresholds, products, pharmacy, isLoading, error, refetch } = useExpiryData(scopeIds);
  const wide = useMediaQuery("(min-width: 768px)");

  const [tab, setTab] = useState<Tab>("prioridad");
  const [tone, setTone] = useState<ToneFilter>("todos");
  const [q, setQ] = useState("");
  const dq = useDeferredValue(q);
  const [lab, setLab] = useState("Todos");
  const [category, setCategory] = useState("Todos");
  const [selected, setSelected] = useState<number[]>([]);
  const [writeOff, setWriteOff] = useState<LotRisk | null>(null);
  const discount = useSetLotDiscount();

  const labs = useMemo(() => [...new Set(products.map((p) => p.lab))].sort((a, b) => a.localeCompare(b)), [products]);
  const categories = useMemo(() => [...new Set(products.map((p) => p.category))].sort((a, b) => a.localeCompare(b)), [products]);
  const names = useMemo(() => Object.fromEntries(allBranches.map((b) => [b.id, b.name])), [allBranches]);
  const branchIds = useMemo(() => branches.map((b) => b.id), [branches]);

  /* Filtros de laboratorio y tipo: aplican a las tarjetas, las dos pestañas y el Excel */
  const rows = useMemo(() => allRows.filter((r) => (lab === "Todos" || r.product.lab === lab) && (category === "Todos" || r.product.category === category)), [allRows, lab, category]);
  const summary = useMemo(() => summarizeByTone(rows), [rows]);
  const priority = useMemo(() => priorityList(rows), [rows]);
  const lossTotal = priority.reduce((s, r) => s + r.loss, 0);
  const unitsAtRisk = priority.reduce((s, r) => s + r.atRisk, 0);

  const lotRows = useMemo(() => {
    const s = dq.trim().toLowerCase();
    return rows
      .filter((r) => (tone === "todos" || r.tone === tone) && (!s || [r.product.name, r.product.active, r.product.lab, r.lot.code].some((f) => f.toLowerCase().includes(s))))
      .sort((a, b) => a.days - b.days || a.product.name.localeCompare(b.product.name));
  }, [rows, tone, dq]);

  const canSell = user?.permissions.includes("pos") ?? false;
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const visibleIds = useMemo(() => priority.map((r) => r.lot.id), [priority]);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedSet.has(id));

  const onToggle = useStableCallback((id: number) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id])));
  const onWriteOff = useStableCallback((r: LotRisk) => setWriteOff(r));
  const onSell = useStableCallback((branchId: BranchId) => {
    if (isAdmin) setAdminBranch(branchId);
  });
  const shared: ExpShared = useMemo(() => ({ multi, names, branchIds, rates, canSell, onToggle, onWriteOff, onSell }), [multi, names, branchIds, rates, canSell, onToggle, onWriteOff, onSell]);

  /* Escalonado de la primera carga: solo las primeras 8 filas y una vez por montaje. Después se apaga para que nada se repita al filtrar. */
  const staggerIds = useRef<Map<number, number> | null>(null);
  if (!isLoading && staggerIds.current === null) staggerIds.current = new Map(priority.slice(0, 8).map((r, i) => [r.lot.id, i]));
  useEffect(() => {
    if (isLoading) return;
    const id = setTimeout(() => {
      staggerIds.current = new Map();
    }, 800);
    return () => clearTimeout(id);
  }, [isLoading]);
  const stagIds = staggerIds.current ?? EMPTY_STAG;

  const applyDiscount = async (value: number) => {
    const chosen = priority.filter((r) => selectedSet.has(r.lot.id));
    const byBranch = new Map<BranchId, number[]>();
    for (const r of chosen) byBranch.set(r.branchId, [...(byBranch.get(r.branchId) ?? []), r.lot.id]);
    try {
      await Promise.all([...byBranch].map(([branchId, lotIds]) => discount.mutateAsync({ branchId, lotIds, discount: value })));
      notify(value ? `Descuento de ${Math.round(value * 100)} % aplicado a ${chosen.length} ${chosen.length === 1 ? "lote" : "lotes"}. El punto de venta ya lo cobra.` : "Descuento quitado");
      setSelected([]);
    } catch (e) {
      notify(errorMessage(e), "warn");
    }
  };

  const doExport = () => {
    exportExpiry({ rows, branches: allBranches, scopeLabel, pharmacy, thresholds, velocityDays: VELOCITY_DAYS });
    notify("Excel de vencimientos descargado");
  };

  const clearLotFilters = () => {
    setQ("");
    setTone("todos");
  };

  if (error) {
    return (
      <div className="mx-auto max-w-7xl p-4 sm:p-6">
        <Card padding="none">
          <Empty icon={TriangleAlert} title="No se pudieron cargar los vencimientos">
            {errorMessage(error)}{" "}
            <button type="button" className="font-semibold underline" onClick={() => void refetch()}>
              Reintentar
            </button>
          </Empty>
        </Card>
      </div>
    );
  }

  const countText = isLoading
    ? ""
    : tab === "prioridad"
      ? `${fmtInt(priority.length)} ${priority.length === 1 ? "lote" : "lotes"} con unidades en riesgo`
      : `${fmtInt(lotRows.length)}${lotRows.length !== rows.length ? ` de ${fmtInt(rows.length)}` : ""} ${rows.length === 1 ? "lote" : "lotes"}`;
  const listKey = `${scope}|${lab}|${category}|${tone}|${dq}`;
  const toggleAll = () => setSelected(allSelected ? [] : visibleIds);

  return (
    <div className="mx-auto grid max-w-7xl gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        {isAdmin && (
          <ScopeToggle
            scope={scope}
            operatingName={branchName(operating)}
            onChange={(v) => {
              setScope(v);
              setSelected([]);
            }}
          />
        )}
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          <Button onClick={doExport} disabled={isLoading || rows.length === 0}>
            <FileSpreadsheet className="h-4 w-4 text-success-fg" aria-hidden /> Excel
          </Button>
        </div>
      </div>

      {/* Lo primero: cuánto dinero está en riesgo. Después, los grupos del semáforo, que filtran la lista. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,1fr))]" aria-busy={isLoading}>
        <Kpi
          strong
          icon={TrendingDown}
          label="Pérdida estimada si no se actúa"
          value={soles(lossTotal)}
          hint={`${fmtInt(unitsAtRisk)} unid. en riesgo según la venta de ${VELOCITY_DAYS} días`}
          loading={isLoading}
        />
        {summary.map((g) => {
          const active = tab === "lotes" && tone === g.tone;
          return (
            <Kpi
              key={g.tone}
              icon={TONE_ICON[g.tone]}
              iconClass={TONE_ICON_CLASS[g.tone]}
              label={TONE[g.tone].label}
              value={`${g.lots} ${g.lots === 1 ? "lote" : "lotes"}`}
              valueClass={g.lots ? TONE_VALUE_CLASS[g.tone] : "text-muted"}
              hint={
                <>
                  <span className="block">{toneRange(g.tone, thresholds)}</span>
                  <span className="block tabular-nums">
                    {fmtInt(g.units)} unid. · {soles(g.value)} a costo
                  </span>
                </>
              }
              loading={isLoading}
              active={active}
              onClick={() => {
                setTab("lotes");
                setTone(active ? "todos" : g.tone);
              }}
            />
          );
        })}
      </div>

      <Card as="section" padding="none" className="overflow-hidden" aria-labelledby="exp-title">
        <div className="grid gap-3 border-b border-line-soft p-4 sm:px-5">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <h2 id="exp-title" className="font-semibold tracking-tight">
              {tab === "prioridad" ? "Prioridad de venta" : "Todos los lotes"}
            </h2>
            <p className="text-caption tabular-nums text-muted" aria-live="polite" role="status">
              {countText}
            </p>
          </div>
          {tab === "prioridad" && (
            <p className="max-w-3xl text-caption leading-relaxed text-muted">
              Con la venta de los últimos {VELOCITY_DAYS} días y el orden FEFO, estos lotes no alcanzan a venderse antes de su fecha. Aplica un descuento, ofrécelos en mostrador, trasládalos al local que más los vende o pide canje al proveedor.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Segmented<Tab>
              label="Vista"
              value={tab}
              onChange={setTab}
              options={[
                { id: "prioridad", label: "Prioridad de venta", count: priority.length },
                { id: "lotes", label: "Todos los lotes", count: rows.length },
              ]}
            />
            <div className="flex w-full flex-wrap gap-2 sm:ml-auto sm:w-auto">
              <Select value={lab} onChange={(e) => setLab(e.target.value)} className="min-w-0 flex-1 sm:w-48 sm:flex-none" aria-label="Laboratorio o marca">
                <option value="Todos">Todos los laboratorios</option>
                {labs.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </Select>
              <Select value={category} onChange={(e) => setCategory(e.target.value)} className="min-w-0 flex-1 sm:w-44 sm:flex-none" aria-label="Tipo de producto">
                <option value="Todos">Todos los tipos</option>
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </div>
          </div>
          {tab === "lotes" && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-0 flex-1 basis-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
                <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Producto, principio activo, lote o laboratorio" className="pl-9" aria-label="Buscar lote" />
              </div>
              <Segmented<ToneFilter>
                label="Estado"
                value={tone}
                onChange={setTone}
                options={[{ id: "todos", label: "Todos" }, ...TONE_ORDER.map((t) => ({ id: t, label: TONE[t].label, count: summary.find((s) => s.tone === t)?.lots ?? 0 }))]}
              />
            </div>
          )}
        </div>

        {tab === "prioridad" && selected.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 border-b border-line-soft bg-subtle px-4 py-2 sm:px-5" role="group" aria-label="Descuento para los lotes elegidos">
            <span className="mr-1 text-caption font-semibold text-fg-2">
              {selected.length} {selected.length === 1 ? "lote elegido" : "lotes elegidos"}:
            </span>
            {DISCOUNT_STEPS.map((v) => (
              <Button key={v} size="sm" variant="secondary" disabled={discount.isPending} onClick={() => void applyDiscount(v)} aria-label={`Aplicar ${Math.round(v * 100)} % de descuento a ${selected.length} ${selected.length === 1 ? "lote" : "lotes"}`}>
                Aplicar -{Math.round(v * 100)} %
              </Button>
            ))}
            <Button size="sm" variant="ghost" disabled={discount.isPending} onClick={() => void applyDiscount(0)}>
              Quitar descuento
            </Button>
            <IconButton size="sm" onClick={() => setSelected([])} aria-label="Limpiar selección" className="ml-auto">
              <X className="h-4 w-4" aria-hidden />
            </IconButton>
          </div>
        )}

        {isLoading ? (
          <RowsSkeleton wide={wide} />
        ) : (
          <div key={tab} className="animate-swap-in">
  tab === "prioridad" ? (
            priority.length === 0 ? (
              <Empty icon={CircleCheck} title="Ningún lote en riesgo">
                Con la venta actual, todo se venderá antes de vencer.
              </Empty>
            ) : (
              <PriorityList key={listKey} rows={priority} wide={wide} shared={shared} stagIds={stagIds} selected={selectedSet} allSelected={allSelected} onToggleAll={toggleAll} />
            )
          ) : lotRows.length === 0 ? (
            <Empty icon={Search} title="Sin lotes para este filtro">
              {(q.trim() !== "" || tone !== "todos") && (
                <button type="button" className="font-semibold underline" onClick={clearLotFilters}>
                  Limpiar filtros
                </button>
              )}
            </Empty>
          ) : (
            <LotList key={listKey} rows={lotRows} wide={wide} shared={shared} stagIds={stagIds} />
          </div>
        )}
      </Card>

      {writeOff && <WriteOffDialog row={writeOff} onClose={() => setWriteOff(null)} />}
    </div>
  );
}

const EMPTY_STAG = new Map<number, number>();

/** Esqueleto con la altura de las filas: la lista no salta cuando llegan los datos. */
function RowsSkeleton({ wide }: { wide: boolean }) {
  return (
    <div className="grid gap-2 p-4 sm:p-5" aria-busy="true" aria-label="Cargando">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className={wide ? "h-14 animate-pulse rounded-xl bg-sunken" : "h-32 animate-pulse rounded-2xl bg-sunken"} />
      ))}
    </div>
  );
}
