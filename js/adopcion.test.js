// Pruebas de la adopción del historial local sin sesión (tarea 10). Nunca se
// toca la red aquí: como en sync.test.js, cada caso que necesita un cliente
// inyecta su propio doble en vez de dejar que sincronizar()/arrancarAutosync()
// usen sus valores por omisión.
import { test, assertEq } from "./pruebas.js";
import {
  historialSinAdoptar, debeOfrecerAdopcion, aceptarAdopcion, rechazarAdopcion,
  sincronizar, descargar, arrancarAutosync, _reiniciarEstadoParaPruebas
} from "./sync.js";
import {
  guardarRegistro, registroDe, marcaDe, pendientes, guardarPreferencias, adopcionResuelta,
  LLAVE_REGISTROS, LLAVE_COLA, LLAVE_MARCAS, LLAVE_PREFS, LLAVE_ADOPCION, LLAVE_NO_ADOPTADOS
} from "./almacen.js";

const SLOT = "dia3:base:sentadilla";

function limpiar() {
  localStorage.removeItem(LLAVE_REGISTROS);
  localStorage.removeItem(LLAVE_COLA);
  localStorage.removeItem(LLAVE_MARCAS);
  localStorage.removeItem(LLAVE_PREFS);
  localStorage.removeItem(LLAVE_ADOPCION);
  localStorage.removeItem(LLAVE_NO_ADOPTADOS);
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

// --- caso 3: rechazar saca de la cola lo que había, no encola nada nuevo,
// y no borra nada local (defecto 1 de la tarea 10: antes rechazar apagaba
// el ofrecimiento pero dejaba los pendientes en la cola, así que el
// siguiente sincronizar() los subía igual — el "no" del usuario no se
// sostenía) ---

test("rechazar saca de la cola los registros ofrecidos, sin encolar nada nuevo ni borrar el historial local", () => {
  limpiar();
  guardarRegistro(SLOT, reg("2026-09-01", { pesoKg: 20 }));
  guardarRegistro(SLOT, reg("2026-09-02", { pesoKg: 21 }));
  assertEq(pendientes().length, 2, "los dos guardados quedan en cola, como cualquier guardarRegistro()");

  rechazarAdopcion();

  assertEq(pendientes().length, 0, "rechazar saca de la cola justo lo que había ofrecido: nada debe subirse después");
  assertEq(registroDe(SLOT, "2026-09-01").pesoKg, 20, "el registro sigue intacto en este dispositivo");
  assertEq(registroDe(SLOT, "2026-09-02").pesoKg, 21, "el registro sigue intacto en este dispositivo");
});

// El defecto real, de punta a punta: decir que no, y comprobar que ningún
// sincronizar() posterior (autosync, 'online', o uno disparado a mano, como
// aquí) sube esos registros — aunque la cola los tendría si rechazar no los
// hubiera sacado.
test("tras rechazar, un sincronizar() posterior no sube esos registros", async () => {
  limpiar();
  guardarRegistro(SLOT, reg("2026-09-01", { pesoKg: 20 }));
  rechazarAdopcion();

  const { cliente, llamadas } = clienteQueAceptaTodo();
  const r = await sincronizar(depsConSesion({ cliente: async () => cliente }));

  assertEq(llamadas.length, 0, "rechazar ya los sacó de la cola: sincronizar() no debe llamar a la red por ellos");
  assertEq(r.enviados, 0);
  assertEq(pendientes().length, 0);
  assertEq(registroDe(SLOT, "2026-09-01").pesoKg, 20, "el registro local sigue intacto, solo que nunca se subió");
});

test("rechazar marca la adopción como resuelta", () => {
  limpiar();
  guardarRegistro(SLOT, reg("2026-09-01", { pesoKg: 20 }));
  assertEq(adopcionResuelta(), false);
  rechazarAdopcion();
  assertEq(adopcionResuelta(), true);
});

// --- caso 4: una vez resuelto (aceptado o rechazado), no se vuelve a ofrecer ---

test("tras rechazar no se vuelve a ofrecer, y el registro sigue existiendo aunque ya no esté en cola", () => {
  limpiar();
  guardarRegistro(SLOT, reg("2026-09-01", { pesoKg: 20 }));
  rechazarAdopcion();

  // rechazarAdopcion() ya sacó ese registro de la cola (ver el caso 3 de
  // arriba): historialSinAdoptar() cuenta pendientes, así que ahora reporta
  // 0 — no queda nada más que ofrecer, no porque se haya subido, sino
  // porque el usuario ya contestó que no.
  assertEq(historialSinAdoptar().length, 0, "ya no hay nada pendiente que ofrecer: rechazar lo sacó de la cola");
  assertEq(debeOfrecerAdopcion(), false, "y no debe volver a ofrecerse");
  assertEq(registroDe(SLOT, "2026-09-01").pesoKg, 20, "el registro sigue existiendo en este dispositivo, solo que ya no en la cola de subida");
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

test("resuelta la adopción (rechazada), un registro nuevo posterior sí sincroniza normalmente", async () => {
  limpiar();
  guardarRegistro(SLOT, reg("2026-09-01", { pesoKg: 20 }));
  rechazarAdopcion(); // el usuario ya contestó que no, antes de que arrancara el autosync

  // Un registro creado DESPUÉS de contestar no es "lo anterior": la
  // adopción ya está resuelta, así que debe subir por la cola normal, sin
  // preguntar de nuevo (requisito 4 de la tarea 10).
  guardarRegistro(SLOT, reg("2026-09-05", { pesoKg: 25 }));

  let listener = null;
  let avisos = 0;
  const { cliente, llamadas } = clienteQueAceptaTodo();
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
    assertEq(llamadas.length, 1, "el registro posterior a la respuesta sí debe subir, sin preguntar");
    assertEq(pendientes().length, 0, "y el ciclo normal de sincronización sigue funcionando");
  } finally {
    detener();
  }
});

// --- defecto 2 de la tarea 10: la sincronización inicial (la que corre al
// cargar la página con una sesión ya activa, sin ningún evento de inicio de
// sesión de por medio) también debe respetar la compuerta — antes solo la
// cubría el evento de inicio de sesión, así que bastaba recargar la página
// con la oferta sin responder para que la cola se drenara igual ---

test("con la adopción sin responder, sincronizar() no sube ese historial aunque ya haya sesión (recarga de página)", async () => {
  limpiar();
  guardarRegistro(SLOT, reg("2026-09-01", { pesoKg: 20 }));
  // Nunca se contesta la oferta (ni aceptar ni rechazar) — como si la
  // página se hubiera recargado con la sesión ya activa antes de que
  // apareciera la respuesta del usuario.
  assertEq(debeOfrecerAdopcion(), true, "la oferta sigue sin contestar");

  const { cliente, llamadas } = clienteQueAceptaTodo();
  const r = await sincronizar(depsConSesion({ cliente: async () => cliente }));

  assertEq(llamadas.length, 0, "con la oferta sin responder, ninguna sincronización debe subir ese historial");
  assertEq(r.enviados, 0);
  assertEq(pendientes().length, 1, "sigue en la cola, listo para cuando se responda");
});

test("con la adopción sin responder, la sincronización inicial de arrancarAutosync tampoco sube nada al cargar la página", async () => {
  limpiar();
  guardarRegistro(SLOT, reg("2026-09-01", { pesoKg: 20 }));
  const { cliente, llamadas } = clienteQueAceptaTodo();
  const deps = depsConSesion({ cliente: async () => cliente });

  // arrancarAutosync(), sin alOfrecerAdopcion, simula exactamente la carga
  // de página: sesión ya activa desde el arranque, ningún evento de
  // inicio de sesión de por medio — solo la llamada inicial al final de
  // arrancarAutosync().
  const detener = arrancarAutosync(deps);
  try {
    await esperarMicrotareas();
    assertEq(llamadas.length, 0, "la sincronización inicial de la carga no debe subir historial sin adoptar");
    assertEq(pendientes().length, 1, "sigue en la cola, sin tocar");
  } finally {
    detener();
  }
});

// --- requisito 4 de la tarea 10: un registro creado ya con sesión, sin
// historial previo que adoptar, sube normal y sin preguntar ---

test("un registro creado con sesión activa, sin historial previo que adoptar, sube normal sin preguntar", async () => {
  limpiar();
  const { cliente, llamadas } = clienteQueAceptaTodo();
  const deps = depsConSesion({ cliente: async () => cliente });

  // Primer sincronizar() con sesión y cola vacía: no hay nada que adoptar,
  // así que la propia sincronización cierra la pregunta por su cuenta (ver
  // sync.js) — nunca va a haber oferta que hacer en este dispositivo.
  await sincronizar(deps);
  assertEq(debeOfrecerAdopcion(), false, "sin historial previo, nunca hubo nada que ofrecer");

  // Ahora, ya con sesión, se registra una serie nueva.
  guardarRegistro(SLOT, reg("2026-09-03", { pesoKg: 30 }));
  const r = await sincronizar(deps);

  assertEq(llamadas.length, 1, "el registro nuevo debe subir por la cola normal, sin aviso de adopción");
  assertEq(r.enviados, 1);
  assertEq(pendientes().length, 0);
});

// --- I2 (revisión final de rama): rechazar debe sostenerse también frente
// a una descarga posterior, no solo frente a la subida ---

// Doble mínimo de .from("exercise_logs").select("*").eq(...), igual que en
// descarga.test.js — la única llamada que descargar() hace.
function clienteConFilas(filas) {
  return {
    from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: filas, error: null }) }) })
  };
}

