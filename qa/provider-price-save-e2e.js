/**
 * QA de guardado: lo que el prestador ve es lo que se guarda.
 *
 * POR QUE EXISTE
 *   Los otros QA revisan que el formulario se vea bien y que los nombres de campo sean
 *   coherentes. Ninguno comprobaba la cadena completa: formulario -> sincronizacion -> colector
 *   -> normalizador -> lo que se manda a la base.
 *
 * COMO FUNCIONA
 *   Renderiza el bloque de precio REAL (extraido de render-provider.js) adentro de un <form>
 *   real, en un navegador, e inyecta las TRES funciones REALES extraidas de main-provider.js:
 *   `fieldValue` (el colector), `syncProviderChargeField` y `normalizeProviderOfferingPayload`.
 *   Nada de esto es una copia: se corta del archivo que se despliega.
 *
 * NECESITA el navegador de Playwright:  npx playwright install chromium
 */
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const root = path.resolve(__dirname, "..");

let chromium;
try {
  ({ chromium } = require("@playwright/test"));
} catch (_) {
  console.log("OMITIDO: falta @playwright/test");
  process.exit(0);
}

const renderProvider = fs.readFileSync(path.join(root, "mimi-servicios/src/ui/render-provider.js"), "utf8");
const mainProvider = fs.readFileSync(path.join(root, "mimi-servicios/src/main-provider.js"), "utf8");
const pricingModels = fs.readFileSync(path.join(root, "mimi-servicios/src/services/pricing-models.js"), "utf8");

let passes = 0;
let failures = 0;
function check(nombre, ok, detalle = "") {
  if (ok) {
    passes += 1;
    console.log(`PASS ${nombre}`);
    return;
  }
  failures += 1;
  console.error(`FAIL ${nombre}${detalle ? ` - ${detalle}` : ""}`);
}

// --------------------------------------------------- extraccion del codigo real
function recortar(desde, hasta, incluir = false) {
  const i = renderProvider.indexOf(desde);
  if (i < 0) throw new Error(`no ubico en render-provider: ${desde}`);
  const j = renderProvider.indexOf(hasta, i);
  if (j < 0) throw new Error(`no cierro: ${desde}`);
  return renderProvider.slice(i, incluir ? j + hasta.length : j);
}

function metodo(nombre) {
  const conSangria = mainProvider.indexOf(`\n  ${nombre}(`);
  const sinSangria = mainProvider.indexOf(`\n${nombre}(`);
  const i = conSangria >= 0 ? conSangria : sinSangria;
  if (i < 0) throw new Error(`no ubico el metodo ${nombre}`);
  const cuerpo = mainProvider.slice(i + 1);
  // Ojo: los parametros pueden traer llaves propias (`offering = {}`). Hay que arrancar a
  // contar desde la llave del CUERPO, la que sigue al parentesis que cierra la firma; si no,
  // el metodo se corta en 46 caracteres y quedan `return` sueltos.
  const cierraFirma = cuerpo.indexOf(") {");
  if (cierraFirma < 0) throw new Error(`no ubico la firma del metodo ${nombre}`);
  let profundidad = 0;
  let fin = -1;
  for (let k = cierraFirma; k < cuerpo.length; k += 1) {
    const c = cuerpo[k];
    if (c === "{") profundidad += 1;
    else if (c === "}") {
      profundidad -= 1;
      if (profundidad === 0) {
        fin = k;
        break;
      }
    }
  }
  if (fin < 0) throw new Error(`no cierro el metodo ${nombre}`);
  // El texto extraido es un metodo de clase (nombre() {}), no una funcion suelta:
  // hay que ponerle `function` para poder evaluarlo aparte.
  return `function ${cuerpo.slice(0, fin + 1).replace(/,\s*$/, "").trimStart()}`;
}

