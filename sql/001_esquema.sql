-- Registro de Hierro — esquema base.
-- Aplicar en el editor SQL de Supabase, en orden numérico.
-- Las políticas de seguridad van en 002_rls.sql: este archivo NO deja nada
-- accesible por sí solo, porque RLS deniega todo mientras no haya políticas.

create table if not exists profiles (
  id         uuid primary key references auth.users on delete cascade,
  unidad     text not null default 'kg' check (unidad in ('kg','lb')),
  creado_en  timestamptz not null default now()
);

-- Catálogo compartido. Lo leen todos; solo el dueño del proyecto lo escribe.
create table if not exists exercises (
  slug           text primary key,
  nombre         text not null,
  video          text,
  imagen_inicio  text,
  imagen_fin     text
);

-- user_id NULL identifica la plantilla oficial, que se clona a cada usuario.
create table if not exists routines (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users on delete cascade,
  nombre     text not null,
  creada_en  timestamptz not null default now()
);
create unique index if not exists routines_plantilla_unica
  on routines ((user_id is null)) where user_id is null;

create table if not exists routine_days (
  id          uuid primary key default gen_random_uuid(),
  routine_id  uuid not null references routines on delete cascade,
  posicion    int  not null,
  clave       text not null,
  etiqueta    text not null,
  enfoque     text not null,
  abdomen     boolean not null default false,
  unique (routine_id, clave)
);

create table if not exists routine_blocks (
  id        uuid primary key default gen_random_uuid(),
  day_id    uuid not null references routine_days on delete cascade,
  posicion  int  not null,
  clave     text not null,
  etiqueta  text not null,
  unique (day_id, clave)
);

create table if not exists routine_exercises (
  id                uuid primary key default gen_random_uuid(),
  block_id          uuid not null references routine_blocks on delete cascade,
  posicion          int  not null,
  exercise_slug     text not null references exercises,
  slot              text not null,
  series            int,
  reps              text,
  peso_objetivo_kg  numeric,
  descanso          text,
  nota              text
);
create index if not exists routine_exercises_block on routine_exercises (block_id);

-- El registro se identifica por slot (el renglón concreto de la sesión).
-- exercise_slug viaja como hilo conductor para el historial y las gráficas:
-- permite seguir un ejercicio aunque cambie de día o de variante.
create table if not exists exercise_logs (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users on delete cascade,
  slot           text not null,
  exercise_slug  text not null,
  logged_on      date not null,
  weight_kg      numeric,
  sets           int,
  reps           text,
  completed      boolean not null default false,
  updated_at     timestamptz not null default now(),
  unique (user_id, slot, logged_on)
);
create index if not exists exercise_logs_por_slug
  on exercise_logs (user_id, exercise_slug, logged_on);

create table if not exists body_weight (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  measured_on date not null,
  weight_kg   numeric not null check (weight_kg > 0),
  updated_at  timestamptz not null default now(),
  unique (user_id, measured_on)
);
