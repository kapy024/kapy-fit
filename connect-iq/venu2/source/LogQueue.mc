//
// Puerto simplificado de la cola de pendientes de almacen.js: un solo tipo
// de operación (registro de una serie), así que sin el envoltorio
// {tipo, entidad, datos} que sí necesita la web. Reemplaza, no acumula, un
// pendiente con la misma clave lógica (slot+fecha) — igual que
// claveLogicaPendiente() en almacen.js.
module LogQueue {
    const STORAGE_KEY = "log_queue";
    const COUNTER_KEY = "log_queue_counter";

    function claveLogica(entrada) {
        return entrada.get("slot") + "|" + entrada.get("fecha");
    }

    function siguienteId() {
        var n = Toybox.Application.Storage.getValue(COUNTER_KEY);
        if (n == null) {
            n = 0;
        }
        n = n + 1;
        Toybox.Application.Storage.setValue(COUNTER_KEY, n);
        return n.toString();
    }

    function encolar(entrada) {
        var cola = pendientes();
        var clave = claveLogica(entrada);
        var sinDuplicado = [];
        var i = 0;
        while (i < cola.size()) {
            if (!claveLogica(cola[i]).equals(clave)) {
                sinDuplicado.add(cola[i]);
            }
            i++;
        }
        entrada.put("id", siguienteId());
        sinDuplicado.add(entrada);
        Toybox.Application.Storage.setValue(STORAGE_KEY, sinDuplicado);
        return entrada.get("id");
    }

    function pendientes() {
        var cola = Toybox.Application.Storage.getValue(STORAGE_KEY);
        if (cola == null) {
            return [];
        }
        return cola;
    }

    function quitarPendiente(id) {
        var cola = pendientes();
        var restante = [];
        var i = 0;
        while (i < cola.size()) {
            if (!cola[i].get("id").equals(id)) {
                restante.add(cola[i]);
            }
            i++;
        }
        Toybox.Application.Storage.setValue(STORAGE_KEY, restante);
    }

    // Solo para LogQueueTest.mc — misma idea que
    // almacen.js's _reiniciarEstadoParaPruebas, ver sync.test.js.
    function _reiniciarParaPruebas() {
        Toybox.Application.Storage.deleteValue(STORAGE_KEY);
        Toybox.Application.Storage.deleteValue(COUNTER_KEY);
    }
}
