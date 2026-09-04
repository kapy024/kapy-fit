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
  adopcionResuelta, marcarAdopcionResuelta, esNoAdoptado, marcarNoAdoptado,
  marcaDeRutina, aplicarEdicionRemotaBloque, preferencias, aplicarPreferenciasRemotas,
  marcaDePeso, aplicarPesoRemoto
} from "./almacen.js";
import { cliente, hayConfig } from "./db.js";
import { sesionActual, alCambiarSesion } from "./auth.js";
// aplicarEdicionABloque mutates the live RUTINA singleton in memory — the
// only way a routine edit that just arrived from the server (descargar(),
// or a losing "rutina_bloque" upload corrected in place) shows up on screen
// without waiting for a reload, same as an edit made locally through
// editor-rutina.js's own mutations. No cycle: editor-rutina.js never
// imports sync.js.
import { aplicarEdicionABloque } from "./editor-rutina.js";

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
    // Same reasoning as "registro" above: the whole block's write shares
    // ONE edit timestamp (the moment editor-rutina.js made this change),
    // never a fresh marcaDeRutina() read at send time — a pendiente
    // replaced mid-flight by encolar() would otherwise let a later edit's
    // mark stamp an earlier edit's still-in-flight data.
    const editadoEn = op.encoladoEn || marcaDeRutina(diaClave, bloqueClave) || FECHA_MINIMA;
    return enviarEdicionBloque(c, userId, diaClave, bloqueClave, ejercicios, editadoEn);
  }
  if (op.tipo === "peso") {
    const { fecha, kg } = op.datos;
    // Same reasoning as "registro"/"rutina_bloque" above: the pendiente's
    // OWN stamp, never a fresh marcaDePeso() read at send time.
    const editadoEn = op.encoladoEn || marcaDePeso(fecha) || FECHA_MINIMA;
    const { data, error } = await c.rpc("subir_peso_corporal", {
      p_fecha: fecha,
      p_kg: kg,
      p_editado_en: editadoEn
    });
    if (error) return { error };
    return { error: null, aplicado: data ? data.aplicado : false, fila: data ? data.fila : null };
  }
  // An operation type this build of sync.js doesn't know how to send yet
  // must never jam the queue forever behind it — drop it as if it had
  // succeeded rather than retry something that can never work.
  return { error: null };
}

// Maps a Postgres `routine_exercises` row — whether pulled by
// descargarRutina() below or handed back by the subir_edicion_rutina() RPC
// when this device's own write loses — onto the plain-record shape
// almacen.js's edicionesRutina() stores locally (see editor-rutina.js's
// bloqueAPlano(), which computes the exact same shape client-side). `id` and
// `posicion` never travel into this shape: they're server bookkeeping, not
// something editor-rutina.js's in-memory RUTINA or the local override ever
// carries.
function filaRutinaAPlano(fila) {
  return {
    slug: fila.exercise_slug,
    series: fila.series,
    reps: fila.reps,
    pesoKg: fila.peso_objetivo_kg,
    descanso: fila.descanso,
    nota: fila.nota,
    slot: fila.slot
  };
}

// The most recent of a list of ISO timestamps (nulls/non-strings ignored),
// or null if none are usable. Used to reduce a whole block's rows down to
// ONE mark to compare against marcaDeRutina() — in practice every row in a
// block shares the same editado_en (a whole-block edit stamps every row
// with the same op.encoladoEn, see enviarOperacion above), but taking the
// max is the conservative choice if that ever stops being strictly true.
function marcaMaxima(fechas) {
  let maxima = null;
  for (const f of fechas) {
    if (typeof f !== "string" || !f) continue;
    if (maxima === null || new Date(f) > new Date(maxima)) maxima = f;
  }
  return maxima;
}

