"use client";

import { useEffect, useState } from "react";

export interface AnimatedRow<T> {
  key: string;
  item: T;
  /** Ya no está en la lista, pero se queda en pantalla mientras corre su animación de salida. */
  exiting: boolean;
  /** Entró después de que la lista se montó: es la única que se anima al aparecer. */
  isNew: boolean;
}

/** Une las filas que se muestran con la lista nueva: las que faltan quedan como "saliendo" en su lugar, las nuevas van al final. */
export function mergeRows<T extends { key: string }>(prev: AnimatedRow<T>[], items: T[]): AnimatedRow<T>[] {
  const byKey = new Map(items.map((i) => [i.key, i]));
  const known = new Set(prev.map((r) => r.key));
  const kept = prev.map((r) => {
    const item = byKey.get(r.key);
    return item ? { ...r, item, exiting: false } : { ...r, exiting: true };
  });
  const added = items.filter((i) => !known.has(i.key)).map((item) => ({ key: item.key, item, exiting: false, isNew: true }));
  return [...kept, ...added];
}

/**
 * Lista que deja terminar la animación de salida antes de quitar una fila.
 * `exitMs` debe ser un poco más que la duración de la salida en CSS.
 */
export function useAnimatedList<T extends { key: string }>(items: T[], exitMs = 170): AnimatedRow<T>[] {
  const [rows, setRows] = useState<AnimatedRow<T>[]>(() => items.map((item) => ({ key: item.key, item, exiting: false, isNew: false })));
  const [seen, setSeen] = useState(items);
  if (items !== seen) {
    setSeen(items);
    setRows(mergeRows(rows, items));
  }

  useEffect(() => {
    if (!rows.some((r) => r.exiting)) return;
    const id = setTimeout(() => setRows((rs) => rs.filter((r) => !r.exiting)), exitMs);
    return () => clearTimeout(id);
  }, [rows, exitMs]);

  return rows;
}

/**
 * Para listas ordenadas por algo que cambia (p. ej. la pérdida): las filas que siguen en la lista se vuelven a ordenar
 * como en `items`, y las que están saliendo conservan su lugar mientras corre la animación.
 */
export function orderAnimatedRows<T extends { key: string }>(rows: AnimatedRow<T>[], items: T[]): AnimatedRow<T>[] {
  const order = new Map(items.map((it, i) => [it.key, i]));
  const live = rows.filter((r) => !r.exiting).sort((a, b) => (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0));
  let i = 0;
  return rows.map((r) => (r.exiting ? r : live[i++]!));
}
