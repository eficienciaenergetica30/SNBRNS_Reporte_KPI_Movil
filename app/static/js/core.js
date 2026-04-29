// core.js - Maneja interacciones globales (Menú, Tema, Buscador)

// Variables Globales base
let allSites = [];
window.__dbCanProceed = false;

function getProgressBarConfig() {
    const config = window.FRONTEND_UI_CONFIG && window.FRONTEND_UI_CONFIG.progressBars
        ? window.FRONTEND_UI_CONFIG.progressBars
        : {};
    const thresholds = config.thresholds || {};
    const colors = config.colors || {};

    return {
        thresholds: {
            greenMax: Number.isFinite(thresholds.greenMax) ? thresholds.greenMax : 40,
            yellowMax: Number.isFinite(thresholds.yellowMax) ? thresholds.yellowMax : 80,
        },
        colors: {
            low: colors.low || 'bg-green-500',
            medium: colors.medium || 'bg-yellow-400',
            high: colors.high || 'bg-red-600',
        },
        chartColors: {
            low: config.chartColors && config.chartColors.low ? config.chartColors.low : '#22c55e',
            medium: config.chartColors && config.chartColors.medium ? config.chartColors.medium : '#facc15',
            high: config.chartColors && config.chartColors.high ? config.chartColors.high : '#dc2626',
            remaining: config.chartColors && config.chartColors.remaining ? config.chartColors.remaining : '#e2e8f0',
        },
    };
}

