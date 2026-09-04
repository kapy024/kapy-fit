import Toybox.Lang;
import Toybox.Test;

(:test)
function testEncolarAgregaUnPendiente(logger as Toybox.Test.Logger) as Boolean {
    LogQueue._reiniciarParaPruebas();
    var entrada = {
        "slot" => "dia1:v1:sentadilla", "slug" => "sentadilla", "fecha" => "2026-09-03",
        "pesoKg" => 40, "series" => 4, "reps" => "10", "hecho" => true,
        "editadoEn" => "2026-09-03T10:00:00Z"
    };
    LogQueue.encolar(entrada);
    var cola = LogQueue.pendientes();
    Toybox.Test.assertEqual(cola.size(), 1);
    Toybox.Test.assertEqual(cola[0].get("slug"), "sentadilla");
    return true;
}

(:test)
function testEncolarReemplazaMismaClaveLogica(logger as Toybox.Test.Logger) as Boolean {
    LogQueue._reiniciarParaPruebas();
    var primero = {
        "slot" => "dia1:v1:sentadilla", "slug" => "sentadilla", "fecha" => "2026-09-03",
        "pesoKg" => 40, "series" => 3, "reps" => "10", "hecho" => false,
        "editadoEn" => "2026-09-03T10:00:00Z"
    };
    var segundo = {
        "slot" => "dia1:v1:sentadilla", "slug" => "sentadilla", "fecha" => "2026-09-03",
        "pesoKg" => 42, "series" => 4, "reps" => "10", "hecho" => true,
        "editadoEn" => "2026-09-03T10:05:00Z"
    };
    LogQueue.encolar(primero);
    LogQueue.encolar(segundo);
    var cola = LogQueue.pendientes();
    Toybox.Test.assertEqual(cola.size(), 1);
    Toybox.Test.assertEqual(cola[0].get("pesoKg"), 42);
    return true;
}

(:test)
function testQuitarPendienteLoSaca(logger as Toybox.Test.Logger) as Boolean {
    LogQueue._reiniciarParaPruebas();
    var entrada = {
        "slot" => "dia3:base:sentadilla", "slug" => "sentadilla", "fecha" => "2026-09-03",
        "pesoKg" => 40, "series" => 4, "reps" => "10", "hecho" => true,
        "editadoEn" => "2026-09-03T10:00:00Z"
    };
    var id = LogQueue.encolar(entrada);
    LogQueue.quitarPendiente(id);
    Toybox.Test.assertEqual(LogQueue.pendientes().size(), 0);
    return true;
}
