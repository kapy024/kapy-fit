// Translates the old positional localStorage keys (hierro:h:<dia>:<variante>:<indice>)
// into slug-keyed records via MAPA_LEGADO. Read-only until importar() is
// called, and never deletes the old keys — a bad translation must stay
// recoverable from the original data.
import { MAPA_LEGADO } from "./mapa-legado.js";
import { guardarRegistro } from "./almacen.js";

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

function aNumeroONull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Reads every old positional key and translates what it can via
// MAPA_LEGADO. Never writes anything — callers decide separately whether
// to persist the result via importar(). A position with no equivalent in
// MAPA_LEGADO (out of range, or a day/variant combination the map doesn't
// know) is reported as an orphan rather than silently dropped, same as a
// row with unreadable JSON or an unexpected shape.
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
      if (!f || !f.d) continue;
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
