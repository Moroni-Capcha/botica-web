import type { ReactNode } from "react";

/** Aviso del modo de prueba (sin servidor) con los datos para entrar. */
export function TestHint({ children }: { children: ReactNode }) {
  return <p className="mt-3 rounded-lg border border-warning-border bg-warning-bg px-3 py-2 text-caption text-warning-fg">{children}</p>;
}
