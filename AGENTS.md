# MIMIGO Servicios — guía para agentes de código

> Este archivo es la fuente de verdad para cualquier agente (Codex, Claude Code, Cursor…) que trabaje en este repo.
> **Copialo a la raíz del repositorio.** Codex lee `AGENTS.md`; Claude Code lee `CLAUDE.md` (que importa este archivo con `@AGENTS.md`).
> Si descubrís algo nuevo y verificado, agregalo acá: el archivo se mantiene vivo.

## Qué es esto

Marketplace de servicios a domicilio (Córdoba, Argentina). Un **cliente** pide un servicio, un **prestador** verificado lo acepta y ejecuta, y un **admin** aprueba prestadores y da soporte.

- Frontend: HTML + JS estático (sin build) en Vercel.
- Backend: Supabase (Postgres + Auth OTP + Storage + Realtime + Edge Functions).
- `mimigo.com.ar` es el dominio de producción; `mimi-transporte.vercel.app` es el fallback.

## Alcance — leé esto antes de tocar nada

| | |
|---|---|
| **EN ALCANCE** | `mimi-servicios/` · `admin/` · `supabase/` (migraciones + functions) |
| **FUERA DE ALCANCE** | `js/` · `chofer-panel.html` · `driver-*.html` · `login-chofer.html` · `partners.html` · `index-v2.html` · `mimi-driver-sim.js` · las 7 migraciones de viajes/chofer |

El producto **abandonó el vertical de transporte**: ese código sigue en el repo pero no se usa ni se mantiene.

**No lo modifiques, no lo "arregles", no lo refactorices.** Si una tarea parece requerirlo, preguntá antes. Tamaño real, para que dimensiones el ruido:

| Módulo | Archivos JS | Líneas |
|---|---|---|
| `mimi-servicios/` (en alcance) | 31 | 31.733 |
| `js/` (transporte, muerto) | 38 | 23.112 |
| `admin/` (en alcance) | 9 | 5.365 |
| `qa/` (harness de tests) | 22 | 2.743 |

## Arquitectura

- **Config del backend: un solo archivo.** `mimi-servicios/env.js` expone `window.MIMI_SERVICES_ENV` (`SUPABASE_URL`, `SUPABASE_ANON_KEY`). Lo consume `mimi-servicios/src/config.js`. No hay otra URL de Supabase en el código de Servicios, y no debe haberla.
- **Ruteo:** `vercel.json` → `/servicios` = `mimi-servicios/cliente.html`, `/prestador` = `mimi-servicios/prestador.html`.
- **Admin:** `admin/admin-env.js` + `admin/supabase-admin-client.js` (⚠️ este último tiene URL y anon key duplicadas y hardcodeadas: pendiente de unificar con `window.MIMI_ADMIN_ENV`).
- **CMS:** el PocketBase del VPS está **dado de baja** (hosting impago). `MIMI_POCKETBASE_ENABLED` debe quedar en `false` y `VITE_POCKETBASE_URL` vacío. No lo reactives.
- **Service worker:** `mimi-servicios/sw-2026.js` sirve `env.js` network-first. Si editás `env.js`, subí la versión del SW.

## Flujo de negocio — la parte más importante

**La autoridad de las transiciones es un solo archivo:**
`mimi-servicios/supabase/functions/_shared/service-lifecycle.ts`

Los `svc-provider-en-route`, `svc-provider-arrived` y `svc-complete-service` son **wrappers de 15 líneas** que le pasan configuración (`allowedStatuses`, `targetStatus`, `providerStatus`, entidad de notificación). **Si vas a cambiar una transición, hacelo en el helper, no en cada wrapper.**

### Estados

```
svc_requests.status
PENDING_PROVIDER_RESPONSE → ACCEPTED → PROVIDER_EN_ROUTE → PROVIDER_ARRIVED → IN_PROGRESS → COMPLETED
                                   ↘ CANCELLED / EXPIRED (desde cualquier punto)

svc_request_offers.status
PENDING → ACCEPTED | REJECTED | EXPIRED

svc_providers.status
OFFLINE → ONLINE_IDLE ⇄ BOOKED_UPCOMING → EN_ROUTE → ARRIVED → IN_SERVICE → ONLINE_IDLE
```

`IN_SERVICE` es estado del **prestador**, no de la solicitud. La solicitud usa `IN_PROGRESS`. No son duplicados.

### Las 4 compuertas y sus códigos de error

| Código | Compuerta | Condición |
|---|---|---|
| **403** `provider_not_allowed` | Aprobación del admin | `svc_providers.approved === true` y `blocked !== true` |
| **402** `payment_not_approved` | Pago | La última fila de `payments` (`context_type='SERVICE_REQUEST'`, `context_id=request.id`) debe estar en `APPROVED`/`CAPTURED`/`SETTLED`. **Excepción: si `pricing_model === 'QUOTE'` o el total es 0, no se exige pago.** |
| **409** `pin_not_ready` / `pin_expired` / `pin_temporarily_locked` | PIN del cliente | Solo el cliente puede generar el PIN (`svc-get-service-pin`, 403 si no es él); el prestador lo ingresa en `svc-start-service` |
| **409** `invalid_request_status` | Orden de pasos | La respuesta incluye `expected: [...]` |

`401` = falta JWT. **Toda respuesta trae `correlation_id`**: buscarlo en Supabase → Logs → Edge Functions. Los handlers loguean con `area: "mimi_services_lifecycle"`.

