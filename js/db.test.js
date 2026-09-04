import { test, assertEq } from "./pruebas.js";
import { hayConfig, cliente, libreriaDisponible, _fijarUrlLibreriaParaPruebas } from "./db.js";
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

// Regression test for the CDN-outage bug: cliente() used to import
// supabase-js at the top of the module, so an unreachable CDN took down the
// static graph reaching db.js (app.js -> sesion-ui.js -> auth.js -> db.js)
// and nothing could draw the routine. Now the import is dynamic and lives
// inside cliente(), so a bad URL can only ever fail this one promise.
test("cliente() no revienta cuando la librería no carga: rechaza en vez de tirar el módulo", async () => {
  _fijarUrlLibreriaParaPruebas("https://cdn-que-no-existe.invalid/supabase.js");
  let lanzoSincrono = false;
  let promesa;
  try {
    promesa = cliente();
  } catch (_e) {
    lanzoSincrono = true;
  }
  assertEq(lanzoSincrono, false, "cliente() no debe lanzar de forma síncrona");

  let rechazo = null;
  try {
    await promesa;
  } catch (e) {
    rechazo = e;
  }
  assertEq(rechazo !== null, true, "cliente() debió rechazar cuando la URL no resuelve");

  _fijarUrlLibreriaParaPruebas();
});

test("libreriaDisponible() responde false, no revienta, cuando la CDN no resuelve", async () => {
  _fijarUrlLibreriaParaPruebas("https://cdn-que-no-existe.invalid/supabase.js");
  const disponible = await libreriaDisponible();
  assertEq(disponible, false);
  _fijarUrlLibreriaParaPruebas();
});

test("libreriaDisponible() responde true con la librería real", async () => {
  const disponible = await libreriaDisponible();
  assertEq(disponible, true);
});
