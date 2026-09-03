# Entrega 2 — Supabase: plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usa `superpowers:subagent-driven-development` (recomendado) o `superpowers:executing-plans` para ejecutar tarea por tarea. Los pasos usan casillas (`- [ ]`) para seguimiento.

**Meta:** Llevar Registro de Hierro de `localStorage` a Supabase multiusuario con magic link y RLS, sincronizando en segundo plano, sin que la app deje de funcionar sin red.

**Arquitectura:** Local primero. `js/almacen.js` sigue siendo la fuente de verdad inmediata y la app lee siempre de ahí; cada escritura además entra a una cola de pendientes que `js/sync.js` vacía contra Supabase cuando hay red y sesión. `js/db.js` es la única capa que toca la red. La plantilla oficial de rutina vive en la base con `user_id NULL` y un trigger la clona a cada usuario al registrarse.

**Stack:** HTML/CSS/JavaScript con módulos ES nativos, sin bundler. `@supabase/supabase-js` v2 importado como módulo ES desde CDN. Postgres con Row Level Security.

## Restricciones globales

- **Sin paso de build.** GitHub Pages sirve el repo tal cual. Nada de npm en tiempo de ejecución.
- **Módulos ES nativos.** Supabase se importa con `import { createClient } from "https://esm.sh/@supabase/supabase-js@2"`, con la versión fijada.
- **La app funciona sin red y sin sesión.** Perder la conexión nunca puede impedir registrar una serie: el gimnasio es el caso normal, no el excepcional.
- **`js/almacen.js` es el único que toca `localStorage`; `js/db.js` es el único que toca la red.** Ningún otro módulo hace `fetch` ni habla con Supabase.
- **kg es la unidad canónica** en base de datos y en `localStorage`. La libra es solo presentación.
- **La identidad de un registro es el `slot`** (`<dia>:<bloque>:<slug>`, con sufijo `#n` si el slug se repite en el bloque). El `exercise_slug` viaja en cada renglón como hilo conductor, no como identidad.
- **RLS activo en todas las tablas antes de commitear la anon key.** La anon key es pública por diseño, pero solo es segura con políticas puestas.
- **La service_role key nunca entra al repo**, ni en código, ni en SQL, ni en comentarios.
- **Nunca borrar las llaves `hierro:`, `hierro2:` ni `hierro3:`** de `localStorage`.
- **Español** en interfaz, nombres de archivo, pruebas y mensajes de commit. Comentarios de función en inglés.
- Proyecto Supabase: `https://oakahiwejhzsxccrscmk.supabase.co`, ref `oakahiwejhzsxccrscmk`. La anon key está en `config.local.js`, hoy gitignorado.
- Estado de partida: entrega 1 fusionada en `main`, 132 pruebas en `tests.html`, que deben seguir pasando.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `config.js` | URL y anon key del proyecto. Se commitea junto con las políticas RLS, no antes |
| `sql/001_esquema.sql` | Tablas, llaves e índices |
| `sql/002_rls.sql` | Row Level Security y políticas |
| `sql/003_semilla.sql` | Catálogo de ejercicios y plantilla oficial, generado desde el código |
| `sql/004_clonado.sql` | Trigger que clona la plantilla al registrarse un usuario |
| `scripts/generar-semilla.mjs` | Genera `003` desde `js/catalogo.js` y `js/rutina.js`. No se sirve |
| `js/db.js` | Cliente Supabase. **Única capa que toca la red** |
| `js/auth.js` | Magic link, estado de sesión, cierre de sesión |
| `js/sync.js` | Cola de pendientes → Supabase, reintentos, estado visible |
| `js/sesion-ui.js` | Pantalla de acceso e indicador de sincronización |
| `js/editor-rutina.js` | Edición de la rutina propia |

`js/almacen.js` gana una cola de pendientes y sigue siendo la fuente de verdad
inmediata. `js/render.js` y `js/registro.js` no cambian de contrato.

