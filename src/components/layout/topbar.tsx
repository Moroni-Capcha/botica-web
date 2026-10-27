"use client";

import { useEffect, useState } from "react";
import { Building2, LogOut, MapPin } from "lucide-react";
import type { User } from "@/lib/api/types";
import { useConfig } from "@/lib/queries";
import { useSessionStore } from "@/lib/auth/session-store";
import { BrandMark } from "@/components/brand-mark";
import { cn } from "@/lib/cn";

function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  if (!now) return null;
  return <span className="hidden rounded-lg bg-zinc-100 px-2.5 py-1 text-sm font-medium tabular-nums text-zinc-700 xl:inline">{now.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}</span>;
}

export function Topbar({ title, user, onLogout }: { title: string; user: User; onLogout: () => void }) {
  const { data: config } = useConfig();
  const adminBranch = useSessionStore((s) => s.adminBranch);
  const setAdminBranch = useSessionStore((s) => s.setAdminBranch);
  const branches = config?.branches ?? [];
  const today = new Date().toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b border-zinc-200 bg-white px-4 sm:gap-3 sm:px-6">
      <div className="md:hidden">
        <BrandMark size={30} />
      </div>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg font-semibold tracking-tight">{title}</h1>
        <p className="hidden text-xs text-zinc-500 first-letter:uppercase lg:block">{today}</p>
      </div>
      {user.role === "admin" ? (
        <div className="flex items-center gap-1 rounded-xl bg-zinc-100 p-1" role="radiogroup" aria-label="Local donde operas">
          <Building2 className="ml-1.5 hidden h-4 w-4 text-zinc-500 sm:block" />
          {branches.map((b) => (
            <button
              key={b.id}
              type="button"
              role="radio"
              aria-checked={adminBranch === b.id}
              onClick={() => setAdminBranch(b.id)}
              className={cn("rounded-lg px-2.5 py-1 text-xs font-semibold transition sm:px-3", adminBranch === b.id ? "bg-brand text-white shadow-sm" : "text-zinc-600 hover:text-zinc-900")}
            >
              {b.name}
            </button>
          ))}
        </div>
      ) : (
        <span className="flex items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-700">
          <MapPin className="h-3.5 w-3.5" />
          {branches.find((b) => b.id === user.branchId)?.name ?? user.branchId}
        </span>
      )}
      <Clock />
      <button type="button" onClick={onLogout} className="rounded-lg p-2 text-zinc-500 transition hover:bg-zinc-100 md:hidden" aria-label="Cerrar turno">
        <LogOut className="h-4 w-4" />
      </button>
    </header>
  );
}
