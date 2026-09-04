// Discreet session widget, mounted next to the kg/lb toggle. It only ever
// offers to turn sync on or off — it never gates the routine, which already
// works from localStorage with no session at all (see almacen.js).
import { sesionActual, enviarEnlace, cerrarSesion, alCambiarSesion, correoValido } from "./auth.js";
import { hayConfig, libreriaDisponible } from "./db.js";
// alCambiarEstado() is local-only (see sync.js) — it never touches the
// network itself, so wiring it in directly here (instead of through the
// deps seam below) can't break sesion-ui.test.js's doubles, which don't
// know about sync at all.
import { alCambiarEstado } from "./sync.js";
import { pendientes } from "./almacen.js";

// The real collaborators, used whenever a caller doesn't override them.
// sesion-ui.test.js passes fakes here instead, to drive sesionActual() and
// alCambiarSesion() in a controlled order without touching the network —
// see the race-condition test for why that control matters.
const DEPENDENCIAS_REALES = { sesionActual, enviarEnlace, cerrarSesion, alCambiarSesion, correoValido, libreriaDisponible };

let contadorInstancias = 0;

// Text for each sync.js state. "sin-sesion" renders nothing — there's
// nothing to sync without a session, and this widget already has its own
// note for that case. Every other state stays a few words, no punctuation
// that reads as alarming: a failed send is framed as "it'll upload on its
// own", never "Error", because the data is safe on the device regardless.
function textoDeEstadoSync(valor) {
  if (valor === "al-dia") return "Todo sincronizado";
  if (valor === "sincronizando") return "Sincronizando…";
  if (valor === "error") return "Sin conexión — se subirá solo";
  if (valor === "pendiente") {
    const n = pendientes().length;
    return `${n} ${n === 1 ? "cambio" : "cambios"} por subir`;
  }
  return "";
}

// A discreet, always-present status note — never inside `bloque` (which
// pintar() below wipes on every session-state change), so it survives
// login/logout repaints untouched. role="status" + aria-live, same as the
// rest of this widget's transient messages, but never a modal: this is
// read mid-set, not something that should ever demand a tap.
function montarIndicadorSync(contenedor) {
  const indicador = document.createElement("span");
  indicador.className = "sync-indicador";
  // Inline, not a stylesheet rule: this widget's CSS file is out of scope
  // for this change, and matching .sesion-msg's own look (same variables)
  // is enough to keep it from standing out or looking unstyled.
  indicador.style.display = "block";
  indicador.style.fontSize = "12.5px";
  indicador.style.color = "var(--text-dim)";
  indicador.setAttribute("role", "status");
  indicador.setAttribute("aria-live", "polite");
  contenedor.appendChild(indicador);

  alCambiarEstado((valor) => {
    const texto = textoDeEstadoSync(valor);
    indicador.textContent = texto;
    indicador.hidden = texto === "";
  });
}

// Mounts the widget into `contenedor` (an empty element already in the
// page). With no Supabase config there is nothing to sign into, so it
// mounts nothing rather than show a form that can only fail.
//
// Idempotent: a second call on a container that already has the widget is a
// no-op, so moving *when* this gets called (see app.js) can never risk a
// duplicate .sesion block or a second alCambiarSesion subscription.
export function montarSesion(contenedor, deps = DEPENDENCIAS_REALES) {
  if (!hayConfig()) return;
  if (contenedor.dataset.sesionMontada === "1") return;
  contenedor.dataset.sesionMontada = "1";

  montarIndicadorSync(contenedor);

  const {
    sesionActual: leerSesion, enviarEnlace: mandarEnlace, cerrarSesion: salir,
    alCambiarSesion: observarCambios, correoValido: esCorreoValido,
    libreriaDisponible: hayLibreria
  } = deps;

  const idInput = `sesionCorreo${++contadorInstancias}`;

  const bloque = document.createElement("div");
  bloque.className = "sesion";
  contenedor.appendChild(bloque);

  let sesion = null;
  let correoEnviado = null;
  let sinLibreria = false;
  // Guards the *initial* read only: sesionActual() and alCambiarSesion()'s
  // first callback both answer "what's the session right now?" at mount
  // time, and whichever answers first should decide it — not whichever
  // happens to settle last. See the race-condition test below for the
  // failure this prevents. Every alCambiarSesion callback after the first
  // is a genuine, later change and always applies regardless of this flag.
  let sesionInicialResuelta = false;

  function pintar() {
    bloque.innerHTML = "";
    if (sesion) pintarConSesion();
    else if (correoEnviado) pintarEnviado();
    else if (sinLibreria) pintarSinLibreria();
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
      await salir();
      btn.disabled = false;
    });

    bloque.append(correo, btn);
  }

  // role="status" + aria-live so a screen reader announces the confirmation
  // without the user having to go find it — it replaces the form, so
  // nothing else on screen would otherwise point at it.
  function pintarEnviado() {
    const msg = document.createElement("span");
    msg.className = "sesion-msg";
    msg.setAttribute("role", "status");
    msg.setAttribute("aria-live", "polite");
    msg.textContent = `Te mandé un enlace a ${correoEnviado}. Ábrelo en este mismo dispositivo.`;
    bloque.append(msg);
  }

  // Shown instead of the form once we know the client library itself
  // couldn't load (see libreriaDisponible in db.js) — a form that can only
  // fail every submit is worse than saying up front that sync is off.
  function pintarSinLibreria() {
    const aviso = document.createElement("span");
    aviso.className = "sesion-msg";
    aviso.setAttribute("role", "status");
    aviso.setAttribute("aria-live", "polite");
    aviso.textContent = "Sin conexión — se guarda en este dispositivo.";
    bloque.append(aviso);
  }

  function pintarFormulario() {
    const etiqueta = document.createElement("label");
    etiqueta.className = "sesion-label";
    etiqueta.htmlFor = idInput;
    etiqueta.textContent = "Correo";

    const input = document.createElement("input");
    input.type = "email";
    input.id = idInput;
    input.className = "sesion-input";
    input.placeholder = "tu@correo.com";
    input.autocomplete = "email";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sesion-btn";
    btn.textContent = "Enviarme el enlace";

    const err = document.createElement("span");
    err.className = "sesion-err";
    err.setAttribute("role", "status");
    err.setAttribute("aria-live", "polite");
    err.hidden = true;

    const nota = document.createElement("span");
    nota.className = "sesion-nota";
    nota.textContent = "Sin cuenta, todo se guarda solo en este dispositivo.";

    async function enviar() {
      const correo = input.value;
      if (!esCorreoValido(correo)) {
        err.textContent = "Escribe un correo válido.";
        err.hidden = false;
        return;
      }
      err.hidden = true;
      btn.disabled = true;
      btn.textContent = "Enviando…";
      const r = await mandarEnlace(correo);
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

    bloque.append(etiqueta, input, btn, err, nota);
  }

  pintar();

  // Registered before sesionActual() resolves (see below) rather than
  // after, so a session-change event that arrives while that first read is
  // still in flight is never missed.
  observarCambios((nuevaSesion) => {
    sesionInicialResuelta = true;
    sesion = nuevaSesion;
    correoEnviado = null;
    pintar();
  });

  leerSesion().then((s) => {
    if (sesionInicialResuelta) return; // observarCambios already settled it
    sesionInicialResuelta = true;
    sesion = s;
    pintar();
  });

  hayLibreria().then((ok) => {
    if (!ok) {
      sinLibreria = true;
      pintar();
    }
  });
}
