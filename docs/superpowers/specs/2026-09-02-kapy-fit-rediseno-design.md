# Registro de Hierro — rediseño: Supabase, gráficas y nuevo split

Fecha: 2026-09-02
Estado: aprobado, listo para plan de implementación

## 1. Problema

`index.html` es hoy un archivo único de 1,327 líneas que guarda todo en
`localStorage` con llaves posicionales (`hierro:<día>:<variante>:<índice>`).
Eso deja cuatro problemas:

1. El botón de Google Calendar no funciona.
2. El progreso vive solo en un navegador: no sincroniza ni sobrevive a limpiar
   el caché.
3. No hay forma de ver si estás avanzando — ni por ejercicio ni de peso corporal.
4. Los días no están organizados como entrena el usuario, y las llaves
   posicionales impiden reorganizarlos sin perder el historial.

El objetivo de fondo es poder **mejorar la rutina con datos**, no solo registrarla.

## 2. Decisiones tomadas

| Tema | Decisión |
|---|---|
| Alcance de usuarios | Multiusuario desde el inicio |
| Edición de rutina | Plantilla oficial clonada por usuario, editable por el usuario. El constructor completo de rutinas queda para una fase posterior |
| Código | Módulos ES nativos, sin build ni npm. GitHub Pages sirve el repo tal cual |
| Autenticación | Supabase Auth con magic link. Sin contraseñas |
| Imágenes de ejercicio | `yuhonas/free-exercise-db`, licencia Unlicense (dominio público), auto-hospedadas en el repo |
| Gráficas | Chart.js v4 por CDN en módulo ES |
| Unidades | kg canónico en base de datos; lb solo como presentación |

### No entra en este alcance

- Constructor de rutinas desde cero (fase posterior).
- Detección de estancamiento y sugerencias automáticas de carga (fase posterior:
  requiere datos acumulados para calibrarse).
- App nativa o PWA instalable.

## 3. El split

Reglas del usuario: en día de pierna son obligatorios abductores y aductores;
el abdomen (crunch y planchas) va un día sí y un día no. Los días 1 a 3 los
definió el usuario; el resto se propuso y fue aprobado.

| Día | Enfoque | Abdomen | Notas |
|---|---|---|---|
| 1 | Bíceps y tríceps | — | conserva las 2 variantes de brazo actuales |
| 2 | Core | ✅ día completo | crunch, planchas, elevación de cadera |
| 3 | Pierna | — | abductores + aductores obligatorios |
| 4 | Pecho y hombro (empuje) | ✅ bloque | press pectoral, inclinado, aperturas, elevaciones |
| 5 | Espalda (dorsales) | — | conserva las 3 variantes de dorsales |
| 6 | Pierna 2 | ✅ bloque | abductores + aductores obligatorios |
| 7 | Descanso | — | |

Razones de diseño:

- **Abdomen en 2, 4 y 6.** Cumple la alternancia exacta. Hubo un choque entre
  las dos reglas del usuario: si el día 2 es Core completo, el abdomen no puede
  caer también en el día 1. Se resolvió anclando el abdomen a los días pares.
- **Pierna en 3 y 6.** 72 horas de separación entre sesiones de tren inferior.
- **Brazo el día 1, empuje el 4, jalón el 5.** Ningún grupo se repite con menos
  de tres días de por medio: el bíceps se vuelve a cargar hasta los remos del
  día 5 y el tríceps hasta los press del día 4.

### Catálogo

Los 42 ejercicios actuales se conservan. **Falta dar de alta "aducción de
cadera"**, que hoy no existe y es obligatorio por la regla de pierna.

Cada ejercicio pasa a tener un **slug estable** que es su identidad en todo el
sistema: los registros apuntan al slug, nunca a la posición en el día.

## 4. Modelo de datos

### Catálogo compartido

`exercises` — una fila por ejercicio: `slug` (PK), `name_es`, `video_url`,
`image_start`, `image_end`, `primary_muscle`, `equipment`. Lectura para todos,
escritura solo del dueño del proyecto. Es el único lugar donde se define un
ejercicio.

### Rutina, en cuatro niveles

```
routines  →  routine_days  →  routine_blocks  →  routine_exercises
```

- `routines` — `id`, `user_id` (NULL = plantilla oficial), `name`.
- `routine_days` — `routine_id`, `position`, `label`, `focus`, `abs_block`.
- `routine_blocks` — las variantes (Bíceps 1/2, Pierna 1/2/3). Un día sin
  variantes tiene **un solo bloque implícito**, de modo que el árbol es uniforme
  y el código de render no necesita dos caminos distintos.
- `routine_exercises` — `block_id`, `position`, `exercise_slug`, `sets`, `reps`,
  `target_weight_kg`, `rest`, `note`.

