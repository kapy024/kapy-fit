-- Corrige un defecto encontrado probando la sincronización contra la base real:
-- `updated_at timestamptz not null default now()` solo se aplica al INSERT.
-- Un upsert que cae en conflicto hace UPDATE, y ahí el default no interviene:
-- la fila cambiaba de peso pero conservaba la marca de tiempo del insert.
--
-- Eso importa porque la resolución de conflictos entre dispositivos es "gana
-- el más reciente" según updated_at. Con la marca congelada, el registro que
-- se hizo primero parecería para siempre el más nuevo, y el trabajo del otro
-- dispositivo se descartaría en silencio.
--
-- No se edita 001_esquema.sql: ya está aplicado. Se agrega esta migración.

create or replace function tocar_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists exercise_logs_updated_at on exercise_logs;
create trigger exercise_logs_updated_at
  before update on exercise_logs
  for each row execute function tocar_updated_at();

drop trigger if exists body_weight_updated_at on body_weight;
create trigger body_weight_updated_at
  before update on body_weight
  for each row execute function tocar_updated_at();

-- Comprobación, para pegar después de aplicar:
--   update exercise_logs set weight_kg = weight_kg where id =
--     (select id from exercise_logs limit 1);
--   select updated_at > now() - interval '10 seconds' as se_actualizo
--     from exercise_logs limit 1;
-- Debe dar true.
