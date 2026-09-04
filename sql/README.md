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
