// El destino de la migración ahora es un SLOT (renglón de la rutina nueva),
// no un slug suelto: las pruebas que solo miraban el slug se adaptaron para
// comprobar también a qué renglón cae cada posición vieja, y el historial se
// consulta con historial(slug), que recorre todos los slots.
import { test, assertEq } from "./pruebas.js";
import { analizar, importar, hayDatosViejos } from "./migracion.js";
import { historial, historialDeSlot, LLAVE_REGISTROS } from "./almacen.js";
import { aNumeroONull } from "./unidades.js";

function limpiarTodo() {
  for (const k of Object.keys(localStorage)) {
    if (k.startsWith("hierro:") || k.startsWith("hierro2:") || k.startsWith("hierro3:")) {
      localStorage.removeItem(k);
    }
  }
}

test("sin datos viejos no hay nada que importar", () => {
  limpiarTodo();
  assertEq(hayDatosViejos(), false);
  assertEq(analizar().encontrados, []);
});

test("traduce una posición a su slug y a su slot", () => {
  limpiarTodo();
  // dia1 posición 0 en el DAYS viejo era "Press pectoral en máquina", que en
  // la rutina nueva vive en el día 4 (empuje).
  localStorage.setItem("hierro:h:dia1:_:0", JSON.stringify([{ d: "2026-08-01", w: "21", s: "4", r: "15" }]));
  const r = analizar();
  assertEq(r.encontrados.length, 1);
  assertEq(r.encontrados[0].slug, "press-pectoral-maquina");
  assertEq(r.encontrados[0].slot, "dia4:base:press-pectoral-maquina");
  assertEq(r.encontrados[0].pesoKg, 21);
  assertEq(r.encontrados[0].fecha, "2026-08-01");
});

test("cada variante vieja cae en el bloque nuevo que le corresponde", () => {
  limpiarTodo();
  const fila = JSON.stringify([{ d: "2026-08-01", w: "10", s: "4", r: "10" }]);
  localStorage.setItem("hierro:h:core:_:0", fila);       // crunch
  localStorage.setItem("hierro:h:biceps:v2:1", fila);    // elevaciones laterales
  localStorage.setItem("hierro:h:pierna:v3:4", fila);    // extensión de cadera
  const slots = analizar().encontrados.map((e) => e.slot).sort();
  assertEq(slots, [
    "dia1:v2:elevaciones-laterales",
    "dia2:base:crunch",
    "dia6:v3:extension-cadera-polea-grillete"
  ]);
});

test("las dos series del mismo ejercicio migran a slots distintos", () => {
  limpiarTodo();
  // biceps:v1 tenía press militar dos veces seguidas (ligero y pesado).
  localStorage.setItem("hierro:h:biceps:v1:0", JSON.stringify([{ d: "2026-08-01", w: "10", s: "1", r: "30" }]));
  localStorage.setItem("hierro:h:biceps:v1:1", JSON.stringify([{ d: "2026-08-01", w: "30", s: "4", r: "10" }]));
  const porSlot = {};
  for (const e of analizar().encontrados) porSlot[e.slot] = e.pesoKg;
  assertEq(porSlot["dia1:v1:press-militar-barra"], 10);
  assertEq(porSlot["dia1:v1:press-militar-barra#2"], 30);
});

test("un ejercicio que ya no está en el bloque nuevo se reporta como huérfano", () => {
  limpiarTodo();
  // dia1:_ posición 5 era "curl-biceps-barra", que no sobrevive en dia4:base.
  localStorage.setItem("hierro:h:dia1:_:5", JSON.stringify([{ d: "2026-08-01", w: "14", s: "3", r: "12" }]));
  const r = analizar();
  assertEq(r.encontrados, []);
  assertEq(r.huerfanos.length, 1);
  assertEq(r.huerfanos[0].motivo, "curl-biceps-barra ya no está en dia4:base");
});

test("una posición que ya no existe se reporta como huérfana, no se pierde en silencio", () => {
  limpiarTodo();
  localStorage.setItem("hierro:h:dia1:_:99", JSON.stringify([{ d: "2026-08-01", w: "10", s: "3", r: "10" }]));
  const r = analizar();
  assertEq(r.encontrados, []);
  assertEq(r.huerfanos.length, 1);
  assertEq(r.huerfanos[0].motivo, "posición sin equivalencia en el mapa");
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
  assertEq(historialDeSlot("dia4:base:press-pectoral-maquina").length, 1);
  assertEq(historial("press-pectoral-maquina").length, 1);
  assertEq(localStorage.getItem("hierro:h:dia1:_:0") !== null, true);
  limpiarTodo();
});

