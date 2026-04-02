// core.js - Maneja interacciones globales (Menú, Tema, Buscador)

// Variables Globales base
let allSites = [];

document.addEventListener('DOMContentLoaded', async () => {
    const siteInput = document.getElementById('siteSearchInput');
    const dateInput = document.getElementById('datePicker');
    const hiddenCostCenter = document.getElementById('selectedCostCenter');
    const dropdown = document.getElementById('siteDropdown');
    const dashboardMain = document.getElementById('dashboardMain');

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

    // 1. Cargar Sitios
    try {
        const response = await fetch('/api/sites');
        allSites = await response.json();
        renderDropdown(allSites);
    } catch (err) {
        console.error("Error cargando sitios:", err);
        if (dropdown) dropdown.innerHTML = '<li class="p-3 text-red-500 text-xs">Error cargando sitios</li>';
    }

    // --- LÓGICA DEL COMBOBOX ---
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
        });
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
