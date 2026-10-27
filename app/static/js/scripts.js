(function () {
    const VALOR_NUEVO = '__nuevo__';
    const select = document.getElementById('producto');
    if (!select) return;
    const detailFields = document.getElementById('detalle-producto');
    const contenedorProductos = document.getElementById('productos-textarea');
    const buscarProductoInput = document.getElementById('buscar-producto-agregado');
    const ids = document.getElementById('producto-ids');
    const addButton = document.getElementById('agregar-producto');
    const removeButton = document.getElementById('quitar-producto');
    const precioTotalInput = document.getElementById('precio_total');
    const fletesInput = document.getElementById('fletes');
    const fields = {
        cantidad: document.getElementById('cantidad'),
        precio_unitario: document.getElementById('precio_unitario'),
        unidad: document.getElementById('unidad'),
        medida: document.getElementById('medida'),
        descripcion: document.getElementById('descripcion'),
        descuento: document.getElementById('descuento_detalle'),
        subtotal: document.getElementById('subtotal'),
        isv: document.getElementById('isv'),
        total_linea: document.getElementById('total_linea'),
        aplica_isv: document.getElementById('aplica_isv')
    };
    const details = Array.from(ids.querySelectorAll('.detalle-inicial')).map(function (element) {
        return {
            id: element.dataset.id,
            nombre: element.dataset.nombre,
            cantidad: redondear(element.dataset.cantidad),
            precio_unitario: redondear(element.dataset.precioUnitario),
            unidad: element.dataset.unidadId || '',
            unidad_nombre: element.dataset.unidadNombre || '',
            medida: element.dataset.medida || '',
            descripcion: element.dataset.descripcion || '',
            descuento: redondear(element.dataset.descuento),
            subtotal: redondear(element.dataset.subtotal),
            isv: redondear(element.dataset.isv),
            total_linea: redondear(element.dataset.totalLinea),
            aplica_isv: element.dataset.aplicaIsv === '1' ? '1' : '0'
        };
    });
    let indiceSeleccionado = null;
    // Texto de la barra de búsqueda (arriba del textarea de productos agregados): filtra por
    // nombre de producto en tiempo real, sin distinguir mayúsculas/minúsculas. Solo afecta lo que
    // se ve en la lista; los campos ocultos que se mandan al guardar siguen llevando todo.
    let filtroProductoAgregado = '';
    // Si el producto que se está editando ya tenía el ISV 15% aplicado cuando se abrió el panel.
    // Sirve para no volver a sumarle el 15% cada vez que se le da "Editar" sin tocar ese campo,
    // y para restarlo si el usuario lo cambia de "Sí" a "No".
    let aplicaIsvOriginal = false;

    function setSelectValue(el, value) {
        if (window.jQuery && jQuery.fn.select2 && jQuery(el).data('select2')) {
            jQuery(el).select2('val', value);
        } else {
            el.value = value;
        }
    }
    // Redondea a máximo 3 decimales para evitar errores de precisión de punto flotante (ej. 190.89000000000001).
    function redondear(valor) {
        const numero = Number(valor);
        return isNaN(numero) ? 0 : Math.round(numero * 1000) / 1000;
    }
    function formatearNumero(valor) {
        return Number(valor).toFixed(3);
    }
    function escaparHtml(texto) {
        const div = document.createElement('div');
        div.textContent = String(texto === undefined || texto === null ? '' : texto);
        return div.innerHTML;
    }
    function lineaHtml(detail) {
        const unidadTexto = detail.unidad_nombre ? detail.unidad_nombre : (detail.unidad ? detail.unidad : '-');
        return escaparHtml(detail.nombre) +
            ' | Cantidad: ' + formatearNumero(detail.cantidad) +
            ' | Precio unitario: ' + formatearNumero(detail.precio_unitario) +
            ' | Unidad: ' + escaparHtml(unidadTexto) +
            ' | Medida: ' + escaparHtml(detail.medida) +
            ' | Descripción: ' + escaparHtml(detail.descripcion) +
            ' | Descuento: ' + formatearNumero(detail.descuento) +
            ' | <span class="producto-item__subtotal-label">Subtotal</span>: ' + formatearNumero(detail.subtotal) +
            ' | ISV: ' + formatearNumero(detail.isv) +
            ' | ISV 15%: ' + (detail.aplica_isv === '1' ? 'Sí' : 'No') +
            ' | Total línea: ' + formatearNumero(detail.total_linea);
    }
    function render() {
        contenedorProductos.innerHTML = '';
        const filtro = filtroProductoAgregado.trim().toLowerCase();
        details.forEach(function (detail, indice) {
            // `indice` sigue siendo la posición real dentro de `details` aunque el producto no
            // se muestre por el filtro, para que "click para editar/quitar" no se desalinee.
            if (filtro && detail.nombre.toLowerCase().indexOf(filtro) === -1) return;
            const item = document.createElement('div');
            item.className = 'producto-item' + (indice === indiceSeleccionado ? ' producto-item--seleccionado' : '');
            item.dataset.indice = indice;
            item.innerHTML = lineaHtml(detail);
            contenedorProductos.appendChild(item);
        });

        ids.innerHTML = '';
        details.forEach(function (detail) {
            const names = { id: 'producto_ids', cantidad: 'cantidades', precio_unitario: 'precios_unitarios', unidad: 'unidad_ids', medida: 'medidas', descripcion: 'descripciones', descuento: 'descuentos', subtotal: 'subtotales', isv: 'isvs', total_linea: 'totales_linea', aplica_isv: 'aplica_isv_values' };
            Object.keys(names).forEach(function (field) {
                const input = document.createElement('input');
                input.type = 'hidden';
                input.name = names[field];
                input.value = detail[field];
                ids.appendChild(input);
            });
        });
    }
    // Recalcula el Precio total sumando el subtotal de todos los productos agregados al detalle más los fletes.
    function calcularPrecioTotal() {
        if (!precioTotalInput) return;
        const subtotales = details.reduce(function (suma, detail) { return suma + Number(detail.subtotal || 0); }, 0);
        const fletes = Number((fletesInput && fletesInput.value) || 0);
        precioTotalInput.value = redondear(subtotales + fletes);
    }
    function clearFields() {
        Object.keys(fields).forEach(function (field) {
            if (field === 'unidad') { setSelectValue(fields.unidad, ''); }
            else if (field === 'aplica_isv') { fields.aplica_isv.value = '0'; }
            else if (field === 'descripcion') { fields.descripcion.value = ''; }
            else { fields[field].value = 0; }
        });
        aplicaIsvOriginal = false;
    }
    // Abre el panel con los valores del producto ya agregado en el índice `indice`, listo para editarlo.
    function entrarModoEdicion(indice) {
        const detail = details[indice];
        if (!detail) return;
        setSelectValue(select, detail.id);
        detailFields.style.display = 'block';
        fields.cantidad.value = detail.cantidad;
        fields.precio_unitario.value = detail.precio_unitario;
        setSelectValue(fields.unidad, detail.unidad || '');
        fields.medida.value = detail.medida || '';
        fields.descripcion.value = detail.descripcion || '';
        fields.descuento.value = detail.descuento;
        fields.subtotal.value = detail.subtotal;
        fields.isv.value = detail.isv;
        fields.total_linea.value = detail.total_linea;
        fields.aplica_isv.value = detail.aplica_isv === '1' ? '1' : '0';
        aplicaIsvOriginal = detail.aplica_isv === '1';
        addButton.textContent = 'Editar';
    }
    function salirModoEdicion() {
        setSelectValue(select, '');
        detailFields.style.display = 'none';
        clearFields();
        addButton.textContent = 'Agregar';
    }
    contenedorProductos.addEventListener('click', function (evento) {
        const item = evento.target.closest('.producto-item');
        if (!item) return;
        const indice = Number(item.dataset.indice);
        if (indiceSeleccionado === indice) {
            indiceSeleccionado = null;
            salirModoEdicion();
        } else {
            indiceSeleccionado = indice;
            entrarModoEdicion(indice);
        }
        render();
    });
    // Recalcula el subtotal en vivo (cantidad * precio unitario, menos el descuento) mientras el
    // usuario escribe. Siempre se parte de cantidad * precio unitario (no del subtotal ya
    // mostrado), para que el descuento no se vaya acumulando en cada tecla: si se borra o se baja
    // el descuento, el subtotal vuelve a subir solo, en vez de quedarse con lo ya restado antes.
    function calcularSubtotal() {
        const cantidad = Number(fields.cantidad.value || 0);
        const precioUnitario = Number(fields.precio_unitario.value || 0);
        const descuento = Number(fields.descuento.value || 0);
        const bruto = cantidad * precioUnitario;
        fields.subtotal.value = redondear(Math.max(bruto - descuento, 0));
    }
    fields.cantidad.addEventListener('input', calcularSubtotal);
    fields.precio_unitario.addEventListener('input', calcularSubtotal);
    fields.descuento.addEventListener('input', calcularSubtotal);
    if (fletesInput) fletesInput.addEventListener('input', calcularPrecioTotal);
    select.addEventListener('change', function () {
        if (select.value === VALOR_NUEVO) { detailFields.style.display = 'none'; return; }
        detailFields.style.display = select.value ? 'block' : 'none';
        // Si se está editando un producto ya agregado, cambiar a otro producto no debe borrar lo
        // que ya se había llenado (cantidad, precio, medida, etc.) — solo se cambia el producto.
        if (indiceSeleccionado === null) {
            clearFields();
        }
    });

    addButton.addEventListener('click', function () {
        if (!select.value || select.value === VALOR_NUEVO) return;
        const aplicaIsvNuevo = fields.aplica_isv.value === '1';
        if (aplicaIsvNuevo && !aplicaIsvOriginal) {
            // Se acaba de marcar "Sí": aplica el 15% sobre el valor actual.
            const precioUnitario = Number(fields.precio_unitario.value || 0);
            const subtotal = Number((fields.subtotal.value || 0));
            fields.precio_unitario.value = redondear(precioUnitario * 1.15 );
            fields.subtotal.value = redondear(subtotal * 1.15);
            fields.isv.value=subtotal * 0.15;
        } else if (!aplicaIsvNuevo && aplicaIsvOriginal) {
            // Se acaba de marcar "No" sobre un producto que ya tenía el 15% aplicado: se lo quita.
            const precioUnitario = Number(fields.precio_unitario.value || 0);
            const subtotal = Number(fields.subtotal.value || 0);

            fields.precio_unitario.value = redondear(precioUnitario / 1.15);
            fields.isv.value=0;
            fields.subtotal.value = redondear((subtotal / 1.15));
        }
        const detail = {
            id: select.value,
            nombre: select.options[select.selectedIndex].text,
            unidad: fields.unidad.value || '',
            unidad_nombre: fields.unidad.value && fields.unidad.options[fields.unidad.selectedIndex] ? fields.unidad.options[fields.unidad.selectedIndex].text : '',
            aplica_isv: fields.aplica_isv.value === '1' ? '1' : '0',
            medida: fields.medida.value || '',
            descripcion: fields.descripcion.value || '',
        };
        Object.keys(fields).forEach(function (field) {
            if (field === 'unidad' || field === 'aplica_isv' || field === 'medida' || field === 'descripcion') return;
            detail[field] = redondear(fields[field].value);
        });
        if (indiceSeleccionado !== null && details[indiceSeleccionado]) {
            details[indiceSeleccionado] = detail;
        } else {
            details.push(detail);
        }
        indiceSeleccionado = null;
        render();
        calcularPrecioTotal();
        salirModoEdicion();
    });
    removeButton.addEventListener('click', function () {
        if (indiceSeleccionado === null || !details[indiceSeleccionado]) return;
        details.splice(indiceSeleccionado, 1);
        indiceSeleccionado = null;
        render();
        calcularPrecioTotal();
        salirModoEdicion();
    });
    if (buscarProductoInput) {
        buscarProductoInput.addEventListener('input', function () {
            filtroProductoAgregado = buscarProductoInput.value;
            render();
        });
    }
    render();
})();
