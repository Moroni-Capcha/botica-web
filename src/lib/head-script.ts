import { PERF_INIT_SCRIPT } from "./perf-mode";
import { THEME_INIT_SCRIPT } from "./theme";

/**
 * Único script del <head>: tema y modo ligero, antes del primer pintado.
 * Cada parte es una función que se llama a sí misma; el ";" evita que la segunda se lea como una llamada al resultado de la primera.
 */
export const HEAD_INIT_SCRIPT = `${THEME_INIT_SCRIPT};${PERF_INIT_SCRIPT}`;
