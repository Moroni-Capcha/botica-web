"use client";

import { useMemo, useState } from "react";
import { ArrowRight, ClipboardList, Plus, Send, Trash2 } from "lucide-react";
import type { Branch, BranchId, Product, Transfer, User } from "@/lib/api/types";
import { errorMessage } from "@/lib/api";
import { checkTransferLine, transferMode, type TransferLineDraft } from "@/lib/domain/transfers";
import { parseDay, sellableLots, stockLabel } from "@/lib/domain/pharmacy";
import { useTransferAction } from "@/lib/queries";
import { useBranchLots } from "@/features/shared/branch-scope";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, inputClass } from "@/components/ui/field";
import { ProductPicker } from "@/components/product-picker";
import { notify } from "@/components/ui/toast";
import { dateShort } from "@/lib/format";
import { cn } from "@/lib/cn";

export interface TransferSeed {
  from: BranchId;
  to: BranchId;
  productId?: number;
  lotId?: number | null;
  units?: number;
}

let seq = 0;
const newKey = () => `t${Date.now().toString(36)}${(seq++).toString(36)}`;

interface Props {
  seed: TransferSeed;
  user: User;
  branches: Branch[];
  products: Product[];
  /** Stock vigente por local y producto, clave `${branchId}:${productId}`. */
  stock: Map<string, number>;
  onClose: () => void;
  onDone: (t: Transfer) => void;
}

/**
 * Enviar (sale ya del origen, con lote) o pedir (el otro local lo despacha).
 * El modo depende de la cuenta: se envía desde el local propio y se pide al otro.
 */
