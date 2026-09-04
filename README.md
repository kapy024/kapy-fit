# kapy-fit — Registro de Hierro

Bitácora personal de entrenamiento en HTML/JS puro — módulos ES nativos, sin
`npm`, sin build. Pensada para usarse desde el iPhone (incluso con señal mala
en el gimnasio) y desde una computadora, y publicarse con GitHub Pages.

- Rutina de 7 días: día 1 bíceps y tríceps, día 2 core, día 3 pierna, día 4
  pecho y hombro, día 5 espalda, día 6 pierna 2, día 7 descanso. Algunos días
  tienen variantes (p. ej. "Brazo 1" / "Brazo 2") seleccionables con un
  selector de bloques.
- Registro de peso, series y reps por ejercicio, con un historial desplegable
  por ejercicio ("Historial (N)") que junta las sesiones pasadas de ese
  ejercicio sin importar en qué día o variante se registraron.
- Selector de unidad **kg / lb**: la conversión es solo de presentación — lo
  guardado siempre está en kilos.
- Contador de completados por sesión ("N / M completados") y un botón
  "Reiniciar" que borra las palomitas de hoy del bloque visible (con
  confirmación previa) sin tocar pesos, series, reps ni el historial.
- Modo edición de la rutina propia: sustituir un ejercicio por otro del
  catálogo, cambiar peso objetivo/series/reps, reordenar o quitar un renglón
  de un bloque — nunca borra el historial ya guardado de ese renglón, ni
  siquiera al quitarlo o sustituirlo.
- Demostración visual de dos fotogramas (inicio/fin del movimiento) por
  ejercicio, con imágenes de dominio público — se detiene automáticamente
  fuera de pantalla.
- Temporizador de descanso y enlaces de técnica (YouTube/MuscleWiki) por
  ejercicio; enlaces a Google Calendar y descarga de `.ics` por bloque.
- **Cuenta opcional**, por enlace mágico de correo (sin contraseña, vía
  Supabase). Sin sesión, la app funciona igual que siempre, completamente
  local. Con sesión, sincroniza entre dispositivos:
  - **Sí se sube**: los registros de ejercicio (peso/series/reps/hecho por
    día), las ediciones a la rutina propia y la preferencia de unidad.
  - **Nunca sale del dispositivo**: el catálogo de ejercicios, las imágenes,
    el temporizador y cualquier otro dato de la interfaz — no hay tabla para
    eso en el servidor.
  - Todo pasa primero por `localStorage`, sesión o no — un guardado nunca
    espera a la red — y una cola de pendientes (también en `localStorage`)
    se drena hacia Supabase en segundo plano, con reintento automático.
    `js/almacen.js` es el único módulo que toca `localStorage`.
  - La única dependencia cargada desde una CDN es `supabase-js`
    (`esm.sh`), y solo como *import dinámico* dentro de `js/db.js`: si esa
    CDN no responde, el resto de la app (rutina, registro, historial) sigue
    funcionando igual, local.

## Estructura

`index.html` es solo el cascarón (marcado estático) y `css/estilos.css` los
estilos; toda la lógica vive en módulos ES bajo `js/`, cargados desde
`js/app.js` (el punto de entrada):

| Módulo | Responsabilidad |
|---|---|
| `app.js` | Arranca la app: conecta nav, unidad kg/lb, aviso de migración y el pie "último reinicio". |
| `render.js` | Pinta días, bloques y ejercicios a partir de `RUTINA`/`CATALOGO`. Sin `localStorage` propio. |
| `registro.js` | Capa de captura por ejercicio: campos peso/series/reps, la palomita, el temporizador de descanso y el panel de historial. |
| `rutina.js` | Los 7 días como datos puros, con el `slot` (identidad de cada renglón) derivado en la carga. |
| `catalogo.js` | Catálogo de ejercicios: nombre, video, imágenes de demostración. |
| `unidades.js` | Conversión kg ⇄ lb y parseo numérico tolerante (coma decimal, etc.). |
| `almacen.js` | Único módulo que lee/escribe `localStorage`: registros, preferencias, migración, último reinicio, ediciones de rutina y la cola de pendientes por sincronizar. |
| `editor-rutina.js` | Modo edición de la rutina propia: sustituir, cambiar valores, reordenar, quitar. Persiste vía `almacen.js`; nunca toca el historial de un renglón. |
| `db.js` | Único módulo que habla con la red. Construye el cliente de Supabase (import dinámico de `supabase-js` desde `esm.sh`, nunca estático) a partir de `config.js`. |
| `auth.js` | Autenticación por enlace mágico (sin contraseña), sobre el cliente de `db.js`. Cerrar sesión nunca toca `localStorage`: los datos del entrenamiento se quedan donde están. |
| `sesion-ui.js` | Pinta el formulario de correo / estado de sesión y lo conecta a `auth.js`. |
| `sync.js` | Sincronización en segundo plano: drena la cola de `almacen.js` hacia Supabase con reintento, resuelve conflictos por fecha de edición (no por quién sincronizó al último) y baja el historial de la cuenta al iniciar sesión. |
| `calendario.js` | Construye los enlaces de Google Calendar y el contenido `.ics`. |
| `imagenes.js` | Anima las dos imágenes de demostración por ejercicio y detiene las que salen de pantalla. |
| `migracion.js` | Traduce las llaves de `localStorage` de versiones anteriores al formato actual. |
| `mapa-legado.js` | Tabla de datos que usa `migracion.js` para esa traducción. |
| `pruebas.js` | Corredor de pruebas propio (sin dependencias): `test`, `assertEq`, etc. |

Cada registro se guarda bajo su **`slot`** (día + bloque + ejercicio, con
sufijo `#2`, `#3`… cuando el mismo ejercicio se repite en un bloque) y
también lleva su **`slug`**, que es lo que `historial(slug)` usa para seguir
a un ejercicio a través de días y variantes. El `slot` es una identidad
estable por renglón: quitar, sustituir o reordenar otro ejercicio del mismo
bloque nunca le cambia el slot (ni el historial que apunta a él) a uno que
no cambió.

`config.js` trae la URL y la anon key (pública por diseño) del proyecto de
Supabase; `sql/` tiene el esquema, las políticas de Row Level Security y las
funciones que corren ahí (ver `sql/README.md` para el orden de aplicación y
las comprobaciones de cada una).

## Uso

Abrir `index.html` en el navegador, o publicarlo con GitHub Pages (Settings
→ Pages → branch `main`, carpeta `/`).

## Pruebas

Las pruebas están en `js/*.test.js` y corren en el navegador vía
`tests.html` — **debe servirse por HTTP**, no abrirse como `file://`, porque
los módulos ES nativos no cargan bajo ese protocolo:

```sh
python3 -m http.server 8123
# luego abrir http://localhost:8123/tests.html
```

`tests.html` importa cada `*.test.js`, corre todos los casos registrados y
muestra un resumen (PASA/FALLA por caso, total al final). Ninguna prueba
toca la red real ni un proyecto de Supabase real: las que ejercitan
`db.js`/`auth.js`/`sync.js` inyectan un doble del cliente (ver, por
ejemplo, `js/sync.test.js`), así que corren igual con o sin conexión y
nunca escriben en ninguna base de datos de verdad.

Si editas un módulo y las pruebas no parecen reflejar el cambio, es casi
siempre caché del navegador sobre el grafo de módulos ES — no basta con
recargar; sirve la app desde un puerto nuevo (`python3 -m http.server
<otro-puerto>`) o fuerza la recarga sin caché.
