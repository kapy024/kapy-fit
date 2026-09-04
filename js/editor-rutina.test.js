// Pruebas de la edición de la rutina propia (tarea 11). Casos centrales del
// brief: cambiar el peso objetivo nunca toca el historial; sustituir un
// ejercicio cambia el slot pero conserva el historial del slot anterior
// (decisión explícita: se queda donde está, no se borra ni se muda); quitar
// un ejercicio tampoco borra nada; reordenar no cambia ningún slot salvo el
// sufijo de ocurrencia cuando el slug se repite en el bloque, que sí hay que
// recalcular. La subida a Supabase (routine_exercises) se prueba con un
// doble — nunca la red real, como el resto de la suite.
import { test, assertEq, assertThrows } from "./pruebas.js";
import { bloque, ejercicioPorSlot } from "./rutina.js";
import {
  historialDeSlot, guardarRegistro, pendientes, marcarAdopcionResuelta,
  edicionesRutina, marcaDeRutina,
  LLAVE_REGISTROS, LLAVE_COLA, LLAVE_MARCAS, LLAVE_EDICIONES_RUTINA, LLAVE_MARCAS_RUTINA
} from "./almacen.js";
import { sincronizar, _reiniciarEstadoParaPruebas } from "./sync.js";
import {
  aplicarEdicionABloque, cambiarValoresEjercicio, sustituirEjercicio,
  quitarEjercicio, moverEjercicio, modoEdicionActivo, _reiniciarModoParaPruebas,
  pintarBotonModoEdicion
} from "./editor-rutina.js";

// Every case mutates the shared RUTINA singleton (same object render.js/
// app.js read from) — same as sync.test.js does with localStorage, each
// case snapshots the block it touches and restores it before returning, so
// no test here leaks state into the next one. This file is imported LAST in
// tests.html precisely so any leak, if one slipped through, could only ever
// affect itself.
function limpiar() {
  localStorage.removeItem(LLAVE_REGISTROS);
  localStorage.removeItem(LLAVE_COLA);
  localStorage.removeItem(LLAVE_MARCAS);
  localStorage.removeItem(LLAVE_EDICIONES_RUTINA);
  localStorage.removeItem(LLAVE_MARCAS_RUTINA);
  _reiniciarEstadoParaPruebas();
  _reiniciarModoParaPruebas();
  marcarAdopcionResuelta();
}

function snapshotBloque(diaClave, bloqueClave) {
  return bloque(diaClave, bloqueClave).ejercicios.map((e) => ({ ...e }));
}

// Restores a block to a prior snapshot (pure in-memory — aplicarEdicionABloque
// never touches storage) and wipes whatever the test's own edits queued or
// persisted, so the next test starts clean.
function restaurar(diaClave, bloqueClave, snapshot) {
  aplicarEdicionABloque(diaClave, bloqueClave, snapshot);
  limpiar();
}

function reg(fecha, slug, extra) {
  return { fecha, slug, pesoKg: 10, series: 3, reps: "10", hecho: true, ...extra };
}

// --- cambiar peso objetivo / series / reps: nunca toca el historial ---

test("cambiar el peso objetivo no modifica ningún registro histórico ni el slot", () => {
  limpiar();
  const original = snapshotBloque("dia3", "base");
  const slot = "dia3:base:sentadilla";
  guardarRegistro(slot, reg("2020-01-01", "sentadilla"));
  const historialAntes = historialDeSlot(slot);

  const ok = cambiarValoresEjercicio("dia3", "base", slot, { pesoKg: 99 });
  assertEq(ok, true);
  assertEq(ejercicioPorSlot(slot).pesoKg, 99);
  assertEq(ejercicioPorSlot(slot).slot, slot, "el slot no cambia al editar valores");
  assertEq(historialDeSlot(slot), historialAntes, "el historial no cambia");

  restaurar("dia3", "base", original);
  localStorage.removeItem(LLAVE_REGISTROS);
});

