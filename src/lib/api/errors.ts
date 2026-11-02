import type { ApiErrorBody } from "./types";

/** Error con un código estable que la UI puede distinguir y un mensaje listo para mostrar. */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(body: ApiErrorBody, status = 400) {
    super(body.message);
    this.name = "ApiError";
    this.code = body.code;
    this.status = status;
    this.details = body.details;
  }
}

/** 401 que significan "credenciales incorrectas", no "sesión vencida": no deben sacar a nadie del sistema. */
const CREDENTIAL_CODES = new Set(["PIN_INVALIDO", "CREDENCIALES_INVALIDAS"]);

/** Un 401 es sesión vencida salvo que el servidor diga que falló un PIN o una contraseña (p. ej. al marcar asistencia con la sesión abierta). */
export const isSessionExpiry = (status: number, code?: string): boolean => status === 401 && !(code && CREDENTIAL_CODES.has(code));

export const isApiError =(e: unknown): e is ApiError => e instanceof ApiError;

export const errorMessage = (e: unknown, fallback = "Algo salió mal. Intenta de nuevo.") =>
  isApiError(e) ? e.message : e instanceof Error && e.message ? e.message : fallback;
