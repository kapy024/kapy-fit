// Background sync: drains the pending-operations queue (almacen.js) into
// Supabase, in order, retrying forever. Never blocks the UI and never
// throws — a failed send simply leaves its item queued for the next pass,
// same guarantee almacen.js gives every write.
//
// Every network dependency is injected (see DEPENDENCIAS_REALES below),
// the same seam sesion-ui.js uses for auth.js/db.js — sync.test.js passes
// a double instead, so these tests never touch the real network.
import { pendientes, quitarPendiente } from "./almacen.js";
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

// Maps one queued operation onto its Supabase upsert. `onConflict` matches
// each table's real unique constraint, so resending the same pendiente
// (a retry after a flaky send, or two devices catching up) overwrites the
// same row instead of duplicating it.
async function enviarOperacion(c, userId, op) {
  if (op.tipo === "registro") {
    const { slot, fecha, slug, pesoKg, series, reps, hecho } = op.datos;
    return c.from("exercise_logs").upsert(
      {
        user_id: userId,
        slot,
        exercise_slug: slug,
        logged_on: fecha,
        weight_kg: pesoKg,
        sets: series,
        reps,
        completed: hecho
      },
      { onConflict: "user_id,slot,logged_on" }
    );
  }
  if (op.tipo === "preferencias") {
    return c.from("profiles").upsert(
      { id: userId, unidad: op.datos.unidad },
      { onConflict: "id" }
    );
  }
  // An operation type this build of sync.js doesn't know how to send yet
  // must never jam the queue forever behind it — drop it as if it had
  // succeeded rather than retry something that can never work.
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
      const { error } = await enviarOperacion(c, sesion.user.id, op);
      if (error) {
        fallidos++;
        errores.push(mensajeDeError(error));
        continue;
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

// --- arranque automático ---

let temporizador = null;

// Wires sincronizar() to run on its own: right away (so a reload with a
// pending queue and a live session starts draining without waiting), on
// every sign-in, whenever the browser regains connectivity, and every 60
// seconds while there's something queued. Returns a function that undoes
// all of it — tests must call it to avoid a stray interval calling a fake
// client after the test that created it has finished.
export function arrancarAutosync(deps = DEPENDENCIAS_REALES) {
  const manejarOnline = () => { sincronizar(deps); };
  window.addEventListener("online", manejarOnline);

  const desuscribirSesion = deps.alCambiarSesion((sesion) => {
    if (sesion) sincronizar(deps);
  });

  if (temporizador) clearInterval(temporizador);
  temporizador = setInterval(() => {
    if (pendientes().length > 0) sincronizar(deps);
  }, 60000);

  sincronizar(deps);

  return function detenerAutosync() {
    window.removeEventListener("online", manejarOnline);
    desuscribirSesion();
    if (temporizador) {
      clearInterval(temporizador);
      temporizador = null;
    }
  };
}
