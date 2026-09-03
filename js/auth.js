// Magic-link authentication. This is the only module that speaks the
// Supabase auth API — it goes through db.js's cliente(), never creates its
// own client. Every export resolves to {ok, detalle} (or a plain value) and
// never throws: the caller is UI for a workout in progress, and losing the
// network or hitting a misconfigured project must never crash it.
//
// Signing in only turns sync on. The app itself must keep working from
// localStorage with no session at all — see almacen.js.
import { cliente, hayConfig } from "./db.js";

// Simple "algo@algo.algo" shape check, no spaces. This only gates whether we
// bother calling the network — Supabase validates for real server-side —
// so it must run before enviarEnlace() touches the network, not after.
const RE_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function correoValido(texto) {
  if (typeof texto !== "string") return false;
  return RE_CORREO.test(texto.trim());
}

// Reads the session already cached by supabase-js (localStorage/memory) —
// getSession() never makes a network request. Resolves to null with no
// config, no stored session, or on any error.
export async function sesionActual() {
  if (!hayConfig()) return null;
  try {
    const { data, error } = await cliente().auth.getSession();
    if (error) return null;
    return data.session ?? null;
  } catch (_e) {
    return null;
  }
}

// Sends the magic link. emailRedirectTo points back at wherever this page
// is actually being served from (GitHub Pages in production, localhost in
// development) instead of a hardcoded URL.
export async function enviarEnlace(correo) {
  if (!correoValido(correo)) {
    return { ok: false, detalle: "escribe un correo válido" };
  }
  if (!hayConfig()) {
    return { ok: false, detalle: "sin configuración de Supabase" };
  }
  try {
    const { error } = await cliente().auth.signInWithOtp({
      email: correo.trim(),
      options: { emailRedirectTo: location.origin + location.pathname }
    });
    if (error) return { ok: false, detalle: error.message };
    return { ok: true, detalle: "enlace enviado" };
  } catch (e) {
    return { ok: false, detalle: String(e && e.message ? e.message : e) };
  }
}

// Closing the session never touches localStorage — only almacen.js does
// that, and it never runs here. The workout data stays exactly as it was.
export async function cerrarSesion() {
  if (!hayConfig()) return { ok: false, detalle: "sin configuración de Supabase" };
  try {
    const { error } = await cliente().auth.signOut();
    if (error) return { ok: false, detalle: error.message };
    return { ok: true, detalle: "sesión cerrada" };
  } catch (e) {
    return { ok: false, detalle: String(e && e.message ? e.message : e) };
  }
}

// Wraps onAuthStateChange: fn(sesion|null) fires on sign-in, sign-out and
// token refresh. Returns an unsubscribe function; with no config there is
// nothing to observe, so it hands back a no-op instead of failing.
export function alCambiarSesion(fn) {
  if (!hayConfig()) return () => {};
  try {
    const { data } = cliente().auth.onAuthStateChange((_evento, sesion) => {
      fn(sesion ?? null);
    });
    return () => data.subscription.unsubscribe();
  } catch (_e) {
    return () => {};
  }
}
