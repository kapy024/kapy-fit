// Pruebas de sync.js con un doble de js/db.js — nunca se toca la red aquí.
// Cada caso inyecta sus propios `deps` ({hayConfig, cliente, sesionActual,
// alCambiarSesion}) en vez de dejar que sincronizar()/arrancarAutosync()
// usen sus valores por omisión (los módulos reales), que sí hablan con
// Supabase.
import { test, assertEq } from "./pruebas.js";
import {
  sincronizar, estado, alCambiarEstado, arrancarAutosync,
  _reiniciarEstadoParaPruebas
} from "./sync.js";
import {
  guardarRegistro, registroDe, marcaDe, pendientes, marcarAdopcionResuelta,
  LLAVE_REGISTROS, LLAVE_COLA, LLAVE_MARCAS
} from "./almacen.js";

const SLOT = "dia3:base:sentadilla";

function limpiar() {
  localStorage.removeItem(LLAVE_REGISTROS);
  localStorage.removeItem(LLAVE_COLA);
  localStorage.removeItem(LLAVE_MARCAS);
  _reiniciarEstadoParaPruebas();
  // Estas son pruebas de sincronización genérica (reintento, conflictos,
  // arranque de autosync) — la adopción del historial sin sesión (tarea 10)
  // tiene su propia suite en adopcion.test.js. Sin esto, un guardarRegistro()
  // hecho aquí antes de sincronizar() dispararía la compuerta de adopción
  // (ver debeOfrecerAdopcion() en sync.js) y bloquearía subidas que estas
  // pruebas dan por sentado que ocurren.
  marcarAdopcionResuelta();
}

// Snapshots/restores the three keys almacen.js owns, to simulate switching
// between two physical devices that share one account but never share
// storage: "leaving" device A mid-test means capturing its raw localStorage
// here, acting as device B for a while, then putting A's back exactly as
// it was — never touched by anything B did meanwhile, same as in reality.
function fotografiarStorage() {
  return {
    registros: localStorage.getItem(LLAVE_REGISTROS),
    cola: localStorage.getItem(LLAVE_COLA),
    marcas: localStorage.getItem(LLAVE_MARCAS)
  };
}

function restaurarStorage(foto) {
  const poner = (llave, valor) => (valor == null ? localStorage.removeItem(llave) : localStorage.setItem(llave, valor));
  poner(LLAVE_REGISTROS, foto.registros);
  poner(LLAVE_COLA, foto.cola);
  poner(LLAVE_MARCAS, foto.marcas);
}

function reg(fecha, slug, extra) {
  return { fecha, slug, pesoKg: null, series: null, reps: null, hecho: true, ...extra };
}

// A stand-in for the real Supabase client. Implements:
// - .from(tabla).upsert(fila, opciones): used only by "preferencias" today.
//   `tabla` simulates the destino's unique constraint by keying on the
//   row's own onConflict fields, so a second upsert with the same key
//   overwrites instead of accumulating.
// - .rpc("subir_registro_ejercicio", params): a faithful model of
//   sql/006_edicion_cliente.sql's function — one row per (slot, fecha) in
//   `registros`, a write only applies when its p_editado_en is strictly
//   newer than what's stored (same `<`, not `<=`, as the real `where`
//   clause), and it always reports back {aplicado, fila}: whether this
//   call's write is the one that won, and the row that actually ended up
//   stored — exactly the server's contract, so sync.js's handling of a
//   lost race can be tested without a real database.
function crearClienteFalso({ falla = false, tabla = new Map(), registros = new Map() } = {}) {
  const llamadas = [];
  const cliente = {
    from(nombreTabla) {
      return {
        upsert(fila, opciones) {
          llamadas.push({ tabla: nombreTabla, fila, opciones });
          if (falla) return Promise.resolve({ error: { message: "fallo simulado" } });
          const campos = (opciones && opciones.onConflict ? opciones.onConflict : "id").split(",");
          const clave = `${nombreTabla}:${campos.map((c) => fila[c]).join("|")}`;
          tabla.set(clave, fila);
          return Promise.resolve({ error: null });
        }
      };
    },
    rpc(nombreFn, params) {
      llamadas.push({ rpc: nombreFn, params });
      if (falla) return Promise.resolve({ data: null, error: { message: "fallo simulado" } });
      const clave = `${params.p_slot}|${params.p_fecha}`;
      const existente = registros.get(clave);
      if (existente && !(new Date(existente.editado_en) < new Date(params.p_editado_en))) {
        return Promise.resolve({ data: { aplicado: false, fila: existente }, error: null });
      }
      const fila = {
        slot: params.p_slot,
        exercise_slug: params.p_slug,
        logged_on: params.p_fecha,
        weight_kg: params.p_peso,
        sets: params.p_series,
        reps: params.p_reps,
        completed: params.p_hecho,
        editado_en: params.p_editado_en,
        updated_at: params.p_editado_en
      };
      registros.set(clave, fila);
      return Promise.resolve({ data: { aplicado: true, fila }, error: null });
    }
  };
  return { cliente, llamadas, tabla, registros };
}

