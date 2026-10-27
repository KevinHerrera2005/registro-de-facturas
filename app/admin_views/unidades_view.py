from flask_admin.contrib.sqla import ModelView
class UnidadesAdmin(ModelView):
    column_list = [
        'id_unidad',
        'nombre',
        'nomenclatura',
    ]
    form_columns = [
        'nombre',
        'nomenclatura',
    ]
    form_excluded_columns = ['detallefactura']
    column_labels = {
        'id_unidad': 'ID',
        'nombre': 'Nombre',
        'nomenclatura': 'Nomenclatura'
    }
    column_searchable_list = ['nombre', 'nomenclatura']
    