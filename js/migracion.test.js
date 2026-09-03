import { test, assertEq } from "./pruebas.js";
import { analizar, importar, hayDatosViejos } from "./migracion.js";
import { historial, LLAVE_REGISTROS } from "./almacen.js";

function limpiarTodo() {
  for (const k of Object.keys(localStorage)) {
    if (k.startsWith("hierro:") || k.startsWith("hierro2:")) localStorage.removeItem(k);
  }
}

test("sin datos viejos no hay nada que importar", () => {
  limpiarTodo();
  assertEq(hayDatosViejos(), false);
  assertEq(analizar().encontrados, []);
});

test("traduce una posición a su slug", () => {
  limpiarTodo();
  // dia1 posición 0 en el DAYS viejo era "Press pectoral en máquina"
  localStorage.setItem("hierro:h:dia1:_:0", JSON.stringify([{ d: "2026-08-01", w: "21", s: "4", r: "15" }]));
  const r = analizar();
  assertEq(r.encontrados.length, 1);
  assertEq(r.encontrados[0].slug, "press-pectoral-maquina");
  assertEq(r.encontrados[0].pesoKg, 21);
  assertEq(r.encontrados[0].fecha, "2026-08-01");
});

test("una posición que ya no existe se reporta como huérfana, no se pierde en silencio", () => {
  limpiarTodo();
  localStorage.setItem("hierro:h:dia1:_:99", JSON.stringify([{ d: "2026-08-01", w: "10", s: "3", r: "10" }]));
  const r = analizar();
  assertEq(r.encontrados, []);
  assertEq(r.huerfanos.length, 1);
});

test("analizar no escribe nada", () => {
  limpiarTodo();
  localStorage.setItem("hierro:h:dia1:_:0", JSON.stringify([{ d: "2026-08-01", w: "21", s: "4", r: "15" }]));
  analizar();
  assertEq(localStorage.getItem(LLAVE_REGISTROS), null);
});

test("importar escribe y no borra el localStorage viejo", () => {
  limpiarTodo();
  localStorage.setItem("hierro:h:dia1:_:0", JSON.stringify([{ d: "2026-08-01", w: "21", s: "4", r: "15" }]));
  const escritos = importar(analizar().encontrados);
  assertEq(escritos, 1);
  assertEq(historial("press-pectoral-maquina").length, 1);
  assertEq(localStorage.getItem("hierro:h:dia1:_:0") !== null, true);
  limpiarTodo();
});

test("el peso vacío se guarda como null, no como NaN", () => {
  limpiarTodo();
  localStorage.setItem("hierro:h:core:_:0", JSON.stringify([{ d: "2026-08-02", w: "", s: "5", r: "20" }]));
  assertEq(analizar().encontrados[0].pesoKg, null);
  limpiarTodo();
});
