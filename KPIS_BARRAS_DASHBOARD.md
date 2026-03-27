# 📊 KPIs y Barras de Progreso - Dashboard Sanborns

> Documentación completa de los KPIs y barras de progreso de las 4 pantallas del dashboard para migrar a Chart.js u otro proyecto.

---

## ⚡ PANTALLA 1: ENERGÍA

### Vista HANA
```
"${HANA_SCHEMA}"."CV_ELECTRIC_CUBE"
```

### Query: KPIs (ACTUAL / TARGET)
```sql
SELECT
  IFNULL(SUM("CONSUMPTION"), 0)      AS "ACTUAL",
  IFNULL(SUM("CONSUMPTION_AVG"), 0)  AS "TARGET"
FROM "${schema}"."CV_ELECTRIC_CUBE"
WHERE "DATE" = ?
  AND "COSTCENTER" = ?
```
**Parámetros:** `[fecha, costcenter]`

### Query: Power Factor (Min, Max, Avg, Current)
```sql
SELECT
  ROUND(MIN_Q.TOTALPOWERFACTOR, 3) AS MIN_TOTALPOWERFACTOR,
  MIN_Q.TIME AS TIME_MIN_TOTALPOWERFACTOR,
  ROUND(MAX_Q.TOTALPOWERFACTOR, 3) AS MAX_TOTALPOWERFACTOR,
  MAX_Q.TIME AS TIME_MAX_TOTALPOWERFACTOR,
  ROUND(CURRENT_Q.TOTALPOWERFACTOR, 2) AS CURRENT_TOTALPOWERFACTOR,
  CURRENT_Q.TIME AS TIME_CURRENT_TOTALPOWERFACTOR,
  ROUND(TOTAL_Q.TOTAL_POWER_FACTOR / TOTAL_Q.CNT, 2) AS AVG_TOTALPOWERFACTOR,
  ROUND(MIN_Q.TOTALPOWERFACTOR / MAX_Q.TOTALPOWERFACTOR, 1) AS MINMAX
FROM
  -- MIN
  (SELECT TIME, TOTALPOWERFACTOR
   FROM "${schema}"."CV_ELECTRIC_CUBE"
   WHERE "COSTCENTER" = ?
     AND "DATE" = ?
     AND TOTALPOWERFACTOR IS NOT NULL
   ORDER BY TOTALPOWERFACTOR ASC
   LIMIT 1) AS MIN_Q
CROSS JOIN
  -- MAX
  (SELECT TIME, TOTALPOWERFACTOR
   FROM "${schema}"."CV_ELECTRIC_CUBE"
   WHERE "COSTCENTER" = ?
     AND "DATE" = ?
     AND TOTALPOWERFACTOR IS NOT NULL
   ORDER BY TOTALPOWERFACTOR DESC
   LIMIT 1) AS MAX_Q
CROSS JOIN
  -- CURRENT (más reciente)
  (SELECT TIME, TOTALPOWERFACTOR
   FROM "${schema}"."CV_ELECTRIC_CUBE"
   WHERE "COSTCENTER" = ?
     AND "DATE" = ?
     AND TOTALPOWERFACTOR IS NOT NULL
   ORDER BY TIME DESC
   LIMIT 1) AS CURRENT_Q
CROSS JOIN
  -- PROMEDIO (SUM / COUNT)
  (SELECT 
      SUM(TOTALPOWERFACTOR) AS TOTAL_POWER_FACTOR,
      COUNT(*) AS CNT
   FROM "${schema}"."CV_ELECTRIC_CUBE"
   WHERE "COSTCENTER" = ?
     AND "DATE" = ?
     AND TOTALPOWERFACTOR IS NOT NULL
   GROUP BY "DATE"
  ) AS TOTAL_Q
```
**Parámetros:** `[costcenter, fecha]` × 4 subconsultas

