// HttpClient.mc
//
// Envoltorio delgado sobre Communications.makeWebRequest: siempre manda y
// espera JSON. Content-Type va fijo (Communications.makeWebRequest solo
// codifica `body` como JSON si ese header está presente); `headers` son
// cabeceras EXTRA (Authorization, apikey) que cada llamador agrega.
module HttpClient {

    function postJson(url, headers, body, callback) {
        var todasCabeceras = { "Content-Type" => "application/json" };
        var claves = headers.keys();
        var i = 0;
        while (i < claves.size()) {
            todasCabeceras.put(claves[i], headers.get(claves[i]));
            i++;
        }
        var opciones = {
            :method => Toybox.Communications.HTTP_REQUEST_METHOD_POST,
            :headers => todasCabeceras,
            :responseType => Toybox.Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
        };
        Toybox.Communications.makeWebRequest(url, body, opciones, callback);
    }

    function getJson(url, headers, callback) {
        var opciones = {
            :method => Toybox.Communications.HTTP_REQUEST_METHOD_GET,
            :headers => headers,
            :responseType => Toybox.Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
        };
        Toybox.Communications.makeWebRequest(url, {}, opciones, callback);
    }
}