function depsConSesion(sobrescribir) {
  return {
    hayConfig: () => true,
    sesionActual: async () => ({ user: { id: "u1" } }),
    alCambiarSesion: () => () => {},
    ...sobrescribir
  };
}

// Lets a fire-and-forget sincronizar() call (arrancarAutosync never awaits
// it) actually settle before the assertions that depend on it.
function esperarMicrotareas() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

test("una cola vacía no llama a la red", async () => {
  limpiar();
  let llamado = false;
  const r = await sincronizar(depsConSesion({ cliente: async () => { llamado = true; return {}; } }));
  assertEq(r, { enviados: 0, fallidos: 0, detalle: "sin pendientes" });
  assertEq(llamado, false);
  assertEq(estado(), "al-dia");
});

test("un pendiente enviado con éxito se quita de la cola", async () => {
  limpiar();
  guardarRegistro(SLOT, reg("2026-09-02", "sentadilla", { pesoKg: 20 }));
  const { cliente: clienteFalso } = crearClienteFalso();
  const r = await sincronizar(depsConSesion({ cliente: async () => clienteFalso }));
  assertEq(r.enviados, 1);
  assertEq(r.fallidos, 0);
  assertEq(pendientes().length, 0);
  assertEq(estado(), "al-dia");
});

test("un pendiente que falla se queda en la cola", async () => {
  limpiar();
  guardarRegistro(SLOT, reg("2026-09-02", "sentadilla", { pesoKg: 20 }));
  const { cliente: clienteFalso } = crearClienteFalso({ falla: true });
  const r = await sincronizar(depsConSesion({ cliente: async () => clienteFalso }));
  assertEq(r.enviados, 0);
  assertEq(r.fallidos, 1);
  assertEq(pendientes().length, 1);
  assertEq(estado(), "error");
});

test("sin sesión no se envía nada y el estado es sin-sesion", async () => {
  limpiar();
  guardarRegistro(SLOT, reg("2026-09-02", "sentadilla", { pesoKg: 20 }));
  let llamado = false;
  const r = await sincronizar(depsConSesion({
    sesionActual: async () => null,
    cliente: async () => { llamado = true; return {}; }
  }));
  assertEq(r.enviados, 0);
  assertEq(r.fallidos, 0);
  assertEq(llamado, false);
  assertEq(estado(), "sin-sesion");
  // Nada se perdió: sigue en la cola local para cuando haya sesión.
  assertEq(pendientes().length, 1);
});

test("reenviar el mismo pendiente dos veces no duplica en el destino", async () => {
  limpiar();
  const registros = new Map();
  const deps = depsConSesion({ cliente: async () => crearClienteFalso({ registros }).cliente });

  guardarRegistro(SLOT, reg("2026-09-02", "sentadilla", { pesoKg: 20 }));
  await sincronizar(deps);

  // Se vuelve a capturar el mismo peso el mismo día (dos toques al mismo
  // campo, o un reintento manual) y se sincroniza otra vez.
  guardarRegistro(SLOT, reg("2026-09-02", "sentadilla", { pesoKg: 20 }));
  const r2 = await sincronizar(deps);

  assertEq(r2.enviados, 1);
  assertEq(registros.size, 1);
});

test("el estado recorre pendiente → sincronizando → al-dia", async () => {
  limpiar();
  guardarRegistro(SLOT, reg("2026-09-02", "sentadilla", { pesoKg: 20 }));
  const secuencia = [];
  const quitar = alCambiarEstado((s) => secuencia.push(s));
  const { cliente: clienteFalso } = crearClienteFalso();
  await sincronizar(depsConSesion({ cliente: async () => clienteFalso }));
  quitar();
  assertEq(secuencia, ["pendiente", "sincronizando", "al-dia"]);
});

// Nota (tarea 10): esta prueba asume que un pendiente ya en cola cuando
// arranca el autosync sube sin más — cierto solo porque limpiar() (arriba)
// marca la adopción como resuelta. Sin eso, este guardarRegistro() antes de
// arrancar sería indistinguible de historial sin sesión sin adoptar, y la
// compuerta de sincronizar() (ver debeOfrecerAdopcion() en sync.js) tendría
// que bloquear justo esta subida hasta que se conteste — que es la regla
// correcta, probada aparte en adopcion.test.js ("con la adopción sin
// responder, la sincronización inicial de arrancarAutosync tampoco sube
// nada al cargar la página"). Esta prueba, en cambio, es sobre el
// mecanismo genérico de autosync (arranque inmediato + reintento al
// reconectar), no sobre adopción, así que parte de un dispositivo sin
// nada pendiente de adoptar.
test("arrancarAutosync sincroniza de inmediato y otra vez al recuperar la red", async () => {
  limpiar();
  guardarRegistro(SLOT, reg("2026-09-02", "sentadilla", { pesoKg: 20 }));
  const { cliente: clienteFalso } = crearClienteFalso();
  const deps = depsConSesion({ cliente: async () => clienteFalso });

  const detener = arrancarAutosync(deps);
  try {
    await esperarMicrotareas();
    assertEq(pendientes().length, 0, "el arranque debió sincronizar de inmediato");

    guardarRegistro(SLOT, reg("2026-09-03", "sentadilla", { pesoKg: 21 }));
    window.dispatchEvent(new Event("online"));
    await esperarMicrotareas();
    assertEq(pendientes().length, 0, "recuperar la red debió sincronizar otra vez");
  } finally {
    detener();
  }
});

