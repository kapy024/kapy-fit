# Entrega 1 — Fundación: plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usa `superpowers:subagent-driven-development` (recomendado) o `superpowers:executing-plans` para ejecutar tarea por tarea. Los pasos usan casillas (`- [ ]`) para seguimiento.

**Meta:** Reorganizar Registro de Hierro al nuevo split de 7 días con identidades estables por ejercicio, arreglar Google Calendar, agregar demostración visual por ejercicio y selector kg/lb, todo sobre módulos ES sin build y conservando `localStorage`.

**Arquitectura:** Se rompe el `index.html` monolítico en módulos ES nativos con una responsabilidad cada uno. El cambio de fondo es que el almacenamiento deja de ser posicional (`hierro:dia1:_:5`) y pasa a apuntar al **slug del ejercicio**, lo que permite reorganizar el split sin perder historial. Un módulo de migración traduce las llaves viejas a las nuevas. Sin backend todavía: esta entrega no toca Supabase.

**Stack:** HTML/CSS/JavaScript con módulos ES nativos. Sin npm, sin bundler, sin framework. Node solo para el script de descarga de imágenes, que corre una vez y no se sirve.

## Restricciones globales

- **Sin paso de build.** GitHub Pages sirve el repo tal cual. Nada de npm en tiempo de ejecución.
- **Módulos ES nativos:** `<script type="module">` e `import`/`export`. Sin `require`, sin bundler.
- **kg es la unidad canónica** en todo dato almacenado. La libra es solo presentación.
- **Ningún dato se identifica por posición.** Todo registro apunta a `exercise_slug`.
- **El `localStorage` viejo no se borra** en ningún paso de esta entrega.
- **Español** en la interfaz, los nombres de archivo y los mensajes de commit. Comentarios de función en inglés (preferencia del proyecto).
- **Sin dependencias por CDN en esta entrega.** Chart.js entra hasta la entrega 3.
- Estado de partida: `index.html` de 1,327 líneas — `<style>` en 8–530, `<script>` en 551–1327, `DAYS` en 604–758, `V` (mapa de videos) en 555–598.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `index.html` | Cascarón: cabecera, nav, `<main>`, pie. Sin lógica ni estilos en línea |
| `css/estilos.css` | Todo lo que hoy vive en `<style>` (líneas 8–530) |
| `js/app.js` | Arranque y router de pestañas. Único punto de entrada |
| `js/catalogo.js` | Los 43 ejercicios: slug, nombre, video, imágenes. Sin rutina |
| `js/rutina.js` | El split: 7 días → bloques → referencias a slugs. Sin DOM |
| `js/almacen.js` | Lectura y escritura en `localStorage` con llaves por slug |
| `js/migracion.js` | Traduce llaves posicionales viejas a llaves por slug |
| `js/unidades.js` | Conversión y formato kg ⇄ lb |
| `js/calendario.js` | Arma la URL de Google Calendar y el texto `.ics` |
| `js/imagenes.js` | Alterna los dos fotogramas, pausa fuera de pantalla |
| `js/render.js` | Construye el DOM de días, bloques y ejercicios |
| `js/registro.js` | Captura de peso/series/reps, palomita y temporizador |
| `js/pruebas.js` | Micro-framework de aserciones |
| `tests.html` | Corredor de pruebas que se abre en el navegador |
| `data/mapeo-imagenes.json` | slug → nombre en free-exercise-db, curado a mano |
| `data/ejercicios/` | Las dos imágenes por ejercicio |
| `scripts/fetch-imagenes.mjs` | Descarga las imágenes. Se corre una vez, no se sirve |

`js/rutina.js` no importa `js/render.js` ni al revés: los datos no saben cómo se
dibujan. `js/almacen.js` es el único módulo que toca `localStorage`.

---

### Tarea 1: Corredor de pruebas

Sin npm no hay Jest. Se necesita un corredor antes que nada porque las tareas
siguientes son TDD.

**Archivos:**
- Crear: `js/pruebas.js`
- Crear: `tests.html`

**Interfaces:**
- Produce: `test(nombre, fn)`, `assertEq(actual, esperado, mensaje)`, `assertCerca(actual, esperado, tolerancia, mensaje)`, `assertThrows(fn, mensaje)`, `correr()` — todas exportadas desde `js/pruebas.js`.

- [ ] **Paso 1: Escribir el micro-framework**

Crear `js/pruebas.js`:

```javascript
// Minimal browser test runner. No dependencies, no build step.
const casos = [];

export function test(nombre, fn) {
  casos.push({ nombre, fn });
}

export function assertEq(actual, esperado, mensaje) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(esperado);
  if (a !== e) {
    throw new Error(`${mensaje || "assertEq"}: esperaba ${e}, recibió ${a}`);
  }
}

// Tolerance-based equality. Rounding to one decimal makes unit round-trips
// lossy by design, so exact equality is the wrong assertion for them.
export function assertCerca(actual, esperado, tolerancia, mensaje) {
  if (Math.abs(actual - esperado) > tolerancia) {
    throw new Error(`${mensaje || "assertCerca"}: ${actual} no está a ${tolerancia} de ${esperado}`);
  }
}

export function assertThrows(fn, mensaje) {
  let lanzo = false;
  try { fn(); } catch (_) { lanzo = true; }
  if (!lanzo) throw new Error(`${mensaje || "assertThrows"}: no lanzó error`);
}

// Runs every registered case and renders the report into #salida.
export function correr() {
  const salida = document.getElementById("salida");
  let pasaron = 0, fallaron = 0;
  for (const caso of casos) {
    const fila = document.createElement("div");
    try {
      caso.fn();
      fila.textContent = `PASA  ${caso.nombre}`;
      fila.className = "pasa";
      pasaron++;
    } catch (err) {
      fila.textContent = `FALLA ${caso.nombre} — ${err.message}`;
      fila.className = "falla";
      fallaron++;
    }
    salida.appendChild(fila);
  }
  const total = document.createElement("h2");
  total.textContent = `${pasaron} pasaron, ${fallaron} fallaron`;
  total.className = fallaron ? "falla" : "pasa";
  salida.prepend(total);
}
```

- [ ] **Paso 2: Crear el corredor HTML**

Crear `tests.html`:

```html
<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Pruebas — Registro de Hierro</title>
<style>
  body { font-family: ui-monospace, monospace; padding: 24px; line-height: 1.6; }
  .pasa  { color: #1baf7a; }
  .falla { color: #e34948; font-weight: 700; }
</style>
</head>
<body>
<h1>Pruebas</h1>
<div id="salida"></div>
<script type="module">
  import { correr } from "./js/pruebas.js";
  await import("./js/unidades.test.js");
  correr();
</script>
</body>
</html>
```

`js/unidades.test.js` todavía no existe: el paso 3 confirma que el corredor
reporta ese error en vez de quedarse en blanco.

- [ ] **Paso 3: Verificar que falla de forma visible**

Abrir `tests.html` en el navegador con la consola abierta.
Esperado: la consola muestra un 404 de `unidades.test.js` y la página queda sin
reporte. Eso confirma que el corredor depende de los archivos de prueba.

- [ ] **Paso 4: Crear una prueba mínima y verificar que pasa**

Crear `js/unidades.test.js`:

```javascript
import { test, assertEq } from "./pruebas.js";

test("el corredor funciona", () => {
  assertEq(1 + 1, 2);
});
```

Recargar `tests.html`.
Esperado: "1 pasaron, 0 fallaron" y la línea `PASA  el corredor funciona`.

- [ ] **Paso 5: Commit**

```bash
git add js/pruebas.js js/unidades.test.js tests.html
git commit -m "Corredor de pruebas en el navegador, sin dependencias"
```

---

### Tarea 2: Conversión de unidades

**Archivos:**
- Crear: `js/unidades.js`
- Modificar: `js/unidades.test.js` (reemplaza la prueba mínima de la tarea 1)

