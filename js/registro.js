// Capture layer: weight/sets/reps inputs, the done checkbox, and the rest
// timer. Everything here writes through almacen.js keyed by the exercise's
// SLOT (its row in the routine, see rutina.js) — no field ever invents its
// own storage key, and two sets of the same exercise inside one block are
// two slots, so they never overwrite each other. The `slug` rides along in
// every record so historial(slug) can follow the exercise across slots.
import { guardarRegistro, registroDe, historial, hoyISO, guardarUltimoReinicio } from "./almacen.js";
import { aKg, desdeKg, aNumeroONull, formatear } from "./unidades.js";
import { etiquetaSlot } from "./rutina.js";
import { montarMinilinea } from "./minilinea.js";

// --- lectura/escritura del registro de hoy ---

// Returns today's record for `slot`, or a blank skeleton ready to merge
// into when nothing has been captured yet today.
function registroDeHoy(slot, slug) {
  return (
    registroDe(slot, hoyISO()) ?? {
      fecha: hoyISO(),
      slug,
      pesoKg: null,
      series: null,
      reps: null,
      hecho: false
    }
  );
}

// Re-reads today's current record (never a stale closure — a sibling
// field on the same row may have written since this control was drawn),
// merges `cambios` on top and persists. `fecha` is always set to hoyISO()
// explicitly so a panel left open past midnight still writes to the right
// day, and `slug` is re-stamped so a record saved before it existed still
// gains it. Surfaces a failed write (quota full, private mode) via
// `avisoEl` instead of leaving the user thinking it saved.
function actualizarRegistroDeHoy(slot, slug, cambios, avisoEl) {
  const actual = registroDeHoy(slot, slug);
  const siguiente = { ...actual, ...cambios, fecha: hoyISO(), slug };
  const ok = guardarRegistro(slot, siguiente);
  if (avisoEl) {
    if (ok) ocultarAviso(avisoEl);
    else mostrarAviso(avisoEl, "No se guardó (almacenamiento lleno)");
  }
  // Lets every history panel showing this exercise refresh itself: the same
  // slug can sit in several rows of the day.
  if (ok) {
    document.dispatchEvent(
      new CustomEvent("registro-guardado", { detail: { slot, slug } })
    );
  }
  return ok;
}

// One warning per exercise row: montarCampos and montarPalomita both write
// through the same `aviso` element (created here, appended exactly once by
// render.js) instead of each drawing its own — two "no se guardó" spans on
// the same row said the same thing twice.
export function crearAviso() {
  const span = document.createElement("span");
  span.className = "save-warn";
  span.hidden = true;
  return span;
}

function mostrarAviso(el, mensaje) {
  if (!el) return;
  el.textContent = mensaje;
  el.hidden = false;
}

function ocultarAviso(el) {
  if (!el) return;
  el.hidden = true;
}

// Counts how many of `ejercicios` are marked done today — the block's
// "N / M completados" counter. Reads today's record the same way
// registroDeHoy does (registroDe + hoyISO), so it never disagrees with what
// montarPalomita just wrote.
export function contarCompletados(ejercicios) {
  const hoy = hoyISO();
  const hechos = ejercicios.filter((e) => !!registroDe(e.slot, hoy)?.hecho).length;
  return { hechos, total: ejercicios.length };
}

