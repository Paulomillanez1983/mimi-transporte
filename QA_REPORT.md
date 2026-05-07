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

## Actualizacion admin 2026-05-07

Correcciones aplicadas:
- `admin/admin-transport.js`: reemplazado el controlador incorrecto de soporte por un controlador real de choferes. Ahora carga `driver_profiles`, `driver_documents` y `choferes`, calcula metricas, cola prioritaria, score, cards, detalle y acciones.
- `admin/admin-services-providers.js`: cards de prestadores mas claras, score explicado, DNI frente/dorso, selfie, matricula y buena conducta visibles como pendientes o accesibles, acciones con confirmacion y nota obligatoria en rechazo/correccion/bloqueo.
- `admin/admin-panel.html`: nueva vista movil independiente para Prestadores y cache-busting de scripts admin.
- `admin/admin.js`: agrega `providers` como vista movil valida.
- `admin/admin.css`: layout movil compacto para choferes/prestadores, dock de 5 items, score y documentos legibles.
- `docs/admin-driver-review-policies.sql`: politicas RLS admin para revisar choferes, documentos, filas operativas y auditoria.
- `docs/phone-otp-production-plan.md`: plan seguro para agregar telefono/OTP/IP/dispositivo sin romper Google Login.

Backend aplicado:
- Politicas RLS admin para `driver_profiles`, `driver_documents`, `choferes`, `audit_logs` y lectura admin de storage `driver-documents`.
- Verificado en `pg_policies`: 9 politicas admin activas.

Pruebas:
- `node --check admin/admin-transport.js`: OK.
- `node --check admin/admin-services-providers.js`: OK.
- `node --check admin/admin.js`: OK.
- `node qa/audit-encoding.js`: OK, 0 hallazgos.
- `node qa/audit-routes.js`: OK.
- `node qa/audit-inline-scripts.js`: OK.
- `git diff --check`: OK.

Pendiente operativo:
- Probar manualmente en admin con un chofer real: aprobar, pedir correccion, rechazar y bloquear.
- Probar manualmente en admin con un prestador real y confirmar que Edge Function `admin-review-service-provider` persiste cada accion.
- Activar OTP telefonico requiere configurar proveedor SMS/WhatsApp en Supabase Auth antes de implementar pantallas obligatorias.

## Actualizacion provider marketplace 2026-05-07

Correcciones aplicadas:
- `mimi-servicios/src/ui/render-provider.js`: el editor de trabajos publicados ahora usa categorias reales del backend, agrupadas por profesion/oficio, hogar, cuidado, belleza y tecnicos. El prestador puede escribir el servicio exacto aunque elija un rubro amplio para matching.
- `mimi-servicios/src/main-provider.js`: conserva metadata real de categorias (`default_pricing_model`, modalidades permitidas, requerimiento de matricula y buena conducta) y permite rubros a presupuestar sin bloquear por precio cero.
- `mimi-servicios/src/services/service-api.js`: carga datos de categoria junto con pricing y publicaciones para mostrar mejor contexto.
- `mimi-servicios/styles/provider.css`: mejora UI mobile-first del bloque comercial sin afectar verificacion/login porque queda acotado a `#providerBusinessPanel`.
- `docs/provider-offerings-self-read-policy.sql`: politica RLS para que cada prestador lea sus propias publicaciones antes de aprobacion admin.

Backend aplicado:
- Politica `svc_provider_service_offerings_provider_select_own` aplicada y verificada.

Pruebas:
- `node --check mimi-servicios/src/ui/render-provider.js`: OK.
- `node --check mimi-servicios/src/main-provider.js`: OK.
- `node --check mimi-servicios/src/services/service-api.js`: OK.
- `node qa/audit-routes.js`: OK.
- `node qa/audit-inline-scripts.js`: OK.
- `node qa/audit-encoding.js`: OK.
- `git diff --check`: OK.

## Actualizacion verificacion provider 2026-05-07

