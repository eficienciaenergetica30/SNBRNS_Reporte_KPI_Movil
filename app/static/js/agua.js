// agua.js - Maneja la lógica y gráficas exclusivas del módulo de Agua

const charts = {};

document.addEventListener('DOMContentLoaded', () => {
    initWaterCharts();
});

// ESCUCHAMOS EL EVENTO DESDE CORE.JS
document.addEventListener('DashboardRefreshRequired', async (e) => {
    const { costCenter, date, inputName } = e.detail;
    
    try {
        const water = await window.fetchData('/api/water/today', costCenter, date);

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

function updateWaterDashboard(water) {
    if (!water) {
        clearCharts();
        return;
    }

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
            
            charts.kpiDay.data.labels = isOver ? ['Consumo Excedido'] : ['Consumo Actual', 'Restante'];
            charts.kpiDay.data.datasets[0].data = isOver ? [actual] : [actual, restante];
            charts.kpiDay.data.datasets[0].backgroundColor = isOver ? ['#dc2626'] : ['#3b82f6', '#e2e8f0']; // Azul para agua
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
            
            if (strictPct > 100) {
                progressBar.classList.remove('bg-blue-500');
                progressBar.classList.add('bg-red-600', 'animate-pulse');
                progressActual.classList.add('text-red-600');
                progressActual.classList.remove('text-blue-500');
            } else {
                progressBar.classList.add('bg-blue-500');
                progressBar.classList.remove('bg-red-600', 'animate-pulse');
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
                    backgroundColor: [blueWater, '#e2e8f0'],
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
