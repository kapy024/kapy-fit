// Pruebas de la adopción del historial local sin sesión (tarea 10). Nunca se
// toca la red aquí: como en sync.test.js, cada caso que necesita un cliente
// inyecta su propio doble en vez de dejar que sincronizar()/arrancarAutosync()
// usen sus valores por omisión.
import { test, assertEq } from "./pruebas.js";
import {
  historialSinAdoptar, debeOfrecerAdopcion, aceptarAdopcion, rechazarAdopcion,
  arrancarAutosync, _reiniciarEstadoParaPruebas
} from "./sync.js";
import {
  guardarRegistro, registroDe, pendientes, guardarPreferencias, adopcionResuelta,
  LLAVE_REGISTROS, LLAVE_COLA, LLAVE_MARCAS, LLAVE_PREFS, LLAVE_ADOPCION
} from "./almacen.js";

const SLOT = "dia3:base:sentadilla";

function limpiar() {
  localStorage.removeItem(LLAVE_REGISTROS);
  localStorage.removeItem(LLAVE_COLA);
  localStorage.removeItem(LLAVE_MARCAS);
  localStorage.removeItem(LLAVE_PREFS);
  localStorage.removeItem(LLAVE_ADOPCION);
  _reiniciarEstadoParaPruebas();
}

function reg(fecha, extra) {
  return { fecha, slug: "sentadilla", pesoKg: null, series: null, reps: null, hecho: true, ...extra };
}

// Doble mínimo del cliente de Supabase: acepta cualquier escritura de
// subir_registro_ejercicio. La lógica de la escritura condicional (quién
// gana una carrera entre dos dispositivos) ya está probada en sync.test.js;
// aquí solo hace falta comprobar que aceptarAdopcion() de verdad drena la
// cola por el camino normal, no por uno paralelo.
function clienteQueAceptaTodo() {
  const llamadas = [];
  return {
    llamadas,
    cliente: {
      rpc(nombreFn, params) {
        llamadas.push({ rpc: nombreFn, params });
        return Promise.resolve({
          data: { aplicado: true, fila: { updated_at: params.p_editado_en } },
          error: null
        });
      }
    }
  };
}

function depsConSesion(sobrescribir) {
  return {
    hayConfig: () => true,
    sesionActual: async () => ({ user: { id: "u1" } }),
    alCambiarSesion: () => () => {},
    ...sobrescribir
  };
}

function esperarMicrotareas() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// --- caso 1: hay registros locales sin subir y sesión nueva: se ofrece y se dice cuántos ---

test("con registros locales sin subir se ofrece la adopción y se dice cuántos", () => {
  limpiar();
  guardarRegistro(SLOT, reg("2026-09-01", { pesoKg: 20 }));
  guardarRegistro(SLOT, reg("2026-09-02", { pesoKg: 21 }));

  assertEq(debeOfrecerAdopcion(), true);
  assertEq(historialSinAdoptar().length, 2);
});

test("sin historial local sin subir no hay nada que ofrecer", () => {
  limpiar();
  assertEq(historialSinAdoptar(), []);
  assertEq(debeOfrecerAdopcion(), false);
});

// Un pendiente de "preferencias" (kg/lb) no es historial de entrenamiento:
// no debe contarse ni ofrecerse como si lo fuera.
test("historialSinAdoptar() ignora los pendientes de preferencias", () => {
  limpiar();
  guardarRegistro(SLOT, reg("2026-09-01", { pesoKg: 20 }));
  guardarPreferencias({ unidad: "lb" });
  assertEq(pendientes().length, 2, "debe haber un pendiente de registro y uno de preferencias");
  assertEq(historialSinAdoptar().length, 1, "solo el de registro cuenta como historial a adoptar");
});

// --- caso 2: aceptar los encola todos (los sube por la cola normal) ---

test("aceptar sube todo el historial sin adoptar por la cola normal", async () => {
  limpiar();
  guardarRegistro(SLOT, reg("2026-09-01", { pesoKg: 20 }));
  guardarRegistro(SLOT, reg("2026-09-02", { pesoKg: 21 }));
  assertEq(historialSinAdoptar().length, 2);

  const { cliente, llamadas } = clienteQueAceptaTodo();
  const r = await aceptarAdopcion(depsConSesion({ cliente: async () => cliente }));

  assertEq(r.enviados, 2);
  assertEq(r.fallidos, 0);
  assertEq(llamadas.length, 2, "los dos registros debieron subir por subir_registro_ejercicio");
  assertEq(pendientes().length, 0, "la cola queda vacía: ya no hay nada más que subir");
});

test("aceptar marca la adopción como resuelta", async () => {
  limpiar();
  guardarRegistro(SLOT, reg("2026-09-01", { pesoKg: 20 }));
  const { cliente } = clienteQueAceptaTodo();

  assertEq(adopcionResuelta(), false);
  await aceptarAdopcion(depsConSesion({ cliente: async () => cliente }));
  assertEq(adopcionResuelta(), true);
});

// --- caso 3: rechazar no encola nada y no borra nada local ---

