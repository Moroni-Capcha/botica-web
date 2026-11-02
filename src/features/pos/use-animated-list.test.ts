import { describe, expect, it } from "vitest";
import { mergeRows, type AnimatedRow } from "./use-animated-list";

type Item = { key: string; qty?: number };
const row = (key: string): AnimatedRow<Item> => ({ key, item: { key }, exiting: false, isNew: false });

describe("mergeRows", () => {
  it("agrega las nuevas al final y las marca como nuevas", () => {
    const out = mergeRows([row("a")], [{ key: "a" }, { key: "b" }]);
    expect(out.map((r) => [r.key, r.isNew, r.exiting])).toEqual([["a", false, false], ["b", true, false]]);
  });
  it("deja en su lugar, como saliendo, la fila que ya no está", () => {
    const out = mergeRows([row("a"), row("b"), row("c")], [{ key: "a" }, { key: "c" }]);
    expect(out.map((r) => [r.key, r.exiting])).toEqual([["a", false], ["b", true], ["c", false]]);
  });
  it("actualiza el contenido de las que siguen", () => {
    const next = { key: "a", qty: 2 };
    expect(mergeRows([row("a")], [next])[0]?.item).toBe(next);
  });
  it("una fila que ya salía sigue saliendo", () => {
    const out = mergeRows([{ ...row("a"), exiting: true }], []);
    expect(out[0]?.exiting).toBe(true);
  });
});
