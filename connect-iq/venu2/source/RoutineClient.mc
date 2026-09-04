// connect-iq/venu2/source/RoutineClient.mc
//
// Lectura de la rutina ya clonada del usuario, directo contra PostgREST —
// nunca se duplica rutina.js aquí (spec §2). No hay pruebas automáticas
// (llamada de red real); se verifica a mano contra el proyecto real (Step 4).
//
// class + module delgado (no un module a secas) por la misma razón que
// DeviceAuth.mc (Task 9): method(:onRoutineId)/method(:onLista) necesitan
// un self de verdad.
class RoutineClientImpl {
    // Listas de callbacks en vuelo, no un solo slot — hallazgo C2 del
    // review final: WatchUi.Menu2InputDelegate.onSelect no cierra el menú
    // solo, así que un segundo tap durante el fetch (BLE en curso, sin
    // feedback visual) reentra a onSelect y, con un solo slot, pisaba el
    // callback anterior. _pendientesLista es compartida por fetchDays/
    // fetchBlocks/fetchExercises igual que antes lo era _onListoLista —
    // ver análisis de solape entre-métodos junto a los call sites en
    // DaySelectView.mc/BlockSelectView.mc: no es alcanzable con las
    // pantallas actuales, así que un solo array compartido basta.
    var _pendientesRoutineId = null;
    var _pendientesLista = null;

    function cabeceras(jwt) {
        return {
            "apikey" => Config.SUPABASE_ANON_KEY,
            "Authorization" => "Bearer " + jwt
        };
    }

    function fetchRoutineId(jwt, onListo) {
        if (_pendientesRoutineId == null) {
            _pendientesRoutineId = [];
        }
        var enVuelo = _pendientesRoutineId.size() > 0;
        _pendientesRoutineId.add(onListo);
        if (enVuelo) {
            return;
        }
        var url = Config.SUPABASE_URL + "/rest/v1/routines?select=id&user_id=not.is.null";
        HttpClient.getJson(url, cabeceras(jwt), method(:onRoutineId));
    }

    function onRoutineId(responseCode, data) {
        var callbacks = _pendientesRoutineId;
        _pendientesRoutineId = [];
        var routineId = null;
        if (responseCode == 200 && data != null && data.size() > 0) {
            routineId = data[0].get("id");
        }
        var i = 0;
        while (i < callbacks.size()) {
            callbacks[i].invoke(routineId);
            i++;
        }
    }

    function fetchDays(jwt, routineId, onListo) {
        var enVuelo = _agregarPendienteLista(onListo);
        if (enVuelo) {
            return;
        }
        var url = Config.SUPABASE_URL + "/rest/v1/routine_days?routine_id=eq." + routineId
            + "&select=id,clave,etiqueta,enfoque&order=posicion";
        HttpClient.getJson(url, cabeceras(jwt), method(:onLista));
    }

    function fetchBlocks(jwt, dayId, onListo) {
        var enVuelo = _agregarPendienteLista(onListo);
        if (enVuelo) {
            return;
        }
        var url = Config.SUPABASE_URL + "/rest/v1/routine_blocks?day_id=eq." + dayId
            + "&select=id,clave,etiqueta&order=posicion";
        HttpClient.getJson(url, cabeceras(jwt), method(:onLista));
    }

    function fetchExercises(jwt, blockId, onListo) {
        var enVuelo = _agregarPendienteLista(onListo);
        if (enVuelo) {
            return;
        }
        var url = Config.SUPABASE_URL + "/rest/v1/routine_exercises?block_id=eq." + blockId
            + "&select=id,slot,exercise_slug,series,reps,descanso,exercises(nombre)&order=posicion";
        HttpClient.getJson(url, cabeceras(jwt), method(:onLista));
    }

    // Agrega onListo a _pendientesLista (creándola si hace falta) y
    // devuelve true si ya había un fetch en vuelo (no disparar otro).
    function _agregarPendienteLista(onListo) {
        if (_pendientesLista == null) {
            _pendientesLista = [];
        }
        var enVuelo = _pendientesLista.size() > 0;
        _pendientesLista.add(onListo);
        return enVuelo;
    }

    function onLista(responseCode, data) {
        var callbacks = _pendientesLista;
        _pendientesLista = [];
        var resultado = null;
        if (responseCode == 200 && data != null) {
            resultado = data;
        }
        var i = 0;
        while (i < callbacks.size()) {
            callbacks[i].invoke(resultado);
            i++;
        }
    }
}

module RoutineClient {
    var _impl = new RoutineClientImpl();

    function fetchRoutineId(jwt, onListo) {
        _impl.fetchRoutineId(jwt, onListo);
    }

    function fetchDays(jwt, routineId, onListo) {
        _impl.fetchDays(jwt, routineId, onListo);
    }

    function fetchBlocks(jwt, dayId, onListo) {
        _impl.fetchBlocks(jwt, dayId, onListo);
    }

    function fetchExercises(jwt, blockId, onListo) {
        _impl.fetchExercises(jwt, blockId, onListo);
    }
}
