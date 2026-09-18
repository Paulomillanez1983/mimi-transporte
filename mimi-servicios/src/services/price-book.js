/**
 * Cuadro tarifario del prestador: lo que hace que el precio salga compuesto y no plano.
 *
 * QUÉ RESUELVE
 *   Hasta ahora el prestador solo podía poner un número suelto. Con eso el motor de precios
 *   (compose_offering_price) devuelve un precio con una sola línea, sin desglose. Acá carga
 *   sus parámetros: visita base, qué incluye, tramos por cantidad, recargos y qué NO
 *   incluye. Después el cliente ve un presupuesto con el desglose, y el prestador queda
 *   cubierto por cada línea.
 *
 * POR QUÉ LOS ATRIBUTOS SALEN DEL SERVICIO
 *   Las condiciones solo pueden referirse a atributos que el servicio declara
 *   (svc_service_attributes: urgencia, cantidad, modalidad, ubicación...). Así el prestador
 *   no inventa conceptos que después el cliente no puede contestar, y "cantidad" siempre
 *   significa lo mismo para los dos.
 *
 * SE MONTA SOLA
 *   El editor de prestaciones se redibuja cuando el prestador agrega o quita servicios. En
 *   vez de engancharse a ese ciclo, este módulo espera a que aparezca la tarjeta de una
 *   prestación y se inserta debajo. Si se redibuja, se vuelve a montar.
 */

import { getSupabaseClient } from "./supabase.js?v=2026.05.17.2";

const KINDS = [
  { value: "BASE", label: "Precio de partida", ayuda: "Lo que cobrás siempre. Ej: la visita." },
  { value: "INCLUDE", label: "Qué incluye", ayuda: "Hasta dónde llega ese precio. Ej: hasta 2 m²." },
  { value: "TIER", label: "Tramo por cantidad", ayuda: "Cuánto cobrás según la cantidad. Ej: 3 a 10 m²." },
  { value: "SURCHARGE", label: "Recargo", ayuda: "Un extra por una condición. Ej: urgencia hoy." },
  { value: "EXCLUDE", label: "Qué NO incluye", ayuda: "Lo que queda afuera. Ej: materiales." }
];

const ADJUSTMENTS = [
  { value: "percent", label: "Porcentaje (%)" },
  { value: "absolute", label: "Monto fijo ($)" },
  { value: "per_unit", label: "Por unidad ($ × cantidad)" }
];

const ESTILO_INPUT =
  "width:100%;padding:9px;border-radius:9px;border:1px solid rgba(0,0,0,.18);background:#fff;font-size:14px;";
const ESTILO_BOTON =
  "padding:10px 14px;border-radius:10px;border:0;background:#1a56db;color:#fff;font-weight:600;font-size:14px;cursor:pointer;";

let observador = null;
const montados = new WeakSet();

function supabaseCliente() {
  try {
    return getSupabaseClient?.() ?? null;
  } catch (error) {
    return null;
  }
}

/** Lee los parámetros cargados. La RLS deja leer los activos. */
export async function loadPriceBook(offeringId) {
  const supabase = supabaseCliente();
  if (!supabase || !offeringId) return [];
  const { data, error } = await supabase
    .from("svc_offering_price_params")
    .select("id,attribute_code,kind,condition_json,adjustment_json,note,sort_order,active")
    .eq("offering_id", offeringId)
    .eq("active", true)
    .order("sort_order", { ascending: true });
  if (error) return [];
  return data || [];
}

/** Los atributos del servicio: las únicas condiciones que tienen sentido. */
async function loadServiceAttributes(offeringId) {
  const supabase = supabaseCliente();
  if (!supabase) return [];
  const { data: offering } = await supabase
    .from("svc_provider_service_offerings")
    .select("service_template_version_id")
    .eq("id", offeringId)
    .maybeSingle();
  const versionId = offering?.service_template_version_id;
  if (!versionId) return [];
  const { data } = await supabase
    .from("svc_service_attributes")
    .select("code,label,data_type,unit")
    .eq("template_version_id", versionId)
    .order("sort_order", { ascending: true });
  return data || [];
}

export async function addPriceParam(offeringId, param) {
  const supabase = supabaseCliente();
  if (!supabase) throw new Error("sin_conexion");
  const { error } = await supabase.from("svc_offering_price_params").insert({
    offering_id: offeringId,
    attribute_code: param.attribute_code || "base",
    kind: param.kind,
    condition_json: param.condition_json || {},
    adjustment_json: param.adjustment_json || {},
    note: param.note || null,
    sort_order: Number(param.sort_order || 0)
  });
  if (error) throw error;
  return true;
}

export async function removePriceParam(paramId) {
  const supabase = supabaseCliente();
  if (!supabase) throw new Error("sin_conexion");
  // Se desactiva en vez de borrar: si el prestador se arrepiente, la regla vuelve.
  const { error } = await supabase
    .from("svc_offering_price_params")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("id", paramId);
  if (error) throw error;
  return true;
}

