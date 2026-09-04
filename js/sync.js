// Background sync: drains the pending-operations queue (almacen.js) into
// Supabase, in order, retrying forever. Never blocks the UI and never
// throws — a failed send simply leaves its item queued for the next pass,
// same guarantee almacen.js gives every write.
//
// Every network dependency is injected (see DEPENDENCIAS_REALES below),
// the same seam sesion-ui.js uses for auth.js/db.js — sync.test.js passes
// a double instead, so these tests never touch the real network.
import {
  pendientes, quitarPendiente, registroDe, marcaDe, aplicarRegistroRemoto,
  adopcionResuelta, marcarAdopcionResuelta, esNoAdoptado, marcarNoAdoptado
} from "./almacen.js";
import { cliente, hayConfig } from "./db.js";
import { sesionActual, alCambiarSesion } from "./auth.js";

const DEPENDENCIAS_REALES = { hayConfig, cliente, sesionActual, alCambiarSesion };

// --- estado observable (ver sesion-ui.js, que lo pinta) ---

let estadoActual = null;
const escuchas = new Set();

function calcularEstadoInicial() {
  return pendientes().length > 0 ? "pendiente" : "al-dia";
}

export function estado() {
  if (estadoActual == null) estadoActual = calcularEstadoInicial();
  return estadoActual;
}

function fijarEstado(nuevo) {
  if (nuevo === estado()) return;
  estadoActual = nuevo;
  for (const fn of escuchas) fn(nuevo);
}

// Subscribes to state changes. Calls `fn` immediately with the current
// state (so a freshly-mounted indicator doesn't wait for the next
// transition to show something), then again on every change. Returns an
// unsubscribe function.
export function alCambiarEstado(fn) {
  escuchas.add(fn);
  fn(estado());
  return () => escuchas.delete(fn);
}

// Test-only seam: resets the module's internal state (current status and
// its listeners) between test cases, since ES modules are singletons for
// the whole run of tests.html — same pattern as db.js's
// _fijarUrlLibreriaParaPruebas. Never used outside sync.test.js.
export function _reiniciarEstadoParaPruebas() {
  estadoActual = null;
  escuchas.clear();
}

function mensajeDeError(e) {
  if (e && typeof e.message === "string") return e.message;
  return String(e);
}

// --- envío de un pendiente ---

// Fallback edit time for a "registro" pendiente that has neither a local
// mark (almacen.js's marcaDe()) nor its own enqueue timestamp (encolar()
// stamps one on every operation it creates now, but a pendiente queued by
// an older build of this app could predate that). Deliberately far in the
// past, never "now": an edit with no known time loses any real comparison,
// which only ever costs a redundant server round-trip (see the `aplicado`
// handling below — never data loss), whereas "now" would resurrect the
// exact bug this file exists to fix.
const FECHA_MINIMA = "1970-01-01T00:00:00.000Z";

