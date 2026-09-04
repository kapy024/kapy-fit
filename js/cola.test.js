// Pruebas de la cola de pendientes en almacen.js. sync.js (tarea 8) es
// quien la drena; aquí solo se prueba que encolar/pendientes/quitarPendiente
// se comportan bien de forma aislada — sin tocar la red en ningún momento.
import { test, assertEq } from "./pruebas.js";
import {
  guardarRegistro, encolar, pendientes, quitarPendiente,
  LLAVE_REGISTROS, LLAVE_COLA
} from "./almacen.js";

const SLOT = "dia3:base:sentadilla";

function limpiar() {
  localStorage.removeItem(LLAVE_REGISTROS);
  localStorage.removeItem(LLAVE_COLA);
}

function reg(fecha, slug, extra) {
  return { fecha, slug, pesoKg: null, series: null, reps: null, hecho: true, ...extra };
}

test("guardar un registro deja un pendiente", () => {
  limpiar();
  guardarRegistro(SLOT, reg("2026-09-02", "sentadilla", { pesoKg: 20 }));
  const cola = pendientes();
  assertEq(cola.length, 1);
  assertEq(cola[0].tipo, "registro");
  assertEq(cola[0].entidad, "exercise_logs");
  assertEq(cola[0].datos.slot, SLOT);
  assertEq(cola[0].datos.fecha, "2026-09-02");
  assertEq(typeof cola[0].id, "string");
  assertEq(cola[0].id.length > 0, true);
});

test("guardar dos veces el mismo slot y fecha deja un pendiente, no dos", () => {
  limpiar();
  guardarRegistro(SLOT, reg("2026-09-02", "sentadilla", { pesoKg: 20 }));
  guardarRegistro(SLOT, reg("2026-09-02", "sentadilla", { pesoKg: 22 }));
  const cola = pendientes();
  assertEq(cola.length, 1);
  assertEq(cola[0].datos.pesoKg, 22);
});

test("guardar el mismo slot en otra fecha, u otro slot en la misma fecha, no se reemplazan entre sí", () => {
  limpiar();
  guardarRegistro(SLOT, reg("2026-09-01", "sentadilla", { pesoKg: 20 }));
  guardarRegistro(SLOT, reg("2026-09-02", "sentadilla", { pesoKg: 21 }));
  guardarRegistro("dia6:v1:plancha", reg("2026-09-02", "plancha", {}));
  assertEq(pendientes().length, 3);
});

test("quitarPendiente quita solo el suyo", () => {
  limpiar();
  guardarRegistro(SLOT, reg("2026-09-01", "sentadilla", { pesoKg: 20 }));
  guardarRegistro(SLOT, reg("2026-09-02", "sentadilla", { pesoKg: 21 }));
  const cola = pendientes();
  assertEq(cola.length, 2);
  const idAQuitar = cola[0].id;
  quitarPendiente(idAQuitar);
  const restante = pendientes();
  assertEq(restante.length, 1);
  assertEq(restante.some((p) => p.id === idAQuitar), false);
});

test("la cola sobrevive a releer desde localStorage", () => {
  limpiar();
  guardarRegistro(SLOT, reg("2026-09-02", "sentadilla", { pesoKg: 20 }));
  const crudo = localStorage.getItem(LLAVE_COLA);
  assertEq(typeof crudo, "string");
  const guardado = JSON.parse(crudo);
  assertEq(guardado.length, 1);
  // pendientes() no guarda su propia copia en memoria: lo que hay en
  // localStorage en este momento es exactamente lo que devuelve.
  assertEq(pendientes(), guardado);
});

test("una cola con JSON corrupto se lee como vacía sin tronar", () => {
  localStorage.setItem(LLAVE_COLA, "{esto no es json");
  assertEq(pendientes(), []);
  limpiar();
});

// El punto entero de encadenar encolar() dentro de guardarRegistro: si el
// registro nunca se guardó localmente, encolar su envío crearía un
// fantasma que la app no puede mostrar ni el usuario puede revisar.
test("si la escritura del registro falla, no se encola nada", () => {
  limpiar();
  const original = localStorage.setItem;
  localStorage.setItem = () => {
    throw new DOMException("cuota llena", "QuotaExceededError");
  };
  try {
    const ok = guardarRegistro(SLOT, reg("2026-09-02", "sentadilla", { pesoKg: 20 }));
    assertEq(ok, false);
  } finally {
    localStorage.setItem = original;
  }
  assertEq(pendientes(), []);
});

test("encolar() sin clave lógica conocida siempre agrega, nunca reemplaza", () => {
  limpiar();
  encolar({ tipo: "otro", entidad: "algo", datos: { x: 1 } });
  encolar({ tipo: "otro", entidad: "algo", datos: { x: 1 } });
  assertEq(pendientes().length, 2);
});

test("encolar() asigna ids distintos a pendientes distintos", () => {
  limpiar();
  guardarRegistro(SLOT, reg("2026-09-01", "sentadilla", { pesoKg: 20 }));
  guardarRegistro("dia6:v1:plancha", reg("2026-09-02", "plancha", {}));
  const [a, b] = pendientes();
  assertEq(a.id === b.id, false);
});
