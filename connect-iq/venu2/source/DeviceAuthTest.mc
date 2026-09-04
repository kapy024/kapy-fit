import Toybox.Lang;
import Toybox.Test;

(:test)
function testExpiradoConNullSiempreCaduco(logger as Toybox.Test.Logger) as Boolean {
    Toybox.Test.assertEqual(DeviceAuth.expirado(null, 1000), true);
    return true;
}

(:test)
function testExpiradoDentroDelMargenCuentaComoCaduco(logger as Toybox.Test.Logger) as Boolean {
    // exp=2000, margen=60 -> caduca desde ahora=1940. 1945 ya cae adentro.
    Toybox.Test.assertEqual(DeviceAuth.expirado(2000, 1945), true);
    return true;
}

(:test)
function testExpiradoFueraDelMargenSigueVigente(logger as Toybox.Test.Logger) as Boolean {
    Toybox.Test.assertEqual(DeviceAuth.expirado(2000, 1800), false);
    return true;
}

(:test)
function testInterpretarRespuestaExito(logger as Toybox.Test.Logger) as Boolean {
    var resultado = DeviceAuth.interpretarRespuesta(200, { "access_token" => "eyJabc", "expires_in" => 3600 });
    Toybox.Test.assertEqual(resultado.get("ok"), true);
    Toybox.Test.assertEqual(resultado.get("jwt"), "eyJabc");
    Toybox.Test.assertEqual(resultado.get("expiresIn"), 3600);
    return true;
}

(:test)
function testInterpretarRespuestaTokenRevocado(logger as Toybox.Test.Logger) as Boolean {
    // device-token-exchange (Task 2) responde 401 + {"error": "..."} cuando
    // el device_token no existe o está revocado.
    var resultado = DeviceAuth.interpretarRespuesta(401, { "error" => "token inválido o revocado" });
    Toybox.Test.assertEqual(resultado.get("ok"), false);
    return true;
}

(:test)
function testInterpretarRespuestaErrorDeRed(logger as Toybox.Test.Logger) as Boolean {
    // makeWebRequest entrega responseCode negativo (p. ej. -1, -104...) y
    // data==null cuando no hay conexión — no hay body de error que leer.
    var resultado = DeviceAuth.interpretarRespuesta(-104, null);
    Toybox.Test.assertEqual(resultado.get("ok"), false);
    return true;
}
