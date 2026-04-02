import json
import os

from cfenv import AppEnv
from dotenv import load_dotenv
from hdbcli import dbapi

load_dotenv()


def _local_env_credentials():
    host = os.getenv("HANA_HOST")
    port = os.getenv("HANA_PORT")
    user = os.getenv("HANA_UID") or os.getenv("HANA_USER")
    password = os.getenv("HANA_PWD") or os.getenv("HANA_PASSWORD")

    if all([host, port, user, password]):
        return {
            "host": host,
            "port": port,
            "user": user,
            "password": password,
            "source": "local-env",
        }
    return None


def _normalize_cf_creds(creds):
    if not creds:
        return None

    host = creds.get("host") or creds.get("hostname")
    port = creds.get("port")
    user = creds.get("user") or creds.get("username")
    password = creds.get("password")

    if all([host, port, user, password]):
        return {
            "host": host,
            "port": port,
            "user": user,
            "password": password,
            "source": "cloud-foundry",
        }
    return None


def _cfenv_credentials():
    try:
        env = AppEnv()
    except Exception:
        return None

    for label in ["hana", "hana-cloud", "hanatrial", "service-manager"]:
        try:
            service = env.get_service(label=label)
            if service:
                normalized = _normalize_cf_creds(service.credentials)
                if normalized:
                    return normalized
        except Exception:
            continue

    return None


def _vcap_services_credentials():
    raw_vcap = os.getenv("VCAP_SERVICES")
    if not raw_vcap:
        return None

    try:
        data = json.loads(raw_vcap)
    except json.JSONDecodeError:
        return None

    for _, services in data.items():
        if not isinstance(services, list):
            continue
        for service in services:
            normalized = _normalize_cf_creds(service.get("credentials", {}))
            if normalized:
                return normalized

    return None


def _resolve_hana_credentials():
    local = _local_env_credentials()
    if local:
        return local

    cfenv_creds = _cfenv_credentials()
    if cfenv_creds:
        return cfenv_creds

    return _vcap_services_credentials()


def get_db_connection():
    """
    Establece y retorna una conexion a SAP HANA.

    Prioridad de resolucion:
    1) Variables locales en .env (HANA_HOST/HANA_PORT/HANA_UID/HANA_PWD)
    2) Credenciales de Cloud Foundry via cfenv
    3) Credenciales directas desde VCAP_SERVICES
    """
    creds = _resolve_hana_credentials()
    if not creds:
        print("Error conectando a HANA: no se encontraron credenciales en .env ni en Cloud Foundry")
        return None

    try:
        port = int(creds["port"])
        conn = dbapi.connect(
            address=creds["host"],
            port=port,
            user=creds["user"],
            password=creds["password"],
            encrypt=True, # type: ignore
            sslValidateCertificate=False, # type: ignore
        )
        return conn
    except Exception as e:
        print(f"Error conectando a HANA ({creds['source']}): {e}")
        return None


def test_db_connection():
    """Prueba la conexion y retorna (bool, mensaje)."""
    conn = get_db_connection()
    if conn is None:
        return False, "No se pudo establecer conexion."

    try:
        cursor = conn.cursor()
        cursor.execute("SELECT 1 FROM DUMMY")
        result = cursor.fetchone()
        cursor.close()
        conn.close()

        if result and result[0] == 1:
            return True, "Conexion exitosa a SAP HANA Cloud."
        return False, "Fallo query DUMMY."
    except Exception as e:
        return False, f"Error BDD: {str(e)}"