### Reglas que no se ven en la UI

1. **Una sola solicitud activa por cliente** (índice `ux_svc_active_request_per_client`). Crear una nueva cancela las anteriores automáticamente.
2. **La solicitud es dirigida a UN prestador** (`selected_provider_id` + una sola oferta `PENDING`). No es un remate ni una subasta entre varios.
3. **Las transiciones son idempotentes:** repetir devuelve `already_processed: true`.
4. Cuando el **prestador** cancela, el **cliente no recibe notificación** (hueco conocido de UX).

## Prohibiciones

- **NUNCA** commitear `service_role`, tokens de MercadoPago, ni claves privadas de Firebase. La `anon key` es pública por diseño; lo demás va en secrets de Supabase/GitHub.
- **No debilitar RLS para "que funcione".** Hoy las tablas `svc_*` no tienen GRANT para `anon` y eso es correcto: todo el acceso pasa por las Edge Functions con `service_role`. Un `grant` a `anon` es una regresión de seguridad.
- **No modificar migraciones ya aplicadas.** Crear una migración nueva.
- **No renombrar ni reordenar estados.** `svc_requests.status` es `text` sin CHECK constraint: un typo no da error, simplemente rompe el front en silencio.
- **No agregar frameworks** (React, Vite, bundlers) al front actual sin preguntar: es vanilla JS con módulos ES y así funciona en producción.
- **No tocar el código de transporte** (ver Alcance).

## Comandos

```bash
npm run dev:test-server                        # sirve el repo en :8765
node qa/financial-core-hardening-static.js     # + los otros 9 *-static.js (solo node:fs/node:path, sin red)
npx playwright test                            # e2e (testDir ./qa, necesita browsers + server)
supabase functions deploy <nombre>
supabase functions download                    # ⚠️ hay 10 funciones desplegadas que no están en git
supabase db push                               # aplicar migraciones
supabase db pull                               # traer el esquema remoto que no está en git
```

Sin `package-lock.json`: no uses `npm ci`. Los scripts de `qa/*-static.js` corren con `node` pelado.

## Definición de "terminado" para cualquier tarea

1. Los 10 scripts `qa/*-static.js` siguen en verde.
2. Si tocaste el flujo: corré el protocolo de pasos y el SQL de inspección de `mimi-servicios-flujo/FLUJO-USO-REAL.md`.
3. `grep -rn "xrphpqmutvadjrucqicn" mimi-servicios/` → solo debe aparecer en `env.js`.
4. Pegá la salida real de los tests. No afirmes que pasan sin mostrarlo.
5. Si tocaste el flujo, actualizá esta guía y el documento del flujo.

## Convenciones

- Textos que ve el usuario final: **español rioplatense, con acentos correctos**.
- Código, variables y archivos: inglés, como el resto del repo.
- Commits: prefijos `fix:` / `feat:` / `chore:` / `perf:` / `audit:` (ver historial).

## Cómo navegar (no gastes contexto)

| Archivo | Líneas | Regla |
|---|---|---|
| `mimi-servicios/src/main-provider.js` | **11.617** | Nunca leerlo entero. Navegar con grep y leer por rangos. |
| `mimi-servicios/src/main-client.js` | 4.047 | Ídem. |
| `mimi-servicios/src/services/service-api.js` | 3.435 | Ídem; es la capa que llama a las Edge Functions. |
| `mimi-servicios/src/ui/render-*.js` | — | Renderizado; buscar por nombre de estado. |

## Pendientes verificados (backlog inicial)

1. **10 Edge Functions desplegadas no están en git** — `auth-register-device`, `auth-start-verification`, `auth-approve-challenge`, `auth-check-challenge`, `auth-cleanup-verification`, `get-legal-center`, `mark-notification-read`, `customer-trust-profile`, `customer-identity-verification`, `svc-save-provider-service`. Resolver con `supabase functions download` **antes de cualquier otra cosa**: sin eso el repo está incompleto y el agente trabaja a ciegas.
2. **1 tabla desplegada no está en git**: `svc_provider_offering_addons`. Traer con `supabase db pull`.
3. **Verificar el job de expiración**: `svc_expire_stale_service_requests` existe pero no hay ningún `cron.schedule` en el repo. Comprobar con `select * from cron.job;` — si no hay job, las ofertas vencidas nunca expiran.
4. **Notificar al cliente cuando el prestador cancela** (hoy no se notifica).
5. **Aprobación del admin deja al prestador en `OFFLINE`** — el prestador debe pasar a `ONLINE_IDLE` él mismo o no recibe nada.
6. **Acentos faltantes en `svc_categories`**: `Acompanamiento domiciliario`, `Colocacion de ceramicos`, `Manicuria`, `Tecnico PC`.
7. **`svc_requests.status` sin CHECK constraint**: agregar uno (migración nueva, validando los estados existentes).
8. **Unificar la config duplicada del admin** en `admin/supabase-admin-client.js`.
9. **Buckets de Storage sin verificar**: `provider-avatars` + documentos KYC.
10. **CI inexistente**: no hay `.github/workflows`. Ver el workflow de QA estático incluido en este paquete.
11. **Sin backups ni keepalive**: el plan Free de Supabase pausa el proyecto a los 7 días sin actividad y no tiene backups automáticos.
