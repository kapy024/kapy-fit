// Pure-DOM rendering. Reads RUTINA/CATALOGO, writes markup, and builds the
// Calendar/.ics links as real anchors (see js/calendario.js for why —
// window.open() gets killed silently by pop-up blockers, which was the
// original bug). No persistence, no timers: this module only draws what
// RUTINA + CATALOGO already say.
import { RUTINA, dia } from "./rutina.js";
import { ejercicio } from "./catalogo.js";
import { hoyISO } from "./almacen.js";
import { urlCalendario, textoICS, nombreArchivoICS } from "./calendario.js";
import { formatear } from "./unidades.js";

const ICONO_TECNICA =
  '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 5v14l11-7-11-7z" fill="currentColor"/></svg>';

// Tracks which day's pill should render aria-selected="true". pintarNav has
// no active-day parameter (see brief), so pintarDia — which does receive
// the active day from js/app.js — is the one source of truth for it.
let diaSeleccionado = RUTINA[0].clave;

function escaparHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

export function pintarNav(contenedor, alSeleccionar) {
  contenedor.innerHTML = "";
  RUTINA.forEach((d) => {
    contenedor.appendChild(pintarPestana(d, alSeleccionar));
  });
}

export function pintarDia(contenedor, claveDia, unidad) {
  diaSeleccionado = claveDia;
  contenedor.innerHTML = "";
  const d = dia(claveDia);
  contenedor.appendChild(pintarPanel(d, unidad));
}

function pintarPestana(d, alSeleccionar) {
  const esDescanso = d.bloques.length === 0;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "pill" + (esDescanso ? " pill--rest" : "");
  btn.setAttribute("role", "tab");
  btn.setAttribute("aria-selected", d.clave === diaSeleccionado ? "true" : "false");

  const etiqueta = document.createElement("span");
  etiqueta.className = "pill-label";
  etiqueta.textContent = d.etiqueta;

  const enfoque = document.createElement("span");
  enfoque.className = "pill-focus";
  enfoque.textContent = d.enfoque;

  btn.append(etiqueta, enfoque);
  btn.addEventListener("click", () => {
    diaSeleccionado = d.clave;
    alSeleccionar(d.clave);
  });
  return btn;
}

function pintarPanel(d, unidad) {
  const section = document.createElement("section");
  section.className = "panel active";

  const head = document.createElement("div");
  head.className = "panel-head";
  const h2 = document.createElement("h2");
  h2.textContent = `${d.etiqueta}: ${d.enfoque}`;
  head.appendChild(h2);
  section.appendChild(head);

  if (d.bloques.length === 0) {
    section.appendChild(pintarDescanso());
    return section;
  }

  const fecha = hoyISO();
  d.bloques.forEach((bloque) => {
    section.appendChild(pintarBloque(d, bloque, unidad, fecha));
  });
  return section;
}

function pintarDescanso() {
  const div = document.createElement("div");
  div.className = "rest-day";
  div.innerHTML =
    '<span class="rest-day-emoji" aria-hidden="true">🌙</span>' +
    "<h3>Día de descanso</h3>" +
    "<p>No hay ejercicios programados hoy. Aprovecha para recuperarte.</p>";
  return div;
}

function pintarBloque(d, bloque, unidad, fecha) {
  const frag = document.createDocumentFragment();
  if (bloque.etiqueta) {
    const h3 = document.createElement("h3");
    h3.textContent = bloque.etiqueta;
    frag.appendChild(h3);
  }
  frag.appendChild(pintarListaEjercicios(bloque.ejercicios, unidad));
  frag.appendChild(pintarAcciones(d, bloque, unidad, fecha));

  const wrap = document.createElement("div");
  wrap.appendChild(frag);
  return wrap;
}

function pintarListaEjercicios(ejercicios, unidad) {
  const ul = document.createElement("ul");
  ul.className = "exlist";
  ejercicios.forEach((e) => ul.appendChild(pintarEjercicio(e, unidad)));
  return ul;
}