test("cambiar series/reps se refleja en RUTINA y se guarda localmente", () => {
  limpiar();
  const original = snapshotBloque("dia3", "base");
  const slot = "dia3:base:sentadilla";

  cambiarValoresEjercicio("dia3", "base", slot, { series: 5, reps: "8" });
  assertEq(ejercicioPorSlot(slot).series, 5);
  assertEq(ejercicioPorSlot(slot).reps, "8");
  const guardado = edicionesRutina()["dia3:base"];
  assertEq(guardado.find((x) => x.slot === slot).series, 5);

  restaurar("dia3", "base", original);
});

test("un peso vacío limpia pesoKg (null) en vez de dejarlo como estaba", () => {
  limpiar();
  const original = snapshotBloque("dia3", "base");
  const slot = "dia3:base:sentadilla";
  cambiarValoresEjercicio("dia3", "base", slot, { pesoKg: 40 });
  cambiarValoresEjercicio("dia3", "base", slot, { pesoKg: null });
  assertEq(ejercicioPorSlot(slot).pesoKg, null);
  restaurar("dia3", "base", original);
});

test("editar un slot que no existe en el bloque no hace nada y no lanza", () => {
  limpiar();
  const original = snapshotBloque("dia3", "base");
  const ok = cambiarValoresEjercicio("dia3", "base", "dia3:base:no-existe", { series: 1 });
  assertEq(ok, false);
  assertEq(snapshotBloque("dia3", "base"), original);
});

// --- sustituir: cambia el slot, conserva el historial del slot anterior ---

test("sustituir un ejercicio cambia el slot y conserva el historial del slot anterior", () => {
  limpiar();
  const original = snapshotBloque("dia3", "base");
  const slotViejo = "dia3:base:sentadilla";
  guardarRegistro(slotViejo, reg("2020-01-01", "sentadilla"));

  const ok = sustituirEjercicio("dia3", "base", slotViejo, "sentadilla-salto");
  assertEq(ok, true);

  const slotNuevo = "dia3:base:sentadilla-salto";
  assertEq(ejercicioPorSlot(slotNuevo).slug, "sentadilla-salto");

  // Decisión explícita del brief: el historial del slot viejo SE CONSERVA
  // tal cual — no se mueve al nuevo slot ni se borra, porque son
  // entrenamientos que sí ocurrieron.
  assertEq(historialDeSlot(slotViejo).length, 1, "el historial del slot viejo se conserva");
  assertEq(historialDeSlot(slotNuevo).length, 0, "el slot nuevo empieza sin historial propio");

  restaurar("dia3", "base", original);
  localStorage.removeItem(LLAVE_REGISTROS);
});

test("sustituir resetea peso objetivo y nota, pero conserva series/reps/descanso como punto de partida", () => {
  limpiar();
  const original = snapshotBloque("dia3", "base");
  sustituirEjercicio("dia3", "base", "dia3:base:sentadilla", "sentadilla-salto");
  const e = ejercicioPorSlot("dia3:base:sentadilla-salto");
  assertEq(e.pesoKg, null);
  assertEq(e.nota, null);
  assertEq(e.series, original[0].series);
  assertEq(e.reps, original[0].reps);
  restaurar("dia3", "base", original);
});

test("sustituir por un slug que no existe en el catálogo lanza y no cambia nada", () => {
  limpiar();
  const original = snapshotBloque("dia3", "base");
  assertThrows(() => sustituirEjercicio("dia3", "base", "dia3:base:sentadilla", "no-existe"));
  assertEq(snapshotBloque("dia3", "base"), original);
});

// --- quitar: tampoco borra historial ---

