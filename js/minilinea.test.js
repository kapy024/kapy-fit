// Tests for the history-row sparkline. Runs against the real DOM (see
// registro.test.js's own header for why that's safe here too).
import { test, assertEq } from "./pruebas.js";
import { datosMinilinea, tendencia, etiquetaTendencia, montarMinilinea } from "./minilinea.js";
import { guardarRegistro, LLAVE_REGISTROS, LLAVE_COLA, LLAVE_MARCAS } from "./almacen.js";

const SLUG = "prueba-minilinea";
const SLOT = "dia1:base:" + SLUG;
// Un segundo slot que comparte el mismo slug — la situación real que día 1
// ya usa dos veces (press militar ligero y pesado) y que este archivo
// existe en parte para no romper de nuevo (I2 de la revisión final).
const SLOT_LIGERO = "dia1:accesorio:" + SLUG;

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
    guardarRegistro(SLOT, reg(`2026-01-${dia}`, 20 + i));
  }
  const { puntos, suficientes } = datosMinilinea(SLOT);
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
  assertEq(datosMinilinea(SLOT).suficientes, false);
  guardarRegistro(SLOT, reg("2026-01-01", 20));
  assertEq(datosMinilinea(SLOT).suficientes, false);
  guardarRegistro(SLOT, reg("2026-01-08", 22));
  assertEq(datosMinilinea(SLOT).suficientes, true);
  limpiar();
});

// I2 (revisión final de rama): dos slots comparten el mismo slug (como el
// press militar ligero/pesado de día 1) — la mini-línea de UNA fila debe
// hablar solo de SU slot, nunca mezclar el otro. Reproduce el defecto
// exacto: 40 -> 50 kg en el slot pesado, más un registro de 20 kg del
// ligero el mismo día — antes de este arreglo, datosMinilinea(slug) juntaba
// los tres puntos y la tendencia se leía "a la baja: de 40 kg a 20 kg",
// justo lo opuesto de lo que pasó en el slot pesado.
test("datosMinilinea(slot) no se mezcla con otro slot que comparte el mismo slug", () => {
  limpiar();
  guardarRegistro(SLOT, reg("2026-01-01", 40));
  guardarRegistro(SLOT, reg("2026-01-08", 50));
  guardarRegistro(SLOT_LIGERO, reg("2026-01-08", 20)); // mismo día, otro slot, mucho más liviano

  const datos = datosMinilinea(SLOT);
  assertEq(datos.puntos.map((p) => p.valor), [40, 50], "solo los dos puntos del slot pesado, nunca el del ligero");
  assertEq(tendencia(datos.puntos).direccion, "subiendo", "40 -> 50 es una subida real, no debe leerse como bajada");
  limpiar();
});

test("montarMinilinea(slot) refleja solo su propio slot en el aria-label, no el de otro slot del mismo slug", () => {
  limpiar();
  guardarRegistro(SLOT, reg("2026-01-01", 40));
  guardarRegistro(SLOT, reg("2026-01-08", 50));
  guardarRegistro(SLOT_LIGERO, reg("2026-01-08", 20));

  const contenedor = document.createElement("div");
  const svg = montarMinilinea(contenedor, SLOT, "kg");
  assertEq(
    svg.getAttribute("aria-label"),
    "Tendencia al alza: de 40 kg a 50 kg",
    "el slot ligero (20 kg) no debe filtrarse a la mini-línea del slot pesado"
  );
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
  guardarRegistro(SLOT, reg("2026-01-01", 20));
  const contenedor = document.createElement("div");
  const resultado = montarMinilinea(contenedor, SLOT, "kg");
  assertEq(resultado, null);
  assertEq(contenedor.children.length, 0);
  limpiar();
});

test("con 2 o más registros dibuja un SVG inline, sin depender de Chart.js", () => {
  limpiar();
  guardarRegistro(SLOT, reg("2026-01-01", 20));
  guardarRegistro(SLOT, reg("2026-01-08", 24));
  const contenedor = document.createElement("div");
  // Síncrona a propósito: a diferencia de montarGraficaEjercicio/
  // montarGraficaPeso, no hay ningún `await` aquí — si esto dibujara algo
  // vía Chart.js necesitaría ser async, y no lo es.
  const resultado = montarMinilinea(contenedor, SLOT, "kg");
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
  guardarRegistro(SLOT, reg("2026-01-01", 20));
  guardarRegistro(SLOT, reg("2026-01-08", 24));
  const contenedor = document.createElement("div");
  const resultado = montarMinilinea(contenedor, SLOT, "lb");
  assertEq(resultado.getAttribute("aria-label").indexOf("lb") !== -1, true);
  limpiar();
});
