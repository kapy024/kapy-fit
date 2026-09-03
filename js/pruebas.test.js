// Self-tests for the test runner itself: these cover the review findings
// fixed in pruebas.js, so a future regression in the runner is caught by
// the runner's own suite instead of silently breaking every other test.
import { test, assertEq, assertCerca, assertThrows } from "./pruebas.js";

test("assertCerca lanza cuando actual es NaN", () => {
  assertThrows(
    () => assertCerca(NaN, 5, 0.1),
    "assertCerca debería rechazar NaN"
  );
});

test("assertCerca lanza cuando esperado es NaN", () => {
  assertThrows(
    () => assertCerca(5, NaN, 0.1),
    "assertCerca debería rechazar NaN en esperado"
  );
});

test("assertCerca sigue pasando con números finitos dentro de tolerancia", () => {
  assertCerca(5.04, 5, 0.1);
});

test("assertEq distingue {a: undefined} de {}", () => {
  assertThrows(
    () => assertEq({ a: undefined }, {}),
    "assertEq debería distinguir clave presente con undefined de clave ausente"
  );
});

test("assertEq no depende del orden de claves", () => {
  assertEq({ a: 1, b: 2 }, { b: 2, a: 1 });
});

test("assertThrows falla cuando la función no lanza", () => {
  assertThrows(() => {
    assertThrows(() => {
      // No lanza nada a propósito.
    });
  }, "assertThrows debería fallar si fn() no lanza");
});
