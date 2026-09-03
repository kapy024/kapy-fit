import { test, assertEq, assertThrows } from "./pruebas.js";
import { CATALOGO, ejercicio, slugs } from "./catalogo.js";

test("el catálogo tiene 43 ejercicios", () => {
  assertEq(slugs().length, 43);
});

test("existe la aducción de cadera", () => {
  assertEq(ejercicio("aduccion-cadera").nombre, "Aducción de cadera");
});

test("existe la abducción de cadera", () => {
  assertEq(ejercicio("abduccion-cadera").nombre, "Abducción de cadera");
});

test("todo ejercicio tiene nombre", () => {
  for (const slug of slugs()) {
    if (!CATALOGO[slug].nombre) throw new Error(`${slug} sin nombre`);
  }
});

test("solo aduccion-cadera puede no tener video todavía", () => {
  const sinVideo = slugs().filter((s) => !CATALOGO[s].video);
  assertEq(sinVideo, ["aduccion-cadera"]);
});

test("los slugs son minúsculas sin acentos ni espacios", () => {
  for (const slug of slugs()) {
    if (!/^[a-z0-9-]+$/.test(slug)) throw new Error(`slug inválido: ${slug}`);
  }
});

test("un slug inexistente lanza error", () => {
  assertThrows(() => ejercicio("no-existe"));
});
