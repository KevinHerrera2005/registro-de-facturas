from database import db


class Sucursales(db.Model):
    __tablename__ = 'Sucursales'
    id_sucursal = db.Column(db.Integer, primary_key=True)
    nombre=db.Column(db.String(100))
    telefono=db.Column(db.String(100))
    ubicacion = db.Column(db.String(500),nullable=False)
    numero_cai = db.Column(db.String(500))
    
    facturas = db.relationship("Facturas",back_populates="sucursal")
    
    #fk
    id_empresa=db.Column(db.Integer, db.ForeignKey('Empresas.id_empresa'))
    empresa=db.relationship('Empresas', back_populates='sucursales')
    
    def __str__(self):
        return self.nombre