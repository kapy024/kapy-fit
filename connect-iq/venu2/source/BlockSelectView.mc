// connect-iq/venu2/source/BlockSelectView.mc
//
// Solo se llega aquí cuando el día tiene MÁS de un bloque — DaySelectDelegate
// (Task 12) salta directo a la captura si hay uno solo (spec §4).
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

    function initialize(jwt) {
        Menu2InputDelegate.initialize();
        _jwt = jwt;
    }

    function onSelect(item) {
        var bloque = item.getId();
        RoutineClient.fetchExercises(_jwt, bloque.get("id"), method(:onEjercicios));
    }

    function onEjercicios(ejercicios) {
        Nav.abrirCaptura(_jwt, ejercicios);
    }
}
