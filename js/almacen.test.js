import { test, assertEq } from "./pruebas.js";
import {
  guardarRegistro, historial, registroDe,
  preferencias, guardarPreferencias, LLAVE_REGISTROS, LLAVE_PREFS
} from "./almacen.js";

function limpiar() {
  localStorage.removeItem(LLAVE_REGISTROS);
  localStorage.removeItem(LLAVE_PREFS);
}

test("historial vacío devuelve arreglo vacío", () => {
  limpiar();
  assertEq(historial("sentadilla"), []);
});

test("guardar y leer un registro", () => {
  limpiar();
  guardarRegistro("sentadilla", { fecha: "2026-09-02", pesoKg: 20, series: 4, reps: "10", hecho: true });
  assertEq(historial("sentadilla").length, 1);
  assertEq(registroDe("sentadilla", "2026-09-02").pesoKg, 20);
});

test("guardar dos veces la misma fecha sobrescribe, no duplica", () => {
  limpiar();
  guardarRegistro("sentadilla", { fecha: "2026-09-02", pesoKg: 20, series: 4, reps: "10", hecho: true });
  guardarRegistro("sentadilla", { fecha: "2026-09-02", pesoKg: 22, series: 4, reps: "10", hecho: true });
  assertEq(historial("sentadilla").length, 1);
  assertEq(registroDe("sentadilla", "2026-09-02").pesoKg, 22);
});

test("el historial sale ordenado por fecha aunque se guarde al revés", () => {
  limpiar();
  guardarRegistro("crunch", { fecha: "2026-09-05", pesoKg: 40, series: 4, reps: "10", hecho: true });
  guardarRegistro("crunch", { fecha: "2026-09-01", pesoKg: 35, series: 4, reps: "10", hecho: true });
  assertEq(historial("crunch").map((r) => r.fecha), ["2026-09-01", "2026-09-05"]);
});

test("los ejercicios no se pisan entre sí", () => {
  limpiar();
  guardarRegistro("sentadilla", { fecha: "2026-09-02", pesoKg: 20, series: 4, reps: "10", hecho: true });
  guardarRegistro("plancha", { fecha: "2026-09-02", pesoKg: null, series: 3, reps: "40 seg", hecho: true });
  assertEq(historial("sentadilla").length, 1);
  assertEq(historial("plancha").length, 1);
});

test("registroDe devuelve null cuando no hay nada esa fecha", () => {
  limpiar();
  assertEq(registroDe("sentadilla", "2026-01-01"), null);
});

test("la unidad por omisión es kg", () => {
  limpiar();
  assertEq(preferencias().unidad, "kg");
});

test("la preferencia de unidad se persiste", () => {
  limpiar();
  guardarPreferencias({ unidad: "lb" });
  assertEq(preferencias().unidad, "lb");
});

test("un JSON corrupto no tumba la app", () => {
  localStorage.setItem(LLAVE_REGISTROS, "{esto no es json");
  assertEq(historial("sentadilla"), []);
  limpiar();
});

test("guardarRegistro devuelve true cuando persiste", () => {
  limpiar();
  assertEq(guardarRegistro("sentadilla", { fecha: "2026-09-02", pesoKg: 20, series: 4, reps: "10", hecho: true }), true);
});

test("guardarRegistro devuelve false cuando el almacenamiento falla", () => {
  limpiar();
  const original = localStorage.setItem;
  localStorage.setItem = () => {
    throw new DOMException("cuota llena", "QuotaExceededError");
  };
  try {
    assertEq(guardarRegistro("sentadilla", { fecha: "2026-09-02", pesoKg: 20, series: 4, reps: "10", hecho: true }), false);
  } finally {
    localStorage.setItem = original;
  }
});

test("preferencias() cae a kg ante una unidad guardada inválida", () => {
  limpiar();
  localStorage.setItem(LLAVE_PREFS, JSON.stringify({ unidad: "stones" }));
  assertEq(preferencias().unidad, "kg");
  limpiar();
});

test("guardarRegistro reemplaza el registro por completo, no hace merge", () => {
  limpiar();
  guardarRegistro("sentadilla", { fecha: "2026-09-02", pesoKg: 20, series: 4, reps: "10", hecho: true });
  guardarRegistro("sentadilla", { fecha: "2026-09-02", pesoKg: 22, series: 3, reps: "8", hecho: false });
  assertEq(registroDe("sentadilla", "2026-09-02"), { fecha: "2026-09-02", pesoKg: 22, series: 3, reps: "8", hecho: false });
});