// `fieldValue` es una closure adentro del colector, no un metodo: se corta tal cual.
const iFieldValue = mainProvider.indexOf("const fieldValue = (name, preferredSelector = \"\") => {");
if (iFieldValue < 0) throw new Error("no ubico fieldValue");
const campoValor = mainProvider.slice(iFieldValue, mainProvider.indexOf("};", iFieldValue) + 2);

// `campoDeFormulario` es una funcion suelta de nivel de modulo: traduce la columna de la base
// (`base_visit_fee`) al nombre del campo del formulario (`baseVisitFee`). La usa el sync.
function funcionSuelta(nombre) {
  const i = mainProvider.indexOf(`function ${nombre}(`);
  if (i < 0) throw new Error(`no ubico la funcion ${nombre}`);
  const desde = mainProvider.indexOf(") {", i);
  let profundidad = 0;
  for (let k = desde; k < mainProvider.length; k += 1) {
    if (mainProvider[k] === "{") profundidad += 1;
    else if (mainProvider[k] === "}") {
      profundidad -= 1;
      if (profundidad === 0) return mainProvider.slice(i, k + 1);
    }
  }
  throw new Error(`no cierro la funcion ${nombre}`);
}
const fuenteCampoDeFormulario = funcionSuelta("campoDeFormulario");

const iniBloque = renderProvider.indexOf('<div class="provider-form-subtitle">\n            <strong>Precio y modalidad</strong>');
const finCliente = renderProvider.indexOf('<input name="offering:0:clientInstructions"');
const bloque = renderProvider.slice(
  iniBloque,
  renderProvider.lastIndexOf("</details>", finCliente) + "</details>".length
);

function mapa(nombre) {
  const m = pricingModels.match(new RegExp(`${nombre}\\s*=\\s*({[\\s\\S]*?\\n\\});`));
  if (!m) throw new Error(`sin ${nombre}`);
  return m[1];
}

const SOPORTADOS = ["HOURLY", "BASE_VISIT", "QUOTE", "FIXED", "UNIT", "SQUARE_METER", "LINEAR_METER"];
const POR_RUBRO = { PLOMERIA: "BASE_VISIT", PINTURA: "SQUARE_METER", GASISTA: "QUOTE", PELUQUERIA: "FIXED", PSICOLOGIA: "UNIT", LIMPIEZA: "HOURLY" };
function resolver(offeringModel, categoryCode) {
  const directo = String(offeringModel ?? "").trim().toUpperCase();
  if (directo && SOPORTADOS.includes(directo)) return directo;
  return POR_RUBRO[String(categoryCode ?? "").trim().toUpperCase()] ?? "BASE_VISIT";
}
const CAMPO = new Function(`return (${mapa("PRICE_FIELD_BY_MODEL")});`)();
const NOMBRE = { price_per_hour: "pricePerHour", base_visit_fee: "baseVisitFee", fixed_price: "fixedPrice", unit_price: "unitPrice" };

const inicioCamposTarifa = mainProvider.indexOf("const TARIFA_CAMPOS_DE_PRECIO");
if (inicioCamposTarifa < 0) throw new Error("no ubico TARIFA_CAMPOS_DE_PRECIO");
const lineaCamposTarifa = mainProvider.slice(inicioCamposTarifa, mainProvider.indexOf(";", inicioCamposTarifa) + 1);

// El precio que se muestra en el campo visible NO se recalcula aca: se usa la funcion real de
// render-provider, que es la que decide mirar en las otras columnas cuando la propia esta vacia.
function funcionDeRender(nombre) {
  const i = renderProvider.indexOf(`function ${nombre}(`);
  if (i < 0) throw new Error(`no ubico la funcion ${nombre}`);
  const desde = renderProvider.indexOf(") {", i);
  let profundidad = 0;
  for (let k = desde; k < renderProvider.length; k += 1) {
    if (renderProvider[k] === "{") profundidad += 1;
    else if (renderProvider[k] === "}") {
      profundidad -= 1;
      if (profundidad === 0) return renderProvider.slice(i, k + 1);
    }
  }
  throw new Error(`no cierro la funcion ${nombre}`);
}
// Las dos piezas se resuelven con respaldo para que este QA tambien corra sobre un arbol viejo
// y sirva de control: si solo corriera sobre el codigo nuevo, no probaria que detecta nada.
const coincidenciaColumnas = pricingModels.match(/export const PRICE_FIELD_COLUMNS = (\[[^\]]*\]);/);
const COLUMNAS_PRECIO = coincidenciaColumnas
  ? new Function(`return ${coincidenciaColumnas[1]};`)()
  : ["price_per_hour", "base_visit_fee", "fixed_price", "unit_price"];
