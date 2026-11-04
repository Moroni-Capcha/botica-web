"use client";

import { useState } from "react";
import { CircleAlert, CloudUpload, Wifi, WifiOff } from "lucide-react";
import { useQueueStore } from "@/lib/offline/queue-store";
import { useOnline } from "@/lib/offline/use-online";
import { queueSummary } from "@/lib/domain/offline-sales";
import { cn } from "@/lib/cn";
import { TONE_CLASS } from "@/components/ui/tone";
import { PendingSalesDialog } from "./pending-sales-dialog";

/** Estado de la conexión y de las ventas por enviar, en la barra superior. Al tocarlo se abre la lista. */
export function ConnectionStatus() {
  const online = useOnline();
  const state = useQueueStore((s) => s.state);
  const [open, setOpen] = useState(false);
  const { unsent, failed } = queueSummary(state);

  const tone = failed > 0 ? "error" : !online ? "warn" : unsent > 0 ? "info" : "ok";
  const Icon = failed > 0 ? CircleAlert : !online ? WifiOff : unsent > 0 ? CloudUpload : Wifi;
  const label =
    failed > 0 ? `${failed} con problema` : !online ? (unsent > 0 ? `Sin conexión · ${unsent} por enviar` : "Sin conexión") : unsent > 0 ? `${unsent} por enviar` : "En línea";
  const style = TONE_CLASS[{ ok: "success", info: "info", warn: "warning", error: "danger" }[tone] as "success" | "info" | "warning" | "danger"].soft;

  const showText = tone !== "ok";
  const className = cn("flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-semibold", style);
  const content = (
    <>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      <span className={cn(showText ? "inline" : "hidden 2xl:inline")}>{label}</span>
    </>
  );

  return (
    <>
      {unsent > 0 || state.items.length > 0 || !online ? (
        <button type="button" onClick={() => setOpen(true)} className={cn(className, "transition hover:brightness-95")} title="Ver ventas por enviar" aria-live="polite">
          {content}
        </button>
      ) : (
        <span className={className} title="Hay conexión con el servidor" role="status">
          {content}
        </span>
      )}
      {open && <PendingSalesDialog onClose={() => setOpen(false)} />}
    </>
  );
}
