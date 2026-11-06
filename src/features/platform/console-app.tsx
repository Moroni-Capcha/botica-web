"use client";

import { useEffect } from "react";
import { platformTokenStore } from "@/lib/api/token";
import { usePlatformSession } from "@/lib/auth/platform-session-store";
import { notify } from "@/components/ui/toast";
import { ConsoleScreen } from "./console-screen";
import { PlatformLogin } from "./platform-login";

/**
 * Puerta de la consola interna de Digi!HME. Usa su propia sesión (`bh.platform.session`): una cuenta de botica
 * no entra aquí aunque conozca la dirección, y un operador no entra a ninguna botica.
 */
export function ConsoleApp() {
  const { session, hydrated, hydrate, signOut } = usePlatformSession();

  useEffect(() => {
    if (!hydrated) hydrate();
  }, [hydrated, hydrate]);

  useEffect(
    () =>
      platformTokenStore.onExpired(() => {
        signOut();
        notify("Tu sesión terminó. Vuelve a ingresar.", "warn");
      }),
    [signOut],
  );

  if (!hydrated) return <div className="grid min-h-dvh place-items-center text-sm text-muted">Cargando…</div>;
  return session ? <ConsoleScreen session={session} onLogout={signOut} /> : <PlatformLogin />;
}
