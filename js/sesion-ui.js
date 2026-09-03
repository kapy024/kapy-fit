// Discreet session widget, mounted next to the kg/lb toggle. It only ever
// offers to turn sync on or off — it never gates the routine, which already
// works from localStorage with no session at all (see almacen.js).
import { sesionActual, enviarEnlace, cerrarSesion, alCambiarSesion, correoValido } from "./auth.js";
import { hayConfig } from "./db.js";

// Mounts the widget into `contenedor` (an empty element already in the
// page). With no Supabase config there is nothing to sign into, so it
// mounts nothing rather than show a form that can only fail.
export function montarSesion(contenedor) {
  if (!hayConfig()) return;

  const bloque = document.createElement("div");
  bloque.className = "sesion";
  contenedor.appendChild(bloque);

  let sesion = null;
  let correoEnviado = null;

  function pintar() {
    bloque.innerHTML = "";
    if (sesion) pintarConSesion();
    else if (correoEnviado) pintarEnviado();
    else pintarFormulario();
  }

  function pintarConSesion() {
    const correo = document.createElement("span");
    correo.className = "sesion-correo";
    correo.textContent = sesion.user && sesion.user.email ? sesion.user.email : "";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sesion-btn";
    btn.textContent = "Cerrar sesión";
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      await cerrarSesion();
      btn.disabled = false;
    });

    bloque.append(correo, btn);
  }

  function pintarEnviado() {
    const msg = document.createElement("span");
    msg.className = "sesion-msg";
    msg.textContent = `Te mandé un enlace a ${correoEnviado}. Ábrelo en este mismo dispositivo.`;
    bloque.append(msg);
  }

  function pintarFormulario() {
    const input = document.createElement("input");
    input.type = "email";
    input.className = "sesion-input";
    input.placeholder = "tu@correo.com";
    input.autocomplete = "email";
    input.setAttribute("aria-label", "Correo para el enlace de acceso");

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sesion-btn";
    btn.textContent = "Enviarme el enlace";

    const err = document.createElement("span");
    err.className = "sesion-err";
    err.hidden = true;

    const nota = document.createElement("span");
    nota.className = "sesion-nota";
    nota.textContent = "Sin cuenta, todo se guarda solo en este dispositivo.";

    async function enviar() {
      const correo = input.value;
      if (!correoValido(correo)) {
        err.textContent = "Escribe un correo válido.";
        err.hidden = false;
        return;
      }
      err.hidden = true;
      btn.disabled = true;
      btn.textContent = "Enviando…";
      const r = await enviarEnlace(correo);
      btn.disabled = false;
      btn.textContent = "Enviarme el enlace";
      if (r.ok) {
        correoEnviado = correo.trim();
        pintar();
      } else {
        err.textContent = r.detalle;
        err.hidden = false;
      }
    }

    btn.addEventListener("click", enviar);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") enviar();
    });

    bloque.append(input, btn, err, nota);
  }

  pintar();

  alCambiarSesion((nuevaSesion) => {
    sesion = nuevaSesion;
    correoEnviado = null;
    pintar();
  });

  sesionActual().then((s) => {
    sesion = s;
    pintar();
  });
}
