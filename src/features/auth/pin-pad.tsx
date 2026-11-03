"use client";

import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/cn";
import { PIN_KEYS, PIN_LENGTH } from "@/lib/domain/pin";
import { SectionLabel } from "@/components/ui/section-label";

/** Cuatro puntos que se llenan con cada dígito y tiemblan si el PIN fue rechazado. */
function PinDots({ length, error }: { length: number; error: boolean }) {
  return (
    <div role="img" aria-label={`${length} de ${PIN_LENGTH} dígitos`} className={cn("flex justify-center gap-4", error && "animate-shake")}>
      {Array.from({ length: PIN_LENGTH }, (_, i) => (
        <span
          key={i}
          className={cn(
            "h-3.5 w-3.5 rounded-full transition-[transform,background-color] duration-[var(--dur-fast)] ease-[var(--ease-out)]",
            i < length ? cn("scale-100", error ? "bg-danger" : "bg-brand") : "scale-75 bg-sunken-strong",
          )}
        />
      ))}
    </div>
  );
}

/** PIN de 4 dígitos con teclado en pantalla. Los dígitos y Borrar del teclado físico los atiende quien lo usa. */
export function PinPad({ pin, error, busy, disabled, onKey }: { pin: string; error: string | null; busy: boolean; disabled: boolean; onKey: (key: string) => void }) {
  return (
    <div className={cn("transition-opacity duration-[var(--dur-base)] ease-[var(--ease-out)]", disabled && "pointer-events-none opacity-40")} inert={disabled} aria-busy={busy}>
      <SectionLabel className="text-center">PIN de 4 dígitos</SectionLabel>
      <div className="mt-3">
        <PinDots length={pin.length} error={!!error} />
      </div>
      <div className="mt-3 min-h-6 text-center text-small">
        <div role="status">
          {busy && !error && (
            <span className="inline-flex items-center gap-2 text-fg-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden />
              Verificando…
            </span>
          )}
        </div>
        {error && (
          <p role="alert" className="font-medium text-danger-fg">
            {error}
          </p>
        )}
      </div>
      <div className="mx-auto mt-2 grid max-w-72 grid-cols-3 gap-2.5">
        {PIN_KEYS.map((k, i) =>
          k === "" ? (
            <span key={i} />
          ) : (
            <button
              key={i}
              type="button"
              onClick={() => onKey(k)}
              aria-label={k === "←" ? "Borrar" : k}
              className="h-14 rounded-xl bg-sunken text-xl font-medium tabular-nums text-fg transition-[transform,background-color] duration-[var(--dur-fast)] ease-[var(--ease-out)] hover:bg-sunken-strong active:scale-[0.97]"
            >
              {k === "←" ? <ArrowLeft className="mx-auto h-5 w-5" aria-hidden /> : k}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
