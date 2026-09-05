// connect-iq/venu2/source/RestTimer.mc
//
// Port sin regex (Monkey C no la tiene) de parseRestSeconds (js/registro.js).
// Mismo comportamiento: último grupo de dígitos de la etiqueta, x60 si
// aparece "min", null si aparece "sin descanso" o no hay dígitos.
module RestTimer {

    function parseRestSeconds(label) {
        if (label == null || label.equals("")) {
            return null;
        }
        var s = label.toLower();
        if (s.find("sin descanso") != null) {
            return null;
        }

        var chars = s.toCharArray();
        var lastNumber = null;
        var actual = "";
        var i = 0;
        while (i < chars.size()) {
            var c = chars[i];
            if (c >= '0' && c <= '9') {
                actual = actual + c.toString();
            } else if (!actual.equals("")) {
                lastNumber = actual;
                actual = "";
            }
            i++;
        }
        if (!actual.equals("")) {
            lastNumber = actual;
        }
        if (lastNumber == null) {
            return null;
        }

        var val = lastNumber.toNumber();
        if (s.find("min") != null) {
            val = val * 60;
        }
        return val > 0 ? val : null;
    }

    function formatMMSS(totalSeconds) {
        var m = totalSeconds / 60;
        var sec = totalSeconds % 60;
        var secStr = sec < 10 ? "0" + sec.toString() : sec.toString();
        return m.toString() + ":" + secStr;
    }
}
