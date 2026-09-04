import { test, assertEq } from "./pruebas.js";
import { datosDeEjercicio, datosPorSlot, montarGraficaEjercicio } from "./grafica-ejercicio.js";
import { guardarRegistro, LLAVE_REGISTROS, LLAVE_COLA, LLAVE_MARCAS } from "./almacen.js";

const SLUG = "prueba-grafica-ejercicio";
// Dos slots que comparten el mismo slug — la situación real de día 1 (press
// militar ligero y pesado) que esta suite reproduce para I2 de la revisión
// final: la gráfica del ejercicio puede seguir juntando slots, pero nunca
// mezclarlos en una sola línea.
const SLOT_PESADO = "dia1:v2:" + SLUG;
const SLOT_LIGERO = "dia1:v1:" + SLUG;

function limpiar() {
  localStorage.removeItem(LLAVE_REGISTROS);
  localStorage.removeItem(LLAVE_COLA);
  localStorage.removeItem(LLAVE_MARCAS);
}

function reg(fecha, extra) {
  return { fecha, slug: SLUG, pesoKg: null, series: null, reps: null, hecho: true, ...extra };
}

// --- datosDeEjercicio ---

test("datosDeEjercicio junta los registros de todos los slots del mismo slug", () => {
  limpiar();
  guardarRegistro("dia1:base:" + SLUG, reg("2026-08-01", { pesoKg: 20, series: 4, reps: "10" }));
  guardarRegistro("dia3:base:" + SLUG, reg("2026-08-08", { pesoKg: 22, series: 4, reps: "10" }));
  const datos = datosDeEjercicio(SLUG, "kg");
  assertEq(datos.peso.map((p) => p.fecha), ["2026-08-01", "2026-08-08"]);
  limpiar();
});

test("convierte el peso a la unidad activa sin tocar lo guardado", () => {
  limpiar();
  guardarRegistro("dia1:base:" + SLUG, reg("2026-08-01", { pesoKg: 100, series: 4, reps: "10" }));
  guardarRegistro("dia1:base:" + SLUG, reg("2026-08-08", { pesoKg: 100, series: 4, reps: "10" }));
  const datos = datosDeEjercicio(SLUG, "lb");
  assertEq(datos.peso[0].valor, 220.5);
  assertEq(datosDeEjercicio(SLUG, "kg").peso[0].valor, 100);
  limpiar();
});

test("el volumen se calcula siempre en kg y no cambia con el selector", () => {
  limpiar();
  guardarRegistro("dia1:base:" + SLUG, reg("2026-08-01", { pesoKg: 20, series: 4, reps: "10" }));
  guardarRegistro("dia1:base:" + SLUG, reg("2026-08-08", { pesoKg: 20, series: 4, reps: "10" }));
  const enKg = datosDeEjercicio(SLUG, "kg");
  const enLb = datosDeEjercicio(SLUG, "lb");
  assertEq(enKg.volumen, enLb.volumen);
  assertEq(enKg.volumen[0].valor, 800);
  limpiar();
});

test("suficientes es false con menos de 2 puntos de peso", () => {
  limpiar();
  guardarRegistro("dia1:base:" + SLUG, reg("2026-08-01", { pesoKg: 20, series: 4, reps: "10" }));
  assertEq(datosDeEjercicio(SLUG, "kg").suficientes, false);
  guardarRegistro("dia1:base:" + SLUG, reg("2026-08-08", { pesoKg: 22, series: 4, reps: "10" }));
  assertEq(datosDeEjercicio(SLUG, "kg").suficientes, true);
  limpiar();
});

test("una serie con reps no numéricas conserva el peso pero no calcula volumen", () => {
  limpiar();
  guardarRegistro("dia1:base:" + SLUG, reg("2026-08-01", { pesoKg: 20, series: 4, reps: "al fallo" }));
  guardarRegistro("dia1:base:" + SLUG, reg("2026-08-08", { pesoKg: 22, series: 4, reps: "sin número" }));
  const datos = datosDeEjercicio(SLUG, "kg");
  assertEq(datos.peso.length, 2);
  assertEq(datos.volumen.length, 0);
  assertEq(datos.suficientes, true);
  limpiar();
});

test("una serie vacía no truena", () => {
  limpiar();
  const datos = datosDeEjercicio(SLUG, "kg");
  assertEq(datos, { peso: [], volumen: [], suficientes: false });
});

// --- datosPorSlot (I2, revisión final de rama) ---

// Reproduce el defecto exacto del hallazgo: 40 -> 50 kg en el slot pesado,
// más un registro de 20 kg del ligero el mismo día. Antes de este arreglo,
// datosDeEjercicio() los mezclaba en UNA sola serie ordenada por fecha —
// dos puntos en la misma fecha, y la tendencia se leía "a la baja: de 40 kg
// a 20 kg", justo lo opuesto del progreso real en el slot pesado.
test("datosPorSlot separa las series por slot, nunca las mezcla en una sola línea", () => {
  limpiar();
  guardarRegistro(SLOT_PESADO, reg("2026-08-01", { pesoKg: 40, series: 4, reps: "10" }));
  guardarRegistro(SLOT_PESADO, reg("2026-08-08", { pesoKg: 50, series: 4, reps: "10" }));
  guardarRegistro(SLOT_LIGERO, reg("2026-08-08", { pesoKg: 20, series: 1, reps: "30" }));

  const grupos = datosPorSlot(SLUG, "kg");
  assertEq(grupos.length, 2, "dos slots distintos, dos grupos — nunca uno solo");

  const pesado = grupos.find((g) => g.slot === SLOT_PESADO);
  const ligero = grupos.find((g) => g.slot === SLOT_LIGERO);
  assertEq(pesado.peso.map((p) => p.valor), [40, 50], "el slot pesado nunca ve el 20 del ligero");
  assertEq(ligero.peso.map((p) => p.valor), [20], "el slot ligero nunca ve los 40/50 del pesado");
  limpiar();
});

