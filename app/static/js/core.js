// core.js - Maneja interacciones globales (Menú, Tema, Buscador)

// Variables Globales base
let allSites = [];

document.addEventListener('DOMContentLoaded', async () => {
    const siteInput = document.getElementById('siteSearchInput');
    const dateInput = document.getElementById('datePicker');
    const hiddenCostCenter = document.getElementById('selectedCostCenter');
    const dropdown = document.getElementById('siteDropdown');
    const dashboardMain = document.getElementById('dashboardMain');
    const userIdentityText = document.getElementById('userIdentityText');
    const userIdentitySource = document.getElementById('userIdentitySource');
    const userIdentityDerivedUser = document.getElementById('userIdentityDerivedUser');

    function setUserIdentityLabel(text) {
        if (!userIdentityText) return;
        const value = (typeof text === 'string' && text.trim()) ? text.trim() : 'Usuario no identificado';
        userIdentityText.textContent = value;
    }

    function extractDerivedUserFromEmail(email) {
        if (!email || !email.includes('@')) return '';
        const localPart = email.split('@')[0];
        // Remover puntos, guiones bajos, comas y tomar los primeros 20 caracteres
        return localPart
            .substring(0, 20)
            .replace(/[._,]/g, '')
            .toUpperCase();
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

    function setUserIdentityDerivedUser(email) {
        if (!userIdentityDerivedUser) return;
        
        if (email) {
            const derivedUser = extractDerivedUserFromEmail(email);
            userIdentityDerivedUser.textContent = derivedUser || 'Usuario derivado no disponible';
        } else {
            userIdentityDerivedUser.textContent = '—';
        }
    }

    async function loadUserContext() {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);

        try {
            const response = await fetch(`/api/user-context?_=${Date.now()}`, {
                method: 'GET',
                cache: 'no-store',
                signal: controller.signal,
            });

            if (!response.ok) {
                setUserIdentityLabel('Usuario no identificado');
                setUserIdentitySource('anonymous');
                return;
            }

            const data = await response.json();
            setUserIdentityLabel(data && data.label ? data.label : 'Usuario no identificado');
            const userEmail = data && data.email ? String(data.email).trim() : '';
            setUserIdentitySource(userEmail || (data && data.source ? data.source : 'anonymous'));
            setUserIdentityDerivedUser(userEmail);
        } catch (err) {
            setUserIdentityLabel('Usuario no identificado');
            setUserIdentitySource('anonymous');
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
        dateInput.value = hoyStr; // Fecha por defecto: hoy
        dateInput.max = hoyStr;   // Prohibido seleccionar el futuro
        dateInput.min = minStr;   // Prohibido viajar en el tiempo hace más de 4 meses
    }

    // Cargar identidad de usuario con fallback seguro
    setUserIdentityLabel('Usuario no identificado');
    setUserIdentitySource('anonymous');
    await loadUserContext();

    // Función auxiliar: obtener el módulo actual desde la URL
    function getCurrentModule() {
        const path = window.location.pathname;
        if (path.includes('/energia')) return 'energy';
        if (path.includes('/agua')) return 'water';
        if (path.includes('/gas')) return 'gas';
        if (path.includes('/temperatura')) return 'temperatura';
        return 'energy'; // default
    }

    // Función auxiliar: cargar sitios del módulo actual con datos frescos
    // Estrategia: SIEMPRE consultar backend al entrar; cache local sólo como respaldo.
    async function loadSitesForModule() {
        const module = getCurrentModule();
        const siteEndpoint = `/api/sites/${module}`;
        const fallbackEndpoint = `/api/sites`;
        const cacheKey = `sites_${module}`;
        let hasRenderedFromNetwork = false;
        
        // Mostrar overlay de carga
        function showLoadingOverlay() {
            const overlay = document.getElementById('loadingOverlay');
            if (overlay) overlay.classList.remove('hidden');
        }
        
        function hideLoadingOverlay() {
            const overlay = document.getElementById('loadingOverlay');
            if (overlay) overlay.classList.add('hidden');
        }

        // Siempre pedir datos frescos al backend.
        showLoadingOverlay();

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

    // 1b. Listener de navegación entre módulos (para limpiar estado y recargar sitios)
    const navLinks = document.querySelectorAll('a[href*=\"/energia\"], a[href*=\"/agua\"], a[href*=\"/gas\"], a[href*=\"/temperatura\"]');
    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            // Limpiar selección de sitio cuando navegas a otro módulo
            if (siteInput) siteInput.value = '';
            if (hiddenCostCenter) hiddenCostCenter.value = '';
            if (dashboardMain) dashboardMain.classList.add('hidden');
            document.getElementById('emptyState')?.classList.remove('hidden');
            // Nota: Los sitios se recargarán automáticamente cuando DOMContentLoaded se dispare en la nueva página
            console.log(`→ Navegando a nuevo módulo, limpiando estado...`);
        });
    });

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
                hiddenCostCenter.value = '';
                dashboardMain.classList.add('hidden');
                document.getElementById('emptyState')?.classList.remove('hidden');
            }

            updateClearButtonVisibility(e.target.value);
        });
    }

    // 2. Listener para botón X de limpiar búsqueda
    const clearBtn = document.getElementById('clearSiteSearchBtn');
    if (clearBtn && siteInput) {
        clearBtn.addEventListener('click', () => {
            // Limpiar input
            siteInput.value = '';
            siteInput.focus();
            
            // Limpiar selección de sitio
            hiddenCostCenter.value = '';
            
            // Ocultar dashboard y mostrar empty state
            if (dashboardMain) dashboardMain.classList.add('hidden');
            document.getElementById('emptyState')?.classList.remove('hidden');
            
            // Mostrar dropdown con lista completa
            dropdown.classList.remove('hidden');
            renderDropdown(allSites, '');
            
            // Ocultar botón X
            clearBtn.classList.add('hidden');
            
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
                siteInput.value = `${site.name} (${site.id})`;
                updateClearButtonVisibility(siteInput.value);
                hiddenCostCenter.value = site.id;
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
        const costCenter = hiddenCostCenter ? hiddenCostCenter.value : null;
        const date = dateInput ? dateInput.value : null;

        if (!costCenter) return;

        window.showLoading(true);
        if (dashboardMain) dashboardMain.classList.remove('hidden');
        document.getElementById('emptyState')?.classList.add('hidden');

        const inputName = siteInput ? siteInput.value : costCenter;

        // Disparamos un evento custom para que 'energia.js', 'agua.js', etc, lo escuchen y procesen su propia data
        const event = new CustomEvent('DashboardRefreshRequired', {
            detail: { costCenter, date, inputName }
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

window.fetchData = async function (url, costCenter, date) {
    try {
        const res = await fetch(`${url}?costcenter=${encodeURIComponent(costCenter)}&date=${encodeURIComponent(date)}`);
        if (!res.ok) return null;
        return await res.json();
    } catch (e) {
        return null;
    }
}

// --- LOGICA DE UI (TEMA OSCURO Y SIDEBAR) ---
const THEME_KEY = 'themePreference';

document.addEventListener('DOMContentLoaded', () => {
    // 1. Tema oscuro con persistencia
    const btn = document.getElementById('themeToggle');

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
