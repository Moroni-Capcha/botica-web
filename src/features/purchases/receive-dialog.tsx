"use client";

import { useMemo, useState } from "react";
import { PackagePlus, Plus, Trash2, TriangleAlert } from "lucide-react";
import type { Branch, BranchId, Lot, Product, Purchase, Supplier } from "@/lib/api/types";
import { errorMessage } from "@/lib/api";
import { checkReceiptLine, isValidSupplierDocument, normalizeLotCode, receiptTotals, type QtyMode, type ReceiptLineDraft } from "@/lib/domain/purchasing";
import { useCreatePurchase } from "@/lib/queries";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, inputClass } from "@/components/ui/field";
import { ProductPicker } from "@/components/product-picker";
import { notify } from "@/components/ui/toast";
import { soles } from "@/lib/format";
import { cn } from "@/lib/cn";

/** Fila inicial: viene del pedido sugerido o vacía. */
export interface ReceivePrefill {
  productId: number;
  packs: number;
  supplier: string | null;
}

let seq = 0;
const newKey = () => `r${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Mañana en YYYY-MM-DD: el vencimiento mínimo aceptado. */
const isoTomorrow = (now: number) => {
  const d = new Date(now + 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

interface Props {
  branches: Branch[];
  /** Locales donde la cuenta puede recibir. */
  allowed: BranchId[];
  defaultBranch: BranchId;
  products: Product[];
  suppliers: Supplier[];
  lots: Lot[];
  minShelfDays: number;
  prefill: ReceivePrefill[];
  onClose: () => void;
  onDone: (p: Purchase) => void;
}

/** Registro del ingreso de mercadería: cada fila es un lote con su vencimiento, tal como figura en la caja. */
export function ReceiveDialog({ branches, allowed, defaultBranch, products, suppliers, lots, minShelfDays, prefill, onClose, onDone }: Props) {
  const [now] = useState(() => Date.now());
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const active = suppliers.filter((s) => s.active);
  const firstSupplier = active.find((s) => s.name === prefill[0]?.supplier) ?? active[0];

  const [branchId, setBranchId] = useState<BranchId>(allowed.includes(defaultBranch) ? defaultBranch : (allowed[0] ?? defaultBranch));
  const [supplierId, setSupplierId] = useState<number | null>(firstSupplier?.id ?? null);
  const [docNumber, setDocNumber] = useState("");
  const mkLine = (productId: number | null = null, packs = 0): ReceiptLineDraft => {
    const p = productId !== null ? productById.get(productId) : undefined;
    return { key: newKey(), productId, lotCode: "", expiresOn: "", qty: packs, mode: p && p.unitsPerBox > 1 ? "caja" : "unidad", unitCost: p?.cost ?? 0 };
  };
  const [lines, setLines] = useState<ReceiptLineDraft[]>(() => (prefill.length ? prefill.map((x) => mkLine(x.productId, x.packs)) : [mkLine()]));
  /* Textos de cantidad y costo mientras se escriben */
  const [costText, setCostText] = useState<Record<string, string>>({});
  const [tried, setTried] = useState(false);
  const create = useCreatePurchase();

  const branchLots = useMemo(() => lots.filter((l) => l.branchId === branchId), [lots, branchId]);
  const checks = lines.map((l) => checkReceiptLine(l, l.productId !== null ? productById.get(l.productId) : undefined, { now, minShelfDays, branchLots, lines }));
  const totals = receiptTotals(checks);
  const docOk = isValidSupplierDocument(docNumber);
  const ok = !!supplierId && docOk && lines.length > 0 && checks.every((c) => !c.error);
  const errorsCount = checks.filter((c) => c.error).length;

  const update = (key: string, patch: Partial<ReceiptLineDraft>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const pickProduct = (key: string, id: number | null) => {
    const p = id !== null ? productById.get(id) : undefined;
    update(key, { productId: id, mode: p && p.unitsPerBox > 1 ? "caja" : "unidad", unitCost: p?.cost ?? 0 });
    setCostText((c) => ({ ...c, [key]: p ? String(p.cost) : "" }));
  };

  const submit = () => {
    setTried(true);
    if (!ok || !supplierId) return;
    create.mutate(
      {
        branchId,
        supplierId,
        document: docNumber.trim().toUpperCase(),
        items: lines.map((l, i) => ({ productId: l.productId!, lotCode: normalizeLotCode(l.lotCode), expiresOn: l.expiresOn, units: checks[i]!.units, unitCost: l.unitCost })),
      },
      {
        onSuccess: (p) => {
          notify(`Ingreso ${p.document} registrado: ${p.items.length} ${p.items.length === 1 ? "lote" : "lotes"} en ${branches.find((b) => b.id === p.branchId)?.name ?? p.branchId}`);
          onDone(p);
        },
      },
    );
  };

  return (
    <Dialog
      title="Registrar ingreso de mercadería"
      description="Cada fila es un lote: copia el número de lote y la fecha de vencimiento tal como figuran en la caja."
      onClose={onClose}
      size="xl"
      footer={
        <>
          <div className="mr-auto min-w-0 text-sm">
            {create.error ? (
              <p className="text-rose-600" role="alert">{errorMessage(create.error)}</p>
            ) : tried && !ok ? (
              <p className="text-rose-600" role="alert">{!supplierId ? "Elige el proveedor." : !docOk ? "Revisa la factura o guía." : `Revisa ${errorsCount} ${errorsCount === 1 ? "fila" : "filas"}.`}</p>
            ) : (
              <p className="text-zinc-600">
                {totals.units.toLocaleString("es-PE")} unid. · Subtotal <b className="tabular-nums text-zinc-900">{soles(totals.subtotal)}</b> · IGV {soles(totals.igv)} · Total{" "}
                <b className="tabular-nums text-zinc-900">{soles(totals.total)}</b>
              </p>
            )}
          </div>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={create.isPending} onClick={submit}>
            <PackagePlus className="h-4 w-4" /> Ingresar {lines.length} {lines.length === 1 ? "lote" : "lotes"}
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
        <div className="grid gap-3 sm:grid-cols-[1fr_2fr_1.3fr]">
          <Field label="Ingresa a">
            <Select value={branchId} onChange={(e) => setBranchId(e.target.value)} disabled={allowed.length < 2}>
              {branches.filter((b) => allowed.includes(b.id)).map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Proveedor" error={tried && !supplierId ? "Elige el proveedor" : undefined}>
            <Select value={supplierId ?? ""} onChange={(e) => setSupplierId(e.target.value ? Number(e.target.value) : null)}>
              {!active.length && <option value="">Primero registra un proveedor</option>}
              {active.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Factura o guía del proveedor" error={tried && !docOk ? "Serie y número: F001-00012345" : undefined}>
            <Input value={docNumber} onChange={(e) => setDocNumber(e.target.value.toUpperCase())} placeholder="F001-00012345" className="tabular-nums" aria-invalid={tried && !docOk} />
          </Field>
        </div>

        <ol className="grid gap-3">
          {lines.map((l, i) => {
            const c = checks[i]!;
            const p = l.productId !== null ? productById.get(l.productId) : undefined;
            const showError = tried && c.error;
            return (
              <li key={l.key} className={cn("rounded-2xl border p-3", showError ? "border-rose-300 bg-rose-50/40" : c.warning ? "border-amber-300 bg-amber-50/40" : "border-zinc-200")}>
                <div className="grid gap-2 sm:grid-cols-12">
                  <div className="sm:col-span-4">
                    <span className="mb-1 block text-xs font-medium text-zinc-600">Producto {i + 1}</span>
                    <ProductPicker products={products} value={l.productId} onChange={(id) => pickProduct(l.key, id)} invalid={!!(tried && !p)} ariaLabel={`Producto ${i + 1}`} />
                  </div>
                  <Field label="Lote" className="sm:col-span-2">
                    <Input value={l.lotCode} onChange={(e) => update(l.key, { lotCode: e.target.value.toUpperCase() })} placeholder="AB12345" className="tabular-nums" />
                  </Field>
                  <Field label="Vencimiento" className="sm:col-span-2">
                    <Input type="date" min={isoTomorrow(now)} value={l.expiresOn} onChange={(e) => update(l.key, { expiresOn: e.target.value })} />
                  </Field>
                  <Field label="Cantidad" className="sm:col-span-2">
                    <div className="flex gap-1">
                      <Input inputMode="numeric" value={l.qty ? String(l.qty) : ""} onChange={(e) => update(l.key, { qty: Number(e.target.value.replace(/\D/g, "")) || 0 })} className="tabular-nums" />
                      {p && p.unitsPerBox > 1 && (
                        <select aria-label="Se recibe en" value={l.mode} onChange={(e) => update(l.key, { mode: e.target.value as QtyMode })} className={cn(inputClass, "w-auto shrink-0 px-2")}>
                          <option value="caja">cj</option>
                          <option value="unidad">u</option>
                        </select>
                      )}
                    </div>
                  </Field>
                  <Field label="Costo unidad sin IGV" className="sm:col-span-2">
                    <Input
                      inputMode="decimal"
                      value={costText[l.key] ?? (l.unitCost ? String(l.unitCost) : "")}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^\d.]/g, "");
                        setCostText((x) => ({ ...x, [l.key]: v }));
                        update(l.key, { unitCost: Number(v) || 0 });
                      }}
                      className="tabular-nums"
                    />
                  </Field>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  {p && (
                    <span className="tabular-nums text-zinc-500">
                      {c.units.toLocaleString("es-PE")} unid. · {soles(c.subtotal)}
                    </span>
                  )}
                  {c.error && <span className={showError ? "font-semibold text-rose-700" : "text-zinc-400"}>{c.error}</span>}
                  {!c.error && c.warning && (
                    <span className="flex items-center gap-1 font-semibold text-amber-800">
                      <TriangleAlert className="h-3.5 w-3.5 shrink-0" /> {c.warning}
                    </span>
                  )}
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
          <Plus className="h-3.5 w-3.5" /> Agregar lote
        </Button>
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Dialog>
  );
}
