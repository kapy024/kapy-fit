import { test, assertEq } from "./pruebas.js";
import { correoValido } from "./auth.js";

test("acepta un correo normal", () => {
  assertEq(correoValido("juan@example.com"), true);
});

test("rechaza texto que no es correo", () => {
  for (const malo of ["", "   ", "juan", "juan@", "@example.com", "juan @x.com", "juan@x"]) {
    assertEq(correoValido(malo), false, `debió rechazar: ${JSON.stringify(malo)}`);
  }
});

test("ignora espacios alrededor", () => {
  assertEq(correoValido("  juan@example.com  "), true);
});