test("rechazar no encola nada nuevo y no borra el historial local", () => {
  limpiar();
  guardarRegistro(SLOT, reg("2026-09-01", { pesoKg: 20 }));
  guardarRegistro(SLOT, reg("2026-09-02", { pesoKg: 21 }));
  const pendientesAntes = pendientes().length;

  rechazarAdopcion();

  assertEq(pendientes().length, pendientesAntes, "rechazar no agrega ni quita nada de la cola");
  assertEq(registroDe(SLOT, "2026-09-01").pesoKg, 20, "el registro sigue intacto en este dispositivo");
  assertEq(registroDe(SLOT, "2026-09-02").pesoKg, 21, "el registro sigue intacto en este dispositivo");
});

test("rechazar marca la adopción como resuelta", () => {
  limpiar();
  guardarRegistro(SLOT, reg("2026-09-01", { pesoKg: 20 }));
  assertEq(adopcionResuelta(), false);
  rechazarAdopcion();
  assertEq(adopcionResuelta(), true);
});

// --- caso 4: una vez resuelto (aceptado o rechazado), no se vuelve a ofrecer ---

test("tras rechazar no se vuelve a ofrecer, aunque siga habiendo historial sin subir", () => {
  limpiar();
  guardarRegistro(SLOT, reg("2026-09-01", { pesoKg: 20 }));
  rechazarAdopcion();

  assertEq(historialSinAdoptar().length, 1, "el registro sigue sin subir");
  assertEq(debeOfrecerAdopcion(), false, "pero ya no debe volver a ofrecerse");
});

test("tras aceptar no se vuelve a ofrecer", async () => {
  limpiar();
  guardarRegistro(SLOT, reg("2026-09-01", { pesoKg: 20 }));
  const { cliente } = clienteQueAceptaTodo();
  await aceptarAdopcion(depsConSesion({ cliente: async () => cliente }));

  assertEq(debeOfrecerAdopcion(), false);
});

// --- arrancarAutosync no sube el historial sin adoptar por su cuenta ---

test("un inicio de sesión con historial sin adoptar no lo sincroniza solo, y avisa para que se ofrezca", async () => {
  limpiar();
  guardarRegistro(SLOT, reg("2026-09-01", { pesoKg: 20 }));
  let listener = null;
  let avisos = 0;
  let seLlamoRpc = false;
  const clienteFalso = {
    rpc: () => { seLlamoRpc = true; return Promise.resolve({ data: null, error: null }); }
  };
  const deps = {
    hayConfig: () => true,
    // sesionActual() nunca ve sesión: aísla esta prueba a la sola llegada del
    // evento de inicio de sesión (el `listener(...)` de abajo), sin que la
    // llamada inicial de arrancarAutosync ni el propio descargar() lleguen a
    // tocar la red por su cuenta.
    sesionActual: async () => null,
    alCambiarSesion: (fn) => { listener = fn; return () => {}; },
    cliente: async () => clienteFalso
  };

  const detener = arrancarAutosync(deps, () => { avisos++; });
  try {
    await esperarMicrotareas();

    // Ahora sí aparece una sesión nueva, con el historial todavía sin resolver.
    listener({ user: { id: "u1" } });
    await esperarMicrotareas();

    assertEq(avisos, 1, "debió avisar para que app.js ofrezca la adopción");
    assertEq(seLlamoRpc, false, "no debió intentar subir nada por su cuenta");
    assertEq(pendientes().length, 1, "el registro sigue en la cola: no se subió solo");
  } finally {
    detener();
  }
});

test("un inicio de sesión sin historial pendiente sincroniza normalmente, sin avisar", async () => {
  limpiar();
  let listener = null;
  let avisos = 0;
  const { cliente } = clienteQueAceptaTodo();
  const deps = {
    hayConfig: () => true,
    sesionActual: async () => ({ user: { id: "u1" } }),
    alCambiarSesion: (fn) => { listener = fn; return () => {}; },
    cliente: async () => cliente
  };

  const detener = arrancarAutosync(deps, () => { avisos++; });
  try {
    await esperarMicrotareas();
    listener({ user: { id: "u1" } });
    await esperarMicrotareas();

    assertEq(avisos, 0, "sin historial que ofrecer, nunca debe avisar");
  } finally {
    detener();
  }
});

test("resuelta la adopción, un siguiente inicio de sesión sí sincroniza lo que quedó en la cola", async () => {
  limpiar();
  guardarRegistro(SLOT, reg("2026-09-01", { pesoKg: 20 }));
  rechazarAdopcion(); // el usuario ya contestó que no, antes de que arrancara el autosync

  let listener = null;
  let avisos = 0;
  const { cliente } = clienteQueAceptaTodo();
  const deps = {
    hayConfig: () => true,
    sesionActual: async () => ({ user: { id: "u1" } }),
    alCambiarSesion: (fn) => { listener = fn; return () => {}; },
    cliente: async () => cliente
  };

  const detener = arrancarAutosync(deps, () => { avisos++; });
  try {
    await esperarMicrotareas();
    listener({ user: { id: "u1" } });
    await esperarMicrotareas();

    assertEq(avisos, 0, "ya se resolvió antes: no debe volver a avisar");
    assertEq(pendientes().length, 0, "y el ciclo normal de sincronización sigue funcionando");
  } finally {
    detener();
  }
});
