from datetime import datetime
from database import db

class Facturas(db.Model):
    __tablename__ = 'Facturas'

    id_factura = db.Column(db.Integer, primary_key=True)
    fecha = db.Column(db.DateTime, default=datetime.now, nullable=False)
    numero_de_factura = db.Column(db.String(50), nullable=False)
    precio_total = db.Column(db.Float, default=0.0)
    fletes = db.Column(db.Float, default=0.0)
    descuento = db.Column(db.Integer)
    total_letras = db.Column(db.String(200))

    id_sucursal = db.Column(db.Integer, db.ForeignKey('Sucursales.id_sucursal'))
    id_metodo_pago = db.Column(db.Integer, db.ForeignKey('Metodos_de_pagos.id_metodo_pago'))
    id_tipo_factura = db.Column(db.Integer, db.ForeignKey('Tipo_Factura.id_tipo_factura'))
    id_moneda = db.Column(db.Integer, db.ForeignKey('Monedas.id_moneda'))
    id_proyecto=db.Column(db.Integer, db.ForeignKey('Proyectos.id_proyecto'))

    sucursal = db.relationship('Sucursales', back_populates='facturas')
    metodo_pago = db.relationship('Metodos_de_pagos', back_populates='facturas')
    tipo_factura = db.relationship('Tipo_Factura', back_populates='facturas')
    moneda = db.relationship('Monedas', back_populates='facturas')
    proyectos = db.relationship('Proyectos', back_populates='facturas')

    detalles = db.relationship('DetalleFactura', back_populates='factura', cascade='all, delete-orphan')
    imagenes = db.relationship('FacturaImagen', back_populates='factura', cascade='all, delete-orphan', order_by='FacturaImagen.orden')