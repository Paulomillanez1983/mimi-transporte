/**
 * Modelo de precio de un servicio — fuente única.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * Antes había dos listas duplicadas, una en src/main-client.js (`NON_HOURLY_CATEGORY_MODELS`)
 * y otra en src/ui/render-client.js (`nonHourlyCategoryModels`), y ya se contradecían:
 * Psicología, Kinesiología, Nutrición, Abogacía, Contabilidad y Clases estaban AUSENTES en
 * main-client (caían en HOURLY) y mapeadas a UNIT en render-client. Resultado: el formulario
 * pedía horas y la etiqueta decía "por unidad", para el mismo rubro. Las dos copias ahora
 * importan de acá, así que no pueden volver a divergir.
 *
 * DE DÓNDE SALEN LOS VALORES
 * Del catálogo real de servicios (`svc_service_templates`, 68 plantillas en 24 rubros). Cada
 * plantilla declara su `default_pricing_model`, y ese es el dato que manda cuando el prestador
 * elige un servicio concreto. Este mapa es el RESPALDO por rubro, para el camino viejo (texto
 * libre) donde todavía no hay un servicio elegido.
 *
 * OJO: la app solo sabe mostrar 7 modelos. Las plantillas usan SESSION y DAILY, que acá se
 * traducen a UNIT, cuya etiqueta ya es "Por sesión / unidad". No inventar modelos nuevos sin
 * agregarlos también en `pricingModelLabels`.
 *
 * DECISIÓN DE FONDO: el respaldo por defecto es BASE_VISIT, no HOURLY. Antes, cualquier rubro
 * no listado caía en HOURLY y la app le pedía al cliente que adivinara cuántas horas iba a
 * durar el trabajo. Eso es peor que una visita base: la visita siempre muestra un número sin
 * obligar a nadie a predecir el futuro.
 */

/** Los 7 modelos que la app sabe mostrar. */
export const SUPPORTED_PRICING_MODELS = [
  "HOURLY",
  "BASE_VISIT",
  "QUOTE",
  "FIXED",
  "UNIT",
  "SQUARE_METER",
  "LINEAR_METER"
];

/** Respaldo cuando el rubro no está en el mapa. Nunca HOURLY: no se inventan horas. */
export const DEFAULT_PRICING_MODEL = "BASE_VISIT";

/**
 * Rubro -> modelo de precio. Cubre los 38 rubros que declara la app en config.js, así que
 * ningún rubro cae en el respaldo por accidente.
 */
export const CATEGORY_PRICING_MODELS = {
  // Hogar y oficios
  SERVICIO_DOMESTICO: "HOURLY",
  LIMPIEZA: "HOURLY",
  LIMPIEZA_OFICINAS: "HOURLY",
  PLOMERIA: "BASE_VISIT",          // las 3 plantillas de plomería dicen visita base
  ELECTRICIDAD: "UNIT",            // 2 de 4 plantillas son por unidad
  GASISTA: "QUOTE",                // las 4 plantillas de gasista cotizan
  INSTALACION_AIRE: "FIXED",       // 4 de 5 son precio cerrado
  REFRIGERACION: "BASE_VISIT",
  PINTURA: "SQUARE_METER",
  REPARACIONES_HOGAR: "BASE_VISIT",
  COLOCACION_CERAMICOS: "SQUARE_METER",
  CERRAJERIA: "BASE_VISIT",
  CARPINTERIA: "QUOTE",
  ALBANILERIA: "QUOTE",
  JARDINERIA: "SQUARE_METER",
  MUDANZAS: "QUOTE",
  HERRERIA: "QUOTE",

  // Belleza y bienestar
  PELUQUERIA: "FIXED",
  MANICURIA: "FIXED",
  PESTANAS: "FIXED",
  MAQUILLAJE: "FIXED",
  BELLEZA: "FIXED",
  MASAJISTA: "UNIT",               // las plantillas dicen SESSION: mismo sentido, ya soportado

  // Cuidado y salud
  CUIDADO_ADULTOS: "HOURLY",
  CUIDADO_NINOS: "HOURLY",
  ACOMPANAMIENTO_DOMICILIARIO: "HOURLY",
  ENFERMERIA: "HOURLY",
  PSICOLOGIA: "UNIT",
  NUTRICION: "UNIT",
  KINESIOLOGIA: "UNIT",

  // Profesionales y clases
  ABOGACIA: "QUOTE",
  CONTABILIDAD: "QUOTE",
  CLASES_PARTICULARES: "UNIT",

  // Técnicos y vehículos
  TECNICO_PC: "BASE_VISIT",
  TECNOLOGIA: "BASE_VISIT",
  MASCOTAS: "UNIT",
  GOMERIA_MOVIL: "BASE_VISIT",
  MECANICA_MOVIL: "BASE_VISIT"
};

