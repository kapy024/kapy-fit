# SQL — Registro de Hierro

Todo el SQL de este directorio se aplica **a mano**, desde el editor SQL del
proyecto en supabase.com, **en orden numérico** (`001`, `002`, `003`, …).

**Los archivos ya aplicados no se editan.** Si hace falta corregir algo que
ya corrió en producción, se agrega un archivo nuevo con el siguiente número
(`003_...sql`), nunca se modifica uno existente — el editor SQL de Supabase
no versiona el historial de lo que ya se ejecutó, así que un archivo editado
deja de reflejar lo que realmente hay en la base.

## Orden de aplicación

1. `001_esquema.sql` — tablas base. Al terminar, las 8 tablas existen pero
   **sin RLS activo todavía** (`rowsecurity = false`): sin políticas, están
   cerradas por definición de la tarea siguiente, no por esta.
2. `002_rls.sql` — activa Row Level Security en las 8 tablas y define las
   políticas de acceso. Este es el paso que hace segura a la anon key
   pública del repo.
3. `003_semilla.sql` — siembra el catálogo de 43 ejercicios y la plantilla
   oficial (`routines.user_id is null`, 7 días, 80 renglones). **Generado**
   desde `js/catalogo.js` y `js/rutina.js` con
   `node scripts/generar-semilla.mjs > sql/003_semilla.sql` — no se edita a
   mano; si el catálogo o la rutina cambian en el código, se regenera este
   archivo y se vuelve a aplicar. Es idempotente: upsert por `slug` en
   `exercises`, y borra la plantilla anterior antes de insertar la nueva, así
   que reaplicarlo no acumula duplicados.
4. `004_clonado.sql` — función `clonar_plantilla(uid)` y el trigger
   `on_auth_user_created` que la dispara `after insert on auth.users`: crea
   el `profiles` del usuario y le copia la plantilla oficial completa
   (días, bloques y ejercicios), conservando el `slot` de cada renglón tal
   cual. Es idempotente (si el usuario ya tiene rutina, no hace nada).

Pegar el contenido de cada archivo en el editor SQL de Supabase y ejecutarlo,
uno a la vez, en ese orden.

## Verificación copiable

### Después de `001_esquema.sql`

```sql
select tablename, rowsecurity from pg_tables where schemaname = 'public' order by tablename;
```

Esperado: las 8 tablas, todas con `rowsecurity = false` (RLS lo activa `002`).

### Después de `002_rls.sql`

Confirmar que RLS quedó activo en las 8 tablas:

```sql
select tablename, rowsecurity from pg_tables where schemaname='public' order by tablename;
```

Esperado: `rowsecurity = true` en las 8 tablas.

Confirmar **desde fuera**, con la anon key y sin sesión, que las tablas
sensibles no responden. Pegar en una terminal (no en el editor SQL):

```bash
KEY="$(grep SUPABASE_ANON_KEY config.js | cut -d'"' -f2)"
URL="https://oakahiwejhzsxccrscmk.supabase.co/rest/v1"
for t in exercise_logs body_weight profiles routines; do
  echo -n "$t sin sesión: "
  curl -s "$URL/$t?select=*&limit=1" -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
  echo
done
```

Esperado: **arreglo vacío `[]` en las cuatro**, nunca datos. Un `[]` aquí
significa que RLS filtró correctamente; si alguna devolviera filas, la
política está mal y no se debe seguir adelante (ni sembrar el catálogo, ni
avisar que la tarea está lista).

### Verificación adicional recomendada (con dos usuarios reales)

Estas consultas usan `auth.uid()`, así que solo tienen sentido con una sesión
autenticada real (no en el editor SQL, que corre como superusuario y no
está sujeto a RLS). La forma práctica de probarlas es desde la app, con dos
cuentas de prueba distintas, o con dos llamadas REST usando el `access_token`
de cada sesión en vez de la anon key sola:

