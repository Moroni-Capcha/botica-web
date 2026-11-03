"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useValuePulse } from "@/lib/use-value-pulse";

/** Cambia el monto con un pulso corto (120 ms), sin contar números. No se dispara al montar. */
export function Pulse({ value, className, children }: { value: unknown; className?: string; children: ReactNode }) {
  const ref = useValuePulse<HTMLSpanElement>(value);
  return (
    <span ref={ref} className={cn("inline-block origin-left", className)}>
      {children}
    </span>
  );
}
