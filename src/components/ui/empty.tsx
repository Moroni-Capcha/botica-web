import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function Empty({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="grid place-items-center px-6 py-12 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-zinc-100 text-zinc-500">
        <Icon className="h-6 w-6" />
      </span>
      <p className="mt-3 text-sm font-semibold">{title}</p>
      {children && <p className="mt-1 max-w-sm text-xs text-zinc-500">{children}</p>}
    </div>
  );
}
