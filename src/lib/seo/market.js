// src/lib/seo/market.js
// ─────────────────────────────────────────────────────────────────────────────
// MARKET / LOCALE RESOLUTION — single source of truth for "which country is this
// report for". Resolves an ISO-2 country code from the onboarding location text
// (country / city / region) and the domain TLD, so DataForSEO / keyword-gap / GMB
// fetch market-CORRECT data instead of the old hardcoded "India" everywhere.
// SAFE FALLBACK = "in" (the platform's India-first default) so existing India
// reports never regress; a confidently-detected market (e.g. UK from "Brighton")
// overrides it. Pure functions — safe to import on the client (onboarding) too.
// ─────────────────────────────────────────────────────────────────────────────

// Country / region names → ISO-2 (longest / most specific patterns first).
const NAME_RULES = [
  [/\b(united kingdom|great britain|\bu\.?k\.?\b|england|scotland|wales|northern ireland|britain)\b/, "gb"],
  [/\b(united states|u\.?s\.?a\.?|\bu\.?s\.?\b|america)\b/, "us"],
  [/\b(bharat|india)\b/, "in"],
  [/\b(united arab emirates|\bu\.?a\.?e\.?\b|emirates)\b/, "ae"],
  [/\baustralia\b/, "au"], [/\bcanada\b/, "ca"], [/\bsingapore\b/, "sg"],
  [/\b(germany|deutschland)\b/, "de"], [/\bfrance\b/, "fr"], [/\bireland\b/, "ie"],
  [/\bnew zealand\b/, "nz"], [/\bsouth africa\b/, "za"], [/\bnetherlands\b/, "nl"], [/\bspain\b/, "es"],
];
// Major cities → ISO-2 (only when no explicit country resolves).
const CITY_RULES = [
  [/\b(brighton|hove|london|manchester|birmingham|leeds|glasgow|edinburgh|liverpool|bristol|sheffield|cardiff|newcastle|nottingham)\b/, "gb"],
  [/\b(new york|los angeles|chicago|houston|san francisco|seattle|boston|austin|miami|dallas|atlanta|denver)\b/, "us"],
  [/\b(mumbai|delhi|new delhi|bangalore|bengaluru|hyderabad|chennai|pune|kolkata|noida|gurgaon|gurugram|ahmedabad|jaipur)\b/, "in"],
  [/\b(dubai|abu dhabi|sharjah)\b/, "ae"], [/\b(sydney|melbourne|brisbane|perth)\b/, "au"],
  [/\b(toronto|vancouver|montreal|calgary|ottawa)\b/, "ca"],
];
// Domain TLD → ISO-2 (checked when location text is inconclusive).
const TLD_RULES = [
  ["co.uk", "gb"], ["org.uk", "gb"], ["uk", "gb"], ["co.in", "in"], ["in", "in"],
  ["com.au", "au"], ["au", "au"], ["ca", "ca"], ["ae", "ae"], ["sg", "sg"],
  ["de", "de"], ["fr", "fr"], ["ie", "ie"], ["co.nz", "nz"], ["nz", "nz"], ["co.za", "za"], ["nl", "nl"], ["es", "es"],
];

// DataForSEO `location_name` for a country code. Defaults to India to match the
// pipeline's safe fallback. Extend the map as new markets are supported.
export function locationNameForCountry(cc) {
  const c = String(cc || "in").toLowerCase();
  const map = {
    in: "India", us: "United States", gb: "United Kingdom", uk: "United Kingdom",
    ca: "Canada", au: "Australia", ae: "United Arab Emirates", sg: "Singapore",
    de: "Germany", fr: "France", ie: "Ireland", nz: "New Zealand", za: "South Africa", nl: "Netherlands", es: "Spain",
  };
  return map[c] || "India";
}

// Resolve the client's market (ISO-2). loc = { country, location, city, state, countries[] }.
export function resolveCountryCode(loc = {}, domain = "") {
  const text = String(
    [loc.country, loc.location, loc.city, loc.state, ...(Array.isArray(loc.countries) ? loc.countries : [])]
      .filter(Boolean).join(" · ")
  ).toLowerCase();
  if (text) {
    for (const [re, cc] of NAME_RULES) if (re.test(text)) return cc;
    for (const [re, cc] of CITY_RULES) if (re.test(text)) return cc;
  }
  const host = String(domain || "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  for (const [tld, cc] of TLD_RULES) if (host.endsWith("." + tld)) return cc;
  return "in"; // safe default — never worse than the previous hardcoded behaviour
}

export default resolveCountryCode;