const precioGuardado = (() => {
  try {
    return new Function(
      "PRICE_FIELD_COLUMNS",
      `${funcionDeRender("providerStoredPrimaryPrice")}\nreturn providerStoredPrimaryPrice;`
    )(COLUMNAS_PRECIO);
  } catch (_) {
    return (offering, campo) => (campo ? offering[campo] ?? "" : "");
  }
})();

const encabezado = `
  const PRICING_MODEL_LABELS = ${mapa("PRICING_MODEL_LABELS")};
  const pricingModelLabels = PRICING_MODEL_LABELS;
  const PRICE_FIELD_BY_MODEL = ${mapa("PRICE_FIELD_BY_MODEL")};
  const PRICE_FIELD_FORM_NAMES = ${mapa("PRICE_FIELD_FORM_NAMES")};
  // Despues de PRICE_FIELD_FORM_NAMES: TARIFA_CAMPOS_DE_PRECIO sale de ahi, y en un modulo
  // real los imports ya estan inicializados cuando corre una constante de nivel de modulo.
  ${lineaCamposTarifa}
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
  ${recortar("function escapeHtml(value) {", "function providerLegalRequirements")}
  ${recortar("const providerChargeLabels = {", "\n};", true)}
  ${recortar("function renderProviderChargeOptions", "const serviceModeLabels")}
  ${recortar("function renderServiceModeOptionsForCategory", "function renderLocationPolicyOptionsForMode")}
  ${recortar("function renderLocationPolicyOptionsForMode", "function renderLocationPolicyOptions(")}
`;

const fabrica = new Function(
  "pricingModel", "primaryPriceField", "primaryPriceInputField", "primaryPriceValue", "needsUnitName",
  "firstOffering", "defaults", "detail", "hasAdvancedPriceData", "defaultCategory", "serviceMode", "locationPolicy",
  `${encabezado}\nreturn \`${bloque}\`;`
);

function armarBloque(offering, categoria) {
  const modelo = resolver(offering.pricing_model, categoria.code);
  const campo = CAMPO[modelo] ?? null;
  return fabrica(
    modelo, campo, campo ? NOMBRE[campo] : "",
    precioGuardado(offering, campo),
    ["UNIT", "SQUARE_METER", "LINEAR_METER"].includes(modelo),
    offering, { unitName: "" }, { max_hours_per_service: 8 },
    Boolean(offering.duration_minutes || offering.quote_required),
    categoria, offering.service_mode || "IN_PERSON", offering.location_policy || "CLIENT_ADDRESS"
  );
}