/** Texto legible de una condición, para el resumen. */
function describirCondicion(param, atributos) {
  const c = param.condition_json || {};
  if (!c || Object.keys(c).length === 0) return "siempre";
  const attr = atributos.find((a) => a.code === param.attribute_code);
  const quien = attr?.label || param.attribute_code;
  if (c.eq !== undefined) return `${quien} = ${c.eq}`;
  if (Array.isArray(c.in)) return `${quien}: ${c.in.join(", ")}`;
  if (c.gte !== undefined && c.lte !== undefined) return `${quien} entre ${c.gte} y ${c.lte}`;
  if (c.gte !== undefined) return `${quien} desde ${c.gte}`;
  if (c.lte !== undefined) return `${quien} hasta ${c.lte}`;
  return "siempre";
}

function describirAjuste(param) {
  const a = param.adjustment_json || {};
  const tipo = a.type;
  if (tipo === "percent") return `${a.value}%`;
  if (tipo === "per_unit") return `$${a.value} por ${a.unit || "unidad"}`;
  if (a.value !== undefined) return `$${a.value}`;
  return "";
}

const ETIQUETA_KIND = Object.fromEntries(KINDS.map((k) => [k.value, k.label]));

/**
 * Monta el editor debajo de la tarjeta de la prestación.
 * Devuelve true si montó (o ya estaba montado).
 */
