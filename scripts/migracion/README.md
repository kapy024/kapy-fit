# Migración de proyecto — exportador

Saca del proyecto Supabase **viejo** (`oakahiwejhzsxccrscmk`) los datos del
dueño (`exercise_logs`, `body_weight`, `profiles`) a un JSON local, para
subirlos luego al proyecto nuevo. RLS ya limita cada tabla al dueño por
`auth.uid()`/`id = auth.uid()`, así que basta con su propio `access_token`
— nunca la `service_role key`.

## 1. Sacar el token

Con sesión iniciada en la app (kapy-fit, apuntando todavía al proyecto
viejo), abre la consola del navegador y corre:

```js
JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.includes('-auth-token')))).access_token
```

Copia el string que regresa (sin comillas). Ese es tu `TOKEN`. Caduca —si
pasa mucho tiempo entre sacarlo y correr el exportador, vuelve a pedirlo.

## 2. Correr el exportador

```bash
SUPABASE_URL=https://oakahiwejhzsxccrscmk.supabase.co \
SUPABASE_ANON_KEY="$(grep ANON_KEY config.js | cut -d'"' -f2)" \
TOKEN="<el token del paso 1>" \
node scripts/migracion/exportar.mjs scripts/migracion/datos/dueno-$(date +%F).json
```

`scripts/migracion/datos/` está en `.gitignore` — lo que se escriba ahí
nunca entra al repo. El script:

- pagina con `Range` (PostgREST corta en 1000 filas por omisión), así que
  trae la tabla completa aunque pase de eso;
- se **niega a sobrescribir** un archivo que ya exista — bórralo o cambia
  la ruta;
- si falta una variable de entorno o el `TOKEN` no tiene forma de JWT, para
  con un mensaje claro y código de salida distinto de 0, sin tocar la red;
- si PostgREST responde 401 (token vencido o inválido), lo reporta como tal
  — nunca como una exportación vacía.

## 3. Qué anotar

Al terminar, el script imprime el bloque `conteos` (también queda dentro
del JSON). Anota esos números — son lo que el importador del proyecto
nuevo va a cotejar después:

- `exercise_logs`, `body_weight`, `profiles`: cuántas filas trajo de cada
  tabla;
- `suma_peso_exercise_logs`, `suma_peso_body_weight`: la suma de
  `weight_kg` de cada tabla;
- `claves_exercise_logs`: la lista ordenada de `slot|logged_on` de cada
  registro, para ubicar cualquiera que no cuadre.

Si algún conteo no coincide después de importar, la migración se detiene
ahí — no se sigue adelante con un conteo que no cuadra.

## 4. Al terminar la migración

El archivo bajo `scripts/migracion/datos/` tiene datos reales del dueño.
**Bórralo** en cuanto la migración quede confirmada en el proyecto nuevo;
no tiene por qué sobrevivir a la migración.