---

### Tarea 1: Cliente Supabase y prueba de vida

**Archivos:**
- Crear: `config.js`
- Crear: `js/db.js`
- Crear: `js/db.test.js`
- Verificar: `.gitignore` ignora `config.local.js` pero **no** `config.js`. Hoy ya es así; solo confírmalo, no lo modifiques a ciegas.
- Modificar: `tests.html`

**Interfaces:**
- `config.js` produce `SUPABASE_URL` y `SUPABASE_ANON_KEY`.
- `js/db.js` produce:
  - `cliente()` → la instancia de Supabase, creada una sola vez.
  - `hayConfig()` → booleano; `false` si la configuración está ausente o en blanco.
  - `probarConexion()` → `{ok: boolean, detalle: string}`. No lanza.

**Nota de seguridad:** esta tarea **solo crea el cliente**. La anon key se
commitea aquí porque las tareas 2 y 3 (esquema y RLS) van en la misma entrega y
no se sube nada a producción hasta que ambas estén aplicadas. No crees ninguna
tabla en esta tarea.

- [ ] **Paso 1: Escribir la prueba que falla**

Crear `js/db.test.js`:

```javascript
import { test, assertEq } from "./pruebas.js";
import { hayConfig } from "./db.js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../config.js";

test("la configuración está presente y no en blanco", () => {
  assertEq(hayConfig(), true);
});

test("la URL apunta a un proyecto de Supabase", () => {
  assertEq(/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(SUPABASE_URL), true);
});

test("la llave es una anon key, no una service_role", () => {
  const carga = JSON.parse(atob(SUPABASE_ANON_KEY.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
  assertEq(carga.role, "anon");
});
```

Esa última prueba es una red de seguridad real: si alguien pega por error la
service_role key en `config.js`, la suite lo detiene antes del commit.

- [ ] **Paso 2: Correr y verificar que falla**

Agregar `await import("./js/db.test.js");` a `tests.html`, servir con
`python3 -m http.server 8123 --directory .` y abrir `tests.html`.
Esperado: 404 de `config.js`, sin reporte.

- [ ] **Paso 3: Crear la configuración**

Copiar los valores de `config.local.js` (que ya existe, gitignorado) a `config.js`:

```javascript
// Supabase project credentials. The anon key is PUBLIC by design — it only
// grants what Row Level Security allows, and every table has policies (see
// sql/002_rls.sql). The service_role key must never appear in this repo.
export const SUPABASE_URL = "https://oakahiwejhzsxccrscmk.supabase.co";
export const SUPABASE_ANON_KEY = "<la anon key que está en config.local.js>";
```

Confirma con `git check-ignore -v config.js`, que **no** debe dar salida, y con
`git check-ignore -v config.local.js`, que sí debe darla. `config.local.js` se
queda ignorado: es la copia de trabajo.

- [ ] **Paso 4: Escribir el cliente**

Crear `js/db.js`:

```javascript
// The only module that talks to the network. Everything else goes through
// almacen.js (local) and sync.js (queue), so losing connectivity never blocks
// the UI — training happens in a gym basement.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../config.js";

let instancia = null;

export function hayConfig() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export function cliente() {
  if (!hayConfig()) throw new Error("Falta la configuración de Supabase");
  if (!instancia) {
    instancia = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true }
    });
  }
  return instancia;
}

// Liveness probe. Never throws: the caller is UI that must degrade quietly.
export async function probarConexion() {
  if (!hayConfig()) return { ok: false, detalle: "sin configuración" };
  try {
    const { error } = await cliente().from("exercises").select("slug").limit(1);
    if (error) return { ok: false, detalle: error.message };
    return { ok: true, detalle: "conectado" };
  } catch (e) {
    return { ok: false, detalle: String(e && e.message ? e.message : e) };
  }
}
```

