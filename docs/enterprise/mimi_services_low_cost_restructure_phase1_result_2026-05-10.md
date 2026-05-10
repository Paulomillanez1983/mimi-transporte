# MIMI Servicios - Reestructuracion low-cost - Fase 1

Fecha: 2026-05-10
Alcance: producto/hub publico, sin cambios backend.

## Diagnostico

El hub principal seguia comunicando MIMI como una experiencia pareja de viajes y servicios. Eso chocaba con la nueva decision de negocio: MIMI Servicios debe ser el producto principal y Transporte debe quedar disponible, pero secundario.

## Cambios aplicados

- `hub-clientes.html`
  - Meta title, description, OG y Twitter orientados a MIMI Servicios.
  - Hero principal enfocado en servicios cerca del usuario.
  - Card de Servicios marcada como producto principal.
  - CTA principal: `Buscar prestador` hacia `/servicios`.
  - CTA secundario para prestadores hacia `/prestador`.
  - Transporte queda como modulo de viajes, con CTA secundario hacia `/viaje`.
  - Copy ajustado para no prometer tracking permanente.

- `hub-clientes.css`
  - Nuevo layout `.cards.services-first`.
  - Servicios aparece primero y con mayor peso visual.
  - Transporte queda visible pero menos dominante.
  - Ajustes responsive para mobile sin crear scroll horizontal.
  - Focus visible para CTA principal y link de prestador.

- `vercel.json`
  - Redirect temporal de `/` a `/hub-clientes`.
  - Motivo: Vercel servia el `index.html` fisico antes del rewrite de `/`, por lo que la home seguia mostrando Transporte.
  - `/viaje` sigue apuntando al producto de Transporte.

## Riesgos

- Riesgo bajo: solo se tocaron HTML/CSS del hub publico.
- No se modificaron backend, Supabase, RLS, Edge Functions, auth, PWA ni service workers.
- Se agrego un redirect seguro para que la home publica apunte al hub de Servicios.
- Transporte sigue accesible por `/viaje` y no fue eliminado.

## QA ejecutado

- `node qa/audit-routes.js` -> OK
- `node qa/audit-encoding.js` -> OK
- `git diff --check` -> OK, solo advertencias de CRLF esperadas en Windows

## QA no ejecutado

- E2E autenticado: no corresponde a esta fase visual y requiere variables de entorno E2E.
- Validacion visual en produccion: pendiente de commit, push y deploy.

## Como probar

1. Abrir `/` o `/hub-clientes`.
2. Confirmar que `/` redirige a `/hub-clientes`.
3. Confirmar que el primer mensaje visible posiciona Servicios como producto principal.
4. Tocar `Buscar prestador` y verificar que navega a `/servicios`.
5. Tocar `Soy prestador y quiero publicar mis servicios` y verificar que navega a `/prestador`.
6. Tocar `Ir a viajes` y verificar que Transporte sigue disponible en `/viaje`.

## Estado

Fase 1 aplicada localmente y lista para deploy tras commit.
