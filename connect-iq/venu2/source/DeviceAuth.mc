import Toybox.Application;
import Toybox.Time;

//
// Cachea el JWT de 1h que da device-token-exchange (Task 2) en Storage, y
// lo renueva antes de que caduque. El reloj nunca ve el JWT secret ni la
// service_role key (spec §3) — solo Secrets.DEVICE_TOKEN y este JWT corto.
//
// class + module delgado (no un module a secas): method(:onRespuestaDeIntercambio)
// necesita un `self` de verdad al que enlazarse, y un module suelto no lo
// tiene. Ver nota arriba de este Step.
class DeviceAuthImpl {
    const JWT_KEY = "auth_jwt";
    const EXP_KEY = "auth_jwt_exp";
    const MARGIN_SECONDS = 60;
    const EXCHANGE_URL = "https://oakahiwejhzsxccrscmk.functions.supabase.co/device-token-exchange";

    // Lista de callbacks esperando un JWT vigente. Puede haber más de uno
    // en vuelo a la vez: HierroVenuApp.onStart() llama SyncService.iniciar()
    // (que puede disparar su propio getValidJwt() si la cola no está vacía)
    // y luego DeviceAuth.getValidJwt(method(:onJwtInicial)) de forma
    // síncrona, antes de que responda el primero — hallazgo C1 del review
    // final. Un solo slot sobrescrito perdía el primer callback y hacía
    // .invoke() sobre null en el segundo.
    var _pendientes = null;

    // true si un JWT con expiración `exp` (segundos, mismo reloj que
    // Time.now().value()) ya no sirve en el momento `ahora`, con MARGIN_SECONDS
    // de colchón para no arrancar una llamada con un JWT a punto de caducar.
    function expirado(exp, ahora) {
        if (exp == null) {
            return true;
        }
        return ahora >= (exp - MARGIN_SECONDS);
    }

    // Entrega un JWT vigente por onListo.invoke(jwt) — jwt es null si el
    // intercambio falló (sin conexión, token revocado). Nunca lanza.
    function getValidJwt(onListo) {
        var jwt = Toybox.Application.Storage.getValue(JWT_KEY);
        var exp = Toybox.Application.Storage.getValue(EXP_KEY);
        var ahora = Toybox.Time.now().value();
        if (jwt != null && !expirado(exp, ahora)) {
            onListo.invoke(jwt);
            return;
        }
        if (_pendientes == null) {
            _pendientes = [];
        }
        var yaHabiaIntercambioEnVuelo = _pendientes.size() > 0;
        _pendientes.add(onListo);
        if (yaHabiaIntercambioEnVuelo) {
            // Ya hay un postJson en camino: este waiter se resuelve cuando
            // responda ese, no dispara una segunda llamada de red.
            return;
        }
        HttpClient.postJson(
            EXCHANGE_URL,
            {},
            { "device_token" => Secrets.DEVICE_TOKEN },
            method(:onRespuestaDeIntercambio)
        );
    }

    // Parte PURA de leer la respuesta de device-token-exchange (Task 2):
    // sin Storage, sin invocar ningún callback — solo interpreta
    // (responseCode, data) y devuelve {"ok"=>true, "jwt"=>.., "expiresIn"=>..}
    // o {"ok"=>false}. Separado de onRespuestaDeIntercambio (que sí toca
    // Storage) para poder probar los tres casos (éxito/revocado/sin red)
    // sin una llamada de red real — spec §6 lo pide explícito.
    function interpretarRespuesta(responseCode, data) {
        if (responseCode != 200 || data == null) {
            return { "ok" => false };
        }
        var jwt = data.get("access_token");
        var expiresIn = data.get("expires_in");
        if (jwt == null || expiresIn == null) {
            return { "ok" => false };
        }
        return { "ok" => true, "jwt" => jwt, "expiresIn" => expiresIn };
    }

    function onRespuestaDeIntercambio(responseCode, data) {
        var callbacks = _pendientes;
        _pendientes = [];
        // Defensa barata: solo alcanzable si _reiniciarParaPruebas() corre
        // en carrera con un intercambio en vuelo — no ejercitado hoy por
        // ningún test, pero evita un .size()/loop sobre null.
        if (callbacks == null) {
            return;
        }
        var resultado = interpretarRespuesta(responseCode, data);
        var jwt = null;
        if (resultado.get("ok")) {
            jwt = resultado.get("jwt");
            Toybox.Application.Storage.setValue(JWT_KEY, jwt);
            Toybox.Application.Storage.setValue(EXP_KEY, Toybox.Time.now().value() + resultado.get("expiresIn"));
        }
        var i = 0;
        while (i < callbacks.size()) {
            callbacks[i].invoke(jwt);
            i++;
        }
    }

    // Borra el JWT cacheado, forzando una renovación en el próximo
    // getValidJwt(). Uso real: SyncService.mc lo llama cuando PostgREST
    // responde 401 a media cola (el JWT caducó entre el getValidJwt() y el
    // envío). No es solo-pruebas — _reiniciarParaPruebas() de abajo
    // reusa esto mismo para no duplicar los dos deleteValue.
    function invalidar() {
        Toybox.Application.Storage.deleteValue(JWT_KEY);
        Toybox.Application.Storage.deleteValue(EXP_KEY);
    }

    function _reiniciarParaPruebas() {
        invalidar();
        _pendientes = null;
    }
}

// Envoltorio delgado: una sola instancia de DeviceAuthImpl, expuesta con la
// misma sintaxis DeviceAuth.x(...) que usa el resto del plan (Tasks 10, 11,
// 16) — nadie fuera de este archivo necesita saber que por dentro es una
// clase, no un module a secas.
module DeviceAuth {
    var _impl = new DeviceAuthImpl();

    function getValidJwt(onListo) {
        _impl.getValidJwt(onListo);
    }

    function expirado(exp, ahora) {
        return _impl.expirado(exp, ahora);
    }

    function interpretarRespuesta(responseCode, data) {
        return _impl.interpretarRespuesta(responseCode, data);
    }

    function invalidar() {
        _impl.invalidar();
    }

    function _reiniciarParaPruebas() {
        _impl._reiniciarParaPruebas();
    }
}
