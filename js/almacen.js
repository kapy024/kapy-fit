// The only module that touches localStorage — migracion.js reads the legacy
// keys through llavesLegadas() below instead of reaching for localStorage
// itself.
//
// Records are keyed by SLOT ("<dia>:<bloque>:<slug>", see rutina.js), so two
// sets of the same exercise in one session are two independent records
// instead of one that overwrites itself. Every record also carries its
// `slug`, which is what historial(slug) follows across slots: that is how a
// squat's history survives being moved to another day or variant.
//
// The prefix is bumped to "hierro3:" because the shape of the record store
// changed (slug-keyed → slot-keyed). Neither "hierro:" (the monolith) nor
// "hierro2:" (the intermediate version) is ever deleted.
export const LLAVE_REGISTROS = "hierro3:registros";
export const LLAVE_PREFS = "hierro3:prefs";
// Whether the legacy-data import banner has already been resolved (imported
// or explicitly dismissed), so app.js stops re-offering it on every load —
// its own key, separate from prefs/registros, since it isn't a preference.
export const LLAVE_MIGRACION = "hierro3:migracion";
// Whether the "upload local history to this account" banner has already
// been resolved (accepted or declined) — same reasoning as LLAVE_MIGRACION:
// its own key, so app.js stops re-offering it once the user has answered,
// independently of anything else stored.
export const LLAVE_ADOPCION = "hierro3:adopcion";
// When the "Reiniciar" button on a day's panel was last used. Purely
// informational (the #lastReset footer note in index.html) — never read to
// decide what to clear, so a corrupted or missing value can't affect a
// reset itself.
export const LLAVE_ULTIMO_RESET = "hierro3:ultimoReset";
// Pending Supabase writes, queued here — not sent — so a write always
// finishes as soon as it lands on disk, with no dependency on the network
// being up. sync.js is the only reader/drainer of this queue; almacen.js
// only ever appends to it and removes items sync.js confirms as sent.
export const LLAVE_COLA = "hierro3:cola";
// One timestamp per (slot, fecha), used only to resolve download conflicts
// (see sync.js's descargar()) — never shown in the UI and never part of the
// record shape historial()/registroDe() return, so it can't change what
// those already-tested reads look like. A local write stamps "now"; a
// record that arrives FROM the server is stamped with the server's own
// `updated_at` instead, so a later download compares like with like.
export const LLAVE_MARCAS = "hierro3:marcas";
// Local overrides for the user's own routine (see editor-rutina.js): peso
// objetivo/series/reps, substitution, order and removal within a block —
// never new days or blocks, those don't exist here. Keyed by
// "<diaClave>:<bloqueClave>", each value the block's full ordered exercise
// list as it stands after editing. A block absent from this object simply
// has no override yet; rutina.js's built-in definition stands as-is until
// the user changes it.
export const LLAVE_EDICIONES_RUTINA = "hierro3:edicionesRutina";

function leerJSON(llave, porOmision) {
  try {
    const crudo = localStorage.getItem(llave);
    if (!crudo) return porOmision;
    const valor = JSON.parse(crudo);
    return valor ?? porOmision;
  } catch (_) {
    // Corrupted JSON (or a blocked/unavailable localStorage.getItem) is not
    // this caller's problem to solve — fall back silently so a bad record
    // never takes down the app.
    return porOmision;
  }
}

// True only for the two ways a write is expected to fail in the wild: the
// quota is full, or the browser is in a privacy mode that blocks storage
// outright (older Safari raises SecurityError for that case). Anything
// else — a TypeError from JSON.stringify on a circular reference, or any
// other future bug — is a programming error, not a storage failure, and
// must stay visible instead of being swallowed here.
function esFalloDeAlmacenamiento(err) {
  return (
    err instanceof DOMException &&
    (err.name === "QuotaExceededError" || err.name === "SecurityError" || err.code === 22)
  );
}

// Persists `valor` under `llave`. Returns true if it was written, false if
// storage refused it (quota full or private mode) — never throws for that
// case, so the app keeps working with in-memory state only. A programming
// error (e.g. `valor` containing a circular reference) still throws.
function escribirJSON(llave, valor) {
  const texto = JSON.stringify(valor);
  try {
    localStorage.setItem(llave, texto);
    return true;
  } catch (err) {
    if (esFalloDeAlmacenamiento(err)) return false;
    throw err;
  }
}

