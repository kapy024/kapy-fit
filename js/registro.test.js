// Tests for the capture layer: peso/series/reps persistence, the done
// checkbox, and parseRestSeconds. Runs against the real DOM in the
// browser (tests.html) — `buscar`/`fire` below only walk `.children` and
// dispatch a plain Event, both of which real elements support too, so
// nothing here is Node-only.
import { test, assertEq } from "./pruebas.js";
import {
  montarCampos, montarPalomita, montarTemporizador, parseRestSeconds, crearAviso
} from "./registro.js";
import { guardarRegistro, registroDe, hoyISO, LLAVE_REGISTROS } from "./almacen.js";

// montarCampos/montarPalomita reciben el renglón de la rutina completo
// (slot + slug) en vez de un slug suelto: el slot es la llave del almacén y
// el slug viaja dentro del registro. Las pruebas de abajo se adaptaron a esa
// firma; lo que verifican no cambió.
//
// montarPalomita también recibe ahora el nombre del ejercicio (para el
// aria-label, ver render.js) y el `aviso` compartido con montarCampos en
// vez de crear el suyo propio — las pruebas de la palomita que revisan el
// aviso ya no lo buscan dentro del <li>, lo crean con crearAviso() y lo
// pasan directo, como hace render.js.

function limpiar() {
  localStorage.removeItem(LLAVE_REGISTROS);
}

// Depth-first search for the first descendant (or `el` itself) matching
// `pred` — the tests only care about "is there an input with this class
// somewhere in here", not the exact tree shape montarCampos/montarPalomita
// build, so a full DOM query language would be overkill.
function buscar(el, pred) {
  if (!el) return null;
  if (pred(el)) return el;
  for (const hijo of el.children || []) {
    const r = buscar(hijo, pred);
    if (r) return r;
  }
  return null;
}

function inputConClase(contenedor, clase) {
  return buscar(contenedor, (el) => el.tagName === "INPUT" && el.className.includes(clase));
}

function fire(el, tipo) {
  el.dispatchEvent(new Event(tipo));
}

const SLOT = "dia3:base:sentadilla";
const EJERCICIO = { slot: SLOT, slug: "sentadilla", series: "4", reps: "10" };

// --- montarCampos: peso/series/reps ---

test("un peso capturado en libras se persiste en kilos", () => {
  limpiar();
  const contenedor = document.createElement("div");
  montarCampos(contenedor, EJERCICIO, "lb");
  const inputPeso = inputConClase(contenedor, "f-w");
  inputPeso.value = "100";
  fire(inputPeso, "change");
  assertEq(registroDe(SLOT, hoyISO()).pesoKg, 45.4);
});

test("el peso se persiste en change, no en cada tecla (input)", () => {
  limpiar();
  const contenedor = document.createElement("div");
  montarCampos(contenedor, EJERCICIO, "kg");
  const inputPeso = inputConClase(contenedor, "f-w");
  inputPeso.value = "50";
  fire(inputPeso, "input");
  assertEq(registroDe(SLOT, hoyISO()), null);
  fire(inputPeso, "change");
  assertEq(registroDe(SLOT, hoyISO()).pesoKg, 50);
});

test("el registro guardado desde los campos incluye el slug", () => {
  limpiar();
  const contenedor = document.createElement("div");
  montarCampos(contenedor, EJERCICIO, "kg");
  const inputPeso = inputConClase(contenedor, "f-w");
  inputPeso.value = "60";
  fire(inputPeso, "change");
  assertEq(registroDe(SLOT, hoyISO()).slug, "sentadilla");
});

// El bug reportado: dos series del mismo ejercicio en el mismo bloque
// compartían renglón, así que la segunda borraba lo escrito en la primera.
test("dos renglones del mismo slug capturan por separado", () => {
  limpiar();
  const ligero = { slot: "dia1:v1:press-militar-barra", slug: "press-militar-barra" };
  const pesado = { slot: "dia1:v1:press-militar-barra#2", slug: "press-militar-barra" };
  const a = document.createElement("div");
  const b = document.createElement("div");
  montarCampos(a, ligero, "kg");
  montarCampos(b, pesado, "kg");

  const pesoA = inputConClase(a, "f-w");
  pesoA.value = "30";
  fire(pesoA, "change");
  const pesoB = inputConClase(b, "f-w");
  pesoB.value = "12";
  fire(pesoB, "change");

  assertEq(registroDe(ligero.slot, hoyISO()).pesoKg, 30);
  assertEq(registroDe(pesado.slot, hoyISO()).pesoKg, 12);
});

// El bug más grave del lote: un peso mal tecleado ("3o") o negativo hacía
// que aKg() devolviera null y ese null se guardara con éxito, borrando en
// silencio el peso ya guardado. El campo debe poder seguir vaciándose a
// propósito (borrado real), pero texto no vacío e ininterpretable no debe
// tocar lo ya guardado, y tiene que avisar.
test("un peso ininterpretable no borra el valor guardado y muestra aviso", () => {
  limpiar();
  const contenedor = document.createElement("div");
  const aviso = crearAviso();
  montarCampos(contenedor, EJERCICIO, "kg", aviso);
  const inputPeso = inputConClase(contenedor, "f-w");

  inputPeso.value = "30";
  fire(inputPeso, "change");
  assertEq(registroDe(SLOT, hoyISO()).pesoKg, 30);
  assertEq(aviso.hidden, true);

  inputPeso.value = "3o";
  fire(inputPeso, "change");
  assertEq(registroDe(SLOT, hoyISO()).pesoKg, 30);
  assertEq(aviso.hidden, false);
});

