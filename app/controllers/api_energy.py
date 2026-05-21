import datetime
from flask import Blueprint, jsonify, request
from app.models.energy_model import get_energy_data, get_sites

api_energy_bp = Blueprint('api_energy', __name__)

@api_energy_bp.route('/energy/today')
def energy_today():
    costcenter = request.args.get('costcenter')
    date = request.args.get('date', datetime.date.today().isoformat())
    sitename = request.args.get('sitename', '').strip()
    if not costcenter:
        return jsonify({"error": "Falta parametro costcenter"}), 400
        
    data = get_energy_data(costcenter, date, sitename)
    if data is None:
        return jsonify({"error": "Error interno"}), 500

    return jsonify(data)

@api_energy_bp.route('/sites/energy')
def get_energy_sites():
    """
    Devuelve el catálogo de sitios que tienen datos en Energía
    """
    data = get_sites()
    if data is None:
        return jsonify({"error": "Error al obtener sitios de energía"}), 500
    return jsonify(data)
