// connect-iq/venu2/source/DaySelectView.mc
//
// Lista de routine_days (Task 10) vía Menu2. `dias` ya viene resuelto —
// esta vista solo presenta y captura la selección, nunca hace su propio
// fetch (spec §2: una sola fuente de verdad, leída por RoutineClient).
using Toybox.Lang;
using Toybox.WatchUi;

class DaySelectView extends WatchUi.Menu2 {
    function initialize(dias, ultimoDiaClave) {
        Menu2.initialize({ :title => "¿Qué día?" });
        var ordenados = ordenarConUltimoPrimero(dias, ultimoDiaClave);
        var i = 0;
        while (i < ordenados.size()) {
            var dia = ordenados[i];
            addItem(new WatchUi.MenuItem(dia.get("etiqueta"), dia.get("enfoque"), dia, {}));
            i++;
        }
    }

    function ordenarConUltimoPrimero(dias, ultimoDiaClave) {
        if (ultimoDiaClave == null) {
            return dias;
        }
        var resultado = [];
        var resto = [];
        var i = 0;
        while (i < dias.size()) {
            if (dias[i].get("clave").equals(ultimoDiaClave)) {
                resultado.add(dias[i]);
            } else {
                resto.add(dias[i]);
            }
            i++;
        }
        i = 0;
        while (i < resto.size()) {
            resultado.add(resto[i]);
            i++;
        }
        return resultado;
    }
}

class DaySelectDelegate extends WatchUi.Menu2InputDelegate {
    var _jwt;
    // Guarda contra doble tap: Menu2InputDelegate.onSelect no cierra el
    // menú solo, así que el menú sigue interactivo (y sin feedback visual)
    // mientras fetchBlocks/fetchExercises están en vuelo por BLE — hallazgo
    // C2 del review final.
    //
    // Re-review posterior (ronda 2): WatchUi.pushView NO destruye esta
    // vista/delegate — con el botón Back por defecto se vuelve a ESTA
    // MISMA instancia. Si _cargando solo se resetea en fallo, un tap
    // exitoso (día -> bloques -> Back) la deja en true para siempre y el
    // menú queda muerto el resto de la sesión. Por eso ahora se resetea en
    // TODAS las ramas terminales — éxito y fallo por igual — justo antes
    // de navegar fuera o de quedarse en este menú.
    var _cargando = false;

    function initialize(jwt) {
        Menu2InputDelegate.initialize();
        _jwt = jwt;
    }

    function onSelect(item) {
        if (_cargando) {
            return;
        }
        _cargando = true;
        var dia = item.getId() as Lang.Dictionary;
        Toybox.Application.Storage.setValue("ultimo_dia_clave", dia.get("clave"));
        RoutineClient.fetchBlocks(_jwt, dia.get("id"), method(:onBloques));
    }

    function onBloques(bloques) {
        if (bloques == null || bloques.size() == 0) {
            _cargando = false;
            // sin conexión, o día real sin bloques: se queda en el
            // selector de día (un menú vacío no sirve de nada).
            return;
        }
        if (bloques.size() == 1) {
            // Un solo bloque: salta directo a la captura (spec §4). Sigue
            // "en vuelo" hasta que resuelva onEjerciciosDirecto, así que
            // _cargando se queda en true aquí.
            RoutineClient.fetchExercises(_jwt, bloques[0].get("id"), method(:onEjerciciosDirecto));
            return;
        }
        _cargando = false;
        WatchUi.pushView(
            new BlockSelectView(bloques),
            new BlockSelectDelegate(_jwt),
            WatchUi.SLIDE_LEFT
        );
    }

    function onEjerciciosDirecto(ejercicios) {
        _cargando = false;
        if (ejercicios == null || ejercicios.size() == 0) {
            // sin conexión a media cadena, o bloque real sin ejercicios:
            // se queda en el selector de día.
            return;
        }
        Nav.abrirCaptura(_jwt, ejercicios);
    }
}
