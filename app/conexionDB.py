import sqlite3

def conexion_a_BD():
    try:
        conn = sqlite3.connect('FacturavinDB.db')
        cursor = conn.cursor()
        cursor.execute("SELECT 1")  
        print(" Conexión exitosa ")
        return conn
    except Exception as e:
        print(" Error de conexión:", e)
        return None