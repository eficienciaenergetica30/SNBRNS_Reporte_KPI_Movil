// gas.js - Lógica para el dashboard de Gas

const charts = {};

document.addEventListener('DOMContentLoaded', () => {
    initGasCharts();
});

document.addEventListener('DashboardRefreshRequired', async (e) => {
    const { costCenter, date, inputName } = e.detail;
    window.showLoading(true);
    try {
        const gasData = await window.fetchData('/api/gas', costCenter, date);

        const validSiteName = (gasData && gasData.site_name) 
                                ? gasData.site_name 
                                : inputName;
        
        const titleEl = document.getElementById('dashboardTitle');
        if(titleEl) titleEl.textContent = `Dashboard de Gas: ${validSiteName}`;

        updateGasDashboard(gasData);

    } catch (error) {
        console.error("Error actualizando gas:", error);
    } finally {
        window.showLoading(false);
    }
});

function updateGasDashboard(data) {
    if (!data || !data.kpi || !data.hourly) {
        console.warn("No hay datos de gas para mostrar o la estructura es incorrecta.");
        clearGasCharts();
        return;
    }

    const totalConsumo = data.kpi.actual || 0;
    const totalObjetivo = data.kpi.target || 0;
    const cumplimiento = totalObjetivo > 0 ? (totalConsumo / totalObjetivo) * 100 : 0;
    
    const costoEstimado = data.kpi.costo_estimado || 0;
    const precioUnitario = data.kpi.precio_unitario || 0;

        setEl('masterKpiActual', totalConsumo.toFixed(2));
        setEl('masterKpiTarget', totalObjetivo.toFixed(2));
        setEl('masterKpiPct', cumplimiento.toFixed(0));
        setEl('masterKpiCosto', costoEstimado.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }));
        setEl('masterKpiPrecio', precioUnitario.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }));

    setEl('progressActual', totalConsumo.toFixed(2));
    setEl('progressTarget', totalObjetivo.toFixed(2));
    const progressBar = document.getElementById('progressBar');
    if (progressBar) {
        const progressPercentage = Math.min(100, cumplimiento);
        progressBar.style.width = `${progressPercentage}%`;
        progressBar.textContent = `${progressPercentage.toFixed(0)}%`;
    }

    if (charts.kpiDay) {
        const remaining = Math.max(0, totalObjetivo - totalConsumo);
        charts.kpiDay.data.datasets[0].data = [totalConsumo, remaining];
        charts.kpiDay.update();
    }

    if (charts.gas) {
        charts.gas.data.labels = data.hourly.map(item => item.HOUR.substring(0, 5));
        charts.gas.data.datasets[0].data = data.hourly.map(item => item.ACTUAL);
        charts.gas.data.datasets[1].data = data.hourly.map(item => item.TARGET);
        charts.gas.update();
    }
    
    setEl('kpiGas', `${totalConsumo.toFixed(2)} m³`);
}

function clearGasCharts() {
    if (charts.kpiDay) {
        charts.kpiDay.data.datasets[0].data = [0, 100];
        charts.kpiDay.update();
    }
    if (charts.gas) {
        charts.gas.data.labels = [];
        charts.gas.data.datasets[0].data = [];
        charts.gas.data.datasets[1].data = [];
        charts.gas.update();
    }
}

function setEl(id, text) {
    const el = document.getElementById(id);
    if(el) el.textContent = text;
}

function initGasCharts() {
    const orangeGas = '#e8743b';
    const orangeGasBg = 'rgba(232, 116, 59, 0.2)';
    const greyColor = '#656263'; // Color para 'Restante' y leyendas

    const ctxKpiDay = document.getElementById('chartKpiDay');
    if (ctxKpiDay) {
        charts.kpiDay = new Chart(ctxKpiDay, {
            type: 'doughnut',
            data: {
                labels: ['Actual', 'Restante'],
                datasets: [{
                    data: [0, 100],
                    backgroundColor: [orangeGas, '#e2e8f0'], // Naranja y un gris claro
                    borderWidth: 0,
                    cutout: '75%'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { 
                        position: 'bottom', 
                        labels: { 
                            color: greyColor,
                            boxWidth: 12,
                            padding: 20
                        } 
                    },
                    tooltip: { 
                        callbacks: { 
                            label: function(c) { return c.label + ': ' + c.formattedValue + ' m³'; } 
                        } 
                    }
                }
            }
        });
    }

    const ctxGas = document.getElementById('chartGas');
    if (ctxGas) {
        charts.gas = new Chart(ctxGas, {
            type: 'line', // <--- CAMBIO: de 'bar' a 'line'
            data: {
                labels: [],
                datasets: [{
                    label: 'Consumo Actual',
                    data: [],
                    backgroundColor: orangeGasBg,
                    borderColor: orangeGas,
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                },
                {
                    label: 'Objetivo',
                    data: [],
                    type: 'line',
                    borderColor: '#9CA3AF',
                    borderDash: [5, 5],
                    borderWidth: 2,
                    fill: false,
                    pointRadius: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true
                    }
                },
                plugins: {
                    legend: {
                        position: 'top',
                    },
                }
            }
        });
    }
}