Correcciones aplicadas:
- `mimi-servicios/src/main-provider.js`: si el admin aprueba la cuenta del prestador (`profile.approved=true`) y no hay documentos rechazados, el prestador queda operativamente verificado aunque existan filas antiguas o faltantes de DNI/selfie. El boton para ponerse online ya abre el estado de verificacion y no reinicia el wizard.
- `mimi-servicios/src/ui/render-provider.js`: las tarjetas de confianza muestran `Aprobado por admin` para documentos requeridos faltantes cuando la cuenta ya fue aprobada por administracion. El certificado de buena conducta sigue como pendiente/opcional hasta que se cargue y revise.
- `mimi-servicios/supabase/functions/admin-review-service-provider/index.ts`: las acciones admin sobre prestadores registran `reviewed_by` en los documentos existentes junto con estado, nota y fecha.

Backend aplicado:
- Edge Function `admin-review-service-provider` desplegada en Supabase con `--use-api --workdir mimi-servicios`.

Pruebas:
- `node --check mimi-servicios/src/main-provider.js`: OK.
- `node --check mimi-servicios/src/ui/render-provider.js`: OK.
- `node qa/audit-encoding.js`: OK, 0 hallazgos.
- `node qa/audit-routes.js`: OK.
- `node qa/audit-inline-scripts.js`: OK.
- `git diff --check`: OK.

## Actualizacion servicios provider 2026-05-07

Correcciones aplicadas:
- `mimi-servicios/src/main-provider.js`: el panel extendido del prestador ahora renderiza realmente `providerBusinessPanel`; antes la pestana visible quedaba solo con la tarjeta vieja de precio. El prestador no puede ponerse online sin al menos un servicio publicado.
- `mimi-servicios/prestador.html`: la pestana `Precios` pasa a `Servicios`, muestra servicio principal/precio visible y agrega CTA `Configurar servicio`.
- `mimi-servicios/src/ui/render-provider.js`: se agrega bloque destacado para crear oficio/profesion como publicacion tipo marketplace.
- `mimi-servicios/src/services/service-api.js`: las categorias cargan modalidad y requisitos profesionales desde Supabase para soportar servicios online, sesion, matricula y buena conducta.
- `mimi-servicios/styles/provider.css`: estilos mobile-first para el bloque de creacion de servicios.

Backend verificado:
- Existen columnas `allowed_service_modes`, `requires_professional_license` y `requires_background_check` en `svc_categories`.
- RLS permite self read/write en categorias, pricing, disponibilidad, perfil y publicaciones del prestador.

Pruebas:
- `node --check mimi-servicios/src/main-provider.js`: OK.
- `node --check mimi-servicios/src/ui/render-provider.js`: OK.
- `node --check mimi-servicios/src/services/service-api.js`: OK.
- `node qa/audit-encoding.js`: OK, 0 hallazgos.
- `node qa/audit-routes.js`: OK.
- `node qa/audit-inline-scripts.js`: OK.
- `git diff --check`: OK.

## Hotfix provider online sin servicio 2026-05-07

Correcciones aplicadas:
- `mimi-servicios/src/ui/render-provider.js`: los renders de perfil, negocio y documentos ya no rompen si `state.provider.business` todavia no esta hidratado. Esto evita pantalla negra durante el arranque o con datos parciales.
- `mimi-servicios/src/main-provider.js`: el render completo del provider se ejecuta en cada actualizacion normal del estado para que el panel de servicios aparezca despues de cargar workspace.

Backend corregido:
- Se detectaron 3 prestadores en `ONLINE_IDLE` sin publicaciones activas y se pasaron a `OFFLINE`: `emunaclothingshop@gmail.com`, `maricelkarra@gmail.com`, `voltex.electromantenimiento@gmail.com`.

Pruebas:
- `node --check mimi-servicios/src/main-provider.js`: OK.
- `node --check mimi-servicios/src/ui/render-provider.js`: OK.
- `node qa/audit-encoding.js`: OK, 0 hallazgos.
- `node qa/audit-routes.js`: OK.
- `node qa/audit-inline-scripts.js`: OK.
- `git diff --check`: OK.

