# MIMI GO - TWA Play Store Release Result

Fecha: 2026-05-09  
Dominio: `https://mimi-transporte.vercel.app`  
Alcance: Android TWA / Play Store, sin tocar backend ni frontend enterprise.

## Resumen ejecutivo

La estrategia queda cerrada en **2 apps Android**, no 3:

1. **MIMI GO Servicios**
   Package name: `com.mimigo.clientes`  
   Uso: clientes para solicitar servicios.

2. **MIMI GO Partners**
   Package name: `com.mimigo.partners`  
   Uso: prestadores independientes.

No se recomienda publicar una tercera app en esta etapa. `MIMI GO Partners` concentra el rol operativo de prestadores, reduce friccion de publicacion, simplifica soporte y mantiene los package names ya firmados y vinculados por Digital Asset Links. MIMI Transporte queda hibernado internamente, sin promocion publica.

## Estado de archivos existentes auditados

Ya existian y fueron validados:

- `.well-known/assetlinks.json`
- `PLAY_STORE_READINESS.md`
- `manifest-clientes.json`
- `manifest-partners.json`
- `mimi-servicios/manifest.json`
- `mimi-servicios/manifest-prestador.json`
- `/privacidad`
- `/delete-account`
- service workers
- Vercel rewrites

No se tocaron backend, RLS, RPC, Edge Functions ni flujos enterprise.

## Manifests validados

Validacion local JSON:

| Archivo | App | Start URL | Scope | 512 icon | Estado |
|---|---|---:|---:|---:|---|
| `manifest-clientes.json` | MIMI GO Servicios | `/servicios` | `/` | si | OK |
| `manifest-partners.json` | MIMI GO Partners | `/mimi-servicios/prestador.html` | `/` | si | OK |
| `mimi-servicios/manifest.json` | MIMI Go Servicios | `/mimi-servicios/cliente.html` | `/mimi-servicios/` | si | OK |
| `mimi-servicios/manifest-prestador.json` | MIMI Go Prestadores | `/mimi-servicios/prestador.html` | `/mimi-servicios/` | si | OK |

Validacion HTTP produccion:

- `https://mimi-transporte.vercel.app/manifest-clientes.json` -> `200 application/json`
- `https://mimi-transporte.vercel.app/manifest-partners.json` -> `200 application/json`
- `https://mimi-transporte.vercel.app/.well-known/assetlinks.json` -> `200 application/json`

## Digital Asset Links

`assetlinks.json` publicado contiene exactamente los dos package names requeridos.

### MIMI Go clientes

Package:

```text
com.mimigo.clientes
```

Cert SHA-256:

```text
D6:47:22:D3:73:BB:48:64:97:59:C0:C8:D8:57:BF:AC:1D:92:35:37:A9:8D:DD:10:51:80:18:92:43:61:02:EA
```

Google Digital Asset Links API:

```json
{ "linked": true }
```

### MIMI GO Partners

Package:

```text
com.mimigo.partners
```

Cert SHA-256:

```text
B3:D5:A7:1E:EB:C1:89:FA:F1:92:67:F6:C4:E2:9D:CC:DF:3D:15:C2:9F:7C:AF:0B:6D:09:AB:0A:B5:83:AC:5F
```

Google Digital Asset Links API:

```json
{ "linked": true }
```

## Proyectos Bubblewrap

Se encontraron proyectos Android/Bubblewrap ya separados:

- `C:\Users\paulo\OneDrive\Documentos\GitHub\mimi-android-clientes`
- `C:\Users\paulo\OneDrive\Documentos\GitHub\mimi-android-partners`

Configuracion verificada:

| Proyecto | Package | Host | Start URL | Manifest |
|---|---|---|---|---|
| `mimi-android-clientes` | `com.mimigo.clientes` | `mimi-transporte.vercel.app` | `/servicios` | `manifest-clientes.json` |
| `mimi-android-partners` | `com.mimigo.partners` | `mimi-transporte.vercel.app` | `/mimi-servicios/prestador.html` | `manifest-partners.json` |

Nota operativa: `bubblewrap build` pide la contrasena del keystore local. No se hardcodeo ni se intento forzar ese secreto. Los AAB existentes ya estaban generados, firmados y fueron verificados.

## AAB release

Se consolidaron los AAB firmados en el repo para entrega:

| App | AAB | SHA-256 archivo | Firma |
|---|---|---|---|
| MIMI GO Servicios | `docs/playstore/dist/mimigo-clientes-release-v1.aab` | `40C907EC1BB8C439B078543D4D1C0841EAFEEEF977EB11117C9E34D5E5F6BD98` | `jar verified` |
| MIMI GO Partners | `docs/playstore/dist/mimigo-partners-release-v1.aab` | `7FE2DF212E6411BE998F931531E54789847CCF113316428FD3A1AAC6ACE24DDB` | `jar verified` |

Firma de los bundles:

```text
CN=Paulo Millanez, OU=Technology, O=MIMI Go, C=AR
```