```bash
# Sustituir TOKEN_A / TOKEN_B por el access_token de cada sesión logueada.
URL="https://oakahiwejhzsxccrscmk.supabase.co/rest/v1"
KEY="$(grep SUPABASE_ANON_KEY config.js | cut -d'"' -f2)"

echo "A leyendo exercise_logs (solo deben aparecer los suyos):"
curl -s "$URL/exercise_logs?select=*" -H "apikey: $KEY" -H "Authorization: Bearer $TOKEN_A"

echo "A leyendo routines (su propia rutina + la plantilla, nunca la de B):"
curl -s "$URL/routines?select=id,user_id,nombre" -H "apikey: $KEY" -H "Authorization: Bearer $TOKEN_A"

echo "A leyendo el catálogo exercises (debe responder, sí tiene sesión):"
curl -s "$URL/exercises?select=slug" -H "apikey: $KEY" -H "Authorization: Bearer $TOKEN_A"

echo "A intentando escribir en exercises (debe fallar, catálogo no editable desde el cliente):"
curl -s -X POST "$URL/exercises" -H "apikey: $KEY" -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" -d '{"slug":"prueba","nombre":"Prueba"}'
```

Esperado: `exercise_logs` y `routines` solo devuelven filas de A (nunca de
B); `exercises` responde con el catálogo completo; el intento de escritura
en `exercises` devuelve un error de política, no un `201`.

### Después de `003_semilla.sql`

```sql
select (select count(*) from exercises)                                as ejercicios,
       (select count(*) from routine_days   where routine_id =
          (select id from routines where user_id is null))             as dias,
       (select count(*) from routine_exercises re
          join routine_blocks b on b.id = re.block_id
          join routine_days   d on d.id = b.day_id
         where d.routine_id = (select id from routines where user_id is null)) as renglones;
```

Esperado: `43 | 7 | 80` — debe coincidir con lo que dice el código:

```bash
node -e 'import("./js/catalogo.js").then(m=>console.log("ejercicios:", m.slugs().length));
         import("./js/rutina.js").then(m=>{
           console.log("dias:", m.RUTINA.length);
           console.log("renglones:", m.RUTINA.flatMap(d=>d.bloques.flatMap(b=>b.ejercicios)).length);
         });'
```

Si los números no coinciden, la semilla perdió algo: no seguir adelante.

### Después de `004_clonado.sql`

Crear un usuario de prueba desde Authentication → Users → Add user, y
verificar:

```sql
select u.email,
       (select count(*) from routines r where r.user_id = u.id)  as rutinas,
       (select count(*) from routine_exercises re
          join routine_blocks b on b.id = re.block_id
          join routine_days   d on d.id = b.day_id
          join routines       r on r.id = d.routine_id
         where r.user_id = u.id)                                  as renglones,
       (select count(*) from profiles p where p.id = u.id)        as perfil
  from auth.users u order by u.created_at desc limit 3;
```

Esperado: `rutinas = 1`, `perfil = 1`, `renglones = 80` (igual a la
plantilla). Y, lo más importante, que el clon no inventó slots:

```sql
select count(*) from routine_exercises re
  join routine_blocks b on b.id=re.block_id
  join routine_days d on d.id=b.day_id
  join routines r on r.id=d.routine_id
 where r.user_id is not null
   and re.slot not in (select slot from routine_exercises re2
     join routine_blocks b2 on b2.id=re2.block_id
     join routine_days d2 on d2.id=b2.day_id
     join routines r2 on r2.id=d2.routine_id where r2.user_id is null);
```

Esperado: **0**. Cualquier otro número significa que el registro del cliente
en `localStorage` no va a coincidir con lo que hay en la base. Borrar el
usuario de prueba al terminar.

### Idempotencia del upsert

Para confirmar que `unique (user_id, slot, logged_on)` evita duplicados al
reenviar la cola de sincronización, hacer el mismo `upsert` dos veces (mismo
`user_id` + `slot` + `logged_on`, valores distintos) y contar filas:

```sql
select count(*) from exercise_logs where user_id = auth.uid() and slot = '<slot de prueba>';
```

Esperado: `1`, sin importar cuántas veces se haya reenviado el mismo
registro.

## Nota sobre este archivo

Este README documenta el "Paso 2" de las tareas 2, 3, 4 y 5 de la entrega,
ajustado porque quien redactó el SQL no tiene acceso al panel de Supabase.
Las consultas de arriba son las mismas que traían los brief originales; están
aquí para que el dueño del proyecto las pegue tal cual al aplicar cada
archivo. El detalle de qué se verificó de otra forma (una base Postgres
desechable local) está en `.superpowers/sdd/briefs2/tarea-2-3-report.md`
(tareas 2 y 3) y `.superpowers/sdd/briefs2/tarea-4-5-report.md` (tareas 4 y
5).