// Maps one queued operation onto its Supabase write. A "registro" write
// goes through the `subir_registro_ejercicio` RPC (see
// sql/006_edicion_cliente.sql) instead of a bare upsert: that function only
// applies the write when its `editado_en` — the moment the user actually
// made the edit, never the moment it happens to reach the network — is
// strictly newer than whatever the server already has, and always reports
// back {aplicado, fila}: whether THIS write is the one that won, and the
// row that actually ended up stored (this device's own, or the server's
// pre-existing one when it didn't). That is what lets two devices race to
// sync without whichever one merely syncs LAST silently overwriting
// whichever one was edited last. `preferencias` has no such race today
// (one profile row; last-write-wins there is a visible, acceptable
// outcome) so it keeps the plain upsert.
async function enviarOperacion(c, userId, op) {
  if (op.tipo === "registro") {
    const { slot, fecha, slug, pesoKg, series, reps, hecho } = op.datos;
    // Must be the pendiente's OWN stamp, never a fresh marcaDe() read at
    // send time: the queue snapshot this loop iterates (sincronizar()'s
    // `cola`) can go stale mid-loop if encolar() replaces this very
    // pendiente while an earlier item in the same pass is still in
    // flight (see almacen.js's encolar()) — a fresh marcaDe() read would
    // then pick up the REPLACEMENT's newer mark while `op.datos` still
    // holds the value being replaced, stamping old data with a new-enough
    // timestamp to beat its own successor's real write. Falling back to
    // marcaDe() only covers a pendiente queued before encoladoEn existed.
    const editadoEn = op.encoladoEn || marcaDe(slot, fecha) || FECHA_MINIMA;
    const { data, error } = await c.rpc("subir_registro_ejercicio", {
      p_slot: slot,
      p_slug: slug,
      p_fecha: fecha,
      p_peso: pesoKg,
      p_series: series,
      p_reps: reps,
      p_hecho: hecho,
      p_editado_en: editadoEn
    });
    if (error) return { error };
    return { error: null, aplicado: data ? data.aplicado : false, fila: data ? data.fila : null };
  }
  if (op.tipo === "preferencias") {
    const { error } = await c.from("profiles").upsert(
      { id: userId, unidad: op.datos.unidad },
      { onConflict: "id" }
    );
    return { error };
  }
  if (op.tipo === "rutina_bloque") {
    const { diaClave, bloqueClave, ejercicios } = op.datos;
    return enviarEdicionBloque(c, userId, diaClave, bloqueClave, ejercicios);
  }
  // An operation type this build of sync.js doesn't know how to send yet
  // must never jam the queue forever behind it — drop it as if it had
  // succeeded rather than retry something that can never work.
  return { error: null };
}

// Uploads one block's edited exercise list to routine_exercises. Unlike
// exercise_logs, a routine_exercises row is never identified by anything the
// client invents — its `id` lives only server-side, in the row that
// 004_clonado.sql created for this user when their account was set up — so
// the block's existing rows are looked up fresh by (día, bloque) every time,
// scoped to THIS user's own routine (never the shared template, user_id
// null) by requiring the join to `routines` to match `userId` — RLS enforces
// the same thing server-side, this just avoids updating zero rows silently
// when the join simply finds nothing.
//
// Editing never creates or removes days/blocks (see editor-rutina.js), and
// never adds a slot to a block either — only "quitar" shrinks it — so the
// diff against what the server already has is always: update every row the
// edited list still covers (rows are addressed by position, not by slot,
// since a substitution or reorder is exactly what changes a row's slot/slug
// out from under it), then delete whatever row is left over past the end of
// the edited list. This never touches exercise_logs — that table has no
// foreign key into routine_exercises at all — so history for a slot that
// just got substituted or removed is untouched on the server, same as it is
// locally (see almacen.js's guardarEdicionBloque).
async function enviarEdicionBloque(c, userId, diaClave, bloqueClave, ejercicios) {
  const { data: filaBloque, error: errorBloque } = await c
    .from("routine_blocks")
    .select("id, routine_exercises(id, posicion), routine_days!inner(clave, routines!inner(user_id))")
    .eq("clave", bloqueClave)
    .eq("routine_days.clave", diaClave)
    .eq("routine_days.routines.user_id", userId)
    .single();
  if (errorBloque) return { error: errorBloque };
  if (!filaBloque) return { error: new Error(`bloque no encontrado en la nube: ${diaClave}:${bloqueClave}`) };

  const filas = [...(filaBloque.routine_exercises || [])].sort((a, b) => a.posicion - b.posicion);

  for (let i = 0; i < ejercicios.length; i++) {
    const fila = filas[i];
    if (!fila) break; // no debería pasar: editar nunca agrega ejercicios a un bloque
    const e = ejercicios[i];
    const { error } = await c.from("routine_exercises").update({
      exercise_slug: e.slug,
      slot: e.slot,
      posicion: i + 1,
      series: e.series,
      reps: e.reps,
      peso_objetivo_kg: e.pesoKg,
      descanso: e.descanso,
      nota: e.nota
    }).eq("id", fila.id);
    if (error) return { error };
  }
  for (let i = ejercicios.length; i < filas.length; i++) {
    const { error } = await c.from("routine_exercises").delete().eq("id", filas[i].id);
    if (error) return { error };
  }
  return { error: null };
}

// --- ciclo de sincronización ---

