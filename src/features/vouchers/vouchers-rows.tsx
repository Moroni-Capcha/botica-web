"use client";

import { memo } from "react";
import { Eye, Send } from "lucide-react";
import { KIND_LABEL, canResend, type VoucherRow } from "@/lib/domain/vouchers";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { td } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { dateShort, soles, timeShort } from "@/lib/format";
import { stagger } from "@/lib/motion";
import { StatusBadge } from "./status-badge";

export interface RowShared {
  showBranch: boolean;
  branchName: (id: string) => string;
  /** false con la cuenta suspendida (solo lectura). */
  writable: boolean;
  onOpen: (key: string) => void;
  onResend: (r: VoucherRow) => void;
}

interface ItemProps extends RowShared {
  row: VoucherRow;
  /** Esta fila se está reenviando. */
  busy: boolean;
  /** Posición para el escalonado de la primera carga; -1 = sin animación. */
  stag: number;
}

const sunatTitle = (r: VoucherRow) => (r.sunat ? `${r.sunat.code}: ${r.sunat.message}` : "Sin respuesta de SUNAT");
const readOnlyTip = "Tu cuenta está en solo lectura";

function Actions({ r, writable, busy, onOpen, onResend }: Pick<ItemProps, "writable" | "busy" | "onOpen" | "onResend"> & { r: VoucherRow }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {canResend(r.status) && (
        <Button size="sm" variant="primary" loading={busy} disabled={!writable} title={writable ? undefined : readOnlyTip} aria-label={`Reenviar ${r.number} a SUNAT`} onClick={() => onResend(r)}>
          <Send className="h-3.5 w-3.5" aria-hidden /> Reenviar
        </Button>
      )}
      <Button size="sm" aria-label={`Ver ${r.number}`} onClick={() => onOpen(r.key)}>
        <Eye className="h-3.5 w-3.5" aria-hidden /> Ver
      </Button>
    </span>
  );
}

function SunatReason({ r }: { r: VoucherRow }) {
  if (r.status !== "rechazado" || !r.sunat) return null;
  return (
    <span className="mt-0.5 block max-w-56 truncate text-caption text-danger-fg" title={`${r.sunat.code} · ${r.sunat.message}`}>
      {r.sunat.code} · {r.sunat.message}
    </span>
  );
}

/** Fila de la tabla. `memo` + manejadores estables: escribir en el buscador no repinta las filas que siguen igual. */
export const VoucherTableRow = memo(function VoucherTableRow({ row: r, showBranch, branchName, writable, busy, stag, onOpen, onResend }: ItemProps) {
  return (
    <tr className={cn("h-14", r.status === "anulado" && "text-muted", stag >= 0 && "animate-stagger-in")} style={stag >= 0 ? stagger(stag) : undefined}>
      <td className={cn(td, "whitespace-nowrap py-2 text-caption tabular-nums text-fg-2")}>
        {dateShort(r.issuedAt)} {timeShort(r.issuedAt)}
      </td>
      <td className={cn(td, "py-2")}>
        <span className="block font-semibold tabular-nums">{r.number}</span>
        <span className="block text-caption text-muted">
          {KIND_LABEL[r.kind]}
          {r.refNumber ? ` sobre ${r.refNumber}` : ""}
        </span>
      </td>
      <td className={cn(td, "max-w-60 truncate py-2 text-caption")}>
        {r.customerName || "Cliente varios"}
        {r.customerDocId ? ` · ${r.customerDocId}` : ""}
      </td>
      {showBranch && <td className={cn(td, "whitespace-nowrap py-2 text-caption")}>{branchName(r.branchId)}</td>}
      <td className={cn(td, "whitespace-nowrap py-2 text-right tabular-nums", r.kind === "nota_credito" && "text-danger-fg")}>
        {r.kind === "nota_credito" ? "−" : ""}
        {soles(r.total)}
      </td>
      <td className={cn(td, "py-2")}>
        <StatusBadge status={r.status} title={sunatTitle(r)} />
        <SunatReason r={r} />
      </td>
      <td className={cn(td, "whitespace-nowrap py-2 text-right")}>
        <Actions r={r} writable={writable} busy={busy} onOpen={onOpen} onResend={onResend} />
      </td>
    </tr>
  );
});

/** Tarjeta de comprobante para pantallas angostas: mismos datos que la fila, sin desplazamiento horizontal. */
export const VoucherCard = memo(function VoucherCard({ row: r, showBranch, branchName, writable, busy, stag, onOpen, onResend }: ItemProps) {
  return (
    <li>
      <Card padding="sm" className={cn(r.status === "anulado" && "text-muted", stag >= 0 && "animate-stagger-in")} style={stag >= 0 ? stagger(stag) : undefined}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold tabular-nums">{r.number}</p>
            <p className="text-caption text-muted">
              {KIND_LABEL[r.kind]}
              {r.refNumber ? ` sobre ${r.refNumber}` : ""}
            </p>
          </div>
          <div className="text-right">
            <p className={cn("font-semibold tabular-nums", r.kind === "nota_credito" && "text-danger-fg")}>
              {r.kind === "nota_credito" ? "−" : ""}
              {soles(r.total)}
            </p>
            <StatusBadge status={r.status} title={sunatTitle(r)} />
          </div>
        </div>
        <p className="mt-1 truncate text-caption">
          {r.customerName || "Cliente varios"}
          {r.customerDocId ? ` · ${r.customerDocId}` : ""}
        </p>
        <p className="text-caption tabular-nums text-muted">
          {dateShort(r.issuedAt)} {timeShort(r.issuedAt)}
          {showBranch ? ` · ${branchName(r.branchId)}` : ""}
        </p>
        {r.status === "rechazado" && r.sunat && (
          <p className="mt-1 text-caption text-danger-fg">
            {r.sunat.code} · {r.sunat.message}
          </p>
        )}
        <div className="mt-3 flex justify-end border-t border-line-soft pt-2">
          <Actions r={r} writable={writable} busy={busy} onOpen={onOpen} onResend={onResend} />
        </div>
      </Card>
    </li>
  );
});