## 005_updated_at.sql

Agregado el 2026-09-03, después de probar la sincronización contra la base real.
`updated_at` no se refrescaba en los UPDATE que produce un `upsert`, así que una
fila cambiaba de valor conservando la marca de tiempo del insert. La resolución
de conflictos entre dispositivos depende de ese campo, así que sin esto el
trabajo hecho en un dispositivo podía descartarse en silencio.

Aplica este archivo como los demás, en el editor SQL.

## 006_edicion_cliente.sql

Agregado el 2026-09-03, corrigiendo una pérdida silenciosa de datos distinta
de la de `005`, encontrada también probando contra la base real: la SUBIDA
(`sync.js`, `enviarOperacion`) hacía un `upsert` ciego, sin ninguna guarda de
tiempo. Reproducido: dispositivo A anota 111 sin red; dispositivo B anota 222
con red y sincroniza; A recupera la red y sincroniza — el 222 de B
desaparecía del servidor (y de B, en su siguiente descarga), sin aviso.
Ganaba quien sincronizaba al último, no quien había escrito al último.

Agrega `editado_en` (cuándo el CLIENTE hizo la edición — distinto de
`updated_at`, que es cuándo el SERVIDOR tocó la fila) a `exercise_logs` y
`body_weight`, y la función `subir_registro_ejercicio(...)`, que sync.js
ahora llama por `rpc(...)` en vez del `upsert` directo. Solo pisa la fila si
`p_editado_en` es más nuevo que lo que ya hay; corre `security invoker` y usa
`auth.uid()` para el `user_id` (nunca un parámetro), así que las políticas de
`002_rls.sql` siguen aplicando sin cambios. Siempre devuelve `{aplicado,
fila}`: si `aplicado=false`, la fila devuelta es la que de verdad ganó, y
sync.js corrige su copia local con ella en vez de dejar en pantalla un valor
que el servidor ya descartó.

Aplica este archivo como los demás, en el editor SQL. La consulta de
comprobación está comentada al final del propio archivo.

### Verificado en local, con Postgres 16 desechable

Mismo método que `002/003/004` (Docker vía Colima, mock de `auth.users` /
`auth.uid()` / roles `anon`/`authenticated`, contenedor destruido al
terminar). Con `001`, `002` y `006` aplicados en ese orden:

- `subir_registro_ejercicio` quedó `prosecdef = false` (security invoker,
  no definer).
- **El escenario del defecto, reproducido y corregido:** como el mismo
  usuario, se llamó primero con `editado_en = now()` y `weight_kg = 222`
  (aplicado=true), y después con `editado_en = now() - 1 hora` y
  `weight_kg = 111` (simulando al dispositivo A sincronizando después, pero
  habiendo editado antes) — la segunda llamada dio `aplicado = false` y
  devolvió la fila con `weight_kg = 222`. La fila en la tabla, al final,
  tenía `weight_kg = 222`: el 222 de B **nunca desapareció**.
- **Aislamiento entre cuentas:** la misma llamada hecha como un segundo
  usuario creó una fila propia (`user_id` distinto) sin tocar la del
  primero — `auth.uid()` decide el dueño, nunca algo que el cliente mande.
- **Sin sesión (`anon`):** la llamada fue rechazada por RLS (`new row
  violates row-level security policy for table "exercise_logs"`), no
  insertó nada.
- Conteo final de filas: exactamente las 2 legítimas (una por usuario) —
  nada del intento de `anon` quedó en la base.

## 007_permisos_clonado.sql

Agregado el 2026-09-04, corrigiendo un hallazgo de seguridad de la revisión
final de rama: `clonar_plantilla(uid)` (`004`) es `security definer` y toma
el `user_id` como PARÁMETRO en vez de leerlo de `auth.uid()` — a diferencia
de `subir_registro_ejercicio` (`006`), que sí hace lo correcto. `create
function` otorga EXECUTE a PUBLIC por omisión y `004` nunca lo revocó, así
que quedó ejecutable por el rol `anon`. Confirmado contra producción sin
sesión: la llamada responde `22P02` a un uuid inválido (la función corre de
verdad) en vez de un error de permisos. Como es `security definer`, corre
saltándose RLS: cualquiera puede crear el `profiles` de un uuid ajeno y
reclonarle la plantilla encima, y el comportamiento distinto según el uuid
ya tenga rutina o no sirve para distinguir cuentas reales de inventadas.

