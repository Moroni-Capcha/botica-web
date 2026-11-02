import type { ApiClient, PlatformClient } from "./contract";
import { createHttpClient, createHttpPlatformClient } from "./http";
import { createMockClient } from "./mock/client";
import { createMockPlatformClient } from "./mock/platform";

const mode = process.env.NEXT_PUBLIC_API_MODE ?? "mock";
const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

/** Cliente único para toda la app. Cambia entre mock y API real con NEXT_PUBLIC_API_MODE. */
export const api: ApiClient = mode === "http" ? createHttpClient(baseUrl) : createMockClient();

/** Consola interna de Digi!HME: otra puerta, con su propio inicio de sesión (nunca la usan las cuentas de una botica). */
export const platformApi: PlatformClient = mode === "http" ? createHttpPlatformClient(baseUrl) : createMockPlatformClient();

export const apiMode = mode === "http" ? "http" : "mock";

export * from "./types";
export type { ApiClient, PlatformClient, PublicConfig, BranchStock, NewCustomer } from "./contract";
export { ApiError, errorMessage, isApiError } from "./errors";
