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


def derive_db_user_from_email(email):
    """
    Deriva usuario HANA desde correo:
    - tomar local-part (antes de @)
    - maximo 20 caracteres
    - remover puntos, guiones bajos y comas
    - convertir a mayusculas
    """
    if not isinstance(email, str) or '@' not in email:
        return ''

    local_part = email.split('@')[0]
    return local_part[:20].replace('.', '').replace('_', '').replace(',', '').upper()


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


def get_request_derived_user():
    return derive_db_user_from_email(_extract_email_from_request())


def _resolve_effective_user(base_user, requested_user=''):
    mode = _get_db_auth_mode()

    if mode == 'technical':
        return base_user, mode

    candidate = (requested_user or get_request_derived_user() or '').strip().upper()
    if candidate:
        return candidate, mode

    if mode == 'auto':
        return base_user, mode

    return None, mode


def get_db_connection(db_user=''):
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

    effective_user, auth_mode = _resolve_effective_user(creds["user"], db_user)
    if not effective_user:
        print("Error conectando a HANA: modo 'derived' activo y no se pudo derivar usuario desde identidad")
        return None

    try:
        port = int(creds["port"])
        conn = dbapi.connect(
            address=creds["host"],
            port=port,
            user=effective_user,
            password=creds["password"],
            encrypt=True, # type: ignore
            sslValidateCertificate=False, # type: ignore
        )
        return conn
    except Exception as e:
        print(f"Error conectando a HANA ({creds['source']}, mode={auth_mode}, user={effective_user}): {e}")
        return None


def test_db_connection(db_user=''):
    """Prueba la conexion y retorna (bool, mensaje)."""
    conn = get_db_connection(db_user=db_user)
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


def get_user_role_from_hana(email: str, db_user: str) -> str:
    """
    Consulta CV_USERROLES para obtener el rol del usuario.
    Retorna 'ADMIN' o 'TECNICO'. Ante cualquier fallo retorna 'TECNICO'.
    Prioridad: si el usuario tiene ambos roles, ADMIN gana.
    """
    schema = os.getenv('HANA_SCHEMA', '')
    view_short = os.getenv(
        'HANA_VIEW_USERROLES',
        'globalhitss.ee.models.CalculationViews::CV_USERROLES'
    )
    if not schema:
        print("get_user_role_from_hana: HANA_SCHEMA no configurado, fallback TECNICO")
        return 'TECNICO'

    normalized_email = (email or '').strip().lower()
    normalized_user = (db_user or '').strip().upper()

    # Conexion con usuario tecnico (no derivado) para leer la vista de roles
    conn = get_db_connection(db_user='')
    if conn is None:
        print("get_user_role_from_hana: sin conexion, fallback TECNICO")
        return 'TECNICO'

    try:
        view_full = f'"{schema}"."{view_short}"'
        sql = f'SELECT "ROL_V" FROM {view_full} WHERE "EMAIL" = ? AND "USER" = ?'
        cursor = conn.cursor()
        cursor.execute(sql, (normalized_email, normalized_user))
        rows = cursor.fetchall()
        cursor.close()
        conn.close()

        roles = {str(r[0]).strip().upper() for r in rows if r and r[0]}
        if 'ADMIN' in roles:
            return 'ADMIN'
        if 'TECNICO' in roles:
            return 'TECNICO'
        return 'TECNICO'  # sin registro => restriccion por defecto
    except Exception as e:
        print(f"get_user_role_from_hana: error consultando rol ({e}), fallback TECNICO")
        try:
            conn.close()
        except Exception:
            pass
        return 'TECNICO'
