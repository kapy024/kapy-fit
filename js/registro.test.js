// Tests for the capture layer: peso/series/reps persistence, the done
// checkbox, and parseRestSeconds. Runs against the real DOM in the
// browser (tests.html) — `buscar`/`fire` below only walk `.children` and
// dispatch a plain Event, both of which real elements support too, so
// nothing here is Node-only.
import { test, assertEq } from "./pruebas.js";
import { montarCampos, montarPalomita, montarTemporizador, parseRestSeconds } from "./registro.js";
import { guardarRegistro, registroDe, hoyISO, LLAVE_REGISTROS } from "./almacen.js";

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

function aviso(contenedor) {
  return buscar(contenedor, (el) => el.className && el.className.includes("save-warn"));
}

function fire(el, tipo) {
  el.dispatchEvent(new Event(tipo));
}

const EJERCICIO = { slug: "sentadilla", series: "4", reps: "10" };

// --- montarCampos: peso/series/reps ---

test("un peso capturado en libras se persiste en kilos", () => {
  limpiar();
  const contenedor = document.createElement("div");
  montarCampos(contenedor, "sentadilla", EJERCICIO, "lb");
  const inputPeso = inputConClase(contenedor, "f-w");
  inputPeso.value = "100";
  fire(inputPeso, "change");
  assertEq(registroDe("sentadilla", hoyISO()).pesoKg, 45.4);
});

test("el peso se persiste en change, no en cada tecla (input)", () => {
  limpiar();
  const contenedor = document.createElement("div");
  montarCampos(contenedor, "sentadilla", EJERCICIO, "kg");
  const inputPeso = inputConClase(contenedor, "f-w");
  inputPeso.value = "50";
  fire(inputPeso, "input");
  assertEq(registroDe("sentadilla", hoyISO()), null);
  fire(inputPeso, "change");
  assertEq(registroDe("sentadilla", hoyISO()).pesoKg, 50);
});

// --- montarPalomita ---

test("desmarcar la palomita deja hecho:false sin borrar el peso", () => {
  limpiar();
  guardarRegistro("sentadilla", {
    fecha: hoyISO(), pesoKg: 40, series: "4", reps: "10", hecho: true
  });
  const li = document.createElement("li");
  const input = montarPalomita(li, "sentadilla");
  assertEq(input.checked, true);

  // El navegador ya volteó `checked` antes de disparar "change" — se
  // simula aquí para reproducir ese orden.
  input.checked = false;
  fire(input, "change");

  const registro = registroDe("sentadilla", hoyISO());
  assertEq(registro.hecho, false);
  assertEq(registro.pesoKg, 40);
});

test("un guardado fallido muestra el aviso y no deja el ejercicio como hecho", () => {
  limpiar();
  const li = document.createElement("li");
  const input = montarPalomita(li, "sentadilla");
  const avisoEl = aviso(li);
  assertEq(avisoEl.hidden, true);

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

  assertEq(avisoEl.hidden, false);
  assertEq(input.checked, false);
  assertEq(li.classList.contains("done"), false);
  assertEq(registroDe("sentadilla", hoyISO()), null);
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
