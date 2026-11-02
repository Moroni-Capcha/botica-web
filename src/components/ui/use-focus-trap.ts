"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE = "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])";
const INITIAL = "input, select, textarea, button:not([data-close])";

/** Ventanas abiertas, la última arriba: solo ella atiende Escape y Tab (un diálogo sobre la hoja del carrito no cierra las dos). */
const stack: object[] = [];
let scrollLocks = 0;
let savedOverflow = "";

function lockScroll() {
  if (scrollLocks++ === 0) {
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  return () => {
    if (--scrollLocks === 0) document.body.style.overflow = savedOverflow;
  };
}

/**
 * Comportamiento de una ventana modal: foco inicial dentro (primero lo marcado con `data-autofocus`),
 * Tab atrapado, Escape para cerrar, scroll del fondo bloqueado y, al cerrar, el foco vuelve a donde estaba.
 * El contenedor necesita `tabIndex={-1}` si puede no tener nada enfocable.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, onClose: () => void, active = true) {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    const node = ref.current;
    if (!active || !node) return;
    const token = {};
    stack.push(token);
    const prev = document.activeElement as HTMLElement | null;
    (node.querySelector<HTMLElement>("[data-autofocus]") ?? node.querySelector<HTMLElement>(INITIAL) ?? node).focus();
    const unlock = lockScroll();

    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || stack[stack.length - 1] !== token) return;
      if (e.key === "Escape") closeRef.current();
      if (e.key !== "Tab") return;
      const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.hasAttribute("disabled"));
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      stack.splice(stack.indexOf(token), 1);
      unlock();
      if (prev?.isConnected) prev.focus();
    };
  }, [ref, active]);
}
