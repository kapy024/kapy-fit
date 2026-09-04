// connect-iq/venu2/source/DaySelectView.mc
//
// Lista de routine_days (Task 10) vía Menu2. `dias` ya viene resuelto —
// esta vista solo presenta y captura la selección, nunca hace su propio
// fetch (spec §2: una sola fuente de verdad, leída por RoutineClient).
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

    function initialize(jwt) {
        Menu2InputDelegate.initialize();
        _jwt = jwt;
    }

    function onSelect(item) {
        var dia = item.getId();
        Toybox.Application.Storage.setValue("ultimo_dia_clave", dia.get("clave"));
        RoutineClient.fetchBlocks(_jwt, dia.get("id"), method(:onBloques));
    }

    function onBloques(bloques) {
        if (bloques == null) {
            return; // sin conexión: se queda en el selector de día
        }
        if (bloques.size() == 1) {
            // Un solo bloque: salta directo a la captura (spec §4).
            RoutineClient.fetchExercises(_jwt, bloques[0].get("id"), method(:onEjerciciosDirecto));
            return;
        }
        WatchUi.pushView(
            new BlockSelectView(bloques),
            new BlockSelectDelegate(_jwt),
            WatchUi.SLIDE_LEFT
        );
    }

    function onEjerciciosDirecto(ejercicios) {
        Nav.abrirCaptura(_jwt, ejercicios);
    }
}
