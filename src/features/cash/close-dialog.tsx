"use client";

import { useEffect, useRef, useState } from "react";
import { CircleCheck, Lock, TriangleAlert } from "lucide-react";
import type { CashClosing, CashSummary, Denominations } from "@/lib/api/types";
import { errorMessage } from "@/lib/api";
import { closeDifference, countDenominations, DENOMINATIONS, denominationLabel, describeDifference } from "@/lib/domain/cash";
import { useCloseCash } from "@/lib/queries";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, inputClass } from "@/components/ui/field";
import { SectionLabel } from "@/components/ui/section-label";
import { soles } from "@/lib/format";
import { cn } from "@/lib/cn";
import { animateIn } from "@/lib/motion";
import { TONE_CLASS } from "@/components/ui/tone";
import { useValuePulse } from "@/lib/use-value-pulse";

/** Color del texto de la diferencia de caja, sacado de los tonos semánticos. */
export const TONE_TEXT = { cuadra: TONE_CLASS.success.text, faltante: TONE_CLASS.danger.text, sobrante: TONE_CLASS.warning.text } as const;
export const TONE_LABEL = { cuadra: "Cuadra", faltante: "Faltante", sobrante: "Sobrante" } as const;

const MEANING = {
  cuadra: "El efectivo contado coincide con lo que debe haber.",
  sobrante: "Hay más efectivo del que debería haber.",
  faltante: "Hay menos efectivo del que debería haber.",
} as const;

