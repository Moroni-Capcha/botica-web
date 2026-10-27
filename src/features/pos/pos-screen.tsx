"use client";

import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { Search, TriangleAlert, Wallet, X } from "lucide-react";
import type { Lot, Product, Sale } from "@/lib/api/types";
import { errorMessage } from "@/lib/api";
import { useBranchStock, useCash, useConfig, useCreateSale, useLots, useOpenCash, useProducts } from "@/lib/queries";
import { useOperatingBranch } from "@/lib/auth/session-store";
import {
  buildCartLines, cartTotals, daysUntil, findPresentation, sellableLots, stockLabel, unitsInCart, DEFAULT_THRESHOLDS,
} from "@/lib/domain/pharmacy";
import { minFor } from "@/lib/domain/inventory";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty";
import { Input, Select, inputClass } from "@/components/ui/field";
import { notify } from "@/components/ui/toast";
import { soles } from "@/lib/format";
import { cn } from "@/lib/cn";
import { useBranchCart, useCartStore } from "./cart-store";
import { ProductCard } from "./product-card";
import { CartPanel } from "./cart-panel";
import { PaymentDialog } from "./payment-dialog";
import { ReceiptDialog } from "./receipt-dialog";

export function PosScreen() {
  const branchId = useOperatingBranch();
  const config = useConfig();
  const products = useProducts();
  const lots = useLots(branchId);
  const branchStock = useBranchStock();
  const cash = useCash(branchId);
  const openCash = useOpenCash(branchId);
  const createSale = useCreateSale();

  const cart = useBranchCart(branchId);
  const { add: addToCart, setQty, clear, setCustomer } = useCartStore();

  const [now] = useState(() => Date.now());
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("Todos");
  const [lab, setLab] = useState("Todos");
  const [lastAdded, setLastAdded] = useState<number | null>(null);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Sale | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [opening, setOpening] = useState("150");

  /* Búsqueda inicial desde otro módulo, p. ej. "Vender" en Vencimientos (/pos?q=Amoxicilina) */
  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get("q");
    if (initial) {
      setQ(initial);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  const productList: Product[] = products.data ?? [];
  const lotList: Lot[] = lots.data ?? [];
  const productMap = useMemo(() => new Map(productList.map((p) => [p.id, p])), [productList]);
  const categories = useMemo(() => ["Todos", ...new Set(productList.map((p) => p.category))], [productList]);
  const labs = useMemo(() => [...new Set(productList.map((p) => p.lab))].sort((a, b) => a.localeCompare(b)), [productList]);
  const branches = config.data?.branches ?? [];
  const otherBranch = branches.find((b) => b.id !== branchId);

  /** Por producto: stock vigente, lote que sale primero y si solo queda stock vencido. */
  const stockInfo = useMemo(() => {
    const m = new Map<number, { stock: number; next: Lot | undefined; expiredOnly: boolean }>();
    for (const p of productList) {
      const sell = sellableLots(lotList, p.id, now);
      const stock = sell.reduce((s, l) => s + l.qty, 0);
      m.set(p.id, { stock, next: sell[0], expiredOnly: stock === 0 && lotList.some((l) => l.productId === p.id && l.qty > 0) });
    }
    return m;
  }, [productList, lotList, now]);

  const otherStock = useMemo(() => {
    const m = new Map<number, number>();
    for (const s of branchStock.data ?? []) if (s.branchId === otherBranch?.id) m.set(s.productId, s.units);
    return m;
  }, [branchStock.data, otherBranch?.id]);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    return productList.filter((p) => {
      if (category !== "Todos" && p.category !== category) return false;
      if (lab !== "Todos" && p.lab !== lab) return false;
      if (!s) return true;
      return [p.name, p.active, p.lab, p.barcode, p.conc].some((f) => f.toLowerCase().includes(s));
    });
  }, [productList, q, category, lab]);

  const lines = useMemo(() => buildCartLines(cart.items, productMap, lotList, now), [cart.items, productMap, lotList, now]);
  const totals = useMemo(() => cartTotals(lines), [lines]);
  const cashOpen = cash.data?.open ?? false;
  const canCharge = lines.length > 0 && cashOpen && lines.every((l) => l.missing === 0);

  const add = useCallback(
    (p: Product, presentationId: Parameters<typeof findPresentation>[1], el?: HTMLElement, qty = 1) => {
      const pres = findPresentation(p, presentationId);
      const avail = stockInfo.get(p.id)?.stock ?? 0;
      const already = unitsInCart(lines, p.id);
      if (already + pres.units * qty > avail) {
        notify(avail ? `Stock insuficiente: quedan ${stockLabel(p, Math.max(0, avail - already))} vigentes` : "Sin stock vigente en este local", "warn");
        return;
      }
      addToCart(branchId, p.id, pres.id, qty);
      setLastAdded(p.id);
      el?.animate?.([{ transform: "scale(0.94)" }, { transform: "scale(1)" }], { duration: 220, easing: "cubic-bezier(.32,.72,0,1)" });
    },
    [stockInfo, lines, addToCart, branchId],
  );

  const changeQty = (key: string, qty: number) => {
    const line = lines.find((l) => l.key === key);
    if (line && qty > line.qty) {
      const avail = stockInfo.get(line.productId)?.stock ?? 0;
      if (unitsInCart(lines, line.productId, key) + qty * line.pres.units > avail) {
        notify("No hay más stock vigente para esa cantidad", "warn");
        return;
      }
    }
    setQty(branchId, key, qty);
  };

  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    const code = q.trim();
    const target = productList.find((p) => p.barcode === code) ?? (results.length === 1 ? results[0] : undefined);
    if (target) {
      add(target, "unidad");
      setQ("");
    }
  };

  const equivalents = useMemo(() => {
    const base = lastAdded ? productMap.get(lastAdded) : undefined;
    if (!base || base.active === "—") return null;
    const options = productList
      .filter((x) => x.id !== base.id && x.active === base.active && x.conc === base.conc && (stockInfo.get(x.id)?.stock ?? 0) > 0)
      .sort((a, b) => a.priceUnit - b.priceUnit);
    return { base, options };
  }, [lastAdded, productMap, productList, stockInfo]);

  const charge = async (draft: Parameters<Parameters<typeof PaymentDialog>[0]["onConfirm"]>[0]) => {
    setPayError(null);
    try {
      const sale = await createSale.mutateAsync({ ...draft, branchId, items: cart.items.map((i) => ({ productId: i.productId, presentation: i.presentation, qty: i.qty })) });
      clear(branchId);
      setPaying(false);
      setCartOpen(false);
      setLastAdded(null);
      setReceipt(sale);
      notify(`${sale.document.type === "factura" ? "Factura" : "Boleta"} ${sale.number} emitida`);
    } catch (e) {
      setPayError(errorMessage(e));
    }
  };

  if (products.isError || lots.isError) {
    return (
      <Empty icon={TriangleAlert} title="No se pudo cargar el catálogo">
        {errorMessage(products.error ?? lots.error)}{" "}
        <button type="button" className="font-semibold underline" onClick={() => void Promise.all([products.refetch(), lots.refetch()])}>
          Reintentar
        </button>
      </Empty>
    );
  }

  const panel = (
    <CartPanel
      lines={lines}
      totals={totals}
      customer={cart.customer}
      onCustomer={(c) => setCustomer(branchId, c)}
      onQty={changeQty}
      onClear={() => clear(branchId)}
      onCharge={() => {
        setPayError(null);
        setPaying(true);
      }}
      canCharge={canCharge}
      cashOpen={cashOpen}
      equivalents={equivalents}
      onAddEquivalent={(p) => add(p, "unidad")}
      onClose={() => setCartOpen(false)}
    />
  );

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        {cash.data && !cashOpen && (
          <div className="flex flex-wrap items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:px-6">
            <Wallet className="h-4 w-4" />
            <span className="font-semibold">La caja de este local está cerrada.</span>
            <label className="flex items-center gap-2">
              Fondo inicial S/
              <input className={cn(inputClass, "h-8 w-24 tabular-nums")} inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value.replace(/[^\d.]/g, ""))} aria-label="Fondo inicial de caja" />
            </label>
            <Button size="sm" variant="dark" loading={openCash.isPending} onClick={() => openCash.mutate(Number(opening) || 0, { onSuccess: () => notify("Caja abierta"), onError: (e) => notify(errorMessage(e), "warn") })}>
              Abrir caja
            </Button>
          </div>
        )}
        <div className="sticky top-0 z-10 border-b border-zinc-200 bg-canvas/95 px-4 pb-3 pt-4 backdrop-blur sm:px-6">
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onSearchKey} placeholder="Buscar: paracetamol, Apronax, Genfar o código de barras…" className="pl-9" aria-label="Buscar producto" />
              {q && (
                <button type="button" onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-zinc-400 hover:bg-zinc-100" aria-label="Limpiar búsqueda">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <Select value={lab} onChange={(e) => setLab(e.target.value)} className="w-36 shrink-0 sm:w-48" aria-label="Laboratorio o marca">
              <option value="Todos">Todos los laboratorios</option>
              {labs.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </Select>
          </div>
          <div className="mt-3 flex gap-1.5 overflow-x-auto" role="radiogroup" aria-label="Tipo de producto">
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={category === c}
                onClick={() => setCategory(c)}
                className={cn("shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition", category === c ? "bg-brand text-white" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50")}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-2.5 p-4 sm:p-6 xl:grid-cols-2">
          {(products.isLoading || lots.isLoading) && Array.from({ length: 6 }, (_, i) => <div key={i} className="h-40 animate-pulse rounded-2xl bg-white" />)}
          {results.map((p) => {
            const info = stockInfo.get(p.id);
            const next = info?.next;
            const days = next ? daysUntil(next.expiresOn, now) : null;
            return (
              <ProductCard
                key={p.id}
                product={p}
                stock={info?.stock ?? 0}
                minStock={minFor(p, branchId)}
                nextLot={next}
                hasExpiredOnly={info?.expiredOnly ?? false}
                otherBranch={otherBranch ? { name: otherBranch.name, units: otherStock.get(p.id) ?? 0 } : null}
                sellFirst={!!next && (next.discount > 0 || (days !== null && days <= DEFAULT_THRESHOLDS.red))}
                now={now}
                onAdd={(prod, pres, el) => add(prod, pres, el)}
              />
            );
          })}
          {!products.isLoading && results.length === 0 && (
            <div className="xl:col-span-2">
              <Empty icon={Search} title="Sin resultados">
                Prueba con el principio activo o revisa el tipo y laboratorio elegidos.
              </Empty>
            </div>
          )}
        </div>
      </div>

      <aside className="hidden w-[380px] shrink-0 border-l border-zinc-200 bg-white lg:block" aria-label="Venta actual">
        {panel}
      </aside>

      {lines.length > 0 && !cartOpen && (
        <button type="button" onClick={() => setCartOpen(true)} className="fixed inset-x-4 bottom-20 z-20 flex h-14 items-center justify-between rounded-2xl bg-brand px-5 text-white shadow-2xl lg:hidden">
          <span className="text-sm font-semibold">
            Ver venta · {lines.length} {lines.length === 1 ? "producto" : "productos"}
          </span>
          <span className="text-lg font-semibold tabular-nums">{soles(totals.total)}</span>
        </button>
      )}
      {cartOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-zinc-900/40" onClick={() => setCartOpen(false)} aria-hidden />
          <div className="absolute inset-x-0 bottom-0 top-12 overflow-hidden rounded-t-3xl bg-white">{panel}</div>
        </div>
      )}

      {paying && (
        <PaymentDialog
          totals={totals}
          itemsCount={lines.length}
          customer={cart.customer}
          yapeNumber={config.data?.pharmacy.phone ?? ""}
          submitting={createSale.isPending}
          error={payError}
          onClose={() => setPaying(false)}
          onConfirm={charge}
        />
      )}
      {receipt && config.data && (
        <ReceiptDialog sale={receipt} pharmacy={config.data.pharmacy} branch={branches.find((b) => b.id === receipt.branchId)} products={productMap} onClose={() => setReceipt(null)} />
      )}
    </div>
  );
}
