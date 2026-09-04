// Editing the user's own routine clone: target peso/series/reps, substitute
// an exercise for another one in the catalog, reorder it within its block,
// remove it — never new days or blocks, that stays a later phase (see
// tarea-11-brief.md). RUTINA (rutina.js) is mutated IN PLACE, the same
// module singleton render.js/app.js already read from, so an edit takes
// effect the moment it's made without a second render path to reason about.
//
// Local persistence and the Supabase queue both go through almacen.js (the
// only module that touches localStorage) and its "rutina_bloque" pending
// operation (drained by sync.js) — this module never touches localStorage
// or the network directly.
import { bloque } from "./rutina.js";
import { CATALOGO, ejercicio } from "./catalogo.js";
import { aKg, desdeKg, aNumeroONull } from "./unidades.js";
import { edicionesRutina, guardarEdicionBloque } from "./almacen.js";
import { crearAviso } from "./registro.js";

// --- modo edición: estado observable + botón (ver render.js) ---

// Global, not per-day: switching day tabs while editing keeps editing on,
// same as `unidad` in app.js. Off by default so the screen used while
// training is never the one that shows edit controls.
let modoEdicion = false;

export function modoEdicionActivo() {
  return modoEdicion;
}

export function alternarModoEdicion() {
  modoEdicion = !modoEdicion;
}

// Test-only seam, same pattern as sync.js's _reiniciarEstadoParaPruebas.
export function _reiniciarModoParaPruebas() {
  modoEdicion = false;
}

// --- recomputing slots within one block ---

// Mirrors rutina.js's asignarSlots(), scoped to a single block instead of
// the whole routine: the identity of a row is "<día>:<bloque>:<slug>", plus
// an occurrence suffix ("#2") when the same slug repeats in the block. Not
// exported from rutina.js (that file only ever runs it once, at load, over
// the pristine RUTINA) — this is the same handful of lines, run again here
// every time an edit could have changed a block's slug order or composition,
// which is exactly when a repeated slug's suffix needs to move.
function recalcularSlots(diaClave, bloqueClave, ejercicios) {
  const ocurrencias = new Map();
  for (const e of ejercicios) {
    const n = (ocurrencias.get(e.slug) ?? 0) + 1;
    ocurrencias.set(e.slug, n);
    e.slot = `${diaClave}:${bloqueClave}:${e.slug}` + (n > 1 ? `#${n}` : "");
  }
}

// --- applying a block's edited list onto RUTINA (in memory only) ---

// Replaces block (diaClave, bloqueClave)'s exercises with `listaEjercicios`
// — plain {slug, series, reps, pesoKg, descanso, nota} records, position
// implied by array order — and recomputes every slot in the block. Pure
// in-memory mutation: no read or write of localStorage/network here, so
// tests can use it to set up a scenario, or restore RUTINA afterward,
// without touching real storage. Returns false (no-op) if the block doesn't
// exist — editing never creates one.
export function aplicarEdicionABloque(diaClave, bloqueClave, listaEjercicios) {
  const b = bloque(diaClave, bloqueClave);
  if (!b) return false;
  b.ejercicios.length = 0;
  for (const it of listaEjercicios) {
    b.ejercicios.push({
      slug: it.slug,
      series: it.series ?? null,
      reps: it.reps ?? null,
      pesoKg: it.pesoKg ?? null,
      descanso: it.descanso ?? null,
      nota: it.nota ?? null
    });
  }
  recalcularSlots(diaClave, bloqueClave, b.ejercicios);
  return true;
}

// Flattens a block's current exercises into the plain-record shape
// aplicarEdicionABloque()/guardarEdicionBloque() use, `slot` included —
// this is the single place that computes the slot value that gets
// persisted locally and queued for Supabase (see enviarEdicionBloque in
// sync.js, which trusts this value instead of recomputing it a second time).
function bloqueAPlano(b) {
  return b.ejercicios.map((e) => ({
    slug: e.slug,
    series: e.series,
    reps: e.reps,
    pesoKg: e.pesoKg,
    descanso: e.descanso,
    nota: e.nota,
    slot: e.slot
  }));
}

