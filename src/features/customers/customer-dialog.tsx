"use client";

import { useMemo, useState } from "react";
import { Receipt, Save, Trash2 } from "lucide-react";
import type { Branch, CustomerInput, CustomerSummary, Product, Treatment } from "@/lib/api/types";
import { errorMessage } from "@/lib/api";
import { suggestedCycle, validateCustomer } from "@/lib/domain/customers";
import { useCustomerPurchases, useSaveCustomer } from "@/lib/queries";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty";
import { Field, Input } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { ProductPicker } from "@/components/product-picker";
import { notify } from "@/components/ui/toast";
import { dateShort, soles } from "@/lib/format";
import { cn } from "@/lib/cn";

const EMPTY: CustomerInput = { name: "", dni: "", ruc: "", phone: "", treatments: [], contactConsent: false, notes: "" };

/** Ficha del cliente: datos, consentimiento, tratamientos continuos e historial de compras. */
export function CustomerDialog({ customer, customers, products, branches, onClose }: { customer: CustomerSummary | null; customers: CustomerSummary[]; products: Product[]; branches: Branch[]; onClose: () => void }) {
  const [tab, setTab] = useState<"datos" | "compras">("datos");
  const [f, setF] = useState<CustomerInput>(() =>
    customer ? { name: customer.name, dni: customer.dni, ruc: customer.ruc, phone: customer.phone, treatments: customer.treatments.map((t) => ({ ...t })), contactConsent: customer.contactConsent, notes: customer.notes } : EMPTY,
  );
  const [adding, setAdding] = useState<number | null>(null);
  const [tried, setTried] = useState(false);
  const save = useSaveCustomer();
  const purchases = useCustomerPurchases(customer?.id ?? null);
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  /* Para tratamientos: primero los de uso continuo y con receta */
  const treatable = useMemo(() => products.filter((p) => !f.treatments.some((t) => t.productId === p.id)).sort((a, b) => Number(b.category === "Crónicos") - Number(a.category === "Crónicos")), [products, f.treatments]);

  const errors = validateCustomer(f, customers, customer?.id);
  const ok = Object.keys(errors).length === 0;
  const set = <K extends keyof CustomerInput>(k: K, v: CustomerInput[K]) => setF((x) => ({ ...x, [k]: v }));
  const setTreatment = (productId: number, patch: Partial<Treatment>) => set("treatments", f.treatments.map((t) => (t.productId === productId ? { ...t, ...patch } : t)));
  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? id;

  const addTreatment = (id: number | null) => {
    if (id === null) return;
    const p = productById.get(id);
    if (!p) return;
    /* Si ya lo compró, el ciclo sale de su última compra */
    const lastUnits = purchases.data?.find((x) => x.items.some((it) => it.productId === id))?.items.filter((it) => it.productId === id).reduce((a, it) => a + it.units, 0) ?? 0;
    set("treatments", [...f.treatments, { productId: id, everyDays: suggestedCycle(p, lastUnits) }]);
    setAdding(null);
  };

  const submit = () => {
    setTried(true);
    if (!ok) return;
    save.mutate(
      { id: customer?.id, input: { ...f, name: f.name.trim(), notes: f.notes.trim() } },
      {
        onSuccess: () => {
          notify(customer ? "Ficha del cliente actualizada" : "Cliente registrado");
          onClose();
        },
      },
    );
  };

  const err = (k: keyof typeof errors) => (tried ? errors[k] : undefined);

  return (
    <Dialog
      title={customer ? customer.name : "Nuevo cliente"}
      description={customer ? `${customer.ruc ? `RUC ${customer.ruc}` : customer.dni ? `DNI ${customer.dni}` : "Sin documento"} · ${customer.points} puntos · ${customer.purchases} compras · ${soles(customer.totalSpent)}` : "Los datos sirven para boletas, puntos y recordatorios de recompra."}
      onClose={onClose}
      size="lg"
      footer={
        tab === "datos" ? (
          <>
            {(save.error || (tried && !ok)) && <p className="mr-auto text-sm text-rose-600" role="alert">{save.error ? errorMessage(save.error) : "Revisa los campos marcados."}</p>}
            <Button onClick={onClose}>Cancelar</Button>
            <Button variant="primary" loading={save.isPending} onClick={submit}>
              <Save className="h-4 w-4" /> Guardar
            </Button>
          </>
        ) : (
          <Button onClick={onClose}>Cerrar</Button>
        )
      }
    >
      {customer && (
        <div className="mb-4">
          <Segmented<"datos" | "compras"> label="Sección" value={tab} onChange={setTab} options={[{ id: "datos", label: "Datos y tratamientos" }, { id: "compras", label: "Compras", count: customer.purchases }]} />
        </div>
      )}

      {tab === "datos" ? (
        <form
          className="grid gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nombre o razón social" error={err("name")} className="sm:col-span-2">
              <Input value={f.name} onChange={(e) => set("name", e.target.value)} aria-invalid={!!err("name")} />
            </Field>
            <Field label="DNI" error={err("dni")}>
              <Input inputMode="numeric" maxLength={8} value={f.dni} onChange={(e) => set("dni", e.target.value.replace(/\D/g, ""))} className="tabular-nums" aria-invalid={!!err("dni")} />
            </Field>
            <Field label="RUC (para factura)" error={err("ruc")}>
              <Input inputMode="numeric" maxLength={11} value={f.ruc} onChange={(e) => set("ruc", e.target.value.replace(/\D/g, ""))} className="tabular-nums" aria-invalid={!!err("ruc")} />
            </Field>
            <Field label="Celular" error={err("phone")} className="sm:col-span-2">
              <Input inputMode="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="987 654 321" className="tabular-nums" aria-invalid={!!err("phone")} />
            </Field>
            <label className="flex items-start gap-2.5 rounded-xl bg-zinc-50 p-3 text-sm sm:col-span-2">
              <input type="checkbox" checked={f.contactConsent} onChange={(e) => set("contactConsent", e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--brand)]" />
              <span>
                <span className="font-medium">El cliente acepta recibir recordatorios por WhatsApp o llamada</span>
                <span className="block text-xs text-zinc-500">Pregúntale antes de marcarlo. Sin su permiso no se le envían avisos (Ley 29733 de protección de datos personales).</span>
                {err("contactConsent") && <span className="mt-1 block text-xs text-rose-600">{err("contactConsent")}</span>}
              </span>
            </label>
          </div>

          <fieldset>
            <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Tratamientos continuos</legend>
            <p className="mb-2 text-xs text-zinc-500">Medicamentos que compra todos los meses. Con su última compra y el ciclo se calcula cuándo avisarle.</p>
            {f.treatments.length > 0 && (
              <ul className="mb-2 grid gap-2">
                {f.treatments.map((t) => {
                  const p = productById.get(t.productId);
                  return (
                    <li key={t.productId} className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 p-2.5">
                      <span className="min-w-0 flex-1 text-sm">
                        <b className="font-medium">{p?.name ?? `Producto ${t.productId}`}</b> <span className="text-zinc-500">{p?.conc}</span>
                      </span>
                      <label className="flex items-center gap-1.5 text-xs text-zinc-600">
                        Cada
                        <input
                          inputMode="numeric"
                          value={t.everyDays || ""}
                          onChange={(e) => setTreatment(t.productId, { everyDays: Number(e.target.value.replace(/\D/g, "").slice(0, 3)) || 0 })}
                          className="h-8 w-14 rounded-lg border border-zinc-200 px-2 text-right text-sm tabular-nums outline-none focus:border-zinc-400"
                          aria-label={`Ciclo en días de ${p?.name ?? ""}`}
                        />
                        días
                      </label>
                      <button type="button" onClick={() => set("treatments", f.treatments.filter((x) => x.productId !== t.productId))} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-rose-600" aria-label={`Quitar ${p?.name ?? ""}`}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="max-w-md">
              <ProductPicker products={treatable} value={adding} onChange={addTreatment} ariaLabel="Agregar tratamiento" />
            </div>
            {err("treatments") && <p className="mt-1 text-xs text-rose-600">{err("treatments")}</p>}
          </fieldset>

          <Field label="Notas">
            <Input value={f.notes} onChange={(e) => set("notes", e.target.value)} maxLength={200} placeholder="Ej.: prefiere genérico, viene los sábados" />
          </Field>
          <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
        </form>
      ) : purchases.isLoading ? (
        <div className="grid gap-2">{Array.from({ length: 4 }, (_, i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-zinc-100" />)}</div>
      ) : !purchases.data?.length ? (
        <Empty icon={Receipt} title="Aún no tiene compras con su nombre">Asígnalo al cobrar en el punto de venta para sumar puntos e historial.</Empty>
      ) : (
        <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200">
          {purchases.data.map((s) => (
            <li key={s.saleId} className="px-4 py-2.5">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium tabular-nums">{dateShort(s.at)}</span>
                <span className="text-xs tabular-nums text-zinc-500">{s.number}</span>
                <span className="rounded bg-brand/10 px-1.5 py-px text-[10.5px] font-semibold text-brand">{branchName(s.branchId)}</span>
                <span className="ml-auto font-semibold tabular-nums">{soles(s.total)}</span>
              </div>
              <p className={cn("mt-0.5 text-xs text-zinc-500")}>
                {s.items.map((it) => `${it.qty} ${it.presentationLabel.toLowerCase()} ${productById.get(it.productId)?.name ?? ""}`).join(" · ")}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
