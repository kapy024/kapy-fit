// The 7-day split. Data only: this module knows nothing about the DOM.
// Rules enforced by rutina.test.js — abs on even days, abductor+adductor on
// every leg block. Do not reorganize without re-running the tests.

// Builds one exercise record with canonical field names and defaults.
function ej(slug, series, reps, pesoKg, descanso, nota) {
  return {
    slug,
    series: series ?? null,
    reps: reps ?? null,
    pesoKg: pesoKg ?? null,
    descanso: descanso ?? null,
    nota: nota ?? null
  };
}

export const RUTINA = [
  {
    clave: "dia1", etiqueta: "Día 1", enfoque: "Bíceps y tríceps", abdomen: false,
    bloques: [
      { clave: "v1", etiqueta: "Brazo 1", ejercicios: [
        // de index.html:644-649
        ej("press-militar-barra", 1, "30", null, null, "Poco peso, para lubricar articulaciones"),
        ej("press-militar-barra", null, null, null, null, "Bajada controlada en 4 seg"),
        ej("curl-mancuernas-alterno", 4, "10 der / 15 izq", null, null, null),
        ej("curl-polea-alta", null, "12 der / 20 izq", null, null, null),
        ej("curl-muneca-antebrazo", 4, "10 der / 15 izq", null, null, null),
        ej("curl-martillo", 4, "10 der / 15 izq", null, null, null)
      ] },
      { clave: "v2", etiqueta: "Brazo 2", ejercicios: [
        // de index.html:655-661
        ej("press-militar-barra", 4, "10", null, null, "Bajada controlada"),
        ej("elevaciones-laterales", 4, "10", null, null, "Pesado, bajada controlada"),
        ej("jalon-cara", 4, "15", null, null, null),
        ej("elevaciones-frontales-barra", 4, "12", null, null, "Bajada controlada"),
        ej("curl-predicador", 4, "8–10", null, "15 seg (series cortas)",
           "Serie hasta el fallo; repite en series cortas hasta sumar 20 reps efectivas"),
        ej("curl-agarre-invertido", 4, "15", null, null, null),
        ej("curl-martillo", 4, "15", null, null, null)
      ] }
    ]
  },
  {
    clave: "dia2", etiqueta: "Día 2", enfoque: "Core", abdomen: true,
    bloques: [
      { clave: "base", etiqueta: "Zona media", ejercicios: [
        ej("crunch", 5, "20", null, "30–45 seg", null),
        ej("elevacion-cadera-acostado", 5, "20", null, "30–45 seg", null),
        ej("plancha-lateral", 4, "15–20 seg por lado", null, "Sin descanso", null),
        ej("plancha", null, "hasta 1 min continuo", null, "10 seg (entre intervalos)",
           "Progresión: 20 seg de trabajo, hasta sostener 1 min continuo")
      ] }
    ]
  },
  {
    clave: "dia3", etiqueta: "Día 3", enfoque: "Pierna", abdomen: false,
    bloques: [
      { clave: "base", etiqueta: "Tren inferior", ejercicios: [
        ej("sentadilla", 4, "10", 20, null, null),
        ej("subida-banco", 4, "10", 24, null, null),
        ej("peso-muerto-mancuernas", 4, "12", 18, null, null),
        ej("abduccion-cadera", 4, "15", null, null, null),
        ej("aduccion-cadera", 4, "15", null, null, null),
        ej("puente-gluteo", 4, "8", 5, null, null)
      ] }
    ]
  },
  {
    clave: "dia4", etiqueta: "Día 4", enfoque: "Pecho y hombro", abdomen: true,
    bloques: [
      { clave: "base", etiqueta: "Empuje", ejercicios: [
        ej("press-pectoral-maquina", 4, "15", 21, null, null),
        ej("press-inclinado-barra", 4, "12", null, null, null),
        ej("press-mancuernas-plano", 4, "12", null, null, null),
        ej("fly-mancuernas", 4, "12", null, null, null),
        ej("elevaciones-laterales", 4, "10", null, null, "Pesado, bajada controlada"),
        ej("extension-triceps-polea", 4, "12", 14, null, null),
        ej("crunch", 4, "20", null, "30–45 seg", null)
      ] }
    ]
  },
  {
    clave: "dia5", etiqueta: "Día 5", enfoque: "Espalda", abdomen: false,
    bloques: [
      { clave: "v1", etiqueta: "Dorsales 1", ejercicios: [
        // de index.html:672-681
        ej("remo-maquina", null, "8–10 reps", null, null, "Controlado"),
        ej("remo-maquina", null, "20 reps", null, null, null),
        ej("jalon-triangulo", null, "20-15-12-10", null, null, "Pirámide descendente"),
        ej("remo-barra-recta", null, null, null, null, null),
        ej("remo-polea-alta-unimano", null, null, null, null, null),
        ej("press-inclinado-barra", null, null, null, null, null),
        ej("lagartijas-declinadas", null, null, null, null, null),
        ej("cruce-poleas-inferior", null, null, null, null, null),
        ej("lagartijas-diamante", null, null, null, null, null),
        ej("press-mancuernas-plano", null, null, null, null, "Superserie combinada")
      ] },
      { clave: "v2", etiqueta: "Dorsales 2", ejercicios: [
        // de index.html:687-691. El peso original "23–36 kg" es un rango, no
        // un valor único: pesoKg no puede representar un rango sin inventar
        // un número, así que se queda null y el rango se conserva en la nota.
        ej("cruce-poleas-inferior", 4, "15-12-10-8", null, null,
           "23–36 kg — Piramidal ascendente en carga"),
        ej("lagartijas-diamante", 4, "15", null, null, null),
        ej("jalon-triangulo", 4, "8-10-12-15", null, null, "Piramidal en reps"),
        ej("press-mancuernas-plano", 4, "15", null, null, "Superserie combinada"),
        ej("remo-sentado-barra-horizontal", 4, "10", null, null, null)
      ] },
      { clave: "v3", etiqueta: "Pectorales-Dorsales", ejercicios: [
        // de index.html:698-706. El "intro" del bloque (calentamiento +
        // serie de aproximación) no tiene campo en la interfaz de bloque
        // (clave, etiqueta, ejercicios) y se omite — ver reporte.
        ej("press-mancuernas-plano", null, "reps efectivas ~20", null, "2–3 min", null),
        ej("jalon-barra-prono", null, "reps efectivas ~20", null, "2–3 min", null),
        ej("press-inclinado-barra", null, "reps efectivas ~20", null, "2–3 min", null),
        ej("remo-sentado-barra-horizontal", null, "reps efectivas ~20", null, "2–3 min", null),
        ej("cruce-poleas-inferior", null, "reps efectivas ~20", null, "2–3 min", null),
        ej("jalon-triangulo", null, "reps efectivas ~20", null, "2–3 min", null),
        ej("jalon-cara", 5, "20", null, "2–3 min", null),
        ej("fly-mancuernas", null, "mín. 20 reps", null, "2–3 min", "Al fallo"),
        ej("pull-over-polea-alta", null, "mín. 20 reps", null, "2–3 min", "Al fallo")
      ] }
    ]
  },
  {
    clave: "dia6", etiqueta: "Día 6", enfoque: "Pierna 2", abdomen: true,
    bloques: [
      { clave: "v1", etiqueta: "Pierna 1", ejercicios: [
        // de index.html:717-723, más aducción (regla del dueño) y plancha final
        ej("sentadilla-salto", null, "10 reps", null, null, "Activación"),
        ej("hip-thrust-maquina", 4, "10", null, null, null),
        ej("sentadilla-smith", 5, "12", 5, null, "Aguanta 2 seg en cada rep"),
        ej("leg-curl-femoral", 5, "15", null, null, "Sube en 4 seg + 2 seg isométrico"),
        ej("subida-banco", 4, "15", null, null, null),
        ej("leg-extension", 4, "10", null, null, "Sube 4 seg / baja 4 seg"),
        ej("abduccion-cadera", 4, "15", null, null, "Pirámide"),
        ej("aduccion-cadera", 4, "15", null, null, "Pirámide"),
        ej("plancha", 3, "40 seg", null, "30 seg", null)
      ] },
      { clave: "v2", etiqueta: "Pierna 2", ejercicios: [
        // de index.html:729-734, más aducción (regla del dueño) y plancha final
        ej("sentadilla-hack", 4, "10", null, null, "Pesado"),
        ej("hip-thrust-maquina", null, null, null, null, "Series libres — sin dato de reps"),
        ej("leg-extension", null, null, null, null, "Series libres — sin dato de reps"),
        ej("sentadilla-salto", null, null, null, null, "Series libres — sin dato de reps"),
        ej("leg-curl-femoral", 4, "10", null, null, "Subida en 4 seg"),
        ej("abduccion-cadera", null, null, null, null, "Series libres — sin dato de reps"),
        ej("aduccion-cadera", null, null, null, null, "Series libres — sin dato de reps"),
        ej("plancha", 3, "40 seg", null, "30 seg", null)
      ] },
      { clave: "v3", etiqueta: "Tren inferior (hipertrofia)", ejercicios: [
        // de index.html:741-747. El "intro" del bloque (serie de aproximación
        // + rotación del Bloque A) no tiene campo en la interfaz de bloque y
        // se omite — ver reporte. Más aducción (regla del dueño) y plancha final.
        ej("sentadilla-smith", null, "reps efectivas ~20", null, "15–20 seg", "Bloque A"),
        ej("hip-thrust-maquina", null, "reps efectivas ~20", null, "15–20 seg", "Bloque A"),
        ej("peso-muerto-mancuernas", null, "reps efectivas ~20", null, "15–20 seg", "Bloque A — el peso se mantiene"),
        ej("leg-extension", 3, "21", null, "1–2 min", "Método 21: 7 reps puntas adentro + 7 afuera + 7 en recto"),
        ej("extension-cadera-polea-grillete", 3, "12", null, "30–45 seg", null),
        ej("leg-curl-femoral", 3, "12", null, "30–45 seg", null),
        ej("abduccion-cadera", null, "biserie 20-15-12", null, null, null),
        ej("aduccion-cadera", null, "biserie 20-15-12", null, null, null),
        ej("plancha", 3, "40 seg", null, "30 seg", null)
      ] }
    ]
  },
  {
    clave: "dia7", etiqueta: "Día 7", enfoque: "Descanso", abdomen: false,
    bloques: []
  }
];

