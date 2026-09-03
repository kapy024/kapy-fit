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

test("assertEq detecta dos Date distintas (regresión: Object.keys(Date) es [])", () => {
  assertThrows(
    () => assertEq(new Date("2026-01-01"), new Date("2026-01-02")),
    "dos fechas distintas no deberían reportarse como iguales"
  );
});

test("assertEq trata dos Date con el mismo instante como iguales", () => {
  assertEq(new Date("2026-01-01T00:00:00.000Z"), new Date("2026-01-01T00:00:00.000Z"));
});

test("assertEq compara estructuras cíclicas equivalentes sin RangeError", () => {
  const a = { nombre: "ciclo" };
  a.self = a;
  const b = { nombre: "ciclo" };
  b.self = b;
  assertEq(a, b);
});

test("assertEq detecta un Map con contenido distinto", () => {
  const a = new Map([["clave", 1]]);
  const b = new Map([["clave", 2]]);
  assertThrows(
    () => assertEq(a, b),
    "dos Map con el mismo tamaño pero contenido distinto no deberían ser iguales"
  );
});
