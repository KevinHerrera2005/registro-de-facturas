// Al elegir la imagen de la factura la manda a escanear (OCR) y deja todo el texto
// en el portapapeles del sistema, listo para pegar con Ctrl+V donde haga falta.
(function () {
    var OCR_URL = document.currentScript.dataset.ocrUrl;

    // La Clipboard API necesita contexto seguro (localhost o HTTPS) y a veces pierde el permiso
    // porque el OCR tarda; por eso el respaldo con textarea + execCommand.
    function copiarConTextarea(texto) {
        var area = document.createElement('textarea');
        area.value = texto;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.top = '0';
        area.style.left = '0';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        area.setSelectionRange(0, area.value.length);
        var copiado = false;
        try {
            copiado = document.execCommand('copy');
        } catch (error) {
            copiado = false;
        }
        document.body.removeChild(area);
        return copiado ? Promise.resolve() : Promise.reject(new Error('No se pudo copiar.'));
    }

    function copiarAlPortapapeles(texto) {
        if (navigator.clipboard && window.isSecureContext) {
            return navigator.clipboard.writeText(texto).catch(function () {
                return copiarConTextarea(texto);
            });
        }
        return copiarConTextarea(texto);
    }

    // Busca "ID FISCAL:..." o "FACTURA:..." en el texto escaneado y devuelve lo que sigue.
    // Si no encuentra ninguno de los dos, devuelve '' (no se toca el campo).
    function extraerNumeroFactura(texto) {
        var match = texto.match(/\bID\s*FISCAL\b\s*:?\s*(\S+)/i) || texto.match(/\bFACTURA\b\s*:?\s*(\S+)/i);
        return match ? match[1].trim() : '';
    }

    function pad(numero) {
        return numero < 10 ? '0' + numero : String(numero);
    }

    // Busca "FECHA:dd/mm/yyyy hh:mmAM" y devuelve la fecha y la hora por separado, para los
    // inputs type="date" y type="time" (el navegador ya muestra la fecha en mm/dd/yyyy solo).
    // La fecha (dd/mm/yyyy) es lo único obligatorio: si no se logra identificar la hora, se
    // devuelve vacía y ese campo se deja tal cual está, sin bloquear que se ponga la fecha.
    function extraerFecha(texto) {
        var match = texto.match(/\bFECHA\b\s*:?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})\s*([AaPp][Mm])?)?/);
        if (!match) return { fecha: '', hora: '' };
        var dia = parseInt(match[1], 10);
        var mes = parseInt(match[2], 10);
        var anio = parseInt(match[3], 10);
        if (dia < 1 || dia > 31 || mes < 1 || mes > 12) return { fecha: '', hora: '' };
        var fechaTexto = anio + '-' + pad(mes) + '-' + pad(dia);

        if (match[4] === undefined) {
            return { fecha: fechaTexto, hora: '' };
        }
        var hora = parseInt(match[4], 10);
        var minuto = parseInt(match[5], 10);
        var ampm = match[6] ? match[6].toUpperCase() : null;
        if (ampm === 'PM' && hora !== 12) hora += 12;
        if (ampm === 'AM' && hora === 12) hora = 0;
        if (hora > 23 || minuto > 59) return { fecha: fechaTexto, hora: '' };
        return { fecha: fechaTexto, hora: pad(hora) + ':' + pad(minuto) };
    }

    function completarCampo(id, valor) {
        if (!valor) return;
        var campo = document.getElementById(id);
        if (!campo) return;
        campo.value = valor;
        campo.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function autocompletarCampos(texto) {
        completarCampo('numero_de_factura', extraerNumeroFactura(texto));
        var fechaExtraida = extraerFecha(texto);
        completarCampo('fecha', fechaExtraida.fecha);
        completarCampo('hora', fechaExtraida.hora);
    }

    window.addEventListener('load', function () {
        var input = document.getElementById('imagen');
        var estado = document.getElementById('estado-ocr');
        if (!input || !OCR_URL) return;

        function mostrarEstado(mensaje) {
            if (estado) {
                estado.textContent = mensaje;
                estado.style.display = mensaje ? 'block' : 'none';
            }
        }

        input.addEventListener('change', function () {
            var archivo = input.files && input.files[0];
            if (!archivo) return;

            mostrarEstado('Escaneando la imagen, espera un momento...');
            var formData = new FormData();
            formData.append('imagen', archivo);

            fetch(OCR_URL, { method: 'POST', body: formData })
                .then(function (respuesta) {
                    return respuesta.json().then(function (data) {
                        return { ok: respuesta.ok, data: data };
                    });
                })
                .then(function (resultado) {
                    mostrarEstado('');
                    if (!resultado.ok) {
                        mostrarAviso('No se pudo escanear la imagen.', {
                            detalle: resultado.data.error || ''
                        });
                        return;
                    }
                    var texto = resultado.data.texto || '';
                    if (!texto.trim()) {
                        mostrarAviso('No se encontró texto en la imagen.', {
                            detalle: 'Puedes escribir los datos a mano.'
                        });
                        return;
                    }
                    autocompletarCampos(texto);
                    return copiarAlPortapapeles(texto)
                        .then(function () {
                            mostrarAviso('Texto copiado', {
                                detalle: 'Ya puedes pegarlo con Ctrl+V (' + texto.length + ' caracteres).'
                            });
                        })
                        .catch(function () {
                            // El navegador bloquea copiar cuando la ventana perdió el foco (pasa si te
                            // cambias de ventana mientras escanea). El botón devuelve ese permiso.
                            mostrarAviso('El texto ya está listo', {
                                detalle: 'Presiona Copiar para pasarlo al portapapeles (' + texto.length + ' caracteres).',
                                textoBoton: 'Copiar',
                                onOk: function () {
                                    copiarAlPortapapeles(texto)
                                        .then(function () {
                                            mostrarAviso('Texto copiado', {
                                                detalle: 'Ya puedes pegarlo con Ctrl+V.'
                                            });
                                        })
                                        .catch(function () {
                                            mostrarAviso('No se pudo copiar el texto.', {
                                                detalle: 'Revisa los permisos del portapapeles del navegador.'
                                            });
                                        });
                                }
                            });
                        });
                })
                .catch(function () {
                    mostrarEstado('');
                    mostrarAviso('No se pudo escanear la imagen.', {
                        detalle: 'Revisa que el servidor esté funcionando.'
                    });
                });
        });
    });
})();
