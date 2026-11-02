import { describe, expect, it } from "vitest";
import { isValidBoticaCode, isValidEmail, normalizeBoticaCode, normalizeEmail, passwordError } from "./auth";

describe("ingreso del dueño", () => {
  it("exige contraseña de 8 caracteres o más", () => {
    expect(passwordError("1234567")).not.toBeNull();
    expect(passwordError("12345678")).toBeNull();
    expect(passwordError("")).not.toBeNull();
  });

  it("valida el código de botica", () => {
    expect(isValidBoticaCode("botica-huanuco")).toBe(true);
    expect(isValidBoticaCode("ab")).toBe(false);
    expect(isValidBoticaCode("-botica")).toBe(false);
    expect(isValidBoticaCode("botica-")).toBe(false);
    expect(isValidBoticaCode("Botica Huanuco")).toBe(false);
    expect(normalizeBoticaCode("  Botica-Huanuco ")).toBe("botica-huanuco");
  });

  it("valida y normaliza el correo", () => {
    expect(isValidEmail("dueno@botica-huanuco.pe")).toBe(true);
    expect(isValidEmail("dueno@botica")).toBe(false);
    expect(isValidEmail("dueno botica@x.pe")).toBe(false);
    expect(normalizeEmail("  Dueno@Botica-Huanuco.PE ")).toBe("dueno@botica-huanuco.pe");
  });
});
