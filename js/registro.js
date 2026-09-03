// Capture layer: weight/sets/reps inputs, the done checkbox, and the rest
// timer. Everything here writes through almacen.js keyed by exercise slug
// — no field ever invents its own storage key, so a slug that repeats
// across days (or within one) always shares the same underlying record.
import { guardarRegistro, registroDe, hoyISO } from "./almacen.js";
import { aKg, desdeKg } from "./unidades.js";

// --- lectura/escritura del registro de hoy ---

// Returns today's record for `slug`, or a blank skeleton ready to merge
// into when nothing has been captured yet today.
function registroDeHoy(slug) {
  return (
    registroDe(slug, hoyISO()) ?? {
      fecha: hoyISO(),
      pesoKg: null,
      series: null,
      reps: null,
      hecho: false
    }
  );
}

// Re-reads today's current record (never a stale closure — a sibling
// field, or the same slug rendered on another day tab, may have written
// since this control was drawn), merges `cambios` on top and persists.
// `fecha` is always set to hoyISO() explicitly so a panel left open past
// midnight still writes to the right day. Surfaces a failed write (quota
// full, private mode) via `avisoEl` instead of leaving the user thinking
// it saved.
function actualizarRegistroDeHoy(slug, cambios, avisoEl) {
  const actual = registroDeHoy(slug);
  const siguiente = { ...actual, ...cambios, fecha: hoyISO() };
  const ok = guardarRegistro(slug, siguiente);
  if (avisoEl) avisoEl.hidden = ok;
  return ok;
}

function crearAviso() {
  const span = document.createElement("span");
  span.className = "save-warn";
  span.textContent = "No se guardó (almacenamiento lleno)";
  span.hidden = true;
  return span;
}

// --- construcción de campos ---

function campoTexto(etiqueta, clase, valorInicial, placeholder, inputmode) {
  const label = document.createElement("label");
  label.className = "field";
  const span = document.createElement("span");
  span.textContent = etiqueta;
  const input = document.createElement("input");
  input.type = "text";
  input.className = `f-input ${clase}`;
  if (inputmode) input.inputMode = inputmode;
  input.placeholder = placeholder != null ? String(placeholder) : "";
  input.value = valorInicial != null ? String(valorInicial) : "";
  label.append(span, input);
  return { label, input };
}

// Draws the peso/series/reps row for one exercise and wires each field to
// persist on `change` (not on every keystroke, per brief). `unidad` only
// affects how the stored kg is shown/typed here — aKg() converts back to
// kg before every save, so a pound never reaches storage as-is.
export function montarCampos(contenedor, slug, ejercicioRutina, unidad) {
  const registro = registroDeHoy(slug);
  const aviso = crearAviso();

  const pesoMostrado =
    registro.pesoKg != null ? desdeKg(registro.pesoKg, unidad) : null;
  const campoPeso = campoTexto("Peso", "f-w", pesoMostrado, unidad, "decimal");
  const campoSeries = campoTexto(
    "Series", "f-s", registro.series, ejercicioRutina.series ?? "#", "numeric"
  );
  const campoReps = campoTexto(
    "Reps", "f-r", registro.reps, ejercicioRutina.reps ?? "reps", "text"
  );

  campoPeso.input.addEventListener("change", () => {
    const kg = aKg(campoPeso.input.value, unidad);
    actualizarRegistroDeHoy(slug, { pesoKg: kg }, aviso);
  });
  campoSeries.input.addEventListener("change", () => {
    const valor = campoSeries.input.value.trim() || null;
    actualizarRegistroDeHoy(slug, { series: valor }, aviso);
  });
  campoReps.input.addEventListener("change", () => {
    const valor = campoReps.input.value.trim() || null;
    actualizarRegistroDeHoy(slug, { reps: valor }, aviso);
  });

  const track = document.createElement("div");
  track.className = "ex-track";
  track.append(campoPeso.label, campoSeries.label, campoReps.label, aviso);
  contenedor.appendChild(track);
}

// Draws the done checkbox. `contenedor` doubles as the element that gets
// the "done" class toggled (render.js passes the <li> itself), so the
// strike-through styling in estilos.css (li.ex.done .ex-name) applies for
// free. Unchecking never touches pesoKg/series/reps — only `hecho` and
// `fecha` change. Same failure handling as montarCampos: a failed write
// shows `aviso` and, since nothing actually persisted, reconciles both the
// checkbox and the strike-through with what's really on disk instead of
// leaving them showing the tap the user just made.
export function montarPalomita(contenedor, slug) {
  const registro = registroDeHoy(slug);
  const aviso = crearAviso();

  const wrap = document.createElement("span");
  wrap.className = "check-wrap";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.className = "check";
  input.checked = !!registro.hecho;
  input.setAttribute("aria-label", "Marcar ejercicio como hecho");
  contenedor.classList.toggle("done", input.checked);

  input.addEventListener("change", () => {
    const deseado = input.checked;
    const ok = actualizarRegistroDeHoy(slug, { hecho: deseado }, aviso);
    const hechoReal = ok ? deseado : !!registroDeHoy(slug).hecho;
    input.checked = hechoReal;
    contenedor.classList.toggle("done", hechoReal);
  });

  wrap.appendChild(input);
  contenedor.prepend(wrap);
  contenedor.appendChild(aviso);
  return input;
}