**Interfaces:**
- Produce:
  - `aKg(valor, unidad)` → número en kg. `unidad` es `"kg"` o `"lb"`.
  - `desdeKg(kg, unidad)` → número en la unidad pedida, redondeado a 1 decimal.
  - `formatear(kg, unidad)` → cadena tipo `"22.5 kg"` o `"49.6 lb"`.
  - `LIBRAS_POR_KG` = `2.20462`.

- [ ] **Paso 1: Escribir las pruebas que fallan**

Reemplazar el contenido de `js/unidades.test.js`:

```javascript
import { test, assertEq, assertCerca, assertThrows } from "./pruebas.js";
import { aKg, desdeKg, formatear } from "./unidades.js";

test("kg a kg no cambia el valor", () => {
  assertEq(aKg(22.5, "kg"), 22.5);
});

test("lb a kg convierte", () => {
  assertEq(aKg(100, "lb"), 45.4);
});

test("kg a lb convierte", () => {
  assertEq(desdeKg(45.4, "lb"), 100.1);
});

test("ida y vuelta conserva el valor dentro de la tolerancia", () => {
  // Redondear a un decimal en cada paso pierde precisión a propósito:
  // 135 lb → 61.2 kg → 134.9 lb. Lo que importa es que no derive más que eso.
  assertCerca(desdeKg(aKg(135, "lb"), "lb"), 135, 0.2);
});

test("formatear agrega la unidad", () => {
  assertEq(formatear(22.5, "kg"), "22.5 kg");
  assertEq(formatear(45.4, "lb"), "100.1 lb");
});

test("formatear quita el decimal cuando es entero", () => {
  assertEq(formatear(20, "kg"), "20 kg");
});

test("cadena vacía o nula devuelve vacío, no NaN", () => {
  assertEq(formatear(null, "kg"), "");
  assertEq(formatear("", "kg"), "");
});

test("una unidad desconocida lanza error", () => {
  assertThrows(() => aKg(10, "piedras"));
});
```

- [ ] **Paso 2: Correr y verificar que fallan**

Abrir `tests.html`.
Esperado: la consola muestra un 404 de `unidades.js` y no se dibuja reporte.

- [ ] **Paso 3: Implementar**

Crear `js/unidades.js`:

```javascript
// Weight unit conversion. Kilograms are canonical everywhere in storage;
// pounds exist only at the presentation layer.
export const LIBRAS_POR_KG = 2.20462;

function validar(unidad) {
  if (unidad !== "kg" && unidad !== "lb") {
    throw new Error(`Unidad desconocida: ${unidad}`);
  }
}

function redondear(n) {
  return Math.round(n * 10) / 10;
}

// Converts a user-entered value in `unidad` into canonical kilograms.
export function aKg(valor, unidad) {
  validar(unidad);
  const n = Number(valor);
  if (!Number.isFinite(n)) return null;
  return unidad === "kg" ? redondear(n) : redondear(n / LIBRAS_POR_KG);
}

// Converts canonical kilograms into the unit the user wants to see.
export function desdeKg(kg, unidad) {
  validar(unidad);
  const n = Number(kg);
  if (!Number.isFinite(n)) return null;
  return unidad === "kg" ? redondear(n) : redondear(n * LIBRAS_POR_KG);
}

// Formats canonical kilograms for display, suppressing a trailing ".0".
export function formatear(kg, unidad) {
  if (kg === null || kg === undefined || kg === "") return "";
  const n = desdeKg(kg, unidad);
  if (n === null) return "";
  const texto = Number.isInteger(n) ? String(n) : n.toFixed(1);
  return `${texto} ${unidad}`;
}
```

- [ ] **Paso 4: Correr y verificar que pasan**

Recargar `tests.html`.
Esperado: "8 pasaron, 0 fallaron".

- [ ] **Paso 5: Commit**

```bash
git add js/unidades.js js/unidades.test.js
git commit -m "Conversión kg/lb con kilogramos como unidad canónica"
```

---

### Tarea 3: Catálogo de ejercicios

Saca los ejercicios del `index.html` a un módulo propio y les da identidad
estable. Aquí entra la aducción de cadera que falta.

**Archivos:**
- Crear: `js/catalogo.js`
- Crear: `js/catalogo.test.js`
- Modificar: `tests.html` (agregar el import)
- Leer: `index.html:555-598` (mapa `V`) y `index.html:604-758` (`DAYS`)

**Interfaces:**
- Produce:
  - `CATALOGO` — objeto `{ [slug]: { nombre, video, imagenInicio, imagenFin } }`. `imagenInicio` e `imagenFin` arrancan en `null`; los llena la tarea 9.
  - `ejercicio(slug)` → la entrada, o lanza error si el slug no existe.
  - `slugs()` → arreglo de todos los slugs.

- [ ] **Paso 1: Escribir las pruebas que fallan**

Crear `js/catalogo.test.js`:

```javascript
import { test, assertEq, assertThrows } from "./pruebas.js";
import { CATALOGO, ejercicio, slugs } from "./catalogo.js";

test("el catálogo tiene 43 ejercicios", () => {
  assertEq(slugs().length, 43);
});

test("existe la aducción de cadera", () => {
  assertEq(ejercicio("aduccion-cadera").nombre, "Aducción de cadera");
});

test("existe la abducción de cadera", () => {
  assertEq(ejercicio("abduccion-cadera").nombre, "Abducción de cadera");
});

test("todo ejercicio tiene nombre", () => {
  for (const slug of slugs()) {
    if (!CATALOGO[slug].nombre) throw new Error(`${slug} sin nombre`);
  }
});

test("solo aduccion-cadera puede no tener video todavía", () => {
  const sinVideo = slugs().filter((s) => !CATALOGO[s].video);
  assertEq(sinVideo, ["aduccion-cadera"]);
});

test("los slugs son minúsculas sin acentos ni espacios", () => {
  for (const slug of slugs()) {
    if (!/^[a-z0-9-]+$/.test(slug)) throw new Error(`slug inválido: ${slug}`);
  }
});

test("un slug inexistente lanza error", () => {
  assertThrows(() => ejercicio("no-existe"));
});
```

- [ ] **Paso 2: Correr y verificar que fallan**

Agregar a `tests.html`, antes de `correr()`:

```javascript
  await import("./js/catalogo.test.js");
```

Abrir `tests.html`. Esperado: 404 de `catalogo.js`, sin reporte.

- [ ] **Paso 3: Implementar**

Crear `js/catalogo.js`. Las 42 entradas existentes se obtienen del mapa `V` en
`index.html:555-598` (que ya trae slug → video) cruzado con los nombres de los
`ex(...)` en `index.html:604-758`. Estructura:

```javascript
// Exercise catalog. The slug is the stable identity used by every stored
// record, so a slug is never renamed once it ships.
export const CATALOGO = {
  "press-pectoral-maquina": {
    nombre: "Press pectoral en máquina",
    video: "https://www.youtube.com/watch?v=-bdEMLuFvGw",
    imagenInicio: null,
    imagenFin: null
  },
  // ... las 41 entradas restantes tomadas de V y DAYS, con la misma forma
  "aduccion-cadera": {
    nombre: "Aducción de cadera",
    video: null,
    imagenInicio: null,
    imagenFin: null
  }
};

export function slugs() {
  return Object.keys(CATALOGO);
}

// Looks up an exercise, failing loudly rather than returning undefined —
// a missing slug is a bug in the routine, not a runtime condition to absorb.
export function ejercicio(slug) {
  const e = CATALOGO[slug];
  if (!e) throw new Error(`Ejercicio desconocido: ${slug}`);
  return e;
}
```

Dos detalles obligatorios:
- `abduccion-cadera` está en `V` pero su nombre en `DAYS` es "Abducción de cadera con máquina"; en el catálogo se normaliza a `"Abducción de cadera"`.
- `aduccion-cadera` es nuevo y no está en `index.html`. **Su `video` va en `null`
  a propósito:** no hay un enlace verificado y no se inventa uno. La interfaz
  simplemente no dibuja el botón "Técnica" cuando `video` es `null`; el ejercicio
  se apoya en su imagen. Cuando el usuario entregue un enlace revisado por él, se
  llena el campo y la prueba de arriba se ajusta a `assertEq(sinVideo, [])`.
