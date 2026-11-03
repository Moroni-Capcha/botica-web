"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Search, TriangleAlert, Wallet, WifiOff, X } from "lucide-react";
import type { Customer, Lot, Product, Sale, SaleRequest } from "@/lib/api/types";
import { errorMessage } from "@/lib/api";
import { useBranchStock, useCash, useConfig, useCreateSale, useLots, useOpenCash, useProducts, useWritable } from "@/lib/queries";
import { useOperatingBranch, useSessionStore } from "@/lib/auth/session-store";
import { applyReserved, buildProvisionalSale, isConnectionError, isProvisionalSale, newClientSaleId, reservedUnits } from "@/lib/domain/offline-sales";
import { useQueueStore } from "@/lib/offline/queue-store";
import { useOnline } from "@/lib/offline/use-online";
import {
  buildCartLines, cartTotals, daysUntil, findPresentation, sellableLots, stockLabel, unitsInCart, DEFAULT_THRESHOLDS,
} from "@/lib/domain/pharmacy";
import { minFor } from "@/lib/domain/inventory";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty";
import { hitArea, IconButton } from "@/components/ui/icon-button";
import { Input, Select, inputClass } from "@/components/ui/field";
import { notify } from "@/components/ui/toast";
import { soles } from "@/lib/format";
import { cn } from "@/lib/cn";
import { animateIn, POP_KEYFRAMES } from "@/lib/motion";
import { useStableCallback } from "@/lib/use-stable-callback";
import { useBranchCart, useCartStore } from "./cart-store";
import { ProductCard } from "./product-card";
import { CartPanel } from "./cart-panel";
import { CartSheet } from "./cart-sheet";
import { searchEscapeAction, usePosShortcuts } from "./use-pos-shortcuts";
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
  const online = useOnline();
  const queue = useQueueStore((s) => s.state);
  const sellerName = useSessionStore((s) => s.session?.user.name ?? "");
  /** Misma venta, misma clave: si un intento queda sin respuesta, el reintento no la duplica. */
  const attempt = useRef<{ sig: string; id: string } | null>(null);

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
  /* Entrada escalonada de las primeras tarjetas, una sola vez al cargar el catálogo (no al filtrar ni al buscar). */
  const [intro, setIntro] = useState<Map<Product["id"], number> | "done" | null>(null);
  const [opening, setOpening] = useState("150");
  const searchRef = useRef<HTMLInputElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);
  const cartTitleId = useId();

  /* Búsqueda inicial desde otro módulo, p. ej. "Vender" en Vencimientos (/pos?q=Amoxicilina) */
  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get("q");
    if (initial) {
      setQ(initial);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  const productList: Product[] = products.data ?? [];
  const rawLots: Lot[] = lots.data ?? [];
  /** Lotes con lo vendido sin conexión (aún sin enviar) ya descontado: no se vende dos veces lo mismo. */
  const lotList: Lot[] = useMemo(() => applyReserved(rawLots, reservedUnits(queue, branchId), now), [rawLots, queue, branchId, now]);
  const productMap = useMemo(() => new Map(productList.map((p) => [p.id, p])), [productList]);
  const categories = useMemo(() => ["Todos", ...new Set(productList.map((p) => p.category))], [productList]);
  const labs = useMemo(() => [...new Set(productList.map((p) => p.lab))].sort((a, b) => a.localeCompare(b)), [productList]);
  const branches = config.data?.branches ?? [];

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

  /** Por producto, el otro local activo que más stock tiene (para sugerir un traslado cuando aquí se agotó). */
  const otherStock = useMemo(() => {
    const active = new Set(branches.map((b) => b.id));
    const m = new Map<number, { branchId: string; units: number }>();
    for (const s of branchStock.data ?? []) {
      if (s.branchId === branchId || !active.has(s.branchId) || s.units <= 0) continue;
      const cur = m.get(s.productId);
      if (!cur || s.units > cur.units) m.set(s.productId, { branchId: s.branchId, units: s.units });
    }
    return m;
  }, [branchStock.data, branchId, branches]);

  /** Por producto, el otro local ya con su nombre; el objeto no cambia entre renders para que `ProductCard` (memo) no se repinte. */
  const otherBranchOf = useMemo(() => {
    const m = new Map<number, { id: string; name: string; units: number; toId: string }>();
    for (const [productId, o] of otherStock) m.set(productId, { id: o.branchId, name: branches.find((b) => b.id === o.branchId)?.name ?? o.branchId, units: o.units, toId: branchId });
    return m;
  }, [otherStock, branches, branchId]);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    return productList.filter((p) => {
      if (category !== "Todos" && p.category !== category) return false;
      if (lab !== "Todos" && p.lab !== lab) return false;
      if (!s) return true;
      return [p.name, p.active, p.lab, p.barcode, p.conc].some((f) => f.toLowerCase().includes(s));
    });
  }, [productList, q, category, lab]);
  if (intro === null && !products.isLoading && !lots.isLoading && results.length > 0) setIntro(new Map(results.slice(0, 8).map((p, i) => [p.id, i])));
  useEffect(() => {
    if (!(intro instanceof Map)) return;
    const id = setTimeout(() => setIntro("done"), 600);
    return () => clearTimeout(id);
  }, [intro]);

  const lines = useMemo(() => buildCartLines(cart.items, productMap, lotList, now), [cart.items, productMap, lotList, now]);
  const totals = useMemo(() => cartTotals(lines), [lines]);
  const writable = useWritable();
  const cashOpen = cash.data?.open ?? false;
  const canCharge = writable && lines.length > 0 && cashOpen && lines.every((l) => l.missing === 0);

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
      animateIn(el, POP_KEYFRAMES, { duration: 200 });
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

  /* Manejadores con identidad fija: escribir en el buscador o agregar un producto no repinta todas las tarjetas ni todas las líneas. */
  const onAddCard = useStableCallback((prod: Product, pres: Parameters<typeof findPresentation>[1], el: HTMLElement) => add(prod, pres, el));
  const onQtyStable = useStableCallback(changeQty);

  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Escape") {
      if (searchEscapeAction(q) === "clear") setQ("");
      else e.currentTarget.blur();
      return;
    }
    /* Ctrl+Enter es cobrar (atajo global), no agregar */
    if (e.key !== "Enter" || e.ctrlKey || e.metaKey) return;
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

  type Draft = Parameters<Parameters<typeof PaymentDialog>[0]["onConfirm"]>[0];

  const openPayment = () => {
    setPayError(null);
    setPaying(true);
  };

  usePosShortcuts({ searchRef, dialogOpen: paying || !!receipt || cartOpen, canCharge, onPay: openPayment });

  /* Al cerrar el cobro o el comprobante, el foco vuelve al buscador (en pantallas táctiles no, para no subir el teclado). */
  const dialogOpen = paying || !!receipt;
  const hadDialog = useRef(false);
  useEffect(() => {
    if (!dialogOpen && hadDialog.current && !window.matchMedia("(pointer: coarse)").matches) {
      const id = setTimeout(() => searchRef.current?.focus(), 0);
      hadDialog.current = dialogOpen;
      return () => clearTimeout(id);
    }
    hadDialog.current = dialogOpen;
  }, [dialogOpen]);

  const closeCart = useStableCallback(() => {
    setCartOpen(false);
    fabRef.current?.focus();
  });
  const openPaymentStable = useStableCallback(openPayment);
  const onCustomerStable = useStableCallback((c: Customer | null) => setCustomer(branchId, c));
  const onClearStable = useStableCallback(() => clear(branchId));
  const onAddEquivalent = useStableCallback((p: Product) => add(p, "unidad"));

  const finishSale = () => {
    attempt.current = null;
    clear(branchId);
    setPaying(false);
    setCartOpen(false);
    setLastAdded(null);
  };

  /** Sin conexión: la venta queda en la cola del equipo (con su clave) y se entrega un ticket provisional. */
  const saveOffline = async (request: SaleRequest & { clientSaleId: string }, draft: Draft) => {
    try {
      const item = await useQueueStore.getState().enqueue({
        request,
        total: totals.total,
        reserve: lines.map((l) => ({ productId: l.productId, units: l.units })),
        now: Date.now(),
      });
      const sale = buildProvisionalSale({
        clientSaleId: item.clientSaleId, ticket: item.ticket, branchId, soldAt: item.request.soldAt ?? new Date().toISOString(), sellerName, lines, totals,
        payment: draft.payment, document: draft.document, customerId: draft.customerId ?? null, prescription: draft.prescription ?? null,
      });
      finishSale();
      setReceipt(sale);
      notify(`Venta guardada sin conexión · ticket ${item.ticket}. Se enviará sola al volver el internet.`);
    } catch (e) {
      setPayError(errorMessage(e));
    }
  };

  const charge = async (draft: Draft) => {
    setPayError(null);
    const items = cart.items.map((i) => ({ productId: i.productId, presentation: i.presentation, qty: i.qty }));
    const sig = JSON.stringify([branchId, items, draft]);
    if (attempt.current?.sig !== sig) attempt.current = { sig, id: newClientSaleId() };
    const request = { ...draft, branchId, items, clientSaleId: attempt.current.id };
    if (!online) return saveOffline(request, draft);
    try {
      const sale = await createSale.mutateAsync(request);
      finishSale();
      setReceipt(sale);
      notify(`${sale.document.type === "factura" ? "Factura" : "Boleta"} ${sale.number} emitida`);
    } catch (e) {
      /* Se cortó el internet al cobrar: la venta no se pierde, queda en la cola con la misma clave (si el servidor sí la recibió, al enviar no se duplica). */
      if (isConnectionError(e)) return saveOffline(request, draft);
      setPayError(errorMessage(e));
    }
  };

  if ((products.isError && !products.data) || (lots.isError && !lots.data)) {
    return (
      <Empty icon={TriangleAlert} title="No se pudo cargar el catálogo">
        {errorMessage(products.error ?? lots.error)}{" "}
        <button type="button" className="font-semibold underline" onClick={() => void Promise.all([products.refetch(), lots.refetch()])}>
          Reintentar
        </button>
      </Empty>
    );
  }

  const renderPanel = (titleId?: string) => (
    <CartPanel
      lines={lines}
      totals={totals}
      customer={cart.customer}
      onCustomer={onCustomerStable}
      onQty={onQtyStable}
      onClear={onClearStable}
      onCharge={openPaymentStable}
      canCharge={canCharge}
      writable={writable}
      cashOpen={cashOpen}
      equivalents={equivalents}
      onAddEquivalent={onAddEquivalent}
      onClose={closeCart}
      titleId={titleId}
      staggerLines={!!titleId}
    />
  );

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        {!online && (
          <div className="flex flex-wrap items-center gap-2 border-b border-warning-border bg-warning-bg px-4 py-2.5 text-sm text-warning-fg sm:px-6" role="status">
            <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
            <span className="font-semibold">Sin conexión.</span>
            <span>Puedes seguir cobrando con el stock guardado en este equipo; las ventas se envían solas al volver el internet.</span>
          </div>
        )}
        {cash.data && !cashOpen && (
          <div className="flex flex-wrap items-center gap-3 border-b border-warning-border bg-warning-bg px-4 py-3 text-sm text-warning-fg sm:px-6">
            <Wallet className="h-4 w-4" aria-hidden />
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
        <div className="sticky top-0 z-10 border-b border-line bg-canvas/95 px-4 pb-3 pt-4 backdrop-blur sm:px-6">
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
              <Input ref={searchRef} autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onSearchKey} placeholder="Buscar: paracetamol, Apronax, Genfar o código de barras…" className="pl-9 pr-12" aria-label="Buscar producto" aria-keyshortcuts="F2" />
              {!q && (
                <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded-md border border-line bg-sunken px-1.5 text-micro font-semibold text-muted sm:pointer-fine:inline-block" aria-hidden>
                  F2
                </kbd>
              )}
              {q && (
                <IconButton size="xs" onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2" aria-label="Limpiar búsqueda">
                  <X className="h-3.5 w-3.5" aria-hidden />
                </IconButton>
              )}
            </div>
            <Select value={lab} onChange={(e) => setLab(e.target.value)} className="w-36 shrink-0 sm:w-48" aria-label="Laboratorio o marca">
              <option value="Todos">Todos los laboratorios</option>
              {labs.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </Select>
          </div>
          <div className="-mx-1 -mb-2 mt-1 flex gap-1.5 overflow-x-auto px-1 py-2" role="radiogroup" aria-label="Tipo de producto">
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={category === c}
                onClick={() => setCategory(c)}
                className={cn(hitArea, "shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors duration-[var(--dur-fast)]", category === c ? "bg-brand text-white" : "bg-surface text-fg-2 ring-1 ring-line hover:bg-subtle")}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-2.5 p-4 sm:p-6 xl:grid-cols-2">
          {(products.isLoading || lots.isLoading) && Array.from({ length: 6 }, (_, i) => <div key={i} className="h-40 animate-pulse rounded-2xl bg-surface" />)}
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
                otherBranch={otherBranchOf.get(p.id) ?? null}
                sellFirst={!!next && (next.discount > 0 || (days !== null && days <= DEFAULT_THRESHOLDS.red))}
                now={now}
                onAdd={onAddCard}
                introIndex={intro instanceof Map ? intro.get(p.id) : undefined}
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

      <aside className="hidden w-[380px] shrink-0 border-l border-line bg-surface lg:block" aria-label="Venta actual">
        {renderPanel()}
      </aside>

      {lines.length > 0 && (
        <button ref={fabRef} type="button" onClick={() => setCartOpen(true)} className="fixed inset-x-4 bottom-20 z-20 flex h-14 items-center justify-between rounded-2xl bg-brand px-5 text-white shadow-overlay transition-transform duration-[var(--dur-fast)] ease-[var(--ease-out)] active:scale-[0.98] lg:hidden">
          <span className="text-sm font-semibold">
            Ver venta · {lines.length} {lines.length === 1 ? "producto" : "productos"}
          </span>
          <span className="text-lg font-semibold tabular-nums">{soles(totals.total)}</span>
        </button>
      )}
      <CartSheet open={cartOpen} onClose={closeCart} titleId={cartTitleId}>
        {renderPanel(cartTitleId)}
      </CartSheet>

      {paying && (
        <PaymentDialog
          totals={totals}
          itemsCount={lines.length}
          customer={cart.customer}
          yapeNumber={config.data?.pharmacy.phone ?? ""}
          submitting={createSale.isPending}
          offline={!online}
          error={payError}
          onClose={() => setPaying(false)}
          onConfirm={charge}
        />
      )}
      {receipt && config.data && (
        <ReceiptDialog sale={receipt} provisional={isProvisionalSale(receipt)} pharmacy={config.data.pharmacy} branch={branches.find((b) => b.id === receipt.branchId)} products={productMap} onClose={() => setReceipt(null)} />
      )}
    </div>
  );
}
