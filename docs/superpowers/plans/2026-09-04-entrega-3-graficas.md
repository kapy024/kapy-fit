# Entrega 3 — Gráficas: plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usa `superpowers:subagent-driven-development` (recomendado) o `superpowers:executing-plans` para ejecutar tarea por tarea. Los pasos usan casillas (`- [ ]`) para seguimiento.

**Meta:** Que el usuario pueda ver si de verdad está avanzando: peso y volumen por ejercicio a lo largo del tiempo, y peso corporal semanal con su tendencia.

**Arquitectura:** Una pestaña nueva **Progreso** junto a los 7 días. Las gráficas se dibujan con Chart.js v4 cargado con `import()` **dinámico**, de modo que si el CDN no responde la app sigue funcionando y las gráficas degradan a su tabla de datos. Los datos salen de `historial(slug)` y de una tabla nueva de peso corporal, ambos ya indexados por lo que hace falta.

**Stack:** HTML/CSS/JavaScript con módulos ES nativos, sin bundler. Chart.js v4 por CDN. Supabase para persistir.

## Restricciones globales

- **Sin paso de build.** GitHub Pages sirve el repo tal cual. Nada de npm en tiempo de ejecución.
- **Chart.js se carga con `import()` dinámico, nunca estático.** Un import estático del CDN de Supabase ya tumbó la app entera en la entrega 2; no se repite. Sin red, la pestaña Progreso muestra las tablas de datos y el resto de la app funciona igual.
- **`js/almacen.js` es el único que toca `localStorage`; `js/db.js` es el dueño único del cliente de red.**
- **kg es la unidad canónica** en base de datos y en `localStorage`. La libra es solo presentación, y las gráficas respetan el selector.
- **Toda función SQL nueva lleva su `revoke execute ... from public, anon` en la misma migración**, y `set search_path`. Olvidarlo ya costó una migración de arreglo (007).
- **Toda escritura sincronizada usa marca de edición del cliente** (`editado_en`) y escritura condicional, nunca un upsert ciego: gana quien escribió al último, no quien sincronizó al último.
- **Español** en interfaz, nombres de archivo, pruebas y commits. Comentarios de función en inglés.
- Estado de partida: entregas 1 y 2 en `main`, 220 pruebas en `tests.html`, 8 migraciones aplicadas.

### Reglas de visualización, ya decididas en el diseño aprobado

- **Nunca dos ejes Y.** Peso (kg) y volumen (kg × series × reps) viven en escalas distintas; van en **dos gráficas apiladas que comparten el eje de fechas**, no superpuestas.
- **Las barras arrancan en cero; las líneas no.** Forzar el peso corporal a empezar en 0 aplasta el rango real contra el techo.
- **Eje X por fecha real**, no por sesión consecutiva: las semanas que faltaste deben verse como hueco.
- **Paleta validada** (no se elige a ojo; la de marca reprobó las verificaciones de contraste y daltonismo):

  | Slot | Claro | Oscuro |
  |---|---|---|
  | 1 | `#2a78d6` azul | `#3987e5` |
  | 2 | `#eb6834` naranja | `#d95926` |
  | 3 | `#1baf7a` aqua | `#199e70` |

  Máximo 3 series por gráfica. El aqua en claro queda bajo 3:1 de contraste: esa serie **siempre lleva etiqueta directa**.
- **El promedio móvil va del mismo color que sus datos, punteado.** Es la misma entidad suavizada, no otra serie; darle otro color haría creer que mide otra cosa.
- **Toda gráfica lleva su tabla equivalente** para lectores de pantalla, y es además el respaldo cuando Chart.js no carga.
- **Con menos de 2 registros no se dibuja nada**: se dice cuántos faltan. Una gráfica de un punto es peor que ninguna.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `js/graficas.js` | Carga diferida de Chart.js, tema y paleta. Único módulo que conoce la librería |
| `js/grafica-ejercicio.js` | Las dos gráficas apiladas de un ejercicio: peso y volumen |
| `js/grafica-peso.js` | Peso corporal con promedio móvil |
| `js/peso-corporal.js` | Registro semanal: datos y persistencia. Sin DOM |
| `js/progreso.js` | La pestaña Progreso: arma la vista y decide qué mostrar |
| `js/tabla-datos.js` | Tabla equivalente de una serie, para lector de pantalla y sin red |
| `js/metricas.js` | Cálculos puros: volumen, promedio móvil, agrupación por semana y mes |
| `sql/009_peso_corporal.sql` | Escritura condicional de peso corporal, con su revoke |