// --- temporizador de descanso (portado sin cambios de comportamiento de
// index.html:882-956 y 1047-1090, commit 872ad7b — solo cambia el envoltorio,
// de closures dentro de un IIFE a funciones exportadas) ---

// Extracts a rest duration in seconds from a free-text label like
// "30-45 seg" (takes the last number, the higher end) or "2-3 min"
// (multiplies by 60). "Sin descanso" and labels with no digits return null.
export function parseRestSeconds(label) {
  if (!label) return null;
  const s = String(label).toLowerCase();
  if (s.indexOf("sin descanso") !== -1) return null;
  const nums = s.match(/\d+/g);
  if (!nums) return null;
  let val = parseInt(nums[nums.length - 1], 10);
  if (s.indexOf("min") !== -1) val = val * 60;
  return val > 0 ? val : null;
}

function formatMMSS(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return m + ":" + (s < 10 ? "0" + s : String(s));
}

// Every running interval id, so a re-render (day tab switch) can sweep
// them all instead of leaking timers into detached DOM nodes.
let activeTimers = [];
export function clearAllTimers() {
  activeTimers.forEach((id) => clearInterval(id));
  activeTimers = [];
}

let audioCtx = null;
function ensureAudio() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  } catch (_) {
    return null;
  }
}

function beepTone(ctx, freq, startAt, dur) {
  try {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, startAt);
    g.gain.exponentialRampToValueAtTime(0.35, startAt + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, startAt + dur);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(startAt);
    o.stop(startAt + dur + 0.02);
  } catch (_) {
    // Audio is a nicety here — a blocked AudioContext must never break
    // the countdown itself.
  }
}

function notifyRestDone(ctx) {
  try {
    if (ctx) {
      const now = ctx.currentTime;
      beepTone(ctx, 880, now, 0.42);
      beepTone(ctx, 1174.7, now + 0.26, 0.4);
    }
  } catch (_) {}
  try {
    if (navigator.vibrate) navigator.vibrate([220, 90, 220]);
  } catch (_) {}
}

// Draws the rest-timer widget and appends it to `contenedor`. `etiqueta`
// is the original plan text (e.g. "30-45 seg", "Sin descanso") and is what
// idle state shows — matching the pre-split monolith, so a range doesn't
// collapse into a single mm:ss guess; only a running/finishing countdown
// switches to mm:ss. `segundos` is the parsed duration: falsy (e.g.
// "Sin descanso", or free text with no digits) draws a static box with no
// button — there's nothing to count down — same as the monolith did.
// Clicking the button starts a countdown, clicking again cancels it, and
// reaching zero beeps, vibrates and shows "¡Listo!" for 2.5s before
// reverting to idle.
export function montarTemporizador(contenedor, segundos, etiqueta) {
  const wrap = document.createElement("span");
  wrap.className = "plate-wrap";

  const span = document.createElement("span");
  span.className = "n";
  span.textContent = etiqueta;

  const cap = document.createElement("span");
  cap.className = "plate-cap";
  cap.textContent = "descanso";

  if (!segundos) {
    const estatico = document.createElement("span");
    estatico.className = "plate plate--rest plate--static";
    estatico.appendChild(span);
    wrap.append(estatico, cap);
    contenedor.appendChild(wrap);
    return null;
  }

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "plate plate--rest";
  btn.setAttribute("aria-label", `Iniciar descanso de ${etiqueta}`);
  btn.appendChild(span);

  let timerId = null;
  btn.addEventListener("click", () => {
    if (timerId) {
      clearInterval(timerId);
      activeTimers = activeTimers.filter((id) => id !== timerId);
      timerId = null;
      btn.classList.remove("running", "done");
      span.textContent = etiqueta;
      btn.setAttribute("aria-label", `Iniciar descanso de ${etiqueta}`);
      return;
    }
    const ctx = ensureAudio();
    let restante = segundos;
    btn.classList.remove("done");
    btn.classList.add("running");
    span.textContent = formatMMSS(restante);
    btn.setAttribute("aria-label", "Cancelar descanso en curso");
    timerId = setInterval(() => {
      restante--;
      if (restante <= 0) {
        clearInterval(timerId);
        activeTimers = activeTimers.filter((id) => id !== timerId);
        timerId = null;
        btn.classList.remove("running");
        btn.classList.add("done");
        span.textContent = "¡Listo!";
        notifyRestDone(ctx);
        setTimeout(() => {
          btn.classList.remove("done");
          span.textContent = etiqueta;
          btn.setAttribute("aria-label", `Iniciar descanso de ${etiqueta}`);
        }, 2500);
      } else {
        span.textContent = formatMMSS(restante);
      }
    }, 1000);
    activeTimers.push(timerId);
  });

  wrap.append(btn, cap);
  contenedor.appendChild(wrap);
  return btn;
}
