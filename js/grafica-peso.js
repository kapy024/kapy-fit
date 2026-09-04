// Body-weight chart: one line (palette slot 1) plus its own 4-week moving
// average, dashed, same color — the "same smoothed entity" rule from
// restricciones.md. Two series on one chart, so unlike
// grafica-ejercicio.js's single-series charts this one keeps a legend and
// a direct label per line (the visualization rule for 2+ series).
import { pesos, guardarPeso } from "./peso-corporal.js";
import { hoyISO } from "./almacen.js";
import { aKg, desdeKg } from "./unidades.js";
import { promedioMovil, porSemana, semanaIsoDe } from "./metricas.js";
import { cargarChart, paleta, opcionesBase, registrarGrafica, destruirGrafica } from "./graficas.js";
import { montarTabla } from "./tabla-datos.js";
import { fechaAMs, formatearFechaCorta, pluginCrosshair } from "./grafica-ejercicio.js";

const MINIMO_PUNTOS = 2;
const VENTANA_PROMEDIO = 4;

// Pure: {puntos, promedio, suficientes} for the whole body-weight history,
// in the requested display unit. `puntos` stays one entry per raw weigh-in
// (never bucketed) so the chart's actual-weight line still shows every
// measurement on its real date. `promedio`, though, is a genuine N-week
// moving average: the raw records are grouped by ISO week with
// metricas.js's porSemana() FIRST (each point anchored to that week's
// Monday), and only THEN fed to promedioMovil() — averaging the raw
// records directly, as this used to do, made "N" count records, not
// weeks, so two weigh-ins in the same week silently shrank the window's
// real time span (see I1 in the final-review brief). The average itself is
// computed in kg (promedioMovil reused as-is, never reimplemented) and only
// converted to `unidad` afterwards — converting first would round every
// point to one decimal in the display unit before averaging, which isn't
// the same number as rounding once at the end. `suficientes` mirrors the
// global rule: fewer than 2 weigh-ins and there is nothing to plot.
export function datosDePeso(unidad, ventanaSemanas) {
  const registros = pesos();
  const puntos = registros.map((r) => ({ fecha: r.fecha, valor: desdeKg(r.kg, unidad) }));

  const enKg = registros.map((r) => ({ fecha: r.fecha, valor: r.kg }));
  const semanal = porSemana(enKg);
  const promedio = promedioMovil(semanal, ventanaSemanas).map((p) => ({
    fecha: p.fecha,
    valor: p.valor === null ? null : desdeKg(p.valor, unidad)
  }));

  return { puntos, promedio, suficientes: puntos.length >= MINIMO_PUNTOS };
}

// Looks up, for a raw weigh-in's `fecha`, the moving-average value of the
// ISO week it falls in — `promedio` is now one point per week (see
// datosDePeso() above), anchored to that week's Monday, so a raw date can't
// be matched to it by array index or by exact date equality any more. Used
// only by the table below; the chart plots `promedio` on its own weekly
// x-positions and never needs this lookup. Returns null (not the string
// "—") when that week isn't in `promedio` at all, or when it is but the
// window hasn't filled yet — the table renders either case the same way.
function promedioDeLaSemana(promedio, fecha) {
  const semana = semanaIsoDe(fecha);
  const punto = promedio.find((p) => semanaIsoDe(p.fecha) === semana);
  return punto ? punto.valor : null;
}

// --- dibujo (Chart.js/DOM — no cubierto por las pruebas puras de arriba) ---

// Direct label at the end of each dataset flagged `etiquetaDirecta` — the
// rule for a 2-series chart (peso.md's visualization rules): a legend
// alone isn't enough when both lines share one color, so each also gets
// its name drawn right at its last visible point.
function pluginEtiquetaDirecta() {
  return {
    id: "etiquetaDirecta",
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      chart.data.datasets.forEach((ds, i) => {
        if (!ds.etiquetaDirecta) return;
        const meta = chart.getDatasetMeta(i);
        const visibles = meta.data.filter((_, idx) => ds.data[idx]?.y != null);
        if (!visibles.length) return;
        const ultimo = visibles[visibles.length - 1];
        ctx.save();
        ctx.fillStyle = ds.borderColor;
        ctx.font = "600 11px 'Public Sans', sans-serif";
        ctx.textBaseline = "middle";
        ctx.fillText(ds.etiquetaDirecta, ultimo.x + 8, ultimo.y);
        ctx.restore();
      });
    }
  };
}

