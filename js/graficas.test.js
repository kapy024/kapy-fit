// Pruebas de graficas.js y tabla-datos.js. La carga de Chart.js se prueba
// contra un host que no existe (mismo patrón que db.test.js con
// supabase-js): un import() a un dominio inválido nunca llega a tocar la
// red de verdad (falla en la resolución DNS), así que esto no cuenta como
// "red real" — es el mismo punto de sustitución que ya se usa para el
// mismo problema en db.js.
import { test, assertEq } from "./pruebas.js";
import {
  cargarChart, disponible, paleta, _fijarUrlChartParaPruebas,
  registrarGrafica, destruirGrafica, detenerTodasLasGraficas, _contarGraficasActivasParaPruebas
} from "./graficas.js";
import { montarTabla } from "./tabla-datos.js";

// Doble mínimo de un Chart.js real: lo único que este registro le pide a
// una "gráfica" es un método destroy() — nunca se toca Chart.js de verdad
// aquí (nada de red), así que estas pruebas cubren la lógica del registro
// en sí misma, independiente de si Chart.js llegó a cargar.
function graficaFalsa() {
  let destruida = false;
  return { get destruida() { return destruida; }, destroy() { destruida = true; } };
}

test("cargarChart() no lanza y devuelve null cuando el import() falla", async () => {
  _fijarUrlChartParaPruebas("https://cdn-que-no-existe.invalid/chart.js");
  let lanzoSincrono = false;
  let promesa;
  try {
    promesa = cargarChart();
  } catch (_e) {
    lanzoSincrono = true;
  }
  assertEq(lanzoSincrono, false, "cargarChart() no debe lanzar de forma síncrona");

  let lanzoAsync = false;
  let resultado;
  try {
    resultado = await promesa;
  } catch (_e) {
    lanzoAsync = true;
  }
  assertEq(lanzoAsync, false, "cargarChart() no debe rechazar: debe resolver null");
  assertEq(resultado, null);

  _fijarUrlChartParaPruebas();
});

test("disponible() responde false cuando la carga falló", async () => {
  _fijarUrlChartParaPruebas("https://cdn-que-no-existe.invalid/chart.js");
  await cargarChart();
  assertEq(disponible(), false);
  _fijarUrlChartParaPruebas();
});

// --- registro de instancias vivas (I3, revisión final de rama) ---

test("registrarGrafica() cuenta la instancia; destruirGrafica() la destruye y la descuenta", () => {
  const antes = _contarGraficasActivasParaPruebas();
  const g = graficaFalsa();
  assertEq(registrarGrafica(g), g, "registrarGrafica devuelve la misma instancia, para encadenar");
  assertEq(_contarGraficasActivasParaPruebas(), antes + 1);

  destruirGrafica(g);
  assertEq(g.destruida, true, "destruirGrafica() debe llamar a destroy()");
  assertEq(_contarGraficasActivasParaPruebas(), antes, "y descontarla del registro");
});

test("destruirGrafica(null) no truena — el primer dibujar() de un componente no tiene nada que reemplazar", () => {
  let lanzo = false;
  try { destruirGrafica(null); destruirGrafica(undefined); } catch (_e) { lanzo = true; }
  assertEq(lanzo, false);
});

test("detenerTodasLasGraficas() destruye y descuenta TODAS las registradas, sin dejar ninguna atrás", () => {
  const antes = _contarGraficasActivasParaPruebas();
  const g1 = registrarGrafica(graficaFalsa());
  const g2 = registrarGrafica(graficaFalsa());
  const g3 = registrarGrafica(graficaFalsa());
  assertEq(_contarGraficasActivasParaPruebas(), antes + 3);

  detenerTodasLasGraficas();

  assertEq([g1, g2, g3].every((g) => g.destruida), true);
  assertEq(_contarGraficasActivasParaPruebas(), 0, "el registro global queda vacío, no solo descontado");
});

// El defecto exacto de I3: un componente que redibuja su propia gráfica en
// el mismo contenedor (grafica-peso.js's toggle Último mes/Todo el
// histórico, o cada peso nuevo guardado) debe destruir la instancia
// anterior antes de crear la siguiente — nunca simplemente innerHTML = ""
// sobre el canvas y dejar la instancia vieja viva. Simula exactamente ese
// patrón con dobles: 5 "redibujados" deben dejar 1 instancia activa, no 5.
test("un patrón de redibujado en el mismo componente (destruir la anterior antes de crear la siguiente) nunca acumula instancias", () => {
  const antes = _contarGraficasActivasParaPruebas();
  let actual = null;
  function redibujar() {
    destruirGrafica(actual); // lo que grafica-peso.js hace ahora al inicio de dibujar()
    actual = registrarGrafica(graficaFalsa());
  }
  for (let i = 0; i < 5; i++) redibujar();

  assertEq(_contarGraficasActivasParaPruebas(), antes + 1, "cinco redibujados, una sola instancia viva — no cinco");
  destruirGrafica(actual);
  assertEq(_contarGraficasActivasParaPruebas(), antes);
});

test("cargarChart() carga la librería real y disponible() pasa a true", async () => {
  const Chart = await cargarChart();
  assertEq(typeof Chart, "function");
  assertEq(disponible(), true);
});

// --- paleta() ---

function fijarTema(tema) {
  if (tema) document.documentElement.setAttribute("data-theme", tema);
  else document.documentElement.removeAttribute("data-theme");
}

test("paleta() devuelve los tres colores validados del modo claro", () => {
  fijarTema("light");
  const p = paleta();
  assertEq(p.serie1, "#2a78d6");
  assertEq(p.serie2, "#eb6834");
  assertEq(p.serie3, "#1baf7a");
  fijarTema(null);
});

test("paleta() devuelve los tres colores validados del modo oscuro", () => {
  fijarTema("dark");
  const p = paleta();
  assertEq(p.serie1, "#3987e5");
  assertEq(p.serie2, "#d95926");
  assertEq(p.serie3, "#199e70");
  fijarTema(null);
});

// --- montarTabla() ---

test("montarTabla produce un <caption>, encabezados scope=col y una fila por dato", () => {
  const contenedor = document.createElement("div");
  montarTabla(contenedor, {
    titulo: "Peso corporal",
    columnas: ["Fecha", "Kg"],
    filas: [["2026-09-01", 70], ["2026-09-08", 71.5]]
  });

  const tabla = contenedor.querySelector("table");
  assertEq(tabla.querySelector("caption").textContent, "Peso corporal");

  const encabezados = [...tabla.querySelectorAll("thead th")];
  assertEq(encabezados.map((th) => th.textContent), ["Fecha", "Kg"]);
  assertEq(encabezados.every((th) => th.getAttribute("scope") === "col"), true);

  const filas = [...tabla.querySelectorAll("tbody tr")];
  assertEq(filas.length, 2);
  assertEq([...filas[0].querySelectorAll("td")].map((td) => td.textContent), ["2026-09-01", "70"]);
  assertEq([...filas[1].querySelectorAll("td")].map((td) => td.textContent), ["2026-09-08", "71.5"]);
});

test("montarTabla con cero filas produce la tabla vacía, sin tronar", () => {
  const contenedor = document.createElement("div");
  montarTabla(contenedor, { titulo: "Vacía", columnas: ["Fecha"], filas: [] });
  assertEq(contenedor.querySelectorAll("tbody tr").length, 0);
});
