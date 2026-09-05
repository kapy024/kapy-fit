// connect-iq/venu2/source/RegistroBuilderTest.mc
import Toybox.Lang;
import Toybox.Test;

(:test)
function testConstruirEntradaArmaElPayloadCompleto(logger as Toybox.Test.Logger) as Boolean {
    var ejercicio = { "slot" => "dia3:base:sentadilla", "exercise_slug" => "sentadilla" };
    var entrada = RegistroBuilder.construirEntrada(ejercicio, 42.5, 4, 10, "2026-09-03", "2026-09-03T10:00:00Z");
    Toybox.Test.assertEqual(entrada.get("slot"), "dia3:base:sentadilla");
    Toybox.Test.assertEqual(entrada.get("slug"), "sentadilla");
    Toybox.Test.assertEqual(entrada.get("fecha"), "2026-09-03");
    Toybox.Test.assertEqual(entrada.get("pesoKg"), 42.5);
    Toybox.Test.assertEqual(entrada.get("series"), 4);
    Toybox.Test.assertEqual(entrada.get("reps"), "10");
    Toybox.Test.assertEqual(entrada.get("hecho"), true);
    Toybox.Test.assertEqual(entrada.get("editadoEn"), "2026-09-03T10:00:00Z");
    return true;
}

(:test)
function testConstruirEntradaConvierteRepsANumeroEnTexto(logger as Toybox.Test.Logger) as Boolean {
    // exercise_logs.reps es `text` (spec §4 nota, sql/001_esquema.sql): el
    // stepper trabaja con un Number, pero el payload siempre manda String.
    var ejercicio = { "slot" => "dia3:base:sentadilla", "exercise_slug" => "sentadilla" };
    var entrada = RegistroBuilder.construirEntrada(ejercicio, 0, 0, 0, "2026-09-03", "2026-09-03T10:00:00Z");
    Toybox.Test.assertEqual(entrada.get("reps"), "0");
    return true;
}
