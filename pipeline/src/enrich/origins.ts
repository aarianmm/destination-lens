/**
 * AGENT F owns this module.
 *
 * Poster-origin inference, deliberately NOT an LLM job: it only pattern-matches an
 * author's own, self-reported Bluesky profile "location" free-text field against a
 * fixed lookup table. If a location string doesn't match anything here, the post
 * simply contributes no origin signal — never guessed, never inferred from name,
 * language, or content. This keeps the "inferred from online conversation" claim
 * in the UI honest.
 *
 * The table covers the source markets that actually show up in this product
 * (the fixture `SEED_ORIGINS` in `shared/src/fixtures/seed.ts`, roughly) plus a
 * handful of obvious additions. It is intentionally not exhaustive — an
 * unmatched location is a dropped signal, not a bug.
 */

type LocationRule = { pattern: RegExp; iso2: string };

const LOCATION_RULES: LocationRule[] = [
  {
    iso2: 'GB',
    pattern:
      /\b(united kingdom|u\.?k\.?|england|scotland|wales|northern ireland|london|manchester|edinburgh|glasgow|bristol|birmingham|leeds)\b/i,
  },
  {
    iso2: 'US',
    pattern:
      /\b(united states|u\.?s\.?a?\.?|new york|california|texas|chicago|los angeles|san francisco|seattle|boston|miami|austin|denver)\b/i,
  },
  {
    iso2: 'DE',
    pattern: /\b(germany|deutschland|berlin|munich|münchen|hamburg|frankfurt|cologne|köln)\b/i,
  },
  { iso2: 'FR', pattern: /\b(france|paris|lyon|marseille|toulouse|bordeaux|nice,? france)\b/i },
  {
    iso2: 'IN',
    pattern: /\b(india|mumbai|delhi|bangalore|bengaluru|hyderabad|chennai|kolkata|pune)\b/i,
  },
  { iso2: 'CN', pattern: /\b(china|beijing|shanghai|shenzhen|guangzhou|chengdu)\b/i },
  { iso2: 'SG', pattern: /\bsingapore\b/i },
  { iso2: 'AU', pattern: /\b(australia|sydney|melbourne|brisbane|perth|adelaide)\b/i },
  { iso2: 'KR', pattern: /\b(south korea|korea,? republic|seoul|busan)\b/i },
  { iso2: 'MY', pattern: /\b(malaysia|kuala lumpur|penang|johor)\b/i },
  { iso2: 'CA', pattern: /\b(canada|toronto|vancouver|montreal|ottawa|calgary)\b/i },
  { iso2: 'BR', pattern: /\b(brazil|brasil|são paulo|sao paulo|rio de janeiro)\b/i },
  { iso2: 'NL', pattern: /\b(netherlands|holland|amsterdam|rotterdam|the hague)\b/i },
  { iso2: 'TR', pattern: /\b(turkey|türkiye|turkiye|istanbul|ankara)\b/i },
  { iso2: 'AE', pattern: /\b(united arab emirates|u\.?a\.?e\.?|dubai|abu dhabi)\b/i },
  { iso2: 'QA', pattern: /\b(qatar|doha)\b/i },
  { iso2: 'SA', pattern: /\b(saudi arabia|riyadh|jeddah)\b/i },
  { iso2: 'PH', pattern: /\b(philippines|manila|cebu)\b/i },
  { iso2: 'TW', pattern: /\b(taiwan|taipei)\b/i },
  { iso2: 'HK', pattern: /\bhong kong\b/i },
  { iso2: 'NZ', pattern: /\b(new zealand|auckland|wellington)\b/i },
  { iso2: 'ZA', pattern: /\b(south africa|johannesburg|cape town)\b/i },
  { iso2: 'EG', pattern: /\b(egypt|cairo)\b/i },
  { iso2: 'AR', pattern: /\b(argentina|buenos aires)\b/i },
  { iso2: 'CL', pattern: /\b(chile|santiago)\b/i },
  { iso2: 'CO', pattern: /\b(colombia|bogot[aá])\b/i },
  { iso2: 'PL', pattern: /\b(poland|polska|warsaw|krak[oó]w)\b/i },
  { iso2: 'SE', pattern: /\b(sweden|stockholm|gothenburg)\b/i },
  { iso2: 'NO', pattern: /\b(norway|oslo)\b/i },
  { iso2: 'DK', pattern: /\b(denmark|copenhagen)\b/i },
  { iso2: 'FI', pattern: /\b(finland|helsinki)\b/i },
  { iso2: 'CH', pattern: /\b(switzerland|zurich|geneva)\b/i },
  { iso2: 'AT', pattern: /\b(austria|vienna)\b/i },
  { iso2: 'BE', pattern: /\b(belgium|brussels|antwerp)\b/i },
  { iso2: 'IE', pattern: /\b(ireland|dublin)\b/i },
  { iso2: 'CZ', pattern: /\b(czech( republic)?|czechia|prague)\b/i },
  { iso2: 'IL', pattern: /\b(israel|tel aviv|jerusalem)\b/i },
  { iso2: 'RU', pattern: /\b(russia|moscow|saint petersburg)\b/i },
  { iso2: 'NG', pattern: /\b(nigeria|lagos|abuja)\b/i },
  { iso2: 'KE', pattern: /\b(kenya|nairobi)\b/i },
  { iso2: 'JP', pattern: /\b(japan|tokyo|osaka|kyoto)\b/i },
  { iso2: 'ES', pattern: /\b(spain|espa[nñ]a|madrid|barcelona)\b/i },
  { iso2: 'IT', pattern: /\b(italy|italia|rome|milan)\b/i },
  { iso2: 'PT', pattern: /\b(portugal|lisbon|porto)\b/i },
  { iso2: 'MX', pattern: /\b(mexico|m[eé]xico city|guadalajara)\b/i },
  { iso2: 'TH', pattern: /\b(thailand|bangkok)\b/i },
  { iso2: 'VN', pattern: /\b(vietnam|viet nam|hanoi|ho chi minh)\b/i },
  { iso2: 'ID', pattern: /\b(indonesia|jakarta|bali)\b/i },
  { iso2: 'GR', pattern: /\b(greece|athens)\b/i },
  { iso2: 'MA', pattern: /\b(morocco|casablanca|marrakesh|marrakech)\b/i },
];

