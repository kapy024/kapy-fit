// connect-iq/venu2/source/ExerciseLogView.mc
using Toybox.WatchUi;
using Toybox.Graphics;

const PASO_KG = 1.25;

class ExerciseLogView extends WatchUi.View {
    var _ejercicios;
    var _indice;
    var _pesoKg;
    var _series;
    var _reps;

    function initialize(ejercicios, indice) {
        View.initialize();
        _ejercicios = ejercicios;
        _indice = indice;
        reiniciarSteppers();
    }

    // Los steppers siempre arrancan en 0/objetivo, nunca conservan el valor
    // del ejercicio anterior — cada serie es una captura nueva.
    function reiniciarSteppers() {
        var actual = ejercicioActual();
        _pesoKg = 0.0;
        _series = actual.get("series") != null ? actual.get("series") : 0;
        _reps = 0; // "reps" de la rutina es texto libre ("10 der / 15 izq"); no hay un objetivo numérico que precargar
    }

    function ejercicioActual() {
        return _ejercicios[_indice];
    }

    function pesoKg() { return _pesoKg; }
    function series() { return _series; }
    function reps() { return _reps; }

    function ajustarPeso(delta) {
        var nuevo = _pesoKg + (delta * PASO_KG);
        _pesoKg = nuevo > 0 ? nuevo : 0.0;
    }

    function ajustarSeries(delta) {
        var nuevo = _series + delta;
        _series = nuevo > 0 ? nuevo : 0;
    }

    function ajustarReps(delta) {
        var nuevo = _reps + delta;
        _reps = nuevo > 0 ? nuevo : 0;
    }

    // Avanza al siguiente ejercicio del bloque. Si ya era el último, se
    // queda ahí con los steppers reiniciados — el spec no define una
    // pantalla de "bloque terminado"; el botón físico de regreso (que
    // WatchUi maneja solo, sin código nuestro) es la salida.
    function avanzar() {
        if (_indice + 1 >= _ejercicios.size()) {
            reiniciarSteppers();
            return false;
        }
        _indice = _indice + 1;
        reiniciarSteppers();
        return true;
    }

    function onLayout(dc) {
    }

    function onUpdate(dc) {
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.clear();
        var w = dc.getWidth();
        var h = dc.getHeight();
        var nombre = ejercicioActual().get("exercises").get("nombre");
        dc.drawText(w / 2, h * 0.06, Graphics.FONT_SMALL, nombre, Graphics.TEXT_JUSTIFY_CENTER);
        dibujarFila(dc, w, h * 0.30, "Peso (kg)", _pesoKg.format("%.2f"));
        dibujarFila(dc, w, h * 0.55, "Series", _series.toString());
        dibujarFila(dc, w, h * 0.72, "Reps", _reps.toString());
        dc.drawText(w / 2, h * 0.92, Graphics.FONT_SMALL, "Guardar", Graphics.TEXT_JUSTIFY_CENTER);
    }

    function dibujarFila(dc, w, y, etiqueta, valor) {
        dc.drawText(w * 0.5, y - 24, Graphics.FONT_XTINY, etiqueta, Graphics.TEXT_JUSTIFY_CENTER);
        dc.drawText(w * 0.15, y, Graphics.FONT_LARGE, "－", Graphics.TEXT_JUSTIFY_CENTER);
        dc.drawText(w * 0.5, y, Graphics.FONT_MEDIUM, valor, Graphics.TEXT_JUSTIFY_CENTER);
        dc.drawText(w * 0.85, y, Graphics.FONT_LARGE, "＋", Graphics.TEXT_JUSTIFY_CENTER);
    }
}
