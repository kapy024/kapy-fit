// Tests for the capture layer: peso/series/reps persistence, the done
// checkbox, and parseRestSeconds. Runs against the real DOM in the
// browser (tests.html) — `buscar`/`fire` below only walk `.children` and
// dispatch a plain Event, both of which real elements support too, so
// nothing here is Node-only.
import { test, assertEq } from "./pruebas.js";
import {
  montarCampos, montarPalomita, montarTemporizador, montarHistorial,
  parseRestSeconds, crearAviso, contarCompletados, reiniciarCompletadosDeHoy
} from "./registro.js";
import {
  guardarRegistro, registroDe, hoyISO,
  ultimoReinicio, LLAVE_REGISTROS, LLAVE_ULTIMO_RESET
} from "./almacen.js";

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
  localStorage.removeItem(LLAVE_ULTIMO_RESET);
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

// --- montarPalomita: avisa al contador de progreso del bloque ---

test("marcar y desmarcar la palomita llaman a alCambiar, para refrescar el contador sin repintar todo", () => {
  limpiar();
  const li = document.createElement("li");
  let llamadas = 0;
  const input = montarPalomita(li, EJERCICIO, "Sentadilla", crearAviso(), () => { llamadas++; });

  input.checked = true;
  fire(input, "change");
  assertEq(llamadas, 1);

  input.checked = false;
  fire(input, "change");
  assertEq(llamadas, 2);
});

// --- contarCompletados: el "N / M completados" de la cabecera del día ---

const BLOQUE_PRUEBA = [
  { slot: "diaX:base:ej-a", slug: "ej-a" },
  { slot: "diaX:base:ej-b", slug: "ej-b" },
  { slot: "diaX:base:ej-c", slug: "ej-c" }
];

function reg(hecho, extra) {
  return { fecha: hoyISO(), slug: "x", pesoKg: null, series: null, reps: null, hecho, ...extra };
}

test("contarCompletados cuenta lo marcado hecho hoy sobre el total del bloque", () => {
  limpiar();
  guardarRegistro("diaX:base:ej-a", reg(true));
  guardarRegistro("diaX:base:ej-b", reg(false));
  // ej-c: sin registro — cuenta como no hecho, no como error.
  assertEq(contarCompletados(BLOQUE_PRUEBA), { hechos: 1, total: 3 });
});

test("contarCompletados no cuenta un hecho de otro día", () => {
  limpiar();
  guardarRegistro("diaX:base:ej-a", reg(true, { fecha: "2020-01-01" }));
  assertEq(contarCompletados(BLOQUE_PRUEBA), { hechos: 0, total: 3 });
});

// --- reiniciarCompletadosDeHoy: el botón "Reiniciar" ---

test("reiniciarCompletadosDeHoy limpia hecho sin tocar peso, series ni reps", () => {
  limpiar();
  guardarRegistro("diaX:base:ej-a", reg(true, { pesoKg: 40, series: 4, reps: "10" }));
  guardarRegistro("diaX:base:ej-b", reg(true));
  reiniciarCompletadosDeHoy(BLOQUE_PRUEBA);
  const a = registroDe("diaX:base:ej-a", hoyISO());
  assertEq(a.hecho, false);
  assertEq(a.pesoKg, 40);
  assertEq(a.series, 4);
  assertEq(a.reps, "10");
  assertEq(registroDe("diaX:base:ej-b", hoyISO()).hecho, false);
});

test("reiniciarCompletadosDeHoy no toca el registro de otros días", () => {
  limpiar();
  guardarRegistro("diaX:base:ej-a", reg(true, { fecha: "2020-01-01", pesoKg: 20 }));
  guardarRegistro("diaX:base:ej-a", reg(true, { pesoKg: 25 }));
  reiniciarCompletadosDeHoy(BLOQUE_PRUEBA);
  const viejo = registroDe("diaX:base:ej-a", "2020-01-01");
  assertEq(viejo.hecho, true);
  assertEq(viejo.pesoKg, 20);
  assertEq(registroDe("diaX:base:ej-a", hoyISO()).hecho, false);
});

test("reiniciarCompletadosDeHoy no crea registros para ejercicios sin marcar", () => {
  limpiar();
  reiniciarCompletadosDeHoy(BLOQUE_PRUEBA);
  assertEq(registroDe("diaX:base:ej-a", hoyISO()), null);
});

test("reiniciarCompletadosDeHoy registra cuándo fue el último reinicio", () => {
  limpiar();
  assertEq(ultimoReinicio(), null);
  reiniciarCompletadosDeHoy(BLOQUE_PRUEBA);
  const guardado = ultimoReinicio();
  assertEq(typeof guardado, "string");
  assertEq(Number.isNaN(new Date(guardado).getTime()), false);
});

// --- montarHistorial ---

test("el contador de Historial refleja historial(slug) completo, no solo este renglón", () => {
  limpiar();
  guardarRegistro(SLOT, reg(true, { slug: "sentadilla", pesoKg: 30 }));
  guardarRegistro("dia3:base:sentadilla#2", reg(true, { slug: "sentadilla", pesoKg: 35, fecha: "2026-08-02" }));
  const contenedor = document.createElement("div");
  montarHistorial(contenedor, EJERCICIO, "kg");
  const hc = buscar(contenedor, (el) => el.className === "hc");
  assertEq(hc.textContent, "(2)");
});

test("sin registros, el panel dice que aún no hay nada guardado", () => {
  limpiar();
  const contenedor = document.createElement("div");
  montarHistorial(contenedor, EJERCICIO, "kg");
  const toggle = buscar(contenedor, (el) => el.className === "hist-toggle");
  fire(toggle, "click");
  const vacio = buscar(contenedor, (el) => el.className === "hist-empty");
  assertEq(vacio !== null, true);
});

test("un ejercicio con dos renglones etiqueta cada fila del historial con su origen", () => {
  limpiar();
  guardarRegistro("dia1:v1:press-militar-barra", reg(true, { slug: "press-militar-barra", pesoKg: 20, fecha: "2026-08-01" }));
  guardarRegistro("dia1:v1:press-militar-barra#2", reg(true, { slug: "press-militar-barra", pesoKg: 30, fecha: "2026-08-01" }));
  const contenedor = document.createElement("div");
  montarHistorial(contenedor, { slot: "dia1:v1:press-militar-barra", slug: "press-militar-barra" }, "kg");
  const toggle = buscar(contenedor, (el) => el.className === "hist-toggle");
  fire(toggle, "click");
  const filas = [...contenedor.querySelectorAll(".hrow .hv")].map((el) => el.textContent);
  assertEq(filas.length, 2);
  assertEq(filas.every((t) => t.includes("Brazo 1")), true);
});

test("un ejercicio con un solo renglón no le agrega etiqueta de origen a sus filas", () => {
  limpiar();
  guardarRegistro(SLOT, reg(true, { slug: "sentadilla", pesoKg: 30 }));
  const contenedor = document.createElement("div");
  montarHistorial(contenedor, EJERCICIO, "kg");
  const toggle = buscar(contenedor, (el) => el.className === "hist-toggle");
  fire(toggle, "click");
  const fila = buscar(contenedor, (el) => el.className === "hv");
  assertEq(fila.textContent, "30 kg");
});
