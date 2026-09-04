// The Progreso tab: body-weight card up top, then the list of exercises
// that actually have history, most-recently-logged first — tapping one
// expands its two stacked charts (js/grafica-ejercicio.js). Works
// identically with or without a signed-in session: every read here goes
// through js/almacen.js's local storage, same as the rest of the app —
// nothing here talks to js/db.js, js/auth.js or js/sync.js.
import { historial } from "./almacen.js";
import { slugs, ejercicio } from "./catalogo.js";
import { montarGraficaPeso } from "./grafica-peso.js";
import { montarGraficaEjercicio } from "./grafica-ejercicio.js";

// The nav pill's identity — never a real routine day (see rutina.js's
// RUTINA), so render.js checks against this instead of calling dia().
export const CLAVE_PROGRESO = "progreso";

// Pure: every exercise slug with at least one saved record, most recently
// logged first. Checks `slugs()` from catalogo.js — the universe of every
// exercise that could ever have a record — rather than the current
// routine's slugs: an exercise substituted out via editor-rutina.js keeps
// whatever history it already has, and that history doesn't disappear
// just because the plan no longer mentions it.
export function ejerciciosConHistorial() {
  return slugs()
    .map((slug) => {
      const registros = historial(slug);
      if (registros.length === 0) return null;
      return { slug, ultima: registros[registros.length - 1].fecha, cantidad: registros.length };
    })
    .filter(Boolean)
    .sort((a, b) => b.ultima.localeCompare(a.ultima));
}

function pintarEstadoVacio() {
  const p = document.createElement("p");
  p.className = "progreso-vacio";
  p.textContent =
    "Aún no hay registros. Marca un ejercicio como hecho, con su peso, para verlo aquí.";
  return p;
}

// One collapsed row per exercise with history — "Nombre (N)" — that opens
// its two charts (peso/volumen) on first tap, and just toggles visibility
// after that (no need to remount the same chart twice). Returns both the
// <li> and the toggle function itself, so tests can drive the async mount
// directly instead of dispatching a real click and racing its promise.
export function pintarFilaEjercicio(slug, cantidad, unidad) {
  const li = document.createElement("li");
  li.className = "progreso-item";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "progreso-toggle";
  btn.setAttribute("aria-expanded", "false");
  btn.textContent = `${ejercicio(slug).nombre} (${cantidad})`;

  const panel = document.createElement("div");
  panel.className = "progreso-panel-graficas";
  panel.hidden = true;

  let montado = false;
  async function alternar() {
    const abrir = panel.hidden;
    panel.hidden = !abrir;
    btn.setAttribute("aria-expanded", String(abrir));
    if (abrir && !montado) {
      montado = true;
      await montarGraficaEjercicio(panel, slug, unidad);
    }
  }
  btn.addEventListener("click", alternar);

  li.append(btn, panel);
  return { li, alternar };
}

function pintarListaEjercicios(unidad) {
  const section = document.createElement("section");
  section.className = "progreso-ejercicios";
  const h2 = document.createElement("h2");
  h2.textContent = "Avance por ejercicio";
  section.appendChild(h2);

  const lista = ejerciciosConHistorial();
  if (lista.length === 0) {
    section.appendChild(pintarEstadoVacio());
    return section;
  }

  const ul = document.createElement("ul");
  ul.className = "progreso-lista";
  lista.forEach(({ slug, cantidad }) => {
    ul.appendChild(pintarFilaEjercicio(slug, cantidad, unidad).li);
  });
  section.appendChild(ul);
  return section;
}

// Mounts the whole tab into `contenedor`, replacing whatever it held —
// same contract as montarGraficaEjercicio/montarGraficaPeso. The
// body-weight card is just a heading plus montarGraficaPeso's own
// capture-field/chart/table bundle; the exercise list below it never
// touches Chart.js until a row is actually opened.
export async function montarProgreso(contenedor, unidad) {
  contenedor.innerHTML = "";

  const wrap = document.createElement("div");
  wrap.className = "progreso";

  const pesoSection = document.createElement("section");
  pesoSection.className = "progreso-peso";
  const h2 = document.createElement("h2");
  h2.textContent = "Peso corporal";
  pesoSection.appendChild(h2);
  const pesoCuerpo = document.createElement("div");
  pesoSection.appendChild(pesoCuerpo);
  wrap.appendChild(pesoSection);

  wrap.appendChild(pintarListaEjercicios(unidad));

  contenedor.appendChild(wrap);
  await montarGraficaPeso(pesoCuerpo, unidad);
}