- [ ] **Paso 5: Correr y verificar que pasan**

Recargar `tests.html`. Esperado: las 132 previas más las 3 nuevas, 0 fallidas.

`probarConexion()` todavía va a responder `{ok:false}` porque la tabla
`exercises` no existe: eso es correcto en este punto y no debe tener prueba
propia hasta la tarea 3.

- [ ] **Paso 6: Commit**

```bash
git add config.js js/db.js js/db.test.js tests.html
git commit -m "Cliente de Supabase y configuración del proyecto"
```

---

### Tarea 2: Esquema

**Archivos:**
- Crear: `sql/001_esquema.sql`
- Crear: `sql/README.md`

Todo el SQL se aplica a mano desde el editor SQL de Supabase, en orden numérico.
`sql/README.md` debe decirlo, y advertir que los archivos ya aplicados no se
editan: se agrega uno nuevo.

- [ ] **Paso 1: Escribir el esquema**

Crear `sql/001_esquema.sql`:

```sql
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
```

Dos decisiones que hay que respetar:
- `unique (user_id, slot, logged_on)` es lo que hace que reenviar la cola de
  sincronización sea idempotente: el mismo registro llega dos veces y no duplica.
- El índice `exercise_logs_por_slug` existe para las gráficas de la entrega 3,
  que consultan por ejercicio a lo largo del tiempo.

- [ ] **Paso 2: Aplicarlo y verificar**

Abrir el editor SQL del proyecto en supabase.com, pegar el archivo y ejecutarlo.
Luego, en el mismo editor:

```sql
select tablename, rowsecurity from pg_tables where schemaname = 'public' order by tablename;
```

Esperado: las 7 tablas, todas con `rowsecurity = false` **todavía**. La tarea 3
lo activa. Anota la salida en el reporte.

- [ ] **Paso 3: Commit**

```bash
git add sql/001_esquema.sql sql/README.md
git commit -m "Esquema base en Postgres"
```

---

### Tarea 3: Row Level Security

Es la tarea de seguridad de la entrega. Sin esto, la anon key que ya está en el
repo deja las tablas abiertas a cualquiera.

**Archivos:**
- Crear: `sql/002_rls.sql`

- [ ] **Paso 1: Escribir las políticas**

Crear `sql/002_rls.sql`:

```sql
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
```

- [ ] **Paso 2: Aplicarlo y comprobar que de verdad protege**

Ejecutarlo en el editor SQL. Después, verificar **desde fuera**, con la anon key
y sin sesión, que las tablas sensibles no responden:

```bash
KEY="$(grep SUPABASE_ANON_KEY config.js | cut -d'"' -f2)"
URL="https://oakahiwejhzsxccrscmk.supabase.co/rest/v1"
for t in exercise_logs body_weight profiles routines; do
  echo -n "$t sin sesión: "
  curl -s "$URL/$t?select=*&limit=1" -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
  echo
done
```

Esperado: **arreglo vacío `[]` en todas**, nunca datos. Un `[]` aquí significa
que RLS filtró; si alguna devolviera filas, la política está mal y no se sigue
adelante. Pega la salida en el reporte.

Comprobar además que RLS quedó activo:

```sql
select tablename, rowsecurity from pg_tables where schemaname='public' order by tablename;
```

Esperado: `rowsecurity = true` en las 8 tablas.

- [ ] **Paso 3: Commit**

```bash
git add sql/002_rls.sql
git commit -m "Row Level Security en todas las tablas"
```

---

### Tarea 4: Semilla del catálogo y la plantilla oficial

**Archivos:**
- Crear: `scripts/generar-semilla.mjs`
- Crear: `sql/003_semilla.sql` (generado, se commitea)

La semilla **se genera desde el código**, no se escribe a mano: `js/catalogo.js`
tiene los 43 ejercicios y `js/rutina.js` el split de 7 días con sus slots ya
calculados. Transcribirlos a mano garantiza que se desincronicen.

