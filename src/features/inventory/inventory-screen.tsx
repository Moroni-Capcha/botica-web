"use client";

import { useMemo, useState } from "react";
import { FileSpreadsheet, Package, PackageX, Plus, Search, Snowflake, Tag, TriangleAlert, Wallet, type LucideIcon } from "lucide-react";
import type { Product } from "@/lib/api/types";
import { errorMessage } from "@/lib/api";
import { useConfig, useProducts } from "@/lib/queries";
import { groupInventory, inventoryRows, minFor, type InventoryRow } from "@/lib/domain/inventory";
import { daysUntil, DEFAULT_THRESHOLDS, round2, stockLabel } from "@/lib/domain/pharmacy";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty";
import { Input, Select } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { Table, td } from "@/components/ui/table";
import { ExpiryBadge, RxBadge } from "@/components/ui/badges";
import { notify } from "@/components/ui/toast";
import { soles } from "@/lib/format";
import { cn } from "@/lib/cn";
import { ScopeToggle, useBranchLots, useBranchScope } from "@/features/shared/branch-scope";
import { exportInventory, STATUS_LABEL } from "./export";
import { ProductDetailDialog } from "./product-detail-dialog";
import { ProductFormDialog } from "./product-form-dialog";

type GroupBy = "producto" | "lab" | "category";
type StatusFilter = "todos" | "bajo" | "agotado" | "vencido" | "receta";

const STATUS_CLASS: Record<InventoryRow["status"], string> = {
  agotado: "bg-zinc-900 text-white",
  bajo: "bg-amber-100 text-amber-800",
  ok: "bg-emerald-50 text-emerald-700",
};
const fmtInt = (n: number) => n.toLocaleString("es-PE");

