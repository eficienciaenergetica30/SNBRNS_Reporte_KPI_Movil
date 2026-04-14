// temperatura.js - Lógica para el dashboard de Temperatura

const charts = {};

// Rangos ideales por bloque (igual que app administrativa)
const AREAS = {
    1:  { name: 'Tienda',                  min: 22,  max: 24  },
    2:  { name: 'Bar',                     min: 22,  max: 24  },
    3:  { name: 'Restaurante',             min: 22,  max: 24  },
    13: { name: 'Cámara de Conservación',  min: 3,   max: 5   },
    27: { name: 'Cámara de Congelación',   min: -20, max: -15 }
};

// Devuelve clases Tailwind de color según temperatura vs rango ideal
function getTempColorClass(value, block) {
    const area = AREAS[block] || AREAS[1];
    if (value === null || value === undefined) return 'bg-slate-300';
    if (value < area.min) return 'bg-blue-500';       // Frío / bajo
    if (value > area.max) return 'bg-sanbornsRed';    // Caliente / alto
    return 'bg-green-500';                            // Dentro del rango
}

let currentBlock = 1;
let lastRefreshDetail = null;

document.addEventListener('DOMContentLoaded', () => {
    const titleEl = document.getElementById('dashboardTitle');
    if (titleEl) titleEl.textContent = 'Dashboard de Temperatura';
    initTemperaturaCharts();
    // Marcar el botón activo inicial sin disparar petición
    [1, 2, 3, 13, 27].forEach(b => {
        const btn = document.getElementById(`btnBlock${b}`);
        if (!btn) return;
        if (b === currentBlock) {
            btn.classList.add('bg-sanbornsRed', 'text-white');
            btn.classList.remove('bg-white', 'dark:bg-darkCard', 'text-slate-600', 'dark:text-slate-300', 'border-sanbornsRed', 'dark:border-white');
        } else {
            btn.classList.remove('bg-sanbornsRed', 'text-white');
            btn.classList.add('bg-white', 'dark:bg-darkCard', 'text-slate-600', 'dark:text-slate-300', 'border-sanbornsRed', 'dark:border-white');
        }
    });
});

document.addEventListener('DashboardRefreshRequired', async (e) => {
    lastRefreshDetail = e.detail;
    await fetchAndRender(e.detail);
});

async function fetchAndRender({ costCenter, date, inputName, siteName }) {
    window.showLoading(true);
    try {
        const siteNameParam = siteName ? `&sitename=${encodeURIComponent(siteName)}` : '';
        const url = `/api/temperatura?block=${currentBlock}&costcenter=${encodeURIComponent(costCenter)}&date=${encodeURIComponent(date)}${siteNameParam}`;
        const res = await fetch(url);
        const data = res.ok ? await res.json() : null;

        const validSiteName = (data && data.site_name) ? data.site_name : inputName;
        const titleEl = document.getElementById('dashboardTitle');
        if (titleEl) titleEl.textContent = `Dashboard de Temperatura: ${validSiteName}`;

        updateTemperaturaDashboard(data);
    } catch (error) {
        console.error("Error actualizando temperatura:", error);
    } finally {
        window.showLoading(false);
    }
}

function setBlock(block) {
    currentBlock = block;

    // Actualizar estilos de los botones
    [1, 2, 3, 13, 27].forEach(b => {
        const btn = document.getElementById(`btnBlock${b}`);
        if (!btn) return;
        if (b === block) {
            btn.classList.add('bg-sanbornsRed', 'text-white');
            btn.classList.remove('bg-white', 'dark:bg-darkCard', 'text-slate-600', 'dark:text-slate-300', 'border-sanbornsRed', 'dark:border-white');
        } else {
            btn.classList.remove('bg-sanbornsRed', 'text-white');
            btn.classList.add('bg-white', 'dark:bg-darkCard', 'text-slate-600', 'dark:text-slate-300', 'border-sanbornsRed', 'dark:border-white');
        }
    });

    // Volver a pedir datos con el nuevo bloque
    if (lastRefreshDetail) {
        fetchAndRender(lastRefreshDetail);
    }
}

