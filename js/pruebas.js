// Minimal browser test runner. No dependencies, no build step.
const casos = [];

export function test(nombre, fn) {
  casos.push({ nombre, fn });
}

export function assertEq(actual, esperado, mensaje) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(esperado);
  if (a !== e) {
    throw new Error(`${mensaje || "assertEq"}: esperaba ${e}, recibió ${a}`);
  }
}

// Tolerance-based equality. Rounding to one decimal makes unit round-trips
// lossy by design, so exact equality is the wrong assertion for them.
export function assertCerca(actual, esperado, tolerancia, mensaje) {
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
export function correr() {
  const salida = document.getElementById("salida");
  let pasaron = 0, fallaron = 0;
  for (const caso of casos) {
    const fila = document.createElement("div");
    try {
      caso.fn();
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
