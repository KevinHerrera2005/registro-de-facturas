from database import db


class Unidades(db.Model):
    __tablename__ = 'Unidades'
    id_unidad = db.Column(db.Integer, primary_key=True)
    nombre=db.Column(db.String(50),nullable=False)
    nomenclatura=db.Column(db.String(50),nullable=False)
    
    detallefactura=db.relationship("DetalleFactura",back_populates="unidad")    