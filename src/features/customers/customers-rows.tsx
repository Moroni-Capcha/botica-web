"use client";

import { memo, type KeyboardEvent } from "react";
import { AlarmClock, BellOff, BellRing, CircleCheck, CircleDashed, Clock, MessageCircle, Phone, type LucideIcon } from "lucide-react";
import type { CustomerSummary } from "@/lib/api/types";
import { peruMobile, refillMessage, whatsappLink, type RefillRow, type RefillStatus } from "@/lib/domain/customers";
import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { rowButtonClass, td } from "@/components/ui/table";
import type { Tone } from "@/components/ui/tone";
import { cn } from "@/lib/cn";
import { dateShort, initials, soles } from "@/lib/format";
import { stagger } from "@/lib/motion";

/** Estado de la recompra: tono + icono + texto (el color nunca va solo). */
const STATUS_UI: Record<RefillStatus, { label: (due: number | null) => string; tone: Tone; solid?: boolean; icon: LucideIcon }> = {
  atrasado: { label: (d) => `Atrasado ${-(d ?? 0)} d`, tone: "danger", solid: true, icon: AlarmClock },
  hoy: { label: () => "Le toca hoy", tone: "danger", icon: AlarmClock },
  pronto: { label: (d) => (d === 1 ? "Mañana" : `En ${d} días`), tone: "warning", icon: Clock },
  al_dia: { label: (d) => `En ${d} días`, tone: "neutral", icon: CircleCheck },
  sin_compra: { label: () => "Sin compra aún", tone: "neutral", icon: CircleDashed },
};

/** ¿Acepta avisos? Chip con icono y texto; sirve en tablas, tarjetas y en la ficha. */
export function ConsentChip({ consent, className }: { consent: boolean; className?: string }) {
  return consent ? (
    <Chip tone="success" className={className}>
      <BellRing className="h-3 w-3 shrink-0" aria-hidden /> Acepta avisos
    </Chip>
  ) : (
    <Chip tone="neutral" className={className} title="El cliente no aceptó recibir avisos">
      <BellOff className="h-3 w-3 shrink-0" aria-hidden /> No desea avisos
    </Chip>
  );
}

const docOf = (c: CustomerSummary) => (c.ruc ? `RUC ${c.ruc}` : c.dni ? `DNI ${c.dni}` : "—");

export interface RefillShared {
  pharmacyName: string;
  onOpen: (c: CustomerSummary) => void;
  onContact: (r: RefillRow, channel: "whatsapp" | "llamada") => void;
}

/** Recompra por avisar: nombre, tratamiento, estado y acciones. `memo` + manejadores estables. */
export const RefillItem = memo(function RefillItem({ row: r, pharmacyName, stag, onOpen, onContact }: RefillShared & { row: RefillRow; stag: number }) {
  const st = STATUS_UI[r.status];
  const Icon = st.icon;
  const link = r.customer.contactConsent ? whatsappLink(r.customer.phone, refillMessage(r, pharmacyName)) : null;
  const mobile = peruMobile(r.customer.phone);
  return (
    <li className={cn("flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5", stag >= 0 && "animate-stagger-in")} style={stag >= 0 ? stagger(stag) : undefined}>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sunken text-caption font-bold text-fg-2" aria-hidden>
        {initials(r.customer.name)}
      </span>
      <button type="button" onClick={() => onOpen(r.customer as CustomerSummary)} className="min-w-0 flex-1 basis-56 rounded-lg text-left">
        <span className="block text-sm font-semibold text-fg hover:underline">{r.customer.name}</span>
        <span className="block text-caption text-muted">
          {r.product.name} {r.product.conc} · cada {r.treatment.everyDays} días · {r.lastPurchaseAt ? `última compra ${dateShort(r.lastPurchaseAt)}` : "aún no lo compra aquí"}
          {r.customer.phone && <span className="tabular-nums"> · {r.customer.phone}</span>}
        </span>
      </button>
      <Chip tone={st.tone} solid={st.solid}>
        <Icon className="h-3 w-3 shrink-0" aria-hidden /> {st.label(r.due)}
      </Chip>
      {r.recentlyContacted && r.lastContactAt && <span className="text-caption text-muted">Avisado {dateShort(r.lastContactAt)}</span>}
      <div className="flex items-center gap-1.5">
        {!r.customer.contactConsent ? (
          <ConsentChip consent={false} />
        ) : (
          <>
            {link ? (
              <a href={link} target="_blank" rel="noopener noreferrer" onClick={() => onContact(r, "whatsapp")} className={buttonClass("primary", "sm")}>
                <MessageCircle className="h-3.5 w-3.5" aria-hidden /> WhatsApp
              </a>
            ) : (
              <span className="text-caption text-muted">Sin celular</span>
            )}
            {mobile && (
              <a href={`tel:+${mobile}`} onClick={() => onContact(r, "llamada")} className={buttonClass("ghost", "sm")} aria-label={`Llamar a ${r.customer.name}`}>
                <Phone className="h-3.5 w-3.5" aria-hidden />
              </a>
            )}
          </>
        )}
      </div>
    </li>
  );
});

