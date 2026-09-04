-- Corrige I3 de la revisión final de rama: la rutina editada SUBE pero
-- nunca BAJA. descargar() (sync.js) solo consulta exercise_logs — nada lee
-- routine_exercises ni profiles del servidor — así que una edición hecha en
-- un dispositivo nunca aparece en el otro. Peor: enviarEdicionBloque()
-- (sync.js) hace `update` CIEGOS sobre routine_exercises, sin el equivalente
-- de `editado_en` que ya protege exercise_logs/body_weight desde 006, así
-- que dos dispositivos editando el mismo bloque sin haberse visto nunca se
-- pisan en silencio, igual que el defecto que 006 ya corrigió para los
-- registros.
--
-- No se edita 001_esquema.sql ni 006_edicion_cliente.sql: ya están
-- aplicados. Se agrega esta migración.

alter table routine_exercises add column if not exists editado_en timestamptz not null default now();

-- Escritura condicional de UN renglón de la rutina propia: misma forma que
-- subir_registro_ejercicio (006) — `security invoker` (RLS de 002_rls.sql
-- sigue aplicando tal cual), `set search_path` fijo, y solo pisa la fila si
-- `p_editado_en` es MÁS NUEVO que lo que ya hay.
--
-- A diferencia de exercise_logs (identificado por user_id+slot+fecha, que sí
-- puede aceptar como parámetro porque auth.uid() decide el user_id), un
-- renglón de routine_exercises se identifica por su propio `id`, que vive
-- solo del lado del servidor — el cliente lo obtiene leyéndolo primero (ver
-- enviarEdicionBloque en sync.js). Aceptar ese `id` sin más dejaría que
-- cualquier sesión autenticada edite el renglón de OTRO usuario con solo
-- adivinar o enumerar uuids — por eso esta función jamás confía en el join
-- implícito de un `update ... where id = p_id`: verifica primero, de forma
-- explícita, que el renglón pertenece a una rutina cuyo `routines.user_id`
-- es `auth.uid()`, y lanza una excepción si no — nunca un "no se aplicó"
-- silencioso que se confundiría con el caso normal de "ya había algo más
-- nuevo".
--
-- Devuelve siempre {aplicado, fila}, igual que subir_registro_ejercicio:
-- `aplicado` dice si ESTA escritura ganó, y `fila` es el renglón que de
-- verdad quedó — el propio si aplicado=true, o el que ya estaba (más nuevo)
-- si aplicado=false. sync.js usa `fila` para corregir su copia local cuando
-- pierde, en vez de dejar en pantalla una edición que el servidor ya
-- descartó (y para, si el bloque completo se corrigió así, bajar esa
-- corrección a almacen.js sin quedarse reintentando algo que ya se resolvió).
create or replace function subir_edicion_rutina(
  p_id               uuid,
  p_exercise_slug    text,
  p_slot             text,
  p_posicion         int,
  p_series           int,
  p_reps             text,
  p_peso_objetivo_kg numeric,
  p_descanso         text,
  p_nota             text,
  p_editado_en       timestamptz,
  out aplicado       boolean,
  out fila           routine_exercises
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_es_propia boolean;
begin
  -- Dueño primero, antes de tocar nada: un renglón ajeno se rechaza sin
  -- importar qué tan "nuevo" diga ser p_editado_en. Cubre tanto un id de
  -- otro usuario como uno que no existe — misma respuesta para los dos, así
  -- que esta función no sirve para tantear qué ids son válidos.
  select exists (
    select 1
      from routine_exercises re
      join routine_blocks b on b.id = re.block_id
      join routine_days   d on d.id = b.day_id
      join routines       r on r.id = d.routine_id
     where re.id = p_id and r.user_id = auth.uid()
  ) into v_es_propia;

  if not v_es_propia then
    raise exception 'renglón % no pertenece a la rutina de este usuario', p_id;
  end if;

  update routine_exercises
     set exercise_slug    = p_exercise_slug,
         slot             = p_slot,
         posicion         = p_posicion,
         series           = p_series,
         reps             = p_reps,
         peso_objetivo_kg = p_peso_objetivo_kg,
         descanso         = p_descanso,
         nota             = p_nota,
         editado_en       = p_editado_en
   where id = p_id
     and editado_en < p_editado_en
  returning * into fila;

  if fila is null then
    -- El conflicto no actualizó nada: el servidor ya tenía algo con
    -- editado_en igual o más nuevo. No es un error — "gana el más
    -- reciente" funcionando — así que se relee la fila que sí quedó.
    aplicado := false;
    select * into fila from routine_exercises where id = p_id;
  else
    aplicado := true;
  end if;
end;
$$;

-- create function otorga EXECUTE a PUBLIC por omisión — el mismo descuido
-- que 007 tuvo que corregir para clonar_plantilla. Aquí se revoca en la
-- misma migración que crea la función, no después.
revoke execute on function subir_edicion_rutina(
  uuid, text, text, int, int, text, numeric, text, text, timestamptz
) from public;
grant execute on function subir_edicion_rutina(
  uuid, text, text, int, int, text, numeric, text, text, timestamptz
) to authenticated;

-- Comprobación, para pegar en el editor SQL una vez aplicado este archivo
-- (necesita una sesión autenticada real: auth.uid() no existe corriendo
-- como superusuario en el editor SQL — ver sql/README.md y el mismo aviso
-- en 006_edicion_cliente.sql).
--
-- select column_name, data_type, is_nullable
--   from information_schema.columns
--  where table_name = 'routine_exercises' and column_name = 'editado_en';
-- -- Esperado: 1 fila, is_nullable = 'NO'.
--
-- select proname, prosecdef from pg_proc where proname = 'subir_edicion_rutina';
-- -- Esperado: 1 fila, prosecdef = false (security invoker, no definer).
--
-- select grantee, privilege_type from information_schema.routine_privileges
--  where routine_name = 'subir_edicion_rutina';
-- -- Esperado: ninguna fila con grantee en ('PUBLIC','anon') — solo 'authenticated'.
--
-- -- Con la sesión propia, tomar el id de un renglón real de la rutina:
-- select id from routine_exercises re
--   join routine_blocks b on b.id = re.block_id
--   join routine_days   d on d.id = b.day_id
--   join routines       r on r.id = d.routine_id
--  where r.user_id = auth.uid() limit 1;
--
-- -- Dos "sincronizaciones" simuladas del mismo renglón (sustituir <id real>,
-- -- <slug real>, <slot real> por lo que devolvió la consulta anterior):
-- select (subir_edicion_rutina('<id real>','<slug real>','<slot real>', 1, 3, '10', 10, null, null, now() - interval '1 hour')).*;
-- select (subir_edicion_rutina('<id real>','<slug real>','<slot real>', 1, 3, '10', 99, null, null, now())).*;
-- -- La segunda debe traer aplicado=true y fila.peso_objetivo_kg=99.
-- select (subir_edicion_rutina('<id real>','<slug real>','<slot real>', 1, 3, '10', 10, null, null, now() - interval '1 hour')).*;
-- -- Esta tercera (más vieja que la que ya quedó) debe traer aplicado=false y fila.peso_objetivo_kg=99 (no 10).
-- select peso_objetivo_kg from routine_exercises where id = '<id real>';
-- -- Esperado: 99 — el renglón en la base nunca se pisó con el valor viejo.
--
-- -- Rechazo por dueño: con una SEGUNDA sesión (otro usuario), tomar el id de
-- -- un renglón del PRIMER usuario (de la consulta de arriba) e intentar:
-- select (subir_edicion_rutina('<id del renglón del primer usuario>', 'sentadilla', 'dia3:base:sentadilla', 1, 3, '10', 1, null, null, now())).*;
-- -- Esperado: error ("renglón ... no pertenece a la rutina de este usuario"),
-- -- nunca una fila del otro usuario modificada.
