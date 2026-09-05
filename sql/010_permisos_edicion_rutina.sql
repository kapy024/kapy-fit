-- 010 — cierra el EXECUTE de anon sobre subir_edicion_rutina.
-- 008 revocó solo `from public`. En Supabase el rol anon recibe EXECUTE por
-- privilegios por omisión de forma EXPLÍCITA, y revocar de PUBLIC no toca un
-- permiso concedido directamente a anon. Lo detectó el dueño al aplicar 008:
-- la comprobación devolvió grantee = anon. 009 ya lo hace bien (public, anon).
-- Se resuelve la firma por catálogo para que un desajuste de tipos no deje el
-- permiso abierto sin avisar (mismo patrón que el bloque final de 008).
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as firma
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'subir_edicion_rutina'
  loop
    execute format('revoke execute on function %s from public, anon', f.firma);
    execute format('grant execute on function %s to authenticated', f.firma);
  end loop;
end $$;

-- Comprobación, para pegar después de aplicar:
--   select grantee from information_schema.routine_privileges
--    where routine_name='subir_edicion_rutina' and grantee in ('PUBLIC','anon');
--   Esperado: 0 filas.