export interface CustomerShared {
  /** Nombres de los productos de cada tratamiento, por id. */
  productNames: Map<number, string>;
  onOpen: (c: CustomerSummary) => void;
}

const treatmentsText = (c: CustomerSummary, names: Map<number, string>) =>
  c.treatments
    .map((t) => names.get(t.productId))
    .filter(Boolean)
    .join(", ");

function onRowKey(e: KeyboardEvent, open: () => void) {
  if (e.target !== e.currentTarget) return;
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    open();
  }
}

/** Fila de la tabla de clientes. */
export const CustomerRow = memo(function CustomerRow({ customer: c, productNames, stag, onOpen }: CustomerShared & { customer: CustomerSummary; stag: number }) {
  const treatments = treatmentsText(c, productNames);
  return (
    <tr
      tabIndex={0}
      onClick={() => onOpen(c)}
      onKeyDown={(e) => onRowKey(e, () => onOpen(c))}
      className={cn(rowButtonClass, "h-14", stag >= 0 && "animate-stagger-in")}
      style={stag >= 0 ? stagger(stag) : undefined}
      aria-label={`Abrir ficha de ${c.name}`}
    >
      <td className={cn(td, "py-2")}>
        <p className="font-semibold text-fg">{c.name}</p>
        {treatments && <p className="text-caption text-muted">Tratamiento: {treatments}</p>}
      </td>
      <td className={cn(td, "whitespace-nowrap py-2 tabular-nums text-fg-2")}>{docOf(c)}</td>
      <td className={cn(td, "whitespace-nowrap py-2 tabular-nums text-fg-2")}>{c.phone || "—"}</td>
      <td className={cn(td, "py-2")}>
        <ConsentChip consent={c.contactConsent} />
      </td>
      <td className={cn(td, "py-2 text-right tabular-nums")}>{c.purchases}</td>
      <td className={cn(td, "whitespace-nowrap py-2 text-right tabular-nums")}>
        {soles(c.totalSpent)}
        {c.totalReturned > 0 && <span className="block text-caption font-normal text-muted">devolvió {soles(c.totalReturned)}</span>}
      </td>
      <td className={cn(td, "whitespace-nowrap py-2 tabular-nums text-fg-2")}>{c.lastPurchaseAt ? dateShort(c.lastPurchaseAt) : "—"}</td>
      <td className={cn(td, "py-2 text-right font-semibold tabular-nums")}>{c.points}</td>
    </tr>
  );
});

/** Tarjeta de cliente para pantallas angostas: mismos datos que la fila, sin desplazamiento horizontal. */
export const CustomerCard = memo(function CustomerCard({ customer: c, productNames, stag, onOpen }: CustomerShared & { customer: CustomerSummary; stag: number }) {
  const treatments = treatmentsText(c, productNames);
  return (
    <li>
      <Card
        padding="sm"
        tabIndex={0}
        role="button"
        aria-label={`Abrir ficha de ${c.name}`}
        onClick={() => onOpen(c)}
        onKeyDown={(e) => onRowKey(e, () => onOpen(c))}
        className={cn("cursor-pointer transition-colors duration-[var(--dur-fast)] hover:bg-subtle focus-visible:outline-2 focus-visible:outline-brand-ink", stag >= 0 && "animate-stagger-in")}
        style={stag >= 0 ? stagger(stag) : undefined}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-fg">{c.name}</p>
            <p className="text-caption tabular-nums text-muted">
              {docOf(c)}
              {c.phone && ` · ${c.phone}`}
            </p>
          </div>
          <ConsentChip consent={c.contactConsent} />
        </div>
        {treatments && <p className="mt-1 text-caption text-muted">Tratamiento: {treatments}</p>}
        <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-line-soft pt-2 text-caption text-muted">
          <div>
            <dt>Compras</dt>
            <dd className="text-small font-semibold tabular-nums text-fg">{c.purchases}</dd>
          </div>
          <div>
            <dt>Total (neto)</dt>
            <dd className="text-small font-semibold tabular-nums text-fg">{soles(c.totalSpent)}</dd>
          </div>
          <div className="text-right">
            <dt>Puntos</dt>
            <dd className="text-small font-semibold tabular-nums text-fg">{c.points}</dd>
          </div>
        </dl>
        <p className="mt-1 text-caption tabular-nums text-muted">
          {c.lastPurchaseAt ? `Última compra ${dateShort(c.lastPurchaseAt)}` : "Sin compras"}
          {c.totalReturned > 0 && ` · devolvió ${soles(c.totalReturned)}`}
        </p>
      </Card>
    </li>
  );
});
