from database import db

class Productos(db.Model):
    __tablename__ = 'Productos'

    id_producto = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(50), nullable=False)
    descripcion = db.Column(db.String(500))  

    detalles = db.relationship('DetalleFactura', back_populates='producto')

    def __str__(self):
        return self.nombre