// The only module that talks to the network. Everything else goes through
// almacen.js (local) and sync.js (queue), so losing connectivity never blocks
// the UI — training happens in a gym basement.
//
// supabase-js itself is loaded with a *dynamic* import, from inside cliente()
// below, never as a static import at the top of this module. A static import
// pulls in the whole graph that reaches it — app.js -> sesion-ui.js ->
// auth.js -> db.js — and per the ES module spec, one static import that
// can't resolve (an unreachable CDN) fails the entire graph, including the
// code that draws the routine. A dynamic import only fails its own promise.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../config.js";

const URL_LIBRERIA_SUPABASE = "https://esm.sh/@supabase/supabase-js@2.45.4";

// Mutable only so db.test.js can point it at a URL that can't resolve, to
// prove cliente() rejects instead of taking anything down with it. Never
// reassigned outside tests.
let urlLibreria = URL_LIBRERIA_SUPABASE;

// Test-only seam: see js/db.test.js. Also clears any cached client/in-flight
// import so the next cliente() call actually re-attempts the load.
export function _fijarUrlLibreriaParaPruebas(url = URL_LIBRERIA_SUPABASE) {
  urlLibreria = url;
  instancia = null;
  cargando = null;
}

let instancia = null;
let cargando = null;

export function hayConfig() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

// Builds (or returns the already-built) Supabase client. Async because
// loading the library is now a dynamic import: the first call kicks it off,
// concurrent calls share the same in-flight promise instead of each starting
// their own fetch, and a failed load clears `cargando` so the next call (e.g.
// once the network is back) gets to try again instead of staying rejected
// forever.
export async function cliente() {
  if (!hayConfig()) throw new Error("Falta la configuración de Supabase");
  if (instancia) return instancia;
  if (!cargando) {
    cargando = import(urlLibreria)
      .then(({ createClient }) => {
        instancia = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          auth: { persistSession: true, autoRefreshToken: true }
        });
        return instancia;
      })
      .catch((e) => {
        cargando = null;
        throw e;
      });
  }
  return cargando;
}

// Whether the client library actually loaded, without asking anything of the
// database. UI that must degrade quietly (see sesion-ui.js) uses this to
// decide whether to show a "sin conexión" note instead of a login form that
// can only fail — a broken CDN is a different situation than a query that
// failed, and doesn't need a query to detect. Never throws.
export async function libreriaDisponible() {
  if (!hayConfig()) return false;
  try {
    await cliente();
    return true;
  } catch (_e) {
    return false;
  }
}

// Liveness probe. Never throws: the caller is UI that must degrade quietly.
export async function probarConexion() {
  if (!hayConfig()) return { ok: false, detalle: "sin configuración" };
  try {
    const c = await cliente();
    const { error } = await c.from("exercises").select("slug").limit(1);
    if (error) return { ok: false, detalle: error.message };
    return { ok: true, detalle: "conectado" };
  } catch (e) {
    return { ok: false, detalle: String(e && e.message ? e.message : e) };
  }
}