- Dos entradas existentes (`puente-gluteo`, `sentadilla-hack`) apuntan a
  musclewiki.com, que responde 403 a peticiones automatizadas. En navegador
  funcionan; no se tocan en esta entrega.

- [ ] **Paso 4: Correr y verificar que pasan**

Recargar `tests.html`. Esperado: "15 pasaron, 0 fallaron".

- [ ] **Paso 5: Commit**

```bash
git add js/catalogo.js js/catalogo.test.js tests.html
git commit -m "Catálogo de ejercicios con slugs estables y alta de aducción de cadera"
```

---

### Tarea 4: El split y sus reglas

Aquí se codifican las reglas del usuario como pruebas. Si alguien reorganiza los
días más adelante y rompe una regla, las pruebas lo detienen.

**Archivos:**
- Crear: `js/rutina.js`
- Crear: `js/rutina.test.js`
- Modificar: `tests.html`
- Leer: `index.html:604-758` para los ejercicios, series, pesos y notas actuales

**Interfaces:**
- Produce:
  - `RUTINA` — arreglo de 7 días. Cada día: `{ clave, etiqueta, enfoque, abdomen, bloques }`. Cada bloque: `{ clave, etiqueta, ejercicios }`. Cada ejercicio: `{ slug, series, reps, pesoKg, descanso, nota }`.
  - `dia(clave)` → el día, o lanza error.
  - `todosLosSlugs()` → arreglo plano y sin repetir de los slugs usados.

Reglas estructurales:
- Un día sin variantes tiene **un solo bloque** con `clave: "base"`, para que el
  render nunca necesite dos caminos.
- `pesoKg` es número o `null`. Nunca cadena, nunca con unidad pegada.
- `series` es número; `reps` es cadena, porque hay valores como `"15–20 seg por lado"`.

- [ ] **Paso 1: Escribir las pruebas que fallan**

Crear `js/rutina.test.js`:

```javascript
import { test, assertEq, assertThrows } from "./pruebas.js";
import { RUTINA, dia, todosLosSlugs } from "./rutina.js";
import { CATALOGO } from "./catalogo.js";

const SLUGS_ABDOMEN = ["crunch", "plancha", "plancha-lateral"];

test("la rutina tiene 7 días", () => {
  assertEq(RUTINA.length, 7);
});

test("los enfoques son los del diseño aprobado", () => {
  assertEq(RUTINA.map((d) => d.enfoque), [
    "Bíceps y tríceps",
    "Core",
    "Pierna",
    "Pecho y hombro",
    "Espalda",
    "Pierna 2",
    "Descanso"
  ]);
});

test("el abdomen va un día sí y un día no, en los pares", () => {
  assertEq(RUTINA.map((d) => d.abdomen), [false, true, false, true, false, true, false]);
});

test("ningún día de abdomen es consecutivo con otro", () => {
  for (let i = 1; i < RUTINA.length; i++) {
    if (RUTINA[i].abdomen && RUTINA[i - 1].abdomen) {
      throw new Error(`días ${i} e ${i + 1} llevan abdomen seguidos`);
    }
  }
});

test("todo día con abdomen incluye al menos un ejercicio de abdomen", () => {
  for (const d of RUTINA) {
    if (!d.abdomen) continue;
    const slugsDia = d.bloques.flatMap((b) => b.ejercicios.map((e) => e.slug));
    if (!slugsDia.some((s) => SLUGS_ABDOMEN.includes(s))) {
      throw new Error(`${d.clave} está marcado con abdomen pero no trae ninguno`);
    }
  }
});

test("todo día de pierna lleva abductores y aductores en cada bloque", () => {
  for (const clave of ["dia3", "dia6"]) {
    for (const b of dia(clave).bloques) {
      const s = b.ejercicios.map((e) => e.slug);
      if (!s.includes("abduccion-cadera")) {
        throw new Error(`${clave}/${b.clave} sin abducción`);
      }
      if (!s.includes("aduccion-cadera")) {
        throw new Error(`${clave}/${b.clave} sin aducción`);
      }
    }
  }
});

test("todo slug usado existe en el catálogo", () => {
  for (const s of todosLosSlugs()) {
    if (!CATALOGO[s]) throw new Error(`la rutina usa un slug fantasma: ${s}`);
  }
});

test("todo día tiene al menos un bloque, salvo el descanso", () => {
  for (const d of RUTINA) {
    if (d.enfoque === "Descanso") continue;
    if (d.bloques.length < 1) throw new Error(`${d.clave} sin bloques`);
  }
});

test("las claves de bloque no se repiten dentro de un día", () => {
  for (const d of RUTINA) {
    const claves = d.bloques.map((b) => b.clave);
    assertEq(claves.length, new Set(claves).size, `${d.clave} repite clave de bloque`);
  }
});

test("pesoKg es número o null, nunca cadena", () => {
  for (const d of RUTINA) {
    for (const b of d.bloques) {
      for (const e of b.ejercicios) {
        if (e.pesoKg !== null && typeof e.pesoKg !== "number") {
          throw new Error(`${e.slug}: pesoKg es ${typeof e.pesoKg}`);
        }
      }
    }
  }
});

test("un día inexistente lanza error", () => {
  assertThrows(() => dia("dia99"));
});
```

- [ ] **Paso 2: Correr y verificar que fallan**

Agregar a `tests.html` antes de `correr()`:

```javascript
  await import("./js/rutina.test.js");
```

Abrir `tests.html`. Esperado: 404 de `rutina.js`, sin reporte.

- [ ] **Paso 3: Implementar**

Crear `js/rutina.js` con esta forma. Los ejercicios de los días 1, 2, 5 y 6 se
toman de `index.html:604-758` (bíceps, core, dorsales y pierna respectivamente);
los días 3 y 4 se rearman según el diseño aprobado.

```javascript
// The 7-day split. Data only: this module knows nothing about the DOM.
// Rules enforced by rutina.test.js — abs on even days, abductor+adductor on
// every leg block. Do not reorganize without re-running the tests.
function ej(slug, series, reps, pesoKg, descanso, nota) {
  return {
    slug,
    series: series ?? null,
    reps: reps ?? null,
    pesoKg: pesoKg ?? null,
    descanso: descanso ?? null,
    nota: nota ?? null
  };
}

export const RUTINA = [
  {
    clave: "dia1", etiqueta: "Día 1", enfoque: "Bíceps y tríceps", abdomen: false,
    bloques: [
      { clave: "v1", etiqueta: "Brazo 1", ejercicios: [ /* de index.html:639-666 */ ] },
      { clave: "v2", etiqueta: "Brazo 2", ejercicios: [ /* de index.html:639-666 */ ] }
    ]
  },
  {
    clave: "dia2", etiqueta: "Día 2", enfoque: "Core", abdomen: true,
    bloques: [
      { clave: "base", etiqueta: "Zona media", ejercicios: [
        ej("crunch", 5, "20", null, "30–45 seg"),
        ej("elevacion-cadera-acostado", 5, "20", null, "30–45 seg"),
        ej("plancha-lateral", 4, "15–20 seg por lado", null, "Sin descanso"),
        ej("plancha", null, "hasta 1 min continuo", null, "10 seg (entre intervalos)",
           "Progresión: 20 seg de trabajo, hasta sostener 1 min continuo")
      ]}
    ]
  },
  {
    clave: "dia3", etiqueta: "Día 3", enfoque: "Pierna", abdomen: false,
    bloques: [
      { clave: "base", etiqueta: "Tren inferior", ejercicios: [
        ej("sentadilla", 4, "10", 20),
        ej("subida-banco", 4, "10", 24),
        ej("peso-muerto-mancuernas", 4, "12", 18),
        ej("abduccion-cadera", 4, "15", null),
        ej("aduccion-cadera", 4, "15", null),
        ej("puente-gluteo", 4, "8", 5)
      ]}
    ]
  },
  {
    clave: "dia4", etiqueta: "Día 4", enfoque: "Pecho y hombro", abdomen: true,
    bloques: [
      { clave: "base", etiqueta: "Empuje", ejercicios: [
        ej("press-pectoral-maquina", 4, "15", 21),
        ej("press-inclinado-barra", 4, "12", null),
        ej("press-mancuernas-plano", 4, "12", null),
        ej("fly-mancuernas", 4, "12", null),
        ej("elevaciones-laterales", 4, "10", null, null, "Pesado, bajada controlada"),
        ej("extension-triceps-polea", 4, "12", 14),
        ej("crunch", 4, "20", null, "30–45 seg")
      ]}
    ]
  },
  {
    clave: "dia5", etiqueta: "Día 5", enfoque: "Espalda", abdomen: false,
    bloques: [ /* las 3 variantes de index.html:667-711 */ ]
  },
  {
    clave: "dia6", etiqueta: "Día 6", enfoque: "Pierna 2", abdomen: true,
    bloques: [ /* las 3 variantes de index.html:712-752, cada una con
                  abduccion-cadera y aduccion-cadera agregados, más
                  ej("plancha", 3, "40 seg", null, "30 seg") al final */ ]
  },
  {
    clave: "dia7", etiqueta: "Día 7", enfoque: "Descanso", abdomen: false,
    bloques: []
  }
];

export function dia(clave) {
  const d = RUTINA.find((x) => x.clave === clave);
  if (!d) throw new Error(`Día desconocido: ${clave}`);
  return d;
}

export function todosLosSlugs() {
  const set = new Set();
  for (const d of RUTINA) {
    for (const b of d.bloques) {
      for (const e of b.ejercicios) set.add(e.slug);
    }
  }
  return [...set];
}
```

