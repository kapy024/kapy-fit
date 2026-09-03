import { test, assertEq, assertThrows } from "./pruebas.js";
import { RUTINA, dia, todosLosSlugs } from "./rutina.js";
import { CATALOGO } from "./catalogo.js";

const SLUGS_ABDOMEN = ["crunch", "plancha", "plancha-lateral"];

test("la rutina tiene 7 días", () => {
  assertEq(RUTINA.length, 7);
});

test("los enfoques son los del diseño aprobado", () => {
  assertEq(RUTINA.map((d) => d.enfoque), [
    "Bíceps y tríceps",
    "Core",
    "Pierna",
    "Pecho y hombro",
    "Espalda",
    "Pierna 2",
    "Descanso"
  ]);
});

test("el abdomen va un día sí y un día no, en los pares", () => {
  assertEq(RUTINA.map((d) => d.abdomen), [false, true, false, true, false, true, false]);
});

test("ningún día de abdomen es consecutivo con otro", () => {
  for (let i = 1; i < RUTINA.length; i++) {
    if (RUTINA[i].abdomen && RUTINA[i - 1].abdomen) {
      throw new Error(`días ${i} e ${i + 1} llevan abdomen seguidos`);
    }
  }
});

test("todo día con abdomen incluye al menos un ejercicio de abdomen", () => {
  for (const d of RUTINA) {
    if (!d.abdomen) continue;
    const slugsDia = d.bloques.flatMap((b) => b.ejercicios.map((e) => e.slug));
    if (!slugsDia.some((s) => SLUGS_ABDOMEN.includes(s))) {
      throw new Error(`${d.clave} está marcado con abdomen pero no trae ninguno`);
    }
  }
});

test("todo día de pierna lleva abductores y aductores en cada bloque", () => {
  for (const clave of ["dia3", "dia6"]) {
    for (const b of dia(clave).bloques) {
      const s = b.ejercicios.map((e) => e.slug);
      if (!s.includes("abduccion-cadera")) {
        throw new Error(`${clave}/${b.clave} sin abducción`);
      }
      if (!s.includes("aduccion-cadera")) {
        throw new Error(`${clave}/${b.clave} sin aducción`);
      }
    }
  }
});

test("todo slug usado existe en el catálogo", () => {
  for (const s of todosLosSlugs()) {
    if (!CATALOGO[s]) throw new Error(`la rutina usa un slug fantasma: ${s}`);
  }
});

test("todo día tiene al menos un bloque, salvo el descanso", () => {
  for (const d of RUTINA) {
    if (d.enfoque === "Descanso") continue;
    if (d.bloques.length < 1) throw new Error(`${d.clave} sin bloques`);
  }
});

test("las claves de bloque no se repiten dentro de un día", () => {
  for (const d of RUTINA) {
    const claves = d.bloques.map((b) => b.clave);
    assertEq(claves.length, new Set(claves).size, `${d.clave} repite clave de bloque`);
  }
});

test("pesoKg es número o null, nunca cadena", () => {
  for (const d of RUTINA) {
    for (const b of d.bloques) {
      for (const e of b.ejercicios) {
        if (e.pesoKg !== null && typeof e.pesoKg !== "number") {
          throw new Error(`${e.slug}: pesoKg es ${typeof e.pesoKg}`);
        }
      }
    }
  }
});

test("un día inexistente lanza error", () => {
  assertThrows(() => dia("dia99"));
});
