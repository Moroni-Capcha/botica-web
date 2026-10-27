"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import type { User } from "@/lib/api/types";
import { navFor } from "@/lib/nav";
import { useConfig } from "@/lib/queries";
import { BrandMark, DigiSeal } from "@/components/brand-mark";
import { cn } from "@/lib/cn";
import { initials } from "@/lib/format";

export function Sidebar({ user, onLogout }: { user: User; onLogout: () => void }) {
  const pathname = usePathname();
  const { data: config } = useConfig();
  const place = user.branchId ? config?.branches.find((b) => b.id === user.branchId)?.name : "Todos los locales";
  return (
    <aside className="hidden w-60 shrink-0 flex-col bg-brand text-white md:flex">
      <div className="flex items-center gap-2.5 px-5 pb-7 pt-6">
        <BrandMark size={36} />
        <div className="min-w-0 leading-tight">
          <p className="truncate text-[15px] font-semibold">{config?.pharmacy.name ?? "Botica"}</p>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">Botica · POS</p>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3" aria-label="Módulos">
        {navFor(user).map((n) => {
          const active = pathname.startsWith(n.href);
          const Icon = n.icon;
          return (
            <Link
              key={n.id}
              href={n.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                active ? "bg-white/12 text-white" : "text-white/60 hover:bg-white/5 hover:text-white",
              )}
            >
              <span className={cn("absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-accent transition-opacity", active ? "opacity-100" : "opacity-0")} />
              <Icon className={cn("h-[18px] w-[18px]", active && "text-accent")} />
              {n.label}
              {!n.ready && <span className="ml-auto rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white/50">Pronto</span>}
            </Link>
          );
        })}
      </nav>
      <div className="m-3 flex items-center gap-3 rounded-xl bg-white/5 p-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent text-xs font-bold text-zinc-900">{initials(user.name)}</span>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="truncate text-xs text-white/50">{place}</p>
        </div>
        <button type="button" onClick={onLogout} className="rounded-lg p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white" aria-label="Cerrar turno">
          <LogOut className="h-4 w-4" />
        </button>
      </div>
      <div className="px-5 pb-4">
        <DigiSeal light />
      </div>
    </aside>
  );
}