**Interfaces:**
- El script se corre con `node scripts/generar-semilla.mjs > sql/003_semilla.sql`.

- [ ] **Paso 1: Escribir el generador**

Crear `scripts/generar-semilla.mjs`. Debe:
- importar `CATALOGO` de `js/catalogo.js` y `RUTINA` de `js/rutina.js`;
- emitir `insert ... on conflict do update` para `exercises`, de modo que
  re-aplicar la semilla sea idempotente;
- emitir la plantilla oficial: un `routines` con `user_id = null`, sus
  `routine_days`, `routine_blocks` y `routine_exercises`, usando el `slot` que
  ya calcula `js/rutina.js`;
- **escapar las comillas simples** de nombres y notas (`Aducción`, `4×15`, y
  notas con apóstrofes) — un `'` sin escapar rompe el archivo entero;
- emitir todo dentro de una transacción, y borrar la plantilla anterior antes de
  insertar la nueva, para que regenerarla no acumule duplicados.

- [ ] **Paso 2: Generar y revisar**

```bash
node scripts/generar-semilla.mjs > sql/003_semilla.sql
grep -c "insert into exercises" sql/003_semilla.sql
grep -c "insert into routine_exercises" sql/003_semilla.sql
```

Revisa a ojo que los acentos salieron bien y que no hay comillas sin escapar.

- [ ] **Paso 3: Aplicarlo y verificar contra el código**

Ejecutarlo en el editor SQL. Luego, en el mismo editor:

```sql
select (select count(*) from exercises)                                as ejercicios,
       (select count(*) from routine_days   where routine_id =
          (select id from routines where user_id is null))             as dias,
       (select count(*) from routine_exercises re
          join routine_blocks b on b.id = re.block_id
          join routine_days   d on d.id = b.day_id
         where d.routine_id = (select id from routines where user_id is null)) as renglones;
```

Compara contra lo que dice el código:

```bash
node -e 'import("./js/catalogo.js").then(m=>console.log("ejercicios:", m.slugs().length));
         import("./js/rutina.js").then(m=>{
           console.log("dias:", m.RUTINA.length);
           console.log("renglones:", m.RUTINA.flatMap(d=>d.bloques.flatMap(b=>b.ejercicios)).length);
         });'
```

Los tres números deben coincidir. Si no, la semilla perdió algo; no sigas.

- [ ] **Paso 4: Commit**

```bash
git add scripts/generar-semilla.mjs sql/003_semilla.sql
git commit -m "Semilla del catálogo y la plantilla oficial, generada desde el código"
```

---

### Tarea 5: Clonado de la plantilla al registrarse

**Archivos:**
- Crear: `sql/004_clonado.sql`

**Interfaces:**
- Función `clonar_plantilla(uid uuid)` y trigger `on_auth_user_created`.

- [ ] **Paso 1: Escribir la función y el trigger**

Crear `sql/004_clonado.sql`. La función debe:
- ser `security definer` con `set search_path = public`, porque corre en el
  contexto de `auth.users` y tiene que poder escribir saltándose RLS;
- crear el `profiles` del usuario;
- copiar la rutina con `user_id is null` completa: días, bloques y ejercicios,
  conservando `posicion`, `clave` y **el `slot` tal cual**, porque el `slot` es
  la identidad con la que el cliente ya guarda sus registros locales;
- ser idempotente: si el usuario ya tiene rutina, no hacer nada.

El trigger se dispara `after insert on auth.users`.

- [ ] **Paso 2: Aplicarlo y probarlo de verdad**

Ejecutarlo. Después, **crea un usuario de prueba** desde
Authentication → Users → Add user en el panel de Supabase, y verifica:

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

Esperado en el usuario nuevo: `rutinas = 1`, `perfil = 1`, y `renglones` igual
al de la plantilla. Comprueba también que los `slot` clonados son idénticos a
los de la plantilla:

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

