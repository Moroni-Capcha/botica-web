"use client";

import { useEffect, useState } from "react";
import { Building2, Fingerprint, LogOut, MapPin, Search } from "lucide-react";
import { OPEN_PALETTE_EVENT } from "./command-palette";
import type { User } from "@/lib/api/types";
import { useConfig } from "@/lib/queries";
import { useOperatingBranch, useSessionStore } from "@/lib/auth/session-store";
import { BrandMark } from "@/components/brand-mark";
import { cn } from "@/lib/cn";
import { KioskDialog } from "@/features/attendance/kiosk-dialog";
import { ConnectionStatus } from "@/features/offline/connection-status";

function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  if (!now) return null;
  return <span className="hidden rounded-lg bg-sunken px-2.5 py-1 text-sm font-medium tabular-nums text-fg-2 xl:inline">{now.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}</span>;
}

export function Topbar({ title, user, onLogout }: { title: string; user: User; onLogout: () => void }) {
  const { data: config } = useConfig();
  const adminBranch = useOperatingBranch();
  const setAdminBranch = useSessionStore((s) => s.setAdminBranch);
  const branches = config?.branches ?? [];
  const [kiosk, setKiosk] = useState(false);
  const today = new Date().toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <header className="flex h-16 shrink-0 items-center gap-1.5 border-b border-line bg-surface px-3 sm:gap-3 sm:px-6">
      <div className="hidden sm:block md:hidden">
        <BrandMark size={30} />
      </div>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg font-semibold tracking-tight">{title}</h1>
        <p className="hidden text-xs text-muted first-letter:uppercase lg:block">{today}</p>
      </div>
      {user.role === "admin" && branches.length > 3 ? (
        <label className="flex items-center gap-1.5 rounded-xl bg-sunken py-1 pl-2.5 pr-1">
          <Building2 className="h-4 w-4 shrink-0 text-muted" aria-hidden />
          <span className="sr-only">Local donde operas</span>
          <select value={adminBranch} onChange={(e) => setAdminBranch(e.target.value)} className="h-7 max-w-40 rounded-lg bg-surface px-2 text-xs font-semibold text-fg">
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </label>
      ) : user.role === "admin" ? (
        <>
        <label className="flex items-center rounded-xl bg-sunken p-1 sm:hidden">
          <span className="sr-only">Local donde operas</span>
          <select value={adminBranch} onChange={(e) => setAdminBranch(e.target.value)} className="h-7 max-w-24 rounded-lg bg-brand px-2 text-xs font-semibold text-white">
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </label>
        <div className="hidden items-center gap-1 rounded-xl bg-sunken p-1 sm:flex" role="radiogroup" aria-label="Local donde operas">
          <Building2 className="ml-1.5 h-4 w-4 text-muted" />
          {branches.map((b) => (
            <button
              key={b.id}
              type="button"
              role="radio"
              aria-checked={adminBranch === b.id}
              onClick={() => setAdminBranch(b.id)}
              className={cn("rounded-lg px-2.5 py-1 text-xs font-semibold transition sm:px-3", adminBranch === b.id ? "bg-brand text-white shadow-sm" : "text-fg-2 hover:text-fg")}
            >
              {b.name}
            </button>
          ))}
        </div>
        </>
      ) : (
        <span className="flex items-center gap-1.5 rounded-full bg-sunken px-3 py-1.5 text-xs font-semibold text-fg-2">
          <MapPin className="h-3.5 w-3.5" />
          {branches.find((b) => b.id === user.branchId)?.name ?? user.branchId}
        </span>
      )}
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))}
        className="flex min-h-10 min-w-10 items-center justify-center gap-2 rounded-lg p-2 text-sm font-medium text-fg-2 transition hover:bg-sunken"
        title="Ir a otra pantalla (Ctrl+K)"
        aria-label="Ir a otra pantalla"
      >
        <Search className="h-4 w-4 text-brand" />
        <span className="hidden items-center gap-2 xl:flex">
          Ir a…
          <kbd className="rounded-md border border-line bg-sunken px-1.5 py-0.5 text-[11px] font-semibold text-muted">Ctrl K</kbd>
        </span>
      </button>
      <button type="button" onClick={() => setKiosk(true)} className="flex min-h-10 min-w-10 items-center justify-center gap-1.5 rounded-lg p-2 text-sm font-medium text-fg-2 transition hover:bg-sunken" title="Marcar asistencia del personal">
        <Fingerprint className="h-4 w-4 text-brand" />
        <span className="hidden 2xl:inline">Asistencia</span>
      </button>
      <ConnectionStatus />
      <div className="hidden sm:block">
        <Clock />
      </div>
      <button type="button" onClick={onLogout} className="grid h-10 w-10 place-items-center rounded-lg text-muted transition hover:bg-sunken md:hidden" aria-label="Cerrar turno">
        <LogOut className="h-4 w-4" />
      </button>
      {kiosk && <KioskDialog branches={branches} fixedBranch={user.role === "admin" ? null : user.branchId} onClose={() => setKiosk(false)} />}
    </header>
  );
}
