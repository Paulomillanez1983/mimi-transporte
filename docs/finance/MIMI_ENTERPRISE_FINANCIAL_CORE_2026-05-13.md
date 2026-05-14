# MIMI Enterprise Financial Core

Fecha: 2026-05-13

## Diagnostico actual

El sistema ya tenia una base de pagos desacoplada del PSP:

- `mimi-servicios/supabase/functions/create-payment-intent/index.ts`
- `mimi-servicios/supabase/functions/payment-webhook/index.ts`
- `mimi-servicios/supabase/functions/refund-payment/index.ts`
- `mimi-servicios/supabase/functions/_shared/payments/payment-provider.interface.ts`
- `mimi-servicios/supabase/functions/_shared/payments/providers.ts`
- `mimi-servicios/supabase/functions/_shared/payments/commission-engine.ts`

Tablas existentes detectadas:

- `payments`
- `payment_events`
- `refunds`
- `settlements`
- `commission_rules`
- `svc_payment_intents`
- `svc_financial_ledger`

Riesgos principales encontrados:

- Pagos, refunds y settlements no eran la unica fuente contable de verdad.
- No habia doble partida real para separar escrow, revenue MIMI y deuda a prestadores.
- Los refunds se registraban como estado operativo, no como movimiento compensatorio auditable.
- No existia separacion fiscal estricta entre produccion, QA, sandbox y tests.
- El panel admin no tenia vista financiera integrada para GMV, revenue, liabilities, conciliacion y cierres.

## Arquitectura implementada

La migracion `20260513225916_enterprise_financial_core_full_ledger.sql` crea el nucleo financiero append-only:

- `financial_ledgers`
- `financial_accounts`
- `financial_transactions`
- `financial_entries`
- `wallets`
- `wallet_balances`
- `wallet_reservations`
- `settlement_batches`
- `provider_settlements`
- `provider_liquidations`
- `payouts`
- `payout_events`
- `refund_events`
- `reconciliation_reports`
- `payment_reconciliations`
- `financial_exports`
- `tax_exports`
- `audit_financial_events`
- `accounting_periods`
- `monthly_closures`
- `commission_versions`
- `provider_earnings`
- `platform_revenue`
- `platform_expenses`
- `tax_documents`
- `invoice_registry`
- `payment_processor_events`
- `chargeback_events`
- `dispute_events`
- `financial_snapshots`
- `financial_test_runs`

Se crean tres ledgers logicos:

- `operational_financial_ledger`: dinero real, fiscal reportable.
- `test_financial_ledger`: QA/sandbox/internal testing, excluido por defecto.
- `audit_financial_ledger`: eventos tecnicos y trazabilidad no fiscal.

## Reglas contables

Captura de pago:

- Debe `cash_psp_ars`
- Haber `escrow_funds_ars`

Comision MIMI:

- Debe `escrow_funds_ars`
- Haber `platform_revenue_ars`

Saldo prestador:

- Debe `escrow_funds_ars`
- Haber `provider_payable_ars`

Refund:

- Debe `escrow_funds_ars`
- Haber `cash_psp_ars`

Los movimientos son idempotentes por `idempotency_key` y se validan con `financial_assert_transaction_balanced`.

## Ambientes y datos de prueba

Toda pieza financiera incluye:

- `environment`
- `is_test`
- `test_run_id`
- `source`
- `trace_id`
- `correlation_id`
- `fiscal_visibility`

Valores soportados de `fiscal_visibility`:

- `fiscal_reportable`
- `internal_test_only`
- `sandbox_only`
- `qa_only`
- `excluded_from_accounting`
- `reversed`
- `voided`

Por defecto, dashboards y exports reales filtran `is_test=false` y `fiscal_visibility='fiscal_reportable'`.

## Seguridad

- RLS habilitado en tablas nuevas del schema `public`.
- Mutaciones de clientes/admins revocadas sobre tablas financieras.
- Admins pueden leer, pero no editar balances manualmente.
- Asientos, eventos financieros, snapshots y revenue/earnings quedan append-only.
- Vistas `operational_financial_ledger` y `test_financial_ledger` usan `security_invoker=true`.
- Las RPC contables revocan ejecucion a `public`, `anon` y `authenticated`; solo `service_role` puede postear asientos.

## Edge functions

Se agrego capa compartida:

- `mimi-servicios/supabase/functions/_shared/payments/financial-ledger.ts`

Se reforzo:

- `payment-webhook`: registra evento PSP normalizado, postea captura, comision y payable del prestador.
- `refund-payment`: crea movimiento compensatorio para refund y evento auditado.
- `admin-financial-dashboard`: endpoint admin para metricas, conciliacion, cierres y exports.

Nota de deploy: `payment-webhook` debe desplegarse con `--no-verify-jwt` porque el PSP externo no envia JWT Supabase. La autenticacion del webhook queda en la firma del proveedor validada por el adapter.

## Segunda pasada enterprise

Fecha: 2026-05-14

Se agrego la migracion `20260514000624_enterprise_financial_engines_second_pass.sql` y el hotfix `20260514002045_financial_export_enum_cast_hotfix.sql`.

### Settlement engine

Nuevas piezas:

- `settlement_items`
- `financial_calculate_settlement_batch`
- `financial_approve_settlement_batch`

El motor agrupa `provider_earnings` por prestador y periodo, calcula bruto, comision, fees PSP, refunds, ajustes y neto. Recalcula solo batches no aprobados/bloqueados/pagados.

