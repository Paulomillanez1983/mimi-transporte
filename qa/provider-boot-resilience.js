/**
 * QA del arranque del panel: una demora de red no puede dejar afuera al prestador.
 *
 * QUE PROTEGE
 *   El arranque resuelve la sesion con un lookup del prestador que tiene 8 segundos de
 *   presupuesto. Medido en el panel real, la PRIMERA vuelta a Supabase desde un telefono tarda
 *   ~2,5s, y cuando la red viene lenta ese lookup se pasa de tiempo. Hasta ahora, un timeout se
 *   trataba igual que "no hay sesion": la app le mostraba el login a un prestador logueado y el
 *   panel quedaba dibujado pero sin responder. Este QA fija que un timeout se reintente antes de
 *   dar la sesion por perdida.
 *
 *   Los presupuestos del resto del arranque (categorias 1500ms, recursos 1500-2500ms) siguen
 *   siendo cortos frente a esa latencia y hacen fallback; queda anotado, no cubierto aca.
 */
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const api = fs.readFileSync(path.join(root, "mimi-servicios/src/services/service-api.js"), "utf8");

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

const i = api.indexOf("PROVIDER_LOOKUP_TIMEOUT");
const alrededor = i >= 0 ? api.slice(Math.max(0, i - 1600), i + 1600) : "";

check("el lookup del prestador tiene presupuesto declarado", i >= 0);
check(
  "un timeout se reintenta antes de tirar la toalla",
  /for \(let intento = 1; intento <= 3; intento \+= 1\)/.test(alrededor) &&
    /if \(!esTimeout \|\| intento === 3\) throw error;/.test(alrededor),
  "no encontre el bucle de reintentos"
);
check(
  "solo se reintenta ante un timeout, no ante un error de verdad",
  /const esTimeout = \/TIMEOUT\/i\.test\(String\(error\?\.message \?\? ""\)\);/.test(alrededor),
  "el reintento no distingue timeout de error"
);
const main = fs.readFileSync(path.join(root, "mimi-servicios/src/main-provider.js"), "utf8");

check(
  "el mapa se inicializa en el arranque, no solo al navegar o al volver del segundo plano",
  /ensureProviderMapLoaded\("boot"\)/.test(main),
  "el #map queda visible pero vacio en un arranque en frio"
);

check(
  "el error se propaga recien despues de los reintentos",
  /if \(providerLookupError\) throw providerLookupError;/.test(alrededor),
  "no encuentro el throw final"
);

console.log("");
console.log(`Resultado: ${passes} OK, ${failures} fallos`);
process.exit(failures ? 1 : 0);
