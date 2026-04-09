import base64
import json
import os

from flask import Blueprint, jsonify, request
from app.models.core_model import get_sites, get_max_date
from app.models.db_connector import query_user_roles_table, test_db_connection, get_user_role_from_hana

api_core_bp = Blueprint('api_core', __name__)


def _decode_jwt_payload(token):
    """Decodifica el payload del JWT sin validar firma. Retorna dict o None."""
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


def _build_user_context(authenticated, source, user_id='', full_name='', email='', db_user='', warnings=None):
    label = full_name or user_id or 'Usuario no identificado'
    return {
        "authenticated": authenticated,
        "source": source,
        "id": user_id,
        "fullName": full_name,
        "email": email,
        "dbUser": db_user,
        "label": label,
        "warnings": warnings or []
    }


def _resolve_user_context():
    """Obtiene contexto de usuario con fallback seguro usando el correo como identidad principal."""
    # 1) Headers típicos de Launchpad / Approuter
    user_id = (request.headers.get('x-sap-user') or '').strip()
    full_name = (request.headers.get('x-sap-user-name') or '').strip()
    email = (request.headers.get('x-sap-user-email') or '').strip()

    if user_id or full_name or email:
        return _build_user_context(
            True,
            'launchpad',
            user_id,
            full_name,
            email,
        )

    # 2) Bearer token JWT
    auth_header = request.headers.get('Authorization', '')
    if auth_header.lower().startswith('bearer '):
        token = auth_header[7:].strip()
        payload = _decode_jwt_payload(token)
        if payload:
            token_user_id = str(payload.get('sub') or payload.get('user_name') or payload.get('user_id') or '').strip()
            token_email = str(payload.get('email') or payload.get('mail') or '').strip()
            token_full_name = str(payload.get('name') or '').strip()

            if not token_full_name:
                given_name = str(payload.get('given_name') or '').strip()
                family_name = str(payload.get('family_name') or '').strip()
                token_full_name = f"{given_name} {family_name}".strip()

            if token_user_id or token_full_name or token_email:
                return _build_user_context(
                    True,
                    'token',
                    token_user_id,
                    token_full_name,
                    token_email,
                )

    # 3) Fallback local para desarrollo
    local_name = (os.getenv('APP_LOCAL_USER_NAME') or '').strip()
    local_email = (os.getenv('APP_LOCAL_USER_EMAIL') or '').strip()
    local_id = (os.getenv('APP_LOCAL_USER_ID') or '').strip()

    if local_id or local_name or local_email:
        return _build_user_context(
            False,
            'local',
            local_id,
            local_name,
            local_email,
        )

    # 4) Usuario anónimo
    return _build_user_context(
        False,
        'anonymous',
        warnings=["No user identity found."],
    )

@api_core_bp.route('/max-date')
def max_date():
    """Devuelve la fecha más reciente con datos registrados en HANA"""
    date_str = get_max_date()
    if date_str:
        return jsonify({"max_date": date_str})
    return jsonify({"error": "No data found"}), 404

@api_core_bp.route('/sites')
def sites():
    """
    [DEPRECATED - FALLBACK GLOBAL]
    Devuelve el catálogo GLOBAL de sitios (Name y CostCenter).
    
    NOTA: Los clientes deben usar endpoints específicos por módulo:
      - /api/sites/energy (para módulo Energía)
      - /api/sites/water (para módulo Agua)
      - /api/sites/gas (para módulo Gas)
      - /api/sites/temperatura (para módulo Temperatura)
    
    Este endpoint se mantiene como fallback únicamente para compatibilidad
    y graceful degradation en caso de que los endpoints específicos fallen.
    """
    data = get_sites()
    if data is None:
        return jsonify({"error": "Error DB"}), 500
    return jsonify(data)

@api_core_bp.route('/debug-db')
def debug_db():
    success, message = test_db_connection()
    return jsonify({"status": "success" if success else "error", "message": message})


