// Pure calculations for the charts tab. No DOM, no localStorage, no
// network, no Chart.js import — every function here is a plain
// input-to-output transform so it can be tested without a browser.
import { aNumeroONull } from "./unidades.js";

// Extracts the first number that appears in a free-text reps string
// ("10 der / 15 izq" -> 10, "hasta 1 min continuo" -> 1). Reuses
// aNumeroONull for the actual text-to-number conversion (comma decimals,
// negative rejection) instead of re-parsing digits by hand — a duplicate
// parser already dropped comma-decimal weights in entrega 1.
export function repsNumericas(reps) {
  if (reps === null || reps === undefined) return null;
  const texto = String(reps);
  const coincidencia = texto.match(/\d+(?:[.,]\d+)?/);
  if (!coincidencia) return null;
  return aNumeroONull(coincidencia[0]);
}

// Training volume for one log entry. pesoKg and series must be explicitly
// present (0 is a legitimate bodyweight-exercise value, so the checks are
// `=== null || === undefined`, never a truthiness check that would treat
// 0 as missing). reps is free text and only counts if a number can be
// read from it.
export function volumen(registro) {
  const { pesoKg, series, reps } = registro;
  if (pesoKg === null || pesoKg === undefined) return null;
  if (series === null || series === undefined) return null;
  const repsN = repsNumericas(reps);
  if (repsN === null) return null;
  return pesoKg * series * repsN;
}

// Extracts a sorted {fecha, valor} series from a field of raw log
// records, dropping entries where that field has no value. Sorting by
// the ISO date string works lexicographically since fecha is always
// "YYYY-MM-DD".
export function serieTemporal(registros, campo) {
  return registros
    .filter((r) => r[campo] !== null && r[campo] !== undefined)
    .map((r) => ({ fecha: r.fecha, valor: r[campo] }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

// Simple moving average over an already-sorted {fecha, valor} series.
// Until `ventana` prior points exist, valor is null rather than an
// average of whatever partial data is available — a partial average at
// the start of a series draws a trend that isn't there yet.
export function promedioMovil(puntos, ventana) {
  return puntos.map((punto, indice) => {
    if (indice < ventana - 1) return { fecha: punto.fecha, valor: null };
    let suma = 0;
    for (let j = indice - ventana + 1; j <= indice; j++) {
      suma += puntos[j].valor;
    }
    return { fecha: punto.fecha, valor: suma / ventana };
  });
}

// ISO-8601 week identifier ("2026-W36") for a "YYYY-MM-DD" date string.
// Parsed and manipulated entirely in UTC so the result never shifts with
// the browser's local timezone.
function semanaIsoDe(fecha) {
  const fechaUtc = new Date(`${fecha}T00:00:00Z`);
  const diaIso = fechaUtc.getUTCDay() || 7; // Monday=1 ... Sunday=7
  const jueves = new Date(fechaUtc);
  jueves.setUTCDate(fechaUtc.getUTCDate() + 4 - diaIso);
  const inicioAno = new Date(Date.UTC(jueves.getUTCFullYear(), 0, 1));
  const numeroSemana = Math.ceil(((jueves - inicioAno) / 86400000 + 1) / 7);
  return `${jueves.getUTCFullYear()}-W${String(numeroSemana).padStart(2, "0")}`;
}

// Averages a {fecha, valor} series by ISO week, one output point per week
// present in the data — weeks with no entries simply don't appear, rather
// than being interpolated.
// Monday of an ISO week label like "2026-W36", as YYYY-MM-DD.
function lunesDe(etiquetaSemana) {
  const [anio, sem] = etiquetaSemana.split("-W").map(Number);
  // Jan 4th is always in ISO week 1.
  const cuatroEnero = new Date(Date.UTC(anio, 0, 4));
  const diaSemana = (cuatroEnero.getUTCDay() + 6) % 7;      // lunes = 0
  const lunesSemana1 = new Date(cuatroEnero);
  lunesSemana1.setUTCDate(cuatroEnero.getUTCDate() - diaSemana);
  const lunes = new Date(lunesSemana1);
  lunes.setUTCDate(lunesSemana1.getUTCDate() + (sem - 1) * 7);
  return lunes.toISOString().slice(0, 10);
}

export function porSemana(registros) {
  const grupos = new Map();
  for (const registro of registros) {
    const semana = semanaIsoDe(registro.fecha);
    if (!grupos.has(semana)) grupos.set(semana, []);
    grupos.get(semana).push(registro);
  }
  const resultado = [];
  for (const [semana, items] of grupos) {
    const ordenados = [...items].sort((a, b) => a.fecha.localeCompare(b.fecha));
    const suma = items.reduce((acc, it) => acc + it.valor, 0);
    // The point sits on the week's Monday, not on whichever day the user
    // happened to weigh in: an evenly spaced weekly series is what makes a
    // 4-week moving average actually span 4 weeks.
    resultado.push({ semana, fecha: lunesDe(semana), valor: suma / items.length,
                     primerRegistro: ordenados[0].fecha });
  }
  return resultado.sort((a, b) => a.semana.localeCompare(b.semana));
}
