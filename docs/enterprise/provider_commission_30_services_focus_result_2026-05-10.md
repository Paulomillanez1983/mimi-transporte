# MIMI Servicios - Provider UX, comision 30% y hibernacion Transporte

Fecha: 2026-05-10

## Resumen ejecutivo

Se aplico una release focalizada para dejar la experiencia publica centrada en MIMI Servicios, separar correctamente lo que cobra el prestador del total que ve el cliente, y compactar la UI del prestador sin tocar la logica interna de Transporte.

Resultado tecnico:

- MIMI Transporte / Chofer queda hibernado publicamente: rutas visibles redirigen a Servicios y no se promociona desde la UX principal.
- El backend de Servicios calcula la comision MIMI GO del 30% como fuente de verdad al crear la solicitud y pagos.
- El cliente ve solo el total estimado final, sin desglose ni mencion visible de comision.
- El prestador ve solo su precio propio como "Tu precio", con cantidad/unidad cuando aplica, sin ver comision ni total cliente.
- Pagos mock/payment-intent usa los snapshots de la solicitud, no recalcula incorrectamente desde el total.

## Hallazgos sobre comision actual

Antes de esta release:

- `svc-create-request` persistia `platform_fee_snapshot = 0` y `total_price_snapshot = provider_price_snapshot`.
- `svc-search-providers` devolvia `total_price = provider_price`, por lo que el cliente veia el precio del prestador como total final.
- `create-payment-intent` recalculaba comision desde `total_price_snapshot`, lo que podia duplicar o distorsionar el modelo al corregir snapshots.
- `commission_rules.DEFAULT` estaba en 10%.
- Fallback frontend/mock usaba 15% con minimo 500.

## Modelo corregido

Modelo aplicado:

- `provider_amount = precio definido por prestador`
- `platform_fee_percent = 30`
- `platform_fee_amount = provider_amount * 0.30`
- `client_total_amount = provider_amount + platform_fee_amount`

Ejemplo interno validado:

- Prestador: `$5.000`
- Comision MIMI GO 30%: `$1.500` interna, no visible en UI cliente/prestador
- Cliente: `$6.500` como total estimado final
- Prestador: `$5.000` como su precio/ingreso visible

## Backend corregido

Archivos:

- `mimi-servicios/supabase/functions/_shared/services/pricing.ts`
- `mimi-servicios/supabase/functions/svc-create-request/index.ts`
- `mimi-servicios/supabase/functions/svc-search-providers/index.ts`
- `mimi-servicios/supabase/functions/create-payment-intent/index.ts`
- `mimi-servicios/supabase/functions/_shared/payments/commission-engine.ts`
- `supabase/migrations/20260510174418_set_services_commission_30.sql`

Cambios:

- Helper centralizado para pricing de Servicios con 30%.
- `svc-create-request` guarda snapshots correctos: provider, platform fee y total cliente para pagos/auditoria.
- La notificacion push al prestador usa `provider_price`, cantidad y unidad, sin mandar el total cliente como dato visible.
- `svc-search-providers` devuelve provider price, fee y total final al cliente.
- `create-payment-intent` usa snapshots de `svc_requests` para `SERVICE_REQUEST`.
- Migracion idempotente ajusta `commission_rules.DEFAULT` a 30%, sin minimo, sin fijo, rounding `round`.

Verificacion remota:

- `commission_rules.DEFAULT`: `percentage=30.0000`, `minimum_fee=0.00`, `fixed_fee=0.00`, `rounding=round`, `active=true`.

Edge Functions desplegadas:

- `svc-create-request`
- `svc-search-providers`
- `create-payment-intent`

Deploy Vercel:

- Commit: `9ee56bf feat: align services pricing and provider ux`
- Deployment: `dpl_5JnsuifZSdE57tgXsNbxBwivqj6g`
- Production URL: `https://mimi-transporte-4m2tqwrg8-paulomillanez1983s-projects.vercel.app`
- Alias activo: `https://mimi-transporte.vercel.app`
- Estado Vercel: `Ready`

## Frontend cliente

Archivos:

- `mimi-servicios/src/main-client.js`
- `mimi-servicios/src/ui/render-client.js`
- `mimi-servicios/styles/client.css`
- `mimi-servicios/cliente.html`
- `mimi-servicios/src/services/service-api.js`
- `mimi-servicios/src/services/mock-data.js`

Cambios:

- La confirmacion muestra solo el total estimado final.
- El preview local usa 30% solo como fallback visual; la solicitud real se recalcula en backend.
- Se evita depender del RPC legacy `svc_prepare_request_pricing` para no mezclar reglas antiguas.
- El panel de pagos usa copy simple y no muestra desglose de comision; el detalle comercial queda cubierto por terminos y condiciones.

Ajuste posterior:

- Se retiro tambien el desglose visible de comision de la modal de confirmacion y del panel de pagos.
- La UI cliente no menciona comision ni porcentaje; solo presenta el total estimado.

