# kapy-fit — Registro de Hierro

Bitácora personal de entrenamiento en HTML/JS puro — módulos ES nativos, sin
`npm`, sin build, sin CDN. Pensada para usarse desde el iPhone y publicarse
con GitHub Pages.

- Rutina de 7 días: día 1 bíceps y tríceps, día 2 core, día 3 pierna, día 4
  pecho y hombro, día 5 espalda, día 6 pierna 2, día 7 descanso. Algunos días
  tienen variantes (p. ej. "Brazo 1" / "Brazo 2") seleccionables con un
  selector de bloques.
- Registro de peso, series y reps por ejercicio, con un historial desplegable
  por ejercicio ("Historial (N)") que junta las sesiones pasadas de ese
  ejercicio sin importar en qué día o variante se registraron.
- Selector de unidad **kg / lb**: la conversión es solo de presentación — lo
  guardado en `localStorage` siempre está en kilos.
- Contador de completados por sesión ("N / M completados") y un botón
  "Reiniciar" que borra las palomitas de hoy del bloque visible (con
  confirmación previa) sin tocar pesos, series, reps ni el historial.
- Demostración visual de dos fotogramas (inicio/fin del movimiento) por
  ejercicio, con imágenes de dominio público — se detiene automáticamente
  fuera de pantalla.
- Temporizador de descanso y enlaces de técnica (YouTube/MuscleWiki) por
  ejercicio; enlaces a Google Calendar y descarga de `.ics` por bloque.
- Todo se guarda en `localStorage` del navegador (los datos no salen del
  dispositivo). `js/almacen.js` es el único módulo que toca `localStorage`.

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
| `almacen.js` | Único módulo que lee/escribe `localStorage` (registros, preferencias, migración, último reinicio). |
| `calendario.js` | Construye los enlaces de Google Calendar y el contenido `.ics`. |
| `imagenes.js` | Anima las dos imágenes de demostración por ejercicio y detiene las que salen de pantalla. |
| `migracion.js` | Traduce las llaves de `localStorage` de versiones anteriores al formato actual. |
| `mapa-legado.js` | Tabla de datos que usa `migracion.js` para esa traducción. |
| `pruebas.js` | Corredor de pruebas propio (sin dependencias): `test`, `assertEq`, etc. |

Cada registro se guarda bajo su **`slot`** (día + bloque + ejercicio, con
sufijo `#2`, `#3`… cuando el mismo ejercicio se repite en un bloque) y
también lleva su **`slug`**, que es lo que `historial(slug)` usa para seguir
a un ejercicio a través de días y variantes.

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
muestra un resumen (PASA/FALLA por caso, total al final). Si editas un
módulo y las pruebas no parecen reflejar el cambio, es casi siempre caché
del navegador sobre el archivo `.js` — recarga forzando caché o vuelve a
pedir el recurso con un parámetro distinto en la URL.
