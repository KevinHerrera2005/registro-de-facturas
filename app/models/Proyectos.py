from database import db


class Proyectos(db.Model):
    __tablename__ = 'Proyectos'
    id_proyecto = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(100), nullable=False)
    ubicacion = db.Column(db.String(500), nullable=False)
    descripcion = db.Column(db.String(500))

    facturas = db.relationship("Facturas",back_populates="proyectos")
    def __str__(self):
        return self.nombre