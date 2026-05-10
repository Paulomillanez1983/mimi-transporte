# MIMI Servicios - Public Focus Hardening 2026-05-10

## Resumen ejecutivo

Se aplico una fase acotada de hardening de producto para que la superficie publica de MIMI quede enfocada en MIMI Servicios. MIMI Transporte no se borro ni se modifico a nivel backend; queda preservado como modulo interno/dormido.

## Auditoria realizada

- `vercel.json`: rutas publicas, redirects, rewrites y headers.
- `hub-clientes.html` / `hub-clientes.css`: referencias visibles a viajes y CTA de transporte.
- `manifest.json` / `manifest-clientes.json`: nombre, descripcion, start_url y categorias.
- `mimi-servicios/cliente.html` / `mimi-servicios/prestador.html`: Open Graph visible.
- `service-worker.js`: precache publico.
- `robots.txt` / `sitemap.xml`: indexacion publica.
- QA local: rutas, encoding, JSON, service workers.

## Cambios aplicados

- `/`, `/cliente`, `/hub-clientes`, `/viaje` y `/chofer` redirigen publicamente a `/servicios`.
- Se mantienen rewrites internos para preservar archivos y compatibilidad futura.
- La landing/hub ya no muestra card, CTA ni copy de viajes.
- El visual hero dejo de usar el auto y usa chips de rubros de servicios.
- Manifest principal y de clientes ahora arrancan en `/servicios` y describen servicios.
- Open Graph de cliente/prestador usa `MIMI Servicios`.
- `robots.txt` desindexa rutas y archivos publicos de transporte/chofer.
- `sitemap.xml` incluye solo URLs de Servicios, prestador y legales.
- `service-worker.js` deja de precachear pantallas de chofer y prioriza servicios.

## Riesgos reales

- Usuarios que entren directo a `/viaje` o `/chofer` seran redirigidos a Servicios.
- Los archivos directos `index.html` y `chofer-panel.html` siguen disponibles para preservacion interna, con `X-Robots-Tag: noindex`.
- Si se relanza Transporte, hay que revertir redirects y actualizar manifests/SEO.

## QA ejecutado

- `node qa/audit-routes.js`: PASSED.
- `node qa/audit-encoding.js`: PASSED.
- `node --check qa/audit-routes.js`: PASSED.
- `node --check service-worker.js`: PASSED.
- `node --check service-worker-clientes.js`: PASSED.
- `git diff --check`: PASSED con warnings CRLF no bloqueantes.
- JSON parse de `vercel.json`, `manifest.json`, `manifest-clientes.json`: PASSED.

## Recomendacion CTO

Deploy aprobado para ocultamiento publico de Transporte y foco principal en MIMI Servicios. No se tocaron tablas, RLS, Edge Functions ni flujos internos de Transporte.
