import os
from flask import Blueprint, render_template, request

main_bp = Blueprint('main', __name__)


@main_bp.route('/')
def home():
    """Redirige por defecto al dashboard principal."""
    return render_template('energia.html')

@main_bp.route('/energia')
def energia():
    return render_template('energia.html')

@main_bp.route('/agua')
def agua():
    return render_template('agua.html')

@main_bp.route('/gas')
def gas():
    return render_template('gas.html')

@main_bp.route('/temperatura')
def temperatura():
    return render_template('temperatura.html')
