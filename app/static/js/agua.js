// agua.js - Maneja la lógica y gráficas exclusivas del módulo de Agua

const charts = {};

document.addEventListener('DOMContentLoaded', () => {
    const titleEl = document.getElementById('dashboardTitle');
    if (titleEl) titleEl.textContent = 'Dashboard Hídrico';
    initWaterCharts();
});

// ESCUCHAMOS EL EVENTO DESDE CORE.JS
document.addEventListener('DashboardRefreshRequired', async (e) => {
    const { costCenter, date, inputName, siteName } = e.detail;
    
    try {
        const water = await window.fetchData('/api/water/today', costCenter, date, siteName);

        const validSiteName = (water && water.site_name && water.site_name !== 'Sitio Desconocido') 
                                ? water.site_name 
                                : inputName;
        
        const titleEl = document.getElementById('dashboardTitle');
        if(titleEl) titleEl.textContent = `Dashboard Hídrico: ${validSiteName}`;

        updateWaterDashboard(water);

    } catch (error) {
        console.error("Error actualizando agua:", error);
    } finally {
        window.showLoading(false);
    }
});

function showNoDataAlert(show, message = 'No se encontraron datos para esta fecha y sitio.') {
    const alert = document.getElementById('aguaNoDataAlert');
    if (!alert) return;

    const textEl = alert.querySelector('p');
    if (textEl) textEl.textContent = message;

    if (show) alert.classList.remove('hidden');
    else alert.classList.add('hidden');
}

function setWaterNoDataState() {
    clearCharts();

    setEl('aguaKpiActual', '0');
    setEl('aguaKpiTarget', '0');
    setEl('aguaKpiPct', '0');
    setEl('aguaKpiTotalHora', '0');

    const progressBar = document.getElementById('pbAguaBar');
    const progressActual = document.getElementById('pbAguaActual');
    const progressTarget = document.getElementById('pbAguaTarget');

    if (progressBar) {
        progressBar.style.width = '0%';
        progressBar.textContent = '0%';
        window.applyProgressBarThresholdColor(progressBar, 0);
    }
    if (progressActual) {
        progressActual.textContent = '0';
        progressActual.classList.remove('text-red-600');
        progressActual.classList.add('text-blue-500');
    }
    if (progressTarget) {
        progressTarget.textContent = '0';
    }
}