// Applies every saved override (almacen.js's edicionesRutina()) onto RUTINA.
// Run once, here, at module load — the same "stamp it once, deterministically"
// pattern rutina.js's own asignarSlots(RUTINA) uses — so importing this
// module is what makes a previous session's edits show up again after a
// reload, before render.js ever draws a panel (see render.js, which imports
// this module for exactly that side effect).
function cargarEdicionesGuardadas() {
  const guardadas = edicionesRutina();
  for (const clave of Object.keys(guardadas)) {
    const i = clave.indexOf(":");
    if (i === -1) continue;
    aplicarEdicionABloque(clave.slice(0, i), clave.slice(i + 1), guardadas[clave]);
  }
}
cargarEdicionesGuardadas();

// Persists the block's current state (local override + Supabase queue) after
// a mutation below has already changed RUTINA in memory.
function persistirBloque(diaClave, bloqueClave) {
  const b = bloque(diaClave, bloqueClave);
  if (!b) return false;
  return guardarEdicionBloque(diaClave, bloqueClave, bloqueAPlano(b));
}

// --- mutations exposed to the UI (and to tests) ---

// Changes peso objetivo/series/reps of the exercise at `slot` — the plan's
// baseline, never today's captured set (that's registro.js's territory,
// keyed by the same slot but a completely separate localStorage key). Never
// changes `slot` itself: these three fields aren't part of its identity.
// `cambios` only needs to carry the keys it's actually changing (`"x" in
// cambios`, not `cambios.x != null`, so an explicit null — clearing a
// field — is honored instead of ignored).
export function cambiarValoresEjercicio(diaClave, bloqueClave, slot, cambios) {
  const b = bloque(diaClave, bloqueClave);
  if (!b) return false;
  const e = b.ejercicios.find((x) => x.slot === slot);
  if (!e) return false;
  if ("series" in cambios) e.series = cambios.series;
  if ("reps" in cambios) e.reps = cambios.reps;
  if ("pesoKg" in cambios) e.pesoKg = cambios.pesoKg;
  return persistirBloque(diaClave, bloqueClave);
}

// Replaces the exercise at `slot` with `nuevoSlug` — any of the 43 catalog
// entries, not just ones already used somewhere in RUTINA. This changes the
// slot (it's derived from the slug), which is the whole point: the old
// slot's history (almacen.js's LLAVE_REGISTROS, never touched here) stays
// exactly where it is, under the old slot, because these are workouts that
// really happened — see rutina.test.js/editor-rutina.test.js for the
// explicit check. peso objetivo and la nota reset to null (they were about
// the old exercise); series/reps/descanso carry over as a starting point,
// since "4 series" is still a reasonable guess for whatever replaces it.
// Throws if `nuevoSlug` isn't a real catalog entry (catalogo.js's
// ejercicio()) — same validation the routine itself relies on everywhere
// else, so a typo can't silently create a phantom slug.
export function sustituirEjercicio(diaClave, bloqueClave, slot, nuevoSlug) {
  const b = bloque(diaClave, bloqueClave);
  if (!b) return false;
  const i = b.ejercicios.findIndex((x) => x.slot === slot);
  if (i === -1) return false;
  ejercicio(nuevoSlug); // valida que exista; lanza si no
  const anterior = b.ejercicios[i];
  b.ejercicios[i] = {
    slug: nuevoSlug,
    series: anterior.series,
    reps: anterior.reps,
    pesoKg: null,
    descanso: anterior.descanso,
    nota: null
  };
  recalcularSlots(diaClave, bloqueClave, b.ejercicios);
  return persistirBloque(diaClave, bloqueClave);
}

// Removes the exercise at `slot` from its block. Its history stays under
// that slot forever (almacen.js never deletes LLAVE_REGISTROS entries, and
// the server's exercise_logs has no foreign key into routine_exercises at
// all — see sync.js's enviarEdicionBloque) — it simply stops showing up as
// part of the active plan, exactly like a day-1 exercise that's still in
// RUTINA's dia7 (rest) shows nothing either. Every remaining exercise in the
// block shifts up one position; a repeated slug's occurrence suffix is
// recalculated to match.
export function quitarEjercicio(diaClave, bloqueClave, slot) {
  const b = bloque(diaClave, bloqueClave);
  if (!b) return false;
  const i = b.ejercicios.findIndex((x) => x.slot === slot);
  if (i === -1) return false;
  b.ejercicios.splice(i, 1);
  recalcularSlots(diaClave, bloqueClave, b.ejercicios);
  return persistirBloque(diaClave, bloqueClave);
}

