// rbac-config.js - Configuracion central frontend (RBAC + UI)

(function () {
    const DEFAULT_ROLE = 'SITIO';
    const FRONTEND_UI_CONFIG = {
        progressBars: {
            thresholds: {
                greenMax: 40,
                yellowMax: 80,
            },
            colors: {
                low: 'bg-green-500',
                medium: 'bg-yellow-400',
                high: 'bg-red-600',
            },
            chartColors: {
                low: '#22c55e',
                medium: '#facc15',
                high: '#dc2626',
                remaining: '#e2e8f0',
            },
        },
        kpiCards: {
            colors: {
                low: {
                    container: 'bg-green-50 border-green-200 dark:bg-green-500/10 dark:border-green-500/30',
                    title: 'text-green-700 dark:text-green-300',
                    value: 'text-green-700 dark:text-green-300',
                    muted: 'text-green-600 dark:text-green-400',
                },
                medium: {
                    container: 'bg-yellow-50 border-yellow-200 dark:bg-yellow-400/10 dark:border-yellow-400/30',
                    title: 'text-yellow-700 dark:text-yellow-300',
                    value: 'text-yellow-700 dark:text-yellow-300',
                    muted: 'text-yellow-600 dark:text-yellow-400',
                },
                high: {
                    container: 'bg-red-50 border-red-200 dark:bg-red-500/10 dark:border-red-500/30',
                    title: 'text-red-700 dark:text-red-300',
                    value: 'text-red-700 dark:text-red-300',
                    muted: 'text-red-600 dark:text-red-400',
                },
            },
        },
    };

    const RBAC_VISIBILITY_CONFIG = {
        energy: {
            ADMIN: {
                hide: ['#energyCardPfAvg', '#energySectionHourlyConsumption'],
            },
            SITIO: {
                hide: ['#energyCardAvgPrice', '#energyCardCostPerKwh'],
            },
            GERENCIA: {
                hide: ['#energyCardAvgPrice', '#energyCardCostPerKwh'],
            },
        },
        water: {
            ADMIN: {
                hide: ['#waterSectionHourlyConsumption'],
            },
            SITIO: {
                hide: [],
            },
            GERENCIA: {
                hide: [],
            },
        },
        gas: {
            ADMIN: {
                hide: ['#gasSectionHourlyConsumption'],
            },
            SITIO: {
                hide: [],
            },
            GERENCIA: {
                hide: [],
            },
        },
        temperatura: {
            ADMIN: {
                hide: ['#tempCardAvg', '#tempCardRange', '#tempSectionHourlyChart'],
            },
            SITIO: {
                hide: [],
            },
            GERENCIA: {
                hide: [],
            },
        },
    };

    function normalizeRole(role) {
        const safeRole = (role || DEFAULT_ROLE).toString().trim().toUpperCase();
        return safeRole || DEFAULT_ROLE;
    }

    function collectModuleSelectors(moduleConfig) {
        const selectors = new Set();
        Object.values(moduleConfig || {}).forEach((roleConfig) => {
            (roleConfig.hide || []).forEach((selector) => selectors.add(selector));
        });
        return Array.from(selectors);
    }

    function toggleSelector(selector, shouldHide) {
        const elements = document.querySelectorAll(selector);
        elements.forEach((el) => {
            el.classList.toggle('rbac-hidden', shouldHide);
        });
    }

    function applyRoleVisibility(role, moduleName) {
        const normalizedRole = normalizeRole(role);
        const moduleConfig = RBAC_VISIBILITY_CONFIG[moduleName];
        if (!moduleConfig) return;

        const allSelectors = collectModuleSelectors(moduleConfig);
        allSelectors.forEach((selector) => toggleSelector(selector, false));

        const roleConfig = moduleConfig[normalizedRole] || moduleConfig[DEFAULT_ROLE] || { hide: [] };
        (roleConfig.hide || []).forEach((selector) => toggleSelector(selector, true));
    }

    window.RBAC_VISIBILITY_CONFIG = RBAC_VISIBILITY_CONFIG;
    window.FRONTEND_UI_CONFIG = FRONTEND_UI_CONFIG;
    window.applyRoleVisibility = applyRoleVisibility;
})();
