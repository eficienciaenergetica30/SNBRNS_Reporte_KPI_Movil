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

## 9) Troubleshooting rapido
- Error de bind de servicio: revisar nombre de XSUAA en `manifest.yml`.
- Error de conexion HANA: revisar `cf env snbrns-reporte-kpis-dev` y confirmar `HANA_HOST`, `HANA_PORT`, `HANA_UID`/`HANA_USER`, `HANA_PWD`/`HANA_PASSWORD` y `HANA_SCHEMA`.
- Sin identidad en Launchpad: revisar headers/token entregados por el flujo de acceso.
- Error de DB: revisar `HANA_SCHEMA`, vistas y conectividad en logs.
- Si existe approuter, validar destination `backend` y reglas de `xs-app.json`.