export function InventoryScreen() {
  const scope = useBranchScope();
  const { ids: branchIds, multi, isAdmin, operating, branches, branchName } = scope;
  const config = useConfig();
  const products = useProducts();
  const lotsQ = useBranchLots(branchIds);
  const [now] = useState(() => Date.now());
  const thresholds = config.data?.expiry ?? DEFAULT_THRESHOLDS;

  const [q, setQ] = useState("");
  const [lab, setLab] = useState("Todos");
  const [category, setCategory] = useState("Todos");
  const [form, setForm] = useState("Todos");
  const [status, setStatus] = useState<StatusFilter>("todos");
  const [groupBy, setGroupBy] = useState<GroupBy>("producto");
  const [detailId, setDetailId] = useState<number | null>(null);
  const [editing, setEditing] = useState<Product | "new" | null>(null);

  const productList = products.data ?? [];
  const all = useMemo(() => inventoryRows(productList, lotsQ.lots, branchIds, now), [productList, lotsQ.lots, branchIds, now]);
  const options = useMemo(() => {
    const uniq = (f: (p: Product) => string) => [...new Set(productList.map(f))].sort((a, b) => a.localeCompare(b));
    return { labs: uniq((p) => p.lab), categories: uniq((p) => p.category), forms: uniq((p) => p.form) };
  }, [productList]);

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

  const doExport = () => {
    exportInventory({ rows: base, lots: lotsQ.lots, branches, branchIds, scopeLabel: scope.label, pharmacy: config.data?.pharmacy });
    notify("Inventario valorizado descargado");
  };

  if (error) {
    return (
      <Empty icon={TriangleAlert} title="No se pudo cargar el inventario">
        {errorMessage(error)}{" "}
        <button type="button" className="font-semibold underline" onClick={() => void Promise.all([products.refetch(), lotsQ.refetch()])}>
          Reintentar
        </button>
      </Empty>
    );
  }

  return (
    <div className="mx-auto grid max-w-7xl gap-4 p-4 sm:p-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={Package} label="Productos" value={fmtInt(kpi.products)} hint={`${fmtInt(kpi.lots)} lotes con stock${multi ? " en los dos locales" : ""}`} loading={isLoading} />
        <Kpi
          icon={Wallet}
          label="Inventario a costo"
          value={soles(kpi.valueCost)}
          hint={multi ? kpi.perBranch.map(({ b, v }) => `${branchName(b)} ${soles(v)}`).join(" · ") : kpi.expiredUnits ? `Incluye ${fmtInt(kpi.expiredUnits)} unid. vencidas` : "Sin unidades vencidas"}
          loading={isLoading}
        />
        <Kpi icon={Tag} label="A precio de venta" value={soles(kpi.valueRetail)} hint="Solo stock vigente, por unidad" loading={isLoading} />
        <Kpi
          icon={PackageX}
          label="Agotados o bajo mínimo"
          value={fmtInt(kpi.alerts)}
          hint={kpi.out ? `${kpi.out} agotados` : "Ninguno agotado"}
          tone={kpi.alerts ? "amber" : undefined}
          loading={isLoading}
          onClick={() => {
            setGroupBy("producto");
            setStatus(status === "bajo" ? "todos" : "bajo");
          }}
        />
      </div>

      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white" aria-label="Inventario">
        <div className="grid gap-3 border-b border-zinc-100 p-4 sm:px-5">
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-0 flex-1 basis-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre, principio activo, laboratorio o código de barras" className="pl-9" aria-label="Buscar producto" />
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
            {isAdmin && <ScopeToggle scope={scope.scope} onChange={scope.setScope} operatingName={branchName(operating)} />}
            <div className="flex flex-wrap gap-2 sm:ml-auto">
              {isAdmin && (
                <Button variant="primary" onClick={() => setEditing("new")}>
                  <Plus className="h-4 w-4" /> Nuevo producto
                </Button>
              )}
              <Button onClick={doExport} disabled={isLoading || base.length === 0}>
                <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Inventario valorizado
              </Button>
            </div>
          </div>
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

        {isLoading ? (
          <div className="grid gap-2 p-4 sm:p-5" aria-busy="true">
            {Array.from({ length: 8 }, (_, i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-zinc-100" />)}
          </div>
        ) : groupBy === "producto" ? (
          rows.length === 0 ? (
            <Empty icon={Search} title="Sin productos para este filtro" />
          ) : (
            <Table
              minWidth={multi ? 1120 : 980}
              head={[
                "Producto",
                "Tipo",
                ...(multi ? [...branchIds.map((b) => ({ label: branchName(b), align: "right" as const })), { label: "Total", align: "right" as const }] : [{ label: "Stock", align: "right" as const }, { label: "Mín.", align: "right" as const }]),
                "Próx. vencimiento",
                { label: "Valor costo", align: "right" },
                { label: "Precio u.", align: "right" },
                "Estado",
              ]}
            >
              {rows.map((r) => {
                const p = r.product;
                return (
                  <tr
                    key={p.id}
                    tabIndex={0}
                    onClick={() => setDetailId(p.id)}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setDetailId(p.id))}
                    className="cursor-pointer outline-none transition-colors hover:bg-zinc-50 focus-visible:bg-zinc-50"
                    aria-label={`Ver ficha de ${p.name} ${p.conc}`}
                  >
                    <td className={td}>
                      <p className="flex flex-wrap items-center gap-1.5 font-medium">
                        {p.name} <span className="font-normal text-zinc-500">{p.conc}</span>
                        <RxBadge rx={p.rx} />
                        {p.coldChain && <Snowflake className="h-3.5 w-3.5 text-sky-600" aria-label="Cadena de frío" />}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {p.active} · <b className="font-medium text-zinc-600">{p.lab}</b> · {p.form}
                        {r.expired > 0 && <span className="ml-1.5 font-semibold text-zinc-900">· {fmtInt(r.expired)} u vencidas</span>}
                      </p>
                    </td>
                    <td className={cn(td, "text-xs text-zinc-600")}>{p.category}</td>
                    {multi ? (
                      <>
                        {branchIds.map((b) => {
                          const v = r.perBranch[b] ?? 0;
                          return (
                            <td key={b} className={cn(td, "whitespace-nowrap text-right tabular-nums", v === 0 ? "font-semibold text-zinc-400" : r.low.includes(b) && "font-semibold text-amber-700")}>
                              {v === 0 ? "—" : stockLabel(p, v)}
                            </td>
                          );
                        })}
                        <td className={cn(td, "whitespace-nowrap text-right font-semibold tabular-nums")}>{stockLabel(p, r.stock)}</td>
                      </>
                    ) : (
                      <>
                        <td className={cn(td, "whitespace-nowrap text-right tabular-nums")}>{stockLabel(p, r.stock)}</td>
                        <td className={cn(td, "text-right tabular-nums text-zinc-500")}>{fmtInt(minFor(p, operating))}</td>
                      </>
                    )}
                    <td className={td}>
                      {r.next ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <ExpiryBadge days={daysUntil(r.next.expiresOn, now)} short thresholds={thresholds} />
                        </div>
                      ) : (
                        <span className="text-xs text-zinc-400">—</span>
                      )}
                    </td>
                    <td className={cn(td, "whitespace-nowrap text-right tabular-nums")}>{soles(r.valueCost)}</td>
                    <td className={cn(td, "whitespace-nowrap text-right tabular-nums")}>{soles(p.priceUnit)}</td>
                    <td className={td}>
                      <span className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold", STATUS_CLASS[r.status])}>
                        {STATUS_LABEL[r.status]}
                        {multi && r.status === "bajo" ? ` · ${r.low.map(branchName).join(", ")}` : ""}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </Table>
          )
        ) : groups.length === 0 ? (
          <Empty icon={Search} title="Sin productos para este filtro" />
        ) : (
          <Table
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
              <tr
                key={g.key}
                tabIndex={0}
                className="cursor-pointer outline-none transition-colors hover:bg-zinc-50 focus-visible:bg-zinc-50"
                onClick={() => {
                  if (groupBy === "lab") setLab(g.key);
                  else setCategory(g.key);
                  setGroupBy("producto");
                }}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  if (groupBy === "lab") setLab(g.key);
                  else setCategory(g.key);
                  setGroupBy("producto");
                }}
                aria-label={`Ver productos de ${g.key}`}
              >
                <td className={td}>
                  <p className="font-medium">{g.key}</p>
                  <div className="mt-1 h-1.5 w-40 max-w-full rounded-full bg-zinc-100">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${(g.valueCost / maxGroup) * 100}%` }} />
                  </div>
                </td>
                <td className={cn(td, "text-right tabular-nums")}>
                  {g.withStock}/{g.products}
                </td>
                {multi && branchIds.map((b) => <td key={b} className={cn(td, "whitespace-nowrap text-right tabular-nums text-zinc-600")}>{soles(g.costPerBranch[b] ?? 0)}</td>)}
                <td className={cn(td, "whitespace-nowrap text-right font-semibold tabular-nums")}>{soles(g.valueCost)}</td>
                <td className={cn(td, "whitespace-nowrap text-right tabular-nums")}>{soles(g.valueRetail)}</td>
                <td className={cn(td, "text-right tabular-nums", g.alerts ? "font-semibold text-amber-700" : "text-zinc-400")}>{g.alerts || "—"}</td>
              </tr>
            ))}
          </Table>
        )}
      </section>

      {detail && (
        <ProductDetailDialog
          product={detail}
          lots={lotsQ.lots}
          branchIds={branchIds}
          branches={branches}
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
          branches={branches}
          onClose={() => setEditing(null)}
          onSaved={(p) => setDetailId(p.id)}
        />
      )}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, hint, tone, loading, onClick }: { icon: LucideIcon; label: string; value: string; hint?: string; tone?: "amber"; loading?: boolean; onClick?: () => void }) {
  const body = (
    <>
      <p className="flex items-center gap-2 text-xs font-semibold text-zinc-600">
        <span className={cn("grid h-7 w-7 place-items-center rounded-lg", tone === "amber" ? "bg-amber-100 text-amber-700" : "bg-brand/10 text-brand")}>
          <Icon className="h-4 w-4" />
        </span>
        {label}
      </p>
      {loading ? <div className="mt-2 h-7 w-24 animate-pulse rounded bg-zinc-100" /> : <p className="mt-2 truncate text-2xl font-semibold tracking-tight tabular-nums">{value}</p>}
      {hint && <p className="mt-0.5 truncate text-xs text-zinc-500">{hint}</p>}
    </>
  );
  const cls = "min-w-0 rounded-2xl border border-zinc-200 bg-white p-4 text-left";
  return onClick ? (
    <button type="button" onClick={onClick} className={cn(cls, "transition hover:border-zinc-300")}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}
