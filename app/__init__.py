import os
from flask import Flask


def create_app():
    """Application factory — crea y configura la instancia de Flask."""
    app = Flask(
        __name__,
        template_folder='views',   # La capa View vive en app/views/
        static_folder='static'     # Estáticos en app/static/
    )

    # ── Registrar Blueprints (Controllers) ───────────────────────────────────
    from app.controllers.main_controller import main_bp
    from app.controllers.api_core import api_core_bp
    from app.controllers.api_energy import api_energy_bp
    from app.controllers.api_water import api_water_bp

    app.register_blueprint(main_bp)
    app.register_blueprint(api_core_bp, url_prefix='/api')
    app.register_blueprint(api_energy_bp, url_prefix='/api')
    app.register_blueprint(api_water_bp, url_prefix='/api')

    return app
