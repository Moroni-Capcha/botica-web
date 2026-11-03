"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, FileSpreadsheet, PackageX, Plus, Search, Tag, TriangleAlert, Wallet, X } from "lucide-react";
import type { Product } from "@/lib/api/types";
import { errorMessage } from "@/lib/api";
import { useConfig, useProducts } from "@/lib/queries";
import { groupInventory, inventoryRows } from "@/lib/domain/inventory";
import { DEFAULT_THRESHOLDS, round2 } from "@/lib/domain/pharmacy";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { Input, Select } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { Table, rowButtonClass, td } from "@/components/ui/table";
import { notify } from "@/components/ui/toast";
import { soles } from "@/lib/format";
import { cn } from "@/lib/cn";
import { useMediaQuery } from "@/lib/use-media-query";
import { useStableCallback } from "@/lib/use-stable-callback";
import { ScopeToggle, useBranchLots, useBranchScope } from "@/features/shared/branch-scope";
import { exportInventory } from "./export";
import { Kpi, ProductCard, ProductRow, type RowShared } from "./inventory-rows";
import { ProductDetailDialog } from "./product-detail-dialog";
import { ProductFormDialog } from "./product-form-dialog";
import { BRANCH_STOCK_CLASS, branchStockTone, shouldFocusSearch } from "./stock-tone";

type GroupBy = "producto" | "lab" | "category";
type StatusFilter = "todos" | "bajo" | "agotado" | "vencido" | "receta";

const fmtInt = (n: number) => n.toLocaleString("es-PE");
const isEditable = (el: Element | null) =>
  !!el && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || (el instanceof HTMLElement && el.isContentEditable));

