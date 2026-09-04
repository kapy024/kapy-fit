using Toybox.WatchUi;
using Toybox.Graphics;

class LoadingView extends WatchUi.View {
    function initialize() {
        View.initialize();
    }

    function onUpdate(dc) {
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.clear();
        dc.drawText(dc.getWidth() / 2, dc.getHeight() / 2, Graphics.FONT_MEDIUM, "Cargando…", Graphics.TEXT_JUSTIFY_CENTER);
    }
}
