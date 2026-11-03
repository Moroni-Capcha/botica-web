"use client";

import { useEffect, useRef, useState } from "react";
import { Banknote, Check, CreditCard, Smartphone, Stethoscope } from "lucide-react";
import type { Customer, DocType, PaymentMethod, Prescription, SaleRequest } from "@/lib/api/types";
import { documentIsValid, isValidCmp, quickCashAmounts, round2, type Totals } from "@/lib/domain/pharmacy";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { SectionLabel } from "@/components/ui/section-label";
import { hitArea } from "@/components/ui/icon-button";
import { soles } from "@/lib/format";
import { cn } from "@/lib/cn";
import { animateIn } from "@/lib/motion";

type Draft = Omit<SaleRequest, "branchId" | "items">;

interface Props {
  totals: Totals;
  itemsCount: number;
  customer: Customer | null;
  yapeNumber: string;
  submitting: boolean;
  /** Sin conexión: la venta se guarda en el equipo y se entrega un ticket provisional. */
  offline?: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (draft: Draft) => void;
}

const METHODS: { id: PaymentMethod; label: string; icon: typeof Banknote }[] = [
  { id: "efectivo", label: "Efectivo", icon: Banknote },
  { id: "yape", label: "Yape / Plin", icon: Smartphone },
  { id: "tarjeta", label: "Tarjeta", icon: CreditCard },
];

