/**
 * QA estatico: la forma de cobro del prestador sale del servicio, no de una lista.
 *
 * Que protege:
 *  1. Que no vuelva la pregunta "Como cobras" con la taxonomia de 7 modelos como primer paso.
 *  2. Que exista UN solo campo de precio visible en el formulario de alta.
 *  3. Que los otros tres precios viajen como respaldo oculto (cambiar de forma de cobro no borra).
 *  4. Que el modelo de precio tenga una sola fuente (pricing-models.js) y no tres copias.
 *  5. Que el respaldo del rubro no invente HOURLY (Plomeria es visita base).
 *  6. Que las tres versiones del panel suban juntas.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const renderProvider = read("mimi-servicios/src/ui/render-provider.js");
const mainProvider = read("mimi-servicios/src/main-provider.js");
const pricingModels = read("mimi-servicios/src/services/pricing-models.js");
const priceBook = read("mimi-servicios/src/services/price-book.js");
const providerCss = read("mimi-servicios/styles/provider.css");
const providerHtml = read("mimi-servicios/prestador.html");
const swPartner = read("sw-partner.js");
const appVersion = JSON.parse(read("app-version.json"));

let failures = 0;
let passes = 0;

function check(name, condition, detail = "") {
  if (condition) {
    passes += 1;
    console.log(`PASS ${name}`);
    return;
  }
  failures += 1;
  console.error(`FAIL ${name}${detail ? ` - ${detail}` : ""}`);
}

function count(source, needle) {
  return source.split(needle).length - 1;
}

// ---------------------------------------------------------------- 1. una sola fuente
check(
  "el modelo de precio tiene una sola fuente de etiquetas",
  count(renderProvider, "const pricingModelLabels = {") === 0 &&
    renderProvider.includes("const pricingModelLabels = PRICING_MODEL_LABELS;")
);
check(
  "render-provider importa el modelo de precio del modulo compartido",
  /PRICE_FIELD_BY_MODEL[\s\S]{0,400}from "\.\.\/services\/pricing-models\.js\?v=[0-9.]+"/.test(
    renderProvider
  )
);
check(
  "main-provider importa el modelo de precio del modulo compartido",
  /PROVIDER_PRICE_PLACEHOLDERS[\s\S]{0,200}from "\.\/services\/pricing-models\.js\?v=[0-9.]+"/.test(
    mainProvider
  )
);
check(
  "los dos modulos piden el mismo especificador de modulo",
  // El especificador se lee del archivo, no se fija aca: lo que importa es que los dos pidan el
  // mismo modulo (si no, se instancia dos veces y las tablas dejan de ser una sola fuente).
  /pricing-models\.js\?v=[0-9.]+"/.test(renderProvider) &&
    /pricing-models\.js\?v=[0-9.]+"/.test(mainProvider)
);
check(
  "no quedo una tercera copia de las etiquetas de modelo en main-provider",
  count(mainProvider, "QUOTE: \"Cotizar antes de confirmar\"") === 0
);

// ------------------------------------------------- 2. un solo campo de precio visible
const gridPrecio = renderProvider.slice(
  renderProvider.indexOf("provider-primary-price-grid"),
  renderProvider.indexOf("Tramos, recargos y")
);
check("existe el bloque de forma de cobro resuelta", renderProvider.includes("data-provider-charge-label"));
check("existe el bloque de un solo campo de precio", renderProvider.includes("data-provider-price-field"));
check(
  "el campo de precio visible toma su nombre del modelo resuelto",
  renderProvider.includes('name="offering:0:${primaryPriceInputField || "unitPrice"}"') &&
    renderProvider.includes("const primaryPriceField = PRICE_FIELD_BY_MODEL[pricingModel] ?? null;")
);
check(
  "la etiqueta del campo sale del modelo, no de un texto fijo",
  renderProvider.includes('data-provider-price-label>${escapeHtml(PRICE_FIELD_LABELS[pricingModel] ?? "Precio")}')
);

// ------------------------------- 3. los otros tres precios viajan como respaldo oculto
["pricePerHour", "baseVisitFee", "fixedPrice", "unitPrice"].forEach((campo) => {
  check(
    `el precio ${campo} viaja como respaldo oculto`,
    renderProvider.includes(`<input name="offering:0:${campo}" type="hidden"`)
  );
});
check(
  "los cuatro precios estan en el formulario y solo uno es visible",
  ["pricePerHour", "baseVisitFee", "fixedPrice", "unitPrice"].every(
    (campo) => count(renderProvider, `<input name="offering:0:${campo}" type="hidden"`) === 1
  ) && count(renderProvider, "data-provider-price-input") === 1
);
check(
  "el almacen se activa al cambiar de forma de cobro",
  /syncProviderChargeField\(form, model\) \{[\s\S]{0,2400}providerPriceFieldName = campo;/.test(mainProvider)
);
check(
  "applyProviderCategoryUiRules sincroniza el campo de precio",
  /applyProviderCategoryUiRules\(form[\s\S]{0,6000}this\.syncProviderChargeField\(form, chargeModel\);/.test(
    mainProvider
  )
);
check(
  "el resumen de la prestacion lee el campo del modelo y no los cuatro",
  mainProvider.includes("const campo = PRICE_FIELD_BY_MODEL[pricingModel] ?? null;") &&
    count(mainProvider, 'offering:0:pricePerHour") || 0') === 0
);
check(
  "la vista previa de la prestacion lee el nombre del campo del formulario",
  mainProvider.includes("this.providerGuidedDraftField(form, `offering:0:${campoDeFormulario(campo)}`)")
);
check(
  "el lector de campos prefiere el visible sobre el respaldo oculto",
  /providerGuidedDraftField\(form, name\) \{[\s\S]{0,400}item\.type !== "hidden"/.test(mainProvider)
);

check(
  "la columna de la base y el nombre del campo del formulario no se confunden",
  pricingModels.includes("export const PRICE_FIELD_FORM_NAMES = {") &&
    /base_visit_fee: "baseVisitFee"/.test(pricingModels) &&
    renderProvider.includes("const primaryPriceInputField = primaryPriceField ? PRICE_FIELD_FORM_NAMES[primaryPriceField]") &&
    renderProvider.includes('name="offering:0:${primaryPriceInputField || "unitPrice"}"')
);
check(
  "el panel traduce la columna al nombre del campo antes de escribir el atributo",
  mainProvider.includes("function campoDeFormulario(campo) {") &&
    mainProvider.includes("input.setAttribute(\"name\", `offering:0:${campoDeFormulario(campo)}`)") &&
    mainProvider.includes("const TARIFA_CAMPOS_DE_PRECIO = Object.values(PRICE_FIELD_FORM_NAMES);")
);
check(
  "los nombres del formulario son los que lee el colector",
  ["pricePerHour", "baseVisitFee", "fixedPrice", "unitPrice"].every(
    (campo) => mainProvider.includes(`fieldValue(\`offering:\${index}:${campo}\`)`) ||
      mainProvider.includes(`offering:\${index}:${campo}`)
  )
);

// ------------------------------------------------------- 4. la lista ya no es el primer paso
check(
  "la taxonomia de modelos dejo de estar en la grilla principal",
  !gridPrecio.includes('name="offering:0:pricingModel"')
);
check(
  "sigue existiendo como atajo explicito para el caso raro",
  renderProvider.includes("Cambiar forma de cobro") &&
    renderProvider.includes('renderProviderChargeOptions(pricingModel)')
);
check(
  "el atajo esta en un desplegable, no a la vista",
  /<details class="provider-advanced-price-details">[\s\S]{0,400}Cambiar forma de cobro/.test(renderProvider)
);
check(
  "ya no se pide el mismo precio dos veces",
  count(renderProvider, "Precio aproximado") === 0 && count(renderProvider, "$/hora si aplica") === 0
);
check(
  "la unidad de referencia vive una sola vez, al lado del precio",
  count(renderProvider, 'name="offering:0:unitName"') === 1
);
check(
  "el bloque inalcanzable que duplicaba el formulario se elimino",
  count(renderProvider, "provider-wizard-nav") === 0 &&
    count(renderProvider, 'id="providerBusinessForm"') === 1
);

// ------------------------------------------------------------ 5. reglas del modulo de precio
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mimi-pricing-"));
const tempModule = path.join(tempDir, "pricing-models.mjs");
fs.copyFileSync(path.join(root, "mimi-servicios/src/services/pricing-models.js"), tempModule);

const sonda = `
import {
  PRICE_FIELD_BY_MODEL, PRICE_FIELD_LABELS, PRICING_MODEL_LABELS,
  PROVIDER_CHARGE_HELP, PROVIDER_DEFAULT_UNIT_NAMES,
  PROVIDER_PRICE_HELP, PROVIDER_PRICE_PLACEHOLDERS,
  SUPPORTED_PRICING_MODELS, categoryPricingModel, priceFieldForModel, resolvePricingModel
} from ${JSON.stringify(tempModule)};

const items = [
  ["plomeria es visita base y no por hora", categoryPricingModel(null, "PLOMERIA") === "BASE_VISIT"],
  ["plomeria ignora un HOURLY vacio de la base", categoryPricingModel("", "PLOMERIA") === "BASE_VISIT"],
  ["pintura es por metro cuadrado", categoryPricingModel(null, "PINTURA") === "SQUARE_METER"],
  ["un rubro desconocido no cae en por hora", categoryPricingModel(null, "RUBRO_INEXISTENTE") === "BASE_VISIT"],
  ["la prestacion guardada manda sobre el rubro", resolvePricingModel({ offeringModel: "QUOTE", categoryCode: "PLOMERIA" }) === "QUOTE"],
  ["la plantilla manda si la prestacion no dice nada", resolvePricingModel({ templateModel: "FIXED", categoryCode: "PLOMERIA" }) === "FIXED"],
  ["sin nada, decide el rubro", resolvePricingModel({ categoryCode: "PLOMERIA" }) === "BASE_VISIT"],
  ["cotizar no lleva campo de precio", PRICE_FIELD_BY_MODEL.QUOTE === null && priceFieldForModel("QUOTE") === null],
  ["visita base cobra el campo de la visita", priceFieldForModel("BASE_VISIT") === "base_visit_fee"],
  ["los 7 modelos tienen etiqueta y campo de precio", SUPPORTED_PRICING_MODELS.every((m) =>
    PRICING_MODEL_LABELS[m] && (m === "QUOTE" ? PRICE_FIELD_BY_MODEL[m] === null : PRICE_FIELD_BY_MODEL[m]))],
  ["los modelos con precio tienen ayuda y ejemplo", SUPPORTED_PRICING_MODELS.filter((m) => PRICE_FIELD_BY_MODEL[m]).every((m) =>
    PROVIDER_PRICE_HELP[m] && PROVIDER_PRICE_PLACEHOLDERS[m])],
  ["los 7 modelos tienen unidad por defecto o vacio", SUPPORTED_PRICING_MODELS.every((m) => PROVIDER_DEFAULT_UNIT_NAMES[m] !== undefined)],
  ["los 7 modelos tienen explicacion para el prestador", SUPPORTED_PRICING_MODELS.every((m) => Boolean(PROVIDER_CHARGE_HELP[m]))],
  ["las etiquetas de campo existen para los modelos con precio", SUPPORTED_PRICING_MODELS.filter((m) => PRICE_FIELD_BY_MODEL[m]).every((m) => PRICE_FIELD_LABELS[m])]
];

let fallos = 0;
for (const [nombre, ok] of items) {
  if (!ok) fallos += 1;
  console.log((ok ? "PASS " : "FAIL ") + "(modulo) " + nombre);
}
process.exit(fallos ? 1 : 0);
`;

const probe = path.join(tempDir, "probe.mjs");
fs.writeFileSync(probe, sonda, "utf8");

let moduleExit = 0;
let moduleOut = "";
try {
  moduleOut = execFileSync(process.execPath, [probe], { encoding: "utf8" });
} catch (error) {
  moduleExit = 1;
  moduleOut = `${error.stdout || ""}${error.stderr || ""}`;
}
moduleOut
  .split("\n")
  .filter((line) => line.startsWith("PASS ") || line.startsWith("FAIL "))
  .forEach((line) => {
    if (line.startsWith("PASS ")) {
      passes += 1;
      console.log(line);
    } else {
      failures += 1;
      console.error(line);
    }
  });

// ------------------------------------------------------------ 6. el tarifario es alcanzable
check(
  "el cuadro tarifario no se apaga a los 3 minutos",
  !/setTimeout\(\(\) => \{[\s\S]{0,200}observador\?\.disconnect\(\);[\s\S]{0,80}\}, 180000\)/.test(priceBook) &&
    priceBook.includes('document.addEventListener("visibilitychange"')
);
check(
  "el panel avisa donde se cargan los tramos y recargos",
  renderProvider.includes("cuadro tarifario")
);

// ------------------------------------------------- 6b. el bloque se ve bien en un telefono
const bloqueCobro = renderProvider.slice(
  renderProvider.indexOf('<div class="provider-charge-summary">'),
  renderProvider.indexOf('provider-charge-override-help')
);
check(
  "el bloque de forma de cobro no usa estilos inline",
  !bloqueCobro.includes("style=")
);
check(
  "el bloque de forma de cobro usa las clases del panel",
  renderProvider.includes('<p class="provider-charge-note">') &&
    renderProvider.includes('<small class="provider-charge-override-help">')
);
check(
  "el panel respeta el atributo hidden (no se ven campos que deberian estar ocultos)",
  /#providerBusinessPanel\s*\[hidden\]\s*\{\s*display:\s*none\s*!important;/.test(providerCss)
);
check(
  "las clases nuevas del bloque estan definidas en el css",
  ["provider-charge-summary", "provider-charge-note", "provider-charge-override-help"].every((clase) =>
    providerCss.includes(`.${clase}`)
  )
);
const reglasCobro = providerCss.slice(providerCss.indexOf(".provider-charge-summary"));
check(
  "el texto del bloque usa colores solidos y no opacidad",
  !/opacity:\s*0?\.\d+/.test(reglasCobro) && /color:\s*#475569/.test(reglasCobro)
);
check(
  "el texto del bloque no baja de 12px",
  (reglasCobro.match(/font-size:\s*([\d.]+)px/g) || []).every((f) => parseFloat(f.replace(/[^\d.]/g, "")) >= 11)
);
check(
  "la grilla de precio sigue siendo una columna en el telefono",
  /provider-primary-price-grid\s*\{[\s\S]{0,160}grid-template-columns:\s*1fr/.test(providerCss)
);

// ------------------------------------------------------------------ 7. versiones alineadas
const build = (mainProvider.match(/const MIMI_PROVIDER_BUILD = "([^"]+)"/) || [])[1];
const swVersion = (swPartner.match(/const APP_VERSION = "([^"]+)"/) || [])[1];
const htmlVersion = (providerHtml.match(/main-provider\.js\?v=([^"]+)"/) || [])[1];

check("el panel tiene una version de build declarada", Boolean(build), String(build));
check(
  "app-version.json y el build del panel coinciden",
  build === appVersion.provider.version,
  `build=${build} app-version=${appVersion.provider.version}`
);
check(
  "el service worker del panel sube junto con el build",
  swVersion === `${build}-provider`,
  `sw=${swVersion} build=${build}`
);
check(
  "el html del panel pide el build nuevo y no uno viejo",
  htmlVersion === build,
  `html=${htmlVersion} build=${build}`
);
const cssVersion = (providerHtml.match(/provider\.css\?v=([^"]+)"/) || [])[1];
check(
  "el css del panel sube con el build (si no, el arreglo visual no se ve)",
  cssVersion === build,
  `css=${cssVersion} build=${build}`
);
check(
  "el service worker del panel precachea el modulo de precios",
  swPartner.includes('"/mimi-servicios/src/services/pricing-models.js"')
);

console.log("");
console.log(`Resultado: ${passes} OK, ${failures} fallos${moduleExit ? " (la sonda del modulo fallo)" : ""}`);
process.exit(failures ? 1 : 0);