// Moves the exercise at `slot` one position toward `direccion` (-1 = up,
// +1 = down) within its block. A slot never depends on position — so most
// reorders change nothing about it — EXCEPT the occurrence suffix of a
// repeated slug, which genuinely is position-derived (see rutina.js's own
// asignarSlots): swapping día 1's two "press militar" entries moves which
// physical row is "#1" and which is "#2". Returns false, doing nothing, at
// either end of the list — there's nowhere to move to.
export function moverEjercicio(diaClave, bloqueClave, slot, direccion) {
  const b = bloque(diaClave, bloqueClave);
  if (!b) return false;
  const i = b.ejercicios.findIndex((x) => x.slot === slot);
  if (i === -1) return false;
  const j = i + direccion;
  if (j < 0 || j >= b.ejercicios.length) return false;
  const tmp = b.ejercicios[i];
  b.ejercicios[i] = b.ejercicios[j];
  b.ejercicios[j] = tmp;
  recalcularSlots(diaClave, bloqueClave, b.ejercicios);
  return persistirBloque(diaClave, bloqueClave);
}


// --- UI: the toggle button and one editable row (render.js draws these) ---

// The single on/off switch, drawn in the panel head next to the day title —
// never inline with any exercise, so the training screen (mode off, the
// default) shows nothing extra at all. `repintar` is render.js's own
// per-day redraw closure (same one the variant selector and "Reiniciar"
// already use), called after toggling so the panel switches views right
// away.
export function pintarBotonModoEdicion(repintar) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "reset-btn edit-toggle-btn";
  btn.setAttribute("aria-pressed", String(modoEdicionActivo()));
  btn.textContent = modoEdicionActivo() ? "Listo" : "Editar rutina";
  btn.addEventListener("click", () => {
    alternarModoEdicion();
    repintar();
  });
  return btn;
}

function mostrarAviso(el, mensaje) {
  el.textContent = mensaje;
  el.hidden = false;
}

function ocultarAviso(el) {
  el.hidden = true;
}

// Every catalog entry as [slug, entrada], sorted by display name — the
// substitute <select>'s option list. Spanish collation ("á" sorts with
// "a") so it reads the way a Spanish speaker expects, not by raw code
// point.
function opcionesCatalogo() {
  return Object.entries(CATALOGO).sort((a, b) => a[1].nombre.localeCompare(b[1].nombre, "es"));
}

// Same shape as registro.js's private campoTexto — duplicated here (a
// handful of lines) rather than exported from there, since registro.js's
// version is about today's capture and this one is about the plan's
// baseline; the two must stay free to diverge without either file's tests
// caring about the other's internals.
function campoTexto(etiqueta, clase, valorInicial, placeholder, inputmode) {
  const label = document.createElement("label");
  label.className = "field";
  const span = document.createElement("span");
  span.textContent = etiqueta;
  const input = document.createElement("input");
  input.type = "text";
  input.className = `f-input ${clase}`;
  if (inputmode) input.inputMode = inputmode;
  input.placeholder = placeholder != null ? String(placeholder) : "";
  input.value = valorInicial != null ? String(valorInicial) : "";
  label.append(span, input);
  return { label, input };
}

// A small icon button for "mover arriba"/"mover abajo" — 24×24 minimum tap
// target (estilos.css's .ex-edit-icon), disabled (not hidden) at either end
// of the block so the row layout doesn't jump as neighbors move past an
// edge.
function botonIcono(simbolo, etiquetaAria, deshabilitado, alHacerClic) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "reset-btn ex-edit-icon";
  btn.textContent = simbolo;
  btn.setAttribute("aria-label", etiquetaAria);
  btn.disabled = deshabilitado;
  btn.addEventListener("click", alHacerClic);
  return btn;
}

