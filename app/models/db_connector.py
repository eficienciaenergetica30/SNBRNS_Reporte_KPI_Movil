import json
import os
import base64

from cfenv import AppEnv
from dotenv import load_dotenv
from flask import has_request_context, request
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


def _get_connection_security_settings():
    encrypt = (os.getenv("HANA_ENCRYPT") or "true").strip().lower() == 'true'
    ssl_validate = (os.getenv("HANA_SSL_VALIDATE") or "false").strip().lower() == 'true'
    return encrypt, ssl_validate


def _decode_jwt_payload(token):
    """Decodifica payload JWT sin validar firma. Retorna dict o None."""
    try:
        parts = token.split('.')
        if len(parts) < 2:
            return None

        payload_b64 = parts[1]
        padding = '=' * (-len(payload_b64) % 4)
        payload_bytes = base64.urlsafe_b64decode(payload_b64 + padding)
        payload = json.loads(payload_bytes.decode('utf-8'))
        return payload if isinstance(payload, dict) else None
    except Exception:
        return None


def _get_db_auth_mode():
    mode = (os.getenv("DB_AUTH_MODE") or "technical").strip().lower()
    return mode if mode in {"technical", "derived", "auto"} else "technical"


def _extract_email_from_request():
    if not has_request_context():
        return ''

    email = (request.headers.get('x-sap-user-email') or '').strip()
    if email:
        return email

    auth_header = request.headers.get('Authorization', '')
    if auth_header.lower().startswith('bearer '):
        token = auth_header[7:].strip()
        payload = _decode_jwt_payload(token)
        if payload:
            return str(payload.get('email') or payload.get('mail') or '').strip()

    return ''
def _resolve_effective_user(base_user, requested_user=''):
    mode = _get_db_auth_mode()

    if mode == 'technical':
        return base_user, mode

    candidate = (requested_user or '').strip().upper()
    if candidate:
        return candidate, mode

    if mode == 'auto':
        return base_user, mode

    return None, mode


def get_db_connection(db_user='', db_password=''):
    """
    Establece y retorna una conexion a SAP HANA.

    Prioridad de resolucion:
    1) Variables locales en .env (HANA_HOST/HANA_PORT/HANA_UID/HANA_PWD)
    2) Credenciales de Cloud Foundry via cfenv
    3) Credenciales directas desde VCAP_SERVICES
    
    Si db_user y db_password se proporcionan, los usa directamente (para conexión de usuario final).
    Si no, usa credenciales técnicas (HANA_UID + HANA_PWD).
    """
    creds = _resolve_hana_credentials()
    if not creds:
        print("Error conectando a HANA: no se encontraron credenciales en .env ni en Cloud Foundry")
        return None

    # Si viene db_user + db_password, usar esos directamente (conexión de usuario final)
    if db_user and db_password:
        effective_user = db_user.strip().upper()
        effective_password = db_password.strip()
        auth_mode = 'final-user'
    else:
        # Si no, usar credenciales técnicas
        effective_user = creds["user"]
        effective_password = creds["password"]
        auth_mode = 'technical'

    try:
        port = int(creds["port"])
        encrypt, ssl_validate = _get_connection_security_settings()
        effective_password = db_password or creds["password"]
        print(f"[DEBUG get_db_connection] Intentando conexión con: host={creds['host']}, port={port}, user={effective_user}, encrypt={encrypt}, ssl_validate={ssl_validate}")
        conn = dbapi.connect(
            address=creds["host"],
            port=port,
            user=effective_user,
            password=effective_password,
            encrypt=encrypt, # type: ignore
            sslValidateCertificate=ssl_validate, # type: ignore
        )
        print(f"[DEBUG get_db_connection] Conexión exitosa con user: {effective_user}")
        return conn
    except Exception as e:
        print(f"[ERROR get_db_connection] Error conectando a HANA ({creds['source']}, mode={auth_mode}, user={effective_user}): {type(e).__name__}: {e}")
        return None


def test_db_connection(db_user='', db_password=''):
    """Prueba la conexion y retorna (bool, mensaje)."""
    print(f"[DEBUG test_db_connection] Testing connection with db_user={db_user}, db_password={'*' * 10 if db_password else 'None'}")
    conn = get_db_connection(db_user=db_user, db_password=db_password)
    if conn is None:
        print(f"[DEBUG test_db_connection] get_db_connection devolvió None")
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


def query_user_roles_table(email: str):
    """
    Consulta la tabla de roles por correo usando credenciales tecnicas.
    Retorna un dict con USER, ROL, EMAIL, DELETIONREQUEST o None si no existe.
    """
    schema = os.getenv('HANA_SCHEMA', '').strip()
    normalized_email = (email or '').strip().lower()

    if not schema or not normalized_email:
        return None

    conn = get_db_connection(db_user='')
    if conn is None:
        print("query_user_roles_table: sin conexion tecnica")
        return None

    try:
        sql = (
            f'SELECT "USER", ROL, "FILTER", DELETIONREQUEST, EMAIL '
            f'FROM "{schema}".GLOBALHITSS_EE_USERROLES '
            f'WHERE EMAIL = ?'
        )
        print(f"[DEBUG query_user_roles_table] Schema: {schema}, Email to search: {normalized_email}")
        print(f"[DEBUG query_user_roles_table] SQL: {sql}")
        cursor = conn.cursor()
        cursor.execute(sql, (normalized_email,))
        row = cursor.fetchone()
        print(f"[DEBUG query_user_roles_table] Row fetched: {row}")
        cursor.close()
        conn.close()

        if not row:
            return None

        deletion_request = row[3]
        try:
            deletion_request = int(deletion_request)
        except (TypeError, ValueError):
            deletion_request = 0

        return {
            'user': str(row[0] or '').strip().upper(),
            'role': str(row[1] or '').strip().upper(),
            'filter': row[2],
            'deletionRequest': deletion_request,
            'email': str(row[4] or '').strip().lower(),
        }
    except Exception as e:
        print(f"[ERROR query_user_roles_table] Error consultando tabla de roles: {type(e).__name__}: {e}")
        try:
            conn.close()
        except Exception:
            pass
        return None


def get_user_role_from_hana(email: str) -> str:
    """
    Consulta la tabla de roles para obtener el rol del usuario.
    Retorna ADMIN, SITIO o GERENCIA. Ante cualquier fallo retorna SITIO.
    """
    user_record = query_user_roles_table(email)
    if not user_record:
        return 'SITIO'

    role = str(user_record.get('role') or '').strip().upper()
    if role in {'ADMIN', 'SITIO', 'GERENCIA'}:
        return role
    return 'SITIO'
