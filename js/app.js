// Entry point. Wires the nav to the panel renderer and nothing else.
import { RUTINA } from "./rutina.js";
import { pintarNav, pintarDia } from "./render.js";
import { preferencias } from "./almacen.js";

const nav = document.getElementById("dayNav");
const panels = document.getElementById("panels");

let diaActivo = RUTINA[0].clave;
let unidad = preferencias().unidad;

function refrescar() {
  pintarNav(nav, seleccionar);
  pintarDia(panels, diaActivo, unidad);
}

function seleccionar(clave) {
  diaActivo = clave;
  refrescar();
}

refrescar();
