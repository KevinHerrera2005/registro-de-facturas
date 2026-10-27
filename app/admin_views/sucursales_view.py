from flask_admin.contrib.sqla import ModelView
class SucursalesAdmin(ModelView):
    column_list=[
        'id_sucursal',
        'empresa',
        'nombre',
        'telefono',
        'ubicacion',
        'numero_cai'
    ]
    form_columns=[
        'nombre',
        'telefono',
        'empresa',
        'ubicacion',
        'numero_cai'
    ]
    column_labels={
        'empresa':'Empresa/Proveedor',
        'nombre':'nombre',
        'telefono':'Telefono',
        'ubicacion':'Ubicación de sucursal',
        'numero_cai':'Numero Cai'
    }
    column_searchable_list=['nombre','numero_cai']
    