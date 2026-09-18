/**
 * QA de layout: la seccion de precio del panel en un telefono.
 *
 * POR QUE EXISTE
 *   "Se ve mal en el telefono" es una queja real y hasta ahora no habia forma de comprobarla
 *   sin abrir el panel logueado en un celular. Este script renderiza el markup REAL de la
 *   seccion (extraido de render-provider.js) con el provider.css REAL, en tres anchos de
 *   telefono, y mide lo que hace que una pantalla se vea mal: campos que deberian estar
 *   ocultos y se pintan, texto muy chico o translucido, desborde horizontal y alto total.
 *
 *   No compara imagenes: da numeros. Una captura no se puede revisar en un diff.
 *
 * NECESITA el navegador de Playwright:
 *   npx playwright install chromium
 *   node qa/provider-price-mobile-layout.js
 * Si el navegador no esta, avisa y termina sin fallar.
 */
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

let chromium;
try {
  ({ chromium } = require("@playwright/test"));
} catch (_) {
  console.log("OMITIDO: falta @playwright/test");
  process.exit(0);
}

const renderProvider = fs.readFileSync(path.join(root, "mimi-servicios/src/ui/render-provider.js"), "utf8");
const pricingModels = fs.readFileSync(path.join(root, "mimi-servicios/src/services/pricing-models.js"), "utf8");
const cssApp = path.join(root, "mimi-servicios/styles/app.css");
const cssProvider = path.join(root, "mimi-servicios/styles/provider.css");

let failures = 0;
let passes = 0;
function check(nombre, ok, detalle = "") {
  if (ok) {
    passes += 1;
    console.log(`PASS ${nombre}`);
    return;
  }
  failures += 1;
  console.error(`FAIL ${nombre}${detalle ? ` - ${detalle}` : ""}`);
}

// ------------------------------------------------- piezas reales, extraidas del codigo
const TELEFONOS = [320, 360, 390];

function extraer(nombre, desde, hasta, incluir = false) {
  const i = renderProvider.indexOf(desde);
  if (i < 0) throw new Error(`no ubico ${nombre}`);
  const j = renderProvider.indexOf(hasta, i);
  if (j < 0) throw new Error(`no cierro ${nombre}`);
  return renderProvider.slice(i, incluir ? j + hasta.length : j);
}

const iniBloque = renderProvider.indexOf('<div class="provider-form-subtitle">\n            <strong>Precio y modalidad</strong>');
const finCliente = renderProvider.indexOf('<input name="offering:0:clientInstructions"');
const bloque = renderProvider.slice(
  iniBloque,
  renderProvider.lastIndexOf("</details>", finCliente) + "</details>".length
);

const trozos = {
  escapeHtml: extraer("escapeHtml", "function escapeHtml(value) {", "function providerLegalRequirements"),
  cargos: extraer("cargos", "const providerChargeLabels = {", "\n};", true),
  opciones: extraer("opciones", "function renderProviderChargeOptions", "const serviceModeLabels"),
  modos: extraer("modos", "function renderServiceModeOptionsForCategory", "function renderLocationPolicyOptionsForMode"),
  politicas: extraer("politicas", "function renderLocationPolicyOptionsForMode", "function renderLocationPolicyOptions(")
};

function mapa(nombre) {
  const m = pricingModels.match(new RegExp(`${nombre}\\s*=\\s*({[\\s\\S]*?\\n\\});`));
  if (!m) throw new Error(`sin ${nombre} en pricing-models.js`);
  return m[1];
}

const PRICE_FIELD_BY_MODEL = new Function(`return (${mapa("PRICE_FIELD_BY_MODEL")});`)();
const NOMBRE_DE_CAMPO = {
  price_per_hour: "pricePerHour",
  base_visit_fee: "baseVisitFee",
  fixed_price: "fixedPrice",
  unit_price: "unitPrice"
};

// La resolucion del modelo, igual que en pricing-models.js, para alimentar la vista previa.
const SOPORTADOS = ["HOURLY", "BASE_VISIT", "QUOTE", "FIXED", "UNIT", "SQUARE_METER", "LINEAR_METER"];
const POR_RUBRO = {
  PLOMERIA: "BASE_VISIT",
  PINTURA: "SQUARE_METER",
  GASISTA: "QUOTE",
  PELUQUERIA: "FIXED",
  PSICOLOGIA: "UNIT",
  LIMPIEZA: "HOURLY"
};
function resolver(offeringModel, categoryCode) {
  const directo = String(offeringModel ?? "").trim().toUpperCase();
  if (directo && SOPORTADOS.includes(directo)) return directo;
  return POR_RUBRO[String(categoryCode ?? "").trim().toUpperCase()] ?? "BASE_VISIT";
}

