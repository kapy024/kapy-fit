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
import {
  montarCampos, montarPalomita, montarTemporizador, montarHistorial,
  parseRestSeconds, clearAllTimers, crearAviso,
  contarCompletados, reiniciarCompletadosDeHoy
} from "./registro.js";
import { montarImagen, detenerTodasLasImagenes } from "./imagenes.js";

const ICONO_TECNICA =
  '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 5v14l11-7-11-7z" fill="currentColor"/></svg>';

function escaparHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

// `diaActivo` is taken explicitly instead of read off module state, so a
// caller that restores a saved day on startup (no click involved) still
// gets the right pill marked aria-selected on the very first paint.
export function pintarNav(contenedor, diaActivo, alSeleccionar) {
  // A keyboard/VoiceOver user who just activated a pill has focus inside
  // `contenedor` right up until innerHTML = "" below destroys it — without
  // restoring it afterwards, focus silently falls back to <body> on every
  // single day change.
  const teniaFoco = contenedor.contains(document.activeElement);
  contenedor.innerHTML = "";
  RUTINA.forEach((d) => {
    contenedor.appendChild(pintarPestana(d, diaActivo, alSeleccionar));
  });
  if (teniaFoco) {
    const activa = contenedor.querySelector('[aria-selected="true"]');
    if (activa) activa.focus();
  }
}

// Which block (variant) of each day is on screen, remembered for as long as
// the page lives — same as the monolith's `state.variant`. Not persisted:
// the variant you pick is a "what am I training right now" choice, not a
// preference, and it resets with the page exactly as it always did.
const bloqueActivo = {};

// Returns the block key currently selected for `d`, defaulting to its first
// block (and forgetting a stale key if the routine no longer has it).
function claveBloqueActivo(d) {
  const guardada = bloqueActivo[d.clave];
  if (guardada && d.bloques.some((b) => b.clave === guardada)) return guardada;
  return d.bloques[0].clave;
}

// `alReiniciar`, if given, is called after a confirmed "Reiniciar" tap
// clears today's checkmarks for the visible block — app.js uses it to
// refresh the #lastReset footer note without pintarDia needing to know that
// element exists.
export function pintarDia(contenedor, claveDia, unidad, alReiniciar) {
  // A running rest timer holds a setInterval closure over nodes that are
  // about to be detached by innerHTML = "" below — without this sweep,
  // switching day tabs mid-countdown leaks an interval that keeps firing
  // against detached elements forever. Same story for the exercise-image
  // IntersectionObservers: each one keeps watching a detached <img> unless
  // it's disconnected first.
  clearAllTimers();
  detenerTodasLasImagenes();
  // The variant selector rebuilds through this same function (see
  // `repintar` below) — a chip click leaves focus on a `.chip-btn` that
  // innerHTML = "" is about to destroy, same problem pintarNav has with the
  // day pills.
  const teniaFocoVariante =
    document.activeElement?.classList?.contains("chip-btn") &&
    contenedor.contains(document.activeElement);
  contenedor.innerHTML = "";
  const d = dia(claveDia);
  // Redrawing the whole day is how a variant change takes effect: the same
  // path a day-tab click takes, so there is only one render path to reason
  // about (and the timer/observer sweeps above run for free).
  const repintar = () => pintarDia(contenedor, claveDia, unidad, alReiniciar);
  contenedor.appendChild(pintarPanel(d, unidad, repintar, alReiniciar));
  if (teniaFocoVariante) {
    const activa = contenedor.querySelector('.chip-btn[aria-selected="true"]');
    if (activa) activa.focus();
  }
}

function pintarPestana(d, diaActivo, alSeleccionar) {
  const esDescanso = d.bloques.length === 0;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "pill" + (esDescanso ? " pill--rest" : "");
  btn.setAttribute("role", "tab");
  btn.setAttribute("aria-selected", d.clave === diaActivo ? "true" : "false");

  const etiqueta = document.createElement("span");
  etiqueta.className = "pill-label";
  etiqueta.textContent = d.etiqueta;

  const enfoque = document.createElement("span");
  enfoque.className = "pill-focus";
  enfoque.textContent = d.enfoque;

  btn.append(etiqueta, enfoque);
  btn.addEventListener("click", () => alSeleccionar(d.clave));
  return btn;
}