// Draws one exercise's row in edit mode: which catalog entry it is (a
// <select>, substitution), its peso objetivo/series/reps (plain text
// fields, same aKg()/aNumeroONull() normalization the training capture
// fields use — see registro.js), reorder buttons and a remove button.
// Deliberately nothing from registro.js's training UI (no checkbox, no rest
// timer, no capture fields, no history) — this is a different screen for a
// different job, per the brief's "no llenar de controles la pantalla que se
// usa entrenando". `repintar` redraws the whole day after every change:
// simplest correct way to reflect a slot/position change that just
// happened, and the same pattern every other mutation in render.js already
// uses (variant switch, reset).
export function pintarFilaEdicion(diaClave, bloqueClave, ejercicioRutina, indice, total, unidad, repintar) {
  const { slot, slug } = ejercicioRutina;
  const cat = ejercicio(slug);

  const li = document.createElement("li");
  li.className = "ex ex-edit";

  const nombre = document.createElement("div");
  nombre.className = "ex-name";
  nombre.textContent = cat.nombre;
  li.appendChild(nombre);

  const aviso = crearAviso();

  const campoSustituir = document.createElement("label");
  campoSustituir.className = "field field-sustituir";
  const etqSustituir = document.createElement("span");
  etqSustituir.textContent = "Ejercicio";
  const select = document.createElement("select");
  select.className = "f-input f-sel";
  opcionesCatalogo().forEach(([s, c]) => {
    const opt = document.createElement("option");
    opt.value = s;
    opt.textContent = c.nombre;
    if (s === slug) opt.selected = true;
    select.appendChild(opt);
  });
  select.addEventListener("change", () => {
    sustituirEjercicio(diaClave, bloqueClave, slot, select.value);
    repintar();
  });
  campoSustituir.append(etqSustituir, select);
  li.appendChild(campoSustituir);

  const track = document.createElement("div");
  track.className = "ex-track";

  const pesoMostrado = ejercicioRutina.pesoKg != null ? desdeKg(ejercicioRutina.pesoKg, unidad) : null;
  const campoPeso = campoTexto("Peso objetivo", "f-w", pesoMostrado, unidad, "decimal");
  campoPeso.input.addEventListener("change", () => {
    const texto = campoPeso.input.value.trim();
    if (texto === "") {
      ocultarAviso(aviso);
      cambiarValoresEjercicio(diaClave, bloqueClave, slot, { pesoKg: null });
      repintar();
      return;
    }
    const kg = aKg(texto, unidad);
    if (kg === null) {
      mostrarAviso(aviso, "Peso no válido, no se guardó");
      return;
    }
    ocultarAviso(aviso);
    cambiarValoresEjercicio(diaClave, bloqueClave, slot, { pesoKg: kg });
    repintar();
  });

  const campoSeries = campoTexto("Series", "f-s", ejercicioRutina.series, "#", "numeric");
  campoSeries.input.addEventListener("change", () => {
    const valor = aNumeroONull(campoSeries.input.value);
    cambiarValoresEjercicio(diaClave, bloqueClave, slot, { series: valor });
    repintar();
  });

  const campoReps = campoTexto("Reps", "f-r", ejercicioRutina.reps, "reps", "text");
  campoReps.input.addEventListener("change", () => {
    const valor = campoReps.input.value.trim() || null;
    cambiarValoresEjercicio(diaClave, bloqueClave, slot, { reps: valor });
    repintar();
  });

  track.append(campoPeso.label, campoSeries.label, campoReps.label);
  li.appendChild(track);
  li.appendChild(aviso);

  const acciones = document.createElement("div");
  acciones.className = "ex-edit-acciones";
  acciones.appendChild(
    botonIcono("↑", `Subir ${cat.nombre}`, indice === 0, () => {
      moverEjercicio(diaClave, bloqueClave, slot, -1);
      repintar();
    })
  );
  acciones.appendChild(
    botonIcono("↓", `Bajar ${cat.nombre}`, indice === total - 1, () => {
      moverEjercicio(diaClave, bloqueClave, slot, 1);
      repintar();
    })
  );
  const btnQuitar = document.createElement("button");
  btnQuitar.type = "button";
  btnQuitar.className = "reset-btn ex-edit-quitar";
  btnQuitar.textContent = "Quitar";
  btnQuitar.setAttribute("aria-label", `Quitar ${cat.nombre} de la rutina`);
  btnQuitar.addEventListener("click", () => {
    const confirmado = window.confirm(
      `¿Quitar "${cat.nombre}" de la rutina? Tu historial de este ejercicio no se borra.`
    );
    if (!confirmado) return;
    quitarEjercicio(diaClave, bloqueClave, slot);
    repintar();
  });
  acciones.appendChild(btnQuitar);
  li.appendChild(acciones);

  return li;
}
