from flask_admin.contrib.sqla import ModelView
class Tipo_FacturaAdmin(ModelView):
    column_list=[
        'id_tipo_factura',
        'nombre',
        'numero_parametro',
    ]
    form_columns=[
        'nombre',
        'numero_parametro',
    ]
    form_excluded_columns = ['Facturas']
    column_labels={
        'id_tipo_factura':'ID',
        'nombre':'Nombre',
        'numero_parametro':'numero del tipo de factura'
    }
    column_searchable_list = ['nombre','numero_parametro']
    