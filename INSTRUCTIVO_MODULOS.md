# Instructivo: Desarrollo de Nuevos Módulos en el Dashboard Sanborns
*(Guía para la creación de los módulos de Agua, Gas y Temperatura)*

Este documento sirve como manual paso a paso para que cualquier desarrollador del equipo pueda integrar un nuevo módulo a la plataforma sin chocar o intervenir con el código existente. Todo el sistema centralizado de diseño (Menú lateral, Buscador, Modo Oscuro) ya está configurado en un "cascarón" maestro.

A continuación, se usará el módulo de **Agua** como ejemplo práctico.

---

## 1. El Backend (Consultas HANA y API)

El primer paso para añadir un tablero es garantizar que los datos fluyan correctamente desde nuestra base de datos.
Todo el Backend está dividido por responsabilidades para que trabajes de forma aislada.

### 1.1 El Modelo de BD (`app/models/[modulo]_model.py`)
Para tu módulo, **crea tu propio archivo de modelo**. Por ejemplo, para crear el nuevo módulo de Gas construirías `app/models/gas_model.py`:

```python
import os
from app.models.db_connector import get_db_connection

def get_gas_data(costcenter, date):
    # 1. Traer el conector oficial de SAP HANA Cloud
    conn = get_db_connection()
    if conn is None:
        return None

    # 2. Configurar query SQL
    query_hourly = f"""
    SELECT "HOUR", SUM("ACTUAL_CONSUMPTION")
    FROM "ESQUEMA"."VISTA_DE_GAS"
    WHERE "COST_CENTER" = ? AND "DATE" = ?
    GROUP BY "HOUR" ORDER BY "HOUR"
    """
    # 3. Extraer, convertir y retornar JSON estructurado.
    return {"kpi": {"actual": 120, "target": 150}, "hourly": [...]}
```

### 1.2 El Controlador API (`app/controllers/api_[modulo].py`)
Del mismo modo, debes crear el exponedor (Blueprint) individual para tus rutas del lado del servidor, por ejemplo `app/controllers/api_gas.py`:

```python
import datetime
from flask import Blueprint, jsonify, request
# Importa tu propio modelo
from app.models.gas_model import get_gas_data

api_gas_bp = Blueprint('api_gas', __name__)

@api_gas_bp.route('/gas/today', methods=['GET'])
def gas_today():
    costcenter = request.args.get('costcenter')
    date = request.args.get('date', datetime.date.today().isoformat())
    
    # Consumir la función creada en el punto 1.1
    data = get_gas_data(costcenter, date)
    return jsonify(data)
```
*> No olvides registrar tu Blueprint (`app.register_blueprint(api_gas_bp, url_prefix='/api')`) dentro del archivo padre `app/__init__.py` para que Flask se entere que existe.*

---

## 2. El Frontend (Views y Javascript)

Una vez que la API responde, el desarrollador se encarga de maquetar su interfaz aislada de los demás tableros.

### 2.1 Maquetado HTML (`app/views/agua.html`)
El archivo `.html` de tu módulo NO debe contener la estructura entera (`<head>`, `<nav>`, `<body>`). Simplemente debes **heredar** todo ese cascarón escribiendo esto al inicio del archivo:

```html
{% extends "base.html" %}
{% set active_page = 'agua' %}  <!-- IMPORTANTE: Esto ilumina de rojo el menú lateral -->

{% block content %}
    <!-- 1. Aquí diseñas tus tarjetas de Tailwind CSS exclusivas para Agua -->
    <div class="bg-white dark:bg-darkCard p-5 rounded-2xl shadow-sm...">
        <p id="kpiAguaTotal">0 Litros</p>
    </div>
    
    <!-- 2. Tu canvas para la gráfica de Chart.js -->
    <canvas id="chartAgua"></canvas>
{% endblock %}

{% block extra_scripts %}
    <!-- 3. Al final, importas el Javascript que gobernarás en el siguiente paso -->
    <script src="{{ url_for('static', filename='js/agua.js') }}"></script>
{% endblock %}
```

