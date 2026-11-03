import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/**
 * Zona táctil de 44 × 44 px como mínimo sin agrandar lo que se ve: un pseudo-elemento invisible
 * cubre el botón y se estira hasta 44 px. Se puede agregar a cualquier botón chico (necesita `relative`, ya incluido).
 */
export const hitArea = "relative before:absolute before:left-1/2 before:top-1/2 before:h-[max(100%,2.75rem)] before:w-[max(100%,2.75rem)] before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']";

const sizes = { xs: "h-7 w-7", sm: "h-8 w-8", md: "h-10 w-10" } as const;
const tones = {
  neutral: "text-muted hover:bg-sunken hover:text-fg",
  danger: "text-muted hover:bg-danger-bg hover:text-danger-fg",
} as const;

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> {
  /** Obligatorio: el botón no tiene texto, así se anuncia. */
  "aria-label": string;
  size?: keyof typeof sizes;
  tone?: keyof typeof tones;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton({ size = "md", tone = "neutral", type = "button", className, ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn("inline-grid shrink-0 place-items-center rounded-lg transition-colors duration-[var(--dur-fast)] disabled:cursor-not-allowed disabled:opacity-40", hitArea, sizes[size], tones[tone], className)}
      {...rest}
    />
  );
});
