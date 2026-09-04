// Renders an accessible data table — the screen-reader equivalent of every
// chart this app draws, and its fallback (see js/graficas.js's
// cargarChart()) when Chart.js doesn't load. No dependency on Chart.js
// itself, so this always works even when the CDN it lives on doesn't.

// Mounts a table into `contenedor` from {titulo, columnas, filas}:
// `columnas` is an array of header strings, `filas` an array of rows, each
// row itself an array of cell values in the same order as `columnas`.
// Replaces whatever `contenedor` already held. Returns the <table> element.
export function montarTabla(contenedor, { titulo, columnas, filas }) {
  contenedor.innerHTML = "";

  const tabla = document.createElement("table");

  const caption = document.createElement("caption");
  caption.textContent = titulo;
  tabla.appendChild(caption);

  const thead = document.createElement("thead");
  const filaEncabezado = document.createElement("tr");
  for (const columna of columnas) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = columna;
    filaEncabezado.appendChild(th);
  }
  thead.appendChild(filaEncabezado);
  tabla.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const fila of filas) {
    const tr = document.createElement("tr");
    for (const valor of fila) {
      const td = document.createElement("td");
      td.textContent = valor === null || valor === undefined ? "" : String(valor);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  tabla.appendChild(tbody);

  contenedor.appendChild(tabla);
  return tabla;
}
