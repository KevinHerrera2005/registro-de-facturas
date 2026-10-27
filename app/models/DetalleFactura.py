from database import db

class DetalleFactura(db.Model):
    __tablename__ = 'DetalleFactura'

    id_detallefactura = db.Column(db.Integer, primary_key=True)
    cantidad = db.Column(db.Float, nullable=False)   
    precio_unitario = db.Column(db.Float, nullable=False)
    descuento = db.Column(db.Float)                  
    subtotal = db.Column(db.Float)
    isv = db.Column(db.Float)                       
    total_linea = db.Column(db.Float)
    medida = db.Column(db.String(50))
    aplica_isv = db.Column(db.Boolean, default=False)
    descripcion = db.Column(db.String(50))
    
    
    id_unidad=db.Column(db.Integer, db.ForeignKey('Unidades.id_unidad'))
    id_factura = db.Column('id_factura', db.Integer, db.ForeignKey('Facturas.id_factura'), nullable=False)
    id_producto = db.Column(db.Integer, db.ForeignKey('Productos.id_producto'), nullable=False)

    unidad=db.relationship('Unidades', back_populates='detallefactura')
    factura = db.relationship('Facturas', back_populates='detalles')
    producto = db.relationship('Productos', back_populates='detalles')