test("un peso negativo tampoco borra el valor guardado", () => {
  limpiar();
  const contenedor = document.createElement("div");
  const aviso = crearAviso();
  montarCampos(contenedor, EJERCICIO, "kg", aviso);
  const inputPeso = inputConClase(contenedor, "f-w");

  inputPeso.value = "30";
  fire(inputPeso, "change");
  inputPeso.value = "-5";
  fire(inputPeso, "change");

  assertEq(registroDe(SLOT, hoyISO()).pesoKg, 30);
  assertEq(aviso.hidden, false);
});

test("vaciar el campo de peso a propósito sí borra el dato guardado", () => {
  limpiar();
  const contenedor = document.createElement("div");
  const aviso = crearAviso();
  montarCampos(contenedor, EJERCICIO, "kg", aviso);
  const inputPeso = inputConClase(contenedor, "f-w");

  inputPeso.value = "30";
  fire(inputPeso, "change");
  inputPeso.value = "";
  fire(inputPeso, "change");

  assertEq(registroDe(SLOT, hoyISO()).pesoKg, null);
  assertEq(aviso.hidden, true);
});

// --- montarCampos: series como número, igual que migracion.js ---

test("series capturada desde los campos se guarda como número, no como cadena", () => {
  limpiar();
  const contenedor = document.createElement("div");
  montarCampos(contenedor, EJERCICIO, "kg");
  const inputSeries = inputConClase(contenedor, "f-s");
  inputSeries.value = "4";
  fire(inputSeries, "change");
  assertEq(registroDe(SLOT, hoyISO()).series, 4);
});

test("una serie no numérica se guarda como null, no como la cadena tal cual", () => {
  limpiar();
  const contenedor = document.createElement("div");
  montarCampos(contenedor, EJERCICIO, "kg");
  const inputSeries = inputConClase(contenedor, "f-s");
  inputSeries.value = "muchas";
  fire(inputSeries, "change");
  assertEq(registroDe(SLOT, hoyISO()).series, null);
});

// --- montarPalomita ---

test("desmarcar la palomita deja hecho:false sin borrar el peso", () => {
  limpiar();
  guardarRegistro(SLOT, {
    fecha: hoyISO(), slug: "sentadilla", pesoKg: 40, series: "4", reps: "10", hecho: true
  });
  const li = document.createElement("li");
  const input = montarPalomita(li, EJERCICIO, "Sentadilla", crearAviso());
  assertEq(input.checked, true);

  // El navegador ya volteó `checked` antes de disparar "change" — se
  // simula aquí para reproducir ese orden.
  input.checked = false;
  fire(input, "change");

  const registro = registroDe(SLOT, hoyISO());
  assertEq(registro.hecho, false);
  assertEq(registro.pesoKg, 40);
});

test("la palomita usa el nombre del ejercicio en su aria-label", () => {
  limpiar();
  const li = document.createElement("li");
  const input = montarPalomita(li, EJERCICIO, "Sentadilla", crearAviso());
  assertEq(input.getAttribute("aria-label"), "Marcar Sentadilla como completado");
});

test("un guardado fallido muestra el aviso y no deja el ejercicio como hecho", () => {
  limpiar();
  const li = document.createElement("li");
  const aviso = crearAviso();
  const input = montarPalomita(li, EJERCICIO, "Sentadilla", aviso);
  assertEq(aviso.hidden, true);

  const original = localStorage.setItem;
  localStorage.setItem = () => {
    throw new DOMException("cuota llena", "QuotaExceededError");
  };
  try {
    input.checked = true; // el toque del usuario, ya reflejado por el navegador
    fire(input, "change");
  } finally {
    localStorage.setItem = original;
  }

  assertEq(aviso.hidden, false);
  assertEq(input.checked, false);
  assertEq(li.classList.contains("done"), false);
  assertEq(registroDe(SLOT, hoyISO()), null);
});

// --- parseRestSeconds ---

test("parseRestSeconds toma el extremo alto de un rango", () => {
  assertEq(parseRestSeconds("30–45 seg"), 45);
});

test('parseRestSeconds no da duración para "Sin descanso"', () => {
  assertEq(parseRestSeconds("Sin descanso"), null);
});

test("parseRestSeconds lee el número aunque haya una aclaración entre paréntesis", () => {
  assertEq(parseRestSeconds("10 seg (entre intervalos)"), 10);
});

test("parseRestSeconds convierte minutos a segundos", () => {
  assertEq(parseRestSeconds("hasta 1 min continuo"), 60);
});

// --- montarTemporizador: la etiqueta original, no mm:ss, en reposo ---

test("el temporizador en reposo muestra la etiqueta original, no mm:ss", () => {
  const li = document.createElement("li");
  montarTemporizador(li, parseRestSeconds("30–45 seg"), "30–45 seg");
  const n = buscar(li, (el) => el.className === "n");
  assertEq(n.textContent, "30–45 seg");
});

test('sin duración numérica, se dibuja un recuadro estático sin botón para "Sin descanso"', () => {
  const li = document.createElement("li");
  montarTemporizador(li, parseRestSeconds("Sin descanso"), "Sin descanso");
  const boton = buscar(li, (el) => el.tagName === "BUTTON");
  assertEq(boton, null);
  const estatico = buscar(li, (el) => el.className && el.className.includes("plate--static"));
  assertEq(estatico !== null, true);
  const n = buscar(li, (el) => el.className === "n");
  assertEq(n.textContent, "Sin descanso");
});