// Nota (C2, revisión final): esta prueba afirmaba antes que quitar la
// primera ocurrencia renombraba la segunda a "dia1:v1:press-militar-barra"
// (sufijo recalculado por posición) — y con ese renombre, heredaba el
// registro de la fila que se fue. Eso era el defecto, no el
// comportamiento correcto: el slot de la fila sobreviviente ahora es una
// identidad estable que no se mueve cuando otra fila desaparece, así que
// su propio registro (guardado bajo SU slot) nunca queda atribuido a otra.
test("quitar un ejercicio no borra su historial y no le cambia el slot a las demás filas (C2)", () => {
  limpiar();
  const original = snapshotBloque("dia1", "v1");
  // dia1/v1 empieza con dos "press-militar-barra" (ver rutina.js): la
  // primera fila sin sufijo, la segunda "#2".
  const slotUno = original[0].slot;
  const slotDos = original[1].slot;
  assertEq(slotUno, "dia1:v1:press-militar-barra");
  assertEq(slotDos, "dia1:v1:press-militar-barra#2");
  guardarRegistro(slotUno, reg("2020-01-01", "press-militar-barra"));
  guardarRegistro(slotDos, reg("2020-01-02", "press-militar-barra"));

  const ok = quitarEjercicio("dia1", "v1", slotUno);
  assertEq(ok, true);
  assertEq(bloque("dia1", "v1").ejercicios.length, original.length - 1);

  // La fila que sobrevive (la que era la segunda ocurrencia) CONSERVA su
  // propio slot — con el "#2" y todo — en vez de heredar el de la fila que
  // se fue. Se identifica por su nota (distinta de la primera).
  const restante = bloque("dia1", "v1").ejercicios[0];
  assertEq(restante.nota, original[1].nota, "sobrevive la que era la segunda ocurrencia");
  assertEq(restante.slot, slotDos, "conserva su propio slot, no hereda el de la fila quitada");

  // Ninguno de los dos historiales originales se borró, y cada uno se lee
  // todavía bajo el slot al que en verdad pertenece.
  assertEq(historialDeSlot(slotUno).length, 1);
  assertEq(historialDeSlot(slotDos).length, 1);
  assertEq(historialDeSlot(slotDos)[0].fecha, "2020-01-02", "el registro de la fila sobreviviente sigue siendo el suyo, no el de la que se fue");

  restaurar("dia1", "v1", original);
  localStorage.removeItem(LLAVE_REGISTROS);
});

test("quitar el único ejercicio de un slug no le deja sufijo a nadie más", () => {
  limpiar();
  const original = snapshotBloque("dia3", "base");
  const slot = "dia3:base:sentadilla";
  quitarEjercicio("dia3", "base", slot);
  assertEq(ejercicioPorSlot(slot), null);
  assertEq(bloque("dia3", "base").ejercicios.length, original.length - 1);
  restaurar("dia3", "base", original);
});

// --- reordenar: el slot no depende de la posición, salvo el sufijo ---

test("reordenar ejercicios con slug distinto no cambia ningún slot", () => {
  limpiar();
  const original = snapshotBloque("dia3", "base");
  moverEjercicio("dia3", "base", original[0].slot, 1);
  for (const e of original) {
    assertEq(ejercicioPorSlot(e.slot).slug, e.slug, `${e.slot} debe seguir señalando al mismo ejercicio`);
  }
  restaurar("dia3", "base", original);
});

// Nota (C2, revisión final): esta prueba afirmaba antes que reordenar
// intercambiaba las identidades ("el sufijo lo decide la posición") — así
// que la fila que aparecía primero después del intercambio se leía (y se
// guardaba) bajo el slot que antes era del otro renglón. Eso era el mismo
// defecto que en quitarEjercicio: el slot es una identidad estable de la
// fila, viaja CON ella, nunca con la posición que ocupa.
test("reordenar dos ocurrencias del mismo slug no les cambia el slot: cada fila conserva su identidad (C2)", () => {
  limpiar();
  const original = snapshotBloque("dia1", "v1");
  const slotPrimeroAntes = original[0].slot;
  const slotSegundoAntes = original[1].slot;
  const notaPrimeroAntes = original[0].nota;
  const notaSegundoAntes = original[1].nota;

  moverEjercicio("dia1", "v1", original[0].slot, 1); // intercambia posiciones 1 y 2

  const despues = bloque("dia1", "v1").ejercicios;
  // Cambian de POSICIÓN (la que era segunda ahora se dibuja primero)...
  assertEq(despues[0].nota, notaSegundoAntes);
  assertEq(despues[1].nota, notaPrimeroAntes);
  // ...pero cada una sigue siendo la misma fila de antes: su slot viaja
  // con ella, no con el lugar que ocupa en el bloque.
  assertEq(despues[0].slot, slotSegundoAntes);
  assertEq(despues[1].slot, slotPrimeroAntes);

  restaurar("dia1", "v1", original);
});