Esperado: **0**. Cualquier otro número significa que el clon inventó slots y los
registros del cliente no van a coincidir.

Borra el usuario de prueba al terminar y anota en el reporte que lo hiciste.

- [ ] **Paso 3: Commit**

```bash
git add sql/004_clonado.sql
git commit -m "Clonado de la plantilla oficial al registrarse un usuario"
```

---

### Tarea 6: Acceso por magic link

**Archivos:**
- Crear: `js/auth.js`
- Crear: `js/auth.test.js`
- Crear: `js/sesion-ui.js`
- Modificar: `index.html`, `js/app.js`, `css/estilos.css`, `tests.html`

**Interfaces:**
- `js/auth.js` produce:
  - `sesionActual()` → la sesión o `null`. Lee del cliente, no de la red.
  - `enviarEnlace(correo)` → `{ok, detalle}`. No lanza.
  - `cerrarSesion()` → `{ok, detalle}`.
  - `alCambiarSesion(fn)` → registra un observador; `fn` recibe la sesión o `null`.
  - `correoValido(texto)` → booleano.

**Regla que gobierna esta tarea:** la app **debe seguir siendo usable sin
sesión**. Sin cuenta, funciona exactamente como en la entrega 1, guardando en
`localStorage`. Iniciar sesión es lo que enciende la sincronización, no lo que
habilita la app. Nunca bloquees la rutina detrás de una pantalla de acceso.

- [ ] **Paso 1: Escribir las pruebas que fallan**

Crear `js/auth.test.js`:

```javascript
import { test, assertEq } from "./pruebas.js";
import { correoValido } from "./auth.js";

test("acepta un correo normal", () => {
  assertEq(correoValido("juan@example.com"), true);
});

test("rechaza texto que no es correo", () => {
  for (const malo of ["", "   ", "juan", "juan@", "@example.com", "juan @x.com", "juan@x"]) {
    assertEq(correoValido(malo), false, `debió rechazar: ${JSON.stringify(malo)}`);
  }
});

test("ignora espacios alrededor", () => {
  assertEq(correoValido("  juan@example.com  "), true);
});
```

- [ ] **Paso 2: Correr y verificar que falla**

Agregar `await import("./js/auth.test.js");` a `tests.html`. Esperado: 404.

- [ ] **Paso 3: Implementar `js/auth.js`**

Magic link con `cliente().auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } })`.
Ninguna función lanza: todas devuelven `{ok, detalle}` y la interfaz decide qué
mostrar. `alCambiarSesion` envuelve `onAuthStateChange`.

**No manejes contraseñas.** El magic link existe precisamente para que no haya
ninguna que teclear ni que guardar.

- [ ] **Paso 4: Implementar `js/sesion-ui.js` y montarlo**

Un bloque discreto en la cabecera, junto al selector kg/lb:
- sin sesión: un campo de correo y un botón "Enviarme el enlace", más una línea
  que explique que sin cuenta todo se guarda solo en este dispositivo;
- tras enviar: "Te mandé un enlace a <correo>. Ábrelo en este mismo dispositivo."
- con sesión: el correo y un botón "Cerrar sesión".

Área táctil mínima 24×24 en todo control. Reutiliza las variables CSS
existentes (`--accent`, `--border`, `--surface`, `--text-dim`).

- [ ] **Paso 5: Verificar en el navegador**

Con el servidor corriendo, comprobar:
1. Sin sesión, la rutina se ve y se puede registrar un peso igual que antes.
2. `correoValido` rechaza basura antes de llamar a la red.
3. Enviar un enlace a tu correo real devuelve `{ok:true}` y **llega el correo**.
4. Abrir el enlace deja la sesión iniciada y la cabecera muestra el correo.
5. Cerrar sesión vuelve al estado inicial **sin borrar** lo que hay en `localStorage`.

