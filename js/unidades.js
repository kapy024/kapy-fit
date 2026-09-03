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

// Converts a user-entered value in `unidad` into canonical kilograms.
export function aKg(valor, unidad) {
  validar(unidad);
  const n = Number(valor);
  if (!Number.isFinite(n)) return null;
  return unidad === "kg" ? redondear(n) : redondear(n / LIBRAS_POR_KG);
}

// Converts canonical kilograms into the unit the user wants to see.
export function desdeKg(kg, unidad) {
  validar(unidad);
  const n = Number(kg);
  if (!Number.isFinite(n)) return null;
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
