// rbac-config.js - Configuracion central de visibilidad por rol y modulo (frontend-only)

(function () {
    const DEFAULT_ROLE = 'SITIO';

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
    window.applyRoleVisibility = applyRoleVisibility;
})();
