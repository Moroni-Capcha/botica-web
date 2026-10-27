"use client";

import { useMemo, useState, type ChangeEvent } from "react";
import { Save } from "lucide-react";
import type { Branch, Product, ProductInput, RxCondition } from "@/lib/api/types";
import { errorMessage } from "@/lib/api";
import { DEFAULT_CATEGORIES, marginPct, normalizeProduct, validateProduct } from "@/lib/domain/inventory";
import { useSaveProduct } from "@/lib/queries";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { notify } from "@/components/ui/toast";
import { soles } from "@/lib/format";
import { RX_LABEL } from "./export";

const EMPTY: ProductInput = {
  name: "", active: "", conc: "", form: "Tableta", lab: "", category: "Analgésicos", rx: "libre",
  unitsPerBox: 100, unitsPerBlister: 10, unitName: "tableta", priceUnit: 0, priceBlister: 0, priceBox: 0, cost: 0,
  minStock: 20, minStockByBranch: {}, location: "", barcode: "", sanitaryReg: "", coldChain: false,
};

type NumKey = "unitsPerBox" | "unitsPerBlister" | "priceUnit" | "priceBlister" | "priceBox" | "cost" | "minStock";
const NUM_KEYS: NumKey[] = ["unitsPerBox", "unitsPerBlister", "priceUnit", "priceBlister", "priceBox", "cost", "minStock"];