### Query: Datos por Hora (Gráfica)
```sql
SELECT
    "HOUR",
    IFNULL(SUM("CONSUMPTION"), 0)      AS "ACTUAL",
    IFNULL(SUM("CONSUMPTION_AVG"), 0)  AS "TARGET"
FROM "${schema}"."CV_ELECTRIC_CUBE"
WHERE "DATE" = ?
  AND "COSTCENTER" = ?
GROUP BY "HOUR"
ORDER BY "HOUR" ASC
```
**Parámetros:** `[fecha, costcenter]`

### Respuesta del Backend
```json
{
  "date": "2026-03-26",
  "site": "PLAZA CARSO",
  "kpi": {
    "ACTUAL": 0.00,
    "TARGET": 2842,
    "PCT": 0
  },
  "powerFactor": {
    "max": { "value": 0.98, "time": "2026-03-26 14:30:00" },
    "min": { "value": 0.85, "time": "2026-03-26 08:15:00" },
    "avg": { "value": 0.92 }
  },
  "hourlyData": [
    { "Hour": "00:00", "Actual": 45.2, "Target": 62.5 },
    { "Hour": "01:00", "Actual": 42.1, "Target": 60.0 }
  ]
}
```

### KPIs (5 tarjetas según diseño)

| # | Título | Subtítulo | Campo Backend | Cálculo Frontend | Color Valor |
|---|--------|-----------|---------------|------------------|-------------|
| 1 | Consumo Actual | kWh | `kpi.ACTUAL` | Directo | Verde `#22c55e` |
| 2 | Costo por kWh | MXN | — | `ACTUAL × PRECIO_UNITARIO` | Verde `#22c55e` |
| 3 | Precio Unitario kWh | Tarifa Ref. | Constante | `2.80` (fijo) | Negro `#1e293b` |
| 4 | Objetivo | kWh | `kpi.TARGET` | Directo | Negro `#1e293b` |
| 5 | Cumplimiento | % | `kpi.PCT` | `(ACTUAL / TARGET) × 100` | Verde `#22c55e` |

### KPIs Power Factor (3 tarjetas adicionales)

| # | Título | Campo Backend | Footer |
|---|--------|---------------|--------|
| 1 | PF Máximo | `powerFactor.max.value` | `powerFactor.max.time` |
| 2 | PF Mínimo | `powerFactor.min.value` | `powerFactor.min.time` |
| 3 | PF Promedio | `powerFactor.avg.value` | "Promedio del día" |

### Barra de Progreso

| Campo | Valor | Formato |
|-------|-------|---------|
| Etiqueta | `{PCT}% ( ${COSTO_ESTIMADO} MXN )` | Texto |
| Porcentaje | `kpi.PCT` | Número 0-100 |
| Color | Verde si < 100%, Rojo si ≥ 100% | Condicional |

**Implementación:**
```javascript
// Calcular barra de progreso
const pct = kpi.PCT || 0;
const costoEstimado = (kpi.ACTUAL * PRECIO_UNITARIO).toFixed(2);
const displayText = `${pct}% ( $${costoEstimado} MXN )`;
const barColor = pct >= 100 ? '#ef4444' : '#84cc16'; // Rojo si pasa, verde si no
```

---

## 🔥 PANTALLA 2: GAS

### Vista HANA
```
"${HANA_SCHEMA}"."CV_GAS_CUBE"
```

### Query: KPIs (ACTUAL / TARGET)
```sql
SELECT
  IFNULL(SUM("CONSUMPTION"), 0)      AS "ACTUAL",
  IFNULL(SUM("CONSUMPTION_AVG"), 0)  AS "TARGET"
FROM "${schema}"."CV_GAS_CUBE"
WHERE "DATE" = ?
  AND "COSTCENTER" = ?
```
**Parámetros:** `[fecha, costcenter]`

### Query: Datos por Hora (Gráfica)
```sql
SELECT
    "HOUR",
    IFNULL(SUM("CONSUMPTION"), 0)      AS "ACTUAL",
    IFNULL(SUM("CONSUMPTION_AVG"), 0)  AS "TARGET"  
FROM "${schema}"."CV_GAS_CUBE"
WHERE "DATE" = ?
   AND "COSTCENTER" = ?
GROUP BY "HOUR"
ORDER BY "HOUR" ASC
```
**Parámetros:** `[fecha, costcenter]`