// Draws one day. A day with several blocks shows a pill row and ONLY the
// selected block — drawing them all at once (as an earlier version did) puts
// three rows of the same exercise on screen at the same time, which is what
// makes a session unreadable and what the variant selector exists to avoid.
function pintarPanel(d, unidad, repintar, alReiniciar) {
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

  const clave = claveBloqueActivo(d);
  if (d.bloques.length > 1) {
    section.appendChild(pintarSelectorBloques(d, clave, repintar));
  }
  const activo = d.bloques.find((b) => b.clave === clave);
  // With pills on screen the block's own heading would just repeat the
  // selected pill's text, so it is only drawn when there is no selector.
  section.appendChild(
    pintarBloque(d, activo, unidad, hoyISO(), d.bloques.length === 1, alReiniciar)
  );
  return section;
}

// The variant pills. Reuses .variant-row/.chip-btn from estilos.css, which
// have been there since the monolith.
function pintarSelectorBloques(d, claveActiva, repintar) {
  const fila = document.createElement("div");
  fila.className = "variant-row";
  fila.setAttribute("role", "tablist");
  fila.setAttribute("aria-label", `Variantes de ${d.etiqueta}`);
  d.bloques.forEach((b) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip-btn";
    btn.setAttribute("role", "tab");
    btn.setAttribute("aria-selected", b.clave === claveActiva ? "true" : "false");
    btn.textContent = b.etiqueta;
    btn.addEventListener("click", () => {
      bloqueActivo[d.clave] = b.clave;
      repintar();
    });
    fila.appendChild(btn);
  });
  return fila;
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

function pintarBloque(d, bloque, unidad, fecha, conTitulo, alReiniciar) {
  const frag = document.createDocumentFragment();
  if (conTitulo && bloque.etiqueta) {
    const h3 = document.createElement("h3");
    h3.textContent = bloque.etiqueta;
    frag.appendChild(h3);
  }
  const progreso = pintarProgreso(bloque.ejercicios);
  const lista = pintarListaEjercicios(bloque.ejercicios, unidad, progreso.actualizar);
  frag.appendChild(lista);
  frag.appendChild(pintarAcciones(d, bloque, unidad, fecha, progreso, lista, alReiniciar));

  const wrap = document.createElement("div");
  wrap.appendChild(frag);
  return wrap;
}

// Builds the "N / M completados" counter for one block, plus an `actualizar`
// closure the checkboxes call after every change — the live-update the
// monolith did via a `document.querySelector` and a synthetic
// data-progress-for attribute; here it's just a bound function instead.
function pintarProgreso(ejercicios) {
  const span = document.createElement("span");
  span.className = "progress-txt";
  const actualizar = () => {
    const { hechos, total } = contarCompletados(ejercicios);
    span.textContent = `${hechos} / ${total} completados`;
  };
  actualizar();
  return { span, actualizar };
}

function pintarListaEjercicios(ejercicios, unidad, alCambiarProgreso) {
  const ul = document.createElement("ul");
  ul.className = "exlist";
  ejercicios.forEach((e) => ul.appendChild(pintarEjercicio(e, unidad, alCambiarProgreso)));
  return ul;
}

