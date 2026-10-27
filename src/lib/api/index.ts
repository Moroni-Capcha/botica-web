import type { ApiClient } from "./contract";
import { createHttpClient } from "./http";
import { createMockClient } from "./mock/client";

const mode = process.env.NEXT_PUBLIC_API_MODE ?? "mock";
const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

/** Cliente único para toda la app. Cambia entre mock y API real con NEXT_PUBLIC_API_MODE. */
export const api: ApiClient = mode === "http" ? createHttpClient(baseUrl) : createMockClient();

export const apiMode = mode === "http" ? "http" : "mock";

export * from "./types";
export type { ApiClient, PublicConfig, BranchStock, NewCustomer } from "./contract";
export { ApiError, errorMessage, isApiError } from "./errors";