### Respuesta del Backend
```json
{
  "date": "2026-03-26",
  "site": "PLAZA CARSO",
  "kpi": {
    "ACTUAL": 0.00,
    "TARGET": 165,
    "PCT": 0
  },
  "hourlyData": [
    { "Hour": "00:00", "Actual": 5.2, "Target": 6.5 }
  ]
}
```

### KPIs (5 tarjetas según diseño)

| # | Título | Subtítulo | Campo Backend | Cálculo Frontend | Color Valor |
|---|--------|-----------|---------------|------------------|-------------|
| 1 | Consumo Actual | m³ | `kpi.ACTUAL` | Directo | Verde `#22c55e` |
| 2 | Costo Estimado | MXN | — | `ACTUAL × PRECIO_UNITARIO` | Verde `#22c55e` |
| 3 | Precio unitario m³ | Tarifa Ref. | Constante | `5.50` (fijo) | Negro `#1e293b` |
| 4 | Objetivo | m³ | `kpi.TARGET` | Directo | Negro `#1e293b` |
| 5 | Cumplimiento | % | `kpi.PCT` | `(ACTUAL / TARGET) × 100` | Verde `#22c55e` |

### Barra de Progreso

| Campo | Valor | Formato |
|-------|-------|---------|
| Etiqueta | `{PCT}% ( ${COSTO_ESTIMADO} MXN )` | Texto |
| Porcentaje | `kpi.PCT` | Número 0-100 |
| Color | Verde si < 100%, Rojo si ≥ 100% | Condicional |

---

## 💧 PANTALLA 3: AGUA

### Vista HANA
```
"${HANA_SCHEMA}"."CV_WATER_CUBE"
```

### Query: KPIs (ACTUAL / TARGET)
```sql
SELECT
  COALESCE(SUM("CONSUMPTION"), 0)      AS "ACTUAL",
  COALESCE(SUM("CONSUMPTION_AVG"), 0)  AS "TARGET"
FROM "${schema}"."CV_WATER_CUBE"
WHERE "DATE" = ?
  AND "COSTCENTER" = ?
```
**Parámetros:** `[fecha, costcenter]`

### Query: Datos por Hora (Gráfica)
```sql
SELECT
    "HOUR",
    COALESCE(SUM("CONSUMPTION"), 0)      AS "ACTUAL",
    COALESCE(SUM("CONSUMPTION_AVG"), 0)  AS "TARGET"
FROM "${schema}"."CV_WATER_CUBE"
WHERE "DATE" = ?
  AND "COSTCENTER" = ?
GROUP BY "HOUR"
ORDER BY "HOUR" ASC
```
**Parámetros:** `[fecha, costcenter]`

### Respuesta del Backend
```json
{
  "date": "2026-03-26",
  "site": "PLAZA CARSO",
  "kpi": {
    "ACTUAL": 0.00,
    "TARGET": 34.9,
    "PCT": 0
  },
  "hourlyData": [
    { "Hour": "00:00", "Actual": 1.2, "Target": 1.5 }
  ]
}
```

### KPIs (5 tarjetas según diseño)

| # | Título | Subtítulo | Campo Backend | Cálculo Frontend | Color Valor |
|---|--------|-----------|---------------|------------------|-------------|
| 1 | Consumo Actual | m³ | `kpi.ACTUAL` | Directo | Verde `#22c55e` |
| 2 | Costo por m³ | MXN | — | `ACTUAL × PRECIO_UNITARIO` | Verde `#22c55e` |
| 3 | Precio unitario m³ | Tarifa Ref. | Constante | `15.50` (fijo) | Negro `#1e293b` |
| 4 | Objetivo | m³ | `kpi.TARGET` | Directo | Negro `#1e293b` |
| 5 | Cumplimiento | % | `kpi.PCT` | `(ACTUAL / TARGET) × 100` | Verde `#22c55e` |

