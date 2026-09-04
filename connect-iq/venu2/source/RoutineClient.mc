// connect-iq/venu2/source/RoutineClient.mc
//
// Lectura de la rutina ya clonada del usuario, directo contra PostgREST —
// nunca se duplica rutina.js aquí (spec §2). No hay pruebas automáticas
// (llamada de red real); se verifica a mano contra el proyecto real (Step 4).
//
// class + module delgado (no un module a secas) por la misma razón que
// DeviceAuth.mc (Task 9): method(:onRoutineId)/method(:onListaDias)/etc.
// necesitan un self de verdad.
class RoutineClientImpl {
    // Listas de callbacks en vuelo, no un solo slot — hallazgo C2 del
    // review final: WatchUi.Menu2InputDelegate.onSelect no cierra el menú
    // solo, así que un segundo tap durante el fetch (BLE en curso, sin
    // feedback visual) reentra a onSelect y, con un solo slot, pisaba el
    // callback anterior.
    //
    // Re-review posterior (ronda 2): un solo _pendientesLista compartido
    // por fetchDays/fetchBlocks/fetchExercises solo era seguro porque
    // _cargando en DaySelectDelegate/BlockSelectDelegate nunca se
    // reseteaba en éxito, lo que impedía en la práctica que dos de estos
    // tres fetches se dispararan a la vez desde el mismo delegate. Al
    // corregir ese bug de _cargando (ahora sí se resetea en éxito), ese
    // accidente de protección desaparece: un fetchBlocks y un
    // fetchExercises podrían solaparse de verdad y entregar un payload de
    // ejercicios a un callback que esperaba bloques (o viceversa) —
    // corrupción de datos silenciosa. Por eso cada método tiene ahora su
    // propio array y su propio handler de respuesta; nunca se cruzan
    // aunque lleguen a solaparse.
    var _pendientesRoutineId = null;
    var _pendientesDias = null;
    var _pendientesBloques = null;
    var _pendientesEjercicios = null;

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
        // Defensa barata contra un array nulo (no alcanzable hoy con el
        // código actual, pero evita un .size()/loop sobre null si algo
        // llega a resetear el campo mientras hay un fetch en vuelo).
        if (callbacks == null) {
            return;
        }
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
        if (_pendientesDias == null) {
            _pendientesDias = [];
        }
        var enVuelo = _pendientesDias.size() > 0;
        _pendientesDias.add(onListo);
        if (enVuelo) {
            return;
        }
        var url = Config.SUPABASE_URL + "/rest/v1/routine_days?routine_id=eq." + routineId
            + "&select=id,clave,etiqueta,enfoque&order=posicion";
        HttpClient.getJson(url, cabeceras(jwt), method(:onListaDias));
    }

    function onListaDias(responseCode, data) {
        var callbacks = _pendientesDias;
        _pendientesDias = [];
        // Defensa barata contra un array nulo (no alcanzable hoy con el
        // código actual, pero evita un .size()/loop sobre null si algo
        // llega a resetear el campo mientras hay un fetch en vuelo).
        if (callbacks == null) {
            return;
        }
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

    function fetchBlocks(jwt, dayId, onListo) {
        if (_pendientesBloques == null) {
            _pendientesBloques = [];
        }
        var enVuelo = _pendientesBloques.size() > 0;
        _pendientesBloques.add(onListo);
        if (enVuelo) {
            return;
        }
        var url = Config.SUPABASE_URL + "/rest/v1/routine_blocks?day_id=eq." + dayId
            + "&select=id,clave,etiqueta&order=posicion";
        HttpClient.getJson(url, cabeceras(jwt), method(:onListaBloques));
    }

    function onListaBloques(responseCode, data) {
        var callbacks = _pendientesBloques;
        _pendientesBloques = [];
        // Defensa barata contra un array nulo (no alcanzable hoy con el
        // código actual, pero evita un .size()/loop sobre null si algo
        // llega a resetear el campo mientras hay un fetch en vuelo).
        if (callbacks == null) {
            return;
        }
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

    function fetchExercises(jwt, blockId, onListo) {
        if (_pendientesEjercicios == null) {
            _pendientesEjercicios = [];
        }
        var enVuelo = _pendientesEjercicios.size() > 0;
        _pendientesEjercicios.add(onListo);
        if (enVuelo) {
            return;
        }
        var url = Config.SUPABASE_URL + "/rest/v1/routine_exercises?block_id=eq." + blockId
            + "&select=id,slot,exercise_slug,series,reps,descanso,exercises(nombre)&order=posicion";
        HttpClient.getJson(url, cabeceras(jwt), method(:onListaEjercicios));
    }

    function onListaEjercicios(responseCode, data) {
        var callbacks = _pendientesEjercicios;
        _pendientesEjercicios = [];
        // Defensa barata contra un array nulo (no alcanzable hoy con el
        // código actual, pero evita un .size()/loop sobre null si algo
        // llega a resetear el campo mientras hay un fetch en vuelo).
        if (callbacks == null) {
            return;
        }
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
