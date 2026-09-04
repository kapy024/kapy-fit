// Pruebas de sync.js's descargar() para la rutina y el perfil (I3 de la
// revisión final: la rutina editada sube pero nunca baja). Mismo patrón que
// descarga.test.js (registros): un doble de js/db.js, nunca la red real, y
// cada caso inyecta sus propios `deps`. Separado de descarga.test.js porque
// las reglas y el estado local que le importan (edicionesRutina/
// marcasRutina, RUTINA en memoria) son distintos de los de un registro.
import { test, assertEq } from "./pruebas.js";
import { descargar, _reiniciarEstadoParaPruebas } from "./sync.js";
import { bloque, ejercicioPorSlot } from "./rutina.js";
import { aplicarEdicionABloque, cambiarValoresEjercicio } from "./editor-rutina.js";
import {
  pendientes, quitarPendiente, marcaDeRutina, preferencias, guardarPreferencias,
  LLAVE_REGISTROS, LLAVE_COLA, LLAVE_MARCAS, LLAVE_PREFS,
  LLAVE_EDICIONES_RUTINA, LLAVE_MARCAS_RUTINA
} from "./almacen.js";

function limpiar() {
  localStorage.removeItem(LLAVE_REGISTROS);
  localStorage.removeItem(LLAVE_COLA);
  localStorage.removeItem(LLAVE_MARCAS);
  localStorage.removeItem(LLAVE_PREFS);
  localStorage.removeItem(LLAVE_EDICIONES_RUTINA);
  localStorage.removeItem(LLAVE_MARCAS_RUTINA);
  _reiniciarEstadoParaPruebas();
}

function snapshotBloque(diaClave, bloqueClave) {
  return bloque(diaClave, bloqueClave).ejercicios.map((e) => ({ ...e }));
}

// Restores a block to a prior snapshot AND wipes whatever the test queued
// or persisted — same helper editor-rutina.test.js uses, duplicated here
// (a handful of lines) rather than shared, so the two files stay free to
// evolve their setup independently, same reasoning campoTexto() in
// editor-rutina.js gives for not sharing with registro.js's version.
function restaurar(diaClave, bloqueClave, snapshot) {
  aplicarEdicionABloque(diaClave, bloqueClave, snapshot);
  limpiar();
}

// Marks a block "already synced" — its pendiente removed from the queue,
// as it would be right after a successful upload — while keeping the local
// edit and its mark (marcaDeRutina) exactly as guardarEdicionBloque left
// them. Mirrors descarga.test.js's guardarYaSincronizado() for registros.
function bloqueYaSincronizado(diaClave, bloqueClave, slot, cambios) {
  cambiarValoresEjercicio(diaClave, bloqueClave, slot, cambios);
  const pendiente = pendientes().find((p) => p.tipo === "rutina_bloque");
  quitarPendiente(pendiente.id);
}

// A full block's worth of `routine_exercises` rows, in the exact nested
// shape descargarRutina()'s select would return — one row per exercise in
// `original` (never fewer: descargarRutina() REPLACES the block's whole
// local list with what it receives, so a test that means "one field of one
// row changed on the server" must still send every row, or it would look
// like every other row got deleted). `overridesPorIndice` patches specific
// rows (e.g. `{0: {peso_objetivo_kg: 77}}`) to model what actually differs
// from `original`.
function filasComoOriginal(diaClave, bloqueClave, original, editadoEn, overridesPorIndice = {}) {
  return original.map((e, i) => ({
    exercise_slug: e.slug,
    slot: e.slot,
    posicion: i + 1,
    series: e.series,
    reps: e.reps,
    peso_objetivo_kg: e.pesoKg,
    descanso: e.descanso,
    nota: e.nota,
    editado_en: editadoEn,
    routine_blocks: { clave: bloqueClave, routine_days: { clave: diaClave, routines: { user_id: "u1" } } },
    ...(overridesPorIndice[i] || {})
  }));
}

// Doble mínimo del cliente de Supabase: solo implementa
// .from(tabla).select(cols).eq(campo, valor), que es lo único que
// descargar() (registros, rutina, perfil) llama.
function clienteDescargaFalso({ registros = [], rutina = [], perfil = null } = {}) {
  return {
    from(tabla) {
      return {
        select(_cols) {
          return {
            eq(_campo, _valor) {
              if (tabla === "exercise_logs") return Promise.resolve({ data: registros, error: null });
              if (tabla === "routine_exercises") return Promise.resolve({ data: rutina, error: null });
              if (tabla === "profiles") return Promise.resolve({ data: perfil ? [perfil] : [], error: null });
              return Promise.resolve({ data: [], error: null });
            }
          };
        }
      };
    }
  };
}

function depsCon(filas) {
  return {
    hayConfig: () => true,
    sesionActual: async () => ({ user: { id: "u1" } }),
    cliente: async () => clienteDescargaFalso(filas)
  };
}

// --- rutina: baja y se aplica al bloque local ---

test("descargar trae la rutina del servidor y la aplica al bloque local", async () => {
  limpiar();
  const original = snapshotBloque("dia3", "base");
  const filas = filasComoOriginal("dia3", "base", original, "2026-01-01T00:00:00.000Z", {
    0: { peso_objetivo_kg: 77 }
  });

  const r = await descargar(depsCon({ rutina: filas }));

  assertEq(r.rutinaAplicada, 1);
  assertEq(ejercicioPorSlot(original[0].slot).pesoKg, 77);
  assertEq(marcaDeRutina("dia3", "base"), "2026-01-01T00:00:00.000Z");

  restaurar("dia3", "base", original);
});

