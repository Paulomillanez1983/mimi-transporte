# MIMI payment-agnostic audit

Fecha: 2026-05-02
Proyecto Supabase: `xrphpqmutvadjrucqicn`

## A. Diagnostico general

Lo que esta bien:
- MIMI Servicios ya separa `provider_price_snapshot`, `platform_fee_snapshot` y `total_price_snapshot`.
- El frontend de Servicios no tiene secretos de pago y ya usa Edge Functions para acciones sensibles.
- El flujo de prestador independiente esta bastante claro en KYC y panel de prestador.
- Transporte ya tiene estados, ofertas y asignacion por Edge Functions; ahi conviene insertar pago despues de cotizacion/viaje creado y antes de iniciar o completar, segun regla comercial.

Lo que esta mal o incompleto:
- No existe una capa unica de pagos para Transporte + Servicios.
- Las tablas viejas `svc_payment_intents` y `svc_escrow_holds` solo cubren Servicios y no alcanzan para Mobbex/MercadoPago/futuro PSP.
- Hay copy historico con marca `MIMI Transporte` y frases como `Te llevamos...` que pueden sonar a prestador directo.
- `viajes` y `cotizaciones` tienen RLS habilitado sin policies visibles en el extracto; eso debe cerrarse antes de produccion.
- El frontend todavia muestra `Prestador verificado por MIMI`, que comercialmente conviene reemplazar por `Proveedor registrado en MIMI` salvo que haya aprobacion KYC real.

Riesgos:
- Fiscal/comercial: si MIMI muestra el total como ingreso propio sin separar comision, queda expuesto a facturar de mas.
- Seguridad: cualquier PSP real debe vivir en Edge Functions; nunca en HTML/JS.
- Idempotencia: webhooks de pago llegan repetidos; sin `provider_event_id` unico se duplican estados/liquidaciones.
- Doble pago: debe haber un solo pago activo por `context_type + context_id`.

## B. Archivos a tocar

- `mimi-servicios/src/config.js`: agregar nombres de Edge Functions internas de pago.
- `mimi-servicios/src/payments/payment-api.js`: nuevo cliente frontend payment-agnostic; no habla con Mobbex directo.
- `mimi-servicios/src/payments/commission-engine.js`: calculo frontend solo para mostrar/simular, no como fuente final.
- `mimi-servicios/src/services/service-api.js`: leer nueva tabla `payments` con fallback a `svc_payment_intents`.
- `mimi-servicios/src/main-client.js`: crear intento de pago despues de crear solicitud.
- `mimi-servicios/src/ui/render-client.js`: mostrar precio servicio, comision MIMI, total y estados de pago.
- `mimi-servicios/supabase/functions/_shared/payments/*`: provider interface, mock provider, skeleton Mobbex/MercadoPago, comisiones.
- `mimi-servicios/supabase/functions/create-payment-intent/index.ts`: crea intento server-side.
- `mimi-servicios/supabase/functions/payment-webhook/index.ts`: webhook idempotente.
- `mimi-servicios/supabase/functions/cancel-payment/index.ts`: cancela pagos no confirmados.
- `mimi-servicios/supabase/functions/refund-payment/index.ts`: devoluciones admin/server-side.
- `mimi-servicios/supabase/functions/get-payment-status/index.ts`: consulta segura.
- `docs/payments/supabase-payment-architecture.sql`: SQL completo para tablas/RLS.
- `index.html`: cambiar copy que sugiere que MIMI transporta.

## C. Cambios concretos de copy

- `Te llevamos a Google para solicitar el viaje` -> `Ingresas con Google para pedir conexion con un chofer registrado`.
- `MIMI Transporte` como razon social/comercial -> mantener solo como marca/ruta si no se puede cambiar dominio, pero usar `MIMI` o `MIMICar` en copy legal.
- `Nuestros choferes` -> `choferes registrados`.
- `Nuestros servicios` -> `servicios disponibles en la plataforma`.
- `Servicio brindado por MIMI` -> `servicio prestado por el proveedor independiente`.
- `Prestador verificado por MIMI` -> `Proveedor registrado en MIMI`, salvo prestador aprobado por KYC.
- Checkout/resumen: `Precio del servicio`, `Comision MIMI`, `Total a pagar`, `Prestador`.

