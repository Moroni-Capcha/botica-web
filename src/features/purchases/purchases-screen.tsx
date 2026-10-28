"use client";

import { useMemo, useState } from "react";
import { ChevronRight, CircleCheck, FileSpreadsheet, FileUp, PackagePlus, Pencil, Phone, Plus, Receipt, TriangleAlert, Truck, User } from "lucide-react";
import type { Product, Purchase, Supplier } from "@/lib/api/types";
import { errorMessage } from "@/lib/api";
import { useConfig, useProducts, usePurchases, useSuppliers, useVelocity } from "@/lib/queries";
import { dailyRates } from "@/lib/domain/expiry";
import { daysUntil, round2, stockLabel } from "@/lib/domain/pharmacy";
import { suggestOrder } from "@/lib/domain/purchasing";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Empty } from "@/components/ui/empty";
import { Select } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { Table, td } from "@/components/ui/table";
import { ExpiryBadge } from "@/components/ui/badges";
import { notify } from "@/components/ui/toast";
import { dateShort, soles, timeShort } from "@/lib/format";
import { cn } from "@/lib/cn";
import { ScopeToggle, useBranchLots, useBranchScope } from "@/features/shared/branch-scope";
import { VELOCITY_DAYS } from "@/features/expiry/use-expiry-data";
import { exportPurchases, exportSuggestion } from "./export";
import { ReceiveDialog, type ReceivePrefill } from "./receive-dialog";
import { ImportDialog } from "./import-dialog";
import { SupplierDialog } from "./supplier-dialog";

type Tab = "sugerido" | "ingresos" | "proveedores";
const PERIODS = [7, 30, 90] as const;
const fmtInt = (n: number) => n.toLocaleString("es-PE");

