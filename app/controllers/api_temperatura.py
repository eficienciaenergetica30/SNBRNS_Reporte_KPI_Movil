from flask import Blueprint, jsonify, request, current_app
from ..models.temperatura_model import TemperaturaModel

api_temperatura_bp = Blueprint('api_temperatura_bp', __name__)

@api_temperatura_bp.route('/temperatura', methods=['GET'])
def get_temperatura_data():
    costcenter = request.args.get('costcenter')
    date = request.args.get('date')
    block = request.args.get('block', 1, type=int)

    if not costcenter or not date:
        return jsonify({"error": "Parámetros 'costcenter' y 'date' son requeridos."}), 400

    try:
        data = TemperaturaModel.get_temperatura_kpis(costcenter, date, block)
        if data is not None:
            return jsonify(data)
        else:
            return jsonify({"error": "No se pudieron obtener los datos de temperatura."}), 500
    except Exception as e:
        current_app.logger.error(f"Error en el endpoint /api/temperatura: {e}")
        return jsonify({"error": "Ocurrió un error interno en el servidor."}), 500

@api_temperatura_bp.route('/sites/temperatura', methods=['GET'])
def get_temperatura_sites():
    """
    Devuelve el catálogo de sitios que tienen datos en Temperatura
    """
    try:
        data = TemperaturaModel.get_sites()
        if data is None:
            return jsonify({"error": "Error al obtener sitios de temperatura"}), 500
        return jsonify(data)
    except Exception as e:
        current_app.logger.error(f"Error en el endpoint /api/sites/temperatura: {e}")
        return jsonify({"error": "Ocurrió un error interno en el servidor."}), 500
