#!/usr/bin/env node
// Imports the owner's data (exported by exportar.mjs from the OLD project)
// into the site's NEW Supabase project, reassigning ownership to whoever
// signs TOKEN. See this folder's README.md for the full procedure.
//
// Usage: node scripts/migracion/importar.mjs <ruta-entrada.json>
// Required env vars: SUPABASE_URL, SUPABASE_ANON_KEY, TOKEN — all for the
// NEW project. TOKEN is the owner's own access_token there — never the
// service_role key.
//
// The `user_id` inside the exported JSON is NEVER read: both RPCs
// (subir_registro_ejercicio, subir_peso_corporal) take their user_id from
// auth.uid(), i.e. whoever signs TOKEN. Reassigning ownership from the old
// account to the new one is therefore a side effect of which token you
// pass in — nothing here inspects or rewrites any id from the file.

import { readFile } from "node:fs/promises";
import { decodificarJwt, ErrorToken, calcularConteos } from "./exportar.mjs";

const LIMITE_PAGINA = 1000; // Same PostgREST default the exporter pages around.

// Calls one PostgREST RPC with the owner's token and returns its parsed
// JSON body (for subir_registro_ejercicio/subir_peso_corporal this is a
// single {aplicado, fila} object — the functions return one composite row,
// not a set). Throws ErrorToken on 401 so callers can tell an expired or
// invalid token apart from any other failure.
async function llamarRpc({ fetchImpl, url, anonKey, token, fn, body }) {
  const resp = await fetchImpl(`${url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (resp.status === 401) throw new ErrorToken();
  if (!resp.ok) {
    const cuerpo = await resp.text();
    throw new Error(`PostgREST respondió ${resp.status} en rpc/${fn}: ${cuerpo}`);
  }
  return resp.json();
}

// Pagination twin of exportar.mjs's traerTabla, kept local instead of
// imported: it always targets the DESTINATION project (to count what
// actually landed there), while the exporter's version always targets the
// source. Same reasoning applies — RLS scopes every row to whoever signs
// `token`, so this never filters by user_id either.
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

// Elements only in `a`, and elements only in `b` — used to point at exactly
// which slot|logged_on keys don't line up when claves_exercise_logs differs.
function diferenciaSimetrica(a, b) {
  const setA = new Set(a);
  const setB = new Set(b);
  return {
    soloOrigen: a.filter((k) => !setB.has(k)),
    soloDestino: b.filter((k) => !setA.has(k)),
  };
}

// Compares the exporter's `conteos` block (origen) against the same block
// recomputed from what actually landed in the new project (destino, built
// with the exporter's own calcularConteos so both sides are counted
// identically). Returns one row per field for the printed table plus a
// single `iguales` verdict that decides the exit code — this is what makes
// the table's outcome unambiguous instead of something the reader has to
// eyeball.
function compararConteos(origen, destino) {
  const camposNumericos = [
    "exercise_logs",
    "body_weight",
    "profiles",
    "suma_peso_exercise_logs",
    "suma_peso_body_weight",
  ];
  const filas = camposNumericos.map((campo) => ({
    campo,
    origen: origen[campo],
    destino: destino[campo],
    coincide: origen[campo] === destino[campo],
  }));

  const clavesOrigen = origen.claves_exercise_logs ?? [];
  const clavesDestino = destino.claves_exercise_logs ?? [];
  const clavesCoinciden =
    clavesOrigen.length === clavesDestino.length &&
    clavesOrigen.every((k, i) => k === clavesDestino[i]);
  filas.push({
    campo: "claves_exercise_logs",
    origen: `${clavesOrigen.length} claves`,
    destino: `${clavesDestino.length} claves`,
    coincide: clavesCoinciden,
  });

  return {
    filas,
    iguales: filas.every((f) => f.coincide),
    diferenciasClaves: clavesCoinciden ? null : diferenciaSimetrica(clavesOrigen, clavesDestino),
  };
}

// Prints the origen/destino/coincide table column by column. Plain
// fixed-width padding — no dependency — is enough for a table nobody needs
// to parse by machine; a human deciding whether to move on to tarea 6 reads
// this directly.
function imprimirTabla(filas, log) {
  const col = (s, n) => String(s).padEnd(n);
  log(col("campo", 26) + col("origen", 14) + col("destino", 14) + "coincide");
  for (const f of filas) {
    log(col(f.campo, 26) + col(f.origen, 14) + col(f.destino, 14) + (f.coincide ? "sí" : "NO"));
  }
}

// Uploads every exercise_logs row one by one via subir_registro_ejercicio,
// passing `p_editado_en` straight from the file so the RPC's own
// conditional write (006_edicion_cliente.sql: only overwrites when strictly
// newer) decides what sticks — this is also what makes running the whole
// import twice a no-op the second time. `aplicado: false` isn't an error:
// it means the destination already had something at least as new (e.g. a
// second run of this same script), so those are counted separately instead
// of being treated as failures.
async function subirRegistros({ fetchImpl, url, anonKey, token, registros }) {
  let aplicados = 0;
  let rechazadosPorAntiguedad = 0;
  for (const r of registros) {
    const { aplicado } = await llamarRpc({
      fetchImpl,
      url,
      anonKey,
      token,
      fn: "subir_registro_ejercicio",
      body: {
        p_slot: r.slot,
        p_slug: r.exercise_slug,
        p_fecha: r.logged_on,
        p_peso: r.weight_kg,
        p_series: r.sets,
        p_reps: r.reps,
        p_hecho: r.completed,
        p_editado_en: r.editado_en,
      },
    });
    if (aplicado) aplicados++;
    else rechazadosPorAntiguedad++;
  }
  return { aplicados, rechazadosPorAntiguedad };
}

// Same idea as subirRegistros but for body_weight via subir_peso_corporal
// (sql/009_peso_corporal.sql) — one call per row, `p_editado_en` from the
// file, `aplicado: false` counted apart instead of treated as an error.
async function subirPesos({ fetchImpl, url, anonKey, token, pesos }) {
  let aplicados = 0;
  let rechazadosPorAntiguedad = 0;
  for (const p of pesos) {
    const { aplicado } = await llamarRpc({
      fetchImpl,
      url,
      anonKey,
      token,
      fn: "subir_peso_corporal",
      body: {
        p_fecha: p.measured_on,
        p_kg: p.weight_kg,
        p_editado_en: p.editado_en,
      },
    });
    if (aplicado) aplicados++;
    else rechazadosPorAntiguedad++;
  }
  return { aplicados, rechazadosPorAntiguedad };
}

// Restores profiles.unidad on the CALLER's own row (`id=eq.<idPropio>`,
// where idPropio comes from decoding TOKEN — never from the file). If the
// row doesn't exist yet in the new project (the owner hasn't logged in
// there to trigger their profiles clone), PostgREST returns an empty array
// and this just warns and returns — it is NOT a reason to abort the
// exercise/weight import, per the brief.
async function subirUnidad({ fetchImpl, url, anonKey, token, idPropio, unidad, log }) {
  const resp = await fetchImpl(`${url}/rest/v1/profiles?id=eq.${idPropio}`, {
    method: "PATCH",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({ unidad }),
  });
  if (resp.status === 401) throw new ErrorToken();
  if (!resp.ok) {
    const cuerpo = await resp.text();
    throw new Error(`PostgREST respondió ${resp.status} en PATCH profiles: ${cuerpo}`);
  }
  const filas = await resp.json();
  if (filas.length === 0) {
    log(
      "Aviso: no hay fila en profiles para este usuario en el proyecto nuevo " +
        "(el dueño aún no inició sesión ahí para clonarse) — unidad no se " +
        "restauró. Se sigue con los registros; esto no cuenta como error."
    );
  }
  return filas;
}

// Orchestrates the whole import. Every external dependency (argv, env,
// fetch, console output) is an injectable parameter with a real default,
// mirroring exportar.mjs, so importar.test.mjs can pass doubles without
// touching the network. Returns the process exit code (0 = success, and
// only success when every field in the cotejo table matches).
export async function importar({
  argv = process.argv,
  env = process.env,
  fetchImpl = fetch,
  log = console.log,
  error = console.error,
} = {}) {
  const rutaEntrada = argv[2];
  if (!rutaEntrada) {
    error("Uso: node scripts/migracion/importar.mjs <ruta-entrada.json>");
    return 1;
  }

  const faltantes = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "TOKEN"].filter((k) => !env[k]);
  if (faltantes.length > 0) {
    error(`Faltan variables de entorno: ${faltantes.join(", ")}`);
    return 1;
  }
  const { SUPABASE_URL, SUPABASE_ANON_KEY, TOKEN } = env;

  // idPropio identifies the PATCH target (the caller's own profiles row).
  // It comes from decoding TOKEN, never from the file — same rule as the
  // RPCs' auth.uid().
  let idPropio;
  try {
    idPropio = decodificarJwt(TOKEN).sub;
  } catch (e) {
    error(`TOKEN inválido: ${e.message}`);
    return 1;
  }

  let datos;
  try {
    datos = JSON.parse(await readFile(rutaEntrada, "utf8"));
  } catch (e) {
    error(`No se pudo leer ${rutaEntrada}: ${e.message}`);
    return 1;
  }

  // El `user_id` que trae el archivo es el del proyecto VIEJO y nunca se
  // usa aquí: ver el comentario al inicio del archivo.
  const registros = datos.exercise_logs ?? [];
  const pesos = datos.body_weight ?? [];
  const perfiles = datos.profiles ?? [];

  try {
    const resultadoRegistros = await subirRegistros({
      fetchImpl,
      url: SUPABASE_URL,
      anonKey: SUPABASE_ANON_KEY,
      token: TOKEN,
      registros,
    });
    const resultadoPesos = await subirPesos({
      fetchImpl,
      url: SUPABASE_URL,
      anonKey: SUPABASE_ANON_KEY,
      token: TOKEN,
      pesos,
    });

    if (perfiles.length > 0) {
      await subirUnidad({
        fetchImpl,
        url: SUPABASE_URL,
        anonKey: SUPABASE_ANON_KEY,
        token: TOKEN,
        idPropio,
        unidad: perfiles[0].unidad,
        log,
      });
    } else {
      log("Aviso: el archivo no trae profiles — no hay unidad que restaurar.");
    }

    log(
      `Registros de ejercicio: ${resultadoRegistros.aplicados} aplicados, ` +
        `${resultadoRegistros.rechazadosPorAntiguedad} rechazados por antigüedad ` +
        "(aplicado:false — el servidor ya tenía algo más nuevo; no es error)."
    );
    log(
      `Pesos corporales: ${resultadoPesos.aplicados} aplicados, ` +
        `${resultadoPesos.rechazadosPorAntiguedad} rechazados por antigüedad ` +
        "(aplicado:false — el servidor ya tenía algo más nuevo; no es error)."
    );

    const [destExerciseLogs, destBodyWeight, destProfiles] = await Promise.all(
      ["exercise_logs", "body_weight", "profiles"].map((tabla) =>
        traerTabla({ fetchImpl, url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY, token: TOKEN, tabla })
      )
    );

    const conteosDestino = calcularConteos({
      exercise_logs: destExerciseLogs,
      body_weight: destBodyWeight,
      profiles: destProfiles,
    });

    const { filas, iguales, diferenciasClaves } = compararConteos(datos.conteos ?? {}, conteosDestino);
    log("");
    imprimirTabla(filas, log);

    if (!iguales) {
      if (diferenciasClaves) {
        log(`Solo en origen: ${JSON.stringify(diferenciasClaves.soloOrigen)}`);
        log(`Solo en destino: ${JSON.stringify(diferenciasClaves.soloDestino)}`);
      }
      error(
        "Los conteos NO cuadran — no se sigue adelante (no se toca config.js, no se pasa a tarea 6)."
      );
      return 1;
    }

    log("Conteos cuadran en todo. Migración de datos completa.");
    return 0;
  } catch (e) {
    if (e instanceof ErrorToken) {
      error(e.message);
      return 1;
    }
    throw e;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const codigo = await importar({});
  process.exitCode = codigo;
}
