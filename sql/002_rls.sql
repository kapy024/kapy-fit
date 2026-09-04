-- Row Level Security. Sin esto, la anon key del repo público deja las tablas
-- abiertas: es RLS —no el secreto de la llave— lo que protege los datos.
-- Postgres deniega todo cuando RLS está activo y no hay política que aplique.

alter table profiles          enable row level security;
alter table exercises         enable row level security;
alter table routines          enable row level security;
alter table routine_days      enable row level security;
alter table routine_blocks    enable row level security;
alter table routine_exercises enable row level security;
alter table exercise_logs     enable row level security;
alter table body_weight       enable row level security;

-- Catálogo: lectura para cualquiera con sesión; escritura para nadie desde el
-- cliente (se siembra con 003, que se aplica desde el editor SQL).
create policy "catalogo visible" on exercises
  for select to authenticated using (true);

-- Perfil propio.
create policy "perfil propio" on profiles
  for all to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Rutinas: la propia, más lectura de la plantilla oficial (user_id NULL).
create policy "rutina propia o plantilla" on routines
  for select to authenticated using (user_id = auth.uid() or user_id is null);
create policy "escribir rutina propia" on routines
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Las hijas heredan el permiso siguiendo la cadena hasta routines.
create policy "dias visibles" on routine_days
  for select to authenticated using (exists (
    select 1 from routines r where r.id = routine_id
      and (r.user_id = auth.uid() or r.user_id is null)));
create policy "escribir dias propios" on routine_days
  for all to authenticated using (exists (
    select 1 from routines r where r.id = routine_id and r.user_id = auth.uid()))
  with check (exists (
    select 1 from routines r where r.id = routine_id and r.user_id = auth.uid()));

create policy "bloques visibles" on routine_blocks
  for select to authenticated using (exists (
    select 1 from routine_days d join routines r on r.id = d.routine_id
     where d.id = day_id and (r.user_id = auth.uid() or r.user_id is null)));
create policy "escribir bloques propios" on routine_blocks
  for all to authenticated using (exists (
    select 1 from routine_days d join routines r on r.id = d.routine_id
     where d.id = day_id and r.user_id = auth.uid()))
  with check (exists (
    select 1 from routine_days d join routines r on r.id = d.routine_id
     where d.id = day_id and r.user_id = auth.uid()));

create policy "ejercicios de rutina visibles" on routine_exercises
  for select to authenticated using (exists (
    select 1 from routine_blocks b
       join routine_days d on d.id = b.day_id
       join routines r     on r.id = d.routine_id
     where b.id = block_id and (r.user_id = auth.uid() or r.user_id is null)));
create policy "escribir ejercicios propios" on routine_exercises
  for all to authenticated using (exists (
    select 1 from routine_blocks b
       join routine_days d on d.id = b.day_id
       join routines r     on r.id = d.routine_id
     where b.id = block_id and r.user_id = auth.uid()))
  with check (exists (
    select 1 from routine_blocks b
       join routine_days d on d.id = b.day_id
       join routines r     on r.id = d.routine_id
     where b.id = block_id and r.user_id = auth.uid()));

-- Registros y peso corporal: estrictamente del dueño. Nadie más los ve.
create policy "registros propios" on exercise_logs
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "peso propio" on body_weight
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
