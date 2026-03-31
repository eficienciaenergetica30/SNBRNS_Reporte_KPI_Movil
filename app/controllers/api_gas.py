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
        if data is not None:
            return jsonify(data)
        else:
            # Asumiendo que el modelo devuelve None en caso de error de DB
            return jsonify({"error": "No se pudieron obtener los datos de gas."}), 500
    except Exception as e:
        current_app.logger.error(f"Error en el endpoint /api/gas: {e}")
        return jsonify({"error": "Ocurrió un error interno en el servidor."}), 500