document.addEventListener('DOMContentLoaded', async () => {
    const siteInput = document.getElementById('siteSearchInput');
    const dateInput = document.getElementById('datePicker');
    const hiddenCostCenter = document.getElementById('selectedCostCenter');
    const dropdown = document.getElementById('siteDropdown');
    const dashboardMain = document.getElementById('dashboardMain');
    const userIdentityText = document.getElementById('userIdentityText');
    const userIdentitySource = document.getElementById('userIdentitySource');
    const userIdentityDerivedUser = document.getElementById('userIdentityDerivedUser');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const loadingOverlayText = document.getElementById('loadingOverlayText');
    const BOOTSTRAP_CONTEXT_KEY = 'bootstrapContextSession';
    const SITE_SELECTION_KEY = 'selectedSiteSession';
    let selectedSiteName = '';

    function getSiteDisplayValue(siteName, siteId) {
        const resolvedName = typeof siteName === 'string' ? siteName.trim() : '';
        const resolvedId = typeof siteId === 'string' || typeof siteId === 'number'
            ? String(siteId).trim()
            : '';

        if (resolvedName && resolvedId) {
            return `${resolvedName} (${resolvedId})`;
        }

        return resolvedName || resolvedId;
    }

    function saveSiteSelection(siteId, siteName, inputValue) {
        const resolvedId = typeof siteId === 'string' || typeof siteId === 'number'
            ? String(siteId).trim()
            : '';
        const resolvedName = typeof siteName === 'string' ? siteName.trim() : '';
        const resolvedInput = typeof inputValue === 'string' && inputValue.trim()
            ? inputValue.trim()
            : getSiteDisplayValue(resolvedName, resolvedId);

        if (!resolvedId) {
            sessionStorage.removeItem(SITE_SELECTION_KEY);
            return;
        }

        sessionStorage.setItem(SITE_SELECTION_KEY, JSON.stringify({
            costCenter: resolvedId,
            siteName: resolvedName,
            inputValue: resolvedInput,
        }));
    }

    function getSavedSiteSelection() {
        const rawValue = sessionStorage.getItem(SITE_SELECTION_KEY);
        if (!rawValue) return null;

        try {
            const parsed = JSON.parse(rawValue);
            const costCenter = parsed && parsed.costCenter ? String(parsed.costCenter).trim() : '';
            if (!costCenter) {
                sessionStorage.removeItem(SITE_SELECTION_KEY);
                return null;
            }

            return {
                costCenter,
                siteName: parsed && parsed.siteName ? String(parsed.siteName).trim() : '',
                inputValue: parsed && parsed.inputValue ? String(parsed.inputValue).trim() : '',
            };
        } catch (err) {
            sessionStorage.removeItem(SITE_SELECTION_KEY);
            return null;
        }
    }

    function clearSavedSiteSelection() {
        sessionStorage.removeItem(SITE_SELECTION_KEY);
    }

    function clearCurrentSiteSelection() {
        if (siteInput) siteInput.value = '';
        if (hiddenCostCenter) hiddenCostCenter.value = '';
        selectedSiteName = '';

        if (dashboardMain) dashboardMain.classList.add('hidden');
        document.getElementById('emptyState')?.classList.remove('hidden');
        updateClearButtonVisibility('');
    }

    function restoreSavedSiteSelection() {
        const savedSelection = getSavedSiteSelection();
        if (!savedSelection) {
            return false;
        }

        const matchedSite = allSites.find(site => String(site.id).trim() === savedSelection.costCenter);
        if (!matchedSite) {
            clearCurrentSiteSelection();
            return false;
        }

        const resolvedSiteName = String(matchedSite.name || savedSelection.siteName || '').trim();
        const resolvedInputValue = savedSelection.inputValue || getSiteDisplayValue(resolvedSiteName, matchedSite.id);

        if (siteInput) siteInput.value = resolvedInputValue;
        if (hiddenCostCenter) hiddenCostCenter.value = String(matchedSite.id).trim();
        selectedSiteName = resolvedSiteName;
        updateClearButtonVisibility(resolvedInputValue);
        saveSiteSelection(matchedSite.id, resolvedSiteName, resolvedInputValue);
        return true;
    }

    function showLoadingOverlay(message = 'Cargando datos del sitio...') {
        if (loadingOverlayText && message) {
            loadingOverlayText.textContent = message;
        }
        if (loadingOverlay) loadingOverlay.classList.remove('hidden');
    }

    function hideLoadingOverlay() {
        if (loadingOverlay) loadingOverlay.classList.add('hidden');
    }

    function setUserIdentityLabel(text) {
        if (!userIdentityText) return;
        const value = (typeof text === 'string' && text.trim()) ? text.trim() : 'Usuario no identificado';
        userIdentityText.textContent = value;
    }

    function setUserIdentitySource(source) {
        if (!userIdentitySource) return;

        const rawValue = (typeof source === 'string' && source.trim()) ? source.trim() : '';
        if (rawValue.includes('@')) {
            userIdentitySource.textContent = `Correo: ${rawValue}`;
            return;
        }

        const normalized = rawValue ? rawValue.toLowerCase() : 'anonymous';
        const labels = {
            launchpad: 'Source: launchpad',
            token: 'Source: token',
            local: 'Source: local',
            anonymous: 'Source: anonymous',
        };

        userIdentitySource.textContent = labels[normalized] || `Source: ${normalized}`;
    }

    function setUserIdentityDerivedUser(dbUser = '') {
        if (!userIdentityDerivedUser) return;

        const resolvedDbUser = (typeof dbUser === 'string' && dbUser.trim())
            ? dbUser.trim()
            : '';

        if (resolvedDbUser) {
            userIdentityDerivedUser.textContent = resolvedDbUser;
        } else {
            userIdentityDerivedUser.textContent = '—';
        }
    }

    function applyBootstrapContext(data) {
        const ctx = data && data.userContext ? data.userContext : {};
        setUserIdentityLabel(ctx && ctx.label ? ctx.label : 'Usuario no identificado');
        const userEmail = ctx && ctx.email ? String(ctx.email).trim() : '';
        const dbUser = ctx && ctx.dbUser ? String(ctx.dbUser).trim() : '';
        setUserIdentitySource(userEmail || (ctx && ctx.source ? ctx.source : 'anonymous'));
        setUserIdentityDerivedUser(dbUser);
    }

    function getSavedBootstrapContext() {
        const rawValue = sessionStorage.getItem(BOOTSTRAP_CONTEXT_KEY);
        if (!rawValue) return null;

        try {
            const parsed = JSON.parse(rawValue);
            if (!parsed || parsed.canProceed !== true) {
                sessionStorage.removeItem(BOOTSTRAP_CONTEXT_KEY);
                return null;
            }
            return parsed;
        } catch (err) {
            sessionStorage.removeItem(BOOTSTRAP_CONTEXT_KEY);
            return null;
        }
    }

    function saveBootstrapContext(data) {
        if (!data || data.canProceed !== true) {
            sessionStorage.removeItem(BOOTSTRAP_CONTEXT_KEY);
            return;
        }

        sessionStorage.setItem(BOOTSTRAP_CONTEXT_KEY, JSON.stringify(data));
    }

    async function loadBootstrapContext() {
        const cachedBootstrap = getSavedBootstrapContext();
        if (cachedBootstrap) {
            applyBootstrapContext(cachedBootstrap);
            return cachedBootstrap;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        try {
            const response = await fetch(`/api/bootstrap-context?_=${Date.now()}`, {
                method: 'GET',
                cache: 'no-store',
                signal: controller.signal,
            });

            if (!response.ok) {
                return null;
            }

            const data = await response.json();
            applyBootstrapContext(data);
            saveBootstrapContext(data);
            return data;
        } catch (err) {
            return null;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    // Configuración Inicial de Fecha y Límites
    const fechaHoy = new Date();
    const hoyStr = fechaHoy.toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });

    // Restamos exactamente 4 meses a la fecha actual
    const fechaMinima = new Date();
    fechaMinima.setMonth(fechaMinima.getMonth() - 4);
    const minStr = fechaMinima.toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });

    if (dateInput) {
        if (typeof window.flatpickr === 'function') {
            window.flatpickr(dateInput, {
                locale: window.flatpickr.l10ns.es,
                dateFormat: 'Y-m-d',
                defaultDate: hoyStr,
                maxDate: hoyStr,
                minDate: minStr,
                allowInput: false,
                disableMobile: true,
                monthSelectorType: 'static',
                onChange: function (_, dateStr) {
                    dateInput.value = dateStr;
                    dateInput.dispatchEvent(new Event('change', { bubbles: true }));
                },
            });
        } else {
            dateInput.value = hoyStr; // Fecha por defecto: hoy
            dateInput.max = hoyStr;   // Prohibido seleccionar el futuro
            dateInput.min = minStr;   // Prohibido viajar en el tiempo hace más de 4 meses
        }
    }

    // Cargar identidad de usuario con fallback seguro
    setUserIdentityLabel('Usuario no identificado');
    setUserIdentitySource('anonymous');
    setUserIdentityDerivedUser('');

    showLoadingOverlay('Validando acceso y conexión a base de datos...');
    const bootstrap = await loadBootstrapContext();
    const canProceed = !!(bootstrap && bootstrap.canProceed);
    window.__dbCanProceed = canProceed;
    const businessRole = ((bootstrap && bootstrap.businessRole) || 'SITIO').toString().trim().toUpperCase();
    document.body.classList.add('role-' + businessRole.toLowerCase());
    window.__businessRole = businessRole;

    if (!canProceed) {
        const msg = (bootstrap && bootstrap.message)
            ? bootstrap.message
            : 'No se pudo validar acceso a base de datos.';
        showLoadingOverlay(`Acceso bloqueado: ${msg}`);
        if (dropdown) {
            dropdown.innerHTML = '<li class="p-3 text-red-500 text-xs">Acceso no disponible. Contacta a soporte.</li>';
        }
        return;
    }

    hideLoadingOverlay();

    // Función auxiliar: obtener el módulo actual desde la URL
    function getCurrentModule() {
        const path = window.location.pathname;
        if (path.includes('/energia')) return 'energy';
        if (path.includes('/agua')) return 'water';
        if (path.includes('/gas')) return 'gas';
        if (path.includes('/temperatura')) return 'temperatura';
        return 'energy'; // default
    }

    const currentModule = getCurrentModule();
    if (typeof window.applyRoleVisibility === 'function') {
        window.applyRoleVisibility(businessRole, currentModule);
    }

    // Función auxiliar: cargar sitios del módulo actual con datos frescos
    // Estrategia: SIEMPRE consultar backend al entrar; cache local sólo como respaldo.
    async function loadSitesForModule() {
        if (!window.__dbCanProceed) return;

        const module = getCurrentModule();
        const siteEndpoint = `/api/sites/${module}`;
        const fallbackEndpoint = `/api/sites`;
        const cacheKey = `sites_${module}`;
        let hasRenderedFromNetwork = false;

        // Siempre pedir datos frescos al backend.
        showLoadingOverlay('Cargando datos del sitio...');

        try {
            const response = await fetch(`${siteEndpoint}?_=${Date.now()}`, { cache: 'no-store' });
            if (response.ok) {
                allSites = await response.json();
                // Guardar en caché
                localStorage.setItem(cacheKey, JSON.stringify({
                    data: allSites,
                    timestamp: Date.now()
                }));
                renderDropdown(allSites);
                hasRenderedFromNetwork = true;
                hideLoadingOverlay();
                console.log(`✓ Sitios frescos cargados para módulo: ${module}`);
                return;
            } else {
                throw new Error(`Endpoint específico devolvió ${response.status}`);
            }
        } catch (err) {
            console.warn(`⚠ Error en ${siteEndpoint}, intentando fallback global...`, err);
            try {
                const fallbackResponse = await fetch(`${fallbackEndpoint}?_=${Date.now()}`, { cache: 'no-store' });
                if (fallbackResponse.ok) {
                    allSites = await fallbackResponse.json();
                    // Guardar fallback en caché también
                    localStorage.setItem(cacheKey, JSON.stringify({
                        data: allSites,
                        timestamp: Date.now()
                    }));
                    renderDropdown(allSites);
                    hasRenderedFromNetwork = true;
                    hideLoadingOverlay();
                    console.log(`✓ Sitios frescos cargados desde fallback global`);
                    return;
                }
            } catch (fallbackErr) {
                console.error("✗ Fallback global también falló", fallbackErr);
            }
        }

        // Si todo falla, intentar cache local como respaldo de continuidad.
        if (!hasRenderedFromNetwork) {
            const cached = localStorage.getItem(cacheKey);
            if (cached) {
                try {
                    const parsed = JSON.parse(cached);
                    if (parsed && Array.isArray(parsed.data) && parsed.data.length > 0) {
                        allSites = parsed.data;
                        renderDropdown(allSites);
                        hideLoadingOverlay();
                        console.warn(`⚠ Mostrando sitios en cache por fallo de red/API: ${module}`);
                        return;
                    }
                } catch (cacheErr) {
                    console.warn(`⚠ No se pudo leer cache local de ${module}`, cacheErr);
                }
            }
        }

        // Si no hubo red ni cache válido, mostrar mensaje de error.
        hideLoadingOverlay();
        if (dropdown) {
            dropdown.innerHTML = '<li class="p-3 text-red-500 text-xs">No se pudieron cargar los sitios. Intenta recargar.</li>';
        }
    }

    // 1. Cargar Sitios Inicialmente
    await loadSitesForModule();
    const restoredSelection = restoreSavedSiteSelection();
    if (restoredSelection) {
        triggerDashboardRefresh();
    }

    // --- LÓGICA DEL COMBOBOX ---
    function updateClearButtonVisibility(value) {
        const clearBtn = document.getElementById('clearSiteSearchBtn');
        if (!clearBtn) return;

        if (value.trim().length > 0) {
            clearBtn.classList.remove('hidden');
        } else {
            clearBtn.classList.add('hidden');
        }
    }

    if (siteInput) {
        siteInput.addEventListener('focus', () => {
            dropdown.classList.remove('hidden');
            renderDropdown(allSites, siteInput.value);
        });

        siteInput.addEventListener('input', (e) => {
            dropdown.classList.remove('hidden');
            renderDropdown(allSites, e.target.value);

            // Si borra el texto, quitar selección
            if (e.target.value.trim() === '') {
                clearSavedSiteSelection();
                clearCurrentSiteSelection();
            }

            updateClearButtonVisibility(e.target.value);
        });
    }

    // 2. Listener para botón X de limpiar búsqueda
    const clearBtn = document.getElementById('clearSiteSearchBtn');
    if (clearBtn && siteInput) {
        clearBtn.addEventListener('click', () => {
            // Limpiar input
            siteInput.focus();
            clearSavedSiteSelection();
            clearCurrentSiteSelection();
             
            // Mostrar dropdown con lista completa
            dropdown.classList.remove('hidden');
            renderDropdown(allSites, '');
             
            console.log('✓ Búsqueda limpiada');
        });
    }

    // --- LÓGICA DEL COMBOBOX HANDLER ---
    if (siteInput) {
    }

    document.addEventListener('click', (e) => {
        const container = document.getElementById('siteComboContainer');
        if (container && !container.contains(e.target) && dropdown) {
            dropdown.classList.add('hidden');
        }
    });

    function renderDropdown(sites, searchTerm = '') {
        if (!dropdown) return;
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

            li.innerHTML = `
                <span class="font-medium truncate pr-4">${site.name}</span>
                <span class="text-xs text-slate-400 dark:text-slate-500 shrink-0 font-mono bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md">
                    ${site.id}
                </span>
            `;

            li.addEventListener('click', () => {
                const displayValue = getSiteDisplayValue(site.name, site.id);
                siteInput.value = displayValue;
                updateClearButtonVisibility(displayValue);
                hiddenCostCenter.value = site.id;
                selectedSiteName = site.name;
                saveSiteSelection(site.id, site.name, displayValue);
                dropdown.classList.add('hidden');

                // DISPARAR BÚSQUEDA GLOBAL
                triggerDashboardRefresh();
            });

            dropdown.appendChild(li);
        });
    }

    // --- DISPARADORES ---
    if (dateInput) dateInput.addEventListener('change', triggerDashboardRefresh);

    function triggerDashboardRefresh() {
        if (!window.__dbCanProceed) return;

        const costCenter = hiddenCostCenter ? hiddenCostCenter.value : null;
        const date = dateInput ? dateInput.value : null;

        if (!costCenter) return;

        window.showLoading(true);
        if (dashboardMain) dashboardMain.classList.remove('hidden');
        document.getElementById('emptyState')?.classList.add('hidden');

        const inputName = siteInput ? siteInput.value : costCenter;
        const siteName = selectedSiteName || '';

        // Disparamos un evento custom para que 'energia.js', 'agua.js', etc, lo escuchen y procesen su propia data
        const event = new CustomEvent('DashboardRefreshRequired', {
            detail: { costCenter, date, inputName, siteName }
        });
        document.dispatchEvent(event);
    }
});

