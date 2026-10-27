"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeftRight, CircleCheck, FileSpreadsheet, PackageMinus, Search, ShoppingCart, TriangleAlert, X } from "lucide-react";
import type { BranchId } from "@/lib/api/types";
import { errorMessage } from "@/lib/api";
import { useSessionStore } from "@/lib/auth/session-store";
import { useSetLotDiscount } from "@/lib/queries";
import { DISCOUNT_STEPS, TONE_ORDER, priorityList, summarizeByTone, toneRange, transferSuggestion, type LotRisk } from "@/lib/domain/expiry";
import { stockLabel, type ExpiryTone } from "@/lib/domain/pharmacy";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty";
import { Input, Select } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { Table, td } from "@/components/ui/table";
import { ExpiryBadge, TONE } from "@/components/ui/badges";
import { notify } from "@/components/ui/toast";
import { dateShort, soles } from "@/lib/format";
import { cn } from "@/lib/cn";
import { useExpiryData, VELOCITY_DAYS } from "./use-expiry-data";
import { WriteOffDialog } from "./write-off-dialog";
import { exportExpiry } from "./export";
import { ScopeToggle, useBranchScope } from "@/features/shared/branch-scope";

type Tab = "prioridad" | "lotes";
type ToneFilter = ExpiryTone | "todos";

const fmtInt = (n: number) => n.toLocaleString("es-PE");
const fmtRate = (n: number) => `${n.toLocaleString("es-PE", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} u/d`;