// Keeps only the points within the last 30 days of the most recent one —
// "el último mes" — leaving `promedio` untouched in its full-history form
// isn't an option: it has to be filtered by the same dates as `puntos` so
// the two series stay aligned point-for-point, but the average itself was
// already computed over the whole history before this filter runs, so a
// trailing window doesn't reset every time the view changes.
function filtrarVista(puntos, promedio, vista) {
  if (vista === "todo" || puntos.length === 0) return { puntos, promedio };
  const desdeMs = fechaAMs(puntos[puntos.length - 1].fecha) - 30 * 86400000;
  const dentro = (p) => fechaAMs(p.fecha) >= desdeMs;
  return { puntos: puntos.filter(dentro), promedio: promedio.filter(dentro) };
}

function opcionesDoble() {
  const base = opcionesBase();
  return {
    ...base,
    // The direct labels (pluginEtiquetaDirecta) draw past the last point of
    // each line — without room reserved on the right, that text gets
    // clipped by the canvas edge, since the most recent date always lands
    // exactly at the chart's right boundary.
    layout: { padding: { right: 56 } },
    plugins: {
      ...base.plugins,
      legend: { display: true, labels: base.plugins.legend.labels },
      tooltip: {
        mode: "nearest",
        intersect: false,
        callbacks: { title: (items) => formatearFechaCorta(items[0].parsed.x) }
      }
    },
    scales: {
      x: {
        type: "linear",
        ticks: { color: base.scales.x.ticks.color, callback: (v) => formatearFechaCorta(v) },
        grid: { display: false }
      },
      y: { beginAtZero: false, ticks: base.scales.y.ticks, grid: base.scales.y.grid }
    }
  };
}

function datasetDatos(puntos, color) {
  return {
    label: "Peso",
    etiquetaDirecta: "Peso",
    data: puntos.map((p) => ({ x: fechaAMs(p.fecha), y: p.valor })),
    borderColor: color,
    backgroundColor: color,
    borderWidth: 2,
    pointRadius: 5,
    pointHoverRadius: 7,
    tension: 0
  };
}

function datasetPromedio(promedio, color) {
  return {
    label: "Promedio móvil (4 semanas)",
    etiquetaDirecta: "Promedio",
    data: promedio.map((p) => ({ x: fechaAMs(p.fecha), y: p.valor })),
    borderColor: color,
    backgroundColor: color,
    borderWidth: 2,
    borderDash: [6, 4],
    pointRadius: 0,
    pointHoverRadius: 0,
    tension: 0,
    spanGaps: false
  };
}

function pintarToggleVista(vistaActual, alElegir) {
  const nav = document.createElement("div");
  nav.className = "vista-toggle";
  nav.setAttribute("role", "tablist");
  nav.setAttribute("aria-label", "Rango de la gráfica de peso");
  [["mes", "Último mes"], ["todo", "Todo el histórico"]].forEach(([valor, etiqueta]) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip-btn";
    btn.setAttribute("role", "tab");
    btn.setAttribute("aria-selected", String(valor === vistaActual));
    btn.textContent = etiqueta;
    btn.addEventListener("click", () => alElegir(valor));
    nav.appendChild(btn);
  });
  return nav;
}