### Barra de Progreso

| Campo | Valor | Formato |
|-------|-------|---------|
| Etiqueta | `{PCT}% ( ${COSTO_ESTIMADO} MXN )` | Texto |
| Porcentaje | `kpi.PCT` | Número 0-100 |
| Color | Verde si < 100%, Rojo si ≥ 100% | Condicional |

---

## 🌡️ PANTALLA 4: TEMPERATURA

### Vista HANA
```
"${HANA_SCHEMA}"."CV_TEMPERATURE_CUBE"
```

### Query: KPIs (Min, Max, Avg, Current)
```sql
SELECT
  ROUND(MIN_Q.DEGREES, 2) AS MIN_DEGREES,
  MIN_Q.TIME AS TIME_MIN_DEGREES,
  ROUND(MAX_Q.DEGREES, 2) AS MAX_DEGREES,
  MAX_Q.TIME AS TIME_MAX_DEGREES,
  ROUND(CURRENT_Q.DEGREES, 2) AS CURRENT_DEGREES,
  CURRENT_Q.TIME AS TIME_CURRENT_DEGREES,
  ROUND(TOTAL_Q.TOTAL_DEGREES / TOTAL_Q.CNT, 2) AS AVG_DEGREES,
  ROUND(MIN_Q.DEGREES / MAX_Q.DEGREES, 2) AS MINMAX
FROM
  -- MIN (temperatura más baja del día)
  (SELECT TIME, DEGREES 
   FROM "${schema}"."CV_TEMPERATURE_CUBE" 
   WHERE "COSTCENTER" = ? 
     AND "DATE_D" = ? 
     AND "BLOCK" = ? 
     AND "DEGREES" IS NOT NULL 
   ORDER BY "DEGREES" ASC 
   LIMIT 1) AS MIN_Q
CROSS JOIN
  -- MAX (temperatura más alta del día)
  (SELECT TIME, DEGREES 
   FROM "${schema}"."CV_TEMPERATURE_CUBE" 
   WHERE "COSTCENTER" = ? 
     AND "DATE_D" = ? 
     AND "BLOCK" = ? 
     AND "DEGREES" IS NOT NULL 
   ORDER BY "DEGREES" DESC 
   LIMIT 1) AS MAX_Q
CROSS JOIN
  -- CURRENT (temperatura más reciente)
  (SELECT TIME, DEGREES 
   FROM "${schema}"."CV_TEMPERATURE_CUBE" 
   WHERE "COSTCENTER" = ? 
     AND "DATE_D" = ? 
     AND "BLOCK" = ? 
     AND "DEGREES" IS NOT NULL 
   ORDER BY TIME DESC 
   LIMIT 1) AS CURRENT_Q
CROSS JOIN
  -- PROMEDIO (SUM / COUNT)
  (SELECT SUM(DEGREES) AS TOTAL_DEGREES, COUNT(*) AS CNT 
   FROM "${schema}"."CV_TEMPERATURE_CUBE" 
   WHERE "COSTCENTER" = ? 
     AND "DATE_D" = ? 
     AND "BLOCK" = ? 
     AND "DEGREES" IS NOT NULL) AS TOTAL_Q
```
**Parámetros:** `[costcenter, fecha, block]` × 4 subconsultas
**Block:** 1=Tienda, 2=Bar, 3=Restaurante

### Query: Datos por Hora (Gráfica)
```sql
SELECT 
  HOUR(T1."HOUR") AS "HOUR", 
  IFNULL(AVG(T1."DEGREES"), 0) AS "ACTUAL" 
FROM "${schema}"."CV_TEMPERATURE_CUBE" T1 
WHERE T1."COSTCENTER" = ? 
  AND T1."DATE_D" = ? 
  AND T1."BLOCK" = ? 
  AND T1."DEGREES" IS NOT NULL 
GROUP BY HOUR(T1."HOUR") 
ORDER BY "HOUR" ASC
```
**Parámetros:** `[costcenter, fecha, block]`

