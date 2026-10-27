import io
import re
import tempfile
import zipfile
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from flask import abort, flash, jsonify, redirect, request, send_file, send_from_directory, session, url_for
from flask_admin import BaseView, expose
from sqlalchemy import inspect as sa_inspect, or_
from sqlalchemy.orm import selectinload
from werkzeug.utils import secure_filename

from database import db
from models.DetalleFactura import DetalleFactura
from models.Empresas import Empresas
from models.Facturas import Facturas
from models.FacturaImagen import FacturaImagen
from models.Metodos_de_pagos import Metodos_de_pagos
from models.Monedas import Monedas
from models.Productos import Productos
from models.Proyectos import Proyectos
from models.Sucursales import Sucursales
from models.Tipo_Factura import Tipo_Factura
from models.Unidades import Unidades

from admin_views.empresas_view import EmpresasAdmin
from admin_views.metodos_de_pagos_view import Metodos_de_pagosAdmin
from admin_views.monedas_view import MonedasAdmin
from admin_views.productos_view import ProductosAdmin
from admin_views.sucursales_view import SucursalesAdmin
from admin_views.tipo_factura_view import Tipo_FacturaAdmin
from admin_views.unidades_view import UnidadesAdmin

# Si la URL trae cualquiera de estos, "Filtrar por" / "Calcular total" se guardan en la sesión.
CAMPOS_FILTRO_FACTURAS = ('q', 'productos', 'tipo', 'proyecto', 'fecha_desde', 'fecha_hasta', 'calc_productos')

# Campo que se usa como texto visible de cada modelo (el mismo que muestran los <option> de los selects).
DISPLAY_FIELDS = {
    Sucursales: 'nombre',
    Empresas: 'nombre_empresa',
    Metodos_de_pagos: 'nombre',
    Tipo_Factura: 'nombre',
    Monedas: 'nombre',
    Productos: 'nombre',
    Unidades: 'nombre',
}

# Tablas que se pueden crear al vuelo desde un select del formulario de Facturas.
# Los campos del mini-formulario salen de form_columns/column_labels de cada *Admin, para no duplicarlos aquí.
QUICK_CREATE_REGISTRY = {
    'sucursal': (Sucursales, SucursalesAdmin),
    'metodo_pago': (Metodos_de_pagos, Metodos_de_pagosAdmin),
    'tipo_factura': (Tipo_Factura, Tipo_FacturaAdmin),
    'moneda': (Monedas, MonedasAdmin),
    'producto': (Productos, ProductosAdmin),
    'unidad': (Unidades, UnidadesAdmin),
    'empresa': (Empresas, EmpresasAdmin),
}

# Modelo -> clave del registro, para saber si el modelo de un FK anidado también se puede crear al vuelo.
MODEL_TO_KEY = {model: key for key, (model, _) in QUICK_CREATE_REGISTRY.items()}

# El motor de OCR tarda en cargar sus modelos, así que se crea una sola vez la primera vez
# que se escanea una imagen y después se reutiliza.
_ocr_engine = None


def _texto_medida(medida):
    """Medida lista para mostrar: se guarda como texto y, cuando el producto no lleva medida
    (un spray, por ejemplo), queda como '0' o '0.0', que no debe aparecer en el desglose."""
    texto = (medida or '').strip()
    try:
        if float(texto.replace(',', '.')) == 0:
            return ''
    except ValueError:
        pass
    return texto


def _normalizar_texto_tipo(texto):
    return re.sub(r'\s+', '', (texto or '').lower())


def _longitud_mejor_coincidencia(descripcion, tipo):
    """Puerto a Python de `mejorCoincidencia()` en facturas-filtro.js: cuántas letras seguidas
    coinciden entre `descripcion` y `tipo` probando cada punto de arranque posible dentro de la
    descripción (ignorando espacios y mayúsculas/minúsculas). Se usa para ordenar las facturas
    filtradas por "Tipo" de la más parecida a la menos parecida — mismo criterio con el que se
    subraya en morado, así el orden de la lista coincide con lo que se ve subrayado."""
    buscado = _normalizar_texto_tipo(tipo)
    if not buscado:
        return 0
    letras = [c.lower() for c in (descripcion or '') if not c.isspace()]
    mejor = 0
    total = len(letras)
    for inicio in range(total):
        if total - inicio <= mejor:
            break  # ya no puede superar lo mejor encontrado
        largo = 0
        while largo < len(buscado) and inicio + largo < total and letras[inicio + largo] == buscado[largo]:
            largo += 1
        if largo > mejor:
            mejor = largo
    return mejor