Este archivo solo revoca ese EXECUTE de `public`/`anon`/`authenticated`. El
trigger `on_auth_user_created` (`004`) sigue funcionando exactamente igual:
`trigger_clonar_plantilla()` también es `security definer`, así que su
`perform clonar_plantilla(new.id)` corre como el DUEÑO de la función, y el
dueño no necesita un grant explícito para ejecutar lo suyo.

Aprovechando la migración, también le agrega `set search_path = public` a
`tocar_updated_at()` (`005`), la única de las funciones de seguridad de
este proyecto que no lo tenía todavía.

Aplica este archivo como los demás, en el editor SQL. Las comprobaciones
(privilegios de `clonar_plantilla`, `search_path` de `tocar_updated_at`, y
la llamada `anon` por REST que debe pasar de `22P02` a un error de
permisos) están comentadas al final del propio archivo — no se verificaron
aquí contra una base local porque el hallazgo ya se confirmó directamente
contra producción; conviene correrlas ahí después de aplicar.

## 008_rutina_sincronizada.sql

Agregado el 2026-09-04, corrigiendo I3 de la revisión final de rama: la
rutina editada SUBE pero nunca BAJA. `descargar()` (`sync.js`) solo
consultaba `exercise_logs` — nada leía `routine_exercises` ni `profiles` —
así que una edición hecha en un dispositivo nunca aparecía en el otro. Peor
todavía: `enviarEdicionBloque()` hacía `update` CIEGOS sobre
`routine_exercises`, sin el equivalente de `editado_en` que ya protege
`exercise_logs`/`body_weight` desde `006`, así que dos dispositivos editando
el mismo bloque sin haberse visto nunca se pisaban en silencio.

Agrega `editado_en` a `routine_exercises` (mismo patrón que `006`) y la
función `subir_edicion_rutina(...)`: `security invoker`, `set search_path`
fijo, solo pisa el renglón si `p_editado_en` es más nuevo, y — a diferencia
de `subir_registro_ejercicio` — el renglón se identifica por su propio `id`
(server-side, no algo que `auth.uid()` pueda derivar solo), así que la
función verifica explícitamente, antes de tocar nada, que ese `id`
pertenece a una rutina cuyo dueño es `auth.uid()`, y lanza una excepción si
no. El `EXECUTE` de `PUBLIC` se revoca en la misma migración que crea la
función (no después, como le pasó a `clonar_plantilla` en `004`/`007`).

Del lado del cliente (`js/sync.js`, `js/almacen.js`):
- `enviarEdicionBloque()` ahora llama `subir_edicion_rutina` por `rpc(...)`
  para cada renglón, en vez del `update` directo. Si algún renglón pierde
  su conflicto, el pendiente igual se resuelve (no se reintenta para
  siempre) y el bloque local se corrige completo con lo que el servidor
  dice que quedó — nunca una mezcla de lo que este dispositivo ganó en
  unos renglones y perdió en otros.
- `descargar()` ahora también trae `routine_exercises` (agrupadas por
  día:bloque) y `profiles` (la `unidad`), cada una en su propio `try/catch`
  para que un fallo en una no tumbe a las otras. La rutina se resuelve con
  las mismas cuatro reglas que ya usan los registros (cola primero, marca
  de tiempo después) — comparando `marcaDeRutina()` (nueva, en
  `almacen.js`, un timestamp por bloque, igual que `marcaDe()` para
  registros) contra el `editado_en` más nuevo de las filas del bloque. El
  perfil, al no tener una carrera real hoy (un solo campo, `unidad`), solo
  usa la regla de la cola — si hay un `preferencias` pendiente sin subir,
  no se pisa; si no, se toma lo del servidor.
- Tanto la corrección tras un conflicto perdido como una descarga aplican
  el bloque también a la `RUTINA` en memoria (`editor-rutina.js`'s
  `aplicarEdicionABloque`), no solo a `localStorage`, para que se refleje
  en pantalla sin esperar una recarga.

Aplica este archivo como los demás, en el editor SQL. Las comprobaciones
(columna, `security invoker`, permisos, el mismo par de escrituras
condicionales que `006` y el rechazo por dueño) están comentadas al final
del propio archivo.