### Respuesta del Backend
```json
{
  "date": "2026-03-26",
  "site": "PLAZA CARSO",
  "kpi": {
    "current": { "value": 22.5, "time": "2026-03-26 14:30:00" },
    "max": { "value": 28.3, "time": "2026-03-26 13:00:00" },
    "min": { "value": 18.2, "time": "2026-03-26 06:00:00" },
    "avg": { "value": 23.1 }
  },
  "hourlyData": [
    { "Hour": "00:00:00", "Actual": 19.5 },
    { "Hour": "01:00:00", "Actual": 19.2 }
  ]
}
```

### KPIs (3-4 tarjetas según diseño)

| # | Título | Subtítulo | Campo Backend | Footer | Color Valor |
|---|--------|-----------|---------------|--------|-------------|
| 1 | Temperatura (Actual) | Ahora | `kpi.current.value` | `Hora: {kpi.current.time}` | Neutral |
| 2 | Temperatura (Máx) | Hoy | `kpi.max.value` | `Hora: {kpi.max.time}` | Rojo `#ef4444` |
| 3 | Temperatura (Mín) | Hoy | `kpi.min.value` | `Hora: {kpi.min.time}` | Verde `#22c55e` |
| 4 | Temperatura Promedio | °C | `kpi.avg.value` | "Promedio del día" | Neutral |

### Barra de Progreso (Estado de Temperatura)

| Campo | Valor | Formato |
|-------|-------|---------|
| Etiqueta | `{AVG}°C` | Texto |
| Porcentaje | Calculado: `((avg - minRef) / (maxRef - minRef)) × 100` | 0-100 |
| Color | Azul claro `#3498db` | Fijo |

**Nota:** La barra de temperatura no es de cumplimiento, muestra dónde está el promedio en un rango de referencia (por ejemplo 15°C - 35°C).

---

## 🧮 CONSTANTES DE PRECIOS (Para cálculos frontend)

```javascript
const PRECIOS = {
  ENERGIA_KWH: 2.80,   // MXN por kWh
  GAS_M3: 5.50,        // MXN por m³
  AGUA_M3: 15.50       // MXN por m³ (o Litros según unidad)
};
```

---

## 📐 FUNCIÓN PARA CALCULAR KPIs COMPLETOS

```javascript
/**
 * Calcula todos los KPIs de consumo (Energía, Gas, Agua)
 * @param {Object} kpiBackend - KPIs del backend (ACTUAL, TARGET, PCT)
 * @param {number} precioUnitario - Precio por unidad
 * @returns {Object} KPIs completos para mostrar
 */
function calcularKPIsConsumo(kpiBackend, precioUnitario) {
  const actual = kpiBackend.ACTUAL || 0;
  const target = kpiBackend.TARGET || 0;
  const pct = target > 0 ? Math.round((actual / target) * 100) : 0;
  const costoEstimado = actual * precioUnitario;

  return {
    consumoActual: actual.toFixed(2),
    costoEstimado: costoEstimado.toFixed(2),
    precioUnitario: precioUnitario.toFixed(2),
    objetivo: target.toFixed(2),
    cumplimiento: pct,
    // Para la barra de progreso
    barraLabel: `${pct}% ( $${costoEstimado.toFixed(2)} MXN )`,
    barraPercent: Math.min(pct, 100), // Máximo 100% para la barra
    barraColor: pct >= 100 ? '#ef4444' : '#84cc16'
  };
}

// Ejemplo de uso:
const kpisEnergia = calcularKPIsConsumo(response.kpi, PRECIOS.ENERGIA_KWH);
const kpisGas = calcularKPIsConsumo(response.kpi, PRECIOS.GAS_M3);
const kpisAgua = calcularKPIsConsumo(response.kpi, PRECIOS.AGUA_M3);
```

---

## 📊 FUNCIÓN PARA CALCULAR KPIs TEMPERATURA

