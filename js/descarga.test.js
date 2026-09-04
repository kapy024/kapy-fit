// Pruebas de sync.js's descargar() con un doble de js/db.js — nunca se toca
// la red aquí. Mismo patrón que sync.test.js: cada caso inyecta sus propios
// `deps`, nunca los valores por omisión (los módulos reales).
import { test, assertEq } from "./pruebas.js";
import { descargar, _reiniciarEstadoParaPruebas } from "./sync.js";
import {
  guardarRegistro, historial, historialDeSlot, registroDe,
  pendientes, quitarPendiente,
  LLAVE_REGISTROS, LLAVE_COLA, LLAVE_MARCAS
} from "./almacen.js";

const SLOT = "dia3:base:sentadilla";

function limpiar() {
  localStorage.removeItem(LLAVE_REGISTROS);
  localStorage.removeItem(LLAVE_COLA);
  localStorage.removeItem(LLAVE_MARCAS);
  _reiniciarEstadoParaPruebas();
}

function reg(fecha, slug, extra) {
  return { fecha, slug, pesoKg: null, series: null, reps: null, hecho: true, ...extra };
}

// Una fila tal como la devolvería Supabase de `exercise_logs`.
function fila(slot, extra) {
  return {
    slot,
    exercise_slug: "sentadilla",
    logged_on: "2026-09-01",
    weight_kg: 50,
    sets: 4,
    reps: "8",
    completed: true,
    updated_at: "2026-01-01T00:00:00.000Z",
    ...extra
  };
}

// Doble mínimo del cliente de Supabase: solo implementa
// .from("exercise_logs").select("*").eq("user_id", ...), que es lo único
// que descargar() llama.
function clienteFalso(filas) {
  return {
    from(_tabla) {
      return {
        select(_cols) {
          return {
            eq(_campo, _valor) {
              return Promise.resolve({ data: filas, error: null });
            }
          };
        }
      };
    }
  };
}

function depsConFilas(filas) {
  return {
    hayConfig: () => true,
    sesionActual: async () => ({ user: { id: "u1" } }),
    cliente: async () => clienteFalso(filas)
  };
}

// Deja `guardarRegistro` con su pendiente ya "sincronizado" (no en cola),
// como estaría un registro que este dispositivo subió hace tiempo.
function guardarYaSincronizado(slot, registro) {
  guardarRegistro(slot, registro);
  const [pendiente] = pendientes();
  quitarPendiente(pendiente.id);
}

test("descargar trae los registros del usuario, legibles por historial y registroDe", async () => {
  limpiar();
  const r = await descargar(depsConFilas([fila(SLOT, { weight_kg: 55 })]));
  assertEq(r.traidos, 1);
  assertEq(r.detalle, "ok");
  assertEq(registroDe(SLOT, "2026-09-01").pesoKg, 55);
  assertEq(historial("sentadilla").map((h) => h.fecha), ["2026-09-01"]);
  assertEq(historialDeSlot(SLOT).length, 1);
});

test("un registro local con pendientes en la cola no se pisa con la versión del servidor", async () => {
  limpiar();
  guardarRegistro(SLOT, reg("2026-09-01", "sentadilla", { pesoKg: 99 }));
  assertEq(pendientes().length, 1, "el registro debe seguir en la cola");

  // El servidor tiene otro valor y una fecha de actualización muy futura:
  // si la regla de la cola no se respetara, esto ganaría igual por fecha.
  const r = await descargar(depsConFilas([
    fila(SLOT, { weight_kg: 10, updated_at: "2099-01-01T00:00:00.000Z" })
  ]));

  assertEq(r.traidos, 0);
  assertEq(registroDe(SLOT, "2026-09-01").pesoKg, 99, "lo local sin subir no se pisa");
  assertEq(pendientes().length, 1, "descargar no toca la cola de subida");
});

test("un registro en ambos lados se resuelve por updated_at: gana el del servidor si es más nuevo", async () => {
  limpiar();
  guardarYaSincronizado(SLOT, reg("2026-09-01", "sentadilla", { pesoKg: 20 }));

  const r = await descargar(depsConFilas([
    fila(SLOT, { weight_kg: 30, updated_at: "2099-01-01T00:00:00.000Z" })
  ]));

  assertEq(r.traidos, 1);
  assertEq(registroDe(SLOT, "2026-09-01").pesoKg, 30, "el servidor es más nuevo, debe ganar");
});

test("un registro en ambos lados se resuelve por updated_at: gana el local si es más nuevo", async () => {
  limpiar();
  guardarYaSincronizado(SLOT, reg("2026-09-01", "sentadilla", { pesoKg: 20 }));

  // El servidor trae una fila con una updated_at muy vieja: el mark local
  // (tomado al guardar, hace un instante) es más reciente.
  const r = await descargar(depsConFilas([
    fila(SLOT, { weight_kg: 30, updated_at: "2000-01-01T00:00:00.000Z" })
  ]));

  assertEq(r.traidos, 0);
  assertEq(registroDe(SLOT, "2026-09-01").pesoKg, 20, "lo local es más nuevo, debe conservarse");
});

test("descargar dos veces no duplica nada", async () => {
  limpiar();
  const deps = depsConFilas([fila(SLOT)]);

  const r1 = await descargar(deps);
  assertEq(r1.traidos, 1);
  assertEq(historialDeSlot(SLOT).length, 1);

  const r2 = await descargar(deps);
  assertEq(r2.traidos, 0, "la misma fila, con la misma updated_at, no debe volver a aplicarse");
  assertEq(historialDeSlot(SLOT).length, 1, "sigue habiendo un solo registro para ese slot+fecha");
});

test("sin sesión, descargar no trae nada y no revienta", async () => {
  limpiar();
  const r = await descargar({
    hayConfig: () => true,
    sesionActual: async () => null,
    cliente: async () => clienteFalso([fila(SLOT)])
  });
  assertEq(r, { traidos: 0, detalle: "sin sesión" });
  assertEq(historialDeSlot(SLOT), []);
});

test("una fila para otro slot que aún no existe localmente simplemente se agrega", async () => {
  limpiar();
  const otroSlot = "dia6:v1:plancha";
  const r = await descargar(depsConFilas([
    fila(otroSlot, { exercise_slug: "plancha", weight_kg: null, sets: 3, reps: "40 seg" })
  ]));
  assertEq(r.traidos, 1);
  assertEq(historialDeSlot(otroSlot).length, 1);
  assertEq(historialDeSlot(SLOT), []);
});
