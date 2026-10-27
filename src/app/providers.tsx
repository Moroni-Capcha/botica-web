"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { Toaster } from "@/components/ui/toast";
import { useConfig } from "@/lib/queries";
import { isApiError } from "@/lib/api";

/** Aplica los colores de la botica (vienen de la API) a las variables CSS. */
function BrandStyle() {
  const { data } = useConfig();
  useEffect(() => {
    if (!data) return;
    const root = document.documentElement;
    root.style.setProperty("--brand", data.pharmacy.brand);
    root.style.setProperty("--accent", data.pharmacy.accent);
  }, [data]);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: (count, err) => (isApiError(err) && err.status >= 400 && err.status < 500 ? false : count < 2),
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <BrandStyle />
      {children}
      <Toaster />
    </QueryClientProvider>
  );
}
