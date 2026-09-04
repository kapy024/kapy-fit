-- Tokens de dispositivo: le dan a un reloj Connect IQ (u otro cliente sin
-- navegador) una forma de identificarse sin poder hacer el login por magic
-- link. Ver device-token-exchange (supabase/functions) y
-- docs/superpowers/specs/2026-09-03-connect-iq-venu2-design.md §3.
--
-- RLS la deja cerrada a CUALQUIER rol de cliente (anon o authenticated):
-- ni siquiera el propio dueño la lee desde la web. Solo la toca la Edge
-- Function, que usa la service_role key y por lo tanto ignora RLS por
-- completo — las políticas de abajo son una segunda cerradura, no la
-- única, en caso de que algún día se llame con un rol distinto.
create table if not exists device_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  token      text not null unique,
  label      text not null,
  revoked_at timestamptz,
  creado_en  timestamptz not null default now()
);
create index if not exists device_tokens_por_token on device_tokens (token);

alter table device_tokens enable row level security;
-- Sin ninguna política: RLS deniega todo a anon/authenticated. Correcto:
-- esta tabla no tiene lectura ni escritura de cliente en este proyecto.
