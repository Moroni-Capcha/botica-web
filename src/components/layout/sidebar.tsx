"use client";

import { NavLink } from "./nav-link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { User } from "@/lib/api/types";
import { navFor, type NavItem } from "@/lib/nav";
import { useAccount, useConfig } from "@/lib/queries";
import { BrandMark, DigiSeal } from "@/components/brand-mark";
import { cn } from "@/lib/cn";
import { initials } from "@/lib/format";
import { useNavBadges } from "./use-nav-badges";
import { BadgeCount, BadgeDot } from "./nav-badge";

const KEY = "bh.sidebar.collapsed";

/** Agrupa conservando el orden de `NAV`. */
function groupItems(items: NavItem[]) {
  const groups: { name: string; items: NavItem[] }[] = [];
  for (const n of items) {
    const g = groups.find((x) => x.name === n.group);
    if (g) g.items.push(n);
    else groups.push({ name: n.group, items: [n] });
  }
  return groups;
}

export function Sidebar({ user, onLogout }: { user: User; onLogout: () => void }) {
  const pathname = usePathname();
  const { data: config } = useConfig();
  const modules = useAccount().data?.modules;
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(KEY) === "1");
    } catch {
      /* sin almacenamiento: queda expandido */
    }
  }, []);

  const toggle = useCallback(
    () =>
      setCollapsed((c) => {
        try {
          localStorage.setItem(KEY, c ? "0" : "1");
        } catch {
          /* no se recuerda la preferencia */
        }
        return !c;
      }),
    [],
  );

  /* Ctrl+B (o ⌘B) minimiza o expande el menú */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  const place = user.branchId ? config?.branches.find((b) => b.id === user.branchId)?.name : "Todos los locales";
  const items = navFor(user, modules);
  const groups = groupItems(items);
  const badges = useNavBadges(user, items.map((n) => n.id));

  return (
    <aside className={cn("hidden shrink-0 flex-col bg-brand text-white transition-[width] duration-200 md:flex", collapsed ? "w-[72px]" : "w-60")}>
      <div className={cn("flex items-center pb-5 pt-6", collapsed ? "justify-center px-2" : "gap-2.5 px-5")}>
        <BrandMark size={36} />
        {!collapsed && (
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[15px] font-semibold">{config?.pharmacy.name ?? "Botica"}</p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">Botica · POS</p>
          </div>
        )}
      </div>
      <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 pb-2" aria-label="Módulos">
        {groups.map((g) => (
          <div key={g.name} className="flex flex-col gap-1">
            {collapsed ? (
              <div className="mx-3 mb-1 h-px bg-white/10" aria-hidden />
            ) : (
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">{g.name}</p>
            )}
            {g.items.map((n) => {
              const active = pathname.startsWith(n.href);
              const Icon = n.icon;
              const badge = badges[n.id];
              const hint = badge ? `${n.label}: ${badge.label}` : n.label;
              return (
                <NavLink
                  key={n.id}
                  href={n.href}
                  title={collapsed || badge ? hint : undefined}
                  aria-label={collapsed || badge ? hint : undefined}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex items-center rounded-xl py-2.5 text-sm font-medium transition",
                    collapsed ? "justify-center px-0" : "gap-3 px-3",
                    active ? "bg-white/12 text-white" : "text-white/60 hover:bg-white/5 hover:text-white",
                  )}
                >
                  <span className={cn("absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-accent transition-opacity", active ? "opacity-100" : "opacity-0")} />
                  <span className="relative shrink-0">
                    <Icon className={cn("h-[18px] w-[18px]", active && "text-accent")} />
                    {collapsed && badge && <BadgeDot tone={badge.tone} className="absolute -right-1 -top-1" />}
                  </span>
                  {!collapsed && <span className="truncate">{n.label}</span>}
                  {!collapsed && badge && (badge.count !== undefined ? <BadgeCount count={badge.count} tone={badge.tone} /> : <BadgeDot tone={badge.tone} className="ml-auto mr-1" />)}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>
      <button
        type="button"
        onClick={toggle}
        title={`${collapsed ? "Expandir menú" : "Minimizar menú"} (Ctrl+B)`}
        aria-label={collapsed ? "Expandir menú" : "Minimizar menú"}
        aria-keyshortcuts="Control+B"
        aria-expanded={!collapsed}
        className={cn("mx-3 mb-2 flex items-center rounded-xl py-2.5 text-sm text-white/50 transition hover:bg-white/5 hover:text-white", collapsed ? "justify-center" : "gap-3 px-3")}
      >
        {collapsed ? <PanelLeftOpen className="h-[18px] w-[18px]" /> : <PanelLeftClose className="h-[18px] w-[18px]" />}
        {!collapsed && "Minimizar"}
      </button>
      <div className={cn("m-3 mt-0 flex rounded-xl bg-white/5 p-3", collapsed ? "flex-col items-center gap-2" : "items-center gap-3")}>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent text-xs font-bold text-fg" title={collapsed ? `${user.name} · ${place}` : undefined}>
          {initials(user.name)}
        </span>
        {!collapsed && (
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-white/50">{place}</p>
          </div>
        )}
        <button type="button" onClick={onLogout} className="grid h-10 w-10 place-items-center rounded-lg text-white/60 transition hover:bg-white/10 hover:text-white" aria-label="Cerrar turno" title="Cerrar turno">
          <LogOut className="h-4 w-4" />
        </button>
      </div>
      {!collapsed && (
        <div className="px-5 pb-4">
          <DigiSeal light />
        </div>
      )}
    </aside>
  );
}