Anota en el reporte qué observaste en cada punto. El punto 3 requiere un correo
de verdad; si el proyecto no tiene SMTP configurado, Supabase usa su remitente
de pruebas con límite de envíos — anótalo si topas con él.

- [ ] **Paso 6: Commit**

```bash
git add js/auth.js js/auth.test.js js/sesion-ui.js index.html js/app.js css/estilos.css tests.html
git commit -m "Acceso por enlace mágico, sin contraseñas"
```

---

### Tarea 7: Cola de pendientes

**Archivos:**
- Modificar: `js/almacen.js`
- Crear: `js/cola.test.js`
- Modificar: `tests.html`

**Interfaces:** `js/almacen.js` gana:
- `encolar(operacion)` — `{tipo, entidad, datos, id}`. `id` lo genera el almacén.
- `pendientes()` → arreglo en orden de llegada.
- `quitarPendiente(id)`.
- `LLAVE_COLA` = `"hierro3:cola"`.

`guardarRegistro` y `guardarPreferencias` **encolan además de escribir**.

- [ ] **Paso 1: Escribir las pruebas**

Crear `js/cola.test.js`, con casos para: guardar un registro deja un pendiente;
guardar dos veces el mismo slot y fecha deja **un** pendiente, no dos (se
reemplaza, porque lo que importa es el estado final); `quitarPendiente` quita
solo el suyo; la cola sobrevive a releer desde `localStorage`; una cola con JSON
corrupto se lee como vacía sin tronar; y **si la escritura del registro falla,
no se encola nada** — encolar algo que no se guardó localmente crearía un
fantasma que la app no puede mostrar.

- [ ] **Paso 2: Correr y verificar que fallan**

Agregar el import a `tests.html`. Esperado: falla por funciones inexistentes.

- [ ] **Paso 3: Implementar**

La cola vive en su propia llave. El reemplazo por clave lógica
(`registro:<slot>:<fecha>`) es lo que mantiene la cola corta: entrenas dos horas
tocando el mismo campo y la cola no crece sin límite.

- [ ] **Paso 4: Correr y verificar que pasan**

- [ ] **Paso 5: Commit**

```bash
git add js/almacen.js js/cola.test.js tests.html
git commit -m "Cola de pendientes en el almacén local"
```

---

### Tarea 8: Sincronización

**Archivos:**
- Crear: `js/sync.js`
- Crear: `js/sync.test.js`
- Modificar: `js/app.js`, `js/sesion-ui.js`, `tests.html`

**Interfaces:**
- `sincronizar()` → `{enviados, fallidos, detalle}`. No lanza.
- `estado()` → `"sin-sesion" | "al-dia" | "pendiente" | "sincronizando" | "error"`.
- `alCambiarEstado(fn)`.
- `arrancarAutosync()` — al iniciar sesión, al recuperar red (`online`) y cada
  60 segundos si hay pendientes.

- [ ] **Paso 1: Escribir las pruebas**

Crear `js/sync.test.js` con un doble de `js/db.js` (no toques la red en las
pruebas). Casos: una cola vacía no llama a la red; un pendiente enviado con
éxito se quita de la cola; **un pendiente que falla se queda en la cola** y no
se pierde; sin sesión no se envía nada y el estado es `"sin-sesion"`; reenviar
el mismo pendiente dos veces no duplica en el destino (lo garantiza
`unique (user_id, slot, logged_on)` con `upsert`); y el estado recorre
`pendiente → sincronizando → al-dia`.

- [ ] **Paso 2: Correr y verificar que fallan**

- [ ] **Paso 3: Implementar**

Usa `upsert` con `onConflict: "user_id,slot,logged_on"`. El `user_id` lo pone el
cliente desde la sesión; RLS lo verifica del lado del servidor, así que no se
puede falsificar.

Un envío fallido **no vacía la cola**: se reintenta. Ese es el punto de todo el
diseño local-primero.

