-- Corrige una pérdida silenciosa de datos entre dispositivos, encontrada
-- probando contra la base real: el `upsert` que sync.js hacía en
-- exercise_logs no tenía ninguna guarda de tiempo, así que ganaba quien
-- SINCRONIZABA al último, no quien ESCRIBIÓ al último.
--
-- Reproducido: dispositivo A anota 111 sin red. Dispositivo B anota 222 con
-- red y sincroniza. A recupera la red y sincroniza: el 222 de B desaparece
-- del servidor (y de B, en su siguiente descarga), sin ningún aviso.
--
-- No se edita 001_esquema.sql ni 005_updated_at.sql: ya están aplicados. Se
-- agrega esta migración.
--
-- `updated_at` (005) es cuándo el SERVIDOR tocó la fila — sigue sirviendo
-- solo para que descargar() (que ya resuelve bien) compare un dispositivo
-- contra otro al bajar datos. `editado_en`, la columna nueva, es distinta:
-- es cuándo el CLIENTE hizo la edición, y es lo que decide quién gana al
-- SUBIR. Sin esta distinción, "ahora" (el momento de la subida) es lo único
-- que hay para comparar, y eso es exactamente el defecto.

alter table exercise_logs add column if not exists editado_en timestamptz not null default now();
alter table body_weight   add column if not exists editado_en timestamptz not null default now();

-- Escritura condicional de un registro de ejercicio: solo pisa la fila si
-- `p_editado_en` es MÁS NUEVO que lo que ya hay. `security invoker` (el
-- valor por omisión, escrito aquí para que quede explícito) — corre como el
-- usuario que la invoca, así que las políticas de 002_rls.sql se aplican
-- normal a el insert/update de adentro; por eso el `user_id` sale de
-- `auth.uid()` y NO es un parámetro: aceptar un user_id de quien llama
-- dejaría escribir en la cuenta ajena con solo pasar otro uuid.
--
-- Devuelve siempre {aplicado, fila}: `aplicado` dice si ESTA escritura fue
-- la que quedó, y `fila` es la que de verdad quedó en la base — la propia
-- si aplicado=true, o la que ya estaba (más nueva) si aplicado=false. El
-- cliente (sync.js) usa `fila` para corregir su copia local cuando pierde,
-- en vez de dejar en pantalla un valor que el servidor ya descartó.
create or replace function subir_registro_ejercicio(
  p_slot        text,
  p_slug        text,
  p_fecha       date,
  p_peso        numeric,
  p_series      int,
  p_reps        text,
  p_hecho       boolean,
  p_editado_en  timestamptz,
  out aplicado  boolean,
  out fila      exercise_logs
)
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into exercise_logs (
    user_id, slot, exercise_slug, logged_on, weight_kg, sets, reps, completed, editado_en
  )
  values (
    auth.uid(), p_slot, p_slug, p_fecha, p_peso, p_series, p_reps, p_hecho, p_editado_en
  )
  on conflict (user_id, slot, logged_on) do update
     set exercise_slug = excluded.exercise_slug,
         weight_kg     = excluded.weight_kg,
         sets          = excluded.sets,
         reps          = excluded.reps,
         completed     = excluded.completed,
         editado_en    = excluded.editado_en
   where exercise_logs.editado_en < excluded.editado_en
  returning * into fila;

  if fila is null then
    -- El conflicto no actualizó nada: el servidor ya tenía algo con
    -- editado_en igual o más nuevo. No es un error — es la regla "gana el
    -- más reciente" funcionando — así que se relee la fila que sí quedó,
    -- para dársela de vuelta a quien llama.
    aplicado := false;
    select * into fila from exercise_logs
     where user_id = auth.uid() and slot = p_slot and logged_on = p_fecha;
  else
    aplicado := true;
  end if;
end;
$$;

grant execute on function subir_registro_ejercicio(
  text, text, date, numeric, int, text, boolean, timestamptz
) to authenticated;

-- Comprobación, para pegar en el editor SQL una vez aplicado este archivo
-- (necesita una sesión autenticada real: auth.uid() no existe corriendo
-- como superusuario en el editor SQL, así que hay que probarla desde la
-- app, o con el access_token de una sesión real en una llamada REST a
-- /rest/v1/rpc/subir_registro_ejercicio — no funciona pegada tal cual en
-- el editor SQL sin más). Ver también sql/README.md.
--
-- select column_name, data_type, is_nullable
--   from information_schema.columns
--  where table_name in ('exercise_logs','body_weight') and column_name = 'editado_en';
-- -- Esperado: las dos filas, is_nullable = 'NO'.
--
-- select proname, prosecdef from pg_proc where proname = 'subir_registro_ejercicio';
-- -- Esperado: 1 fila, prosecdef = false (security invoker, no definer).
--
-- -- Con dos "sincronizaciones" simuladas de la misma fila, la más vieja no debe pisar a la más nueva:
-- select (subir_registro_ejercicio('<slot de prueba>','<slug>', current_date, 10, 3, '10', true, now() - interval '1 hour')).*;
-- select (subir_registro_ejercicio('<slot de prueba>','<slug>', current_date, 99, 3, '10', true, now())).*;
-- -- La segunda debe traer aplicado=true y fila.weight_kg=99.
-- select (subir_registro_ejercicio('<slot de prueba>','<slug>', current_date, 10, 3, '10', true, now() - interval '1 hour')).*;
-- -- Esta tercera (más vieja que la que ya quedó) debe traer aplicado=false y fila.weight_kg=99 (no 10).
-- select weight_kg from exercise_logs where slot = '<slot de prueba>' and logged_on = current_date;
-- -- Esperado: 99 — la fila en la base nunca se pisó con el valor viejo.
