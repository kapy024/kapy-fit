// Generates sql/003_semilla.sql from the code, never by hand: js/catalogo.js
// owns the 43 exercises and js/rutina.js owns the 7-day split with its slots
// already computed by asignarSlots(). Transcribing either by hand is exactly
// how the seed and the code drift apart.
//
// Run with: node scripts/generar-semilla.mjs > sql/003_semilla.sql
import { CATALOGO } from "../js/catalogo.js";
import { RUTINA } from "../js/rutina.js";

// Quotes a SQL string literal, doubling embedded single quotes ('' is the
// SQL-standard escape). null/undefined become the SQL keyword null,
// unquoted — never the literal string "null".
function strLit(v) {
  if (v === null || v === undefined) return "null";
  return `'${String(v).replace(/'/g, "''")}'`;
}

// Numbers and booleans pass through unquoted; null stays the SQL keyword.
function litOrNull(v) {
  if (v === null || v === undefined) return "null";
  return String(v);
}

function boolLit(v) {
  return v ? "true" : "false";
}

function generarExercises() {
  const filas = Object.entries(CATALOGO).map(([slug, e]) => {
    return `  (${strLit(slug)}, ${strLit(e.nombre)}, ${strLit(e.video)}, ${strLit(e.imagenInicio)}, ${strLit(e.imagenFin)})`;
  });
  return [
    "-- 1) Catálogo de ejercicios: upsert por slug, así re-aplicar la semilla",
    "-- nunca duplica ni pisa un slug ausente en una corrida anterior.",
    "insert into exercises (slug, nombre, video, imagen_inicio, imagen_fin) values",
    filas.join(",\n") + "",
    "on conflict (slug) do update set",
    "  nombre        = excluded.nombre,",
    "  video         = excluded.video,",
    "  imagen_inicio = excluded.imagen_inicio,",
    "  imagen_fin    = excluded.imagen_fin;",
    ""
  ].join("\n");
}

function generarPlantilla() {
  const partes = [];
  partes.push(
    "-- 2) Plantilla oficial (routines.user_id is null). Se borra la anterior",
    "-- antes de insertar la nueva -- el cascade de las FK se lleva sus días,",
    "-- bloques y ejercicios -- para que regenerar la semilla no acumule copias.",
    "delete from routines where user_id is null;",
    "",
    "do $$",
    "declare",
    "  v_routine_id uuid;",
    "  v_day_id     uuid;",
    "  v_block_id   uuid;",
    "begin",
    "  insert into routines (id, user_id, nombre)",
    `  values (gen_random_uuid(), null, ${strLit("Rutina oficial")})`,
    "  returning id into v_routine_id;",
    ""
  );

  RUTINA.forEach((dia, di) => {
    partes.push(
      `  -- ${dia.etiqueta}: ${dia.enfoque}`,
      "  insert into routine_days (id, routine_id, posicion, clave, etiqueta, enfoque, abdomen)",
      `  values (gen_random_uuid(), v_routine_id, ${di + 1}, ${strLit(dia.clave)}, ${strLit(dia.etiqueta)}, ${strLit(dia.enfoque)}, ${boolLit(dia.abdomen)})`,
      "  returning id into v_day_id;",
      ""
    );

    dia.bloques.forEach((bloque, bi) => {
      partes.push(
        `  insert into routine_blocks (id, day_id, posicion, clave, etiqueta)`,
        `  values (gen_random_uuid(), v_day_id, ${bi + 1}, ${strLit(bloque.clave)}, ${strLit(bloque.etiqueta)})`,
        "  returning id into v_block_id;",
        ""
      );

      if (bloque.ejercicios.length > 0) {
        const filas = bloque.ejercicios.map((e, ei) => {
          return (
            `    (v_block_id, ${ei + 1}, ${strLit(e.slug)}, ${strLit(e.slot)}, ` +
            `${litOrNull(e.series)}, ${strLit(e.reps)}, ${litOrNull(e.pesoKg)}, ` +
            `${strLit(e.descanso)}, ${strLit(e.nota)})`
          );
        });
        partes.push(
          "  insert into routine_exercises",
          "    (block_id, posicion, exercise_slug, slot, series, reps, peso_objetivo_kg, descanso, nota)",
          "  values",
          filas.join(",\n") + ";",
          ""
        );
      }
    });
  });

  partes.push("end $$;", "");
  return partes.join("\n");
}

function main() {
  const salida = [
    "-- Semilla del catálogo y la plantilla oficial.",
    "-- GENERADO por scripts/generar-semilla.mjs -- no editar a mano.",
    "-- Regenerar con: node scripts/generar-semilla.mjs > sql/003_semilla.sql",
    "-- Aplicar en el editor SQL de Supabase, después de 001 y 002.",
    "",
    "begin;",
    "",
    generarExercises(),
    generarPlantilla(),
    "commit;",
    ""
  ].join("\n");
  process.stdout.write(salida);
}

main();
