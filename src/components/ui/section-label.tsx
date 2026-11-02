import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export const sectionLabelClass = "text-caption font-semibold uppercase tracking-wide text-muted";

/** Rótulo en mayúsculas que encabeza un grupo de datos dentro de un diálogo o tarjeta. */
export function SectionLabel({ as: Tag = "p", className, ...rest }: HTMLAttributes<HTMLElement> & { as?: "p" | "h3" | "div" | "span" }) {
  return <Tag className={cn(sectionLabelClass, className)} {...rest} />;
}
