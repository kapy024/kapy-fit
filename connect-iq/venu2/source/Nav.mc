// connect-iq/venu2/source/Nav.mc
using Toybox.WatchUi;

module Nav {
    // La vista se crea primero y se le pasa al delegate (no al revés): el
    // delegate necesita mutar la MISMA instancia que se está dibujando
    // (ajustarPeso/ajustarSeries/ajustarReps/avanzar en el Task 14), no una
    // copia independiente construida con los mismos argumentos.
    function abrirCaptura(jwt, ejercicios) {
        if (ejercicios == null || ejercicios.size() == 0) {
            return;
        }
        var vista = new ExerciseLogView(ejercicios, 0);
        WatchUi.pushView(vista, new ExerciseLogDelegate(jwt, vista), WatchUi.SLIDE_LEFT);
    }
}
