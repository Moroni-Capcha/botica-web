import { describe, expect, it } from "vitest";
import { TONE_CLASS, type Tone } from "./tone";

describe("TONE_CLASS", () => {
  it("cada tono define sus cinco clases con su propio token", () => {
    for (const tone of Object.keys(TONE_CLASS) as Tone[]) {
      const c = TONE_CLASS[tone];
      for (const v of Object.values(c)) expect(v).not.toBe("");
      if (tone !== "neutral") for (const v of [c.soft, c.ring, c.text, c.solid, c.dot]) expect(v).toContain(tone);
    }
  });
});
