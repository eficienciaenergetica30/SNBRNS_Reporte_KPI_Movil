import os
from app.models.db_connector import get_db_connection
from flask import current_app


class TemperaturaModel:

    @staticmethod
    def get_temperatura_kpis(costcenter, date, block=1, sitename=''):
        """
        Obtiene los KPIs de temperatura para un centro de costos, fecha y bloque específicos.
        Block: 1=Tienda, 2=Bar, 3=Restaurante
        """
        hana = None
        cursor = None
        try:
            hana = get_db_connection()
            if not hana:
                raise Exception("No se pudo obtener la conexión a la base de datos.")

            schema = os.getenv("HANA_SCHEMA")
            view = os.getenv("HANA_VIEW_TEMPERATURE")
            normalized_sitename = (sitename or '').strip()

            cursor = hana.cursor()

            if normalized_sitename:
                site_query = f'''
                    SELECT TOP 1 "NAME"
                    FROM "{schema}"."{view}"
                    WHERE "COSTCENTER" = ? AND "DATE_D" = ? AND "BLOCK" = ? AND "NAME" = ?
                '''
                cursor.execute(site_query, (costcenter, date, block, normalized_sitename))
            else:
                site_query = f'''
                    SELECT TOP 1 "NAME"
                    FROM "{schema}"."{view}"
                    WHERE "COSTCENTER" = ? AND "DATE_D" = ? AND "BLOCK" = ?
                '''
                cursor.execute(site_query, (costcenter, date, block))
            site_row = cursor.fetchone()
            resolved_site_name = site_row[0] if site_row else (normalized_sitename or "Sitio Desconocido")

            # 1. KPIs: Min, Max, Actual y Promedio
                        if normalized_sitename:
                                kpi_query = f'''
                                        SELECT
                                                ROUND(MIN_Q.DEGREES, 2) AS MIN_DEGREES,
                                                MIN_Q.TIME AS TIME_MIN_DEGREES,
                                                ROUND(MAX_Q.DEGREES, 2) AS MAX_DEGREES,
                                                MAX_Q.TIME AS TIME_MAX_DEGREES,
                                                ROUND(CURRENT_Q.DEGREES, 2) AS CURRENT_DEGREES,
                                                CURRENT_Q.TIME AS TIME_CURRENT_DEGREES,
                                                ROUND(TOTAL_Q.TOTAL_DEGREES / TOTAL_Q.CNT, 2) AS AVG_DEGREES,
                                                ROUND(MIN_Q.DEGREES / MAX_Q.DEGREES, 2) AS MINMAX
                                        FROM
                                                (SELECT TIME, DEGREES
                                                 FROM "{schema}"."{view}"
                                                 WHERE "COSTCENTER" = ? AND "DATE_D" = ? AND "BLOCK" = ? AND "NAME" = ?
                                                     AND "DEGREES" IS NOT NULL
                                                 ORDER BY "DEGREES" ASC LIMIT 1) AS MIN_Q
                                        CROSS JOIN
                                                (SELECT TIME, DEGREES
                                                 FROM "{schema}"."{view}"
                                                 WHERE "COSTCENTER" = ? AND "DATE_D" = ? AND "BLOCK" = ? AND "NAME" = ?
                                                     AND "DEGREES" IS NOT NULL
                                                 ORDER BY "DEGREES" DESC LIMIT 1) AS MAX_Q
                                        CROSS JOIN
                                                (SELECT TIME, DEGREES
                                                 FROM "{schema}"."{view}"
                                                 WHERE "COSTCENTER" = ? AND "DATE_D" = ? AND "BLOCK" = ? AND "NAME" = ?
                                                     AND "DEGREES" IS NOT NULL
                                                 ORDER BY TIME DESC LIMIT 1) AS CURRENT_Q
                                        CROSS JOIN
                                                (SELECT SUM(DEGREES) AS TOTAL_DEGREES, COUNT(*) AS CNT
                                                 FROM "{schema}"."{view}"
                                                 WHERE "COSTCENTER" = ? AND "DATE_D" = ? AND "BLOCK" = ? AND "NAME" = ?
                                                     AND "DEGREES" IS NOT NULL) AS TOTAL_Q
                                '''
                                params = (
                                        costcenter, date, block, normalized_sitename,
                                        costcenter, date, block, normalized_sitename,
                                        costcenter, date, block, normalized_sitename,
                                        costcenter, date, block, normalized_sitename,
                                )
                        else:
                                kpi_query = f'''
                                        SELECT
                                                ROUND(MIN_Q.DEGREES, 2) AS MIN_DEGREES,
                                                MIN_Q.TIME AS TIME_MIN_DEGREES,
                                                ROUND(MAX_Q.DEGREES, 2) AS MAX_DEGREES,
                                                MAX_Q.TIME AS TIME_MAX_DEGREES,
                                                ROUND(CURRENT_Q.DEGREES, 2) AS CURRENT_DEGREES,
                                                CURRENT_Q.TIME AS TIME_CURRENT_DEGREES,
                                                ROUND(TOTAL_Q.TOTAL_DEGREES / TOTAL_Q.CNT, 2) AS AVG_DEGREES,
                                                ROUND(MIN_Q.DEGREES / MAX_Q.DEGREES, 2) AS MINMAX
                                        FROM
                                                (SELECT TIME, DEGREES
                                                 FROM "{schema}"."{view}"
                                                 WHERE "COSTCENTER" = ? AND "DATE_D" = ? AND "BLOCK" = ?
                                                     AND "DEGREES" IS NOT NULL
                                                 ORDER BY "DEGREES" ASC LIMIT 1) AS MIN_Q
                                        CROSS JOIN
                                                (SELECT TIME, DEGREES
                                                 FROM "{schema}"."{view}"
                                                 WHERE "COSTCENTER" = ? AND "DATE_D" = ? AND "BLOCK" = ?
                                                     AND "DEGREES" IS NOT NULL
                                                 ORDER BY "DEGREES" DESC LIMIT 1) AS MAX_Q
                                        CROSS JOIN
                                                (SELECT TIME, DEGREES
                                                 FROM "{schema}"."{view}"
                                                 WHERE "COSTCENTER" = ? AND "DATE_D" = ? AND "BLOCK" = ?
                                                     AND "DEGREES" IS NOT NULL
                                                 ORDER BY TIME DESC LIMIT 1) AS CURRENT_Q
                                        CROSS JOIN
                                                (SELECT SUM(DEGREES) AS TOTAL_DEGREES, COUNT(*) AS CNT
                                                 FROM "{schema}"."{view}"
                                                 WHERE "COSTCENTER" = ? AND "DATE_D" = ? AND "BLOCK" = ?
                                                     AND "DEGREES" IS NOT NULL) AS TOTAL_Q
                                '''

                                params = (
                                        costcenter, date, block,
                                        costcenter, date, block,
                                        costcenter, date, block,
                                        costcenter, date, block,
                                )
            cursor.execute(kpi_query, params)
            row = cursor.fetchone()

            def safe_str(val):
                if val is None:
                    return None
                if hasattr(val, 'isoformat'):
                    return val.isoformat()
                return str(val)

            kpi_data = {
                "current": {"value": float(row[4]) if row and row[4] is not None else None, "time": safe_str(row[5]) if row else None},
                "min":     {"value": float(row[0]) if row and row[0] is not None else None, "time": safe_str(row[1]) if row else None},
                "max":     {"value": float(row[2]) if row and row[2] is not None else None, "time": safe_str(row[3]) if row else None},
                "avg":     {"value": float(row[6]) if row and row[6] is not None else None},
                "minmax":  {"value": float(row[7]) if row and row[7] is not None else None},
            }

            # 2. Datos horarios para la gráfica
            if normalized_sitename:
                hourly_query = f'''
                    SELECT
                        HOUR(T1."HOUR") AS "HOUR",
                        IFNULL(AVG(T1."DEGREES"), 0) AS "ACTUAL"
                    FROM "{schema}"."{view}" T1
                    WHERE T1."COSTCENTER" = ?
                      AND T1."DATE_D" = ?
                      AND T1."BLOCK" = ?
                      AND T1."NAME" = ?
                      AND T1."DEGREES" IS NOT NULL
                    GROUP BY HOUR(T1."HOUR")
                    ORDER BY "HOUR" ASC
                '''
                cursor.execute(hourly_query, (costcenter, date, block, normalized_sitename))
            else:
                hourly_query = f'''
                    SELECT
                        HOUR(T1."HOUR") AS "HOUR",
                        IFNULL(AVG(T1."DEGREES"), 0) AS "ACTUAL"
                    FROM "{schema}"."{view}" T1
                    WHERE T1."COSTCENTER" = ?
                      AND T1."DATE_D" = ?
                      AND T1."BLOCK" = ?
                      AND T1."DEGREES" IS NOT NULL
                    GROUP BY HOUR(T1."HOUR")
                    ORDER BY "HOUR" ASC
                '''
                cursor.execute(hourly_query, (costcenter, date, block))
            hourly_raw = cursor.fetchall()

            hourly_data = []
            if hourly_raw:
                for h_row in hourly_raw:
                    hourly_data.append({
                        "hour": f"{int(h_row[0]):02d}:00",
                        "actual": float(h_row[1]) if h_row[1] is not None else 0
                    })

            return {"site_name": resolved_site_name, "kpi": kpi_data, "hourly": hourly_data}

        except Exception as e:
            current_app.logger.error(f"Error en TemperaturaModel.get_temperatura_kpis: {e}")
            return None
        finally:
            if cursor:
                cursor.close()
            if hana:
                hana.close()

    @staticmethod
    def get_sites():
        """
        Obtiene la lista de sitios únicamente con datos en la vista de Temperatura.
        Retorna lista de dicts con 'id' (COSTCENTER) y 'name' (nombre del sitio).
        
        Nota: La vista de Temperatura puede usar un nombre diferente para el campo de sitio.
        Se intenta con SITE_NAME primero, y si falla, se usa solo COSTCENTER.
        """
        hana = None
        cursor = None
        try:
            hana = get_db_connection()
            if not hana:
                return None
            
            schema = os.getenv("HANA_SCHEMA")
            view = os.getenv("HANA_VIEW_TEMPERATURE")
            
            cursor = hana.cursor()
            
            # Intento 1: Usar NAME (columna disponible en CV_TEMPERATURE_CUBE)
            try:
                query = (
                    f'SELECT DISTINCT "COSTCENTER", "NAME" '
                    f'FROM "{schema}"."{view}" '
                    f'WHERE "NAME" IS NOT NULL AND "COSTCENTER" IS NOT NULL '
                    f'ORDER BY "NAME" ASC'
                )
                cursor.execute(query)
                sites = [{"id": row[0], "name": row[1]} for row in cursor.fetchall()]
                if sites:
                    return sites
            except:
                pass  # Si SITE_NAME no existe, intentar otra estrategia
            
            # Intento 2: Si SITE_NAME no existe, retornar solo COSTCENTER
            # (fallback defensivo para que no se rompa la app)
            query = (
                f'SELECT DISTINCT "COSTCENTER" '
                f'FROM "{schema}"."{view}" '
                f'WHERE "COSTCENTER" IS NOT NULL '
                f'ORDER BY "COSTCENTER" ASC'
            )
            cursor.execute(query)
            sites = [{"id": row[0], "name": f"Sitio {row[0]}"} for row in cursor.fetchall()]
            return sites if sites else None
            
        except Exception as e:
            current_app.logger.error(f"Error en TemperaturaModel.get_sites: {e}")
            return None
        finally:
            if cursor:
                cursor.close()
            if hana:
                hana.close()