- [ ] **Paso 4: Mostrar el estado**

En `js/sesion-ui.js`, un indicador discreto: "Todo sincronizado", "N cambios por
subir", "Sincronizando…", "Sin conexión — se subirá solo". Nunca un modal ni algo
que estorbe: se entrena con el celular en la mano.

- [ ] **Paso 5: Verificar en el navegador**

1. Con sesión, registrar un peso y ver que el indicador pasa a "al día".
2. Confirmarlo en Supabase: `select slot, weight_kg, logged_on from exercise_logs order by updated_at desc limit 5;`
3. Poner el navegador en modo sin conexión (DevTools → Network → Offline),
   registrar dos pesos, comprobar que la app responde igual y el indicador dice
   que hay pendientes.
4. Volver a poner red y ver que se vacía la cola sola.
5. Recargar con pendientes en la cola y ver que no se pierden.

Anota lo observado en cada punto.

- [ ] **Paso 6: Commit**

```bash
git add js/sync.js js/sync.test.js js/app.js js/sesion-ui.js tests.html
git commit -m "Sincronización en segundo plano con reintento"
```

---

### Tarea 9: Traer lo que ya está en la nube

Hasta aquí solo se sube. Falta que al entrar desde otro dispositivo se vea lo
que ya hay.

**Archivos:**
- Modificar: `js/sync.js`, `js/almacen.js`
- Crear: `js/descarga.test.js`
- Modificar: `tests.html`

**Interfaces:** `js/sync.js` gana `descargar()` → `{traidos, detalle}`.

- [ ] **Paso 1: Escribir las pruebas**

Casos: se traen los registros del usuario y quedan legibles por
`historial(slug)` y `registroDe(slot, fecha)`; **un registro local con
pendientes en la cola no se pisa con la versión del servidor** (lo local aún no
subido es más nuevo); un registro que existe en ambos lados se resuelve por
`updated_at`, gana el más reciente; y descargar dos veces no duplica nada.

- [ ] **Paso 2: Correr y verificar que fallan**

- [ ] **Paso 3: Implementar**

`descargar()` corre al iniciar sesión, **después** de vaciar la cola de subida.
Ese orden importa: subir primero evita que el servidor pise lo que registraste
sin red.

- [ ] **Paso 4: Verificar de verdad, con dos navegadores**

1. Inicia sesión y registra un peso en el navegador A.
2. Abre la app en una ventana privada (navegador B), inicia sesión con el mismo
   correo, y comprueba que el peso aparece.
3. Registra otro peso en B, recarga A, y comprueba que también aparece.
4. Con A sin conexión, registra un peso; con B registra otro distinto en el
   mismo slot y fecha; devuelve la red a A y anota **cuál gana y por qué**.

El punto 4 es el caso que rompe estos sistemas. Documenta el resultado real, no
el esperado.

- [ ] **Paso 5: Commit**

```bash
git add js/sync.js js/almacen.js js/descarga.test.js tests.html
git commit -m "Descarga inicial y resolución por fecha de actualización"
```

---

### Tarea 10: Subir el historial local a la cuenta

**Archivos:**
- Modificar: `js/app.js`, `js/sync.js`
- Crear: `js/adopcion.test.js`
- Modificar: `tests.html`

Quien ya usó la app sin cuenta tiene registros en `localStorage` que no
pertenecen a ningún usuario. Al iniciar sesión por primera vez hay que
ofrecerle subirlos.

- [ ] **Paso 1: Escribir las pruebas**

Casos: con registros locales sin subir y sesión nueva, se ofrece la adopción y
se dice **cuántos**; aceptar los encola todos; rechazar no encola nada y **no
los borra**; y no se vuelve a ofrecer una vez resuelto.

- [ ] **Paso 2: Correr y verificar que fallan**

- [ ] **Paso 3: Implementar**

