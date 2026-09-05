// connect-iq/venu2/source/RestTimerView.mc
using Toybox.WatchUi;
using Toybox.Graphics;
using Toybox.Attention;
using Toybox.System;

const EXTENSION_SEGUNDOS = 30;

class RestTimerView extends WatchUi.View {
    var _restantes;
    var _sinDescanso;
    var _timer;

    function initialize(segundos) {
        View.initialize();
        _sinDescanso = segundos == null;
        _restantes = segundos == null ? 0 : segundos;
    }

    function esSinDescanso() {
        return _sinDescanso;
    }

    function onShow() {
        if (_sinDescanso) {
            return;
        }
        _timer = new Toybox.Timer.Timer();
        _timer.start(method(:onTick), 1000, true);
    }

    function onHide() {
        if (_timer != null) {
            _timer.stop();
            _timer = null;
        }
    }

    function onTick() as Void {
        _restantes = _restantes - 1;
        if (_restantes <= 0) {
            _timer.stop();
            _timer = null;
            if (Toybox.Attention has :vibrate) {
                Toybox.Attention.vibrate([new Toybox.Attention.VibeProfile(50, 1000)]);
            }
            WatchUi.popView(WatchUi.SLIDE_RIGHT);
            return;
        }
        WatchUi.requestUpdate();
    }

    function extender() {
        _restantes = _restantes + EXTENSION_SEGUNDOS;
        WatchUi.requestUpdate();
    }

    function onUpdate(dc) {
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.clear();
        var w = dc.getWidth();
        var h = dc.getHeight();
        if (_sinDescanso) {
            dc.drawText(w / 2, h / 2, Graphics.FONT_MEDIUM, "Sin descanso", Graphics.TEXT_JUSTIFY_CENTER);
            dc.drawText(w / 2, h * 0.85, Graphics.FONT_XTINY, "toca para continuar", Graphics.TEXT_JUSTIFY_CENTER);
            return;
        }
        dc.drawText(w / 2, h * 0.35, Graphics.FONT_NUMBER_HOT, RestTimer.formatMMSS(_restantes), Graphics.TEXT_JUSTIFY_CENTER);
        dc.drawText(w * 0.25, h * 0.75, Graphics.FONT_TINY, "Cancelar", Graphics.TEXT_JUSTIFY_CENTER);
        dc.drawText(w * 0.75, h * 0.75, Graphics.FONT_TINY, "+30s", Graphics.TEXT_JUSTIFY_CENTER);
    }
}

class RestTimerDelegate extends WatchUi.BehaviorDelegate {
    var _view;

    function initialize(view) {
        BehaviorDelegate.initialize();
        _view = view;
    }

    function onTap(clickEvent) {
        if (_view.esSinDescanso()) {
            WatchUi.popView(WatchUi.SLIDE_RIGHT);
            return true;
        }
        var x = clickEvent.getCoordinates()[0];
        var w = System.getDeviceSettings().screenWidth;
        if (x < (w * 0.5)) {
            WatchUi.popView(WatchUi.SLIDE_RIGHT); // cancelar
        } else {
            _view.extender();
        }
        return true;
    }
}
