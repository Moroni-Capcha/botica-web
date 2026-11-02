/** Reglas de ingreso del dueño y código de botica. Puras: el backend debería aplicar los mismos casos. */

export const MIN_PASSWORD = 8;

export const normalizeBoticaCode = (s: string): string => s.trim().toLowerCase();

/** Código de botica: minúsculas, números y guiones, de 3 a 40 caracteres, sin guion al inicio ni al final. */
export const isValidBoticaCode = (s: string): boolean => /^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$/.test(s);

export const normalizeEmail = (s: string): string => s.trim().toLowerCase();

export const isValidEmail = (s: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);

/** Contraseña de al menos 8 caracteres. Devuelve el mensaje de error o null si está bien. */
export function passwordError(password: string): string | null {
  return password.length < MIN_PASSWORD ? `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.` : null;
}
