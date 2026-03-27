import os
from app.models.db_connector import get_db_connection

def get_sites():
    """
    Consulta SAP HANA y retorna la lista maestra de sitios / centros de costo.
    Devuelve Name y CostCenter.
    """
    conn = get_db_connection()
    if conn is None:
        return None

    schema = os.getenv("HANA_SCHEMA")
    view = "globalhitss.ee.models.CalculationViews::CV_SITE_CUBE"
    
    query = (
        f'SELECT DISTINCT "COSTCENTER", "NAME" '
        f'FROM "{schema}"."{view}" '
        f'WHERE "NAME" IS NOT NULL AND "COSTCENTER" IS NOT NULL '
        f'ORDER BY "NAME" ASC'
    )

    try:
        cursor = conn.cursor()
        cursor.execute(query)
        sites = [{"id": row[0], "name": row[1]} for row in cursor.fetchall()]
        cursor.close()
        conn.close()
        return sites
    except Exception as e:
        print(f"Error al obtener sitios core: {e}")
        return None

def get_max_date():
    """
    Obtiene la fecha más reciente en todo el universo de HANA para inicializar el combo de fechas
    """
    conn = get_db_connection()
    if conn is None:
        return None

    schema = os.getenv("HANA_SCHEMA")
    # Utilizamos Energía como pivot maestro
    view = os.getenv("HANA_VIEW_ENERGY") 
    
    query = f'SELECT MAX("DATE") FROM "{schema}"."{view}" WHERE "CONSUMPTION" > 0'
    
    try:
        cursor = conn.cursor()
        cursor.execute(query)
        row = cursor.fetchone()
        cursor.close()
        conn.close()
        return str(row[0]) if row and row[0] else None
    except Exception as e:
        print(f"Error al obtener fecha maxima: {e}")
        return None