/** Etiqueta del modelo para el cliente. Espejo de `pricingModelLabels` de render-client. */
export const PRICING_MODEL_LABELS = {
  HOURLY: "Por hora",
  BASE_VISIT: "Visita base",
  QUOTE: "Cotizar antes de confirmar",
  FIXED: "Precio cerrado",
  UNIT: "Por sesión / unidad",
  SQUARE_METER: "Por m²",
  LINEAR_METER: "Por metro lineal"
};

/**
 * El ÚNICO campo de precio que se le pide al prestador según el modelo.
 * Nombres alineados con las columnas de `svc_provider_service_offerings`.
 * `null` = este modelo no lleva precio cargado (cotiza).
 */
export const PRICE_FIELD_BY_MODEL = {
  HOURLY: "price_per_hour",
  BASE_VISIT: "base_visit_fee",
  FIXED: "fixed_price",
  UNIT: "unit_price",
  SQUARE_METER: "unit_price",
  LINEAR_METER: "unit_price",
  QUOTE: null
};

/** Cómo se llama ese campo cuando se lo nombra al prestador. */
/**
 * Nombre del campo de precio TAL COMO VIAJA EN EL FORMULARIO del panel.
 *
 * `PRICE_FIELD_BY_MODEL` devuelve la columna de la base (`base_visit_fee`, snake_case), pero el
 * formulario del prestador y el colector del panel usan camelCase (`offering:0:baseVisitFee`).
 * Sin esta traduccion, el campo visible se llama distinto de lo que el colector lee y el precio
 * se pierde en silencio al guardar.
 */
/**
 * Las cuatro columnas de precio que existen en una prestacion. Sirven para reconocer los
 * servicios viejos, que quedaron con el monto cargado en una columna distinta de la que su
 * forma de cobro usa.
 */
export const PRICE_FIELD_COLUMNS = ["price_per_hour", "base_visit_fee", "fixed_price", "unit_price"];

export const PRICE_FIELD_FORM_NAMES = {
  price_per_hour: "pricePerHour",
  base_visit_fee: "baseVisitFee",
  fixed_price: "fixedPrice",
  unit_price: "unitPrice"
};

/** Los cuatro campos de precio que existen en el formulario de alta. */
export const PRICE_FORM_FIELDS = Object.values(PRICE_FIELD_FORM_NAMES);

export const PRICE_FIELD_LABELS = {
  HOURLY: "Precio por hora",
  BASE_VISIT: "Precio de la visita",
  FIXED: "Precio cerrado del trabajo",
  UNIT: "Precio por unidad o sesión",
  SQUARE_METER: "Precio por m²",
  LINEAR_METER: "Precio por metro lineal",
  QUOTE: null
};

/** Unidades por defecto para los modelos que se cobran por medida o por unidad. */
export const DEFAULT_UNIT_NAMES = {
  UNIT: "unidad",
  SQUARE_METER: "m²",
  LINEAR_METER: "metro lineal"
};

/**
 * Unidad que le proponemos al PRESTADOR cuando su forma de cobro la necesita.
 * No es `DEFAULT_UNIT_NAMES`: esa es la que ve el cliente. Estos son los nombres que el
 * prestador ya venía viendo en el panel, y estaban duplicados en tres lugares
 * (render-provider, main-provider y el respaldo de la categoría) con valores distintos
 * para el mismo modelo. Ahora hay una sola lista.
 */
export const PROVIDER_DEFAULT_UNIT_NAMES = {
  HOURLY: "hora",
  BASE_VISIT: "visita",
  FIXED: "trabajo",
  UNIT: "sesion",
  SQUARE_METER: "m2",
  LINEAR_METER: "metro",
  QUOTE: ""
};