/** Country names for display, used both for source-market labels and here for tests. */
export const ISO2_NAMES: ReadonlyMap<string, string> = new Map([
  ['GB', 'United Kingdom'],
  ['US', 'United States'],
  ['DE', 'Germany'],
  ['FR', 'France'],
  ['IN', 'India'],
  ['CN', 'China'],
  ['SG', 'Singapore'],
  ['AU', 'Australia'],
  ['KR', 'South Korea'],
  ['MY', 'Malaysia'],
  ['CA', 'Canada'],
  ['BR', 'Brazil'],
  ['NL', 'Netherlands'],
  ['TR', 'Türkiye'],
  ['AE', 'United Arab Emirates'],
  ['QA', 'Qatar'],
  ['SA', 'Saudi Arabia'],
  ['PH', 'Philippines'],
  ['TW', 'Taiwan'],
  ['HK', 'Hong Kong'],
  ['NZ', 'New Zealand'],
  ['ZA', 'South Africa'],
  ['EG', 'Egypt'],
  ['AR', 'Argentina'],
  ['CL', 'Chile'],
  ['CO', 'Colombia'],
  ['PL', 'Poland'],
  ['SE', 'Sweden'],
  ['NO', 'Norway'],
  ['DK', 'Denmark'],
  ['FI', 'Finland'],
  ['CH', 'Switzerland'],
  ['AT', 'Austria'],
  ['BE', 'Belgium'],
  ['IE', 'Ireland'],
  ['CZ', 'Czechia'],
  ['IL', 'Israel'],
  ['RU', 'Russia'],
  ['NG', 'Nigeria'],
  ['KE', 'Kenya'],
  ['JP', 'Japan'],
  ['ES', 'Spain'],
  ['IT', 'Italy'],
  ['PT', 'Portugal'],
  ['MX', 'Mexico'],
  ['TH', 'Thailand'],
  ['VN', 'Vietnam'],
  ['ID', 'Indonesia'],
  ['GR', 'Greece'],
  ['MA', 'Morocco'],
]);

/**
 * Maps an author's raw profile location string to an iso2 code, or `undefined`
 * when nothing matches — an unmapped location is simply dropped, never guessed.
 */
export function inferOriginIso2(locationRaw: string | undefined): string | undefined {
  const loc = locationRaw?.trim();
  if (!loc) return undefined;
  for (const rule of LOCATION_RULES) {
    if (rule.pattern.test(loc)) return rule.iso2;
  }
  return undefined;
}
