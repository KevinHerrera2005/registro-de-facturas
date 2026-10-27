// Modal simple de aviso: un mensaje y un botón OK. Reutilizable desde cualquier pantalla.
// Uso: mostrarAviso('Texto copiado');
//      mostrarAviso('Texto copiado', { detalle: '120 caracteres', textoBoton: 'Entendido', onOk: fn });
(function () {
    window.mostrarAviso = function (mensaje, opciones) {
        opciones = opciones || {};

        var overlay = document.createElement('div');
        overlay.className = 'modal-aviso activo';

        var caja = document.createElement('div');
        caja.className = 'modal-aviso-caja';

        var mensajeEl = document.createElement('p');
        mensajeEl.className = 'modal-aviso-mensaje';
        mensajeEl.textContent = mensaje;
        caja.appendChild(mensajeEl);

        if (opciones.detalle) {
            var detalleEl = document.createElement('p');
            detalleEl.className = 'modal-aviso-detalle';
            detalleEl.textContent = opciones.detalle;
            caja.appendChild(detalleEl);
        }

        var boton = document.createElement('button');
        boton.type = 'button';
        boton.className = 'btn btn-success';
        boton.textContent = opciones.textoBoton || 'OK';
        caja.appendChild(boton);

        overlay.appendChild(caja);
        document.body.appendChild(overlay);
        boton.focus();

        function cerrar() {
            if (overlay.parentNode) document.body.removeChild(overlay);
            document.removeEventListener('keydown', alPresionarTecla);
            if (opciones.onOk) opciones.onOk();
        }

        function alPresionarTecla(event) {
            if (event.key === 'Escape' || event.key === 'Enter') cerrar();
        }

        boton.addEventListener('click', cerrar);
        overlay.addEventListener('click', function (event) {
            if (event.target === overlay) cerrar();
        });
        document.addEventListener('keydown', alPresionarTecla);

        return cerrar;
    };
})();
