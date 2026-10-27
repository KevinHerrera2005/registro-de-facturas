from flask_admin.contrib.sqla import ModelView
class ProductosAdmin(ModelView):
    column_list=[
        'id_producto',
        'descripcion',
        'nombre'
    ]
    form_columns=[
        'descripcion',
        'nombre'
    ]
    column_labels={
        'descripcion':'Descripción',
        'nombre':'Nombre'
    }
    column_searchable_list=['nombre']