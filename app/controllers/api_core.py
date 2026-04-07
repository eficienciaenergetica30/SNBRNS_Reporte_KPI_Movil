import base64
import json
import os

from flask import Blueprint, jsonify, request
from app.models.core_model import get_sites, get_max_date
from app.models.db_connector import test_db_connection

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


def _build_user_context(authenticated, source, user_id='', full_name='', email='', warnings=None):
    label = full_name or user_id or 'Usuario no identificado'
    return {
        "authenticated": authenticated,
        "source": source,
        "id": user_id,
        "fullName": full_name,
        "email": email,
        "label": label,
        "warnings": warnings or []
    }

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
        # 1) Headers típicos de Launchpad / Approuter
        user_id = (request.headers.get('x-sap-user') or '').strip()
        full_name = (request.headers.get('x-sap-user-name') or '').strip()
        email = (request.headers.get('x-sap-user-email') or '').strip()

        if user_id or full_name or email:
            return jsonify(_build_user_context(True, 'launchpad', user_id, full_name, email)), 200

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
                    return jsonify(_build_user_context(True, 'token', token_user_id, token_full_name, token_email)), 200

        # 3) Fallback local para desarrollo
        local_name = (os.getenv('APP_LOCAL_USER_NAME') or '').strip()
        local_email = (os.getenv('APP_LOCAL_USER_EMAIL') or '').strip()
        local_id = (os.getenv('APP_LOCAL_USER_ID') or '').strip()

        if local_id or local_name or local_email:
            return jsonify(_build_user_context(False, 'local', local_id, local_name, local_email)), 200

        # 4) Usuario anónimo
        return jsonify(_build_user_context(False, 'anonymous', warnings=["No user identity found."])), 200

    except Exception as e:
        return jsonify(_build_user_context(False, 'anonymous', warnings=[f"user-context error: {e}"])), 200
