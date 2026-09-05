//
// ISO8601 en UTC ("2026-09-03T14:05:09Z") — lo que Postgres parsea directo
// como timestamptz. Monkey C no trae un formateador de fechas tipo
// strftime; Number.format("%0Nd") hace el padding de cada campo, y
// Lang.format arma el string final con placeholders $1$..$6$.
module TimeUtil {

    function isoUtc(moment) {
        var info = Toybox.Time.Gregorian.utcInfo(moment, Toybox.Time.FORMAT_SHORT);
        return Toybox.Lang.format(
            "$1$-$2$-$3$T$4$:$5$:$6$Z",
            [
                info.year.format("%04d"),
                info.month.format("%02d"),
                info.day.format("%02d"),
                info.hour.format("%02d"),
                info.min.format("%02d"),
                info.sec.format("%02d")
            ]
        );
    }

    function nowIsoUtc() {
        return isoUtc(Toybox.Time.now());
    }

    // Fecha LOCAL "AAAA-MM-DD" — misma semántica que hoyISO() en
    // almacen.js: el día del entrenamiento es el del reloj del usuario,
    // nunca UTC (a las 23:50 locales no se quiere que cuente para mañana).
    function hoyIso() {
        var info = Toybox.Time.Gregorian.info(Toybox.Time.now(), Toybox.Time.FORMAT_SHORT);
        return Toybox.Lang.format(
            "$1$-$2$-$3$",
            [info.year.format("%04d"), info.month.format("%02d"), info.day.format("%02d")]
        );
    }
}
