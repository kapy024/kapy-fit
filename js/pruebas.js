// Minimal browser test runner. No dependencies, no build step.
const casos = [];

export function test(nombre, fn) {
  casos.push({ nombre, fn });
}

// Deep structural equality. Distinguishes an absent key from a key present
// with value `undefined`, ignores key order, compares arrays positionally,
// and treats NaN as equal to NaN (unlike ===). No libraries.
function sonIguales(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
    return false;
  }
  const aEsArreglo = Array.isArray(a);
  const bEsArreglo = Array.isArray(b);
  if (aEsArreglo !== bEsArreglo) return false;
  if (aEsArreglo) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!sonIguales(a[i], b[i])) return false;
    }
    return true;
  }
  const clavesA = Object.keys(a);
  const clavesB = Object.keys(b);
  if (clavesA.length !== clavesB.length) return false;
  for (const clave of clavesA) {
    if (!Object.prototype.hasOwnProperty.call(b, clave)) return false;
    if (!sonIguales(a[clave], b[clave])) return false;
  }
  return true;
}

export function assertEq(actual, esperado, mensaje) {
  if (!sonIguales(actual, esperado)) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(esperado);
    throw new Error(`${mensaje || "assertEq"}: esperaba ${e}, recibió ${a}`);
  }
}

// Tolerance-based equality. Rounding to one decimal makes unit round-trips
// lossy by design, so exact equality is the wrong assertion for them.
// Both values must be finite numbers: a NaN (e.g. from a broken unit
// conversion) must fail loudly instead of silently passing, since
// Math.abs(NaN - x) is NaN and every comparison with NaN is false.
export function assertCerca(actual, esperado, tolerancia, mensaje) {
  if (!Number.isFinite(actual) || !Number.isFinite(esperado)) {
    throw new Error(
      `${mensaje || "assertCerca"}: se esperaban números finitos, recibió actual=${actual}, esperado=${esperado}`
    );
  }
  if (Math.abs(actual - esperado) > tolerancia) {
    throw new Error(`${mensaje || "assertCerca"}: ${actual} no está a ${tolerancia} de ${esperado}`);
  }
}

export function assertThrows(fn, mensaje) {
  let lanzo = false;
  try { fn(); } catch (_) { lanzo = true; }
  if (!lanzo) throw new Error(`${mensaje || "assertThrows"}: no lanzó error`);
}

// Runs every registered case and renders the report into #salida.
// Async so that a test whose fn() returns a promise (an async test) is
// actually awaited: without this, an async assertion failure lands in a
// rejected promise the caller never sees, and the case is reported as PASA.
export async function correr() {
  const salida = document.getElementById("salida");

  if (casos.length === 0) {
    const total = document.createElement("h2");
    total.textContent = "0 pruebas registradas — nada se ejecutó";
    total.className = "falla";
    salida.prepend(total);
    return;
  }

  let pasaron = 0, fallaron = 0;
  for (const caso of casos) {
    const fila = document.createElement("div");
    try {
      await caso.fn();
      fila.textContent = `PASA  ${caso.nombre}`;
      fila.className = "pasa";
      pasaron++;
    } catch (err) {
      fila.textContent = `FALLA ${caso.nombre} — ${err.message}`;
      fila.className = "falla";
      fallaron++;
    }
    salida.appendChild(fila);
  }
  const total = document.createElement("h2");
  total.textContent = `${pasaron} pasaron, ${fallaron} fallaron`;
  total.className = fallaron ? "falla" : "pasa";
  salida.prepend(total);
}
