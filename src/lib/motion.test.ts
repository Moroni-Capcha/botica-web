import { afterEach, describe, expect, it, vi } from "vitest";
import { EASE_OUT, animateIn, prefersReducedMotion, stagger } from "./motion";

const stubMedia = (reduce: boolean) => vi.stubGlobal("window", { matchMedia: (q: string) => ({ matches: reduce && q.includes("prefers-reduced-motion"), media: q }) });
const fakeEl = () => {
  const animate = vi.fn(() => ({}) as Animation);
  return { el: { animate } as unknown as Element, animate };
};

afterEach(() => vi.unstubAllGlobals());

describe("prefersReducedMotion", () => {
  it("es false sin window (servidor)", () => {
    expect(prefersReducedMotion()).toBe(false);
  });
  it("lee la preferencia del sistema", () => {
    stubMedia(true);
    expect(prefersReducedMotion()).toBe(true);
    stubMedia(false);
    expect(prefersReducedMotion()).toBe(false);
  });
});

describe("animateIn", () => {
  it("anima con la curva de los tokens cuando no hay preferencia", () => {
    stubMedia(false);
    const { el, animate } = fakeEl();
    const frames = [{ opacity: 0 }, { opacity: 1 }];
    expect(animateIn(el, frames, { duration: 200 })).not.toBeNull();
    expect(animate).toHaveBeenCalledWith(frames, { easing: EASE_OUT, duration: 200 });
  });
  it("no anima con reducir movimiento", () => {
    stubMedia(true);
    const { el, animate } = fakeEl();
    expect(animateIn(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 200 })).toBeNull();
    expect(animate).not.toHaveBeenCalled();
  });
  it("tolera un elemento ausente o sin animate", () => {
    stubMedia(false);
    expect(animateIn(null, [], { duration: 1 })).toBeNull();
    expect(animateIn({} as Element, [], { duration: 1 })).toBeNull();
  });
});

describe("stagger", () => {
  it("espera 30 ms más por elemento", () => {
    stubMedia(false);
    expect(stagger(0)).toEqual({ animationDelay: "0ms" });
    expect(stagger(3)).toEqual({ animationDelay: "90ms" });
  });
  it("no pasa del máximo", () => {
    stubMedia(false);
    expect(stagger(50)).toEqual({ animationDelay: "180ms" });
    expect(stagger(10, 50, 100)).toEqual({ animationDelay: "100ms" });
  });
  it("tolera índices negativos", () => {
    stubMedia(false);
    expect(stagger(-2)).toEqual({ animationDelay: "0ms" });
  });
  it("no devuelve nada con reducir movimiento", () => {
    stubMedia(true);
    expect(stagger(3)).toEqual({});
  });
});