Los `/* ... */` son referencias a rangos exactos de `index.html`: hay que copiar
esos ejercicios convirtiendo `"4×15"` en `series: 4, reps: "15"` y `"21 kg"` en
`pesoKg: 21`. La prueba "pesoKg es número o null" atrapa el error de dejarlo como
cadena, y "todo día de pierna lleva abductores y aductores" atrapa el olvido en
cualquiera de las tres variantes del día 6.

- [ ] **Paso 4: Correr y verificar que pasan**

Recargar `tests.html`. Esperado: "26 pasaron, 0 fallaron".

- [ ] **Paso 5: Commit**

```bash
git add js/rutina.js js/rutina.test.js tests.html
git commit -m "Nuevo split de 7 días con las reglas de abdomen y pierna en pruebas"
```

---

### Tarea 5: Almacenamiento por slug

Reemplaza las llaves posicionales por llaves basadas en el slug. Único módulo que
toca `localStorage`.

**Archivos:**
- Crear: `js/almacen.js`
- Crear: `js/almacen.test.js`
- Modificar: `tests.html`

**Interfaces:**
- Produce:
  - `guardarRegistro(slug, { fecha, pesoKg, series, reps, hecho })` — sobrescribe el registro de esa fecha.
  - `historial(slug)` → arreglo ordenado por fecha ascendente.
  - `registroDe(slug, fecha)` → el registro o `null`.
  - `preferencias()` → `{ unidad }`, con `"kg"` por omisión.
  - `guardarPreferencias(prefs)`.
  - `hoyISO()` → `"AAAA-MM-DD"` en hora local.
  - `LLAVE_REGISTROS` = `"hierro2:registros"`, `LLAVE_PREFS` = `"hierro2:prefs"`.

El prefijo es `hierro2:` a propósito: deja intacto el `hierro:` viejo para que la
tarea 6 pueda leerlo y el usuario no pierda nada si algo sale mal.

- [ ] **Paso 1: Escribir las pruebas que fallan**

Crear `js/almacen.test.js`:

```javascript
import { test, assertEq } from "./pruebas.js";
import {
  guardarRegistro, historial, registroDe,
  preferencias, guardarPreferencias, LLAVE_REGISTROS, LLAVE_PREFS
} from "./almacen.js";

function limpiar() {
  localStorage.removeItem(LLAVE_REGISTROS);
  localStorage.removeItem(LLAVE_PREFS);
}

test("historial vacío devuelve arreglo vacío", () => {
  limpiar();
  assertEq(historial("sentadilla"), []);
});

test("guardar y leer un registro", () => {
  limpiar();
  guardarRegistro("sentadilla", { fecha: "2026-09-02", pesoKg: 20, series: 4, reps: "10", hecho: true });
  assertEq(historial("sentadilla").length, 1);
  assertEq(registroDe("sentadilla", "2026-09-02").pesoKg, 20);
});

test("guardar dos veces la misma fecha sobrescribe, no duplica", () => {
  limpiar();
  guardarRegistro("sentadilla", { fecha: "2026-09-02", pesoKg: 20, series: 4, reps: "10", hecho: true });
  guardarRegistro("sentadilla", { fecha: "2026-09-02", pesoKg: 22, series: 4, reps: "10", hecho: true });
  assertEq(historial("sentadilla").length, 1);
  assertEq(registroDe("sentadilla", "2026-09-02").pesoKg, 22);
});

test("el historial sale ordenado por fecha aunque se guarde al revés", () => {
  limpiar();
  guardarRegistro("crunch", { fecha: "2026-09-05", pesoKg: 40, series: 4, reps: "10", hecho: true });
  guardarRegistro("crunch", { fecha: "2026-09-01", pesoKg: 35, series: 4, reps: "10", hecho: true });
  assertEq(historial("crunch").map((r) => r.fecha), ["2026-09-01", "2026-09-05"]);
});

test("los ejercicios no se pisan entre sí", () => {
  limpiar();
  guardarRegistro("sentadilla", { fecha: "2026-09-02", pesoKg: 20, series: 4, reps: "10", hecho: true });
  guardarRegistro("plancha", { fecha: "2026-09-02", pesoKg: null, series: 3, reps: "40 seg", hecho: true });
  assertEq(historial("sentadilla").length, 1);
  assertEq(historial("plancha").length, 1);
});

test("registroDe devuelve null cuando no hay nada esa fecha", () => {
  limpiar();
  assertEq(registroDe("sentadilla", "2026-01-01"), null);
});

test("la unidad por omisión es kg", () => {
  limpiar();
  assertEq(preferencias().unidad, "kg");
});

test("la preferencia de unidad se persiste", () => {
  limpiar();
  guardarPreferencias({ unidad: "lb" });
  assertEq(preferencias().unidad, "lb");
});

test("un JSON corrupto no tumba la app", () => {
  localStorage.setItem(LLAVE_REGISTROS, "{esto no es json");
  assertEq(historial("sentadilla"), []);
  limpiar();
});
```

- [ ] **Paso 2: Correr y verificar que fallan**

Agregar `await import("./js/almacen.test.js");` a `tests.html`.
Abrir. Esperado: 404 de `almacen.js`.

- [ ] **Paso 3: Implementar**

Crear `js/almacen.js`:

```javascript
// The only module that touches localStorage. Records are keyed by exercise
// slug, never by position in a day, so reorganizing the split never orphans
// history. The legacy "hierro:" prefix is left untouched for the importer.
export const LLAVE_REGISTROS = "hierro2:registros";
export const LLAVE_PREFS = "hierro2:prefs";

function leerJSON(llave, porOmision) {
  try {
    const crudo = localStorage.getItem(llave);
    if (!crudo) return porOmision;
    const valor = JSON.parse(crudo);
    return valor ?? porOmision;
  } catch (_) {
    return porOmision;
  }
}

function escribirJSON(llave, valor) {
  try {
    localStorage.setItem(llave, JSON.stringify(valor));
  } catch (_) {
    // Storage full or blocked (private mode). The in-page state stays correct.
  }
}

export function hoyISO() {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

export function historial(slug) {
  const todo = leerJSON(LLAVE_REGISTROS, {});
  const lista = Array.isArray(todo[slug]) ? todo[slug] : [];
  return [...lista].sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export function registroDe(slug, fecha) {
  return historial(slug).find((r) => r.fecha === fecha) ?? null;
}

export function guardarRegistro(slug, registro) {
  const todo = leerJSON(LLAVE_REGISTROS, {});
  const lista = Array.isArray(todo[slug]) ? todo[slug] : [];
  const i = lista.findIndex((r) => r.fecha === registro.fecha);
  if (i >= 0) lista[i] = { ...lista[i], ...registro };
  else lista.push(registro);
  todo[slug] = lista;
  escribirJSON(LLAVE_REGISTROS, todo);
}

export function preferencias() {
  return { unidad: "kg", ...leerJSON(LLAVE_PREFS, {}) };
}

export function guardarPreferencias(prefs) {
  escribirJSON(LLAVE_PREFS, { ...preferencias(), ...prefs });
}
```

