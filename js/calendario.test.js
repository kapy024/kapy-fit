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
  assertEq(u.includes("Pierna"), false);       // debe ir escapado
  assertEq(u.includes("text=Entrenamiento"), true);
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
