import type { VoucherStatus } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { STATUS_LABEL } from "@/lib/domain/vouchers";

const CLASS: Record<VoucherStatus, string> = {
  pendiente: "bg-amber-100 text-amber-800",
  aceptado: "bg-emerald-100 text-emerald-700",
  rechazado: "bg-rose-100 text-rose-700",
  anulado: "bg-zinc-100 text-zinc-500",
};

export function StatusBadge({ status, title }: { status: VoucherStatus; title?: string }) {
  return (
    <span className={cn("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold", CLASS[status])} title={title}>
      {STATUS_LABEL[status]}
    </span>
  );
}
