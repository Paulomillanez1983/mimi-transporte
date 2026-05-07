# Plan de teléfono, OTP, IP y dispositivo

Este plan deja claro cómo incorporar verificación telefónica sin romper Google Login ni los perfiles existentes.

## Decisión recomendada

Usar Supabase Auth Phone OTP como segundo paso obligatorio después de Google, email o registro tradicional. La cuenta sigue siendo la misma, pero el perfil queda bloqueado para operar hasta tener `phone_verified_at`.

## Flujo

1. El usuario inicia sesión con Google o email.
2. Si el perfil no tiene teléfono verificado, la app muestra una pantalla única: "Verificá tu teléfono".
3. El usuario ingresa teléfono en formato internacional.
4. Supabase envía OTP por SMS o WhatsApp, según proveedor habilitado.
5. El usuario ingresa el código.
6. La app guarda:
   - `phone`
   - `phone_verified_at`
   - `last_login_ip`
   - `last_user_agent`
   - `last_device_id`
7. El admin ve teléfono verificado/no verificado en cliente, chofer y prestador.

## Tablas impactadas

- `profiles` o tabla equivalente de clientes.
- `driver_profiles`.
- `svc_providers`.
- `svc_provider_profiles` si se quiere metadata profesional.
- `audit_logs` para registrar verificaciones, cambios de teléfono, dispositivos y bloqueos.

## Reglas

- No permitir operar a chofer/prestador si `phone_verified_at` es nulo.
- Permitir navegar, completar onboarding y soporte aunque falte teléfono.
- Pedir re-verificación si cambia el número.
- Registrar IP y user-agent sólo como dato de seguridad/auditoría; no mostrarlo públicamente.

## Backend necesario

- Habilitar proveedor SMS en Supabase Auth.
- Agregar columnas compatibles, sin renombrar existentes:
  - `phone_verified_at timestamptz`
  - `last_login_ip inet` o `text` si se captura desde Edge Function
  - `last_user_agent text`
  - `last_device_id text`
- Crear Edge Function `record-auth-context` si se quiere capturar IP real desde headers de servidor.

## No hacer todavía

- No inventar OTP propio en frontend.
- No guardar códigos OTP en tablas públicas.
- No usar `user_metadata` para autorizar roles.