// Stamps every exercise with its `slot`: the identity of one concrete row of
// one session, "<dayKey>:<blockKey>:<slug>", plus an occurrence suffix
// ("#2", "#3") when the same slug appears more than once inside the same
// block (dia1/v1 does two press militar sets, dia5/v1 two remo en máquina).
// Derived here, deterministically, at module load — never hand-written, so
// it can't drift from the routine it describes. It is NOT positional: adding
// an exercise above another one leaves the other one's slot untouched, so
// its history survives. Runs once; RUTINA is the single source of slots.
function asignarSlots(rutina) {
  for (const d of rutina) {
    for (const b of d.bloques) {
      const ocurrencias = new Map();
      for (const e of b.ejercicios) {
        const n = (ocurrencias.get(e.slug) ?? 0) + 1;
        ocurrencias.set(e.slug, n);
        e.slot = `${d.clave}:${b.clave}:${e.slug}` + (n > 1 ? `#${n}` : "");
      }
    }
  }
}
asignarSlots(RUTINA);

export function dia(clave) {
  const d = RUTINA.find((x) => x.clave === clave);
  if (!d) throw new Error(`Día desconocido: ${clave}`);
  return d;
}

// Returns the block `claveBloque` of day `claveDia`, or null when either
// key is unknown. Unlike dia(), this never throws: the importer asks about
// day/block combinations that may legitimately no longer exist, and a
// missing one is an orphan to report, not a crash.
export function bloque(claveDia, claveBloque) {
  const d = RUTINA.find((x) => x.clave === claveDia);
  if (!d) return null;
  return d.bloques.find((b) => b.clave === claveBloque) ?? null;
}

// Returns the exercise carrying `slot`, or null if no row has it.
export function ejercicioPorSlot(slot) {
  for (const d of RUTINA) {
    for (const b of d.bloques) {
      for (const e of b.ejercicios) {
        if (e.slot === slot) return e;
      }
    }
  }
  return null;
}

// Every slot in the routine, in reading order. Duplicates here would mean
// two rows sharing one record — rutina.test.js guards against exactly that.
export function todosLosSlots() {
  const lista = [];
  for (const d of RUTINA) {
    for (const b of d.bloques) {
      for (const e of b.ejercicios) lista.push(e.slot);
    }
  }
  return lista;
}

export function todosLosSlugs() {
  const set = new Set();
  for (const d of RUTINA) {
    for (const b of d.bloques) {
      for (const e of b.ejercicios) set.add(e.slug);
    }
  }
  return [...set];
}
