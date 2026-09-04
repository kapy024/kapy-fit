// connect-iq/venu2/source/BlockSelectView.mc
//
// Solo se llega aquí cuando el día tiene MÁS de un bloque — DaySelectDelegate
// (Task 12) salta directo a la captura si hay uno solo (spec §4).
using Toybox.Lang;
using Toybox.WatchUi;

class BlockSelectView extends WatchUi.Menu2 {
    function initialize(bloques) {
        Menu2.initialize({ :title => "¿Qué bloque?" });
        var i = 0;
        while (i < bloques.size()) {
            addItem(new WatchUi.MenuItem(bloques[i].get("etiqueta"), null, bloques[i], {}));
            i++;
        }
    }
}

class BlockSelectDelegate extends WatchUi.Menu2InputDelegate {
    var _jwt;
    // Misma guarda contra doble tap que DaySelectDelegate (hallazgo C2 del
    // review final) — el menú sigue interactivo mientras fetchExercises
    // está en vuelo. No se resetea en éxito; sí en el fallo, para permitir
    // reintentar.
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
        var bloque = item.getId() as Lang.Dictionary;
        RoutineClient.fetchExercises(_jwt, bloque.get("id"), method(:onEjercicios));
    }

    function onEjercicios(ejercicios) {
        if (ejercicios == null) {
            _cargando = false;
            return; // sin conexión: se queda en el selector de bloque
        }
        Nav.abrirCaptura(_jwt, ejercicios);
    }
}
