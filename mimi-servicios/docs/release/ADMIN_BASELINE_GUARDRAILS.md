# Admin Baseline Guardrails

Este documento es una senal de release safety para el panel administrador de MIMIGO Servicios. Ningun cambio futuro debe usar una version desfasada del admin ni reemplazar la app existente por una pantalla mas simple.

## Baseline valida

- Base valida: `C:\Users\paulo\OneDrive\Documentos\GitHub\mimi-transporte`
- No usar: `C:\Users\paulo\OneDrive\Documentos\GitHub\mimi-transporte-servicios-release`
- Ruta productiva a proteger: `/admin/admin-panel`
- Ruta canonica de panel: `/admin/panel`
- Superficie versionada de servicios: `/mimi-servicios/admin/admin-panel.html`

## Modulos que no se pueden borrar ni degradar

El admin debe conservar como minimo:

- Prestadores / KYC
- Clientes
- Finanzas
- Soporte
- Catalogo Inteligente

Estos modulos no son trabajo suelto pendiente. Son baseline funcional. Si una fase nueva necesita agregar una seccion, debe integrarse de forma aditiva.

## Regla de no transformacion

- No transformar el admin en otra aplicacion.
- No reemplazar el layout real vigente por una version anterior.
- No quitar Clientes.
- No quitar Finanzas.
- No quitar Soporte.
- No quitar Prestadores / KYC.
- No quitar Catalogo Inteligente una vez integrado.
- No usar archivos de una copia desfasada como source of truth.

## Regla de limpieza defensiva

No borrar archivos, rutas, scripts o estilos porque "parecen no usados".

Antes de borrar algo debe existir una fase separada de cleanup con:

- Inventario de referencias estaticas y dinamicas.
- Verificacion de rutas publicadas.
- Verificacion de imports con cache version.
- Verificacion de Service Worker o manifests.
- QA que pruebe que el borrado no causa 404 ni error de modulo.
- Plan de rollback.

Si no existe esa evidencia, no se borra. Se preserva y se integra alrededor.

## Guardrail antes de deploy

Antes de aprobar un deploy que toque admin debe pasar QA que confirme:

- `/admin/admin-panel` contiene Prestadores/KYC, Clientes, Finanzas, Soporte y Catalogo Inteligente.
- `/mimi-servicios/admin/admin-panel.html` contiene Prestadores/KYC, Clientes, Finanzas, Soporte y Catalogo Inteligente.
- El shell admin reconoce la vista `catalog` sin perder `providers`, `clients`, `finance` ni `support`.
- `admin-service-catalog.js` es read-only.
- No hay `service_role` en frontend.
- No se tocaron Transporte, Mercado Pago, payment-webhook, pagos ni requests historicas.

## Relacion con Service Intelligence

Catalogo Inteligente es la vista admin read-only de Service Intelligence Foundation. No activa catalogo publico, pricing engine, IA ni cotizacion. Cliente y prestador publico deben seguir sin cambios salvo aprobacion explicita de release.
