import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/** Le enseña a tailwind-merge los nombres propios de globals.css (si no, `text-micro` se tomaría por un color y pisaría a `text-fg-2`). */
const twMerge = extendTailwindMerge({
  extend: { theme: { text: ["micro", "caption", "small"], shadow: ["subtle", "overlay"] } },
});

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