`js/metricas.js` no sabe de Chart.js ni del DOM: son funciones puras y son las
que llevan la mayor parte de las pruebas.

---

### Tarea 1: Métricas puras

Todo el cálculo que puede estar mal en silencio, aislado y probado antes de
dibujar nada.

**Archivos:**
- Crear: `js/metricas.js`, `js/metricas.test.js`
- Modificar: `tests.html`

**Interfaces:**
- `volumen(registro)` → `pesoKg × series × repsNuméricas`, o `null` si falta algo o las reps no son numéricas.
- `repsNumericas(reps)` → número o `null`. Las reps son cadena libre: hay `"15"`, `"15–20 seg por lado"`, `"10 der / 15 izq"`, `"hasta 1 min continuo"`.
- `promedioMovil(puntos, ventana)` → arreglo de `{fecha, valor}`; `valor` es `null` mientras no haya suficientes puntos previos.
- `porSemana(registros)` → `[{ semana: "2026-W36", fecha, valor }]`, promediando lo de cada semana.
- `serieTemporal(registros, campo)` → `[{fecha, valor}]` ordenada, descartando los que no tengan valor.

- [ ] **Paso 1: Escribir las pruebas que fallan**

Crear `js/metricas.test.js`:

```javascript
import { test, assertEq, assertCerca } from "./pruebas.js";
import { volumen, repsNumericas, promedioMovil, porSemana, serieTemporal } from "./metricas.js";

test("el volumen es peso por series por reps", () => {
  assertEq(volumen({ pesoKg: 20, series: 4, reps: "10" }), 800);
});

test("sin peso, sin series o sin reps no hay volumen", () => {
  assertEq(volumen({ pesoKg: null, series: 4, reps: "10" }), null);
  assertEq(volumen({ pesoKg: 20, series: null, reps: "10" }), null);
  assertEq(volumen({ pesoKg: 20, series: 4, reps: null }), null);
});

test("un ejercicio de peso corporal (0 kg) tiene volumen 0, no null", () => {
  assertEq(volumen({ pesoKg: 0, series: 4, reps: "12" }), 0);
});

test("las reps no numéricas se leen cuando se puede y si no dan null", () => {
  assertEq(repsNumericas("15"), 15);
  assertEq(repsNumericas("10 der / 15 izq"), 10);      // el primer número
  assertEq(repsNumericas("15–20 seg por lado"), 15);
  assertEq(repsNumericas("hasta 1 min continuo"), 1);
  assertEq(repsNumericas("sin número"), null);
  assertEq(repsNumericas(""), null);
  assertEq(repsNumericas(null), null);
});

test("el promedio móvil no inventa valores al principio", () => {
  const p = [{fecha:"2026-01-01",valor:80},{fecha:"2026-01-08",valor:81},{fecha:"2026-01-15",valor:79}];
  const m = promedioMovil(p, 3);
  assertEq(m[0].valor, null);
  assertEq(m[1].valor, null);
  assertCerca(m[2].valor, 80, 0.01);
});

test("el promedio móvil con ventana mayor que los datos es todo null", () => {
  assertEq(promedioMovil([{fecha:"2026-01-01",valor:80}], 4).every(x => x.valor === null), true);
});

test("la serie temporal sale ordenada y sin huecos falsos", () => {
  const r = [{fecha:"2026-03-05",pesoKg:22},{fecha:"2026-01-02",pesoKg:20},{fecha:"2026-02-01",pesoKg:null}];
  assertEq(serieTemporal(r, "pesoKg").map(p => p.fecha), ["2026-01-02","2026-03-05"]);
});

test("por semana promedia lo de la misma semana", () => {
  const r = [{fecha:"2026-09-01",valor:80},{fecha:"2026-09-03",valor:82},{fecha:"2026-09-10",valor:81}];
  const s = porSemana(r);
  assertEq(s.length, 2);
  assertCerca(s[0].valor, 81, 0.01);
});

test("una serie vacía no truena en ninguna función", () => {
  assertEq(serieTemporal([], "pesoKg"), []);
  assertEq(promedioMovil([], 4), []);
  assertEq(porSemana([]), []);
});
```

