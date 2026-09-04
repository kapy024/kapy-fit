// Per-exercise charts: weight lifted and training volume, drawn as two
// charts stacked on a shared date axis — never two Y axes on one chart,
// since kg (peso) and kg×series×reps (volumen) live on wildly different
// scales (22 vs 1,320 — see restricciones.md). Reuses every calculation
// from js/metricas.js; this module only shapes historial() records into
// chart input and draws them.
import { historial } from "./almacen.js";
import { desdeKg } from "./unidades.js";
import { volumen, serieTemporal } from "./metricas.js";
import { cargarChart, paleta, opcionesBase } from "./graficas.js";
import { montarTabla } from "./tabla-datos.js";
import { etiquetaSlot } from "./rutina.js";

const MINIMO_PUNTOS = 2;

// Groups historial(slug) records by the slot they came from, in the order
// each slot first appears (historial() itself is fecha-ascending, so that's
// the order of each slot's earliest record) — día 1's light and heavy press
// militar, or día 5's repeated remo, come back as separate groups instead
// of one merged list. A slug that lives in only one slot (the common case)
// simply comes back as a single group of one.
function porSlot(registros) {
  const grupos = new Map();
  for (const r of registros) {
    if (!grupos.has(r.slot)) grupos.set(r.slot, []);
    grupos.get(r.slot).push(r);
  }
  return [...grupos.entries()].map(([slot, filas]) => ({ slot, registros: filas }));
}

// Pure: {peso, volumen, etiqueta} for ONE slot's own records — never mixed
// with another slot's, so a slug spread across slots (see porSlot() above)
// never blends two unrelated progressions into one line (see I2 in the
// final-review brief: a 40->50 kg heavy-slot progression plotted next to a
// same-day 20 kg light-slot entry drew as a single falling line). `peso` is
// converted to `unidad` for display; `volumen` is always computed in kg and
// never follows the selector (restricciones.md). A record missing what
// volumen() needs simply contributes no volumen point, same as
// datosDeEjercicio() below.
function datosDeSlot({ slot, registros }, unidad) {
  const peso = serieTemporal(registros, "pesoKg").map((p) => ({
    fecha: p.fecha,
    valor: desdeKg(p.valor, unidad)
  }));
  const conVolumen = registros.map((r) => ({ fecha: r.fecha, volumenKg: volumen(r) }));
  const vol = serieTemporal(conVolumen, "volumenKg");
  return { slot, etiqueta: etiquetaSlot(slot), peso, volumen: vol };
}

// Pure: {peso, volumen, etiqueta}[] for `slug`, one entry per slot it
// occupies — the shape montarGraficaEjercicio() below draws from, so a
// multi-slot slug becomes one line PER SLOT instead of one blended line.
export function datosPorSlot(slug, unidad) {
  return porSlot(historial(slug)).map((grupo) => datosDeSlot(grupo, unidad));
}

// Pure: {peso, volumen, suficientes} for one exercise, across every slot
// that shares `slug` — historial() already merges them, so the same squat
// logged on day 3 and day 6, or twice in one block, is one history. Built
// from datosPorSlot() (one source of truth for "which records belong to
// this slug") flattened back into one fecha-ascending series each — this
// combined shape is what gates the component and feeds its data table; the
// per-slot shape is what the CHART itself draws from, so multiple slots
// never share one line here (see datosPorSlot() above and montarGraficaEjercicio()
// below). `peso` is converted to `unidad` for display; `volumen` is always
// computed in kg and never follows the selector (a design rule, not an
// oversight — see restricciones.md). `suficientes` gates the whole
// component on the primary series (peso): with fewer than 2 weight points
// there's nothing worth drawing, whatever volumen happens to have.
export function datosDeEjercicio(slug, unidad) {
  const grupos = datosPorSlot(slug, unidad);
  const porFecha = (a, b) => a.fecha.localeCompare(b.fecha);
  const peso = grupos.flatMap((g) => g.peso).sort(porFecha);
  const vol = grupos.flatMap((g) => g.volumen).sort(porFecha);

  return { peso, volumen: vol, suficientes: peso.length >= MINIMO_PUNTOS };
}