- [ ] **Paso 4: Correr y verificar que pasan**

Recargar `tests.html`. Esperado: "35 pasaron, 0 fallaron".

- [ ] **Paso 5: Commit**

```bash
git add js/almacen.js js/almacen.test.js tests.html
git commit -m "Almacenamiento indexado por slug de ejercicio"
```

---

### Tarea 6: Importador del historial viejo

Traduce las llaves posicionales `hierro:<día>:<variante>:<índice>` a slugs. Es la
pieza donde se puede perder información del usuario, así que va con pruebas antes
que nada y **no borra nada**.

**Archivos:**
- Crear: `js/mapa-legado.js`
- Crear: `js/migracion.js`
- Crear: `js/migracion.test.js`
- Modificar: `tests.html`

**Interfaces:**
- `js/mapa-legado.js` produce `MAPA_LEGADO` — `{ "<día>:<variante>": ["slug0", "slug1", ...] }`, el orden exacto del `DAYS` viejo, congelado.
- `js/migracion.js` produce:
  - `analizar()` → `{ encontrados: [{ slug, fecha, pesoKg, series, reps }], huerfanos: [{ llave, motivo }] }`. Solo lee.
  - `importar(encontrados)` → número de registros escritos. Escribe vía `almacen.js`.
  - `hayDatosViejos()` → booleano.

- [ ] **Paso 1: Escribir las pruebas que fallan**

Crear `js/migracion.test.js`:

```javascript
import { test, assertEq } from "./pruebas.js";
import { analizar, importar, hayDatosViejos } from "./migracion.js";
import { historial, LLAVE_REGISTROS } from "./almacen.js";

function limpiarTodo() {
  for (const k of Object.keys(localStorage)) {
    if (k.startsWith("hierro:") || k.startsWith("hierro2:")) localStorage.removeItem(k);
  }
}

test("sin datos viejos no hay nada que importar", () => {
  limpiarTodo();
  assertEq(hayDatosViejos(), false);
  assertEq(analizar().encontrados, []);
});

test("traduce una posición a su slug", () => {
  limpiarTodo();
  // dia1 posición 0 en el DAYS viejo era "Press pectoral en máquina"
  localStorage.setItem("hierro:h:dia1:_:0", JSON.stringify([{ d: "2026-08-01", w: "21", s: "4", r: "15" }]));
  const r = analizar();
  assertEq(r.encontrados.length, 1);
  assertEq(r.encontrados[0].slug, "press-pectoral-maquina");
  assertEq(r.encontrados[0].pesoKg, 21);
  assertEq(r.encontrados[0].fecha, "2026-08-01");
});

test("una posición que ya no existe se reporta como huérfana, no se pierde en silencio", () => {
  limpiarTodo();
  localStorage.setItem("hierro:h:dia1:_:99", JSON.stringify([{ d: "2026-08-01", w: "10", s: "3", r: "10" }]));
  const r = analizar();
  assertEq(r.encontrados, []);
  assertEq(r.huerfanos.length, 1);
});

test("analizar no escribe nada", () => {
  limpiarTodo();
  localStorage.setItem("hierro:h:dia1:_:0", JSON.stringify([{ d: "2026-08-01", w: "21", s: "4", r: "15" }]));
  analizar();
  assertEq(localStorage.getItem(LLAVE_REGISTROS), null);
});

test("importar escribe y no borra el localStorage viejo", () => {
  limpiarTodo();
  localStorage.setItem("hierro:h:dia1:_:0", JSON.stringify([{ d: "2026-08-01", w: "21", s: "4", r: "15" }]));
  const escritos = importar(analizar().encontrados);
  assertEq(escritos, 1);
  assertEq(historial("press-pectoral-maquina").length, 1);
  assertEq(localStorage.getItem("hierro:h:dia1:_:0") !== null, true);
  limpiarTodo();
});

test("el peso vacío se guarda como null, no como NaN", () => {
  limpiarTodo();
  localStorage.setItem("hierro:h:core:_:0", JSON.stringify([{ d: "2026-08-02", w: "", s: "5", r: "20" }]));
  assertEq(analizar().encontrados[0].pesoKg, null);
  limpiarTodo();
});
```

- [ ] **Paso 2: Correr y verificar que fallan**

Agregar `await import("./js/migracion.test.js");` a `tests.html`. Esperado: 404.

- [ ] **Paso 3: Construir el mapa congelado**

Crear `js/mapa-legado.js` copiando el orden exacto de los ejercicios de
`index.html:604-758`, un renglón por combinación día/variante. **Este archivo
nunca se edita después**: describe el pasado, no el presente.

```javascript
// Frozen snapshot of the OLD positional layout (index.html:604-758 as of
// commit 872ad7b). Maps "<dayKey>:<variantKey>" to the slug at each index.
// Never edit: this describes history, not the current routine.
export const MAPA_LEGADO = {
  "dia1:_": [
    "press-pectoral-maquina", "press-militar-barra", "extension-triceps-polea",
    "remo-maquina", "jalon-cara", "curl-biceps-barra", "crunch"
  ],
  "dia2:_": [
    "sentadilla", "subida-banco", "puente-gluteo", "peso-muerto-mancuernas"
  ],
  "core:_": [
    "crunch", "elevacion-cadera-acostado", "plancha-lateral", "plancha"
  ],
  // ... biceps:v1, biceps:v2, dorsales:v1, dorsales:v2, dorsales:v3,
  //     pierna:v1, pierna:v2, pierna:v3 — mismo formato, tomados de
  //     index.html:639-752 en el orden exacto en que aparecen
};
```

- [ ] **Paso 4: Implementar el migrador**

Crear `js/migracion.js`:

```javascript
// Translates the old positional localStorage keys into slug-keyed records.
// Read-only until importar() is called, and never deletes the old keys —
// a bad translation must be recoverable.
import { MAPA_LEGADO } from "./mapa-legado.js";
import { guardarRegistro } from "./almacen.js";

const PATRON = /^hierro:h:([^:]+):([^:]+):(\d+)$/;

function llavesViejas() {
  try {
    return Object.keys(localStorage).filter((k) => PATRON.test(k));
  } catch (_) {
    return [];
  }
}

export function hayDatosViejos() {
  return llavesViejas().length > 0;
}

function aNumeroONull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function analizar() {
  const encontrados = [];
  const huerfanos = [];
  for (const llave of llavesViejas()) {
    const [, dia, variante, indice] = llave.match(PATRON);
    const slugs = MAPA_LEGADO[`${dia}:${variante}`];
    const slug = slugs ? slugs[Number(indice)] : undefined;
    if (!slug) {
      huerfanos.push({ llave, motivo: "posición sin equivalencia en el mapa" });
      continue;
    }
    let filas;
    try {
      filas = JSON.parse(localStorage.getItem(llave));
    } catch (_) {
      huerfanos.push({ llave, motivo: "JSON ilegible" });
      continue;
    }
    if (!Array.isArray(filas)) {
      huerfanos.push({ llave, motivo: "no es una lista de registros" });
      continue;
    }
    for (const f of filas) {
      if (!f || !f.d) continue;
      encontrados.push({
        slug,
        fecha: f.d,
        pesoKg: aNumeroONull(f.w),
        series: aNumeroONull(f.s),
        reps: f.r || null
      });
    }
  }
  return { encontrados, huerfanos };
}

export function importar(encontrados) {
  let escritos = 0;
  for (const r of encontrados) {
    guardarRegistro(r.slug, { ...r, hecho: true });
    escritos++;
  }
  return escritos;
}
```

- [ ] **Paso 5: Correr y verificar que pasan**