// Applies a routine block that just arrived from the server — either a full
// download (descargarRutina() below) or the corrected state of a
// "rutina_bloque" upload that lost its conflict (sincronizar()'s loop) —
// onto BOTH local storage (almacen.js, never queued for re-upload) and the
// live RUTINA singleton (editor-rutina.js's aplicarEdicionABloque), so the
// screen reflects it immediately instead of waiting for a reload. Returns
// true if the local write persisted.
function aplicarEdicionRutinaRemota(diaClave, bloqueClave, ejercicios, marcaServidor) {
  const ok = aplicarEdicionRemotaBloque(diaClave, bloqueClave, ejercicios, marcaServidor);
  if (ok) aplicarEdicionABloque(diaClave, bloqueClave, ejercicios);
  return ok;
}

// Uploads one block's edited exercise list to routine_exercises, through
// subir_edicion_rutina() (sql/008_rutina_sincronizada.sql) instead of a bare
// `update` — that function only applies the write when its `editado_en` is
// strictly newer than what the server already has, the same conditional
// guard subir_registro_ejercicio() (006) already gives exercise_logs. Unlike
// exercise_logs, a routine_exercises row is never identified by anything the
// client invents — its `id` lives only server-side, in the row that
// 004_clonado.sql created for this user when their account was set up — so
// the block's existing rows are looked up fresh by (día, bloque) every time,
// scoped to THIS user's own routine (never the shared template, user_id
// null) by requiring the join to `routines` to match `userId` — RLS AND
// subir_edicion_rutina()'s own explicit ownership check enforce the same
// thing server-side, this just avoids updating zero rows silently when the
// join simply finds nothing.
//
// Editing never creates or removes days/blocks (see editor-rutina.js), and
// never adds a slot to a block either — only "quitar" shrinks it — so the
// diff against what the server already has is always: send every row the
// edited list still covers (rows are addressed by position, not by slot,
// since a substitution or reorder is exactly what changes a row's slot/slug
// out from under it), then delete whatever row is left over past the end of
// the edited list. This never touches exercise_logs — that table has no
// foreign key into routine_exercises at all — so history for a slot that
// just got substituted or removed is untouched on the server, same as it is
// locally (see almacen.js's guardarEdicionBloque).
//
// If ANY row in the block loses its conflict, the whole pendiente is still
// resolved (not retried forever) — but the local block is corrected with
// the FULL server-side state of every row this call touched (accumulated
// from each RPC call's own returned `fila`, win or lose, so no second
// round-trip is needed), never a partial merge of some rows this device won
// and some it lost: blending fields from two different edits that never saw
// each other could produce a combination neither device actually intended.
async function enviarEdicionBloque(c, userId, diaClave, bloqueClave, ejercicios, editadoEn) {
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

  let algunoRechazado = false;
  const filasResultado = [];
  for (let i = 0; i < ejercicios.length; i++) {
    const fila = filas[i];
    if (!fila) break; // no debería pasar: editar nunca agrega ejercicios a un bloque
    const e = ejercicios[i];
    const { data, error } = await c.rpc("subir_edicion_rutina", {
      p_id: fila.id,
      p_exercise_slug: e.slug,
      p_slot: e.slot,
      p_posicion: i + 1,
      p_series: e.series,
      p_reps: e.reps,
      p_peso_objetivo_kg: e.pesoKg,
      p_descanso: e.descanso,
      p_nota: e.nota,
      p_editado_en: editadoEn
    });
    if (error) return { error };
    if (data && data.aplicado === false) algunoRechazado = true;
    if (data && data.fila) filasResultado.push(data.fila);
  }
  for (let i = ejercicios.length; i < filas.length; i++) {
    const { error } = await c.from("routine_exercises").delete().eq("id", filas[i].id);
    if (error) return { error };
  }
  if (algunoRechazado) {
    return { error: null, aplicado: false, filas: filasResultado };
  }
  return { error: null, aplicado: true };
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
      // Same idea, at block granularity: at least one row of this routine
      // edit lost its conflict, so the pendiente is resolved (not retried),
      // and the block is corrected locally — and on screen — with the full
      // server-side state enviarEdicionBloque already gathered, instead of
      // leaving an edit visible that the server has already discarded.
      if (op.tipo === "rutina_bloque" && resultado.aplicado === false && resultado.filas) {
        const ejerciciosPlanos = resultado.filas.map(filaRutinaAPlano);
        const marcaServidor = marcaMaxima(resultado.filas.map((f) => f.editado_en));
        aplicarEdicionRutinaRemota(op.datos.diaClave, op.datos.bloqueClave, ejerciciosPlanos, marcaServidor);
      }
      // Same idea as "registro" above, for body_weight: the server already
      // had something newer for this fecha, so the local copy is corrected
      // to what actually won instead of going on showing a discarded value.
      if (op.tipo === "peso" && resultado.aplicado === false && resultado.fila) {
        aplicarPesoRemoto(resultado.fila.measured_on, resultado.fila.weight_kg, resultado.fila.updated_at);
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

// Pulls every routine_exercises row of the signed-in user's OWN routine
// (never the shared template) and merges it into local storage, block by
// block. Never throws: any failure here is swallowed and reported as
// `aplicados: 0` — this is one of three independent downloads descargar()
// does (registros, rutina, perfil), and a broken join or an unexpected
// double must never take the other two down with it. Same three rules
// exercise_logs uses (rule 1, "declinado", doesn't apply — there is no
// adoption offer for routine edits):
//   2. A block still in the "rutina_bloque" upload queue is never
//      overwritten — what hasn't gone up yet is newer than anything the
//      server has, by definition.
//   3. Otherwise, compare marcaDeRutina() (this device's own edit time,
//      stamped by guardarEdicionBloque(), or the server's editado_en from a
//      previous download/correction) against the block's rows' editado_en
//      (reduced to one mark by marcaMaxima(), since a whole-block edit
//      stamps every row alike). The more recent one wins; a block never
//      marked on this device (never edited here) is treated as older than
//      anything on the server, so a block edited only on ANOTHER device is
//      still pulled down the first time this one syncs.
// Nothing is ever deleted here — a losing side is only ever overwritten by
// a newer value, and applying the same server state twice in a row simply
// re-marks the block with the same timestamp it already had (idempotent).
async function descargarRutina(c, userId) {
  let filas;
  try {
    const { data, error } = await c
      .from("routine_exercises")
      .select(
        "exercise_slug, slot, posicion, series, reps, peso_objetivo_kg, descanso, nota, editado_en, " +
        "routine_blocks!inner(clave, routine_days!inner(clave, routines!inner(user_id)))"
      )
      .eq("routine_blocks.routine_days.routines.user_id", userId);
    if (error) return { aplicados: 0 };
    filas = Array.isArray(data) ? data : [];
  } catch (_e) {
    return { aplicados: 0 };
  }

  const porBloque = new Map();
  for (const f of filas) {
    try {
      const diaClave = f.routine_blocks.routine_days.clave;
      const bloqueClave = f.routine_blocks.clave;
      const clave = `${diaClave}:${bloqueClave}`;
      if (!porBloque.has(clave)) porBloque.set(clave, { diaClave, bloqueClave, filas: [] });
      porBloque.get(clave).filas.push(f);
    } catch (_e) {
      // Fila con una forma inesperada (un doble incompleto en pruebas, o un
      // futuro cambio de esquema): se ignora, nunca tumba el resto.
    }
  }

  const bloquesEnCola = new Set(
    pendientes()
      .filter((p) => p.tipo === "rutina_bloque")
      .map((p) => `${p.datos.diaClave}:${p.datos.bloqueClave}`)
  );

  let aplicados = 0;
  for (const [clave, grupo] of porBloque) {
    if (bloquesEnCola.has(clave)) continue; // regla 2: lo local sin subir gana

    const ordenadas = [...grupo.filas].sort((a, b) => a.posicion - b.posicion);
    const marcaServidor = marcaMaxima(ordenadas.map((f) => f.editado_en));

    const marcaLocal = marcaDeRutina(grupo.diaClave, grupo.bloqueClave);
    if (marcaLocal && marcaServidor && new Date(marcaLocal) >= new Date(marcaServidor)) continue; // regla 4: local gana

    const ejerciciosPlanos = ordenadas.map(filaRutinaAPlano);
    if (aplicarEdicionRutinaRemota(grupo.diaClave, grupo.bloqueClave, ejerciciosPlanos, marcaServidor)) aplicados++;
  }
  return { aplicados };
}

// Pulls the signed-in user's own `profiles` row and merges its `unidad`
// into local preferences. Same failure isolation as descargarRutina() above
// — never throws out of descargar(). Unlike registros/rutina, there is no
// local mark to compare here (see almacen.js's aplicarPreferenciasRemotas):
// the only guard is the pending-queue rule (rule 2) — a "preferencias"
// pendiente still unsent means this device's own choice is the one that
// should reach the server, not the other way around. Once nothing is
// queued, taking the server's value is safe and idempotent: applying the
// same unidad twice in a row is simply a no-op write of the same value.
async function descargarPerfil(c, userId) {
  let filas;
  try {
    const { data, error } = await c.from("profiles").select("unidad").eq("id", userId);
    if (error) return { aplicado: false };
    filas = Array.isArray(data) ? data : [];
  } catch (_e) {
    return { aplicado: false };
  }

  const fila = filas[0];
  if (!fila || (fila.unidad !== "kg" && fila.unidad !== "lb")) return { aplicado: false };
  if (pendientes().some((p) => p.tipo === "preferencias")) return { aplicado: false }; // regla 2

  if (preferencias().unidad === fila.unidad) return { aplicado: false }; // ya coincide, nada que aplicar

  return { aplicado: aplicarPreferenciasRemotas({ unidad: fila.unidad }) };
}

// Pulls every body_weight row belonging to the signed-in user and merges
// each one into local storage. Same failure isolation and same rule 2 + 4
// as exercise_logs' descargar() (there's no adoption offer for peso — rule
// 1 doesn't apply here, same as it doesn't for rutina/perfil): a fecha
// still in the "peso" upload queue is never overwritten, and otherwise the
// local mark (marcaDePeso(), stamped at write time) is compared against
// the row's updated_at — the more recent one wins.
async function descargarPesos(c, userId) {
  let filas;
  try {
    const { data, error } = await c.from("body_weight").select("*").eq("user_id", userId);
    if (error) return { aplicados: 0 };
    filas = Array.isArray(data) ? data : [];
  } catch (_e) {
    return { aplicados: 0 };
  }

  const enCola = new Set(
    pendientes().filter((p) => p.tipo === "peso").map((p) => p.datos.fecha)
  );

  let aplicados = 0;
  for (const fila of filas) {
    const fecha = fila.measured_on;
    if (enCola.has(fecha)) continue; // regla 2: lo local sin subir gana

    const marcaLocal = marcaDePeso(fecha);
    if (marcaLocal && new Date(marcaLocal) >= new Date(fila.updated_at)) continue; // regla 4: local gana

    if (aplicarPesoRemoto(fecha, fila.weight_kg, fila.updated_at)) aplicados++;
  }
  return { aplicados };
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

  // Rutina, perfil y peso se bajan por separado de exercise_logs (tablas
  // distintas, reglas de conflicto propias) — cada una aislada en su propio
  // try/catch (ver descargarRutina()/descargarPerfil()/descargarPesos())
  // para que un doble de pruebas que solo conoce exercise_logs, o un fallo
  // real en cualquiera de las tres, nunca tumbe la descarga de registros de
  // arriba, que ya corrió. `traidos` se queda tal cual (exercise_logs,
  // contrato existente); rutinaAplicada/perfilAplicado/pesosAplicados son
  // campos nuevos, aditivos.
  const { aplicados: rutinaAplicada } = await descargarRutina(c, sesion.user.id);
  const { aplicado: perfilAplicado } = await descargarPerfil(c, sesion.user.id);
  const { aplicados: pesosAplicados } = await descargarPesos(c, sesion.user.id);

  return { traidos, rutinaAplicada, perfilAplicado, pesosAplicados, detalle: "ok" };
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
