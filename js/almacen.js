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

// Returns every record of one routine row (`slot`), ascending by date.
export function historialDeSlot(slot) {
  const todo = leerJSON(LLAVE_REGISTROS, {});
  const lista = Array.isArray(todo[slot]) ? todo[slot] : [];
  return [...lista].sort((a, b) => a.fecha.localeCompare(b.fecha));
}

// Returns every record of `slug` across ALL slots, ascending by date. This
// is the exercise-level view — the one the future charts consume: the same
// exercise logged on day 3 and on day 6, or in two different variants, is
// one history. Rows written before slugs were stored (there should be none,
// the prefix was bumped) simply don't match and are skipped.
export function historial(slug) {
  const todo = leerJSON(LLAVE_REGISTROS, {});
  const juntos = [];
  for (const slot of Object.keys(todo)) {
    const lista = Array.isArray(todo[slot]) ? todo[slot] : [];
    for (const r of lista) {
      if (r && r.slug === slug) juntos.push(r);
    }
  }
  return juntos.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

// Returns the record of `slot` on `fecha`, or null if there is none.
export function registroDe(slot, fecha) {
  return historialDeSlot(slot).find((r) => r.fecha === fecha) ?? null;
}

// Replaces the record for `registro.fecha` under `slot` entirely (no
// merge with the previous record — the whole point of overwriting is that
// stale fields from a prior save don't survive), or appends it if that
// date has no record yet. `registro` is expected to carry its `slug`, so
// historial(slug) can find it later. Returns true if the write persisted,
// false if storage refused it (quota full or private mode); the caller
// decides how to tell the user, this function never throws for that case.
export function guardarRegistro(slot, registro) {
  const todo = leerJSON(LLAVE_REGISTROS, {});
  const lista = Array.isArray(todo[slot]) ? todo[slot] : [];
  const i = lista.findIndex((r) => r.fecha === registro.fecha);
  if (i >= 0) lista[i] = registro;
  else lista.push(registro);
  todo[slot] = lista;
  return escribirJSON(LLAVE_REGISTROS, todo);
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

// Returns the saved preferences, defaulting `unidad` to "kg" both when
// nothing was saved and when what was saved isn't a unit this app
// understands (e.g. hand-edited storage, or a future format change) —
// unidades.js throws on anything else, so this is the one place that
// must never hand it garbage.
export function preferencias() {
  const guardadas = leerJSON(LLAVE_PREFS, {});
  const unidad = guardadas.unidad === "lb" ? "lb" : "kg";
  return { ...guardadas, unidad };
}

// Merges `prefs` into the saved preferences and persists the result.
// Returns true if the write persisted, false if storage refused it.
export function guardarPreferencias(prefs) {
  return escribirJSON(LLAVE_PREFS, { ...preferencias(), ...prefs });
}
