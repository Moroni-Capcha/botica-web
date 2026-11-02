/**
 * Datos personales fuera de los reportes de errores (Ley 29733). Reglas puras: todo lo que sale hacia el monitoreo
 * pasa por aquí antes. Preferimos ocultar de más que filtrar un DNI, un nombre de cliente o un celular.
 */

export const REDACTED = "[oculto]";
const MAX_DEPTH = 4;

/** Partes de un nombre de campo que indican un dato personal o un secreto. */
const SENSITIVE_KEY_PARTS = [
  "dni", "ruc", "name", "nombre", "customer", "cliente", "phone", "telefono", "celular", "email", "correo", "password", "clave", "contrasena",
  "token", "authorization", "cookie", "secret", "document", "address", "direccion", "receta", "prescription", "cmp", "doctor", "medico", "razon", "note", "nota",
];

/** `pin` solo cuando es el campo completo o termina en pin (no "mapping" ni "spinner"). */
export function isSensitiveKey(key: string): boolean {
  const k = key.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return k === "pin" || k.endsWith("pin") || SENSITIVE_KEY_PARTS.some((p) => k.includes(p));
}

/** Oculta correos, tokens, RUC (11 dígitos), celulares (9 dígitos) y DNI (8 dígitos) que aparezcan dentro de un texto. */
export function redactText(text: string): string {
  return text
    .replace(/([?&](?:q|dni|ruc|email|correo|phone|token|name|nombre|password|pin)=)[^&#\s]*/gi, `$1${REDACTED}`)
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, `Bearer ${REDACTED}`)
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[correo]")
    .replace(/(?<!\d)(?:10|20)\d{9}(?!\d)/g, "[ruc]")
    .replace(/(?<!\d)9\d{2}[ -]?\d{3}[ -]?\d{3}(?!\d)/g, "[celular]")
    .replace(/(?<!\d)\d{8}(?!\d)/g, "[dni]");
}

/** Copia segura de cualquier valor: textos limpios, campos sensibles ocultos y profundidad limitada. */
export function redactValue(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return redactText(value);
  if (value === null || typeof value === "number" || typeof value === "boolean" || value === undefined) return value;
  if (typeof value === "bigint") return String(value);
  if (typeof value === "function" || typeof value === "symbol") return undefined;
  if (depth >= MAX_DEPTH) return "[…]";
  if (value instanceof Error) return { name: value.name, message: redactText(value.message) };
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redactValue(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = isSensitiveKey(k) ? REDACTED : redactValue(v, depth + 1);
  return out;
}

/** Contexto adicional de un reporte, sin datos personales. */
export function redactContext(context: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!context) return {};
  return redactValue(context) as Record<string, unknown>;
}
