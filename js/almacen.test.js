// El almacén se indexa por SLOT (el renglón concreto de la rutina) y cada
// registro guarda además su slug: por eso hay dos vistas, historialDeSlot()
// para un renglón e historial() para el ejercicio a lo largo de toda la
// rutina. Las pruebas de esta sección estaban escritas contra la forma
// anterior (una llave por slug) y se adaptaron a la nueva.
import { test, assertEq } from "./pruebas.js";
import {
  guardarRegistro, historial, historialDeSlot, registroDe,
  preferencias, guardarPreferencias, llavesLegadas,
  migracionResuelta, marcarMigracionResuelta,
  _contarReparseosRegistrosParaPruebas,
  LLAVE_REGISTROS, LLAVE_PREFS, LLAVE_MIGRACION
} from "./almacen.js";
import { aKg } from "./unidades.js";

const SLOT = "dia3:base:sentadilla";

function limpiar() {
  localStorage.removeItem(LLAVE_REGISTROS);
  localStorage.removeItem(LLAVE_PREFS);
  localStorage.removeItem(LLAVE_MIGRACION);
}

function reg(fecha, slug, extra) {
  return { fecha, slug, pesoKg: null, series: null, reps: null, hecho: true, ...extra };
}

test("historial vacío devuelve arreglo vacío", () => {
  limpiar();
  assertEq(historial("sentadilla"), []);
  assertEq(historialDeSlot(SLOT), []);
});

test("guardar y leer un registro", () => {
  limpiar();
  guardarRegistro(SLOT, reg("2026-09-02", "sentadilla", { pesoKg: 20, series: 4, reps: "10" }));
  assertEq(historialDeSlot(SLOT).length, 1);
  assertEq(registroDe(SLOT, "2026-09-02").pesoKg, 20);
});

test("guardar dos veces la misma fecha sobrescribe, no duplica", () => {
  limpiar();
  guardarRegistro(SLOT, reg("2026-09-02", "sentadilla", { pesoKg: 20 }));
  guardarRegistro(SLOT, reg("2026-09-02", "sentadilla", { pesoKg: 22 }));
  assertEq(historialDeSlot(SLOT).length, 1);
  assertEq(registroDe(SLOT, "2026-09-02").pesoKg, 22);
});

test("el historial sale ordenado por fecha aunque se guarde al revés", () => {
  limpiar();
  const slot = "dia2:base:crunch";
  guardarRegistro(slot, reg("2026-09-05", "crunch", { pesoKg: 40 }));
  guardarRegistro(slot, reg("2026-09-01", "crunch", { pesoKg: 35 }));
  assertEq(historialDeSlot(slot).map((r) => r.fecha), ["2026-09-01", "2026-09-05"]);
});

test("los ejercicios no se pisan entre sí", () => {
  limpiar();
  guardarRegistro(SLOT, reg("2026-09-02", "sentadilla", { pesoKg: 20 }));
  guardarRegistro("dia6:v1:plancha", reg("2026-09-02", "plancha", { series: 3, reps: "40 seg" }));
  assertEq(historialDeSlot(SLOT).length, 1);
  assertEq(historialDeSlot("dia6:v1:plancha").length, 1);
});

// El bug que motivó todo esto: dos series del mismo ejercicio en el mismo
// bloque compartían registro y la segunda borraba a la primera.
test("dos renglones del mismo slug en un bloque no se pisan", () => {
  limpiar();
  const ligero = "dia1:v1:press-militar-barra";
  const pesado = "dia1:v1:press-militar-barra#2";
  guardarRegistro(ligero, reg("2026-09-02", "press-militar-barra", { pesoKg: 30 }));
  guardarRegistro(pesado, reg("2026-09-02", "press-militar-barra", { pesoKg: 12 }));
  assertEq(registroDe(ligero, "2026-09-02").pesoKg, 30);
  assertEq(registroDe(pesado, "2026-09-02").pesoKg, 12);
});

