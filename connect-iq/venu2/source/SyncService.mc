import Toybox.Timer;
import Toybox.Lang;

//
// Drena LogQueue hacia subir_registro_ejercicio (sql/006_edicion_cliente.sql),
// en orden, un pendiente a la vez — si uno falla, deja el resto encolado
// para el siguiente pase (igual que sync.js: nunca bloquea, nunca lanza).
//
// class + module delgado (no un module a secas) por la misma razón que
// DeviceAuth.mc (Task 9): method(:onTimer)/method(:onJwtParaEnvio)/
// method(:onRespuestaDeEnvio) necesitan un self de verdad.
class SyncServiceImpl {
    const INTERVALO_MS = 30 * 1000;

    var _timer = null;
    var _enProceso = false;
    var _jwtEnUso = null;
    var _entradaEnUso = null;

    function iniciar() as Void {
        if (_timer == null) {
            _timer = new Toybox.Timer.Timer();
            _timer.start(method(:onTimer), INTERVALO_MS, true);
        }
        drenar();
    }

    function onTimer() as Void {
        drenar();
    }

    function drenar() as Void {
        if (_enProceso) {
            return;
        }
        if (LogQueue.pendientes().size() == 0) {
            return;
        }
        _enProceso = true;
        DeviceAuth.getValidJwt(method(:onJwtParaEnvio));
    }

    function onJwtParaEnvio(jwt) as Void {
        if (jwt == null) {
            _enProceso = false; // sin conexión o token revocado: reintenta el próximo pase
            return;
        }
        enviarSiguiente(jwt);
    }

    function enviarSiguiente(jwt) as Void {
        var cola = LogQueue.pendientes();
        if (cola.size() == 0) {
            _enProceso = false;
            return;
        }
        var entrada = cola[0];
        _jwtEnUso = jwt;
        _entradaEnUso = entrada;
        var url = Config.SUPABASE_URL + "/rest/v1/rpc/subir_registro_ejercicio";
        var body = {
            "p_slot" => entrada.get("slot"),
            "p_slug" => entrada.get("slug"),
            "p_fecha" => entrada.get("fecha"),
            "p_peso" => entrada.get("pesoKg"),
            "p_series" => entrada.get("series"),
            "p_reps" => entrada.get("reps"),
            "p_hecho" => entrada.get("hecho"),
            "p_editado_en" => entrada.get("editadoEn")
        };
        var cabeceras = {
            "apikey" => Config.SUPABASE_ANON_KEY,
            "Authorization" => "Bearer " + jwt
        };
        HttpClient.postJson(url, cabeceras, body, method(:onRespuestaDeEnvio));
    }

    function onRespuestaDeEnvio(responseCode, data) as Void {
        if (responseCode == 200 || responseCode == 201) {
            LogQueue.quitarPendiente(_entradaEnUso.get("id"));
            enviarSiguiente(_jwtEnUso); // sigue con el resto de la cola de inmediato
            return;
        }
        if (responseCode == 401) {
            DeviceAuth.invalidar();
        }
        _enProceso = false;
    }
}

module SyncService {
    var _impl = new SyncServiceImpl();

    function iniciar() {
        _impl.iniciar();
    }

    function drenar() {
        _impl.drenar();
    }
}
