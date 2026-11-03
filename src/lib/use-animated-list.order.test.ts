import { describe, expect, it } from "vitest";
import { mergeRows, orderAnimatedRows } from "./use-animated-list";

const it_ = (key: string) => ({ key });

describe("orderAnimatedRows", () => {
  it("reordena las que quedan y deja las que salen en su lugar", () => {
    const prev = mergeRows([], [it_("a"), it_("b"), it_("c"), it_("d")]);
    const next = [it_("d"), it_("a"), it_("c")]; // b sale; el orden cambió
    const rows = mergeRows(prev, next);
    expect(orderAnimatedRows(rows, next).map((r) => [r.key, r.exiting])).toEqual([["d", false], ["b", true], ["a", false], ["c", false]]);
  });
  it("sin cambios devuelve el mismo orden", () => {
    const items = [it_("a"), it_("b")];
    const rows = mergeRows([], items);
    expect(orderAnimatedRows(rows, items).map((r) => r.key)).toEqual(["a", "b"]);
  });
});
