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

// I1 (revisión final de rama): dos pesos en la misma semana ISO no deben
// contarse como dos semanas — antes, promedioMovil() corría directo sobre
// los registros crudos, así que "4 semanas" en realidad contaba 4
// REGISTROS, y una semana con dos pesadas encogía la ventana real a menos
// de 4 semanas de calendario sin que nada lo delatara. Semanas 30, 30, 31,
// 32, 33 (2026-07-20/21/27, 2026-08-03/10) — la primera semana lleva dos
// pesadas a propósito.
test("dos pesos en la misma semana ISO se promedian juntos: la ventana de 4 sigue siendo 4 semanas, no 4 registros", () => {
  limpiar();
  guardarPeso("2026-07-20", 78); // semana 30
  guardarPeso("2026-07-21", 80); // semana 30, misma semana que la anterior
  guardarPeso("2026-07-27", 79); // semana 31
  guardarPeso("2026-08-03", 81); // semana 32
  guardarPeso("2026-08-10", 83); // semana 33
  const datos = datosDePeso("kg", 4);

  // 5 registros, pero solo 4 semanas distintas: promedioMovil() debe correr
  // sobre las semanas, no sobre los registros crudos.
  assertEq(datos.promedio.length, 4, "cinco registros, pero cuatro semanas distintas");
  // Semana 30 = (78+80)/2 = 79; semana 31 = 79; semana 32 = 81; semana 33 = 83.
  // Promedio de las últimas 4 semanas = (79+79+81+83)/4 = 80.5 — muy distinto
  // del 79.5 que daría promediar los últimos 4 REGISTROS crudos (78,80,79,81).
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

// I1 (revisión final de rama), a nivel de tabla: con dos pesos en la misma
// semana hay más filas (5, una por registro) que puntos de promedio (4, uno
// por semana) — indexarlos en paralelo (filas[i] <-> promedio[i], como
// hacía el código antes de este arreglo) desalinearía todo a partir de la
// semana duplicada. La columna "Promedio" debe encontrar el valor por
// semana ISO de cada fila, no por posición.
test("la tabla de peso muestra el promedio semanal correcto aunque haya más filas que semanas", async () => {
  limpiar();
  guardarPeso("2026-07-20", 78); // semana 30
  guardarPeso("2026-07-21", 80); // semana 30, misma semana
  guardarPeso("2026-07-27", 79); // semana 31
  guardarPeso("2026-08-03", 81); // semana 32
  guardarPeso("2026-08-10", 83); // semana 33
  const contenedor = document.createElement("div");
  await montarGraficaPeso(contenedor, "kg");
  const [, botonTodo] = contenedor.querySelectorAll(".vista-toggle .chip-btn");
  botonTodo.click();
  await esperarMicrotareas();

  const filas = contenedor.querySelectorAll("table tbody tr");
  assertEq(filas.length, 5, "una fila por registro crudo, no una por semana");
  // Las primeras 3 semanas (30, 31, 32) no completan la ventana de 4 —
  // "—" en las primeras 4 filas (las dos de la semana 30, la de la 31 y
  // la de la 32), todas anteriores a que la ventana se llene.
  assertEq(filas[0].children[2].textContent, "—");
  assertEq(filas[1].children[2].textContent, "—");
  assertEq(filas[2].children[2].textContent, "—");
  assertEq(filas[3].children[2].textContent, "—");
  // La fila de la semana 33 (08-10, la 5ª) sí cae dentro de la ventana ya
  // llena: semanas 30(79) + 31(79) + 32(81) + 33(83) = 80.5, y esa misma
  // cifra —no 79.5, el promedio de los últimos 4 REGISTROS crudos— es lo
  // que debe leerse en pantalla.
  assertEq(filas[4].children[2].textContent, "80.5");
  limpiar();
});
