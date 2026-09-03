// Two-frame exercise preview. Alternates start/end frames to suggest the
// movement, and stops entirely when off-screen — 40 running intervals on a
// phone is a battery problem, not a rendering one.
const MS_POR_FOTOGRAMA = 800;

// Every IntersectionObserver (and its associated stop-the-interval callback)
// created by montarImagen, so a day-tab switch can sweep them all — same
// reason registro.js's clearAllTimers() exists. Without this, switching
// days over and over never disconnects the observers watching the <img>
// nodes that innerHTML = "" just detached, and they keep accumulating for
// the life of the page.
let observadoresActivos = [];

export function detenerTodasLasImagenes() {
  observadoresActivos.forEach(({ observador, parar }) => {
    observador.disconnect();
    parar();
  });
  observadoresActivos = [];
}

export function montarImagen(contenedor, slug, ejercicio) {
  if (!ejercicio.imagenInicio || !ejercicio.imagenFin) return;

  const img = document.createElement("img");
  img.className = "ex-gif";
  img.loading = "lazy";
  img.alt = `Demostración de ${ejercicio.nombre}`;
  img.src = ejercicio.imagenInicio;
  contenedor.appendChild(img);

  const fotogramas = [ejercicio.imagenInicio, ejercicio.imagenFin];
  let i = 0;
  let timer = null;

  function arrancar() {
    if (timer) return;
    timer = setInterval(() => {
      i = (i + 1) % 2;
      img.src = fotogramas[i];
    }, MS_POR_FOTOGRAMA);
  }

  function parar() {
    clearInterval(timer);
    timer = null;
  }

  // Un usuario que pidió movimiento reducido se queda en el primer
  // fotograma: nunca se crea el intervalo, y por lo tanto tampoco el
  // IntersectionObserver que lo arrancaría.
  const sinMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (sinMovimiento) return;

  const observador = new IntersectionObserver((entradas) => {
    for (const e of entradas) e.isIntersecting ? arrancar() : parar();
  }, { threshold: 0.1 });

  observador.observe(img);
  observadoresActivos.push({ observador, parar });
}
