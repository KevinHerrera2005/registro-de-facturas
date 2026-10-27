from database import db


class Tipo_Factura(db.Model):
    __tablename__ = 'Tipo_Factura'
    id_tipo_factura = db.Column(db.Integer, primary_key=True)
    nombre=db.Column(db.String(50),nullable=False)
    numero_parametro=db.Column(db.Integer,nullable=False)
    
    facturas = db.relationship("Facturas",back_populates="tipo_factura")
    def __str__(self):
        return self.nombre