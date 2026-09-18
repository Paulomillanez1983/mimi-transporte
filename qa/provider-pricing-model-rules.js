/**
 * QA de la regla que decide COMO SE COBRA un servicio.
 *
 * POR QUE EXISTE
 *   Reportado: "sale el precio por hora predeterminado, y no debería salir precio por hora porque
 *   no se cobra por hora a gasista plomero".
 *
 *   La causa estaba en la base: svc_categories tiene default_pricing_model = 'HOURLY' para
 *   PLOMERIA y para GASISTA (y para otros 17 rubros). Es un resto del clasificador viejo. La
 *   regla le daba prioridad a ese valor guardado por sobre el mapa de rubro -> modelo, que sale
 *   de las plantillas reales de servicio, y el panel terminaba pidiendo un precio por hora a un
 *   plomero que cobra la visita.
 *
 *   Este QA corre la funcion REAL (pricing-models.js) y fija el orden de prioridad.
 */
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const fuente = fs.readFileSync(path.join(root, "mimi-servicios/src/services/pricing-models.js"), "utf8");

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

// El modulo es ESM y este QA es CommonJS: se sacan los export para poder requerirlo.
// Los nombres exportados se leen del propio archivo: asi el QA tambien corre sobre un arbol
// viejo (para el control negativo) sin explotar por un export que todavia no existia.
const exportados = [...fuente.matchAll(/^export\s+(?:function|const)\s+([A-Za-z0-9_]+)/gm)].map((m) => m[1]);
const comoCjs = fuente
  .replace(/^export\s+/gm, "")
  .concat(`\nmodule.exports = { ${exportados.join(", ")} };\n`);
const archivo = path.join(require("node:os").tmpdir(), `mimi-pricing-models-${Date.now()}.cjs`);
fs.writeFileSync(archivo, comoCjs, "utf8");
const M = require(archivo);
fs.unlinkSync(archivo);

const { categoryPricingModel, resolvePricingModel, CATEGORY_PRICING_MODELS } = M;
// Respaldo para poder correr este QA tambien sobre un arbol viejo y que sirva de control: ahi el
// modelo guardado mandaba siempre, sin mirar si tenia su precio cargado.
const resolveOfferingPricingModel =
  M.resolveOfferingPricingModel ??
  ((offering = {}, ctx = {}) => offering?.pricing_model ?? resolvePricingModel(ctx));

// ---- 1. El caso reportado ----
check(
  "plomeria no se cobra por hora aunque la base diga HOURLY",
  categoryPricingModel("HOURLY", "PLOMERIA") === "BASE_VISIT",
  categoryPricingModel("HOURLY", "PLOMERIA")
);
check(
  "gasista cotiza aunque la base diga HOURLY",
  categoryPricingModel("HOURLY", "GASISTA") === "QUOTE",
  categoryPricingModel("HOURLY", "GASISTA")
);
check(
  "limpieza sigue siendo por hora (no se rompio lo que estaba bien)",
  categoryPricingModel("HOURLY", "LIMPIEZA") === "HOURLY",
  categoryPricingModel("HOURLY", "LIMPIEZA")
);
check(
  "pintura sigue siendo por m2",
  categoryPricingModel("HOURLY", "PINTURA") === "SQUARE_METER",
  categoryPricingModel("HOURLY", "PINTURA")
);

// ---- 2. Invariante: para todo rubro del mapa, el mapa gana sobre el valor guardado ----
const desobedecen = Object.entries(CATEGORY_PRICING_MODELS).filter(
  ([codigo, esperado]) => categoryPricingModel("HOURLY", codigo) !== esperado
);
check(
  `los ${Object.keys(CATEGORY_PRICING_MODELS).length} rubros del mapa mandan sobre el valor guardado`,
  desobedecen.length === 0,
  JSON.stringify(desobedecen)
);

// ---- 3. Prioridad al armar una prestacion nueva ----
check("prestacion nueva de plomeria es visita base", resolvePricingModel({ categoryCode: "PLOMERIA" }) === "BASE_VISIT");
check(
  "la plantilla del servicio manda sobre el rubro",
  resolvePricingModel({ templateModel: "FIXED", categoryCode: "PLOMERIA" }) === "FIXED"
);
check(
  "un rubro que no esta en el mapa usa el valor guardado",
  resolvePricingModel({ categoryCode: "RUBRO_INVENTADO", categoryModel: "FIXED" }) === "FIXED"
);

// ---- 4. Una prestacion YA guardada ----
check(
  "plomeria guardada como por hora y sin precio se muestra como visita",
  resolveOfferingPricingModel({ pricing_model: "HOURLY" }, { categoryCode: "PLOMERIA" }) === "BASE_VISIT"
);
check(
  "pero si el prestador cobra por hora de verdad, con su precio, se respeta",
  resolveOfferingPricingModel({ pricing_model: "HOURLY", price_per_hour: 8000 }, { categoryCode: "PLOMERIA" }) === "HOURLY"
);
check(
  "cotizar siempre se respeta",
  resolveOfferingPricingModel({ pricing_model: "QUOTE" }, { categoryCode: "PLOMERIA" }) === "QUOTE"
);

// ---- 5. Los nombres de campo y las etiquetas siguen coherentes ----
check(
  "cada modelo con precio tiene su columna y su nombre de formulario",
  ["HOURLY", "BASE_VISIT", "FIXED", "UNIT", "SQUARE_METER", "LINEAR_METER"].every((modelo) => {
    const columna = M.PRICE_FIELD_BY_MODEL[modelo];
    return M.PRICE_FIELD_COLUMNS.includes(columna) && typeof M.PRICE_FIELD_FORM_NAMES[columna] === "string";
  })
);
check("cotizar no tiene campo de precio", M.PRICE_FIELD_BY_MODEL.QUOTE === null);
check(
  "cada modelo de precio tiene etiqueta o es cotizar",
  ["HOURLY", "BASE_VISIT", "FIXED", "UNIT", "SQUARE_METER", "LINEAR_METER", "QUOTE"].every(
    (modelo) => modelo === "QUOTE" || typeof M.PRICE_FIELD_LABELS[modelo] === "string"
  )
);

console.log("");
console.log(`Resultado: ${passes} OK, ${failures} fallos`);
process.exit(failures ? 1 : 0);