Texto minimo recomendado:
`MIMI es una plataforma tecnologica de intermediacion. Los servicios son prestados por proveedores independientes. MIMI cobra una comision por el uso de la plataforma.`

## D. Nuevos archivos necesarios

Implementados en este ZIP:
- Frontend: `mimi-servicios/src/payments/commission-engine.js`, `mimi-servicios/src/payments/payment-api.js`.
- Edge Functions: `create-payment-intent`, `payment-webhook`, `cancel-payment`, `refund-payment`, `get-payment-status`.
- Shared backend: `_shared/payments/http.ts`, `commission-engine.ts`, `payment-provider.interface.ts`, `providers.ts`.
- SQL: `docs/payments/supabase-payment-architecture.sql`.

## E. SQL

El SQL completo esta en `docs/payments/supabase-payment-architecture.sql`.
Modelo central:
- `payments`: total, comision, neto, provider PSP, checkout, estado.
- `payment_events`: eventos idempotentes de webhook.
- `settlements`: liquidacion futura al proveedor.
- `refunds`: devoluciones totales/parciales.
- `commission_rules`: comision por tipo de servicio.
- `cancellation_rules`: base para cargos de cancelacion divisibles entre MIMI/proveedor.

## F. Edge Functions

Funciones creadas:
- `create-payment-intent`: valida JWT, valida ownership, calcula comision server-side, crea pago y llama provider mock/Mobbex futuro.
- `payment-webhook`: valida provider, registra evento idempotente, actualiza pago y crea settlement pendiente.
- `cancel-payment`: cancela pagos pendientes del cliente.
- `refund-payment`: solo admin; registra refund y actualiza estado.
- `get-payment-status`: cliente/proveedor/admin pueden leer de forma segura.

Variables futuras:
- `PAYMENT_PROVIDER=mock|mobbex|mercadopago`
- `MOBBEX_API_KEY`
- `MOBBEX_ACCESS_TOKEN`
- `MOBBEX_ENTITY_ID`
- `MOBBEX_WEBHOOK_SECRET`

## G. Frontend mock

Servicios ahora:
- crea solicitud;
- intenta crear `payment-intent` interno;
- muestra `Precio del servicio`, `Comision MIMI`, `Total a pagar`;
- muestra estado de pago;
- abre checkout mock si el backend devuelve `checkout_url`;
- permite refrescar/cancelar el pago desde funciones internas.

Transporte:
- el punto correcto de insercion es despues de `solicitar-viaje-ts` cuando ya existe `viaje_id`, usando `context_type='TRANSPORT_TRIP'`.
- si se quiere cobrar antes de dispatch, usar `TRANSPORT_QUOTE` sobre `cotizacion_id`.
- no llamar nunca a Mobbex desde `index.html`; llamar a `create-payment-intent`.

## H. Checklist Mobbex real

- Confirmar contrato operativo: marketplace/intermediacion, comision MIMI, proveedor independiente.
- Definir si Mobbex cobrara total y luego liquidara proveedor, o si MIMI solo cobra fee.
- Cargar secretos en Supabase: `MOBBEX_API_KEY`, `MOBBEX_ACCESS_TOKEN`, `MOBBEX_ENTITY_ID`, `MOBBEX_WEBHOOK_SECRET`.
- Cambiar `PAYMENT_PROVIDER=mock` a `PAYMENT_PROVIDER=mobbex`.
- Completar `MobbexPaymentProvider.createPaymentIntent`, `getPaymentStatus`, `cancelPayment`, `refundPayment`.
- Configurar webhook publico a `/functions/v1/payment-webhook?provider=mobbex`.
- Verificar firma real del webhook.
- Probar idempotencia enviando el mismo evento dos veces.
- Probar cancelacion antes de aceptar, despues de aceptar, en camino, por proveedor y por cliente.
- Validar reportes contables: MIMI factura `platform_fee`; proveedor factura `provider_amount`/servicio si corresponde.
- Revisar RLS/advisors de Supabase antes de pasar a produccion.
