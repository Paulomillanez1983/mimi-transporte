# MIMI Servicios - Client UX Upgrade 2026-05-10

## Resumen ejecutivo

Se aplico una mejora acotada sobre el flujo cliente de MIMI Servicios, enfocada en dos fricciones reales: confirmacion demasiado larga y falta de feedback inmediato luego de enviar una solicitud. No se modifico backend, RLS, Edge Functions ni contratos de API.

## Auditoria UX actual

- La confirmacion de solicitud mostraba toda la direccion completa y ocupaba mas alto del necesario en mobile.
- El precio y el prestador estaban mezclados con metadata secundaria, bajando la jerarquia visual.
- Al confirmar, la modal se cerraba y la app quedaba esperando `svc-create-request`, payment intent e hidratacion realtime sin un estado intermedio visible.
- El boton original quedaba cargando fuera del foco visual del usuario, generando la sensacion de que la app no habia hecho nada.

## Problemas psicologicos detectados

- Ansiedad post-tap: el usuario no sabia si la solicitud se habia enviado.
- Riesgo de doble accion: ante falta de feedback, el usuario podia volver a tocar.
- Ruido cognitivo: direccion con niveles administrativos extensos hacia mas pesada la decision.
- Menor confianza percibida: la espera sin contexto hacia parecer lento un flujo que tecnicamente seguia trabajando.

## Mejoras implementadas

- Card de confirmacion mas compacta y adaptativa.
- Bloque prioritario para prestador y total estimado.
- Direccion compactada para mostrar calle/numeracion, localidad corta y codigo postal cuando existe.
- Summary secundario en grilla compacta.
- Overlay premium post-confirmacion con pasos reales:
  - Enviar
  - Notificar
  - Seguimiento
- El overlay se activa inmediatamente despues del tap y se mantiene hasta que existe solicitud activa e hidratacion inicial.
- Se bloquea el doble submit en la confirmacion.
- Se oculta el overlay automaticamente si ocurre un error.
- Cache bust actualizado en `cliente.html` y version de service worker actualizada.

## Impacto esperado

- Menor altura de card en mobile.
- Mejor comprension de precio/prestador antes de confirmar.
- Menor ansiedad durante los 7-15 segundos de trabajo backend/realtime.
- Menos taps repetidos.
- Mayor sensacion de velocidad y continuidad.

## Riesgos evitados

- No se altero `svc-create-request`.
- No se altero pricing.
- No se altero realtime.
- No se altero payment intent.
- No se alteraron estados de solicitud.
- No se tocaron tablas ni policies.

## QA ejecutado

- `node --check mimi-servicios/src/main-client.js`: PASSED.
- `node --check mimi-servicios/src/ui/render-client.js`: PASSED.
- `node --check mimi-servicios/sw-2026.js`: PASSED.
- `node qa/audit-routes.js`: PASSED.
- `node qa/audit-encoding.js`: PASSED.
- `git diff --check`: PASSED con warnings CRLF no bloqueantes.
- `node qa/enterprise-global-e2e.js`: BLOCKED_BY_ENVIRONMENT por falta de variables E2E en el proceso local.

## QA realtime

No se modifico la capa realtime. La mejora se monta encima del flujo existente y solo cambia la percepcion visual mientras corren las llamadas reales. El E2E autenticado no se ejecuto en esta corrida porque faltan `MIMI_SUPABASE_URL`, `MIMI_SUPABASE_ANON_KEY` y credenciales E2E en el entorno local.

## Estado final UX/UI

Listo para deploy frontend. Recomendacion: validar en celular real el flujo `Solicitar -> Enviar solicitud` y confirmar que el overlay aparece inmediatamente hasta ver el resumen activo.
