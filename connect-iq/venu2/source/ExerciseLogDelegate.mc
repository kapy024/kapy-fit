// connect-iq/venu2/source/ExerciseLogDelegate.mc
using Toybox.WatchUi;
using Toybox.System;

// Función pura, sin Storage ni red — separada de guardar() (abajo) para
// poder probarla sola (spec §6: "construcción del payload de un registro").
module RegistroBuilder {
    function construirEntrada(ejercicio, pesoKg, series, reps, fecha, editadoEn) {
        return {
            "slot" => ejercicio.get("slot"),
            "slug" => ejercicio.get("exercise_slug"),
            "fecha" => fecha,
            "pesoKg" => pesoKg,
            "series" => series,
            "reps" => reps.toString(),
            "hecho" => true,
            "editadoEn" => editadoEn
        };
    }
}

class ExerciseLogDelegate extends WatchUi.BehaviorDelegate {
    var _jwt;
    var _view;

    function initialize(jwt, view) {
        BehaviorDelegate.initialize();
        _jwt = jwt;
        _view = view;
    }

    function onTap(clickEvent) {
        var coords = clickEvent.getCoordinates();
        var x = coords[0];
        var y = coords[1];
        var settings = System.getDeviceSettings();
        var w = settings.screenWidth;
        var h = settings.screenHeight;
        var delta = 0;
        if (x < (w * 0.35)) { delta = -1; }
        if (x > (w * 0.65)) { delta = 1; }

        if (enFila(y, h, 0.30)) {
            if (delta != 0) { _view.ajustarPeso(delta); WatchUi.requestUpdate(); }
            return true;
        }
        if (enFila(y, h, 0.55)) {
            if (delta != 0) { _view.ajustarSeries(delta); WatchUi.requestUpdate(); }
            return true;
        }
        if (enFila(y, h, 0.72)) {
            if (delta != 0) { _view.ajustarReps(delta); WatchUi.requestUpdate(); }
            return true;
        }
        if (y > (h * 0.85)) {
            guardar();
            return true;
        }
        return false;
    }

    // Tolerancia +-30px (antes +-40): con la fila de Reps en 0.72 y
    // "Guardar" desde 0.85, +-40 alcanzaba a solapar ambas zonas en la
    // pantalla real del Venu 2 (416px) — hallazgo de revisión del Task 14.
    function enFila(y, h, fraccion) {
        var centro = h * fraccion;
        return y > (centro - 30) && y < (centro + 30);
    }

    // Botón físico arriba/abajo (o swipe vertical en pantalla táctil):
    // salta al siguiente ejercicio SIN registrar nada (spec §4: "Swipe o
    // botón físico para saltar sin registrar").
    function onNextPage() {
        _view.avanzar();
        WatchUi.requestUpdate();
        return true;
    }

    // Encola la serie (con editadoEn sellado AQUÍ, al capturarla — spec §4,
    // nunca al enviarla), pide un intento de envío inmediato, y abre el
    // temporizador de descanso del ejercicio que se acaba de guardar.
    function guardar() {
        var ejercicio = _view.ejercicioActual();
        var entrada = RegistroBuilder.construirEntrada(
            ejercicio, _view.pesoKg(), _view.series(), _view.reps(),
            TimeUtil.hoyIso(), TimeUtil.nowIsoUtc()
        );
        LogQueue.encolar(entrada);
        SyncService.drenar();

        var segundos = RestTimer.parseRestSeconds(ejercicio.get("descanso"));
        _view.avanzar();
        var vistaDescanso = new RestTimerView(segundos);
        WatchUi.pushView(vistaDescanso, new RestTimerDelegate(vistaDescanso), WatchUi.SLIDE_LEFT);
    }
}
