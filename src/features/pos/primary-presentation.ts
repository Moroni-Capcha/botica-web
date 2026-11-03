/**
 * La presentación que el mostrador más vende: la unidad si el producto la tiene; si no, la primera.
 * Es solo para dar jerarquía visual: todas las presentaciones se siguen pudiendo agregar.
 */
export function pickPrimaryPresentation<T extends { id: string }>(list: readonly T[]): T | undefined {
  return list.find((x) => x.id === "unidad") ?? list[0];
}