// Drains the pending queue against Supabase. Never throws: any failure —
// no config, no session, a network error, a rejected row — is reported in
// the return value and reflected in estado(), never as an exception. A
// failed item is never removed from the queue; it is retried on the next
// call, which is the entire point of the local-first design.
export async function sincronizar(deps = DEPENDENCIAS_REALES) {
  const { hayConfig: hayConf, cliente: obtenerCliente, sesionActual: leerSesion } = deps;

  if (!hayConf()) {
    fijarEstado("sin-sesion");
    return { enviados: 0, fallidos: 0, detalle: "sin configuración" };
  }

  let sesion = null;
  try {
    sesion = await leerSesion();
  } catch (_e) {
    sesion = null;
  }
  if (!sesion || !sesion.user) {
    fijarEstado("sin-sesion");
    return { enviados: 0, fallidos: 0, detalle: "sin sesión" };
  }

  // The offer to upload pre-session history (debeOfrecerAdopcion() below)
  // must be the ONLY thing that ever drains those specific "registro"
  // pendientes while it stands unanswered — never autosync, 'online', the
  // sync that runs on page load with a session already active, or a
  // sincronizar() triggered by saving another set. Every one of those paths
  // calls this same function, so gating it here covers all of them at once
  // instead of trusting each call site to remember. Nothing is lost: the
  // queue is left exactly as it is, ready to drain the moment
  // aceptarAdopcion()/rechazarAdopcion() settles the question.
  if (debeOfrecerAdopcion()) {
    fijarEstado("pendiente");
    return { enviados: 0, fallidos: 0, detalle: "adopción de historial pendiente de respuesta" };
  }
  // Nothing left to ask about — either it was just resolved, or this
  // session never had any pre-existing local history to begin with. Close
  // the question for good so a record saved from here on is never mistaken
  // for old history still awaiting an answer.
  if (!adopcionResuelta()) marcarAdopcionResuelta();

  const cola = pendientes();
  if (cola.length === 0) {
    fijarEstado("al-dia");
    return { enviados: 0, fallidos: 0, detalle: "sin pendientes" };
  }

  fijarEstado("sincronizando");

  let c;
  try {
    c = await obtenerCliente();
  } catch (e) {
    fijarEstado("error");
    return { enviados: 0, fallidos: cola.length, detalle: mensajeDeError(e) };
  }

  let enviados = 0;
  let fallidos = 0;
  const errores = [];
  for (const op of cola) {
    try {
      const resultado = await enviarOperacion(c, sesion.user.id, op);
      if (resultado.error) {
        fallidos++;
        errores.push(mensajeDeError(resultado.error));
        continue;
      }
      // The server already had something newer for this slot+fecha: not a
      // failure — the write was correctly rejected, there's nothing to
      // retry — but the local copy must catch up to the winner instead of
      // going on showing a value the server has already discarded.
      if (op.tipo === "registro" && resultado.aplicado === false && resultado.fila) {
        aplicarRegistroRemoto(op.datos.slot, filaARegistro(resultado.fila), resultado.fila.updated_at);
      }
      quitarPendiente(op.id);
      enviados++;
    } catch (e) {
      fallidos++;
      errores.push(mensajeDeError(e));
    }
  }

  const quedan = pendientes().length;
  fijarEstado(fallidos > 0 ? "error" : quedan > 0 ? "pendiente" : "al-dia");
  return { enviados, fallidos, detalle: errores.length ? errores.join("; ") : "ok" };
}

// --- descarga inicial ---

// The identity descargar() uses to match a server row to a local one and
// to a queued upload: slot + fecha, same pair `unique (user_id, slot,
// logged_on)` protects server-side.
function claveFila(slot, fecha) {
  return `${slot}|${fecha}`;
}

// Maps a Postgres `exercise_logs` row — whether pulled by descargar() or
// handed back by the subir_registro_ejercicio() RPC when this device's own
// write loses — onto the record shape almacen.js stores locally.
function filaARegistro(fila) {
  return {
    fecha: fila.logged_on,
    slug: fila.exercise_slug,
    pesoKg: fila.weight_kg,
    series: fila.sets,
    reps: fila.reps,
    hecho: fila.completed
  };
}