export function PurchasesScreen() {
  const scope = useBranchScope();
  const { allBranches, ids: branchIds, multi, isAdmin, operating, branches, branchName } = scope;
  const config = useConfig();
  const products = useProducts();
  const suppliers = useSuppliers();
  const velocity = useVelocity(VELOCITY_DAYS);
  const lotsQ = useBranchLots(branchIds);
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30);
  const purchases = usePurchases(multi ? null : operating, days);
  const [now] = useState(() => Date.now());

  const [tab, setTab] = useState<Tab>("sugerido");
  const [supplierFilter, setSupplierFilter] = useState("Todos");
  const [selected, setSelected] = useState<string[]>([]);
  const [receiving, setReceiving] = useState<{ prefill: ReceivePrefill[]; branchId: string } | null>(null);
  const [importing, setImporting] = useState(false);
  const [detail, setDetail] = useState<Purchase | null>(null);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | "new" | null>(null);

  const productList: Product[] = products.data ?? [];
  const productById = useMemo(() => new Map(productList.map((p) => [p.id, p])), [productList]);
  const supplierList = suppliers.data ?? [];
  const coverDays = config.data?.purchasing.coverDays ?? 15;
  const minShelfDays = config.data?.purchasing.minShelfDays ?? 180;
  const allowed = isAdmin ? branches.map((b) => b.id) : [operating];

  const rates = useMemo(() => dailyRates(velocity.data ?? []), [velocity.data]);
  const suggestion = useMemo(() => suggestOrder(productList, lotsQ.lots, branchIds, rates, now, coverDays), [productList, lotsQ.lots, branchIds, rates, now, coverDays]);
  const suggestionSuppliers = useMemo(() => [...new Set(suggestion.map((s) => s.supplier ?? "Sin proveedor"))].sort((a, b) => a.localeCompare(b)), [suggestion]);
  const visibleSuggestion = suggestion.filter((s) => supplierFilter === "Todos" || (s.supplier ?? "Sin proveedor") === supplierFilter);
  const sugTotal = round2(visibleSuggestion.reduce((s, x) => s + x.cost, 0));
  const keyOf = (s: { branchId: string; product: Product }) => `${s.branchId}:${s.product.id}`;

  const purchaseList = purchases.data ?? [];
  const purchaseTotal = round2(purchaseList.reduce((s, p) => s + p.total, 0));

  const receiveSelected = () => {
    const chosen = visibleSuggestion.filter((s) => selected.includes(keyOf(s)));
    const branchesChosen = new Set(chosen.map((s) => s.branchId));
    if (branchesChosen.size > 1) {
      notify("Elige productos de un solo local: cada ingreso es para un local.", "warn");
      return;
    }
    setReceiving({ prefill: chosen.map((s) => ({ productId: s.product.id, packs: s.packs, supplier: s.supplier })), branchId: chosen[0]?.branchId ?? operating });
    setSelected([]);
  };

  const isLoading = products.isLoading || lotsQ.isLoading || velocity.isLoading;
  const error = products.error ?? lotsQ.error ?? velocity.error ?? suppliers.error;

  if (error) {
    return (
      <Empty icon={TriangleAlert} title="No se pudieron cargar las compras">
        {errorMessage(error)}{" "}
        <button type="button" className="font-semibold underline" onClick={() => void Promise.all([products.refetch(), lotsQ.refetch(), velocity.refetch(), suppliers.refetch()])}>
          Reintentar
        </button>
      </Empty>
    );
  }

  return (
    <div className="mx-auto grid max-w-7xl gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<Tab>
          label="Vista"
          value={tab}
          onChange={setTab}
          options={[
            { id: "sugerido", label: "Pedido sugerido", count: isLoading ? undefined : suggestion.length },
            { id: "ingresos", label: "Ingresos", count: purchases.data ? purchaseList.length : undefined },
            { id: "proveedores", label: "Proveedores", count: suppliers.data ? supplierList.length : undefined },
          ]}
        />
        {isAdmin && (
          <ScopeToggle
            scope={scope.scope}
            operatingName={branchName(operating)}
            onChange={(v) => {
              scope.setScope(v);
              setSelected([]);
            }}
          />
        )}
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          <Button onClick={() => setImporting(true)} disabled={!products.data || !suppliers.data}>
            <FileUp className="h-4 w-4" /> Importar Excel
          </Button>
          <Button variant="primary" onClick={() => setReceiving({ prefill: [], branchId: operating })} disabled={!products.data || !suppliers.data}>
            <PackagePlus className="h-4 w-4" /> Registrar ingreso
          </Button>
        </div>
      </div>

      {tab === "sugerido" && (
        <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white" aria-labelledby="sug-title">
          <div className="flex flex-wrap items-start gap-3 border-b border-zinc-100 p-4 sm:p-5">
            <div className="min-w-0 flex-1">
              <h2 id="sug-title" className="text-base font-semibold tracking-tight">
                Pedido sugerido · <span className="tabular-nums">{soles(sugTotal)}</span> <span className="text-sm font-normal text-zinc-500">sin IGV</span>
              </h2>
              <p className="mt-1 max-w-3xl text-xs leading-relaxed text-zinc-500">
                Cubre {coverDays} días de venta más el stock mínimo de cada local, en cajas completas. Primero los que se acaban antes. Elige productos y pulsa «Recibir» cuando llegue la mercadería.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)} className="w-auto max-w-[260px]" aria-label="Proveedor">
                <option value="Todos">Todos los proveedores</option>
                {suggestionSuppliers.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
              {selected.length > 0 && (
                <Button size="sm" variant="primary" onClick={receiveSelected}>
                  Recibir {selected.length}
                </Button>
              )}
              <Button
                size="sm"
                disabled={!visibleSuggestion.length}
                onClick={() => {
                  exportSuggestion({ rows: visibleSuggestion, branches: allBranches, scopeLabel: scope.label, coverDays, pharmacy: config.data?.pharmacy });
                  notify("Pedido sugerido descargado");
                }}
              >
                <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" /> Excel
              </Button>
            </div>
          </div>
          {isLoading ? (
            <Skeleton />
          ) : visibleSuggestion.length === 0 ? (
            <Empty icon={CircleCheck} title="Stock cubierto">
              Ningún producto necesita reposición para los próximos {coverDays} días.
            </Empty>
          ) : (
            <Table
              minWidth={multi ? 1000 : 920}
              head={[
                { label: <span className="sr-only">Elegir</span> },
                "Producto",
                ...(multi ? ["Local"] : []),
                "Proveedor habitual",
                { label: "Stock", align: "right" },
                { label: "Venta/día", align: "right" },
                { label: "Alcanza", align: "right" },
                { label: "Pedir", align: "right" },
                { label: "Costo", align: "right" },
              ]}
            >
              {visibleSuggestion.map((s) => {
                const k = keyOf(s);
                const checked = selected.includes(k);
                return (
                  <tr key={k} className={checked ? "bg-zinc-50" : "hover:bg-zinc-50/60"}>
                    <td className={td}>
                      <input type="checkbox" checked={checked} onChange={() => setSelected((x) => (x.includes(k) ? x.filter((y) => y !== k) : [...x, k]))} className="h-4 w-4 accent-[var(--brand)]" aria-label={`Elegir ${s.product.name} ${s.product.conc}`} />
                    </td>
                    <td className={td}>
                      <p className="font-medium">
                        {s.product.name} <span className="text-zinc-500">{s.product.conc}</span>
                      </p>
                      <p className="text-xs text-zinc-500">
                        {s.product.lab} · mínimo {fmtInt(s.min)} unid.
                      </p>
                    </td>
                    {multi && <td className={cn(td, "text-xs font-semibold")}>{branchName(s.branchId)}</td>}
                    <td className={cn(td, "max-w-[220px] truncate text-xs text-zinc-600")}>{s.supplier ?? "—"}</td>
                    <td className={cn(td, "whitespace-nowrap text-right tabular-nums", s.stock === 0 && "font-semibold text-zinc-400")}>{s.stock === 0 ? "Agotado" : stockLabel(s.product, s.stock)}</td>
                    <td className={cn(td, "text-right tabular-nums")}>{s.rate.toLocaleString("es-PE", { maximumFractionDigits: 1 })}</td>
                    <td className={cn(td, "whitespace-nowrap text-right tabular-nums")}>
                      <span className={s.cover < 3 ? "font-semibold text-rose-600" : s.cover < 7 ? "font-semibold text-amber-700" : ""}>{Number.isFinite(s.cover) ? `${Math.floor(s.cover)} días` : "—"}</span>
                    </td>
                    <td className={cn(td, "whitespace-nowrap text-right font-semibold tabular-nums")}>
                      {s.product.unitsPerBox > 1 ? `${s.packs} cj` : `${s.units} ${s.product.unitName}${s.units === 1 ? "" : "s"}`}
                    </td>
                    <td className={cn(td, "whitespace-nowrap text-right tabular-nums")}>{soles(s.cost)}</td>
                  </tr>
                );
              })}
            </Table>
          )}
        </section>
      )}

      {tab === "ingresos" && (
        <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white" aria-labelledby="ing-title">
          <div className="flex flex-wrap items-center gap-3 border-b border-zinc-100 p-4 sm:p-5">
            <div className="min-w-0 flex-1">
              <h2 id="ing-title" className="text-base font-semibold tracking-tight">
                Ingresos de mercadería · <span className="tabular-nums">{soles(purchaseTotal)}</span> <span className="text-sm font-normal text-zinc-500">con IGV</span>
              </h2>
              <p className="mt-1 text-xs text-zinc-500">Cada ingreso crea los lotes con su vencimiento y queda en el kardex.</p>
            </div>
            <Segmented label="Periodo" value={String(days)} onChange={(v) => setDays(Number(v) as (typeof PERIODS)[number])} options={PERIODS.map((d) => ({ id: String(d), label: `${d} días` }))} />
            <Button
              size="sm"
              disabled={!purchaseList.length}
              onClick={() => {
                exportPurchases({ purchases: purchaseList, products: productList, branches: allBranches, scopeLabel: scope.label, days, pharmacy: config.data?.pharmacy });
                notify("Compras descargadas");
              }}
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" /> Excel
            </Button>
          </div>
          {purchases.isLoading ? (
            <Skeleton />
          ) : purchases.error ? (
            <Empty icon={TriangleAlert} title="No se pudieron cargar los ingresos">{errorMessage(purchases.error)}</Empty>
          ) : purchaseList.length === 0 ? (
            <Empty icon={Receipt} title={`Sin ingresos en ${days} días`} />
          ) : (
            <Table minWidth={820} head={["Fecha", ...(multi ? ["Local"] : []), "Proveedor", "Documento", { label: "Lotes", align: "right" }, { label: "Total", align: "right" }, "Recibió", { label: <span className="sr-only">Ver</span> }]}>
              {purchaseList.map((p) => (
                <tr
                  key={p.id}
                  tabIndex={0}
                  onClick={() => setDetail(p)}
                  onKeyDown={(e) => e.key === "Enter" && setDetail(p)}
                  className="cursor-pointer outline-none transition-colors hover:bg-zinc-50 focus-visible:bg-zinc-50"
                  aria-label={`Ver ingreso ${p.document}`}
                >
                  <td className={cn(td, "whitespace-nowrap tabular-nums")}>
                    {dateShort(p.receivedAt)} <span className="text-xs text-zinc-400">{timeShort(p.receivedAt)}</span>
                  </td>
                  {multi && <td className={cn(td, "text-xs font-semibold")}>{branchName(p.branchId)}</td>}
                  <td className={cn(td, "max-w-[260px] truncate")}>{p.supplierName}</td>
                  <td className={cn(td, "tabular-nums text-zinc-600")}>{p.document}</td>
                  <td className={cn(td, "text-right tabular-nums")}>{p.items.length}</td>
                  <td className={cn(td, "whitespace-nowrap text-right font-semibold tabular-nums")}>{soles(p.total)}</td>
                  <td className={cn(td, "text-xs text-zinc-500")}>{p.userName}</td>
                  <td className={cn(td, "text-right")}>
                    <ChevronRight className="ml-auto h-4 w-4 text-zinc-400" />
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </section>
      )}

      {tab === "proveedores" && (
        <div className="grid gap-3">
          {isAdmin && (
            <Button className="w-fit" onClick={() => setEditingSupplier("new")}>
              <Plus className="h-4 w-4" /> Nuevo proveedor
            </Button>
          )}
          {suppliers.isLoading ? (
            <Skeleton />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {supplierList.map((s) => {
                const ps = purchaseList.filter((p) => p.supplierId === s.id);
                return (
                  <article key={s.id} className={cn("grid gap-3 rounded-2xl border border-zinc-200 bg-white p-4", !s.active && "opacity-60")}>
                    <header className="flex items-start gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand">
                        <Truck className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold leading-tight">{s.name}</h3>
                        <p className="text-xs tabular-nums text-zinc-500">
                          RUC {s.ruc}
                          {!s.active && " · Inactivo"}
                        </p>
                      </div>
                      {isAdmin && (
                        <button type="button" onClick={() => setEditingSupplier(s)} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700" aria-label={`Editar ${s.name}`}>
                          <Pencil className="h-4 w-4" />
                        </button>
                      )}
                    </header>
                    <dl className="grid gap-1.5 text-sm">
                      <div className="flex items-center gap-2">
                        <User className="h-3.5 w-3.5 text-zinc-400" />
                        <dt className="sr-only">Contacto</dt>
                        <dd>{s.contact || "—"}</dd>
                      </div>
                      <div className="flex items-center gap-2">
                        <Phone className="h-3.5 w-3.5 text-zinc-400" />
                        <dt className="sr-only">Teléfono</dt>
                        <dd className="tabular-nums">{s.phone ? <a href={`tel:${s.phone.replace(/\s/g, "")}`} className="hover:underline">{s.phone}</a> : "—"}</dd>
                      </div>
                      <div className="flex justify-between gap-2 border-t border-zinc-100 pt-2 text-xs">
                        <dt className="text-zinc-500">Visita</dt>
                        <dd>{s.visitDays || "—"}</dd>
                      </div>
                      <div className="flex justify-between gap-2 text-xs">
                        <dt className="text-zinc-500">Compras · {days} días</dt>
                        <dd className="tabular-nums">
                          {ps.length} · {soles(ps.reduce((a, p) => a + p.total, 0))}
                        </dd>
                      </div>
                    </dl>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {receiving && products.data && suppliers.data && (
        <ReceiveDialog
          branches={allBranches}
          allowed={allowed}
          defaultBranch={receiving.branchId}
          products={productList}
          suppliers={supplierList}
          lots={lotsQ.lots}
          minShelfDays={minShelfDays}
          prefill={receiving.prefill}
          onClose={() => setReceiving(null)}
          onDone={(p) => {
            setReceiving(null);
            setTab("ingresos");
            setDetail(p);
          }}
        />
      )}
      {importing && (
        <ImportDialog
          isAdmin={isAdmin}
          branches={allBranches}
          allowed={allowed}
          defaultBranch={operating}
          products={productList}
          suppliers={supplierList}
          pharmacy={config.data?.pharmacy}
          onClose={() => setImporting(false)}
        />
      )}
      {detail && <PurchaseDetail purchase={detail} productById={productById} branchName={branchName} now={now} thresholds={config.data?.expiry} onClose={() => setDetail(null)} />}
      {editingSupplier && <SupplierDialog supplier={editingSupplier === "new" ? null : editingSupplier} suppliers={supplierList} onClose={() => setEditingSupplier(null)} />}
    </div>
  );
}

function PurchaseDetail({ purchase: p, productById, branchName, now, thresholds, onClose }: { purchase: Purchase; productById: Map<number, Product>; branchName: (id: string) => string; now: number; thresholds?: { red: number; yellow: number }; onClose: () => void }) {
  return (
    <Dialog title={`${p.document} · ${p.supplierName}`} description={`${branchName(p.branchId)} · ${dateShort(p.receivedAt)} ${timeShort(p.receivedAt)} · Recibió ${p.userName}`} onClose={onClose} size="lg">
      <div className="grid gap-4">
        <div className="overflow-hidden rounded-xl border border-zinc-200">
          <Table minWidth={640} head={["Producto", "Lote", "Vencimiento", { label: "Unidades", align: "right" }, { label: "Costo u.", align: "right" }, { label: "Subtotal", align: "right" }]}>
            {p.items.map((it, i) => {
              const pr = productById.get(it.productId);
              return (
                <tr key={i}>
                  <td className={td}>
                    {pr ? pr.name : `Producto ${it.productId}`} <span className="text-zinc-500">{pr?.conc}</span>
                  </td>
                  <td className={cn(td, "tabular-nums")}>{it.lotCode}</td>
                  <td className={td}>
                    <div className="flex items-center gap-2">
                      <span className="tabular-nums">{dateShort(it.expiresOn)}</span>
                      <ExpiryBadge days={daysUntil(it.expiresOn, now)} short thresholds={thresholds} />
                    </div>
                  </td>
                  <td className={cn(td, "text-right tabular-nums")}>{fmtInt(it.units)}</td>
                  <td className={cn(td, "text-right tabular-nums")}>{soles(it.unitCost)}</td>
                  <td className={cn(td, "text-right tabular-nums")}>{soles(it.subtotal)}</td>
                </tr>
              );
            })}
          </Table>
        </div>
        <dl className="ml-auto grid w-full max-w-xs gap-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-zinc-500">Subtotal</dt>
            <dd className="tabular-nums">{soles(p.subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-zinc-500">IGV (18 %)</dt>
            <dd className="tabular-nums">{soles(p.igv)}</dd>
          </div>
          <div className="flex justify-between border-t border-zinc-200 pt-1 font-semibold">
            <dt>Total</dt>
            <dd className="tabular-nums">{soles(p.total)}</dd>
          </div>
        </dl>
      </div>
    </Dialog>
  );
}

function Skeleton() {
  return (
    <div className="grid gap-2 p-4 sm:p-5" aria-busy="true">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="h-12 animate-pulse rounded-xl bg-zinc-100" />
      ))}
    </div>
  );
}
