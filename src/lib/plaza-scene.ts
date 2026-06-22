// Time-of-day scene selection for the living plaza, shared between the server
// (root page picks an initial scene from the visitor's country so SSR renders
// the correct background immediately — no post-hydration image swap, which was
// the landing's LCP drag) and the client (LivingPlaza corrects to the device's
// real local hour, a no-op when the server guessed right).

export type Scene = "morning" | "afternoon" | "evening" | "night";

// Public path of a scene's background webp. Shared by LivingPlaza (the <img>)
// and the root page (an <link rel=preload> for the LCP image).
export function sceneSrc(scene: Scene): string {
  return `/sprites/rooms/states/empty_${scene}.land.webp`;
}

export function sceneForHour(h: number): Scene {
  if (h >= 5 && h < 10) return "morning";
  if (h >= 10 && h < 17) return "afternoon";
  if (h >= 17 && h < 20) return "evening";
  return "night";
}

// Representative IANA timezone per ISO-3166-1 alpha-2 country. The scene only
// needs the rough 4-bucket hour, so a single capital-region zone per country is
// plenty (DST and multi-zone spread stay within bucket tolerance). Unknown ->
// undefined, handled as UTC by the caller.
const COUNTRY_TZ: Record<string, string> = {
  KR: "Asia/Seoul", JP: "Asia/Tokyo", CN: "Asia/Shanghai", TW: "Asia/Taipei",
  HK: "Asia/Hong_Kong", MO: "Asia/Macau", SG: "Asia/Singapore", MY: "Asia/Kuala_Lumpur",
  TH: "Asia/Bangkok", VN: "Asia/Ho_Chi_Minh", PH: "Asia/Manila", ID: "Asia/Jakarta",
  IN: "Asia/Kolkata", PK: "Asia/Karachi", BD: "Asia/Dhaka", LK: "Asia/Colombo",
  NP: "Asia/Kathmandu", MM: "Asia/Yangon", KH: "Asia/Phnom_Penh", LA: "Asia/Vientiane",
  AE: "Asia/Dubai", SA: "Asia/Riyadh", QA: "Asia/Qatar", KW: "Asia/Kuwait",
  IL: "Asia/Jerusalem", TR: "Europe/Istanbul", IR: "Asia/Tehran", IQ: "Asia/Baghdad",
  KZ: "Asia/Almaty", UZ: "Asia/Tashkent", MN: "Asia/Ulaanbaatar",
  GB: "Europe/London", IE: "Europe/Dublin", PT: "Europe/Lisbon", ES: "Europe/Madrid",
  FR: "Europe/Paris", DE: "Europe/Berlin", IT: "Europe/Rome", NL: "Europe/Amsterdam",
  BE: "Europe/Brussels", CH: "Europe/Zurich", AT: "Europe/Vienna", SE: "Europe/Stockholm",
  NO: "Europe/Oslo", DK: "Europe/Copenhagen", FI: "Europe/Helsinki", PL: "Europe/Warsaw",
  CZ: "Europe/Prague", SK: "Europe/Bratislava", HU: "Europe/Budapest", RO: "Europe/Bucharest",
  BG: "Europe/Sofia", GR: "Europe/Athens", UA: "Europe/Kyiv", RU: "Europe/Moscow",
  BY: "Europe/Minsk", RS: "Europe/Belgrade", HR: "Europe/Zagreb", SI: "Europe/Ljubljana",
  LT: "Europe/Vilnius", LV: "Europe/Riga", EE: "Europe/Tallinn", IS: "Atlantic/Reykjavik",
  LU: "Europe/Luxembourg",
  US: "America/Chicago", CA: "America/Toronto", MX: "America/Mexico_City",
  BR: "America/Sao_Paulo", AR: "America/Argentina/Buenos_Aires", CL: "America/Santiago",
  CO: "America/Bogota", PE: "America/Lima", VE: "America/Caracas", EC: "America/Guayaquil",
  UY: "America/Montevideo", BO: "America/La_Paz", PY: "America/Asuncion",
  CR: "America/Costa_Rica", PA: "America/Panama", GT: "America/Guatemala",
  DO: "America/Santo_Domingo", CU: "America/Havana", PR: "America/Puerto_Rico",
  AU: "Australia/Sydney", NZ: "Pacific/Auckland",
  ZA: "Africa/Johannesburg", EG: "Africa/Cairo", NG: "Africa/Lagos", KE: "Africa/Nairobi",
  MA: "Africa/Casablanca", DZ: "Africa/Algiers", TN: "Africa/Tunis", GH: "Africa/Accra",
  ET: "Africa/Addis_Ababa", TZ: "Africa/Dar_es_Salaam", UG: "Africa/Kampala",
};

export function countryToTimezone(country: string | null | undefined): string | undefined {
  if (!country) return undefined;
  return COUNTRY_TZ[country.toUpperCase()];
}

// Server-side scene for a request, derived from the visitor's country. Falls
// back to UTC when the country is unknown.
export function sceneForCountry(country: string | null | undefined, now: Date = new Date()): Scene {
  const tz = countryToTimezone(country);
  let hour: number;
  if (tz) {
    hour = Number(
      new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false }).format(now),
    );
    // "24" can appear at midnight in some locales/runtimes — normalise to 0.
    if (hour === 24) hour = 0;
  } else {
    hour = now.getUTCHours();
  }
  return sceneForHour(hour);
}
