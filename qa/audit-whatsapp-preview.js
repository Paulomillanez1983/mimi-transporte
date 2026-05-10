#!/usr/bin/env node

const DEFAULT_URLS = [
  "https://mimi-transporte.vercel.app/servicios",
  "https://mimi-transporte.vercel.app/prestador",
  "https://mimi-transporte.vercel.app/share/servicios",
  "https://mimi-transporte.vercel.app/share/prestador",
  "https://mimi-transporte.vercel.app/share/servicios-v4",
  "https://mimi-transporte.vercel.app/share/prestador-v4",
];

const SOCIAL_USER_AGENTS = [
  {
    name: "whatsapp",
    value:
      "WhatsApp/2.24.11.79 A Mozilla/5.0 AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36",
  },
  {
    name: "facebookexternalhit",
    value: "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  },
];

const args = process.argv.slice(2);
const urls = args.length ? args : DEFAULT_URLS;

function extractMeta(html, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const propertyRegex = new RegExp(
    `<meta\\s+[^>]*(?:property|name)=["']${escaped}["'][^>]*>`,
    "i",
  );
  const tag = html.match(propertyRegex)?.[0] || "";
  return (
    tag.match(/\scontent=["']([^"']+)["']/i)?.[1]?.trim() ||
    tag.match(/\scontent=([^>\s]+)/i)?.[1]?.trim() ||
    null
  );
}

function resolveUrl(value, baseUrl) {
  if (!value) return null;
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return null;
  }
}

function readPngSize(buffer) {
  if (buffer.length < 24) return null;
  const signature = buffer.subarray(0, 8).toString("hex");
  if (signature !== "89504e470d0a1a0a") return null;
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

async function fetchText(url, userAgent) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent": userAgent,
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });
  const text = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    finalUrl: response.url,
    contentType: response.headers.get("content-type") || "",
    cacheControl: response.headers.get("cache-control") || "",
    text,
  };
}

async function auditRobots(origin) {
  const robotsUrl = new URL("/robots.txt", origin).toString();
  const response = await fetch(robotsUrl, {
    redirect: "follow",
    headers: {
      "user-agent": SOCIAL_USER_AGENTS[1].value,
      accept: "text/plain,*/*;q=0.8",
    },
  });
  const text = await response.text();
  const lower = text.toLowerCase();
  const hasFacebookAllow =
    lower.includes("allow: /") &&
    !lower.includes("disallow: /share") &&
    !lower.includes("disallow: /assets") &&
    !lower.includes("disallow: /");
  return {
    url: robotsUrl,
    status: response.status,
    ok: response.ok && hasFacebookAllow,
    hasFacebookAllow,
    cacheControl: response.headers.get("cache-control") || "",
  };
}

async function fetchImage(url, userAgent) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent": userAgent,
      accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    },
  });
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return {
    ok: response.ok,
    status: response.status,
    finalUrl: response.url,
    contentType: response.headers.get("content-type") || "",
    cacheControl: response.headers.get("cache-control") || "",
    bytes: buffer.length,
    dimensions: readPngSize(buffer),
  };
}