// --- FUNCIONES UTILITARIAS GLOBALES ---
window.showLoading = function (show) {
    const el = document.getElementById('loadingOverlay');
    if (!el) return;
    if (show) el.classList.remove('hidden');
    else el.classList.add('hidden');
}

window.fetchData = async function (url, costCenter, date, siteName = '') {
    if (!window.__dbCanProceed) {
        return null;
    }

    try {
        const siteNameParam = siteName ? `&sitename=${encodeURIComponent(siteName)}` : '';
        const res = await fetch(`${url}?costcenter=${encodeURIComponent(costCenter)}&date=${encodeURIComponent(date)}${siteNameParam}`);
        if (!res.ok) return null;
        return await res.json();
    } catch (e) {
        return null;
    }
}

window.applyProgressBarThresholdColor = function (progressBar, strictPct, shouldPulse = false) {
    if (!progressBar) return;

    const progressBarConfig = getProgressBarConfig();
    const removableColorClasses = Array.from(new Set([
        'bg-green-500',
        'bg-yellow-400',
        'bg-red-600',
        progressBarConfig.colors.low,
        progressBarConfig.colors.medium,
        progressBarConfig.colors.high,
    ]));
    const visuals = window.getProgressThresholdVisuals(strictPct);

    progressBar.classList.remove(...removableColorClasses, 'animate-pulse');
    progressBar.classList.add(visuals.barClass);

    if (shouldPulse) {
        progressBar.classList.add('animate-pulse');
    }
}