- [ ] **Paso 2: Correr y verificar que fallan**

Agregar `await import("./js/metricas.test.js");` a `tests.html`. Servir con
`python3 -m http.server <puerto nuevo> --directory .` y abrir `tests.html`.
Esperado: 404 de `metricas.js`.

**Sobre el puerto:** usa uno que no hayas usado antes cada vez que cambies un
módulo y necesites resolución limpia; el navegador cachea el grafo de módulos ES
y recargar, incluso forzado, da falso verde.

- [ ] **Paso 3: Implementar**

Crear `js/metricas.js`. Puntos que las pruebas ya fijan y que es fácil romper:
- `pesoKg: 0` es un valor legítimo (plancha, lagartijas, sentadilla con salto):
  `volumen` debe devolver `0`, no `null`. Usa comprobaciones de `null`/`undefined`
  explícitas, no `if (!peso)`.
- `repsNumericas` toma el **primer** número que aparezca en la cadena.
- `promedioMovil` devuelve `null` mientras no haya `ventana` puntos: rellenar con
  un promedio parcial dibuja una tendencia que no existe.

- [ ] **Paso 4: Correr y verificar que pasan**

Esperado: 220 previas + 9 nuevas, 0 fallidas.

- [ ] **Paso 5: Commit**

```bash
git add js/metricas.js js/metricas.test.js tests.html
git commit -m "Métricas puras: volumen, promedio móvil y series temporales"
```

---

### Tarea 2: Carga diferida de Chart.js y tabla de respaldo

**Archivos:**
- Crear: `js/graficas.js`, `js/tabla-datos.js`, `js/graficas.test.js`
- Modificar: `css/estilos.css`, `tests.html`

**Interfaces:**
- `js/graficas.js`: `cargarChart()` → la clase `Chart` o `null` si no cargó (**no lanza**); `disponible()` → booleano; `paleta()` → `{serie1, serie2, serie3, texto, retícula, superficie}` según el tema activo; `opcionesBase()` → configuración común.
- `js/tabla-datos.js`: `montarTabla(contenedor, {titulo, columnas, filas})` → tabla accesible.

- [ ] **Paso 1: Escribir las pruebas**

Crear `js/graficas.test.js` con casos para: `cargarChart()` devuelve `null` y **no lanza** cuando el `import()` falla; `disponible()` responde `false` en ese caso; `paleta()` devuelve los tres colores validados del modo claro y los del oscuro según el tema; y `montarTabla` produce una tabla con `<caption>`, encabezados con `scope="col"` y una fila por dato.

Para simular el fallo de carga, inyecta el cargador como parámetro o expón un punto de sustitución; **no toques la red en las pruebas**.

- [ ] **Paso 2: Correr y verificar que fallan**

- [ ] **Paso 3: Implementar**

`js/graficas.js`:

```javascript
// Chart.js is loaded lazily and defensively: a static import of a CDN took the
// whole app down in a previous delivery when the network was unreachable.
// Callers get null and fall back to the data table.
const URL_CHART = "https://esm.sh/chart.js@4.4.4/auto";

let promesa = null;
let cargado = null;

export async function cargarChart() {
  if (cargado) return cargado;
  if (!promesa) {
    promesa = import(/* @vite-ignore */ URL_CHART)
      .then((m) => { cargado = m.default || m.Chart; return cargado; })
      .catch(() => { promesa = null; return null; });
  }
  return promesa;
}

export function disponible() {
  return cargado !== null;
}
```

La paleta se lee de variables CSS que defines en `css/estilos.css`, de modo que
el modo oscuro cambie sola. Define en `:root` los valores claros y redefínelos
bajo `@media (prefers-color-scheme: dark)` con la guarda
`:root:not([data-theme="light"])`, y también bajo `:root[data-theme="dark"]`,
igual que ya hace el resto de la hoja:

```css
:root{
  --viz-1:#2a78d6; --viz-2:#eb6834; --viz-3:#1baf7a;
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){ --viz-1:#3987e5; --viz-2:#d95926; --viz-3:#199e70; }
}
:root[data-theme="dark"]{ --viz-1:#3987e5; --viz-2:#d95926; --viz-3:#199e70; }
```

- [ ] **Paso 4: Verificar que sin CDN nada se rompe**

Con un puerto nuevo, apunta `URL_CHART` a un host inexistente y comprueba en el
navegador que la app entera sigue funcionando, que la pestaña Progreso no truena
y que aparece la tabla en vez de la gráfica. Restaura y vuelve a comprobar con
CDN bueno. **Reporta las dos mediciones.**

- [ ] **Paso 5: Commit**

```bash
git add js/graficas.js js/tabla-datos.js js/graficas.test.js css/estilos.css tests.html
git commit -m "Carga diferida de Chart.js con tabla de datos como respaldo"
```

---

### Tarea 3: Peso corporal — datos y persistencia

La tabla `body_weight` existe desde la entrega 2 pero **nadie la escribe**.

**Archivos:**
- Crear: `js/peso-corporal.js`, `js/peso-corporal.test.js`, `sql/009_peso_corporal.sql`
- Modificar: `js/almacen.js`, `js/sync.js`, `tests.html`

**Interfaces:**
- `guardarPeso(fecha, kg)` → booleano, como `guardarRegistro`.
- `pesos()` → `[{fecha, kg}]` ordenado.
- `pesoDe(fecha)` → número o `null`.
- `LLAVE_PESOS` = `"hierro3:peso"`.

- [ ] **Paso 1: Escribir las pruebas**

Casos: guardar y leer; guardar dos veces la misma fecha reemplaza sin duplicar;
sale ordenado por fecha; un peso no numérico o negativo se rechaza (reutiliza el
conversor de `js/unidades.js`, **no escribas otro**); JSON corrupto se lee como
vacío; guardar encola un pendiente; si la escritura local falla no se encola.

- [ ] **Paso 2: Correr y verificar que fallan**

- [ ] **Paso 3: Escribir la migración**

`sql/009_peso_corporal.sql` con una función de escritura condicional para
`body_weight`, con la **misma forma** que `subir_registro_ejercicio` de `006`:
`security invoker`, `user_id` de `auth.uid()` (nunca parámetro), `set search_path`,
guarda por `editado_en`, y **su `revoke execute ... from public, anon` más el
`grant` a `authenticated` en la misma migración**. La columna `editado_en` ya
existe en `body_weight` desde la migración 006. Deja comentada la comprobación
para pegar en el editor SQL.

- [ ] **Paso 4: Implementar el módulo y conectarlo a la cola**

`js/peso-corporal.js` no toca `localStorage` directo: usa las funciones que le
agregues a `js/almacen.js`. `js/sync.js` gana el tipo de operación `"peso"`, que
sube por la función nueva y baja en `descargar()`, con las mismas reglas de
conflicto que el resto.

- [ ] **Paso 5: Correr y verificar que pasan**

- [ ] **Paso 6: Commit**

```bash
git add js/peso-corporal.js js/peso-corporal.test.js js/almacen.js js/sync.js sql/009_peso_corporal.sql tests.html
git commit -m "Registro de peso corporal, con su escritura condicional"
```

---

### Tarea 4: Gráficas por ejercicio

**Archivos:**
- Crear: `js/grafica-ejercicio.js`, `js/grafica-ejercicio.test.js`
- Modificar: `css/estilos.css`, `tests.html`

**Interfaces:**
- `montarGraficaEjercicio(contenedor, slug, unidad)` → dibuja las dos gráficas apiladas más su tabla.
- `datosDeEjercicio(slug, unidad)` → `{peso: [{fecha, valor}], volumen: [{fecha, valor}], suficientes: boolean}`. Pura, probable sin DOM.

