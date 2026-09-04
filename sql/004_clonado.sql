-- Clonado de la plantilla oficial al registrarse un usuario.
-- Aplicar en el editor SQL de Supabase, después de 001, 002 y 003.

-- security definer: el trigger dispara after insert on auth.users, fuera de
-- cualquier sesión de usuario (no hay auth.uid() en ese momento), y necesita
-- escribir en profiles y routines saltándose RLS. set search_path = public
-- evita que un search_path manipulado por quien la invoque redirija las
-- referencias sin calificar a otro esquema.
create or replace function clonar_plantilla(uid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_routine_id     uuid;
  v_new_routine_id uuid;
  r_day            record;
  v_new_day_id     uuid;
  r_block          record;
  v_new_block_id   uuid;
begin
  -- Idempotente: si el usuario ya tiene una rutina propia, no hacer nada.
  -- Cubre reintentos del trigger o una llamada manual repetida.
  if exists (select 1 from routines where user_id = uid) then
    return;
  end if;

  insert into profiles (id) values (uid)
    on conflict (id) do nothing;

  select id into v_routine_id from routines where user_id is null;
  if v_routine_id is null then
    -- Sin plantilla que clonar (003 no se ha aplicado todavía): el usuario
    -- queda con su perfil y sin rutina, en vez de fallar el registro.
    return;
  end if;

  insert into routines (id, user_id, nombre)
    select gen_random_uuid(), uid, nombre from routines where id = v_routine_id
    returning id into v_new_routine_id;

  for r_day in
    select id, posicion, clave, etiqueta, enfoque, abdomen
      from routine_days
     where routine_id = v_routine_id
     order by posicion
  loop
    insert into routine_days (id, routine_id, posicion, clave, etiqueta, enfoque, abdomen)
    values (gen_random_uuid(), v_new_routine_id, r_day.posicion, r_day.clave,
            r_day.etiqueta, r_day.enfoque, r_day.abdomen)
    returning id into v_new_day_id;

    for r_block in
      select id, posicion, clave, etiqueta
        from routine_blocks
       where day_id = r_day.id
       order by posicion
    loop
      insert into routine_blocks (id, day_id, posicion, clave, etiqueta)
      values (gen_random_uuid(), v_new_day_id, r_block.posicion, r_block.clave, r_block.etiqueta)
      returning id into v_new_block_id;

      -- El slot se copia tal cual: es la identidad con la que el cliente ya
      -- guarda sus registros en localStorage. Inventar uno nuevo aquí
      -- rompería esa correspondencia en cuanto el cliente sincronice.
      insert into routine_exercises
        (block_id, posicion, exercise_slug, slot, series, reps, peso_objetivo_kg, descanso, nota)
      select v_new_block_id, posicion, exercise_slug, slot, series, reps,
             peso_objetivo_kg, descanso, nota
        from routine_exercises
       where block_id = r_block.id;
    end loop;
  end loop;
end;
$$;

-- Wrapper de trigger: after insert on auth.users solo puede ejecutar una
-- función de trigger (retorna trigger), no clonar_plantilla directamente.
create or replace function trigger_clonar_plantilla()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform clonar_plantilla(new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function trigger_clonar_plantilla();
