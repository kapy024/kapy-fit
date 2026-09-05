#!/usr/bin/env node
// Exports the owner's data from the old Registro de Hierro Supabase project
// so it can be migrated into the new one. See this folder's README.md for
// the full procedure (how to get the token, how to run this, what to note).
//
// Usage: node scripts/migracion/exportar.mjs <ruta-salida.json>
// Required env vars: SUPABASE_URL, SUPABASE_ANON_KEY, TOKEN (the owner's own
// access_token — never the service_role key).
//
// No libraries: plain fetch against PostgREST with `apikey` +
// `Authorization: Bearer <token>`. RLS on the old project (sql/002_rls.sql)
// already scopes every table to the owner via auth.uid(), so this script
// never filters by user_id — it doesn't need to, and it never sees one.

import { access, mkdir, writeFile } from "node:fs/promises";
import { constants as FS } from "node:fs";
import { dirname } from "node:path";

const LIMITE_PAGINA = 1000; // PostgREST's default page cap.
const TABLAS = ["exercise_logs", "body_weight", "profiles"];

// Raised only for a 401 from PostgREST, so the caller can tell an expired
// or invalid token apart from any other network failure.
export class ErrorToken extends Error {
  constructor() {
    super("token inválido o vencido");
  }
}

// Decodes a JWT's payload without verifying the signature — enough to know
// whose export this is (sub/email) for a sanity check; PostgREST already
// did the real verification by accepting the token on the fetch calls
// below.
export function decodificarJwt(token) {
  const partes = String(token).split(".");
  if (partes.length !== 3) throw new Error("el TOKEN no tiene forma de JWT");
  let json;
  try {
    json = Buffer.from(partes[1], "base64url").toString("utf8");
  } catch {
    throw new Error("el TOKEN no se pudo decodificar");
  }
  try {
    return JSON.parse(json);
  } catch {
    throw new Error("el TOKEN no se pudo decodificar");
  }
}

// Fetches every row of `tabla` from PostgREST, paginating with Range so a
// table past PostgREST's default 1000-row cap still comes back whole.
// `order=id.asc` keeps page boundaries stable across requests.
async function traerTabla({ fetchImpl, url, anonKey, token, tabla }) {
  const filas = [];
  let desde = 0;
  for (;;) {
    const hasta = desde + LIMITE_PAGINA - 1;
    const resp = await fetchImpl(`${url}/rest/v1/${tabla}?select=*&order=id.asc`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
        Range: `${desde}-${hasta}`,
      },
    });
    if (resp.status === 401) throw new ErrorToken();
    if (!resp.ok) {
      const cuerpo = await resp.text();
      throw new Error(`PostgREST respondió ${resp.status} en ${tabla}: ${cuerpo}`);
    }
    const lote = await resp.json();
    filas.push(...lote);
    if (lote.length < LIMITE_PAGINA) break;
    desde += LIMITE_PAGINA;
  }
  return filas;
}

// The block a future importer will cross-check against what it sees in the
// new project: row counts, weight sums, and the slot|logged_on keys so any
// mismatch can be tracked down to a specific record.
export function calcularConteos({ exercise_logs, body_weight, profiles }) {
  const sumaPeso = (filas) =>
    filas.reduce((acc, f) => acc + (typeof f.weight_kg === "number" ? f.weight_kg : 0), 0);
  const claves = exercise_logs
    .map((f) => `${f.slot}|${f.logged_on}`)
    .sort();
  return {
    exercise_logs: exercise_logs.length,
    body_weight: body_weight.length,
    profiles: profiles.length,
    suma_peso_exercise_logs: sumaPeso(exercise_logs),
    suma_peso_body_weight: sumaPeso(body_weight),
    claves_exercise_logs: claves,
  };
}

// Orchestrates the whole export. Every external dependency (argv, env,
// fetch, clock, console output) is an injectable parameter with a real
// default, so exportar.test.mjs can pass doubles without touching the
// network or the real clock. Returns the process exit code (0 = success).
export async function exportar({
  argv = process.argv,
  env = process.env,
  fetchImpl = fetch,
  ahora = () => new Date(),
  log = console.log,
  error = console.error,
} = {}) {
  const rutaSalida = argv[2];
  if (!rutaSalida) {
    error("Uso: node scripts/migracion/exportar.mjs <ruta-salida.json>");
    return 1;
  }

  const faltantes = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "TOKEN"].filter((k) => !env[k]);
  if (faltantes.length > 0) {
    error(`Faltan variables de entorno: ${faltantes.join(", ")}`);
    return 1;
  }
  const { SUPABASE_URL, SUPABASE_ANON_KEY, TOKEN } = env;

  // Refuse to overwrite BEFORE touching the network: if the file already
  // exists, don't spend a single PostgREST call.
  try {
    await access(rutaSalida, FS.F_OK);
    error(`${rutaSalida} ya existe — no se sobrescribe. Bórralo o elige otra ruta.`);
    return 1;
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }

  let usuario;
  try {
    const payload = decodificarJwt(TOKEN);
    usuario = { id: payload.sub, correo: payload.email };
  } catch (e) {
    error(`TOKEN inválido: ${e.message}`);
    return 1;
  }

  let exercise_logs, body_weight, profiles;
  try {
    [exercise_logs, body_weight, profiles] = await Promise.all(
      TABLAS.map((tabla) =>
        traerTabla({ fetchImpl, url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY, token: TOKEN, tabla })
      )
    );
  } catch (e) {
    if (e instanceof ErrorToken) {
      error(e.message);
      return 1;
    }
    throw e;
  }

  const conteos = calcularConteos({ exercise_logs, body_weight, profiles });
  const salida = {
    exportado_en: ahora().toISOString(),
    usuario,
    exercise_logs,
    body_weight,
    profiles,
    conteos,
  };

  await mkdir(dirname(rutaSalida), { recursive: true });
  try {
    await writeFile(rutaSalida, JSON.stringify(salida, null, 2) + "\n", { flag: "wx" });
  } catch (e) {
    if (e.code === "EEXIST") {
      error(`${rutaSalida} ya existe — no se sobrescribe. Bórralo o elige otra ruta.`);
      return 1;
    }
    throw e;
  }

  log(`Exportado a ${rutaSalida}`);
  log(JSON.stringify(conteos, null, 2));
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const codigo = await exportar({});
  process.exitCode = codigo;
}