/**
 * Qué significa cada forma de cobro, en una línea, para el prestador. Vive acá y no en la
 * pantalla porque la usa tanto el formulario de alta (render-provider) como el resumen que
 * se actualiza en vivo mientras el prestador cambia de servicio (main-provider).
 */
export const PROVIDER_CHARGE_HELP = {
  BASE_VISIT: "El cliente ve cuanto sale la visita. El trabajo se acuerda despues de ver el problema.",
  FIXED: "El cliente ve el precio final antes de pedirte.",
  HOURLY: "El cliente ve tu valor por hora. La duracion se acuerda al coordinar.",
  UNIT: "El cliente ve el precio por unidad o sesion.",
  SQUARE_METER: "El cliente estima los metros cuadrados y ve el precio.",
  LINEAR_METER: "El cliente estima los metros lineales y ve el precio.",
  QUOTE: "Sin precio de entrada: el cliente te pide presupuesto y vos respondes con un numero."
};

/** Qué significa el único campo de precio que se le pide al prestador para cada modelo. */
export const PROVIDER_PRICE_HELP = {
  HOURLY: "Lo que cobras por hora de trabajo.",
  BASE_VISIT: "Lo que cobras por ir a ver el trabajo. Despues presupuestas.",
  FIXED: "El precio final del trabajo, sin sorpresas para el cliente.",
  UNIT: "Lo que cobras por unidad o sesion.",
  SQUARE_METER: "Lo que cobras por metro cuadrado.",
  LINEAR_METER: "Lo que cobras por metro lineal."
};

/** Ejemplo de monto por modelo, para el placeholder del campo. */
export const PROVIDER_PRICE_PLACEHOLDERS = {
  HOURLY: "Ej: 8000",
  BASE_VISIT: "Ej: 12000",
  FIXED: "Ej: 45000",
  UNIT: "Ej: 15000",
  SQUARE_METER: "Ej: 9000",
  LINEAR_METER: "Ej: 7000"
};

function normalizeCode(value) {
  return String(value ?? "").trim().toUpperCase();
}

/**
 * Modelo de precio de un rubro. Única implementación: la usan main-client.js y render-client.js.
 * `explicit` es lo que pueda venir cargado en la categoría (por ejemplo desde la base).
 */
export function categoryPricingModel(explicit, code) {
  const direct = normalizeCode(explicit);
  if (explicit && SUPPORTED_PRICING_MODELS.includes(direct)) return direct;

  const fallback = CATEGORY_PRICING_MODELS[normalizeCode(code)];
  return fallback ?? DEFAULT_PRICING_MODEL;
}

/**
 * Modelo de precio de una prestación concreta, con la precedencia correcta:
 *   1. lo que el prestador eligió en su prestación
 *   2. lo que declara la plantilla del servicio
 *   3. el respaldo del rubro
 *   4. BASE_VISIT
 */
export function resolvePricingModel({ offeringModel, templateModel, categoryCode, categoryModel } = {}) {
  const candidatos = [offeringModel, templateModel, categoryModel];
  for (const candidato of candidatos) {
    const modelo = normalizeCode(candidato);
    if (modelo && SUPPORTED_PRICING_MODELS.includes(modelo)) return modelo;
  }
  return CATEGORY_PRICING_MODELS[normalizeCode(categoryCode)] ?? DEFAULT_PRICING_MODEL;
}

/** ¿Este modelo obliga a que el prestador cargue un precio? */
export function modelRequiresPrice(model) {
  return Boolean(PRICE_FIELD_BY_MODEL[normalizeCode(model)]);
}

/** El campo de precio de un modelo (o null si cotiza). */
export function priceFieldForModel(model) {
  return PRICE_FIELD_BY_MODEL[normalizeCode(model)] ?? null;
}

/**
 * ¿La prestación está lista para publicarse?
 * La regla que sostiene todo el circuito: una prestación publicada siempre tiene un número,
 * o dice explícitamente que cotiza. No hay un tercer estado.
 *
 * Devuelve { ok, missing: [...] } para que el editor pueda decir QUÉ falta, no un "error".
 */
