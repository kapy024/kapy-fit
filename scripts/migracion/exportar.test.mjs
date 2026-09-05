// Pruebas del exportador (tarea 4 de la migración de proyecto). Corren junto
// con las del importador, nombrando ambos archivos de forma explícita (sin
// package.json, `node --test scripts/migracion/` falla con MODULE_NOT_FOUND):
// `node --test scripts/migracion/exportar.test.mjs scripts/migracion/importar.test.mjs`
// Sin dependencias, sin tocar la red: cada caso pasa un fetch doble. Este
// runner es solo para los scripts de scripts/migracion/; tests.html y js/
// siguen con pruebas.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exportar } from "./exportar.mjs";

function tokenDePrueba(payload) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const cuerpo = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${cuerpo}.firma-falsa`;
}

const ENV_BASE = {
  SUPABASE_URL: "https://viejo.supabase.co",
  SUPABASE_ANON_KEY: "anon-de-prueba",
  TOKEN: tokenDePrueba({ sub: "usuario-1", email: "dueno@example.com" }),
};

function respuestaJson(cuerpo, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => cuerpo,
    text: async () => JSON.stringify(cuerpo),
  };
}

async function dirTemporal() {
  return mkdtemp(join(tmpdir(), "kapyfit-export-"));
}

test("escribe el JSON con los conteos correctos", async () => {
  const dir = await dirTemporal();
  const ruta = join(dir, "salida.json");

  const fetchDoble = async (url) => {
    const { pathname } = new URL(url);
    if (pathname.endsWith("/exercise_logs")) {
      return respuestaJson([
        { id: "1", slot: "dia6:v2:sentadilla", logged_on: "2026-09-01", weight_kg: 40 },
        { id: "2", slot: "dia6:v2:press", logged_on: "2026-09-01", weight_kg: 20 },
      ]);
    }
    if (pathname.endsWith("/body_weight")) {
      return respuestaJson([{ id: "3", measured_on: "2026-09-01", weight_kg: 70.5 }]);
    }
    if (pathname.endsWith("/profiles")) {
      return respuestaJson([{ id: "usuario-1", unidad: "kg" }]);
    }
    throw new Error(`URL inesperada: ${url}`);
  };

  const codigo = await exportar({
    argv: ["node", "exportar.mjs", ruta],
    env: ENV_BASE,
    fetchImpl: fetchDoble,
    ahora: () => new Date("2026-09-04T12:00:00.000Z"),
    log: () => {},
    error: () => {},
  });

  assert.equal(codigo, 0);
  const contenido = JSON.parse(await readFile(ruta, "utf8"));
  assert.equal(contenido.exportado_en, "2026-09-04T12:00:00.000Z");
  assert.deepEqual(contenido.usuario, { id: "usuario-1", correo: "dueno@example.com" });
  assert.equal(contenido.exercise_logs.length, 2);
  assert.equal(contenido.body_weight.length, 1);
  assert.equal(contenido.profiles.length, 1);
  assert.deepEqual(contenido.conteos, {
    exercise_logs: 2,
    body_weight: 1,
    profiles: 1,
    suma_peso_exercise_logs: 60,
    suma_peso_body_weight: 70.5,
    claves_exercise_logs: [
      "dia6:v2:press|2026-09-01",
      "dia6:v2:sentadilla|2026-09-01",
    ],
    huellas_exercise_logs: [
      "dia6:v2:press|2026-09-01|20|null|null|null",
      "dia6:v2:sentadilla|2026-09-01|40|null|null|null",
    ],
    huellas_body_weight: ["2026-09-01|70.5"],
  });

  await rm(dir, { recursive: true, force: true });
});

test("se niega a sobrescribir un archivo existente, sin tocar la red", async () => {
  const dir = await dirTemporal();
  const ruta = join(dir, "salida.json");
  await writeFile(ruta, "{}");

  let llamadasFetch = 0;
  const fetchDoble = async () => {
    llamadasFetch++;
    return respuestaJson([]);
  };
  const mensajes = [];

  const codigo = await exportar({
    argv: ["node", "exportar.mjs", ruta],
    env: ENV_BASE,
    fetchImpl: fetchDoble,
    ahora: () => new Date(),
    log: () => {},
    error: (m) => mensajes.push(m),
  });

  assert.equal(codigo, 1);
  assert.equal(llamadasFetch, 0);
  assert.equal(await readFile(ruta, "utf8"), "{}");
  assert.ok(mensajes.some((m) => m.includes("ya existe")));

  await rm(dir, { recursive: true, force: true });
});

test("un 401 de PostgREST se reporta como token inválido o vencido", async () => {
  const dir = await dirTemporal();
  const ruta = join(dir, "salida.json");

  const fetchDoble = async () => respuestaJson({ message: "JWT expired" }, 401);
  const mensajes = [];

  const codigo = await exportar({
    argv: ["node", "exportar.mjs", ruta],
    env: ENV_BASE,
    fetchImpl: fetchDoble,
    ahora: () => new Date(),
    log: () => {},
    error: (m) => mensajes.push(m),
  });

  assert.equal(codigo, 1);
  assert.ok(mensajes.some((m) => m.includes("token inválido o vencido")));
  await assert.rejects(readFile(ruta, "utf8"));

  await rm(dir, { recursive: true, force: true });
});

test("una lista de 1500 filas se pagina completa", async () => {
  const dir = await dirTemporal();
  const ruta = join(dir, "salida.json");
  const total = 1500;

  const fetchDoble = async (url, opciones) => {
    const { pathname } = new URL(url);
    if (!pathname.endsWith("/exercise_logs")) return respuestaJson([]);
    const [desde, hasta] = opciones.headers.Range.split("-").map(Number);
    const filas = [];
    for (let i = desde; i <= hasta && i < total; i++) {
      filas.push({ id: String(i), slot: `slot-${i}`, logged_on: "2026-09-01", weight_kg: 1 });
    }
    return respuestaJson(filas);
  };

  const codigo = await exportar({
    argv: ["node", "exportar.mjs", ruta],
    env: ENV_BASE,
    fetchImpl: fetchDoble,
    ahora: () => new Date(),
    log: () => {},
    error: () => {},
  });

  assert.equal(codigo, 0);
  const contenido = JSON.parse(await readFile(ruta, "utf8"));
  assert.equal(contenido.exercise_logs.length, total);
  assert.equal(contenido.conteos.exercise_logs, total);
  assert.equal(contenido.conteos.suma_peso_exercise_logs, total);

  await rm(dir, { recursive: true, force: true });
});

test("calcularConteos escribe null literal en las huellas, nunca 0 ni vacío (I1)", async () => {
  const { calcularConteos } = await import("./exportar.mjs");
  const conteos = calcularConteos({
    exercise_logs: [
      {
        slot: "dia1:v1:sentadilla",
        logged_on: "2026-09-01",
        weight_kg: null,
        sets: 3,
        reps: "10,10,10",
        completed: false,
      },
      {
        slot: "dia1:v1:press",
        logged_on: "2026-09-01",
        weight_kg: 0,
        sets: 3,
        reps: "10,10,10",
        completed: true,
      },
    ],
    body_weight: [],
    profiles: [],
  });

  assert.ok(
    conteos.huellas_exercise_logs.includes(
      "dia1:v1:sentadilla|2026-09-01|null|3|10,10,10|false"
    )
  );
  assert.ok(
    conteos.huellas_exercise_logs.includes(
      "dia1:v1:press|2026-09-01|0|3|10,10,10|true"
    )
  );
  // null y 0 nunca deben producir la misma huella.
  assert.notEqual(conteos.huellas_exercise_logs[0], conteos.huellas_exercise_logs[1]);
});

test("falta una variable de entorno: mensaje claro y código distinto de 0", async () => {
  const dir = await dirTemporal();
  const ruta = join(dir, "salida.json");
  const { TOKEN, ...envSinToken } = ENV_BASE;
  const mensajes = [];

  const codigo = await exportar({
    argv: ["node", "exportar.mjs", ruta],
    env: envSinToken,
    fetchImpl: async () => respuestaJson([]),
    ahora: () => new Date(),
    log: () => {},
    error: (m) => mensajes.push(m),
  });

  assert.notEqual(codigo, 0);
  assert.ok(mensajes.some((m) => m.includes("TOKEN")));

  await rm(dir, { recursive: true, force: true });
});
