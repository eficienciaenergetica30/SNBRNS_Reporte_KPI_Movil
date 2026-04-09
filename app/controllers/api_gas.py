from flask import Blueprint, jsonify, request, current_app
from ..models.gas_model import GasModel

api_gas_bp = Blueprint('api_gas_bp', __name__)

@api_gas_bp.route('/gas', methods=['GET'])
def get_gas_data():
    costcenter = request.args.get('costcenter')
    date = request.args.get('date')

    if not costcenter or not date:
        return jsonify({"error": "Parámetros 'costcenter' y 'date' son requeridos."}), 400

    try:
        data = GasModel.get_gas_kpis(costcenter, date)
        if data is None:
            return jsonify({"error": "No se pudieron obtener los datos de gas."}), 500

        return jsonify(data)
    except Exception as e:
        current_app.logger.error(f"Error en el endpoint /api/gas: {e}")
        return jsonify({"error": "Ocurrió un error interno en el servidor."}), 500

@api_gas_bp.route('/sites/gas', methods=['GET'])
def get_gas_sites():
    """
    Devuelve el catálogo de sitios que tienen datos en Gas
    """
    try:
        data = GasModel.get_sites()
        if data is None:
            return jsonify({"error": "Error al obtener sitios de gas"}), 500
        return jsonify(data)
    except Exception as e:
        current_app.logger.error(f"Error en el endpoint /api/sites/gas: {e}")
        return jsonify({"error": "Ocurrió un error interno en el servidor."}), 500
