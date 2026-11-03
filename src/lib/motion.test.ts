import { afterEach, describe, expect, it, vi } from "vitest";
import { EASE_OUT, POP_KEYFRAMES, animateIn, flipDelta, flipKeyframes, playFlip, prefersReducedMotion, stagger } from "./motion";

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

describe("EASE_OUT", () => {
  it("es la curva expo-out de los tokens", () => {
    expect(EASE_OUT).toBe("cubic-bezier(0.16, 1, 0.3, 1)");
  });
});

describe("animateIn · will-change", () => {
  it("lo pone mientras anima y lo quita al terminar", () => {
    stubMedia(false);
    const listeners: Record<string, () => void> = {};
    const anim = { addEventListener: (type: string, fn: () => void) => { listeners[type] = fn; } } as unknown as Animation;
    const el = { style: { willChange: "" }, animate: vi.fn(() => anim) } as unknown as HTMLElement;
    animateIn(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 100 });
    expect(el.style.willChange).toBe("transform, opacity");
    listeners.finish?.();
    expect(el.style.willChange).toBe("");
  });
});

describe("POP_KEYFRAMES", () => {
  it("solo anima transform, con un rebote corto", () => {
    expect(POP_KEYFRAMES.every((k) => Object.keys(k).every((p) => p === "transform" || p === "offset"))).toBe(true);
    expect(POP_KEYFRAMES.map((k) => k.transform)).toEqual(["scale3d(0.96, 0.96, 1)", "scale3d(1.01, 1.01, 1)", "scale3d(1, 1, 1)"]);
  });
});

describe("flipDelta", () => {
  it("es lo que hay que desplazar para volver al lugar anterior", () => {
    expect(flipDelta({ x: 0, y: 120 }, { x: 0, y: 40 })).toEqual({ x: 0, y: 80 });
    expect(flipDelta({ x: 10, y: 0 }, { x: 40, y: 0 })).toEqual({ x: -30, y: 0 });
  });
  it("es null si casi no se movió", () => {
    expect(flipDelta({ x: 0, y: 40 }, { x: 0, y: 40 })).toBeNull();
    expect(flipDelta({ x: 0, y: 40.3 }, { x: 0, y: 40 })).toBeNull();
  });
});

describe("flipKeyframes", () => {
  it("parte del desplazamiento invertido y llega a translate3d(0, 0, 0)", () => {
    expect(flipKeyframes({ x: 0, y: 80 })).toEqual([{ transform: "translate3d(0px, 80px, 0)" }, { transform: "translate3d(0, 0, 0)" }]);
  });
});

describe("playFlip", () => {
  it("no hace nada con reducir movimiento", () => {
    stubMedia(true);
    expect(playFlip({} as HTMLElement, new Map([["a", { x: 0, y: 10 }]]))).toBe(0);
  });
  it("no hace nada sin posiciones previas o sin contenedor", () => {
    stubMedia(false);
    expect(playFlip(null, new Map([["a", { x: 0, y: 10 }]]))).toBe(0);
    expect(playFlip({} as HTMLElement, new Map())).toBe(0);
  });
});
