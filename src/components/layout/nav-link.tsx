"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps, MouseEvent } from "react";
import { animateIn, PAGE_EXIT_KEYFRAMES } from "@/lib/motion";

/** Atributo que marca la pantalla actual para poder animar su salida (lo pone `app/(app)/template.tsx`). */
export const PAGE_ROOT_ATTR = "data-page-root";

type Props = Omit<ComponentProps<typeof Link>, "href" | "onClick"> & { href: string };

/**
 * Enlace del menú. La navegación empieza al instante (no se espera a la animación) y mientras la pantalla nueva se prepara,
 * la actual se atenúa y sube un poco. Cuando llega la nueva, esta entra con `animate-page-in`.
 * Con "reducir movimiento", ctrl/clic medio o si ya estás en esa ruta, no anima nada.
 */
export function NavLink({ href, children, ...rest }: Props) {
  const pathname = usePathname();

  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    const plain = e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
    if (!plain || pathname === href) return;
    animateIn(document.querySelector(`[${PAGE_ROOT_ATTR}]`), PAGE_EXIT_KEYFRAMES, { duration: 140, fill: "forwards" });
  };

  return (
    <Link href={href} onClick={onClick} {...rest}>
      {children}
    </Link>
  );
}
