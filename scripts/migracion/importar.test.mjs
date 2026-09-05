// Pruebas del importador (tarea 5 de la migración de proyecto). Corren con
// `node --test scripts/migracion/importar.test.mjs` — sin dependencias, sin
// tocar la red: cada caso pasa un fetch doble con un backend en memoria que
// imita las reglas reales de subir_registro_ejercicio/subir_peso_corporal
// (escritura condicional por editado_en) y del PATCH sobre profiles.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { importar } from "./importar.mjs";
import { calcularConteos } from "./exportar.mjs";

function tokenDePrueba(payload) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const cuerpo = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${cuerpo}.firma-falsa`;
}

const ID_DUENO = "dueno-nuevo-1";
const TOKEN = tokenDePrueba({ sub: ID_DUENO, email: "dueno@example.com" });
const ENV_BASE = {
  SUPABASE_URL: "https://nuevo.supabase.co",
  SUPABASE_ANON_KEY: "anon-de-prueba",
  TOKEN,
};

function respuestaJson(cuerpo, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => cuerpo,
    text: async () => JSON.stringify(cuerpo),
  };
}

function subDelToken(headers) {
  const auth = headers.Authorization;
  const token = auth.replace("Bearer ", "");
  const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
  return payload.sub;
}

// Backend en memoria que reproduce, para lo que este importador necesita,
// el comportamiento real de las dos RPC (upsert condicionado por
// editado_en, "aplicado" según si la escritura ganó) y del PATCH sobre la
// fila propia de profiles. Cuenta las llamadas para la prueba de
// idempotencia.
function crearBackend({ profiles = [] } = {}) {
  const estado = { exercise_logs: [], body_weight: [], profiles: [...profiles] };
  let llamadas = 0;

  async function fetchDoble(url, opciones = {}) {
    llamadas++;
    const u = new URL(url);
    const headers = opciones.headers ?? {};
    const metodo = opciones.method ?? "GET";

    if (metodo === "POST" && u.pathname.endsWith("/rpc/subir_registro_ejercicio")) {
      const sub = subDelToken(headers);
      const b = JSON.parse(opciones.body);
      const idx = estado.exercise_logs.findIndex(
        (f) => f.user_id === sub && f.slot === b.p_slot && f.logged_on === b.p_fecha
      );
      if (idx === -1) {
        const fila = {
          id: randomUUID(),
          user_id: sub,
          slot: b.p_slot,
          exercise_slug: b.p_slug,
          logged_on: b.p_fecha,
          weight_kg: b.p_peso,
          sets: b.p_series,
          reps: b.p_reps,
          completed: b.p_hecho,
          editado_en: b.p_editado_en,
        };
        estado.exercise_logs.push(fila);
        return respuestaJson({ aplicado: true, fila });
      }
      const existente = estado.exercise_logs[idx];
      if (existente.editado_en < b.p_editado_en) {
        const fila = {
          ...existente,
          exercise_slug: b.p_slug,
          weight_kg: b.p_peso,
          sets: b.p_series,
          reps: b.p_reps,
          completed: b.p_hecho,
          editado_en: b.p_editado_en,
        };
        estado.exercise_logs[idx] = fila;
        return respuestaJson({ aplicado: true, fila });
      }
      return respuestaJson({ aplicado: false, fila: existente });
    }

    if (metodo === "POST" && u.pathname.endsWith("/rpc/subir_peso_corporal")) {
      const sub = subDelToken(headers);
      const b = JSON.parse(opciones.body);
      const idx = estado.body_weight.findIndex(
        (f) => f.user_id === sub && f.measured_on === b.p_fecha
      );
      if (idx === -1) {
        const fila = {
          id: randomUUID(),
          user_id: sub,
          measured_on: b.p_fecha,
          weight_kg: b.p_kg,
          editado_en: b.p_editado_en,
        };
        estado.body_weight.push(fila);
        return respuestaJson({ aplicado: true, fila });
      }
      const existente = estado.body_weight[idx];
      if (existente.editado_en < b.p_editado_en) {
        const fila = { ...existente, weight_kg: b.p_kg, editado_en: b.p_editado_en };
        estado.body_weight[idx] = fila;
        return respuestaJson({ aplicado: true, fila });
      }
      return respuestaJson({ aplicado: false, fila: existente });
    }

    if (metodo === "PATCH" && u.pathname === "/rest/v1/profiles") {
      const idBuscado = u.searchParams.get("id").replace("eq.", "");
      const idx = estado.profiles.findIndex((p) => p.id === idBuscado);
      if (idx === -1) return respuestaJson([]);
      const b = JSON.parse(opciones.body);
      estado.profiles[idx] = { ...estado.profiles[idx], ...b };
      return respuestaJson([estado.profiles[idx]]);
    }

    const tablaGet = ["exercise_logs", "body_weight", "profiles"].find((t) =>
      u.pathname.endsWith(`/${t}`)
    );
    if (metodo === "GET" && tablaGet) {
      const sub = subDelToken(headers);
      const filas =
        tablaGet === "profiles"
          ? estado.profiles.filter((p) => p.id === sub)
          : estado[tablaGet].filter((f) => f.user_id === sub);
      return respuestaJson(filas);
    }

    throw new Error(`URL/método inesperado en el backend de prueba: ${metodo} ${url}`);
  }

  return { fetchDoble, estado, contarLlamadas: () => llamadas };
}

async function dirTemporal() {
  return mkdtemp(join(tmpdir(), "kapyfit-import-"));
}

async function escribirEntrada(dir, datos) {
  const ruta = join(dir, "entrada.json");
  await writeFile(ruta, JSON.stringify(datos));
  return ruta;
}

function datosDeEjemplo() {
  const exercise_logs = [
    {
      user_id: "id-en-el-proyecto-viejo",
      slot: "dia6:v2:sentadilla",
      exercise_slug: "sentadilla",
      logged_on: "2026-09-01",
      weight_kg: 40,
      sets: 3,
      reps: "10,10,8",
      completed: true,
      editado_en: "2026-09-01T12:00:00.000Z",
    },
    {
      user_id: "id-en-el-proyecto-viejo",
      slot: "dia6:v2:press",
      exercise_slug: "press-banca",
      logged_on: "2026-09-01",
      weight_kg: 20,
      sets: 4,
      reps: "8,8,8,6",
      completed: true,
      editado_en: "2026-09-01T12:05:00.000Z",
    },
  ];
  const body_weight = [
    {
      user_id: "id-en-el-proyecto-viejo",
      measured_on: "2026-09-01",
      weight_kg: 70.5,
      editado_en: "2026-09-01T07:00:00.000Z",
    },
  ];
  const profiles = [{ id: "id-en-el-proyecto-viejo", unidad: "lb" }];
  const conteos = calcularConteos({ exercise_logs, body_weight, profiles });
  return { exercise_logs, body_weight, profiles, conteos };
}

test("importa todo y los conteos cuadran (código 0)", async () => {
  const dir = await dirTemporal();
  const datos = datosDeEjemplo();
  const ruta = await escribirEntrada(dir, datos);
  const { fetchDoble, estado } = crearBackend({
    profiles: [{ id: ID_DUENO, unidad: "kg" }],
  });
  const mensajes = [];

  const codigo = await importar({
    argv: ["node", "importar.mjs", ruta],
    env: ENV_BASE,
    fetchImpl: fetchDoble,
    log: (m) => mensajes.push(m),
    error: (m) => mensajes.push(`ERROR: ${m}`),
  });

  assert.equal(codigo, 0);
  assert.equal(estado.exercise_logs.length, 2);
  assert.equal(estado.body_weight.length, 1);
  assert.equal(estado.profiles[0].unidad, "lb");
  assert.ok(mensajes.some((m) => m.includes("Conteos cuadran en todo")));
  assert.ok(mensajes.some((m) => m.includes("exercise_logs") && m.includes("sí")));
  assert.ok(!mensajes.some((m) => m.includes("NO")));

  await rm(dir, { recursive: true, force: true });
});

test("un registro rechazado por antigüedad se cuenta aparte y no rompe", async () => {
  const dir = await dirTemporal();
  const datos = datosDeEjemplo();
  const ruta = await escribirEntrada(dir, datos);
  // El destino ya tiene la misma fila de sentadilla, con un editado_en más
  // nuevo que el del archivo pero el MISMO contenido — como si ya se
  // hubiera importado antes. La RPC debe rechazarla (aplicado:false) sin
  // que el conteo final se rompa, porque el contenido que queda es igual.
  const { fetchDoble, estado } = crearBackend({
    profiles: [{ id: ID_DUENO, unidad: "lb" }],
  });
  estado.exercise_logs.push({
    id: randomUUID(),
    user_id: ID_DUENO,
    slot: "dia6:v2:sentadilla",
    exercise_slug: "sentadilla",
    logged_on: "2026-09-01",
    weight_kg: 40,
    sets: 3,
    reps: "10,10,8",
    completed: true,
    editado_en: "2026-09-02T00:00:00.000Z",
  });
  const mensajes = [];

  const codigo = await importar({
    argv: ["node", "importar.mjs", ruta],
    env: ENV_BASE,
    fetchImpl: fetchDoble,
    log: (m) => mensajes.push(m),
    error: (m) => mensajes.push(`ERROR: ${m}`),
  });

  assert.equal(codigo, 0);
  assert.equal(estado.exercise_logs.length, 2); // no duplicó la fila
  assert.ok(
    mensajes.some((m) => m.includes("Registros de ejercicio") && m.includes("1 rechazados"))
  );

  await rm(dir, { recursive: true, force: true });
});

test("una diferencia de conteo da código distinto de 0 y lo dice en la tabla", async () => {
  const dir = await dirTemporal();
  const datos = datosDeEjemplo();
  const ruta = await escribirEntrada(dir, datos);
  const { fetchDoble } = crearBackend({ profiles: [{ id: ID_DUENO, unidad: "lb" }] });

  // Envuelve el backend para que, al releer exercise_logs al final, se
  // "pierda" una fila — simulando que algo no cuadró en destino.
  const fetchConFuga = async (url, opciones) => {
    const resp = await fetchDoble(url, opciones);
    const u = new URL(url);
    if ((opciones?.method ?? "GET") === "GET" && u.pathname.endsWith("/exercise_logs")) {
      const filas = await resp.json();
      return {
        ok: true,
        status: 200,
        json: async () => filas.slice(0, 1),
        text: async () => JSON.stringify(filas.slice(0, 1)),
      };
    }
    return resp;
  };
  const mensajes = [];

  const codigo = await importar({
    argv: ["node", "importar.mjs", ruta],
    env: ENV_BASE,
    fetchImpl: fetchConFuga,
    log: (m) => mensajes.push(m),
    error: (m) => mensajes.push(`ERROR: ${m}`),
  });

  assert.equal(codigo, 1);
  assert.ok(mensajes.some((m) => m.includes("exercise_logs") && m.includes("NO")));
  assert.ok(mensajes.some((m) => m.includes("conteos NO cuadran") || m.includes("Los conteos NO")));

  await rm(dir, { recursive: true, force: true });
});

test("correrlo dos veces no llama de más ni cambia el resultado", async () => {
  const dir = await dirTemporal();
  const datos = datosDeEjemplo();
  const ruta = await escribirEntrada(dir, datos);
  const { fetchDoble, estado } = crearBackend({
    profiles: [{ id: ID_DUENO, unidad: "lb" }],
  });

  let llamadas = 0;
  const fetchContado = async (...args) => {
    llamadas++;
    return fetchDoble(...args);
  };

  const codigo1 = await importar({
    argv: ["node", "importar.mjs", ruta],
    env: ENV_BASE,
    fetchImpl: fetchContado,
    log: () => {},
    error: () => {},
  });
  const llamadas1 = llamadas;
  const estadoTrasPrimera = JSON.parse(JSON.stringify(estado));

  llamadas = 0;
  const codigo2 = await importar({
    argv: ["node", "importar.mjs", ruta],
    env: ENV_BASE,
    fetchImpl: fetchContado,
    log: () => {},
    error: () => {},
  });
  const llamadas2 = llamadas;

  assert.equal(codigo1, 0);
  assert.equal(codigo2, 0);
  assert.equal(llamadas2, llamadas1);
  assert.deepEqual(estado, estadoTrasPrimera);

  await rm(dir, { recursive: true, force: true });
});

test("401 al importar: mensaje claro y código distinto de 0", async () => {
  const dir = await dirTemporal();
  const datos = datosDeEjemplo();
  const ruta = await escribirEntrada(dir, datos);
  const fetchDoble401 = async () => respuestaJson({ message: "JWT expired" }, 401);
  const mensajes = [];

  const codigo = await importar({
    argv: ["node", "importar.mjs", ruta],
    env: ENV_BASE,
    fetchImpl: fetchDoble401,
    log: () => {},
    error: (m) => mensajes.push(m),
  });

  assert.equal(codigo, 1);
  assert.ok(mensajes.some((m) => m.includes("token inválido o vencido")));

  await rm(dir, { recursive: true, force: true });
});

test("sin fila en profiles en destino: avisa y sigue con los registros", async () => {
  const dir = await dirTemporal();
  const exercise_logs = datosDeEjemplo().exercise_logs;
  const body_weight = datosDeEjemplo().body_weight;
  const profiles = [{ id: "id-en-el-proyecto-viejo", unidad: "lb" }];
  // conteos.profiles se deja en 0 a propósito: representa lo que el
  // exportador vería si, al momento del cotejo, el destino nunca tiene esa
  // fila (no es lo que produciría exportar.mjs del proyecto viejo — ahí
  // sí existe — pero aísla exactamente el caso "no se clonó todavía" sin
  // mezclarlo con la prueba de conteos que no cuadran).
  const datos = {
    exercise_logs,
    body_weight,
    profiles,
    conteos: { ...calcularConteos({ exercise_logs, body_weight, profiles }), profiles: 0 },
  };
  const ruta = await escribirEntrada(dir, datos);
  // Backend sin fila de profiles para ID_DUENO: el PATCH devolverá [].
  const { fetchDoble, estado } = crearBackend({ profiles: [] });
  const mensajes = [];

  const codigo = await importar({
    argv: ["node", "importar.mjs", ruta],
    env: ENV_BASE,
    fetchImpl: fetchDoble,
    log: (m) => mensajes.push(m),
    error: (m) => mensajes.push(`ERROR: ${m}`),
  });

  assert.ok(mensajes.some((m) => m.includes("no hay fila en profiles")));
  assert.equal(estado.exercise_logs.length, 2);
  assert.equal(estado.body_weight.length, 1);
  assert.equal(codigo, 0);

  await rm(dir, { recursive: true, force: true });
});

test("una RPC que falla a medias detiene la subida y da un resumen inequívoco (C1)", async () => {
  const dir = await dirTemporal();
  const registros = Array.from({ length: 8 }, (_, i) => ({
    user_id: "id-en-el-proyecto-viejo",
    slot: `dia1:v1:ejercicio-${i}`,
    exercise_slug: `ejercicio-${i}`,
    logged_on: "2026-09-01",
    weight_kg: 10 + i,
    sets: 3,
    reps: "10,10,10",
    completed: true,
    editado_en: `2026-09-01T12:0${i}:00.000Z`,
  }));
  const datos = {
    exercise_logs: registros,
    body_weight: [],
    profiles: [],
    conteos: calcularConteos({ exercise_logs: registros, body_weight: [], profiles: [] }),
  };
  const ruta = await escribirEntrada(dir, datos);
  const { fetchDoble } = crearBackend({ profiles: [{ id: ID_DUENO, unidad: "kg" }] });

  // El registro 5 de 8 (índice 4) revienta con un 500 de PostgREST.
  let llamadasRpc = 0;
  const fetchQueFalla = async (url, opciones) => {
    const u = new URL(url);
    if (u.pathname.endsWith("/rpc/subir_registro_ejercicio")) {
      llamadasRpc++;
      if (llamadasRpc === 5) {
        return {
          ok: false,
          status: 500,
          json: async () => ({ message: "error interno de prueba" }),
          text: async () => JSON.stringify({ message: "error interno de prueba" }),
        };
      }
    }
    return fetchDoble(url, opciones);
  };
  const mensajes = [];
  const errores = [];

  const codigo = await importar({
    argv: ["node", "importar.mjs", ruta],
    env: ENV_BASE,
    fetchImpl: fetchQueFalla,
    log: (m) => mensajes.push(m),
    error: (m) => errores.push(m),
  });

  assert.equal(codigo, 1);
  assert.equal(llamadasRpc, 5); // se detuvo: no siguió con los registros 6, 7 y 8
  assert.ok(errores.some((m) => m.includes("4") && m.includes("aplicados")));
  assert.ok(errores.some((m) => m.includes("dia1:v1:ejercicio-4|2026-09-01")));
  assert.ok(errores.some((m) => m.includes("error interno de prueba")));
  assert.ok(errores.some((m) => m.includes("Re-correr") && m.includes("seguro")));
  // Ningún mensaje debe traer un stack trace crudo (rastro de "at ... (archivo:línea)").
  assert.ok(!errores.some((m) => /\bat .*:\d+:\d+/.test(m)));

  await rm(dir, { recursive: true, force: true });
});

// --- I1: el cotejo por huellas detecta lo que conteos/sumas/claves no ven ---
// En cada caso el destino ya trae una fila "corrupta" con un editado_en más
// nuevo que el del archivo, así la RPC la rechaza (aplicado:false, como si
// viniera de una corrida anterior) y el valor problemático queda plantado
// para el cotejo final — exactamente el escenario que debe detectar.

test("pesos intercambiados: mismos conteos y sumas, pero se detecta por huellas (I1)", async () => {
  const dir = await dirTemporal();
  const datos = datosDeEjemplo(); // sentadilla=40, press=20, misma suma total=60
  const ruta = await escribirEntrada(dir, datos);
  const { fetchDoble, estado } = crearBackend({ profiles: [{ id: ID_DUENO, unidad: "lb" }] });
  const editadoMasNuevo = "2026-09-03T00:00:00.000Z";
  // Destino ya tiene ambas filas, pero con los pesos INTERCAMBIADOS.
  estado.exercise_logs.push(
    {
      id: randomUUID(),
      user_id: ID_DUENO,
      slot: "dia6:v2:sentadilla",
      exercise_slug: "sentadilla",
      logged_on: "2026-09-01",
      weight_kg: 20, // debería ser 40
      sets: 3,
      reps: "10,10,8",
      completed: true,
      editado_en: editadoMasNuevo,
    },
    {
      id: randomUUID(),
      user_id: ID_DUENO,
      slot: "dia6:v2:press",
      exercise_slug: "press-banca",
      logged_on: "2026-09-01",
      weight_kg: 40, // debería ser 20
      sets: 4,
      reps: "8,8,8,6",
      completed: true,
      editado_en: editadoMasNuevo,
    }
  );
  const mensajes = [];

  const codigo = await importar({
    argv: ["node", "importar.mjs", ruta],
    env: ENV_BASE,
    fetchImpl: fetchDoble,
    log: (m) => mensajes.push(m),
    error: (m) => mensajes.push(`ERROR: ${m}`),
  });

  assert.equal(codigo, 1);
  // Los conteos numéricos y la suma siguen cuadrando (por eso hace falta la huella).
  assert.ok(mensajes.some((m) => m.includes("suma_peso_exercise_logs") && m.includes("sí")));
  assert.ok(mensajes.some((m) => m.includes("huellas_exercise_logs") && m.includes("NO")));
  assert.ok(mensajes.some((m) => m.includes("dia6:v2:sentadilla|2026-09-01")));

  await rm(dir, { recursive: true, force: true });
});

test("completed invertido en una fila se detecta por huellas (I1)", async () => {
  const dir = await dirTemporal();
  const datos = datosDeEjemplo();
  const ruta = await escribirEntrada(dir, datos);
  const { fetchDoble, estado } = crearBackend({ profiles: [{ id: ID_DUENO, unidad: "lb" }] });
  estado.exercise_logs.push({
    id: randomUUID(),
    user_id: ID_DUENO,
    slot: "dia6:v2:sentadilla",
    exercise_slug: "sentadilla",
    logged_on: "2026-09-01",
    weight_kg: 40,
    sets: 3,
    reps: "10,10,8",
    completed: false, // invertido: el archivo trae true
    editado_en: "2026-09-03T00:00:00.000Z",
  });
  const mensajes = [];

  const codigo = await importar({
    argv: ["node", "importar.mjs", ruta],
    env: ENV_BASE,
    fetchImpl: fetchDoble,
    log: (m) => mensajes.push(m),
    error: (m) => mensajes.push(`ERROR: ${m}`),
  });

  assert.equal(codigo, 1);
  assert.ok(mensajes.some((m) => m.includes("huellas_exercise_logs") && m.includes("NO")));
  assert.ok(mensajes.some((m) => m.includes("dia6:v2:sentadilla|2026-09-01")));

  await rm(dir, { recursive: true, force: true });
});

test("reps vaciado en una fila se detecta por huellas (I1)", async () => {
  const dir = await dirTemporal();
  const datos = datosDeEjemplo();
  const ruta = await escribirEntrada(dir, datos);
  const { fetchDoble, estado } = crearBackend({ profiles: [{ id: ID_DUENO, unidad: "lb" }] });
  estado.exercise_logs.push({
    id: randomUUID(),
    user_id: ID_DUENO,
    slot: "dia6:v2:press",
    exercise_slug: "press-banca",
    logged_on: "2026-09-01",
    weight_kg: 20,
    sets: 4,
    reps: "", // vaciado: el archivo trae "8,8,8,6"
    completed: true,
    editado_en: "2026-09-03T00:00:00.000Z",
  });
  const mensajes = [];

  const codigo = await importar({
    argv: ["node", "importar.mjs", ruta],
    env: ENV_BASE,
    fetchImpl: fetchDoble,
    log: (m) => mensajes.push(m),
    error: (m) => mensajes.push(`ERROR: ${m}`),
  });

  assert.equal(codigo, 1);
  assert.ok(mensajes.some((m) => m.includes("huellas_exercise_logs") && m.includes("NO")));
  assert.ok(mensajes.some((m) => m.includes("dia6:v2:press|2026-09-01")));

  await rm(dir, { recursive: true, force: true });
});

test("null en weight_kg no se confunde con 0: se detecta por huellas (I1)", async () => {
  const dir = await dirTemporal();
  const exercise_logs = [
    {
      user_id: "id-en-el-proyecto-viejo",
      slot: "dia6:v2:plancha",
      exercise_slug: "plancha",
      logged_on: "2026-09-01",
      weight_kg: null, // ejercicio sin peso registrado
      sets: 3,
      reps: "60,60,60",
      completed: true,
      editado_en: "2026-09-01T12:00:00.000Z",
    },
  ];
  const body_weight = [];
  const profiles = [{ id: "id-en-el-proyecto-viejo", unidad: "lb" }];
  const datos = {
    exercise_logs,
    body_weight,
    profiles,
    conteos: calcularConteos({ exercise_logs, body_weight, profiles }),
  };
  const ruta = await escribirEntrada(dir, datos);
  const { fetchDoble, estado } = crearBackend({ profiles: [{ id: ID_DUENO, unidad: "lb" }] });
  // Destino ya trae 0 en vez de null, con editado_en más nuevo.
  estado.exercise_logs.push({
    id: randomUUID(),
    user_id: ID_DUENO,
    slot: "dia6:v2:plancha",
    exercise_slug: "plancha",
    logged_on: "2026-09-01",
    weight_kg: 0,
    sets: 3,
    reps: "60,60,60",
    completed: true,
    editado_en: "2026-09-03T00:00:00.000Z",
  });
  const mensajes = [];

  const codigo = await importar({
    argv: ["node", "importar.mjs", ruta],
    env: ENV_BASE,
    fetchImpl: fetchDoble,
    log: (m) => mensajes.push(m),
    error: (m) => mensajes.push(`ERROR: ${m}`),
  });

  assert.equal(codigo, 1);
  // La suma de pesos sigue cuadrando (null y 0 suman igual) — solo la huella lo ve.
  assert.ok(mensajes.some((m) => m.includes("suma_peso_exercise_logs") && m.includes("sí")));
  assert.ok(mensajes.some((m) => m.includes("huellas_exercise_logs") && m.includes("NO")));
  assert.ok(mensajes.some((m) => m.includes("|null") || m.includes("null|")));

  await rm(dir, { recursive: true, force: true });
});

test("archivo exportado sin huellas (versión anterior) se rechaza sin cotejar a medias (I1)", async () => {
  const dir = await dirTemporal();
  const { exercise_logs, body_weight, profiles } = datosDeEjemplo();
  // Simula un JSON exportado con la versión vieja: conteos sin huellas_*.
  const datos = {
    exercise_logs,
    body_weight,
    profiles,
    conteos: {
      exercise_logs: exercise_logs.length,
      body_weight: body_weight.length,
      profiles: profiles.length,
      suma_peso_exercise_logs: 60,
      suma_peso_body_weight: 70.5,
      claves_exercise_logs: ["dia6:v2:press|2026-09-01", "dia6:v2:sentadilla|2026-09-01"],
      // huellas_exercise_logs / huellas_body_weight ausentes a propósito.
    },
  };
  const ruta = await escribirEntrada(dir, datos);
  let llamadasFetch = 0;
  const fetchDoble = async () => {
    llamadasFetch++;
    throw new Error("no debería llamarse a la red");
  };
  const mensajes = [];

  const codigo = await importar({
    argv: ["node", "importar.mjs", ruta],
    env: ENV_BASE,
    fetchImpl: fetchDoble,
    log: (m) => mensajes.push(m),
    error: (m) => mensajes.push(`ERROR: ${m}`),
  });

  assert.equal(codigo, 1);
  assert.equal(llamadasFetch, 0); // se rechazó antes de tocar la red
  assert.ok(mensajes.some((m) => m.includes("versión anterior") && m.includes("re-exporta") || m.includes("Vuelve a exportarlo")));

  await rm(dir, { recursive: true, force: true });
});
