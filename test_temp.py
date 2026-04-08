import os
from dotenv import load_dotenv
load_dotenv()

from app.models.db_connector import get_db_connection

conn = get_db_connection()
if conn:
    cursor = conn.cursor()
    schema = os.getenv("HANA_SCHEMA")
    view = os.getenv("HANA_VIEW_TEMPERATURE")
    print(f"Consultando {view}...")
    
    query = f'SELECT * FROM "{schema}"."{view}" LIMIT 1'
    try:
        cursor.execute(query)
        cols = [desc[0] for desc in cursor.description]
        print(f"Campos: {cols}")
    except Exception as e:
        print(f"Error: {e}")
    
    cursor.close()
    conn.close()
