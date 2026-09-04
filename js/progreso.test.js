// Tests for the Progreso tab. Runs against the real DOM (see
// registro.test.js's own header for why that's safe).
import { test, assertEq } from "./pruebas.js";
import { pintarNav } from "./render.js";
import { RUTINA } from "./rutina.js";
import {
  CLAVE_PROGRESO, ejerciciosConHistorial, pintarFilaEjercicio, montarProgreso
} from "./progreso.js";
import { guardarRegistro, LLAVE_REGISTROS, LLAVE_COLA, LLAVE_MARCAS } from "./almacen.js";

function limpiar() {
  localStorage.removeItem(LLAVE_REGISTROS);
  localStorage.removeItem(LLAVE_COLA);
  localStorage.removeItem(LLAVE_MARCAS);
}

function reg(slug, fecha, extra) {
  return { fecha, slug, pesoKg: null, series: null, reps: null, hecho: true, ...extra };
}

// --- integración con dayNav ---

test("la pestaña Progreso aparece después del día 7", () => {
  const nav = document.createElement("div");
  pintarNav(nav, "dia1", () => {});
  assertEq(nav.children.length, RUTINA.length + 1);
  const ultima = nav.children[nav.children.length - 1];
  assertEq(ultima.textContent.indexOf("Progreso") !== -1, true);
  assertEq(ultima.getAttribute("role"), "tab");
});

test("la pestaña Progreso puede marcarse activa como cualquier día", () => {
  const nav = document.createElement("div");
  pintarNav(nav, CLAVE_PROGRESO, () => {});
  const ultima = nav.children[nav.children.length - 1];
  assertEq(ultima.getAttribute("aria-selected"), "true");
  assertEq(nav.children[0].getAttribute("aria-selected"), "false");
});

// --- ejerciciosConHistorial ---

test("ejerciciosConHistorial lista solo ejercicios con registros, más reciente primero", () => {
  limpiar();
  guardarRegistro("dia3:base:sentadilla", reg("sentadilla", "2026-08-01", { pesoKg: 20 }));
  guardarRegistro("dia4:base:press-pectoral-maquina",
    reg("press-pectoral-maquina", "2026-08-10", { pesoKg: 30 }));
  const lista = ejerciciosConHistorial();
  const slugs = lista.map((e) => e.slug);
  assertEq(slugs.indexOf("press-pectoral-maquina") < slugs.indexOf("sentadilla"), true);
  assertEq(lista.every((e) => e.cantidad > 0), true);
  limpiar();
});

test("un ejercicio sin registros no aparece en la lista", () => {
  limpiar();
  guardarRegistro("dia3:base:sentadilla", reg("sentadilla", "2026-08-01", { pesoKg: 20 }));
  const slugs = ejerciciosConHistorial().map((e) => e.slug);
  assertEq(slugs.indexOf("crunch") === -1, true);
  limpiar();
});

// --- estado vacío ---

test("sin ningún registro, montarProgreso muestra un estado vacío que explica qué hacer", async () => {
  limpiar();
  const contenedor = document.createElement("div");
  await montarProgreso(contenedor, "kg");
  assertEq(contenedor.querySelectorAll(".progreso-item").length, 0);
  const vacio = contenedor.querySelector(".progreso-vacio");
  assertEq(vacio !== null, true);
  assertEq(vacio.textContent.length > 0, true);
  limpiar();
});

// --- elegir un ejercicio monta sus gráficas ---

test("elegir un ejercicio abre su panel y monta sus dos gráficas", async () => {
  limpiar();
  guardarRegistro("dia3:base:sentadilla", reg("sentadilla", "2026-08-01", { pesoKg: 20, series: 4, reps: "10" }));
  guardarRegistro("dia3:base:sentadilla", reg("sentadilla", "2026-08-08", { pesoKg: 22, series: 4, reps: "10" }));
  const { li, alternar } = pintarFilaEjercicio("sentadilla", 2, "kg");
  const btn = li.querySelector(".progreso-toggle");
  const panel = li.querySelector(".progreso-panel-graficas");
  assertEq(panel.hidden, true);
  await alternar();
  assertEq(panel.hidden, false);
  assertEq(btn.getAttribute("aria-expanded"), "true");
  assertEq(panel.querySelectorAll(".grafica-bloque").length, 2);
  limpiar();
});

test("montarProgreso con registros dibuja la lista y la tarjeta de peso corporal", async () => {
  limpiar();
  guardarRegistro("dia3:base:sentadilla", reg("sentadilla", "2026-08-01", { pesoKg: 20 }));
  const contenedor = document.createElement("div");
  await montarProgreso(contenedor, "kg");
  assertEq(contenedor.querySelectorAll(".progreso-item").length, 1);
  assertEq(contenedor.querySelector(".progreso-peso") !== null, true);
  limpiar();
});
