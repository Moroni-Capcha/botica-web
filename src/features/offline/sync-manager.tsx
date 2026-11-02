"use client";

import { useEffect } from "react";
import { api } from "@/lib/api";
import { connection } from "@/lib/api/connection";
import { useWritable } from "@/lib/queries";
import { useQueueStore } from "@/lib/offline/queue-store";
import { useOnline } from "@/lib/offline/use-online";
import { useSyncNow } from "./use-sync-now";

/** Cada cuánto se revisa si hay ventas por enviar (además de cuando vuelve la conexión). */
const TICK_MS = 20_000;

/**
 * Envía solas las ventas guardadas sin conexión: al abrir la app, al volver el internet y cada 20 segundos.
 * No dibuja nada. Con la cuenta en solo lectura espera, sin perder ninguna venta.
 */
export function OfflineSyncManager() {
  const writable = useWritable();
  const online = useOnline();
  const hydrated = useQueueStore((s) => s.hydrated);
  const syncNow = useSyncNow();

  useEffect(() => {
    void useQueueStore.getState().hydrate();
  }, []);

  useEffect(() => {
    if (!hydrated || !writable) return;
    if (online) void syncNow();
    const id = setInterval(() => {
      if (connection.isOnline()) void syncNow();
      // El navegador cree que hay red pero el servidor no respondía: una consulta liviana confirma si ya volvió.
      else if (typeof navigator !== "undefined" && navigator.onLine) void api.getAccount().catch(() => undefined);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [hydrated, writable, online, syncNow]);

  return null;
}
