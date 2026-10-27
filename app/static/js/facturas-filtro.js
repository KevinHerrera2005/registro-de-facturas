(function () {
    const scriptEl = document.currentScript;

    function tieneSelect2() { return window.jQuery && jQuery.fn.select2; }

    // Crea un grupo de selects encadenados (elige uno -> aparece el siguiente) dentro de `container`.
    // `nombreCampo` es el atributo name que se le pone a cada <select> (null si no debe enviarse con ningún form).
    // `alCambiar`, si se pasa, se llama cada vez que cambia la selección (agregar, quitar o cambiar un producto).
    function crearSelectorProductos(container, productos, seleccionadosIniciales, nombreCampo, alCambiar) {
        function filas() { return Array.from(container.children); }
        function selectDeFila(fila) { return fila.querySelector('select'); }

        function idsUsados(exceptoSelect) {
            return filas()
                .map(selectDeFila)
                .filter(function (select) { return select && select !== exceptoSelect; })
                .map(function (select) { return select.value; })
                .filter(function (value) { return value; });
        }

        function hayProductosDisponibles(exceptoSelect) {
            const usados = idsUsados(exceptoSelect);
            return productos.some(function (producto) { return usados.indexOf(String(producto.id)) === -1; });
        }

        // El select2 nativo dispara sus cambios vía jQuery, no vía el evento 'change' del DOM;
        // este puente reenvía ese cambio como evento nativo para que addEventListener('change', ...) lo reciba.
        function activarSelect2(select) {
            if (!tieneSelect2()) return;
            jQuery(select).select2({ width: '100%' });
            jQuery(select).on('change', function () {
                if (this.__reenviandoChangeNativo) return;
                this.__reenviandoChangeNativo = true;
                this.dispatchEvent(new Event('change', { bubbles: true }));
                this.__reenviandoChangeNativo = false;
            });
        }

        function llenarOpciones(select, valorActual) {
            const usados = idsUsados(select);
            select.innerHTML = '';
            const vacio = document.createElement('option');
            vacio.value = '';
            vacio.textContent = '-- selecciona una opción --';
            select.appendChild(vacio);
            productos.forEach(function (producto) {
                const idStr = String(producto.id);
                if (usados.indexOf(idStr) !== -1 && idStr !== valorActual) return;
                const option = document.createElement('option');
                option.value = idStr;
                option.textContent = producto.nombre;
                if (idStr === valorActual) option.selected = true;
                select.appendChild(option);
            });
        }

        function refrescarOpciones() {
            filas().forEach(function (fila) {
                const select = selectDeFila(fila);
                const valorActual = select.value;
                if (tieneSelect2() && jQuery(select).data('select2')) jQuery(select).select2('destroy');
                llenarOpciones(select, valorActual);
                activarSelect2(select);
            });
        }

        function quitarFilasSiguientes(fila) {
            let siguiente = fila.nextElementSibling;
            while (siguiente) {
                const actual = siguiente;
                siguiente = siguiente.nextElementSibling;
                actual.remove();
            }
        }

        function onChange(select) {
            quitarFilasSiguientes(select.closest('.filtro-productos__item'));
            if (select.value && hayProductosDisponibles(null)) {
                container.appendChild(crearFila(''));
            }
            refrescarOpciones();
            if (alCambiar) alCambiar();
        }

        function crearFila(valorSeleccionado) {
            const fila = document.createElement('div');
            fila.className = 'filtro-productos__item';

            const select = document.createElement('select');
            select.className = 'form-control';
            if (nombreCampo) select.name = nombreCampo;
            fila.appendChild(select);

            llenarOpciones(select, valorSeleccionado);
            select.addEventListener('change', function () { onChange(select); });
            activarSelect2(select);

            return fila;
        }

        function inicializar(seleccionados) {
            container.innerHTML = '';
            if (seleccionados.length) {
                seleccionados.forEach(function (id) { container.appendChild(crearFila(id)); });
                if (hayProductosDisponibles(null)) container.appendChild(crearFila(''));
            } else {
                container.appendChild(crearFila(''));
            }
            refrescarOpciones();
        }

        function limpiar() {
            filas().forEach(function (fila) {
                const select = selectDeFila(fila);
                if (tieneSelect2() && jQuery(select).data('select2')) jQuery(select).select2('destroy');
            });
            inicializar([]);
        }

        function obtenerIdsSeleccionados() {
            return idsUsados(null);
        }

        inicializar(seleccionadosIniciales);

        return { limpiar: limpiar, obtenerIdsSeleccionados: obtenerIdsSeleccionados };
    }

    // Subraya en la columna "Productos" del listado los productos que coincidan con `idsSeleccionados`.
    function resaltarProductos(idsSeleccionados) {
        const ids = (idsSeleccionados || []).map(String);
        document.querySelectorAll('.factura-productos__item').forEach(function (span) {
            const coincide = ids.indexOf(span.dataset.productoId) !== -1;
            span.classList.toggle('factura-productos__item--resaltado', coincide);
        });
    }

    function normalizarTexto(texto) {
        return (texto || '').toLowerCase().replace(/\s+/g, '');
    }

    // Busca dentro de `descripcion` el tramo que más se parece a `tipo`, sin importar en qué
    // posición esté (al inicio, en medio o al final). Compara letra por letra ignorando espacios
    // y mayúsculas/minúsculas, probando cada punto de arranque posible y quedándose con el tramo
    // más largo que coincide desde ahí. Así "cisterna" se subraya igual en "para cisterna" que en
    // "cisterna para válvula", y si el usuario escribe mal a medias ("drenage" contra "drenaje")
    // solo se marca hasta donde deja de ser correcto.
    // Devuelve {inicio, fin} (índices sobre el texto original) o null si no hay ninguna coincidencia.
    function mejorCoincidencia(descripcion, tipo) {
        const buscado = normalizarTexto(tipo);
        if (!buscado) return null;

        // Letras de la descripción sin espacios, cada una con su índice real en el texto original,
        // para poder recortar el tramo a subrayar sobre el texto tal cual se muestra.
        const letras = [];
        for (let i = 0; i < descripcion.length; i++) {
            if (/\s/.test(descripcion[i])) continue;
            letras.push({ caracter: descripcion[i].toLowerCase(), indice: i });
        }

        let mejorLargo = 0;
        let mejorInicio = -1;
        for (let inicio = 0; inicio < letras.length; inicio++) {
            if (letras.length - inicio <= mejorLargo) break; // ya no puede superar lo mejor encontrado
            let largo = 0;
            while (largo < buscado.length && inicio + largo < letras.length && letras[inicio + largo].caracter === buscado[largo]) {
                largo++;
            }
            if (largo > mejorLargo) {
                mejorLargo = largo;
                mejorInicio = inicio;
            }
        }

        if (!mejorLargo) return null;
        return {
            inicio: letras[mejorInicio].indice,
            fin: letras[mejorInicio + mejorLargo - 1].indice + 1,
        };
    }

    // Subraya en morado la parte correcta de la descripción de cada producto del listado.
    // Si hay productos elegidos en "Filtrar por", solo se miran las descripciones de esos.
    function resaltarDescripciones(tipo, idsSeleccionados) {
        const ids = (idsSeleccionados || []).map(String);
        document.querySelectorAll('.factura-productos__descripcion-texto').forEach(function (span) {
            // La descripción original se guarda la primera vez, porque después este span se reescribe.
            if (span.dataset.descripcion === undefined) span.dataset.descripcion = span.textContent;
            const descripcion = span.dataset.descripcion;
            const item = span.closest('.factura-productos__item');
            const aplica = !ids.length || ids.indexOf(item.dataset.productoId) !== -1;
            const coincidencia = aplica ? mejorCoincidencia(descripcion, tipo) : null;

            span.textContent = '';
            if (coincidencia) {
                span.appendChild(document.createTextNode(descripcion.slice(0, coincidencia.inicio)));
                const resaltado = document.createElement('span');
                resaltado.className = 'factura-productos__coincidencia';
                resaltado.textContent = descripcion.slice(coincidencia.inicio, coincidencia.fin);
                span.appendChild(resaltado);
                span.appendChild(document.createTextNode(descripcion.slice(coincidencia.fin)));
            } else {
                span.appendChild(document.createTextNode(descripcion));
            }
        });
    }

    // Mete/actualiza `calc_productos` en la URL visible y en los enlaces de paginación, para que
    // la selección de "Calcular total" sobreviva al cambiar de página (la paginación son <a href>,
    // no el <form>, así que no arrastran solos lo que solo vive en el select de ese apartado).
    function sincronizarCalcEnUrl(ids) {
        const urlActual = new URL(window.location.href);
        urlActual.searchParams.delete('calc_productos');
        ids.forEach(function (id) { urlActual.searchParams.append('calc_productos', id); });
        history.replaceState(null, '', urlActual.pathname + urlActual.search);

        document.querySelectorAll('.pagination a.page-link[href]').forEach(function (enlace) {
            const href = enlace.getAttribute('href');
            if (!href || href.indexOf('javascript:') === 0) return;
            const url = new URL(href, window.location.href);
            url.searchParams.delete('calc_productos');
            ids.forEach(function (id) { url.searchParams.append('calc_productos', id); });
            enlace.setAttribute('href', url.pathname + url.search);
        });
    }

    window.addEventListener('load', function () {
        const parametrosUrl = new URLSearchParams(window.location.search);
        const productosFiltrados = parametrosUrl.getAll('productos');
        resaltarProductos(productosFiltrados);
        resaltarDescripciones(parametrosUrl.get('tipo') || '', productosFiltrados);

        let filtroWidget = null;
        const contenedorFiltro = document.getElementById('filtro-productos');
        const datosFiltroEl = document.getElementById('datos-filtro-productos');
        if (contenedorFiltro && datosFiltroEl) {
            const datos = JSON.parse(datosFiltroEl.textContent || '{}');
            filtroWidget = crearSelectorProductos(
                contenedorFiltro,
                datos.productos || [],
                (datos.seleccionados || []).map(String),
                'productos'
            );
        }

        const calcularUrl = scriptEl.dataset.calcularUrl;
        const calcularBtn = document.getElementById('calcular-total-boton');
        const calcularLimpiarBtn = document.getElementById('calcular-total-limpiar');
        const totalInput = document.getElementById('calcular-total-input');
        const desgloseContenedor = document.getElementById('calcular-desglose');

        // Botón con la flechita "›" que se rota cuando el bloque que sigue está abierto.
        function crearToggle(etiqueta) {
            const boton = document.createElement('button');
            boton.type = 'button';
            boton.className = 'calcular-desglose__toggle';

            const flecha = document.createElement('span');
            flecha.className = 'calcular-desglose__flecha';
            flecha.textContent = '›';
            boton.appendChild(flecha);

            const texto = document.createElement('span');
            texto.textContent = etiqueta;
            boton.appendChild(texto);

            return boton;
        }

        function crearDetalle(cantidad, subtotal, moneda) {
            const detalle = document.createElement('div');
            detalle.className = 'calcular-desglose__detalle';
            detalle.hidden = true;

            const filaCantidad = document.createElement('div');
            filaCantidad.textContent = 'Cantidad: ' + Number(cantidad).toFixed(2);
            detalle.appendChild(filaCantidad);

            const filaSubtotal = document.createElement('div');
            filaSubtotal.textContent = 'Subtotal: ' + Number(subtotal).toFixed(2) + (moneda ? ' ' + moneda : '');
            detalle.appendChild(filaSubtotal);

            return detalle;
        }

        function renderizarDesglose(desglose) {
            if (!desgloseContenedor) return;
            desgloseContenedor.innerHTML = '';
            (desglose || []).forEach(function (grupo) {
                const item = document.createElement('div');
                item.className = 'calcular-desglose__item';
                item.appendChild(crearToggle(grupo.producto));

                // El producto padre no lleva descripción, solo los subproductos (medida + unidad).
                const detalle = crearDetalle(grupo.cantidad, grupo.subtotal, grupo.moneda);

                if (grupo.subproductos && grupo.subproductos.length) {
                    const subcontenedor = document.createElement('div');
                    subcontenedor.className = 'calcular-desglose__subproductos';
                    grupo.subproductos.forEach(function (sub) {
                        const subitem = document.createElement('div');
                        subitem.className = 'calcular-desglose__subitem';
                        const etiqueta = grupo.producto + (sub.medida ? ' ' + sub.medida : '') + (sub.unidad ? ' ' + sub.unidad : '') + (sub.descripcion ? ' ' + sub.descripcion : '');
                        subitem.appendChild(crearToggle(etiqueta));
                        subitem.appendChild(crearDetalle(sub.cantidad, sub.subtotal, grupo.moneda));
                        subcontenedor.appendChild(subitem);
                    });
                    detalle.appendChild(subcontenedor);
                }

                item.appendChild(detalle);
                desgloseContenedor.appendChild(item);
            });
        }

        // Un solo listener delegado sirve tanto para los toggles de producto como los de subproducto,
        // porque en ambos niveles el botón y su bloque de detalle son hermanos directos en el DOM.
        if (desgloseContenedor) {
            desgloseContenedor.addEventListener('click', function (evento) {
                const boton = evento.target.closest('.calcular-desglose__toggle');
                if (!boton) return;
                const detalle = boton.nextElementSibling;
                if (!detalle || !detalle.classList.contains('calcular-desglose__detalle')) return;
                detalle.hidden = !detalle.hidden;
                boton.classList.toggle('calcular-desglose__toggle--abierto', !detalle.hidden);
            });
        }

        function ejecutarCalculo(idsCalcular) {
            if (!calcularUrl || !totalInput) return;
            resaltarProductos(idsCalcular);
            sincronizarCalcEnUrl(idsCalcular);

            const params = new URLSearchParams(window.location.search);
            params.delete('calc_productos');
            idsCalcular.forEach(function (id) { params.append('calc_productos', id); });

            totalInput.value = 'Calculando...';
            if (desgloseContenedor) desgloseContenedor.innerHTML = '';
            fetch(calcularUrl + '?' + params.toString())
                .then(function (respuesta) { return respuesta.json(); })
                .then(function (data) {
                    totalInput.value = Number(data.total).toFixed(2);
                    renderizarDesglose(data.desglose);
                })
                .catch(function () { totalInput.value = 'Error al calcular'; });
        }

        let calcularWidget = null;
        const contenedorCalcular = document.getElementById('calcular-productos');
        const datosCalcularEl = document.getElementById('datos-calcular-productos');
        if (contenedorCalcular && datosCalcularEl) {
            const datosCalcular = JSON.parse(datosCalcularEl.textContent || '{}');
            const seleccionadosCalcular = (datosCalcular.seleccionados || []).map(String);
            calcularWidget = crearSelectorProductos(
                contenedorCalcular,
                datosCalcular.productos || [],
                seleccionadosCalcular,
                null,
                function () { sincronizarCalcEnUrl(calcularWidget.obtenerIdsSeleccionados()); }
            );
            // Si la página se cargó con productos ya elegidos en "Calcular total" (venían en la URL,
            // por ejemplo al paginar), se recalcula solo para que el Total y el desglose no queden vacíos.
            if (seleccionadosCalcular.length) {
                ejecutarCalculo(calcularWidget.obtenerIdsSeleccionados());
            }
        }

        const limpiarBtn = document.getElementById('limpiar-productos');
        if (limpiarBtn) {
            limpiarBtn.addEventListener('click', function () {
                if (filtroWidget) filtroWidget.limpiar();
                const fechaDesde = document.querySelector('input[name="fecha_desde"]');
                const fechaHasta = document.querySelector('input[name="fecha_hasta"]');
                if (fechaDesde) fechaDesde.value = '';
                if (fechaHasta) fechaHasta.value = '';
                const tipoInput = document.getElementById('filtro-tipo');
                if (tipoInput) tipoInput.value = '';
                const proyectoSelect = document.getElementById('filtro-proyecto');
                if (proyectoSelect) proyectoSelect.value = '';
                resaltarProductos([]);
                resaltarDescripciones('', []);
            });
        }

        if (calcularBtn && calcularWidget) {
            calcularBtn.addEventListener('click', function () {
                ejecutarCalculo(calcularWidget.obtenerIdsSeleccionados());
            });
        }

        if (calcularLimpiarBtn && calcularWidget && totalInput) {
            calcularLimpiarBtn.addEventListener('click', function () {
                calcularWidget.limpiar();
                totalInput.value = '';
                if (desgloseContenedor) desgloseContenedor.innerHTML = '';
                resaltarProductos([]);
                sincronizarCalcEnUrl([]);
            });
        }

        // Si el usuario usa "Buscar"/"Filtrar" (que sí navega de verdad), la selección de "Calcular
        // total" también se manda como campos ocultos para que no se pierda en esa nueva página.
        const formulario = document.querySelector('.factura-filtros');
        if (formulario && calcularWidget) {
            formulario.addEventListener('submit', function () {
                formulario.querySelectorAll('input[name="calc_productos"]').forEach(function (input) { input.remove(); });
                calcularWidget.obtenerIdsSeleccionados().forEach(function (id) {
                    const input = document.createElement('input');
                    input.type = 'hidden';
                    input.name = 'calc_productos';
                    input.value = id;
                    formulario.appendChild(input);
                });
            });
        }
    });
})();