- [ ] **Paso 1: Escribir las pruebas**

Casos para `datosDeEjercicio`: junta los registros de **todos los slots** del
mismo slug (el mismo ejercicio puede estar en varios días y dos veces en un
bloque); convierte el peso a la unidad activa sin tocar lo guardado; el volumen
se calcula **siempre en kg** y no cambia con el selector; `suficientes` es
`false` con menos de 2 puntos; y una serie donde falta el volumen (reps no
numéricas) dibuja peso pero no volumen, sin tronar.

- [ ] **Paso 2: Correr y verificar que fallan**

- [ ] **Paso 3: Implementar**

**Dos gráficas apiladas que comparten el eje de fechas**, nunca dos ejes Y en
una: peso arriba, volumen abajo. Kg y volumen viven en escalas distintas —22
contra 1,320— y superponerlas hace que dos curvas parezcan cruzarse cuando no
tienen relación.

Detalles que fija el diseño aprobado:
- Eje X de tipo tiempo, por fecha real.
- Ninguna de las dos líneas se fuerza a empezar en cero.
- Una sola serie por gráfica: **sin caja de leyenda**, el título la nombra.
- Marcadores de al menos 8 px y línea de 2 px; retícula horizontal tenue, sin
  vertical.
- Capa de hover con crosshair y tooltip, que es lo que hace legible una línea.
- Debajo, la tabla equivalente de `js/tabla-datos.js`, siempre presente.
- Si `cargarChart()` devuelve `null`, se dibuja **solo** la tabla, con una línea
  que explique que la gráfica necesita conexión la primera vez.

- [ ] **Paso 4: Verificar en el navegador**

Con un puerto nuevo: sembrar varias sesiones de un mismo ejercicio en fechas
distintas y comprobar que las dos gráficas salen alineadas por fecha, que el
selector kg/lb cambia la de peso **y no la de volumen**, que con un solo
registro aparece el mensaje de "faltan N" y no una gráfica, y que la tabla está.
Toma una captura y descríbela en el reporte.

- [ ] **Paso 5: Commit**

```bash
git add js/grafica-ejercicio.js js/grafica-ejercicio.test.js css/estilos.css tests.html
git commit -m "Gráficas de peso y volumen por ejercicio, apiladas sobre el mismo eje"
```

---

### Tarea 5: Gráfica de peso corporal

**Archivos:**
- Crear: `js/grafica-peso.js`, `js/grafica-peso.test.js`
- Modificar: `tests.html`

**Interfaces:**
- `montarGraficaPeso(contenedor, unidad)`.
- `datosDePeso(unidad, ventanaSemanas)` → `{puntos, promedio, suficientes}`.

- [ ] **Paso 1: Escribir las pruebas**

Casos: los puntos salen en la unidad activa; el promedio móvil de 4 semanas usa
`promedioMovil` de `js/metricas.js` (**no reimplementes el cálculo**); con menos
de 2 registros `suficientes` es `false`; y el promedio no aparece hasta que hay
4 puntos.

- [ ] **Paso 2: Correr y verificar que fallan**

- [ ] **Paso 3: Implementar**

- Línea de datos en el slot 1 de la paleta.
- **Promedio móvil del mismo color, punteado.** Es la misma entidad suavizada,
  no una segunda medición: darle otro color haría creer que mide otra cosa.
- **El eje Y no arranca en cero.** Un rango de 78–80 kg sobre un eje que empieza
  en 0 se ve como una raya plana y no comunica nada.
- Como hay 2 series, va leyenda; y como son 2, también etiqueta directa.
- Vista por mes con opción de ver todo el histórico.
- Campo para registrar el peso de esta semana, arriba de la gráfica.

- [ ] **Paso 4: Verificar en el navegador**

Sembrar 6 semanas de pesos y comprobar: la línea y el promedio punteado; que el
promedio empieza en el cuarto punto; que el eje no arranca en cero; y que
registrar el peso de la semana lo agrega sin recargar. Captura y descripción.

- [ ] **Paso 5: Commit**

```bash
git add js/grafica-peso.js js/grafica-peso.test.js tests.html
git commit -m "Gráfica de peso corporal con promedio móvil de cuatro semanas"
```

