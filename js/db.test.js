import { test, assertEq } from "./pruebas.js";
import { hayConfig } from "./db.js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../config.js";

test("la configuración está presente y no en blanco", () => {
  assertEq(hayConfig(), true);
});

test("la URL apunta a un proyecto de Supabase", () => {
  assertEq(/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(SUPABASE_URL), true);
});

test("la llave es una anon key, no una service_role", () => {
  const carga = JSON.parse(atob(SUPABASE_ANON_KEY.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
  assertEq(carga.role, "anon");
});
