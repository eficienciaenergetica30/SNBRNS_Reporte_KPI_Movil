from flask import Blueprint, jsonify
from app.models.core_model import get_sites, get_max_date
from app.models.db_connector import test_db_connection

api_core_bp = Blueprint('api_core', __name__)

@api_core_bp.route('/max-date')
def max_date():
    """Devuelve la fecha más reciente con datos registrados en HANA"""
    date_str = get_max_date()
    if date_str:
        return jsonify({"max_date": date_str})
    return jsonify({"error": "No data found"}), 404

@api_core_bp.route('/sites')
def sites():
    """Devuelve el catálogo de sitios (Name y CostCenter)"""
    data = get_sites()
    if data is None:
        return jsonify({"error": "Error DB"}), 500
    return jsonify(data)

@api_core_bp.route('/debug-db')
def debug_db():
    success, message = test_db_connection()
    return jsonify({"status": "success" if success else "error", "message": message})
