import os
from hdbcli import dbapi
from cfenv import AppEnv
from dotenv import load_dotenv

load_dotenv()

def get_db_connection():
    """
    Model: establece y retorna una conexión a SAP HANA Cloud.
    Detecta automáticamente si corre en BTP o en local (.env).
    """
    env = AppEnv()
    hana_service = env.get_service(label='hana-cloud')

    if hana_service:
        creds = hana_service.credentials
        host = creds.get('host')
        port = creds.get('port')
        user = creds.get('user')
        password = creds.get('password')
    else:
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
