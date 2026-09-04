import { test, assertEq, assertCerca } from "./pruebas.js";
import { datosDePeso, montarGraficaPeso } from "./grafica-peso.js";
import { guardarPeso } from "./peso-corporal.js";
import { LLAVE_PESOS, LLAVE_COLA, LLAVE_MARCAS_PESO } from "./almacen.js";

function limpiar() {
  localStorage.removeItem(LLAVE_PESOS);
  localStorage.removeItem(LLAVE_COLA);
  localStorage.removeItem(LLAVE_MARCAS_PESO);
}

// --- datosDePeso ---

test("los puntos salen en la unidad activa", () => {
  limpiar();
  guardarPeso("2026-08-01", 80);
  guardarPeso("2026-08-08", 81);
  const datos = datosDePeso("lb", 4);
  assertEq(datos.puntos, [
    { fecha: "2026-08-01", valor: 176.4 },
    { fecha: "2026-08-08", valor: 178.6 }
  ]);
  limpiar();
});

test("el promedio móvil de 4 semanas usa promedioMovil de metricas.js", () => {
  limpiar();
  guardarPeso("2026-08-01", 80);
  guardarPeso("2026-08-08", 81);
  guardarPeso("2026-08-15", 79);
  guardarPeso("2026-08-22", 82);
  const datos = datosDePeso("kg", 4);
  assertEq(datos.promedio.slice(0, 3).every((p) => p.valor === null), true);
  assertCerca(datos.promedio[3].valor, 80.5, 0.01);
  limpiar();
});

test("con menos de 2 registros suficientes es false", () => {
  limpiar();
  assertEq(datosDePeso("kg", 4).suficientes, false);
  guardarPeso("2026-08-01", 80);
  assertEq(datosDePeso("kg", 4).suficientes, false);
  guardarPeso("2026-08-08", 81);
  assertEq(datosDePeso("kg", 4).suficientes, true);
  limpiar();
});

test("el promedio no aparece hasta que hay 4 puntos", () => {
  limpiar();
  guardarPeso("2026-08-01", 80);
  guardarPeso("2026-08-08", 81);
  guardarPeso("2026-08-15", 79);
  let datos = datosDePeso("kg", 4);
  assertEq(datos.promedio.every((p) => p.valor === null), true);
  guardarPeso("2026-08-22", 82);
  datos = datosDePeso("kg", 4);
  assertEq(datos.promedio[3].valor !== null, true);
  limpiar();
});

test("una historia vacía no truena", () => {
  limpiar();
  assertEq(datosDePeso("kg", 4), { puntos: [], promedio: [], suficientes: false });
});

// --- montarGraficaPeso ---

test("montarGraficaPeso con menos de 2 registros muestra cuántos faltan", async () => {
  limpiar();
  guardarPeso("2026-08-01", 80);
  const contenedor = document.createElement("div");
  await montarGraficaPeso(contenedor, "kg");
  assertEq(contenedor.textContent.indexOf("Falta") !== -1, true);
  assertEq(contenedor.querySelector("canvas"), null);
  limpiar();
});

test("montarGraficaPeso con datos suficientes dibuja la captura, el toggle y la tabla, sin tronar", async () => {
  limpiar();
  guardarPeso("2026-08-01", 80);
  guardarPeso("2026-08-08", 81);
  guardarPeso("2026-08-15", 79);
  guardarPeso("2026-08-22", 82);
  const contenedor = document.createElement("div");
  let lanzo = false;
  try {
    await montarGraficaPeso(contenedor, "kg");
  } catch (_e) {
    lanzo = true;
  }
  assertEq(lanzo, false);
  assertEq(contenedor.querySelector(".peso-captura input") !== null, true);
  assertEq(contenedor.querySelectorAll(".vista-toggle .chip-btn").length, 2);
  assertEq(contenedor.querySelector("table") !== null, true);
  limpiar();
});

function esperarMicrotareas() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

test("guardar el peso desde el campo de captura lo agrega sin recargar", async () => {
  limpiar();
  guardarPeso("2026-08-01", 80);
  guardarPeso("2026-08-08", 81);
  const contenedor = document.createElement("div");
  await montarGraficaPeso(contenedor, "kg");
  const input = contenedor.querySelector(".peso-captura input");
  const boton = contenedor.querySelector(".peso-captura button");
  input.value = "82";
  boton.click();
  await esperarMicrotareas();
  // El campo se limpia solo tras un guardado exitoso — señal de que
  // guardarPeso() sí ocurrió y no quedó un aviso de error en pantalla.
  assertEq(input.value, "");
  assertEq(contenedor.querySelector(".save-warn").hidden, true);
  // "Todo el histórico", no "Último mes": el punto recién guardado es de
  // hoy, y el más antiguo (2026-08-01) puede caer fuera de una ventana de
  // 30 días según la fecha real — la vista completa es la que no depende
  // de cuándo se corra la prueba.
  const [, botonTodo] = contenedor.querySelectorAll(".vista-toggle .chip-btn");
  botonTodo.click();
  await esperarMicrotareas();
  const filas = contenedor.querySelectorAll("table tbody tr");
  assertEq(filas.length, 3);
  limpiar();
});
