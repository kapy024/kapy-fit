-- Escritura condicional para body_weight, con la misma forma que
-- subir_registro_ejercicio (006): la tabla existe desde la entrega 2
-- (001_esquema.sql), y su columna `editado_en` desde 006 — pero nadie la
-- escribía todavía; sync.js no tenía tipo de operación "peso".
--
-- A diferencia de 006 (que dejó el EXECUTE público sin revocar y necesitó
-- dos migraciones de arreglo después — 007 para clonar_plantilla, y el
-- commit 990c014 para subir_registro_ejercicio, ambas cerrando la misma
-- fuga: `create function` otorga EXECUTE a PUBLIC por omisión), aquí se
-- revoca desde el principio, en la misma migración que crea la función.
--
-- `security invoker` (el valor por omisión, escrito explícito) corre como
-- quien invoca, así que la política "peso propio" de 002_rls.sql se aplica
-- normal; por eso `user_id` sale de `auth.uid()` y NUNCA es parámetro —
-- aceptar uno de quien llama dejaría escribir el peso de otra cuenta con
-- solo pasar otro uuid.
--
-- Devuelve siempre {aplicado, fila}, igual que subir_registro_ejercicio:
-- `aplicado` dice si ESTA escritura es la que quedó, `fila` es la que de
-- verdad quedó en la base (la propia si aplicado=true, la existente más
-- nueva si aplicado=false) — sync.js usa `fila` para corregir su copia
-- local cuando pierde, en vez de dejar en pantalla un valor que el
-- servidor ya descartó.
create or replace function subir_peso_corporal(
  p_fecha       date,
  p_kg          numeric,
  p_editado_en  timestamptz,
  out aplicado  boolean,
  out fila      body_weight
)
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into body_weight (
    user_id, measured_on, weight_kg, editado_en
  )
  values (
    auth.uid(), p_fecha, p_kg, p_editado_en
  )
  on conflict (user_id, measured_on) do update
     set weight_kg  = excluded.weight_kg,
         editado_en = excluded.editado_en
   where body_weight.editado_en < excluded.editado_en
  returning * into fila;

  if fila is null then
    -- El conflicto no actualizó nada: el servidor ya tenía algo con
    -- editado_en igual o más nuevo. No es un error — es la regla "gana el
    -- más reciente" funcionando — así que se relee la fila que sí quedó,
    -- para dársela de vuelta a quien llama.
    aplicado := false;
    select * into fila from body_weight
     where user_id = auth.uid() and measured_on = p_fecha;
  else
    aplicado := true;
  end if;
end;
$$;

grant execute on function subir_peso_corporal(date, numeric, timestamptz) to authenticated;

-- Revocado en la misma migración que la crea (a diferencia de 006/008,
-- arregladas después) — nunca ejecutable por PUBLIC ni por el rol anon.
revoke execute on function subir_peso_corporal(date, numeric, timestamptz) from public, anon;

-- Comprobación, para pegar en el editor SQL una vez aplicado este archivo
-- (necesita una sesión autenticada real: auth.uid() no existe corriendo
-- como superusuario en el editor SQL — ver sql/README.md, misma
-- limitación que 006).
--
-- select column_name, data_type, is_nullable
--   from information_schema.columns
--  where table_name = 'body_weight' and column_name = 'editado_en';
-- -- Esperado: 1 fila, is_nullable = 'NO' (ya la agregó 006).
--
-- select proname, prosecdef from pg_proc where proname = 'subir_peso_corporal';
-- -- Esperado: 1 fila, prosecdef = false (security invoker, no definer).
--
-- select p.proname, array_to_string(p.proacl, ' | ') as permisos
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public' and p.proname = 'subir_peso_corporal';
-- -- Esperado: ningún "=X/" (EXECUTE para PUBLIC) ni "anon=X/" en permisos.
--
-- -- Con dos "sincronizaciones" simuladas del mismo día, la más vieja no debe pisar a la más nueva:
-- select (subir_peso_corporal(current_date, 70, now() - interval '1 hour')).*;
-- select (subir_peso_corporal(current_date, 71.5, now())).*;
-- -- La segunda debe traer aplicado=true y fila.weight_kg=71.5.
-- select (subir_peso_corporal(current_date, 70, now() - interval '1 hour')).*;
-- -- Esta tercera (más vieja que la que ya quedó) debe traer aplicado=false y fila.weight_kg=71.5 (no 70).
-- select weight_kg from body_weight where measured_on = current_date;
-- -- Esperado: 71.5 — la fila en la base nunca se pisó con el valor viejo.
