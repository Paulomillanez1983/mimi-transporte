/**
 * QA funcional: renderiza el bloque REAL de precio del formulario de alta y ejecuta la funcion
 * REAL que lo sincroniza, contra un DOM. No es una copia de la logica: el markup y el metodo se
 * extraen del codigo que se despliega.
 *
 * Requiere jsdom. Si no esta instalado, el script avisa y termina sin fallar:
 *   npm install --prefix /tmp/qa-deps jsdom
 *   NODE_PATH=/tmp/qa-deps/node_modules node qa/provider-pricing-from-service-dom.js
 *
 * Que verifica:
 *  1. Cada rubro muestra SU forma de cobro y UN solo campo de precio, con la etiqueta correcta.
 *  2. Plomeria es visita base (no "por hora"), pintura es por m2 y gasista cotiza.
 *  3. Los cuatro precios viajan en el formulario; solo uno es visible.
 *  4. Al cambiar la forma de cobro, el monto no se pierde ni se inventa: el campo nuevo toma lo
 *     guardado para ese esquema y los demas se limpian.
 *  5. La lectura del precio y el envio del formulario coinciden (gana el campo visible).
 */
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

let jsdom;
try {
  ({ JSDOM } = require("jsdom"));
} catch (_) {
  console.log("OMITIDO: falta jsdom. Instalalo con `npm install --prefix /tmp/qa-deps jsdom`");
  console.log("y correlo con NODE_PATH=/tmp/qa-deps/node_modules node " + path.relative(root, __filename));
  process.exit(0);
}

const renderProvider = read("mimi-servicios/src/ui/render-provider.js");
const mainProvider = read("mimi-servicios/src/main-provider.js");

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

// ---------------------------------------------------- extraer el markup real del formulario
const inicioMarkup = renderProvider.indexOf(
  '<div class="provider-form-subtitle">\n            <strong>Precio y modalidad</strong>'
);
const finMarkup = renderProvider.indexOf('<input name="offering:0:clientInstructions"');
if (inicioMarkup < 0 || finMarkup < 0) {
  console.error("FAIL no se pudo ubicar el bloque de precio en render-provider.js");
  process.exit(1);
}
const finBloque = renderProvider.lastIndexOf("</details>", finMarkup) + "</details>".length;
const bloquePrecio = renderProvider.slice(inicioMarkup, finBloque);

// ---------------------------------------- extraer el metodo real que sincroniza el campo
/** Copia la fuente real de un metodo del panel, como funcion suelta. */
function extraerMetodo(firma) {
  const conSangria = mainProvider.indexOf(`\n  ${firma} {`);
  const sinSangria = mainProvider.indexOf(`\n${firma} {`);
  const inicio = conSangria >= 0 ? conSangria + 1 : sinSangria + 1;
  if (conSangria < 0 && sinSangria < 0) {
    console.error(`FAIL no se encontro ${firma} en main-provider.js`);
    process.exit(1);
  }
  let profundidad = 0;
  for (let i = mainProvider.indexOf("{", inicio); i < mainProvider.length; i += 1) {
    if (mainProvider[i] === "{") profundidad += 1;
    if (mainProvider[i] === "}") {
      profundidad -= 1;
      if (profundidad === 0) {
        return mainProvider.slice(inicio, i + 1).replace(`${firma} {`, `function ${firma} {`);
      }
    }
  }
  console.error(`FAIL no se pudo cerrar ${firma}`);
  process.exit(1);
}

const metodoFuente = extraerMetodo("syncProviderChargeField(form, model)");

// La funcion real que traduce columna -> campo del formulario, leida del propio archivo.
const inicioTraductor = mainProvider.indexOf("function campoDeFormulario(campo) {");
if (inicioTraductor < 0) {
  console.error("FAIL no se encontro campoDeFormulario en main-provider.js");
  process.exit(1);
}
let prof = 0;
let finTraductor = -1;
for (let i = mainProvider.indexOf("{", inicioTraductor); i < mainProvider.length; i += 1) {
  if (mainProvider[i] === "{") prof += 1;
  if (mainProvider[i] === "}") {
    prof -= 1;
    if (prof === 0) {
      finTraductor = i + 1;
      break;
    }
  }
}
const fuenteTraductor = mainProvider.slice(inicioTraductor, finTraductor);
const fuenteLector = extraerMetodo("providerGuidedDraftField(form, name)");
const fuenteUnidad = extraerMetodo("providerGuidedDefaultUnitName(pricingModel = \"\")");
const fuenteEtiqueta = extraerMetodo("providerGuidedDraftPriceLabel(form)");

if (!mainProvider.includes("const MIMI_PROVIDER_BUILD = \"")) {
  console.error("FAIL main-provider.js no declara su build");
  process.exit(1);
}