test("historial(slug) junta los registros de todos los slots de ese ejercicio", () => {
  limpiar();
  guardarRegistro("dia3:base:abduccion-cadera", reg("2026-09-03", "abduccion-cadera", { pesoKg: 40 }));
  guardarRegistro("dia6:v1:abduccion-cadera", reg("2026-09-01", "abduccion-cadera", { pesoKg: 45 }));
  guardarRegistro("dia6:v2:abduccion-cadera", reg("2026-09-02", "abduccion-cadera", { pesoKg: 50 }));
  guardarRegistro("dia6:v1:plancha", reg("2026-09-02", "plancha", {}));
  const h = historial("abduccion-cadera");
  assertEq(h.map((r) => r.fecha), ["2026-09-01", "2026-09-02", "2026-09-03"]);
  assertEq(h.map((r) => r.pesoKg), [45, 50, 40]);
});

test("historial(slug) ignora los registros de otros ejercicios", () => {
  limpiar();
  guardarRegistro(SLOT, reg("2026-09-02", "sentadilla", { pesoKg: 20 }));
  guardarRegistro("dia6:v1:plancha", reg("2026-09-02", "plancha", {}));
  assertEq(historial("plancha").length, 1);
  assertEq(historial("sentadilla").length, 1);
  assertEq(historial("crunch"), []);
});

// Las gráficas de la entrega 3 necesitan distinguir, dentro de una misma
// curva, de qué slot vino cada punto (la serie ligera vs. la pesada del
// mismo ejercicio). El slot se anota solo al leer — lo que se guarda no
// cambia de forma.
test("historial(slug) incluye el slot de cada registro", () => {
  limpiar();
  guardarRegistro("dia6:v1:abduccion-cadera", reg("2026-09-01", "abduccion-cadera", { pesoKg: 45 }));
  guardarRegistro("dia6:v2:abduccion-cadera", reg("2026-09-02", "abduccion-cadera", { pesoKg: 50 }));
  const h = historial("abduccion-cadera");
  assertEq(h.map((r) => r.slot), ["dia6:v1:abduccion-cadera", "dia6:v2:abduccion-cadera"]);
});

// Un registro corrupto (sin fecha, por ejemplo escrito a mano en devtools o
// por un bug de otra versión) no debe tumbar el historial completo: se
// descarta, el resto se lee igual.
test("un registro sin fecha se descarta en vez de tronar historialDeSlot", () => {
  limpiar();
  localStorage.setItem(LLAVE_REGISTROS, JSON.stringify({
    [SLOT]: [
      { slug: "sentadilla", pesoKg: 99 },
      reg("2026-09-02", "sentadilla", { pesoKg: 20 })
    ]
  }));
  const h = historialDeSlot(SLOT);
  assertEq(h.length, 1);
  assertEq(h[0].pesoKg, 20);
});

test("historial(slug) descarta registros sin fecha en cualquier slot, sin tronar", () => {
  limpiar();
  const todo = {
    "dia6:v1:abduccion-cadera": [{ slug: "abduccion-cadera", pesoKg: 10 }],
    "dia6:v2:abduccion-cadera": [reg("2026-09-01", "abduccion-cadera", { pesoKg: 45 })]
  };
  localStorage.setItem(LLAVE_REGISTROS, JSON.stringify(todo));
  assertEq(historial("abduccion-cadera").map((r) => r.fecha), ["2026-09-01"]);
});

test("registroDe devuelve null cuando no hay nada esa fecha", () => {
  limpiar();
  assertEq(registroDe(SLOT, "2026-01-01"), null);
});

test("la unidad por omisión es kg", () => {
  limpiar();
  assertEq(preferencias().unidad, "kg");
});

test("la preferencia de unidad se persiste", () => {
  limpiar();
  guardarPreferencias({ unidad: "lb" });
  assertEq(preferencias().unidad, "lb");
});

