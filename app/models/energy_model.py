import os
from app.models.db_connector import get_db_connection

def get_energy_data(costcenter, date):
    """
    Lógica de base de datos dedicada 100% al módulo eléctrico.
    """
    conn = get_db_connection()
    if conn is None:
        return None

    schema = os.getenv("HANA_SCHEMA")
    view = os.getenv("HANA_VIEW_ENERGY")

    try:
        cursor = conn.cursor()
        
        # 1. Obtener Nombre del Sitio
        site_name_query = f'SELECT TOP 1 "SITE_NAME" FROM "{schema}"."{view}" WHERE "COSTCENTER" = ?'
        cursor.execute(site_name_query, (costcenter,))
        row = cursor.fetchone()
        site_name = row[0] if row else "Sitio Desconocido"

        data = {"site_name": site_name, "kpi": {}, "hourly": [], "power_factor": {}}

        # KPI
        kpi_query = f'''
            SELECT 
                IFNULL(SUM("CONSUMPTION"), 0) AS "ACTUAL",
                IFNULL(SUM("CONSUMPTION_AVG"), 0) AS "TARGET",
                IFNULL(AVG("PrecioMedio"), 0) AS "AVERAGE_PRICE"
            FROM "{schema}"."{view}"
            WHERE "DATE" = ? AND "COSTCENTER" = ?
        '''
        cursor.execute(kpi_query, (date, costcenter))
        kpi_row = cursor.fetchone()
        if kpi_row:
            data["kpi"] = {
                "actual": float(kpi_row[0]),
                "target": float(kpi_row[1]),
                "average_price": float(kpi_row[2]),
                "cost_per_kwh": float(kpi_row[2] * kpi_row[0])
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
            
        # Power Factor (Exclusivo Energía)
        pf_query = f'''
            SELECT
                ROUND(MIN_Q.TOTALPOWERFACTOR, 3) AS MIN_TOTALPOWERFACTOR,
                MIN_Q."HOUR" AS TIME_MIN_TOTALPOWERFACTOR,
                ROUND(MAX_Q.TOTALPOWERFACTOR, 3) AS MAX_TOTALPOWERFACTOR,
                MAX_Q."HOUR" AS TIME_MAX_TOTALPOWERFACTOR,
                ROUND(CURRENT_Q.TOTALPOWERFACTOR, 2) AS CURRENT_TOTALPOWERFACTOR,
                CURRENT_Q."HOUR" AS TIME_CURRENT_TOTALPOWERFACTOR,
                ROUND(TOTAL_Q.TOTAL_POWER_FACTOR / TOTAL_Q.CNT, 2) AS AVG_TOTALPOWERFACTOR,
                ROUND(MIN_Q.TOTALPOWERFACTOR / MAX_Q.TOTALPOWERFACTOR, 1) AS MINMAX
            FROM
                (SELECT "HOUR", TOTALPOWERFACTOR FROM "{schema}"."{view}" WHERE "COSTCENTER" = ? AND "DATE" = ? AND TOTALPOWERFACTOR IS NOT NULL ORDER BY TOTALPOWERFACTOR ASC LIMIT 1) AS MIN_Q
            CROSS JOIN
                (SELECT "HOUR", TOTALPOWERFACTOR FROM "{schema}"."{view}" WHERE "COSTCENTER" = ? AND "DATE" = ? AND TOTALPOWERFACTOR IS NOT NULL ORDER BY TOTALPOWERFACTOR DESC LIMIT 1) AS MAX_Q
            CROSS JOIN
                (SELECT "HOUR", TOTALPOWERFACTOR FROM "{schema}"."{view}" WHERE "COSTCENTER" = ? AND "DATE" = ? AND TOTALPOWERFACTOR IS NOT NULL ORDER BY "HOUR" DESC LIMIT 1) AS CURRENT_Q
            CROSS JOIN
                (SELECT SUM(TOTALPOWERFACTOR) AS TOTAL_POWER_FACTOR, COUNT(*) AS CNT FROM "{schema}"."{view}" WHERE "COSTCENTER" = ? AND "DATE" = ? AND TOTALPOWERFACTOR IS NOT NULL GROUP BY "DATE") AS TOTAL_Q
        '''
        cursor.execute(pf_query, (costcenter, date, costcenter, date, costcenter, date, costcenter, date))
        pf_row = cursor.fetchone()
        if pf_row:
            data["power_factor"] = {
                "min": float(pf_row[0] or 0), "min_time": str(pf_row[1]) if pf_row[1] is not None else "-",
                "max": float(pf_row[2] or 0), "max_time": str(pf_row[3]) if pf_row[3] is not None else "-",
                "current": float(pf_row[4] or 0), "current_time": str(pf_row[5]) if pf_row[5] is not None else "-",
                "avg": float(pf_row[6] or 0)
            }

        cursor.close()
        conn.close()
        return data
    except Exception as e:
        print(f"Error queries energy: {e}")
        return None
