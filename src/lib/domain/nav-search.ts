/** Búsqueda de pantallas para la paleta "Ir a…" (regla pura, se prueba con Vitest). */

const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

interface Searchable {
  label: string;
  short: string;
  group: string;
}

/**
 * Filtra por todas las palabras escritas (sin tildes ni mayúsculas) sobre nombre, nombre corto y sección.
 * Primero van los que empiezan con lo escrito; luego los demás en su orden del menú.
 */
export function searchNav<T extends Searchable>(items: readonly T[], query: string): T[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...items];
  const scored: { item: T; rank: number; index: number }[] = [];
  items.forEach((item, index) => {
    const label = fold(item.label);
    const hay = `${label} ${fold(item.short)} ${fold(item.group)}`;
    if (!words.every((w) => hay.includes(w))) return;
    const starts = words.every((w) => label.split(" ").some((p) => p.startsWith(w)));
    scored.push({ item, rank: starts ? 0 : 1, index });
  });
  return scored.sort((a, b) => a.rank - b.rank || a.index - b.index).map((s) => s.item);
}
