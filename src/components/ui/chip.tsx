import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { TONE_CLASS, type Tone } from "./tone";

export interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  /** Relleno fuerte (texto blanco) para lo que no puede pasar desapercibido. */
  solid?: boolean;
  /** Borde fino del color del tono. */
  ring?: boolean;
}

/** Las clases del chip, para darle su aspecto a un enlace o botón con la misma forma. */
export function chipClass(tone: Tone = "neutral", opts: { solid?: boolean; ring?: boolean } = {}) {
  const t = TONE_CLASS[tone];
  return cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-micro font-semibold", opts.solid ? t.solid : t.soft, opts.ring && cn("ring-1", t.ring));
}

/** Etiqueta chica y redonda: estado, receta, descuento. El color sale de los tokens semánticos. */
export function Chip({ tone = "neutral", solid, ring, className, ...rest }: ChipProps) {
  return <span className={cn(chipClass(tone, { solid, ring }), className)} {...rest} />;
}