// Clears `hecho` for today on every exercise in `ejercicios` that is
// currently marked done, leaving pesoKg/series/reps — and every other
// day's history — untouched. This is the "Reiniciar" button's entire
// contract (see render.js, which also asks for confirmation before calling
// this). Exercises with no record today, or already undone, are skipped
// so a reset never creates an empty record for a row nobody touched.
// Also stamps the last-reset timestamp so the footer note can tell the
// user when it last happened.
export function reiniciarCompletadosDeHoy(ejercicios) {
  const hoy = hoyISO();
  for (const { slot } of ejercicios) {
    const registro = registroDe(slot, hoy);
    if (registro && registro.hecho) {
      guardarRegistro(slot, { ...registro, hecho: false });
    }
  }
  guardarUltimoReinicio();
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
// persist on `change` (not on every keystroke, per brief). `ejercicioRutina`
// is the routine row itself: it carries both the `slot` these fields write
// to and the `slug` stored inside the record. `unidad` only affects how the
// stored kg is shown/typed here — aKg() converts back to kg before every
// save, so a pound never reaches storage as-is. `aviso` is the row's single
// shared save-warning element (see crearAviso in render.js's caller) — this
// function only shows/hides it, never creates or appends its own.
export function montarCampos(contenedor, ejercicioRutina, unidad, aviso) {
  const { slot, slug } = ejercicioRutina;
  const registro = registroDeHoy(slot, slug);

  const pesoMostrado =
    registro.pesoKg != null ? desdeKg(registro.pesoKg, unidad) : null;
  const campoPeso = campoTexto("Peso", "f-w", pesoMostrado, unidad, "decimal");
  const campoSeries = campoTexto(
    "Series", "f-s", registro.series, ejercicioRutina.series ?? "#", "numeric"
  );
  const campoReps = campoTexto(
    "Reps", "f-r", registro.reps, ejercicioRutina.reps ?? "reps", "text"
  );

  // An empty field is an intentional clear (pesoKg: null persists). Text
  // that isn't empty but doesn't parse as a weight ("3o", a negative) must
  // never overwrite what's already saved — aKg() returns null for both
  // cases alike, so they have to be told apart before calling it, or a typo
  // silently erases a real number with no warning shown.
  campoPeso.input.addEventListener("change", () => {
    const texto = campoPeso.input.value.trim();
    if (texto === "") {
      actualizarRegistroDeHoy(slot, slug, { pesoKg: null }, aviso);
      return;
    }
    const kg = aKg(texto, unidad);
    if (kg === null) {
      mostrarAviso(aviso, "Peso no válido, no se guardó");
      return;
    }
    actualizarRegistroDeHoy(slot, slug, { pesoKg: kg }, aviso);
  });
  // series is a count, stored as a number or null — same aNumeroONull
  // normalization migracion.js applies to legacy data, so the field's type
  // no longer depends on whether the record came from today's capture or
  // from an import.
  campoSeries.input.addEventListener("change", () => {
    const valor = aNumeroONull(campoSeries.input.value);
    actualizarRegistroDeHoy(slot, slug, { series: valor }, aviso);
  });
  campoReps.input.addEventListener("change", () => {
    const valor = campoReps.input.value.trim() || null;
    actualizarRegistroDeHoy(slot, slug, { reps: valor }, aviso);
  });

  const track = document.createElement("div");
  track.className = "ex-track";
  track.append(campoPeso.label, campoSeries.label, campoReps.label);
  contenedor.appendChild(track);
}

// Draws the done checkbox. `contenedor` doubles as the element that gets
// the "done" class toggled (render.js passes the <li> itself), so the
// strike-through styling in estilos.css (li.ex.done .ex-name) applies for
// free. Unchecking never touches pesoKg/series/reps — only `hecho` and
// `fecha` change. Same failure handling as montarCampos: a failed write
// shows `aviso` and, since nothing actually persisted, reconciles both the
// checkbox and the strike-through with what's really on disk instead of
// leaving them showing the tap the user just made. `nombre` is the
// exercise's display name, so the aria-label says what is being marked
// done instead of a label every checkbox on the page shares (VoiceOver has
// no other way to tell them apart). `aviso` is the row's single shared
// save-warning element — see montarCampos. `alCambiar`, if given, runs
// after every change (successful or not) so the block's progress counter
// (render.js) can refresh without a full repaint.
export function montarPalomita(contenedor, ejercicioRutina, nombre, aviso, alCambiar) {
  const { slot, slug } = ejercicioRutina;
  const registro = registroDeHoy(slot, slug);

  // A <label>, not a bare <span>: it's what lets the wrapper be given a
  // tap target bigger than the 22×22 checkbox it draws (see .check-wrap in
  // estilos.css) without a click on that extra padding falling through to
  // nothing — a native label-wraps-control click always reaches the input.
  const wrap = document.createElement("label");
  wrap.className = "check-wrap";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.className = "check";
  input.checked = !!registro.hecho;
  input.setAttribute("aria-label", `Marcar ${nombre} como completado`);
  contenedor.classList.toggle("done", input.checked);

  input.addEventListener("change", () => {
    const deseado = input.checked;
    const ok = actualizarRegistroDeHoy(slot, slug, { hecho: deseado }, aviso);
    const hechoReal = ok ? deseado : !!registroDeHoy(slot, slug).hecho;
    input.checked = hechoReal;
    contenedor.classList.toggle("done", hechoReal);
    if (alCambiar) alCambiar();
  });

  wrap.appendChild(input);
  contenedor.prepend(wrap);
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
// reverting to idle. `nombre` is the exercise's display name, folded into
// every aria-label below — otherwise every rest button on the page reads
// the same to VoiceOver.
export function montarTemporizador(contenedor, segundos, etiqueta, nombre) {
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
  btn.setAttribute("aria-label", `Iniciar descanso de ${etiqueta} para ${nombre}`);
  btn.appendChild(span);

  let timerId = null;
  btn.addEventListener("click", () => {
    if (timerId) {
      clearInterval(timerId);
      activeTimers = activeTimers.filter((id) => id !== timerId);
      timerId = null;
      btn.classList.remove("running", "done");
      span.textContent = etiqueta;
      btn.setAttribute("aria-label", `Iniciar descanso de ${etiqueta} para ${nombre}`);
      return;
    }
    const ctx = ensureAudio();
    let restante = segundos;
    btn.classList.remove("done");
    btn.classList.add("running");
    span.textContent = formatMMSS(restante);
    btn.setAttribute("aria-label", `Cancelar descanso en curso para ${nombre}`);
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
          btn.setAttribute("aria-label", `Iniciar descanso de ${etiqueta} para ${nombre}`);
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

// --- historial por ejercicio ---

// One history row's numbers as "40 kg · 4 series · 10 reps", omitting
// whichever of weight/series/reps the record doesn't have. `unidad` only
// affects how the stored kg is displayed, same as everywhere else — the
// record itself always stays in kg.
function formatearFilaHistorial(registro, unidad) {
  const bits = [];
  const peso = formatear(registro.pesoKg, unidad);
  if (peso) bits.push(peso);
  if (registro.series != null && registro.series !== "") bits.push(`${registro.series} series`);
  if (registro.reps) bits.push(`${registro.reps} reps`);
  return bits.length ? bits.join(" · ") : "—";
}

// "AAAA-MM-DD" -> "DD/MM". Built by hand instead of Date#toLocaleDateString:
// that formats the same ISO date differently across browser engines, which
// would make the history panel's dates inconsistent for no reason.
function formatearFechaCorta(fechaISO) {
  const [, mes, dia] = fechaISO.split("-");
  return `${dia}/${mes}`;
}

// Draws the collapsible per-exercise history: a "Historial (N)" toggle and
// a panel listing past sessions, most recent first. Reads historial(slug) —
// which mixes every slot sharing this slug, since the same exercise can sit
// in more than one day/variant, and even twice in the same block (día 1's
// light and heavy press militar). When more than one distinct slot shows up
// in the list, every row is labeled with etiquetaSlot(r.slot) so two
// numbers logged the same day are never left unexplained. The panel body is
// built lazily on first open, not at draw time, so a day with many
// exercises doesn't pay to compute history nobody looks at.
export function montarHistorial(contenedor, ejercicioRutina, unidad) {
  const { slug, slot } = ejercicioRutina;

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "hist-toggle";
  const contador = document.createElement("span");
  contador.className = "hc";
  // Holds the trend sparkline (js/minilinea.js) right in the toggle line —
  // empty and zero-width whenever there's nothing to draw yet, so a fresh
  // exercise's "Historial (0)" never shows a gap where a line would go.
  const miniWrap = document.createElement("span");
  miniWrap.className = "mini-wrap";
  toggle.append("Historial ", contador, miniWrap);

  const panel = document.createElement("div");
  panel.className = "hist-panel";
  panel.hidden = true;

  // Re-read on every open instead of caching at draw time: a set logged
  // after the row was painted must show up without reloading the page.
  function dibujarPanel() {
    const registros = historial(slug);
    contador.textContent = `(${registros.length})`;
    panel.innerHTML = "";
    if (registros.length === 0) {
      panel.innerHTML =
        '<div class="hist-empty">Aún no hay registros guardados. Se guardan cuando marcas el ejercicio como hecho.</div>';
      return;
    }
    const ordenados = [...registros].reverse();
    const slotsDistintos = new Set(ordenados.map((r) => r.slot)).size > 1;
    ordenados.forEach((r) => {
      const fila = document.createElement("div");
      fila.className = "hrow";
      const fecha = document.createElement("span");
      fecha.className = "hd";
      fecha.textContent = formatearFechaCorta(r.fecha);
      const valor = document.createElement("span");
      valor.className = "hv";
      const texto = formatearFilaHistorial(r, unidad);
      valor.textContent = slotsDistintos ? `${texto} (${etiquetaSlot(r.slot)})` : texto;
      fila.append(fecha, valor);
      panel.appendChild(fila);
    });
  }

  toggle.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) dibujarPanel();
  });

  // Keep the count (and the sparkline next to it) honest while the row is
  // on screen, and refresh an already-open panel when this exercise gets
  // logged from another row.
  function refrescarContador() {
    contador.textContent = `(${historial(slug).length})`;
    miniWrap.innerHTML = "";
    // This row's own slot, never the slug — a slug shared by more than one
    // slot (día 1's light/heavy press militar, día 5's repeated remo) would
    // otherwise blend another slot's numbers into this row's sparkline and
    // could silently reverse the trend it draws (see I2 in the
    // final-review brief, and minilinea.js's own header comment).
    montarMinilinea(miniWrap, slot, unidad);
    if (!panel.hidden) dibujarPanel();
  }
  refrescarContador();
  document.addEventListener("registro-guardado", (e) => {
    if (e.detail && e.detail.slug === slug) refrescarContador();
  });

  contenedor.append(toggle, panel);
}
