/** Reglas del teclado de PIN del ingreso (puras, sin pantalla). */

export const PIN_LENGTH = 4;

/** Teclas en el orden en que se dibujan: "" es el hueco y "←" borra. */
export const PIN_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "←"] as const;

/** PIN que resulta de pulsar una tecla: un dígito se agrega (hasta 4), "←" borra el último, cualquier otra cosa no cambia nada. */
export function applyPinKey(pin: string, key: string): string {
  if (key === "←") return pin.slice(0, -1);
  if (/^\d$/.test(key)) return pin.length < PIN_LENGTH ? pin + key : pin;
  return pin;
}

export const isPinComplete = (pin: string): boolean => pin.length >= PIN_LENGTH;
