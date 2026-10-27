from conexionDB import conexion_a_BD
from flask import Flask
from flask_admin import Admin
from models import Productos, Sucursales, Tipo_Factura,Metodos_de_pagos
import secrets

#modelos orm del sqlachemy
from models.Proyectos import Proyectos
from models.Unidades import Unidades
from models.DetalleFactura import DetalleFactura
from models.Empresas import Empresas
from models.Facturas import Facturas         
from models.Metodos_de_pagos import Metodos_de_pagos
from models.Monedas import Monedas
from models.Productos import Productos
from models.Sucursales import Sucursales
from models.Tipo_Factura import Tipo_Factura
from pathlib import Path


#admins views
from admin_views.proyectos_view import ProyectosAdmin
from admin_views.unidades_view import UnidadesAdmin
from admin_views.empresas_view import EmpresasAdmin
from admin_views.monedas_view import MonedasAdmin
from admin_views.metodos_de_pagos_view import Metodos_de_pagosAdmin
from admin_views.productos_view import ProductosAdmin
from admin_views.sucursales_view import SucursalesAdmin
from admin_views.tipo_factura_view import Tipo_FacturaAdmin
from admin_views.registro_factura_view import RegistroFacturaView

#para tenerlo asi modo oscuro
from flask_admin import AdminIndexView

class Modo_Oscuro(AdminIndexView):
    #esta parte es para no estar escribiendo /admin en el navegador
    def __init__(self, **kwargs):
        super().__init__(url="/", **kwargs)

app = Flask(__name__)
app.secret_key = secrets.token_hex(32)
db_path = Path(__file__).parent / 'FacturavinDB.db'
app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{db_path}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False


admin = Admin(app,index_view=Modo_Oscuro())

from database import db
db.init_app(app)
# probar si la base conecta o no
con = conexion_a_BD()
if con:
    print("Todo bien")
    con.close()  
else:
    print("nadota que conecta")


#los admins views del flask admin
admin.add_view(UnidadesAdmin(Unidades,db))
admin.add_view(ProyectosAdmin(Proyectos,db))
admin.add_view(EmpresasAdmin(Empresas, db)) 
admin.add_view(RegistroFacturaView(name='Facturas', endpoint='facturas', category=None))
admin.add_view(MonedasAdmin(Monedas,db))
admin.add_view(Metodos_de_pagosAdmin(Metodos_de_pagos,db))
admin.add_view(ProductosAdmin(Productos,db))
admin.add_view(SucursalesAdmin(Sucursales,db))
admin.add_view(Tipo_FacturaAdmin(Tipo_Factura,db))


if __name__ == '__main__':
    app.run(debug=True)