// Body-weight capture layer. Never touches localStorage itself — every
// read/write goes through js/almacen.js (the only module that does), the
// same layering registro.js uses for exercise records. The one thing this
// module adds on top of almacen.js's raw storage functions is validation:
// a non-numeric or negative value is rejected here, before it ever reaches
// storage, reusing unidades.js's aNumeroONull instead of re-parsing text by
// hand — a duplicate parser already dropped comma-decimal weights once
// (see unidades.js's own comment).
import {
  guardarPeso as escribirPesoValidado,
  pesos,
  pesoDe,
  LLAVE_PESOS
} from "./almacen.js";
import { aNumeroONull } from "./unidades.js";

export { pesos, pesoDe, LLAVE_PESOS };

// Validates and persists a body-weight entry for `fecha`. Returns false
// without writing (and without queuing anything — almacen.js's guardarPeso
// only queues a write that actually persisted) when `kg` isn't a usable,
// non-negative number. Same boolean contract as almacen.js's
// guardarRegistro: true only when the write actually landed.
// Zero is a legitimate exercise weight (planks, push-ups) but never a body
// weight, and body_weight carries `check (weight_kg > 0)`. Letting a zero
// through would queue an operation the server rejects forever — a poison
// pill that jams the queue behind it.
export function guardarPeso(fecha, kg) {
  const validado = aNumeroONull(kg);
  if (validado === null || validado <= 0) return false;
  return escribirPesoValidado(fecha, validado);
}