function pintarEjercicio(ejercicioRutina, unidad) {
  const cat = ejercicio(ejercicioRutina.slug);
  const li = document.createElement("li");
  li.className = "ex";

  const body = document.createElement("div");
  body.className = "ex-body";
  body.appendChild(montarCampos(ejercicioRutina, cat, unidad));
  li.appendChild(body);

  // Sin video verificado (p.ej. aduccion-cadera): no se dibuja el botón.
  if (cat.video) {
    const link = document.createElement("a");
    link.className = "tech-link";
    link.href = cat.video;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.innerHTML = `${ICONO_TECNICA}<span class="lbl">Técnica</span>`;
    li.appendChild(link);
  }

  return li;
}

// Builds the name/sets-reps/weight/note block for one exercise. `unidad`
// only affects how pesoKg is displayed here — storage always stays kg.
function montarCampos(ejercicioRutina, cat, unidad) {
  const frag = document.createDocumentFragment();

  const nombre = document.createElement("div");
  nombre.className = "ex-name";
  nombre.textContent = cat.nombre;
  frag.appendChild(nombre);

  const subBits = [];
  const conteo = [ejercicioRutina.series, ejercicioRutina.reps].filter(Boolean);
  if (conteo.length) subBits.push(`<span>${escaparHtml(conteo.join(" × "))}</span>`);
  const peso = formatear(ejercicioRutina.pesoKg, unidad);
  if (peso) subBits.push(`<span class="w">${escaparHtml(peso)}</span>`);
  if (subBits.length) {
    const sub = document.createElement("div");
    sub.className = "ex-sub";
    sub.innerHTML = subBits.join("");
    frag.appendChild(sub);
  }

  const notas = [];
  if (ejercicioRutina.nota) notas.push(ejercicioRutina.nota);
  if (ejercicioRutina.descanso) notas.push(`Descanso: ${ejercicioRutina.descanso}`);
  if (notas.length) {
    const nota = document.createElement("div");
    nota.className = "ex-note";
    nota.textContent = notas.join(" · ");
    frag.appendChild(nota);
  }

  return frag;
}

function formatearLinea(ejercicioRutina, cat, unidad) {
  const bits = [cat.nombre];
  const conteo = [ejercicioRutina.series, ejercicioRutina.reps].filter(Boolean);
  if (conteo.length) bits.push(conteo.join("×"));
  const peso = formatear(ejercicioRutina.pesoKg, unidad);
  if (peso) bits.push(peso);
  return bits.join(" — ");
}

// One Calendar / .ics pair per block, matching calendario.js's contract of
// one `entrada` per (dia, bloque). The Calendar link is a real anchor —
// never a <button> calling window.open(), which is the bug this task
// exists to fix. The .ics link is a client-built blob: URL.
function pintarAcciones(d, bloque, unidad, fecha) {
  const div = document.createElement("div");
  div.className = "panel-meta";

  const lineas = bloque.ejercicios.map((e) => formatearLinea(e, ejercicio(e.slug), unidad));
  const entrada = { dia: d, bloque, lineas, fecha };

  const calBtn = document.createElement("a");
  calBtn.className = "cal-btn";
  calBtn.href = urlCalendario(entrada);
  calBtn.target = "_blank";
  calBtn.rel = "noopener";
  calBtn.innerHTML = '<span aria-hidden="true">📅</span> Agregar a Google Calendar';
  div.appendChild(calBtn);

  const icsBtn = document.createElement("a");
  icsBtn.className = "cal-btn";
  icsBtn.href = URL.createObjectURL(new Blob([textoICS(entrada)], { type: "text/calendar" }));
  icsBtn.download = nombreArchivoICS(d, fecha);
  icsBtn.textContent = "Descargar .ics";
  div.appendChild(icsBtn);

  return div;
}