// Returns today's date as "AAAA-MM-DD" in local time.
export function hoyISO() {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

// True when `r` has a usable `fecha` to sort/compare by. A record with no
// date (or a corrupted non-string one) can't be placed in a chronological
// history — it gets discarded by the readers below instead of throwing
// out of `localeCompare` and taking the whole render down with it.
function tieneFechaValida(r) {
  return !!r && typeof r.fecha === "string" && r.fecha !== "";
}

// Returns every record of one routine row (`slot`), ascending by date.
export function historialDeSlot(slot) {
  const todo = leerJSON(LLAVE_REGISTROS, {});
  const lista = Array.isArray(todo[slot]) ? todo[slot] : [];
  return lista.filter(tieneFechaValida).sort((a, b) => a.fecha.localeCompare(b.fecha));
}

// Returns every record of `slug` across ALL slots, ascending by date. This
// is the exercise-level view — the one the future charts consume: the same
// exercise logged on day 3 and on day 6, or in two different variants, is
// one history. Rows written before slugs were stored (there should be none,
// the prefix was bumped) simply don't match and are skipped. Each returned
// element carries the `slot` it came from (read-time only — the stored
// record itself is untouched), so a chart can tell apart, say, the light
// and the heavy set of the same exercise inside one history.
export function historial(slug) {
  const todo = leerJSON(LLAVE_REGISTROS, {});
  const juntos = [];
  for (const slot of Object.keys(todo)) {
    const lista = Array.isArray(todo[slot]) ? todo[slot] : [];
    for (const r of lista) {
      if (r && r.slug === slug && tieneFechaValida(r)) juntos.push({ ...r, slot });
    }
  }
  return juntos.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

// Returns the record of `slot` on `fecha`, or null if there is none.
export function registroDe(slot, fecha) {
  return historialDeSlot(slot).find((r) => r.fecha === fecha) ?? null;
}

// Shared by guardarRegistro() and aplicarRegistroRemoto(): replaces the
// record for `registro.fecha` under `slot` entirely (no merge with the
// previous record — the whole point of overwriting is that stale fields
// from a prior save don't survive), or appends it if that date has no
// record yet.
function escribirRegistro(slot, registro) {
  const todo = leerJSON(LLAVE_REGISTROS, {});
  const lista = Array.isArray(todo[slot]) ? todo[slot] : [];
  const i = lista.findIndex((r) => r.fecha === registro.fecha);
  if (i >= 0) lista[i] = registro;
  else lista.push(registro);
  todo[slot] = lista;
  return escribirJSON(LLAVE_REGISTROS, todo);
}

function claveMarca(slot, fecha) {
  return `${slot}|${fecha}`;
}

// The local timestamp for (slot, fecha), or null if never marked (a record
// that predates this feature, or one this device has never written or
// downloaded). sync.js's descargar() compares this against the server's
// `updated_at` to decide who wins a download conflict.
export function marcaDe(slot, fecha) {
  const marcas = leerJSON(LLAVE_MARCAS, {});
  const valor = marcas[claveMarca(slot, fecha)];
  return typeof valor === "string" ? valor : null;
}

function marcarLocal(slot, fecha, iso) {
  const marcas = leerJSON(LLAVE_MARCAS, {});
  marcas[claveMarca(slot, fecha)] = iso;
  escribirJSON(LLAVE_MARCAS, marcas);
}

// Replaces the record for `registro.fecha` under `slot` (see
// escribirRegistro()). `registro` is expected to carry its `slug`, so
// historial(slug) can find it later. Returns true if the write persisted,
// false if storage refused it (quota full or private mode); the caller
// decides how to tell the user, this function never throws for that case.
export function guardarRegistro(slot, registro) {
  const ok = escribirRegistro(slot, registro);
  // Only a write that actually persisted gets marked and queued — queuing
  // a write that never landed would leave a pending item pointing at a
  // record the app can't show, a ghost sync.js would dutifully upload with
  // no local trace.
  if (ok) {
    marcarLocal(slot, registro.fecha, new Date().toISOString());
    encolar({ tipo: "registro", entidad: "exercise_logs", datos: { slot, ...registro } });
  }
  return ok;
}

// Writes a record that came FROM the server (sync.js's descargar()), not
// from something the user just did here — so, unlike guardarRegistro(),
// it is never queued for re-upload: uploading back a row that only just
// arrived from the server would be redundant at best. The local mark is
// stamped with the server's own `updated_at` (not "now"), so the next
// download compares this record against the server on equal footing
// instead of always looking artificially fresh. Same persisted/not-
// persisted return contract as every other write here.
export function aplicarRegistroRemoto(slot, registro, marcaServidor) {
  const ok = escribirRegistro(slot, registro);
  if (ok) marcarLocal(slot, registro.fecha, marcaServidor);
  return ok;
}

// Returns every localStorage key matching `patron` with its raw string
// value, as [{ llave, crudo }]. The importer's only window onto storage:
// parsing and interpreting those rows stays migracion.js's business, but
// the localStorage access itself lives here, like every other read in the
// app. An unreadable storage (private mode) yields an empty list rather
// than throwing — there is simply nothing to import in that case.
export function llavesLegadas(patron) {
  try {
    return Object.keys(localStorage)
      .filter((k) => patron.test(k))
      .map((llave) => ({ llave, crudo: localStorage.getItem(llave) }));
  } catch (_) {
    return [];
  }
}

// True for a plain object — not null, not an array, not a bare string or
// number. Spreading anything else (`{ ...42 }`, and notably `{ ..."cadena" }`,
// which fans a string out into `{0:"c",1:"a",...}`) produces garbage instead
// of throwing, so this has to be checked before preferencias() spreads
// whatever leerJSON handed back.
function esObjetoPlano(valor) {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

// Returns the saved preferences, defaulting `unidad` to "kg" both when
// nothing was saved and when what was saved isn't a unit this app
// understands (e.g. hand-edited storage, or a future format change) —
// unidades.js throws on anything else, so this is the one place that
// must never hand it garbage. Same defense for the preferences object
// itself: a corrupted `hierro3:prefs` (anything but a plain object) falls
// back to `{}` instead of being spread as-is.
export function preferencias() {
  const leido = leerJSON(LLAVE_PREFS, {});
  const guardadas = esObjetoPlano(leido) ? leido : {};
  const unidad = guardadas.unidad === "lb" ? "lb" : "kg";
  return { ...guardadas, unidad };
}

// Merges `prefs` into the saved preferences and persists the result.
// Returns true if the write persisted, false if storage refused it.
export function guardarPreferencias(prefs) {
  const siguiente = { ...preferencias(), ...prefs };
  const ok = escribirJSON(LLAVE_PREFS, siguiente);
  if (ok) {
    encolar({ tipo: "preferencias", entidad: "profiles", datos: { unidad: siguiente.unidad } });
  }
  return ok;
}

// Returns every saved block override, as { "<dia>:<bloque>": [ {slug,
// series, reps, pesoKg, descanso, nota, slot}, ... ] }. Defaults to `{}`,
// same defense against a corrupted (non-plain-object) value as
// preferencias() above.
export function edicionesRutina() {
  const leido = leerJSON(LLAVE_EDICIONES_RUTINA, {});
  return esObjetoPlano(leido) ? leido : {};
}

// Persists the full ordered exercise list for one block — editor-rutina.js
// computes it (slot included) after every edit: change target
// peso/series/reps, substitute, reorder or remove — and queues the same
// change for Supabase's routine_exercises (see sync.js's enviarOperacion,
// tipo "rutina_bloque"). Never touches LLAVE_REGISTROS/exercise_logs: a
// routine edit reshapes the plan, it never deletes a set that actually
// happened. Returns true if the write persisted, false if storage refused
// it — same contract as every other write here.
export function guardarEdicionBloque(diaClave, bloqueClave, ejercicios) {
  const todo = edicionesRutina();
  todo[`${diaClave}:${bloqueClave}`] = ejercicios;
  const ok = escribirJSON(LLAVE_EDICIONES_RUTINA, todo);
  if (ok) {
    encolar({
      tipo: "rutina_bloque",
      entidad: "routine_exercises",
      datos: { diaClave, bloqueClave, ejercicios }
    });
  }
  return ok;
}

// Whether the legacy-import banner has already been resolved — either the
// user imported, or explicitly dismissed it. Defaults to false (never
// resolved) so a fresh install still offers the import once.
export function migracionResuelta() {
  return leerJSON(LLAVE_MIGRACION, false) === true;
}

// Marks the legacy-import banner as resolved so app.js stops offering it by
// default. Returns true if persisted, false if storage refused it — same
// contract as every other write here.
export function marcarMigracionResuelta() {
  return escribirJSON(LLAVE_MIGRACION, true);
}

// Whether the local-history adoption banner has already been resolved —
// either the user accepted uploading it, or explicitly declined. Defaults
// to false (never resolved) so a fresh sign-in still offers it once.
export function adopcionResuelta() {
  return leerJSON(LLAVE_ADOPCION, false) === true;
}

// Marks the adoption banner as resolved so app.js stops offering it by
// default. Returns true if persisted, false if storage refused it — same
// contract as every other write here.
export function marcarAdopcionResuelta() {
  return escribirJSON(LLAVE_ADOPCION, true);
}

// Returns the ISO timestamp of the last confirmed "Reiniciar" tap, or null
// if it has never happened.
export function ultimoReinicio() {
  return leerJSON(LLAVE_ULTIMO_RESET, null);
}

// Records "now" as the last reset time. Returns true if persisted, false if
// storage refused it — same contract as every other write here.
export function guardarUltimoReinicio() {
  return escribirJSON(LLAVE_ULTIMO_RESET, new Date().toISOString());
}

// --- cola de pendientes (ver sync.js, que la drena) ---

function generarIdPendiente() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for an environment with no crypto.randomUUID (old WebKit) —
  // still unique enough for a client-only queue id that's never compared
  // across devices.
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// The identity a pending operation targets, used to REPLACE instead of
// accumulate: two saves of the same slot+date during one workout must leave
// one pending write, not one per keystroke. An operation with no known
// identity (none exist today besides these two) falls back to null, which
// encolar() treats as "always append" rather than risk collapsing two
// unrelated writes into one.
function claveLogicaPendiente(pendiente) {
  if (pendiente.tipo === "registro") {
    return `registro:${pendiente.datos.slot}:${pendiente.datos.fecha}`;
  }
  if (pendiente.tipo === "preferencias") {
    return "preferencias";
  }
  if (pendiente.tipo === "rutina_bloque") {
    return `rutina_bloque:${pendiente.datos.diaClave}:${pendiente.datos.bloqueClave}`;
  }
  return null;
}

// Queues `operacion` ({tipo, entidad, datos}) for sync.js to send later.
// Assigns the id (callers never invent their own), and replaces — not
// appends to — any existing pending entry with the same logical key, so
// the queue stays bounded no matter how long the same field gets edited.
// Also stamps `encoladoEn` (now, once, here): sync.js's enviarOperacion()
// uses it as a fallback edit time for a "registro" pendiente whose
// marcarLocal() mark (see marcaDe() above) never made it to storage — it
// must never fall back to "now" at SEND time instead, or a device that
// merely syncs last would always look like it edited last, which is
// exactly the silent-data-loss bug this queue exists to avoid.
// Returns the id of the (possibly replacing) queued entry.
export function encolar(operacion) {
  const cola = leerJSON(LLAVE_COLA, []);
  const clave = claveLogicaPendiente(operacion);
  const sinDuplicado = clave == null ? cola : cola.filter((p) => claveLogicaPendiente(p) !== clave);
  const id = generarIdPendiente();
  sinDuplicado.push({ ...operacion, id, encoladoEn: new Date().toISOString() });
  escribirJSON(LLAVE_COLA, sinDuplicado);
  return id;
}

// Every pending operation, oldest first — the order sync.js sends them in.
export function pendientes() {
  const cola = leerJSON(LLAVE_COLA, []);
  return Array.isArray(cola) ? cola : [];
}

// Removes the pending operation `id` once sync.js confirms it was sent.
// Returns true if persisted, false if storage refused it — same contract
// as every other write here; sync.js keeps the item queued for a later
// retry in that case, same as it would for a failed send.
export function quitarPendiente(id) {
  const restante = pendientes().filter((p) => p.id !== id);
  return escribirJSON(LLAVE_COLA, restante);
}