test("el registro importado guarda su slug además del slot", () => {
  limpiarTodo();
  localStorage.setItem("hierro:h:dia1:_:0", JSON.stringify([{ d: "2026-08-01", w: "21", s: "4", r: "15" }]));
  importar(analizar().encontrados);
  assertEq(historialDeSlot("dia4:base:press-pectoral-maquina")[0].slug, "press-pectoral-maquina");
  limpiarTodo();
});

// Dos filas legadas del mismo slot y fecha se colapsan en un solo registro
// (la última gana). Contarlas como dos le mentiría al usuario sobre cuánto
// se importó.
test("importar cuenta registros escritos, no filas recibidas", () => {
  limpiarTodo();
  const encontrados = [
    { slot: "dia2:base:crunch", slug: "crunch", fecha: "2026-08-01", pesoKg: 40, series: 5, reps: "20" },
    { slot: "dia2:base:crunch", slug: "crunch", fecha: "2026-08-01", pesoKg: 45, series: 5, reps: "20" }
  ];
  assertEq(importar(encontrados), 1);
  assertEq(historialDeSlot("dia2:base:crunch").length, 1);
  assertEq(historialDeSlot("dia2:base:crunch")[0].pesoKg, 45);
  limpiarTodo();
});

test("importar sí cuenta dos veces cuando son fechas distintas", () => {
  limpiarTodo();
  const encontrados = [
    { slot: "dia2:base:crunch", slug: "crunch", fecha: "2026-08-01", pesoKg: 40, series: 5, reps: "20" },
    { slot: "dia2:base:crunch", slug: "crunch", fecha: "2026-08-02", pesoKg: 45, series: 5, reps: "20" }
  ];
  assertEq(importar(encontrados), 2);
  limpiarTodo();
});

test("una escritura rechazada por el almacenamiento no se cuenta", () => {
  limpiarTodo();
  const original = localStorage.setItem;
  localStorage.setItem = () => {
    throw new DOMException("cuota llena", "QuotaExceededError");
  };
  try {
    assertEq(importar([
      { slot: "dia2:base:crunch", slug: "crunch", fecha: "2026-08-01", pesoKg: 40, series: 5, reps: "20" }
    ]), 0);
  } finally {
    localStorage.setItem = original;
  }
  limpiarTodo();
});

test("el peso vacío se guarda como null, no como NaN", () => {
  limpiarTodo();
  localStorage.setItem("hierro:h:core:_:0", JSON.stringify([{ d: "2026-08-02", w: "", s: "5", r: "20" }]));
  assertEq(analizar().encontrados[0].pesoKg, null);
  limpiarTodo();
});

test("un peso con coma decimal migra correctamente, no se pierde", () => {
  limpiarTodo();
  localStorage.setItem("hierro:h:dia1:_:0", JSON.stringify([{ d: "2026-08-03", w: "21,5", s: "4", r: "15" }]));
  const r = analizar();
  assertEq(r.encontrados.length, 1);
  assertEq(r.encontrados[0].pesoKg, 21.5);
  assertEq(r.huerfanos, []);
  limpiarTodo();
});

test("una fila sin fecha se reporta como huérfana, no se pierde en silencio", () => {
  limpiarTodo();
  localStorage.setItem("hierro:h:dia1:_:0", JSON.stringify([{ w: "21", s: "4", r: "15" }]));
  const r = analizar();
  assertEq(r.encontrados, []);
  assertEq(r.huerfanos.length, 1);
  assertEq(r.huerfanos[0].motivo, "registro sin fecha");
  limpiarTodo();
});

test("un peso negativo migra como null, igual que en unidades.js", () => {
  limpiarTodo();
  localStorage.setItem("hierro:h:dia1:_:0", JSON.stringify([{ d: "2026-08-04", w: "-5", s: "4", r: "15" }]));
  const r = analizar();
  assertEq(r.encontrados.length, 1);
  assertEq(r.encontrados[0].pesoKg, null);
  limpiarTodo();
});

test("el parser de número se comporta igual desde unidades.js y desde migracion.js", () => {
  limpiarTodo();
  const casos = ["21,5", "-5", "", null, "10", "abc"];
  localStorage.setItem(
    "hierro:h:dia1:_:0",
    JSON.stringify(casos.map((w, i) => ({ d: `2026-08-0${i + 1}`, w, s: "1", r: "1" })))
  );
  const r = analizar();
  for (let i = 0; i < casos.length; i++) {
    assertEq(r.encontrados[i].pesoKg, aNumeroONull(casos[i]));
  }
  limpiarTodo();
});
