from database import db

class FacturaImagen(db.Model):
    __tablename__ = 'FacturaImagenes'

    id_imagen = db.Column(db.Integer, primary_key=True)
    id_factura = db.Column(db.Integer, db.ForeignKey('Facturas.id_factura'), nullable=False)
    nombre_archivo = db.Column(db.String(255), nullable=False)
    orden = db.Column(db.Integer, default=0)

    factura = db.relationship('Facturas', back_populates='imagenes')
