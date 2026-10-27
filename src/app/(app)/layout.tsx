"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useSessionStore } from "@/lib/auth/session-store";
import { tokenStore } from "@/lib/api/token";
import { api } from "@/lib/api";
import { notify } from "@/components/ui/toast";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { NAV } from "@/lib/nav";

/** Zona protegida: exige sesión y arma el marco (barra lateral, barra superior, navegación móvil). */
export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();
  const { session, hydrated, hydrate, signOut } = useSessionStore();

  useEffect(() => {
    if (!hydrated) hydrate();
  }, [hydrated, hydrate]);

  useEffect(() => {
    if (hydrated && !session) router.replace("/login");
  }, [hydrated, session, router]);

  useEffect(
    () =>
      tokenStore.onExpired(() => {
        signOut();
        notify("Tu sesión terminó. Vuelve a ingresar con tu PIN.", "warn");
      }),
    [signOut],
  );

  if (!hydrated || !session) {
    return <div className="grid min-h-dvh place-items-center text-sm text-zinc-500">Cargando…</div>;
  }

  const logout = async () => {
    await api.logout().catch(() => undefined);
    signOut();
    qc.clear();
    router.replace("/login");
  };
  const current = NAV.find((n) => pathname.startsWith(n.href));

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-canvas text-zinc-900">
      <Sidebar user={session.user} onLogout={logout} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar title={current?.label ?? ""} user={session.user} onLogout={logout} />
        <main className="min-h-0 flex-1 overflow-y-auto pb-20 md:pb-0">{children}</main>
      </div>
      <MobileNav user={session.user} />
    </div>
  );
}
