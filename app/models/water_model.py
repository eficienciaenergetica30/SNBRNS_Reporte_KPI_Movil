import os
from app.models.db_connector import get_db_connection

def get_water_data(costcenter, date):
    """
    Lógica de base de datos dedicada 100% al módulo de Agua.
    """
    conn = get_db_connection()
    if conn is None:
        return None

    schema = os.getenv("HANA_SCHEMA")
    view = os.getenv("HANA_VIEW_WATER")

    try:
        cursor = conn.cursor()
        
        # 1. Obtener Nombre del Sitio
        site_name_query = f'SELECT TOP 1 "SITE_NAME" FROM "{schema}"."{view}" WHERE "COSTCENTER" = ?'
        cursor.execute(site_name_query, (costcenter,))
        row = cursor.fetchone()
        site_name = row[0] if row else "Sitio Desconocido"

        data = {"site_name": site_name, "kpi": {}, "hourly": []}

        # KPI
        kpi_query = f'''
            SELECT 
                IFNULL(SUM("CONSUMPTION"), 0) AS "ACTUAL",
                IFNULL(SUM("CONSUMPTION_AVG"), 0) AS "TARGET"
            FROM "{schema}"."{view}"
            WHERE "DATE" = ? AND "COSTCENTER" = ?
        '''
        cursor.execute(kpi_query, (date, costcenter))
        kpi_row = cursor.fetchone()
        if kpi_row:
            data["kpi"] = {
                "actual": float(kpi_row[0]),
                "target": float(kpi_row[1])
            }

        # Hourly
        hourly_query = f'''
            SELECT 
                "HOUR",
                IFNULL(SUM("CONSUMPTION"), 0) AS "ACTUAL",
                IFNULL(SUM("CONSUMPTION_AVG"), 0) AS "TARGET"
            FROM "{schema}"."{view}"
            WHERE "DATE" = ? AND "COSTCENTER" = ?
            GROUP BY "HOUR"
            ORDER BY "HOUR" ASC
        '''
        cursor.execute(hourly_query, (date, costcenter))
        for h_row in cursor.fetchall():
            data["hourly"].append({
                "hour": str(h_row[0]) if h_row[0] is not None else "00:00",
                "actual": float(h_row[1]) if h_row[1] is not None else 0,
                "target": float(h_row[2]) if h_row[2] is not None else 0
            })

        cursor.close()
        conn.close()
        return data
    except Exception as e:
        print(f"Error queries water: {e}")
        return None

def get_sites():
    """
    Trae ÚNICAMENTE los sitios que tienen datos en la vista de Agua.
    Retorna lista de dicts con 'id' (COSTCENTER) y 'name' (SITE_NAME).
    """
    conn = get_db_connection()
    if conn is None:
        return None

    schema = os.getenv("HANA_SCHEMA")
    view = os.getenv("HANA_VIEW_WATER")
    
    query = (
        f'SELECT DISTINCT "COSTCENTER", "SITE_NAME" '
        f'FROM "{schema}"."{view}" '
        f'WHERE "SITE_NAME" IS NOT NULL AND "COSTCENTER" IS NOT NULL '
        f'ORDER BY "SITE_NAME" ASC'
    )

    try:
        cursor = conn.cursor()
        cursor.execute(query)
        sites = [{"id": row[0], "name": row[1]} for row in cursor.fetchall()]
        cursor.close()
        conn.close()
        return sites
    except Exception as e:
        print(f"Error al obtener sitios agua: {e}")
        return None
