import { describe, expect, it } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("no confunde los tamaños propios (text-micro) con un color de texto", () => {
    expect(cn("text-micro text-fg-2")).toBe("text-micro text-fg-2");
    expect(cn("text-caption", "text-micro")).toBe("text-micro");
  });
  it("sigue resolviendo conflictos del mismo grupo", () => {
    expect(cn("bg-sunken text-fg-2", "bg-fg text-white")).toBe("bg-fg text-white");
    expect(cn("shadow-subtle", "shadow-overlay")).toBe("shadow-overlay");
  });
});