test("rechazar protege el registro también de una descarga posterior (I2)", async () => {
  limpiar();
  guardarRegistro(SLOT, reg("2026-09-01", { pesoKg: 100 }));
  const marcaLocal = marcaDe(SLOT, "2026-09-01");

  rechazarAdopcion();
  assertEq(pendientes().length, 0, "rechazar ya lo sacó de la cola");

  // El servidor trae, para esa misma fila, algo MÁS NUEVO que la marca
  // local — si la única protección fuera "sigue en cola" (que rechazar ya
  // quitó), la regla de updated_at de descargar() dejaría ganar al
  // servidor y el 100 que el usuario dijo que no subiera desaparecería de
  // todos modos.
  const marcaServidor = new Date(new Date(marcaLocal).getTime() + 60000).toISOString();
  const filaServidor = {
    slot: SLOT, exercise_slug: "sentadilla", logged_on: "2026-09-01",
    weight_kg: 80, sets: null, reps: null, completed: true, updated_at: marcaServidor
  };

  const r = await descargar({
    hayConfig: () => true,
    sesionActual: async () => ({ user: { id: "u1" } }),
    cliente: async () => clienteConFilas([filaServidor])
  });

  assertEq(r.traidos, 0, "el registro declinado no se cuenta como traído: no se tocó");
  assertEq(registroDe(SLOT, "2026-09-01").pesoKg, 100, "\"Ahora no\" también protege de una descarga que lo pisaría");
});

test("rechazar no protege un slot/fecha distinto: una descarga normal ahí sí aplica", async () => {
  limpiar();
  guardarRegistro(SLOT, reg("2026-09-01", { pesoKg: 100 }));
  rechazarAdopcion();

  // Otra fecha del mismo slot nunca se ofreció ni se rechazó: debe seguir
  // comportándose como cualquier descarga normal.
  const filaServidor = {
    slot: SLOT, exercise_slug: "sentadilla", logged_on: "2026-09-05",
    weight_kg: 50, sets: null, reps: null, completed: true,
    updated_at: "2099-01-01T00:00:00.000Z"
  };
  const r = await descargar({
    hayConfig: () => true,
    sesionActual: async () => ({ user: { id: "u1" } }),
    cliente: async () => clienteConFilas([filaServidor])
  });

  assertEq(r.traidos, 1);
  assertEq(registroDe(SLOT, "2026-09-05").pesoKg, 50);
});
