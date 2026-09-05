// connect-iq/venu2/source/RestTimerTest.mc
//
// Casos calcados de js/registro.test.js (parseRestSeconds), para que el
// port se comporte exactamente igual que la web frente a las mismas
// etiquetas reales de rutina.js.
import Toybox.Test;

(:test)
function testTomaElExtremoAltoDeUnRango(logger as Toybox.Test.Logger) as Toybox.Lang.Boolean {
    // en dash, no guion: mismo caracter que usa rutina.js ("30–45 seg")
    Toybox.Test.assertEqual(RestTimer.parseRestSeconds("30–45 seg"), 45);
    return true;
}

(:test)
function testSinDescansoNoDaDuracion(logger as Toybox.Test.Logger) as Toybox.Lang.Boolean {
    Toybox.Test.assertEqual(RestTimer.parseRestSeconds("Sin descanso"), null);
    return true;
}

(:test)
function testLeeElNumeroConAclaracionEntreParentesis(logger as Toybox.Test.Logger) as Toybox.Lang.Boolean {
    Toybox.Test.assertEqual(RestTimer.parseRestSeconds("10 seg (entre intervalos)"), 10);
    return true;
}

(:test)
function testConvierteMinutosASegundos(logger as Toybox.Test.Logger) as Toybox.Lang.Boolean {
    Toybox.Test.assertEqual(RestTimer.parseRestSeconds("hasta 1 min continuo"), 60);
    return true;
}

(:test)
function testSinEtiquetaNoDaDuracion(logger as Toybox.Test.Logger) as Toybox.Lang.Boolean {
    Toybox.Test.assertEqual(RestTimer.parseRestSeconds(null), null);
    return true;
}

(:test)
function testFormatMMSSRellenaLosSegundos(logger as Toybox.Test.Logger) as Toybox.Lang.Boolean {
    Toybox.Test.assertEqual(RestTimer.formatMMSS(65), "1:05");
    Toybox.Test.assertEqual(RestTimer.formatMMSS(5), "0:05");
    Toybox.Test.assertEqual(RestTimer.formatMMSS(125), "2:05");
    return true;
}
