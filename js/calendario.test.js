import { test, assertEq } from "./pruebas.js";
import { urlCalendario, textoICS, nombreArchivoICS } from "./calendario.js";

const ENTRADA = {
  dia: { clave: "dia3", etiqueta: "Día 3", enfoque: "Pierna" },
  bloque: { etiqueta: "Tren inferior" },
  lineas: ["Sentadilla — 20 kg × 4 × 10"],
  fecha: "2026-09-02"
};

test("la URL apunta a la plantilla de Google Calendar", () => {
  assertEq(urlCalendario(ENTRADA).startsWith(
    "https://calendar.google.com/calendar/render?action=TEMPLATE"), true);
});

test("la URL trae el rango de todo el día con el día siguiente como fin", () => {
  assertEq(urlCalendario(ENTRADA).includes("dates=20260902%2F20260903"), true);
});

test("el título va codificado y no rompe la URL", () => {
  const u = urlCalendario(ENTRADA);
  // encodeURIComponent deja el ASCII simple tal cual: "Pierna" aparece literal
  // y eso está bien. Lo que no puede aparecer crudo es lo que parte una URL:
  // espacios, acentos, la raya y los dos puntos del título.
  assertEq(u.includes(" "), false, "espacio crudo en la URL");
  assertEq(u.includes("Día"), false, "acento sin codificar");
  assertEq(u.includes("—"), false, "raya sin codificar");
  assertEq(u.includes("text=Entrenamiento"), true);
  assertEq(u.includes("D%C3%ADa%203"), true, "el acento se codificó como UTF-8");
});

test("el .ics trae las líneas obligatorias del formato", () => {
  const t = textoICS(ENTRADA);
  for (const linea of ["BEGIN:VCALENDAR", "VERSION:2.0", "BEGIN:VEVENT", "END:VEVENT", "END:VCALENDAR"]) {
    if (!t.includes(linea)) throw new Error(`falta ${linea}`);
  }
});

test("el .ics usa fecha de todo el día, no hora", () => {
  assertEq(textoICS(ENTRADA).includes("DTSTART;VALUE=DATE:20260902"), true);
  assertEq(textoICS(ENTRADA).includes("DTEND;VALUE=DATE:20260903"), true);
});

test("el .ics escapa las comas, que si no parten el campo", () => {
  const t = textoICS({ ...ENTRADA, lineas: ["Sentadilla, pesada"] });
  assertEq(t.includes("Sentadilla\\, pesada"), true);
});

test("el .ics separa renglones con CRLF, como pide el estándar", () => {
  assertEq(textoICS(ENTRADA).includes("\r\n"), true);
});

test("sin ejercicios marcados el texto lo dice, no queda vacío", () => {
  const t = textoICS({ ...ENTRADA, lineas: [] });
  assertEq(t.includes("sin ejercicios marcados"), true);
});

test("el nombre de archivo incluye día y fecha", () => {
  assertEq(nombreArchivoICS(ENTRADA.dia, "2026-09-02"), "entrenamiento-dia3-2026-09-02.ics");
});

test("el .ics escapa punto y coma, barra invertida y salto de línea", () => {
  const t = textoICS({ ...ENTRADA, lineas: ["Sentadilla; pesada", "Ruta C:\\gym", "linea1\nlinea2"] });
  assertEq(t.includes("Sentadilla\\; pesada"), true, "punto y coma");
  assertEq(t.includes("C:\\\\gym"), true, "barra invertida");
  assertEq(t.includes("linea1\\nlinea2"), true, "salto de línea");
});

test("el día siguiente cruza bien fin de mes, fin de año y bisiesto", () => {
  const casos = [
    ["2026-01-31", "20260201"],
    ["2026-12-31", "20270101"],
    ["2028-02-28", "20280229"],
    ["2028-02-29", "20280301"],
    ["2026-02-28", "20260301"]
  ];
  for (const [fecha, finEsperado] of casos) {
    const t = textoICS({ ...ENTRADA, fecha });
    assertEq(t.includes(`DTEND;VALUE=DATE:${finEsperado}`), true, `fin de ${fecha}`);
  }
});

test("un bloque sin etiqueta no rompe el título", () => {
  for (const bloque of [null, undefined, {}]) {
    const u = urlCalendario({ ...ENTRADA, bloque });
    assertEq(u.includes("undefined"), false, "etiqueta indefinida se coló al título");
  }
});
