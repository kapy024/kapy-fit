import { test, assertEq } from "./pruebas.js";
import { guardarPeso, pesos, pesoDe, LLAVE_PESOS } from "./peso-corporal.js";
import { pendientes, LLAVE_COLA, LLAVE_MARCAS_PESO } from "./almacen.js";

function limpiar() {
  localStorage.removeItem(LLAVE_PESOS);
  localStorage.removeItem(LLAVE_COLA);
  localStorage.removeItem(LLAVE_MARCAS_PESO);
}

test("guardar y leer un peso", () => {
  limpiar();
  assertEq(guardarPeso("2026-09-01", 70), true);
  assertEq(pesoDe("2026-09-01"), 70);
  assertEq(pesos(), [{ fecha: "2026-09-01", kg: 70 }]);
});

test("guardar dos veces la misma fecha reemplaza sin duplicar", () => {
  limpiar();
  guardarPeso("2026-09-01", 70);
  guardarPeso("2026-09-01", 71.5);
  assertEq(pesos().length, 1);
  assertEq(pesoDe("2026-09-01"), 71.5);
});

test("pesos() sale ordenado por fecha aunque se guarde al revés", () => {
  limpiar();
  guardarPeso("2026-09-08", 71);
  guardarPeso("2026-09-01", 70);
  assertEq(pesos().map((p) => p.fecha), ["2026-09-01", "2026-09-08"]);
});

test("un peso no numérico se rechaza y no se guarda", () => {
  limpiar();
  assertEq(guardarPeso("2026-09-01", "no soy un número"), false);
  assertEq(pesoDe("2026-09-01"), null);
});

test("un peso negativo se rechaza y no se guarda", () => {
  limpiar();
  assertEq(guardarPeso("2026-09-01", -5), false);
  assertEq(pesoDe("2026-09-01"), null);
});

test("un peso con coma decimal se acepta, igual que el resto de la app", () => {
  limpiar();
  assertEq(guardarPeso("2026-09-01", "70,5"), true);
  assertEq(pesoDe("2026-09-01"), 70.5);
});

test("pesoDe devuelve null cuando no hay nada esa fecha", () => {
  limpiar();
  assertEq(pesoDe("2020-01-01"), null);
});

test("un JSON corrupto se lee como vacío", () => {
  localStorage.setItem(LLAVE_PESOS, "{esto no es json");
  assertEq(pesos(), []);
  limpiar();
});

test("guardar un peso encola un pendiente de sincronización", () => {
  limpiar();
  guardarPeso("2026-09-01", 70);
  const cola = pendientes().filter((p) => p.tipo === "peso");
  assertEq(cola.length, 1);
  assertEq(cola[0].datos, { fecha: "2026-09-01", kg: 70 });
});

test("si la escritura local falla no se encola nada", () => {
  limpiar();
  const original = localStorage.setItem;
  localStorage.setItem = () => {
    throw new DOMException("cuota llena", "QuotaExceededError");
  };
  try {
    assertEq(guardarPeso("2026-09-01", 70), false);
  } finally {
    localStorage.setItem = original;
  }
  assertEq(pendientes().filter((p) => p.tipo === "peso").length, 0);
});

test("un peso rechazado por inválido tampoco encola nada", () => {
  limpiar();
  assertEq(guardarPeso("2026-09-01", -5), false);
  assertEq(pendientes().filter((p) => p.tipo === "peso").length, 0);
});

test("un peso corporal de cero se rechaza y no se encola", () => {
  limpiar();
  assertEq(guardarPeso("2026-09-04", 0), false);
  assertEq(guardarPeso("2026-09-04", "0"), false);
  assertEq(pesos().length, 0);
  assertEq(pendientes().length, 0);
});

