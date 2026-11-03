import { afterEach, describe, expect, it, vi } from "vitest";
import { nextPresence, playExitGhost } from "./presence";

afterEach(() => vi.unstubAllGlobals());
const stubReduced = (reduce: boolean) => vi.stubGlobal("window", { matchMedia: (q: string) => ({ matches: reduce && q.includes("prefers-reduced-motion") }) });

describe("nextPresence", () => {
  it("abrir deja el elemento visible desde cualquier estado", () => {
    expect(nextPresence("unmounted", "open")).toBe("entered");
    expect(nextPresence("exiting", "open")).toBe("entered");
    expect(nextPresence("entered", "open")).toBe("entered");
  });
  it("cerrar inicia la salida y avisar que terminó lo desmonta", () => {
    expect(nextPresence("entered", "close")).toBe("exiting");
    expect(nextPresence("exiting", "done")).toBe("unmounted");
  });
  it("cerrar con reducir movimiento desmonta al instante", () => {
    expect(nextPresence("entered", "close", true)).toBe("unmounted");
  });
  it("cerrar o terminar fuera de lugar no cambia nada", () => {
    expect(nextPresence("unmounted", "close")).toBe("unmounted");
    expect(nextPresence("exiting", "close")).toBe("exiting");
    expect(nextPresence("entered", "done")).toBe("entered");
    expect(nextPresence("unmounted", "done")).toBe("unmounted");
  });
});

describe("playExitGhost", () => {
  it("no deja nada con reducir movimiento", () => {
    stubReduced(true);
    const node = { cloneNode: vi.fn() } as unknown as HTMLElement;
    expect(playExitGhost(node, 140)).toBe(false);
    expect(node.cloneNode).not.toHaveBeenCalled();
  });
});
