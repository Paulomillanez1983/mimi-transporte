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

export async function loadPhoneCountries(locale = navigator.language || "es-AR") {
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
  const locale = navigator.language || "";
  const localeRegion = locale.match(/[-_]([A-Z]{2})$/i)?.[1]?.toUpperCase();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  const inferred =
    localeRegion ||
    (timeZone.includes("Argentina") || timeZone.includes("Buenos_Aires") ? "AR" : "");
  return countries.find((country) => country.iso === inferred) ||
    countries.find((country) => country.iso === "AR") ||
    countries[0] ||
    { iso: "AR", name: "Argentina", dialCode: "+54", flag: "🇦🇷" };
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

function countryFlag(iso) {
  return String(iso || "")
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
}
