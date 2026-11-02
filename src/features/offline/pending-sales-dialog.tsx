"use client";

import { useState } from "react";
import { CloudUpload, RotateCw, Trash2 } from "lucide-react";
import { useConfig, useWritable } from "@/lib/queries";
import { useSessionStore } from "@/lib/auth/session-store";
import { useQueueStore } from "@/lib/offline/queue-store";
import { useOnline } from "@/lib/offline/use-online";
import { queueSummary, type QueuedSale } from "@/lib/domain/offline-sales";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty";
import { dateShort, soles, timeShort } from "@/lib/format";
import { cn } from "@/lib/cn";
import { useSyncNow } from "./use-sync-now";

const STATUS = {
  pending: { label: "Por enviar", className: "bg-sky-100 text-sky-800" },
  syncing: { label: "Enviando…", className: "bg-sky-100 text-sky-800" },
  failed: { label: "Con problema", className: "bg-rose-100 text-rose-800" },
  synced: { label: "Enviada", className: "bg-emerald-100 text-emerald-800" },
} as const;

/** Lista de las ventas cobradas sin conexión: qué falta enviar, cuáles tuvieron problema y por qué. */
export function PendingSalesDialog({ onClose }: { onClose: () => void }) {
  const state = useQueueStore((s) => s.state);
  const { retry, discard } = useQueueStore.getState();
  const online = useOnline();
  const writable = useWritable();
  const isAdmin = useSessionStore((s) => s.session?.user.role === "admin");
  const config = useConfig().data;
  const syncNow = useSyncNow();
  const [syncing, setSyncing] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);

  const summary = queueSummary(state);
  const items = [...state.items].sort((a, b) => a.seq - b.seq);
  const branchName = (id: string) => [...(config?.branches ?? []), ...(config?.closedBranches ?? [])].find((b) => b.id === id)?.name ?? id;

  const run = async () => {
    setSyncing(true);
    try {
      await syncNow({ force: true });
    } finally {
      setSyncing(false);
    }
  };

  const description =
    summary.unsent === 0
      ? "No hay ventas esperando."
      : `${summary.unsent} ${summary.unsent === 1 ? "venta esperando" : "ventas esperando"} para enviarse al servidor${summary.failed ? ` · ${summary.failed} con problema` : ""}`;

  return (
    <Dialog
      title="Ventas por enviar"
      description={description}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>Cerrar</Button>
          <Button variant="primary" loading={syncing} disabled={summary.unsent === 0 || !writable} onClick={run}>
            <CloudUpload className="h-4 w-4" /> Sincronizar ahora
          </Button>
        </>
      }
    >
      {!online && (
        <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900" role="status">
          Sin conexión. Puedes seguir cobrando: las ventas se guardan en este equipo y se envían solas cuando vuelva el internet.
        </p>
      )}
      {!writable && (
        <p className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-900" role="status">
          Tu cuenta está en solo lectura. Las ventas siguen guardadas y se enviarán cuando se reactive.
        </p>
      )}
      {items.length === 0 ? (
        <Empty icon={CloudUpload} title="Todo está al día">
          Las ventas que cobres sin conexión aparecerán aquí hasta que se envíen.
        </Empty>
      ) : (
        <ul className="grid gap-2">
          {items.map((i) => (
            <Row key={i.clientSaleId} item={i} branch={branchName(i.branchId)} isAdmin={!!isAdmin} confirming={confirming === i.clientSaleId} onAskDiscard={() => setConfirming(i.clientSaleId)} onCancel={() => setConfirming(null)} onRetry={() => retry(i.clientSaleId)} onDiscard={() => { discard(i.clientSaleId); setConfirming(null); }} />
          ))}
        </ul>
      )}
    </Dialog>
  );
}

function Row({ item, branch, isAdmin, confirming, onAskDiscard, onCancel, onRetry, onDiscard }: { item: QueuedSale; branch: string; isAdmin: boolean; confirming: boolean; onAskDiscard: () => void; onCancel: () => void; onRetry: () => void; onDiscard: () => void }) {
  const st = STATUS[item.status];
  return (
    <li className={cn("rounded-2xl border p-3", item.status === "failed" ? "border-rose-200 bg-rose-50/50" : "border-zinc-200")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-mono text-sm font-semibold">{item.ticket}</span>
        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", st.className)}>{st.label}</span>
        {item.status === "synced" && item.saleNumber && <span className="text-xs text-zinc-600">Comprobante {item.saleNumber}</span>}
        <span className="ml-auto text-sm font-semibold tabular-nums">{soles(item.total)}</span>
      </div>
      <p className="mt-0.5 text-xs text-zinc-500">
        {dateShort(item.createdAt)} {timeShort(item.createdAt)} · {branch} · {item.itemCount} {item.itemCount === 1 ? "producto" : "productos"}
        {item.attempts > 0 && item.status !== "synced" ? ` · ${item.attempts} ${item.attempts === 1 ? "intento" : "intentos"}` : ""}
      </p>
      {item.lastError && item.status !== "synced" && (
        <p className={cn("mt-1.5 text-xs", item.status === "failed" ? "font-medium text-rose-700" : "text-zinc-600")}>
          {item.status === "failed" ? "No se pudo registrar: " : "Último intento: "}
          {item.lastError.message}
        </p>
      )}
      {item.status === "failed" && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={onRetry}>
            <RotateCw className="h-3.5 w-3.5" /> Reintentar
          </Button>
          {isAdmin &&
            (confirming ? (
              <>
                <span className="text-xs text-rose-700">La venta ya se entregó al cliente. ¿Descartarla de verdad?</span>
                <Button size="sm" variant="danger" onClick={onDiscard}>
                  Sí, descartar
                </Button>
                <Button size="sm" onClick={onCancel}>
                  No
                </Button>
              </>
            ) : (
              <Button size="sm" variant="ghost" onClick={onAskDiscard}>
                <Trash2 className="h-3.5 w-3.5" /> Descartar
              </Button>
            ))}
          {!isAdmin && <span className="text-xs text-zinc-500">Solo el administrador puede descartarla.</span>}
        </div>
      )}
    </li>
  );
}
