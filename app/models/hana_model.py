import os
from hdbcli import dbapi
from cfenv import AppEnv
from dotenv import load_dotenv

load_dotenv()  # Carga .env si existe (desarrollo local)


def get_db_connection():
    """
    Model: establece y retorna una conexión a SAP HANA Cloud.
    Detecta automáticamente si corre en SAP BTP (VCAP_SERVICES) o en local (.env).
    """
    env = AppEnv()
    hana_service = env.get_service(label='hana-cloud')

    if hana_service:
        # ── Configuración en SAP BTP ─────────────────────────────────────────
        creds = hana_service.credentials
        host = creds.get('host')
        port = creds.get('port')
        user = creds.get('user')
        password = creds.get('password')
    else:
        # ── Configuración Local (.env) ────────────────────────────────────────
        host = os.getenv('HANA_HOST')
        port = os.getenv('HANA_PORT')
        user = os.getenv('HANA_UID')
        password = os.getenv('HANA_PWD')

    try:
        conn = dbapi.connect(
            address=host,
            port=port,
            user=user,
            password=password,
            encrypt=True,
            sslValidateCertificate=False
        )
        return conn
    except Exception as e:
        print(f"Error conectando a HANA: {e}")
        return None


def get_sites():
    """
    Model: consulta SAP HANA y retorna la lista de sitios / centros de costo.
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
        # Extraemos Name y CostCenter
        sites = [{"id": row[0], "name": row[1]} for row in cursor.fetchall()]
        cursor.close()
        conn.close()
        return sites
    except Exception as e:
        print(f"Error al obtener sitios: {e}")
        return None

def get_max_date():
    """
    Model: Obtiene la fecha más reciente que realmente tenga datos de consumo en HANA.
    Esto evita mostrar el dashboard en ceros debido a retrasos (D-1, D-2).
    """
    conn = get_db_connection()
    if conn is None:
        return None

    schema = os.getenv("HANA_SCHEMA")
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

def get_dashboard_data(module, costcenter, date, block=None):
    """
    Función general para obtener datos (kpi y de gráfica) de cada módulo.
    module: 'energy', 'water', 'gas', 'temperature'
    """
    conn = get_db_connection()
    if conn is None:
        return None

    schema = os.getenv("HANA_SCHEMA")
    
    if module == 'energy':
        view = os.getenv("HANA_VIEW_ENERGY")
    elif module == 'water':
        view = os.getenv("HANA_VIEW_WATER")
    elif module == 'gas':
        view = os.getenv("HANA_VIEW_GAS")
    elif module == 'temperature':
        view = os.getenv("HANA_VIEW_TEMPERATURE")
    else:
        return None

    try:
        cursor = conn.cursor()
        
        # 1. Obtener Nombre del Sitio
        site_name_query = f'SELECT TOP 1 "SITE_NAME" FROM "{schema}"."{view}" WHERE "COSTCENTER" = ?'
        if module == 'temperature':
            site_name_query = f'SELECT TOP 1 "NAME" FROM "{schema}"."{view}" WHERE "COSTCENTER" = ?'
            
        cursor.execute(site_name_query, (costcenter,))
        row = cursor.fetchone()
        site_name = row[0] if row else "Sitio Desconocido"

        # 2. KPIs y Datos por hora
        data = {"site_name": site_name, "kpi": {}, "hourly": [], "power_factor": {}}

        if module in ['energy', 'water', 'gas']:
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
                
            # Power Factor (Solo Energía)
            if module == 'energy':
                pf_query = f'''
                    SELECT
                      ROUND(MIN_Q.TOTALPOWERFACTOR, 3) AS MIN_TOTALPOWERFACTOR,
                      MIN_Q.TIME AS TIME_MIN_TOTALPOWERFACTOR,
                      ROUND(MAX_Q.TOTALPOWERFACTOR, 3) AS MAX_TOTALPOWERFACTOR,
                      MAX_Q.TIME AS TIME_MAX_TOTALPOWERFACTOR,
                      ROUND(CURRENT_Q.TOTALPOWERFACTOR, 2) AS CURRENT_TOTALPOWERFACTOR,
                      CURRENT_Q.TIME AS TIME_CURRENT_TOTALPOWERFACTOR,
                      ROUND(TOTAL_Q.TOTAL_POWER_FACTOR / TOTAL_Q.CNT, 2) AS AVG_TOTALPOWERFACTOR,
                      ROUND(MIN_Q.TOTALPOWERFACTOR / MAX_Q.TOTALPOWERFACTOR, 1) AS MINMAX
                    FROM
                      (SELECT TIME, TOTALPOWERFACTOR FROM "{schema}"."{view}" WHERE "COSTCENTER" = ? AND "DATE" = ? AND TOTALPOWERFACTOR IS NOT NULL ORDER BY TOTALPOWERFACTOR ASC LIMIT 1) AS MIN_Q
                    CROSS JOIN
                      (SELECT TIME, TOTALPOWERFACTOR FROM "{schema}"."{view}" WHERE "COSTCENTER" = ? AND "DATE" = ? AND TOTALPOWERFACTOR IS NOT NULL ORDER BY TOTALPOWERFACTOR DESC LIMIT 1) AS MAX_Q
                    CROSS JOIN
                      (SELECT TIME, TOTALPOWERFACTOR FROM "{schema}"."{view}" WHERE "COSTCENTER" = ? AND "DATE" = ? AND TOTALPOWERFACTOR IS NOT NULL ORDER BY TIME DESC LIMIT 1) AS CURRENT_Q
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

        elif module == 'temperature':
            if not block:
                block = "BLOCK A" # Default fallback
            
            # KPI (Min, Max, Current, Avg)
            temp_kpi_query = f'''
                SELECT
                  ROUND(MIN_Q.DEGREES, 2) AS MIN_DEGREES,
                  ROUND(MAX_Q.DEGREES, 2) AS MAX_DEGREES,
                  ROUND(CURRENT_Q.DEGREES, 2) AS CURRENT_DEGREES,
                  ROUND(TOTAL_Q.TOTAL_DEGREES / TOTAL_Q.CNT, 2) AS AVG_DEGREES
                FROM
                  (SELECT DEGREES FROM "{schema}"."{view}" WHERE "COSTCENTER" = ? AND "DATE_D" = ? AND "BLOCK" = ? AND "DEGREES" IS NOT NULL ORDER BY "DEGREES" ASC LIMIT 1) AS MIN_Q
                CROSS JOIN
                  (SELECT DEGREES FROM "{schema}"."{view}" WHERE "COSTCENTER" = ? AND "DATE_D" = ? AND "BLOCK" = ? AND "DEGREES" IS NOT NULL ORDER BY "DEGREES" DESC LIMIT 1) AS MAX_Q
                CROSS JOIN
                  (SELECT DEGREES FROM "{schema}"."{view}" WHERE "COSTCENTER" = ? AND "DATE_D" = ? AND "BLOCK" = ? AND "DEGREES" IS NOT NULL ORDER BY TIME DESC LIMIT 1) AS CURRENT_Q
                CROSS JOIN
                  (SELECT SUM(DEGREES) AS TOTAL_DEGREES, COUNT(*) AS CNT FROM "{schema}"."{view}" WHERE "COSTCENTER" = ? AND "DATE_D" = ? AND "BLOCK" = ? AND "DEGREES" IS NOT NULL) AS TOTAL_Q
            '''
            cursor.execute(temp_kpi_query, (costcenter, date, block, costcenter, date, block, costcenter, date, block, costcenter, date, block))
            tkpi_row = cursor.fetchone()
            if tkpi_row:
                data["kpi"] = {
                    "min": float(tkpi_row[0] or 0),
                    "max": float(tkpi_row[1] or 0),
                    "current": float(tkpi_row[2] or 0),
                    "avg": float(tkpi_row[3] or 0)
                }
            
            # Hourly
            hourly_query = f'''
                SELECT
                  HOUR("HOUR") AS "HOUR",
                  IFNULL(AVG("DEGREES"), 0) AS "ACTUAL"
                FROM "{schema}"."{view}"
                WHERE "COSTCENTER" = ? AND "DATE_D" = ? AND "BLOCK" = ? AND "DEGREES" IS NOT NULL
                GROUP BY HOUR("HOUR")
                ORDER BY "HOUR" ASC
            '''
            cursor.execute(hourly_query, (costcenter, date, block))
            for h_row in cursor.fetchall():
                data["hourly"].append({
                    "hour": str(h_row[0]) if h_row[0] is not None else "00",
                    "actual": float(h_row[1]) if h_row[1] is not None else 0
                })

        cursor.close()
        conn.close()
        return data
    except Exception as e:
        print(f"Error queries {module}: {e}")
        return None



def test_db_connection():
    """Prueba la conexión y retorna (bool, mensaje)."""
    conn = get_db_connection()
    if conn is None:
        return False, "❌ No se pudo establecer conexión."
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT 1 FROM DUMMY")
        result = cursor.fetchone()
        cursor.close()
        conn.close()
        if result and result[0] == 1:
            return True, "✅ Conexión exitosa a SAP HANA Cloud."
        return False, "⚠️ Falló query DUMMY."
    except Exception as e:
        return False, f"❌ Error BDD: {str(e)}"
