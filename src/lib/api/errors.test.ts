import { describe, expect, it } from "vitest";
import { isSessionExpiry } from "./errors";

describe("isSessionExpiry", () => {
  it("un 401 sin código o con otro código es sesión vencida", () => {
    expect(isSessionExpiry(401)).toBe(true);
    expect(isSessionExpiry(401, "SESION_VENCIDA")).toBe(true);
  });

  it("un PIN o una contraseña incorrectos no sacan a nadie del sistema", () => {
    expect(isSessionExpiry(401, "PIN_INVALIDO")).toBe(false);
    expect(isSessionExpiry(401, "CREDENCIALES_INVALIDAS")).toBe(false);
  });

  it("otros estados nunca son sesión vencida", () => {
    expect(isSessionExpiry(403, "SIN_PERMISO")).toBe(false);
    expect(isSessionExpiry(400)).toBe(false);
    expect(isSessionExpiry(500)).toBe(false);
  });
});
