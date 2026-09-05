# Migración de proyecto — exportador e importador

Mueve los datos del dueño del proyecto Supabase **viejo**
(`oakahiwejhzsxccrscmk`, kapy-fit) al proyecto **nuevo**
(`lkyukrrigrovntivtnki`, el del sitio). Dos scripts, en este orden:

1. **`exportar.mjs`** — saca `exercise_logs`, `body_weight` y `profiles`
   del proyecto viejo a un JSON local.
2. **`importar.mjs`** — sube ese JSON al proyecto nuevo, con el dueño
   reasignado a quien firme el `TOKEN` que se le dé (nunca al `user_id` que
   trae el archivo), y coteja los conteos al terminar.

Entre uno y otro hay dos pasos que no son de este repo: aplicar las 9
migraciones de `sql/` en el proyecto nuevo, y que el dueño inicie sesión ahí
para que se le clone su fila de `profiles`. Ver la sección 3 más abajo.

RLS ya limita cada tabla al dueño por `auth.uid()`/`id = auth.uid()` en
ambos proyectos, así que en cada paso basta con el `access_token` propio del
dueño — nunca la `service_role key`.

## 1. Exportar del proyecto viejo

### 1.1 Sacar el token

Con sesión iniciada en la app (kapy-fit, apuntando todavía al proyecto
viejo), abre la consola del navegador y corre:

```js
JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.includes('-auth-token')))).access_token
```

Copia el string que regresa (sin comillas). Ese es tu `TOKEN`. Caduca —si
pasa mucho tiempo entre sacarlo y correr el exportador, vuelve a pedirlo.

### 1.2 Correr el exportador

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

### 1.3 Qué anotar

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

## 2. Preparar el proyecto nuevo (fuera de este repo)

Antes de importar, en el proyecto **nuevo** (`lkyukrrigrovntivtnki`) tienen
que existir ya:

- **Las 9 migraciones de `sql/`**, aplicadas a mano en su editor SQL, en
  orden numérico (`001_esquema.sql` … `009_peso_corporal.sql`). Son las que
  crean `subir_registro_ejercicio` y `subir_peso_corporal` — sin ellas
  `importar.mjs` falla en la primera llamada.
- **La fila de `profiles` del dueño**, que se crea sola (por trigger o por
  lo que dispare el flujo de alta) la primera vez que el dueño inicia
  sesión en ese proyecto. Si `importar.mjs` corre antes de eso, avisa y
  sigue igual con los registros — ver sección 3.2.

## 3. Importar al proyecto nuevo

### 3.1 Sacar el token del proyecto nuevo

Esto es lo que el brief de esta tarea no resuelve solo: `config.js` en este
repo (y en la copia publicada en GitHub Pages) **todavía apunta al proyecto
viejo**, así que no basta con repetir el truco de la sección 1.1 ahí. Dos
formas de conseguir un `TOKEN` real del proyecto nuevo:

- **Copia local con `config.js` temporal.** En una copia de trabajo de este
  repo (no la que se publica), cambia `SUPABASE_URL`/`SUPABASE_ANON_KEY` en
  `config.js` a los del proyecto nuevo, abre la app así modificada, que el
  dueño inicie sesión (esto además dispara el punto anterior: se le clona
  su `profiles`), y saca el token con el mismo snippet de la sección 1.1.
  Revierte el cambio a `config.js` al terminar — no se commitea.
- **Desde el editor SQL → Authentication del proyecto nuevo.** El panel de
  Supabase permite crear/gestionar el usuario del dueño y generar una
  sesión sin tocar ningún `config.js`; el `access_token` de esa sesión
  sirve igual.

Cualquiera de las dos requiere que el dueño ya tenga cuenta en el proyecto
nuevo — créala primero si no existe.

### 3.2 Correr el importador

```bash
SUPABASE_URL=https://lkyukrrigrovntivtnki.supabase.co \
SUPABASE_ANON_KEY="<anon del sitio, en ~/Development/kapy024-site/assets/js/config.js>" \
TOKEN="<token del dueño en el proyecto nuevo, sección 3.1>" \
node scripts/migracion/importar.mjs scripts/migracion/datos/dueno-<fecha>.json
```

El `user_id` que trae el archivo (el del proyecto viejo) **no se usa para
nada**: cada RPC toma el dueño de `auth.uid()`, es decir de quien firma
`TOKEN` — así es como se reasigna la propiedad, sin tocar ningún campo del
JSON.

El script:

- sube cada registro de `exercise_logs` con `subir_registro_ejercicio` y
  cada fila de `body_weight` con `subir_peso_corporal`, pasando
  `p_editado_en` tal cual del archivo — la escritura condicional de esas
  funciones (ver `sql/006_edicion_cliente.sql` y
  `sql/009_peso_corporal.sql`) decide sola qué se queda, y es lo que hace
  que correr el importador dos veces no duplique nada;
- si una RPC devuelve `aplicado: false` (el servidor ya tenía algo más
  nuevo, por ejemplo por una corrida anterior de este mismo script), lo
  cuenta aparte — no es un error;
- intenta `PATCH` sobre la fila propia de `profiles` para restaurar
  `unidad`; si esa fila todavía no existe (sección 2), avisa y **sigue**
  con los registros — no es motivo para abortar;
- al terminar, vuelve a leer `exercise_logs`, `body_weight` y `profiles`
  del proyecto nuevo (los mismos `select` del exportador) y compara contra
  el bloque `conteos` del archivo. Imprime una tabla `campo | origen |
  destino | coincide`:

  ```
  campo                     origen        destino       coincide
  exercise_logs             2             2             sí
  body_weight               1             1             sí
  profiles                  1             1             sí
  suma_peso_exercise_logs   60            60            sí
  suma_peso_body_weight     70.5          70.5          sí
  claves_exercise_logs      2 claves      2 claves      sí
  ```

  Cada fila es un campo del bloque `conteos` de la sección 1.3 —
  `exercise_logs`/`body_weight`/`profiles` son cuántas filas hay de cada
  tabla, las dos sumas son de `weight_kg`, y `claves_exercise_logs` compara
  la lista completa de `slot|logged_on` (no solo el conteo): si difiere,
  el script imprime además cuáles claves sobran de un lado o del otro.

- si **cualquier** fila de la tabla dice `NO`, el código de salida es
  distinto de 0 y el mensaje final lo dice explícito. Eso es lo que decide
  si se sigue adelante: con código 0 se pasa a la tarea 6; con cualquier
  otra cosa, **se para ahí y `config.js` no se toca**.

## 4. Cotejo manual de dos slots

Además de la tabla que imprime el importador, en el editor SQL del
proyecto nuevo elige dos `slot` cualquiera del archivo exportado y compara
a mano `weight_kg`, `sets`, `reps` y `completed` contra lo que quedó en
`exercise_logs`. Anota cuáles dos elegiste — es la comprobación de que no
solo los conteos cuadran, sino que el contenido también.

## 5. Al terminar la migración

El archivo bajo `scripts/migracion/datos/` tiene datos reales del dueño.
**Bórralo** en cuanto la migración quede confirmada en el proyecto nuevo
(tabla de cotejo en 0 y cotejo manual de la sección 4 hechos); no tiene por
qué sobrevivir a la migración.