Al registrarse un usuario, un trigger de Postgres **clona la plantilla completa**
a filas propias. El dueño del proyecto recibe también su clon y simplemente no lo
edita: sale más simple que tratarlo como caso especial, y deja la puerta abierta
a que edite después.

### Registro

`exercise_logs` — `user_id`, `slot`, `exercise_slug`, `logged_on`, `weight_kg`,
`sets`, `reps`, `completed`.

El log se identifica por **`slot`** (el renglón concreto de la rutina: día +
bloque + ejercicio, con un sufijo de ocurrencia cuando el mismo ejercicio
aparece dos veces en un bloque — el día 1 hace dos series de press militar),
no por el slug a secas: dos series del mismo ejercicio en una misma sesión
son dos renglones independientes, y si el log solo llevara el slug la
segunda pisaría a la primera. El **`exercise_slug`** viaja también en cada
renglón, pero no como identidad — como hilo conductor: es lo que permite
seguir a un ejercicio a través de días y variantes (el historial de
sentadilla junta sus renglones sin importar en qué día o bloque se
registraron, y sobrevive a reordenar el split o mover el ejercicio de día),
que es justo lo que necesitan las gráficas por ejercicio de la entrega 3.
Marcar un ejercicio como hecho *es* escribir un renglón: la palomita y el
historial son la misma tabla.

`body_weight` — `user_id`, `measured_on`, `weight_kg`. Único por usuario y día.

### Acceso

Supabase Auth con magic link al correo. RLS en todas las tablas contra
`auth.uid()`. Sobre `routines` y sus hijas hay además una política de SELECT que
permite leer la plantilla oficial (`user_id IS NULL`).

La *anon key* se commitea al repo público: está diseñada para ser pública y RLS
es lo que protege los datos. **La service_role key nunca entra al repo.**

Prerequisito externo: el usuario debe crear el proyecto en supabase.com y
entregar la URL y la anon key. Las migraciones SQL se dejan listas para correr.

## 5. Gráficas

Pestaña nueva **Progreso**, al lado de los 7 días:

- Arriba: peso corporal, con su campo para registrar el de la semana.
- Abajo: lista de ejercicios con registros; al tocar uno se abren sus gráficas.

Además, donde hoy dice `Historial (0)` en cada ejercicio va una **mini-línea**
de las últimas 8 sesiones.

### Formas

**Progreso por ejercicio: dos gráficas apiladas que comparten el eje de fechas.**
Peso (kg) arriba, volumen (peso × series × reps) abajo.

No van superpuestas. Kg y volumen viven en escalas distintas — 22 contra 1,320 —
y juntarlas obliga a dos ejes Y, que hace que dos curvas parezcan cruzarse cuando
no tienen relación. Apiladas se leen igual de rápido sin la distorsión.

Se grafican las dos porque el peso solo miente: pasar de 20 kg × 15 a 22 kg × 10
sube la línea de peso y baja el volumen real.

**Peso corporal: una línea con los registros semanales más un promedio móvil de
4 semanas.** El promedio va en el mismo color que los datos pero punteado — es la
misma entidad suavizada, no otra serie. El peso diario brinca ±1.5 kg por agua y
comida; sin suavizar se lee ruido como tendencia. Vista por mes, con opción de
histórico completo.

### Reglas de eje

- **Las barras arrancan en cero; las líneas no.** Forzar la gráfica de peso
  corporal a empezar en 0 aplasta el rango 78–80 kg contra el techo.
- Eje X por **fecha real**, no por sesión consecutiva, para que las semanas
  ausentes se vean como hueco.

### Paleta

Se validó primero la paleta de marca (terracota `#B8451D` + musgo `#516B4F`) y
**reprobó**: el musgo cae bajo el piso de croma (se lee gris) y contra la
terracota da ΔE 6.4 en protanopía. La paleta adoptada pasa las seis
validaciones en claro y oscuro, con todos los pares:

| Slot | Claro | Oscuro |
|---|---|---|
| 1 | `#2a78d6` azul | `#3987e5` |
| 2 | `#eb6834` naranja | `#d95926` |
| 3 | `#1baf7a` aqua | `#199e70` |

Máximo 3 series por gráfica. El aqua en modo claro queda bajo 3:1 de contraste,
así que esa serie **siempre lleva etiqueta directa**. Toda gráfica lleva su tabla
equivalente para lectores de pantalla.

### Estado vacío

Con menos de 2 registros no se dibuja nada: se muestra "llevas 1 de 2 registros
para ver tu avance". Una gráfica de un punto es peor que ninguna.

### Unidades

Selector kg / lb en el perfil. Aplica a objetivos, campos de captura, gráficas y
peso corporal. **En base de datos siempre kg**; la libra es solo presentación.
Guardar la unidad junto al número es cómo se corrompen estos datos: basta un
registro sin etiqueta para no saber si 80 fueron kilos o libras.

## 6. Arquitectura

