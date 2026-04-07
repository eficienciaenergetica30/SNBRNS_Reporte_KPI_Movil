import datetime
from flask import Blueprint, jsonify, request
from app.models.water_model import get_water_data, get_sites

api_water_bp = Blueprint('api_water', __name__)

@api_water_bp.route('/water/today')
def water_today():
    costcenter = request.args.get('costcenter')
    date = request.args.get('date', datetime.date.today().isoformat())
    if not costcenter:
        return jsonify({"error": "Falta parametro costcenter"}), 400
        
    data = get_water_data(costcenter, date)
    return jsonify(data) if data else (jsonify({"error": "Error interno"}), 500)

@api_water_bp.route('/sites/water')
def get_water_sites():
    """
    Devuelve el catálogo de sitios que tienen datos en Agua
    """
    data = get_sites()
    if data is None:
        return jsonify({"error": "Error al obtener sitios de agua"}), 500
    return jsonify(data)