test("datosDeEjercicio() sigue combinando todos los slots para la tabla/el umbral, aunque la gráfica ya no los mezcle", () => {
  limpiar();
  guardarRegistro(SLOT_PESADO, reg("2026-08-01", { pesoKg: 40, series: 4, reps: "10" }));
  guardarRegistro(SLOT_PESADO, reg("2026-08-08", { pesoKg: 50, series: 4, reps: "10" }));
  guardarRegistro(SLOT_LIGERO, reg("2026-08-08", { pesoKg: 20, series: 1, reps: "30" }));

  const datos = datosDeEjercicio(SLUG, "kg");
  assertEq(datos.peso.length, 3, "las tres series siguen contando para el umbral de \"suficientes\"");
  assertEq(datos.suficientes, true);
  limpiar();
});

test("montarGraficaEjercicio con dos slots del mismo slug distingue cada uno en la tabla (columna Variante)", async () => {
  limpiar();
  guardarRegistro(SLOT_PESADO, reg("2026-08-01", { pesoKg: 40, series: 4, reps: "10" }));
  guardarRegistro(SLOT_PESADO, reg("2026-08-08", { pesoKg: 50, series: 4, reps: "10" }));
  guardarRegistro(SLOT_LIGERO, reg("2026-08-08", { pesoKg: 20, series: 1, reps: "30" }));

  const contenedor = document.createElement("div");
  await montarGraficaEjercicio(contenedor, SLUG, "kg");

  const tablaPeso = contenedor.querySelectorAll("table")[0];
  const encabezados = [...tablaPeso.querySelectorAll("thead th")].map((th) => th.textContent);
  assertEq(encabezados, ["Fecha", "Peso (kg)", "Variante"], "con más de un slot, la tabla identifica cada fila");
  assertEq(tablaPeso.querySelectorAll("tbody tr").length, 3, "una fila por registro, de ambos slots");
  limpiar();
});

test("montarGraficaEjercicio con un solo slot no muestra columna Variante (comportamiento sin cambios)", async () => {
  limpiar();
  guardarRegistro("dia1:base:" + SLUG, reg("2026-08-01", { pesoKg: 20, series: 4, reps: "10" }));
  guardarRegistro("dia1:base:" + SLUG, reg("2026-08-08", { pesoKg: 22, series: 4, reps: "10" }));

  const contenedor = document.createElement("div");
  await montarGraficaEjercicio(contenedor, SLUG, "kg");

  const tablaPeso = contenedor.querySelectorAll("table")[0];
  const encabezados = [...tablaPeso.querySelectorAll("thead th")].map((th) => th.textContent);
  assertEq(encabezados, ["Fecha", "Peso (kg)"]);
  limpiar();
});

// --- montarGraficaEjercicio ---

test("montarGraficaEjercicio con menos de 2 registros muestra cuántos faltan, sin gráfica", async () => {
  limpiar();
  guardarRegistro("dia1:base:" + SLUG, reg("2026-08-01", { pesoKg: 20, series: 4, reps: "10" }));
  const contenedor = document.createElement("div");
  await montarGraficaEjercicio(contenedor, SLUG, "kg");
  assertEq(contenedor.querySelector(".grafica-ejercicio"), null);
  assertEq(contenedor.textContent.indexOf("Falta") !== -1, true);
  limpiar();
});

test("montarGraficaEjercicio con volumen insuficiente dibuja solo el bloque de peso, sin tronar", async () => {
  limpiar();
  guardarRegistro("dia1:base:" + SLUG, reg("2026-08-01", { pesoKg: 20, series: 4, reps: "al fallo" }));
  guardarRegistro("dia1:base:" + SLUG, reg("2026-08-08", { pesoKg: 22, series: 4, reps: "sin número" }));
  const contenedor = document.createElement("div");
  let lanzo = false;
  try {
    await montarGraficaEjercicio(contenedor, SLUG, "kg");
  } catch (_e) {
    lanzo = true;
  }
  assertEq(lanzo, false);
  assertEq(contenedor.querySelectorAll(".grafica-bloque").length, 1);
  limpiar();
});

test("montarGraficaEjercicio con datos completos dibuja los dos bloques y sus tablas", async () => {
  limpiar();
  guardarRegistro("dia1:base:" + SLUG, reg("2026-08-01", { pesoKg: 20, series: 4, reps: "10" }));
  guardarRegistro("dia1:base:" + SLUG, reg("2026-08-08", { pesoKg: 22, series: 4, reps: "10" }));
  const contenedor = document.createElement("div");
  await montarGraficaEjercicio(contenedor, SLUG, "kg");
  assertEq(contenedor.querySelectorAll(".grafica-bloque").length, 2);
  assertEq(contenedor.querySelectorAll("table").length, 2);
  limpiar();
});