/** Alta y edición de un producto del catálogo (lo usa el administrador). Los lotes se registran en Compras. */
export function ProductFormDialog({ product, products, branches, onClose, onSaved }: { product: Product | null; products: Product[]; branches: Branch[]; onClose: () => void; onSaved?: (p: Product) => void }) {
  const initial: ProductInput = useMemo(() => {
    if (!product) return EMPTY;
    const { id: _id, ...rest } = product;
    return { ...EMPTY, ...rest };
  }, [product]);
  const [f, setF] = useState<ProductInput>(initial);
  /* Los números se editan como texto para permitir "0." mientras se escribe */
  const [nums, setNums] = useState<Record<NumKey, string>>(() => Object.fromEntries(NUM_KEYS.map((k) => [k, initial[k] ? String(initial[k]) : ""])) as Record<NumKey, string>);
  const [mins, setMins] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      branches.map((b) => {
        const v = initial.minStockByBranch?.[b.id];
        return [b.id, v === undefined ? "" : String(v)];
      }),
    ),
  );
  const [touched, setTouched] = useState(false);
  const save = useSaveProduct();

  const categories = useMemo(() => [...new Set([...DEFAULT_CATEGORIES, ...products.map((p) => p.category)])].sort((a, b) => a.localeCompare(b)), [products]);
  const labs = useMemo(() => [...new Set(products.map((p) => p.lab))].sort((a, b) => a.localeCompare(b)), [products]);
  const forms = useMemo(() => [...new Set(["Tableta", "Cápsula", "Jarabe", "Suspensión", "Crema", "Gotas", "Inyectable", "Sobre", ...products.map((p) => p.form)])].sort((a, b) => a.localeCompare(b)), [products]);

  const draft: ProductInput = useMemo(() => {
    const n = (k: NumKey) => Number(nums[k]) || 0;
    const byBranch = Object.fromEntries(Object.entries(mins).filter(([, v]) => v.trim() !== "").map(([k, v]) => [k, Math.round(Number(v) || 0)]));
    return normalizeProduct({ ...f, unitsPerBox: Math.round(n("unitsPerBox")), unitsPerBlister: Math.round(n("unitsPerBlister")), priceUnit: n("priceUnit"), priceBlister: n("priceBlister"), priceBox: n("priceBox"), cost: n("cost"), minStock: Math.round(n("minStock")), minStockByBranch: byBranch });
  }, [f, nums, mins]);
  const errors = validateProduct(draft, products, product?.id);
  const hasErrors = Object.keys(errors).length > 0;
  const err = (k: keyof ProductInput) => (touched ? errors[k] : undefined);

  const set = <K extends keyof ProductInput>(k: K, v: ProductInput[K]) => setF((x) => ({ ...x, [k]: v }));
  const num = (k: NumKey, decimals: boolean) => ({
    inputMode: decimals ? ("decimal" as const) : ("numeric" as const),
    value: nums[k],
    onChange: (e: ChangeEvent<HTMLInputElement>) => setNums((x) => ({ ...x, [k]: e.target.value.replace(decimals ? /[^\d.]/g : /\D/g, "") })),
    className: "tabular-nums",
    "aria-invalid": !!err(k),
  });

  const submit = () => {
    setTouched(true);
    if (hasErrors) return;
    save.mutate(
      { id: product?.id, input: draft },
      {
        onSuccess: (p) => {
          notify(product ? "Producto actualizado" : "Producto creado. Registra sus lotes al ingresar la compra.");
          onSaved?.(p);
          onClose();
        },
      },
    );
  };

  const presentations = [
    { label: "Unidad", price: draft.priceUnit, units: 1 },
    ...(draft.unitsPerBlister > 1 && draft.priceBlister > 0 ? [{ label: `Blíster x${draft.unitsPerBlister}`, price: draft.priceBlister, units: draft.unitsPerBlister }] : []),
    ...(draft.unitsPerBox > 1 && draft.priceBox > 0 ? [{ label: `Caja x${draft.unitsPerBox}`, price: draft.priceBox, units: draft.unitsPerBox }] : []),
  ];

  return (
    <Dialog
      title={product ? `Editar ${product.name} ${product.conc}` : "Nuevo producto"}
      description="Los lotes y vencimientos se registran al ingresar la mercadería en Compras."
      onClose={onClose}
      size="xl"
      footer={
        <>
          {(save.error || (touched && hasErrors)) && (
            <p className="mr-auto text-sm text-rose-600" role="alert">
              {save.error ? errorMessage(save.error) : "Revisa los campos marcados."}
            </p>
          )}
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={save.isPending} onClick={submit}>
            <Save className="h-4 w-4" /> Guardar
          </Button>
        </>
      }
    >
      <form
        className="grid gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <fieldset className="grid gap-3 sm:grid-cols-6">
          <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Producto</legend>
          <Field label="Nombre comercial" error={err("name")} className="sm:col-span-3">
            <Input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Panadol Forte" aria-invalid={!!err("name")} />
          </Field>
          <Field label="Principio activo (DCI)" hint="Sirve para ofrecer genéricos equivalentes" className="sm:col-span-3">
            <Input value={f.active} onChange={(e) => set("active", e.target.value)} placeholder="Paracetamol" />
          </Field>
          <Field label="Concentración" className="sm:col-span-2">
            <Input value={f.conc} onChange={(e) => set("conc", e.target.value)} placeholder="500 mg" />
          </Field>
          <Field label="Forma farmacéutica" className="sm:col-span-2">
            <Input list="pf-forms" value={f.form} onChange={(e) => set("form", e.target.value)} />
            <datalist id="pf-forms">{forms.map((x) => <option key={x} value={x} />)}</datalist>
          </Field>
          <Field label="Laboratorio o marca" error={err("lab")} className="sm:col-span-2">
            <Input list="pf-labs" value={f.lab} onChange={(e) => set("lab", e.target.value)} aria-invalid={!!err("lab")} />
            <datalist id="pf-labs">{labs.map((x) => <option key={x} value={x} />)}</datalist>
          </Field>
          <Field label="Tipo" error={err("category")} className="sm:col-span-2">
            <Input list="pf-cats" value={f.category} onChange={(e) => set("category", e.target.value)} aria-invalid={!!err("category")} />
            <datalist id="pf-cats">{categories.map((x) => <option key={x} value={x} />)}</datalist>
          </Field>
          <Field label="Condición de venta" className="sm:col-span-2">
            <Select value={f.rx} onChange={(e) => set("rx", e.target.value as RxCondition)}>
              {(Object.keys(RX_LABEL) as RxCondition[]).map((k) => (
                <option key={k} value={k}>{RX_LABEL[k]}</option>
              ))}
            </Select>
          </Field>
          <Field label="Registro sanitario" className="sm:col-span-2">
            <Input value={f.sanitaryReg} onChange={(e) => set("sanitaryReg", e.target.value)} placeholder="EE-01234" />
          </Field>
          <Field label="Código de barras" error={err("barcode")} className="sm:col-span-3">
            <Input inputMode="numeric" value={f.barcode} onChange={(e) => set("barcode", e.target.value.replace(/\D/g, ""))} placeholder="7751234567890" className="tabular-nums" aria-invalid={!!err("barcode")} />
          </Field>
          <Field label="Ubicación en anaquel" className="sm:col-span-1">
            <Input value={f.location} onChange={(e) => set("location", e.target.value)} placeholder="A-1" />
          </Field>
          <label className="flex items-center gap-2 self-end pb-2.5 text-sm sm:col-span-2">
            <input type="checkbox" checked={f.coldChain} onChange={(e) => set("coldChain", e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />
            Cadena de frío (2–8 °C)
          </label>
        </fieldset>

        <fieldset className="grid gap-3 sm:grid-cols-6">
          <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Presentaciones y precios (con IGV)</legend>
          <Field label="Nombre de la unidad" hint="tableta, frasco, sobre…" className="sm:col-span-2">
            <Input value={f.unitName} onChange={(e) => set("unitName", e.target.value)} />
          </Field>
          <Field label="Unidades por caja" error={err("unitsPerBox")} hint="1 si se vende suelto" className="sm:col-span-2">
            <Input {...num("unitsPerBox", false)} />
          </Field>
          <Field label="Unidades por blíster" error={err("unitsPerBlister")} hint="0 si no se vende por blíster" className="sm:col-span-2">
            <Input {...num("unitsPerBlister", false)} />
          </Field>
          <Field label="Precio unidad (S/)" error={err("priceUnit")} className="sm:col-span-2">
            <Input {...num("priceUnit", true)} />
          </Field>
          <Field label="Precio blíster (S/)" error={err("priceBlister")} hint="0 = no se vende así" className="sm:col-span-2">
            <Input {...num("priceBlister", true)} />
          </Field>
          <Field label="Precio caja (S/)" error={err("priceBox")} hint="0 = no se vende así" className="sm:col-span-2">
            <Input {...num("priceBox", true)} />
          </Field>
          <Field label="Costo por unidad sin IGV (S/)" error={err("cost")} className="sm:col-span-2">
            <Input {...num("cost", true)} />
          </Field>
          <div className="flex flex-wrap items-end gap-2 sm:col-span-4">
            {presentations.filter((x) => x.price > 0).map((x) => {
              const m = marginPct(x.price, x.units, draft.cost);
              return (
                <span key={x.label} className="rounded-xl bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
                  {x.label}: <b className="tabular-nums text-zinc-900">{soles(x.price)}</b> · margen{" "}
                  <b className={m < 15 ? "text-rose-600" : "text-emerald-700"}>{m.toFixed(0)} %</b>
                </span>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="grid gap-3 sm:grid-cols-6">
          <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Stock mínimo (unidades)</legend>
          <Field label="General" error={err("minStock")} hint="Se usa si el local no tiene uno propio" className="sm:col-span-2">
            <Input {...num("minStock", false)} />
          </Field>
          {branches.map((b) => (
            <Field key={b.id} label={b.name} hint={`Vacío = ${draft.minStock}`} className="sm:col-span-2">
              <Input inputMode="numeric" value={mins[b.id] ?? ""} onChange={(e) => setMins((x) => ({ ...x, [b.id]: e.target.value.replace(/\D/g, "") }))} className="tabular-nums" />
            </Field>
          ))}
        </fieldset>
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Dialog>
  );
}
