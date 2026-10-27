from flask_admin.contrib.sqla import ModelView
class ProyectosAdmin(ModelView):
    column_list=[
        'id_proyecto',
        'nombre',
        'ubicacion'
    ]
    form_columns=[
        'nombre',
        'ubicacion',
        'descripcion'
    ]
    column_labels={
        'nombre':'Nombre',
        'ubicacion':'Ubicacion',
        'descripcion':'Descripcion',
    }
    column_searchable_list=['nombre']