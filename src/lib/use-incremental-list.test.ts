import { describe, expect, it } from "vitest";
import { growLimit, LIST_STEP } from "./use-incremental-list";

describe("growLimit", () => {
  it("suma una tanda", () => {
    expect(growLimit(48, 3000)).toBe(48 + LIST_STEP);
  });
  it("no se pasa del total", () => {
    expect(growLimit(90, 100)).toBe(100);
    expect(growLimit(100, 100)).toBe(100);
  });
  it("con una lista vacía o negativa se queda en cero", () => {
    expect(growLimit(48, 0)).toBe(0);
    expect(growLimit(48, -5)).toBe(0);
  });
  it("respeta una tanda propia", () => {
    expect(growLimit(10, 1000, 5)).toBe(15);
  });
});
