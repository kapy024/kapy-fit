-- Semilla del catálogo y la plantilla oficial.
-- GENERADO por scripts/generar-semilla.mjs -- no editar a mano.
-- Regenerar con: node scripts/generar-semilla.mjs > sql/003_semilla.sql
-- Aplicar en el editor SQL de Supabase, después de 001 y 002.

begin;

-- 1) Catálogo de ejercicios: upsert por slug, así re-aplicar la semilla
-- nunca duplica ni pisa un slug ausente en una corrida anterior.
insert into exercises (slug, nombre, video, imagen_inicio, imagen_fin) values
  ('press-pectoral-maquina', 'Press pectoral en máquina', 'https://www.youtube.com/watch?v=-bdEMLuFvGw', 'data/ejercicios/press-pectoral-maquina-0.jpg', 'data/ejercicios/press-pectoral-maquina-1.jpg'),
  ('press-militar-barra', 'Press militar con barra', 'https://www.youtube.com/watch?v=OHxSwnkSxB8', 'data/ejercicios/press-militar-barra-0.jpg', 'data/ejercicios/press-militar-barra-1.jpg'),
  ('extension-triceps-polea', 'Extensión de tríceps en polea', 'https://www.youtube.com/watch?v=-KVa3M1uZfs', 'data/ejercicios/extension-triceps-polea-0.jpg', 'data/ejercicios/extension-triceps-polea-1.jpg'),
  ('remo-maquina', 'Remo en máquina', 'https://www.youtube.com/watch?v=UETq0ZpeCL4', 'data/ejercicios/remo-maquina-0.jpg', 'data/ejercicios/remo-maquina-1.jpg'),
  ('jalon-cara', 'Jalón a la cara', 'https://www.youtube.com/watch?v=tTihANXnDGU', 'data/ejercicios/jalon-cara-0.jpg', 'data/ejercicios/jalon-cara-1.jpg'),
  ('curl-biceps-barra', 'Curl de bíceps con barra', 'https://www.youtube.com/watch?v=P6swDsMzqm0', 'data/ejercicios/curl-biceps-barra-0.jpg', 'data/ejercicios/curl-biceps-barra-1.jpg'),
  ('crunch', 'Crunch', 'https://www.youtube.com/watch?v=hl9Yu7UZqHU', 'data/ejercicios/crunch-0.jpg', 'data/ejercicios/crunch-1.jpg'),
  ('sentadilla', 'Sentadilla', 'https://www.youtube.com/watch?v=TPoVS6ag6l4', 'data/ejercicios/sentadilla-0.jpg', 'data/ejercicios/sentadilla-1.jpg'),
  ('subida-banco', 'Subida al banco', 'https://www.youtube.com/watch?v=jY7t0IYJo5I', 'data/ejercicios/subida-banco-0.jpg', 'data/ejercicios/subida-banco-1.jpg'),
  ('puente-gluteo', 'Puente para glúteo', 'https://musclewiki.com/exercise/dumbbell-glute-bridge', 'data/ejercicios/puente-gluteo-0.jpg', 'data/ejercicios/puente-gluteo-1.jpg'),
  ('peso-muerto-mancuernas', 'Peso muerto con mancuernas', 'https://www.youtube.com/watch?v=9j_L1KgpK8Y', 'data/ejercicios/peso-muerto-mancuernas-0.jpg', 'data/ejercicios/peso-muerto-mancuernas-1.jpg'),
  ('sentadilla-salto', 'Sentadilla con salto', 'https://www.youtube.com/watch?v=-kbKBjUU-1A', 'data/ejercicios/sentadilla-salto-0.jpg', 'data/ejercicios/sentadilla-salto-1.jpg'),
  ('hip-thrust-maquina', 'Hip thrust en máquina', 'https://www.youtube.com/watch?v=c2iJjdXpt1U', 'data/ejercicios/hip-thrust-maquina-0.jpg', 'data/ejercicios/hip-thrust-maquina-1.jpg'),
  ('sentadilla-smith', 'Sentadilla en máquina Smith', 'https://www.youtube.com/watch?v=4r9o_rqFZX4', 'data/ejercicios/sentadilla-smith-0.jpg', 'data/ejercicios/sentadilla-smith-1.jpg'),
  ('leg-curl-femoral', 'Leg curl femoral en máquina', 'https://www.youtube.com/watch?v=9xbBr5Ytl8c', 'data/ejercicios/leg-curl-femoral-0.jpg', 'data/ejercicios/leg-curl-femoral-1.jpg'),
  ('leg-extension', 'Leg extension', 'https://www.youtube.com/watch?v=MyeQ1zCcfas', 'data/ejercicios/leg-extension-0.jpg', 'data/ejercicios/leg-extension-1.jpg'),
  ('abduccion-cadera', 'Abducción de cadera', 'https://www.youtube.com/watch?v=2vCRMi-lgJ4', 'data/ejercicios/abduccion-cadera-0.jpg', 'data/ejercicios/abduccion-cadera-1.jpg'),
  ('sentadilla-hack', 'Sentadilla hack', 'https://musclewiki.com/exercise/machine-hack-squat', 'data/ejercicios/sentadilla-hack-0.jpg', 'data/ejercicios/sentadilla-hack-1.jpg'),
  ('jalon-triangulo', 'Jalón con triángulo', 'https://www.youtube.com/watch?v=VUJYixXx5I8', 'data/ejercicios/jalon-triangulo-0.jpg', 'data/ejercicios/jalon-triangulo-1.jpg'),
  ('remo-barra-recta', 'Remo con barra recta', 'https://www.youtube.com/watch?v=E68GAibALV8', 'data/ejercicios/remo-barra-recta-0.jpg', 'data/ejercicios/remo-barra-recta-1.jpg'),
  ('remo-polea-alta-unimano', 'Remo en polea alta a una mano', 'https://www.youtube.com/watch?v=Su3AA9kcVrs', 'data/ejercicios/remo-polea-alta-unimano-0.jpg', 'data/ejercicios/remo-polea-alta-unimano-1.jpg'),
  ('press-inclinado-barra', 'Press de pecho en banco inclinado', 'https://www.youtube.com/watch?v=swMjJqFzxCQ', 'data/ejercicios/press-inclinado-barra-0.jpg', 'data/ejercicios/press-inclinado-barra-1.jpg'),
  ('lagartijas-declinadas', 'Lagartijas declinadas', 'https://www.youtube.com/watch?v=WziTc4qa5a4', 'data/ejercicios/lagartijas-declinadas-0.jpg', 'data/ejercicios/lagartijas-declinadas-1.jpg'),
  ('cruce-poleas-inferior', 'Poleas para pectoral inferior', 'https://www.youtube.com/watch?v=_sJ7hJ-FLps', 'data/ejercicios/cruce-poleas-inferior-0.jpg', 'data/ejercicios/cruce-poleas-inferior-1.jpg'),
  ('lagartijas-diamante', 'Lagartijas triángulo (diamante)', 'https://www.youtube.com/watch?v=yzU8tE28ePE', 'data/ejercicios/lagartijas-diamante-0.jpg', 'data/ejercicios/lagartijas-diamante-1.jpg'),
  ('press-mancuernas-plano', 'Press en banco plano con mancuernas', 'https://www.youtube.com/watch?v=aUtj6oqSQPo', 'data/ejercicios/press-mancuernas-plano-0.jpg', 'data/ejercicios/press-mancuernas-plano-1.jpg'),
  ('remo-sentado-barra-horizontal', 'Remo sentado con barra horizontal', 'https://www.youtube.com/watch?v=_mULZk3MZmE', 'data/ejercicios/remo-sentado-barra-horizontal-0.jpg', 'data/ejercicios/remo-sentado-barra-horizontal-1.jpg'),
  ('curl-mancuernas-alterno', 'Curl con mancuernas', 'https://www.youtube.com/watch?v=wG7xgzNIjHI', 'data/ejercicios/curl-mancuernas-alterno-0.jpg', 'data/ejercicios/curl-mancuernas-alterno-1.jpg'),
  ('curl-polea-alta', 'Jalón para bíceps en polea alta', 'https://www.youtube.com/watch?v=RY6bp_tVm20', 'data/ejercicios/curl-polea-alta-0.jpg', 'data/ejercicios/curl-polea-alta-1.jpg'),
  ('curl-muneca-antebrazo', 'Curl para antebrazo', 'https://www.youtube.com/watch?v=QVvNZR67-ns', 'data/ejercicios/curl-muneca-antebrazo-0.jpg', 'data/ejercicios/curl-muneca-antebrazo-1.jpg'),
  ('curl-martillo', 'Curl martillo', 'https://www.youtube.com/watch?v=RHdacbwKbTo', 'data/ejercicios/curl-martillo-0.jpg', 'data/ejercicios/curl-martillo-1.jpg'),
  ('elevaciones-laterales', 'Elevaciones laterales', 'https://www.youtube.com/watch?v=aVa9ce3SlSA', 'data/ejercicios/elevaciones-laterales-0.jpg', 'data/ejercicios/elevaciones-laterales-1.jpg'),
  ('elevaciones-frontales-barra', 'Elevaciones frontales con barra', 'https://www.youtube.com/watch?v=ZI99ZWy6BjA', 'data/ejercicios/elevaciones-frontales-barra-0.jpg', 'data/ejercicios/elevaciones-frontales-barra-1.jpg'),
  ('curl-predicador', 'Curl predicador', 'https://www.youtube.com/watch?v=gLmAlQn9f4k', 'data/ejercicios/curl-predicador-0.jpg', 'data/ejercicios/curl-predicador-1.jpg'),
  ('curl-agarre-invertido', 'Curl agarre invertido (antebrazo)', 'https://www.youtube.com/watch?v=r70FSepsHIY', 'data/ejercicios/curl-agarre-invertido-0.jpg', 'data/ejercicios/curl-agarre-invertido-1.jpg'),
  ('extension-cadera-polea-grillete', 'Extensión de cadera en polea baja con grillete', 'https://www.youtube.com/watch?v=1mL-NCet4dY', 'data/ejercicios/extension-cadera-polea-grillete-0.jpg', 'data/ejercicios/extension-cadera-polea-grillete-1.jpg'),
  ('elevacion-cadera-acostado', 'Elevación de cadera acostado', 'https://www.youtube.com/watch?v=eBRWUeztRt4', 'data/ejercicios/elevacion-cadera-acostado-0.jpg', 'data/ejercicios/elevacion-cadera-acostado-1.jpg'),
  ('plancha-lateral', 'Plancha lateral', 'https://www.youtube.com/watch?v=zvmcdo8twqs', 'data/ejercicios/plancha-lateral-0.jpg', 'data/ejercicios/plancha-lateral-1.jpg'),
  ('plancha', 'Plancha', 'https://www.youtube.com/watch?v=nmX0DysvqcQ', null, null),
  ('jalon-barra-prono', 'Jalón al pecho con barra prono', 'https://www.youtube.com/watch?v=c6SZm7jawwE', 'data/ejercicios/jalon-barra-prono-0.jpg', 'data/ejercicios/jalon-barra-prono-1.jpg'),
  ('fly-mancuernas', 'Fly con mancuernas (aperturas)', 'https://www.youtube.com/watch?v=-AQ0sJv4e8k', 'data/ejercicios/fly-mancuernas-0.jpg', 'data/ejercicios/fly-mancuernas-1.jpg'),
  ('pull-over-polea-alta', 'Pull over en polea alta', 'https://www.youtube.com/watch?v=i_mIea-kM_g', 'data/ejercicios/pull-over-polea-alta-0.jpg', 'data/ejercicios/pull-over-polea-alta-1.jpg'),
  ('aduccion-cadera', 'Aducción de cadera', null, 'data/ejercicios/aduccion-cadera-0.jpg', 'data/ejercicios/aduccion-cadera-1.jpg')
