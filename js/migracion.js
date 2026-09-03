// Translates the old positional localStorage keys (hierro:h:<dia>:<variante>:<indice>)
// into slot-keyed records. Read-only until importar() is called, and never
// deletes the old keys — a bad translation must stay recoverable from the
// original data. localStorage is never touched directly here: almacen.js is
// the only module that does that (see llavesLegadas).
import { MAPA_LEGADO } from "./mapa-legado.js";
import { bloque } from "./rutina.js";
import { guardarRegistro, llavesLegadas } from "./almacen.js";
import { aNumeroONull } from "./unidades.js";

const PATRON = /^hierro:h:([^:]+):([^:]+):(\d+)$/;

// Old day/variant key → new day/block key. The split was reorganized between
// versions (the old "Día 1 — empuje general" is today's day 4, the old
// "bíceps" day is today's day 1), so the keys don't line up by name and this
// table is what bridges them. Paired with MAPA_LEGADO — which is frozen and
// must never be edited — it turns an old position into a new slot.
const MAPA_DIAS = Object.freeze({
  "dia1:_": "dia4:base",
  "dia2:_": "dia3:base",
  "core:_": "dia2:base",
  "biceps:v1": "dia1:v1",
  "biceps:v2": "dia1:v2",
  "dorsales:v1": "dia5:v1",
  "dorsales:v2": "dia5:v2",
  "dorsales:v3": "dia5:v3",
  "pierna:v1": "dia6:v1",
  "pierna:v2": "dia6:v2",
  "pierna:v3": "dia6:v3"
});

export function hayDatosViejos() {
  return llavesLegadas(PATRON).length > 0;
}

// Resolves one old position to a slot in the current routine. Matching is by
// occurrence, not by index: the 2nd "press-militar-barra" of the old block
// becomes the 2nd "press-militar-barra" of the new block, so the light and
// the heavy set keep their separate histories even though the surrounding
// exercises moved. Returns { slot } or { motivo } — never a bare undefined,
// because every failure has to reach the user as an orphan with a reason.
function resolverSlot(diaViejo, varianteVieja, indice) {
  const claveVieja = `${diaViejo}:${varianteVieja}`;
  const slugs = MAPA_LEGADO[claveVieja];
  const slug = slugs ? slugs[indice] : undefined;
  if (!slug) return { motivo: "posición sin equivalencia en el mapa" };

  const destino = MAPA_DIAS[claveVieja];
  if (!destino) return { slug, motivo: "día/variante sin equivalencia en la rutina nueva" };

  const [claveDia, claveBloque] = destino.split(":");
  const b = bloque(claveDia, claveBloque);
  if (!b) return { slug, motivo: `el bloque ${destino} ya no existe en la rutina` };

  // Which repetition of this slug the old position was (1-based).
  let ocurrencia = 0;
  for (let i = 0; i <= indice; i++) {
    if (slugs[i] === slug) ocurrencia++;
  }

  let vistas = 0;
  for (const e of b.ejercicios) {
    if (e.slug !== slug) continue;
    vistas++;
    if (vistas === ocurrencia) return { slug, slot: e.slot };
  }
  return { slug, motivo: `${slug} ya no está en ${destino}` };
}

// Reads every old positional key and translates what it can. Never writes
// anything — callers decide separately whether to persist the result via
// importar(). A position with no equivalent (out of range, a day/variant the
// map doesn't know, or an exercise that no longer exists in the block it
// moved to) is reported as an orphan rather than silently dropped, same as a
// row with unreadable JSON, an unexpected shape, a row that isn't an object,
// or a row missing its date — this is real user training history, and every
// failure mode must leave a trace instead of vanishing.
export function analizar() {
  const encontrados = [];
  const huerfanos = [];
  for (const { llave, crudo } of llavesLegadas(PATRON)) {
    const [, diaViejo, varianteVieja, indice] = llave.match(PATRON);
    const destino = resolverSlot(diaViejo, varianteVieja, Number(indice));
    if (!destino.slot) {
      huerfanos.push({ llave, motivo: destino.motivo });
      continue;
    }
    let filas;
    try {
      filas = JSON.parse(crudo);
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
        slot: destino.slot,
        slug: destino.slug,
        fecha: f.d,
        pesoKg: aNumeroONull(f.w),
        series: aNumeroONull(f.s),
        reps: f.r || null
      });
    }
  }
  return { encontrados, huerfanos };
}

// Persists `encontrados` via almacen.js. Returns how many records actually
// ended up stored, which is not the same as how many rows were handed in:
// two legacy rows for the same slot and date collapse into one record (the
// last one wins, same as any re-save), so counting them twice would report
// an import that didn't happen. A write refused by storage (quota full,
// private mode) isn't counted either. Never touches the old "hierro:" keys.
export function importar(encontrados) {
  const escritos = new Set();
  for (const r of encontrados) {
    const ok = guardarRegistro(r.slot, {
      fecha: r.fecha,
      slug: r.slug,
      pesoKg: r.pesoKg,
      series: r.series,
      reps: r.reps,
      hecho: true
    });
    if (ok) escritos.add(`${r.slot}|${r.fecha}`);
  }
  return escritos.size;
}
