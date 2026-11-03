import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const padding = { none: "", sm: "p-3.5", md: "p-4 sm:p-5" } as const;

export interface CardProps extends HTMLAttributes<HTMLElement> {
  padding?: keyof typeof padding;
  as?: "div" | "section" | "article" | "aside";
}

/** Superficie con borde fino y esquinas redondeadas. Sin sombra: la sombra es solo para lo que flota. */
export function Card({ as: Tag = "div", padding: p = "md", className, ...rest }: CardProps) {
  return <Tag className={cn("rounded-2xl border border-line bg-surface", padding[p], className)} {...rest} />;
}