export function ExpiryScreen() {
  const user = useSessionStore((s) => s.session?.user);
  const setAdminBranch = useSessionStore((s) => s.setAdminBranch);
  const { scope, setScope, ids: scopeIds, multi, isAdmin, operating, branches, branchName, label: scopeLabel } = useBranchScope();
  const { rows: allRows, rates, thresholds, products, pharmacy, isLoading, error, refetch } = useExpiryData(scopeIds);

  const [tab, setTab] = useState<Tab>("prioridad");
  const [tone, setTone] = useState<ToneFilter>("todos");
  const [q, setQ] = useState("");
  const [lab, setLab] = useState("Todos");
  const [category, setCategory] = useState("Todos");
  const [selected, setSelected] = useState<number[]>([]);
  const [writeOff, setWriteOff] = useState<LotRisk | null>(null);
  const discount = useSetLotDiscount();

  const labs = useMemo(() => [...new Set(products.map((p) => p.lab))].sort((a, b) => a.localeCompare(b)), [products]);
  const categories = useMemo(() => [...new Set(products.map((p) => p.category))].sort((a, b) => a.localeCompare(b)), [products]);

  /* Filtros de laboratorio y tipo: aplican a las tarjetas, las dos pestañas y el Excel */
  const rows = useMemo(() => allRows.filter((r) => (lab === "Todos" || r.product.lab === lab) && (category === "Todos" || r.product.category === category)), [allRows, lab, category]);
  const summary = useMemo(() => summarizeByTone(rows), [rows]);
  const priority = useMemo(() => priorityList(rows), [rows]);
  const lossTotal = priority.reduce((s, r) => s + r.loss, 0);
  const unitsAtRisk = priority.reduce((s, r) => s + r.atRisk, 0);

  const lotRows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows
      .filter((r) => (tone === "todos" || r.tone === tone) && (!s || [r.product.name, r.product.active, r.product.lab, r.lot.code].some((f) => f.toLowerCase().includes(s))))
      .sort((a, b) => a.days - b.days || a.product.name.localeCompare(b.product.name));
  }, [rows, tone, q]);

  const branchIds = branches.map((b) => b.id);
  const canSell = user?.permissions.includes("pos") ?? false;

  const toggle = (id: number) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const visibleIds = priority.map((r) => r.lot.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));

  const applyDiscount = async (value: number) => {
    const chosen = priority.filter((r) => selected.includes(r.lot.id));
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
    exportExpiry({ rows, branches, scopeLabel, pharmacy, thresholds, velocityDays: VELOCITY_DAYS });
    notify("Excel de vencimientos descargado");
  };

  if (error) {
    return (
      <Empty icon={TriangleAlert} title="No se pudieron cargar los vencimientos">
        {errorMessage(error)}{" "}
        <button type="button" className="font-semibold underline" onClick={() => void refetch()}>
          Reintentar
        </button>
      </Empty>
    );
  }

  return (
    <div className="mx-auto grid max-w-7xl gap-4 p-4 sm:p-6">
      {/* Semáforo */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {summary.map((g) => {
          const active = tab === "lotes" && tone === g.tone;
          return (
            <button
              key={g.tone}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setTab("lotes");
                setTone(active ? "todos" : g.tone);
              }}
              className={cn("min-w-0 rounded-2xl border bg-white p-4 text-left transition hover:border-zinc-300", active ? "border-transparent ring-2 ring-brand" : "border-zinc-200")}
            >
              <p className="flex flex-wrap items-center gap-x-2 text-xs font-semibold text-zinc-600">
                <span className={cn("h-2.5 w-2.5 rounded-full", g.tone === "vencido" ? "bg-zinc-900" : TONE[g.tone].dot)} />
                {TONE[g.tone].label}
                <span className="font-normal text-zinc-400">{toneRange(g.tone, thresholds)}</span>
              </p>
              {isLoading ? (
                <div className="mt-2 h-7 w-20 animate-pulse rounded bg-zinc-100" />
              ) : (
                <p className="mt-1.5 text-2xl font-semibold tracking-tight tabular-nums">
                  {g.lots} <span className="text-sm font-medium text-zinc-500">{g.lots === 1 ? "lote" : "lotes"}</span>
                </p>
              )}
              <p className="mt-0.5 truncate text-xs tabular-nums text-zinc-500">
                {fmtInt(g.units)} unid. · {soles(g.value)} a costo
              </p>
            </button>
          );
        })}
      </div>

      {/* Barra de herramientas */}
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
        <div className="flex w-full flex-wrap gap-2 sm:ml-auto sm:w-auto">
          <Select value={lab} onChange={(e) => setLab(e.target.value)} className="min-w-0 flex-1 sm:w-44 sm:flex-none" aria-label="Laboratorio o marca">
            <option value="Todos">Todos los laboratorios</option>
            {labs.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </Select>
          <Select value={category} onChange={(e) => setCategory(e.target.value)} className="min-w-0 flex-1 sm:w-40 sm:flex-none" aria-label="Tipo de producto">
            <option value="Todos">Todos los tipos</option>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
          <Button onClick={doExport} disabled={isLoading || rows.length === 0} className="shrink-0">
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Excel
          </Button>
        </div>
      </div>

      {tab === "prioridad" ? (
        <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white" aria-labelledby="prio-title">
          <div className="flex flex-wrap items-start gap-3 border-b border-zinc-100 p-4 sm:p-5">
            <div className="min-w-0 flex-1">
              <h2 id="prio-title" className="text-base font-semibold tracking-tight">
                Pérdida estimada si no se actúa: <span className="tabular-nums text-rose-600">{soles(lossTotal)}</span>
              </h2>
              <p className="mt-1 max-w-3xl text-xs leading-relaxed text-zinc-500">
                Con la venta de los últimos {VELOCITY_DAYS} días y el orden FEFO, estos lotes no alcanzan a venderse antes de su fecha ({fmtInt(unitsAtRisk)} unid. en riesgo). Aplica un descuento, ofrécelos en
                mostrador, trasládalos al local que más los vende o pide canje al proveedor.
              </p>
            </div>
            {selected.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Descuento para los lotes elegidos">
                <span className="text-xs text-zinc-500">{selected.length} elegidos:</span>
                {DISCOUNT_STEPS.map((v) => (
                  <Button key={v} size="sm" variant="ghost" disabled={discount.isPending} onClick={() => void applyDiscount(v)}>
                    -{Math.round(v * 100)} %
                  </Button>
                ))}
                <Button size="sm" disabled={discount.isPending} onClick={() => void applyDiscount(0)}>
                  Quitar
                </Button>
                <button type="button" onClick={() => setSelected([])} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100" aria-label="Limpiar selección">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
          {isLoading ? (
            <RowsSkeleton />
          ) : priority.length === 0 ? (
            <Empty icon={CircleCheck} title="Ningún lote en riesgo">
              Con la venta actual, todo se venderá antes de vencer.
            </Empty>
          ) : (
            <Table
              minWidth={1040}
              head={[
                { label: <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? [] : visibleIds)} className="h-4 w-4 accent-[var(--brand)]" aria-label="Elegir todos" /> },
                "Producto",
                "Lote",
                "Vence",
                { label: "Stock lote", align: "right" },
                { label: "Venta actual", align: "right" },
                { label: "Necesaria", align: "right" },
                { label: "En riesgo", align: "right" },
                { label: "Pérdida", align: "right" },
                { label: <span className="sr-only">Acciones</span> },
              ]}
            >
              {priority.map((r) => {
                const move = transferSuggestion(r, branchIds, rates);
                const checked = selected.includes(r.lot.id);
                return (
                  <tr key={r.lot.id} className={cn("transition-colors", checked ? "bg-zinc-50" : "hover:bg-zinc-50/60")}>
                    <td className={td}>
                      <input type="checkbox" checked={checked} onChange={() => toggle(r.lot.id)} className="h-4 w-4 accent-[var(--brand)]" aria-label={`Elegir lote ${r.lot.code}`} />
                    </td>
                    <td className={td}>
                      <ProductCell row={r} showBranch={multi} branchName={branchName(r.branchId)} detail={`${r.product.lab} · ${r.product.category} · Ubic. ${r.product.location}`} />
                    </td>
                    <td className={cn(td, "whitespace-nowrap tabular-nums")}>
                      {r.lot.code}
                      <DiscountChip value={r.lot.discount} />
                    </td>
                    <td className={td}>
                      <div className="grid justify-items-start gap-0.5">
                        <ExpiryBadge days={r.days} short thresholds={thresholds} />
                        <span className="text-[11px] tabular-nums text-zinc-500">{dateShort(r.lot.expiresOn)}</span>
                      </div>
                    </td>
                    <td className={cn(td, "whitespace-nowrap text-right tabular-nums")}>{stockLabel(r.product, r.lot.qty)}</td>
                    <td className={cn(td, "whitespace-nowrap text-right tabular-nums text-zinc-600")}>{fmtRate(r.rate)}</td>
                    <td className={cn(td, "whitespace-nowrap text-right font-semibold tabular-nums")}>{Number.isFinite(r.needRate) ? fmtRate(r.needRate) : "—"}</td>
                    <td className={cn(td, "whitespace-nowrap text-right tabular-nums")}>{fmtInt(r.atRisk)} u</td>
                    <td className={cn(td, "whitespace-nowrap text-right font-semibold tabular-nums text-rose-600")}>{soles(r.loss)}</td>
                    <td className={cn(td, "text-right")}>
                      <div className="flex items-center justify-end gap-1">
                        {move && (
                          <span
                            className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-sky-50 px-2 py-1 text-[11px] font-semibold text-sky-700"
                            title={`${branchName(move.branchId)} vende ${fmtRate(move.rate)}. Conviene trasladar este lote.`}
                          >
                            <ArrowLeftRight className="h-3.5 w-3.5" /> {branchName(move.branchId)} {fmtRate(move.rate)}
                          </span>
                        )}
                        {canSell && (
                          <Link
                            href={`/pos?q=${encodeURIComponent(r.product.name)}`}
                            onClick={() => isAdmin && setAdminBranch(r.branchId)}
                            className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-zinc-100 px-3 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-200"
                          >
                            <ShoppingCart className="h-3.5 w-3.5" /> Vender
                          </Link>
                        )}
                        <Button size="sm" onClick={() => setWriteOff(r)} title="Baja o devolución al proveedor" aria-label={`Baja o devolución del lote ${r.lot.code}`}>
                          <PackageMinus className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </Table>
          )}
        </section>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white" aria-label="Todos los lotes">
          <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 p-4 sm:px-5">
            <div className="relative min-w-0 flex-1 basis-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Producto, principio activo, lote o laboratorio" className="pl-9" aria-label="Buscar lote" />
            </div>
            <Segmented<ToneFilter>
              label="Estado"
              value={tone}
              onChange={setTone}
              options={[{ id: "todos", label: "Todos" }, ...TONE_ORDER.map((t) => ({ id: t, label: TONE[t].label, count: summary.find((s) => s.tone === t)?.lots ?? 0 }))]}
            />
          </div>
          {isLoading ? (
            <RowsSkeleton />
          ) : lotRows.length === 0 ? (
            <Empty icon={Search} title="Sin lotes para este filtro" />
          ) : (
            <Table
              minWidth={1000}
              head={["Producto", "Lote", "Vencimiento", { label: "Cantidad", align: "right" }, { label: "Valor costo", align: "right" }, "Proveedor", "Ingreso", { label: <span className="sr-only">Acciones</span> }]}
            >
              {lotRows.map((r) => (
                <tr key={r.lot.id} className={cn(r.tone === "vencido" ? "bg-zinc-50" : "hover:bg-zinc-50/60")}>
                  <td className={td}>
                    <ProductCell row={r} showBranch={multi} branchName={branchName(r.branchId)} detail={`${r.product.active} · ${r.product.lab} · RS ${r.product.sanitaryReg}`} />
                  </td>
                  <td className={cn(td, "whitespace-nowrap tabular-nums")}>
                    {r.lot.code}
                    <DiscountChip value={r.lot.discount} />
                  </td>
                  <td className={td}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="tabular-nums">{dateShort(r.lot.expiresOn)}</span>
                      <ExpiryBadge days={r.days} short thresholds={thresholds} />
                    </div>
                  </td>
                  <td className={cn(td, "whitespace-nowrap text-right tabular-nums")}>{stockLabel(r.product, r.lot.qty)}</td>
                  <td className={cn(td, "whitespace-nowrap text-right tabular-nums")}>{soles(r.value)}</td>
                  <td className={cn(td, "max-w-[200px] truncate text-xs text-zinc-600")} title={r.lot.supplier ?? undefined}>
                    {r.lot.supplier ?? "—"}
                  </td>
                  <td className={cn(td, "whitespace-nowrap text-xs tabular-nums text-zinc-500")}>{r.lot.receivedOn ? dateShort(r.lot.receivedOn) : "—"}</td>
                  <td className={cn(td, "text-right")}>
                    <Button size="sm" variant={r.tone === "vencido" ? "dark" : "ghost"} onClick={() => setWriteOff(r)} className="whitespace-nowrap">
                      {r.tone === "vencido" ? "Dar de baja" : "Baja / canje"}
                    </Button>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </section>
      )}

      {writeOff && <WriteOffDialog row={writeOff} onClose={() => setWriteOff(null)} />}
    </div>
  );
}

function ProductCell({ row, showBranch, branchName, detail }: { row: LotRisk; showBranch: boolean; branchName: string; detail: string }) {
  return (
    <div className="min-w-0">
      <p className="font-medium">
        {row.product.name} <span className="text-zinc-500">{row.product.conc}</span>
      </p>
      <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-zinc-500">
        {showBranch && <span className="rounded bg-brand/10 px-1.5 py-px text-[10.5px] font-semibold text-brand">{branchName}</span>}
        {detail}
      </p>
    </div>
  );
}

function DiscountChip({ value }: { value: number }) {
  if (!value) return null;
  return <span className="ml-1.5 rounded bg-rose-100 px-1 py-px text-[11px] font-semibold text-rose-700">-{Math.round(value * 100)} %</span>;
}

function RowsSkeleton() {
  return (
    <div className="grid gap-2 p-4 sm:p-5" aria-busy="true" aria-label="Cargando">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="h-12 animate-pulse rounded-xl bg-zinc-100" />
      ))}
    </div>
  );
}
