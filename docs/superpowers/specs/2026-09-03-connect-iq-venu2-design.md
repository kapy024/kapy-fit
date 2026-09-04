# Connect IQ para Venu 2 — captura rápida de series desde la muñeca

Fecha: 2026-09-03
Estado: aprobado, listo para plan de implementación

## 1. Problema

Hoy el registro de series solo se puede capturar desde el navegador
(`js/registro.js`), lo que obliga a sacar el teléfono entre series. El
usuario tiene un Garmin Venu 2 (además de un D2 y un Galaxy Watch Ultra) y
quiere poder registrar peso/series/reps y correr el temporizador de descanso
directamente desde el reloj, sin sacar el teléfono, mientras entrena.

## 2. Decisiones tomadas

| Tema | Decisión |
|---|---|
| Dispositivo objetivo del MVP | Garmin Venu 2 (soporta Connect IQ). D2 y Galaxy Watch Ultra quedan fuera — ver §7 |
| Alcance funcional | Solo captura rápida: elegir día/bloque, avanzar ejercicio por ejercicio con peso/series/reps, temporizador de descanso con vibración. No navega el catálogo completo ni muestra imágenes/video |
| Fuente de la rutina | El reloj lee `routine_days`/`routine_blocks`/`routine_exercises` de Supabase (entrega 2) — no se duplica `rutina.js` en Monkey C |
| Autenticación del reloj | Token de dispositivo + Edge Function de intercambio por JWT corto (§3). Nunca se copia el JWT secret ni la service_role key al reloj |
| Modo offline | Cola local en el reloj + reintento en segundo plano, calcado del patrón que ya existe en la web (`almacen.js` + sincronización con reintento) |
| Lenguaje / SDK | Monkey C, Connect IQ SDK. Sideload por USB con dev key propia — no requiere pasar por el Connect IQ Store para uso personal |

### No entra en este alcance

- Registro nativo en el D2 o app para el Galaxy Watch Ultra (Wear OS es un
  stack aparte: Kotlin/Compose).
- Navegación completa de la rutina, imágenes o videos de técnica en el reloj.
- Gráficas en el reloj (entrega 3 sigue siendo solo web).
- Constructor de rutinas desde el reloj.

## 3. Arquitectura de backend: auth del reloj

Un reloj Connect IQ no puede completar un login por magic link (no hay
navegador). En vez de escribir una ruta de inserción a la medida, se usa un
**intercambio de token** que reutiliza la API REST y las políticas RLS que
Supabase ya genera para `routine_days`/`routine_blocks`/`routine_exercises`
(lectura) y `exercise_logs` (escritura):

- **Tabla nueva** `device_tokens` (migración `sql/008_device_tokens.sql`):
  `id`, `user_id`, `token` (aleatorio, generado una vez a mano), `label`
  (p. ej. `"Venu 2"`), `revoked_at`. RLS la deja cerrada a cualquier cliente
  — solo la toca la Edge Function, con `service_role`.
- **Edge Function nueva** `device-token-exchange`: recibe el `device_token`
  del reloj, lo valida contra `device_tokens` (rechaza si no existe o está
  revocado), y firma un JWT de **corta duración (1 hora)** para el
  `user_id` dueño de ese token, usando el JWT secret del proyecto — ese
  secret vive solo como variable de entorno de la función, nunca en el
  reloj ni en el repo.
- **De ahí en adelante**, el reloj usa ese JWT corto directo contra
  PostgREST — lectura de `routine_*` sujeta a RLS, escritura a través de la
  RPC `subir_registro_ejercicio` que ya existe (§4), también sujeta a RLS
  (`security invoker`). No hay una segunda ruta de escritura a la medida: la
  única lógica de negocio nueva de este proyecto es el intercambio de token.
- **Revocar** un reloj perdido = borrar su fila en `device_tokens`. El JWT
  ya emitido sigue vivo hasta que caduque (máx. 1 hora); después el reloj no
  puede renovarlo.

## 4. Flujo en el reloj

Cuatro pantallas, navegación lineal (touchscreen + los dos botones físicos
como atajo siguiente/anterior):