### Verificado en local, con Postgres 16 desechable

Mismo método que `002/003/004/006` (Docker vía Colima, mock de
`auth.users`/`auth.uid()`/roles `anon`/`authenticated`, contenedor
destruido al terminar). Con `001`, `002`, `006` y `008` aplicados en ese
orden, dos usuarios de prueba con una rutina de un renglón cada uno:

- `subir_edicion_rutina` quedó `prosecdef = false` (security invoker) y su
  `EXECUTE` solo aparece para `authenticated` (ni `PUBLIC` ni `anon`).
- **El mismo escenario que 006, a nivel de rutina:** llamada con
  `editado_en = now() - 1 hora` y peso 10 (rechazada, quedó lo que ya
  había del insert inicial); llamada con `editado_en = now()` y peso 99
  (aceptada); una tercera llamada, otra vez con `now() - 1 hora` y peso 10,
  volvió a rechazarse — el renglón en la base terminó en peso 99, nunca se
  pisó con el valor viejo.
- **Rechazo por dueño:** el usuario A, con el `id` de un renglón real del
  usuario B, recibió el error `renglón ... no pertenece a la rutina de
  este usuario` — nunca tocó la fila ajena.
- Sin sesión (`anon`): `permission denied for function
  subir_edicion_rutina` — el `EXECUTE` revocado lo bloquea antes de que la
  función llegue a correr.

## 009_peso_corporal.sql

Agregado el 2026-09-04, entrega 3 (gráficas): la pestaña Progreso agrega
captura de peso corporal, y `body_weight` (creada desde `001_esquema.sql`,
con su `editado_en` desde `006`) todavía no tenía ninguna función para
escribirla — `sync.js` no tenía tipo de operación `"peso"` hasta esta
entrega.

Agrega `subir_peso_corporal(p_fecha, p_kg, p_editado_en)`: mismo patrón que
`subir_registro_ejercicio` (`006`) — escritura condicional por
`editado_en` (gana quien editó al último, no quien sincronizó al último),
`security invoker` con `user_id` siempre de `auth.uid()` (nunca un
parámetro), y devuelve siempre `{aplicado, fila}` para que `sync.js`
corrija su copia local cuando pierde. A diferencia de `006` — que dejó el
`EXECUTE` público sin revocar y necesitó dos migraciones de arreglo después
(`007` para `clonar_plantilla`, y un commit aparte para
`subir_registro_ejercicio` mismo) — **esta migración revoca el `EXECUTE`
de `public`/`anon` desde el principio**, en el mismo archivo que crea la
función.

**Ya está aplicada en producción.** Confirmado por REST sin sesión: la
llamada a `subir_peso_corporal` responde `42501` (`insufficient_privilege`)
en vez de ejecutar — el `EXECUTE` revocado bloquea la llamada antes de que
la función llegue a correr, igual que el resultado esperado de `008` para
`subir_edicion_rutina`.

Del lado del cliente (`js/sync.js`, `js/almacen.js`, `js/peso-corporal.js`):
- `guardarPeso()` (`peso-corporal.js`) valida (rechaza no-numérico,
  negativo o cero — `body_weight` tiene `check (weight_kg > 0)`, y dejar
  pasar un cero encolaría una escritura que el servidor rechaza para
  siempre) antes de llamar a `almacen.js`'s `guardarPeso()`, que persiste y
  encola un pendiente `"peso"`.
- `sync.js`'s `enviarOperacion()` sube ese pendiente por `rpc(...)` a
  `subir_peso_corporal`, con la misma reconciliación por `editado_en` que
  `"registro"`/`"rutina_bloque"` ya tienen.
- `descargar()` ahora también trae `body_weight` propia (`descargarPesos()`),
  con las mismas cuatro reglas que ya usan los registros de ejercicio —
  incluida la regla 1 (un peso declinado en el aviso de adopción de
  historial nunca se pisa con una descarga; ver el hallazgo C1 de la
  revisión final de esta entrega, que cerró el hueco que dejaba pasar esto
  quieto para el peso corporal).

Aplica este archivo como los demás, en el editor SQL. Las comprobaciones
(columna, `security invoker`, permisos, y el mismo par de escrituras
condicionales que `006`/`008`) están comentadas al final del propio
archivo.