const encabezado = `
  const PRICING_MODEL_LABELS = ${mapa("PRICING_MODEL_LABELS")};
  const pricingModelLabels = PRICING_MODEL_LABELS;
  const PRICE_FIELD_BY_MODEL = ${mapa("PRICE_FIELD_BY_MODEL")};
  const PRICE_FIELD_LABELS = ${mapa("PRICE_FIELD_LABELS")};
  const PROVIDER_CHARGE_HELP = ${mapa("PROVIDER_CHARGE_HELP")};
  const providerChargeHelp = PROVIDER_CHARGE_HELP;
  const PROVIDER_PRICE_HELP = ${mapa("PROVIDER_PRICE_HELP")};
  const providerPriceHelp = PROVIDER_PRICE_HELP;
  const PROVIDER_PRICE_PLACEHOLDERS = ${mapa("PROVIDER_PRICE_PLACEHOLDERS")};
  const providerPricePlaceholders = PROVIDER_PRICE_PLACEHOLDERS;
  const serviceModeLabels = { IN_PERSON: "Presencial", ONLINE: "Online", HYBRID: "Online y presencial" };
  const locationPolicyLabels = {
    CLIENT_ADDRESS: "Domicilio del cliente", PROVIDER_ADDRESS: "Mi base de trabajo",
    ONLINE_ONLY: "Videollamada", FLEXIBLE: "A convenir"
  };
  ${trozos.escapeHtml}
  ${trozos.cargos}
  ${trozos.opciones}
  ${trozos.modos}
  ${trozos.politicas}
`;

const fabrica = new Function(
  "pricingModel", "primaryPriceField", "primaryPriceInputField", "primaryPriceValue", "needsUnitName",
  "firstOffering", "defaults", "detail", "hasAdvancedPriceData", "defaultCategory", "serviceMode", "locationPolicy",
  `${encabezado}\nreturn \`${bloque}\`;`
);

function armar(offering, categoria) {
  const modelo = resolver(offering.pricing_model, categoria.code);
  const campo = PRICE_FIELD_BY_MODEL[modelo] ?? null;
  return fabrica(
    modelo, campo, campo ? NOMBRE_DE_CAMPO[campo] : "",
    campo ? offering[campo] ?? "" : "",
    ["UNIT", "SQUARE_METER", "LINEAR_METER"].includes(modelo),
    offering, { unitName: "" }, { max_hours_per_service: 8 },
    Boolean(offering.duration_minutes || offering.quote_required),
    categoria, offering.service_mode || "IN_PERSON", offering.location_policy || "CLIENT_ADDRESS"
  );
}

/**
 * El presupuesto de alto depende del caso, no es un numero unico: la prestacion que se cobra
 * por unidad lleva un campo mas ("Se cobra por") y por eso su tope es mayor. Los valores son
 * los medidos despues del arreglo, con margen para una linea de texto.
 *
 * Los topes no son adorno: si vuelven a aparecer los campos que deben estar ocultos, el caso
 * que cotiza salta ~90px y no pasa.
 */
const CASOS = [
  { nombre: "plomeria", cat: { id: "cat-plomeria", code: "PLOMERIA", default_pricing_model: null }, off: { pricing_model: "BASE_VISIT", base_visit_fee: 12000, title: "Destapacion de caño" }, espera: ["Precio de la visita"], maxAlto: 950 },
  { nombre: "pintura", cat: { id: "cat-pintura", code: "PINTURA", default_pricing_model: null }, off: { pricing_model: "SQUARE_METER", unit_price: 9000, unit_name: "m2", title: "Pintura interior" }, espera: ["Precio por m²", "Se cobra por"], maxAlto: 1050 },
  { nombre: "gasista", cat: { id: "cat-gasista", code: "GASISTA", default_pricing_model: null }, off: { pricing_model: "QUOTE", title: "Instalacion de gas" }, espera: [], maxAlto: 950 }
];

