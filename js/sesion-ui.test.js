// Exercises montarSesion() with fake collaborators (see DEPENDENCIAS_REALES
// in sesion-ui.js) instead of real auth.js/db.js calls, so these tests are
// deterministic and never touch the network.
import { test, assertEq } from "./pruebas.js";
import { montarSesion } from "./sesion-ui.js";

function depsFalsas(sobrescribir) {
  return {
    sesionActual: async () => null,
    enviarEnlace: async () => ({ ok: true, detalle: "enlace enviado" }),
    cerrarSesion: async () => ({ ok: true, detalle: "sesión cerrada" }),
    alCambiarSesion: () => () => {},
    correoValido: (texto) => /@/.test(texto || ""),
    libreriaDisponible: async () => true,
    ...sobrescribir
  };
}

// Lets every pending .then() callback scheduled earlier in the test actually
// run before the assertions that depend on them. A macrotask (not another
// microtask) is used deliberately: it fires only once the microtask queue is
// fully drained, regardless of how many .then() hops a given chain needs.
function esperarMicrotareas() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

test("el resultado más reciente de la sesión gana, no el que llega al azar", async () => {
  const contenedor = document.createElement("div");
  let listener = null;
  let resolverSesionActual;
  const promesaSesionActual = new Promise((resolve) => { resolverSesionActual = resolve; });
  const sesionValida = { user: { email: "juan@example.com" } };

  montarSesion(contenedor, depsFalsas({
    alCambiarSesion: (fn) => { listener = fn; return () => {}; },
    sesionActual: () => promesaSesionActual
  }));

  // El listener llega primero con una sesión activa...
  listener(sesionValida);
  await esperarMicrotareas();
  assertEq(contenedor.querySelector(".sesion-correo").textContent, "juan@example.com");

  // ...y sesionActual() resuelve después con null (sesión lenta o ya vencida
  // por el momento en que responde). No debe pisar lo que ya se pintó.
  resolverSesionActual(null);
  await esperarMicrotareas();
  assertEq(contenedor.querySelector(".sesion-correo").textContent, "juan@example.com");
  assertEq(contenedor.querySelector(".sesion-input"), null);
});

test("si sesionActual() responde primero, su resultado se pinta", async () => {
  const contenedor = document.createElement("div");
  let listener = null;

  montarSesion(contenedor, depsFalsas({
    alCambiarSesion: (fn) => { listener = fn; return () => {}; },
    sesionActual: async () => null
  }));

  await esperarMicrotareas();
  assertEq(contenedor.querySelector(".sesion-input") !== null, true);

  // Un cambio real y posterior (login) sigue aplicando sin problema.
  listener({ user: { email: "juan@example.com" } });
  await esperarMicrotareas();
  assertEq(contenedor.querySelector(".sesion-correo").textContent, "juan@example.com");
});

test("montarSesion es idempotente: una segunda llamada no duplica el bloque ni la suscripción", async () => {
  const contenedor = document.createElement("div");
  let suscripciones = 0;
  const deps = depsFalsas({
    alCambiarSesion: () => { suscripciones++; return () => {}; }
  });

  montarSesion(contenedor, deps);
  montarSesion(contenedor, deps);
  await esperarMicrotareas();

  assertEq(contenedor.querySelectorAll(".sesion").length, 1);
  assertEq(suscripciones, 1);
});

test("sin la librería disponible se avisa en modo local, sin mostrar un formulario que no puede funcionar", async () => {
  const contenedor = document.createElement("div");

  montarSesion(contenedor, depsFalsas({ libreriaDisponible: async () => false }));
  await esperarMicrotareas();

  assertEq(contenedor.querySelector(".sesion-input"), null);
  assertEq(/sin conexión/i.test(contenedor.textContent), true);
});

test("el campo de correo tiene una etiqueta visible asociada, no solo un placeholder", async () => {
  const contenedor = document.createElement("div");

  montarSesion(contenedor, depsFalsas());
  await esperarMicrotareas();

  const input = contenedor.querySelector(".sesion-input");
  const etiqueta = contenedor.querySelector("label.sesion-label");
  assertEq(etiqueta !== null, true);
  assertEq(etiqueta.htmlFor === input.id && input.id !== "", true);
});

test("el mensaje de correo inválido se anuncia en una región viva", async () => {
  const contenedor = document.createElement("div");

  montarSesion(contenedor, depsFalsas());
  await esperarMicrotareas();

  const input = contenedor.querySelector(".sesion-input");
  const btn = contenedor.querySelector(".sesion-btn");
  input.value = "no-es-un-correo";
  btn.click();
  await esperarMicrotareas();

  const err = contenedor.querySelector(".sesion-err");
  assertEq(err.hidden, false);
  assertEq(err.getAttribute("aria-live"), "polite");
  assertEq(err.getAttribute("role"), "status");
});
