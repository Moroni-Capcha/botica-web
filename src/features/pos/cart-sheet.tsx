"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useFocusTrap } from "@/components/ui/use-focus-trap";
import { cn } from "@/lib/cn";

interface CartSheetProps {
  open: boolean;
  onClose: () => void;
  /** Id del título dentro del contenido: nombra el diálogo para los lectores de pantalla. */
  titleId: string;
  children: ReactNode;
}

/** Hoja de la venta para pantallas chicas: diálogo modal que sube desde abajo y baja al cerrar. */
export function CartSheet({ open, onClose, titleId, children }: CartSheetProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  const closing = mounted && !open;
  useFocusTrap(ref, onClose, open && mounted);

  /* La salida dura 140 ms; si el navegador no avisa que terminó, se desmonta igual. */
  useEffect(() => {
    if (!closing) return;
    const id = setTimeout(() => setMounted(false), 180);
    return () => clearTimeout(id);
  }, [closing]);

  if (!mounted) return null;
  return (
    <div className={cn("fixed inset-0 z-40 lg:hidden", closing && "pointer-events-none")}>
      <div className={cn("absolute inset-0 bg-scrim", closing ? "animate-fade-out" : "animate-fade")} onClick={onClose} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn("absolute inset-x-0 bottom-0 top-12 overflow-hidden rounded-t-3xl bg-surface outline-none", closing ? "animate-sheet-out" : "animate-sheet-in")}
      >
        {children}
      </div>
    </div>
  );
}
