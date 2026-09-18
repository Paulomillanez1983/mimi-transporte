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

console.log("");
console.log(`Resultado: ${passes} OK, ${failures} fallos`);
process.exit(failures ? 1 : 0);
