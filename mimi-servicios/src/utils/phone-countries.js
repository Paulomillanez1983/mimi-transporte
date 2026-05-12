const FALLBACK_COUNTRIES = [
  ["AR", "Argentina", "+54"],
  ["UY", "Uruguay", "+598"],
  ["CL", "Chile", "+56"],
  ["BR", "Brasil", "+55"],
  ["PY", "Paraguay", "+595"],
  ["BO", "Bolivia", "+591"],
  ["PE", "Peru", "+51"],
  ["CO", "Colombia", "+57"],
  ["VE", "Venezuela", "+58"],
  ["EC", "Ecuador", "+593"],
  ["MX", "Mexico", "+52"],
  ["US", "Estados Unidos", "+1"],
  ["CA", "Canada", "+1"],
  ["ES", "Espana", "+34"],
  ["IT", "Italia", "+39"],
  ["FR", "Francia", "+33"],
  ["DE", "Alemania", "+49"],
  ["GB", "Reino Unido", "+44"],
  ["PT", "Portugal", "+351"],
  ["IE", "Irlanda", "+353"],
  ["NL", "Paises Bajos", "+31"],
  ["CH", "Suiza", "+41"],
  ["AU", "Australia", "+61"],
  ["NZ", "Nueva Zelanda", "+64"],
  ["JP", "Japon", "+81"],
  ["KR", "Corea del Sur", "+82"],
  ["CN", "China", "+86"],
  ["IN", "India", "+91"],
  ["ZA", "Sudafrica", "+27"]
];

let phoneToolsPromise = null;

export async function getPhoneTools() {
  if (!phoneToolsPromise) {
    phoneToolsPromise = import("https://esm.sh/libphonenumber-js@1.11.19/min")
      .then((mod) => ({
        getCountries: mod.getCountries,
        getCountryCallingCode: mod.getCountryCallingCode,
        parsePhoneNumberFromString: mod.parsePhoneNumberFromString,
        AsYouType: mod.AsYouType
      }))
      .catch(() => null);
  }
  return phoneToolsPromise;
}

export async function loadPhoneCountries(locale = getNavigatorLanguage()) {
  const tools = await getPhoneTools();
  const displayNames = safeDisplayNames(locale);

  if (tools?.getCountries && tools?.getCountryCallingCode) {
    return tools.getCountries()
      .map((iso) => ({
        iso,
        name: displayNames?.of(iso) || iso,
        dialCode: `+${tools.getCountryCallingCode(iso)}`,
        flag: countryFlag(iso)
      }))
      .sort((a, b) => {
        if (a.iso === "AR") return -1;
        if (b.iso === "AR") return 1;
        return a.name.localeCompare(b.name, locale);
      });
  }

  return FALLBACK_COUNTRIES.map(([iso, name, dialCode]) => ({
    iso,
    name,
    dialCode,
    flag: countryFlag(iso)
  }));
}

export function detectDefaultCountry(countries = []) {
  const localeRegion = getLocaleRegion();
  const timeZoneRegion = getTimeZoneRegion();
  const launchDefault = getRuntimeDefaultCountry();
  const inferred = timeZoneRegion || launchDefault || localeRegion || "AR";
  return countries.find((country) => country.iso === inferred) ||
    countries.find((country) => country.iso === launchDefault) ||
    countries.find((country) => country.iso === "AR") ||
    countries[0] ||
    { iso: "AR", name: "Argentina", dialCode: "+54", flag: countryFlag("AR") };
}

export async function normalizePhoneNumber(rawPhone, country) {
  const raw = String(rawPhone || "").trim();
  const tools = await getPhoneTools();

  if (tools?.parsePhoneNumberFromString) {
    const parsed = tools.parsePhoneNumberFromString(raw, country?.iso || "AR");
    if (!parsed?.isValid?.()) {
      throw new Error("phone_invalid");
    }
    return {
      phoneNumber: parsed.number,
      countryCode: `+${parsed.countryCallingCode}`,
      countryIso: parsed.country || country?.iso || "AR",
      nationalNumber: parsed.nationalNumber
    };
  }

  const digits = raw.replace(/\D/g, "");
  const withDial = raw.startsWith("+")
    ? `+${digits}`
    : `${country?.dialCode || "+54"}${digits}`;
  if (!/^\+[1-9][0-9]{7,14}$/.test(withDial)) {
    throw new Error("phone_invalid");
  }
  return {
    phoneNumber: withDial,
    countryCode: country?.dialCode || "+54",
    countryIso: country?.iso || "AR",
    nationalNumber: digits
  };
}

export async function formatPhoneAsYouType(value, countryIso = "AR") {
  const tools = await getPhoneTools();
  if (!tools?.AsYouType) return String(value || "");
  return new tools.AsYouType(countryIso).input(String(value || ""));
}

function safeDisplayNames(locale) {
  try {
    return new Intl.DisplayNames([locale, "es"], { type: "region" });
  } catch {
    return null;
  }
}

function getLocaleRegion() {
  const navigatorRef = typeof navigator !== "undefined" ? navigator : {};
  const locales = [
    ...new Set([
      ...(Array.isArray(navigatorRef.languages) ? navigatorRef.languages : []),
      navigatorRef.language
    ].filter(Boolean))
  ];
  for (const locale of locales) {
    const region = String(locale).match(/[-_]([A-Z]{2})$/i)?.[1]?.toUpperCase();
    if (region) return region;
  }
  return "";
}

function getNavigatorLanguage() {
  return (typeof navigator !== "undefined" && navigator.language) || "es-AR";
}

function getRuntimeDefaultCountry() {
  const env = typeof window !== "undefined" ? window.MIMI_SERVICES_ENV : null;
  const configured = env?.MIMI_DEFAULT_PHONE_COUNTRY || env?.VITE_DEFAULT_PHONE_COUNTRY;
  return String(configured || "AR").trim().toUpperCase();
}

function getTimeZoneRegion() {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  const normalized = String(timeZone).toLowerCase();
  const byTimeZone = [
    [/argentina|buenos_aires|cordoba|mendoza|ushuaia|catamarca|jujuy|la_rioja|rio_gallegos|salta|san_juan|san_luis|tucuman/i, "AR"],
    [/montevideo/i, "UY"],
    [/santiago|punta_arenas/i, "CL"],
    [/sao_paulo|belem|fortaleza|recife|araguaina|maceio|bahia|campo_grande|cuiaba|manaus|porto_velho|boa_vista|rio_branco|noronha/i, "BR"],
    [/asuncion/i, "PY"],
    [/la_paz/i, "BO"],
    [/lima/i, "PE"],
    [/bogota/i, "CO"],
    [/caracas/i, "VE"],
    [/guayaquil/i, "EC"],
    [/mexico_city|cancun|monterrey|tijuana|chihuahua|mazatlan|merida/i, "MX"],
    [/new_york|chicago|denver|los_angeles|phoenix|anchorage|honolulu|detroit|indianapolis|louisville|boise/i, "US"],
    [/toronto|vancouver|edmonton|winnipeg|halifax|st_johns|regina|whitehorse|yellowknife|iqaluit/i, "CA"],
    [/madrid|canary|ceuta/i, "ES"]
  ];
  return byTimeZone.find(([pattern]) => pattern.test(normalized))?.[1] || "";
}

function countryFlag(iso) {
  return String(iso || "")
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
}