## Frontend prestador

Archivos:

- `mimi-servicios/src/main-provider.js`
- `mimi-servicios/src/ui/render-provider.js`
- `mimi-servicios/styles/provider.css`
- `mimi-servicios/prestador.html`

Cambios:

- La card flotante de solicitud prioriza `Tu precio`.
- Se elimina de la UI del prestador cualquier referencia a `Comision MIMI GO` y `Total cliente`.
- La solicitud muestra lo que el cliente pidio: cantidad, unidad, precio publicado, precio final del prestador y detalle del cliente.
- Dashboard e historial del prestador priorizan el ingreso propio del prestador.
- Card flotante mas compacta: menor alto, menor tipografia y mas mapa visible.
- Editor de servicios aclara que el prestador carga el importe que quiere cobrar, sin exponer reglas de comision.

Ajuste posterior:

- Se eliminaron fallbacks que podian mostrar `total_price_snapshot` en provider cuando faltaba `provider_price`.
- La notificacion de nueva solicitud para prestador se mantiene en precio propio del prestador, cantidad/unidad y detalle solicitado.

## Transporte / Chofer hibernado

Archivos:

- `vercel.json`
- `chofer/index.html`
- `viaje/index.html`
- `manifest-driver.json`
- `manifest-partners.json`
- `terminos.html`
- `privacidad.html`

Cambios:

- `/`, `/cliente`, `/hub-clientes`, `/viaje`, `/viaje/`, `/chofer`, `/chofer/`, `/index.html`, `/chofer-panel.html` y `/login-chofer.html` redirigen publicamente a `/servicios`.
- `/operadores` muestra una sola app: MIMI Servicios para prestadores.
- Se retiro el asset visual del auto del hub de operadores para evitar referencias publicas a transporte.
- `chofer/index.html` y `viaje/index.html` redirigen a `/servicios`.
- Manifest de partners queda enfocado en prestadores.
- Textos legales publicos quedan enfocados en Servicios y prestadores.
- Codigo, tablas, funciones y archivos de Transporte se preservan para relanzamiento futuro.

## QA ejecutado

PASSED:

- `node --check mimi-servicios/src/main-client.js`
- `node --check mimi-servicios/src/services/service-api.js`
- `node --check mimi-servicios/src/ui/render-provider.js`
- `node --check mimi-servicios/src/main-provider.js`
- `node --check mimi-servicios/src/ui/render-client.js`
- `node --check mimi-servicios/src/payments/commission-engine.js`
- `node qa/audit-routes.js`
- `node qa/audit-encoding.js`
- `node qa/audit-supabase.js`
- `node qa/backend-hardening-static.js`
- `git diff --check`
- `supabase db push --linked`
- `supabase functions deploy svc-create-request --project-ref xrphpqmutvadjrucqicn --workdir mimi-servicios`
- `supabase functions deploy svc-search-providers --project-ref xrphpqmutvadjrucqicn --workdir mimi-servicios`
- `supabase functions deploy create-payment-intent --project-ref xrphpqmutvadjrucqicn --workdir mimi-servicios`
- `npx vercel deploy --prod --yes`
- `npx vercel inspect https://mimi-transporte.vercel.app`
- Produccion HTTP:
  - `/servicios` -> `200`
  - `/prestador` -> `200`
  - `/chofer` -> `200` final en `/servicios`
  - `/viaje` -> `200` final en `/servicios`
  - `/index.html` -> `200` final en `/servicios`
  - `/terminos` -> `200`

BLOCKED_BY_ENVIRONMENT:

- `node qa/enterprise-global-e2e.js`
  - faltan en esta sesion: `MIMI_SUPABASE_URL`, `MIMI_SUPABASE_ANON_KEY`, `MIMI_E2E_CLIENT_EMAIL`, `MIMI_E2E_CLIENT_PASSWORD`, `MIMI_E2E_PROVIDER_EMAIL`, `MIMI_E2E_PROVIDER_PASSWORD`, `MIMI_E2E_ADMIN_EMAIL`, `MIMI_E2E_ADMIN_PASSWORD`.

SKIPPED:

- `node qa/audit-frontend-production.js`
  - motivo: `playwright_not_available`.

## Riesgos residuales

- El E2E autenticado debe re-ejecutarse cuando las variables esten cargadas en el proceso local.
- Deno no esta instalado localmente; la validacion TS efectiva de Edge Functions se hizo con `supabase functions deploy`.
- Transporte queda preservado internamente, pero oculto publicamente. Si se relanza, hay que revertir redirects y manifests con una release dedicada.

## Recomendacion CTO

DEPLOY APROBADO CON OBSERVACIONES:

- Backend de comision 30% ya aplicado y desplegado.
- Frontend cliente/prestador alineado al nuevo modelo.
- Falta re-ejecutar E2E autenticado en entorno con variables cargadas para cerrar QA funcional completo post-release.
