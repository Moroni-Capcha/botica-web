"use client";

import { useEffect, useRef, type RefObject } from "react";

export type PosShortcut = "focus-search" | "pay";

export interface ShortcutEventLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  isComposing: boolean;
}

export interface ShortcutState {
  /** Hay un diálogo o la hoja del carrito abiertos: el teclado es de ellos. */
  dialogOpen: boolean;
  /** Mismas condiciones que el botón Cobrar (carrito con productos, caja abierta, sin faltantes). */
  canCharge: boolean;
  /** El foco está en un campo de texto (input, select, textarea). */
  inEditable: boolean;
  /** …y ese campo es el buscador. */
  inSearch: boolean;
}

/** Qué atajo del mostrador corresponde a la tecla, o null si hay que dejarla pasar. Pura, para poder probarla. */
export function shouldHandleShortcut(e: ShortcutEventLike, s: ShortcutState): PosShortcut | null {
  if (e.isComposing || s.dialogOpen) return null;
  if (s.inEditable && !s.inSearch) return null;
  const mod = e.ctrlKey || e.metaKey;
  if (e.key === "F2" && !mod && !e.altKey && !e.shiftKey) return "focus-search";
  if (e.key === "Enter" && mod && !e.altKey && !e.shiftKey && s.canCharge) return "pay";
  return null;
}

/** Esc en el buscador: primero borra el texto; con el buscador vacío, suelta el foco. */
export const searchEscapeAction = (text: string): "clear" | "blur" => (text ? "clear" : "blur");

const isEditable = (el: Element | null) =>
  !!el && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || (el instanceof HTMLElement && el.isContentEditable));

interface Options {
  searchRef: RefObject<HTMLInputElement | null>;
  dialogOpen: boolean;
  canCharge: boolean;
  onPay: () => void;
}

/** F2 enfoca y selecciona el buscador; Ctrl+Enter abre el cobro. No actúan con un diálogo abierto ni mientras se escribe en otro campo. */
export function usePosShortcuts({ searchRef, dialogOpen, canCharge, onPay }: Options) {
  const latest = useRef({ dialogOpen, canCharge, onPay });
  useEffect(() => {
    latest.current = { dialogOpen, canCharge, onPay };
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { dialogOpen: open, canCharge: can, onPay: pay } = latest.current;
      const active = document.activeElement;
      const action = shouldHandleShortcut(e, {
        dialogOpen: open || !!document.querySelector('[aria-modal="true"]'),
        canCharge: can,
        inEditable: isEditable(active),
        inSearch: !!active && active === searchRef.current,
      });
      if (!action) return;
      e.preventDefault();
      if (action === "pay") return pay();
      searchRef.current?.focus();
      searchRef.current?.select();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [searchRef]);
}