@api_core_bp.route('/user-context')
def user_context():
    """
    Devuelve contexto de usuario sin romper la app.
    Prioridad: launchpad headers -> bearer token -> env local -> anonymous.
    Siempre retorna HTTP 200.
    """
    try:
        return jsonify(_resolve_user_context()), 200
    except Exception as e:
        return jsonify(_build_user_context(False, 'anonymous', warnings=[f"user-context error: {e}"])), 200


@api_core_bp.route('/bootstrap-context')
def bootstrap_context():
    """
    Preflight para UI:
    - Resuelve identidad
    - Busca usuario/rol en tabla por correo con credenciales tecnicas
    - Valida conexion HANA final con USER de tabla + HANA_CLIENT_PWD
    Siempre retorna HTTP 200 con canProceed/dbReady.
    """
    try:
        user_ctx = _resolve_user_context()
        db_auth_mode = 'table-email'
        email = (user_ctx.get('email') or '').strip().lower()
        print(f"[DEBUG bootstrap_context] Email recovered from user context: {email}")

        if not email:
            return jsonify({
                "userContext": user_ctx,
                "dbAuthMode": db_auth_mode,
                "dbReady": False,
                "canProceed": False,
                "message": "No se pudo recuperar el correo del usuario autenticado.",
            }), 200

        user_record = query_user_roles_table(email)
        print(f"[DEBUG bootstrap_context] query_user_roles_table result: {user_record}")
        if not user_record:
            return jsonify({
                "userContext": user_ctx,
                "dbAuthMode": db_auth_mode,
                "dbReady": False,
                "canProceed": False,
                "message": "Usuario no autorizado. El correo no existe en la tabla de roles.",
            }), 200

        if int(user_record.get('deletionRequest') or 0) == 1:
            return jsonify({
                "userContext": {
                    **user_ctx,
                    "dbUser": user_record.get('user') or '',
                },
                "dbAuthMode": db_auth_mode,
                "dbReady": False,
                "canProceed": False,
                "message": "Usuario desactivado.",
                "businessRole": str(user_record.get('role') or 'SITIO').strip().upper(),
            }), 200

        hana_db_user = str(user_record.get('user') or '').strip().upper()
        print(f"[DEBUG bootstrap_context] HANA DB user from table: {hana_db_user}")
        if not hana_db_user:
            return jsonify({
                "userContext": user_ctx,
                "dbAuthMode": db_auth_mode,
                "dbReady": False,
                "canProceed": False,
                "message": "La tabla de roles no devolvio un USER valido para HANA.",
            }), 200

        client_password = (os.getenv('HANA_CLIENT_PWD') or '').strip()
        print(f"[DEBUG bootstrap_context] HANA_CLIENT_PWD available: {bool(client_password)}")
        if not client_password:
            return jsonify({
                "userContext": {
                    **user_ctx,
                    "dbUser": hana_db_user,
                },
                "dbAuthMode": db_auth_mode,
                "dbReady": False,
                "canProceed": False,
                "message": "No se encontro HANA_CLIENT_PWD en la configuracion.",
                "businessRole": str(user_record.get('role') or 'SITIO').strip().upper(),
            }), 200

        success, message = test_db_connection(db_user=hana_db_user, db_password=client_password)
        print(f"[DEBUG bootstrap_context] test_db_connection result: success={success}, message={message}")

        business_role = get_user_role_from_hana(email)
        resolved_user_ctx = {
            **user_ctx,
            "dbUser": hana_db_user,
        }

        return jsonify({
            "userContext": resolved_user_ctx,
            "dbAuthMode": db_auth_mode,
            "dbReady": success,
            "canProceed": success,
            "message": message,
            "businessRole": business_role,
        }), 200

    except Exception as e:
        return jsonify({
            "userContext": _build_user_context(False, 'anonymous', warnings=[f"bootstrap error: {e}"]),
            "dbAuthMode": 'table-email',
            "dbReady": False,
            "canProceed": False,
            "message": f"bootstrap-context error: {e}",
            "businessRole": "SITIO",
        }), 200
