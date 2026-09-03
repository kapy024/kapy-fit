// The only module that talks to the network. Everything else goes through
// almacen.js (local) and sync.js (queue), so losing connectivity never blocks
// the UI — training happens in a gym basement.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../config.js";

let instancia = null;

export function hayConfig() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export function cliente() {
  if (!hayConfig()) throw new Error("Falta la configuración de Supabase");
  if (!instancia) {
    instancia = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true }
    });
  }
  return instancia;
}

// Liveness probe. Never throws: the caller is UI that must degrade quietly.
export async function probarConexion() {
  if (!hayConfig()) return { ok: false, detalle: "sin configuración" };
  try {
    const { error } = await cliente().from("exercises").select("slug").limit(1);
    if (error) return { ok: false, detalle: error.message };
    return { ok: true, detalle: "conectado" };
  } catch (e) {
    return { ok: false, detalle: String(e && e.message ? e.message : e) };
  }
}