---

### Tarea 6: La pestaña Progreso

**Archivos:**
- Crear: `js/progreso.js`, `js/progreso.test.js`
- Modificar: `js/render.js`, `js/app.js`, `css/estilos.css`, `tests.html`

- [ ] **Paso 1: Escribir las pruebas**

Casos: la pestaña aparece después del día 7; lista **solo** los ejercicios con
registros, ordenados por el más reciente; sin ningún registro muestra un estado
vacío que explica qué hacer; y elegir un ejercicio monta sus gráficas.

- [ ] **Paso 2: Correr y verificar que fallan**

- [ ] **Paso 3: Implementar**

Estructura: arriba la tarjeta de peso corporal con su campo y su gráfica; abajo
la lista de ejercicios con registros; al tocar uno se abren sus dos gráficas.

La pestaña se integra al `dayNav` existente reutilizando sus clases y su
comportamiento de teclado, incluida la restitución del foco al repintar.

- [ ] **Paso 4: Verificar en el navegador**

Recorrer con teclado desde el día 1 hasta Progreso y de vuelta; comprobar que el
foco no se pierde; y que la pestaña funciona con y sin sesión.

- [ ] **Paso 5: Commit**

```bash
git add js/progreso.js js/progreso.test.js js/render.js js/app.js css/estilos.css tests.html
git commit -m "Pestaña Progreso con peso corporal y avance por ejercicio"
```

---

### Tarea 7: Mini-línea en el historial

**Archivos:**
- Modificar: `js/registro.js`, `css/estilos.css`
- Crear: `js/minilinea.js`, `js/minilinea.test.js`
- Modificar: `tests.html`

Donde hoy dice `Historial (N)` en cada ejercicio, una línea diminuta de las
últimas 8 sesiones, para ver la tendencia sin salir de la rutina.

- [ ] **Paso 1: Escribir las pruebas**

Casos: usa las últimas 8 sesiones y no más; con menos de 2 no dibuja nada;
es SVG inline y **no depende de Chart.js** (una mini-línea no justifica cargar
la librería en cada renglón de la pantalla que se usa entrenando); y lleva un
`aria-label` que resume la tendencia en palabras, porque una línea de 60 px no
comunica nada a un lector de pantalla.

- [ ] **Paso 2: Correr y verificar que fallan**

- [ ] **Paso 3: Implementar**

SVG a mano, con `--viz-1` como color y `preserveAspectRatio` para que no se
deforme. Sin interacción: es un indicador, no una gráfica.

- [ ] **Paso 4: Verificar en el navegador**

Que aparece en los ejercicios con historial, que no deja hueco en los que no lo
tienen, y que no ralentiza el dibujado de un día completo.

- [ ] **Paso 5: Commit**

```bash
git add js/minilinea.js js/minilinea.test.js js/registro.js css/estilos.css tests.html
git commit -m "Mini-línea de tendencia junto al historial de cada ejercicio"
```

---

## Cierre de la entrega

- [ ] Todas las pruebas en verde en `tests.html`.
- [ ] Con el CDN de Chart.js inalcanzable, la app funciona completa y Progreso
      muestra tablas en vez de gráficas (verificado en un puerto nuevo).
- [ ] Ninguna gráfica tiene dos ejes Y.
- [ ] El selector kg/lb cambia el peso y **no** el volumen.
- [ ] Cada gráfica tiene su tabla equivalente.
- [ ] `sql/009_peso_corporal.sql` aplicado, con su `revoke` comprobado: sin
      sesión, la función nueva responde `permission denied`.
- [ ] El peso corporal sincroniza entre dispositivos con la misma guarda de
      tiempo que los registros.
- [ ] README actualizado con la pestaña Progreso.

## Lo que este plan no incluye

Detección de estancamiento y sugerencias de carga. El diseño aprobado la dejó
fuera a propósito: calibrar "llevas 3 sesiones sin subir, cambia el ejercicio"
requiere datos acumulados que apenas ahora se empiezan a tener. Es candidata a
una entrega 4, ya con historial real encima.
