import Toybox.Test;
import Toybox.Time;
import Toybox.Time.Gregorian;

(:test)
function testIsoUtcFormateaFechaCompleta(logger as Toybox.Test.Logger) as Toybox.Lang.Boolean {
    // Gregorian.moment() interpreta cada campo como UTC (documentado);
    // si esta prueba falla con una hora corrida, revisar el reporte de
    // bug del foro de Garmin sobre moment()/info() antes de asumir que
    // TimeUtil.isoUtc está mal.
    var momento = Gregorian.moment({
        :year => 2026, :month => 9, :day => 3,
        :hour => 14, :minute => 5, :second => 9
    });
    Toybox.Test.assertEqual(TimeUtil.isoUtc(momento), "2026-09-03T14:05:09Z");
    return true;
}

(:test)
function testIsoUtcRellenaConCeros(logger as Toybox.Test.Logger) as Toybox.Lang.Boolean {
    var momento = Gregorian.moment({
        :year => 2026, :month => 1, :day => 5,
        :hour => 0, :minute => 3, :second => 7
    });
    Toybox.Test.assertEqual(TimeUtil.isoUtc(momento), "2026-01-05T00:03:07Z");
    return true;
}

(:test)
function testHoyIsoTieneFormatoAAAAMMDD(logger as Toybox.Test.Logger) as Toybox.Lang.Boolean {
    // Sin un reloj simulado no se puede fijar "hoy" en la prueba (igual que
    // hoyISO() en almacen.js, que tampoco se prueba contra una fecha fija) —
    // se verifica la FORMA (10 caracteres, guiones en las posiciones 4 y 7),
    // no un valor exacto.
    var hoy = TimeUtil.hoyIso();
    Toybox.Test.assertEqual(hoy.length(), 10);
    Toybox.Test.assertEqual(hoy.substring(4, 5), "-");
    Toybox.Test.assertEqual(hoy.substring(7, 8), "-");
    return true;
}