// Pulls every exercise_logs row belonging to the signed-in user and merges
// each one into local storage. Never throws — same contract as
// sincronizar(): no config, no session, a network error, or a rejected
// query is reported in the return value, never as an exception.
//
// Four rules, in order, decide each row:
//   1. A (slot, fecha) the user explicitly declined to upload when offered
//      adoption (almacen.js's esNoAdoptado(), set by rechazarAdopcion()
//      below) is never overwritten — "Ahora no" has to mean "don't upload
//      it AND don't let a download replace it either", or declining would
//      still lose the user's value the moment a download ran (see I2 in
//      the final-review brief). This check has to come before rule 2:
//      rechazarAdopcion() is exactly what TAKES a (slot, fecha) out of the
//      queue, so without this rule that removal would strip the very
//      protection the queue used to give it.
//   2. A (slot, fecha) still in the upload queue is never overwritten —
//      what hasn't gone up yet is newer than anything the server has, by
//      definition (see almacen.js's cola).
//   3. Otherwise, a row with no local counterpart is simply written down.
//   4. Otherwise, both sides have it: compare the local mark (see
//      almacen.js's marcaDe(), stamped at write time — local time for a
//      local write, the server's own updated_at for a previously
//      downloaded one) against this row's `updated_at`. The more recent
//      one wins; a local record with no mark at all (written before this
//      feature existed) is treated as older than anything on the server,
//      so upgrading a device still pulls its account's full history down.
// Nothing is ever deleted here — a losing side is only ever overwritten by
// a *newer* value, never by an older or equal one, so no confirmed write
// disappears in favor of stale data.
export async function descargar(deps = DEPENDENCIAS_REALES) {
  const { hayConfig: hayConf, cliente: obtenerCliente, sesionActual: leerSesion } = deps;

  if (!hayConf()) return { traidos: 0, detalle: "sin configuración" };

  let sesion = null;
  try {
    sesion = await leerSesion();
  } catch (_e) {
    sesion = null;
  }
  if (!sesion || !sesion.user) return { traidos: 0, detalle: "sin sesión" };

  let c;
  try {
    c = await obtenerCliente();
  } catch (e) {
    return { traidos: 0, detalle: mensajeDeError(e) };
  }

  let filas;
  try {
    const { data, error } = await c.from("exercise_logs").select("*").eq("user_id", sesion.user.id);
    if (error) return { traidos: 0, detalle: mensajeDeError(error) };
    filas = Array.isArray(data) ? data : [];
  } catch (e) {
    return { traidos: 0, detalle: mensajeDeError(e) };
  }

  const enCola = new Set(
    pendientes()
      .filter((p) => p.tipo === "registro")
      .map((p) => claveFila(p.datos.slot, p.datos.fecha))
  );

  let traidos = 0;
  for (const fila of filas) {
    const slot = fila.slot;
    const fecha = fila.logged_on;
    if (esNoAdoptado(slot, fecha)) continue; // regla 1: declinado explícitamente, nunca se pisa
    if (enCola.has(claveFila(slot, fecha))) continue; // regla 2: lo local sin subir gana

    const local = registroDe(slot, fecha);
    if (local) {
      const marcaLocal = marcaDe(slot, fecha);
      if (marcaLocal && new Date(marcaLocal) >= new Date(fila.updated_at)) continue; // regla 4: local gana
    }

    if (aplicarRegistroRemoto(slot, filaARegistro(fila), fila.updated_at)) traidos++;
  }

  return { traidos, detalle: "ok" };
}

// --- adopción del historial local sin sesión ---

// Every queued "registro" write is history this device recorded without
// ever having a session: guardarRegistro() enqueues on every save
// regardless of session (see almacen.js), and with no session sincronizar()
// has never been able to drain the queue — so whatever "registro" entries
// are still pending the first time a session shows up is exactly what
// needs offering. "preferencias" pendientes never count here: a unit
// preference isn't training history, and it isn't what the user is
// worried about handing over.
export function historialSinAdoptar() {
  return pendientes().filter((p) => p.tipo === "registro");
}