export function mountPriceBookEditor(tarjeta) {
  if (!tarjeta || montados.has(tarjeta)) return false;
  const offeringId = tarjeta.getAttribute("data-offering-id")
    || tarjeta.querySelector('input[name$=":id"]')?.value;
  if (!offeringId) return false;

  montados.add(tarjeta);

  const caja = document.createElement("div");
  caja.style.cssText = "margin-top:12px;padding:12px;border:1px solid rgba(0,0,0,.12);border-radius:12px;background:#fbfcfe;";

  const titulo = document.createElement("strong");
  titulo.textContent = "Tu cuadro tarifario";
  titulo.style.cssText = "display:block;font-size:14px;margin-bottom:2px;";

  const ayuda = document.createElement("small");
  ayuda.style.cssText = "display:block;font-size:11px;opacity:.7;margin-bottom:10px;";
  ayuda.textContent =
    "Con esto el cliente ve un presupuesto desglosado y no un número suelto. " +
    "Solo podés condicionar por los datos que el servicio ya pregunta.";

  const lista = document.createElement("div");
  const formulario = document.createElement("div");
  formulario.style.cssText = "margin-top:10px;display:grid;gap:8px;";

  const estado = document.createElement("small");
  estado.style.cssText = "display:block;font-size:11px;margin-top:6px;opacity:.8;";

  caja.append(titulo, ayuda, lista, formulario, estado);
  tarjeta.appendChild(caja);

  let atributos = [];

  function pintar() {
    loadPriceBook(offeringId).then((params) => {
      lista.innerHTML = "";
      if (params.length === 0) {
        lista.innerHTML = '<p style="margin:0;font-size:12px;opacity:.7;">Todavía no cargaste parámetros: hoy se usa un solo precio.</p>';
        return;
      }
      params.forEach((p) => {
        const fila = document.createElement("div");
        fila.style.cssText =
          "display:flex;justify-content:space-between;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid rgba(0,0,0,.06);";
        const texto = document.createElement("span");
        texto.style.cssText = "font-size:12px;";
        texto.innerHTML =
          `<strong>${ETIQUETA_KIND[p.kind] || p.kind}</strong> · ${describirCondicion(p, atributos)}` +
          (describirAjuste(p) ? ` · ${describirAjuste(p)}` : "") +
          (p.note ? ` <span style="opacity:.7;">(${p.note})</span>` : "");
        const quitar = document.createElement("button");
        quitar.type = "button";
        quitar.textContent = "Quitar";
        quitar.style.cssText = "border:0;background:none;color:#b42318;font-size:12px;cursor:pointer;";
        quitar.addEventListener("click", async () => {
          quitar.disabled = true;
          try {
            await removePriceParam(p.id);
            pintar();
          } catch (error) {
            estado.textContent = "No se pudo quitar. Probá de nuevo.";
            quitar.disabled = false;
          }
        });
        fila.append(texto, quitar);
        lista.appendChild(fila);
      });
    });
  }

  function campo(label, nodo) {
    const wrap = document.createElement("label");
    wrap.style.cssText = "display:block;font-size:11px;font-weight:600;";
    wrap.textContent = label;
    wrap.appendChild(nodo);
    return wrap;
  }

  const selKind = document.createElement("select");
  selKind.style.cssText = ESTILO_INPUT;
  KINDS.forEach((k) => {
    const o = document.createElement("option");
    o.value = k.value;
    o.textContent = k.label;
    selKind.appendChild(o);
  });

  const selAttr = document.createElement("select");
  selAttr.style.cssText = ESTILO_INPUT;

  const selCond = document.createElement("select");
  selCond.style.cssText = ESTILO_INPUT;
  [["siempre", "Siempre"], ["eq", "Es igual a"], ["rango", "Está entre"]].forEach(([v, l]) => {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = l;
    selCond.appendChild(o);
  });

  const inValor = document.createElement("input");
  inValor.type = "text";
  inValor.placeholder = "Ej: HOY";
  inValor.style.cssText = ESTILO_INPUT;

  const inDesde = document.createElement("input");
  inDesde.type = "number";
  inDesde.placeholder = "Desde";
  inDesde.style.cssText = ESTILO_INPUT;

  const inHasta = document.createElement("input");
  inHasta.type = "number";
  inHasta.placeholder = "Hasta";
  inHasta.style.cssText = ESTILO_INPUT;

  const selAjuste = document.createElement("select");
  selAjuste.style.cssText = ESTILO_INPUT;
  ADJUSTMENTS.forEach((a) => {
    const o = document.createElement("option");
    o.value = a.value;
    o.textContent = a.label;
    selAjuste.appendChild(o);
  });

  const inMonto = document.createElement("input");
  inMonto.type = "number";
  inMonto.placeholder = "Ej: 6000";
  inMonto.style.cssText = ESTILO_INPUT;

  const inNota = document.createElement("input");
  inNota.type = "text";
  inNota.placeholder = "Como lo lee el cliente. Ej: Urgencia para hoy";
  inNota.style.cssText = ESTILO_INPUT;

  const boton = document.createElement("button");
  boton.type = "button";
  boton.textContent = "Agregar al cuadro tarifario";
  boton.style.cssText = ESTILO_BOTON;

  formulario.append(
    campo("Tipo", selKind),
    campo("Concepto del servicio", selAttr),
    campo("Cuándo aplica", selCond),
    campo("Valor", inValor),
    campo("Desde", inDesde),
    campo("Hasta", inHasta),
    campo("Cómo cambia el precio", selAjuste),
    campo("Monto", inMonto),
    campo("Nota para el cliente (opcional)", inNota),
    boton
  );

  function refrescarVisibilidad() {
    const esExcluirOIncluir = selKind.value === "EXCLUDE" || selKind.value === "INCLUDE";
    inValor.parentElement.style.display = selCond.value === "eq" ? "" : "none";
    inDesde.parentElement.style.display = selCond.value === "rango" ? "" : "none";
    inHasta.parentElement.style.display = selCond.value === "rango" ? "" : "none";
    selAjuste.parentElement.style.display = esExcluirOIncluir ? "none" : "";
    inMonto.parentElement.style.display = esExcluirOIncluir ? "none" : "";
  }
  selKind.addEventListener("change", refrescarVisibilidad);
  selCond.addEventListener("change", refrescarVisibilidad);

  boton.addEventListener("click", async () => {
    boton.disabled = true;
    estado.textContent = "Guardando…";
    try {
      const condition = {};
      if (selCond.value === "eq" && inValor.value.trim()) condition.eq = inValor.value.trim();
      if (selCond.value === "rango") {
        if (inDesde.value !== "") condition.gte = Number(inDesde.value);
        if (inHasta.value !== "") condition.lte = Number(inHasta.value);
      }
      const adjustment = {};
      if (selKind.value !== "EXCLUDE" && selKind.value !== "INCLUDE") {
        adjustment.type = selAjuste.value;
        adjustment.value = Number(inMonto.value || 0);
      }
      await addPriceParam(offeringId, {
        kind: selKind.value,
        attribute_code: selAttr.value,
        condition_json: condition,
        adjustment_json: adjustment,
        note: inNota.value.trim() || null
      });
      inMonto.value = "";
      inNota.value = "";
      estado.textContent = "Guardado. Se aplica cuando el cliente pide algo que entra en esta regla.";
      pintar();
    } catch (error) {
      estado.textContent = "No se pudo guardar. Revisá el monto y probá de nuevo.";
    } finally {
      boton.disabled = false;
    }
  });

  loadServiceAttributes(offeringId).then((attrs) => {
    atributos = attrs;
    selAttr.innerHTML = "";
    // "base" no es un atributo del servicio: es el marcador de las reglas sin condición.
    const base = document.createElement("option");
    base.value = "base";
    base.textContent = "General (sin condición)";
    selAttr.appendChild(base);
    attrs.forEach((a) => {
      const o = document.createElement("option");
      o.value = a.code;
      o.textContent = a.label + (a.unit ? ` (${a.unit})` : "");
      selAttr.appendChild(o);
    });
    refrescarVisibilidad();
    pintar();
  });

  refrescarVisibilidad();
  pintar();
  return true;
}

/** Se monta sola cuando aparece el editor de prestaciones, y se re-monta si se redibuja. */
export function autoMountPriceBookEditor() {
  const intentar = () => {
    const tarjetas = document.querySelectorAll("[data-offering-id]");
    let monto = false;
    tarjetas.forEach((t) => {
      if (montados.has(t)) return;
      if (mountPriceBookEditor(t)) monto = true;
    });
    if (monto) estadoConsola();
  };

  const estadoConsola = () => console.log("[MIMI Tarifario] editor montado");

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", intentar, { once: true });
  } else {
    intentar();
  }

  try {
    observador = new MutationObserver(intentar);
    observador.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => {
      observador?.disconnect();
      observador = null;
    }, 180000);
  } catch (error) {
    console.warn("[MIMI Tarifario] no se pudo observar el editor", error);
  }
}
