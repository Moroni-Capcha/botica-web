"use client";

import { useEffect } from "react";
import { captureException } from "@/lib/monitoring";
import "./globals.css";

/**
 * Último recurso: se muestra cuando se rompe el diseño raíz (layout), donde ya no existe la barra lateral ni los proveedores.
 * Por eso trae su propio <html> y <body>, y no usa nada que dependa de ellos.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    captureException(error, { scope: "global", digest: error.digest });
  }, [error]);

  return (
    <html lang="es-PE">
      <body className="font-sans">
        <main className="grid min-h-dvh place-items-center px-6 text-center">
          <div className="max-w-sm">
            <h1 className="text-2xl font-semibold tracking-tight">Algo salió mal</h1>
            <p className="mt-2 text-sm text-muted">No pudimos abrir el sistema. Tus datos están a salvo. Intenta de nuevo y, si sigue igual, avisa a soporte de Digi!HME.</p>
            <button type="button" onClick={reset} className="mt-6 inline-flex h-10 items-center rounded-xl bg-fg px-4 text-sm font-semibold text-white">
              Intentar de nuevo
            </button>
            {error.digest && <p className="mt-6 text-[11px] text-muted">Código de referencia: {error.digest}</p>}
          </div>
        </main>
      </body>
    </html>
  );
}