### Payout engine

Nuevas piezas:

- `payout_batches`
- `payout_batch_items`
- `financial_create_payout_batch`
- `financial_mark_payout_paid`

El payout se genera desde liquidaciones aprobadas. Los prestadores no aprobados, bloqueados o con disputa quedan en `on_hold` o `disputed`. El pago efectivo postea doble partida:

- Debe `provider_payable_ars`
- Haber `cash_psp_ars`

### Reconciliation engine

Nueva tabla:

- `reconciliation_items`

Nueva funcion:

- `financial_run_reconciliation`

Detecta pagos huérfanos, faltantes internos/externos, mismatches y payouts sin confirmacion externa.

### Wallet engine

Nueva funcion:

- `financial_rebuild_provider_wallet`

El balance del prestador se deriva del ledger, principalmente desde `provider_payable_ars`, y separa disponible, disputado, pagado y reversado.

### Month-end closing

Nueva funcion:

- `financial_close_accounting_period`

Genera snapshot hash del trial balance, crea `monthly_closures` y activa un trigger que impide postear movimientos `fiscal_reportable` en periodos cerrados o bloqueados. Ajustes posteriores deben ser compensatorios y en periodo abierto.

### Exports

Nueva funcion:

- `financial_create_export_record`

Genera registro de export contable/fiscal con filtros por `fiscal_visibility`. Por defecto no incluye test data.

### Admin operations

Nueva Edge Function:

- `admin-financial-operations`

Acciones soportadas:

- `calculate_settlements`
- `approve_settlement_batch`
- `create_payout_batch`
- `mark_payout_paid`
- `run_reconciliation`
- `close_period`
- `create_export`

Requiere admin financiero: `SUPERADMIN`, `ADMIN`, `FINANCE` o `FINANCE_ADMIN`.

### Webhook enterprise

`payment-webhook` ahora:

- almacena raw payload normalizado
- calcula hash del evento
- marca dead-letter para firma invalida, eventos sin payment id o pagos inexistentes
- protege eventos fuera de orden
- registra PSP fee si viene en payload
- no postea al ledger si el evento no es confiable
- mantiene idempotencia por `provider_name + provider_event_id`

### Refunds enterprise

`refund-payment` ahora:

- requiere rol financiero/admin
- soporta refund parcial y total
- calcula saldo remanente para evitar sobrerrefund
- bloquea refund contra settlement pagado/bloqueado salvo ajuste compensatorio explicito
- registra actor, evidencia, idempotency key y settlement asociado
- postea compensating entry en ledger

### Vistas por rol

Nuevas vistas:

- `provider_financial_history`
- `client_financial_history`

El frontend debe consumir estas vistas o funciones seguras, no recalcular montos financieros localmente.

### QA ejecutado

Smoke test remoto no fiscal:

- `financial_calculate_settlement_batch(... include_tests=true ...)`
- `financial_run_reconciliation(... include_tests=true ...)`
- `financial_create_export_record(... include_tests=true ...)`

Resultado:

- `settlement_batches = 1`
- `reconciliation_reports = 1`
- `qa_exports = 1`

Los registros quedan marcados como test/QA y no contaminan contabilidad real.

## Panel admin

Se agrego modulo `Finanzas` en `admin/admin-panel.html` con:

- GMV
- Revenue MIMI
- Deuda a prestadores
- Refunds
- Salud de conciliacion
- Cierres mensuales
- Exports contables/fiscales
- Filtro para incluir o excluir test data

## Rollback plan

Rollback seguro ante incidente:

1. Desactivar en Vercel la UI de Finanzas revertiendo `admin/admin-panel.html`, `admin/admin-finance.js` y `admin/admin.css`.
2. Re-deploy de Edge Functions anteriores si un webhook financiero falla.
3. No borrar asientos ya generados.
4. Si hubo una operacion financiera incorrecta, generar transaccion compensatoria con nueva `idempotency_key`.
5. Mantener `audit_financial_events` para trazabilidad legal.

## QA financiero obligatorio

Escenarios a probar en `test_financial_ledger`:

- Pago exitoso.
- Pago fallido.
- Refund total.
- Refund parcial.
- Cancelacion con cargo.
- Cancelacion sin cargo.
- Disputa.
- Chargeback.
- Payout exitoso.
- Payout fallido.
- Comision promocional.
- Comision normal.
- Ajuste manual compensatorio.
- Cierre mensual.
- Reapertura bloqueada de periodo cerrado.
- Conciliacion con diferencia.
- Conciliacion exacta.

Cada corrida debe guardar `test_run_id`, esperado, obtenido, diferencias, logs y evidencia exportable.

## Stress testing

Plan recomendado:

- 1.000 webhooks duplicados con la misma `provider_event_id`: debe crear un solo evento y un solo set de asientos.
- 10.000 capturas concurrentes: validar que cada `financial_transaction` balancee.
- 10.000 refunds concurrentes parciales: validar idempotencia por `refund_key`.
- Rebuild de balances desde `financial_entries`.
- Comparacion ledger vs PSP vs payouts por periodo.

## Observabilidad

Toda operacion debe transportar:

- `trace_id`
- `correlation_id`
- `provider_event_id`
- `payment_id`
- `service_request_id`
- `provider_id`

Logs permitidos:

- IDs tecnicos.
- Estados normalizados.
- Montos.

Logs prohibidos:

- Service role key.
- Credenciales PSP.
- Payloads con datos sensibles sin sanitizar.
