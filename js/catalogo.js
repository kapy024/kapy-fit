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
    imagenInicio: "data/ejercicios/press-pectoral-maquina-0.jpg",
    imagenFin: "data/ejercicios/press-pectoral-maquina-1.jpg"
  },
  "press-militar-barra": {
    nombre: "Press militar con barra",
    video: "https://www.youtube.com/watch?v=OHxSwnkSxB8",
    imagenInicio: "data/ejercicios/press-militar-barra-0.jpg",
    imagenFin: "data/ejercicios/press-militar-barra-1.jpg"
  },
  "extension-triceps-polea": {
    nombre: "Extensión de tríceps en polea",
    video: "https://www.youtube.com/watch?v=-KVa3M1uZfs",
    imagenInicio: "data/ejercicios/extension-triceps-polea-0.jpg",
    imagenFin: "data/ejercicios/extension-triceps-polea-1.jpg"
  },
  "remo-maquina": {
    nombre: "Remo en máquina",
    video: "https://www.youtube.com/watch?v=UETq0ZpeCL4",
    imagenInicio: "data/ejercicios/remo-maquina-0.jpg",
    imagenFin: "data/ejercicios/remo-maquina-1.jpg"
  },
  "jalon-cara": {
    nombre: "Jalón a la cara",
    video: "https://www.youtube.com/watch?v=tTihANXnDGU",
    imagenInicio: "data/ejercicios/jalon-cara-0.jpg",
    imagenFin: "data/ejercicios/jalon-cara-1.jpg"
  },
  "curl-biceps-barra": {
    nombre: "Curl de bíceps con barra",
    video: "https://www.youtube.com/watch?v=P6swDsMzqm0",
    imagenInicio: "data/ejercicios/curl-biceps-barra-0.jpg",
    imagenFin: "data/ejercicios/curl-biceps-barra-1.jpg"
  },
  "crunch": {
    nombre: "Crunch",
    video: "https://www.youtube.com/watch?v=hl9Yu7UZqHU",
    imagenInicio: "data/ejercicios/crunch-0.jpg",
    imagenFin: "data/ejercicios/crunch-1.jpg"
  },
  "sentadilla": {
    nombre: "Sentadilla",
    video: "https://www.youtube.com/watch?v=TPoVS6ag6l4",
    imagenInicio: "data/ejercicios/sentadilla-0.jpg",
    imagenFin: "data/ejercicios/sentadilla-1.jpg"
  },
  "subida-banco": {
    nombre: "Subida al banco",
    video: "https://www.youtube.com/watch?v=jY7t0IYJo5I",
    imagenInicio: "data/ejercicios/subida-banco-0.jpg",
    imagenFin: "data/ejercicios/subida-banco-1.jpg"
  },
  "puente-gluteo": {
    nombre: "Puente para glúteo",
    video: "https://musclewiki.com/exercise/dumbbell-glute-bridge",
    imagenInicio: "data/ejercicios/puente-gluteo-0.jpg",
    imagenFin: "data/ejercicios/puente-gluteo-1.jpg"
  },
  "peso-muerto-mancuernas": {
    nombre: "Peso muerto con mancuernas",
    video: "https://www.youtube.com/watch?v=9j_L1KgpK8Y",
    imagenInicio: "data/ejercicios/peso-muerto-mancuernas-0.jpg",
    imagenFin: "data/ejercicios/peso-muerto-mancuernas-1.jpg"
  },
  "sentadilla-salto": {
    nombre: "Sentadilla con salto",
    video: "https://www.youtube.com/watch?v=-kbKBjUU-1A",
    imagenInicio: "data/ejercicios/sentadilla-salto-0.jpg",
    imagenFin: "data/ejercicios/sentadilla-salto-1.jpg"
  },
  "hip-thrust-maquina": {
    nombre: "Hip thrust en máquina",
    video: "https://www.youtube.com/watch?v=c2iJjdXpt1U",
    imagenInicio: "data/ejercicios/hip-thrust-maquina-0.jpg",
    imagenFin: "data/ejercicios/hip-thrust-maquina-1.jpg"
  },
  "sentadilla-smith": {
    nombre: "Sentadilla en máquina Smith",
    video: "https://www.youtube.com/watch?v=4r9o_rqFZX4",
    imagenInicio: "data/ejercicios/sentadilla-smith-0.jpg",
    imagenFin: "data/ejercicios/sentadilla-smith-1.jpg"
  },
  "leg-curl-femoral": {
    nombre: "Leg curl femoral en máquina",
    video: "https://www.youtube.com/watch?v=9xbBr5Ytl8c",
    imagenInicio: "data/ejercicios/leg-curl-femoral-0.jpg",
    imagenFin: "data/ejercicios/leg-curl-femoral-1.jpg"
  },
  "leg-extension": {
    nombre: "Leg extension",
    video: "https://www.youtube.com/watch?v=MyeQ1zCcfas",
    imagenInicio: "data/ejercicios/leg-extension-0.jpg",
    imagenFin: "data/ejercicios/leg-extension-1.jpg"
  },
  "abduccion-cadera": {
    nombre: "Abducción de cadera",
    video: "https://www.youtube.com/watch?v=2vCRMi-lgJ4",
    imagenInicio: "data/ejercicios/abduccion-cadera-0.jpg",
    imagenFin: "data/ejercicios/abduccion-cadera-1.jpg"
  },
  "sentadilla-hack": {
    nombre: "Sentadilla hack",
    video: "https://musclewiki.com/exercise/machine-hack-squat",
    imagenInicio: "data/ejercicios/sentadilla-hack-0.jpg",
    imagenFin: "data/ejercicios/sentadilla-hack-1.jpg"
  },
  "jalon-triangulo": {
    nombre: "Jalón con triángulo",
    video: "https://www.youtube.com/watch?v=VUJYixXx5I8",
    imagenInicio: "data/ejercicios/jalon-triangulo-0.jpg",
    imagenFin: "data/ejercicios/jalon-triangulo-1.jpg"
  },
  "remo-barra-recta": {
    nombre: "Remo con barra recta",
    video: "https://www.youtube.com/watch?v=E68GAibALV8",
    imagenInicio: "data/ejercicios/remo-barra-recta-0.jpg",
    imagenFin: "data/ejercicios/remo-barra-recta-1.jpg"
  },
  "remo-polea-alta-unimano": {
    nombre: "Remo en polea alta a una mano",
    video: "https://www.youtube.com/watch?v=Su3AA9kcVrs",
    imagenInicio: "data/ejercicios/remo-polea-alta-unimano-0.jpg",
    imagenFin: "data/ejercicios/remo-polea-alta-unimano-1.jpg"
  },
  "press-inclinado-barra": {
    nombre: "Press de pecho en banco inclinado",
    video: "https://www.youtube.com/watch?v=swMjJqFzxCQ",
    imagenInicio: "data/ejercicios/press-inclinado-barra-0.jpg",
    imagenFin: "data/ejercicios/press-inclinado-barra-1.jpg"
  },
  "lagartijas-declinadas": {
    nombre: "Lagartijas declinadas",
    video: "https://www.youtube.com/watch?v=WziTc4qa5a4",
    imagenInicio: "data/ejercicios/lagartijas-declinadas-0.jpg",
    imagenFin: "data/ejercicios/lagartijas-declinadas-1.jpg"
  },
  "cruce-poleas-inferior": {
    nombre: "Poleas para pectoral inferior",
    video: "https://www.youtube.com/watch?v=_sJ7hJ-FLps",
    imagenInicio: "data/ejercicios/cruce-poleas-inferior-0.jpg",
    imagenFin: "data/ejercicios/cruce-poleas-inferior-1.jpg"
  },
  "lagartijas-diamante": {
    nombre: "Lagartijas triángulo (diamante)",
    video: "https://www.youtube.com/watch?v=yzU8tE28ePE",
    imagenInicio: "data/ejercicios/lagartijas-diamante-0.jpg",
    imagenFin: "data/ejercicios/lagartijas-diamante-1.jpg"
  },
  "press-mancuernas-plano": {
    nombre: "Press en banco plano con mancuernas",
    video: "https://www.youtube.com/watch?v=aUtj6oqSQPo",
    imagenInicio: "data/ejercicios/press-mancuernas-plano-0.jpg",
    imagenFin: "data/ejercicios/press-mancuernas-plano-1.jpg"
  },
  "remo-sentado-barra-horizontal": {
    nombre: "Remo sentado con barra horizontal",
    video: "https://www.youtube.com/watch?v=_mULZk3MZmE",
    imagenInicio: "data/ejercicios/remo-sentado-barra-horizontal-0.jpg",
    imagenFin: "data/ejercicios/remo-sentado-barra-horizontal-1.jpg"
  },
  "curl-mancuernas-alterno": {
    nombre: "Curl con mancuernas",
    video: "https://www.youtube.com/watch?v=wG7xgzNIjHI",
    imagenInicio: "data/ejercicios/curl-mancuernas-alterno-0.jpg",
    imagenFin: "data/ejercicios/curl-mancuernas-alterno-1.jpg"
  },
  "curl-polea-alta": {
    nombre: "Jalón para bíceps en polea alta",
    video: "https://www.youtube.com/watch?v=RY6bp_tVm20",
    imagenInicio: "data/ejercicios/curl-polea-alta-0.jpg",
    imagenFin: "data/ejercicios/curl-polea-alta-1.jpg"
  },
  "curl-muneca-antebrazo": {
    nombre: "Curl para antebrazo",
    video: "https://www.youtube.com/watch?v=QVvNZR67-ns",
    imagenInicio: "data/ejercicios/curl-muneca-antebrazo-0.jpg",
    imagenFin: "data/ejercicios/curl-muneca-antebrazo-1.jpg"
  },
  "curl-martillo": {
    nombre: "Curl martillo",
    video: "https://www.youtube.com/watch?v=RHdacbwKbTo",
    imagenInicio: "data/ejercicios/curl-martillo-0.jpg",
    imagenFin: "data/ejercicios/curl-martillo-1.jpg"
  },
  "elevaciones-laterales": {
    nombre: "Elevaciones laterales",
    video: "https://www.youtube.com/watch?v=aVa9ce3SlSA",
    imagenInicio: "data/ejercicios/elevaciones-laterales-0.jpg",
    imagenFin: "data/ejercicios/elevaciones-laterales-1.jpg"
  },
  "elevaciones-frontales-barra": {
    nombre: "Elevaciones frontales con barra",
    video: "https://www.youtube.com/watch?v=ZI99ZWy6BjA",
    imagenInicio: "data/ejercicios/elevaciones-frontales-barra-0.jpg",
    imagenFin: "data/ejercicios/elevaciones-frontales-barra-1.jpg"
  },
  "curl-predicador": {
    nombre: "Curl predicador",
    video: "https://www.youtube.com/watch?v=gLmAlQn9f4k",
    imagenInicio: "data/ejercicios/curl-predicador-0.jpg",
    imagenFin: "data/ejercicios/curl-predicador-1.jpg"
  },
  "curl-agarre-invertido": {
    nombre: "Curl agarre invertido (antebrazo)",
    video: "https://www.youtube.com/watch?v=r70FSepsHIY",
    imagenInicio: "data/ejercicios/curl-agarre-invertido-0.jpg",
    imagenFin: "data/ejercicios/curl-agarre-invertido-1.jpg"
  },
  "extension-cadera-polea-grillete": {
    nombre: "Extensión de cadera en polea baja con grillete",
    video: "https://www.youtube.com/watch?v=1mL-NCet4dY",
    imagenInicio: "data/ejercicios/extension-cadera-polea-grillete-0.jpg",
    imagenFin: "data/ejercicios/extension-cadera-polea-grillete-1.jpg"
  },
  "elevacion-cadera-acostado": {
    nombre: "Elevación de cadera acostado",
    video: "https://www.youtube.com/watch?v=eBRWUeztRt4",
    imagenInicio: "data/ejercicios/elevacion-cadera-acostado-0.jpg",
    imagenFin: "data/ejercicios/elevacion-cadera-acostado-1.jpg"
  },
  "plancha-lateral": {
    nombre: "Plancha lateral",
    video: "https://www.youtube.com/watch?v=zvmcdo8twqs",
    imagenInicio: "data/ejercicios/plancha-lateral-0.jpg",
    imagenFin: "data/ejercicios/plancha-lateral-1.jpg"
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
    imagenInicio: "data/ejercicios/jalon-barra-prono-0.jpg",
    imagenFin: "data/ejercicios/jalon-barra-prono-1.jpg"
  },
  "fly-mancuernas": {
    nombre: "Fly con mancuernas (aperturas)",
    video: "https://www.youtube.com/watch?v=-AQ0sJv4e8k",
    imagenInicio: "data/ejercicios/fly-mancuernas-0.jpg",
    imagenFin: "data/ejercicios/fly-mancuernas-1.jpg"
  },
  "pull-over-polea-alta": {
    nombre: "Pull over en polea alta",
    video: "https://www.youtube.com/watch?v=i_mIea-kM_g",
    imagenInicio: "data/ejercicios/pull-over-polea-alta-0.jpg",
    imagenFin: "data/ejercicios/pull-over-polea-alta-1.jpg"
  },
  "aduccion-cadera": {
    nombre: "Aducción de cadera",
    video: null,
    imagenInicio: "data/ejercicios/aduccion-cadera-0.jpg",
    imagenFin: "data/ejercicios/aduccion-cadera-1.jpg"
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
