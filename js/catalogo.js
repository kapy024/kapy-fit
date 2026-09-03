// Exercise catalog. The slug is the stable identity used by every stored
// record, so a slug is never renamed once it ships.
//
// The 42 pre-existing entries come from crossing index.html's `V` map
// (slug -> video URL, lines 555-598) with the Spanish names used in the
// `ex(...)` calls inside `DAYS` (lines 604-758): for each slug, the name is
// taken from its first appearance in DAYS, in document order. The one
// documented exception is "abduccion-cadera", whose first DAYS occurrence
// ("Máquina de abducción (05 y 06)") is normalized per brief to
// "Abducción de cadera". "aduccion-cadera" is a new 43rd entry with no
// verified video link, so `video` stays `null` on purpose.
export const CATALOGO = {
  "press-pectoral-maquina": {
    nombre: "Press pectoral en máquina",
    video: "https://www.youtube.com/watch?v=-bdEMLuFvGw",
    imagenInicio: null,
    imagenFin: null
  },
  "press-militar-barra": {
    nombre: "Press militar con barra",
    video: "https://www.youtube.com/watch?v=OHxSwnkSxB8",
    imagenInicio: null,
    imagenFin: null
  },
  "extension-triceps-polea": {
    nombre: "Extensión de tríceps en polea",
    video: "https://www.youtube.com/watch?v=-KVa3M1uZfs",
    imagenInicio: null,
    imagenFin: null
  },
  "remo-maquina": {
    nombre: "Remo en máquina",
    video: "https://www.youtube.com/watch?v=UETq0ZpeCL4",
    imagenInicio: null,
    imagenFin: null
  },
  "jalon-cara": {
    nombre: "Jalón a la cara",
    video: "https://www.youtube.com/watch?v=tTihANXnDGU",
    imagenInicio: null,
    imagenFin: null
  },
  "curl-biceps-barra": {
    nombre: "Curl de bíceps con barra",
    video: "https://www.youtube.com/watch?v=P6swDsMzqm0",
    imagenInicio: null,
    imagenFin: null
  },
  "crunch": {
    nombre: "Crunch",
    video: "https://www.youtube.com/watch?v=hl9Yu7UZqHU",
    imagenInicio: null,
    imagenFin: null
  },
  "sentadilla": {
    nombre: "Sentadilla",
    video: "https://www.youtube.com/watch?v=TPoVS6ag6l4",
    imagenInicio: null,
    imagenFin: null
  },
  "subida-banco": {
    nombre: "Subida al banco",
    video: "https://www.youtube.com/watch?v=jY7t0IYJo5I",
    imagenInicio: null,
    imagenFin: null
  },
  "puente-gluteo": {
    nombre: "Puente para glúteo",
    video: "https://musclewiki.com/exercise/dumbbell-glute-bridge",
    imagenInicio: null,
    imagenFin: null
  },
  "peso-muerto-mancuernas": {
    nombre: "Peso muerto con mancuernas",
    video: "https://www.youtube.com/watch?v=9j_L1KgpK8Y",
    imagenInicio: null,
    imagenFin: null
  },
  "sentadilla-salto": {
    nombre: "Sentadilla con salto",
    video: "https://www.youtube.com/watch?v=-kbKBjUU-1A",
    imagenInicio: null,
    imagenFin: null
  },
  "hip-thrust-maquina": {
    nombre: "Hip thrust en máquina",
    video: "https://www.youtube.com/watch?v=c2iJjdXpt1U",
    imagenInicio: null,
    imagenFin: null
  },
  "sentadilla-smith": {
    nombre: "Sentadilla en máquina Smith",
    video: "https://www.youtube.com/watch?v=4r9o_rqFZX4",
    imagenInicio: null,
    imagenFin: null
  },
  "leg-curl-femoral": {
    nombre: "Leg curl femoral en máquina",
    video: "https://www.youtube.com/watch?v=9xbBr5Ytl8c",
    imagenInicio: null,
    imagenFin: null
  },
  "leg-extension": {
    nombre: "Leg extension",
    video: "https://www.youtube.com/watch?v=MyeQ1zCcfas",
    imagenInicio: null,
    imagenFin: null
  },
  "abduccion-cadera": {
    nombre: "Abducción de cadera",
    video: "https://www.youtube.com/watch?v=2vCRMi-lgJ4",
    imagenInicio: null,
    imagenFin: null
  },
  "sentadilla-hack": {
    nombre: "Sentadilla hack",
    video: "https://musclewiki.com/exercise/machine-hack-squat",
    imagenInicio: null,
    imagenFin: null
  },
  "jalon-triangulo": {
    nombre: "Jalón con triángulo",
    video: "https://www.youtube.com/watch?v=VUJYixXx5I8",
    imagenInicio: null,
    imagenFin: null
  },
  "remo-barra-recta": {
    nombre: "Remo con barra recta",
    video: "https://www.youtube.com/watch?v=E68GAibALV8",
    imagenInicio: null,
    imagenFin: null
  },
  "remo-polea-alta-unimano": {
    nombre: "Remo en polea alta a una mano",
    video: "https://www.youtube.com/watch?v=Su3AA9kcVrs",
    imagenInicio: null,
    imagenFin: null
  },
  "press-inclinado-barra": {
    nombre: "Press de pecho en banco inclinado",
    video: "https://www.youtube.com/watch?v=swMjJqFzxCQ",
    imagenInicio: null,
    imagenFin: null
  },
  "lagartijas-declinadas": {
    nombre: "Lagartijas declinadas",
    video: "https://www.youtube.com/watch?v=WziTc4qa5a4",
    imagenInicio: null,
    imagenFin: null
  },
  "cruce-poleas-inferior": {
    nombre: "Poleas para pectoral inferior",
    video: "https://www.youtube.com/watch?v=_sJ7hJ-FLps",
    imagenInicio: null,
    imagenFin: null
  },
  "lagartijas-diamante": {
    nombre: "Lagartijas triángulo (diamante)",
    video: "https://www.youtube.com/watch?v=yzU8tE28ePE",
    imagenInicio: null,
    imagenFin: null
  },
  "press-mancuernas-plano": {
    nombre: "Press en banco plano con mancuernas",
    video: "https://www.youtube.com/watch?v=aUtj6oqSQPo",
    imagenInicio: null,
    imagenFin: null
  },
  "remo-sentado-barra-horizontal": {
    nombre: "Remo sentado con barra horizontal",
    video: "https://www.youtube.com/watch?v=_mULZk3MZmE",
    imagenInicio: null,
    imagenFin: null
  },
  "curl-mancuernas-alterno": {
    nombre: "Curl con mancuernas",
    video: "https://www.youtube.com/watch?v=wG7xgzNIjHI",
    imagenInicio: null,
    imagenFin: null
  },
  "curl-polea-alta": {
    nombre: "Jalón para bíceps en polea alta",
    video: "https://www.youtube.com/watch?v=RY6bp_tVm20",
    imagenInicio: null,
    imagenFin: null
  },
  "curl-muneca-antebrazo": {
    nombre: "Curl para antebrazo",
    video: "https://www.youtube.com/watch?v=QVvNZR67-ns",
    imagenInicio: null,
    imagenFin: null
  },
  "curl-martillo": {
    nombre: "Curl martillo",
    video: "https://www.youtube.com/watch?v=RHdacbwKbTo",
    imagenInicio: null,
    imagenFin: null
  },
  "elevaciones-laterales": {
    nombre: "Elevaciones laterales",
    video: "https://www.youtube.com/watch?v=aVa9ce3SlSA",
    imagenInicio: null,
    imagenFin: null
  },
  "elevaciones-frontales-barra": {
    nombre: "Elevaciones frontales con barra",
    video: "https://www.youtube.com/watch?v=ZI99ZWy6BjA",
    imagenInicio: null,
    imagenFin: null
  },
  "curl-predicador": {
    nombre: "Curl predicador",
    video: "https://www.youtube.com/watch?v=gLmAlQn9f4k",
    imagenInicio: null,
    imagenFin: null
  },
  "curl-agarre-invertido": {
    nombre: "Curl agarre invertido (antebrazo)",
    video: "https://www.youtube.com/watch?v=r70FSepsHIY",
    imagenInicio: null,
    imagenFin: null
  },
  "extension-cadera-polea-grillete": {
    nombre: "Extensión de cadera en polea baja con grillete",
    video: "https://www.youtube.com/watch?v=1mL-NCet4dY",
    imagenInicio: null,
    imagenFin: null
  },
  "elevacion-cadera-acostado": {
    nombre: "Elevación de cadera acostado",
    video: "https://www.youtube.com/watch?v=eBRWUeztRt4",
    imagenInicio: null,
    imagenFin: null
  },
  "plancha-lateral": {
    nombre: "Plancha lateral",
    video: "https://www.youtube.com/watch?v=zvmcdo8twqs",
    imagenInicio: null,
    imagenFin: null
  },
  "plancha": {
    nombre: "Plancha",
    video: "https://www.youtube.com/watch?v=nmX0DysvqcQ",
    imagenInicio: null,
    imagenFin: null
  },
  "jalon-barra-prono": {
    nombre: "Jalón al pecho con barra prono",
    video: "https://www.youtube.com/watch?v=c6SZm7jawwE",
    imagenInicio: null,
    imagenFin: null
  },
  "fly-mancuernas": {
    nombre: "Fly con mancuernas (aperturas)",
    video: "https://www.youtube.com/watch?v=-AQ0sJv4e8k",
    imagenInicio: null,
    imagenFin: null
  },
  "pull-over-polea-alta": {
    nombre: "Pull over en polea alta",
    video: "https://www.youtube.com/watch?v=i_mIea-kM_g",
    imagenInicio: null,
    imagenFin: null
  },
  "aduccion-cadera": {
    nombre: "Aducción de cadera",
    video: null,
    imagenInicio: null,
    imagenFin: null
  }
};

export function slugs() {
  return Object.keys(CATALOGO);
}

// Looks up an exercise, failing loudly rather than returning undefined —
// a missing slug is a bug in the routine, not a runtime condition to absorb.
export function ejercicio(slug) {
  const e = CATALOGO[slug];
  if (!e) throw new Error(`Ejercicio desconocido: ${slug}`);
  return e;
}