// --- dibujo (Chart.js/DOM — no cubierto por las pruebas puras de arriba) ---

// "YYYY-MM-DD" -> epoch ms at UTC midnight. Chart.js's "time" scale needs
// a date-adapter package this app doesn't load (one more CDN dependency
// restricciones.md deliberately avoids); a plain numeric x-axis fed real
// timestamps gives the same real-date spacing — a skipped week leaves a
// visible gap — without it.
export function fechaAMs(fecha) {
  return Date.parse(`${fecha}T00:00:00Z`);
}

export function formatearFechaCorta(ms) {
  const [, mes, dia] = new Date(ms).toISOString().slice(0, 10).split("-");
  return `${dia}/${mes}`;
}

// Chart.js core has no vertical hover guide-line (that lives in a separate
// plugin package this project doesn't load). Draws one at the active
// tooltip position using only what Chart.js v4's own tooltip already
// exposes, so every chart gets a crosshair for free.
export function pluginCrosshair() {
  return {
    id: "crosshair",
    afterDraw(chart) {
      const activos = chart.tooltip?.getActiveElements?.() ?? [];
      if (!activos.length) return;
      const { ctx, chartArea } = chart;
      const x = activos[0].element.x;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x, chartArea.top);
      ctx.lineTo(x, chartArea.bottom);
      ctx.lineWidth = 1;
      ctx.strokeStyle = paleta().retícula;
      ctx.stroke();
      ctx.restore();
    }
  };
}

