"use client";

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Toaster, notify } from "@/components/ui/toast";
import { useConfig } from "@/lib/queries";
import { isApiError } from "@/lib/api";
import { restoreQueryCache, startQueryCachePersistence } from "@/lib/offline/query-cache";
import { RegisterServiceWorker } from "@/features/offline/register-sw";
import { captureException, installGlobalErrorHandlers, isReportableError } from "@/lib/monitoring";

/** Aplica los colores de la botica (vienen de la API) a las variables CSS. */
function BrandStyle() {
  // La consola de Digi!HME no es de ninguna botica: no pide su configuración ni usa sus colores.
  const inConsole = usePathname().startsWith("/consola");
  const { data } = useConfig(!inConsole);
  useEffect(() => {
    if (!data || inConsole) return;
    const root = document.documentElement;
    root.style.setProperty("--brand", data.pharmacy.brand);
    root.style.setProperty("--accent", data.pharmacy.accent);
  }, [data, inConsole]);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        // Monitoreo: todo error inesperado de una consulta pasa por aquí (las reglas del negocio y la falta de conexión no se reportan).
        // Del contexto solo va la clase de consulta ("customers"), nunca sus filtros: pueden llevar nombres o documentos.
        queryCache: new QueryCache({
          onError: (err, query) => {
            if (isReportableError(err)) captureException(err, { scope: "query", key: String(query.queryKey[0] ?? "") });
          },
        }),
        // Red de seguridad: cualquier escritura rechazada por cuenta suspendida avisa con un mensaje claro.
        mutationCache: new MutationCache({
          onError: (err) => {
            if (isApiError(err) && err.code === "CUENTA_SUSPENDIDA") notify("Tu cuenta está suspendida (solo lectura). No se pudo guardar el cambio.", "warn");
            if (isReportableError(err)) captureException(err, { scope: "mutation" });
          },
        }),
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: (count, err) => (isApiError(err) && err.status >= 400 && err.status < 500 ? false : count < 2),
          },
        },
      }),
  );
  // Errores que nadie atrapó (solo hace algo si el monitoreo está encendido; ver src/lib/monitoring.ts).
  useEffect(() => installGlobalErrorHandlers(), []);
  useEffect(() => {
    // Conserva productos, lotes y caja en el equipo para poder abrir el punto de venta sin internet.
    void restoreQueryCache(client);
    return startQueryCachePersistence(client);
  }, [client]);
  return (
    <QueryClientProvider client={client}>
      <BrandStyle />
      <RegisterServiceWorker />
      {children}
      <Toaster />
    </QueryClientProvider>
  );
}
