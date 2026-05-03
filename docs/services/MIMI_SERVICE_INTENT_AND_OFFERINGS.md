# MIMI Servicios - Intencion, profesiones y ofertas flexibles

Fecha: 2026-05-02  
Proyecto Supabase: `xrphpqmutvadjrucqicn`

## Diagnostico backend

El backend actual busca prestadores por `category_id`, ubicacion, estado, disponibilidad y precio por hora. Esto funciona para servicios horarios, pero no alcanza para necesidades abiertas como:

- "se pincho la rueda" -> gomeria movil
- "el auto no arranca" -> mecanica movil
- "necesito una reja" -> herreria
- "quiero cortar el pasto" -> jardineria

Lo que faltaba era una capa backend propia de MIMI para resolver texto libre del cliente contra profesiones/categorias, y un modelo para que el prestador publique trabajos con distintos modelos de precio.

## Nueva arquitectura propuesta

### 1. `svc_service_intent_rules`

Tabla de reglas editables para convertir situaciones en categorias. No depende de hardcodear todo en el frontend.

Ejemplo:

- frase: `se pincho la rueda`
- keywords: `pincho`, `rueda`, `cubierta`, `neumatico`
- categoria: `GOMERIA_MOVIL`

### 2. `svc_provider_service_offerings`

Tabla para que cada prestador publique servicios concretos dentro de una categoria.

Modelos soportados:

- `HOURLY`: precio por hora.
- `BASE_VISIT`: precio base por ir, diagnosticar o presupuestar.
- `QUOTE`: requiere presupuesto del prestador.
- `FIXED`: precio cerrado.
- `UNIT`: precio por unidad.
- `SQUARE_METER`: precio por metro cuadrado.
- `LINEAR_METER`: precio por metro lineal.

Esto permite casos como:

- Herrero: visita/presupuesto + cotizacion.
- Jardinero: por hora, por visita o por metro cuadrado.
- Gomeria movil: precio base por auxilio + extra acordado.
- Mecanico movil: diagnostico base + presupuesto.

### 3. Edge Function `svc-resolve-service-intent`

Recibe:

```json
{
  "query": "se me pincho la rueda",
  "limit": 5
}
```

Devuelve:

```json
{
  "ok": true,
  "top_match": {
    "code": "GOMERIA_MOVIL",
    "name": "Gomeria movil",
    "default_pricing_model": "BASE_VISIT",
    "requires_provider_quote": false,
    "confidence": 0.98
  },
  "matches": []
}
```

## Flujo correcto

1. Cliente escribe una situacion.
2. Frontend llama `svc-resolve-service-intent`.
3. Backend devuelve categoria/profesion sugerida.
4. Cliente confirma o cambia categoria.
5. App busca prestadores con `svc-search-providers`.
6. Si hay prestadores, muestra opciones.
7. Si no hay, muestra que no hay disponibilidad actual para esa profesion.

## Importante comercial/legal

MIMI no define el precio del servicio ni presta el trabajo. MIMI:

- clasifica la necesidad,
- conecta cliente y prestador,
- organiza solicitud, chat, tracking y pagos,
- cobra comision de plataforma.

El prestador:

- define su oferta,
- define su modelo de precio,
- presta el servicio,
- factura al cliente si corresponde.

## Archivos creados

- `docs/services/supabase-service-intent-offerings.sql`
- `mimi-servicios/supabase/functions/svc-resolve-service-intent/index.ts`

## Deploy pendiente

Cuando quieras aplicarlo en Supabase:

1. Ejecutar el SQL `docs/services/supabase-service-intent-offerings.sql`.
2. Desplegar la Edge Function `svc-resolve-service-intent`.
3. Agregar reglas nuevas desde SQL/Admin cuando aparezcan nuevas profesiones.
4. En una segunda etapa, sumar UI del prestador para administrar `svc_provider_service_offerings`.