(async () => {
  let navegador;
  try {
    navegador = await chromium.launch();
  } catch (error) {
    console.log(`OMITIDO: no hay navegador de Playwright (${String(error).split("\n")[0]})`);
    console.log("Correlo con: npx playwright install chromium");
    process.exit(0);
  }

  for (const ancho of TELEFONOS) {
    const pagina = await navegador.newPage({ viewport: { width: ancho, height: 812 } });

    for (const caso of CASOS) {
      const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="file://${cssApp}">
<link rel="stylesheet" href="file://${cssProvider}">
</head>
<body class="provider-authenticated" data-provider-tab="pricing">
<main id="providerBusinessPanel">
  <section class="provider-simple-card provider-service-details" id="providerServiceDetails">
    <div class="provider-simple-card-heading">
      <span>2</span>
      <div><strong>Precio y modalidad</strong><small>Define el precio visible o marca cotizacion si depende del caso.</small></div>
    </div>
    ${armar(caso.off, caso.cat)}
  </section>
</main>
</body></html>`;

      const archivo = path.join(require("node:os").tmpdir(), `mimi-precio-${caso.nombre}-${ancho}.html`);
      fs.writeFileSync(archivo, html, "utf8");
      await pagina.goto(`file://${archivo}`);
      await pagina.waitForTimeout(120);

      const m = await pagina.evaluate(() => {
        const panel = document.getElementById("providerBusinessPanel");
        const seccion = document.getElementById("providerServiceDetails");
        const problemas = { ocultosVisibles: [], textoChico: [], textoDebil: [], desbordes: [] };

        panel.querySelectorAll("[hidden]").forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) {
            problemas.ocultosVisibles.push((el.textContent || "").trim().slice(0, 24));
          }
        });

        panel.querySelectorAll("span, small, p, strong").forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return;
          const cs = getComputedStyle(el);
          const px = parseFloat(cs.fontSize);
          const opacidad = parseFloat(cs.opacity);
          const texto = (el.textContent || "").trim().slice(0, 24);
          if (px < 11) problemas.textoChico.push(`${texto} ${px}px`);
          if (px <= 12 && opacidad < 0.8) problemas.textoDebil.push(`${texto} ${px}px/${opacidad}`);
        });

        panel.querySelectorAll("*").forEach((el) => {
          if (el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1) {
            problemas.desbordes.push(String(el.className).slice(0, 24));
          }
        });

        return {
          altoSeccion: Math.round(seccion.getBoundingClientRect().height),
          desbordePanel: panel.scrollWidth > panel.clientWidth,
          camposVisibles: [...panel.querySelectorAll(".provider-primary-price-grid > label")]
            .filter((l) => l.getBoundingClientRect().height > 0)
            .map((l) => (l.querySelector("span")?.textContent || "").trim()),
          problemas
        };
      });

      const etiqueta = `${caso.nombre} @${ancho}px`;
      check(`${etiqueta}: no hay campos ocultos que se pinten`, m.problemas.ocultosVisibles.length === 0, m.problemas.ocultosVisibles.join(", "));
      check(`${etiqueta}: los campos visibles son los del modelo`, JSON.stringify(m.camposVisibles) === JSON.stringify(["Modalidad", "Atencion", ...caso.espera]), m.camposVisibles.join(" | "));
      check(`${etiqueta}: no hay texto bajo 11px`, m.problemas.textoChico.length === 0, m.problemas.textoChico.join(", "));
      check(`${etiqueta}: no hay texto translucido de 12px o menos`, m.problemas.textoDebil.length === 0, m.problemas.textoDebil.join(", "));
      check(`${etiqueta}: no hay desborde horizontal`, !m.desbordePanel && m.problemas.desbordes.length === 0, m.problemas.desbordes.join(", "));
      check(`${etiqueta}: la seccion no pasa de ${caso.maxAlto}px de alto`, m.altoSeccion <= caso.maxAlto, `${m.altoSeccion}px`);

      fs.unlinkSync(archivo);
    }

    await pagina.close();
  }

  await navegador.close();
  console.log("");
  console.log(`Resultado: ${passes} OK, ${failures} fallos`);
  process.exit(failures ? 1 : 0);
})().catch((error) => {
  console.error("FAIL el QA de layout no pudo ejecutarse:", error.message);
  process.exit(1);
});
