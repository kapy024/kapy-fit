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
    var _onListoRoutineId = null;
    var _onListoLista = null;

    function cabeceras(jwt) {
        return {
            "apikey" => Config.SUPABASE_ANON_KEY,
            "Authorization" => "Bearer " + jwt
        };
    }

    function fetchRoutineId(jwt, onListo) {
        _onListoRoutineId = onListo;
        var url = Config.SUPABASE_URL + "/rest/v1/routines?select=id&user_id=not.is.null";
        HttpClient.getJson(url, cabeceras(jwt), method(:onRoutineId));
    }

    function onRoutineId(responseCode, data) {
        var callback = _onListoRoutineId;
        _onListoRoutineId = null;
        if (responseCode != 200 || data == null || data.size() == 0) {
            callback.invoke(null);
            return;
        }
        callback.invoke(data[0].get("id"));
    }

    function fetchDays(jwt, routineId, onListo) {
        _onListoLista = onListo;
        var url = Config.SUPABASE_URL + "/rest/v1/routine_days?routine_id=eq." + routineId
            + "&select=id,clave,etiqueta,enfoque&order=posicion";
        HttpClient.getJson(url, cabeceras(jwt), method(:onLista));
    }

    function fetchBlocks(jwt, dayId, onListo) {
        _onListoLista = onListo;
        var url = Config.SUPABASE_URL + "/rest/v1/routine_blocks?day_id=eq." + dayId
            + "&select=id,clave,etiqueta&order=posicion";
        HttpClient.getJson(url, cabeceras(jwt), method(:onLista));
    }

    function fetchExercises(jwt, blockId, onListo) {
        _onListoLista = onListo;
        var url = Config.SUPABASE_URL + "/rest/v1/routine_exercises?block_id=eq." + blockId
            + "&select=id,slot,exercise_slug,series,reps,descanso,exercises(nombre)&order=posicion";
        HttpClient.getJson(url, cabeceras(jwt), method(:onLista));
    }

    function onLista(responseCode, data) {
        var callback = _onListoLista;
        _onListoLista = null;
        if (responseCode != 200 || data == null) {
            callback.invoke(null);
            return;
        }
        callback.invoke(data);
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