### 2.2 Lógica Independiente (`app/static/js/agua.js`)
No debes preocuparte por programar los calendarios ni los buscadores. El archivo global (`core.js`) ya controla todo eso y simplemente le "avisará" a tu archivo de agua cada que el gerente busque una tienda.

Lo único que debes hacer en tu nuevo `agua.js` es **escuchar el evento global** (`DashboardRefreshRequired`) y pedir los datos a tu API:

```javascript
// Este evento se dispara mágicamente cuando el usuario cambia de sucursal o de fecha
document.addEventListener('DashboardRefreshRequired', async (e) => {
    
    // El evento 'e.detail' nos regala qué sucursal y fecha se seleccionaron en la barra superior
    const { costCenter, date, inputName } = e.detail;
    
    // Opcional: Actualizar el título principal de arriba
    document.getElementById('dashboardTitle').textContent = `DB Agua: ${inputName}`;

    try {
        // Pedimos los datos a nuestra propia API creada en el paso 1.2
        const aguaData = await window.fetchData('/api/water/today', costCenter, date);

        // --- MANIPULACIÓN DEL DOM ---
        // 1. Inyectar números en las tarjetas de Tailwind
        document.getElementById('kpiAguaTotal').textContent = aguaData.kpi.actual + " Litros";

        // 2. Opcional: Inicializar o Actualizar Chart.js con la paleta corporativa
        // Rojo: '#d91920', Gris: '#656263'
        
    } catch (error) {
        console.error("Error pidiendo datos de Agua", error);
    } finally {
        // Apagamos la animación de "Cargando..."
        window.showLoading(false);
    }
});
```

---

## 3. Consideraciones Finales de UX/UI
Para mantener homogeneidad gráfica frente al cliente:
1. **Paleta de Colores**: Respeta los tokens `sanbornsRed` y `sanbornsGray` que el CSS Tailwind ya trae configurados.
2. **Animaciones de Error**: Para las barras de progreso superadas (`> 100%`), utiliza clases como `bg-red-600 animate-pulse` para simular situaciones de urgencia/alarma.
3. **Responsive Design**: Todo diseño de tarjeta o widget debe fluir bien en móviles cerrando automáticamente sus `width` en proporciones (`lg:col-span-1` vs una columna entera predeterminada).

---

## 4. Flujo Completo de la Arquitectura (Data Flow)

Para comprender mejor cómo interactúan tus nuevos archivos y cómo viaja el dato desde la nube de SAP hasta la pantalla del usuario final, este es el viaje exacto paso a paso:

1. **El Usuario Interactúa**: El usuario de Sanborns abre el "Dashboard de Agua" y selecciona la tienda "Plaza Carso" en el buscador de la barra superior.
2. **El Core Emite** (`core.js`): El archivo Javascript central detecta el clic y grita a nivel global: *"¡Oigan! El usuario quiere ver datos de Plaza Carso hoy"*.
3. **El Módulo Escucha** (`agua.js`): El archivo Javascript captura ese grito. Extrae el texto "Plaza Carso" y lanza una petición HTTP GET de fondo silenciosa hacia tu API en el backend (`fetch('/api/water/today?costcenter=207')`).
4. **El Router Recibe** (`api_water.py`): El Blueprint de Flask atrapa la petición de la URL `/api/water`. Lee la variable y se la pasa directamente al modelo de base de datos.
5. **El Modelo Ejecuta** (`water_model.py`): Este archivo importa el conector seguro (`db_connector.py`), abre un túnel con SAP HANA Cloud y ejecuta el bloque `SELECT` extrayendo los metros cúbicos ($m^3$) crudos.
6. **El JSON Retorna**: La base de datos responde. El modelo lo empaqueta en un diccionario de Python/JSON y viaja de regreso hacia internet, aterrizando en la variable de tu `agua.js`.
7. **Pintado en Pantalla** (`agua.html`): Finalmente, el código de `agua.js` toma el número (`aguaData.kpi.actual`) y lo inyecta visualmente dentro de la tarjeta blanca (`<p id="kpiAguaTotal">...`) y dibuja los puntos en el canvas de *Chart.js*. ¡Todo esto ocurre en menos de 0.5 segundos!