export function PaymentDialog({ totals, itemsCount, customer, yapeNumber, submitting, offline = false, error, onClose, onConfirm }: Props) {
  const total = totals.total;
  const [doc, setDoc] = useState<DocType>(customer?.ruc ? "factura" : "boleta");
  const [docId, setDocId] = useState(customer?.ruc || customer?.dni || "");
  const [docName, setDocName] = useState(customer?.name ?? "");
  const [method, setMethod] = useState<PaymentMethod>("efectivo");
  const [received, setReceived] = useState("");
  const [reference, setReference] = useState("");
  const [rx, setRx] = useState<Prescription>({ number: "", doctor: "", cmp: "" });

  const rec = Number(received) || 0;
  const change = round2(rec - total);
  const docOk = documentIsValid(doc, docId, docName, total);
  const rxOk = !totals.needsRx || (rx.number.trim() !== "" && rx.doctor.trim() !== "" && isValidCmp(rx.cmp));
  const payOk = method !== "efectivo" || rec >= total;
  const ok = docOk && rxOk && payOk && !submitting;
  const enough = rec > 0 && rec >= total;
  const missing = round2(total - rec);

  /* El vuelto aparece con un golpe suave la primera vez que alcanza. */
  const changeRef = useRef<HTMLDivElement>(null);
  const wasEnough = useRef(false);
  useEffect(() => {
    if (enough && !wasEnough.current) animateIn(changeRef.current, [{ opacity: 0.4, transform: "scale3d(0.97, 0.97, 1)" }, { opacity: 1, transform: "scale3d(1, 1, 1)" }], { duration: 200 });
    wasEnough.current = enough;
  }, [enough]);

  const switchDoc = (v: DocType) => {
    setDoc(v);
    setDocId(v === "factura" ? customer?.ruc ?? "" : customer?.dni ?? "");
    setDocName(v === "factura" && !customer?.ruc ? "" : customer?.name ?? "");
  };

  const confirm = () => {
    if (!ok) return;
    onConfirm({
      payment: { method, received: method === "efectivo" ? rec : undefined, reference: reference.trim() || undefined },
      document: { type: doc, customerDocId: docId || undefined, customerName: docName.trim() || undefined },
      customerId: customer?.id ?? null,
      prescription: totals.needsRx ? { number: rx.number.trim(), doctor: rx.doctor.trim(), cmp: rx.cmp } : null,
    });
  };

  return (
    <Dialog
      title="Cobrar"
      description={`${itemsCount} ${itemsCount === 1 ? "producto" : "productos"} · ${customer ? customer.name : "Cliente varios"}`}
      onClose={onClose}
      size="lg"
      footer={
        <>
          {error && <p className="mr-auto text-sm text-danger-fg" role="alert">{error}</p>}
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" size="lg" disabled={!ok} loading={submitting} onClick={confirm} className="tabular-nums">
            {!submitting && <Check className="h-4 w-4" aria-hidden />}
            {submitting ? "Cobrando…" : offline ? `Cobrar ${soles(total)} sin conexión` : `Cobrar ${soles(total)} y emitir ${doc}`}
          </Button>
        </>
      }
    >
      <form
        className="grid gap-5 md:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          confirm();
        }}
      >
        <div className="flex items-end justify-between gap-3 rounded-2xl bg-subtle px-4 py-3 md:col-span-2">
          <div>
            <SectionLabel>Total a cobrar</SectionLabel>
            <p className="mt-0.5 text-4xl font-semibold leading-none tracking-tight tabular-nums">{soles(total)}</p>
          </div>
          <p className="pb-0.5 text-right text-caption text-muted">IGV incluido</p>
        </div>
        <div className="grid content-start gap-4">
          {offline && (
            <p className="rounded-2xl bg-warning-bg p-3 text-xs text-warning-fg" role="status">
              Sin conexión: la venta se guarda en este equipo y se envía sola al volver el internet. Entrega el ticket provisional; la {doc} oficial se emite al enviarla.
            </p>
          )}
          <div>
            <SectionLabel className="mb-2">Comprobante</SectionLabel>
            <Segmented full label="Tipo de comprobante" value={doc} onChange={switchDoc} options={[{ id: "boleta", label: "Boleta" }, { id: "factura", label: "Factura" }]} />
            <div className="mt-3 grid grid-cols-[1fr_1.4fr] gap-2">
              <Field label={doc === "factura" ? "RUC (11 dígitos)" : `DNI ${total > 700 ? "(obligatorio > S/ 700)" : "(opcional)"}`}>
                <Input inputMode="numeric" maxLength={doc === "factura" ? 11 : 8} value={docId} aria-invalid={docId !== "" && !docOk} onChange={(e) => setDocId(e.target.value.replace(/\D/g, ""))} className="tabular-nums" />
              </Field>
              <Field label={doc === "factura" ? "Razón social" : "Nombre"}>
                <Input value={docName} onChange={(e) => setDocName(e.target.value)} placeholder={doc === "factura" ? "Empresa S.A.C." : "Cliente varios"} />
              </Field>
            </div>
          </div>

          {totals.needsRx && (
            <fieldset className="rounded-2xl border border-info-border bg-info-bg/60 p-3">
              <legend className="flex items-center gap-1.5 px-1 text-xs font-semibold text-info-fg">
                <Stethoscope className="h-4 w-4" aria-hidden /> Receta médica {totals.needsControlled ? "especial (controlados)" : ""}
              </legend>
              <div className="grid grid-cols-2 gap-2">
                <Field label="N.º de receta">
                  <Input value={rx.number} onChange={(e) => setRx({ ...rx, number: e.target.value })} placeholder="R-000123" />
                </Field>
                <Field label="CMP del médico" error={rx.cmp && !isValidCmp(rx.cmp) ? "De 4 a 6 dígitos" : undefined}>
                  <Input inputMode="numeric" value={rx.cmp} onChange={(e) => setRx({ ...rx, cmp: e.target.value.replace(/\D/g, "").slice(0, 6) })} placeholder="45123" />
                </Field>
                <Field label="Médico que prescribe" className="col-span-2">
                  <Input value={rx.doctor} onChange={(e) => setRx({ ...rx, doctor: e.target.value })} placeholder="Dr(a). Nombre Apellido" />
                </Field>
              </div>
            </fieldset>
          )}
        </div>

        <div className="grid content-start gap-3">
          <SectionLabel>Método de pago</SectionLabel>
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-sunken p-1" role="radiogroup" aria-label="Método de pago">
            {METHODS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={method === id}
                onClick={() => setMethod(id)}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg px-2 py-2 text-xs font-semibold transition-[background-color,color,transform] duration-[var(--dur-fast)] ease-[var(--ease-out)] active:scale-[0.97]",
                  method === id ? "bg-brand text-white shadow-subtle" : "text-fg-2 hover:bg-surface",
                )}
              >
                <Icon className="h-5 w-5" aria-hidden /> {label}
              </button>
            ))}
          </div>
          {method === "efectivo" && (
            <div className="rounded-2xl bg-subtle p-3">
              <Field label="Monto recibido">
                <Input data-autofocus inputMode="decimal" value={received} onChange={(e) => setReceived(e.target.value.replace(/[^\d.]/g, ""))} className="h-12 text-xl font-semibold tabular-nums" placeholder={total.toFixed(2)} />
              </Field>
              <div className="mt-2 flex flex-wrap gap-2">
                {quickCashAmounts(total).map((v) => (
                  <button key={v} type="button" onClick={() => setReceived(String(v))} className={cn(hitArea, "h-11 rounded-lg bg-surface px-3 text-sm font-semibold tabular-nums ring-1 ring-line transition-[background-color,transform] duration-[var(--dur-fast)] ease-[var(--ease-out)] hover:bg-sunken active:scale-[0.97]")}>
                    {v - total < 1 && v === Math.ceil(total) ? `Exacto ${soles(total)}` : `S/ ${v}`}
                  </button>
                ))}
              </div>
              <div
                ref={changeRef}
                aria-live="polite"
                className={cn(
                  "mt-3 flex items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-[background-color,border-color] duration-[var(--dur-base)] ease-[var(--ease-out)]",
                  enough ? "border-success-border bg-success-bg" : rec > 0 ? "border-warning-border bg-warning-bg" : "border-line bg-surface",
                )}
              >
                <span className={cn("text-sm font-semibold", enough ? "text-success-fg" : rec > 0 ? "text-warning-fg" : "text-fg-2")}>{enough ? "Vuelto" : rec > 0 ? "Falta" : "Vuelto"}</span>
                <span className={cn("text-4xl font-semibold leading-none tracking-tight tabular-nums", enough ? "text-success-fg" : rec > 0 ? "text-warning-fg" : "text-muted")}>
                  {enough ? soles(change) : rec > 0 ? soles(missing) : soles(0)}
                </span>
              </div>
            </div>
          )}
          {method === "yape" && (
            <div className="rounded-2xl bg-subtle p-3 text-sm">
              <p className="text-fg-2">El cliente yapea o plinea al número de la botica:</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{yapeNumber}</p>
              <Field label="Código de operación (opcional)" className="mt-3">
                <Input value={reference} onChange={(e) => setReference(e.target.value)} />
              </Field>
            </div>
          )}
          {method === "tarjeta" && (
            <div className="rounded-2xl bg-subtle p-3 text-sm text-fg-2">
              Pasa la tarjeta por el POS del banco y confirma cuando el voucher salga aprobado.
              <Field label="N.º de voucher (opcional)" className="mt-3">
                <Input value={reference} onChange={(e) => setReference(e.target.value)} />
              </Field>
            </div>
          )}
          <dl className="rounded-2xl border border-line p-3 text-xs text-muted">
            <div className="flex justify-between">
              <dt>Op. gravada</dt>
              <dd className="tabular-nums">{soles(totals.taxBase)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>IGV (18 %)</dt>
              <dd className="tabular-nums">{soles(totals.igv)}</dd>
            </div>
          </dl>
        </div>
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Dialog>
  );
}
