# MIMI Servicios - Dominio principal mimigo.com.ar

Fecha: 2026-05-11

## Objetivo

Preparar MIMI Servicios para operar oficialmente desde:

- Principal: `https://mimigo.com.ar`
- Fallback tecnico: `https://mimi-transporte.vercel.app`
- CMS visual: `https://cms.mimigo.com.ar`

PocketBase sigue siendo solo CMS visual. Supabase sigue siendo auth, DB, realtime y backend principal.

## Cambios aplicados en repo

- Canonical URL y Open Graph de MIMI Servicios apuntan a `https://mimigo.com.ar`.
- Shares publicos de servicios/prestadores apuntan a `https://mimigo.com.ar`.
- `robots.txt` y `sitemap.xml` apuntan al dominio principal.
- Guia Play Store/TWA apunta a `mimigo.com.ar`.
- No se cambio el flujo OAuth de servicios: usa `window.location.origin` y por eso soporta dominio principal, fallback Vercel, previews y localhost.

## Supabase Auth

Configurar manualmente en Supabase Dashboard, Authentication > URL Configuration:

Site URL:

```text
https://mimigo.com.ar
```

Redirect URLs recomendadas:

```text
https://mimigo.com.ar/**
https://mimi-transporte.vercel.app/**
http://localhost:3000/**
http://localhost:5173/**
```

Callbacks usados por MIMI Servicios:

```text
https://mimigo.com.ar/mimi-servicios/auth-callback.html
https://mimi-transporte.vercel.app/mimi-servicios/auth-callback.html
http://localhost:3000/mimi-servicios/auth-callback.html
http://localhost:5173/mimi-servicios/auth-callback.html
```

No guardar secretos en frontend. No cambiar Supabase por PocketBase.

## Google OAuth

En Google Cloud Console, revisar el OAuth Client usado por Supabase/Google:

Authorized redirect URI de Supabase:

```text
https://<project-ref>.supabase.co/auth/v1/callback
```

El redirect final de la app lo controla Supabase con las Redirect URLs anteriores.

## Vercel

En Vercel Project > Settings > Domains:

- Agregar `mimigo.com.ar`.
- Agregar `www.mimigo.com.ar` si se va a usar.
- Mantener `mimi-transporte.vercel.app` como fallback tecnico.
- Verificar SSL emitido y estado Ready.

## Cloudflare DNS

No tocar `cms.mimigo.com.ar` salvo verificacion, porque apunta al VPS/Hetzner con PocketBase + Caddy.

Registros esperados:

```text
mimigo.com.ar      CNAME/A segun indique Vercel
www.mimigo.com.ar  CNAME cname.vercel-dns.com
cms.mimigo.com.ar  A/AAAA o CNAME actual hacia VPS PocketBase
```

Si Cloudflare esta proxied, verificar que Vercel valide el dominio y que SSL sea Full/Strict.

## TWA / Play Store

Manifests principales:

```text
https://mimigo.com.ar/manifest-clientes.json
https://mimigo.com.ar/manifest-partners.json
```

Digital Asset Links:

```text
https://mimigo.com.ar/.well-known/assetlinks.json
```

El JSON no contiene host; se valida por el dominio desde donde se sirve.

## QA pendiente despues de DNS

- Abrir `https://mimigo.com.ar/servicios`.
- Abrir `https://mimigo.com.ar/prestador`.
- Verificar login Google cliente y prestador con OAuth real.
- Verificar `https://mimigo.com.ar/.well-known/assetlinks.json`.
- Verificar Lighthouse PWA/TWA sobre `mimigo.com.ar`.
- Verificar que `https://cms.mimigo.com.ar/api/health` siga OK.

## Rollback

- Mantener el fallback `https://mimi-transporte.vercel.app`.
- Si falla DNS/OAuth, volver temporalmente la comunicacion publica al fallback.
- Revertir cambios SEO/social si fuera necesario, sin tocar Supabase ni datos.