test("detenerAutosync detiene los disparos futuros", async () => {
  limpiar();
  const deps = depsConSesion({ cliente: async () => crearClienteFalso().cliente });

  const detener = arrancarAutosync(deps);
  await esperarMicrotareas();
  detener();

  guardarRegistro(SLOT, reg("2026-09-04", "sentadilla", { pesoKg: 22 }));
  window.dispatchEvent(new Event("online"));
  await esperarMicrotareas();
  assertEq(pendientes().length, 1, "tras detener, 'online' ya no debe sincronizar");
});

// --- el defecto real: gana quien sincroniza al último, no quien escribió al último ---

test("A sin red, B con red y sincroniza primero: al reconectar A, gana el registro más reciente (el de B), no el que sincronizó al último", async () => {
  limpiar();
  const registros = new Map();
  const clienteCompartido = crearClienteFalso({ registros }).cliente;
  const deps = depsConSesion({ cliente: async () => clienteCompartido });

  // Dispositivo A anota 111 sin red: se queda solo en su cola local.
  guardarRegistro(SLOT, reg("2026-09-02", "sentadilla", { pesoKg: 111 }));
  const fotoA = fotografiarStorage();

  // Dispositivo B — otro localStorage, nunca el mismo que A — anota 222
  // después y sí tiene red: sincroniza de inmediato.
  limpiar();
  guardarRegistro(SLOT, reg("2026-09-02", "sentadilla", { pesoKg: 222 }));
  const rB = await sincronizar(deps);
  assertEq(rB.enviados, 1, "B sube su 222 sin problema: todavía no hay nada en esa fila");
  assertEq(pendientes().length, 0);
  assertEq(registros.get(`${SLOT}|2026-09-02`).weight_kg, 222);

  // A recupera la red: se restaura su localStorage (su 111 pendiente,
  // escrito ANTES que el 222 de B) y sincroniza contra el mismo servidor.
  restaurarStorage(fotoA);
  const rA = await sincronizar(deps);

  // El defecto original: A "ganaba" solo por sincronizar al último y el
  // 222 de B desaparecía, del servidor y de B. El arreglo: gana quien
  // EDITÓ más tarde (B), sin importar en qué orden sincronizan.
  assertEq(rA.fallidos, 0, "el pendiente de A se resuelve, no falla");
  assertEq(rA.enviados, 1);
  assertEq(pendientes().length, 0, "A no debe quedarse reintentando algo que el servidor ya resolvió");
  assertEq(registros.get(`${SLOT}|2026-09-02`).weight_kg, 222, "el servidor conserva el 222 de B, no el 111 de A");
  assertEq(registroDe(SLOT, "2026-09-02").pesoKg, 222, "el local de A se corrige a lo que de verdad ganó, no se queda en 111");
});

test("un pendiente rechazado por antigüedad se quita de la cola y corrige el registro local", async () => {
  limpiar();
  guardarRegistro(SLOT, reg("2026-09-02", "sentadilla", { pesoKg: 111 }));

  // El servidor ya tiene, para esa misma fila, algo editado después de que
  // este dispositivo hizo su propia escritura (simula lo que habría subido
  // otro dispositivo mientras este estaba sin red).
  const marcaLocal = marcaDe(SLOT, "2026-09-02");
  const marcaServidor = new Date(new Date(marcaLocal).getTime() + 60000).toISOString();
  const registros = new Map([[
    `${SLOT}|2026-09-02`,
    {
      slot: SLOT, exercise_slug: "sentadilla", logged_on: "2026-09-02",
      weight_kg: 222, sets: null, reps: null, completed: true,
      editado_en: marcaServidor, updated_at: marcaServidor
    }
  ]]);
  const { cliente: clienteFalso } = crearClienteFalso({ registros });

  const r = await sincronizar(depsConSesion({ cliente: async () => clienteFalso }));

  assertEq(r.fallidos, 0, "un rechazo por antigüedad no es un fallo");
  assertEq(r.enviados, 1);
  assertEq(pendientes().length, 0, "el pendiente ya está resuelto, no debe reintentarse");
  assertEq(registroDe(SLOT, "2026-09-02").pesoKg, 222, "el local se corrige a la versión del servidor, que es la que quedó");
  assertEq(estado(), "al-dia");
});
