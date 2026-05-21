# Documentacion Tecnica de core.js

## 1) Que es este archivo
El archivo [app/static/js/core.js](app/static/js/core.js) es el orquestador frontend comun para todos los dashboards (energia, agua, gas y temperatura).

Define comportamiento compartido en 5 ejes:
1. Carga inicial y validacion de acceso a datos.
2. Seleccion de sitio y fecha para consultas.
3. Disparo del evento global de refresco de dashboard.
4. Utilidades visuales globales (umbrales de color, tarjetas KPI, loading).
5. UX global (tema, sidebar y carrusel horizontal de tarjetas).

## 2) Para que funciona
Su objetivo es centralizar logica transversal para evitar duplicacion en [app/static/js/energia.js](app/static/js/energia.js), [app/static/js/agua.js](app/static/js/agua.js), [app/static/js/gas.js](app/static/js/gas.js) y [app/static/js/temperatura.js](app/static/js/temperatura.js).

Sin este archivo, cada modulo tendria que implementar:
1. Seleccion de sitio y persistencia.
2. Filtro de fecha.
3. Llamadas base a API.
4. Cambio de estados de UI comunes (loading/empty/dashboard visible).
5. Reglas de color por cumplimiento.

## 3) Como funciona (flujo end-to-end)
1. Al cargar la pagina, escucha `DOMContentLoaded` en [app/static/js/core.js](app/static/js/core.js#L109).
2. Lee elementos de [app/views/base.html](app/views/base.html#L205), [app/views/base.html](app/views/base.html#L230), [app/views/base.html](app/views/base.html#L244), [app/views/base.html](app/views/base.html#L277), [app/views/base.html](app/views/base.html#L286) y [app/views/base.html](app/views/base.html#L293).
3. Consulta contexto de bootstrap en `GET /api/bootstrap-context` desde [app/static/js/core.js](app/static/js/core.js#L329).
4. Si `canProceed` es falso, bloquea consultas y deja mensaje de acceso.
5. Si `canProceed` es verdadero, aplica RBAC visual llamando [app/static/js/rbac-config.js](app/static/js/rbac-config.js) via `window.applyRoleVisibility` en [app/static/js/core.js](app/static/js/core.js#L400).
6. Carga sitios del modulo actual usando `GET /api/sites/<module>` y fallback `GET /api/sites` en [app/static/js/core.js](app/static/js/core.js#L409).
7. Al seleccionar sitio o cambiar fecha, dispara evento custom `DashboardRefreshRequired` en [app/static/js/core.js](app/static/js/core.js#L618).
8. Cada modulo escucha ese evento y consume su endpoint:
9. Energia: [app/static/js/energia.js](app/static/js/energia.js#L10).
10. Agua: [app/static/js/agua.js](app/static/js/agua.js#L10).
11. Gas: [app/static/js/gas.js](app/static/js/gas.js#L9).
12. Temperatura: [app/static/js/temperatura.js](app/static/js/temperatura.js#L33).

## 4) Bloques funcionales y su impacto

### 4.1 Configuracion de umbrales y colores
Funciones:
1. [app/static/js/core.js](app/static/js/core.js#L7) `getProgressBarConfig`.
2. [app/static/js/core.js](app/static/js/core.js#L33) `getProgressThresholdLevel`.
3. [app/static/js/core.js](app/static/js/core.js#L48) `getKpiCardConfig`.

Que hacen:
1. Leen configuracion de [app/static/js/rbac-config.js](app/static/js/rbac-config.js#L5).
2. Definen umbrales (verde/amarillo/rojo) y clases CSS para barras/tarjetas.
3. Exponen comportamiento de colores coherente en todos los modulos.

Impacto en otros archivos:
1. Afecta color de barra de progreso en [app/static/js/energia.js](app/static/js/energia.js#L164), [app/static/js/agua.js](app/static/js/agua.js#L136), [app/static/js/gas.js](app/static/js/gas.js#L107), [app/static/js/temperatura.js](app/static/js/temperatura.js#L124).
2. Afecta color de tarjetas KPI de cumplimiento en [app/static/js/energia.js](app/static/js/energia.js#L119), [app/static/js/agua.js](app/static/js/agua.js#L107), [app/static/js/gas.js](app/static/js/gas.js#L98).

Regla actual de frontera:
1. Verde: pct < 40.
2. Amarillo: 40 <= pct < 80.
3. Rojo: pct >= 80.

### 4.2 Inicializacion global de filtros e identidad
Funciones internas del primer `DOMContentLoaded`:
1. Seleccion de fecha y limites de 4 meses en [app/static/js/core.js](app/static/js/core.js#L356).
2. Gestion de identidad de usuario en [app/static/js/core.js](app/static/js/core.js#L230).
3. Carga de bootstrap y bandera `window.__dbCanProceed` en [app/static/js/core.js](app/static/js/core.js#L374).

Que hacen:
1. Evitan consultas si backend no autoriza acceso.
2. Persisten contexto de usuario en sessionStorage.
3. Definen rol de negocio consumido por RBAC visual.

Impacto en otros archivos:
1. Endpoint backend: [app/controllers/api_core.py](app/controllers/api_core.py#L128).
2. Elementos de UI de usuario en [app/views/base.html](app/views/base.html#L258).
3. Estilos por rol con `role-<rol>` en `body`, usados para variaciones visuales potenciales.

### 4.3 Carga de sitios por modulo
Funcion:
1. [app/static/js/core.js](app/static/js/core.js#L409) `loadSitesForModule`.

Que hace:
1. Detecta modulo por ruta (`/energia`, `/agua`, `/gas`, `/temperatura`).
2. Consulta `/api/sites/<module>`; si falla usa `/api/sites`.
3. Guarda cache local por modulo en localStorage (`sites_<module>`).
4. Renderiza dropdown de sitios.

Impacto en otros archivos:
1. Endpoints modulares en [app/controllers/api_energy.py](app/controllers/api_energy.py#L21), [app/controllers/api_water.py](app/controllers/api_water.py#L18), [app/controllers/api_gas.py](app/controllers/api_gas.py#L24), [app/controllers/api_temperatura.py](app/controllers/api_temperatura.py).
2. Fallback global en [app/controllers/api_core.py](app/controllers/api_core.py#L23).
3. UI del combobox en [app/views/base.html](app/views/base.html#L205) y [app/views/base.html](app/views/base.html#L224).

### 4.4 Disparo del refresco global del dashboard
Funcion:
1. [app/static/js/core.js](app/static/js/core.js#L602) `triggerDashboardRefresh`.

Que hace:
1. Toma `costCenter`, `date`, `inputName`, `siteName`.
2. Muestra loading y oculta estado vacio.
3. Emite `CustomEvent('DashboardRefreshRequired')`.

Impacto en otros archivos:
1. Evento consumido por modulos de dominio:
2. [app/static/js/energia.js](app/static/js/energia.js#L10).
3. [app/static/js/agua.js](app/static/js/agua.js#L10).
4. [app/static/js/gas.js](app/static/js/gas.js#L9).
5. [app/static/js/temperatura.js](app/static/js/temperatura.js#L33).

### 4.5 Utilidades globales expuestas en window
Funciones:
1. [app/static/js/core.js](app/static/js/core.js#L626) `window.showLoading`.
2. [app/static/js/core.js](app/static/js/core.js#L633) `window.fetchData`.
3. [app/static/js/core.js](app/static/js/core.js#L648) `window.applyProgressBarThresholdColor`.
4. [app/static/js/core.js](app/static/js/core.js#L670) `window.getProgressThresholdVisuals`.
5. [app/static/js/core.js](app/static/js/core.js#L681) `window.getProgressRemainingChartColor`.
6. [app/static/js/core.js](app/static/js/core.js#L685) `window.applyThresholdKpiCardStyles`.

Que hacen:
1. Normalizan llamadas fetch para todos los modulos.
2. Aplican mismo criterio de colores y animaciones.
3. Reducen codigo duplicado en cada dashboard especifico.

Impacto en otros archivos:
1. Uso directo en [app/static/js/energia.js](app/static/js/energia.js#L14).
2. Uso directo en [app/static/js/agua.js](app/static/js/agua.js#L14).
3. Uso directo en [app/static/js/gas.js](app/static/js/gas.js#L13).
4. Uso directo en [app/static/js/temperatura.js](app/static/js/temperatura.js#L39).

### 4.6 Tema y sidebar
Bloque:
1. Segundo `DOMContentLoaded` desde [app/static/js/core.js](app/static/js/core.js#L732).

Que hace:
1. Persiste preferencia dark/light en localStorage (`themePreference`).
2. Alterna sidebar movil/desktop con transiciones.
3. Controla iconos hamburguesa/cerrar.

Impacto en otros archivos:
1. Botones y contenedores declarados en [app/views/base.html](app/views/base.html#L175), [app/views/base.html](app/views/base.html#L189), [app/views/base.html](app/views/base.html#L135), [app/views/base.html](app/views/base.html#L168).

### 4.7 Carrusel automatico de tarjetas
Bloque:
1. Tercer `DOMContentLoaded` en [app/static/js/core.js](app/static/js/core.js#L846).

Que hace:
1. Busca contenedores `.hide-scrollbar`.
2. Autodesplaza cada 4 segundos.
3. Pausa en hover/touch y reanuda al salir.

Impacto en otros archivos:
1. Cualquier vista/modulo que use `.hide-scrollbar` queda afectado por auto-scroll.
2. Principalmente tarjetas KPI horizontales en vistas de dashboard.

## 5) Dependencias de backend implicadas
Endpoints llamados por core.js:
1. `GET /api/bootstrap-context` para acceso, identidad y rol en [app/controllers/api_core.py](app/controllers/api_core.py#L128).
2. `GET /api/sites/<module>` para catalogo por modulo en controladores de cada dominio.
3. `GET /api/sites` como fallback global en [app/controllers/api_core.py](app/controllers/api_core.py#L23).

## 6) Estado y almacenamiento local
sessionStorage:
1. `bootstrapContextSession`: contexto de autenticacion/rol.
2. `selectedSiteSession`: ultima seleccion de sitio.

localStorage:
1. `sites_<module>`: cache de sitios por modulo.
2. `themePreference`: tema oscuro/claro.

Variables globales runtime:
1. `window.__dbCanProceed`: gate para permitir/denegar consultas.
2. `window.__businessRole`: rol de negocio para visibilidad UI.

## 7) Riesgos y consideraciones de mantenimiento
1. Si cambian IDs en [app/views/base.html](app/views/base.html), core.js puede dejar de enlazar eventos.
2. Si cambian nombres de rutas (`/energia`, `/agua`, `/gas`, `/temperatura`), la deteccion de modulo fallara.
3. Si falla bootstrap-context, toda la app se bloquea de forma segura (diseño esperado).
4. Si cambia el contrato JSON de sitios (`id`, `name`), el combobox dejara de renderizar correctamente.
5. Si se renombran clases de color en [app/static/js/rbac-config.js](app/static/js/rbac-config.js), la logica visual global se vera afectada.

## 8) Resumen ejecutivo
[app/static/js/core.js](app/static/js/core.js) no contiene logica de negocio de consumo. Su responsabilidad es coordinar estado global del frontend, filtros, navegacion, tema, visibilidad y utilidades de estilo para que los modulos de dominio solo se enfoquen en consultar datos y renderizar sus KPIs/graficas.