test("mover en el extremo del bloque no hace nada", () => {
  limpiar();
  const original = snapshotBloque("dia3", "base");
  const okArriba = moverEjercicio("dia3", "base", original[0].slot, -1);
  assertEq(okArriba, false);
  const okAbajo = moverEjercicio("dia3", "base", original[original.length - 1].slot, 1);
  assertEq(okAbajo, false);
  assertEq(snapshotBloque("dia3", "base"), original);
});

// --- persistencia local (recargar) ---

test("lo que guardarEdicionBloque persiste, aplicarEdicionABloque lo reconstruye igual", () => {
  limpiar();
  const original = snapshotBloque("dia4", "base");
  cambiarValoresEjercicio("dia4", "base", original[0].slot, { pesoKg: 77 });
  const guardado = edicionesRutina()["dia4:base"];

  // Simula lo que pasa en un reload real: este módulo reconstruye el
  // bloque desde cero a partir de lo guardado, al importarse.
  aplicarEdicionABloque("dia4", "base", guardado);
  assertEq(bloque("dia4", "base").ejercicios[0].pesoKg, 77);
  assertEq(bloque("dia4", "base").ejercicios.length, original.length);

  restaurar("dia4", "base", original);
});

// --- modo de edición ---

test("el modo de edición empieza apagado y el botón lo enciende/apaga", () => {
  limpiar();
  assertEq(modoEdicionActivo(), false);
  let repintados = 0;
  const btn1 = pintarBotonModoEdicion(() => { repintados++; });
  assertEq(btn1.getAttribute("aria-pressed"), "false");
  assertEq(btn1.textContent, "Editar rutina");

  btn1.click();
  assertEq(modoEdicionActivo(), true);
  assertEq(repintados, 1, "el botón repinta al alternar");

  const btn2 = pintarBotonModoEdicion(() => {});
  assertEq(btn2.getAttribute("aria-pressed"), "true");
  assertEq(btn2.textContent, "Listo");

  _reiniciarModoParaPruebas();
});

// --- subida a Supabase (routine_exercises) — con doble, nunca red real ---

// Faithful-enough stand-in for the two things enviarEdicionBloque (sync.js)
// touches: routine_blocks (one nested select, filtered down to the block —
// this double never checks the .eq() filters themselves, since that's
// PostgREST's job to get right, not sync.js's) and
// subir_edicion_rutina(...) (sql/008_rutina_sincronizada.sql) — a write only
// applies when its p_editado_en is strictly newer than what's stored (same
// `<`, not `<=`, as the real `where` clause), and it always reports back
// {aplicado, fila}: whether this call's write is the one that won, and the
// row that actually ended up stored — exactly the server's contract, so
// sync.js's handling of a lost conflict can be tested without a real
// database. `filasRemotas` models what the server already has for this
// block, as [{id, posicion, editado_en, ...}] — the same shape a real
// nested select (plus editado_en) would return. `rechazarTodo` simulates
// every row in the block already having something newer than whatever
// p_editado_en this test sends, regardless of the row's own editado_en.
function clienteRutinaFalso(filasRemotas, { rechazarTodo = false } = {}) {
  const llamadas = { rpc: [], deletes: [] };
  const filas = new Map(filasRemotas.map((f) => [f.id, { ...f }]));
  const cliente = {
    from(tabla) {
      if (tabla === "routine_blocks") {
        return {
          select() { return this; },
          eq() { return this; },
          async single() {
            const restantes = [...filas.values()]
              .sort((a, b) => a.posicion - b.posicion)
              .map((f) => ({ id: f.id, posicion: f.posicion }));
            return { data: { id: "block-1", routine_exercises: restantes }, error: null };
          }
        };
      }
      if (tabla === "routine_exercises") {
        return {
          delete() {
            return {
              eq(_col, id) {
                llamadas.deletes.push(id);
                filas.delete(id);
                return Promise.resolve({ error: null });
              }
            };
          }
        };
      }
      throw new Error(`tabla inesperada en la prueba: ${tabla}`);
    },
    rpc(nombreFn, params) {
      llamadas.rpc.push(params);
      if (nombreFn !== "subir_edicion_rutina") throw new Error(`rpc inesperada: ${nombreFn}`);
      const existente = filas.get(params.p_id);
      if (!existente) return Promise.resolve({ data: null, error: { message: "renglón inexistente" } });
      const gana = !rechazarTodo && new Date(existente.editado_en || 0) < new Date(params.p_editado_en);
      if (!gana) {
        return Promise.resolve({ data: { aplicado: false, fila: existente }, error: null });
      }
      const fila = {
        id: params.p_id,
        exercise_slug: params.p_exercise_slug,
        slot: params.p_slot,
        posicion: params.p_posicion,
        series: params.p_series,
        reps: params.p_reps,
        peso_objetivo_kg: params.p_peso_objetivo_kg,
        descanso: params.p_descanso,
        nota: params.p_nota,
        editado_en: params.p_editado_en
      };
      filas.set(params.p_id, fila);
      return Promise.resolve({ data: { aplicado: true, fila }, error: null });
    }
  };
  return { cliente, llamadas, filas };
}

