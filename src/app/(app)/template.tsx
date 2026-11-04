import type { ReactNode } from "react";

/** A diferencia del layout, la plantilla se vuelve a montar en cada cambio de módulo: ahí corre la entrada de la pantalla. */
export default function AppTemplate({ children }: { children: ReactNode }) {
  return <div data-page-root className="h-full animate-page-in">{children}</div>;
}