test("un JSON corrupto no tumba la app", () => {
  localStorage.setItem(LLAVE_REGISTROS, "{esto no es json");
  assertEq(historial("sentadilla"), []);
  assertEq(historialDeSlot(SLOT), []);
  limpiar();
});

test("guardarRegistro devuelve true cuando persiste", () => {
  limpiar();
  assertEq(guardarRegistro(SLOT, reg("2026-09-02", "sentadilla", { pesoKg: 20 })), true);
});

// --- caché de LLAVE_REGISTROS (I5, revisión final de rama) ---

// registro.js's history panel reads historial()/historialDeSlot() twice
// por fila en cada render (ver I5 del hallazgo final) — sin memoria, un año
// de historial (miles de filas) hace que cada una de esas lecturas
// reparsee el almacén COMPLETO desde cero. Esta prueba comprueba la parte
// que no se ve desde afuera (el resultado es igual con o sin caché): que
// una racha de lecturas sin ningún guardado de por medio reparsea UNA sola
// vez, no una por llamada.
test("historial()/historialDeSlot() reparsean LLAVE_REGISTROS solo cuando el contenido cambió, no en cada llamada", () => {
  limpiar();
  guardarRegistro(SLOT, reg("2026-09-01", "sentadilla", { pesoKg: 20 }));
  // La primera lectura tras el guardado de arriba sí reparsea (el texto
  // crudo cambió) — se descuenta aquí para que la prueba solo mida lo que
  // pasa DESPUÉS, con el guardado ya asentado.
  historial("sentadilla");
  const antes = _contarReparseosRegistrosParaPruebas();

  historial("sentadilla");
  historialDeSlot(SLOT);
  historial("sentadilla");
  historialDeSlot(SLOT);

  assertEq(
    _contarReparseosRegistrosParaPruebas(), antes,
    "cuatro lecturas más, sin ningún guardado de por medio: cero reparseos nuevos"
  );
  limpiar();
});

test("guardarRegistro() invalida la caché: la siguiente lectura ve el dato nuevo, sin reparsear de más", () => {
  limpiar();
  guardarRegistro(SLOT, reg("2026-09-01", "sentadilla", { pesoKg: 20 }));
  historial("sentadilla"); // asienta la caché en el estado post-guardado
  const antes = _contarReparseosRegistrosParaPruebas();

  guardarRegistro(SLOT, reg("2026-09-02", "sentadilla", { pesoKg: 22 }));
  const h = historial("sentadilla");

  assertEq(h.map((r) => r.fecha), ["2026-09-01", "2026-09-02"], "el guardado nuevo se ve de inmediato");
  assertEq(_contarReparseosRegistrosParaPruebas(), antes + 1, "un guardado, un reparseo en la siguiente lectura — no más");
  limpiar();
});

// La prueba de seguridad del diseño: invalidar SOLO desde escribirRegistro()
// (en vez de comparar el texto crudo) rompería esto — varias pruebas de
// este mismo archivo escriben LLAVE_REGISTROS directamente con
// localStorage.setItem para sembrar datos corruptos/de borde (ver más
// arriba), nunca a través de escribirRegistro(). La caché tiene que
// detectar ese cambio igual, o mostraría datos de una prueba anterior.
test("un cambio directo a localStorage (fuera de escribirRegistro) se detecta y nunca deja datos obsoletos en caché", () => {
  limpiar();
  guardarRegistro(SLOT, reg("2026-09-01", "sentadilla", { pesoKg: 20 }));
  assertEq(historial("sentadilla").length, 1);

  // Fixture directa, como en "un registro sin fecha se descarta..." de
  // arriba — nunca pasa por escribirRegistro().
  localStorage.setItem(LLAVE_REGISTROS, JSON.stringify({}));

  assertEq(historial("sentadilla").length, 0, "la caché no debe esconder un cambio hecho fuera de escribirRegistro()");
  limpiar();
});