test("una edición de rutina local sin subir no se pisa con la del servidor", async () => {
  limpiar();
  const original = snapshotBloque("dia3", "base");
  cambiarValoresEjercicio("dia3", "base", original[0].slot, { pesoKg: 99 });
  assertEq(pendientes().filter((p) => p.tipo === "rutina_bloque").length, 1, "el bloque debe seguir en la cola");

  // Fecha de servidor absurdamente futura: si la regla de la cola no se
  // respetara, esto ganaría igual por marca de tiempo.
  const filas = filasComoOriginal("dia3", "base", original, "2099-01-01T00:00:00.000Z", {
    0: { peso_objetivo_kg: 5 }
  });
  const r = await descargar(depsCon({ rutina: filas }));

  assertEq(r.rutinaAplicada, 0);
  assertEq(ejercicioPorSlot(original[0].slot).pesoKg, 99, "lo local sin subir no se pisa");
  assertEq(pendientes().filter((p) => p.tipo === "rutina_bloque").length, 1, "descargar no toca la cola de subida");

  restaurar("dia3", "base", original);
});

test("un bloque editado en ambos lados se resuelve por marca: gana el servidor si es más nuevo", async () => {
  limpiar();
  const original = snapshotBloque("dia3", "base");
  bloqueYaSincronizado("dia3", "base", original[0].slot, { pesoKg: 20 });

  const marcaLocal = marcaDeRutina("dia3", "base");
  const marcaServidor = new Date(new Date(marcaLocal).getTime() + 60000).toISOString();
  const filas = filasComoOriginal("dia3", "base", original, marcaServidor, { 0: { peso_objetivo_kg: 30 } });

  const r = await descargar(depsCon({ rutina: filas }));

  assertEq(r.rutinaAplicada, 1);
  assertEq(ejercicioPorSlot(original[0].slot).pesoKg, 30, "el servidor es más nuevo, debe ganar");

  restaurar("dia3", "base", original);
});

test("un bloque editado en ambos lados se resuelve por marca: gana lo local si es más nuevo", async () => {
  limpiar();
  const original = snapshotBloque("dia3", "base");
  bloqueYaSincronizado("dia3", "base", original[0].slot, { pesoKg: 20 });

  // El servidor trae una fila con editado_en muy vieja: la marca local
  // (tomada al editar, hace un instante) es más reciente.
  const filas = filasComoOriginal("dia3", "base", original, "2000-01-01T00:00:00.000Z", {
    0: { peso_objetivo_kg: 30 }
  });
  const r = await descargar(depsCon({ rutina: filas }));

  assertEq(r.rutinaAplicada, 0);
  assertEq(ejercicioPorSlot(original[0].slot).pesoKg, 20, "lo local es más nuevo, debe conservarse");

  restaurar("dia3", "base", original);
});

test("descargar la rutina dos veces no la vuelve a aplicar ni la revierte", async () => {
  limpiar();
  const original = snapshotBloque("dia3", "base");
  const filas = filasComoOriginal("dia3", "base", original, "2026-01-01T00:00:00.000Z", {
    0: { peso_objetivo_kg: 77 }
  });
  const deps = depsCon({ rutina: filas });

  const r1 = await descargar(deps);
  assertEq(r1.rutinaAplicada, 1);
  assertEq(ejercicioPorSlot(original[0].slot).pesoKg, 77);

  const r2 = await descargar(deps);
  assertEq(r2.rutinaAplicada, 0, "la misma marca (editado_en igual) no debe volver a aplicarse");
  assertEq(ejercicioPorSlot(original[0].slot).pesoKg, 77, "sigue igual, no se revierte ni se duplica");

  restaurar("dia3", "base", original);
});

test("sin sesión, descargar no toca la rutina", async () => {
  limpiar();
  const original = snapshotBloque("dia3", "base");
  const filas = filasComoOriginal("dia3", "base", original, "2026-01-01T00:00:00.000Z", { 0: { peso_objetivo_kg: 77 } });

  const r = await descargar({
    hayConfig: () => true,
    sesionActual: async () => null,
    cliente: async () => clienteDescargaFalso({ rutina: filas })
  });

  assertEq(r, { traidos: 0, detalle: "sin sesión" });
  assertEq(ejercicioPorSlot(original[0].slot).pesoKg, original[0].pesoKg);

  restaurar("dia3", "base", original);
});

// --- perfil: la unidad también baja ---

test("descargar trae el perfil del servidor y actualiza la unidad", async () => {
  limpiar();
  assertEq(preferencias().unidad, "kg");

  const r = await descargar(depsCon({ perfil: { unidad: "lb" } }));

  assertEq(r.perfilAplicado, true);
  assertEq(preferencias().unidad, "lb");
});

test("una preferencia local pendiente de subir no se pisa con la del servidor", async () => {
  limpiar();
  guardarPreferencias({ unidad: "lb" });
  assertEq(pendientes().filter((p) => p.tipo === "preferencias").length, 1);

  const r = await descargar(depsCon({ perfil: { unidad: "kg" } }));

  assertEq(r.perfilAplicado, false);
  assertEq(preferencias().unidad, "lb", "lo local sin subir no se pisa");
});
