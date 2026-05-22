# Production Baseline Recovery

## Estado

Recovery creado para evitar deploys desde un `HEAD` viejo que no representa la produccion vigente de MIMIGO Servicios.

## Produccion vigente identificada

- Dominio: `https://mimigo.com.ar`
- Proyecto Vercel: `mimi-transporte`
- Project ID: `prj_QrvuvG36zRfUxrQqRVy0KBzAZ74h`
- Deployment actual: `dpl_FTeZP9yyH578zXUnTJBCxziERk3D`
- Deployment URL: `https://mimi-transporte-3518ivlwp-paulomillanez1983s-projects.vercel.app`
- Estado: `Ready`
- Target: `production`
- Creado: `2026-05-20 22:24:38 ART`
- Aliases:
  - `https://mimigo.com.ar`
  - `https://mimi-transporte.vercel.app`
  - `https://mimi-transporte-paulomillanez1983s-projects.vercel.app`
  - `https://mimi-transporte-paulomillanez1983-paulomillanez1983s-projects.vercel.app`

## Fuente local valida

- Usar: `C:\Users\paulo\OneDrive\Documentos\GitHub\mimi-transporte`
- No usar: `C:\Users\paulo\OneDrive\Documentos\GitHub\mimi-transporte-servicios-release`
- No usar como deployable directo: `HEAD` local `b6b0a9f` hasta completar recovery.

## Comparacion de assets criticos

Assets descargados a `C:\tmp\mimigo-prod-assets` para comparacion read-only.

| Asset | Estado contra `mimi-transporte` |
| --- | --- |
| `mimi-servicios/prestador.html` | Coincide con produccion por SHA256 |
| `mimi-servicios/src/services/runtime-config.js` | Coincide con produccion por SHA256 |
| `mimi-servicios/src/security/risk-events.js` | Coincide con produccion por SHA256 |
| `mimi-servicios/src/utils/document-image-quality.js` | Coincide con produccion por SHA256 |
| `mimi-servicios/cliente.html` | Local mas nuevo que produccion |
| `mimi-servicios/src/main-provider.js` | Local difiere de produccion; contiene trabajo posterior |
| `mimi-servicios/src/main-client.js` | Local difiere de produccion; contiene trabajo posterior |
| `mimi-servicios/src/services/service-api.js` | Local difiere de produccion; contiene trabajo posterior |
| `/admin/admin-panel.html` productivo | Esta atrasado; no contiene Clientes ni Catalogo Inteligente |
| `/mimi-servicios/admin/admin-panel.html` productivo | No publicado en el deployment actual |
| `mimi-servicios/admin/admin-panel.html` local | Mas avanzado; contiene Prestadores/KYC, Clientes, Catalogo, Finanzas y Soporte |

## Diagnostico

El bloqueo no viene de Admin Catalogo. El bloqueo viene de que `HEAD` no contiene la baseline productiva vigente ni los archivos locales de hardening/foundation necesarios para pasar QA.

Un worktree creado desde `HEAD` falla porque faltan, entre otros:

- `MIMI_REMOTE_BOOTSTRAP_ENABLED` en runtime/configuracion.
- `mimi-servicios/src/security/risk-events.js`.
- `mimi-servicios/src/security/fingerprint-client.js`.
- `mimi-servicios/src/utils/document-image-quality.js`.
- `mimi-servicios/qa/*` de hardening/foundation/admin.
- Migrations de Service Intelligence Foundation.
- Funciones locales requeridas por QA, incluyendo `svc-save-provider-service`.
- Admin avanzado versionado dentro de `mimi-servicios/admin`.

## Archivos que deben preservarse en cualquier baseline deployable

- Wallet del prestador.
- `providerPayoutAccount`.
- `walletLoading`.
- Notificaciones.
- `notificationBadge`.
- `notificationsDrawer`.
- `sheetNotificationBell`.
- Login actual.
- `provider-auth`.
- Google login.
- Lock `mimi_services_provider_auth`.
- `svc-save-provider-service`.
- `MIMI_REMOTE_BOOTSTRAP_ENABLED`.
- `risk-events.js`.
- `fingerprint-client.js`.
- `document-image-quality.js`.
- Admin con Prestadores/KYC, Clientes, Finanzas y Soporte.
- Admin Catalogo Inteligente read-only cuando se incluya la fase admin.
- Docs y QA de Service Intelligence Foundation.
- Docs y migrations de Publication Hardening Release Train.

## Estrategia de recovery

1. No desplegar desde `HEAD`.
2. No desplegar desde `mimi-transporte-servicios-release`.
3. Usar `mimi-transporte` como staging real de recovery porque contiene los hotfixes de prestador y la foundation local.
4. Crear un worktree de recovery desde el commit mas cercano solo cuando pueda recibir todos los archivos preservados.
5. Aplicar parches por paquetes controlados:
   - Baseline publica prestador/cliente.
   - Admin avanzado y guardrails.
   - Service Intelligence docs/QA/migrations.
   - Hardening docs/QA/migrations.
6. Correr `production-baseline-readiness-static.mjs` antes de cualquier release limpio.
7. Solo si ese QA pasa, preparar un release deployable y recien despues hacer deploy controlado.

## Reglas para releases futuros

- Si un archivo parece no usado, no se borra sin inventario, verificacion de rutas/imports/Service Worker, QA anti-404 y rollback.
- Si un worktree limpio no pasa `production-baseline-readiness-static.mjs`, no es deployable.
- Si faltan wallet, notificaciones, login, admin avanzado o `svc-save-provider-service`, detenerse.
- Si produccion y local difieren, clasificar primero si el local es hotfix aprobado, trabajo futuro o cambio fuera de scope.
- Ningun documento viejo puede reemplazar la evidencia de produccion vigente y QA local actual.

## Decision actual

No existe todavia una baseline deployable limpia desde `HEAD`.

La baseline recovery debe construirse desde el estado recuperado de `mimi-transporte`, no desde `HEAD` puro.
