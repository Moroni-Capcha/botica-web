"use client";

import Link from "next/link";
import { CircleAlert, Info, Lock } from "lucide-react";
import { useAccount } from "@/lib/queries";
import { useSessionStore } from "@/lib/auth/session-store";
import { accountNotice, limaDay } from "@/lib/domain/account";
import { cn } from "@/lib/cn";

const TONE = {
  info: { box: "bg-info-bg text-info-fg border-info-border", icon: Info },
  warn: { box: "bg-warning-bg text-warning-fg border-warning-border", icon: CircleAlert },
  error: { box: "bg-danger-bg text-danger-fg border-danger-border", icon: Lock },
} as const;

/** Aviso del estado de la cuenta (prueba, vencida, suspendida). Solo el administrador ve el enlace al plan. */
export function AccountBanner() {
  const { data } = useAccount();
  const isAdmin = useSessionStore((s) => s.session?.user.role === "admin");
  const notice = data ? accountNotice(data, limaDay(Date.now())) : null;
  if (!notice) return null;
  const { box, icon: Icon } = TONE[notice.tone];
  return (
    <div role={notice.tone === "info" ? "status" : "alert"} className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2 text-sm", box)}>
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      <p className="min-w-0 flex-1">{notice.message}</p>
      {isAdmin && (
        <Link href="/ajustes?tab=plan" className="shrink-0 font-semibold underline underline-offset-2">
          Ver mi plan
        </Link>
      )}
    </div>
  );
}
