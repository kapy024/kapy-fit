// Entry point. Wires the nav to the panel renderer and nothing else.
import { RUTINA } from "./rutina.js";
import { pintarNav, pintarDia } from "./render.js";
import { preferencias, guardarPreferencias } from "./almacen.js";
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

// Import notice for the previous version's data: shows what was found
// before writing anything, and never hides orphans (records the legacy
// map can't place). Old "hierro:" keys are never deleted — see migracion.js.
function pintarAvisoMigracion() {
  if (!hayDatosViejos()) return;
  const { encontrados, huerfanos } = analizar();
  const aviso = document.createElement("div");
  aviso.className = "aviso";
  aviso.innerHTML =
    `<p>Encontré <strong>${encontrados.length}</strong> registros de la versión anterior` +
    (huerfanos.length ? ` y <strong>${huerfanos.length}</strong> que ya no puedo ubicar` : "") +
    `. Tus datos viejos no se borran.</p>`;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "cal-btn";
  btn.textContent = `Importar ${encontrados.length} registros`;
  btn.addEventListener("click", () => {
    const n = importar(encontrados);
    aviso.textContent = `Listo: ${n} registros importados.`;
    refrescar();
  });
  aviso.appendChild(btn);
  document.querySelector(".wrap").insertBefore(aviso, document.getElementById("dayNav"));
}

pintarAvisoMigracion();
refrescar();