export function offeringPriceReadiness(offering = {}) {
  const modelo = resolvePricingModel({
    offeringModel: offering.pricing_model ?? offering.pricingModel,
    templateModel: offering.template_pricing_model ?? offering.templatePricingModel,
    categoryCode: offering.category_code ?? offering.categoryCode,
    categoryModel: offering.category_pricing_model
  });

  // Cotiza: no necesita precio, pero sí necesita decir en cuánto responde.
  if (modelo === "QUOTE") {
    const horas = Number(offering.quote_reply_hours ?? offering.quoteReplyHours ?? 0);
    return {
      ok: true,
      model: modelo,
      requiresPrice: false,
      missing: [],
      // Aviso blando: sin plazo, "cotización" es un agujero negro para el cliente.
      warnings: horas > 0 ? [] : ["quote_reply_hours"]
    };
  }

  const campo = priceFieldForModel(modelo);
  const valor = Number(offering[campo] ?? 0);

  if (!(valor > 0)) {
    return { ok: false, model: modelo, requiresPrice: true, missing: [campo], warnings: [] };
  }

  // El modelo por unidad necesita saber la unidad, o "$5.000 por" no dice nada.
  if (["UNIT", "SQUARE_METER", "LINEAR_METER"].includes(modelo)) {
    const unidad = String(offering.unit_name ?? "").trim();
    if (!unidad) return { ok: false, model: modelo, requiresPrice: true, missing: ["unit_name"], warnings: [] };
  }

  return { ok: true, model: modelo, requiresPrice: true, missing: [], warnings: [] };
}

function formatAmount(value, currency = "ARS") {
  const numero = Number(value ?? 0);
  if (!(numero > 0)) return "";
  return `$${numero.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
}

/**
 * Cómo le mostramos el precio al cliente, según el modelo.
 * Es el texto que va en la tarjeta del prestador en los resultados.
 */
export function describeOfferingPrice(offering = {}, { currency = "ARS" } = {}) {
  const modelo = resolvePricingModel({
    offeringModel: offering.pricing_model ?? offering.pricingModel,
    templateModel: offering.template_pricing_model ?? offering.templatePricingModel,
    categoryCode: offering.category_code ?? offering.categoryCode
  });

  const porHora = formatAmount(offering.price_per_hour, currency);
  const visita = formatAmount(offering.base_visit_fee, currency);
  const fijo = formatAmount(offering.fixed_price, currency);
  const unidad = formatAmount(offering.unit_price, currency);
  const unitName = String(offering.unit_name ?? "").trim() || DEFAULT_UNIT_NAMES[modelo] || "unidad";
  const minimo = Number(offering.minimum_charge ?? 0);

  switch (modelo) {
    case "FIXED":
      return fijo ? { text: fijo, detail: PRICING_MODEL_LABELS.FIXED, hasPrice: true }
                  : { text: "A confirmar", detail: PRICING_MODEL_LABELS.FIXED, hasPrice: false };
    case "BASE_VISIT":
      return visita
        ? {
            text: `${visita} de visita`,
            detail: "El trabajo se acuerda después de ver el problema",
            hasPrice: true
          }
        : { text: "Visita a coordinar", detail: PRICING_MODEL_LABELS.BASE_VISIT, hasPrice: false };
    case "HOURLY": {
      if (!porHora) return { text: "A confirmar", detail: PRICING_MODEL_LABELS.HOURLY, hasPrice: false };
      const piso = minimo > 0 ? ` (mínimo ${formatAmount(minimo, currency)})` : "";
      return { text: `Desde ${porHora}/hora${piso}`, detail: PRICING_MODEL_LABELS.HOURLY, hasPrice: true };
    }
    case "UNIT":
    case "SQUARE_METER":
    case "LINEAR_METER":
      return unidad
        ? { text: `${unidad} por ${unitName}`, detail: PRICING_MODEL_LABELS[modelo], hasPrice: true }
        : { text: "A confirmar", detail: PRICING_MODEL_LABELS[modelo], hasPrice: false };
    case "QUOTE":
    default: {
      const horas = Number(offering.quote_reply_hours ?? 0);
      return {
        text: "Cotización sin cargo",
        detail: horas > 0 ? `Te responde en ${horas} h` : "Te envía el presupuesto antes de confirmar",
        hasPrice: false
      };
    }
  }
}
