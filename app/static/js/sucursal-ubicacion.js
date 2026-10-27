// Botón "Ver ubicación" bajo un select (Sucursal, Proyecto): al abrirlo, muestra la ubicación
// registrada para la opción elegida, o "Sin ubicación" si no tiene ninguna guardada.
(function () {
    function crearVerUbicacion(selectId, botonId, textoId) {
        const select = document.getElementById(selectId);
        const boton = document.getElementById(botonId);
        const texto = document.getElementById(textoId);
        if (!select || !boton || !texto) return;

        function ubicacionActual() {
            const opcion = select.options[select.selectedIndex];
            const valor = opcion ? (opcion.dataset.ubicacion || '').trim() : '';
            return valor || 'Sin ubicación';
        }

        function actualizarSiVisible() {
            if (!texto.hidden) texto.textContent = ubicacionActual();
        }

        boton.addEventListener('click', function () {
            const abrir = texto.hidden;
            texto.hidden = !abrir;
            boton.classList.toggle('btn-ver-ubicacion--abierto', abrir);
            if (abrir) texto.textContent = ubicacionActual();
        });

        select.addEventListener('change', actualizarSiVisible);
    }

    window.addEventListener('load', function () {
        crearVerUbicacion('id_sucursal', 'ver-ubicacion-boton', 'ver-ubicacion-texto');
        crearVerUbicacion('id_proyecto', 'ver-ubicacion-proyecto-boton', 'ver-ubicacion-proyecto-texto');
    });
})();
