using Toybox.Application;
using Toybox.WatchUi;

class HierroVenuApp extends Application.AppBase {
    var _jwtInicial;

    function initialize() {
        AppBase.initialize();
    }

    function getInitialView() {
        return [new LoadingView()];
    }

    function onStart(state) {
        SyncService.iniciar();
        DeviceAuth.getValidJwt(method(:onJwtInicial));
    }

    function onJwtInicial(jwt) {
        if (jwt == null) {
            return; // sin conexión al abrir: SyncService (ya iniciado) reintenta solo
        }
        _jwtInicial = jwt;
        RoutineClient.fetchRoutineId(jwt, method(:onRoutineIdInicial));
    }

    function onRoutineIdInicial(routineId) {
        if (routineId == null) {
            return;
        }
        RoutineClient.fetchDays(_jwtInicial, routineId, method(:onDiasIniciales));
    }

    function onDiasIniciales(dias) {
        if (dias == null || dias.size() == 0) {
            return;
        }
        var ultimoDiaClave = Toybox.Application.Storage.getValue("ultimo_dia_clave");
        WatchUi.switchToView(
            new DaySelectView(dias, ultimoDiaClave),
            new DaySelectDelegate(_jwtInicial),
            WatchUi.SLIDE_IMMEDIATE
        );
    }

    function onStop(state) {
    }
}