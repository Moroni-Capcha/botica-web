"use client";

import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Toaster, notify } from "@/components/ui/toast";
import { useConfig } from "@/lib/queries";
import { isApiError } from "@/lib/api";
import { restoreQueryCache, startQueryCachePersistence } from "@/lib/offline/query-cache";
import { RegisterServiceWorker } from "@/features/offline/register-sw";

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
        // Red de seguridad: cualquier escritura rechazada por cuenta suspendida avisa con un mensaje claro.
        mutationCache: new MutationCache({
          onError: (err) => {
            if (isApiError(err) && err.code === "CUENTA_SUSPENDIDA") notify("Tu cuenta está suspendida (solo lectura). No se pudo guardar el cambio.", "warn");
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
