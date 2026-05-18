# MIMIGO Payment Gateway + Payout Account Foundation

Estado: preparado, no activado para dinero real.

## Admin Finanzas / Pasarela de pago

- La configuracion no sensible vive en `payment_provider_config`.
- Los secretos reales deben vivir en Supabase Edge Function Secrets o Vault.
- El frontend solo muestra nombres de secrets presentes/faltantes; nunca valores.
- `PAYMENTS_REAL_ENABLED=false` mantiene el proveedor efectivo para dinero en `mock`.
- Cambiar proveedor requiere `FINANCE_ADMIN` o `SUPER_ADMIN`, motivo obligatorio y audit log.
- La configuracion aplica solo a pagos nuevos.

## Datos de cobro del prestador

- El prestador puede enviar CBU, CVU o alias para revision.
- Payout real sigue desactivado.
- No se guardan CBU/CVU completos en texto plano.
- Se guarda:
  - identificador enmascarado;
  - hash estable con salt server-side para comparar duplicados;
  - payload AES-GCM cifrado server-side si `PAYOUT_ACCOUNT_ENCRYPTION_KEY` existe.
- Si falta el secret de cifrado, solo se guarda mascara + hash y el registro queda con `encrypted_payload_required=true`.
- Un admin no puede aprobar un dato de cobro si `encrypted_payload_required=true`.

## Secrets requeridos

- `PAYOUT_ACCOUNT_ENCRYPTION_KEY`: clave secreta para cifrar payload bancario en Edge Function.
- `PAYOUT_ACCOUNT_ENCRYPTION_KEY_ID`: identificador no sensible de version de clave.
- `PAYOUT_ACCOUNT_HASH_SALT`: salt estable obligatorio para hash de CBU/CVU/alias/CUIT-CUIL; si falta, el flujo falla cerrado.
- `ACCOUNT_VERIFICATION_PROVIDER`: proveedor de verificacion de titularidad (`manual`, `mock`, `bind`, `redlink`, `external_api`).
- `ACCOUNT_VERIFICATION_ENABLED`: `false` por defecto; si no esta activo no se aprueba titularidad automaticamente.
- `ACCOUNT_VERIFICATION_API_KEY`: secret server-side para proveedor externo.
- `ACCOUNT_VERIFICATION_BASE_URL`: endpoint server-side del proveedor externo.

## Verificacion de titularidad CBU/CVU

- Un prestador solo puede quedar elegible para payout si la cuenta pertenece al CUIT/CUIL verificado en KYC.
- Actualmente el KYC historico tiene DNI OCR, pero no CUIT/CUIL autoritativo.
- Se agregan campos seguros en `svc_providers` para CUIT/CUIL KYC:
  - `kyc_tax_id_hash`;
  - `kyc_tax_id_masked`;
  - `kyc_tax_id_last4`;
  - `kyc_tax_id_status`.
- Nunca se guarda CUIT/CUIL completo en texto plano.
- `verify-provider-payout-account` descifra CBU/CVU solo dentro de Edge Function, consulta el adapter de verificacion y guarda el resultado en `provider_payout_account_verifications`.
- La respuesta externa completa se guarda cifrada en `raw_response_encrypted`; admin y prestador solo ven masked/last4/status.
- Si el CUIT/CUIL KYC falta, el estado queda `pending_missing_tax_id`.
- Si no hay proveedor externo configurado, queda `pending_external_verification`.
- Si un cotitular coincide por CUIT/CUIL, `ownership_match=true`.
- Si no coincide, la cuenta queda rechazada para payout.
- La aprobacion manual no habilita payout real si no existe `ownership_match=true`.
- Para revision manual inicial, el admin debe ingresar CUIT/CUIL observado en banco, titular observado, banco/entidad, motivo y confirmar explicitamente que comparo CUIT/CUIL completo contra KYC.
- El CUIT/CUIL observado se normaliza y hashea server-side; solo se guarda hash, mascara y ultimos 4. Nunca se persiste completo, ni siquiera cifrado en `raw_response_encrypted`.
- No se acepta aprobacion por nombre ni por ultimos 4. El unico match automatico/manual valido es hash completo contra `kyc_tax_id_hash`.
- Si el KYC/CUIT-CUIL del prestador falta o no esta aprobado, la cuenta puede quedar `pending_review`, `pending_missing_tax_id` o `manual_review`, pero nunca `verified`.
- El admin puede marcar `needs_more_info` o `rejected` con motivo sin aprobar titularidad.
- El guard `financial_provider_payout_account_guard` deja payouts futuros `on_hold` si no hay cuenta verificada, KYC aprobado y titularidad coincidente.

## Auditoria y antifraude

- Cada alta/cambio crea evento append-only en `provider_payout_account_events`.
- Cada alta/cambio crea `audit_financial_events`.
- Cada alta/cambio registra `fraud_events` con `event_type='provider_change_bank_account'`.
- Cada verificacion de titularidad registra `audit_financial_events` y `fraud_events` con `event_type='provider_payout_account_ownership_verification'`.
- `decision_applied=false`; no hay bloqueo automatico ni payout hold.

## No Activado

- Payout real.
- Cobros reales.
- Cash/manual real.
- Ledger changes.
- Settlement/payout movement.