def _get_ocr_engine():
    global _ocr_engine
    if _ocr_engine is None:
        # RapidOCR usa los mismos modelos PP-OCR que PaddleOCR pero en formato ONNX: misma
        # calidad de lectura, pero sin arrastrar el framework de deep learning completo
        # (~700 MB menos instalados) y escaneando alrededor de 10 veces más rápido.
        from rapidocr import LangDet, LangRec, ModelType, OCRVersion, RapidOCR
        _ocr_engine = RapidOCR(
            params={
                # La detección solo ubica los renglones, no depende del idioma; el que sí
                # importa es el reconocedor 'latin', que trae la ñ y las vocales acentuadas.
                'Det.lang_type': LangDet.CH,
                'Det.ocr_version': OCRVersion.PPOCRV5,
                'Det.model_type': ModelType.MOBILE,
                'Rec.lang_type': LangRec.LATIN,
                'Rec.ocr_version': OCRVersion.PPOCRV5,
                'Rec.model_type': ModelType.MOBILE,
                # Clasificador de orientación: no aporta en fotos de facturas derechas.
                'Global.use_cls': False,
            }
        )
    return _ocr_engine


def _extraer_texto(image_path):
    """Devuelve todo el texto que el OCR encuentra en la imagen, una línea por renglón."""
    engine = _get_ocr_engine()
    resultado = engine(image_path)
    lineas = []
    for texto in getattr(resultado, 'txts', None) or []:
        texto = (texto or '').strip()
        if texto:
            lineas.append(texto)
    return '\n'.join(lineas)


def _field_label(admin_cls, column_name):
    return (getattr(admin_cls, 'column_labels', None) or {}).get(column_name, column_name)


def _db_required_columns(model):
    # El modelo (nullable=...) a veces no coincide con la tabla real ya creada en SQLite
    # (p. ej. Sucursales.id_empresa es NOT NULL en la BD aunque el modelo no lo declare).
    # Se consulta el esquema real para no dejar pasar campos que la BD rechazará.
    try:
        columns = sa_inspect(db.engine).get_columns(model.__tablename__)
        return {c['name']: not c['nullable'] for c in columns}
    except Exception:
        return {}


def _is_required(mapper, column_name, db_required):
    if column_name in mapper.relationships:
        local_column = list(mapper.relationships[column_name].local_columns)[0]
        return not local_column.nullable or db_required.get(local_column.name, False)
    column = mapper.columns[column_name]
    return not column.nullable or db_required.get(column.name, False)


def _field_schema(admin_cls, mapper, column_name, db_required):
    label = _field_label(admin_cls, column_name)
    required = _is_required(mapper, column_name, db_required)
    if column_name in mapper.relationships:
        related_model = mapper.relationships[column_name].mapper.class_
        display_field = DISPLAY_FIELDS.get(related_model, 'nombre')
        pk_name = sa_inspect(related_model).primary_key[0].name
        records = related_model.query.order_by(getattr(related_model, display_field)).all()
        return {
            'name': column_name,
            'label': label,
            'type': 'select',
            'required': required,
            'options': [{'value': getattr(r, pk_name), 'text': getattr(r, display_field)} for r in records],
            'quickCreateKey': MODEL_TO_KEY.get(related_model),
        }
    column = mapper.columns[column_name]
    if isinstance(column.type, db.Integer):
        field_type, step = 'number', '1'
    elif isinstance(column.type, db.Float):
        field_type, step = 'number', 'any'
    else:
        field_type, step = 'text', None
    return {'name': column_name, 'label': label, 'type': field_type, 'step': step, 'required': required}