/** Arqueo por billetes y monedas. Si la diferencia es de S/ 1 o más, pide el motivo. */
export function CloseDialog({ summary, branchName, onClose, onClosed }: { summary: CashSummary; branchName: string; onClose: () => void; onClosed: (c: CashClosing) => void }) {
  const [qty, setQty] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [done, setDone] = useState<CashClosing | null>(null);
  const close = useCloseCash(summary.session.branchId);
  const doneBtn = useRef<HTMLButtonElement>(null);

  const denominations: Denominations = Object.fromEntries(
    Object.entries(qty)
      .map(([k, v]) => [k, Number(v) || 0] as const)
      .filter(([, v]) => v > 0),
  );
  const counted = countDenominations(denominations);
  const { needsNote } = closeDifference(counted, summary.expected);
  const diff = describeDifference(counted, summary.expected);
  const ok = !needsNote || note.trim().length >= 5;
  const totalRef = useValuePulse<HTMLElement>(counted);
  const diffRef = useValuePulse<HTMLParagraphElement>(diff.text);

  // Al pasar al resultado, el botón de cerrar desaparece: el foco se lleva al botón nuevo.
  useEffect(() => {
    if (done) doneBtn.current?.focus();
  }, [done]);

  const submit = () => {
    if (!ok || close.isPending || done) return;
    close.mutate({ counted, denominations, note: note.trim() }, { onSuccess: setDone });
  };

  let first = true;
  const group = (kind: "billete" | "moneda") => (
    <div>
      <SectionLabel className="mb-2">{kind === "billete" ? "Billetes" : "Monedas"}</SectionLabel>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {DENOMINATIONS.filter((d) => d.kind === kind).map((d) => {
          const k = String(d.value);
          const sub = (Number(qty[k]) || 0) * d.value;
          const autoFocus = first;
          first = false;
          return (
            <label key={k} className="flex min-h-11 items-center gap-2 rounded-xl bg-subtle px-2.5 py-1 text-small">
              <span className="w-12 shrink-0 font-semibold tabular-nums">{denominationLabel(d.value)}</span>
              <span className="text-muted" aria-hidden>×</span>
              <input
                aria-label={`Cantidad de ${denominationLabel(d.value)}`}
                data-autofocus={autoFocus ? "" : undefined}
                inputMode="numeric"
                autoComplete="off"
                placeholder="0"
                value={qty[k] ?? ""}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => setQty((x) => ({ ...x, [k]: e.target.value.replace(/\D/g, "").slice(0, 5) }))}
                className={cn(inputClass, "h-11 w-full min-w-0 rounded-lg px-2 text-right text-base font-semibold tabular-nums")}
              />
              <span className="hidden w-16 shrink-0 text-right tabular-nums text-muted sm:block">{sub ? sub.toFixed(2) : ""}</span>
            </label>
          );
        })}
      </div>
    </div>
  );

  if (done) {
    return (
      /* Mismo <Dialog> que el conteo (no se desmonta): solo cambia el contenido, con un fundido corto. */
      <Dialog
        title={`Caja cerrada · ${branchName}`}
        onClose={() => onClosed(done)}
        size="lg"
        footer={
          <Button ref={doneBtn} variant="primary" onClick={() => onClosed(done)}>
            Ver detalle del cierre
          </Button>
        }
      >
        <div className="animate-swap-in">
          <ClosedResult closing={done} />
        </div>
      </Dialog>
    );
  }

  const T = TONE_CLASS[diff.tone];
  const Icon = diff.tone === "success" ? CircleCheck : TriangleAlert;

  return (
    <Dialog
      title={`Arqueo y cierre · ${branchName}`}
      description="Cuenta el efectivo de la caja por billete y moneda. Yape, Plin y tarjeta no se cuentan: ya están en la cuenta."
      onClose={onClose}
      size="lg"
      footer={
        <>
          {close.error && <p className="mr-auto text-sm text-danger-fg" role="alert">{errorMessage(close.error)}</p>}
          <Button onClick={onClose}>Volver</Button>
          <Button variant="primary" disabled={!ok} loading={close.isPending} onClick={submit}>
            <Lock className="h-4 w-4" aria-hidden /> Cerrar caja
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
        <section className="grid gap-3" aria-labelledby="close-step-1">
          <h3 id="close-step-1" className="text-small font-semibold">1. Cuenta el efectivo</h3>
          {group("billete")}
          {group("moneda")}
          <div className="flex items-baseline justify-between rounded-xl border border-line px-4 py-2.5">
            <span className="text-small text-fg-2">Total contado</span>
            <strong ref={totalRef} className="inline-block origin-right text-2xl font-semibold tabular-nums">{soles(counted)}</strong>
          </div>
        </section>

        <section className="grid gap-3" aria-labelledby="close-step-2">
          <h3 id="close-step-2" className="text-small font-semibold">2. Compara y confirma</h3>
          <div className={cn("grid gap-3 rounded-2xl p-4 ring-1", T.soft, T.ring)} aria-live="polite">
            <div className="flex items-center gap-3">
              <Icon className="h-6 w-6 shrink-0" aria-hidden />
              <div className="min-w-0">
                <p ref={diffRef} className="inline-block origin-left text-xl font-semibold tabular-nums">{diff.text}</p>
                <p className="text-small">{MEANING[diff.kind]}</p>
              </div>
            </div>
            <dl className="grid gap-1 border-t border-current/15 pt-3 text-sm">
              <div className="flex justify-between">
                <dt>Contado</dt>
                <dd className="font-semibold tabular-nums">{soles(counted)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Debe haber</dt>
                <dd className="font-semibold tabular-nums">{soles(summary.expected)}</dd>
              </div>
              {summary.returns.efectivo > 0 && (
                <p className="text-caption opacity-80">Ya descontado: devoluciones en efectivo −{soles(summary.returns.efectivo)}</p>
              )}
            </dl>
          </div>
          <Field label={needsNote ? "Motivo de la diferencia (obligatorio)" : "Observación (opcional)"} error={needsNote && note.trim().length < 5 ? "Explica la diferencia para poder cerrar" : undefined}>
            <Input className="h-11" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder={needsNote ? "Ej.: vuelto mal dado, billete falso, venta sin registrar" : ""} aria-invalid={needsNote && note.trim().length < 5} />
          </Field>
        </section>
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Dialog>
  );
}

/** Momento de éxito tras cerrar: un check que aparece, "Caja cerrada" y la diferencia con su tono y su texto. */
function ClosedResult({ closing: c }: { closing: CashClosing }) {
  const diff = describeDifference(c.counted, c.expected);
  const T = TONE_CLASS[diff.tone];
  const icon = useRef<HTMLSpanElement>(null);
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    animateIn(icon.current, [{ opacity: 0, transform: "scale3d(0.8, 0.8, 1)" }, { opacity: 1, transform: "scale3d(1, 1, 1)" }], { duration: 200 });
    animateIn(body.current, [{ opacity: 0, transform: "translate3d(0, 6px, 0)" }, { opacity: 1, transform: "translate3d(0, 0, 0)" }], { duration: 200, delay: 60, fill: "backwards" });
  }, []);
  return (
    <div className="grid justify-items-center gap-3 py-4 text-center">
      <span ref={icon} className={cn("grid h-14 w-14 place-items-center rounded-full", TONE_CLASS.success.soft)}>
        <CircleCheck className="h-8 w-8" aria-hidden />
      </span>
      <div ref={body} className="grid justify-items-center gap-3" role="status">
        <p className="text-xl font-semibold tracking-tight">Caja cerrada</p>
        <p className={cn("rounded-full px-3 py-1 text-sm font-semibold tabular-nums", T.soft)}>
          {diff.difference > 0 ? "+" : ""}
          {soles(diff.difference)} · {diff.text}
        </p>
        <p className="text-small text-fg-2">
          Contado <span className="tabular-nums">{soles(c.counted)}</span> · Debe haber <span className="tabular-nums">{soles(c.expected)}</span>
        </p>
      </div>
    </div>
  );
}
