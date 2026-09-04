// Chart.js is loaded lazily and defensively: a static import of a CDN took
// the whole app down in a previous delivery when the network was
// unreachable (see js/db.js's own cliente(), which fixed the same problem
// for supabase-js). Callers get null and fall back to the data table
// (js/tabla-datos.js) — cargarChart() itself never throws.
const URL_CHART = "https://esm.sh/chart.js@4.4.4/auto";

// Mutable only so graficas.test.js can point it at a URL that can't
// resolve, to prove cargarChart() rejects into null instead of taking
// anything down with it — same test seam as js/db.js's
// _fijarUrlLibreriaParaPruebas. Never reassigned outside tests.
let urlChart = URL_CHART;
let promesa = null;
let cargado = null;

// Test-only seam: see js/graficas.test.js. Also clears any cached/in-flight
// load so the next cargarChart() call actually re-attempts it.
export function _fijarUrlChartParaPruebas(url = URL_CHART) {
  urlChart = url;
  promesa = null;
  cargado = null;
}

export async function cargarChart() {
  if (cargado) return cargado;
  if (!promesa) {
    promesa = import(/* @vite-ignore */ urlChart)
      .then((m) => { cargado = m.default || m.Chart; return cargado; })
      .catch(() => { promesa = null; return null; });
  }
  return promesa;
}

// Whether Chart.js actually loaded, without triggering a load of its own —
// UI that must degrade quietly (show the data table instead of a canvas)
// uses this after cargarChart() has already been tried once.
export function disponible() {
  return cargado !== null;
}

// --- registro de instancias vivas (ver I3 de la revisión final) ---
//
// Every live Chart.js instance grafica-peso.js/grafica-ejercicio.js create,
// so whoever is about to discard the DOM subtree holding their canvases —
// render.js switching tabs, or one of those files redrawing its own chart
// in place — can destroy() it first. Chart.js registers its own
// ResizeObserver and other global listeners on construction; removing its
// canvas from the DOM with plain innerHTML = "" (as every repaint here
// does) leaves those listeners, and the chart object itself, alive
// forever — the same family of leak as the .ics data-URI blobs and the
// per-image IntersectionObservers this app already fixed (js/imagenes.js's
// detenerTodasLasImagenes()).
const graficasActivas = new Set();

// Tracks one newly-created chart. Returns it unchanged so a caller can
// write `chartActual = registrarGrafica(new Chart(...))` inline.
export function registrarGrafica(chart) {
  graficasActivas.add(chart);
  return chart;
}

// Destroys and untracks ONE chart — used by a component redrawing its own
// chart in place (grafica-peso.js's view toggle, a fresh weigh-in) to
// retire the instance it's about to replace, without touching any other
// chart that happens to be open elsewhere. Safe to call with null/undefined
// (nothing mounted yet) or with a chart already destroyed.
export function destruirGrafica(chart) {
  if (!chart) return;
  graficasActivas.delete(chart);
  chart.destroy();
}

// Destroys and untracks EVERY live chart — for a caller about to discard a
// whole subtree that may hold more than one (render.js, leaving or
// re-entering the Progreso tab, where each expanded exercise row keeps its
// own chart alive until the tab itself is left).
export function detenerTodasLasGraficas() {
  for (const chart of graficasActivas) chart.destroy();
  graficasActivas.clear();
}

// Test-only seam: how many charts this module is currently tracking, so
// graficas.test.js can prove destruirGrafica()/detenerTodasLasGraficas()
// actually shrink the count instead of just trusting Chart.js internals.
export function _contarGraficasActivasParaPruebas() {
  return graficasActivas.size;
}

// Reads one CSS custom property off :root, trimmed — getPropertyValue
// returns the raw declaration text, which browsers pad with a leading
// space that a Chart.js color option should never carry.
function leerVariable(nombre) {
  return getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
}

// The validated palette (see css/estilos.css's --viz-1/2/3, --text,
// --border, --surface), read live off the CSS custom properties so light
// vs. dark just follows whatever the page's own theme already resolved to
// — no separate light/dark branching here. `retícula` is the grid-line
// color a chart draws its axes with; `superficie` is its background.
export function paleta() {
  return {
    serie1: leerVariable("--viz-1"),
    serie2: leerVariable("--viz-2"),
    serie3: leerVariable("--viz-3"),
    texto: leerVariable("--text"),
    retícula: leerVariable("--border"),
    superficie: leerVariable("--surface")
  };
}

// Chart.js configuration shared by every chart this app draws: no built-in
// legend color assumptions, no default surface — everything themed off the
// same palette() every chart and its data-table fallback use.
export function opcionesBase() {
  const p = paleta();
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "nearest", intersect: false },
    plugins: {
      legend: { labels: { color: p.texto } }
    },
    scales: {
      x: { ticks: { color: p.texto }, grid: { color: p.retícula } },
      y: { ticks: { color: p.texto }, grid: { color: p.retícula } }
    }
  };
}
