from database import db


class Monedas(db.Model):
    __tablename__ = 'Monedas'
    id_moneda = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(50), nullable=False)
    sufijo = db.Column(db.String(500), nullable=False)

    facturas = db.relationship("Facturas",back_populates="moneda")
    def __str__(self):
        return self.nombre