export function InventoryScreen() {
  const scope = useBranchScope();
  const { allBranches, ids: branchIds, multi, isAdmin, operating, branchName } = scope;
  const config = useConfig();
  const products = useProducts();
  const lotsQ = useBranchLots(branchIds);
  const [now] = useState(() => Date.now());
  const thresholds = config.data?.expiry ?? DEFAULT_THRESHOLDS;
  const wide = useMediaQuery("(min-width: 768px)");

  const [q, setQ] = useState("");
  const [lab, setLab] = useState("Todos");
  const [category, setCategory] = useState("Todos");
  const [form, setForm] = useState("Todos");
  const [status, setStatus] = useState<StatusFilter>("todos");
  const [groupBy, setGroupBy] = useState<GroupBy>("producto");
  const [detailId, setDetailId] = useState<number | null>(null);
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const productList = useMemo(() => products.data ?? [], [products.data]);
  const all = useMemo(() => inventoryRows(productList, lotsQ.lots, branchIds, now), [productList, lotsQ.lots, branchIds, now]);
  const options = useMemo(() => {
    const uniq = (f: (p: Product) => string) => [...new Set(productList.map(f))].sort((a, b) => a.localeCompare(b));
    return { labs: uniq((p) => p.lab), categories: uniq((p) => p.category), forms: uniq((p) => p.form) };
  }, [productList]);
  const names = useMemo(() => Object.fromEntries(allBranches.map((b) => [b.id, b.name])), [allBranches]);

  /* Laboratorio, tipo, forma y búsqueda filtran todo (tarjetas, tabla y Excel) */
  const base = useMemo(() => {
    const s = q.trim().toLowerCase();
    return all.filter(({ product: p }) => {
      if (lab !== "Todos" && p.lab !== lab) return false;
      if (category !== "Todos" && p.category !== category) return false;
      if (form !== "Todos" && p.form !== form) return false;
      return !s || [p.name, p.active, p.lab, p.barcode, p.conc].some((f) => f.toLowerCase().includes(s));
    });
  }, [all, q, lab, category, form]);

  const rows = useMemo(
    () =>
      base
        .filter((r) => (status === "todos" ? true : status === "bajo" ? r.status === "bajo" : status === "agotado" ? r.status === "agotado" : status === "vencido" ? r.expired > 0 : r.product.rx !== "libre"))
        .sort((a, b) => a.product.name.localeCompare(b.product.name) || a.product.conc.localeCompare(b.product.conc)),
    [base, status],
  );
  const groups = useMemo(() => (groupBy === "producto" ? [] : groupInventory(base, groupBy, branchIds)), [base, groupBy, branchIds]);
  const maxGroup = Math.max(1, ...groups.map((g) => g.valueCost));

  const kpi = useMemo(() => {
    const valueCost = round2(base.reduce((s, r) => s + r.valueCost, 0));
    const valueRetail = round2(base.reduce((s, r) => s + r.valueRetail, 0));
    const perBranch = branchIds.map((b) => ({ b, v: round2(base.reduce((s, r) => s + (r.perBranch[b] ?? 0) * r.product.cost, 0)) }));
    return {
      products: base.length,
      lots: base.reduce((s, r) => s + r.lots, 0),
      valueCost,
      valueRetail,
      perBranch,
      alerts: base.filter((r) => r.status !== "ok").length,
      out: base.filter((r) => r.status === "agotado").length,
      expiredUnits: base.reduce((s, r) => s + r.expired, 0),
      count: (f: StatusFilter) => (f === "bajo" ? base.filter((r) => r.status === "bajo").length : f === "agotado" ? base.filter((r) => r.status === "agotado").length : f === "vencido" ? base.filter((r) => r.expired > 0).length : f === "receta" ? base.filter((r) => r.product.rx !== "libre").length : base.length),
    };
  }, [base, branchIds]);

  const isLoading = products.isLoading || lotsQ.isLoading;
  const error = products.error ?? lotsQ.error;
  const detail = detailId !== null ? productList.find((p) => p.id === detailId) : undefined;

  /* Escalonado de la primera carga: solo las primeras 8 filas y una vez por montaje. Filtrar o buscar no lo repite. */
  const staggerIds = useRef<Map<number, number> | null>(null);
  if (!isLoading && staggerIds.current === null) staggerIds.current = new Map(rows.slice(0, 8).map((r, i) => [r.product.id, i]));

  /* F2 o / llevan al buscador (no con un diálogo abierto ni mientras se escribe en otro campo) */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const active = document.activeElement;
      if (!shouldFocusSearch(e, { dialogOpen: !!document.querySelector('[aria-modal="true"]'), inEditable: isEditable(active), inSearch: !!active && active === searchRef.current })) return;
      e.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const hasFilters = q.trim() !== "" || lab !== "Todos" || category !== "Todos" || form !== "Todos" || (groupBy === "producto" && status !== "todos");
  const clearFilters = () => {
    setQ("");
    setLab("Todos");
    setCategory("Todos");
    setForm("Todos");
    setStatus("todos");
  };
  const quickFilter = (f: StatusFilter) => {
    setGroupBy("producto");
    setStatus(status === f ? "todos" : f);
  };

  const doExport = () => {
    exportInventory({ rows: base, lots: lotsQ.lots, branches: allBranches, branchIds, scopeLabel: scope.label, pharmacy: config.data?.pharmacy });
    notify("Inventario valorizado descargado");
  };

  const onOpen = useStableCallback((id: number) => setDetailId(id));
  const onEdit = useStableCallback((p: Product) => setEditing(p));
  const shared: RowShared = { multi, branchIds, names, operating, thresholds, now, canEdit: isAdmin, onOpen, onEdit };
  const stagFor = (id: number) => staggerIds.current?.get(id) ?? -1;

  if (error) {
    return (
      <div className="mx-auto max-w-7xl p-4 sm:p-6">
        <Card padding="none">
          <Empty icon={TriangleAlert} title="No se pudo cargar el inventario">
            {errorMessage(error)}{" "}
            <button type="button" className="font-semibold underline" onClick={() => void Promise.all([products.refetch(), lotsQ.refetch()])}>
              Reintentar
            </button>
          </Empty>
        </Card>
      </div>
    );
  }

  const countText = isLoading
    ? ""
    : groupBy === "producto"
      ? `${fmtInt(rows.length)}${rows.length !== kpi.products ? ` de ${fmtInt(kpi.products)}` : ""} ${kpi.products === 1 ? "producto" : "productos"}`
      : `${fmtInt(groups.length)} ${groups.length === 1 ? "grupo" : "grupos"}`;

  return (
    <div className="mx-auto grid max-w-7xl gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        {isAdmin && <ScopeToggle scope={scope.scope} onChange={scope.setScope} operatingName={branchName(operating)} />}
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          <Button onClick={doExport} disabled={isLoading || base.length === 0}>
            <FileSpreadsheet className="h-4 w-4 text-success-fg" aria-hidden /> Inventario valorizado
          </Button>
          {isAdmin && (
            <Button variant="primary" onClick={() => setEditing("new")}>
              <Plus className="h-4 w-4" aria-hidden /> Nuevo producto
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,1fr))]" aria-busy={isLoading}>
        <Kpi
          strong
          icon={Wallet}
          label="Inventario a costo"
          value={soles(kpi.valueCost)}
          hint={multi ? kpi.perBranch.map(({ b, v }) => `${branchName(b)} ${soles(v)}`).join(" · ") : kpi.expiredUnits ? `Incluye ${fmtInt(kpi.expiredUnits)} unid. vencidas` : "Sin unidades vencidas"}
          loading={isLoading}
        />
        <Kpi icon={Tag} label="A precio de venta" value={soles(kpi.valueRetail)} hint="Solo stock vigente, por unidad" loading={isLoading} />
        <Kpi
          icon={TriangleAlert}
          label="Bajo mínimo"
          value={fmtInt(kpi.count("bajo"))}
          hint="Productos por reponer"
          valueClass={kpi.count("bajo") ? "text-warning-fg" : undefined}
          loading={isLoading}
          active={groupBy === "producto" && status === "bajo"}
          onClick={() => quickFilter("bajo")}
        />
        <Kpi
          icon={PackageX}
          label="Agotados"
          value={fmtInt(kpi.out)}
          hint={kpi.out ? "Sin stock vigente" : "Ninguno agotado"}
          valueClass={kpi.out ? "text-danger-fg" : undefined}
          loading={isLoading}
          active={groupBy === "producto" && status === "agotado"}
          onClick={() => quickFilter("agotado")}
        />
        <Kpi
          icon={CalendarClock}
          label="Con vencidos"
          value={fmtInt(kpi.count("vencido"))}
          hint={`${fmtInt(kpi.expiredUnits)} unid. vencidas`}
          valueClass={kpi.expiredUnits ? "text-danger-fg" : undefined}
          loading={isLoading}
          active={groupBy === "producto" && status === "vencido"}
          onClick={() => quickFilter("vencido")}
        />
      </div>

      <Card as="section" padding="none" className="overflow-hidden" aria-labelledby="inv-title">
        <div className="grid gap-3 border-b border-line-soft p-4 sm:px-5">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <h2 id="inv-title" className="font-semibold tracking-tight">
              Productos
            </h2>
            <p className="text-caption tabular-nums text-muted" aria-live="polite" role="status">
              {countText}
              {!isLoading && ` · ${fmtInt(kpi.lots)} lotes con stock${multi ? ` en ${branchIds.length} locales` : ""}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-0 flex-1 basis-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
              <Input
                ref={searchRef}
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Nombre, principio activo, laboratorio o código de barras"
                className="pl-9 pr-12"
                aria-label="Buscar producto"
                aria-keyshortcuts="F2"
              />
              <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded-md border border-line bg-sunken px-1.5 text-micro font-semibold text-muted sm:pointer-fine:inline-block" aria-hidden>
                F2
              </kbd>
            </div>
            <Select value={lab} onChange={(e) => setLab(e.target.value)} className="min-w-0 flex-1 sm:w-44 sm:flex-none" aria-label="Laboratorio o marca">
              <option value="Todos">Todos los laboratorios</option>
              {options.labs.map((x) => <option key={x}>{x}</option>)}
            </Select>
            <Select value={category} onChange={(e) => setCategory(e.target.value)} className="min-w-0 flex-1 sm:w-40 sm:flex-none" aria-label="Tipo de producto">
              <option value="Todos">Todos los tipos</option>
              {options.categories.map((x) => <option key={x}>{x}</option>)}
            </Select>
            <Select value={form} onChange={(e) => setForm(e.target.value)} className="min-w-0 flex-1 sm:w-36 sm:flex-none" aria-label="Forma farmacéutica">
              <option value="Todos">Todas las formas</option>
              {options.forms.map((x) => <option key={x}>{x}</option>)}
            </Select>
            {hasFilters && (
              <Button variant="ghost" onClick={clearFilters}>
                <X className="h-4 w-4" aria-hidden /> Limpiar filtros
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented<GroupBy>
              label="Agrupar"
              value={groupBy}
              onChange={setGroupBy}
              options={[
                { id: "producto", label: "Por producto" },
                { id: "lab", label: "Por laboratorio" },
                { id: "category", label: "Por tipo" },
              ]}
            />
            {groupBy === "producto" && (
              <Segmented<StatusFilter>
                label="Estado"
                value={status}
                onChange={setStatus}
                options={(["todos", "bajo", "agotado", "vencido", "receta"] as const).map((id) => ({
                  id,
                  label: { todos: "Todos", bajo: "Bajo mínimo", agotado: "Agotados", vencido: "Con vencidos", receta: "Con receta" }[id],
                  count: isLoading ? undefined : kpi.count(id),
                }))}
              />
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="grid gap-2 p-4 sm:p-5" aria-busy="true">
            {Array.from({ length: 8 }, (_, i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-sunken" />)}
          </div>
        ) : groupBy === "producto" ? (
          rows.length === 0 ? (
            <Empty icon={Search} title={hasFilters ? "Sin productos con estos filtros" : "Aún no hay productos"}>
              {hasFilters ? (
                <button type="button" className="font-semibold underline" onClick={clearFilters}>
                  Limpiar filtros
                </button>
              ) : (
                isAdmin && "Crea el primero con “Nuevo producto”."
              )}
            </Empty>
          ) : wide ? (
            <Table
              maxHeight={640}
              minWidth={multi ? 1180 : 1040}
              head={[
                "Producto",
                "Tipo",
                ...(multi ? [...branchIds.map((b) => ({ label: branchName(b), align: "right" as const })), { label: "Total", align: "right" as const }] : [{ label: "Stock", align: "right" as const }, { label: "Mín.", align: "right" as const }]),
                "Próx. vencimiento",
                { label: "Valor costo", align: "right" },
                { label: "Precio u.", align: "right" },
                { label: <span className="sr-only">Acciones</span> },
              ]}
            >
              {rows.map((r) => (
                <ProductRow key={r.product.id} row={r} stag={stagFor(r.product.id)} {...shared} />
              ))}
            </Table>
          ) : (
            <ul className="grid gap-2 p-3">
              {rows.map((r) => (
                <ProductCard key={r.product.id} row={r} stag={stagFor(r.product.id)} {...shared} />
              ))}
            </ul>
          )
        ) : groups.length === 0 ? (
          <Empty icon={Search} title={hasFilters ? "Sin productos con estos filtros" : "Aún no hay productos"}>
            {hasFilters && (
              <button type="button" className="font-semibold underline" onClick={clearFilters}>
                Limpiar filtros
              </button>
            )}
          </Empty>
        ) : (
          <Table
            maxHeight={640}
            minWidth={820}
            head={[
              groupBy === "lab" ? "Laboratorio / marca" : "Tipo",
              { label: "Con stock", align: "right" },
              ...(multi ? branchIds.map((b) => ({ label: `Costo ${branchName(b)}`, align: "right" as const })) : []),
              { label: "Valor costo", align: "right" },
              { label: "Precio venta", align: "right" },
              { label: "Alertas", align: "right" },
            ]}
          >
            {groups.map((g) => (
              <GroupRow
                key={g.key}
                group={g}
                ratio={g.valueCost / maxGroup}
                multi={multi}
                branchIds={branchIds}
                onPick={() => {
                  if (groupBy === "lab") setLab(g.key);
                  else setCategory(g.key);
                  setGroupBy("producto");
                }}
              />
            ))}
          </Table>
        )}
      </Card>

      {detail && (
        <ProductDetailDialog
          product={detail}
          lots={lotsQ.lots}
          branchIds={branchIds}
          branches={allBranches}
          scopeLabel={scope.label}
          pharmacy={config.data?.pharmacy}
          thresholds={thresholds}
          now={now}
          canEdit={isAdmin}
          onEdit={() => {
            setEditing(detail);
            setDetailId(null);
          }}
          onClose={() => setDetailId(null)}
        />
      )}
      {editing && (
        <ProductFormDialog
          product={editing === "new" ? null : editing}
          products={productList}
          branches={allBranches}
          onClose={() => setEditing(null)}
          onSaved={(p) => setDetailId(p.id)}
        />
      )}
    </div>
  );
}

function GroupRow({ group: g, ratio, multi, branchIds, onPick }: { group: ReturnType<typeof groupInventory>[number]; ratio: number; multi: boolean; branchIds: string[]; onPick: () => void }) {
  return (
    <tr
      tabIndex={0}
      className={cn(rowButtonClass, "h-12")}
      onClick={onPick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onPick();
        }
      }}
      aria-label={`Ver productos de ${g.key}`}
    >
      <td className={cn(td, "py-2")}>
        <p className="font-semibold">{g.key}</p>
        <div className="mt-1 h-1.5 w-40 max-w-full overflow-hidden rounded-full bg-sunken" aria-hidden>
          <div className="h-full w-full origin-left rounded-full bg-brand" style={{ transform: `scaleX(${ratio})` }} />
        </div>
      </td>
      <td className={cn(td, "py-2 text-right tabular-nums")}>
        {g.withStock}/{g.products}
      </td>
      {multi && branchIds.map((b) => <td key={b} className={cn(td, "whitespace-nowrap py-2 text-right tabular-nums text-fg-2")}>{soles(g.costPerBranch[b] ?? 0)}</td>)}
      <td className={cn(td, "whitespace-nowrap py-2 text-right font-semibold tabular-nums")}>{soles(g.valueCost)}</td>
      <td className={cn(td, "whitespace-nowrap py-2 text-right tabular-nums")}>{soles(g.valueRetail)}</td>
      <td className={cn(td, "py-2 text-right tabular-nums", g.alerts ? BRANCH_STOCK_CLASS[branchStockTone(1, true)] : "text-muted")}>{g.alerts || "—"}</td>
    </tr>
  );
}
