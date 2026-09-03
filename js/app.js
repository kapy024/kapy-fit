// Entry point. Wires the nav to the panel renderer and nothing else.
import { RUTINA } from "./rutina.js";
import { pintarNav, pintarDia } from "./render.js";
import {
  preferencias, guardarPreferencias, migracionResuelta, marcarMigracionResuelta
} from "./almacen.js";
import { hayDatosViejos, analizar, importar } from "./migracion.js";

const nav = document.getElementById("dayNav");
const panels = document.getElementById("panels");
const btnKg = document.getElementById("btnKg");
const btnLb = document.getElementById("btnLb");
const unidadWarn = document.getElementById("unidadWarn");

let diaActivo = RUTINA[0].clave;
let unidad = preferencias().unidad;

function refrescar() {
  pintarNav(nav, diaActivo, seleccionar);
  pintarDia(panels, diaActivo, unidad);
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

pintarAvisoMigracion();
refrescar();