window.getProgressThresholdVisuals = function (strictPct) {
    const normalizedPct = Number.isFinite(strictPct) ? strictPct : 0;
    const progressBarConfig = getProgressBarConfig();

    if (normalizedPct > progressBarConfig.thresholds.yellowMax) {
        return {
            barClass: progressBarConfig.colors.high,
            chartColor: progressBarConfig.chartColors.high,
        };
    }

    if (normalizedPct > progressBarConfig.thresholds.greenMax) {
        return {
            barClass: progressBarConfig.colors.medium,
            chartColor: progressBarConfig.chartColors.medium,
        };
    }

    return {
        barClass: progressBarConfig.colors.low,
        chartColor: progressBarConfig.chartColors.low,
    };
}

window.getProgressRemainingChartColor = function () {
    return getProgressBarConfig().chartColors.remaining;
}

// --- LOGICA DE UI (TEMA OSCURO Y SIDEBAR) ---
const THEME_KEY = 'themePreference';

document.addEventListener('DOMContentLoaded', () => {
    // 1. Tema oscuro con persistencia
    const btn = document.getElementById('themeToggle');
    const dateInput = document.getElementById('datePicker');
    const openDatePickerBtn = document.getElementById('openDatePickerBtn');

    function applySavedTheme() {
        const savedTheme = localStorage.getItem(THEME_KEY);
        if (savedTheme === 'dark') {
            document.documentElement.classList.add('dark');
        } else if (savedTheme === 'light') {
            document.documentElement.classList.remove('dark');
        } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            document.documentElement.classList.add('dark');
        }
    }

    function saveTheme(isDark) {
        localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
    }

    applySavedTheme();

    if (btn) {
        btn.addEventListener('click', () => {
            const isDark = document.documentElement.classList.toggle('dark');
            saveTheme(isDark);
        });
    }

    if (openDatePickerBtn && dateInput) {
        openDatePickerBtn.addEventListener('click', () => {
            if (dateInput._flatpickr) {
                dateInput._flatpickr.open();
                return;
            }

            if (typeof dateInput.showPicker === 'function') {
                dateInput.showPicker();
                return;
            }

            dateInput.focus();
            dateInput.click();
        });
    }

    // 2. Transiciones Sidebar Centralizada
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const toggleBtn = document.getElementById('toggleSidebarBtn');
    const iconHamburger = document.getElementById('iconHamburger');
    const iconClose = document.getElementById('iconClose');

    let isSidebarOpen = false;

    function setSidebarState(open) {
        isSidebarOpen = open;
        if (open) {
            // Icons
            if (iconHamburger) iconHamburger.classList.add('hidden');
            if (iconClose) iconClose.classList.remove('hidden');
            // Mobile
            if (sidebar) sidebar.classList.remove('-translate-x-full');
            if (sidebarOverlay) {
                sidebarOverlay.classList.remove('hidden');
                setTimeout(() => sidebarOverlay.classList.remove('opacity-0'), 10);
            }
            // Desktop
            if (sidebar) sidebar.classList.remove('md:-ml-64');
        } else {
            // Icons
            if (iconHamburger) iconHamburger.classList.remove('hidden');
            if (iconClose) iconClose.classList.add('hidden');
            // Mobile
            if (sidebar) sidebar.classList.add('-translate-x-full');
            if (sidebarOverlay) {
                sidebarOverlay.classList.add('opacity-0');
                setTimeout(() => sidebarOverlay.classList.add('hidden'), 300);
            }
            // Desktop
            if (sidebar) sidebar.classList.add('md:-ml-64');
        }
    }

    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            setSidebarState(!isSidebarOpen);
        });
    }

    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', () => {
            if (isSidebarOpen) setSidebarState(false);
        });
    }
});

