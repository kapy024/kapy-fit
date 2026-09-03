// Weight unit conversion. Kilograms are canonical everywhere in storage;
// pounds exist only at the presentation layer.
export const LIBRAS_POR_KG = 2.20462;

function validar(unidad) {
  if (unidad !== "kg" && unidad !== "lb") {
    throw new Error(`Unidad desconocida: ${unidad}`);
  }
}

function redondear(n) {
  return Math.round(n * 10) / 10;
}

// Normalizes a raw value (from an input field or already a number) into a
// finite, non-negative number, or null when there is no usable data.
// Empty string, null and undefined are all treated as "no data" explicitly,
// rather than relying on Number("") / Number(null) both coercing to 0.
// A Spanish-locale decimal comma ("70,5") is accepted as equivalent to a dot.
// Negative numbers have no physical meaning as a body weight, so they are
// treated as invalid input (null) rather than passed through; zero remains
// a legitimate value (e.g. bodyweight exercises).
function normalizar(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  const texto =
    typeof valor === "string" ? valor.trim().replace(",", ".") : valor;
  if (texto === "") return null;
  const n = Number(texto);
  if (!Number.isFinite(n)) return null;
  if (n < 0) return null;
  return n;
}

// Converts a user-entered value in `unidad` into canonical kilograms.
export function aKg(valor, unidad) {
  validar(unidad);
  const n = normalizar(valor);
  if (n === null) return null;
  return unidad === "kg" ? redondear(n) : redondear(n / LIBRAS_POR_KG);
}

// Converts canonical kilograms into the unit the user wants to see.
export function desdeKg(kg, unidad) {
  validar(unidad);
  const n = normalizar(kg);
  if (n === null) return null;
  return unidad === "kg" ? redondear(n) : redondear(n * LIBRAS_POR_KG);
}

// Formats canonical kilograms for display, suppressing a trailing ".0".
export function formatear(kg, unidad) {
  if (kg === null || kg === undefined || kg === "") return "";
  const n = desdeKg(kg, unidad);
  if (n === null) return "";
  const texto = Number.isInteger(n) ? String(n) : n.toFixed(1);
  return `${texto} ${unidad}`;
}
