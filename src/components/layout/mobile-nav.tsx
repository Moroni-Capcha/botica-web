"use client";

import { NavLink } from "./nav-link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Ellipsis, Fingerprint } from "lucide-react";
import type { User } from "@/lib/api/types";
import { navFor } from "@/lib/nav";
import { useAccount } from "@/lib/queries";
import { cn } from "@/lib/cn";
import { useNavBadges } from "./use-nav-badges";
import { BadgeCount, BadgeDot } from "./nav-badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { OPEN_KIOSK_EVENT } from "./topbar";

const MAX = 5;

export function MobileNav({ user }: { user: User }) {
  const pathname = usePathname();
  const [more, setMore] = useState(false);
  const nav = navFor(user, useAccount().data?.modules);
  const badges = useNavBadges(user, nav.map((n) => n.id));
  /* "Más" siempre existe: además de los módulos que no caben, trae el marcador de asistencia (que no cabe en la barra superior). */
  const primary = nav.slice(0, MAX - 1);
  const rest = nav.slice(MAX - 1);
  /* Un aviso escondido en "Más" también se ve en su botón (rojo si alguno es urgente) */
  const hidden = rest.map((n) => badges[n.id]).filter((b) => b && b.tone !== "ok" && b.tone !== "idle");
  const hiddenTone = hidden.some((b) => b?.tone === "danger") ? "danger" : "warn";
  const hiddenLabel = hidden.map((b) => b?.label).join(". ");
  const item = "relative flex h-16 min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[10.5px] font-medium transition active:scale-95";

  return (
    <>
      {more && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setMore(false)}>
          <div className="absolute inset-0 bg-scrim" />
          <div className="absolute bottom-20 right-3 w-56 overflow-hidden rounded-2xl bg-brand p-1.5 shadow-2xl">
            {rest.map((n) => {
              const badge = badges[n.id];
              return (
                <NavLink
                  key={n.id}
                  href={n.href}
                  aria-label={badge ? `${n.label}: ${badge.label}` : undefined}
                  className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium", pathname.startsWith(n.href) ? "bg-white/10 text-white" : "text-white/70")}
                >
                  <n.icon className="h-[18px] w-[18px] shrink-0" />
                  <span className="truncate">{n.label}</span>
                  {badge && (badge.count !== undefined ? <BadgeCount count={badge.count} tone={badge.tone} /> : <BadgeDot tone={badge.tone} className="ml-auto mr-1" />)}
                </NavLink>
              );
            })}
            <div className="mx-3 my-1 h-px bg-white/10" aria-hidden />
            <ThemeToggle variant="row" />
            <button
              type="button"
              onClick={() => {
                setMore(false);
                window.dispatchEvent(new Event(OPEN_KIOSK_EVENT));
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-white/70"
            >
              <Fingerprint className="h-[18px] w-[18px] shrink-0" />
              Marcar asistencia
            </button>
          </div>
        </div>
      )}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-white/10 bg-brand px-1 pb-[env(safe-area-inset-bottom)] md:hidden" aria-label="Módulos">
        {primary.map((n) => {
          const active = pathname.startsWith(n.href);
          const badge = badges[n.id];
          return (
            <NavLink key={n.id} href={n.href} className={cn(item, active ? "text-white" : "text-white/65")} aria-current={active ? "page" : undefined} aria-label={badge ? `${n.label}: ${badge.label}` : undefined}>
              <span className="relative">
                <n.icon className={cn("h-5 w-5", active && "text-accent")} />
                {badge && <BadgeDot tone={badge.tone} className="absolute -right-1 -top-1" />}
              </span>
              <span className="truncate">{n.short}</span>
            </NavLink>
          );
        })}
        <button type="button" onClick={() => setMore((m) => !m)} className={cn(item, "text-white/65")} aria-expanded={more} aria-label={hiddenLabel ? `Más. ${hiddenLabel}` : "Más"}>
          <span className="relative">
            <Ellipsis className="h-5 w-5" />
            {hidden.length > 0 && <BadgeDot tone={hiddenTone} className="absolute -right-1 -top-1" />}
          </span>
          <span>Más</span>
        </button>
      </nav>
    </>
  );
}
