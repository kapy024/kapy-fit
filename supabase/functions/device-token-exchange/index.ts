// supabase/functions/device-token-exchange/index.ts
//
// Intercambia un device_token (Task 1, sql/008_device_tokens.sql) por un
// JWT de Supabase de corta duración (1h), firmado con el mismo JWT secret
// que usa el resto del proyecto. De ahí en adelante el reloj habla
// directo con PostgREST — ver docs/superpowers/specs/2026-09-03-connect-iq-venu2-design.md §3.
//
// No verifica un JWT de entrada (no lo hay: quien llama es el reloj, sin
// sesión previa) — por eso se despliega con --no-verify-jwt (Task 2, Step 4).
// La única puerta es que el device_token exista en device_tokens y no esté
// revocado.
import { create, getNumericDate } from "https://deno.land/x/djwt@v2.9.1/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// El CLI de Supabase rechaza cualquier secreto con prefijo SUPABASE_ (está
// reservado para lo que inyecta automáticamente: SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY, etc.) — de ahí el nombre sin ese prefijo.
const JWT_SECRET = Deno.env.get("PROJECT_JWT_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

let cachedKey: CryptoKey | null = null;
async function signingKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  cachedKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(JWT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return cachedKey;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), { status: 405 });
  }

  let body: { device_token?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "cuerpo inválido" }), { status: 400 });
  }

  const deviceToken = body.device_token;
  if (typeof deviceToken !== "string" || deviceToken.length === 0) {
    return new Response(JSON.stringify({ error: "falta device_token" }), { status: 400 });
  }

  const { data: fila, error } = await admin
    .from("device_tokens")
    .select("user_id, revoked_at")
    .eq("token", deviceToken)
    .maybeSingle();

  if (error) {
    return new Response(JSON.stringify({ error: "error de base de datos" }), { status: 500 });
  }
  if (!fila || fila.revoked_at !== null) {
    return new Response(JSON.stringify({ error: "token inválido o revocado" }), { status: 401 });
  }

  const jwt = await create(
    { alg: "HS256", typ: "JWT" },
    { aud: "authenticated", role: "authenticated", sub: fila.user_id, exp: getNumericDate(60 * 60) },
    await signingKey(),
  );

  return new Response(JSON.stringify({ access_token: jwt, expires_in: 3600 }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