test("guardarRegistro devuelve false cuando el almacenamiento falla", () => {
  limpiar();
  const original = localStorage.setItem;
  localStorage.setItem = () => {
    throw new DOMException("cuota llena", "QuotaExceededError");
  };
  try {
    assertEq(guardarRegistro(SLOT, reg("2026-09-02", "sentadilla", { pesoKg: 20 })), false);
  } finally {
    localStorage.setItem = original;
  }
});

test("preferencias() cae a kg ante una unidad guardada inválida", () => {
  limpiar();
  localStorage.setItem(LLAVE_PREFS, JSON.stringify({ unidad: "stones" }));
  assertEq(preferencias().unidad, "kg");
  limpiar();
});

// hierro3:prefs con basura que no es un objeto (una cadena, un arreglo...)
// no debe propagarse: spread de una cadena la desarma en {0:"c",1:"a",...}.
test("preferencias() cae al objeto por omisión si lo guardado no es un objeto", () => {
  limpiar();
  localStorage.setItem(LLAVE_PREFS, JSON.stringify("cadena"));
  assertEq(preferencias(), { unidad: "kg" });
  limpiar();
});

test("preferencias() cae al objeto por omisión si lo guardado es un arreglo", () => {
  limpiar();
  localStorage.setItem(LLAVE_PREFS, JSON.stringify([1, 2, 3]));
  assertEq(preferencias(), { unidad: "kg" });
  limpiar();
});

// --- migración: se marca como resuelta para no volver a ofrecerla sola ---

test("migracionResuelta() es false por omisión", () => {
  limpiar();
  assertEq(migracionResuelta(), false);
});

test("marcarMigracionResuelta() persiste y migracionResuelta() lo refleja", () => {
  limpiar();
  assertEq(migracionResuelta(), false);
  const ok = marcarMigracionResuelta();
  assertEq(ok, true);
  assertEq(migracionResuelta(), true);
  limpiar();
});

test("guardarRegistro reemplaza el registro por completo, no hace merge", () => {
  limpiar();
  guardarRegistro(SLOT, reg("2026-09-02", "sentadilla", { pesoKg: 20, series: 4, reps: "10", hecho: true }));
  guardarRegistro(SLOT, reg("2026-09-02", "sentadilla", { pesoKg: 22, series: 3, reps: "8", hecho: false }));
  assertEq(registroDe(SLOT, "2026-09-02"), {
    fecha: "2026-09-02", slug: "sentadilla", pesoKg: 22, series: 3, reps: "8", hecho: false
  });
});

test("un peso capturado en libras se guarda en kilos", () => {
  limpiar();
  const capturado = 100;                       // el usuario escribió 100
  guardarRegistro(SLOT, reg("2026-09-02", "sentadilla", { pesoKg: aKg(capturado, "lb") }));
  assertEq(registroDe(SLOT, "2026-09-02").pesoKg, 45.4);
});

// --- llaves legadas: la única ventana del importador al localStorage ---

test("llavesLegadas devuelve llave y contenido crudo, sin interpretarlos", () => {
  const llave = "hierro:h:core:_:0";
  localStorage.setItem(llave, "[]");
  const encontradas = llavesLegadas(/^hierro:h:([^:]+):([^:]+):(\d+)$/);
  const mia = encontradas.find((x) => x.llave === llave);
  assertEq(mia.crudo, "[]");
  localStorage.removeItem(llave);
});

test("llavesLegadas no devuelve las llaves nuevas", () => {
  limpiar();
  guardarRegistro(SLOT, reg("2026-09-02", "sentadilla", { pesoKg: 20 }));
  assertEq(llavesLegadas(/^hierro:h:([^:]+):([^:]+):(\d+)$/).some((x) => x.llave === LLAVE_REGISTROS), false);
  limpiar();
});
