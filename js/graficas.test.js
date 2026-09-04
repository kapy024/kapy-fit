// Pruebas de graficas.js y tabla-datos.js. La carga de Chart.js se prueba
// contra un host que no existe (mismo patrón que db.test.js con
// supabase-js): un import() a un dominio inválido nunca llega a tocar la
// red de verdad (falla en la resolución DNS), así que esto no cuenta como
// "red real" — es el mismo punto de sustitución que ya se usa para el
// mismo problema en db.js.
import { test, assertEq } from "./pruebas.js";
import { cargarChart, disponible, paleta, _fijarUrlChartParaPruebas } from "./graficas.js";
import { montarTabla } from "./tabla-datos.js";

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
