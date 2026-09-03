// Builds calendar payloads. Pure string work — no DOM, no window.open.
// The old implementation used window.open(), which pop-up blockers kill
// silently; the UI now renders a real anchor instead (see render.js).
function compacta(iso) {
  return iso.replace(/-/g, "");
}

function diaSiguiente(iso) {
  const [a, m, d] = iso.split("-").map(Number);
  const f = new Date(a, m - 1, d + 1);
  const mm = String(f.getMonth() + 1).padStart(2, "0");
  const dd = String(f.getDate()).padStart(2, "0");
  return `${f.getFullYear()}-${mm}-${dd}`;
}

function titulo({ dia, bloque }) {
  const sufijo = bloque && bloque.etiqueta ? ` (${bloque.etiqueta})` : "";
  return `Entrenamiento — ${dia.etiqueta}: ${dia.enfoque}${sufijo}`;
}

function cuerpo({ lineas }) {
  return lineas.length
    ? `Ejercicios completados:\n${lineas.map((l) => `• ${l}`).join("\n")}`
    : "Sesión registrada sin ejercicios marcados todavía.";
}

export function urlCalendario(entrada) {
  const inicio = compacta(entrada.fecha);
  const fin = compacta(diaSiguiente(entrada.fecha));
  return "https://calendar.google.com/calendar/render?action=TEMPLATE"
    + `&text=${encodeURIComponent(titulo(entrada))}`
    + `&dates=${encodeURIComponent(`${inicio}/${fin}`)}`
    + `&details=${encodeURIComponent(cuerpo(entrada))}`;
}

// Escapes the characters RFC 5545 treats as field separators.
function escaparICS(texto) {
  return texto
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

export function textoICS(entrada) {
  const lineas = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Registro de Hierro//ES",
    "BEGIN:VEVENT",
    `UID:${entrada.dia.clave}-${entrada.fecha}@registro-de-hierro`,
    `DTSTART;VALUE=DATE:${compacta(entrada.fecha)}`,
    `DTEND;VALUE=DATE:${compacta(diaSiguiente(entrada.fecha))}`,
    `SUMMARY:${escaparICS(titulo(entrada))}`,
    `DESCRIPTION:${escaparICS(cuerpo(entrada))}`,
    "END:VEVENT",
    "END:VCALENDAR"
  ];
  return lineas.join("\r\n") + "\r\n";
}

export function nombreArchivoICS(dia, fecha) {
  return `entrenamiento-${dia.clave}-${fecha}.ics`;
}