on conflict (slug) do update set
  nombre        = excluded.nombre,
  video         = excluded.video,
  imagen_inicio = excluded.imagen_inicio,
  imagen_fin    = excluded.imagen_fin;

-- 2) Plantilla oficial (routines.user_id is null). Se borra la anterior
-- antes de insertar la nueva -- el cascade de las FK se lleva sus días,
-- bloques y ejercicios -- para que regenerar la semilla no acumule copias.
delete from routines where user_id is null;

do $$
declare
  v_routine_id uuid;
  v_day_id     uuid;
  v_block_id   uuid;
begin
  insert into routines (id, user_id, nombre)
  values (gen_random_uuid(), null, 'Rutina oficial')
  returning id into v_routine_id;

  -- Día 1: Bíceps y tríceps
  insert into routine_days (id, routine_id, posicion, clave, etiqueta, enfoque, abdomen)
  values (gen_random_uuid(), v_routine_id, 1, 'dia1', 'Día 1', 'Bíceps y tríceps', false)
  returning id into v_day_id;

  insert into routine_blocks (id, day_id, posicion, clave, etiqueta)
  values (gen_random_uuid(), v_day_id, 1, 'v1', 'Brazo 1')
  returning id into v_block_id;

  insert into routine_exercises
    (block_id, posicion, exercise_slug, slot, series, reps, peso_objetivo_kg, descanso, nota)
  values
    (v_block_id, 1, 'press-militar-barra', 'dia1:v1:press-militar-barra', 1, '30', null, null, 'Poco peso, para lubricar articulaciones'),
    (v_block_id, 2, 'press-militar-barra', 'dia1:v1:press-militar-barra#2', null, null, null, null, 'Bajada controlada en 4 seg'),
    (v_block_id, 3, 'curl-mancuernas-alterno', 'dia1:v1:curl-mancuernas-alterno', 4, '10 der / 15 izq', null, null, null),
    (v_block_id, 4, 'curl-polea-alta', 'dia1:v1:curl-polea-alta', null, '12 der / 20 izq', null, null, null),
    (v_block_id, 5, 'curl-muneca-antebrazo', 'dia1:v1:curl-muneca-antebrazo', 4, '10 der / 15 izq', null, null, null),
    (v_block_id, 6, 'curl-martillo', 'dia1:v1:curl-martillo', 4, '10 der / 15 izq', null, null, null);

  insert into routine_blocks (id, day_id, posicion, clave, etiqueta)
  values (gen_random_uuid(), v_day_id, 2, 'v2', 'Brazo 2')
  returning id into v_block_id;

  insert into routine_exercises
    (block_id, posicion, exercise_slug, slot, series, reps, peso_objetivo_kg, descanso, nota)
  values
    (v_block_id, 1, 'press-militar-barra', 'dia1:v2:press-militar-barra', 4, '10', null, null, 'Bajada controlada'),
    (v_block_id, 2, 'elevaciones-laterales', 'dia1:v2:elevaciones-laterales', 4, '10', null, null, 'Pesado, bajada controlada'),
    (v_block_id, 3, 'jalon-cara', 'dia1:v2:jalon-cara', 4, '15', null, null, null),
    (v_block_id, 4, 'elevaciones-frontales-barra', 'dia1:v2:elevaciones-frontales-barra', 4, '12', null, null, 'Bajada controlada'),
    (v_block_id, 5, 'curl-predicador', 'dia1:v2:curl-predicador', 4, '8–10', null, '15 seg (series cortas)', 'Serie hasta el fallo; repite en series cortas hasta sumar 20 reps efectivas'),
    (v_block_id, 6, 'curl-agarre-invertido', 'dia1:v2:curl-agarre-invertido', 4, '15', null, null, null),
    (v_block_id, 7, 'curl-martillo', 'dia1:v2:curl-martillo', 4, '15', null, null, null);

  -- Día 2: Core
  insert into routine_days (id, routine_id, posicion, clave, etiqueta, enfoque, abdomen)
  values (gen_random_uuid(), v_routine_id, 2, 'dia2', 'Día 2', 'Core', true)
  returning id into v_day_id;

  insert into routine_blocks (id, day_id, posicion, clave, etiqueta)
  values (gen_random_uuid(), v_day_id, 1, 'base', 'Zona media')
  returning id into v_block_id;

  insert into routine_exercises
    (block_id, posicion, exercise_slug, slot, series, reps, peso_objetivo_kg, descanso, nota)
  values
    (v_block_id, 1, 'crunch', 'dia2:base:crunch', 5, '20', null, '30–45 seg', null),
    (v_block_id, 2, 'elevacion-cadera-acostado', 'dia2:base:elevacion-cadera-acostado', 5, '20', null, '30–45 seg', null),
    (v_block_id, 3, 'plancha-lateral', 'dia2:base:plancha-lateral', 4, '15–20 seg por lado', null, 'Sin descanso', null),
    (v_block_id, 4, 'plancha', 'dia2:base:plancha', null, 'hasta 1 min continuo', null, '10 seg (entre intervalos)', 'Progresión: 20 seg de trabajo, hasta sostener 1 min continuo');

  -- Día 3: Pierna
  insert into routine_days (id, routine_id, posicion, clave, etiqueta, enfoque, abdomen)
  values (gen_random_uuid(), v_routine_id, 3, 'dia3', 'Día 3', 'Pierna', false)
  returning id into v_day_id;

  insert into routine_blocks (id, day_id, posicion, clave, etiqueta)
  values (gen_random_uuid(), v_day_id, 1, 'base', 'Tren inferior')
  returning id into v_block_id;

  insert into routine_exercises
    (block_id, posicion, exercise_slug, slot, series, reps, peso_objetivo_kg, descanso, nota)
  values
    (v_block_id, 1, 'sentadilla', 'dia3:base:sentadilla', 4, '10', 20, null, null),
    (v_block_id, 2, 'subida-banco', 'dia3:base:subida-banco', 4, '10', 24, null, null),
    (v_block_id, 3, 'peso-muerto-mancuernas', 'dia3:base:peso-muerto-mancuernas', 4, '12', 18, null, null),
    (v_block_id, 4, 'abduccion-cadera', 'dia3:base:abduccion-cadera', 4, '15', null, null, null),
    (v_block_id, 5, 'aduccion-cadera', 'dia3:base:aduccion-cadera', 4, '15', null, null, null),
    (v_block_id, 6, 'puente-gluteo', 'dia3:base:puente-gluteo', 4, '8', 5, null, null);

  -- Día 4: Pecho y hombro
  insert into routine_days (id, routine_id, posicion, clave, etiqueta, enfoque, abdomen)
  values (gen_random_uuid(), v_routine_id, 4, 'dia4', 'Día 4', 'Pecho y hombro', true)
  returning id into v_day_id;

  insert into routine_blocks (id, day_id, posicion, clave, etiqueta)
  values (gen_random_uuid(), v_day_id, 1, 'base', 'Empuje')
  returning id into v_block_id;

  insert into routine_exercises
    (block_id, posicion, exercise_slug, slot, series, reps, peso_objetivo_kg, descanso, nota)
  values
    (v_block_id, 1, 'press-pectoral-maquina', 'dia4:base:press-pectoral-maquina', 4, '15', 21, null, null),
    (v_block_id, 2, 'press-inclinado-barra', 'dia4:base:press-inclinado-barra', 4, '12', null, null, null),
    (v_block_id, 3, 'press-mancuernas-plano', 'dia4:base:press-mancuernas-plano', 4, '12', null, null, null),
    (v_block_id, 4, 'fly-mancuernas', 'dia4:base:fly-mancuernas', 4, '12', null, null, null),
    (v_block_id, 5, 'elevaciones-laterales', 'dia4:base:elevaciones-laterales', 4, '10', null, null, 'Pesado, bajada controlada'),
    (v_block_id, 6, 'extension-triceps-polea', 'dia4:base:extension-triceps-polea', 4, '12', 14, null, null),
    (v_block_id, 7, 'crunch', 'dia4:base:crunch', 4, '20', null, '30–45 seg', null);

  -- Día 5: Espalda
  insert into routine_days (id, routine_id, posicion, clave, etiqueta, enfoque, abdomen)
  values (gen_random_uuid(), v_routine_id, 5, 'dia5', 'Día 5', 'Espalda', false)
  returning id into v_day_id;

  insert into routine_blocks (id, day_id, posicion, clave, etiqueta)
  values (gen_random_uuid(), v_day_id, 1, 'v1', 'Dorsales 1')
  returning id into v_block_id;

  insert into routine_exercises
    (block_id, posicion, exercise_slug, slot, series, reps, peso_objetivo_kg, descanso, nota)
  values
    (v_block_id, 1, 'remo-maquina', 'dia5:v1:remo-maquina', null, '8–10 reps', null, null, 'Controlado'),
    (v_block_id, 2, 'remo-maquina', 'dia5:v1:remo-maquina#2', null, '20 reps', null, null, null),
    (v_block_id, 3, 'jalon-triangulo', 'dia5:v1:jalon-triangulo', null, '20-15-12-10', null, null, 'Pirámide descendente'),
    (v_block_id, 4, 'remo-barra-recta', 'dia5:v1:remo-barra-recta', null, null, null, null, null),
    (v_block_id, 5, 'remo-polea-alta-unimano', 'dia5:v1:remo-polea-alta-unimano', null, null, null, null, null),
    (v_block_id, 6, 'press-inclinado-barra', 'dia5:v1:press-inclinado-barra', null, null, null, null, null),
    (v_block_id, 7, 'lagartijas-declinadas', 'dia5:v1:lagartijas-declinadas', null, null, null, null, null),
    (v_block_id, 8, 'cruce-poleas-inferior', 'dia5:v1:cruce-poleas-inferior', null, null, null, null, null),
    (v_block_id, 9, 'lagartijas-diamante', 'dia5:v1:lagartijas-diamante', null, null, null, null, null),
    (v_block_id, 10, 'press-mancuernas-plano', 'dia5:v1:press-mancuernas-plano', null, null, null, null, 'Superserie combinada');

  insert into routine_blocks (id, day_id, posicion, clave, etiqueta)
  values (gen_random_uuid(), v_day_id, 2, 'v2', 'Dorsales 2')
  returning id into v_block_id;

  insert into routine_exercises
    (block_id, posicion, exercise_slug, slot, series, reps, peso_objetivo_kg, descanso, nota)
  values
    (v_block_id, 1, 'cruce-poleas-inferior', 'dia5:v2:cruce-poleas-inferior', 4, '15-12-10-8', null, null, '23–36 kg — Piramidal ascendente en carga'),
    (v_block_id, 2, 'lagartijas-diamante', 'dia5:v2:lagartijas-diamante', 4, '15', null, null, null),
    (v_block_id, 3, 'jalon-triangulo', 'dia5:v2:jalon-triangulo', 4, '8-10-12-15', null, null, 'Piramidal en reps'),
    (v_block_id, 4, 'press-mancuernas-plano', 'dia5:v2:press-mancuernas-plano', 4, '15', null, null, 'Superserie combinada'),
    (v_block_id, 5, 'remo-sentado-barra-horizontal', 'dia5:v2:remo-sentado-barra-horizontal', 4, '10', null, null, null);

  insert into routine_blocks (id, day_id, posicion, clave, etiqueta)
  values (gen_random_uuid(), v_day_id, 3, 'v3', 'Pectorales-Dorsales')
  returning id into v_block_id;

  insert into routine_exercises
    (block_id, posicion, exercise_slug, slot, series, reps, peso_objetivo_kg, descanso, nota)
  values
    (v_block_id, 1, 'press-mancuernas-plano', 'dia5:v3:press-mancuernas-plano', null, 'reps efectivas ~20', null, '2–3 min', null),
    (v_block_id, 2, 'jalon-barra-prono', 'dia5:v3:jalon-barra-prono', null, 'reps efectivas ~20', null, '2–3 min', null),
    (v_block_id, 3, 'press-inclinado-barra', 'dia5:v3:press-inclinado-barra', null, 'reps efectivas ~20', null, '2–3 min', null),
    (v_block_id, 4, 'remo-sentado-barra-horizontal', 'dia5:v3:remo-sentado-barra-horizontal', null, 'reps efectivas ~20', null, '2–3 min', null),
    (v_block_id, 5, 'cruce-poleas-inferior', 'dia5:v3:cruce-poleas-inferior', null, 'reps efectivas ~20', null, '2–3 min', null),
    (v_block_id, 6, 'jalon-triangulo', 'dia5:v3:jalon-triangulo', null, 'reps efectivas ~20', null, '2–3 min', null),
    (v_block_id, 7, 'jalon-cara', 'dia5:v3:jalon-cara', 5, '20', null, '2–3 min', null),
    (v_block_id, 8, 'fly-mancuernas', 'dia5:v3:fly-mancuernas', null, 'mín. 20 reps', null, '2–3 min', 'Al fallo'),
    (v_block_id, 9, 'pull-over-polea-alta', 'dia5:v3:pull-over-polea-alta', null, 'mín. 20 reps', null, '2–3 min', 'Al fallo');

  -- Día 6: Pierna 2
  insert into routine_days (id, routine_id, posicion, clave, etiqueta, enfoque, abdomen)
  values (gen_random_uuid(), v_routine_id, 6, 'dia6', 'Día 6', 'Pierna 2', true)
  returning id into v_day_id;

  insert into routine_blocks (id, day_id, posicion, clave, etiqueta)
  values (gen_random_uuid(), v_day_id, 1, 'v1', 'Pierna 1')
  returning id into v_block_id;

  insert into routine_exercises
    (block_id, posicion, exercise_slug, slot, series, reps, peso_objetivo_kg, descanso, nota)
  values
    (v_block_id, 1, 'sentadilla-salto', 'dia6:v1:sentadilla-salto', null, '10 reps', null, null, 'Activación'),
    (v_block_id, 2, 'hip-thrust-maquina', 'dia6:v1:hip-thrust-maquina', 4, '10', null, null, null),
    (v_block_id, 3, 'sentadilla-smith', 'dia6:v1:sentadilla-smith', 5, '12', 5, null, 'Aguanta 2 seg en cada rep'),
    (v_block_id, 4, 'leg-curl-femoral', 'dia6:v1:leg-curl-femoral', 5, '15', null, null, 'Sube en 4 seg + 2 seg isométrico'),
    (v_block_id, 5, 'subida-banco', 'dia6:v1:subida-banco', 4, '15', null, null, null),
    (v_block_id, 6, 'leg-extension', 'dia6:v1:leg-extension', 4, '10', null, null, 'Sube 4 seg / baja 4 seg'),
    (v_block_id, 7, 'abduccion-cadera', 'dia6:v1:abduccion-cadera', 4, '15', null, null, 'Pirámide'),
    (v_block_id, 8, 'aduccion-cadera', 'dia6:v1:aduccion-cadera', 4, '15', null, null, 'Pirámide'),
    (v_block_id, 9, 'plancha', 'dia6:v1:plancha', 3, '40 seg', null, '30 seg', null);

  insert into routine_blocks (id, day_id, posicion, clave, etiqueta)
  values (gen_random_uuid(), v_day_id, 2, 'v2', 'Pierna 2')
  returning id into v_block_id;

  insert into routine_exercises
    (block_id, posicion, exercise_slug, slot, series, reps, peso_objetivo_kg, descanso, nota)
  values
    (v_block_id, 1, 'sentadilla-hack', 'dia6:v2:sentadilla-hack', 4, '10', null, null, 'Pesado'),
    (v_block_id, 2, 'hip-thrust-maquina', 'dia6:v2:hip-thrust-maquina', null, null, null, null, 'Series libres — sin dato de reps'),
    (v_block_id, 3, 'leg-extension', 'dia6:v2:leg-extension', null, null, null, null, 'Series libres — sin dato de reps'),
    (v_block_id, 4, 'sentadilla-salto', 'dia6:v2:sentadilla-salto', null, null, null, null, 'Series libres — sin dato de reps'),
    (v_block_id, 5, 'leg-curl-femoral', 'dia6:v2:leg-curl-femoral', 4, '10', null, null, 'Subida en 4 seg'),
    (v_block_id, 6, 'abduccion-cadera', 'dia6:v2:abduccion-cadera', null, null, null, null, 'Series libres — sin dato de reps'),
    (v_block_id, 7, 'aduccion-cadera', 'dia6:v2:aduccion-cadera', null, null, null, null, 'Series libres — sin dato de reps'),
    (v_block_id, 8, 'plancha', 'dia6:v2:plancha', 3, '40 seg', null, '30 seg', null);

  insert into routine_blocks (id, day_id, posicion, clave, etiqueta)
  values (gen_random_uuid(), v_day_id, 3, 'v3', 'Tren inferior (hipertrofia)')
  returning id into v_block_id;

  insert into routine_exercises
    (block_id, posicion, exercise_slug, slot, series, reps, peso_objetivo_kg, descanso, nota)
  values
    (v_block_id, 1, 'sentadilla-smith', 'dia6:v3:sentadilla-smith', null, 'reps efectivas ~20', null, '15–20 seg', 'Bloque A'),
    (v_block_id, 2, 'hip-thrust-maquina', 'dia6:v3:hip-thrust-maquina', null, 'reps efectivas ~20', null, '15–20 seg', 'Bloque A'),
    (v_block_id, 3, 'peso-muerto-mancuernas', 'dia6:v3:peso-muerto-mancuernas', null, 'reps efectivas ~20', null, '15–20 seg', 'Bloque A — el peso se mantiene'),
    (v_block_id, 4, 'leg-extension', 'dia6:v3:leg-extension', 3, '21', null, '1–2 min', 'Método 21: 7 reps puntas adentro + 7 afuera + 7 en recto'),
    (v_block_id, 5, 'extension-cadera-polea-grillete', 'dia6:v3:extension-cadera-polea-grillete', 3, '12', null, '30–45 seg', null),
    (v_block_id, 6, 'leg-curl-femoral', 'dia6:v3:leg-curl-femoral', 3, '12', null, '30–45 seg', null),
    (v_block_id, 7, 'abduccion-cadera', 'dia6:v3:abduccion-cadera', null, 'biserie 20-15-12', null, null, null),
    (v_block_id, 8, 'aduccion-cadera', 'dia6:v3:aduccion-cadera', null, 'biserie 20-15-12', null, null, null),
    (v_block_id, 9, 'plancha', 'dia6:v3:plancha', 3, '40 seg', null, '30 seg', null);

  -- Día 7: Descanso
  insert into routine_days (id, routine_id, posicion, clave, etiqueta, enfoque, abdomen)
  values (gen_random_uuid(), v_routine_id, 7, 'dia7', 'Día 7', 'Descanso', false)
  returning id into v_day_id;

end $$;

commit;