## Hotfix provider categoria nula 2026-05-07

Correcciones aplicadas:
- `mimi-servicios/src/ui/render-provider.js`: `recommendedDefaultsForCategory` ahora tolera `null`, evitando el crash `Cannot read properties of null (reading 'default_pricing_model')` cuando el prestador aun no eligio rubro.
- `mimi-servicios/prestador.html`: cache-busting de `main-provider.js` actualizado a `2026.05.07.3`.
- `mimi-servicios/sw-2026.js`: version de service worker actualizada para invalidar cache anterior.

Pruebas:
- `node --check mimi-servicios/src/ui/render-provider.js`: OK.
- `node --check mimi-servicios/src/main-provider.js`: OK.
- `node qa/audit-routes.js`: OK.
- `git diff --check`: OK.

## Actualizacion setup guiado provider 2026-05-07

Correcciones aplicadas:
- `mimi-servicios/src/ui/render-provider.js`: se agrega flujo guiado mobile-first para configurar servicios con progreso visible, asistente de rubros, etapas, ayuda contextual, calidad privada del perfil y aceptacion de terminos.
- `mimi-servicios/src/main-provider.js`: se conecta el asistente con `svc-resolve-service-intent`, fallback local por aliases/categorias, autocompletado de primer servicio y validacion obligatoria de terminos antes de guardar.
- `mimi-servicios/styles/provider.css`: estilos para wizard, chips de sugerencias, calidad privada, ayuda y terminos.
- `mimi-servicios/prestador.html` y `mimi-servicios/sw-2026.js`: cache-busting/version nueva para forzar assets frescos.

Backend reutilizado:
- IA/capa inteligente: Edge Function `svc-resolve-service-intent`.
- Legal: Edge Function `accept-legal-document` y documentos existentes `terms_providers` / `privacy_policy` version `2026.1.0`.
- No se duplicaron tablas legales; se reutilizan `legal_acceptances`, `legal_versions`, `legal_documents` y `consent_ledger`.

Decisiones:
- La disponibilidad semanal ya no se pide en esta etapa. La disponibilidad operativa depende de estar online/offline.
- La calidad del perfil es privada para el prestador; no se muestra como rating, garantia, certificacion ni ranking publico.

Pruebas:
- `node --check mimi-servicios/src/main-provider.js`: OK.
- `node --check mimi-servicios/src/ui/render-provider.js`: OK.
- `node --check mimi-servicios/src/services/service-api.js`: OK.
- `node qa/audit-encoding.js`: OK, 0 hallazgos.
- `node qa/audit-routes.js`: OK.
- `node qa/audit-inline-scripts.js`: OK.
- `git diff --check`: OK.

## Refresh UI/UX real provider 2026-05-07

Correcciones aplicadas:
- `mimi-servicios/prestador.html`: se elimina la pantalla vieja de `Precios` con datos estaticos y chips hardcodeados; ahora el tab muestra solo el configurador real y los chips se alimentan del backend.
- `mimi-servicios/src/ui/render-provider.js`: el flujo de configurar servicio pasa a una experiencia tipo publicador por etapas, con hero, resumen del servicio publicado, asistente visible, perfil publico, categorias, publicacion, revision y CTA final claro.
- `mimi-servicios/src/main-provider.js`: la disponibilidad inmediata/programada ya no depende de checkboxes del setup; el servicio queda configurable sin pedir horarios.
- `mimi-servicios/styles/provider.css`: nuevo shell visual mobile-first, tarjetas por etapa, progreso, resumen oscuro de publicacion, ayuda contextual y datos tecnicos plegados.
- `mimi-servicios/sw-2026.js` y `mimi-servicios/prestador.html`: cache-busting actualizado a `2026.05.07.5`.

Decision UX:
- Los datos tecnicos viejos de precio quedan plegados en `Ver datos tecnicos guardados`; el prestador ve primero la experiencia guiada y no un formulario legacy.
- No se muestran rankings, certificaciones ni garantias publicas. La completitud sigue siendo privada.
