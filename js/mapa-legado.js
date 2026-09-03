// Frozen snapshot of the OLD positional layout (index.html:604-758 in
// entrega-1-fundacion, DAYS array). Maps "<dayKey>:<variantKey>" to the
// slug that sat at each index of that day/variant's exercises list, in the
// exact order the old `ex(...)` calls appeared. Days without variants use
// "_" as the variant key.
//
// Generated programmatically (not transcribed by hand) by evaluating the
// `var DAYS = [...]` literal straight out of index.html with the same `ex`
// shim index.html itself uses, then walking each day/variant's exercises in
// order and reading each entry's slug (the `vid` parameter of `ex(...)`).
// Cross-checked: every slug below exists in js/catalogo.js.
//
// Never edit this file after the fact: it describes the past shape of the
// routine, not the current one. If the current routine's order changes,
// this map must NOT change to match — a stale but historically-accurate
// map is exactly what makes old records translate correctly.
export const MAPA_LEGADO = Object.freeze({
  "dia1:_": [
    "press-pectoral-maquina", "press-militar-barra", "extension-triceps-polea",
    "remo-maquina", "jalon-cara", "curl-biceps-barra", "crunch"
  ],
  "dia2:_": [
    "sentadilla", "subida-banco", "puente-gluteo", "peso-muerto-mancuernas"
  ],
  "core:_": [
    "crunch", "elevacion-cadera-acostado", "plancha-lateral", "plancha"
  ],
  "biceps:v1": [
    "press-militar-barra", "press-militar-barra", "curl-mancuernas-alterno",
    "curl-polea-alta", "curl-muneca-antebrazo", "curl-martillo"
  ],
  "biceps:v2": [
    "press-militar-barra", "elevaciones-laterales", "jalon-cara",
    "elevaciones-frontales-barra", "curl-predicador", "curl-agarre-invertido",
    "curl-martillo"
  ],
  "dorsales:v1": [
    "remo-maquina", "remo-maquina", "jalon-triangulo", "remo-barra-recta",
    "remo-polea-alta-unimano", "press-inclinado-barra", "lagartijas-declinadas",
    "cruce-poleas-inferior", "lagartijas-diamante", "press-mancuernas-plano"
  ],
  "dorsales:v2": [
    "cruce-poleas-inferior", "lagartijas-diamante", "jalon-triangulo",
    "press-mancuernas-plano", "remo-sentado-barra-horizontal"
  ],
  "dorsales:v3": [
    "press-mancuernas-plano", "jalon-barra-prono", "press-inclinado-barra",
    "remo-sentado-barra-horizontal", "cruce-poleas-inferior", "jalon-triangulo",
    "jalon-cara", "fly-mancuernas", "pull-over-polea-alta"
  ],
  "pierna:v1": [
    "sentadilla-salto", "hip-thrust-maquina", "sentadilla-smith",
    "leg-curl-femoral", "subida-banco", "leg-extension", "abduccion-cadera"
  ],
  "pierna:v2": [
    "sentadilla-hack", "hip-thrust-maquina", "leg-extension",
    "sentadilla-salto", "leg-curl-femoral", "abduccion-cadera"
  ],
  "pierna:v3": [
    "sentadilla-smith", "hip-thrust-maquina", "peso-muerto-mancuernas",
    "leg-extension", "extension-cadera-polea-grillete", "leg-curl-femoral",
    "abduccion-cadera"
  ]
});
