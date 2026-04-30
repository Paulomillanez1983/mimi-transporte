# MIMI Social Preview / Open Graph

Base actual configurada en los HTML:

```txt
https://mimi-transporte-81b4.vercel.app
```

Si Vercel genera otro dominio, reemplazá esa URL en los meta `og:*`, `twitter:*` y `canonical`.

## URLs limpias para compartir

| Público | URL | HTML real | Imagen OG |
|---|---|---|---|
| Clientes general | `/cliente` | `hub-clientes.html` | `assets/og/og-general.jpg` |
| Clientes transporte | `/viaje` | `index.html` | `assets/og/og-mimicar-client.jpg` |
| Clientes servicios | `/servicios` | `mimi-servicios/cliente.html` | `assets/og/og-mimigo-services.jpg` |
| Operadores general | `/operadores` | `hub-operadores.html` | `assets/og/og-operadores.jpg` |
| Choferes | `/chofer` | `login-chofer.html` | `assets/og/og-choferes.jpg` |
| Prestadores | `/prestador` | `mimi-servicios/prestador.html` | `assets/og/og-prestadores.jpg` |

## Decisión técnica

Para Open Graph se usan JPG 1200x630 por compatibilidad máxima con WhatsApp, Facebook, Instagram, LinkedIn, Telegram, Discord, Slack y X. WebP queda para UI interna.

## Validación

- Facebook Sharing Debugger.
- LinkedIn Post Inspector.
- WhatsApp: enviarte el link a vos mismo.
- Telegram: mensajes guardados.
- Discord / Slack: pegar el link en un canal privado.

## Test de consola

```js
(async () => {
  const pick = (sel) => document.querySelector(sel)?.content || document.querySelector(sel)?.href || null;
  const data = {
    title: document.title,
    description: pick('meta[name="description"]'),
    canonical: pick('link[rel="canonical"]'),
    ogTitle: pick('meta[property="og:title"]'),
    ogDescription: pick('meta[property="og:description"]'),
    ogUrl: pick('meta[property="og:url"]'),
    ogImage: pick('meta[property="og:image"]'),
    twitterCard: pick('meta[name="twitter:card"]')
  };
  console.table(data);
  if (data.ogImage) {
    const res = await fetch(data.ogImage, { method: 'HEAD' });
    console.log('OG image HTTP status:', res.status);
    const img = new Image();
    img.onload = () => console.log('OG image decoded:', img.naturalWidth + 'x' + img.naturalHeight);
    img.onerror = () => console.error('OG image failed');
    img.src = data.ogImage;
  }
})();
```

## Cache

Si una red sigue mostrando una preview vieja, volvé a scrapear la URL desde el debugger de esa red.

No se tocó Supabase, auth, mapas, cotización, funciones, service worker ni lógica funcional.