```
index.html            cascarón y montaje
config.js             URL + anon key de Supabase
css/estilos.css       lo que hoy vive en el <style>
js/auth.js            magic link, sesión
js/db.js              única capa que toca la red
js/sync.js            cola local → Supabase
js/rutina.js          render de días, bloques y ejercicios
js/registro.js        captura, palomita, temporizador
js/graficas.js        Chart.js y las tres gráficas
js/peso-corporal.js   registro semanal
js/unidades.js        kg ⇄ lb
js/calendario.js      Google Calendar y .ics
data/ejercicios/      imágenes del banco libre
scripts/              utilidades de mantenimiento (no se sirven)
sql/                  migraciones numeradas
tests.html            corredor de pruebas
```

Cada módulo tiene una responsabilidad y `db.js` es la única capa que toca la red.

### Local primero

Toda escritura cae **primero en localStorage y en una cola de pendientes**;
`sync.js` la vacía a Supabase cuando hay red. Las lecturas salen del caché local.

Esto no es opcional: se entrena en un gimnasio, donde el wifi es malo y los datos
entran y salen. Si cada palomita fuera un `INSERT` directo, la serie registrada
sin señal se perdería en silencio. Con la cola, la app funciona completa offline y
se pone al corriente sola.

### Migración del historial existente

Las llaves actuales (`hierro:dia1:_:5`) son posicionales. Al reorganizar el split
esa posición apunta a otro ejercicio, así que el historial **no se puede copiar
tal cual**: hay que traducir posición → slug usando el arreglo `DAYS` actual,
congelado como tabla de equivalencia.

Al primer login se ofrece importar, se muestra qué encontró antes de escribir, y
**no se borra el localStorage** hasta que el usuario confirme.

## 7. Google Calendar

Causa raíz: `window.open()` no es un clic directo sobre un enlace, así que el
bloqueador de ventanas emergentes lo mata sin aviso; en Safari e iOS falla casi
siempre.

Arreglo: un `<a href target="_blank" rel="noopener">` con apariencia de botón —
mismo aspecto, pero es navegación real y no se bloquea. Se agrega además un botón
de **descargar `.ics`**, que es lo que sirve al abrir desde iPhone con Apple
Calendar. La URL que ya se construye es correcta y se conserva.

## 8. Imágenes de ejercicio

Fuente: `yuhonas/free-exercise-db` — 876 ejercicios, 873 con imágenes, licencia
Unlicense (dominio público). Verificado el 2026-09-02.

Cobertura medida contra los 43 ejercicios del catálogo: **41 con match fuerte**,
incluida la aducción que falta. El mapeo automático produjo errores reales
("subida al banco" cayó en una lagartija), así que `data/mapeo-imagenes.json` se
**cura a mano**, ejercicio por ejercicio. `scripts/fetch-imagenes.mjs` descarga
según ese mapeo.

Presentación: las dos imágenes (inicio y fin) se alternan cada 800 ms bajo el
ejercicio. Carga diferida, y se pausan con `IntersectionObserver` cuando salen de
pantalla para no gastar batería con 40 animaciones corriendo. El ejercicio sin
match conserva únicamente su enlace de video.

## 9. Pruebas

Sin npm no hay Jest, pero la lógica que puede romperse en silencio es pura:
conversión kg/lb, cálculo de volumen, promedio móvil, manejo de fechas y sobre
todo el traductor de posición → slug. Van en `tests.html`, un corredor con
aserciones que se abre en el navegador y reporta qué pasó y qué falló.

El render y los flujos se verifican en el navegador antes de entregar cada parte.

## 10. Entregas

1. **Fundación** — split nuevo de 7 días, slugs estables, alta de aducción de
   cadera, arreglo de Calendar, imágenes de ejercicio, selector kg/lb, separación
   en módulos. Sigue en localStorage. Deja una app mejor de inmediato, sin
   depender de Supabase.
2. **Supabase** — esquema, RLS, magic link, clonado de plantilla, importación del
   historial local, edición de rutina. **Bloqueada** hasta recibir la URL y la
   anon key del proyecto.
3. **Gráficas** — Chart.js, las tres gráficas, peso corporal semanal, mini-líneas.
   Va al final a propósito: para entonces ya habrá la semana de datos que hace
   falta para que signifiquen algo.

## 11. Riesgos

| Riesgo | Mitigación |
|---|---|
| El mapeo de imágenes queda mal en ejercicios de máquina específicos | Curación manual y revisión visual; el que no cuadre se queda solo con video |
| La entrega 2 se bloquea si no llegan las credenciales | La entrega 1 no depende de Supabase y deja la app usable |
| La importación del historial traduce mal una posición | Se muestra la equivalencia antes de escribir y no se borra el localStorage |
| Chart.js por CDN no carga | La lista de registros y la tabla de datos se renderizan sin la librería |
