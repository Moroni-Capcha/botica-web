"use client";

import { useEffect, useState } from "react";
import { Building2, Fingerprint, LogOut, MapPin } from "lucide-react";
import type { User } from "@/lib/api/types";
import { useConfig } from "@/lib/queries";
import { useOperatingBranch, useSessionStore } from "@/lib/auth/session-store";
import { BrandMark } from "@/components/brand-mark";
import { cn } from "@/lib/cn";
import { KioskDialog } from "@/features/attendance/kiosk-dialog";

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
  const adminBranch = useOperatingBranch();
  const setAdminBranch = useSessionStore((s) => s.setAdminBranch);
  const branches = config?.branches ?? [];
  const [kiosk, setKiosk] = useState(false);
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
      {user.role === "admin" && branches.length > 3 ? (
        <label className="flex items-center gap-1.5 rounded-xl bg-zinc-100 py-1 pl-2.5 pr-1">
          <Building2 className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
          <span className="sr-only">Local donde operas</span>
          <select value={adminBranch} onChange={(e) => setAdminBranch(e.target.value)} className="h-7 max-w-40 rounded-lg bg-white px-2 text-xs font-semibold text-zinc-800 outline-none">
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </label>
      ) : user.role === "admin" ? (
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
      <button type="button" onClick={() => setKiosk(true)} className="flex items-center gap-1.5 rounded-lg p-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100" title="Marcar asistencia del personal">
        <Fingerprint className="h-4 w-4 text-brand" />
        <span className="hidden 2xl:inline">Asistencia</span>
      </button>
      <Clock />
      <button type="button" onClick={onLogout} className="rounded-lg p-2 text-zinc-500 transition hover:bg-zinc-100 md:hidden" aria-label="Cerrar turno">
        <LogOut className="h-4 w-4" />
      </button>
      {kiosk && <KioskDialog branches={branches} fixedBranch={user.role === "admin" ? null : user.branchId} onClose={() => setKiosk(false)} />}
    </header>
  );
}
