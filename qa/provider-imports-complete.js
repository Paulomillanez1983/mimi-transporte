/**
 * QA de imports: el panel se queda EN BLANCO si se usa un nombre que no se importó.
 *
 * POR QUE EXISTE
 *   El panel del prestador se rompió en produccion por esto: render-provider.js llamaba a
 *   `resolveOfferingPricingModel` y el import seguia trayendo `resolvePricingModel`. El error
 *   ("resolveOfferingPricingModel is not defined") tiraba la pantalla entera de servicios y
 *   precios: el panel quedaba vacio, sin ningun aviso.
 *
 *   `node --check` no lo detecta (es un error de ejecucion, no de sintaxis), y los QA que armamos
 *   antes tampoco: probaban el modulo por un lado y el markup por otro, y ninguno miraba el
 *   cableado entre los dos.
 *
 * QUE REVISA
 *   Para cada modulo compartido, que todo nombre que el panel usa y que el modulo exporta este
 *   efectivamente importado en ese archivo (con o sin alias).
 */
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function leer(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

// Se sacan los comentarios: un nombre nombrado en un comentario no es un uso.
function sinComentarios(texto) {
  return texto.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/gm, "$1 ");
}

const MODULOS = [
  {
    modulo: "mimi-servicios/src/services/pricing-models.js",
    consumidores: ["mimi-servicios/src/ui/render-provider.js", "mimi-servicios/src/main-provider.js"]
  }
];

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

MODULOS.forEach(({ modulo, consumidores }) => {
  const fuente = leer(modulo);
  const exportados = [...fuente.matchAll(/^export\s+(?:function|const)\s+([A-Za-z0-9_]+)/gm)].map((m) => m[1]);

  consumidores.forEach((archivo) => {
    const texto = leer(archivo);
    const codigo = sinComentarios(texto);
    // El bloque se ubica desde el cierre hacia atras: si se busca desde el principio, la
    // expresion engancha el primer `import {` del archivo y se lleva puesto otro import.
    const cierres = ['} from "../services/pricing-models.js', '} from "./services/pricing-models.js']
      .map((t) => codigo.indexOf(t))
      .filter((i) => i >= 0);
    if (!cierres.length) {
      check(`${path.basename(archivo)} importa el modulo compartido`, false, "no encontre el import");
      return;
    }
    const cierre = Math.min(...cierres);
    const apertura = codigo.lastIndexOf("import {", cierre);
    const contenido = codigo.slice(apertura + "import {".length, cierre);

    // Se guardan los dos nombres: el original y el alias local.
    const disponibles = new Set();
    contenido.split(",").forEach((crudo) => {
      const parte = crudo.trim();
      if (!parte) return;
      const [original, alias] = parte.split(/\s+as\s+/).map((x) => x.trim());
      disponibles.add(original);
      disponibles.add(alias ?? original);
    });

    const usados = exportados.filter((nombre) => new RegExp(`\\b${nombre}\\b`).test(codigo));
    const faltan = usados.filter((nombre) => !disponibles.has(nombre));

    check(
      `${path.basename(archivo)} importa todo lo que usa de pricing-models (${usados.length} nombres)`,
      faltan.length === 0,
      `sin importar: ${faltan.join(", ")}`
    );
  });
});

// -------------------------------------------------------------- una sola instancia por modulo
//
// Un modulo compartido tiene que pedirse SIEMPRE con el mismo especificador. Con dos distintos,
// el navegador lo carga dos veces y cada copia tiene su propio estado. Eso rompio la sesion del
// prestador: main-provider.js pedia supabase.js?v=2026.06.05.2 y el resto de la app lo pedia con
// ?v=2026.05.17.2, asi que habia DOS clientes de Supabase y DOS GoTrueClient sobre la misma clave
// de sesion. La sesion se caia sola cada tanto, la app abria el overlay de login encima del panel
// y el panel quedaba sin responder a ningun toque.
const COMPARTIDOS = ["supabase.js", "pricing-models.js"];

// Lo que importa es que DENTRO DEL PANEL haya una sola instancia: la entrada del panel y todo lo
// que vive en src/services/ se cargan en la misma pagina, asi que tienen que coincidir. Que el
// cliente use otro ?v= no molesta, porque es otra pagina.
const ENTRADAS_DEL_PANEL = ["mimi-servicios/src/main-provider.js", "mimi-servicios/src/ui/render-provider.js"];

function especificadoresDe(modulo) {
  // Se busca como texto y no con una expresion regular: dentro de un template literal el `\?`
  // se pierde y el `?` pasa a ser un cuantificador, con lo que no encuentra nada.
  const marca = `${modulo}?v=`;
  const porArchivo = new Map();

  const recorrer = (dir) => {
    for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
      const completo = path.join(dir, entrada.name);
      if (entrada.isDirectory()) {
        if (!/node_modules|\.git/.test(entrada.name)) recorrer(completo);
        continue;
      }
      if (!entrada.name.endsWith(".js")) continue;

      const texto = fs.readFileSync(completo, "utf8");
      let desde = texto.indexOf(marca);
      while (desde >= 0) {
        const inicioVersion = desde + marca.length;
        const finVersion = texto.indexOf('"', inicioVersion);
        if (finVersion < 0) break;
        porArchivo.set(
          path.relative(root, completo).split(path.sep).join("/"),
          texto.slice(inicioVersion, finVersion)
        );
        desde = texto.indexOf(marca, finVersion);
      }
    }
  };

  recorrer(path.join(root, "mimi-servicios/src"));
  return porArchivo;
}

COMPARTIDOS.forEach((modulo) => {
  const porArchivo = especificadoresDe(modulo);
  const delPanel = ENTRADAS_DEL_PANEL.filter((f) => porArchivo.has(f)).map((f) => porArchivo.get(f));
  const deServicios = [...porArchivo.entries()].filter(([f]) => f.startsWith("mimi-servicios/src/services/")).map(([, v]) => v);
  const valores = [...new Set([...delPanel, ...deServicios])];

  check(
    `${modulo}: el panel y sus servicios piden la misma instancia (${valores.join(", ") || "sin referencias"})`,
    valores.length <= 1,
    `entradas del panel: ${delPanel.join(", ") || "-"} | src/services: ${[...new Set(deServicios)].join(", ") || "-"}`
  );
});

console.log("");
console.log(`Resultado: ${passes} OK, ${failures} fallos`);
process.exit(failures ? 1 : 0);
