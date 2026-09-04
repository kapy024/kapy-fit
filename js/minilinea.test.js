// Tests for the history-row sparkline. Runs against the real DOM (see
// registro.test.js's own header for why that's safe here too).
import { test, assertEq } from "./pruebas.js";
import { datosMinilinea, tendencia, etiquetaTendencia, montarMinilinea } from "./minilinea.js";
import { guardarRegistro, LLAVE_REGISTROS, LLAVE_COLA, LLAVE_MARCAS } from "./almacen.js";

const SLUG = "prueba-minilinea";

function limpiar() {
  localStorage.removeItem(LLAVE_REGISTROS);
  localStorage.removeItem(LLAVE_COLA);
  localStorage.removeItem(LLAVE_MARCAS);
}

function reg(fecha, pesoKg) {
  return { fecha, slug: SLUG, pesoKg, series: null, reps: null, hecho: true };
}

// --- datosMinilinea ---

test("datosMinilinea usa las últimas 8 sesiones y no más", () => {
  limpiar();
  for (let i = 1; i <= 10; i++) {
    const dia = String(i).padStart(2, "0");
    guardarRegistro(`dia1:base:${SLUG}#${i}`, reg(`2026-01-${dia}`, 20 + i));
  }
  const { puntos, suficientes } = datosMinilinea(SLUG);
  assertEq(puntos.length, 8);
  assertEq(puntos.map((p) => p.fecha), [
    "2026-01-03", "2026-01-04", "2026-01-05", "2026-01-06",
    "2026-01-07", "2026-01-08", "2026-01-09", "2026-01-10"
  ]);
  assertEq(suficientes, true);
  limpiar();
});

test("con menos de 2 registros, suficientes es false", () => {
  limpiar();
  assertEq(datosMinilinea(SLUG).suficientes, false);
  guardarRegistro("dia1:base:" + SLUG, reg("2026-01-01", 20));
  assertEq(datosMinilinea(SLUG).suficientes, false);
  guardarRegistro("dia1:base:" + SLUG + "#2", reg("2026-01-08", 22));
  assertEq(datosMinilinea(SLUG).suficientes, true);
  limpiar();
});

// --- tendencia / etiquetaTendencia ---

test("tendencia detecta subiendo, bajando y estable", () => {
  assertEq(tendencia([{ valor: 70 }, { valor: 75 }]).direccion, "subiendo");
  assertEq(tendencia([{ valor: 75 }, { valor: 70 }]).direccion, "bajando");
  assertEq(tendencia([{ valor: 70 }, { valor: 70.1 }]).direccion, "estable");
});

test("etiquetaTendencia resume la tendencia en palabras con la unidad activa", () => {
  const t = tendencia([{ valor: 70 }, { valor: 75 }]);
  assertEq(etiquetaTendencia(t, "kg"), "Tendencia al alza: de 70 kg a 75 kg");
});

// --- montarMinilinea ---

test("con menos de 2 registros no dibuja nada, sin dejar hueco", () => {
  limpiar();
  guardarRegistro("dia1:base:" + SLUG, reg("2026-01-01", 20));
  const contenedor = document.createElement("div");
  const resultado = montarMinilinea(contenedor, SLUG, "kg");
  assertEq(resultado, null);
  assertEq(contenedor.children.length, 0);
  limpiar();
});

test("con 2 o más registros dibuja un SVG inline, sin depender de Chart.js", () => {
  limpiar();
  guardarRegistro("dia1:base:" + SLUG, reg("2026-01-01", 20));
  guardarRegistro("dia1:base:" + SLUG + "#2", reg("2026-01-08", 24));
  const contenedor = document.createElement("div");
  // Síncrona a propósito: a diferencia de montarGraficaEjercicio/
  // montarGraficaPeso, no hay ningún `await` aquí — si esto dibujara algo
  // vía Chart.js necesitaría ser async, y no lo es.
  const resultado = montarMinilinea(contenedor, SLUG, "kg");
  assertEq(resultado.tagName, "svg");
  assertEq(resultado.namespaceURI, "http://www.w3.org/2000/svg");
  assertEq(contenedor.querySelector("svg") !== null, true);
  assertEq(contenedor.querySelector("canvas"), null);
  assertEq(resultado.getAttribute("role"), "img");
  assertEq(resultado.getAttribute("aria-label").indexOf("Tendencia") !== -1, true);
  limpiar();
});

test("el aria-label reporta la unidad activa (lb)", () => {
  limpiar();
  guardarRegistro("dia1:base:" + SLUG, reg("2026-01-01", 20));
  guardarRegistro("dia1:base:" + SLUG + "#2", reg("2026-01-08", 24));
  const contenedor = document.createElement("div");
  const resultado = montarMinilinea(contenedor, SLUG, "lb");
  assertEq(resultado.getAttribute("aria-label").indexOf("lb") !== -1, true);
  limpiar();
});
