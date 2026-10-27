// Deshabilita el botón de guardar mientras falte algún campo obligatorio de la factura.
(function () {
    var VALOR_NUEVO = '__nuevo__';
    var CAMPOS_TEXTO = ['numero_de_factura', 'fecha', 'precio_total'];
    var CAMPOS_SELECT = ['id_sucursal', 'id_metodo_pago', 'id_tipo_factura', 'id_moneda'];
    var estadoNumeroFactura = 'disponible';

    window.addEventListener('load', function () {
        var boton = document.getElementById('guardar-factura');
        var campoNumero = document.getElementById('numero_de_factura');
        var mensajeNumero = document.getElementById('error-numero-de-factura');
        var scriptValidacion = document.querySelector('script[data-validar-numero-url]');
        var contenedorProductos = document.getElementById('producto-ids');
        var contenedorImagenes = document.getElementById('imagenes-nuevas');
        // Solo al editar una factura ya existente se exige que quede al menos una imagen; al
        // crear una factura nueva no es obligatorio adjuntar una imagen todavía.
        var editando = !!contenedorImagenes && contenedorImagenes.dataset.editando === '1';
        if (!boton) return;

        function camposTextoCompletos() {
            return CAMPOS_TEXTO.every(function (id) {
                var el = document.getElementById(id);
                return el && el.value.trim() !== '';
            });
        }

        function camposSelectCompletos() {
            return CAMPOS_SELECT.every(function (id) {
                var el = document.getElementById(id);
                return el && el.value !== '' && el.value !== VALOR_NUEVO;
            });
        }

        function hayProductos() {
            return !!contenedorProductos && contenedorProductos.querySelectorAll('input[name="producto_ids"]').length > 0;
        }

        // Cuenta las imágenes que ya estaban guardadas (y no se marcaron para quitar) más las
        // que se acaban de elegir en los <input type="file">.
        function hayImagenes() {
            if (!editando) return true;
            var restantes = document.querySelectorAll('.factura-imagenes-actuales__item').length;
            var nuevas = Array.prototype.filter.call(
                document.querySelectorAll('#imagenes-nuevas input[type="file"]'),
                function (input) { return input.files && input.files.length > 0; }
            ).length;
            return (restantes + nuevas) > 0;
        }

        function actualizarBoton() {
            var habilitado = estadoNumeroFactura === 'disponible' && camposTextoCompletos() && camposSelectCompletos() && hayProductos() && hayImagenes();
            boton.disabled = !habilitado;
            boton.classList.toggle('btn-deshabilitado', !habilitado);
        }

        function validarNumeroFactura() {
            if (!campoNumero || !scriptValidacion) return;
            var numero = campoNumero.value.trim();
            var idFactura = campoNumero.dataset.facturaId;
            if (!numero) {
                estadoNumeroFactura = 'disponible';
                mensajeNumero.hidden = true;
                campoNumero.removeAttribute('aria-invalid');
                actualizarBoton();
                return;
            }

            estadoNumeroFactura = 'consultando';
            actualizarBoton();
            window.clearTimeout(validarNumeroFactura.temporizador);
            validarNumeroFactura.temporizador = window.setTimeout(function () {
                var parametros = new URLSearchParams({ numero: numero });
                if (idFactura) parametros.set('factura_id', idFactura);
                fetch(scriptValidacion.dataset.validarNumeroUrl + '?' + parametros.toString())
                    .then(function (respuesta) {
                        if (!respuesta.ok) throw new Error('No se pudo validar el número de factura.');
                        return respuesta.json();
                    })
                    .then(function (resultado) {
                        if (campoNumero.value.trim() !== numero) return;
                        estadoNumeroFactura = resultado.disponible ? 'disponible' : 'duplicado';
                        mensajeNumero.textContent = resultado.disponible ? '' : 'esta factura ya esta registrada';
                        mensajeNumero.hidden = resultado.disponible;
                        if (resultado.disponible) campoNumero.removeAttribute('aria-invalid');
                        else campoNumero.setAttribute('aria-invalid', 'true');
                        actualizarBoton();
                    })
                    .catch(function () {
                        if (campoNumero.value.trim() !== numero) return;
                        estadoNumeroFactura = 'disponible';
                        actualizarBoton();
                    });
            }, 300);
        }

        CAMPOS_TEXTO.concat(CAMPOS_SELECT).forEach(function (id) {
            var el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('input', actualizarBoton);
            el.addEventListener('change', actualizarBoton);
        });

        if (campoNumero) {
            campoNumero.addEventListener('input', validarNumeroFactura);
            validarNumeroFactura();
        }

        // El listado de productos lo arma scripts.js reescribiendo #producto-ids en cada Agregar/Quitar;
        // con esto detectamos esos cambios sin acoplarnos a ese archivo.
        if (contenedorProductos && window.MutationObserver) {
            new MutationObserver(actualizarBoton).observe(contenedorProductos, { childList: true });
        }

        // factura-imagenes.js avisa con este evento cuando se agrega/quita una imagen (nueva o ya guardada).
        document.addEventListener('factura-imagenes:cambio', actualizarBoton);

        actualizarBoton();
    });
})();
