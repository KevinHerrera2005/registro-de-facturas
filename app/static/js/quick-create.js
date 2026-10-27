(function () {
    var QUICK_CREATE_BASE_URL = document.currentScript.dataset.baseUrl;
    var VALOR_NUEVO = '__nuevo__';

    var QUICK_CREATE_CONFIG = {
        id_sucursal: { key: 'sucursal', etiqueta: 'sucursal' },
        id_metodo_pago: { key: 'metodo_pago', etiqueta: 'método de pago' },
        id_tipo_factura: { key: 'tipo_factura', etiqueta: 'tipo de factura' },
        id_moneda: { key: 'moneda', etiqueta: 'moneda' },
        producto: { key: 'producto', etiqueta: 'producto' },
        unidad: { key: 'unidad', etiqueta: 'unidad' },
    };

    function setSelectValueGlobal(el, value) {
        if (window.jQuery && jQuery.fn.select2 && jQuery(el).data('select2')) {
            jQuery(el).select2('val', value);
        } else {
            el.value = value;
        }
    }

    // Activa select2 en un select y reenvía sus cambios (jQuery-only) como evento 'change' nativo,
    // para que cualquier addEventListener('change', ...) normal se siga ejecutando.
    function activarSelect2ConPuente(el) {
        if (!(window.jQuery && jQuery.fn.select2)) return;
        jQuery(el).select2({ width: '100%' });
        jQuery(el).on('change', function () {
            if (this.__reenviandoChangeNativo) return;
            this.__reenviandoChangeNativo = true;
            this.dispatchEvent(new Event('change', { bubbles: true }));
            this.__reenviandoChangeNativo = false;
        });
    }

    // Inserta la opción nueva ordenada alfabéticamente (sin tocar el placeholder ni "+ Agregar") y devuelve su valor.
    function insertarOpcionOrdenada(select, data) {
        var nuevoValor = String(data.id);
        var nuevaOpcion = document.createElement('option');
        nuevaOpcion.value = nuevoValor;
        nuevaOpcion.textContent = data.text;
        var opciones = Array.from(select.options).filter(function (o) { return o.value !== '' && o.value !== VALOR_NUEVO; });
        var siguiente = opciones.find(function (o) { return o.textContent.localeCompare(data.text) > 0; });
        if (siguiente) select.insertBefore(nuevaOpcion, siguiente);
        else select.appendChild(nuevaOpcion);
        return nuevoValor;
    }

    // Crea un <input>/<select> para un campo del mini-formulario. Si el campo es un FK que también
    // se puede crear al vuelo (quickCreateKey), le agrega su propia opción "+ Agregar" recursiva.
    function crearCampoQuickCreate(camposEl, field) {
        var wrap = document.createElement('div');
        wrap.className = 'form-group';
        var label = document.createElement('label');
        label.textContent = field.label + (field.required ? ' *' : '');
        wrap.appendChild(label);
        var input;
        if (field.type === 'select') {
            input = document.createElement('select');
            input.className = 'form-control';
            var blank = document.createElement('option');
            blank.value = '';
            blank.textContent = 'Seleccione';
            input.appendChild(blank);
            if (field.quickCreateKey) {
                var opcionNueva = document.createElement('option');
                opcionNueva.value = VALOR_NUEVO;
                opcionNueva.textContent = '+ Agregar ' + field.label;
                input.appendChild(opcionNueva);
            }
            (field.options || []).forEach(function (opt) {
                var o = document.createElement('option');
                o.value = opt.value;
                o.textContent = opt.text;
                input.appendChild(o);
            });
        } else {
            input = document.createElement('input');
            input.className = 'form-control';
            input.type = field.type === 'number' ? 'number' : 'text';
            if (field.step) input.step = field.step;
        }
        input.name = field.name;
        input.dataset.required = field.required ? '1' : '';
        input.dataset.etiqueta = field.label;
        wrap.appendChild(input);
        camposEl.appendChild(wrap);

        if (field.type === 'select') {
            activarSelect2ConPuente(input);
            if (field.quickCreateKey) {
                input.dataset.valorPrevio = '';
                input.addEventListener('change', function () {
                    if (input.value === VALOR_NUEVO) {
                        abrirQuickCreate({
                            key: field.quickCreateKey,
                            etiqueta: field.label,
                            onExito: function (data) {
                                var nuevoValor = insertarOpcionOrdenada(input, data);
                                input.dataset.valorPrevio = nuevoValor;
                                setSelectValueGlobal(input, nuevoValor);
                            },
                            onCancelar: function () {
                                setSelectValueGlobal(input, input.dataset.valorPrevio || '');
                            }
                        });
                    } else {
                        input.dataset.valorPrevio = input.value;
                    }
                });
            }
        }
    }

    // Abre un mini-formulario de creación (para 'key') en un overlay nuevo. Se puede llamar de nuevo
    // desde dentro de sí misma (un FK anidado dentro del mini-formulario también puede abrir el suyo).
    function abrirQuickCreate(opciones) {
        var overlay = document.createElement('div');
        overlay.className = 'modal-quick-create activo';
        overlay.innerHTML =
            '<div class="modal-quick-create-caja">' +
                '<h4></h4>' +
                '<div class="modal-quick-create-error alert alert-danger" style="display: none;"></div>' +
                '<div class="modal-quick-create-campos"></div>' +
                '<div class="modal-quick-create-botones">' +
                    '<button type="button" class="btn btn-default">Cancelar</button>' +
                    '<button type="button" class="btn btn-success">Agregar</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(overlay);

        var titulo = overlay.querySelector('h4');
        var errorEl = overlay.querySelector('.modal-quick-create-error');
        var camposEl = overlay.querySelector('.modal-quick-create-campos');
        var cancelarBtn = overlay.querySelector('.btn-default');
        var guardarBtn = overlay.querySelector('.btn-success');
        titulo.textContent = 'Agregar ' + opciones.etiqueta;

        function cerrar() {
            document.body.removeChild(overlay);
        }

        overlay.addEventListener('click', function (event) {
            if (event.target === overlay) {
                cerrar();
                if (opciones.onCancelar) opciones.onCancelar();
            }
        });
        cancelarBtn.addEventListener('click', function () {
            cerrar();
            if (opciones.onCancelar) opciones.onCancelar();
        });

        camposEl.innerHTML = '<p>Cargando...</p>';
        fetch(QUICK_CREATE_BASE_URL + opciones.key)
            .then(function (r) { return r.json(); })
            .then(function (data) {
                camposEl.innerHTML = '';
                data.fields.forEach(function (field) { crearCampoQuickCreate(camposEl, field); });
            })
            .catch(function () {
                camposEl.innerHTML = '<p>No se pudo cargar el formulario.</p>';
            });

        guardarBtn.addEventListener('click', function () {
            var inputs = camposEl.querySelectorAll('[name]');
            var formData = new FormData();
            var faltantes = [];
            inputs.forEach(function (input) {
                if (input.dataset.required === '1' && !input.value) {
                    faltantes.push(input.dataset.etiqueta || input.name);
                }
                formData.append(input.name, input.value);
            });
            if (faltantes.length) {
                errorEl.textContent = 'Completa: ' + faltantes.join(', ');
                errorEl.style.display = 'block';
                return;
            }
            errorEl.style.display = 'none';
            fetch(QUICK_CREATE_BASE_URL + opciones.key, { method: 'POST', body: formData })
                .then(function (r) { return r.json().then(function (data) { return { ok: r.ok, data: data }; }); })
                .then(function (result) {
                    if (!result.ok) {
                        errorEl.textContent = result.data.error || 'No se pudo guardar.';
                        errorEl.style.display = 'block';
                        return;
                    }
                    cerrar();
                    opciones.onExito(result.data);
                });
        });
    }

    window.addEventListener('load', function () {
        if (!window.jQuery || !jQuery.fn.select2) return;
        activarSelect2ConPuente('#id_sucursal, #id_proyecto, #id_metodo_pago, #id_tipo_factura, #id_moneda, #producto, #unidad');

        Object.keys(QUICK_CREATE_CONFIG).forEach(function (id) {
            var select = document.getElementById(id);
            if (!select) return;
            var config = QUICK_CREATE_CONFIG[id];
            var placeholder = select.querySelector('option[value=""]');
            var opcionNueva = document.createElement('option');
            opcionNueva.value = VALOR_NUEVO;
            opcionNueva.textContent = '+ Agregar ' + config.etiqueta;
            select.insertBefore(opcionNueva, placeholder ? placeholder.nextSibling : select.firstChild);
            select.dataset.valorPrevio = select.value === VALOR_NUEVO ? '' : select.value;
            select.addEventListener('change', function () {
                if (select.value === VALOR_NUEVO) {
                    abrirQuickCreate({
                        key: config.key,
                        etiqueta: config.etiqueta,
                        onExito: function (data) {
                            var nuevoValor = insertarOpcionOrdenada(select, data);
                            select.dataset.valorPrevio = nuevoValor;
                            select.__reenviandoChangeNativo = true;
                            setSelectValueGlobal(select, nuevoValor);
                            select.dispatchEvent(new Event('change', { bubbles: true }));
                            select.__reenviandoChangeNativo = false;
                        },
                        onCancelar: function () {
                            setSelectValueGlobal(select, select.dataset.valorPrevio || '');
                        }
                    });
                } else {
                    select.dataset.valorPrevio = select.value;
                }
            });
        });
    });
})();