function paginaPara(offering, categoria) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"></head><body class="provider-authenticated" data-provider-tab="pricing">
<main id="providerBusinessPanel">
<form id="providerBusinessForm">
<input name="offering:0:id" type="hidden" value="${offering.id ?? ""}">
<input name="offering:0:categoryId" type="hidden" value="${categoria.id}">
<input name="offering:0:title" type="text" value="${offering.title ?? "Servicio"}">
<input name="offering:0:present" type="hidden" value="1">
${armarBloque(offering, categoria)}
</form></main></body></html>`;
}

/**
 * Replica la lista de campos que pide el colector en la linea ~6368 de main-provider.js.
 * La funcion `fieldValue` que usa es la REAL: lo unico transcripto es que campos lee.
 */
const COLECTAR = `(form) => {
  const data = new FormData(form);
  ${campoValor}
  const oferta = {
    id: String(fieldValue("offering:0:id") ?? "").trim() || null,
    categoryId: String(fieldValue("offering:0:categoryId") ?? "").trim(),
    title: String(fieldValue("offering:0:title") ?? "").trim(),
    pricingModel: fieldValue("offering:0:pricingModel") ?? "HOURLY",
    serviceMode: fieldValue("offering:0:serviceMode") ?? "IN_PERSON",
    locationPolicy: fieldValue("offering:0:locationPolicy") ?? "CLIENT_ADDRESS",
    pricePerHour: fieldValue("offering:0:pricePerHour") ?? "",
    baseVisitFee: fieldValue("offering:0:baseVisitFee") ?? "",
    fixedPrice: fieldValue("offering:0:fixedPrice") ?? "",
    unitName: fieldValue("offering:0:unitName") ?? "",
    unitPrice: fieldValue("offering:0:unitPrice") ?? "",
    minimumCharge: fieldValue("offering:0:minimumCharge") ?? 0,
    quoteRequired: data.has("offering:0:quoteRequired")
  };
  return normalizar(oferta);
}`;

(async () => {
  let navegador;
  try {
    navegador = await chromium.launch();
  } catch (error) {
    console.log(`OMITIDO: no hay navegador de Playwright (${String(error).split("\n")[0]})`);
    process.exit(0);
  }

  const pagina = await navegador.newPage();
  await pagina.exposeFunction("sinUso", () => {});

  const inyectar = async (html, conNormalizador = true) => {
    const archivo = path.join(os.tmpdir(), `mimi-save-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
    fs.writeFileSync(archivo, html, "utf8");
    await pagina.goto(`file://${archivo}`);
    fs.unlinkSync(archivo);
    await pagina.evaluate(
      ({ enc, sync, normalizar, colectar, campoDeFormulario }) => {
        window.__normalizar = new Function(`${enc}\n${normalizar}\nreturn normalizeProviderOfferingPayload;`).call(null);
        // Las constantes viven en el mismo encabezado que usa el normalizador.
        window.__const = new Function(`${enc}\nreturn {
          PRICE_FIELD_BY_MODEL, PRICE_FIELD_FORM_NAMES, PRICING_MODEL_LABELS,
          PROVIDER_CHARGE_HELP, PRICE_FIELD_LABELS, TARIFA_CAMPOS_DE_PRECIO,
          PROVIDER_PRICE_HELP, PROVIDER_PRICE_PLACEHOLDERS
        };`)();
        // new Function(...) devuelve una FABRICA: hay que llamarla con las constantes para
        // obtener la funcion. Si no se la llama, el "sincronizar" no hace nada y el test
        // aprueba cosas que nunca corrieron.
        window.__sync = new Function(
          "PRICE_FIELD_BY_MODEL", "PRICE_FIELD_FORM_NAMES", "PRICING_MODEL_LABELS",
          "PROVIDER_CHARGE_HELP", "PRICE_FIELD_LABELS", "TARIFA_CAMPOS_DE_PRECIO",
          "PROVIDER_PRICE_HELP", "PROVIDER_PRICE_PLACEHOLDERS",
          `${campoDeFormulario}\n${sync}\nreturn syncProviderChargeField;`
        )(
          window.__const.PRICE_FIELD_BY_MODEL, window.__const.PRICE_FIELD_FORM_NAMES,
          window.__const.PRICING_MODEL_LABELS, window.__const.PROVIDER_CHARGE_HELP,
          window.__const.PRICE_FIELD_LABELS, window.__const.TARIFA_CAMPOS_DE_PRECIO,
          window.__const.PROVIDER_PRICE_HELP, window.__const.PROVIDER_PRICE_PLACEHOLDERS
        );
        if (typeof window.__sync !== "function") throw new Error("la sincronizacion no quedo disponible");
        window.__colectar = new Function("normalizar", `return ${colectar};`)(window.__normalizar);
      },
      {
        enc: encabezado,
        campoDeFormulario: fuenteCampoDeFormulario,
        sync: metodo("syncProviderChargeField"),
        normalizar: metodo("normalizeProviderOfferingPayload"),
        colectar: COLECTAR
      }
    );
    return {
      sincronizar: (modelo) =>
        pagina.evaluate(
          ({ modelo }) => {
            const form = document.getElementById("providerBusinessForm");
            window.__sync.call(
              {},
              form,
              modelo,
            );
          },
          { modelo }
        ),
      colectar: () => pagina.evaluate(() => window.__colectar(document.getElementById("providerBusinessForm"))),
      cambiarModelo: (valor) =>
        pagina.evaluate(({ valor }) => {
          const sel = document.querySelector("[name='offering:0:pricingModel']");
          sel.value = valor;
          sel.dispatchEvent(new Event("change", { bubbles: true }));
        }, { valor }),
      escribirPrecio: (valor) =>
        pagina.evaluate(({ valor }) => {
          const input = document.querySelector("[data-provider-price-input]");
          input.value = valor;
          input.dispatchEvent(new Event("input", { bubbles: true }));
        }, { valor }),
      leerPrecioVisible: () =>
        pagina.evaluate(() => {
          const input = document.querySelector("[data-provider-price-input]");
          return { nombre: input.getAttribute("name"), valor: input.value };
        }),
      borrarPrecio: () =>
        pagina.evaluate(() => {
          const input = document.querySelector("[data-provider-price-input]");
          input.value = "";
        })
    };
  };

  const PLOMERIA = { id: "cat-plomeria", code: "PLOMERIA" };
  const PINTURA = { id: "cat-pintura", code: "PINTURA" };
  const GASISTA = { id: "cat-gasista", code: "GASISTA" };
  const HOURLY_CAT = { id: "cat-limpieza", code: "LIMPIEZA" };

  // ---- 1. Plomeria: se cobra la visita. El precio tiene que quedar en base_visit_fee.
  {
    const h = await inyectar(paginaPara({ pricing_model: "BASE_VISIT", base_visit_fee: 12000, title: "Destapacion" }, PLOMERIA));
    await h.sincronizar("BASE_VISIT");
    const oferta = await h.colectar();
    check("plomeria guarda la visita en baseVisitFee", oferta.baseVisitFee === "12000", JSON.stringify(oferta.baseVisitFee));
    check("plomeria no inventa precio por hora", oferta.pricePerHour === "", JSON.stringify(oferta.pricePerHour));
    check("plomeria no inventa precio cerrado", oferta.fixedPrice === "", JSON.stringify(oferta.fixedPrice));
    check("plomeria mantiene su forma de cobro", oferta.pricingModel === "BASE_VISIT", oferta.pricingModel);
  }

  // ---- 2. Pintura: se cobra por m2. El precio tiene que quedar en unit_price.
  {
    const h = await inyectar(paginaPara({ pricing_model: "SQUARE_METER", unit_price: 9000, unit_name: "m2", title: "Pintura" }, PINTURA));
    await h.sincronizar("SQUARE_METER");
    const oferta = await h.colectar();
    check("pintura guarda el m2 en unitPrice", oferta.unitPrice === "9000", JSON.stringify(oferta.unitPrice));
    check("pintura guarda la unidad", oferta.unitName === "m2", oferta.unitName);
    check("pintura no inventa precio por hora", oferta.pricePerHour === "", JSON.stringify(oferta.pricePerHour));
  }

  // ---- 3. Gasista: cotiza. No hay precio y tiene que quedar marcado para cotizar.
  {
    const h = await inyectar(paginaPara({ pricing_model: "QUOTE", title: "Instalacion de gas" }, GASISTA));
    await h.sincronizar("QUOTE");
    const oferta = await h.colectar();
    check("gasista queda marcado para cotizar", oferta.quoteRequired === true, String(oferta.quoteRequired));
    check(
      "gasista no guarda ningun precio inventado",
      [oferta.pricePerHour, oferta.baseVisitFee, oferta.fixedPrice, oferta.unitPrice].every((v) => v === ""),
      JSON.stringify([oferta.pricePerHour, oferta.baseVisitFee, oferta.fixedPrice, oferta.unitPrice])
    );
  }

  // ---- 4. Cambio de forma de cobro: el monto se muda y no queda nada viejo atras.
  {
    const h = await inyectar(
      paginaPara({ pricing_model: "BASE_VISIT", base_visit_fee: 12000, price_per_hour: 8000, title: "Servicio" }, PLOMERIA)
    );
    await h.sincronizar("BASE_VISIT");
    await h.cambiarModelo("HOURLY");
    await h.sincronizar("HOURLY");
    const oferta = await h.colectar();
    check("al cambiar a por hora se guarda el valor por hora", oferta.pricePerHour === "8000", JSON.stringify(oferta.pricePerHour));
    check("al cambiar a por hora no queda la visita vieja", oferta.baseVisitFee === "", JSON.stringify(oferta.baseVisitFee));
    check("al cambiar a por hora la forma de cobro es la nueva", oferta.pricingModel === "HOURLY", oferta.pricingModel);
  }

  // ---- 5. El prestador borra el precio: no puede reaparecer un monto viejo de otra forma de cobro.
  {
    const h = await inyectar(
      paginaPara({ pricing_model: "HOURLY", price_per_hour: "", base_visit_fee: 12000, title: "Servicio" }, HOURLY_CAT)
    );
    await h.sincronizar("HOURLY");
    await h.borrarPrecio();
    const oferta = await h.colectar();
    check(
      "si borra el precio por hora, no se rellena con un monto viejo de otra forma de cobro",
      oferta.pricePerHour === "",
      `pricePerHour=${JSON.stringify(oferta.pricePerHour)} (quedo con el valor viejo)`
    );
  }

  // ---- 5b. Lo que el prestador escribe no se puede borrar solo.
  //          Tocar "Modalidad" o "Atencion" vuelve a pasar por la sincronizacion: si esa vuelta
  //          recarga el valor desde el respaldo, se le borra el precio que acaba de escribir.
  {
    const h = await inyectar(paginaPara({ pricing_model: "BASE_VISIT", base_visit_fee: "", title: "Servicio" }, PLOMERIA));
    await h.escribirPrecio("25000");
    await h.sincronizar("BASE_VISIT");
    await h.sincronizar("BASE_VISIT");
    const visible = await h.leerPrecioVisible();
    check("el precio que el prestador escribio sigue en pantalla", visible.valor === "25000", JSON.stringify(visible));
    const oferta = await h.colectar();
    check("y es el que se guarda", oferta.baseVisitFee === "25000", JSON.stringify(oferta.baseVisitFee));
  }

  // ---- 6. Prestacion vieja con el precio guardado en la columna equivocada.
  //         Tiene que verse en el campo de su forma de cobro y guardarse ahi.
  {
    const h = await inyectar(
      paginaPara({ pricing_model: "HOURLY", price_per_hour: "", unit_price: 15000, title: "Servicio viejo" }, HOURLY_CAT)
    );
    const visible = await h.leerPrecioVisible();
    check(
      "el precio guardado en otra columna se muestra en el campo de la forma de cobro",
      visible.valor === "15000",
      JSON.stringify(visible)
    );
    await h.sincronizar("HOURLY");
    const oferta = await h.colectar();
    check("ese precio se guarda en la columna que le corresponde", oferta.pricePerHour === "15000", JSON.stringify(oferta.pricePerHour));
  }

  await navegador.close();
  console.log("");
  console.log(`Resultado: ${passes} OK, ${failures} fallos`);
  process.exit(failures ? 1 : 0);
})().catch((error) => {
  console.error("FAIL el QA de guardado no pudo ejecutarse:", error.message);
  process.exit(1);
});
