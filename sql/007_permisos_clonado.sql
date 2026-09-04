-- Corrige I1 de la revisión final de rama: clonar_plantilla(uid) es
-- `security definer` y recibe el user_id como PARÁMETRO en vez de leerlo de
-- auth.uid() (a diferencia de subir_registro_ejercicio en 006, que sí hace
-- lo correcto). `create function` otorga EXECUTE a PUBLIC por omisión, y
-- 004_clonado.sql nunca lo revocó, así que quedó ejecutable por el rol
-- `anon` — confirmado contra producción sin sesión: responde `22P02` a un
-- uuid inválido en vez de "función no encontrada"/"permiso denegado", o sea
-- SÍ está expuesta.
--
-- Riesgo real: cualquiera (sin iniciar sesión) puede llamar
-- clonar_plantilla('<uuid-de-otra-persona>'). Como es security definer,
-- corre saltándose RLS: crea (o reutiliza) el `profiles` de ese uuid y le
-- vuelve a clonar la plantilla encima. También sirve para tantear uuids —
-- la función se comporta distinto si el uuid ya tiene rutina (no hace
-- nada) que si no la tiene (la crea), lo cual distingue cuentas reales de
-- inventadas.
--
-- No se edita 004_clonado.sql (ya aplicado) — se agrega esta migración.
--
-- El trigger on_auth_user_created (004) sigue funcionando exactamente
-- igual: trigger_clonar_plantilla() es también security definer, así que
-- cuando llama `perform clonar_plantilla(new.id)` corre como el DUEÑO de
-- la función, y el dueño siempre puede ejecutar lo que le pertenece sin
-- necesitar un grant explícito — revocar el EXECUTE de public/anon/
-- authenticated no le quita nada a esa llamada interna.

revoke execute on function public.clonar_plantilla(uuid) from public, anon, authenticated;

-- Aprovechando esta migración: tocar_updated_at() (005_updated_at.sql) es
-- la única de las funciones de seguridad de este proyecto sin
-- `set search_path` — clonar_plantilla, trigger_clonar_plantilla (004) y
-- subir_registro_ejercicio (006) ya lo tienen. Sin fijarlo, un
-- search_path manipulado por quien la invoque podría redirigir
-- `new.updated_at` (una referencia sin calificar, aunque hoy es solo una
-- asignación de campo, no una tabla) a otro esquema en una sesión con
-- privilegios para cambiar su propio search_path. `create or replace` no
-- pierde el trigger que ya la usa (exercise_logs_updated_at,
-- body_weight_updated_at): el trigger apunta al nombre de la función, no
-- a esta definición en particular.
create or replace function tocar_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Comprobación, para pegar en el editor SQL una vez aplicado este archivo.

-- 1) El EXECUTE de PUBLIC/anon/authenticated ya no aparece para
--    clonar_plantilla(uuid) (solo debe quedar el del dueño/rol de
--    administración):
-- select grantee, privilege_type
--   from information_schema.routine_privileges
--  where routine_name = 'clonar_plantilla';
-- -- Esperado: ninguna fila con grantee en ('PUBLIC','anon','authenticated').

-- 2) tocar_updated_at() ya tiene search_path fijo:
-- select proname, proconfig from pg_proc where proname = 'tocar_updated_at';
-- -- Esperado: proconfig incluye 'search_path=public'.

-- 3) Desde FUERA, sin sesión (con la anon key, nunca el access_token de una
--    sesión real), confirmar que la llamada ahora se rechaza por permisos
--    en vez de ejecutarse:
-- KEY="$(grep SUPABASE_ANON_KEY config.js | cut -d'"' -f2)"
-- URL="https://oakahiwejhzsxccrscmk.supabase.co/rest/v1"
-- curl -s -X POST "$URL/rpc/clonar_plantilla" \
--   -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
--   -H "Content-Type: application/json" \
--   -d '{"uid":"00000000-0000-0000-0000-000000000000"}'
-- -- Antes: {"code":"22P02", ...} (la función SÍ corrió, y falló adentro).
-- -- Esperado ahora: un error de permisos (42501 / "permission denied for
-- -- function clonar_plantilla"), la función ni siquiera arranca.

-- 4) Que el registro normal (el trigger, que corre como el dueño) sigue
--    funcionando: crear un usuario de prueba desde Authentication → Users
--    → Add user y repetir la verificación de "Después de 004_clonado.sql"
--    en sql/README.md — debe seguir dando rutinas=1, perfil=1, renglones=80.
