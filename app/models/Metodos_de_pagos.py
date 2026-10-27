from database import db


class Metodos_de_pagos(db.Model):
    __tablename__ = 'Metodos_de_pagos'
    id_metodo_pago = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(50), nullable=False)
    descripcion = db.Column(db.String(500), nullable=False)
    
    facturas = db.relationship("Facturas",back_populates="metodo_pago")
    def __str__(self):
        return self.nombre