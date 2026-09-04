// Entry point. Wires the nav to the panel renderer and nothing else.
import { RUTINA } from "./rutina.js";
import { pintarNav, pintarDia } from "./render.js";
import {
  preferencias, guardarPreferencias, migracionResuelta, marcarMigracionResuelta,
  ultimoReinicio
} from "./almacen.js";
import { hayDatosViejos, analizar, importar } from "./migracion.js";

const nav = document.getElementById("dayNav");
const panels = document.getElementById("panels");
const btnKg = document.getElementById("btnKg");
const btnLb = document.getElementById("btnLb");
const unidadWarn = document.getElementById("unidadWarn");
const lastReset = document.getElementById("lastReset");

let diaActivo = RUTINA[0].clave;
let unidad = preferencias().unidad;

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// Formats the last-reset ISO timestamp by hand ("3 sep, 14:05") instead of
// Date#toLocaleString, whose output format for the same input isn't
// consistent across browser engines.
function formatearFechaHora(iso) {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getDate()} ${MESES[d.getMonth()]}, ${hh}:${mm}`;
}

// Keeps the footer's "último reinicio" note in sync with storage — called
// on load and again every time render.js's reset button is confirmed
// (see refrescar below), so a tap in one day panel is reflected even
// though the footer sits outside anything render.js redraws.
function pintarUltimoReinicio() {
  const iso = ultimoReinicio();
  lastReset.textContent = iso ? `Último reinicio: ${formatearFechaHora(iso)}` : "";
}

function refrescar() {
  pintarNav(nav, diaActivo, seleccionar);
  pintarDia(panels, diaActivo, unidad, pintarUltimoReinicio);
}

function seleccionar(clave) {
  diaActivo = clave;
  refrescar();
}

// Presentation only: switching units never touches stored data (always kg
// in storage), it only changes how montarCampos/pintarDia format numbers.
function pintarUnidad() {
  btnKg.setAttribute("aria-pressed", String(unidad === "kg"));
  btnLb.setAttribute("aria-pressed", String(unidad === "lb"));
}

function cambiarUnidad(nueva) {
  unidad = nueva;
  const ok = guardarPreferencias({ unidad: nueva });
  unidadWarn.hidden = ok;
  pintarUnidad();
  refrescar();
}

btnKg.addEventListener("click", () => cambiarUnidad("kg"));
btnLb.addEventListener("click", () => cambiarUnidad("lb"));
pintarUnidad();

// Spanish noun agreement: only 1 takes the singular form.
function plural(n, singular, plural_) {
  return n === 1 ? singular : plural_;
}

// Import notice for the previous version's data: shows what was found
// before writing anything, and never hides orphans (records the legacy
// map can't place). Old "hierro:" keys are never deleted — see migracion.js.
//
// Shown by default only while the user hasn't resolved it (imported, or
// dismissed): once resolved, re-showing it on every load would mean a stray
// tap on "Importar" replays the legacy data over anything edited since —
// exactly what happened before this was fixed. A resolved banner instead
// leaves a discreet reopen link, for a dismiss the user didn't mean.
function pintarAvisoMigracion() {
  if (!hayDatosViejos()) return;
  const wrap = document.querySelector(".wrap");
  const antesDe = document.getElementById("dayNav");

  function pintarEnlaceReabrir() {
    const enlace = document.createElement("button");
    enlace.type = "button";
    enlace.className = "reset-btn";
    enlace.textContent = "Ver datos de la versión anterior";
    enlace.addEventListener("click", () => {
      enlace.remove();
      pintarBanner();
    });
    wrap.insertBefore(enlace, antesDe);
  }

  function pintarBanner() {
    const { encontrados, huerfanos } = analizar();
    const aviso = document.createElement("div");
    aviso.className = "aviso";
    aviso.innerHTML =
      `<p>Encontré <strong>${encontrados.length}</strong> ${plural(encontrados.length, "registro", "registros")} de la versión anterior` +
      (huerfanos.length ? ` y <strong>${huerfanos.length}</strong> que ya no puedo ubicar` : "") +
      `. Tus datos viejos no se borran.</p>`;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cal-btn";
    btn.textContent = `Importar ${encontrados.length} ${plural(encontrados.length, "registro", "registros")}`;
    btn.addEventListener("click", () => {
      const n = importar(encontrados);
      marcarMigracionResuelta();
      aviso.textContent = `Listo: ${n} ${plural(n, "registro importado", "registros importados")}.`;
      refrescar();
    });
    const btnOmitir = document.createElement("button");
    btnOmitir.type = "button";
    btnOmitir.className = "reset-btn";
    btnOmitir.textContent = "Ocultar";
    btnOmitir.addEventListener("click", () => {
      marcarMigracionResuelta();
      aviso.remove();
      pintarEnlaceReabrir();
    });
    aviso.append(btn, btnOmitir);
    wrap.insertBefore(aviso, antesDe);
  }

  if (migracionResuelta()) pintarEnlaceReabrir();
  else pintarBanner();
}

// Offer to upload the local history that piled up before the user ever
// signed in. Same "aviso" visual pattern and spot as pintarAvisoMigracion()
// above — sync.js's arrancarAutosync() calls this (via alOfrecerAdopcion,
// wired below) exactly once, the moment a brand-new sign-in shows up with
// unresolved history still queued (see debeOfrecerAdopcion()). Shows the
// count before doing anything, same as migración's aviso, because that
// count is the whole point: it's what makes "nunca subas nada sin
// preguntar" concrete instead of a slogan. Never offered again afterward,
// whichever button gets tapped — no reopen link, unlike the migración
// aviso: once answered, this one is done for good.
function pintarAvisoAdopcion({ historialSinAdoptar, aceptarAdopcion, rechazarAdopcion }) {
  const wrap = document.querySelector(".wrap");
  const antesDe = document.getElementById("dayNav");
  const cantidad = historialSinAdoptar().length;

  const aviso = document.createElement("div");
  aviso.className = "aviso";
  aviso.innerHTML =
    `<p>Encontré <strong>${cantidad}</strong> ${plural(cantidad, "registro", "registros")} guardados en este dispositivo de antes de iniciar sesión. No se suben solos.</p>`;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "cal-btn";
  btn.textContent = `Subir ${cantidad} ${plural(cantidad, "registro", "registros")}`;
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.textContent = "Subiendo…";
    const r = await aceptarAdopcion();
    aviso.textContent = r.fallidos > 0
      ? `Subí ${r.enviados} de ${cantidad}; el resto se sube solo en cuanto haya conexión.`
      : `Listo: ${r.enviados} ${plural(r.enviados, "registro subido", "registros subidos")}.`;
  });

  const btnOmitir = document.createElement("button");
  btnOmitir.type = "button";
  btnOmitir.className = "reset-btn";
  btnOmitir.textContent = "Ahora no";
  btnOmitir.addEventListener("click", () => {
    rechazarAdopcion();
    aviso.remove();
  });

  aviso.append(btn, btnOmitir);
  wrap.insertBefore(aviso, antesDe);
}

pintarAvisoMigracion();
pintarUltimoReinicio();
refrescar();

// Mounted last, after the routine is already on screen, and through a
// dynamic import with its own catch: sesion-ui.js's chain reaches all the
// way to the Supabase CDN (via auth.js -> db.js), and nothing in that chain
// may ever be allowed to stop this file from drawing the routine above —
// that's the whole point of it being dynamic instead of a static import at
// the top of this module. If it can't load at all, the slot is left with a
// discreet note instead of a half-built widget.
const sesionSlot = document.getElementById("sesionSlot");
import("./sesion-ui.js")
  .then(({ montarSesion }) => montarSesion(sesionSlot))
  .catch(() => {
    sesionSlot.textContent = "Sin conexión — se guarda en este dispositivo.";
  });

// Same dynamic-import safety as sesion-ui.js above: sync.js's own chain
// reaches the Supabase CDN too (through db.js's cliente()), and losing
// that must never take anything down here — it only means the pending
// queue waits for the next successful attempt, exactly as designed.
import("./sync.js")
  .then(({ arrancarAutosync, historialSinAdoptar, aceptarAdopcion, rechazarAdopcion }) => {
    arrancarAutosync(undefined, () => {
      pintarAvisoAdopcion({ historialSinAdoptar, aceptarAdopcion, rechazarAdopcion });
    });
  })
  .catch(() => {});