// ------------------------------------------------------- helpers del render, tal cual
const helpersFuente = `
  const locationPolicyLabels = {
    CLIENT_ADDRESS: "Domicilio del cliente",
    PROVIDER_ADDRESS: "Mi base de trabajo",
    ONLINE_ONLY: "Videollamada",
    FLEXIBLE: "A convenir"
  };
  const serviceModeLabels = { IN_PERSON: "Presencial", ONLINE: "Online", HYBRID: "Online y presencial" };
  ${renderProvider.slice(
    renderProvider.indexOf("function escapeHtml(value) {"),
    renderProvider.indexOf("function providerLegalRequirements")
  )}
  ${renderProvider.slice(
    renderProvider.indexOf("const providerChargeLabels = {"),
    renderProvider.indexOf("};", renderProvider.indexOf("const providerChargeLabels = {")) + 3
  )}
  ${renderProvider.slice(
    renderProvider.indexOf("function renderProviderChargeOptions"),
    renderProvider.indexOf("const serviceModeLabels")
  )}
  ${renderProvider.slice(
    renderProvider.indexOf("function renderServiceModeOptionsForCategory"),
    renderProvider.indexOf("function renderLocationPolicyOptionsForMode")
  )}
  ${renderProvider.slice(
    renderProvider.indexOf("function renderLocationPolicyOptionsForMode"),
    renderProvider.indexOf("function renderLocationPolicyOptions(")
  )}
`;

let armarFormulario;
let sincronizar;
let PRICE_FIELD_BY_MODEL;

