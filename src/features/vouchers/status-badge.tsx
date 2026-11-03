import { Ban, CircleCheck, CircleX, Clock, type LucideIcon } from "lucide-react";
import type { VoucherStatus } from "@/lib/api/types";
import { STATUS_LABEL } from "@/lib/domain/vouchers";
import { Chip } from "@/components/ui/chip";
import type { Tone } from "@/components/ui/tone";

/** Estado ante SUNAT: tono + icono + texto, para que no dependa solo del color. */
export const STATUS_UI: Record<VoucherStatus, { tone: Tone; solid?: boolean; icon: LucideIcon }> = {
  pendiente: { tone: "warning", icon: Clock },
  aceptado: { tone: "success", icon: CircleCheck },
  rechazado: { tone: "danger", solid: true, icon: CircleX },
  anulado: { tone: "neutral", icon: Ban },
};

export function StatusBadge({ status, title }: { status: VoucherStatus; title?: string }) {
  const { tone, solid, icon: Icon } = STATUS_UI[status];
  return (
    <Chip tone={tone} solid={solid} title={title}>
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      {STATUS_LABEL[status]}
    </Chip>
  );
}
