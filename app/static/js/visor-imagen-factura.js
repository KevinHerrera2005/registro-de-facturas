(function () {
    var escala = 1;
    var panX = 0;
    var panY = 0;
    var arrastrando = false;
    var movido = false;
    var inicioX = 0;
    var inicioY = 0;
    var panInicioX = 0;
    var panInicioY = 0;
    var overlay = document.getElementById('visor-imagen-factura');
    var img = document.getElementById('visor-imagen-factura-img');

    function limites() {
        return {
            maxX: Math.max(0, (img.offsetWidth * escala - window.innerWidth) / 2),
            maxY: Math.max(0, (img.offsetHeight * escala - window.innerHeight) / 2)
        };
    }

    function limitar(valor, maximo) {
        return Math.min(Math.max(valor, -maximo), maximo);
    }

    function ajustarPan() {
        var lim = limites();
        panX = limitar(panX, lim.maxX);
        panY = limitar(panY, lim.maxY);
    }

    function aplicarTransformacion() {
        img.style.transform = 'translate(' + panX + 'px, ' + panY + 'px) scale(' + escala + ')';
        img.style.cursor = escala === 1 ? 'zoom-in' : (arrastrando ? 'grabbing' : 'grab');
    }

    window.abrirImagenFactura = function (src) {
        escala = 1;
        panX = 0;
        panY = 0;
        img.src = src;
        aplicarTransformacion();
        overlay.classList.add('activo');
    };

    window.cerrarImagenFactura = function (event) {
        if (event && event.target !== overlay && !event.target.classList.contains('visor-imagen-factura-cerrar')) {
            return;
        }
        overlay.classList.remove('activo');
    };

    img.addEventListener('mousedown', function (event) {
        event.preventDefault();
        event.stopPropagation();
        arrastrando = true;
        movido = false;
        inicioX = event.clientX;
        inicioY = event.clientY;
        panInicioX = panX;
        panInicioY = panY;
        img.style.transition = 'none';
    });

    document.addEventListener('mousemove', function (event) {
        if (!arrastrando) {
            return;
        }
        var dx = event.clientX - inicioX;
        var dy = event.clientY - inicioY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
            movido = true;
        }
        if (escala > 1 && movido) {
            panX = panInicioX + dx;
            panY = panInicioY + dy;
            ajustarPan();
            aplicarTransformacion();
        }
    });

    document.addEventListener('mouseup', function () {
        if (!arrastrando) {
            return;
        }
        arrastrando = false;
        img.style.transition = 'transform 0.15s ease-out';
        if (!movido) {
            escala = escala === 1 ? 2.5 : 1;
            panX = 0;
            panY = 0;
            ajustarPan();
        }
        aplicarTransformacion();
    });

    img.addEventListener('wheel', function (event) {
        event.preventDefault();
        escala += event.deltaY < 0 ? 0.25 : -0.25;
        escala = Math.min(Math.max(escala, 1), 5);
        ajustarPan();
        aplicarTransformacion();
    });

    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') {
            overlay.classList.remove('activo');
        }
    });
})();