export function TransferDialog({ seed, user, branches, products, stock, onClose, onDone }: Props) {
  const [now] = useState(() => Date.now());
  const isAdmin = user.role === "admin";
  const [from, setFrom] = useState<BranchId>(seed.from);
  const [to, setTo] = useState<BranchId>(seed.to !== seed.from ? seed.to : (branches.find((b) => b.id !== seed.from)?.id ?? seed.to));
  const mode = transferMode(user, from);
  const originQ = useBranchLots(mode === "send" ? [from] : []);
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const name = (id: BranchId) => branches.find((b) => b.id === id)?.name ?? id;

  const mkLine = (productId: number | null = null, lotId: number | null = null, units = 0): TransferLineDraft => {
    const p = productId !== null ? productById.get(productId) : undefined;
    const box = p && p.unitsPerBox > 1 && units > 0 && units % p.unitsPerBox === 0;
    return { key: newKey(), productId, lotId, qty: box ? units / p.unitsPerBox : units, mode: box ? "caja" : "unidad" };
  };
  const [lines, setLines] = useState<TransferLineDraft[]>(() => [mkLine(seed.productId ?? null, seed.lotId ?? null, seed.units ?? 0)]);
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);
  const action = useTransferAction();

  const originLots = originQ.lots;
  const checks = lines.map((l) => checkTransferLine(l, l.productId !== null ? productById.get(l.productId) : undefined, { mode, originLots, lines, now }));
  const ok = lines.length > 0 && checks.every((c) => !c.error) && !originQ.isLoading;
  const totalUnits = checks.reduce((s, c) => s + c.units, 0);

  /* Al enviar, solo productos con stock vigente en el origen */
  const pickable = useMemo(() => (mode === "send" ? products.filter((p) => (stock.get(`${from}:${p.id}`) ?? 0) > 0) : products), [mode, products, stock, from]);

  const update = (key: string, patch: Partial<TransferLineDraft>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  /* La cuenta de local envía desde el suyo o pide para el suyo: si el origen es otro, el destino es su local */
  const own = user.branchId;
  const toOptions = (f: BranchId) => branches.filter((b) => b.id !== f && (isAdmin || f === own || b.id === own));
  const changeFrom = (b: BranchId) => {
    setFrom(b);
    const opts = toOptions(b);
    if (!opts.some((x) => x.id === to)) setTo(opts[0]?.id ?? to);
    setLines((ls) => ls.map((l) => ({ ...l, lotId: null })));
  };

  const submit = () => {
    setTried(true);
    if (!ok) return;
    const items = lines.map((l, i) => ({ productId: l.productId!, units: checks[i]!.units, lotId: l.lotId }));
    const done = (t: Transfer) => {
      notify(mode === "send" ? `${t.code} enviado a ${name(t.toBranchId)}. Queda en camino hasta que lo reciban.` : `Pedido ${t.code} enviado a ${name(t.fromBranchId)}.`);
      onDone(t);
    };
    if (mode === "send") action.mutate({ kind: "send", input: { fromBranchId: from, toBranchId: to, note, items } }, { onSuccess: done });
    else action.mutate({ kind: "ask", input: { fromBranchId: from, toBranchId: to, note, items: items.map(({ productId, units }) => ({ productId, units })) } }, { onSuccess: done });
  };

  return (
    <Dialog
      title={mode === "send" ? "Enviar mercadería" : `Pedir mercadería a ${name(from)}`}
      description={mode === "send" ? "El stock sale ahora del origen y entra al destino cuando lo confirmen." : `${name(from)} verá el pedido y lo despachará con sus lotes más próximos a vencer.`}
      onClose={onClose}
      size="xl"
      footer={
        <>
          <p className="mr-auto min-w-0 text-sm" role={action.error ? "alert" : undefined}>
            {action.error ? <span className="text-rose-600">{errorMessage(action.error)}</span> : <span className="text-zinc-600">{totalUnits.toLocaleString("es-PE")} unid. en {lines.length} {lines.length === 1 ? "fila" : "filas"}</span>}
          </p>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={action.isPending} onClick={submit}>
            {mode === "send" ? (
              <>
                <Send className="h-4 w-4" /> Enviar a {name(to)}
              </>
            ) : (
              <>
                <ClipboardList className="h-4 w-4" /> Enviar pedido
              </>
            )}
          </Button>
        </>
      }
    >
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Desde" className="w-full sm:w-56">
            <Select value={from} onChange={(e) => changeFrom(e.target.value)}>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </Select>
          </Field>
          <ArrowRight className="mb-3 hidden h-5 w-5 text-zinc-400 sm:block" />
          <Field label="Hacia" className="w-full sm:w-56">
            <Select value={to} onChange={(e) => setTo(e.target.value)} disabled={toOptions(from).length < 2}>
              {toOptions(from).map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </Select>
          </Field>
          {!isAdmin && (
            <p className="pb-2.5 text-xs text-zinc-500">{mode === "send" ? "Envías desde tu local." : "Es un pedido: tu stock no cambia hasta que llegue."}</p>
          )}
        </div>

        <ol className="grid gap-3">
          {lines.map((l, i) => {
            const c = checks[i]!;
            const p = l.productId !== null ? productById.get(l.productId) : undefined;
            const lots = p ? sellableLots(originLots, p.id, now).sort((a, b) => parseDay(a.expiresOn) - parseDay(b.expiresOn)) : [];
            const showError = tried && c.error;
            return (
              <li key={l.key} className={cn("rounded-2xl border p-3", showError ? "border-rose-300 bg-rose-50/40" : "border-zinc-200")}>
                <div className="grid gap-2 sm:grid-cols-12">
                  <div className={mode === "send" ? "sm:col-span-5" : "sm:col-span-8"}>
                    <span className="mb-1 block text-xs font-medium text-zinc-600">Producto {i + 1}</span>
                    <ProductPicker products={pickable} value={l.productId} invalid={!!(tried && !p)} ariaLabel={`Producto ${i + 1}`} onChange={(id) => update(l.key, { productId: id, lotId: null, mode: id !== null && (productById.get(id)?.unitsPerBox ?? 1) > 1 ? "caja" : "unidad" })} />
                  </div>
                  {mode === "send" && (
                    <Field label="Lote" className="sm:col-span-4">
                      <Select value={l.lotId ?? "auto"} disabled={!p} onChange={(e) => update(l.key, { lotId: e.target.value === "auto" ? null : Number(e.target.value) })}>
                        <option value="auto">Automático (vence primero)</option>
                        {lots.map((lot) => (
                          <option key={lot.id} value={lot.id}>
                            {lot.code} · vence {dateShort(lot.expiresOn)} · {lot.qty.toLocaleString("es-PE")} u
                          </option>
                        ))}
                      </Select>
                    </Field>
                  )}
                  <Field label="Cantidad" className={mode === "send" ? "sm:col-span-3" : "sm:col-span-4"}>
                    <div className="flex gap-1">
                      <Input inputMode="numeric" value={l.qty ? String(l.qty) : ""} onChange={(e) => update(l.key, { qty: Number(e.target.value.replace(/\D/g, "")) || 0 })} className="tabular-nums" />
                      {p && p.unitsPerBox > 1 && (
                        <select aria-label="Unidad" value={l.mode} onChange={(e) => update(l.key, { mode: e.target.value as "caja" | "unidad" })} className={cn(inputClass, "w-auto shrink-0 px-2")}>
                          <option value="caja">cj</option>
                          <option value="unidad">u</option>
                        </select>
                      )}
                    </div>
                  </Field>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  {p && (
                    <span className="text-zinc-500">
                      {c.units.toLocaleString("es-PE")} unid. · {name(from)} tiene {stockLabel(p, stock.get(`${from}:${p.id}`) ?? 0)} · {name(to)} tiene {stockLabel(p, stock.get(`${to}:${p.id}`) ?? 0)}
                    </span>
                  )}
                  {c.error && <span className={showError ? "font-semibold text-rose-700" : "text-zinc-400"}>{c.error}</span>}
                  {lines.length > 1 && (
                    <button type="button" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="ml-auto inline-flex items-center gap-1 font-medium text-zinc-500 hover:text-rose-600">
                      <Trash2 className="h-3.5 w-3.5" /> Quitar
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
        <Button size="sm" variant="ghost" className="w-fit" onClick={() => setLines((ls) => [...ls, mkLine()])}>
          <Plus className="h-3.5 w-3.5" /> Agregar producto
        </Button>
        <Field label="Nota (opcional)">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej.: lo lleva el motorizado a las 4 p. m." maxLength={200} />
        </Field>
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Dialog>
  );
}
