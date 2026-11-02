"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { captureException } from "@/lib/monitoring";

/**
 * Pantalla de último recurso cuando algo se rompe al dibujar una página (Next.js la usa como "error boundary" de las rutas).
 * El error se avisa al monitoreo, que solo actúa si está encendido (ver src/lib/monitoring.ts). El mensaje del error no se muestra:
 * puede tener datos del sistema; la persona solo ve qué hacer.
 */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    captureException(error, { scope: "route", digest: error.digest });
  }, [error]);

  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div className="max-w-sm">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-amber-50 text-amber-700">
          <TriangleAlert className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Algo salió mal</h1>
        <p className="mt-2 text-sm text-zinc-500">No pudimos mostrar esta pantalla. Tus datos están a salvo. Intenta de nuevo y, si sigue igual, avisa a soporte de Digi!HME.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={reset} className="inline-flex h-10 items-center rounded-xl bg-brand px-4 text-sm font-semibold text-white">
            Intentar de nuevo
          </button>
          <a href="/" className="inline-flex h-10 items-center rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-700">
            Volver al inicio
          </a>
        </div>
        {error.digest && <p className="mt-6 text-[11px] text-zinc-400">Código de referencia: {error.digest}</p>}
      </div>
    </main>
  );
}
