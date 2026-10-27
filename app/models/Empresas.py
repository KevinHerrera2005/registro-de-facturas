
from database import db

class Empresas(db.Model):
    __tablename__ = 'Empresas'

    id_empresa = db.Column(db.Integer, primary_key=True)
    nombre_empresa = db.Column(db.String(50), nullable=False, unique=True)
    rtn = db.Column(db.String(50), nullable=False, unique=True)
    
    sucursales=db.relationship("Sucursales",back_populates="empresa")
    def __str__(self):
        return self.nombre_empresa