1. **Selector de día** — lista los `routine_days` del usuario (ya clonados
   de la plantilla oficial en la entrega 2). Recuerda el último día elegido
   en el almacenamiento local del reloj como default; siempre se puede
   cambiar.
2. **Selector de bloque** — solo aparece si el día tiene más de un bloque
   (p. ej. "Brazo 1"/"Brazo 2"); si hay uno solo, se salta directo al
   paso 3.
3. **Captura por ejercicio** — un ejercicio a la vez, en el orden de
   `routine_exercises`. Nombre del ejercicio y tres steppers grandes (+/－)
   para **peso** (paso configurable, default 1.25/2.5 kg), **series** y
   **reps**. "Guardar" hace el POST (o lo encola, ver §5) y avanza al
   siguiente ejercicio del bloque. Swipe o botón físico para saltar sin
   registrar.
4. **Temporizador de descanso** — se dispara automático al guardar (usa el
   `descanso` de `routine_exercises` si lo trae, si no un default), cuenta
   regresivo en pantalla y **vibra** al terminar. Se puede cancelar o
   extender.

Cada registro se envía por la **misma RPC que usa la web**,
`subir_registro_ejercicio` (`sql/006_edicion_cliente.sql`), vía
`POST /rest/v1/rpc/subir_registro_ejercicio` con el JWT corto del reloj —
nunca un `insert`/`upsert` directo a `exercise_logs`. Esa función solo pisa
la fila si `p_editado_en` es más nuevo que lo que el servidor ya tiene: es
la corrección (commit `b70eb1e`) contra la pérdida silenciosa de datos entre
dispositivos (dos relojes o reloj+web escribiendo el mismo slot). El reloj
debe sellar `editado_en` con la hora local **en el momento de capturar la
serie**, no en el momento de enviarla — el mismo campo que `marcaDe()` usa
en `almacen.js` — para que una serie que pasó un rato en la cola offline
(§5) siga comparándose por cuándo se hizo, no por cuándo por fin hubo señal.

## 5. Persistencia y cola offline

Mismo patrón que ya existe en la web, portado a Monkey C vía el Object Store
del reloj:

- Se guarda: el `device_token`, el JWT vigente + su expiración, la caché de
  la última rutina leída (día/bloque/ejercicios — para seguir navegando
  aunque el teléfono se aleje un momento), y una **cola de registros
  pendientes** por enviar.
- Al guardar una serie: se escribe primero en la cola local (nunca se
  pierde), luego se intenta el POST de inmediato. Si falla (sin conexión,
  JWT caducado, teléfono fuera de rango de Bluetooth), se queda en la cola.
- Un timer en segundo plano reintenta la cola periódicamente mientras el app
  está abierto. Si el JWT caducó, primero lo renueva vía
  `device-token-exchange` y luego vacía la cola.
- Un fallo de red no bloquea el flujo: se puede seguir capturando el
  siguiente ejercicio aunque el anterior siga en cola.

## 6. Pruebas

Connect IQ trae su propio framework de unit tests (funciones anotadas
`(:test)`, corridas con el SDK vía el simulador), sin dependencias externas
— misma filosofía que el corredor propio `js/pruebas.js`. Cubre:

- Construcción del payload de un registro (slot/slug/fecha/peso/series/reps).
- Lógica de la cola: encolar, vaciar al reintentar, reintentar tras renovar
  el JWT.
- Cálculo del temporizador de descanso.
- Parseo de la respuesta de `device-token-exchange` (éxito, token revocado,
  error de red).

Lo que no se puede probar así (llamadas reales `makeWebRequest`, vibración,
UI) se valida a mano en el simulador y después en el Venu 2 real.

## 7. Futuro (fuera de este spec)

- Agregar el D2 al `manifest.xml` una vez validado el Venu 2 — mismo Monkey
  C, ambos dispositivos soportan Connect IQ.
- Una app para el Galaxy Watch Ultra (Wear OS, Kotlin/Compose) es un
  proyecto aparte con su propio spec.
