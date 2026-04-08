import os
from app.models.db_connector import get_db_connection
from flask import current_app

class GasModel:
    def __init__(self):
        pass

    @staticmethod
    def get_gas_kpis(costcenter, date):
        """
        Obtiene los KPIs de gas para un centro de costos y fecha específicos.
        """
        hana = None
        cursor = None
        try:
            hana = get_db_connection()
            if not hana:
                raise Exception("No se pudo obtener la conexión a la base de datos.")
            
            schema = os.getenv("HANA_SCHEMA")
            view = os.getenv("HANA_VIEW_GAS_HOUR")
            
            cursor = hana.cursor()
            
            # 1. OBTENER PRECIO UNITARIO
            # Usamos una vista diferente para obtener el costo más reciente
            view_cost = os.getenv("HANA_VIEW_GAS_COST")
            cost_query = f'''
                SELECT "AMOUNT" / "CONSUMPTION_M3" AS "UNIT_PRICE"
                FROM "{schema}"."{view_cost}"
                WHERE "COSTCENTER" = ?
                ORDER BY "YEAR" DESC, "MONTH" DESC
                LIMIT 1
            '''
            cursor.execute(cost_query, (costcenter,))
            cost_row = cursor.fetchone()
            unit_price = float(cost_row[0]) if cost_row else 0

            # 2. KPIs TOTALES DE HOY
            kpi_query = f'''
                SELECT 
                    IFNULL(SUM("CONSUMPTION"), 0) AS "ACTUAL",
                    IFNULL(SUM("CONSUMPTION_AVG"), 0) AS "TARGET"
                FROM "{schema}"."{view}"
                WHERE "DATE" = ? AND "COSTCENTER" = ?
            '''
            cursor.execute(kpi_query, (date, costcenter))
            kpi_row = cursor.fetchone()
            
            actual_consumption = float(kpi_row[0]) if kpi_row else 0

            kpi_data = {
                "actual": actual_consumption,
                "target": float(kpi_row[1]) if kpi_row else 0,
                "precio_unitario": unit_price,
                "costo_estimado": actual_consumption * unit_price
            }

            # Consulta para datos por hora
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
            hourly_data_raw = cursor.fetchall()

            hourly_data = []
            if hourly_data_raw:
                columns = [desc[0] for desc in cursor.description]
                hourly_data = [dict(zip(columns, row)) for row in hourly_data_raw]
                for row in hourly_data:
                    for key, value in row.items():
                        if hasattr(value, 'isoformat'):
                            row[key] = value.isoformat()
                        elif isinstance(value, (int, float)) or hasattr(value, 'real'):
                             row[key] = float(value)

            return {"kpi": kpi_data, "hourly": hourly_data}

        except Exception as e:
            current_app.logger.error(f"Error en GasModel.get_gas_kpis: {e}")
            return None
        finally:
            if cursor:
                cursor.close()
            if hana:
                hana.close()

    @staticmethod
    def get_sites():
        """
        Obtiene la lista de sitios únicamente con datos en la vista de Gas.
        Retorna lista de dicts con 'id' (COSTCENTER) y 'name' (SITE_NAME).
        """
        hana = None
        cursor = None
        try:
            hana = get_db_connection()
            if not hana:
                return None
            
            schema = os.getenv("HANA_SCHEMA")
            view = os.getenv("HANA_VIEW_GAS_HOUR")
            
            cursor = hana.cursor()
            
            query = (
                f'SELECT DISTINCT "COSTCENTER", "SITE_NAME" '
                f'FROM "{schema}"."{view}" '
                f'WHERE "SITE_NAME" IS NOT NULL AND "COSTCENTER" IS NOT NULL '
                f'ORDER BY "SITE_NAME" ASC'
            )
            
            cursor.execute(query)
            sites = [{"id": row[0], "name": row[1]} for row in cursor.fetchall()]
            return sites
        except Exception as e:
            current_app.logger.error(f"Error en GasModel.get_sites: {e}")
            return None
        finally:
            if cursor:
                cursor.close()
            if hana:
                hana.close()

