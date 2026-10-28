/**
 * Primera configuración de una botica nueva: pasos, avance y datos mínimos.
 * Reglas puras: el backend debería aplicar los mismos casos.
 */
import type { SetupStep } from "@/lib/api/types";
import { isValidRuc } from "./pharmacy";

/** Pasos en orden. */
export const SETUP_STEPS: readonly SetupStep[] = ["botica", "local", "series", "usuario", "productos"];

export const SETUP_TITLE: Record<SetupStep, string> = {
  botica: "Datos de tu botica",
  local: "Tu primer local",
  series: "Series de comprobantes",
  usuario: "Usuario de mostrador",
  productos: "Tus productos",
};

export const SETUP_HINT: Record<SetupStep, string> = {
  botica: "RUC, teléfono y colores de tu botica.",
  local: "Dirección del local donde vendes.",
  series: "Revisa la serie de tus boletas y facturas.",
  usuario: "Crea la cuenta y el PIN de quien atiende el mostrador.",
  productos: "Importa tu lista desde Excel o sáltalo y agrégalos después.",
};

const known = (done: readonly string[]) => SETUP_STEPS.filter((s) => done.includes(s));

/** Primer paso que falta, o null si ya está todo. */
export const nextStep = (done: readonly string[]): SetupStep | null => SETUP_STEPS.find((s) => !done.includes(s)) ?? null;

export function progress(done: readonly string[]): { done: number; total: number; percent: number } {
  const n = known(done).length;
  return { done: n, total: SETUP_STEPS.length, percent: Math.round((n / SETUP_STEPS.length) * 100) };
}

export const isSetupComplete = (done: readonly string[]): boolean => nextStep(done) === null;

export const isSetupStep = (s: string): s is SetupStep => (SETUP_STEPS as readonly string[]).includes(s);

/** Mensaje de error del RUC, o null si está bien (11 dígitos que empiezan en 10 o 20). */
export const rucError = (ruc: string): string | null => (isValidRuc(ruc.trim()) ? null : "El RUC debe tener 11 dígitos y empezar en 10 o 20.");

/** Pasos hechos sin repetir y solo los que existen, en orden. */
export const normalizeDone = (done: readonly string[]): SetupStep[] => known(done);

/** Código de botica sugerido desde su nombre: sin tildes, minúsculas, con guiones, máximo 40 caracteres. */
export function suggestBoticaCode(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 40)
    .replace(/-+$/, "");
}