def _set_field_value(instance, mapper, column_name, raw_value):
    raw_value = (raw_value or '').strip()
    if column_name in mapper.relationships:
        related_model = mapper.relationships[column_name].mapper.class_
        setattr(instance, column_name, db.session.get(related_model, int(raw_value)) if raw_value else None)
        return
    column = mapper.columns[column_name]
    if raw_value == '':
        setattr(instance, column_name, None)
    elif isinstance(column.type, db.Integer):
        setattr(instance, column_name, int(raw_value))
    elif isinstance(column.type, db.Float):
        setattr(instance, column_name, float(raw_value))
    else:
        setattr(instance, column_name, raw_value)


class RegistroFacturaView(BaseView):
    allowed_extensions = {'jpg', 'jpeg', 'png', 'gif', 'webp'}
    page_size = 20  # mismo tamaño de página por defecto que usan los demás ModelView de flask-admin

    def _options(self):
        return {
            'sucursales': Sucursales.query.order_by(Sucursales.nombre).all(),
            'metodos_pago': Metodos_de_pagos.query.order_by(Metodos_de_pagos.nombre).all(),
            'tipos_factura': Tipo_Factura.query.order_by(Tipo_Factura.nombre).all(),
            'monedas': Monedas.query.order_by(Monedas.nombre).all(),
            'unidades': Unidades.query.order_by(Unidades.nombre).all(),
            'productos': Productos.query.order_by(Productos.nombre).all(),
            'proyectos': Proyectos.query.order_by(Proyectos.nombre).all(),
        }

    def _save_image(self, uploaded_file):
        if not uploaded_file or not uploaded_file.filename:
            return None
        filename = secure_filename(uploaded_file.filename)
        extension = Path(filename).suffix.lower().lstrip('.')
        if not filename or extension not in self.allowed_extensions:
            raise ValueError('La imagen debe ser JPG, PNG, GIF o WEBP.')
        directory = Path(__file__).resolve().parent.parent / 'static' / 'facturas'
        directory.mkdir(parents=True, exist_ok=True)
        stored_name = f'{uuid4().hex}.{extension}'
        uploaded_file.save(directory / stored_name)
        return stored_name

    def _save_images(self, uploaded_files):
        nombres = []
        for uploaded_file in uploaded_files:
            nombre = self._save_image(uploaded_file)
            if nombre:
                nombres.append(nombre)
        return nombres

    def _delete_image(self, filename):
        if filename:
            image_path = Path(__file__).resolve().parent.parent / 'static' / 'facturas' / filename
            if image_path.is_file():
                image_path.unlink()

    def _read_form(self, factura=None):
        factura = factura or Facturas()
        factura.numero_de_factura = request.form.get('numero_de_factura', '').strip()
        fecha = request.form.get('fecha', '').strip()
        hora = request.form.get('hora', '').strip() or '00:00'
        factura.fecha = datetime.fromisoformat(f'{fecha}T{hora}') if fecha else datetime.now()
        factura.precio_total = float(request.form.get('precio_total') or 0)
        factura.fletes = float(request.form.get('fletes') or 0)
        factura.descuento = int(request.form.get('descuento') or 0)
        factura.total_letras = request.form.get('total_letras', '').strip() or None
        factura.id_sucursal = self._int_or_none('id_sucursal')
        factura.id_metodo_pago = self._int_or_none('id_metodo_pago')
        factura.id_tipo_factura = self._int_or_none('id_tipo_factura')
        factura.id_moneda = self._int_or_none('id_moneda')
        factura.id_proyecto = self._int_or_none('id_proyecto')
        return factura

    @staticmethod
    def _numero_factura_duplicado(numero, factura_id=None):
        consulta = Facturas.query.filter(Facturas.numero_de_factura == numero)
        if factura_id is not None:
            consulta = consulta.filter(Facturas.id_factura != factura_id)
        return consulta.first() is not None

    @staticmethod
    def _int_or_none(field_name):
        value = request.form.get(field_name, '').strip()
        return int(value) if value else None

    @staticmethod
    def _detail_number(field_name, index, default=0):
        values = request.form.getlist(field_name)
        if index >= len(values) or values[index].strip() == '':
            return default
        return float(values[index])

    def _replace_details(self, factura):
        for detail in list(factura.detalles):
            db.session.delete(detail)
        product_ids = request.form.getlist('producto_ids')
        unidad_ids = request.form.getlist('unidad_ids')
        aplica_isv_values = request.form.getlist('aplica_isv_values')
        medidas = request.form.getlist('medidas')
        descripciones = request.form.getlist('descripciones')
        for index, value in enumerate(product_ids):
            if not value.isdigit():
                continue
            product_id = int(value)
            product = db.session.get(Productos, product_id)
            unidad = None
            if index < len(unidad_ids) and unidad_ids[index].isdigit():
                unidad = db.session.get(Unidades, int(unidad_ids[index]))
            medida = medidas[index].strip() if index < len(medidas) else ''
            descripcion = descripciones[index].strip() if index < len(descripciones) else ''
            aplica_isv = index < len(aplica_isv_values) and aplica_isv_values[index] == '1'
            if product:
                factura.detalles.append(DetalleFactura(
                    producto=product,
                    cantidad=self._detail_number('cantidades', index, 0),
                    precio_unitario=self._detail_number('precios_unitarios', index, 0),
                    descuento=self._detail_number('descuentos', index, 0),
                    subtotal=self._detail_number('subtotales', index, 0),
                    isv=self._detail_number('isvs', index, 0),
                    total_linea=self._detail_number('totales_linea', index, 0),
                    unidad=unidad,
                    medida=medida,
                    descripcion=descripcion,
                    aplica_isv=aplica_isv,
                ))

    def _filtrar_facturas(self):
        search = request.args.get('q', '').strip()
        producto_ids = [int(v) for v in request.args.getlist('productos') if v.isdigit()]
        proyecto_id = request.args.get('proyecto', '').strip()
        fecha_desde = request.args.get('fecha_desde', '').strip()
        fecha_hasta = request.args.get('fecha_hasta', '').strip()

        query = Facturas.query
        if search:
            query = query.filter(or_(
                Facturas.numero_de_factura.ilike(f'%{search}%'),
                Facturas.precio_total.cast(db.String).ilike(f'%{search}%'),
                Facturas.sucursal.has(Sucursales.nombre.ilike(f'%{search}%')),
                Facturas.proyectos.has(Proyectos.nombre.ilike(f'%{search}%')),
            ))
        if producto_ids:
            product_match = Facturas.query.join(Facturas.detalles).filter(
                DetalleFactura.id_producto.in_(producto_ids)
            ).with_entities(Facturas.id_factura)
            query = query.filter(Facturas.id_factura.in_(product_match))
        # Filtro extra por proyecto: vacío = todas las facturas, sin importar su proyecto.
        if proyecto_id.isdigit():
            query = query.filter(Facturas.id_proyecto == int(proyecto_id))
        if fecha_desde:
            try:
                query = query.filter(Facturas.fecha >= datetime.fromisoformat(fecha_desde))
            except ValueError:
                pass
        if fecha_hasta:
            try:
                query = query.filter(Facturas.fecha <= datetime.fromisoformat(fecha_hasta))
            except ValueError:
                pass
        return query

    def _paginar_facturas(self, query, tipo, producto_ids, pagina_pedida):
        """Sin "Tipo": pagina con SQL normal (LIMIT/OFFSET), ordenado por fecha.
        Con "Tipo": no se puede paginar en SQL porque el orden depende de una comparación
        letra por letra que SQLite no sabe hacer, así que se traen todas las facturas ya
        filtradas, se calcula qué tan parecida es la descripción de cada una al texto de "Tipo"
        (mismo algoritmo con el que se subraya en morado) y se ordena de la más parecida a la
        menos parecida. `sorted()` es estable, así que entre dos facturas igual de parecidas se
        respeta el orden por fecha que ya traían. Recién ahí se recorta la página pedida."""
        if not tipo:
            total = query.count()
            num_pages = max(1, (total + self.page_size - 1) // self.page_size)
            page = max(0, min(pagina_pedida, num_pages - 1))
            facturas = query.order_by(Facturas.fecha.desc()).limit(self.page_size).offset(page * self.page_size).all()
            return facturas, total, num_pages, page

        def puntaje(factura):
            detalles = factura.detalles
            if producto_ids:
                detalles = [d for d in detalles if d.id_producto in producto_ids]
            return max((_longitud_mejor_coincidencia(d.descripcion, tipo) for d in detalles), default=0)

        todas = query.options(selectinload(Facturas.detalles)).order_by(Facturas.fecha.desc()).all()
        todas.sort(key=puntaje, reverse=True)

        total = len(todas)
        num_pages = max(1, (total + self.page_size - 1) // self.page_size)
        page = max(0, min(pagina_pedida, num_pages - 1))
        facturas = todas[page * self.page_size: page * self.page_size + self.page_size]
        return facturas, total, num_pages, page

    @expose('/')
    def index(self):
        # "Filtrar por" y "Calcular total" se recuerdan en la sesión mientras el programa siga
        # corriendo, para que sigan ahí sin importar a qué otra pantalla se vaya y vuelva (crear
        # factura, editar, u otra sección). Si llega aquí "en limpio" (sin ningún parámetro de
        # filtro en la URL, como al hacer clic en el menú) y hay algo guardado, se restaura.
        if request.args.get('limpiar_filtros'):
            session.pop('facturas_filtro', None)
            return redirect(url_for('facturas.index'))

        if any(campo in request.args for campo in CAMPOS_FILTRO_FACTURAS):
            session['facturas_filtro'] = request.query_string.decode('utf-8')
        elif 'facturas_filtro' in session:
            destino = f"{url_for('facturas.index')}?{session['facturas_filtro']}"
            pagina = request.args.get('page')
            if pagina is not None:
                destino += f"&page={pagina}"
            return redirect(destino)

        # Esta `query` (sin paginar) es la que define "todas las facturas filtradas": tanto el
        # desglose de productos de abajo como /calcular-total la usan completa, sin importar
        # qué página de la tabla esté viendo el usuario.
        query = self._filtrar_facturas()

        tipo = request.args.get('tipo', '').strip()
        producto_ids = [int(v) for v in request.args.getlist('productos') if v.isdigit()]
        facturas, total_facturas, num_pages, page = self._paginar_facturas(
            query, tipo, producto_ids, request.args.get('page', 0, type=int)
        )

        productos = Productos.query.order_by(Productos.nombre).all()

        # Solo para el <select> de "Calcular total": productos que realmente aparecen
        # en las facturas ya filtradas (no todos los productos de la BD).
        factura_ids = query.with_entities(Facturas.id_factura)
        productos_calcular = Productos.query.join(
            DetalleFactura, DetalleFactura.id_producto == Productos.id_producto
        ).filter(DetalleFactura.id_factura.in_(factura_ids)).distinct().order_by(Productos.nombre).all()

        def pager_url(nueva_pagina):
            args = request.args.to_dict(flat=False)
            args['page'] = [str(nueva_pagina)]
            return url_for('facturas.index', **args)

        proyecto_filtro = request.args.get('proyecto', '').strip()

        return self.render(
            'registro_de_factura.html',
            facturas=facturas,
            search=request.args.get('q', '').strip(),
            productos_filtro=[{'id': p.id_producto, 'nombre': p.nombre} for p in productos],
            productos_calcular=[{'id': p.id_producto, 'nombre': p.nombre} for p in productos_calcular],
            productos_seleccionados=producto_ids,
            calc_productos_seleccionados=[int(v) for v in request.args.getlist('calc_productos') if v.isdigit()],
            tipo=tipo,
            proyectos_filtro=Proyectos.query.order_by(Proyectos.nombre).all(),
            proyecto_seleccionado=int(proyecto_filtro) if proyecto_filtro.isdigit() else None,
            fecha_desde=request.args.get('fecha_desde', '').strip(),
            fecha_hasta=request.args.get('fecha_hasta', '').strip(),
            page=page,
            num_pages=num_pages,
            pager_url=pager_url,
        )

    @expose('/calcular-total')
    def calcular_total(self):
        query = self._filtrar_facturas()
        factura_ids = query.with_entities(Facturas.id_factura)
        calc_producto_ids = [int(v) for v in request.args.getlist('calc_productos') if v.isdigit()]

        desglose = []
        if calc_producto_ids:
            total = db.session.query(db.func.coalesce(db.func.sum(DetalleFactura.subtotal), 0.0)).filter(
                DetalleFactura.id_factura.in_(factura_ids),
                DetalleFactura.id_producto.in_(calc_producto_ids),
            ).scalar()

            # Desglose por producto (y por moneda, por si las facturas filtradas no comparten la misma).
            filas_producto = db.session.query(
                Productos.id_producto,
                Productos.nombre,
                Facturas.id_moneda,
                Monedas.nombre,
                db.func.sum(DetalleFactura.cantidad),
                db.func.sum(DetalleFactura.subtotal),
            ).join(Productos, Productos.id_producto == DetalleFactura.id_producto
            ).join(Facturas, Facturas.id_factura == DetalleFactura.id_factura
            ).outerjoin(Monedas, Monedas.id_moneda == Facturas.id_moneda
            ).filter(
                DetalleFactura.id_factura.in_(factura_ids),
                DetalleFactura.id_producto.in_(calc_producto_ids),
            ).group_by(Productos.id_producto, Productos.nombre, Facturas.id_moneda, Monedas.nombre
            ).order_by(Productos.nombre).all()

            grupos = {}
            for id_producto, nombre_producto, id_moneda, nombre_moneda, cantidad, subtotal in filas_producto:
                grupos[(id_producto, id_moneda)] = {
                    'producto': nombre_producto,
                    'moneda': nombre_moneda or '',
                    'cantidad': float(cantidad or 0),
                    'subtotal': float(subtotal or 0),
                    'subproductos': [],
                }

            # "Subproductos": el mismo producto desglosado por medida + unidad + descripción (medida
            # y descripción se comparan en minúsculas y sin espacios extra, para que "2kg"/"2KG" o
            # "Azul"/"azul " caigan en el mismo grupo). Así, por ejemplo, un mismo lápiz con distintos
            # colores en la descripción queda separado en un subproducto por color.
            filas_detalle = db.session.query(
                Productos.id_producto,
                Facturas.id_moneda,
                DetalleFactura.medida,
                Unidades.nombre,
                DetalleFactura.descripcion,
                DetalleFactura.cantidad,
                DetalleFactura.subtotal,
            ).join(Productos, Productos.id_producto == DetalleFactura.id_producto
            ).join(Facturas, Facturas.id_factura == DetalleFactura.id_factura
            ).outerjoin(Unidades, Unidades.id_unidad == DetalleFactura.id_unidad
            ).filter(
                DetalleFactura.id_factura.in_(factura_ids),
                DetalleFactura.id_producto.in_(calc_producto_ids),
            ).all()

            subgrupos = {}
            for id_producto, id_moneda, medida, nombre_unidad, descripcion, cantidad, subtotal in filas_detalle:
                medida_texto = _texto_medida(medida)
                descripcion_texto = (descripcion or '').strip()
                clave = (id_producto, id_moneda, medida_texto.lower(), nombre_unidad or '', descripcion_texto.lower())
                subgrupo = subgrupos.setdefault(clave, {
                    'medida': medida_texto,
                    'unidad': nombre_unidad or '',
                    'descripcion': descripcion_texto,
                    'cantidad': 0.0,
                    'subtotal': 0.0,
                })
                subgrupo['cantidad'] += float(cantidad or 0)
                subgrupo['subtotal'] += float(subtotal or 0)

            for clave, subgrupo in sorted(
                subgrupos.items(), key=lambda item: (item[1]['medida'].lower(), item[1]['descripcion'].lower())
            ):
                id_producto, id_moneda = clave[0], clave[1]
                grupo = grupos.get((id_producto, id_moneda))
                if grupo is None:
                    continue
                grupo['subproductos'].append({
                    'medida': subgrupo['medida'],
                    'unidad': subgrupo['unidad'],
                    'descripcion': subgrupo['descripcion'],
                    'cantidad': subgrupo['cantidad'],
                    'subtotal': subgrupo['subtotal'],
                })

            desglose = list(grupos.values())
        else:
            total = db.session.query(db.func.coalesce(db.func.sum(Facturas.precio_total), 0.0)).filter(
                Facturas.id_factura.in_(factura_ids)
            ).scalar()

        return jsonify({'total': float(total or 0), 'desglose': desglose})

    @expose('/crear', methods=('GET', 'POST'))
    def crear(self):
        if request.method == 'POST':
            try:
                factura = self._read_form()
                if not factura.numero_de_factura:
                    raise ValueError('El número de factura es obligatorio.')
                if self._numero_factura_duplicado(factura.numero_de_factura):
                    raise ValueError('Esta factura ya esta registrada.')
                nombres_imagenes = self._save_images(request.files.getlist('imagenes'))
                for orden, nombre in enumerate(nombres_imagenes):
                    factura.imagenes.append(FacturaImagen(nombre_archivo=nombre, orden=orden))
                self._replace_details(factura)
                db.session.add(factura)
                db.session.commit()
                flash('Factura creada correctamente.', 'success')
                return redirect(url_for('facturas.index'))
            except (ValueError, TypeError) as error:
                db.session.rollback()
                flash(str(error), 'error')
        return self.render('crear_factura.html', **self._options())

    @expose('/editar/<int:factura_id>', methods=('GET', 'POST'))
    def editar(self, factura_id):
        factura = db.session.get(Facturas, factura_id)
        if factura is None:
            flash('La factura no existe.', 'error')
            return redirect(url_for('facturas.index'))
        if request.method == 'POST':
            try:
                ids_a_eliminar = {int(v) for v in request.form.getlist('eliminar_imagenes') if v.isdigit()}
                imagenes_a_eliminar = [imagen for imagen in list(factura.imagenes) if imagen.id_imagen in ids_a_eliminar]
                for imagen in imagenes_a_eliminar:
                    factura.imagenes.remove(imagen)
                    db.session.delete(imagen)

                self._read_form(factura)
                if self._numero_factura_duplicado(factura.numero_de_factura, factura.id_factura):
                    raise ValueError('Esta factura ya esta registrada.')
                nombres_imagenes = self._save_images(request.files.getlist('imagenes'))
                orden_inicial = len(factura.imagenes)
                for offset, nombre in enumerate(nombres_imagenes):
                    factura.imagenes.append(FacturaImagen(nombre_archivo=nombre, orden=orden_inicial + offset))
                if not factura.imagenes:
                    raise ValueError('La factura debe tener al menos una imagen.')
                self._replace_details(factura)
                db.session.commit()
                # Los archivos en disco se borran solo después de que el commit tuvo éxito.
                for imagen in imagenes_a_eliminar:
                    self._delete_image(imagen.nombre_archivo)
                flash('Factura actualizada correctamente.', 'success')
                return redirect(url_for('facturas.index'))
            except (ValueError, TypeError) as error:
                db.session.rollback()
                flash(str(error), 'error')
        return self.render('editar_factura.html', factura=factura, **self._options())

    @expose('/validar-numero-factura')
    def validar_numero_factura(self):
        numero = request.args.get('numero', '').strip()
        factura_id = request.args.get('factura_id', type=int)
        duplicado = bool(numero) and self._numero_factura_duplicado(numero, factura_id)
        return jsonify({'disponible': not duplicado})

    @expose('/descargar/<int:factura_id>')
    def descargar(self, factura_id):
        factura = db.session.get(Facturas, factura_id)
        if factura is None or not factura.imagenes:
            flash('Esta factura no tiene ninguna imagen guardada.', 'error')
            return redirect(url_for('facturas.index'))
        directory = Path(__file__).resolve().parent.parent / 'static' / 'facturas'

        if len(factura.imagenes) == 1:
            imagen = factura.imagenes[0]
            image_path = directory / imagen.nombre_archivo
            if not image_path.is_file():
                abort(404)
            extension = image_path.suffix
            download_name = f'factura_{factura.numero_de_factura}{extension}'
            return send_from_directory(directory, imagen.nombre_archivo, as_attachment=True, download_name=download_name)

        # Dos o más imágenes: se empaquetan en un .zip, ya que una respuesta HTTP solo puede
        # entregar un archivo a la vez.
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as archivo_zip:
            for indice, imagen in enumerate(factura.imagenes, start=1):
                image_path = directory / imagen.nombre_archivo
                if image_path.is_file():
                    archivo_zip.write(image_path, arcname=f'imagen_{indice}{image_path.suffix}')
        buffer.seek(0)
        return send_file(
            buffer,
            mimetype='application/zip',
            as_attachment=True,
            download_name=f'factura_{factura.numero_de_factura}.zip',
        )

    @expose('/quick-create/<string:key>', methods=('GET', 'POST'))
    def quick_create(self, key):
        entry = QUICK_CREATE_REGISTRY.get(key)
        if not entry:
            abort(404)
        model, admin_cls = entry
        columns = admin_cls.form_columns
        mapper = sa_inspect(model)
        db_required = _db_required_columns(model)

        if request.method == 'GET':
            return jsonify({'fields': [_field_schema(admin_cls, mapper, name, db_required) for name in columns]})

        missing = [
            _field_label(admin_cls, name)
            for name in columns
            if _is_required(mapper, name, db_required) and not request.form.get(name, '').strip()
        ]
        if missing:
            return jsonify({'error': 'Campos obligatorios: ' + ', '.join(missing)}), 400

        instance = model()
        for column_name in columns:
            _set_field_value(instance, mapper, column_name, request.form.get(column_name, ''))
        db.session.add(instance)
        try:
            db.session.commit()
        except Exception as error:
            db.session.rollback()
            print(f'quick_create[{key}] error al guardar: {error}')
            return jsonify({'error': 'No se pudo guardar. Verifica que no sea un dato duplicado.'}), 400

        display_field = DISPLAY_FIELDS.get(model, 'nombre')
        pk_name = mapper.primary_key[0].name
        return jsonify({'id': getattr(instance, pk_name), 'text': getattr(instance, display_field)}), 201

    @expose('/ocr', methods=('POST',))
    def ocr(self):
        uploaded_file = request.files.get('imagen')
        if not uploaded_file or not uploaded_file.filename:
            return jsonify({'error': 'No se recibió ninguna imagen.'}), 400
        extension = Path(secure_filename(uploaded_file.filename)).suffix.lower().lstrip('.')
        if extension not in self.allowed_extensions:
            return jsonify({'error': 'La imagen debe ser JPG, PNG, GIF o WEBP.'}), 400

        # Se guarda aparte de static/facturas: esta copia es solo para escanear y se borra enseguida.
        temp_path = Path(tempfile.gettempdir()) / f'ocr_{uuid4().hex}.{extension}'
        uploaded_file.save(temp_path)
        try:
            texto = _extraer_texto(str(temp_path))
        except Exception as error:
            print(f'ocr error al escanear: {error}')
            return jsonify({'error': 'No se pudo leer la imagen.'}), 500
        finally:
            temp_path.unlink(missing_ok=True)
        return jsonify({'texto': texto})

    @expose('/eliminar/<int:factura_id>', methods=('POST',))
    def eliminar(self, factura_id):
        factura = db.session.get(Facturas, factura_id)
        if factura:
            nombres_imagenes = [imagen.nombre_archivo for imagen in factura.imagenes]
            db.session.delete(factura)
            db.session.commit()
            for nombre in nombres_imagenes:
                self._delete_image(nombre)
            flash('Factura eliminada correctamente.', 'success')
        return redirect(url_for('facturas.index'))