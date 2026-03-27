import datetime
from flask import Blueprint, jsonify, request
from app.models.energy_model import get_energy_data

api_energy_bp = Blueprint('api_energy', __name__)

@api_energy_bp.route('/energy/today')
def energy_today():
    costcenter = request.args.get('costcenter')
    date = request.args.get('date', datetime.date.today().isoformat())
    if not costcenter:
        return jsonify({"error": "Falta parametro costcenter"}), 400
        
    data = get_energy_data(costcenter, date)
    return jsonify(data) if data else (jsonify({"error": "Error interno"}), 500)
