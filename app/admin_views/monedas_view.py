from flask_admin.contrib.sqla import ModelView
class MonedasAdmin(ModelView):
    column_list=[
        'id_moneda',
        'nombre',
        'sufijo'
    ]
    form_columns=[
        'nombre',
        'sufijo'
    ]
    column_labels={
        'nombre':'Nombre',
        'sufijo':'sufijo'
    }
    column_searchable_list = ['nombre','sufijo']