function evaluatePage(page, image) {
  const failures = [];
  const warnings = [];

  if (!page.ok) failures.push(`html_http_${page.status}`);
  if (!/text\/html/i.test(page.contentType)) warnings.push(`html_content_type_${page.contentType || "missing"}`);
  if (!page.ogTitle) failures.push("missing_og_title");
  if (!page.ogDescription) failures.push("missing_og_description");
  if (!page.ogImage) failures.push("missing_og_image");
  if (!page.ogImageSecureUrl) warnings.push("missing_og_image_secure_url");
  if (!page.ogImageType) warnings.push("missing_og_image_type");
  if (page.ogImage && !/^https:\/\//i.test(page.ogImage)) failures.push("og_image_not_https_absolute");
  if (page.ogImage && /\?/.test(page.ogImage)) warnings.push("og_image_has_query_string");

  if (!image.ok) failures.push(`image_http_${image.status}`);
  if (!/^image\/(png|jpeg|jpg|webp)/i.test(image.contentType)) failures.push(`image_content_type_${image.contentType || "missing"}`);
  if (!image.bytes || image.bytes < 10000) failures.push("image_too_small_or_empty");
  if (image.bytes > 5 * 1024 * 1024) failures.push("image_too_large_for_social_preview");
  if (!image.dimensions) failures.push("image_dimensions_not_detected_png");
  if (image.dimensions) {
    if (image.dimensions.width < 1200 || image.dimensions.height < 630) {
      failures.push(`image_dimensions_too_small_${image.dimensions.width}x${image.dimensions.height}`);
    }
    const ratio = image.dimensions.width / image.dimensions.height;
    if (ratio < 1.85 || ratio > 1.95) warnings.push(`image_ratio_not_1_91_${ratio.toFixed(2)}`);
  }

  return {
    ok: failures.length === 0,
    failures,
    warnings,
  };
}

async function auditUrl(url, crawler) {
  const pageResponse = await fetchText(url, crawler.value);
  const ogImage =
    extractMeta(pageResponse.text, "og:image") ||
    extractMeta(pageResponse.text, "twitter:image");
  const imageUrl = resolveUrl(ogImage, pageResponse.finalUrl);
  const imageResponse = imageUrl
    ? await fetchImage(imageUrl, crawler.value)
    : {
        ok: false,
        status: 0,
        finalUrl: null,
        contentType: "",
        cacheControl: "",
        bytes: 0,
        dimensions: null,
      };

  const page = {
    requestedUrl: url,
    finalUrl: pageResponse.finalUrl,
    status: pageResponse.status,
    ok: pageResponse.ok,
    contentType: pageResponse.contentType,
    cacheControl: pageResponse.cacheControl,
    ogTitle: extractMeta(pageResponse.text, "og:title"),
    ogDescription: extractMeta(pageResponse.text, "og:description"),
    ogUrl: extractMeta(pageResponse.text, "og:url"),
    ogImage: imageUrl,
    ogImageSecureUrl: resolveUrl(extractMeta(pageResponse.text, "og:image:secure_url"), pageResponse.finalUrl),
    ogImageType: extractMeta(pageResponse.text, "og:image:type"),
    ogImageWidth: extractMeta(pageResponse.text, "og:image:width"),
    ogImageHeight: extractMeta(pageResponse.text, "og:image:height"),
    twitterImage: resolveUrl(extractMeta(pageResponse.text, "twitter:image"), pageResponse.finalUrl),
  };

  const image = {
    status: imageResponse.status,
    ok: imageResponse.ok,
    finalUrl: imageResponse.finalUrl,
    contentType: imageResponse.contentType,
    cacheControl: imageResponse.cacheControl,
    bytes: imageResponse.bytes,
    dimensions: imageResponse.dimensions,
  };

  return {
    crawler: crawler.name,
    page,
    image,
    evaluation: evaluatePage(page, image),
  };
}

async function main() {
  const results = [];
  const origins = [...new Set(urls.map((url) => new URL(url).origin))];
  const robots = [];
  for (const origin of origins) {
    try {
      robots.push(await auditRobots(origin));
    } catch (error) {
      robots.push({
        url: new URL("/robots.txt", origin).toString(),
        status: 0,
        ok: false,
        hasFacebookAllow: false,
        error: error?.message || String(error),
      });
    }
  }

  for (const url of urls) {
    for (const crawler of SOCIAL_USER_AGENTS) {
      try {
        results.push(await auditUrl(url, crawler));
      } catch (error) {
        results.push({
          crawler: crawler.name,
          page: { requestedUrl: url },
          image: null,
          evaluation: {
            ok: false,
            failures: [error?.message || String(error)],
            warnings: [],
          },
        });
      }
    }
  }

  const failed = results.filter((result) => !result.evaluation.ok);
  const failedRobots = robots.filter((item) => !item.ok);
  const output = {
    ok: failed.length === 0 && failedRobots.length === 0,
    checkedAt: new Date().toISOString(),
    note:
      "This validates crawler-readable Open Graph metadata and image assets. It cannot force or clear WhatsApp/Meta client-side cache.",
    robots,
    results,
  };

  console.log(JSON.stringify(output, null, 2));
  process.exitCode = output.ok ? 0 : 1;
}

main();
