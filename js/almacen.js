// The only module that touches localStorage. Records are keyed by exercise
// slug, never by position in a day, so reorganizing the split never orphans
// history. The legacy "hierro:" prefix is left untouched for the importer.
export const LLAVE_REGISTROS = "hierro2:registros";
export const LLAVE_PREFS = "hierro2:prefs";

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

// Returns every record for `slug`, ascending by date.
export function historial(slug) {
  const todo = leerJSON(LLAVE_REGISTROS, {});
  const lista = Array.isArray(todo[slug]) ? todo[slug] : [];
  return [...lista].sort((a, b) => a.fecha.localeCompare(b.fecha));
}

// Returns the record for `slug` on `fecha`, or null if there is none.
export function registroDe(slug, fecha) {
  return historial(slug).find((r) => r.fecha === fecha) ?? null;
}

// Replaces the record for `registro.fecha` under `slug` entirely (no
// merge with the previous record — the whole point of overwriting is that
// stale fields from a prior save don't survive), or appends it if that
// date has no record yet. Returns true if the write persisted, false if
// storage refused it (quota full or private mode); the caller decides how
// to tell the user, this function never throws for that case.
export function guardarRegistro(slug, registro) {
  const todo = leerJSON(LLAVE_REGISTROS, {});
  const lista = Array.isArray(todo[slug]) ? todo[slug] : [];
  const i = lista.findIndex((r) => r.fecha === registro.fecha);
  if (i >= 0) lista[i] = registro;
  else lista.push(registro);
  todo[slug] = lista;
  return escribirJSON(LLAVE_REGISTROS, todo);
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
