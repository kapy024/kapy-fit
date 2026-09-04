import { test, assertEq, assertCerca } from "./pruebas.js";
import { volumen, repsNumericas, promedioMovil, porSemana, serieTemporal } from "./metricas.js";

test("el volumen es peso por series por reps", () => {
  assertEq(volumen({ pesoKg: 20, series: 4, reps: "10" }), 800);
});

test("sin peso, sin series o sin reps no hay volumen", () => {
  assertEq(volumen({ pesoKg: null, series: 4, reps: "10" }), null);
  assertEq(volumen({ pesoKg: 20, series: null, reps: "10" }), null);
  assertEq(volumen({ pesoKg: 20, series: 4, reps: null }), null);
});

test("un ejercicio de peso corporal (0 kg) tiene volumen 0, no null", () => {
  assertEq(volumen({ pesoKg: 0, series: 4, reps: "12" }), 0);
});

test("las reps no numéricas se leen cuando se puede y si no dan null", () => {
  assertEq(repsNumericas("15"), 15);
  assertEq(repsNumericas("10 der / 15 izq"), 10);      // el primer número
  assertEq(repsNumericas("15–20 seg por lado"), 15);
  assertEq(repsNumericas("hasta 1 min continuo"), 1);
  assertEq(repsNumericas("sin número"), null);
  assertEq(repsNumericas(""), null);
  assertEq(repsNumericas(null), null);
});

test("el promedio móvil no inventa valores al principio", () => {
  const p = [{fecha:"2026-01-01",valor:80},{fecha:"2026-01-08",valor:81},{fecha:"2026-01-15",valor:79}];
  const m = promedioMovil(p, 3);
  assertEq(m[0].valor, null);
  assertEq(m[1].valor, null);
  assertCerca(m[2].valor, 80, 0.01);
});

test("el promedio móvil con ventana mayor que los datos es todo null", () => {
  assertEq(promedioMovil([{fecha:"2026-01-01",valor:80}], 4).every(x => x.valor === null), true);
});

test("la serie temporal sale ordenada y sin huecos falsos", () => {
  const r = [{fecha:"2026-03-05",pesoKg:22},{fecha:"2026-01-02",pesoKg:20},{fecha:"2026-02-01",pesoKg:null}];
  assertEq(serieTemporal(r, "pesoKg").map(p => p.fecha), ["2026-01-02","2026-03-05"]);
});

test("por semana promedia lo de la misma semana", () => {
  const r = [{fecha:"2026-09-01",valor:80},{fecha:"2026-09-03",valor:82},{fecha:"2026-09-10",valor:81}];
  const s = porSemana(r);
  assertEq(s.length, 2);
  assertCerca(s[0].valor, 81, 0.01);
});

test("una serie vacía no truena en ninguna función", () => {
  assertEq(serieTemporal([], "pesoKg"), []);
  assertEq(promedioMovil([], 4), []);
  assertEq(porSemana([]), []);
});

test("cada punto semanal cae en el lunes de su semana, no en el día que se pesó", () => {
  // 2026-09-01 es martes y 2026-09-03 jueves: ambos de la misma semana ISO,
  // cuyo lunes es 2026-08-31.
  const s = porSemana([{fecha:"2026-09-01",valor:80},{fecha:"2026-09-03",valor:82}]);
  assertEq(s.length, 1);
  assertEq(s[0].fecha, "2026-08-31");
  assertEq(s[0].primerRegistro, "2026-09-01");
});

test("las semanas quedan separadas por exactamente 7 días", () => {
  const s = porSemana([{fecha:"2026-09-01",valor:80},{fecha:"2026-09-10",valor:81},{fecha:"2026-09-15",valor:79}]);
  const dias = (a,b) => (new Date(b) - new Date(a)) / 86400000;
  assertEq(dias(s[0].fecha, s[1].fecha), 7);
  assertEq(dias(s[1].fecha, s[2].fecha), 7);
});
