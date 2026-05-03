[PLAY_STORE_READINESS.md](https://github.com/user-attachments/files/27321193/PLAY_STORE_READINESS.md)
# MIMI / MIMI Go - Preparación Google Play TWA

## Estado actual
Base web preparada para publicar dos aplicaciones Android mediante Trusted Web Activity / Bubblewrap:

1. **MIMI Go**: clientes para viajes y servicios.
2. **MIMI Partners**: choferes y prestadores independientes.

## URLs finales
- https://mimi-transporte.vercel.app/hub-clientes
- https://mimi-transporte.vercel.app/servicios
- https://mimi-transporte.vercel.app/prestador
- https://mimi-transporte.vercel.app/viaje
- https://mimi-transporte.vercel.app/hub-operadores
- https://mimi-transporte.vercel.app/chofer
- https://mimi-transporte.vercel.app/privacidad
- https://mimi-transporte.vercel.app/terminos
- https://mimi-transporte.vercel.app/.well-known/assetlinks.json

## Manifests
### App clientes
- Manifest: https://mimi-transporte.vercel.app/manifest-clientes.json
- Package ID sugerido: `com.mimigo.clientes`
- App name: `MIMI Go`
- Start URL: `/hub-clientes`

### App partners
- Manifest: https://mimi-transporte.vercel.app/manifest-partners.json
- Package ID sugerido: `com.mimigo.partners`
- App name: `MIMI Partners`
- Start URL: `/hub-operadores`

## Prueba local
Si no hay scripts npm definidos, servir como sitio estático:

```bash
npx serve .
```

o:

```bash
python -m http.server 8080
```

## Bubblewrap
Instalar CLI:

```bash
npm install -g @bubblewrap/cli
```

Crear app clientes:

```bash
bubblewrap init --manifest https://mimi-transporte.vercel.app/manifest-clientes.json
bubblewrap build
```

Crear app partners en otra carpeta:

```bash
bubblewrap init --manifest https://mimi-transporte.vercel.app/manifest-partners.json
bubblewrap build
```

## Datos sugeridos Bubblewrap
### MIMI Go
- packageId: `com.mimigo.clientes`
- appName: `MIMI Go`
- launcherName: `MIMI Go`
- host: `mimi-transporte.vercel.app`
- startUrl: `/hub-clientes`

### MIMI Partners
- packageId: `com.mimigo.partners`
- appName: `MIMI Partners`
- launcherName: `MIMI Partners`
- host: `mimi-transporte.vercel.app`
- startUrl: `/hub-operadores`

## Digital Asset Links
Después de generar keystore o configurar Play App Signing, obtener los SHA-256 reales de cada app y reemplazarlos en:

`.well-known/assetlinks.json`

## Checklist Play Console
- Crear app MIMI Go.
- Crear app MIMI Partners.
- Cargar App Bundle `.aab` de cada una.
- Cargar política de privacidad.
- Completar ficha de Play Store.
- Subir capturas.
- Subir ícono 512.
- Completar clasificación de contenido.
- Completar seguridad de datos.
- Seleccionar países.
- Enviar a revisión.
