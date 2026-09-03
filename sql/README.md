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

Este README documenta el "Paso 2" de las tareas 2 y 3 de la entrega,
ajustado porque quien redactó el SQL no tiene acceso al panel de Supabase.
Las consultas de arriba son las mismas que traían los brief originales; están
aquí para que el dueño del proyecto las pegue tal cual al aplicar cada
archivo. El detalle de qué se verificó de otra forma (una base Postgres
desechable local) está en
`.superpowers/sdd/briefs2/tarea-2-3-report.md`.
