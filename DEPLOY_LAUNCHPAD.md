# Deploy rapido a SAP BTP CF + prueba en Launchpad

## 1) Prerrequisitos
- Tener `cf` CLI autenticado al org/space objetivo.
- Tener acceso a una instancia SAP HANA existente y sus credenciales.
- Cargar las credenciales HANA por `.env` en local y por variables de entorno en Cloud Foundry.
- Ajustar nombre del servicio XSUAA en `manifest.yml` si no coincide con tu subaccount.

## 2) Crear servicio XSUAA (si aun no existe)

```bash
cf create-service xsuaa application snbrns-reporte-kpis-dev-xsuaa -c xs-security.json
cf services
```

Espera a que `snbrns-reporte-kpis-dev-xsuaa` aparezca como `create succeeded`.

## 3) Configurar variables de entorno HANA en Cloud Foundry

La app **no** requiere binding HANA en `manifest.yml`. La conexion se crea en codigo y toma credenciales desde variables de entorno.

Configura estas variables antes del despliegue o inmediatamente despues:

```bash
cf set-env snbrns-reporte-kpis-dev HANA_HOST <host>
cf set-env snbrns-reporte-kpis-dev HANA_PORT <port>
cf set-env snbrns-reporte-kpis-dev HANA_UID <user>
cf set-env snbrns-reporte-kpis-dev HANA_PWD <password>
cf set-env snbrns-reporte-kpis-dev HANA_SCHEMA <schema>
```

Si prefieres, puedes usar `HANA_USER` y `HANA_PASSWORD` en lugar de `HANA_UID` y `HANA_PWD`.

### Modo de autenticacion de BD (`DB_AUTH_MODE`)

La aplicacion soporta tres modos:

- `technical`: usa el usuario tecnico (`HANA_UID`/`HANA_USER`).
- `derived`: usa el usuario derivado del correo del usuario autenticado en Work Zone.
- `auto`: intenta `derived`; si no puede derivar usuario, cae a `technical`.

Configuracion recomendada:

- Local/.env: `DB_AUTH_MODE=technical`
- Cloud Foundry (Work Zone): `DB_AUTH_MODE=derived`

### Correo local para desarrollo

Si en local no llega el correo desde Launchpad o desde el token, puedes definirlo en `.env` para que la app siga el flujo normal de roles y acceso a datos usando ese correo.

Variables soportadas:

- `LOCAL_EMAIL=<correo>`
- `APP_LOCAL_USER_EMAIL=<correo>`

La prioridad local es:

1. `APP_LOCAL_USER_EMAIL`
2. `LOCAL_EMAIL`

Recomendacion:

- Usa solo una de las dos variables.
- Para desactivar el comportamiento local, elimina o deja vacia la variable.
- El correo configurado debe existir en la tabla de roles; si no existe, la app seguira bloqueando el acceso como hoy.

Ejemplo en CF:

```bash
cf set-env snbrns-reporte-kpis-dev DB_AUTH_MODE derived
cf restage snbrns-reporte-kpis-dev
```

## 4) Desplegar app Flask

```bash
cf push
cf restage snbrns-reporte-kpis-dev
```

## 5) Validar bindings y entorno

```bash
cf app snbrns-reporte-kpis-dev
cf env snbrns-reporte-kpis-dev
cf logs snbrns-reporte-kpis-dev --recent
```

Validar que `VCAP_SERVICES` incluya XSUAA y que las variables `HANA_*` esten presentes en el entorno.

## 6) Endpoint de identidad

Probar endpoint:

```bash
curl https://<url-app>/api/user-context
```

Respuesta esperada (fuera de launchpad):
- `authenticated: false`
- `source: anonymous` o `source: local`
- `label: Usuario no identificado` (si no hay variables locales)

Con `LOCAL_EMAIL` o `APP_LOCAL_USER_EMAIL` configurado en local, la respuesta debe incluir `source: local` y el correo resuelto en `email`.

## 7) Integracion con Work Zone

### Opcion A: URL directa de la app (rapida)
- Publicar la URL de la app como destino en Work Zone.
- Al abrir desde Work Zone, validar que la tarjeta de usuario en UI muestre identidad.

### Opcion B: usando approuter y `xs-app.json`
- Crear destination `backend` en BTP apuntando a la URL de la app.
- Asegurar autenticacion `xsuaa` en el approuter.
- El archivo `xs-app.json` del repo ya enruta `^/api/(.*)$` y `^/(.*)$` con auth `xsuaa`.

## 8) Asignacion de roles

En BTP cockpit:
1. Crear role collection con plantilla `Viewer` (de `xs-security.json`).
2. Asignar role collection al usuario de prueba.
3. Reingresar a Work Zone y validar acceso.

## 9) Control de acceso por rol (RBAC)

La app consume la vista `CV_USERROLES` en HANA para determinar si el usuario es `ADMIN` o `TECNICO`.

### Variables de entorno requeridas

```bash
cf set-env snbrns-reporte-kpis-dev HANA_VIEW_USERROLES "globalhitss.ee.models.CalculationViews::CV_USERROLES"
```

> En `.env` local ya esta configurado. En CF se debe añadir manualmente.

### Comportamiento por rol

| Funcionalidad | ADMIN | TECNICO |
|---|---|---|
| Energía: Factor potencia + gráfica Consumo Diario por Hora | ✗ oculto | ✓ |
| Energía: Precio promedio por kWh + Costo por kWh | ✓ | ✗ oculto |
| Agua: Consumo Diario por Hora | ✗ oculto | ✓ |
| Gas: Consumo Diario por Hora | ✗ oculto | ✓ |
| Temperatura: Promedio + Min/Max + gráfica por hora | ✗ oculto | ✓ |

### Flujo de resolución de rol

1. `bootstrap-context` llama `get_user_role_from_hana(email, derived_user)`.
2. Si el usuario no existe en `CV_USERROLES`, el rol cae a `TECNICO` (deny-by-default).
3. El frontend recibe `businessRole` en la respuesta del bootstrap.
4. `core.js` aplica la clase CSS `role-tecnico` o `role-admin` en `<body>`.
5. Los elementos con clase `role-tecnico-hide` y `role-admin-hide` se ocultan via CSS.
6. Los endpoints backend retornan payload completo; la restricción es solo visual (frontend).

### Vista HANA requerida

```sql
-- Estructura esperada de CV_USERROLES
SELECT "ROL_V", "EMAIL", "USER" FROM "<SCHEMA>"."globalhitss.ee.models.CalculationViews::CV_USERROLES"
-- ROL_V debe ser 'ADMIN' o 'TECNICO'
```

## 10) Troubleshooting rapido
- Error de bind de servicio: revisar nombre de XSUAA en `manifest.yml`.
- Error de conexion HANA: revisar `cf env snbrns-reporte-kpis-dev` y confirmar `HANA_HOST`, `HANA_PORT`, `HANA_UID`/`HANA_USER`, `HANA_PWD`/`HANA_PASSWORD` y `HANA_SCHEMA`.
- Sin identidad en Launchpad: revisar headers/token entregados por el flujo de acceso.
- Error de DB: revisar `HANA_SCHEMA`, vistas y conectividad en logs.
- Si existe approuter, validar destination `backend` y reglas de `xs-app.json`.
