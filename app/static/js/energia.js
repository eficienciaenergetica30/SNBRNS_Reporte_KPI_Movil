// energia.js - Maneja únicamente la lógica, queries y gráficas del módulo de Energía

const charts = {};

document.addEventListener('DOMContentLoaded', () => {
    initEnergyCharts();
});

// ESCUCHAMOS EL EVENTO DESDE CORE.JS
document.addEventListener('DashboardRefreshRequired', async (e) => {
    const { costCenter, date, inputName } = e.detail;

    try {
        const energy = await window.fetchData('/api/energy/today', costCenter, date);

        const validSiteName = (energy && energy.site_name && energy.site_name !== 'Sitio Desconocido')
            ? energy.site_name
            : inputName;

        const titleEl = document.getElementById('dashboardTitle');
        if (titleEl) titleEl.textContent = `Dashboard Eléctrico: ${validSiteName}`;

        updateEnergyDashboard(energy);

    } catch (error) {
        console.error("Error actualizando energía:", error);
    } finally {
        window.showLoading(false);
    }
});

function updateEnergyDashboard(energy) {
    if (!energy) {
        clearCharts();
        return;
    }

    // Actualizar Tarjetas Maestras
    if (energy.kpi) {
        const actual = energy.kpi.actual || 0;
        const target = energy.kpi.target || 0;
        const pct = target > 0 ? Math.round((actual / target) * 100) : 0;

        const maxFd = { maximumFractionDigits: 2 };

        setEl('masterKpiActual', actual.toLocaleString('es-MX', maxFd));
        setEl('masterKpiTarget', target.toLocaleString('es-MX', maxFd));
        setEl('masterKpiAveragePrice', energy.kpi.average_price.toLocaleString('es-MX', {
            style: 'currency',
            currency: 'MXN'
        }));

        setEl('masterKpiCostPerKwh', energy.kpi.cost_per_kwh.toLocaleString('es-MX', {
            style: 'currency',
            currency: 'MXN'
        }));



        const pctEl = document.getElementById('masterKpiPct');
        if (pctEl) {
            pctEl.textContent = pct;
            pctEl.parentElement.className = `text-4xl font-light ${pct >= 100 ? 'text-red-500' : 'text-sanbornsRed'}`;
        }

        if (energy.power_factor) {
            const formatTime = (timeStr) => {
                if (!timeStr) return '-';
                const parts = String(timeStr).split(' ');
                return parts.length > 1 ? parts[1].substring(0, 5) : timeStr;
            };

            setEl('masterKpiPfMax', energy.power_factor.max || '-');
            setEl('masterKpiPfMaxTime', `Hora: ${formatTime(energy.power_factor.max_time)}`);

            setEl('masterKpiPfMin', energy.power_factor.min || '-');
            setEl('masterKpiPfMinTime', `Hora: ${formatTime(energy.power_factor.min_time)}`);

            setEl('masterKpiPfAvg', energy.power_factor.avg || '-');
        }

        // Widgets de Metas y Doughnut
        if (charts.kpiDay) {
            const restante = Math.max(0, target - actual);
            const isOver = actual > target && target > 0;

            charts.kpiDay.data.labels = isOver ? ['Consumo Excedido'] : ['Consumo Actual', 'Restante'];
            charts.kpiDay.data.datasets[0].data = isOver ? [actual] : [actual, restante];
            charts.kpiDay.data.datasets[0].backgroundColor = isOver ? ['#dc2626'] : ['#d91920', '#e2e8f0'];
            charts.kpiDay.update();
        }

        // Barra de progreso
        const strictPct = target > 0 ? (actual / target) * 100 : 0;
        const progressActual = document.getElementById('progressActual');
        const progressTarget = document.getElementById('progressTarget');
        const progressBar = document.getElementById('progressBar');

        if (progressActual) progressActual.textContent = actual.toLocaleString('en-US', maxFd);
        if (progressTarget) progressTarget.textContent = target.toLocaleString('en-US', maxFd);

        if (progressBar) {
            const displayPct = Math.min(strictPct, 100);
            progressBar.style.width = displayPct + '%';
            progressBar.textContent = strictPct > 0 ? strictPct.toFixed(1) + '%' : '0%';

            if (strictPct > 100) {
                progressBar.classList.remove('bg-sanbornsRed');
                progressBar.classList.add('bg-red-600', 'animate-pulse');
                progressActual.classList.add('text-red-600');
            } else {
                progressBar.classList.add('bg-sanbornsRed');
                progressBar.classList.remove('bg-red-600', 'animate-pulse');
                progressActual.classList.remove('text-red-600');
            }
        }

        setEl('kpiEnergy', `${actual} kWh`);
    }

    // Gráfica de Líneas (Por Horas)
    if (energy.hourly && energy.hourly.length > 0 && charts.energy) {
        charts.energy.data.labels = energy.hourly.map(h => h.hour.toString().substring(0, 5));
        charts.energy.data.datasets[0].data = energy.hourly.map(h => h.actual);
        if (charts.energy.data.datasets[1]) {
            charts.energy.data.datasets[1].data = energy.hourly.map(h => h.target);
        }
        charts.energy.update();
    } else {
        clearCharts();
    }
}

function clearCharts() {
    if (charts.energy) {
        charts.energy.data.labels = [];
        charts.energy.data.datasets.forEach(ds => ds.data = []);
        charts.energy.update();
    }
}

function setEl(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

// Inicialización
function initEnergyCharts() {
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.font.family = 'Inter, ui-sans-serif, system-ui, -apple-system, sans-serif';

    const sanbornsRed = '#d91920';
    const sanbornsGray = '#656263';

    // Gráfica de Consumo (Líneas)
    const ctx = document.getElementById('chartEnergy');
    if (ctx) {
        charts.energy = new Chart(ctx.getContext('2d'), {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Actual',
                        data: [],
                        borderColor: sanbornsRed,
                        backgroundColor: sanbornsRed + '20',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.4
                    },
                    {
                        label: 'Objetivo',
                        data: [],
                        borderColor: sanbornsGray,
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
    const ctxKpi = document.getElementById('chartKpiDay');
    if (ctxKpi) {
        charts.kpiDay = new Chart(ctxKpi, {
            type: 'doughnut',
            data: {
                labels: ['Consumo Actual', 'Restante'],
                datasets: [{
                    data: [0, 100],
                    backgroundColor: [sanbornsRed, '#e2e8f0'],
                    borderWidth: 0,
                    cutout: '75%'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { color: sanbornsGray } },
                    tooltip: { callbacks: { label: function (c) { return c.formattedValue + ' kWh'; } } }
                }
            }
        });
    }
}
