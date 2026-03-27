"""
Entrypoint principal de la aplicación — Arquitectura MVC.

Este archivo sólo inicia el servidor. Toda la lógica está distribuida en:
  • app/models/      → Capa Modelo  (acceso a datos)
  • app/controllers/ → Capa Control (rutas / Blueprints)
  • app/views/       → Capa Vista   (templates HTML)
"""
import os
from app import create_app
from app.models.db_connector import test_db_connection

app = create_app()

if __name__ == '__main__':
    # 🔍 Verificación inmediata de conexión a SAP HANA al iniciar
    print("\n" + "=" * 40)
    print("🔎 Verificando conexión a SAP HANA...")
    status, msg = test_db_connection()
    print(msg)
    print("=" * 40 + "\n")

    port = int(os.environ.get('PORT', 4001))
    app.run(host='0.0.0.0', port=port, debug=True)