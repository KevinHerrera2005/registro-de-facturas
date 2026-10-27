// Cada vez que se elige un archivo en el último <input type="file">, agrega otro debajo,
// para poder adjuntar 2 o más fotos de la misma factura (puede venir en varias páginas).
// También maneja el botón "×" de las imágenes ya guardadas, para poder quitarlas al editar.
(function () {
    // validacion-factura.js escucha este evento para saber cuándo recalcular si hay que
    // deshabilitar "Guardar cambios" (cambia la cuenta de imágenes nuevas o de las ya guardadas).
    function avisarCambio() {
        document.dispatchEvent(new Event('factura-imagenes:cambio'));
    }

    window.addEventListener('load', function () {
        const contenedor = document.getElementById('imagenes-nuevas');
        if (!contenedor) return;

        function crearInputImagen() {
            const input = document.createElement('input');
            input.type = 'file';
            input.name = 'imagenes';
            input.accept = 'image/*';
            input.className = 'form-control factura-imagenes-nuevas__input';
            input.addEventListener('change', manejarCambio);
            return input;
        }

        function manejarCambio(evento) {
            const input = evento.target;
            if (!input.files || !input.files.length) return;
            if (input === contenedor.lastElementChild) {
                contenedor.appendChild(crearInputImagen());
            }
            avisarCambio();
        }

        const primerInput = document.getElementById('imagen');
        if (primerInput) primerInput.addEventListener('change', manejarCambio);

        // Imágenes ya guardadas (solo aparecen al editar): cada "×" marca esa imagen para
        // borrarla del lado del servidor (input oculto "eliminar_imagenes") y la quita de la vista.
        const listaActuales = document.querySelector('.factura-imagenes-actuales');
        const contenedorEliminadas = document.getElementById('imagenes-eliminadas');
        if (listaActuales && contenedorEliminadas) {
            listaActuales.addEventListener('click', function (evento) {
                const boton = evento.target.closest('.factura-imagenes-actuales__quitar');
                if (!boton) return;
                const item = boton.closest('.factura-imagenes-actuales__item');
                if (!item) return;

                const oculto = document.createElement('input');
                oculto.type = 'hidden';
                oculto.name = 'eliminar_imagenes';
                oculto.value = item.dataset.imagenId;
                contenedorEliminadas.appendChild(oculto);

                item.remove();
                if (!listaActuales.children.length) listaActuales.style.display = 'none';
                avisarCambio();
            });
        }
    });
})();
