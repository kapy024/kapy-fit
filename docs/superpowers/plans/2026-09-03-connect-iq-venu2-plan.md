# Connect IQ para Venu 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un app Connect IQ para el Garmin Venu 2 que registra peso/series/reps por ejercicio y corre el temporizador de descanso, sin sacar el teléfono, sincronizando contra el mismo Supabase que ya usa `kapy-fit`.

**Architecture:** El reloj nunca ve secretos de Supabase. Guarda un `device_token` fijo (compilado en el binario, como `config.local.js` en la web) que intercambia por un JWT corto (1h) contra una Edge Function nueva (`device-token-exchange`). Con ese JWT llama a PostgREST directo: lee `routine_days`/`routine_blocks`/`routine_exercises` (RLS ya existente) y escribe cada serie con la RPC `subir_registro_ejercicio` (RLS + resolución de conflictos ya existente, commit `b70eb1e`). Una cola local en `Storage` + un timer en segundo plano reintentan lo que no salió por falta de conexión — mismo patrón que `js/almacen.js` + `js/sync.js`.

**Tech Stack:** Monkey C / Connect IQ SDK 4.x (reloj), Deno / Supabase Edge Functions (backend), PostgreSQL/PostgREST (ya existente).

## Global Constraints

- MVP es solo el Garmin Venu 2. No navega el catálogo completo, no muestra imágenes/video, no incluye D2 ni Galaxy Watch Ultra (spec §2, §6-7).
- La rutina se lee de Supabase (`routine_days`/`routine_blocks`/`routine_exercises`); nunca se duplica `js/rutina.js` en Monkey C (spec §2).
- El reloj nunca guarda el JWT secret ni la `service_role` key — solo su `device_token` y JWTs de 1h (spec §3).
- Toda escritura de una serie pasa por la RPC `subir_registro_ejercicio` (`sql/006_edicion_cliente.sql`), nunca un insert/upsert directo a `exercise_logs` (spec §4).
- El offline nunca pierde una serie: se encola localmente antes de intentar la red, y se reintenta en segundo plano (spec §5).
- La dev key de Connect IQ es RSA de 4096 bits en DER — 2048 falla la firma.
- `SUPABASE_URL` y la `SUPABASE_ANON_KEY` ya son públicas (`config.js`, protegidas por RLS) y se compilan también en el reloj sin problema; el `device_token` y el JWT secret del edge function NO.

---

## Task 1: Migración `device_tokens`

**Files:**
- Create: `sql/008_device_tokens.sql`

**Interfaces:**
- Produces: tabla `device_tokens(id uuid, user_id uuid, token text unique, label text, revoked_at timestamptz null, creado_en timestamptz)`, cerrada por RLS a cualquier rol de cliente — solo la Edge Function del Task 2 (con `service_role`, que ignora RLS) la lee/escribe.

- [ ] **Step 1: Escribir la migración**

```sql
-- Tokens de dispositivo: le dan a un reloj Connect IQ (u otro cliente sin
-- navegador) una forma de identificarse sin poder hacer el login por magic
-- link. Ver device-token-exchange (supabase/functions) y
-- docs/superpowers/specs/2026-09-03-connect-iq-venu2-design.md §3.
--
-- RLS la deja cerrada a CUALQUIER rol de cliente (anon o authenticated):
-- ni siquiera el propio dueño la lee desde la web. Solo la toca la Edge
-- Function, que usa la service_role key y por lo tanto ignora RLS por
-- completo — las políticas de abajo son una segunda cerradura, no la
-- única, en caso de que algún día se llame con un rol distinto.
create table if not exists device_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  token      text not null unique,
  label      text not null,
  revoked_at timestamptz,
  creado_en  timestamptz not null default now()
);
create index if not exists device_tokens_por_token on device_tokens (token);

alter table device_tokens enable row level security;
-- Sin ninguna política: RLS deniega todo a anon/authenticated. Correcto:
-- esta tabla no tiene lectura ni escritura de cliente en este proyecto.
```

- [ ] **Step 2: Aplicarla en el editor SQL de Supabase**

Pegar el contenido de `sql/008_device_tokens.sql` en el editor SQL del
proyecto (mismo flujo que `sql/001`–`006`, documentado en `sql/README.md`)
y ejecutarlo. Esto **solo lo puede hacer Juan Manuel** — el agente no tiene
acceso al dashboard de Supabase.

Verificación (pegar en el editor SQL después):

```sql
select table_name, row_security from information_schema.tables
 where table_name = 'device_tokens';
-- Esperado: 1 fila, row_security = 'YES'.

select count(*) from pg_policies where tablename = 'device_tokens';
-- Esperado: 0 — a propósito, RLS deniega todo sin políticas.
```

- [ ] **Step 3: Generar el token del Venu 2 y guardar su fila**

Generar un token aleatorio (no hay convención previa en el repo para esto;
un UUID v4 alcanza como valor opaco):

```bash
python3 -c "import uuid; print(uuid.uuid4())"
```

Con ese valor (llamémoslo `<TOKEN>`) y tu propio `user_id` (visible en
Supabase → Authentication → Users), insertar la fila desde el editor SQL
—esto usa el rol del editor, que sí puede saltarse RLS como administrador—:

```sql
insert into device_tokens (user_id, token, label)
values ('<tu-user-id>', '<TOKEN>', 'Venu 2');
```

Guardar `<TOKEN>` aparte (gestor de contraseñas): es lo que el Task 4 va a
compilar dentro del reloj. **No se commitea.**

- [ ] **Step 4: Commit**

```bash
git add sql/008_device_tokens.sql
git commit -m "Tabla device_tokens para autenticar el reloj sin magic link"
```

---

## Task 2: Edge Function `device-token-exchange`

**Files:**
- Create: `supabase/config.toml` (generado por `supabase init`)
- Create: `supabase/functions/device-token-exchange/index.ts`

**Interfaces:**
- Consumes: `device_tokens` (Task 1) vía `service_role`; `SUPABASE_JWT_SECRET`,
  `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` como secretos de la función.
- Produces: `POST /functions/v1/device-token-exchange` — body `{"device_token": "<TOKEN>"}`,
  responde `200 {"access_token": "<jwt>", "expires_in": 3600}` o `401 {"error": "..."}`.
  El Task 9 (`DeviceAuth.mc`) es quien la consume desde el reloj.

- [ ] **Step 1: Instalar el CLI de Supabase y enlazar el proyecto**

```bash
brew install supabase/tap/supabase
supabase --version
```

Expected: imprime una versión (p. ej. `2.x.x`) — confirma que el binario quedó instalado.

```bash
cd /Users/jcapistr/Development/kapy-fit
supabase init
```

Expected: crea `supabase/config.toml` y `supabase/functions/`. Cuando pregunte por
generar tipos de VS Code / IDE, responder que no (no aplica a este repo sin build).

```bash
supabase login
supabase link --project-ref oakahiwejhzsxccrscmk
```

`supabase login` abre el navegador — **esto solo lo puede hacer Juan Manuel**
(requiere su sesión de Supabase). El `project-ref` es el mismo de
`config.js`/`config.local.js` (`oakahiwejhzsxccrscmk`).

- [ ] **Step 2: Escribir la función**

```typescript
// supabase/functions/device-token-exchange/index.ts
//
// Intercambia un device_token (Task 1, sql/008_device_tokens.sql) por un
// JWT de Supabase de corta duración (1h), firmado con el mismo JWT secret
// que usa el resto del proyecto. De ahí en adelante el reloj habla
// directo con PostgREST — ver docs/superpowers/specs/2026-09-03-connect-iq-venu2-design.md §3.
//
// No verifica un JWT de entrada (no lo hay: quien llama es el reloj, sin
// sesión previa) — por eso se despliega con --no-verify-jwt (Task 2, Step 4).
// La única puerta es que el device_token exista en device_tokens y no esté
// revocado.
import { create, getNumericDate } from "https://deno.land/x/djwt@v2.9.1/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const JWT_SECRET = Deno.env.get("SUPABASE_JWT_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

let cachedKey: CryptoKey | null = null;
async function signingKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  cachedKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(JWT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return cachedKey;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), { status: 405 });
  }

  let body: { device_token?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "cuerpo inválido" }), { status: 400 });
  }

  const deviceToken = body.device_token;
  if (typeof deviceToken !== "string" || deviceToken.length === 0) {
    return new Response(JSON.stringify({ error: "falta device_token" }), { status: 400 });
  }

  const { data: fila, error } = await admin
    .from("device_tokens")
    .select("user_id, revoked_at")
    .eq("token", deviceToken)
    .maybeSingle();

  if (error) {
    return new Response(JSON.stringify({ error: "error de base de datos" }), { status: 500 });
  }
  if (!fila || fila.revoked_at !== null) {
    return new Response(JSON.stringify({ error: "token inválido o revocado" }), { status: 401 });
  }

  const jwt = await create(
    { alg: "HS256", typ: "JWT" },
    { aud: "authenticated", role: "authenticated", sub: fila.user_id, exp: getNumericDate(60 * 60) },
    await signingKey(),
  );

  return new Response(JSON.stringify({ access_token: jwt, expires_in: 3600 }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
```

- [ ] **Step 3: Probarla localmente**

```bash
supabase functions serve device-token-exchange --no-verify-jwt --env-file supabase/.env.local
```

(`supabase/.env.local`, gitignorado, con `SUPABASE_JWT_SECRET=<el secret del
proyecto, en Settings → API → JWT Settings>` — **solo Juan Manuel** tiene
acceso a copiarlo del dashboard.)

En otra terminal:

```bash
curl -s -X POST http://localhost:54321/functions/v1/device-token-exchange \
  -H "Content-Type: application/json" \
  -d '{"device_token":"<TOKEN del Task 1>"}'
```

Expected: `{"access_token":"eyJ...","expires_in":3600}`.

```bash
curl -s -X POST http://localhost:54321/functions/v1/device-token-exchange \
  -H "Content-Type: application/json" \
  -d '{"device_token":"token-que-no-existe"}'
```

Expected: `{"error":"token inválido o revocado"}` con status 401.

- [ ] **Step 4: Desplegarla**

```bash
supabase secrets set SUPABASE_JWT_SECRET=<el mismo secret de arriba>
supabase functions deploy device-token-exchange --no-verify-jwt
```

`--no-verify-jwt` es necesario: Supabase por defecto exige un Bearer JWT
válido para invocar cualquier función, pero quien llama a esta es el reloj
*antes* de tener ningún JWT — la única puerta es el `device_token` que la
función valida ella misma.

Verificar contra producción con el mismo `curl` del Step 3 mudando el host a
`https://oakahiwejhzsxccrscmk.functions.supabase.co/device-token-exchange`.

- [ ] **Step 5: Commit**

```bash
git add supabase/config.toml supabase/functions/device-token-exchange/index.ts
git commit -m "Edge Function device-token-exchange: token de reloj -> JWT de 1h"
```

---

## Task 3: Toolchain de Connect IQ y esqueleto que corre

**Files:**
- Create: `connect-iq/venu2/` (generado por el wizard del Task, Step 2 — nombres
  exactos de archivo dependen de la versión del SDK; ajustar las rutas de
  las tareas siguientes si el wizard nombra distinto a lo asumido aquí)
- Create: `connect-iq/venu2/source/HierroVenuApp.mc` (esperado del wizard)
- Modify: `.gitignore` (agregar `connect-iq/venu2/bin/`, `*.der`)