function pintarCaptura(unidad, alGuardar) {
  const fila = document.createElement("div");
  fila.className = "peso-captura";

  const label = document.createElement("label");
  label.className = "field";
  const span = document.createElement("span");
  span.textContent = `Peso de esta semana (${unidad})`;
  const input = document.createElement("input");
  input.type = "text";
  input.inputMode = "decimal";
  input.className = "f-input";
  input.placeholder = unidad;
  label.append(span, input);

  const boton = document.createElement("button");
  boton.type = "button";
  boton.className = "reset-btn";
  boton.textContent = "Guardar";

  const aviso = document.createElement("span");
  aviso.className = "save-warn";
  aviso.hidden = true;

  boton.addEventListener("click", () => {
    const texto = input.value.trim();
    if (texto === "") return;
    const kg = aKg(texto, unidad);
    if (kg === null) {
      aviso.textContent = "Peso no válido, no se guardó";
      aviso.hidden = false;
      return;
    }
    const ok = guardarPeso(hoyISO(), kg);
    if (!ok) {
      aviso.textContent = "No se guardó (almacenamiento lleno)";
      aviso.hidden = false;
      return;
    }
    aviso.hidden = true;
    input.value = "";
    alGuardar();
  });

  fila.append(label, boton, aviso);
  return fila;
}

// Mounts the capture field, the month/full-history toggle, the chart (or
// its "needs a connection" note) and its always-present table into
// `contenedor`, replacing whatever it held. Re-renders itself in place —
// no page reload — after a successful save or a view toggle.
export async function montarGraficaPeso(contenedor, unidad) {
  contenedor.innerHTML = "";

  const wrap = document.createElement("div");
  wrap.className = "grafica-peso";
  contenedor.appendChild(wrap);

  let vista = "mes";
  const cuerpo = document.createElement("div");
  // The one Chart.js instance this component keeps alive at a time — a
  // view-toggle click or a fresh weigh-in calls dibujar() again on the same
  // `cuerpo`, and cuerpo.innerHTML = "" below only detaches the old
  // canvas, it doesn't stop Chart.js's own listeners on it (see I3, final-
  // review brief: 14 live instances behind 3 canvases after 5 toggle taps).
  let chartActual = null;

  async function dibujar() {
    destruirGrafica(chartActual);
    chartActual = null;
    cuerpo.innerHTML = "";
    const datos = datosDePeso(unidad, VENTANA_PROMEDIO);

    if (!datos.suficientes) {
      const faltan = MINIMO_PUNTOS - datos.puntos.length;
      const p = document.createElement("p");
      p.className = "grafica-vacia";
      p.textContent = `Faltan ${faltan} registro${faltan === 1 ? "" : "s"} de peso para mostrar una gráfica.`;
      cuerpo.appendChild(p);
      return;
    }

    cuerpo.appendChild(pintarToggleVista(vista, (v) => { vista = v; dibujar(); }));

    const { puntos, promedio } = filtrarVista(datos.puntos, datos.promedio, vista);
    const p = paleta();

    const Chart = await cargarChart();
    if (Chart) {
      const lienzo = document.createElement("div");
      lienzo.className = "grafica-lienzo";
      const canvas = document.createElement("canvas");
      lienzo.appendChild(canvas);
      cuerpo.appendChild(lienzo);
      chartActual = registrarGrafica(new Chart(canvas, {
        type: "line",
        data: { datasets: [datasetDatos(puntos, p.serie1), datasetPromedio(promedio, p.serie1)] },
        options: opcionesDoble(),
        plugins: [pluginCrosshair(), pluginEtiquetaDirecta()]
      }));
    } else {
      const nota = document.createElement("p");
      nota.className = "grafica-nota";
      nota.textContent =
        "La gráfica necesita conexión la primera vez — mientras tanto, aquí está la tabla.";
      cuerpo.appendChild(nota);
    }

    const tablaEl = document.createElement("div");
    cuerpo.appendChild(tablaEl);
    montarTabla(tablaEl, {
      titulo: "Peso corporal",
      columnas: ["Fecha", `Peso (${unidad})`, `Promedio (${unidad})`],
      filas: puntos.map((pt) => {
        const v = promedioDeLaSemana(promedio, pt.fecha);
        return [pt.fecha, pt.valor, v === null ? "—" : v];
      })
    });
  }

  wrap.appendChild(pintarCaptura(unidad, dibujar));
  wrap.appendChild(cuerpo);
  await dibujar();
}
