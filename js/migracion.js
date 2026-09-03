// Translates the old positional localStorage keys (hierro:h:<dia>:<variante>:<indice>)
// into slug-keyed records via MAPA_LEGADO. Read-only until importar() is
// called, and never deletes the old keys — a bad translation must stay
// recoverable from the original data.
import { MAPA_LEGADO } from "./mapa-legado.js";
import { guardarRegistro } from "./almacen.js";
import { aNumeroONull } from "./unidades.js";

const PATRON = /^hierro:h:([^:]+):([^:]+):(\d+)$/;

function llavesViejas() {
  try {
    return Object.keys(localStorage).filter((k) => PATRON.test(k));
  } catch (_) {
    return [];
  }
}

export function hayDatosViejos() {
  return llavesViejas().length > 0;
}

// Reads every old positional key and translates what it can via
// MAPA_LEGADO. Never writes anything — callers decide separately whether
// to persist the result via importar(). A position with no equivalent in
// MAPA_LEGADO (out of range, or a day/variant combination the map doesn't
// know) is reported as an orphan rather than silently dropped, same as a
// row with unreadable JSON, an unexpected shape, a row that isn't an
// object, or a row missing its date — this is real user training history,
// and every failure mode must leave a trace instead of vanishing.
export function analizar() {
  const encontrados = [];
  const huerfanos = [];
  for (const llave of llavesViejas()) {
    const [, dia, variante, indice] = llave.match(PATRON);
    const slugs = MAPA_LEGADO[`${dia}:${variante}`];
    const slug = slugs ? slugs[Number(indice)] : undefined;
    if (!slug) {
      huerfanos.push({ llave, motivo: "posición sin equivalencia en el mapa" });
      continue;
    }
    let filas;
    try {
      filas = JSON.parse(localStorage.getItem(llave));
    } catch (_) {
      huerfanos.push({ llave, motivo: "JSON ilegible" });
      continue;
    }
    if (!Array.isArray(filas)) {
      huerfanos.push({ llave, motivo: "no es una lista de registros" });
      continue;
    }
    for (const f of filas) {
      if (!f || typeof f !== "object") {
        huerfanos.push({ llave, motivo: "registro no es un objeto" });
        continue;
      }
      if (!f.d) {
        huerfanos.push({ llave, motivo: "registro sin fecha" });
        continue;
      }
      encontrados.push({
        slug,
        fecha: f.d,
        pesoKg: aNumeroONull(f.w),
        series: aNumeroONull(f.s),
        reps: f.r || null
      });
    }
  }
  return { encontrados, huerfanos };
}

// Persists `encontrados` via almacen.js. Returns the number of records
// actually written — guardarRegistro() reports false when storage refuses
// the write (quota full or private mode), and a refused write must not be
// counted as imported. Never touches the old "hierro:" keys.
export function importar(encontrados) {
  let escritos = 0;
  for (const r of encontrados) {
    const ok = guardarRegistro(r.slug, { fecha: r.fecha, pesoKg: r.pesoKg, series: r.series, reps: r.reps, hecho: true });
    if (ok) escritos++;
  }
  return escritos;
}
