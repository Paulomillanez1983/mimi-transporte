# MIMI GO / MIMI - Auditoria tecnica 2026-05-06

## Resumen ejecutivo

Estado general: base funcional avanzada, con frontend estatico, Supabase como backend principal, Edge Functions activas para transporte, servicios, pagos, legal, soporte y KYC. La app todavia no esta lista para produccion tipo Uber sin corregir Realtime, matching real de prestadores y rotacion de secretos locales.

Riesgos criticos:
- Realtime no publica las tablas que la app escucha para viajes/servicios/tracking.
- Hay un token OIDC de Vercel en `.env.local`; rotar/revocar si salio del entorno local.
- Servicios tiene 15 prestadores pero 0 categorias/precios/ofertas asociadas, por lo que el matching real puede quedar vacio.
- Persisten textos mojibake en varios archivos heredados.

Correcciones aplicadas:
- Copy de IA/servicios corregido y aclarado sin prometer seguridad/calidad.
- Auditorias ejecutables agregadas en `qa/`.
- Plan QA manual agregado.
- SQL de remediacion Supabase documentado, sin mutar DB automaticamente.
- Rutas limpias criticas cubiertas con redirects fisicos para Vercel.
- Deploy a produccion ejecutado y alias actualizado.

## Hallazgos por severidad

Critico:
- `supabase_realtime` solo contiene `svc_conversations` y `svc_messages`; faltan `viajes`, `viaje_ofertas`, `svc_requests`, `svc_request_offers`, `svc_tracking`, `svc_notifications`.
- `.env.local` contiene token sensible de Vercel.

Alto:
- `svc_provider_categories`, `svc_provider_pricing` y `svc_provider_service_offerings` tienen 0 filas aunque hay 15 prestadores.
- Varias Edge Functions de transporte aparecen con `verify_jwt=false`; revisar si usan validacion propia y service role correctamente.
- Algunos endpoints admin/support aparecen `verify_jwt=false`; validar autorizacion interna.

Medio:
- Mojibake visible en HTML/JS heredado; se corrigieron patrones comunes y quedan controles automatizados.
- App estatica sin suite automatizada previa.
- Service workers multiples pueden dejar cache viejo tras deploy si no se fuerza versionado/limpieza.

Bajo:
- Hay archivos/variantes historicas (`index-v2.html`, duplicados de assets) que conviene ordenar cuando el producto este estable.

## Cambios realizados

- `mimi-servicios/src/ui/render-client.js`: mejora copy de IA, categorias y estados vacios; corrige textos rotos visibles.
- `cliente/index.html`, `viaje/index.html`, `chofer/index.html`, `operadores/index.html`, `prestador/index.html`: redirects estables para rutas limpias en Vercel.
- `qa/audit-encoding.js`: detecta mojibake y puede corregir patrones comunes con `--fix`.
- `qa/audit-routes.js`: valida rutas Vercel, manifests, service workers y referencias locales.
- `qa/audit-supabase.js`: compara tablas esperadas contra migracion remota y marca riesgos basicos.
- `qa/audit-inline-scripts.js`: valida scripts inline no-modulo en HTML criticos.
- `qa/manual-test-plan.md`: checklist manual de produccion.
- `docs/production-readiness-supabase.sql`: SQL recomendado para Realtime/RLS/datos de matching.

## Comandos de prueba

```powershell
node qa/audit-routes.js
node qa/audit-supabase.js
node qa/audit-encoding.js
node qa/audit-inline-scripts.js
npx vercel deploy --prod --yes
```

Resultado verificado:
- `node qa/audit-routes.js`: OK.
- `node qa/audit-supabase.js`: OK.
- `node qa/audit-encoding.js`: OK, 0 hallazgos.
- `node qa/audit-inline-scripts.js`: OK.
- Produccion Vercel: `https://mimi-transporte.vercel.app`.
- Smoke HTTP 200: `/`, `/cliente`, `/viaje`, `/chofer`, `/operadores`, `/servicios`, `/prestador`, `/privacidad`, `/terminos`, `/delete-account`.

## Pendiente antes de produccion

1. Aplicar y verificar Realtime en Supabase.
2. Completar categorias/precios/ofertas reales de prestadores.
3. Rotar secreto Vercel y mantener `.env.local` fuera de Git.
4. Ejecutar QA manual completo con usuarios reales de cliente, chofer, prestador y admin.
5. Deploy Vercel y smoke test de rutas limpias/PWA.
