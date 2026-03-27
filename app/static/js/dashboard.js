// Variables globales
let allSites = [];
const charts = {};

document.addEventListener('DOMContentLoaded', async () => {
    const siteInput = document.getElementById('siteSearchInput');
    const dateInput = document.getElementById('datePicker');
    const hiddenCostCenter = document.getElementById('selectedCostCenter');
    const dropdown = document.getElementById('siteDropdown');
    const dashboardMain = document.getElementById('dashboardMain');
    const dashboardTitle = document.getElementById('dashboardTitle');
    
    // Configuración Inicial de Fecha
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
    dateInput.value = hoy;

    // Inicializar Gráficas Vacías
    initCharts();

    // 1. Cargar Sitios
    try {
        const response = await fetch('/api/sites');
        allSites = await response.json();
        renderDropdown(allSites);
    } catch (err) {
        console.error("Error cargando sitios:", err);
        dropdown.innerHTML = '<li class="p-3 text-red-500 text-xs">Error cargando sitios</li>';
    }

    // --- LÓGICA DEL COMBOBOX ---

    // Mostrar menú al hacer clic o focus
    siteInput.addEventListener('focus', () => {
        dropdown.classList.remove('hidden');
        renderDropdown(allSites, siteInput.value);
    });

    // Filtrar menú al escribir
    siteInput.addEventListener('input', (e) => {
        dropdown.classList.remove('hidden');
        renderDropdown(allSites, e.target.value);
        
        // Si borra el texto, quitar selección
        if (e.target.value.trim() === '') {
            hiddenCostCenter.value = '';
            dashboardMain.classList.add('hidden');
            const emptyState = document.getElementById('emptyState');
            if (emptyState) emptyState.classList.remove('hidden');
        }
    });

    // Ocultar al hacer clic fuera
    document.addEventListener('click', (e) => {
        const container = document.getElementById('siteComboContainer');
        if (!container.contains(e.target)) {
            dropdown.classList.add('hidden');
        }
    });

    // Renderizar lista en Dropdown
    function renderDropdown(sites, searchTerm = '') {
        dropdown.innerHTML = '';
        
        const term = searchTerm.toLowerCase().trim();
        const filtered = sites.filter(s => 
            s.name.toLowerCase().includes(term) || 
            String(s.id).toLowerCase().includes(term)
        );

        if (filtered.length === 0) {
            dropdown.innerHTML = '<li class="p-3 text-slate-500 text-xs">No se encontraron resultados</li>';
            return;
        }

        filtered.forEach(site => {
            const li = document.createElement('li');
            li.className = 'px-4 py-3 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors border-b border-slate-100 dark:border-slate-700/50 last:border-0 flex justify-between items-center text-slate-800 dark:text-slate-200';
            
            // Highlight opcional: Para hacerlo simple solo ponemos nombre y costcenter tenues
            li.innerHTML = `
                <span class="font-medium truncate pr-4">${site.name}</span>
                <span class="text-xs text-slate-400 dark:text-slate-500 shrink-0 font-mono bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md">
                    ${site.id}
                </span>
            `;

            // Selección
            li.addEventListener('click', () => {
                siteInput.value = `${site.name} (${site.id})`;
                hiddenCostCenter.value = site.id;
                dropdown.classList.add('hidden');
                refreshDashboard(); // Autodisparar búsqueda
            });

            dropdown.appendChild(li);
        });
    }

    // --- LÓGICA DE ACTUALIZACIÓN DEL DASHBOARD ---
    dateInput.addEventListener('change', refreshDashboard);

    async function refreshDashboard() {
        const costCenter = hiddenCostCenter.value;
        const date = dateInput.value;

        if (!costCenter) return;

        showLoading(true);
        dashboardMain.classList.remove('hidden');
        const emptyState = document.getElementById('emptyState');
        if (emptyState) emptyState.classList.add('hidden');

        try {
            // Solo pedimos Energía para este Dashboard
            const energy = await fetchData('/api/energy/today', costCenter, date);

            const inputName = document.getElementById('siteSearchInput').value || costCenter;
            const validSiteName = (energy?.site_name && energy.site_name !== 'Sitio Desconocido') 
                                    ? energy.site_name 
                                    : inputName;
            
            dashboardTitle.textContent = `Monitoreo: ${validSiteName}`;

            // Actualizar Tarjetas Maestras (Basadas en Energía como principal)
            if (energy && energy.kpi) {
                const actual = energy.kpi.actual || 0;
                const target = energy.kpi.target || 0;
                const pct = target > 0 ? Math.round((actual / target) * 100) : 0;

                document.getElementById('masterKpiActual').textContent = actual.toLocaleString('es-MX', { maximumFractionDigits: 2 });
                document.getElementById('masterKpiTarget').textContent = target.toLocaleString('es-MX', { maximumFractionDigits: 2 });
                
                const pctEl = document.getElementById('masterKpiPct');
                pctEl.textContent = pct;
                pctEl.parentElement.className = `text-4xl font-light ${pct >= 100 ? 'text-red-500' : 'text-sanbornsRed'}`;

                if (energy.power_factor) {
                    const formatTime = (timeStr) => {
                        if (!timeStr) return '-';
                        const parts = String(timeStr).split(' ');
                        return parts.length > 1 ? parts[1].substring(0, 5) : timeStr;
                    };

                    document.getElementById('masterKpiPfMax').textContent = energy.power_factor.max || '-';
                    document.getElementById('masterKpiPfMaxTime').textContent = `Hora: ${formatTime(energy.power_factor.max_time)}`;
                    
                    document.getElementById('masterKpiPfMin').textContent = energy.power_factor.min || '-';
                    document.getElementById('masterKpiPfMinTime').textContent = `Hora: ${formatTime(energy.power_factor.min_time)}`;
                    
                    document.getElementById('masterKpiPfAvg').textContent = energy.power_factor.avg || '-';
                }
            }

            // Actualizar Gráfica
            updateModule('energy', energy, 'kWh');

        } catch (error) {
            console.error("Error actualizando dashboard", error);
        } finally {
            showLoading(false);
        }
    }

    async function fetchData(url, costCenter, date) {
        try {
            const res = await fetch(`${url}?costcenter=${encodeURIComponent(costCenter)}&date=${encodeURIComponent(date)}`);
            if(!res.ok) return null;
            return await res.json();
        } catch(e) {
            return null;
        }
    }

    function updateModule(moduleName, data, unit) {
        if (!data) return;

        // KPI
        const kpiEl = document.getElementById(`kpi${capitalize(moduleName)}`);
        if (moduleName === 'temperature') {
            kpiEl.textContent = `${data.kpi.avg || 0} ${unit}`;
        } else {
            kpiEl.textContent = `${data.kpi.actual || 0} ${unit}`;
        }

        // Gráfica
        if (data.hourly && data.hourly.length > 0) {
            const labels = data.hourly.map(h => (moduleName==='temperature' ? `${h.hour}:00` : h.hour));
            const actualValues = data.hourly.map(h => h.actual);
            
            charts[moduleName].data.labels = labels;
            charts[moduleName].data.datasets[0].data = actualValues;
            
            // Si hay targets (ej. en energía, agua, gas)
            if (data.hourly[0].target !== undefined && charts[moduleName].data.datasets[1]) {
                charts[moduleName].data.datasets[1].data = data.hourly.map(h => h.target);
            }
            
            charts[moduleName].update();
        } else {
            // Limpiar si no hay datos
            charts[moduleName].data.labels = [];
            charts[moduleName].data.datasets.forEach(ds => ds.data = []);
            charts[moduleName].update();
        }

        // 5. Actualizar Elementos Secundarios (Barra y Pastel) - Solo Energía
        if (moduleName === 'energy' && data.kpi) {
            const actual = data.kpi.actual || 0;
            const target = data.kpi.target || 0;
            
            // Doughnut
            if (charts.kpiDay) {
                const restante = Math.max(0, target - actual);
                const isOver = actual > target && target > 0;
                
                charts.kpiDay.data.labels = isOver ? ['Consumo Excedido'] : ['Consumo Actual', 'Restante'];
                charts.kpiDay.data.datasets[0].data = isOver ? [actual] : [actual, restante];
                charts.kpiDay.data.datasets[0].backgroundColor = isOver ? ['#dc2626'] : ['#d91920', '#e2e8f0'];
                charts.kpiDay.update();
            }

            // Barra de progreso
            const pct = target > 0 ? (actual / target) * 100 : 0;
            const progressActual = document.getElementById('progressActual');
            const progressTarget = document.getElementById('progressTarget');
            const progressBar = document.getElementById('progressBar');

            if(progressActual) progressActual.textContent = actual.toLocaleString('en-US', {maximumFractionDigits:2});
            if(progressTarget) progressTarget.textContent = target.toLocaleString('en-US', {maximumFractionDigits:2});
            
            if(progressBar) {
                const displayPct = Math.min(pct, 100);
                progressBar.style.width = displayPct + '%';
                progressBar.textContent = pct > 0 ? pct.toFixed(1) + '%' : '0%';
                
                if (pct > 100) {
                    progressBar.classList.remove('bg-sanbornsRed');
                    progressBar.classList.add('bg-red-600', 'animate-pulse');
                    progressActual.classList.add('text-red-600');
                } else {
                    progressBar.classList.add('bg-sanbornsRed');
                    progressBar.classList.remove('bg-red-600', 'animate-pulse');
                    progressActual.classList.remove('text-red-600');
                }
            }
        }
    }

    // --- GRÁFICAS CONFIGURACIÓN (Chart.js) ---
    function initCharts() {
        Chart.defaults.color = '#94a3b8'; // slate-400
        Chart.defaults.font.family = 'Inter, ui-sans-serif, system-ui, -apple-system, sans-serif';

        // Tema Sanborns
        const sanbornsRed = '#d91920';
        const sanbornsGray = '#656263';

        charts.energy = createChart('chartEnergy', 'Energía (kWh)', sanbornsRed, sanbornsGray, true);

        // Nuevo Doughnut de KPI Diario
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
                        tooltip: { callbacks: { label: function(c) { return c.formattedValue + ' kWh'; } } }
                    }
                }
            });
        }
    }

    function createChart(canvasId, labelActual, colorActual, colorTarget, hasTarget) {
        const ctx = document.getElementById(canvasId).getContext('2d');
        const datasets = [
            {
                label: 'Actual',
                data: [],
                borderColor: colorActual,
                backgroundColor: colorActual + '20',
                borderWidth: 2,
                fill: true,
                tension: 0.4
            }
        ];

        if (hasTarget) {
            datasets.push({
                label: 'Objetivo (Target)',
                data: [],
                borderColor: colorTarget,
                borderWidth: 2,
                borderDash: [5, 5],
                fill: false,
                tension: 0.4
            });
        }

        return new Chart(ctx, {
            type: 'line',
            data: { labels: [], datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'top', labels: { boxWidth: 12, usePointStyle: true } }
                },
                scales: {
                    x: { grid: { color: 'rgba(148, 163, 184, 0.1)' } },
                    y: { beginAtZero: true, grid: { color: 'rgba(148, 163, 184, 0.1)' } }
                },
                interaction: {
                    mode: 'index',
                    intersect: false,
                }
            }
        });
    }

    // Utilidades
    function showLoading(show) {
        const el = document.getElementById('loadingOverlay');
        if (show) el.classList.remove('hidden');
        else el.classList.add('hidden');
    }
    
    function capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
});