// True only when the offer genuinely applies: it hasn't been answered
// before (accepted or declined — see almacen.js's adopcionResuelta()), and
// there's still local history sitting unsent to offer.
export function debeOfrecerAdopcion() {
  return !adopcionResuelta() && historialSinAdoptar().length > 0;
}

// Accept: the history is already sitting in the normal queue (guardarRegistro()
// put it there when it was written, session or not) — accepting never opens
// a parallel upload path, it only marks the question answered and lets
// sincronizar() drain the queue right now instead of waiting for the next
// automatic pass. Every row still goes up through subir_registro_ejercicio
// (see enviarOperacion above), so it inherits the same conditional write
// and retry as any other pendiente.
export async function aceptarAdopcion(deps = DEPENDENCIAS_REALES) {
  marcarAdopcionResuelta();
  return sincronizar(deps);
}

// Decline: enqueues nothing new and deletes nothing local — the history
// stays exactly as it was, only on this device, in localStorage. What it
// DOES do is pull every "registro" pendiente currently offered back out of
// the upload queue — otherwise the very next sincronizar() (autosync,
// 'online', page load, anything) would upload them anyway, "no" or not —
// AND mark each one esNoAdoptado() (almacen.js), so descargar()'s own
// rule 1 refuses to let a later download overwrite it either. Without that
// second part, "Ahora no" would only keep the upload from happening: the
// very next descargar() would run its normal newest-wins comparison on a
// record no longer protected by the queue, and could silently replace the
// user's declined value with whatever the server has (see I2 in the
// final-review brief) — the opposite of what declining promised. This
// still never touches LLAVE_REGISTROS or LLAVE_MARCAS, so historial()/
// registroDe() keep showing every one of these records exactly as before.
export function rechazarAdopcion() {
  for (const pendiente of historialSinAdoptar()) {
    marcarNoAdoptado(pendiente.datos.slot, pendiente.datos.fecha);
    quitarPendiente(pendiente.id);
  }
  marcarAdopcionResuelta();
}

// --- arranque automático ---

let temporizador = null;

// Wires sincronizar() to run on its own: right away (so a reload with a
// pending queue and a live session starts draining without waiting — unless
// that queue is exactly the unresolved adoption offer, see sincronizar()'s
// own debeOfrecerAdopcion() gate, which this initial call is bound by just
// like every other route in), on every sign-in, whenever the browser
// regains connectivity, and every 60 seconds while there's something
// queued. On sign-in and on the initial call, descargar() follows right
// after sincronizar() — always in that order: uploading first means the
// server never overwrites something this device recorded offline before
// descargar() gets to compare it. Returns a function that undoes all of
// it — tests must call it to avoid a stray interval calling a fake client
// after the test that created it has finished.
//
// `alOfrecerAdopcion`, if given, is called instead of sincronizar() the
// moment a brand-new sign-in shows up with unresolved local history still
// queued (see debeOfrecerAdopcion()) — that history must never go up
// silently just because a session appeared. descargar() still runs in that
// case: it never uploads anything, and its own rule 1 never overwrites a
// record that's still in the upload queue, so pulling the account's
// existing data down is always safe even before the offer is answered.
export function arrancarAutosync(deps = DEPENDENCIAS_REALES, alOfrecerAdopcion) {
  const manejarOnline = () => { sincronizar(deps); };
  window.addEventListener("online", manejarOnline);

  const desuscribirSesion = deps.alCambiarSesion((sesion) => {
    if (!sesion) return;
    if (debeOfrecerAdopcion()) {
      descargar(deps);
      if (typeof alOfrecerAdopcion === "function") alOfrecerAdopcion();
      return;
    }
    sincronizar(deps).then(() => descargar(deps));
  });

  if (temporizador) clearInterval(temporizador);
  temporizador = setInterval(() => {
    if (pendientes().length > 0) sincronizar(deps);
  }, 60000);

  sincronizar(deps).then(() => descargar(deps));

  return function detenerAutosync() {
    window.removeEventListener("online", manejarOnline);
    desuscribirSesion();
    if (temporizador) {
      clearInterval(temporizador);
      temporizador = null;
    }
  };
}
