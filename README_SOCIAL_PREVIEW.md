# MIMI Social Preview / Open Graph

Estrategia de Social Preview para MIMI Transporte, MIMICar, MIMIGo, Choferes, Prestadores y Operadores.

## Dominio actual de producción

```txt
https://mimi-transporte.vercel.app[README_SOCIAL_PREVIEW_FINAL.md](https://github.com/user-attachments/files/27250288/README_SOCIAL_PREVIEW_FINAL.md)
# MIMI Social Preview / Open Graph

Estrategia de Social Preview para MIMI Transporte, MIMICar, MIMIGo, Choferes, Prestadores y Operadores.

## Dominio actual de producción

https://mimi-transporte.vercel.app

Si Vercel cambia el dominio o en el futuro se compra un dominio propio, reemplazar esta base en:

- `canonical`
- `og:url`
- `og:image`
- `og:image:secure_url`
- `twitter:image`

## URLs limpias para compartir

| Público | URL final | HTML real | Imagen OG |
|---|---|---|---|
| Clientes general | `https://mimi-transporte.vercel.app/cliente` | `hub-clientes.html` | `assets/og/og-general.jpg` |
| Clientes transporte | `https://mimi-transporte.vercel.app/viaje` | `index.html` | `assets/og/og-mimicar-client.jpg` |
| Clientes servicios | `https://mimi-transporte.vercel.app/servicios` | `mimi-servicios/cliente.html` | `assets/og/og-mimigo-services.jpg` |
| Operadores general | `https://mimi-transporte.vercel.app/operadores` | `hub-operadores.html` | `assets/og/og-operadores.jpg` |
| Choferes | `https://mimi-transporte.vercel.app/chofer` | `login-chofer.html` | `assets/og/og-choferes.jpg` |
| Prestadores | `https://mimi-transporte.vercel.app/prestador` | `mimi-servicios/prestador.html` | `assets/og/og-prestadores.jpg` |

## Imágenes OG requeridas

Las imágenes deben existir en:

`assets/og/`

Archivos requeridos:

- `assets/og/og-general.jpg`
- `assets/og/og-mimicar-client.jpg`
- `assets/og/og-mimigo-services.jpg`
- `assets/og/og-operadores.jpg`
- `assets/og/og-choferes.jpg`
- `assets/og/og-prestadores.jpg`

## Decisión técnica

Para Open Graph se usan imágenes JPG de 1200x630 px por compatibilidad máxima con WhatsApp, Facebook, Instagram, LinkedIn, Telegram, Discord, Slack y X.

WebP queda recomendado solamente para imágenes internas de la UI.

## Validación rápida

Después de cada deploy, probar que las imágenes abran directamente:

- https://mimi-transporte.vercel.app/assets/og/og-general.jpg
- https://mimi-transporte.vercel.app/assets/og/og-operadores.jpg

Si esas URLs dan 404, WhatsApp y las redes no van a mostrar imagen.

## Validación en redes

Probar con:

- Facebook Sharing Debugger
- LinkedIn Post Inspector
- WhatsApp: enviarte el link a vos mismo
- Telegram: mensajes guardados
- Discord / Slack: pegar el link en un canal privado

## Test de consola

Pegar en DevTools dentro de cada página:

~~~js
(async () => {
  const pick = (sel) =>
    document.querySelector(sel)?.content ||
    document.querySelector(sel)?.href ||
    null;

  const data = {
    title: document.title,
    description: pick('meta[name="description"]'),
    canonical: pick('link[rel="canonical"]'),
    ogTitle: pick('meta[property="og:title"]'),
    ogDescription: pick('meta[property="og:description"]'),
    ogUrl: pick('meta[property="og:url"]'),
    ogImage: pick('meta[property="og:image"]'),
    twitterCard: pick('meta[name="twitter:card"]'),
    twitterImage: pick('meta[name="twitter:image"]')
  };

  console.table(data);

  if (data.ogImage) {
    const res = await fetch(data.ogImage, { method: "HEAD" });
    console.log("OG image HTTP status:", res.status);

    const img = new Image();
    img.onload = () =>
      console.log("OG image decoded:", img.naturalWidth + "x" + img.naturalHeight);
    img.onerror = () => console.error("OG image failed");
    img.src = data.ogImage;
  }
})();
~~~

## Cache

Si una red sigue mostrando una preview vieja:

1. Confirmar que la imagen abre directo en navegador.
2. Confirmar que el deploy activo de Vercel tiene el último commit.
3. Volver a scrapear la URL desde el debugger de esa red.
4. Para WhatsApp, probar temporalmente con:

`https://mimi-transporte.vercel.app/cliente?v=2`

Luego compartir el enlace normal:

`https://mimi-transporte.vercel.app/cliente`

## Importante

No se tocó:

- Supabase
- Auth
- Mapas
- Cotización
- Edge Functions
- Service Worker
- Lógica funcional de la app

Este cambio es solamente para Social Preview, Open Graph, rutas limpias y presentación profesional al compartir enlaces.

## Última actualización

Actualización OG assets.
