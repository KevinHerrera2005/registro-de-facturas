from flask_admin.contrib.sqla import ModelView
class EmpresasAdmin(ModelView):
    column_list =[
        'id_empresa',
        'nombre_empresa',
        'rtn'
    ]
    form_columns=[
        'nombre_empresa',
        'rtn'
    ]
    column_labels={
        'id_empresa':'ID',
        'nombre_empresa':'Nombre de la empresa/proveedor',
        'rtn':'rtn'   
    }
    column_searchable_list = ['nombre_empresa','rtn']