**Interfaces:**
- Produces: un proyecto Connect IQ que compila y muestra algo en el
  simulador del Venu 2 — la base sobre la que los Tasks 4-17 agregan código.
  Nada de este task es automatizable end-to-end: instalar el SDK y verificar
  el simulador requieren una GUI que el agente no controla.

- [ ] **Step 1: Instalar el SDK Manager y el SDK — solo Juan Manuel**

Descargar el Connect IQ SDK Manager desde
[developer.garmin.com/connect-iq/sdk/](https://developer.garmin.com/connect-iq/sdk/),
instalarlo, abrirlo y desde ahí instalar el SDK 4.x más reciente y el
paquete de simulador del **Venu 2**. Instalar también la extensión oficial
"Monkey C" de Garmin en VS Code (requiere Java Runtime 8+, que el instalador
del SDK Manager puede traer o pedir aparte).

Verificar:

```bash
ls "$HOME/Library/Application Support/Garmin/ConnectIQ/Sdks"
```

Expected: al menos un directorio `connectiq-sdk-mac-*` — confirma que el SDK
quedó instalado.

- [ ] **Step 2: Generar la dev key**

```bash
mkdir -p connect-iq
cd connect-iq
openssl genrsa -out developer_key.pem 4096
openssl pkcs8 -topk8 -inform PEM -outform DER -in developer_key.pem -out developer_key.der -nocrypt
rm developer_key.pem
cd ..
```

Expected: `connect-iq/developer_key.der` existe. Este archivo **no se
commitea** (firma cualquier build futuro como viniendo de ti — mismo nivel
de secreto que una llave SSH).

- [ ] **Step 3: Generar el proyecto — solo Juan Manuel (GUI de VS Code)**

En VS Code, con la extensión Monkey C activa: Command Palette →
**"Monkey C: New Project"**. Elegir:
- Nombre del proyecto: `HierroVenu`
- Tipo: **Watch App** (no Watch Face ni Data Field)
- Dispositivo objetivo: `venu2`
- Ruta: `connect-iq/venu2`
- Dev key: apuntar al `connect-iq/developer_key.der` del Step 2

Esto genera `manifest.xml`, `monkey.jungle` y una vista/app inicial —
normalmente `source/HierroVenuApp.mc` (implementa `Application.AppBase`) y
`source/HierroVenuView.mc` (implementa `WatchUi.View`). Si el wizard nombra
los archivos distinto, anotar los nombres reales: los Tasks 15-17 los
modifican por ruta exacta.

- [ ] **Step 4: Compilar y correr en el simulador — solo Juan Manuel**

En VS Code, con `connect-iq/venu2` abierto: botón ▶ ("Run") de la extensión
Monkey C, eligiendo el dispositivo `venu2`. Alternativa por CLI (ajustar la
ruta del SDK a la que imprimió el Step 1):

```bash
export PATH="$HOME/Library/Application Support/Garmin/ConnectIQ/Sdks/connectiq-sdk-mac-<version>/bin:$PATH"
cd connect-iq/venu2
monkeyc -w -y ../developer_key.der -o bin/HierroVenu.prg -f monkey.jungle -d venu2
monkeydo bin/HierroVenu.prg venu2
```

Expected: se abre el simulador del Venu 2 con la vista inicial del wizard
(típicamente un texto "Hello World" o similar). Esto confirma que el
toolchain completo — SDK, dev key, compilador, simulador — funciona antes
de escribir una sola línea de lógica de negocio.

- [ ] **Step 5: Gitignore y commit del esqueleto**

```bash
echo "connect-iq/developer_key.der" >> .gitignore
echo "connect-iq/venu2/bin/" >> .gitignore
```

```bash
git add .gitignore connect-iq/venu2
git commit -m "Esqueleto Connect IQ para el Venu 2: compila y corre en el simulador"
```

---

## Task 4: `Secrets.mc` — el device_token, fuera del repo

**Files:**
- Create: `connect-iq/venu2/source/Secrets.mc.example`
- Create: `connect-iq/venu2/source/Secrets.mc` (no se commitea)
- Modify: `.gitignore`

**Interfaces:**
- Produces: módulo `Secrets` con la constante `Secrets.DEVICE_TOKEN` (String).
  Task 8 (`DeviceAuth.mc`) la consume.

Mismo problema que `config.local.js` en la web (spec §3: "el JWT secret vive
solo como variable de entorno... nunca en el reloj") pero al revés: aquí SÍ
va un secreto compilado en el binario (el `device_token`, no el JWT secret),
así que igual que `config.local.js`, el archivo real queda fuera de git y
solo existe un `.example` con el formato.

- [ ] **Step 1: Escribir la plantilla**

```javascript
// connect-iq/venu2/source/Secrets.mc.example
//
// Copiar a Secrets.mc (gitignorado, igual que config.local.js en la web) y
// pegar el token generado en sql/008_device_tokens.sql Task 1, Step 3.
// Nunca commitear Secrets.mc: cualquiera con ese valor puede pedir un JWT
// de 1h para tu cuenta hasta que borres la fila en device_tokens.
module Secrets {
    const DEVICE_TOKEN = "PEGA-AQUI-EL-TOKEN-DEL-TASK-1";
}
```

- [ ] **Step 2: Crear el archivo real — solo Juan Manuel**

```bash
cp connect-iq/venu2/source/Secrets.mc.example connect-iq/venu2/source/Secrets.mc
```

Editar `connect-iq/venu2/source/Secrets.mc` a mano y pegar el `<TOKEN>` real
guardado en el Task 1, Step 3.

- [ ] **Step 3: Gitignore**

```bash
echo "connect-iq/venu2/source/Secrets.mc" >> .gitignore
```

- [ ] **Step 4: Verificar que compila con el secreto presente**

```bash
cd connect-iq/venu2
monkeyc -w -y ../developer_key.der -o bin/HierroVenu.prg -f monkey.jungle -d venu2
cd ../..
```

Expected: compila sin error `Secrets not found` — confirma que
`Secrets.mc` está en el `source/` que `monkey.jungle` recoge.

- [ ] **Step 5: Commit (solo la plantilla y el gitignore)**

```bash
git add .gitignore connect-iq/venu2/source/Secrets.mc.example
git status --short
```

Confirmar en la salida de `git status` que `connect-iq/venu2/source/Secrets.mc`
(sin `.example`) **no** aparece como `A` (staged) — si aparece, quitarlo del
stage antes de seguir.

```bash
git commit -m "Plantilla de Secrets.mc para el device_token del Venu 2"
```

---

## Task 5: `RestTimer.mc` — parseRestSeconds portado de la web

**Files:**
- Create: `connect-iq/venu2/source/RestTimer.mc`
- Test: `connect-iq/venu2/source/RestTimerTest.mc`

**Interfaces:**
- Produces: `RestTimer.parseRestSeconds(label as String?) as Number?`,
  `RestTimer.formatMMSS(totalSeconds as Number) as String`. El Task 14
  (`RestTimerView.mc`) consume ambas.

Monkey C no tiene regex (confirmado: no existe `Lang.Regex` ni método
`find` con patrones en `String`, solo búsqueda de subcadena literal), así
que el port de `parseRestSeconds` (`js/registro.js`) escanea caracteres a
mano en vez de usar `.match(/\d+/g)`. El comportamiento es idéntico: toma
el ÚLTIMO grupo de dígitos de la etiqueta (el extremo alto de un rango como
"30–45 seg"), multiplica por 60 si aparece "min", y "sin descanso" (en
cualquier mayúscula/minúscula) siempre da `null` antes de mirar números.

- [ ] **Step 1: Escribir las pruebas que fallan**

```javascript
// connect-iq/venu2/source/RestTimerTest.mc
//
// Casos calcados de js/registro.test.js (parseRestSeconds), para que el
// port se comporte exactamente igual que la web frente a las mismas
// etiquetas reales de rutina.js.
import Toybox.Test;

(:test)
function testTomaElExtremoAltoDeUnRango(logger as Toybox.Test.Logger) as Boolean {
    // en dash, no guion: mismo caracter que usa rutina.js ("30–45 seg")
    Toybox.Test.assertEqual(RestTimer.parseRestSeconds("30–45 seg"), 45);
    return true;
}

(:test)
function testSinDescansoNoDaDuracion(logger as Toybox.Test.Logger) as Boolean {
    Toybox.Test.assertEqual(RestTimer.parseRestSeconds("Sin descanso"), null);
    return true;
}

(:test)
function testLeeElNumeroConAclaracionEntreParentesis(logger as Toybox.Test.Logger) as Boolean {
    Toybox.Test.assertEqual(RestTimer.parseRestSeconds("10 seg (entre intervalos)"), 10);
    return true;
}

(:test)
function testConvierteMinutosASegundos(logger as Toybox.Test.Logger) as Boolean {
    Toybox.Test.assertEqual(RestTimer.parseRestSeconds("hasta 1 min continuo"), 60);
    return true;
}

(:test)
function testSinEtiquetaNoDaDuracion(logger as Toybox.Test.Logger) as Boolean {
    Toybox.Test.assertEqual(RestTimer.parseRestSeconds(null), null);
    return true;
}

(:test)
function testFormatMMSSRellenaLosSegundos(logger as Toybox.Test.Logger) as Boolean {
    Toybox.Test.assertEqual(RestTimer.formatMMSS(65), "1:05");
    Toybox.Test.assertEqual(RestTimer.formatMMSS(5), "0:05");
    Toybox.Test.assertEqual(RestTimer.formatMMSS(125), "2:05");
    return true;
}
```

- [ ] **Step 2: Verlas fallar (module RestTimer no existe todavía)**

```bash
cd connect-iq/venu2
monkeyc -w -t -y ../developer_key.der -o bin/Test.prg -f monkey.jungle -d venu2
```

Expected: error de compilación, algo como `Cannot find symbol ':RestTimer'`.

- [ ] **Step 3: Implementación mínima**

```javascript
// connect-iq/venu2/source/RestTimer.mc
//
// Port sin regex (Monkey C no la tiene) de parseRestSeconds (js/registro.js).
// Mismo comportamiento: último grupo de dígitos de la etiqueta, x60 si
// aparece "min", null si aparece "sin descanso" o no hay dígitos.
module RestTimer {

    function parseRestSeconds(label) {
        if (label == null || label.equals("")) {
            return null;
        }
        var s = label.toLower();
        if (s.find("sin descanso") != null) {
            return null;
        }

        var chars = s.toCharArray();
        var lastNumber = null;
        var actual = "";
        var i = 0;
        while (i < chars.size()) {
            var c = chars[i];
            if (c >= '0' && c <= '9') {
                actual = actual + c.toString();
            } else if (!actual.equals("")) {
                lastNumber = actual;
                actual = "";
            }
            i++;
        }
        if (!actual.equals("")) {
            lastNumber = actual;
        }
        if (lastNumber == null) {
            return null;
        }

        var val = lastNumber.toNumber();
        if (s.find("min") != null) {
            val = val * 60;
        }
        return val > 0 ? val : null;
    }

    function formatMMSS(totalSeconds) {
        var m = totalSeconds / 60;
        var sec = totalSeconds % 60;
        var secStr = sec < 10 ? "0" + sec.toString() : sec.toString();
        return m.toString() + ":" + secStr;
    }
}
```

- [ ] **Step 4: Correrlas y verlas pasar**

```bash
monkeyc -w -t -y ../developer_key.der -o bin/Test.prg -f monkey.jungle -d venu2
monkeydo bin/Test.prg venu2 /t
```

Expected: `Ran 6 tests` / `PASSED`. **Nota macOS**: hay un bug conocido del
SDK donde `monkeydo .../t` deja el simulador en blanco en Mac. Si pasa eso,
usar en su lugar la Command Palette de VS Code → **"Monkey C: Run Tests"**
con el proyecto abierto — es la alternativa documentada por la propia
extensión. De aquí en adelante los demás tasks solo dan el comando CLI;
si no imprime resultados, recurrir a esta misma alternativa.

- [ ] **Step 5: Commit**

```bash
cd ../..
git add connect-iq/venu2/source/RestTimer.mc connect-iq/venu2/source/RestTimerTest.mc
git commit -m "RestTimer.mc: parseRestSeconds portado de registro.js sin regex"
```

---

## Task 6: `TimeUtil.mc` — timestamps ISO8601 UTC para `editado_en`

**Files:**
- Create: `connect-iq/venu2/source/TimeUtil.mc`
- Test: `connect-iq/venu2/source/TimeUtilTest.mc`

**Interfaces:**
- Produces: `TimeUtil.isoUtc(moment as Time.Moment) as String`,
  `TimeUtil.nowIsoUtc() as String`, `TimeUtil.hoyIso() as String` (fecha
  local "AAAA-MM-DD", igual semántica que `hoyISO()` en `js/almacen.js` —
  la fecha del entrenamiento es la del reloj del usuario, no UTC). El Task 11
  (`SyncService.mc`, arma `p_editado_en`) y el Task 14 (`ExerciseLogDelegate.mc`,
  sella `editadoEn` y `fecha` al guardar) consumen ambas.

Postgres necesita un `timestamptz` — spec §4 exige que `p_editado_en` sea
la hora en que se **capturó** la serie, no en que se envió (el mismo campo
que `marcaDe()` en `almacen.js`). `Gregorian.utcInfo()` da los campos ya en
UTC, así que arma directo el string sin aritmética de huso horario.

- [ ] **Step 1: Escribir la prueba que falla**

```javascript
// connect-iq/venu2/source/TimeUtilTest.mc
import Toybox.Test;
import Toybox.Time;
import Toybox.Time.Gregorian;

(:test)
function testIsoUtcFormateaFechaCompleta(logger as Toybox.Test.Logger) as Boolean {
    // Gregorian.moment() interpreta cada campo como UTC (documentado);
    // si esta prueba falla con una hora corrida, revisar el reporte de
    // bug del foro de Garmin sobre moment()/info() antes de asumir que
    // TimeUtil.isoUtc está mal.
    var momento = Gregorian.moment({
        :year => 2026, :month => 9, :day => 3,
        :hour => 14, :minute => 5, :second => 9
    });
    Toybox.Test.assertEqual(TimeUtil.isoUtc(momento), "2026-09-03T14:05:09Z");
    return true;
}

(:test)
function testIsoUtcRellenaConCeros(logger as Toybox.Test.Logger) as Boolean {
    var momento = Gregorian.moment({
        :year => 2026, :month => 1, :day => 5,
        :hour => 0, :minute => 3, :second => 7
    });
    Toybox.Test.assertEqual(TimeUtil.isoUtc(momento), "2026-01-05T00:03:07Z");
    return true;
}

(:test)
function testHoyIsoTieneFormatoAAAAMMDD(logger as Toybox.Test.Logger) as Boolean {
    // Sin un reloj simulado no se puede fijar "hoy" en la prueba (igual que
    // hoyISO() en almacen.js, que tampoco se prueba contra una fecha fija) —
    // se verifica la FORMA (10 caracteres, guiones en las posiciones 4 y 7),
    // no un valor exacto.
    var hoy = TimeUtil.hoyIso();
    Toybox.Test.assertEqual(hoy.length(), 10);
    Toybox.Test.assertEqual(hoy.substring(4, 5), "-");
    Toybox.Test.assertEqual(hoy.substring(7, 8), "-");
    return true;
}
```

- [ ] **Step 2: Verla fallar**

```bash
cd connect-iq/venu2
monkeyc -w -t -y ../developer_key.der -o bin/Test.prg -f monkey.jungle -d venu2
```

Expected: `Cannot find symbol ':TimeUtil'`.

- [ ] **Step 3: Implementación mínima**

```javascript
// connect-iq/venu2/source/TimeUtil.mc
//
// ISO8601 en UTC ("2026-09-03T14:05:09Z") — lo que Postgres parsea directo
// como timestamptz. Monkey C no trae un formateador de fechas tipo
// strftime; Number.format("%0Nd") hace el padding de cada campo, y
// Lang.format arma el string final con placeholders $1$..$6$.
module TimeUtil {

    function isoUtc(moment) {
        var info = Toybox.Time.Gregorian.utcInfo(moment, Toybox.Time.FORMAT_SHORT);
        return Toybox.Lang.format(
            "$1$-$2$-$3$T$4$:$5$:$6$Z",
            [
                info.year.format("%04d"),
                info.month.format("%02d"),
                info.day.format("%02d"),
                info.hour.format("%02d"),
                info.min.format("%02d"),
                info.sec.format("%02d")
            ]
        );
    }

    function nowIsoUtc() {
        return isoUtc(Toybox.Time.now());
    }

    // Fecha LOCAL "AAAA-MM-DD" — misma semántica que hoyISO() en
    // almacen.js: el día del entrenamiento es el del reloj del usuario,
    // nunca UTC (a las 23:50 locales no se quiere que cuente para mañana).
    function hoyIso() {
        var info = Toybox.Time.Gregorian.info(Toybox.Time.now(), Toybox.Time.FORMAT_SHORT);
        return Toybox.Lang.format(
            "$1$-$2$-$3$",
            [info.year.format("%04d"), info.month.format("%02d"), info.day.format("%02d")]
        );
    }
}
```

- [ ] **Step 4: Correrla y verla pasar**

```bash
monkeyc -w -t -y ../developer_key.der -o bin/Test.prg -f monkey.jungle -d venu2
monkeydo bin/Test.prg venu2 /t
```

Expected: `Ran 3 tests` / `PASSED` (ver nota macOS del Task 5, Step 4 si el
simulador queda en blanco).

- [ ] **Step 5: Commit**

```bash
cd ../..
git add connect-iq/venu2/source/TimeUtil.mc connect-iq/venu2/source/TimeUtilTest.mc
git commit -m "TimeUtil.mc: timestamps ISO8601 UTC para editado_en"
```

---

## Task 7: `LogQueue.mc` — cola de pendientes en `Storage`

**Files:**
- Create: `connect-iq/venu2/source/LogQueue.mc`
- Test: `connect-iq/venu2/source/LogQueueTest.mc`

**Interfaces:**
- Produces: `LogQueue.encolar(entrada as Dictionary) as String` (asigna y
  devuelve `id`), `LogQueue.pendientes() as Array<Dictionary>`,
  `LogQueue.quitarPendiente(id as String) as Void`,
  `LogQueue._reiniciarParaPruebas() as Void` (solo pruebas).
  `entrada` trae `slot`, `slug`, `fecha`, `pesoKg`, `series`, `reps`,
  `hecho`, `editadoEn` — el Task 14 (`ExerciseLogDelegate.mc`) los
  arma y sella `editadoEn` **antes** de llamar `encolar()` (spec §4: la
  hora de captura, no la de envío). El Task 11 (`SyncService.mc`) drena la
  cola con estos mismos campos hacia `subir_registro_ejercicio`.

Puerto de la cola de `js/almacen.js` (`encolar`/`pendientes`/`quitarPendiente`),
simplificado: la cola de la web maneja tres tipos de operación
(`registro`/`preferencias`/`rutina_bloque`); esta solo maneja una, así que no
hace falta el envoltorio `{tipo, entidad, datos}` — mismo comportamiento de
**reemplazar, no acumular** un pendiente con la misma clave lógica
(`slot`+`fecha`), para que dos guardados del mismo ejercicio en una sesión
dejen un solo pendiente.

- [ ] **Step 1: Escribir las pruebas que fallan**

```javascript
// connect-iq/venu2/source/LogQueueTest.mc
import Toybox.Test;

(:test)
function testEncolarAgregaUnPendiente(logger as Toybox.Test.Logger) as Boolean {
    LogQueue._reiniciarParaPruebas();
    var entrada = {
        "slot" => "dia1:v1:sentadilla", "slug" => "sentadilla", "fecha" => "2026-09-03",
        "pesoKg" => 40, "series" => 4, "reps" => "10", "hecho" => true,
        "editadoEn" => "2026-09-03T10:00:00Z"
    };
    LogQueue.encolar(entrada);
    var cola = LogQueue.pendientes();
    Toybox.Test.assertEqual(cola.size(), 1);
    Toybox.Test.assertEqual(cola[0].get("slug"), "sentadilla");
    return true;
}

(:test)
function testEncolarReemplazaMismaClaveLogica(logger as Toybox.Test.Logger) as Boolean {
    LogQueue._reiniciarParaPruebas();
    var primero = {
        "slot" => "dia1:v1:sentadilla", "slug" => "sentadilla", "fecha" => "2026-09-03",
        "pesoKg" => 40, "series" => 3, "reps" => "10", "hecho" => false,
        "editadoEn" => "2026-09-03T10:00:00Z"
    };
    var segundo = {
        "slot" => "dia1:v1:sentadilla", "slug" => "sentadilla", "fecha" => "2026-09-03",
        "pesoKg" => 42, "series" => 4, "reps" => "10", "hecho" => true,
        "editadoEn" => "2026-09-03T10:05:00Z"
    };
    LogQueue.encolar(primero);
    LogQueue.encolar(segundo);
    var cola = LogQueue.pendientes();
    Toybox.Test.assertEqual(cola.size(), 1);
    Toybox.Test.assertEqual(cola[0].get("pesoKg"), 42);
    return true;
}

(:test)
function testQuitarPendienteLoSaca(logger as Toybox.Test.Logger) as Boolean {
    LogQueue._reiniciarParaPruebas();
    var entrada = {
        "slot" => "dia3:base:sentadilla", "slug" => "sentadilla", "fecha" => "2026-09-03",
        "pesoKg" => 40, "series" => 4, "reps" => "10", "hecho" => true,
        "editadoEn" => "2026-09-03T10:00:00Z"
    };
    var id = LogQueue.encolar(entrada);
    LogQueue.quitarPendiente(id);
    Toybox.Test.assertEqual(LogQueue.pendientes().size(), 0);
    return true;
}
```

- [ ] **Step 2: Verlas fallar**

```bash
cd connect-iq/venu2
monkeyc -w -t -y ../developer_key.der -o bin/Test.prg -f monkey.jungle -d venu2
```

Expected: `Cannot find symbol ':LogQueue'`.

- [ ] **Step 3: Implementación mínima**

```javascript
// connect-iq/venu2/source/LogQueue.mc
//
// Puerto simplificado de la cola de pendientes de almacen.js: un solo tipo
// de operación (registro de una serie), así que sin el envoltorio
// {tipo, entidad, datos} que sí necesita la web. Reemplaza, no acumula, un
// pendiente con la misma clave lógica (slot+fecha) — igual que
// claveLogicaPendiente() en almacen.js.
module LogQueue {
    const STORAGE_KEY = "log_queue";
    const COUNTER_KEY = "log_queue_counter";

    function claveLogica(entrada) {
        return entrada.get("slot") + "|" + entrada.get("fecha");
    }

    function siguienteId() {
        var n = Toybox.Application.Storage.getValue(COUNTER_KEY);
        if (n == null) {
            n = 0;
        }
        n = n + 1;
        Toybox.Application.Storage.setValue(COUNTER_KEY, n);
        return n.toString();
    }

    function encolar(entrada) {
        var cola = pendientes();
        var clave = claveLogica(entrada);
        var sinDuplicado = [];
        var i = 0;
        while (i < cola.size()) {
            if (!claveLogica(cola[i]).equals(clave)) {
                sinDuplicado.add(cola[i]);
            }
            i++;
        }
        entrada.put("id", siguienteId());
        sinDuplicado.add(entrada);
        Toybox.Application.Storage.setValue(STORAGE_KEY, sinDuplicado);
        return entrada.get("id");
    }

    function pendientes() {
        var cola = Toybox.Application.Storage.getValue(STORAGE_KEY);
        if (cola == null) {
            return [];
        }
        return cola;
    }

    function quitarPendiente(id) {
        var cola = pendientes();
        var restante = [];
        var i = 0;
        while (i < cola.size()) {
            if (!cola[i].get("id").equals(id)) {
                restante.add(cola[i]);
            }
            i++;
        }
        Toybox.Application.Storage.setValue(STORAGE_KEY, restante);
    }

    // Solo para LogQueueTest.mc — misma idea que
    // almacen.js's _reiniciarEstadoParaPruebas, ver sync.test.js.
    function _reiniciarParaPruebas() {
        Toybox.Application.Storage.deleteValue(STORAGE_KEY);
        Toybox.Application.Storage.deleteValue(COUNTER_KEY);
    }
}
```

- [ ] **Step 4: Correrlas y verlas pasar**

```bash
monkeyc -w -t -y ../developer_key.der -o bin/Test.prg -f monkey.jungle -d venu2
monkeydo bin/Test.prg venu2 /t
```

Expected: `Ran 3 tests` / `PASSED` (ver nota macOS del Task 5, Step 4).

- [ ] **Step 5: Commit**

```bash
cd ../..
git add connect-iq/venu2/source/LogQueue.mc connect-iq/venu2/source/LogQueueTest.mc
git commit -m "LogQueue.mc: cola de pendientes en Storage, calcada de almacen.js"
```

---

## Task 8: `HttpClient.mc` — envoltorio delgado sobre `makeWebRequest`

**Files:**
- Create: `connect-iq/venu2/source/HttpClient.mc`
- Modify: `connect-iq/venu2/source/HierroVenuApp.mc:onStart` (temporal, revertido en Step 4)

**Interfaces:**
- Produces: `HttpClient.postJson(url as String, headers as Dictionary, body as Dictionary, callback as Method) as Void`,
  `HttpClient.getJson(url as String, headers as Dictionary, callback as Method) as Void`.
  `callback` sigue la firma de `Communications.makeWebRequest`:
  `function(responseCode as Number, data as Dictionary or Array or Null) as Void`.
  Los Tasks 9 (`DeviceAuth.mc`), 10 (`RoutineClient.mc`) y 11 (`SyncService.mc`)
  son quienes lo consumen.

No hay red simulable en el framework de pruebas de Connect IQ (spec §6: las
llamadas reales a `makeWebRequest` "se validan a mano en el simulador"), así
que este task no lleva `(:test)` — su verificación es una llamada real
contra el `device-token-exchange` ya desplegado (Task 2).

- [ ] **Step 1: Implementación**

```javascript
// connect-iq/venu2/source/HttpClient.mc
//
// Envoltorio delgado sobre Communications.makeWebRequest: siempre manda y
// espera JSON. Content-Type va fijo (Communications.makeWebRequest solo
// codifica `body` como JSON si ese header está presente); `headers` son
// cabeceras EXTRA (Authorization, apikey) que cada llamador agrega.
module HttpClient {

    function postJson(url, headers, body, callback) {
        var todasCabeceras = { "Content-Type" => "application/json" };
        var claves = headers.keys();
        var i = 0;
        while (i < claves.size()) {
            todasCabeceras.put(claves[i], headers.get(claves[i]));
            i++;
        }
        var opciones = {
            :method => Toybox.Communications.HTTP_REQUEST_METHOD_POST,
            :headers => todasCabeceras,
            :responseType => Toybox.Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
        };
        Toybox.Communications.makeWebRequest(url, body, opciones, callback);
    }

    function getJson(url, headers, callback) {
        var opciones = {
            :method => Toybox.Communications.HTTP_REQUEST_METHOD_GET,
            :headers => headers,
            :responseType => Toybox.Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
        };
        Toybox.Communications.makeWebRequest(url, {}, opciones, callback);
    }
}
```

- [ ] **Step 2: Compilar (sin pruebas — este módulo no las lleva)**

```bash
cd connect-iq/venu2
monkeyc -w -y ../developer_key.der -o bin/HierroVenu.prg -f monkey.jungle -d venu2
```

Expected: compila sin error.

- [ ] **Step 3: Verificación manual contra el edge function real — solo Juan Manuel**

Agregar temporalmente a `onStart` de `HierroVenuApp.mc` (el que generó el
wizard del Task 3):

```javascript
    function onStart(state) {
        HttpClient.postJson(
            "https://oakahiwejhzsxccrscmk.functions.supabase.co/device-token-exchange",
            {},
            { "device_token" => Secrets.DEVICE_TOKEN },
            method(:onRespuestaDePrueba)
        );
    }

    function onRespuestaDePrueba(responseCode, data) {
        System.println("responseCode: " + responseCode.toString());
        System.println("data: " + data.toString());
    }
```

Ejecutar en el simulador (Task 3, Step 4) y leer la consola de VS Code /
Simulator. Expected: `responseCode: 200` y `data` con la llave
`access_token`.

- [ ] **Step 4: Revertir el cambio temporal**

```bash
git checkout -- connect-iq/venu2/source/HierroVenuApp.mc
```

`HierroVenuApp.mc` recibe su cableado real en el Task 16.

- [ ] **Step 5: Commit**

```bash
git add connect-iq/venu2/source/HttpClient.mc
git commit -m "HttpClient.mc: envoltorio de makeWebRequest para JSON, verificado contra el edge function real"
```

---

## Task 9: `DeviceAuth.mc` — intercambio y caché del JWT corto

**Files:**
- Create: `connect-iq/venu2/source/DeviceAuth.mc`
- Test: `connect-iq/venu2/source/DeviceAuthTest.mc`
- Modify: `connect-iq/venu2/source/HierroVenuApp.mc:onStart` (temporal, revertido en Step 6)

**Interfaces:**
- Consumes: `HttpClient.postJson` (Task 8), `Secrets.DEVICE_TOKEN` (Task 4).
- Produces: `DeviceAuth.getValidJwt(onListo as Method(jwt as String?) as Void) as Void`,
  `DeviceAuth.expirado(exp as Number?, ahora as Number) as Boolean` (pura, con pruebas),
  `DeviceAuth.interpretarRespuesta(responseCode as Number, data as Dictionary?) as Dictionary`
  (pura, con pruebas — spec §6: "parseo de la respuesta de device-token-exchange"),
  `DeviceAuth.invalidar() as Void` (borra el JWT cacheado — uso real, no
  solo de pruebas), `DeviceAuth._reiniciarParaPruebas() as Void`. Los Tasks
  10 (`RoutineClient.mc`) y 11 (`SyncService.mc`) llaman `getValidJwt` antes
  de cualquier request a PostgREST; `SyncService.mc` también llama
  `invalidar()` si PostgREST responde 401 a media cola.

`expirado()` deja **60s de margen**: un JWT a 59 segundos de caducar se
renueva antes de usarlo, no a medio camino de una petición.

- [ ] **Step 1: Escribir la prueba pura que falla**

```javascript
// connect-iq/venu2/source/DeviceAuthTest.mc
import Toybox.Test;

(:test)
function testExpiradoConNullSiempreCaduco(logger as Toybox.Test.Logger) as Boolean {
    Toybox.Test.assertEqual(DeviceAuth.expirado(null, 1000), true);
    return true;
}

(:test)
function testExpiradoDentroDelMargenCuentaComoCaduco(logger as Toybox.Test.Logger) as Boolean {
    // exp=2000, margen=60 -> caduca desde ahora=1940. 1945 ya cae adentro.
    Toybox.Test.assertEqual(DeviceAuth.expirado(2000, 1945), true);
    return true;
}

(:test)
function testExpiradoFueraDelMargenSigueVigente(logger as Toybox.Test.Logger) as Boolean {
    Toybox.Test.assertEqual(DeviceAuth.expirado(2000, 1800), false);
    return true;
}

(:test)
function testInterpretarRespuestaExito(logger as Toybox.Test.Logger) as Boolean {
    var resultado = DeviceAuth.interpretarRespuesta(200, { "access_token" => "eyJabc", "expires_in" => 3600 });
    Toybox.Test.assertEqual(resultado.get("ok"), true);
    Toybox.Test.assertEqual(resultado.get("jwt"), "eyJabc");
    Toybox.Test.assertEqual(resultado.get("expiresIn"), 3600);
    return true;
}

(:test)
function testInterpretarRespuestaTokenRevocado(logger as Toybox.Test.Logger) as Boolean {
    // device-token-exchange (Task 2) responde 401 + {"error": "..."} cuando
    // el device_token no existe o está revocado.
    var resultado = DeviceAuth.interpretarRespuesta(401, { "error" => "token inválido o revocado" });
    Toybox.Test.assertEqual(resultado.get("ok"), false);
    return true;
}

(:test)
function testInterpretarRespuestaErrorDeRed(logger as Toybox.Test.Logger) as Boolean {
    // makeWebRequest entrega responseCode negativo (p. ej. -1, -104...) y
    // data==null cuando no hay conexión — no hay body de error que leer.
    var resultado = DeviceAuth.interpretarRespuesta(-104, null);
    Toybox.Test.assertEqual(resultado.get("ok"), false);
    return true;
}
```

- [ ] **Step 2: Verla fallar**

```bash
cd connect-iq/venu2
monkeyc -w -t -y ../developer_key.der -o bin/Test.prg -f monkey.jungle -d venu2
```

Expected: `Cannot find symbol ':DeviceAuth'`.

- [ ] **Step 3: Implementación**

```javascript
// connect-iq/venu2/source/DeviceAuth.mc
//
// Cachea el JWT de 1h que da device-token-exchange (Task 2) en Storage, y
// lo renueva antes de que caduque. El reloj nunca ve el JWT secret ni la
// service_role key (spec §3) — solo Secrets.DEVICE_TOKEN y este JWT corto.
module DeviceAuth {
    const JWT_KEY = "auth_jwt";
    const EXP_KEY = "auth_jwt_exp";
    const MARGIN_SECONDS = 60;
    const EXCHANGE_URL = "https://oakahiwejhzsxccrscmk.functions.supabase.co/device-token-exchange";

    var _onListoPendiente = null;

    // true si un JWT con expiración `exp` (segundos, mismo reloj que
    // Time.now().value()) ya no sirve en el momento `ahora`, con MARGIN_SECONDS
    // de colchón para no arrancar una llamada con un JWT a punto de caducar.
    function expirado(exp, ahora) {
        if (exp == null) {
            return true;
        }
        return ahora >= (exp - MARGIN_SECONDS);
    }

    // Entrega un JWT vigente por onListo.invoke(jwt) — jwt es null si el
    // intercambio falló (sin conexión, token revocado). Nunca lanza.
    function getValidJwt(onListo) {
        var jwt = Toybox.Application.Storage.getValue(JWT_KEY);
        var exp = Toybox.Application.Storage.getValue(EXP_KEY);
        var ahora = Toybox.Time.now().value();
        if (jwt != null && !expirado(exp, ahora)) {
            onListo.invoke(jwt);
            return;
        }
        _onListoPendiente = onListo;
        HttpClient.postJson(
            EXCHANGE_URL,
            {},
            { "device_token" => Secrets.DEVICE_TOKEN },
            method(:onRespuestaDeIntercambio)
        );
    }

    // Parte PURA de leer la respuesta de device-token-exchange (Task 2):
    // sin Storage, sin invocar ningún callback — solo interpreta
    // (responseCode, data) y devuelve {"ok"=>true, "jwt"=>.., "expiresIn"=>..}
    // o {"ok"=>false}. Separado de onRespuestaDeIntercambio (que sí toca
    // Storage) para poder probar los tres casos (éxito/revocado/sin red)
    // sin una llamada de red real — spec §6 lo pide explícito.
    function interpretarRespuesta(responseCode, data) {
        if (responseCode != 200 || data == null) {
            return { "ok" => false };
        }
        var jwt = data.get("access_token");
        var expiresIn = data.get("expires_in");
        if (jwt == null || expiresIn == null) {
            return { "ok" => false };
        }
        return { "ok" => true, "jwt" => jwt, "expiresIn" => expiresIn };
    }

    function onRespuestaDeIntercambio(responseCode, data) {
        var callback = _onListoPendiente;
        _onListoPendiente = null;
        var resultado = interpretarRespuesta(responseCode, data);
        if (!resultado.get("ok")) {
            callback.invoke(null);
            return;
        }
        Toybox.Application.Storage.setValue(JWT_KEY, resultado.get("jwt"));
        Toybox.Application.Storage.setValue(EXP_KEY, Toybox.Time.now().value() + resultado.get("expiresIn"));
        callback.invoke(resultado.get("jwt"));
    }

    // Borra el JWT cacheado, forzando una renovación en el próximo
    // getValidJwt(). Uso real: SyncService.mc lo llama cuando PostgREST
    // responde 401 a media cola (el JWT caducó entre el getValidJwt() y el
    // envío). No es solo-pruebas — _reiniciarParaPruebas() de abajo
    // reusa esto mismo para no duplicar los dos deleteValue.
    function invalidar() {
        Toybox.Application.Storage.deleteValue(JWT_KEY);
        Toybox.Application.Storage.deleteValue(EXP_KEY);
    }

    function _reiniciarParaPruebas() {
        invalidar();
    }
}
```

- [ ] **Step 4: Correr las pruebas puras y verlas pasar**

```bash
monkeyc -w -t -y ../developer_key.der -o bin/Test.prg -f monkey.jungle -d venu2
monkeydo bin/Test.prg venu2 /t
```

Expected: `Ran 6 tests` / `PASSED` (ver nota macOS del Task 5, Step 4). Este
compilazo también confirma que `method(:onRespuestaDeIntercambio)` es
válido a nivel de módulo — si no lo fuera, `monkeyc` fallaría aquí mismo con
un error de símbolo.

- [ ] **Step 5: Verificación manual del intercambio real — solo Juan Manuel**

Agregar temporalmente a `onStart` de `HierroVenuApp.mc`:

```javascript
    function onStart(state) {
        DeviceAuth.getValidJwt(method(:onJwtDePrueba));
    }

    function onJwtDePrueba(jwt) {
        System.println("jwt 1: " + jwt);
        // Segunda llamada inmediata: debe reusar el caché, no pedir otro.
        DeviceAuth.getValidJwt(method(:onJwtDePrueba2));
    }

    function onJwtDePrueba2(jwt) {
        System.println("jwt 2 (cacheado, debe ser igual al 1): " + jwt);
    }
```

Ejecutar en el simulador. Expected: dos líneas con el mismo JWT no-nulo, y
un solo request visible (la simulación registra las llamadas de red — el
punto es que la segunda no dispara otra petición porque ya estaba en caché).

- [ ] **Step 6: Revertir el cambio temporal**

```bash
git checkout -- connect-iq/venu2/source/HierroVenuApp.mc
```

- [ ] **Step 7: Commit**

```bash
cd ../..
git add connect-iq/venu2/source/DeviceAuth.mc connect-iq/venu2/source/DeviceAuthTest.mc
git commit -m "DeviceAuth.mc: caché y renovación del JWT corto del reloj"
```

---

## Task 10: `RoutineClient.mc` — lee `routine_days`/`routine_blocks`/`routine_exercises`

**Files:**
- Create: `connect-iq/venu2/source/Config.mc`
- Create: `connect-iq/venu2/source/RoutineClient.mc`
- Modify: `connect-iq/venu2/source/HierroVenuApp.mc:onStart` (temporal, revertido en Step 5)

**Interfaces:**
- Consumes: `Config.SUPABASE_URL`, `Config.SUPABASE_ANON_KEY`, `HttpClient.getJson` (Task 8).
- Produces: `RoutineClient.fetchRoutineId(jwt, onListo(id as String?))`,
  `RoutineClient.fetchDays(jwt, routineId, onListo(days as Array?))`,
  `RoutineClient.fetchBlocks(jwt, dayId, onListo(blocks as Array?))`,
  `RoutineClient.fetchExercises(jwt, blockId, onListo(exercises as Array?))`.
  Los Tasks 12 (`DaySelectView.mc`), 13 (`BlockSelectView.mc`) y 14
  (`ExerciseLogView.mc`) consumen las cuatro.

`Config.mc` es nuevo (`SUPABASE_URL`/`SUPABASE_ANON_KEY`, valores **públicos**
— el mismo par que ya está en `config.js`, protegido por RLS, no por
secreto): lo comparten este task y el Task 11 (`SyncService.mc`), así que
vale la pena el archivo compartido en vez de repetir las constantes.

La plantilla oficial de rutina también es visible por RLS (`user_id IS
NULL`, spec/`sql/002_rls.sql`); filtrar `user_id=not.is.null` en
`fetchRoutineId` se queda solo con la rutina ya clonada del usuario
(`sql/004_clonado.sql`), sin tener que decodificar el `sub` del JWT en el
reloj. `fetchExercises` incrusta el nombre del ejercicio con
`exercises(nombre)` (PostgREST sigue la FK `exercise_slug → exercises.slug`)
para no hacer un segundo viaje solo por el nombre a mostrar.

- [ ] **Step 1: `Config.mc`**

```javascript
// connect-iq/venu2/source/Config.mc
//
// Mismos valores públicos que config.js en la web — la anon key no es
// secreta, RLS es lo que protege (ver sql/002_rls.sql y config.js).
module Config {
    const SUPABASE_URL = "https://oakahiwejhzsxccrscmk.supabase.co";
    const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ha2FoaXdlamh6c3hjY3JzY21rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0MDIwOTcsImV4cCI6MjEwMzk3ODA5N30.u8Nra4L09pV3F9umSDNJ-CuGFjCZ5mPD70QaXoJcXSA";
}
```

- [ ] **Step 2: `RoutineClient.mc`**

```javascript
// connect-iq/venu2/source/RoutineClient.mc
//
// Lectura de la rutina ya clonada del usuario, directo contra PostgREST —
// nunca se duplica rutina.js aquí (spec §2). No hay pruebas automáticas
// (llamada de red real); se verifica a mano contra el proyecto real (Step 4).
module RoutineClient {
    var _onListoRoutineId = null;
    var _onListoLista = null;

    function cabeceras(jwt) {
        return {
            "apikey" => Config.SUPABASE_ANON_KEY,
            "Authorization" => "Bearer " + jwt
        };
    }

    function fetchRoutineId(jwt, onListo) {
        _onListoRoutineId = onListo;
        var url = Config.SUPABASE_URL + "/rest/v1/routines?select=id&user_id=not.is.null";
        HttpClient.getJson(url, cabeceras(jwt), method(:onRoutineId));
    }

    function onRoutineId(responseCode, data) {
        var callback = _onListoRoutineId;
        _onListoRoutineId = null;
        if (responseCode != 200 || data == null || data.size() == 0) {
            callback.invoke(null);
            return;
        }
        callback.invoke(data[0].get("id"));
    }

    function fetchDays(jwt, routineId, onListo) {
        _onListoLista = onListo;
        var url = Config.SUPABASE_URL + "/rest/v1/routine_days?routine_id=eq." + routineId
            + "&select=id,clave,etiqueta,enfoque&order=posicion";
        HttpClient.getJson(url, cabeceras(jwt), method(:onLista));
    }

    function fetchBlocks(jwt, dayId, onListo) {
        _onListoLista = onListo;
        var url = Config.SUPABASE_URL + "/rest/v1/routine_blocks?day_id=eq." + dayId
            + "&select=id,clave,etiqueta&order=posicion";
        HttpClient.getJson(url, cabeceras(jwt), method(:onLista));
    }

    function fetchExercises(jwt, blockId, onListo) {
        _onListoLista = onListo;
        var url = Config.SUPABASE_URL + "/rest/v1/routine_exercises?block_id=eq." + blockId
            + "&select=id,slot,exercise_slug,series,reps,descanso,exercises(nombre)&order=posicion";
        HttpClient.getJson(url, cabeceras(jwt), method(:onLista));
    }

    function onLista(responseCode, data) {
        var callback = _onListoLista;
        _onListoLista = null;
        if (responseCode != 200 || data == null) {
            callback.invoke(null);
            return;
        }
        callback.invoke(data);
    }
}
```

- [ ] **Step 3: Compilar**

```bash
cd connect-iq/venu2
monkeyc -w -y ../developer_key.der -o bin/HierroVenu.prg -f monkey.jungle -d venu2
```

Expected: compila sin error.

- [ ] **Step 4: Verificación manual contra el proyecto real — solo Juan Manuel**

Agregar temporalmente a `onStart` de `HierroVenuApp.mc`:

```javascript
    function onStart(state) {
        DeviceAuth.getValidJwt(method(:onJwtParaRutina));
    }

    function onJwtParaRutina(jwt) {
        RoutineClient.fetchRoutineId(jwt, method(:onRoutineIdDePrueba));
    }

    function onRoutineIdDePrueba(routineId) {
        System.println("routineId: " + routineId);
    }
```

Ejecutar en el simulador. Expected: imprime un uuid no-nulo — la fila que
`sql/004_clonado.sql` creó al registrarte. Repetir agregando
`RoutineClient.fetchDays(jwt, routineId, method(:onDiasDePrueba))` (con un
`onDiasDePrueba(dias)` que haga `System.println(dias.size())`) para
confirmar que trae los 7 días.

- [ ] **Step 5: Revertir el cambio temporal**

```bash
git checkout -- connect-iq/venu2/source/HierroVenuApp.mc
```

- [ ] **Step 6: Commit**

```bash
cd ../..
git add connect-iq/venu2/source/Config.mc connect-iq/venu2/source/RoutineClient.mc
git commit -m "RoutineClient.mc: lee routine_days/blocks/exercises de Supabase, sin duplicar rutina.js"
```

---

## Task 11: `SyncService.mc` — drena la cola hacia `subir_registro_ejercicio`

**Files:**
- Create: `connect-iq/venu2/source/SyncService.mc`
- Modify: `connect-iq/venu2/source/HierroVenuApp.mc:onStart` (temporal, revertido en Step 4)

**Interfaces:**
- Consumes: `LogQueue.pendientes`/`quitarPendiente` (Task 7), `DeviceAuth.getValidJwt`/`invalidar`
  (Task 9), `HttpClient.postJson` (Task 8), `Config.*` (Task 10).
- Produces: `SyncService.iniciar() as Void`, `SyncService.drenar() as Void`.
  El Task 16 (`HierroVenuApp.mc`) llama `iniciar()` una vez, al abrir el app.

Reintento **mientras el app está abierto**, no un servicio de sistema para
cuando está cerrado (spec §5 lo dice explícito) — así que es
`Toybox.Timer.Timer`, no `Toybox.Background`: mucho más simple, y sin tocar
`manifest.xml` ni agregar un proceso de segundo plano aparte. Cada entrada
se envía por la **misma RPC que la web**, `subir_registro_ejercicio`, nunca
un insert directo (spec §4); si PostgREST responde `401` a media cola
(el JWT caducó entre pedirlo y usarlo) se invalida el caché y se detiene
este pase — el siguiente pase pide un JWT nuevo.

- [ ] **Step 1: Implementación**

```javascript
// connect-iq/venu2/source/SyncService.mc
//
// Drena LogQueue hacia subir_registro_ejercicio (sql/006_edicion_cliente.sql),
// en orden, un pendiente a la vez — si uno falla, deja el resto encolado
// para el siguiente pase (igual que sync.js: nunca bloquea, nunca lanza).
module SyncService {
    const INTERVALO_MS = 30 * 1000;

    var _timer = null;
    var _enProceso = false;
    var _jwtEnUso = null;
    var _entradaEnUso = null;

    function iniciar() {
        if (_timer == null) {
            _timer = new Toybox.Timer.Timer();
            _timer.start(method(:onTimer), INTERVALO_MS, true);
        }
        drenar();
    }

    function onTimer() {
        drenar();
    }

    function drenar() {
        if (_enProceso) {
            return;
        }
        if (LogQueue.pendientes().size() == 0) {
            return;
        }
        _enProceso = true;
        DeviceAuth.getValidJwt(method(:onJwtParaEnvio));
    }

    function onJwtParaEnvio(jwt) {
        if (jwt == null) {
            _enProceso = false; // sin conexión o token revocado: reintenta el próximo pase
            return;
        }
        enviarSiguiente(jwt);
    }

    function enviarSiguiente(jwt) {
        var cola = LogQueue.pendientes();
        if (cola.size() == 0) {
            _enProceso = false;
            return;
        }
        var entrada = cola[0];
        _jwtEnUso = jwt;
        _entradaEnUso = entrada;
        var url = Config.SUPABASE_URL + "/rest/v1/rpc/subir_registro_ejercicio";
        var body = {
            "p_slot" => entrada.get("slot"),
            "p_slug" => entrada.get("slug"),
            "p_fecha" => entrada.get("fecha"),
            "p_peso" => entrada.get("pesoKg"),
            "p_series" => entrada.get("series"),
            "p_reps" => entrada.get("reps"),
            "p_hecho" => entrada.get("hecho"),
            "p_editado_en" => entrada.get("editadoEn")
        };
        var cabeceras = {
            "apikey" => Config.SUPABASE_ANON_KEY,
            "Authorization" => "Bearer " + jwt
        };
        HttpClient.postJson(url, cabeceras, body, method(:onRespuestaDeEnvio));
    }

    function onRespuestaDeEnvio(responseCode, data) {
        if (responseCode == 200 || responseCode == 201) {
            LogQueue.quitarPendiente(_entradaEnUso.get("id"));
            enviarSiguiente(_jwtEnUso); // sigue con el resto de la cola de inmediato
            return;
        }
        if (responseCode == 401) {
            DeviceAuth.invalidar();
        }
        _enProceso = false;
    }
}
```

- [ ] **Step 2: Compilar**

```bash
cd connect-iq/venu2
monkeyc -w -y ../developer_key.der -o bin/HierroVenu.prg -f monkey.jungle -d venu2
```

Expected: compila sin error.

- [ ] **Step 3: Verificación manual end-to-end — solo Juan Manuel**

Agregar temporalmente a `onStart` de `HierroVenuApp.mc`:

```javascript
    function onStart(state) {
        var entrada = {
            "slot" => "prueba:manual:sentadilla", "slug" => "sentadilla",
            "fecha" => "2026-09-03", "pesoKg" => 11, "series" => 1, "reps" => "1",
            "hecho" => true, "editadoEn" => TimeUtil.nowIsoUtc()
        };
        LogQueue.encolar(entrada);
        SyncService.iniciar();
    }
```

Ejecutar en el simulador y esperar ~5 segundos (o los 30s del timer).
Verificar en el editor SQL de Supabase:

```sql
select slot, weight_kg, editado_en from exercise_logs
 where slot = 'prueba:manual:sentadilla';
-- Esperado: 1 fila, weight_kg = 11.
```

Limpiar después:

```sql
delete from exercise_logs where slot = 'prueba:manual:sentadilla';
```

- [ ] **Step 4: Revertir el cambio temporal**

```bash
git checkout -- connect-iq/venu2/source/HierroVenuApp.mc
```

- [ ] **Step 5: Commit**

```bash
cd ../..
git add connect-iq/venu2/source/SyncService.mc
git commit -m "SyncService.mc: drena LogQueue hacia subir_registro_ejercicio cada 30s"
```

---

## Task 12: `DaySelectView.mc` — pantalla 1, selector de día

**Files:**
- Create: `connect-iq/venu2/source/Nav.mc`
- Create: `connect-iq/venu2/source/DaySelectView.mc`

**Interfaces:**
- Consumes: `RoutineClient.fetchBlocks`/`fetchExercises` (Task 10).
- Produces: clase `DaySelectView` (recibe `dias as Array`, `ultimoDiaClave as String?`
  ya resueltos — no hace su propio fetch), clase `DaySelectDelegate` (recibe
  `jwt`). `Nav.abrirCaptura(jwt, ejercicios as Array) as Void` — único punto
  que abre la pantalla de captura, para no repetirlo en `BlockSelectDelegate`
  (Task 13). El Task 16 (`HierroVenuApp.mc`) construye la primera
  `DaySelectView` una vez que llegan los días.

Se apoya en `WatchUi.Menu2` (el widget de lista estándar del SDK) en vez de
una vista de scroll hecha a mano. "Recordar el último día" (spec §4) no usa
ninguna API de índice preseleccionado — más simple y sin nada que verificar
a ciegas: el último día elegido se reordena al frente de la lista.

- [ ] **Step 1: `Nav.mc`**

```javascript
// connect-iq/venu2/source/Nav.mc
using Toybox.WatchUi;

module Nav {
    // La vista se crea primero y se le pasa al delegate (no al revés): el
    // delegate necesita mutar la MISMA instancia que se está dibujando
    // (ajustarPeso/ajustarSeries/ajustarReps/avanzar en el Task 14), no una
    // copia independiente construida con los mismos argumentos.
    function abrirCaptura(jwt, ejercicios) {
        if (ejercicios == null || ejercicios.size() == 0) {
            return;
        }
        var vista = new ExerciseLogView(ejercicios, 0);
        WatchUi.pushView(vista, new ExerciseLogDelegate(jwt, vista), WatchUi.SLIDE_LEFT);
    }
}
```

- [ ] **Step 2: `DaySelectView.mc`**

```javascript
// connect-iq/venu2/source/DaySelectView.mc
//
// Lista de routine_days (Task 10) vía Menu2. `dias` ya viene resuelto —
// esta vista solo presenta y captura la selección, nunca hace su propio
// fetch (spec §2: una sola fuente de verdad, leída por RoutineClient).
using Toybox.WatchUi;

class DaySelectView extends WatchUi.Menu2 {
    function initialize(dias, ultimoDiaClave) {
        Menu2.initialize({ :title => "¿Qué día?" });
        var ordenados = ordenarConUltimoPrimero(dias, ultimoDiaClave);
        var i = 0;
        while (i < ordenados.size()) {
            var dia = ordenados[i];
            addItem(new WatchUi.MenuItem(dia.get("etiqueta"), dia.get("enfoque"), dia, {}));
            i++;
        }
    }

    function ordenarConUltimoPrimero(dias, ultimoDiaClave) {
        if (ultimoDiaClave == null) {
            return dias;
        }
        var resultado = [];
        var resto = [];
        var i = 0;
        while (i < dias.size()) {
            if (dias[i].get("clave").equals(ultimoDiaClave)) {
                resultado.add(dias[i]);
            } else {
                resto.add(dias[i]);
            }
            i++;
        }
        i = 0;
        while (i < resto.size()) {
            resultado.add(resto[i]);
            i++;
        }
        return resultado;
    }
}

class DaySelectDelegate extends WatchUi.Menu2InputDelegate {
    var _jwt;

    function initialize(jwt) {
        Menu2InputDelegate.initialize();
        _jwt = jwt;
    }

    function onSelect(item) {
        var dia = item.getId();
        Toybox.Application.Storage.setValue("ultimo_dia_clave", dia.get("clave"));
        RoutineClient.fetchBlocks(_jwt, dia.get("id"), method(:onBloques));
    }

    function onBloques(bloques) {
        if (bloques == null) {
            return; // sin conexión: se queda en el selector de día
        }
        if (bloques.size() == 1) {
            // Un solo bloque: salta directo a la captura (spec §4).
            RoutineClient.fetchExercises(_jwt, bloques[0].get("id"), method(:onEjerciciosDirecto));
            return;
        }
        WatchUi.pushView(
            new BlockSelectView(bloques),
            new BlockSelectDelegate(_jwt),
            WatchUi.SLIDE_LEFT
        );
    }

    function onEjerciciosDirecto(ejercicios) {
        Nav.abrirCaptura(_jwt, ejercicios);
    }
}
```

- [ ] **Step 3: Compilar**

```bash
cd connect-iq/venu2
monkeyc -w -y ../developer_key.der -o bin/HierroVenu.prg -f monkey.jungle -d venu2
```

Expected: compila sin error (`ExerciseLogView`/`ExerciseLogDelegate`/
`BlockSelectView`/`BlockSelectDelegate` de los Tasks 13-14 todavía no
existen — este compilazo fallará hasta terminarlos; ese fallo es esperado
y se resuelve conforme avanzan los tasks siguientes, no antes).

- [ ] **Step 4: Commit**

```bash
cd ../..
git add connect-iq/venu2/source/Nav.mc connect-iq/venu2/source/DaySelectView.mc
git commit -m "DaySelectView.mc: selector de día vía Menu2, con salto directo si hay un solo bloque"
```

---

## Task 13: `BlockSelectView.mc` — pantalla 2, selector de bloque

**Files:**
- Create: `connect-iq/venu2/source/BlockSelectView.mc`

**Interfaces:**
- Consumes: `RoutineClient.fetchExercises` (Task 10), `Nav.abrirCaptura` (Task 12).
- Produces: clase `BlockSelectView` (recibe `bloques as Array`), clase
  `BlockSelectDelegate` (recibe `jwt`). El Task 12 (`DaySelectDelegate`) la
  empuja cuando el día tiene más de un bloque.

- [ ] **Step 1: Implementación**

```javascript
// connect-iq/venu2/source/BlockSelectView.mc
//
// Solo se llega aquí cuando el día tiene MÁS de un bloque — DaySelectDelegate
// (Task 12) salta directo a la captura si hay uno solo (spec §4).
using Toybox.WatchUi;

class BlockSelectView extends WatchUi.Menu2 {
    function initialize(bloques) {
        Menu2.initialize({ :title => "¿Qué bloque?" });
        var i = 0;
        while (i < bloques.size()) {
            addItem(new WatchUi.MenuItem(bloques[i].get("etiqueta"), null, bloques[i], {}));
            i++;
        }
    }
}

class BlockSelectDelegate extends WatchUi.Menu2InputDelegate {
    var _jwt;

    function initialize(jwt) {
        Menu2InputDelegate.initialize();
        _jwt = jwt;
    }

    function onSelect(item) {
        var bloque = item.getId();
        RoutineClient.fetchExercises(_jwt, bloque.get("id"), method(:onEjercicios));
    }

    function onEjercicios(ejercicios) {
        Nav.abrirCaptura(_jwt, ejercicios);
    }
}
```

- [ ] **Step 2: Compilar**

```bash
cd connect-iq/venu2
monkeyc -w -y ../developer_key.der -o bin/HierroVenu.prg -f monkey.jungle -d venu2
```

Expected: sigue fallando (falta `ExerciseLogView`/`ExerciseLogDelegate`,
Task 14) — esperado.

- [ ] **Step 3: Commit**

```bash
cd ../..
git add connect-iq/venu2/source/BlockSelectView.mc
git commit -m "BlockSelectView.mc: selector de bloque vía Menu2"
```

---

## Task 14: `ExerciseLogView.mc` — pantalla 3, captura por ejercicio

**Files:**
- Create: `connect-iq/venu2/source/ExerciseLogView.mc`
- Create: `connect-iq/venu2/source/ExerciseLogDelegate.mc`
- Test: `connect-iq/venu2/source/RegistroBuilderTest.mc`

**Interfaces:**
- Consumes: `RestTimer.parseRestSeconds` (Task 5), `TimeUtil.nowIsoUtc`/`hoyIso`
  (Task 6), `LogQueue.encolar` (Task 7), `SyncService.drenar` (Task 11),
  `RestTimerView`/`RestTimerDelegate` (Task 15 — este task compila junto con
  ese, igual que pasó con Tasks 12-14 entre sí).
- Produces: clase `ExerciseLogView` con `pesoKg()`/`series()`/`reps()`/
  `ejercicioActual()` (getters), `ajustarPeso`/`ajustarSeries`/`ajustarReps(delta as Number)`
  y `avanzar() as Boolean`; clase `ExerciseLogDelegate`; módulo
  `RegistroBuilder.construirEntrada(ejercicio, pesoKg, series, reps, fecha, editadoEn) as Dictionary`,
  puro (spec §6: "construcción del payload de un registro" — separado de
  `guardar()`, que sí tiene los efectos de `LogQueue.encolar`/`SyncService.drenar`,
  para poder probarlo solo). `Nav.abrirCaptura` (Task 12) construye la vista
  y el delegate.

Tres steppers dibujados a mano (spec §4): Connect IQ no trae un picker de
tres campos independientes listo para usar, y adaptar `WatchUi.Picker` (que
asume un solo valor por pantalla) a esto sería más código que dibujar tres
filas "－ valor ＋" con `Dc.drawText` y capturar el tap por coordenadas. El
peso avanza en pasos de `PASO_KG` (1.25, spec §4: "paso configurable");
series y reps en pasos de 1.

- [ ] **Step 1: Implementación de la vista**

```javascript
// connect-iq/venu2/source/ExerciseLogView.mc
using Toybox.WatchUi;
using Toybox.Graphics;

const PASO_KG = 1.25;

class ExerciseLogView extends WatchUi.View {
    var _ejercicios;
    var _indice;
    var _pesoKg;
    var _series;
    var _reps;

    function initialize(ejercicios, indice) {
        View.initialize();
        _ejercicios = ejercicios;
        _indice = indice;
        reiniciarSteppers();
    }

    // Los steppers siempre arrancan en 0/objetivo, nunca conservan el valor
    // del ejercicio anterior — cada serie es una captura nueva.
    function reiniciarSteppers() {
        var actual = ejercicioActual();
        _pesoKg = 0.0;
        _series = actual.get("series") != null ? actual.get("series") : 0;
        _reps = 0; // "reps" de la rutina es texto libre ("10 der / 15 izq"); no hay un objetivo numérico que precargar
    }

    function ejercicioActual() {
        return _ejercicios[_indice];
    }

    function pesoKg() { return _pesoKg; }
    function series() { return _series; }
    function reps() { return _reps; }

    function ajustarPeso(delta) {
        var nuevo = _pesoKg + (delta * PASO_KG);
        _pesoKg = nuevo > 0 ? nuevo : 0.0;
    }

    function ajustarSeries(delta) {
        var nuevo = _series + delta;
        _series = nuevo > 0 ? nuevo : 0;
    }

    function ajustarReps(delta) {
        var nuevo = _reps + delta;
        _reps = nuevo > 0 ? nuevo : 0;
    }

    // Avanza al siguiente ejercicio del bloque. Si ya era el último, se
    // queda ahí con los steppers reiniciados — el spec no define una
    // pantalla de "bloque terminado"; el botón físico de regreso (que
    // WatchUi maneja solo, sin código nuestro) es la salida.
    function avanzar() {
        if (_indice + 1 >= _ejercicios.size()) {
            reiniciarSteppers();
            return false;
        }
        _indice = _indice + 1;
        reiniciarSteppers();
        return true;
    }

    function onLayout(dc) {
    }

    function onUpdate(dc) {
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.clear();
        var w = dc.getWidth();
        var h = dc.getHeight();
        var nombre = ejercicioActual().get("exercises").get("nombre");
        dc.drawText(w / 2, h * 0.06, Graphics.FONT_SMALL, nombre, Graphics.TEXT_JUSTIFY_CENTER);
        dibujarFila(dc, w, h * 0.30, "Peso (kg)", _pesoKg.format("%.2f"));
        dibujarFila(dc, w, h * 0.55, "Series", _series.toString());
        dibujarFila(dc, w, h * 0.78, "Reps", _reps.toString());
        dc.drawText(w / 2, h * 0.92, Graphics.FONT_SMALL, "Guardar", Graphics.TEXT_JUSTIFY_CENTER);
    }

    function dibujarFila(dc, w, y, etiqueta, valor) {
        dc.drawText(w * 0.5, y - 24, Graphics.FONT_XTINY, etiqueta, Graphics.TEXT_JUSTIFY_CENTER);
        dc.drawText(w * 0.15, y, Graphics.FONT_LARGE, "－", Graphics.TEXT_JUSTIFY_CENTER);
        dc.drawText(w * 0.5, y, Graphics.FONT_MEDIUM, valor, Graphics.TEXT_JUSTIFY_CENTER);
        dc.drawText(w * 0.85, y, Graphics.FONT_LARGE, "＋", Graphics.TEXT_JUSTIFY_CENTER);
    }
}
```

- [ ] **Step 2: Escribir la prueba que falla, para el builder puro**

```javascript
// connect-iq/venu2/source/RegistroBuilderTest.mc
import Toybox.Test;

(:test)
function testConstruirEntradaArmaElPayloadCompleto(logger as Toybox.Test.Logger) as Boolean {
    var ejercicio = { "slot" => "dia3:base:sentadilla", "exercise_slug" => "sentadilla" };
    var entrada = RegistroBuilder.construirEntrada(ejercicio, 42.5, 4, 10, "2026-09-03", "2026-09-03T10:00:00Z");
    Toybox.Test.assertEqual(entrada.get("slot"), "dia3:base:sentadilla");
    Toybox.Test.assertEqual(entrada.get("slug"), "sentadilla");
    Toybox.Test.assertEqual(entrada.get("fecha"), "2026-09-03");
    Toybox.Test.assertEqual(entrada.get("pesoKg"), 42.5);
    Toybox.Test.assertEqual(entrada.get("series"), 4);
    Toybox.Test.assertEqual(entrada.get("reps"), "10");
    Toybox.Test.assertEqual(entrada.get("hecho"), true);
    Toybox.Test.assertEqual(entrada.get("editadoEn"), "2026-09-03T10:00:00Z");
    return true;
}

(:test)
function testConstruirEntradaConvierteRepsANumeroEnTexto(logger as Toybox.Test.Logger) as Boolean {
    // exercise_logs.reps es `text` (spec §4 nota, sql/001_esquema.sql): el
    // stepper trabaja con un Number, pero el payload siempre manda String.
    var ejercicio = { "slot" => "dia3:base:sentadilla", "exercise_slug" => "sentadilla" };
    var entrada = RegistroBuilder.construirEntrada(ejercicio, 0, 0, 0, "2026-09-03", "2026-09-03T10:00:00Z");
    Toybox.Test.assertEqual(entrada.get("reps"), "0");
    return true;
}
```

- [ ] **Step 3: Verla fallar**

```bash
cd connect-iq/venu2
monkeyc -w -t -y ../developer_key.der -o bin/Test.prg -f monkey.jungle -d venu2
```

Expected: `Cannot find symbol ':RegistroBuilder'`.

- [ ] **Step 4: Implementación del builder puro y del delegate**

```javascript
// connect-iq/venu2/source/ExerciseLogDelegate.mc
using Toybox.WatchUi;
using Toybox.System;

// Función pura, sin Storage ni red — separada de guardar() (abajo) para
// poder probarla sola (spec §6: "construcción del payload de un registro").
module RegistroBuilder {
    function construirEntrada(ejercicio, pesoKg, series, reps, fecha, editadoEn) {
        return {
            "slot" => ejercicio.get("slot"),
            "slug" => ejercicio.get("exercise_slug"),
            "fecha" => fecha,
            "pesoKg" => pesoKg,
            "series" => series,
            "reps" => reps.toString(),
            "hecho" => true,
            "editadoEn" => editadoEn
        };
    }
}

class ExerciseLogDelegate extends WatchUi.BehaviorDelegate {
    var _jwt;
    var _view;

    function initialize(jwt, view) {
        BehaviorDelegate.initialize();
        _jwt = jwt;
        _view = view;
    }

    function onTap(clickEvent) {
        var coords = clickEvent.getCoordinates();
        var x = coords[0];
        var y = coords[1];
        var settings = System.getDeviceSettings();
        var w = settings.screenWidth;
        var h = settings.screenHeight;
        var delta = 0;
        if (x < (w * 0.35)) { delta = -1; }
        if (x > (w * 0.65)) { delta = 1; }

        if (enFila(y, h, 0.30)) {
            if (delta != 0) { _view.ajustarPeso(delta); WatchUi.requestUpdate(); }
            return true;
        }
        if (enFila(y, h, 0.55)) {
            if (delta != 0) { _view.ajustarSeries(delta); WatchUi.requestUpdate(); }
            return true;
        }
        if (enFila(y, h, 0.78)) {
            if (delta != 0) { _view.ajustarReps(delta); WatchUi.requestUpdate(); }
            return true;
        }
        if (y > (h * 0.85)) {
            guardar();
            return true;
        }
        return false;
    }

    function enFila(y, h, fraccion) {
        var centro = h * fraccion;
        return y > (centro - 40) && y < (centro + 40);
    }

    // Botón físico arriba/abajo (o swipe vertical en pantalla táctil):
    // salta al siguiente ejercicio SIN registrar nada (spec §4: "Swipe o
    // botón físico para saltar sin registrar").
    function onNextPage() {
        _view.avanzar();
        WatchUi.requestUpdate();
        return true;
    }

    // Encola la serie (con editadoEn sellado AQUÍ, al capturarla — spec §4,
    // nunca al enviarla), pide un intento de envío inmediato, y abre el
    // temporizador de descanso del ejercicio que se acaba de guardar.
    function guardar() {
        var ejercicio = _view.ejercicioActual();
        var entrada = RegistroBuilder.construirEntrada(
            ejercicio, _view.pesoKg(), _view.series(), _view.reps(),
            TimeUtil.hoyIso(), TimeUtil.nowIsoUtc()
        );
        LogQueue.encolar(entrada);
        SyncService.drenar();

        var segundos = RestTimer.parseRestSeconds(ejercicio.get("descanso"));
        _view.avanzar();
        var vistaDescanso = new RestTimerView(segundos);
        WatchUi.pushView(vistaDescanso, new RestTimerDelegate(vistaDescanso), WatchUi.SLIDE_LEFT);
    }
}
```

- [ ] **Step 5: Correr las pruebas del builder y verlas pasar**

```bash
monkeyc -w -t -y ../developer_key.der -o bin/Test.prg -f monkey.jungle -d venu2
monkeydo bin/Test.prg venu2 /t
```

Expected: `Ran 2 tests` / `PASSED` (ver nota macOS del Task 5, Step 4).

- [ ] **Step 6: Compilar el app completa (sin pruebas)**

```bash
monkeyc -w -y ../developer_key.der -o bin/HierroVenu.prg -f monkey.jungle -d venu2
```

Expected: sigue fallando (falta `RestTimerView`/`RestTimerDelegate`, Task 15)
— esperado.

- [ ] **Step 7: Commit**

```bash
cd ../..
git add connect-iq/venu2/source/ExerciseLogView.mc connect-iq/venu2/source/ExerciseLogDelegate.mc connect-iq/venu2/source/RegistroBuilderTest.mc
git commit -m "ExerciseLogView.mc: captura de peso/series/reps con steppers dibujados a mano"
```

---

## Task 15: `RestTimerView.mc` — pantalla 4, temporizador de descanso

**Files:**
- Create: `connect-iq/venu2/source/RestTimerView.mc`

**Interfaces:**
- Consumes: `RestTimer.formatMMSS` (Task 5).
- Produces: clase `RestTimerView` (recibe `segundos as Number?` — `null` para
  "Sin descanso", mismo contrato que `RestTimer.parseRestSeconds`), con
  `esSinDescanso()` y `extender()`; clase `RestTimerDelegate` (recibe la
  vista). `ExerciseLogDelegate.guardar()` (Task 14) la empuja.

Cuenta regresiva con `Toybox.Timer.Timer` (mismo mecanismo que
`SyncService.mc`, Task 11) — no hace falta nada más elaborado para un
segundero de 1Hz. `Attention.vibrate` se llama detrás de un `has :vibrate`
(no todos los Venu tienen motor de vibración habilitado para apps de
terceros; sin ese chequeo, un dispositivo sin soporte lanzaría una
excepción en vez de simplemente no vibrar).

- [ ] **Step 1: Implementación**

```javascript
// connect-iq/venu2/source/RestTimerView.mc
using Toybox.WatchUi;
using Toybox.Graphics;
using Toybox.Attention;
using Toybox.System;

const EXTENSION_SEGUNDOS = 30;

class RestTimerView extends WatchUi.View {
    var _restantes;
    var _sinDescanso;
    var _timer;

    function initialize(segundos) {
        View.initialize();
        _sinDescanso = segundos == null;
        _restantes = segundos == null ? 0 : segundos;
    }

    function esSinDescanso() {
        return _sinDescanso;
    }

    function onShow() {
        if (_sinDescanso) {
            return;
        }
        _timer = new Toybox.Timer.Timer();
        _timer.start(method(:onTick), 1000, true);
    }

    function onHide() {
        if (_timer != null) {
            _timer.stop();
            _timer = null;
        }
    }

    function onTick() {
        _restantes = _restantes - 1;
        if (_restantes <= 0) {
            _timer.stop();
            _timer = null;
            if (Toybox.Attention has :vibrate) {
                Toybox.Attention.vibrate([new Toybox.Attention.VibeProfile(50, 1000)]);
            }
            WatchUi.popView(WatchUi.SLIDE_RIGHT);
            return;
        }
        WatchUi.requestUpdate();
    }

    function extender() {
        _restantes = _restantes + EXTENSION_SEGUNDOS;
        WatchUi.requestUpdate();
    }

    function onUpdate(dc) {
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.clear();
        var w = dc.getWidth();
        var h = dc.getHeight();
        if (_sinDescanso) {
            dc.drawText(w / 2, h / 2, Graphics.FONT_MEDIUM, "Sin descanso", Graphics.TEXT_JUSTIFY_CENTER);
            dc.drawText(w / 2, h * 0.85, Graphics.FONT_XTINY, "toca para continuar", Graphics.TEXT_JUSTIFY_CENTER);
            return;
        }
        dc.drawText(w / 2, h * 0.35, Graphics.FONT_NUMBER_HOT, RestTimer.formatMMSS(_restantes), Graphics.TEXT_JUSTIFY_CENTER);
        dc.drawText(w * 0.25, h * 0.75, Graphics.FONT_TINY, "Cancelar", Graphics.TEXT_JUSTIFY_CENTER);
        dc.drawText(w * 0.75, h * 0.75, Graphics.FONT_TINY, "+30s", Graphics.TEXT_JUSTIFY_CENTER);
    }
}

class RestTimerDelegate extends WatchUi.BehaviorDelegate {
    var _view;

    function initialize(view) {
        BehaviorDelegate.initialize();
        _view = view;
    }

    function onTap(clickEvent) {
        if (_view.esSinDescanso()) {
            WatchUi.popView(WatchUi.SLIDE_RIGHT);
            return true;
        }
        var x = clickEvent.getCoordinates()[0];
        var w = System.getDeviceSettings().screenWidth;
        if (x < (w * 0.5)) {
            WatchUi.popView(WatchUi.SLIDE_RIGHT); // cancelar
        } else {
            _view.extender();
        }
        return true;
    }
}
```

- [ ] **Step 2: Compilar**

```bash
cd connect-iq/venu2
monkeyc -w -y ../developer_key.der -o bin/HierroVenu.prg -f monkey.jungle -d venu2
```

Expected: compila sin error — con esto ya están las 4 pantallas y todo el
árbol de clases del flujo (Tasks 12-15) resuelve entre sí.

- [ ] **Step 3: Commit**

```bash
cd ../..
git add connect-iq/venu2/source/RestTimerView.mc
git commit -m "RestTimerView.mc: cuenta regresiva con vibración, cancelar/extender"
```

---

## Task 16: Cablear `HierroVenuApp.mc` y validar de punta a punta

**Files:**
- Create: `connect-iq/venu2/source/LoadingView.mc`
- Modify: `connect-iq/venu2/source/HierroVenuApp.mc` (el generado por el wizard, Task 3)

**Interfaces:**
- Consumes: todo lo anterior — `DeviceAuth.getValidJwt` (Task 9),
  `RoutineClient.fetchRoutineId`/`fetchDays` (Task 10), `SyncService.iniciar`
  (Task 11), `DaySelectView`/`DaySelectDelegate` (Task 12).
- Produces: la app terminada — este es el último task de código.

`getInitialView()` no puede esperar a una respuesta de red (debe devolver
una vista de inmediato), así que muestra `LoadingView` primero y cambia a
`DaySelectView` con `WatchUi.switchToView()` en cuanto llegan los días —
patrón estándar para arrancar un app con datos remotos en Connect IQ.

- [ ] **Step 1: `LoadingView.mc`**

```javascript
// connect-iq/venu2/source/LoadingView.mc
using Toybox.WatchUi;
using Toybox.Graphics;

class LoadingView extends WatchUi.View {
    function initialize() {
        View.initialize();
    }

    function onUpdate(dc) {
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.clear();
        dc.drawText(dc.getWidth() / 2, dc.getHeight() / 2, Graphics.FONT_MEDIUM, "Cargando…", Graphics.TEXT_JUSTIFY_CENTER);
    }
}
```

- [ ] **Step 2: Cablear `HierroVenuApp.mc`**

Reemplazar el contenido de la clase `AppBase` generada por el wizard
(conservando su nombre real si el wizard no la llamó `HierroVenuApp` — Task 3,
Step 3) por:

```javascript
// connect-iq/venu2/source/HierroVenuApp.mc
using Toybox.Application;
using Toybox.WatchUi;

class HierroVenuApp extends Application.AppBase {
    var _jwtInicial;

    function initialize() {
        AppBase.initialize();
    }

    function getInitialView() {
        return [new LoadingView()];
    }

    function onStart(state) {
        SyncService.iniciar();
        DeviceAuth.getValidJwt(method(:onJwtInicial));
    }

    function onJwtInicial(jwt) {
        if (jwt == null) {
            return; // sin conexión al abrir: SyncService (ya iniciado) reintenta solo
        }
        _jwtInicial = jwt;
        RoutineClient.fetchRoutineId(jwt, method(:onRoutineIdInicial));
    }

    function onRoutineIdInicial(routineId) {
        if (routineId == null) {
            return;
        }
        RoutineClient.fetchDays(_jwtInicial, routineId, method(:onDiasIniciales));
    }

    function onDiasIniciales(dias) {
        if (dias == null) {
            return;
        }
        var ultimoDiaClave = Toybox.Application.Storage.getValue("ultimo_dia_clave");
        WatchUi.switchToView(
            new DaySelectView(dias, ultimoDiaClave),
            new DaySelectDelegate(_jwtInicial),
            WatchUi.SLIDE_IMMEDIATE
        );
    }

    function onStop(state) {
    }
}
```

- [ ] **Step 3: Compilar y correr en el simulador — solo Juan Manuel**

```bash
cd connect-iq/venu2
monkeyc -w -y ../developer_key.der -o bin/HierroVenu.prg -f monkey.jungle -d venu2
monkeydo bin/HierroVenu.prg venu2
```

Expected, en el simulador: "Cargando…" y luego la lista de 7 días reales.
Recorrer el flujo completo: elegir un día con más de un bloque (p. ej. Día 1,
"Brazo 1"/"Brazo 2") y confirmar que sí pide el bloque; elegir un día con un
solo bloque (p. ej. Día 3) y confirmar que salta directo a la captura.
Ajustar peso/series/reps con los steppers, tocar "Guardar", confirmar que
aparece el temporizador de descanso y cuenta regresivo, y que al llegar a
cero regresa solo a la captura (ya en el siguiente ejercicio).

Verificar en el editor SQL de Supabase que la serie de prueba llegó:

```sql
select slot, weight_kg, sets, reps, editado_en from exercise_logs
 order by editado_en desc limit 5;
```

Limpiar la fila de prueba después.

- [ ] **Step 4: Sideload al Venu 2 real y repetir la prueba — solo Juan Manuel**

Conectar el Venu 2 por USB (aparece como un volumen `GARMIN`). Copiar el
`.prg` compilado:

```bash
cp bin/HierroVenu.prg "/Volumes/GARMIN/GARMIN/APPS/HierroVenu.prg"
```

Expulsar el volumen (`diskutil eject /Volumes/GARMIN` o desde Finder) y
esperar a que el reloj termine de sincronizar. Abrir el app desde el menú
de apps del Venu 2 y repetir el mismo recorrido del Step 3 — esta vez con
Bluetooth real hacia el Galaxy S25 Ultra (con Garmin Connect Mobile
corriendo) en vez del simulador. Confirmar además el caso offline (spec
§5): poner el teléfono en modo avión a medio entrenamiento, guardar una
serie, confirmar que **no se pierde** (sigue en pantalla, sin error
bloqueante), y que al reactivar Bluetooth aparece en Supabase dentro de los
~30s del timer de `SyncService`.

- [ ] **Step 5: Commit**

```bash
cd ../..
git add connect-iq/venu2/source/LoadingView.mc connect-iq/venu2/source/HierroVenuApp.mc
git commit -m "Cablea HierroVenuApp: Cargando -> selector de día -> flujo completo"
```