function pintarEjercicio(ejercicioRutina, unidad, alCambiarProgreso) {
  const cat = ejercicio(ejercicioRutina.slug);
  const li = document.createElement("li");
  li.className = "ex";

  // One save-warning per row, shared by the checkbox and the peso/series/
  // reps fields — appended once, below, instead of each control drawing
  // (and showing) its own.
  const aviso = crearAviso();

  // La palomita va primero: pinta sobre `li` mismo para poder alternar la
  // clase "done" (tachado del nombre, ver estilos.css) sin pedirle a
  // registro.js que conozca la estructura del panel.
  montarPalomita(li, ejercicioRutina, cat.nombre, aviso, alCambiarProgreso);

  // Always drawn, even with no numeric duration ("Sin descanso") — the
  // widget itself decides button vs. static box; see montarTemporizador.
  const etiquetaDescanso = ejercicioRutina.descanso || "60 seg";
  const segundos = parseRestSeconds(etiquetaDescanso);
  montarTemporizador(li, segundos, etiquetaDescanso, cat.nombre);

  const body = document.createElement("div");
  body.className = "ex-body";
  body.appendChild(pintarInfoEjercicio(ejercicioRutina, cat, unidad));
  montarImagen(body, ejercicioRutina.slug, cat);
  montarCampos(body, ejercicioRutina, unidad, aviso);
  montarHistorial(body, ejercicioRutina, unidad);
  li.appendChild(body);
  li.appendChild(aviso);

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

// Builds the name/sets-reps/weight/note block for one exercise — the plan's
// baseline data, read-only. `unidad` only affects how pesoKg is displayed
// here — storage always stays kg. The actual capture inputs (peso/series/
// reps typed today) are drawn separately by registro.js's montarCampos.
function pintarInfoEjercicio(ejercicioRutina, cat, unidad) {
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

  // El descanso ya no se repite aquí como texto: el recuadro de la
  // palomita/temporizador (ver pintarEjercicio) muestra la misma etiqueta
  // en su propio recuadro — una sola representación por dato.
  if (ejercicioRutina.nota) {
    const nota = document.createElement("div");
    nota.className = "ex-note";
    nota.textContent = ejercicioRutina.nota;
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

// The "Reiniciar" button clears only today's checkmarks for the block on
// screen — never pesoKg/series/reps, never other days, never the history —
// and always behind a confirm(): a stray tap in the gym wiping a session's
// progress is exactly the accident this guards against. Storage is cleared
// through registro.js's reiniciarCompletadosDeHoy(); the DOM (checkboxes,
// the "done" strike-through, the progress counter) is fixed up here
// directly instead of a full repintar(), so unrelated state — an open
// history panel, scroll position — survives the reset. `alReiniciar`, if
// given, runs afterwards so app.js can refresh the #lastReset footer note.
function pintarBotonReiniciar(bloque, progreso, listaEl, alReiniciar) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "reset-btn";
  btn.textContent = "Reiniciar";
  btn.addEventListener("click", () => {
    const confirmado = window.confirm(
      "¿Borrar las palomitas de hoy en este bloque? Los pesos, series, reps e historial no se tocan."
    );
    if (!confirmado) return;
    reiniciarCompletadosDeHoy(bloque.ejercicios);
    listaEl.querySelectorAll(".check").forEach((cb) => { cb.checked = false; });
    listaEl.querySelectorAll("li.ex").forEach((li) => li.classList.remove("done"));
    progreso.actualizar();
    if (alReiniciar) alReiniciar();
  });
  return btn;
}

// One Calendar / .ics pair per block, matching calendario.js's contract of
// one `entrada` per (dia, bloque). The Calendar link is a real anchor —
// never a <button> calling window.open(), which is the bug this task
// exists to fix. The .ics link is a data: URI, not a blob: URL: the file
// is a few lines of text, so encoding it inline needs no createObjectURL
// (and therefore no matching revokeObjectURL) and can't accumulate across
// re-renders — which matters here since a phone user retaps day tabs a lot.
// `progreso`/`listaEl` are threaded through only so the reset button can
// reach them — see pintarBotonReiniciar.
function pintarAcciones(d, bloque, unidad, fecha, progreso, listaEl, alReiniciar) {
  const div = document.createElement("div");
  div.className = "panel-meta";
  div.appendChild(progreso.span);
  div.appendChild(pintarBotonReiniciar(bloque, progreso, listaEl, alReiniciar));

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
  icsBtn.href = `data:text/calendar;charset=utf-8,${encodeURIComponent(textoICS(entrada))}`;
  icsBtn.download = nombreArchivoICS(d, fecha);
  icsBtn.textContent = "Descargar .ics";
  div.appendChild(icsBtn);

  return div;
}
