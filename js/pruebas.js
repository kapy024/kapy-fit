// Minimal browser test runner. No dependencies, no build step.
const casos = [];

export function test(nombre, fn) {
  casos.push({ nombre, fn });
}

// Classifies an object for equality purposes. Plain objects that happen to
// share a constructor (e.g. two Dates) must NOT be compared via their own
// enumerable keys: Object.keys(new Date()) is always [], which would make
// any two Dates report as equal. Map/Set have the same problem — their
// entries live outside enumerable own properties.
function tipoObjeto(valor) {
  if (Array.isArray(valor)) return "array";
  if (valor instanceof Date) return "date";
  if (valor instanceof Map) return "map";
  if (valor instanceof Set) return "set";
  return "objeto";
}

// Deep structural equality. Distinguishes an absent key from a key present
// with value `undefined`, ignores key order, compares arrays positionally,
// treats NaN as equal to NaN (unlike ===), compares Date/Map/Set by value
// instead of by their (empty) own enumerable keys, and detects cycles so
// two self-referential structures compare instead of blowing the call
// stack. No libraries.
//
// `visitados` carries the pairs currently being compared up the call
// stack. If the same (a, b) pair shows up again while still in progress,
// the structures are cyclic in the same shape — treat that as equal and
// stop recursing instead of recursing forever into a RangeError.
function sonIguales(a, b, visitados = []) {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
    return false;
  }

  for (const par of visitados) {
    if (par.a === a && par.b === b) return true;
  }
  const visitadosConPar = [...visitados, { a, b }];

  const tipoA = tipoObjeto(a);
  const tipoB = tipoObjeto(b);
  if (tipoA !== tipoB) return false;

  if (tipoA === "date") {
    return a.getTime() === b.getTime();
  }

  if (tipoA === "map") {
    if (a.size !== b.size) return false;
    for (const [clave, valor] of a) {
      if (!b.has(clave)) return false;
      if (!sonIguales(valor, b.get(clave), visitadosConPar)) return false;
    }
    return true;
  }

  if (tipoA === "set") {
    if (a.size !== b.size) return false;
    // Sets have no keyed lookup like Map, so match elements pairwise,
    // marking each `b` element used at most once (so duplicates in `a`
    // can't all match a single element in `b`).
    const itemsB = [...b];
    const usados = new Array(itemsB.length).fill(false);
    for (const item of a) {
      const indice = itemsB.findIndex(
        (candidato, i) => !usados[i] && sonIguales(item, candidato, visitadosConPar)
      );
      if (indice === -1) return false;
      usados[indice] = true;
    }
    return true;
  }

  if (tipoA === "array") {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!sonIguales(a[i], b[i], visitadosConPar)) return false;
    }
    return true;
  }

  const clavesA = Object.keys(a);
  const clavesB = Object.keys(b);
  if (clavesA.length !== clavesB.length) return false;
  for (const clave of clavesA) {
    if (!Object.prototype.hasOwnProperty.call(b, clave)) return false;
    if (!sonIguales(a[clave], b[clave], visitadosConPar)) return false;
  }
  return true;
}

export function assertEq(actual, esperado, mensaje) {
  if (!sonIguales(actual, esperado)) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(esperado);
    if (a === e) {
      // JSON.stringify no distingue orden de claves ni una propiedad
      // presente con valor `undefined` (la omite igual que si no existiera).
      // Sin esta rama, dos valores que sonIguales sabe distintos imprimen
      // el mismo texto y no se entiende por qué falló la prueba.
      throw new Error(
        `${mensaje || "assertEq"}: los valores difieren pero su JSON se ve igual (${e}) — revisa orden de claves o una propiedad "undefined" explícita`
      );
    }
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