// --- CARRUSEL GLOBAL (Auto-rastreo de Tarjetas) ---
document.addEventListener('DOMContentLoaded', () => {
    // 1. Buscamos TODOS los contenedores de tarjetas escondidas del proyecto (Energía, Agua, Gas...)
    const contenedoresTarjeta = document.querySelectorAll('.hide-scrollbar');

    contenedoresTarjeta.forEach(contenedor => {
        // 2. Iniciamos un reloj que se mueva cada 4 segundos
        let autoScroll = setInterval(moverCarrusel, 4000);

        function moverCarrusel() {
            // Revisa si ya llegamos al final de la pantalla a la derecha
            if (contenedor.scrollLeft + contenedor.clientWidth >= contenedor.scrollWidth - 10) {
                // Regresa al inicio de golpe (modo loop)
                contenedor.scrollTo({ left: 0, behavior: 'smooth' });
            } else {
                // O desliza el ancho de una tarjeta suavemente a la derecha (~180px)
                contenedor.scrollBy({ left: 180, behavior: 'smooth' });
            }
        }

        // 3. UX de Oro: Si el usuario pone el mouse encima para leer el billete, PAUSAR el carrusel
        contenedor.addEventListener('mouseenter', () => clearInterval(autoScroll));
        contenedor.addEventListener('touchstart', () => clearInterval(autoScroll));

        // Y cuando quite el mouse de esa tarjeta, reanudar el paseo suavemente..
        contenedor.addEventListener('mouseleave', () => {
            autoScroll = setInterval(moverCarrusel, 4000);
        });
        contenedor.addEventListener('touchend', () => {
            autoScroll = setInterval(moverCarrusel, 4000);
        });
    });
});