function updateTemperaturaDashboard(data) {
    if (!data || !data.kpi) {
        clearTemperaturaCharts();
        return;
    }

    const kpi = data.kpi;

    // Tarjeta: Actual
    const current = kpi.current?.value;
    setEl('tempKpiActual', current !== null && current !== undefined ? `${current}°C` : '--');
    setEl('tempKpiActualTime', formatTime(kpi.current?.time));

    // Tarjeta: Máxima
    const max = kpi.max?.value;
    setEl('tempKpiMax', max !== null && max !== undefined ? `${max}°C` : '--');
    setEl('tempKpiMaxTime', formatTime(kpi.max?.time));

    // Tarjeta: Mínima
    const min = kpi.min?.value;
    setEl('tempKpiMin', min !== null && min !== undefined ? `${min}°C` : '--');

    // Tarjeta: MinMax (Rango) — calculado en el backend como MIN/MAX
    const range = kpi.minmax?.value ?? null;
    setEl('tempKpiRange', range !== null ? `${range}°C` : '--');
    setEl('tempKpiMinTime', formatTime(kpi.min?.time));

    // Tarjeta: Promedio
    const avg = kpi.avg?.value;
    setEl('tempKpiAvg', avg !== null && avg !== undefined ? `${avg}°C` : '--');
    setEl('tempKpiAvgChart', avg !== null && avg !== undefined ? avg : '--');

    // Color dinámico según rango ideal del bloque
    const area = AREAS[currentBlock] || AREAS[1];
    const colorClass = getTempColorClass(avg, currentBlock);

    // Barra de rango — usa rangos ideales del bloque como referencia
    const progressBar = document.getElementById('tempProgressBar');
    const tempBarLabel = document.getElementById('tempBarLabel');
    if (progressBar && avg !== null && avg !== undefined) {
        const margin = 2;
        const refMin = area.min - margin;
        const refMax = area.max + margin;
        const pct = Math.min(100, Math.max(0, ((avg - refMin) / (refMax - refMin)) * 100));
        progressBar.style.width = `${pct}%`;
        progressBar.textContent = `${avg}°C`;
        // Cambiar color de la barra según estado
        progressBar.className = progressBar.className.replace(/bg-\S+/g, '').trim();
        progressBar.classList.add(colorClass, 'h-full', 'rounded-full', 'transition-all', 'duration-500', 'flex', 'items-center', 'justify-center', 'text-white', 'text-xs', 'font-bold');
        if (tempBarLabel) tempBarLabel.textContent = `${avg}°C`;
        const refMinEl = document.getElementById('tempRefMin');
        const refMaxEl = document.getElementById('tempRefMax');
        if (refMinEl) refMinEl.textContent = `${area.min}°C (Ref. Mín)`;
        if (refMaxEl) refMaxEl.textContent = `${area.max}°C (Ref. Máx)`;
    }

    // Leyenda de estado bajo la barra
    const statusEl = document.getElementById('tempRangeStatus');
    if (statusEl && avg !== null) {
        if (avg < area.min) {
            statusEl.textContent = `Temperatura BAJA — Rango ideal: ${area.min}°C – ${area.max}°C`;
            statusEl.className = 'text-xs text-center mt-2 text-blue-500';
        } else if (avg > area.max) {
            statusEl.textContent = `Temperatura ALTA — Rango ideal: ${area.min}°C – ${area.max}°C`;
            statusEl.className = 'text-xs text-center mt-2 text-red-500';
        } else {
            statusEl.textContent = `Temperatura dentro del rango ideal: ${area.min}°C – ${area.max}°C`;
            statusEl.className = 'text-xs text-center mt-2 text-green-500';
        }
    }

    // Gráfica por hora
    if (charts.temperatura && data.hourly) {
        charts.temperatura.data.labels = data.hourly.map(h => h.hour);
        charts.temperatura.data.datasets[0].data = data.hourly.map(h => h.actual);
        charts.temperatura.update();
    }
}

function clearTemperaturaCharts() {
    setEl('tempKpiActual', '--');
    setEl('tempKpiMax', '--');
    setEl('tempKpiMin', '--');
    setEl('tempKpiAvg', '--');
    if (charts.temperatura) {
        charts.temperatura.data.labels = [];
        charts.temperatura.data.datasets[0].data = [];
        charts.temperatura.update();
    }
}

function formatTime(isoString) {
    if (!isoString) return '--';
    try {
        return isoString.substring(11, 16);
    } catch {
        return isoString;
    }
}

function setEl(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function initTemperaturaCharts() {
    const blueColor = '#3b82f6';
    const blueBg = 'rgba(59, 130, 246, 0.15)';

    const ctx = document.getElementById('chartTemperatura');
    if (ctx) {
        charts.temperatura = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Temperatura (°C)',
                    data: [],
                    backgroundColor: blueBg,
                    borderColor: blueColor,
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: false,
                        grid: { color: 'rgba(148, 163, 184, 0.1)' },
                        ticks: {
                            callback: val => `${(+val).toFixed(1)}°C`
                        }
                    },
                    x: {
                        grid: { color: 'rgba(148, 163, 184, 0.1)' }
                    }
                },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: { boxWidth: 12, usePointStyle: true }
                    },
                    tooltip: {
                        callbacks: {
                            label: ctx => `${(+ctx.parsed.y).toFixed(1)}°C`
                        }
                    }
                },
                interaction: { mode: 'index', intersect: false }
            }
        });
    }
}