```javascript
/**
 * Procesa KPIs de temperatura del backend
 * @param {Object} kpiBackend - KPIs del backend (max, min, avg, current)
 * @returns {Object} KPIs procesados
 */
function calcularKPIsTemperatura(kpiBackend) {
  const formatTime = (timeStr) => {
    if (!timeStr) return '—';
    const parts = String(timeStr).split(' ');
    if (parts.length > 1) {
      const timeParts = parts[1].split(':');
      return `${timeParts[0]}:${timeParts[1]}`;
    }
    return timeStr;
  };

  return {
    actual: {
      value: kpiBackend.current?.value?.toFixed(2) || '—',
      time: formatTime(kpiBackend.current?.time)
    },
    max: {
      value: kpiBackend.max?.value?.toFixed(2) || '—',
      time: formatTime(kpiBackend.max?.time)
    },
    min: {
      value: kpiBackend.min?.value?.toFixed(2) || '—',
      time: formatTime(kpiBackend.min?.time)
    },
    avg: kpiBackend.avg?.value?.toFixed(2) || '—',
    // Para la barra de estado
    barraLabel: `${kpiBackend.avg?.value?.toFixed(2) || 0}°C`,
    barraPercent: calcularPorcentajeTemp(kpiBackend.avg?.value || 0, 15, 35),
    barraColor: '#3498db'
  };
}

/**
 * Calcula porcentaje de temperatura en un rango
 */
function calcularPorcentajeTemp(temp, minRef, maxRef) {
  if (temp <= minRef) return 0;
  if (temp >= maxRef) return 100;
  return Math.round(((temp - minRef) / (maxRef - minRef)) * 100);
}
```

---

## 🎨 RESUMEN DE COLORES POR PANTALLA

| Pantalla | Color Principal | Color Secundario | Color Barra |
|----------|-----------------|------------------|-------------|
| Energía | Verde `#22c55e` | Negro `#1e293b` | Verde `#84cc16` |
| Gas | Verde `#22c55e` | Negro `#1e293b` | Verde `#84cc16` |
| Agua | Verde `#22c55e` | Negro `#1e293b` | Verde `#84cc16` |
| Temperatura | Rojo/Verde | Neutral | Azul `#3498db` |

---

## 📈 GRÁFICAS POR PANTALLA

| Pantalla | Gráfica KPI | Gráfica Horaria | Datos |
|----------|-------------|-----------------|-------|
| Energía | Bar (Actual vs Target) | Line Segmentado | hourlyData |
| Gas | Bar (Actual vs Target) | Line Segmentado | hourlyData |
| Agua | Bar (Actual vs Target) | Line Segmentado | hourlyData |
| Temperatura | Bar (Max vs Min) | Line Simple | hourlyData |

**Segmentación por Tarifa CFE (Energía, Gas, Agua):**
- Base: 00:00-05:59 → Verde `#19A979`
- Intermedio: 06:00-19:59 → Naranja `#E8743B`
- Punta: 20:00-23:59 → Rojo `#D62F2F`
- Objetivo: Todo el día → Gris `#999999`

---

## 📝 ESTRUCTURA HTML SUGERIDA (Chart.js)

```html
<!-- KPIs Container -->
<div class="kpis-container">
  <div class="kpi-card">
    <span class="kpi-title">Consumo Actual</span>
    <span class="kpi-subtitle">kWh</span>
    <span class="kpi-value green" id="kpi-actual">0.00</span>
    <span class="kpi-footer">kWh consumidos</span>
  </div>
  <!-- Repetir para cada KPI... -->
</div>

<!-- Barra de Progreso -->
<div class="progress-container">
  <span class="progress-label" id="progress-label">0% ( $0.00 MXN )</span>
  <div class="progress-bar">
    <div class="progress-fill" id="progress-fill" style="width: 0%;"></div>
  </div>
</div>

<!-- Gráficas -->
<div class="charts-container">
  <canvas id="kpiChart"></canvas>
  <canvas id="hourlyChart"></canvas>
</div>
```

---