function updateWaterDashboard(water) {
    if (!water) {
        showNoDataAlert(true, 'No se pudieron obtener los datos del servidor. Por favor, inténtelo nuevamente.');
        setWaterNoDataState();
        return;
    }

    const hasHourly = Array.isArray(water.hourly) && water.hourly.length > 0;
    const kpiActual = water.kpi && typeof water.kpi.actual === 'number' ? water.kpi.actual : 0;
    const kpiTarget = water.kpi && typeof water.kpi.target === 'number' ? water.kpi.target : 0;
    const hasKpi = kpiActual > 0 || kpiTarget > 0;

    if (!hasHourly && !hasKpi) {
        showNoDataAlert(true, 'No se encontraron datos para esta fecha y sitio. Por favor, pruebe otra fecha o verifique los parámetros.');
        setWaterNoDataState();
        return;
    }

    showNoDataAlert(false);

    // Actualizar Tarjetas Maestras
    if (water.kpi) {
        const actual = water.kpi.actual || 0;
        const target = water.kpi.target || 0;
        const pct = target > 0 ? Math.round((actual / target) * 100) : 0;

        const maxFd = { maximumFractionDigits: 2 };

        setEl('aguaKpiActual', actual.toLocaleString('es-MX', maxFd));
        setEl('aguaKpiTarget', target.toLocaleString('es-MX', maxFd));
        
        const pctEl = document.getElementById('aguaKpiPct');
        if (pctEl) {
            pctEl.textContent = pct;
            pctEl.parentElement.className = `text-4xl font-light ${pct >= 100 ? 'text-red-500' : 'text-slate-800 dark:text-white'}`;
        }

        // Widgets de Metas y Doughnut
        if (charts.kpiDay) {
            const restante = Math.max(0, target - actual);
            const isOver = actual > target && target > 0;
            const progressVisuals = window.getProgressThresholdVisuals(target > 0 ? (actual / target) * 100 : 0);
            const remainingColor = window.getProgressRemainingChartColor();
            
            charts.kpiDay.data.labels = isOver ? ['Consumo Excedido'] : ['Consumo Actual', 'Restante'];
            charts.kpiDay.data.datasets[0].data = isOver ? [actual] : [actual, restante];
            charts.kpiDay.data.datasets[0].backgroundColor = isOver
                ? [progressVisuals.chartColor]
                : [progressVisuals.chartColor, remainingColor];
            charts.kpiDay.update();
        }

        // Barra de progreso
        const strictPct = target > 0 ? (actual / target) * 100 : 0;
        const progressActual = document.getElementById('pbAguaActual');
        const progressTarget = document.getElementById('pbAguaTarget');
        const progressBar = document.getElementById('pbAguaBar');

        if(progressActual) progressActual.textContent = actual.toLocaleString('es-MX', maxFd);
        if(progressTarget) progressTarget.textContent = target.toLocaleString('es-MX', maxFd);
        
        if(progressBar) {
            const displayPct = Math.min(strictPct, 100);
            progressBar.style.width = displayPct + '%';
            progressBar.textContent = strictPct > 0 ? strictPct.toFixed(1) + '%' : '0%';
            window.applyProgressBarThresholdColor(progressBar, strictPct, strictPct > 100);

            if (strictPct > 100) {
                progressActual.classList.add('text-red-600');
                progressActual.classList.remove('text-blue-500');
            } else {
                progressActual.classList.remove('text-red-600');
                progressActual.classList.add('text-blue-500');
            }
        }
        
        setEl('aguaKpiTotalHora', actual.toLocaleString('es-MX', maxFd));
    }

    // Gráfica de Líneas (Por Horas)
    if (water.hourly && water.hourly.length > 0 && charts.line) {
        charts.line.data.labels = water.hourly.map(h => h.hour.toString().substring(0,5));
        charts.line.data.datasets[0].data = water.hourly.map(h => h.actual);
        if (charts.line.data.datasets[1]) {
            charts.line.data.datasets[1].data = water.hourly.map(h => h.target);
        }
        charts.line.update();
    } else {
        clearCharts();
    }
}

function clearCharts() {
    if(charts.line) {
        charts.line.data.labels = [];
        charts.line.data.datasets.forEach(ds => ds.data = []);
        charts.line.update();
    }
}

function setEl(id, text) {
    const el = document.getElementById(id);
    if(el) el.textContent = text;
}

// Inicialización
function initWaterCharts() {
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.font.family = 'Inter, ui-sans-serif, system-ui, -apple-system, sans-serif';

    const blueWater = '#3b82f6';
    const grayTarget = '#656263';
    const initialDonutColor = window.getProgressThresholdVisuals(0).chartColor;
    const remainingColor = window.getProgressRemainingChartColor();

    // Gráfica de Consumo (Líneas)
    const ctx = document.getElementById('chartLineAgua');
    if (ctx) {
        charts.line = new Chart(ctx.getContext('2d'), {
            type: 'line',
            data: { 
                labels: [], 
                datasets: [
                    {
                        label: 'Actual (m³)',
                        data: [],
                        borderColor: blueWater,
                        backgroundColor: blueWater + '20',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.4
                    },
                    {
                        label: 'Objetivo (m³)',
                        data: [],
                        borderColor: grayTarget,
                        borderWidth: 2,
                        borderDash: [5, 5],
                        fill: false,
                        tension: 0.4
                    }
                ] 
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'top', labels: { boxWidth: 12, usePointStyle: true } } },
                scales: {
                    x: { grid: { color: 'rgba(148, 163, 184, 0.1)' } },
                    y: { beginAtZero: true, grid: { color: 'rgba(148, 163, 184, 0.1)' } }
                },
                interaction: { mode: 'index', intersect: false }
            }
        });
    }

    // Doughnut
    const ctxKpi = document.getElementById('chartPieAgua');
    if (ctxKpi) {
        charts.kpiDay = new Chart(ctxKpi, {
            type: 'doughnut',
            data: {
                labels: ['Consumo Actual', 'Restante'],
                datasets: [{
                    data: [0, 100],
                    backgroundColor: [initialDonutColor, remainingColor],
                    borderWidth: 0,
                    cutout: '75%'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { color: grayTarget } },
                    tooltip: { callbacks: { label: function(c) { return c.formattedValue + ' m³'; } } }
                }
            }
        });
    }
}