function depsConCliente(cliente) {
  return {
    hayConfig: () => true,
    cliente: async () => cliente,
    sesionActual: async () => ({ user: { id: "u1" } }),
    alCambiarSesion: () => () => {}
  };
}

// editado_en deliberadamente muy vieja: cualquier p_editado_en real que
// mande sincronizar() (marcaDeRutina(), estampada al editar) le gana sin
// esfuerzo, así que las pruebas que no son sobre el conflicto en sí no
// tienen que preocuparse por fechas.
function filasRemotasPara(lista) {
  return lista.map((_, i) => ({ id: `re-${i}`, posicion: i + 1, editado_en: "2000-01-01T00:00:00.000Z" }));
}

test("sincronizar sube el bloque editado: actualiza cada renglón remoto por posición", async () => {
  limpiar();
  const original = snapshotBloque("dia3", "base");
  cambiarValoresEjercicio("dia3", "base", original[0].slot, { pesoKg: 55 });

  const { cliente, llamadas } = clienteRutinaFalso(filasRemotasPara(original));
  const r = await sincronizar(depsConCliente(cliente));

  assertEq(r.fallidos, 0);
  assertEq(llamadas.rpc.length, original.length);
  assertEq(llamadas.rpc[0].p_id, "re-0");
  assertEq(llamadas.rpc[0].p_peso_objetivo_kg, 55);
  assertEq(llamadas.rpc[0].p_exercise_slug, original[0].slug);
  assertEq(llamadas.deletes.length, 0);
  assertEq(pendientes().length, 0, "el pendiente se drena tras subir con éxito");

  restaurar("dia3", "base", original);
});

test("sincronizar sube una sustitución: el exercise_slug y el slot del renglón cambian", async () => {
  limpiar();
  const original = snapshotBloque("dia3", "base");
  sustituirEjercicio("dia3", "base", original[0].slot, "sentadilla-salto");

  const { cliente, llamadas } = clienteRutinaFalso(filasRemotasPara(original));
  const r = await sincronizar(depsConCliente(cliente));

  assertEq(r.fallidos, 0);
  assertEq(llamadas.rpc[0].p_exercise_slug, "sentadilla-salto");
  assertEq(llamadas.rpc[0].p_slot, "dia3:base:sentadilla-salto");

  restaurar("dia3", "base", original);
});

