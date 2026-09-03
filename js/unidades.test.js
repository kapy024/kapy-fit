import { test, assertEq, assertCerca, assertThrows } from "./pruebas.js";
import { aKg, desdeKg, formatear } from "./unidades.js";

test("kg a kg no cambia el valor", () => {
  assertEq(aKg(22.5, "kg"), 22.5);
});

test("lb a kg convierte", () => {
  assertEq(aKg(100, "lb"), 45.4);
});

test("kg a lb convierte", () => {
  assertEq(desdeKg(45.4, "lb"), 100.1);
});

test("ida y vuelta conserva el valor dentro de la tolerancia", () => {
  // Redondear a un decimal en cada paso pierde precisión a propósito:
  // 135 lb → 61.2 kg → 134.9 lb. Lo que importa es que no derive más que eso.
  assertCerca(desdeKg(aKg(135, "lb"), "lb"), 135, 0.2);
});

test("formatear agrega la unidad", () => {
  assertEq(formatear(22.5, "kg"), "22.5 kg");
  assertEq(formatear(45.4, "lb"), "100.1 lb");
});

test("formatear quita el decimal cuando es entero", () => {
  assertEq(formatear(20, "kg"), "20 kg");
});

test("cadena vacía o nula devuelve vacío, no NaN", () => {
  assertEq(formatear(null, "kg"), "");
  assertEq(formatear("", "kg"), "");
});

test("una unidad desconocida lanza error", () => {
  assertThrows(() => aKg(10, "piedras"));
});

test("aKg trata cadena vacía, null y undefined como sin dato", () => {
  assertEq(aKg("", "kg"), null);
  assertEq(aKg(null, "kg"), null);
  assertEq(aKg(undefined, "kg"), null);
});

test("desdeKg trata cadena vacía, null y undefined como sin dato", () => {
  assertEq(desdeKg("", "kg"), null);
  assertEq(desdeKg(null, "kg"), null);
  assertEq(desdeKg(undefined, "kg"), null);
});

test("aKg acepta la coma decimal como equivalente al punto", () => {
  assertEq(aKg("70,5", "kg"), 70.5);
});

test("un peso negativo no es válido y devuelve null", () => {
  assertEq(aKg(-10, "kg"), null);
  assertEq(desdeKg(-10, "kg"), null);
});

test("cero sigue siendo un valor válido", () => {
  assertEq(aKg(0, "kg"), 0);
  assertEq(desdeKg(0, "kg"), 0);
});