Recargar `tests.html`. Esperado: "41 pasaron, 0 fallaron".

- [ ] **Paso 6: Commit**

```bash
git add js/mapa-legado.js js/migracion.js js/migracion.test.js tests.html
git commit -m "Importador que traduce el historial posicional a slugs sin borrar nada"
```

---

### Tarea 7: Google Calendar y `.ics`

**Archivos:**
- Crear: `js/calendario.js`
- Crear: `js/calendario.test.js`
- Modificar: `tests.html`

**Interfaces:**
- Produce:
  - `urlCalendario({ dia, bloque, lineas, fecha })` → cadena URL.
  - `textoICS({ dia, bloque, lineas, fecha })` → cadena con el archivo `.ics`.
  - `nombreArchivoICS(dia, fecha)` → `"entrenamiento-dia3-2026-09-02.ics"`.

`lineas` es un arreglo de cadenas ya formateadas, tipo `"Sentadilla — 20 kg × 4 × 10"`.

- [ ] **Paso 1: Escribir las pruebas que fallan**

Crear `js/calendario.test.js`:

```javascript
import { test, assertEq } from "./pruebas.js";
import { urlCalendario, textoICS, nombreArchivoICS } from "./calendario.js";

const ENTRADA = {
  dia: { clave: "dia3", etiqueta: "Día 3", enfoque: "Pierna" },
  bloque: { etiqueta: "Tren inferior" },
  lineas: ["Sentadilla — 20 kg × 4 × 10"],
  fecha: "2026-09-02"
};

test("la URL apunta a la plantilla de Google Calendar", () => {
  assertEq(urlCalendario(ENTRADA).startsWith(
    "https://calendar.google.com/calendar/render?action=TEMPLATE"), true);
});

test("la URL trae el rango de todo el día con el día siguiente como fin", () => {
  assertEq(urlCalendario(ENTRADA).includes("dates=20260902%2F20260903"), true);
});

test("el título va codificado y no rompe la URL", () => {
  const u = urlCalendario(ENTRADA);
  assertEq(u.includes("Pierna"), false);       // debe ir escapado
  assertEq(u.includes("text=Entrenamiento"), true);
});

test("el .ics trae las líneas obligatorias del formato", () => {
  const t = textoICS(ENTRADA);
  for (const linea of ["BEGIN:VCALENDAR", "VERSION:2.0", "BEGIN:VEVENT", "END:VEVENT", "END:VCALENDAR"]) {
    if (!t.includes(linea)) throw new Error(`falta ${linea}`);
  }
});

test("el .ics usa fecha de todo el día, no hora", () => {
  assertEq(textoICS(ENTRADA).includes("DTSTART;VALUE=DATE:20260902"), true);
  assertEq(textoICS(ENTRADA).includes("DTEND;VALUE=DATE:20260903"), true);
});

test("el .ics escapa las comas, que si no parten el campo", () => {
  const t = textoICS({ ...ENTRADA, lineas: ["Sentadilla, pesada"] });
  assertEq(t.includes("Sentadilla\\, pesada"), true);
});

test("el .ics separa renglones con CRLF, como pide el estándar", () => {
  assertEq(textoICS(ENTRADA).includes("\r\n"), true);
});

test("sin ejercicios marcados el texto lo dice, no queda vacío", () => {
  const t = textoICS({ ...ENTRADA, lineas: [] });
  assertEq(t.includes("sin ejercicios marcados"), true);
});

test("el nombre de archivo incluye día y fecha", () => {
  assertEq(nombreArchivoICS(ENTRADA.dia, "2026-09-02"), "entrenamiento-dia3-2026-09-02.ics");
});
```

- [ ] **Paso 2: Correr y verificar que fallan**

Agregar `await import("./js/calendario.test.js");` a `tests.html`. Esperado: 404.

- [ ] **Paso 3: Implementar**

Crear `js/calendario.js`:

```javascript
// Builds calendar payloads. Pure string work — no DOM, no window.open.
// The old implementation used window.open(), which pop-up blockers kill
// silently; the UI now renders a real anchor instead (see render.js).
function compacta(iso) {
  return iso.replace(/-/g, "");
}

function diaSiguiente(iso) {
  const [a, m, d] = iso.split("-").map(Number);
  const f = new Date(a, m - 1, d + 1);
  const mm = String(f.getMonth() + 1).padStart(2, "0");
  const dd = String(f.getDate()).padStart(2, "0");
  return `${f.getFullYear()}-${mm}-${dd}`;
}

function titulo({ dia, bloque }) {
  const sufijo = bloque && bloque.etiqueta ? ` (${bloque.etiqueta})` : "";
  return `Entrenamiento — ${dia.etiqueta}: ${dia.enfoque}${sufijo}`;
}

function cuerpo({ lineas }) {
  return lineas.length
    ? `Ejercicios completados:\n${lineas.map((l) => `• ${l}`).join("\n")}`
    : "Sesión registrada sin ejercicios marcados todavía.";
}

export function urlCalendario(entrada) {
  const inicio = compacta(entrada.fecha);
  const fin = compacta(diaSiguiente(entrada.fecha));
  return "https://calendar.google.com/calendar/render?action=TEMPLATE"
    + `&text=${encodeURIComponent(titulo(entrada))}`
    + `&dates=${encodeURIComponent(`${inicio}/${fin}`)}`
    + `&details=${encodeURIComponent(cuerpo(entrada))}`;
}

// Escapes the characters RFC 5545 treats as field separators.
function escaparICS(texto) {
  return texto
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

export function textoICS(entrada) {
  const lineas = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Registro de Hierro//ES",
    "BEGIN:VEVENT",
    `UID:${entrada.dia.clave}-${entrada.fecha}@registro-de-hierro`,
    `DTSTART;VALUE=DATE:${compacta(entrada.fecha)}`,
    `DTEND;VALUE=DATE:${compacta(diaSiguiente(entrada.fecha))}`,
    `SUMMARY:${escaparICS(titulo(entrada))}`,
    `DESCRIPTION:${escaparICS(cuerpo(entrada))}`,
    "END:VEVENT",
    "END:VCALENDAR"
  ];
  return lineas.join("\r\n") + "\r\n";
}

export function nombreArchivoICS(dia, fecha) {
  return `entrenamiento-${dia.clave}-${fecha}.ics`;
}
```

- [ ] **Paso 4: Correr y verificar que pasan**

Recargar `tests.html`. Esperado: "50 pasaron, 0 fallaron".

- [ ] **Paso 5: Commit**

```bash
git add js/calendario.js js/calendario.test.js tests.html
git commit -m "Calendario como datos puros: URL de Google y archivo .ics"
```

---

### Tarea 8: Cascarón modular

Rompe el `index.html` monolítico. Al terminar, la app debe **verse igual que hoy**
pero con el nuevo split y sin lógica en línea.

**Archivos:**
- Crear: `css/estilos.css`
- Crear: `js/render.js`
- Crear: `js/app.js`
- Modificar: `index.html` (queda como cascarón)

**Interfaces:**
- `js/render.js` produce:
  - `pintarNav(contenedor, alSeleccionar)` — dibuja las pestañas de día.
  - `pintarDia(contenedor, claveDia, unidad)` — dibuja el panel de un día. `unidad` es `"kg"` o `"lb"` y se reenvía a `montarCampos`.
- `js/app.js` no exporta nada; es el punto de entrada.

- [ ] **Paso 1: Extraer los estilos**

```bash
cd ~/Development/kapy-fit
mkdir -p css js
sed -n '9,529p' index.html > css/estilos.css
```

Verificar que el archivo arranca en `@import url(...)` y termina en la última
regla, sin las etiquetas `<style>`:

```bash
head -1 css/estilos.css; tail -1 css/estilos.css
```

- [ ] **Paso 2: Reescribir `index.html` como cascarón**

Reemplazar todo el archivo por:

```html
<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#B8451D">
<title>Registro de Hierro</title>
<link rel="stylesheet" href="css/estilos.css">
</head>
<body>
<div class="wrap">
  <header class="head">
    <p class="eyebrow">Bitácora personal</p>
    <h1>Registro de Hierro</h1>
    <p class="lede">Tu rutina completa, centralizada en un solo lugar. Anota el peso, las series
    y las reps que hiciste hoy, marca el ejercicio al terminarlo y revisa tu
    historial — todo se guarda en este dispositivo.</p>
  </header>

  <nav class="days" id="dayNav" role="tablist" aria-label="Días de rutina"></nav>

  <main id="panels"></main>

  <footer class="foot">
    <span>Los videos de técnica abren en una pestaña nueva.</span>
    <span id="lastReset"></span>
  </footer>
</div>

<script type="module" src="js/app.js"></script>
</body>
</html>
```

- [ ] **Paso 3: Escribir el render**

Crear `js/render.js`. Reutiliza los nombres de clase CSS que ya existen
(`.days`, `.ex`, `.ex-meta`, `.cal-btn`, etc.) para no tocar `estilos.css`.
Recorre `RUTINA` → `bloques` → `ejercicios`, y para cada ejercicio saca el nombre
y el video de `CATALOGO`. Puntos obligatorios:

- El botón de Calendar es **`<a href target="_blank" rel="noopener">` con clase
  `cal-btn`**, nunca un `<button>` con `window.open`. Esa es la causa raíz del bug.
- El botón de `.ics` es un `<a download>` con `href` de tipo `blob:` construido
  desde `textoICS(...)`.
- Si `CATALOGO[slug].video` es `null`, no se dibuja el botón "Técnica".
- Un día con `bloques: []` (descanso) dibuja su mensaje y ningún ejercicio.

- [ ] **Paso 4: Escribir el arranque**

Crear `js/app.js`:

```javascript
// Entry point. Wires the nav to the panel renderer and nothing else.
import { RUTINA } from "./rutina.js";
import { pintarNav, pintarDia } from "./render.js";
import { preferencias } from "./almacen.js";

const nav = document.getElementById("dayNav");
const panels = document.getElementById("panels");

let diaActivo = RUTINA[0].clave;
let unidad = preferencias().unidad;

function refrescar() {
  pintarNav(nav, seleccionar);
  pintarDia(panels, diaActivo, unidad);
}

function seleccionar(clave) {
  diaActivo = clave;
  refrescar();
}

refrescar();
```

- [ ] **Paso 5: Verificar en el navegador**

Abrir `index.html`. Esperado, y hay que comprobarlo a ojo:
- 7 pestañas con los enfoques del nuevo split.
- La consola **sin errores** (los módulos ES sobre `file://` requieren servidor;
  usar `python3 -m http.server 8080` y abrir `http://localhost:8080`).
- Los días 3 y 6 muestran abducción y aducción.
- La apariencia es la misma de antes del cambio.

- [ ] **Paso 6: Commit**

```bash
git add index.html css/estilos.css js/render.js js/app.js
git commit -m "Separar el monolito en cascarón, estilos y módulos de render"
```

---

### Tarea 9: Registro, palomita y temporizador

Reconecta la captura a `almacen.js` usando slugs.

**Archivos:**
- Crear: `js/registro.js`
- Modificar: `js/render.js` (llamar al registro por ejercicio)
- Leer: `index.html:882-956` (temporizador actual) del commit `872ad7b`

**Interfaces:**
- Produce:
  - `montarCampos(contenedor, slug, ejercicio, unidad)` — dibuja peso/series/reps y persiste al perder foco.
  - `montarPalomita(contenedor, slug)` — casilla que escribe el registro del día.
  - `montarTemporizador(contenedor, segundos)` — el círculo de descanso.

- [ ] **Paso 1: Escribir la prueba de la conversión de captura**

Agregar a `js/almacen.test.js`:

```javascript
import { aKg } from "./unidades.js";

test("un peso capturado en libras se guarda en kilos", () => {
  limpiar();
  const capturado = 100;                       // el usuario escribió 100
  guardarRegistro("sentadilla", {
    fecha: "2026-09-02", pesoKg: aKg(capturado, "lb"),
    series: 4, reps: "10", hecho: true
  });
  assertEq(registroDe("sentadilla", "2026-09-02").pesoKg, 45.4);
});
```

- [ ] **Paso 2: Correr y verificar que falla**

Recargar `tests.html`. Esperado: falla, porque `almacen.test.js` todavía no
importa `aKg`. Agregar el import arriba del archivo y volver a correr: pasa.

- [ ] **Paso 3: Implementar el módulo**

Crear `js/registro.js`. Reglas obligatorias:

- El valor tecleado se convierte con `aKg(valor, unidad)` **antes** de guardar.
  Nunca se guarda el número tal cual si la unidad es `lb`.
- Se persiste en el evento `change`, no en cada tecla.
- Marcar la palomita escribe un registro con `hecho: true` y la fecha de
  `hoyISO()`; desmarcarla lo pone en `false` sin borrar el peso capturado.
- El temporizador se copia de `index.html:882-956` del commit `872ad7b` sin
  cambios de comportamiento; solo pasa a ser un módulo con `export`.

- [ ] **Paso 4: Verificar en el navegador**

Con el servidor corriendo: capturar 22 en peso, marcar la palomita, recargar.
Esperado: el valor sigue ahí y la palomita sigue marcada. Cambiar a `lb` en la
tarea 11 debe mostrar 48.5 sin que el dato guardado cambie.

- [ ] **Paso 5: Commit**

```bash
git add js/registro.js js/render.js js/almacen.test.js
git commit -m "Captura, palomita y temporizador sobre almacenamiento por slug"
```

---

### Tarea 10: Imágenes de ejercicio

**Archivos:**
- Crear: `data/mapeo-imagenes.json`
- Crear: `scripts/fetch-imagenes.mjs`
- Crear: `js/imagenes.js`
- Modificar: `js/catalogo.js` (llenar `imagenInicio` / `imagenFin`)
- Modificar: `js/render.js` (insertar el visor)

**Interfaces:**
- Produce: `montarImagen(contenedor, slug, ejercicio)` — inserta el visor de dos fotogramas. `ejercicio` es la entrada de `CATALOGO`.

Fuente: `yuhonas/free-exercise-db`, licencia Unlicense. JSON en
`https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json`,
imágenes en `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/<ruta>`.

- [ ] **Paso 1: Curar el mapeo a mano**

Crear `data/mapeo-imagenes.json` con `slug → name` exacto del banco. **Se revisa
uno por uno**: el emparejamiento automático mandó `subida-banco` a
"Close-Grip Push-Up off of a Dumbbell", que no tiene nada que ver. Un slug sin
equivalencia decente se pone en `null` y se queda solo con su video.

```json
{
  "press-pectoral-maquina": "Machine Bench Press",
  "press-militar-barra": "Barbell Shoulder Press",
  "abduccion-cadera": "Thigh Abductor",
  "aduccion-cadera": "Thigh Adductor",
  "subida-banco": null
}
```

- [ ] **Paso 2: Escribir el descargador**

Crear `scripts/fetch-imagenes.mjs`. Corre con `node scripts/fetch-imagenes.mjs`,
una sola vez, y no se sirve al navegador. Debe:
- Bajar `exercises.json`.
- Para cada slug con nombre no nulo, buscar la entrada por nombre **exacto**; si
  no la encuentra, imprimir `SIN MATCH: <slug>` y seguir, no abortar.
- Guardar las dos primeras imágenes como `data/ejercicios/<slug>-0.jpg` y
  `<slug>-1.jpg`.
- Al final, imprimir el resumen: cuántas bajó y qué slugs quedaron sin imagen.

- [ ] **Paso 3: Correrlo y revisar el resultado**

```bash
node scripts/fetch-imagenes.mjs
ls data/ejercicios | wc -l
```

Esperado: alrededor de 80 archivos (2 por ejercicio emparejado) y una lista
explícita de los que quedaron sin match. **Abrir media docena de imágenes y
verificar a ojo que corresponden al ejercicio.** El script no puede detectar un
emparejamiento semánticamente equivocado.

- [ ] **Paso 4: Implementar el visor**

Crear `js/imagenes.js`:

```javascript
// Two-frame exercise preview. Alternates start/end frames to suggest the
// movement, and stops entirely when off-screen — 40 running intervals on a
// phone is a battery problem, not a rendering one.
const MS_POR_FOTOGRAMA = 800;

export function montarImagen(contenedor, slug, ejercicio) {
  if (!ejercicio.imagenInicio || !ejercicio.imagenFin) return;

  const img = document.createElement("img");
  img.className = "ex-gif";
  img.loading = "lazy";
  img.alt = `Demostración de ${ejercicio.nombre}`;
  img.src = ejercicio.imagenInicio;
  contenedor.appendChild(img);

  const fotogramas = [ejercicio.imagenInicio, ejercicio.imagenFin];
  let i = 0;
  let timer = null;

  function arrancar() {
    if (timer) return;
    timer = setInterval(() => {
      i = (i + 1) % 2;
      img.src = fotogramas[i];
    }, MS_POR_FOTOGRAMA);
  }

  function parar() {
    clearInterval(timer);
    timer = null;
  }

  const observador = new IntersectionObserver((entradas) => {
    for (const e of entradas) e.isIntersecting ? arrancar() : parar();
  }, { threshold: 0.1 });

  observador.observe(img);
}
```

Agregar a `css/estilos.css`:

```css
.ex-gif {
  width: 100%;
  max-width: 180px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface-2);
  display: block;
  margin-top: 10px;
}
@media (prefers-reduced-motion: reduce) {
  .ex-gif { content-visibility: auto; }
}
```

Si el usuario pidió movimiento reducido, `js/imagenes.js` debe **no arrancar el
intervalo** y quedarse en el primer fotograma:

```javascript
  const sinMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (sinMovimiento) return;   // justo antes de crear el IntersectionObserver
```

- [ ] **Paso 5: Verificar en el navegador**

Con el servidor corriendo, abrir un día y comprobar: las imágenes alternan, al
hacer scroll lejos se detienen (verificable poniendo un `console.log` temporal en
`parar()`), y el ejercicio sin imagen no deja hueco ni marco vacío.

- [ ] **Paso 6: Commit**

```bash
git add data/ scripts/ js/imagenes.js js/catalogo.js js/render.js css/estilos.css
git commit -m "Demostración visual de dos fotogramas por ejercicio, dominio público"
```

---

### Tarea 11: Selector de unidades y aviso de importación

Cierra la entrega conectando lo que quedó suelto.

**Archivos:**
- Modificar: `index.html` (control de unidades en la cabecera)
- Modificar: `js/app.js` (estado de unidad y aviso de importación)
- Modificar: `js/render.js` (pasar la unidad al registro)
- Modificar: `css/estilos.css`

- [ ] **Paso 1: Agregar el control**

En `index.html`, dentro de `<header class="head">`, después del `<p class="lede">`:

```html
    <div class="unidad" role="group" aria-label="Unidad de peso">
      <button type="button" id="btnKg" class="unidad-btn" aria-pressed="true">kg</button>
      <button type="button" id="btnLb" class="unidad-btn" aria-pressed="false">lb</button>
    </div>
```

- [ ] **Paso 2: Conectarlo**

En `js/app.js`:

```javascript
import { guardarPreferencias } from "./almacen.js";
// `unidad` ya se declaró en la tarea 8; aquí solo se agrega el control.

function pintarUnidad() {
  document.getElementById("btnKg").setAttribute("aria-pressed", String(unidad === "kg"));
  document.getElementById("btnLb").setAttribute("aria-pressed", String(unidad === "lb"));
}

function cambiarUnidad(nueva) {
  unidad = nueva;
  guardarPreferencias({ unidad: nueva });
  pintarUnidad();
  refrescar();                 // redibuja con los valores convertidos
}

document.getElementById("btnKg").addEventListener("click", () => cambiarUnidad("kg"));
document.getElementById("btnLb").addEventListener("click", () => cambiarUnidad("lb"));
pintarUnidad();
```

`render.js` reenvía `unidad` a `montarCampos(...)`. `refrescar()` ya la pasa
desde la tarea 8.

- [ ] **Paso 3: Agregar el aviso de importación**

En `js/app.js`, después del arranque:

```javascript
import { hayDatosViejos, analizar, importar } from "./migracion.js";

if (hayDatosViejos()) {
  const { encontrados, huerfanos } = analizar();
  const aviso = document.createElement("div");
  aviso.className = "aviso";
  aviso.innerHTML =
    `<p>Encontré <strong>${encontrados.length}</strong> registros de la versión anterior` +
    (huerfanos.length ? ` y <strong>${huerfanos.length}</strong> que ya no puedo ubicar` : "") +
    `. Tus datos viejos no se borran.</p>`;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "cal-btn";
  btn.textContent = `Importar ${encontrados.length} registros`;
  btn.addEventListener("click", () => {
    const n = importar(encontrados);
    aviso.textContent = `Listo: ${n} registros importados.`;
    refrescar();
  });
  aviso.appendChild(btn);
  document.querySelector(".wrap").insertBefore(aviso, document.getElementById("dayNav"));
}
```

- [ ] **Paso 4: Estilos**

Agregar a `css/estilos.css`:

```css
.unidad { display: inline-flex; gap: 2px; margin-top: 12px; }
.unidad-btn {
  font: 600 13px/1 "Public Sans", system-ui, sans-serif;
  padding: 7px 14px; cursor: pointer;
  border: 1px solid var(--border); background: var(--surface); color: var(--text-dim);
}
.unidad-btn:first-child { border-radius: 8px 0 0 8px; }
.unidad-btn:last-child  { border-radius: 0 8px 8px 0; }
.unidad-btn[aria-pressed="true"] {
  background: var(--accent); color: var(--accent-ink); border-color: var(--accent);
}
.aviso {
  border: 1px solid var(--border); background: var(--surface-2);
  border-radius: 12px; padding: 14px 16px; margin-bottom: 18px;
}
```

- [ ] **Paso 5: Verificar en el navegador**

Con el servidor corriendo:
1. Capturar 20 en un ejercicio con la unidad en kg.
2. Cambiar a lb → debe mostrar **44.1**, no 20.
3. Recargar → la unidad sigue en lb.
4. Volver a kg → debe mostrar **20**. Una diferencia mayor a 0.2 significa que
   la conversión está derivando más de lo que permite el redondeo a un decimal.
5. Revisar que la consola quede sin errores.

- [ ] **Paso 6: Correr toda la suite**

Abrir `tests.html`. Esperado: **51 pasaron, 0 fallaron**.

- [ ] **Paso 7: Commit**

```bash
git add index.html js/app.js js/render.js css/estilos.css
git commit -m "Selector kg/lb persistente y aviso de importación del historial"
```

---

## Cierre de la entrega

Al terminar la tarea 11:

```bash
git push origin main
```

Verificación final, con `python3 -m http.server 8080` corriendo:

- [ ] `tests.html` reporta 51 pruebas en verde.
- [ ] Los 7 días se dibujan con el split aprobado.
- [ ] Días 3 y 6 muestran abducción y aducción en **todos** sus bloques.
- [ ] El abdomen aparece en los días 2, 4 y 6, y en ninguno más.
- [ ] El botón de Google Calendar abre la pestaña sin que lo bloquee el navegador.
- [ ] El botón `.ics` descarga un archivo que Calendario abre sin error.
- [ ] Las imágenes alternan y se detienen fuera de pantalla.
- [ ] El selector kg/lb convierte de ida y vuelta sin perder el dato.
- [ ] La consola queda limpia.

## Qué queda pendiente y por qué

- **Entrega 2 (Supabase).** Credenciales ya recibidas y verificadas. La anon key
  se commitea junto con las migraciones de RLS, no antes: publicarla mientras el
  esquema no tiene políticas deja una ventana en la que cualquier tabla creada
  queda expuesta.
- **Entrega 3 (gráficas).** Chart.js y las tres gráficas, sobre los datos que esta
  entrega ya empieza a acumular con slugs estables.
- **Video de `aduccion-cadera`.** Falta un enlace verificado por el usuario.