// Shared axis/legend shape. `conLeyenda` is true only when a slug occupies
// more than one slot (see porSlot() above) and this block is therefore
// drawing more than one line — the common single-slot case keeps the
// original no-legend look (the heading above the chart already names the
// one series). Horizontal-only grid, and the Y axis never forced to start
// at zero — a tight real-world range (78–80 kg, or a handful of kg of
// progressive overload) would otherwise flatten into a line that says
// nothing.
function opcionesLinea(conLeyenda) {
  const base = opcionesBase();
  return {
    ...base,
    plugins: {
      ...base.plugins,
      legend: conLeyenda
        ? { display: true, labels: base.plugins.legend.labels }
        : { display: false },
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

// Markers at radius 5 (10px diameter) comfortably clear the 8px minimum;
// a 2px line is the other fixed measurement the design calls for. `label`
// only matters once the legend is on (multi-slot) — Chart.js ignores it
// with the legend hidden.
function dataset(puntos, color, label) {
  return {
    label,
    data: puntos.map((p) => ({ x: fechaAMs(p.fecha), y: p.valor })),
    borderColor: color,
    backgroundColor: color,
    borderWidth: 2,
    pointRadius: 5,
    pointHoverRadius: 7,
    tension: 0
  };
}

// Draws one chart block from `series` — an array of {puntos, color,
// etiqueta}, one entry per slot (see datosPorSlot() above). A slug in a
// single slot is a one-element array: same look as before this fix, one
// line, no legend. More than one element draws one line PER slot, each its
// own color and a legend naming it (etiquetaSlot()'s label) — never a
// single line blending two slots' numbers into one misleading trend (I2,
// final-review brief). The table mirrors the same split: an extra
// "Variante" column identifies each row's slot once there's more than one,
// same pattern registro.js's history panel uses for the same reason.
async function dibujarBloque(contenedorPadre, { titulo, series, columnaValor }) {
  const bloque = document.createElement("div");
  bloque.className = "grafica-bloque";
  const h3 = document.createElement("h3");
  h3.className = "grafica-titulo";
  h3.textContent = titulo;
  bloque.appendChild(h3);

  const conLeyenda = series.length > 1;

  const Chart = await cargarChart();
  if (Chart) {
    const lienzo = document.createElement("div");
    lienzo.className = "grafica-lienzo";
    const canvas = document.createElement("canvas");
    lienzo.appendChild(canvas);
    bloque.appendChild(lienzo);
    new Chart(canvas, {
      type: "line",
      data: { datasets: series.map((s) => dataset(s.puntos, s.color, s.etiqueta)) },
      options: opcionesLinea(conLeyenda),
      plugins: [pluginCrosshair()]
    });
  } else {
    const nota = document.createElement("p");
    nota.className = "grafica-nota";
    nota.textContent =
      "La gráfica necesita conexión la primera vez — mientras tanto, aquí está la tabla.";
    bloque.appendChild(nota);
  }

  const tablaEl = document.createElement("div");
  bloque.appendChild(tablaEl);
  const filas = series
    .flatMap((s) => s.puntos.map((p) => (conLeyenda ? [p.fecha, p.valor, s.etiqueta] : [p.fecha, p.valor])))
    .sort((a, b) => a[0].localeCompare(b[0]));
  montarTabla(tablaEl, {
    titulo,
    columnas: conLeyenda ? ["Fecha", columnaValor, "Variante"] : ["Fecha", columnaValor],
    filas
  });

  contenedorPadre.appendChild(bloque);
}

// Mounts the two stacked charts (peso arriba, volumen abajo) plus their
// tables into `contenedor`, replacing whatever it held. With fewer than 2
// weight points draws nothing but a message saying how many are missing —
// a one-point chart communicates less than no chart at all
// (restricciones.md). Volumen is drawn only when it independently clears
// the same 2-point bar; a set with non-numeric reps (no volumen at all)
// still gets its peso chart, just no volumen block underneath.
export async function montarGraficaEjercicio(contenedor, slug, unidad) {
  contenedor.innerHTML = "";
  const datos = datosDeEjercicio(slug, unidad);

  if (!datos.suficientes) {
    const faltan = MINIMO_PUNTOS - datos.peso.length;
    const p = document.createElement("p");
    p.className = "grafica-vacia";
    p.textContent = `Faltan ${faltan} registro${faltan === 1 ? "" : "s"} con peso para mostrar una gráfica.`;
    contenedor.appendChild(p);
    return;
  }

  const wrap = document.createElement("div");
  wrap.className = "grafica-ejercicio";
  contenedor.appendChild(wrap);

  const p = paleta();
  // "Máximo 3 series por gráfica" (restricciones.md): today's routine never
  // puts one slug in more than 2 slots (día 1's light/heavy press militar,
  // día 5's repeated remo), but a future substitution history could in
  // principle add a third — capping here means a chart never silently grows
  // past the validated palette instead of enforcing the limit by accident.
  const grupos = datosPorSlot(slug, unidad).slice(0, 3);
  // Peso starts at serie1 (unchanged for the common single-slot case);
  // volumen starts at serie2 (also unchanged there) — each block only needs
  // its OWN colors to be distinct from each other, not to match the other
  // block's color for the same slot.
  const coloresPeso = [p.serie1, p.serie2, p.serie3];
  const coloresVolumen = [p.serie2, p.serie3, p.serie1];

  const seriePeso = grupos
    .map((g, i) => ({ puntos: g.peso, color: coloresPeso[i], etiqueta: g.etiqueta }))
    .filter((s) => s.puntos.length > 0);
  await dibujarBloque(wrap, {
    titulo: "Peso levantado",
    series: seriePeso,
    columnaValor: `Peso (${unidad})`
  });

  if (datos.volumen.length >= MINIMO_PUNTOS) {
    const serieVolumen = grupos
      .map((g, i) => ({ puntos: g.volumen, color: coloresVolumen[i], etiqueta: g.etiqueta }))
      .filter((s) => s.puntos.length > 0);
    await dibujarBloque(wrap, {
      titulo: "Volumen de entrenamiento",
      series: serieVolumen,
      columnaValor: "Volumen (kg)"
    });
  }
}
