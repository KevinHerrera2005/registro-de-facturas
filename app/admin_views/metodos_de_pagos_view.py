from flask_admin.contrib.sqla import ModelView
class Metodos_de_pagosAdmin(ModelView):
    column_list=[
        'id_metodo_pago',
        'nombre',
        'descripcion',
    ]
    form_columns=[
    'nombre',
    'descripcion',
    ]
    column_labels={
        'id_metodo_pago':'ID',
        'nombre':'Nombre',
        'descripcion':'Descripción'
    }
    column_searchable_list=['nombre']