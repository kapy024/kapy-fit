// Tiny inline-SVG trend indicator for the exercise history row. NOT a
// chart: js/graficas.js's cargarChart() (Chart.js) is never imported or
// awaited here — a per-row sparkline drawn on every screen used mid-workout
// has no business pulling in a charting library just to draw eight dots.
// Hand-built SVG, mounted synchronously, with no interaction of its own.
//
// Reads historialDeSlot(slot) — ONE slot's own history — never historial(
// slug), which would merge in every OTHER slot sharing the same exercise
// (día 1's light and heavy press militar, día 5's repeated remo). Each row
// in registro.js's history panel already belongs to exactly one slot, so
// its sparkline must speak about that slot alone: blending in another
// slot's numbers can silently reverse the drawn trend and its aria-label
// with it (see I2 in the final-review brief — a 40->50 kg heavy-slot
// progression next to a same-day 20 kg light-slot entry rendered as
// "Tendencia a la baja: de 40 kg a 20 kg", the opposite of what actually
// happened). js/grafica-ejercicio.js's per-exercise chart is the one place
// that's still allowed to combine slots — and even there, never into one
// blended line (see its own header comment).
import { historialDeSlot } from "./almacen.js";
import { serieTemporal, MINIMO_PUNTOS_GRAFICA as MINIMO_PUNTOS } from "./metricas.js";
import { formatear } from "./unidades.js";

const VENTANA = 8;
// A move smaller than this fraction of the starting weight reads as noise,
// not a trend — otherwise a 0.1 kg wobble between two sessions would call
// itself "subiendo" or "bajando" just as loudly as a real 10 kg jump.
const UMBRAL_ESTABLE = 0.02;

const ANCHO = 48;
const ALTO = 16;
const PAD = 2;

// Pure: the last `VENTANA` {fecha, valor} weight points for `slot` (one
// exercise row, never a whole slug's worth of slots), in kg — never
// converted to the display unit here, since a trend's direction doesn't
// depend on the unit it's measured in. `suficientes` mirrors the
// project-wide "fewer than 2 points, draw nothing" rule.
export function datosMinilinea(slot) {
  const serie = serieTemporal(historialDeSlot(slot), "pesoKg");
  const puntos = serie.slice(-VENTANA);
  return { puntos, suficientes: puntos.length >= MINIMO_PUNTOS };
}

// Pure: overall direction of `puntos` (kg), comparing first vs. last point
// — a dip in the middle of an otherwise rising run doesn't flip the trend
// a 48×16 sparkline is meant to summarize.
export function tendencia(puntos) {
  const inicioKg = puntos[0].valor;
  const finKg = puntos[puntos.length - 1].valor;
  const delta = finKg - inicioKg;
  const base = Math.abs(inicioKg) || 1;
  const direccion =
    Math.abs(delta) / base < UMBRAL_ESTABLE ? "estable" : delta > 0 ? "subiendo" : "bajando";
  return { direccion, inicioKg, finKg };
}

const VERBO = {
  subiendo: "Tendencia al alza",
  bajando: "Tendencia a la baja",
  estable: "Tendencia estable"
};

// "Tendencia al alza: de 70 kg a 75 kg" — a screen reader has no other way
// to read a 48×16 line, so the words have to carry what the shape shows a
// sighted reader: direction and the two numbers behind it, in the unit the
// user has selected everywhere else.
export function etiquetaTendencia({ direccion, inicioKg, finKg }, unidad) {
  const de = formatear(inicioKg, unidad);
  const a = formatear(finKg, unidad);
  return `${VERBO[direccion]}: de ${de} a ${a}`;
}

// Maps `valores` onto a `points` string inside the ANCHO×ALTO viewBox,
// scaled to its own min/max (a sparkline shows shape, not an absolute
// scale) — a flat series (`rango` 0) falls back to a horizontal line
// instead of dividing by zero.
function construirPolilinea(valores) {
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const rango = max - min || 1;
  const n = valores.length;
  return valores
    .map((v, i) => {
      const x = n === 1 ? PAD : PAD + (i * (ANCHO - PAD * 2)) / (n - 1);
      const y = ALTO - PAD - ((v - min) / rango) * (ALTO - PAD * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

// Mounts the sparkline into `contenedor`, or mounts nothing at all when
// there are fewer than 2 points — no placeholder, no reserved space, so a
// freshly-added exercise never shows a gap next to its "Historial (0)"
// toggle. Synchronous on purpose: unlike montarGraficaEjercicio/
// montarGraficaPeso there is no `await cargarChart()` anywhere in this
// path — see the file header.
export function montarMinilinea(contenedor, slot, unidad) {
  const { puntos, suficientes } = datosMinilinea(slot);
  if (!suficientes) return null;

  const t = tendencia(puntos);
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("class", "minilinea");
  svg.setAttribute("viewBox", `0 0 ${ANCHO} ${ALTO}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.setAttribute("width", String(ANCHO));
  svg.setAttribute("height", String(ALTO));
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", etiquetaTendencia(t, unidad));

  const polyline = document.createElementNS(ns, "polyline");
  polyline.setAttribute("points", construirPolilinea(puntos.map((p) => p.valor)));
  svg.appendChild(polyline);

  contenedor.appendChild(svg);
  return svg;
}
