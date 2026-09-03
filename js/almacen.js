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
    return porOmision;
  }
}

function escribirJSON(llave, valor) {
  try {
    localStorage.setItem(llave, JSON.stringify(valor));
  } catch (_) {
    // Storage full or blocked (private mode). The in-page state stays correct.
  }
}

export function hoyISO() {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

export function historial(slug) {
  const todo = leerJSON(LLAVE_REGISTROS, {});
  const lista = Array.isArray(todo[slug]) ? todo[slug] : [];
  return [...lista].sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export function registroDe(slug, fecha) {
  return historial(slug).find((r) => r.fecha === fecha) ?? null;
}

export function guardarRegistro(slug, registro) {
  const todo = leerJSON(LLAVE_REGISTROS, {});
  const lista = Array.isArray(todo[slug]) ? todo[slug] : [];
  const i = lista.findIndex((r) => r.fecha === registro.fecha);
  if (i >= 0) lista[i] = { ...lista[i], ...registro };
  else lista.push(registro);
  todo[slug] = lista;
  escribirJSON(LLAVE_REGISTROS, todo);
}

export function preferencias() {
  return { unidad: "kg", ...leerJSON(LLAVE_PREFS, {}) };
}

export function guardarPreferencias(prefs) {
  escribirJSON(LLAVE_PREFS, { ...preferencias(), ...prefs });
}
