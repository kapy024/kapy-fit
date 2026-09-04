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
import { guardarRegistro, pendientes, LLAVE_REGISTROS, LLAVE_COLA } from "./almacen.js";

const SLOT = "dia3:base:sentadilla";

function limpiar() {
  localStorage.removeItem(LLAVE_REGISTROS);
  localStorage.removeItem(LLAVE_COLA);
  _reiniciarEstadoParaPruebas();
}

function reg(fecha, slug, extra) {
  return { fecha, slug, pesoKg: null, series: null, reps: null, hecho: true, ...extra };
}

// A stand-in for the real Supabase client: only implements
// .from(tabla).upsert(fila, opciones), which is all sync.js calls. `tabla`
// simulates the destino's unique constraint by keying on the row's own
// onConflict fields, so a second upsert with the same key overwrites
// instead of accumulating — exactly what the real `unique (user_id, slot,
// logged_on)` + upsert does server-side.
function crearClienteFalso({ falla = false, tabla = new Map() } = {}) {
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
    }
  };
  return { cliente, llamadas, tabla };
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
  const tabla = new Map();
  const deps = depsConSesion({ cliente: async () => crearClienteFalso({ tabla }).cliente });

  guardarRegistro(SLOT, reg("2026-09-02", "sentadilla", { pesoKg: 20 }));
  await sincronizar(deps);

  // Se vuelve a capturar el mismo peso el mismo día (dos toques al mismo
  // campo, o un reintento manual) y se sincroniza otra vez.
  guardarRegistro(SLOT, reg("2026-09-02", "sentadilla", { pesoKg: 20 }));
  const r2 = await sincronizar(deps);

  assertEq(r2.enviados, 1);
  const filas = [...tabla.keys()].filter((k) => k.startsWith("exercise_logs:"));
  assertEq(filas.length, 1);
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
