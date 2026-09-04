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

const MINIMO_PUNTOS = 2;

// Pure: {peso, volumen, suficientes} for one exercise, across every slot
// that shares `slug` — historial() already merges them, so the same squat
// logged on day 3 and day 6, or twice in one block, is one history.
// `peso` is converted to `unidad` for display; `volumen` is always
// computed in kg and never follows the selector (a design rule, not an
// oversight — see restricciones.md). A record missing what volumen()
// needs (no weight, no series, or non-numeric reps) simply contributes no
// volumen point instead of throwing — serieTemporal already drops nulls.
// `suficientes` gates the whole component on the primary series (peso):
// with fewer than 2 weight points there's nothing worth drawing, whatever
// volumen happens to have.
export function datosDeEjercicio(slug, unidad) {
  const registros = historial(slug);

  const peso = serieTemporal(registros, "pesoKg").map((p) => ({
    fecha: p.fecha,
    valor: desdeKg(p.valor, unidad)
  }));

  const conVolumen = registros.map((r) => ({ fecha: r.fecha, volumenKg: volumen(r) }));
  const vol = serieTemporal(conVolumen, "volumenKg");

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

// Shared axis/legend shape for a single-series chart: no legend box (the
// heading above it names the series), horizontal-only grid, and the Y
// axis never forced to start at zero — a tight real-world range (78–80 kg,
// or a handful of kg of progressive overload) would otherwise flatten
// into a line that says nothing.
function opcionesLinea() {
  const base = opcionesBase();
  return {
    ...base,
    plugins: {
      ...base.plugins,
      legend: { display: false },
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
// a 2px line is the other fixed measurement the design calls for.
function dataset(puntos, color) {
  return {
    data: puntos.map((p) => ({ x: fechaAMs(p.fecha), y: p.valor })),
    borderColor: color,
    backgroundColor: color,
    borderWidth: 2,
    pointRadius: 5,
    pointHoverRadius: 7,
    tension: 0
  };
}

async function dibujarBloque(contenedorPadre, { titulo, puntos, color, columnaValor }) {
  const bloque = document.createElement("div");
  bloque.className = "grafica-bloque";
  const h3 = document.createElement("h3");
  h3.className = "grafica-titulo";
  h3.textContent = titulo;
  bloque.appendChild(h3);

  const Chart = await cargarChart();
  if (Chart) {
    const lienzo = document.createElement("div");
    lienzo.className = "grafica-lienzo";
    const canvas = document.createElement("canvas");
    lienzo.appendChild(canvas);
    bloque.appendChild(lienzo);
    new Chart(canvas, {
      type: "line",
      data: { datasets: [dataset(puntos, color)] },
      options: opcionesLinea(),
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
  montarTabla(tablaEl, {
    titulo,
    columnas: ["Fecha", columnaValor],
    filas: puntos.map((p) => [p.fecha, p.valor])
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
  await dibujarBloque(wrap, {
    titulo: "Peso levantado",
    puntos: datos.peso,
    color: p.serie1,
    columnaValor: `Peso (${unidad})`
  });

  if (datos.volumen.length >= MINIMO_PUNTOS) {
    await dibujarBloque(wrap, {
      titulo: "Volumen de entrenamiento",
      puntos: datos.volumen,
      color: p.serie2,
      columnaValor: "Volumen (kg)"
    });
  }
}