Advertencias esperadas de `jarsigner`: certificado self-signed y sin timestamp. Para Play App Signing esto es normal como upload key/cert local, pero al crear la app en Play Console hay que conservar el keystore y no perder la contrasena.

## Logos y assets Play Store

Se crearon assets visibles para Play Store, usando identidad negra/blanca y variante partners con acento dorado:

### MIMI GO Servicios

- Icono 512: `docs/playstore/assets/mimigo-clientes-icon-512.png`
- Feature graphic 1024x500: `docs/playstore/assets/mimigo-clientes-feature-graphic.png`

### MIMI GO Partners

- Icono 512: `docs/playstore/assets/mimigo-partners-icon-512.png`
- Feature graphic 1024x500: `docs/playstore/assets/mimigo-partners-feature-graphic.png`

## Validaciones ejecutadas

Comandos relevantes:

```powershell
node -e "JSON.parse(require('fs').readFileSync('manifest-clientes.json','utf8'))"
node -e "JSON.parse(require('fs').readFileSync('manifest-partners.json','utf8'))"
keytool -printcert -jarfile app-release-bundle.aab
jarsigner -verify app-release-bundle.aab
curl.exe -L -s https://mimi-transporte.vercel.app/.well-known/assetlinks.json
curl.exe -L -s "https://digitalassetlinks.googleapis.com/v1/assetlinks:check?..."
```

Resultado:

- Manifests parsean OK.
- AAB clientes firmado y verificado.
- AAB partners firmado y verificado.
- SHA-256 del certificado coincide con `assetlinks.json`.
- Digital Asset Links responde `linked: true` para ambas apps.

`bubblewrap validate` no pudo completar porque Google PageSpeed API respondio `429`. Esto no invalida los TWA: la validacion critica de Digital Asset Links paso correctamente.

## Checklist Play Console

### Crear apps

- Crear app Android: `MIMI GO Servicios`
- Package name al subir AAB: `com.mimigo.clientes`
- Crear app Android: `MIMI GO Partners`
- Package name al subir AAB: `com.mimigo.partners`

### Bundles

- Subir `docs/playstore/dist/mimigo-clientes-release-v1.aab`
- Subir `docs/playstore/dist/mimigo-partners-release-v1.aab`

### Store listing

MIMI GO Servicios:

- Icono: `docs/playstore/assets/mimigo-clientes-icon-512.png`
- Feature graphic: `docs/playstore/assets/mimigo-clientes-feature-graphic.png`
- Descripcion corta sugerida: `Solicita servicios cerca tuyo con MIMI GO.`
- Descripcion larga sugerida: `MIMI GO Servicios es una plataforma tecnologica que conecta usuarios con prestadores independientes disponibles. Gestiona busqueda, solicitud, estado del servicio, comunicacion y notificaciones desde una experiencia simple y mobile-first. MIMI actua como intermediario tecnologico.`

MIMI GO Partners:

- Icono: `docs/playstore/assets/mimigo-partners-icon-512.png`
- Feature graphic: `docs/playstore/assets/mimigo-partners-feature-graphic.png`
- Descripcion corta sugerida: `Panel para prestadores MIMI GO.`
- Descripcion larga sugerida: `MIMI GO Partners permite a prestadores independientes gestionar su perfil, verificaciones, disponibilidad, solicitudes y servicios dentro del ecosistema MIMI. MIMI facilita la conexion tecnologica entre partes.`

### Politicas y formularios

- Politica de privacidad: `https://mimi-transporte.vercel.app/privacidad`
- Eliminacion de cuenta: `https://mimi-transporte.vercel.app/delete-account`
- Terminos: `https://mimi-transporte.vercel.app/terminos`
- Completar Data Safety declarando datos segun uso real:
  - ubicacion aproximada/precisa para servicios y prestadores cercanos;
  - informacion personal de cuenta;
  - fotos/documentos solo para verificaciones donde aplique;
  - notificaciones push si se habilitan;
  - datos de uso/diagnostico si se activa monitoreo.
- Clasificacion de contenido: marketplace/intermediacion tecnologica de servicios.
- Subir capturas reales mobile para:
  - experiencia cliente de servicios;
  - busqueda/solicitud cliente;
  - estado y seguimiento de la solicitud;
  - panel prestador;
  - verificacion/cuenta.

## Estado final honesto

Estado: **listo para carga en Play Console con 2 apps**, con AAB firmados y Digital Asset Links validados.

No se declara "publicado" porque falta la accion manual dentro de Play Console:

1. Crear ambas apps.
2. Subir AAB.
3. Completar store listing.
4. Completar Data Safety.
5. Completar clasificacion de contenido.
6. Enviar a revision.

Riesgo residual principal:

- Si se quiere regenerar un AAB nuevo desde Bubblewrap, se necesita la contrasena del keystore local. No debe perderse ese keystore, porque cambiarlo rompe continuidad de firma salvo proceso formal de Play App Signing.