Reutiliza el patrón del aviso de importación que ya existe en `js/app.js` para
el historial de la versión anterior: mismo lugar, mismo tono, y **muestra el
conteo antes de escribir**. Nunca subas nada sin preguntar: son datos que el
usuario creó creyendo que se quedaban en su dispositivo.

- [ ] **Paso 4: Verificar en el navegador**

Con registros locales y sin sesión, inicia sesión y comprueba el aviso, el
conteo, que aceptar los sube, y que rechazar los deja intactos en local.

- [ ] **Paso 5: Commit**

```bash
git add js/app.js js/sync.js js/adopcion.test.js tests.html
git commit -m "Ofrecer subir a la cuenta el historial guardado sin sesión"
```

---

### Tarea 11: Edición de la rutina propia

**Archivos:**
- Crear: `js/editor-rutina.js`
- Crear: `js/editor-rutina.test.js`
- Modificar: `js/render.js`, `js/sync.js`, `css/estilos.css`, `tests.html`

Alcance deliberadamente acotado, según el diseño aprobado: el usuario ajusta su
clon. El constructor de rutinas desde cero es de una fase posterior.

Se puede: cambiar peso objetivo, series y reps de un ejercicio; sustituirlo por
otro del catálogo; reordenarlo dentro de su bloque; y quitarlo.
**No** se puede: crear días ni bloques nuevos.

- [ ] **Paso 1: Escribir las pruebas**

Casos: cambiar el peso objetivo no toca ningún registro histórico; sustituir un
ejercicio **cambia el `slot`**, y hay que decidir y probar explícitamente qué
pasa con los registros del slot viejo — la decisión es **conservarlos**, porque
son entrenamientos que sí ocurrieron; quitar un ejercicio tampoco borra su
historial; y reordenar no cambia ningún `slot` (los slots no dependen del orden,
salvo el sufijo de ocurrencia, que sí hay que recalcular y probar).

- [ ] **Paso 2: Correr y verificar que fallan**

- [ ] **Paso 3: Implementar**

Un modo de edición que se enciende con un botón, para no llenar de controles la
pantalla que se usa entrenando.

- [ ] **Paso 4: Verificar en el navegador**

Editar, recargar y comprobar que persiste; confirmar en Supabase que
`routine_exercises` refleja el cambio y que `exercise_logs` **no perdió filas**.

- [ ] **Paso 5: Commit**

```bash
git add js/editor-rutina.js js/editor-rutina.test.js js/render.js js/sync.js css/estilos.css tests.html
git commit -m "Edición de la rutina propia sin tocar el historial"
```

---

## Cierre de la entrega

- [ ] Todas las pruebas en verde en `tests.html`.
- [ ] Las 8 tablas con `rowsecurity = true`.
- [ ] Sin sesión y sin red, la app sigue registrando series.
- [ ] Con sesión, lo registrado aparece en otro dispositivo.
- [ ] Ninguna consulta sin sesión devuelve datos ajenos (repetir la prueba con
      `curl` de la tarea 3).
- [ ] `config.js` tiene la anon key y **ninguna** service_role key está en el
      repo ni en el historial: `git log -p | grep -c service_role` debe dar 0.
- [ ] README actualizado con el arranque de sesión y el estado de sincronización.

## Nota sobre `body_weight`

La tabla se crea en la tarea 2 pero **ninguna tarea de esta entrega la escribe**:
el registro semanal de peso corporal y su gráfica son de la entrega 3. Se crea
ahora para que el esquema y las políticas queden completos de una sola pasada y
no haya que volver a tocar RLS después.

## Qué queda para la entrega 3

Gráficas con Chart.js: peso y volumen por ejercicio en gráficas apiladas que
comparten eje de fechas, y peso corporal semanal con promedio móvil de 4
semanas. La paleta ya está validada en el spec. El índice
`exercise_logs_por_slug` de la tarea 2 existe para esas consultas.