async function main() {
  const mod = await import(
    pathToFileURL(path.join(root, "mimi-servicios/src/services/pricing-models.js")).href
  );
  PRICE_FIELD_BY_MODEL = mod.PRICE_FIELD_BY_MODEL;

  const nombres = [
    "escapeHtml",
    "pricingModelLabels",
    "providerChargeHelp",
    "providerPriceHelp",
    "providerPricePlaceholders",
    "PRICE_FIELD_LABELS",
    "renderProviderChargeOptions",
    "renderServiceModeOptionsForCategory",
    "renderLocationPolicyOptionsForMode",
    "pricingModel",
    "primaryPriceField",
    "primaryPriceInputField",
    "primaryPriceValue",
    "needsUnitName",
    "firstOffering",
    "defaults",
    "detail",
    "hasAdvancedPriceData",
    "defaultCategory",
    "serviceMode",
    "locationPolicy"
  ];

  armarFormulario = new Function(
    ...nombres,
    `${helpersFuente}\nreturn \`${bloquePrecio}\`;`
  );

  const crearTraductor = new Function(
    "PRICE_FIELD_FORM_NAMES",
    `${fuenteTraductor}\nreturn campoDeFormulario;`
  );
  const campoDeFormulario = crearTraductor(mod.PRICE_FIELD_FORM_NAMES);
  const TARIFA_CAMPOS_DE_PRECIO = Object.values(mod.PRICE_FIELD_FORM_NAMES);

  const crear = new Function(
    "PRICE_FIELD_BY_MODEL",
    "PRICING_MODEL_LABELS",
    "PROVIDER_CHARGE_HELP",
    "PRICE_FIELD_LABELS",
    "PROVIDER_PRICE_HELP",
    "PROVIDER_PRICE_PLACEHOLDERS",
    "TARIFA_CAMPOS_DE_PRECIO",
    "campoDeFormulario",
    `${metodoFuente}\nreturn syncProviderChargeField;`
  );
  sincronizar = crear.call(
    null,
    mod.PRICE_FIELD_BY_MODEL,
    mod.PRICING_MODEL_LABELS,
    mod.PROVIDER_CHARGE_HELP,
    mod.PRICE_FIELD_LABELS,
    mod.PROVIDER_PRICE_HELP,
    mod.PROVIDER_PRICE_PLACEHOLDERS,
    TARIFA_CAMPOS_DE_PRECIO,
    campoDeFormulario
  );

  // El lector de la vista previa del catalogo guiado, con las tres piezas reales.
  const crearLector = new Function(
    "PRICE_FIELD_BY_MODEL",
    "PROVIDER_DEFAULT_UNIT_NAMES",
    "campoDeFormulario",
    `${fuenteLector}\n${fuenteUnidad}\n${fuenteEtiqueta}
     return { providerGuidedDraftField, providerGuidedDefaultUnitName, providerGuidedDraftPriceLabel };`
  );
  const lector = crearLector(
    mod.PRICE_FIELD_BY_MODEL,
    mod.PROVIDER_DEFAULT_UNIT_NAMES,
    campoDeFormulario
  );
  const panel = {
    ...lector,
    formatMoney: (v) => `$${Number(v).toLocaleString("es-AR", { maximumFractionDigits: 0 })}`
  };

  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  global.document = dom.window.document;

  function montarFormulario(offering, categoria) {
    const modelo = mod.resolvePricingModel({
      offeringModel: offering.pricing_model,
      categoryCode: categoria.code,
      categoryModel: categoria.default_pricing_model
    });
    const campo = mod.PRICE_FIELD_BY_MODEL[modelo] ?? null;
    const html = armarFormulario(
      (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])),
      mod.PRICING_MODEL_LABELS,
      mod.PROVIDER_CHARGE_HELP,
      mod.PROVIDER_PRICE_HELP,
      mod.PROVIDER_PRICE_PLACEHOLDERS,
      mod.PRICE_FIELD_LABELS,
      (sel) =>
        Object.entries({
          BASE_VISIT: "Cobro una visita y despues presupuesto",
          FIXED: "Cobro un precio cerrado por trabajo",
          HOURLY: "Cobro por hora de trabajo",
          UNIT: "Cobro por unidad o sesion",
          SQUARE_METER: "Cobro por metro cuadrado",
          LINEAR_METER: "Cobro por metro lineal",
          QUOTE: "Solo presupuesto: cotizo antes de confirmar"
        })
          .map(([v, l]) => `<option value="${v}" ${sel === v ? "selected" : ""}>${l}</option>`)
          .join(""),
      () => `<option value="IN_PERSON">Presencial</option>`,
      () => `<option value="CLIENT_ADDRESS">Domicilio del cliente</option>`,
      modelo,
      campo,
      campo ? mod.PRICE_FIELD_FORM_NAMES[campo] ?? campo : "",
      campo ? offering[campo] ?? "" : "",
      ["UNIT", "SQUARE_METER", "LINEAR_METER"].includes(modelo),
      offering,
      { unitName: "" },
      { max_hours_per_service: 8 },
      Boolean(offering.duration_minutes || offering.quote_required),
      categoria,
      offering.service_mode || "IN_PERSON",
      offering.location_policy || "CLIENT_ADDRESS"
    );

    const form = dom.window.document.createElement("form");
    form.id = "providerBusinessForm";
    form.innerHTML = html;
    return { form, modelo, campo };
  }

  const rubros = {
    plomeria: { code: "PLOMERIA", id: "cat-plomeria" },
    pintura: { code: "PINTURA", id: "cat-pintura" },
    gasista: { code: "GASISTA", id: "cat-gasista" },
    peluqueria: { code: "PELUQUERIA", id: "cat-peluqueria" }
  };

  const consultar = (form, sel) => form.querySelector(sel);
  const visibles = (form) => form.querySelector("[data-provider-price-input]");

  // 1. Plomeria: visita base
  {
    const offering = { title: "Destapacion de caño", pricing_model: "BASE_VISIT", base_visit_fee: 12000 };
    const { form } = montarFormulario(offering, rubros.plomeria);
    sincronizar(form, "BASE_VISIT");
    const input = visibles(form);
    check("plomeria muestra visita base", consultar(form, "[data-provider-charge-label]").textContent === "Visita base");
    check("plomeria pide el precio de la visita", input.getAttribute("name") === "offering:0:baseVisitFee");
    check("plomeria precarga el precio guardado", input.value === "12000", input.value);
    check("plomeria no muestra el campo de unidad", consultar(form, "[data-provider-unit-field]").hidden === true);
    check(
      "plomeria no pide horas ni precio cerrado",
      !form.textContent.includes("$/hora") && !form.textContent.includes("Precio cerrado")
    );
    check(
      "los cuatro precios viajan en el formulario",
      ["pricePerHour", "baseVisitFee", "fixedPrice", "unitPrice"].every(
        (c) => form.querySelectorAll(`input[type="hidden"][name="offering:0:${c}"]`).length === 1
      )
    );
  }

  // 2. Pintura: por m2
  {
    const offering = { title: "Pintura interior", pricing_model: "SQUARE_METER", unit_price: 9000, unit_name: "m2" };
    const { form } = montarFormulario(offering, rubros.pintura);
    sincronizar(form, "SQUARE_METER");
    const input = visibles(form);
    check("pintura muestra por metro cuadrado", consultar(form, "[data-provider-charge-label]").textContent === "Por m²");
    check("pintura pide el precio por unidad", input.getAttribute("name") === "offering:0:unitPrice");
    check("pintura precarga el precio guardado", input.value === "9000", input.value);
    check("pintura pide la unidad", consultar(form, "[data-provider-unit-field]").hidden === false);
    check(
      "la etiqueta del campo es la del modelo",
      consultar(form, "[data-provider-price-label]").textContent === "Precio por m²"
    );
  }

  // 3. Gasista: cotiza
  {
    const offering = { title: "Instalacion de gas", pricing_model: "QUOTE" };
    const { form } = montarFormulario(offering, rubros.gasista);
    sincronizar(form, "QUOTE");
    const input = visibles(form);
    check("gasista cotiza", consultar(form, "[data-provider-charge-label]").textContent === "Cotizar antes de confirmar");
    check("gasista no pide precio", consultar(form, "[data-provider-price-field]").hidden === true);
    check("el campo de precio queda deshabilitado", input.disabled === true);
  }

  // 4. Cambio de forma de cobro: el monto no se pierde ni se inventa
  {
    const offering = {
      title: "Plomeria",
      pricing_model: "BASE_VISIT",
      base_visit_fee: 12000,
      price_per_hour: 8000
    };
    const { form } = montarFormulario(offering, rubros.plomeria);
    sincronizar(form, "BASE_VISIT");
    sincronizar(form, "HOURLY");
    const input = visibles(form);
    const respaldoVisita = form.querySelector('input[type="hidden"][name="offering:0:baseVisitFee"]');
    check("al pasar a por hora, el campo cambia de nombre", input.getAttribute("name") === "offering:0:pricePerHour");
    check("al pasar a por hora se usa la tarifa guardada para ese esquema", input.value === "8000", input.value);
    check("el precio viejo no queda dando vueltas", respaldoVisita.value === "");
    check(
      "el guardado no puede inventar un precio con el respaldo viejo",
      form.querySelector('input[type="hidden"][name="offering:0:baseVisitFee"]').value === "" &&
        input.value === "8000"
    );

    // y al volver, el monto visible viaja con el prestador
    sincronizar(form, "BASE_VISIT");
    check("al volver a visita base el monto visible viaja", visibles(form).value === "8000", visibles(form).value);
    check(
      "y por hora queda limpio",
      form.querySelector('input[type="hidden"][name="offering:0:pricePerHour"]').value === ""
    );
  }

  // 5. Lo que se envia es lo que se ve
  {
    const offering = { title: "Manicura", pricing_model: "FIXED", fixed_price: 15000 };
    const { form } = montarFormulario(offering, rubros.peluqueria);
    sincronizar(form, "FIXED");
    const input = visibles(form);
    input.value = "22000";
    const datos = new dom.window.FormData(form);
    const campos = (nombre) =>
      [...form.querySelectorAll(`[name="${nombre}"]`)].filter((f) => !f.disabled && "value" in f);
    const visible = campos("offering:0:fixedPrice").reverse().find((f) => f.type !== "hidden");
    check("el valor enviado es el del campo visible", visible.value === "22000");
    check("el respaldo no se confunde con el visible", datos.get("offering:0:fixedPrice") !== "");
  }

  // 6. La vista previa de la prestacion muestra el precio del modelo correcto
  {
    const casos = [
      [{ pricing_model: "BASE_VISIT", base_visit_fee: 12000, price_per_hour: 9000 }, "visita base", "$12.000 visita"],
      [{ pricing_model: "HOURLY", price_per_hour: 9000, base_visit_fee: 12000 }, "por hora", "$9.000 / hora"],
      [{ pricing_model: "FIXED", fixed_price: 45000, price_per_hour: 9000 }, "precio cerrado", "$45.000"],
      [{ pricing_model: "UNIT", unit_price: 15000, unit_name: "sesion" }, "por sesion", "$15.000 / sesion"],
      [{ pricing_model: "SQUARE_METER", unit_price: 9000, unit_name: "m2" }, "por m2", "$9.000 / m2"]
    ];
    casos.forEach(([offering, titulo, esperado]) => {
      const rubrosPorModelo = {
        BASE_VISIT: rubros.plomeria,
        HOURLY: { code: "LIMPIEZA", id: "cat-limpieza" },
        FIXED: rubros.peluqueria,
        UNIT: { code: "PSICOLOGIA", id: "cat-psicologia" },
        SQUARE_METER: rubros.pintura
      };
      const { form } = montarFormulario(offering, rubrosPorModelo[offering.pricing_model]);
      sincronizar(form, offering.pricing_model);
      const etiqueta = panel.providerGuidedDraftPriceLabel.call(panel, form);
      check(`la vista previa muestra el precio ${titulo}`, etiqueta === esperado, `${etiqueta} != ${esperado}`);
    });

    const { form } = montarFormulario({ pricing_model: "QUOTE" }, rubros.gasista);
    sincronizar(form, "QUOTE");
    check(
      "la vista previa de un servicio que cotiza no inventa un precio",
      panel.providerGuidedDraftPriceLabel.call(panel, form) === "Cotizar"
    );
  }

  console.log("");
  console.log(`Resultado: ${passes} OK, ${failures} fallos`);
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error("FAIL la prueba no pudo ejecutarse:", error.message);
  process.exit(1);
});