test("sincronizar borra en la nube el renglón que sobra cuando el bloque encoge (quitar)", async () => {
  limpiar();
  const original = snapshotBloque("dia3", "base");
  quitarEjercicio("dia3", "base", original[0].slot);

  // El servidor todavía tiene el conteo VIEJO — es justo lo que la subida
  // debe corregir borrando el renglón que ya no corresponde a nada local.
  const { cliente, llamadas } = clienteRutinaFalso(filasRemotasPara(original));
  const r = await sincronizar(depsConCliente(cliente));

  assertEq(r.fallidos, 0);
  assertEq(llamadas.rpc.length, original.length - 1);
  assertEq(llamadas.deletes, [`re-${original.length - 1}`]);

  restaurar("dia3", "base", original);
});

// --- I3: la subida usa la función condicional, no updates ciegos ---

test("sincronizar un pendiente de rutina rechazado por antigüedad se quita de la cola y corrige el bloque local", async () => {
  limpiar();
  const original = snapshotBloque("dia3", "base");
  cambiarValoresEjercicio("dia3", "base", original[0].slot, { pesoKg: 111 });

  // El servidor ya tiene, para ese mismo renglón, algo editado DESPUÉS de
  // que este dispositivo hizo su propia escritura — simula lo que habría
  // subido otro dispositivo mientras este estaba sin red. Los demás
  // renglones del bloque siguen con su editado_en viejo (filasRemotasPara),
  // así que ganan sin problema: el rechazo es de UN renglón, no del bloque
  // completo, y aun así corrige el bloque entero de una vez.
  const marcaLocal = marcaDeRutina("dia3", "base");
  const marcaServidor = new Date(new Date(marcaLocal).getTime() + 60000).toISOString();
  const filasRemotas = filasRemotasPara(original);
  filasRemotas[0] = {
    id: "re-0",
    posicion: 1,
    exercise_slug: original[0].slug,
    slot: original[0].slot,
    series: original[0].series,
    reps: original[0].reps,
    peso_objetivo_kg: 222,
    descanso: original[0].descanso,
    nota: original[0].nota,
    editado_en: marcaServidor
  };
  const { cliente } = clienteRutinaFalso(filasRemotas);

  const r = await sincronizar(depsConCliente(cliente));

  assertEq(r.fallidos, 0, "un rechazo por antigüedad no es un fallo");
  assertEq(r.enviados, 1);
  assertEq(pendientes().length, 0, "el pendiente ya está resuelto, no debe reintentarse");
  assertEq(ejercicioPorSlot(original[0].slot).pesoKg, 222, "el local se corrige a la versión del servidor, que es la que quedó");
  assertEq(marcaDeRutina("dia3", "base"), marcaServidor, "la marca local también se corrige, para que una futura descarga compare como corresponde");

  restaurar("dia3", "base", original);
});

test("si el bloque no aparece en la nube, la subida falla y el pendiente sigue en cola", async () => {
  limpiar();
  const original = snapshotBloque("dia3", "base");
  cambiarValoresEjercicio("dia3", "base", original[0].slot, { series: 9 });

  const cliente = {
    from(tabla) {
      if (tabla !== "routine_blocks") throw new Error("no debería llegar aquí");
      return { select() { return this; }, eq() { return this; }, async single() { return { data: null, error: null }; } };
    }
  };
  const r = await sincronizar(depsConCliente(cliente));

  assertEq(r.fallidos, 1);
  assertEq(pendientes().length, 1, "el pendiente no se pierde cuando falla el envío");

  restaurar("dia3", "base", original);
});

test("editar el mismo bloque dos veces antes de sincronizar deja un solo pendiente (el más reciente)", () => {
  limpiar();
  const original = snapshotBloque("dia3", "base");
  cambiarValoresEjercicio("dia3", "base", original[0].slot, { series: 3 });
  cambiarValoresEjercicio("dia3", "base", original[0].slot, { series: 7 });

  const pendientesRutina = pendientes().filter((p) => p.tipo === "rutina_bloque");
  assertEq(pendientesRutina.length, 1, "encolar() reemplaza, no acumula, para el mismo bloque");
  assertEq(pendientesRutina[0].datos.ejercicios[0].series, 7);

  restaurar("dia3", "base", original);
});
