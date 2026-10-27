"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Ellipsis } from "lucide-react";
import type { User } from "@/lib/api/types";
import { navFor } from "@/lib/nav";
import { cn } from "@/lib/cn";

const MAX = 5;

export function MobileNav({ user }: { user: User }) {
  const pathname = usePathname();
  const [more, setMore] = useState(false);
  const nav = navFor(user);
  const overflow = nav.length > MAX;
  const primary = overflow ? nav.slice(0, MAX - 1) : nav;
  const rest = overflow ? nav.slice(MAX - 1) : [];
  const item = "relative flex h-16 min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[10.5px] font-medium transition active:scale-95";

  return (
    <>
      {more && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setMore(false)}>
          <div className="absolute inset-0 bg-zinc-900/30" />
          <div className="absolute bottom-20 right-3 w-56 overflow-hidden rounded-2xl bg-brand p-1.5 shadow-2xl">
            {rest.map((n) => (
              <Link key={n.id} href={n.href} className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium", pathname.startsWith(n.href) ? "bg-white/10 text-white" : "text-white/70")}>
                <n.icon className="h-[18px] w-[18px]" />
                {n.label}
              </Link>
            ))}
          </div>
        </div>
      )}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-white/10 bg-brand px-1 pb-[env(safe-area-inset-bottom)] md:hidden" aria-label="Módulos">
        {primary.map((n) => {
          const active = pathname.startsWith(n.href);
          return (
            <Link key={n.id} href={n.href} className={cn(item, active ? "text-white" : "text-white/55")} aria-current={active ? "page" : undefined}>
              <n.icon className={cn("h-5 w-5", active && "text-accent")} />
              <span className="truncate">{n.short}</span>
            </Link>
          );
        })}
        {overflow && (
          <button type="button" onClick={() => setMore((m) => !m)} className={cn(item, "text-white/55")} aria-expanded={more}>
            <Ellipsis className="h-5 w-5" />
            <span>Más</span>
          </button>
        )}
      </nav>
    </>
  );
}
