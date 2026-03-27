import datetime
from flask import Blueprint, jsonify, request
from app.models.hana_model import get_sites, get_dashboard_data, test_db_connection, get_max_date

api_bp = Blueprint('api', __name__)

@api_bp.route('/max-date')
def max_date():
    """Devuelve la fecha más reciente con datos registrados en HANA"""
    date_str = get_max_date()
    if date_str:
        return jsonify({"max_date": date_str})
    return jsonify({"error": "No data found"}), 404

@api_bp.route('/sites')
def sites():
    """Devuelve el catálogo de sitios (Name y CostCenter)"""
    data = get_sites()
    if data is None:
        return jsonify({"error": "Error DB"}), 500
    return jsonify(data)

@api_bp.route('/energy/today')
def energy_today():
    costcenter = request.args.get('costcenter')
    date = request.args.get('date', datetime.date.today().isoformat())
    if not costcenter:
        return jsonify({"error": "Falta parametro costcenter"}), 400
        
    data = get_dashboard_data('energy', costcenter, date)
    return jsonify(data) if data else (jsonify({"error": "Error interno"}), 500)

@api_bp.route('/water/today')
def water_today():
    costcenter = request.args.get('costcenter')
    date = request.args.get('date', datetime.date.today().isoformat())
    if not costcenter:
        return jsonify({"error": "Falta parametro costcenter"}), 400
        
    data = get_dashboard_data('water', costcenter, date)
    return jsonify(data) if data else (jsonify({"error": "Error interno"}), 500)

@api_bp.route('/gas/today')
def gas_today():
    costcenter = request.args.get('costcenter')
    date = request.args.get('date', datetime.date.today().isoformat())
    if not costcenter:
        return jsonify({"error": "Falta parametro costcenter"}), 400
        
    data = get_dashboard_data('gas', costcenter, date)
    return jsonify(data) if data else (jsonify({"error": "Error interno"}), 500)

@api_bp.route('/temperature/today')
def temperature_today():
    costcenter = request.args.get('costcenter')
    date = request.args.get('date', datetime.date.today().isoformat())
    block = request.args.get('block', 'BLOCK A')
    if not costcenter:
        return jsonify({"error": "Falta parametro costcenter"}), 400
        
    data = get_dashboard_data('temperature', costcenter, date, block)
    return jsonify(data) if data else (jsonify({"error": "Error interno"}), 500)

@api_bp.route('/debug-db')
def debug_db():
    success, message = test_db_connection()
    return jsonify({"status": "success" if success else "error", "message": message})
