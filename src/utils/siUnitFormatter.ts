import { ProductAttribute } from '../types';

/**
 * ISO 80000 / SI Technical Unit Formatter & Catalog Attribute Hygiene Utilities
 * Zero-dependency deterministic normalizer for industrial engineering specifications.
 */

const KNOWN_ENGINEERING_CODES_REGEX =
  /^(?:SS\d+[A-Z]*|CS|UPVC|CPVC|PVDF|PTFE|EPDM|FKM|FRP|GRP|HDPE|LDPE|PP|PE\d+|SCH\d+|PN\d+|DN\d+|IP\d+|NEMA\d*[A-Z]*|ANSI|ASME|ASTM|ISO\d*|DIN\d*|BS\d*|CE|NSF|UL|FM|ATEX|MK\d+|V\d+|PH\d+|G\d+|R\d+|M\d+)$/i;

/**
 * Guard: detects whether a token looks like an alphanumeric SKU, model number, or part code
 * (e.g., "300P-8-1R2R-H-6-WH", "AVAPHF-PN-05-60-E", "TDWMP8-13-2.2", "WS1EITT", "TS120", "PE05", "MK2").
 */
export function isLikelyPartCodeToken(token: string): boolean {
  const t = (token || '').trim();
  if (!t) return false;
  if (KNOWN_ENGINEERING_CODES_REGEX.test(t)) return true;

  // Multi-segment hyphenated code containing letters and digits (e.g. 300P-8-1R2R-H-6-WH, AVAPHF-PN-05-60-E, TDWMP8-13-2.2)
  if (t.includes('-') && /[A-Za-z]/.test(t) && /\d/.test(t)) {
    const parts = t.split('-');
    if (parts.length >= 2 && parts.some((p) => /[A-Za-z]/.test(p) && /\d/.test(p))) {
      return true;
    }
    if (parts.length >= 3) {
      return true;
    }
  }

  // Single token with letters followed by digits (or digits-letters-digits) that is NOT a number+unit
  // e.g. WS1EITT, TS120, AKA6002
  if (/^[A-Za-z]{1,6}\d+[A-Za-z0-9.]*$/.test(t)) {
    return true;
  }
  if (/^\d+[A-Za-z]+\d+[A-Za-z0-9.]*$/.test(t)) {
    return true;
  }

  return false;
}

const CANONICAL_SI_UNITS: Record<string, string> = {
  kg: 'kg',
  kgs: 'kg',
  kilogram: 'kg',
  kilograms: 'kg',
  g: 'g',
  gm: 'g',
  gms: 'g',
  gram: 'g',
  grams: 'g',
  mg: 'mg',
  mm: 'mm',
  cm: 'cm',
  m: 'm',
  mtr: 'm',
  mtrs: 'm',
  meter: 'm',
  meters: 'm',
  metre: 'm',
  metres: 'm',
  m2: 'm²',
  'm²': 'm²',
  sqm: 'm²',
  m3: 'm³',
  'm³': 'm³',
  cbm: 'm³',
  bar: 'bar',
  bars: 'bar',
  barg: 'bar',
  min: 'min',
  mins: 'min',
  s: 's',
  sec: 's',
  secs: 's',
  h: 'h',
  hr: 'h',
  hrs: 'h',
  ppm: 'ppm',
  um: 'μm',
  'μm': 'μm',
  'µm': 'μm',
  micron: 'μm',
  microns: 'μm',
  l: 'L',
  ltr: 'L',
  ltrs: 'L',
  liter: 'L',
  liters: 'L',
  litre: 'L',
  litres: 'L',
  ml: 'mL',
  kpa: 'kPa',
  mpa: 'MPa',
  kw: 'kW',
  w: 'W',
  v: 'V',
  vac: 'VAC',
  vdc: 'VDC',
  a: 'A',
  amp: 'A',
  amps: 'A',
  ma: 'mA',
  hz: 'Hz',
  n: 'N',
  kn: 'kN',
  hp: 'HP',
  psi: 'PSI',
  psig: 'PSI',
  gpm: 'GPM',
  lph: 'L/h',
  lpm: 'L/min',
  '°c': '°C',
  degc: '°C'
};

function resolveCanonicalUnitSymbol(rawUnit: string): string | null {
  const u = (rawUnit || '').trim();
  if (!u) return null;
  if (u === '"' || u === '”' || u === '”') return '"';
  if (u === "'") return "'";
  if (u === '%') return '%';
  const lower = u.toLowerCase();
  if (CANONICAL_SI_UNITS[lower]) {
    return CANONICAL_SI_UNITS[lower];
  }
  return null;
}

function formatNumberWithUnit(numStr: string, canonicalUnit: string): string {
  if (canonicalUnit === '"' || canonicalUnit === "'" || canonicalUnit === '%') {
    return `${numStr}${canonicalUnit}`;
  }
  return `${numStr} ${canonicalUnit}`;
}

function matchRangeDecimalPrecision(n1Str: string, n2Str: string): [string, string] {
  const dot1 = n1Str.indexOf('.');
  const dot2 = n2Str.indexOf('.');
  const dec1 = dot1 >= 0 ? n1Str.length - dot1 - 1 : 0;
  const dec2 = dot2 >= 0 ? n2Str.length - dot2 - 1 : 0;
  if (dec1 === dec2) return [n1Str, n2Str];
  const targetDec = Math.min(2, Math.max(dec1, dec2));
  const v1 = Number(n1Str);
  const v2 = Number(n2Str);
  if (isNaN(v1) || isNaN(v2)) return [n1Str, n2Str];
  return [
    dec1 === 0 ? v1.toFixed(targetDec) : n1Str,
    dec2 === 0 ? v2.toFixed(targetDec) : n2Str
  ];
}

/**
 * Formats an engineering / technical specification value according to ISO 80000 / SI conventions
 * while preserving alphanumeric SKUs, part numbers, and model codes untouched.
 */
export function formatSiTechnicalValue(raw: string): string {
  if (raw === null || raw === undefined) return '';
  let text = String(raw).trim();
  if (!text) return '';

  // Never touch a pure SKU / model code string
  if (!/\s/.test(text) && isLikelyPartCodeToken(text)) {
    return text;
  }

  // Protect embedded multi-hyphen part codes (e.g. 300P-8-1R2R-H-6-WH, AVAPHF-PN-05-60-E, TDWMP8-13-2.2) with placeholders
  const protectedTokens: string[] = [];
  text = text.replace(/\b[A-Za-z0-9]+(?:-[A-Za-z0-9.]+){1,}\b/g, (match) => {
    if (isLikelyPartCodeToken(match)) {
      const idx = protectedTokens.length;
      protectedTokens.push(match);
      return `__PARTCODE_${idx}__`;
    }
    return match;
  });

  // 1. Compound flow & surface area ratios first
  // e.g. 27.5m3/hr, 10 m3 / hr, 15 m³/hr -> 27.5 m³/h
  text = text.replace(
    /(\d+(?:\.\d+)?)\s*(?:m3|m³|cbm)\s*\/\s*(?:hr|hrs|h|hour)\b/gi,
    '$1 m³/h'
  );
  // e.g. 10 LPH, 15 l/hr, 20 L / hr -> 10 L/h
  text = text.replace(
    /(\d+(?:\.\d+)?)\s*(?:lph|l\s*\/\s*(?:hr|hrs|h|hour)|ltrs?\s*\/\s*(?:hr|hrs|h))\b/gi,
    '$1 L/h'
  );
  // e.g. 15 l/min, 20 LPM -> 15 L/min
  text = text.replace(
    /(\d+(?:\.\d+)?)\s*(?:lpm|l\s*\/\s*(?:min|mins)|ltrs?\s*\/\s*(?:min|mins))\b/gi,
    '$1 L/min'
  );
  // e.g. 1600 m2/m3, 1600 m²/m³ -> 1600 m²/m³
  text = text.replace(
    /(\d+(?:\.\d+)?)\s*(?:m2|m²)\s*\/\s*(?:m3|m³)\b/gi,
    '$1 m²/m³'
  );

  // 2. Compound packaging units (tight slash)
  // e.g. 10kg / Bag, 25 Kg / Bags, 22.68 Kg Bags, 50Kg/bag -> 10 kg/bag, 25 kg/bag, 22.68 kg/bag, 50 kg/bag
  text = text.replace(
    /(\d+(?:\.\d+)?)\s*(?:kgs?|kilograms?)\s*(?:\/\s*|\s+per\s+|\s+)(bag|bags|drum|drums|bucket|buckets|pail|pails|pack|packs|sack|sacks|box|boxes|carton|cartons)\b/gi,
    (_, num, container) => {
      const singular = String(container).toLowerCase().replace(/es$/, 'e').replace(/s$/, '');
      const cleanContainer = singular === 'boxe' ? 'box' : singular;
      return `${num} kg/${cleanContainer}`;
    }
  );
  text = text.replace(
    /(\d+(?:\.\d+)?)\s*(?:l|ltrs?|liters?|litres?)\s*(?:\/\s*|\s+per\s+|\s+)(drum|drums|can|cans|bucket|buckets|pail|pails|bottle|bottles|jerrycan|jerrycans)\b/gi,
    (_, num, container) => {
      const singular = String(container).toLowerCase().replace(/s$/, '');
      return `${num} L/${singular}`;
    }
  );
  text = text.replace(
    /(\d+(?:\.\d+)?)\s*(?:pcs|nos)\s*\/\s*(box|boxes|pack|packs|carton|cartons)\b/gi,
    (_, num, container) => {
      const s = String(container).toLowerCase().replace(/es$/, 'e').replace(/s$/, '');
      return `${num} pcs/${s === 'boxe' ? 'box' : s}`;
    }
  );
  text = text.replace(
    /(\d+(?:\.\d+)?)\s*bags?\s*\/\s*pallets?\b/gi,
    '$1 bags/pallet'
  );

  // 3. Tolerances: (± 0.1mm) or +/- 0.1mm -> (±0.1 mm)
  text = text.replace(
    /\(\s*(?:±|\+\/-)\s*(\d+(?:\.\d+)?)\s*([A-Za-zμµ°"']+)\s*\)/g,
    (full, num, unitRaw) => {
      const canon = resolveCanonicalUnitSymbol(unitRaw);
      if (!canon) return full;
      return `(±${formatNumberWithUnit(num, canon)})`;
    }
  );
  text = text.replace(
    /(?:±|\+\/-)\s*(\d+(?:\.\d+)?)\s*([A-Za-zμµ°]+)\b/g,
    (full, num, unitRaw) => {
      const canon = resolveCanonicalUnitSymbol(unitRaw);
      if (!canon) return full;
      return `±${formatNumberWithUnit(num, canon)}`;
    }
  );

  // 4. Dimensions with quotes or units:
  // e.g. 24"x72", 48" X 72", 42" x 72" -> 24" × 72", 48" × 72"
  text = text.replace(
    /(\d+(?:\.\d+)?)\s*(["”'])\s*[xX×]\s*(\d+(?:\.\d+)?)\s*(["”'])/g,
    (_, d1, q1, d2, q2) => `${d1}${q1 === '”' ? '"' : q1} × ${d2}${q2 === '”' ? '"' : q2}`
  );
  // 3D or 2D metric dimensions: 1200mm x 1800mm, 25 x 12 mm, 600 x 400 x 200 mm -> 1200 × 1800 mm, 25 × 12 mm
  text = text.replace(
    /\b(\d+(?:\.\d+)?)\s*(mm|cm|m)?\s*[xX×]\s*(\d+(?:\.\d+)?)\s*(mm|cm|m)?(?:\s*[xX×]\s*(\d+(?:\.\d+)?)\s*(mm|cm|m)?)?\b/gi,
    (full, n1, u1, n2, u2, n3, u3) => {
      const rawUnit = u3 || u2 || u1 || '';
      const canon = rawUnit ? resolveCanonicalUnitSymbol(rawUnit) : null;
      const dims = n3 ? `${n1} × ${n2} × ${n3}` : `${n1} × ${n2}`;
      if (canon) {
        return `${dims} ${canon}`;
      }
      // Only convert bare "24 x 72" when surrounded by spaces or end of string
      return dims;
    }
  );

  // 5. Numeric ranges with en-dash (–), matched decimal precision, and deduplicated unit
  // e.g. 2-3.5mm -> 2.0 – 3.5 mm, 0.4mm - 0.8mm -> 0.4 – 0.8 mm, 5-10mm -> 5 – 10 mm, 20 - 32 A -> 20 – 32 A
  text = text.replace(
    /(?<![A-Za-z0-9_-])(\d+(?:\.\d+)?)\s*([A-Za-zμµ°"']+)?\s*(?:-|–|—)\s*(\d+(?:\.\d+)?)\s*([A-Za-zμµ°"']+)\b/g,
    (full, n1, u1, n2, u2) => {
      const canon2 = resolveCanonicalUnitSymbol(u2);
      if (!canon2) return full;
      if (u1) {
        const canon1 = resolveCanonicalUnitSymbol(u1);
        if (!canon1 || canon1 !== canon2) return full;
      }
      const [fmt1, fmt2] = matchRangeDecimalPrecision(n1, n2);
      return `${fmt1} – ${formatNumberWithUnit(fmt2, canon2)}`;
    }
  );

  // 6. Temperature shorthand: 45C, 45°C, 45 °C, 45 deg C -> 45 °C
  text = text.replace(
    /(?<![A-Za-z0-9_-])(-?\d+(?:\.\d+)?)\s*(?:°\s*[cC]|deg\.?\s*[cC]|(?=[cC]\b)C)\b/g,
    '$1 °C'
  );

  // 7. Standalone number + SI unit spacing and casing
  // e.g. 10kg -> 10 kg, 10.5Bar -> 10.5 bar, 40L -> 40 L, 1.1mm -> 1.1 mm, 5microns -> 5 μm
  text = text.replace(
    /(?<![A-Za-z0-9_.-])(\d+(?:\.\d+)?)\s*(kgs?|kilograms?|gms?|grams?|mg|mm|cm|mtrs?|meters?|metres?|m2|m²|sqm|m3|m³|cbm|bars?|barg|mins?|secs?|hrs?|ppm|um|μm|µm|microns?|ltrs?|liters?|litres?|L|ml|mL|kpa|kPa|mpa|MPa|kw|kW|vac|vdc|amps?|ma|mA|hz|Hz|kn|kN|hp|HP|psig?|PSI|gpm|GPM|W|V|A|N)(?![A-Za-z0-9_/-])/gi,
    (full, num, unitRaw) => {
      // Do not turn "1Ph" or "3Ph" into anything else
      const canon = resolveCanonicalUnitSymbol(unitRaw);
      if (!canon) return full;
      return formatNumberWithUnit(num, canon);
    }
  );

  // 8. Tight inch, foot, and percent symbols: 60 " -> 60", 70 % -> 70%
  text = text.replace(/(\d+(?:\.\d+)?)\s+"/g, '$1"');
  text = text.replace(/(\d+(?:\.\d+)?)\s+%/g, '$1%');

  // Restore protected part codes
  if (protectedTokens.length > 0) {
    text = text.replace(/__PARTCODE_(\d+)__/g, (_, idxStr) => {
      return protectedTokens[Number(idxStr)] || '';
    });
  }

  return text.replace(/\s{2,}/g, ' ').trim();
}

/**
 * Standardizes Catalog Commercial Unit of Measure (UOM) to singular Title-Case matching SAS Manager dropdowns.
 */
export function normalizeCatalogUnit(uom?: string | null): string {
  const raw = String(uom || '').trim();
  if (!raw) return 'Nos';
  const cleaned = raw.replace(/\.+$/, '').trim();
  const lower = cleaned.toLowerCase();

  if (/^(nos|no|pcs|pc|piece|pieces|ea|each)$/i.test(lower)) return 'Nos';
  if (/^(set|sets|kit|kits)$/i.test(lower)) return 'Set';
  if (/^(bag|bags|sack|sacks)$/i.test(lower)) return 'Bag';
  if (/^(bucket|buckets|pail|pails)$/i.test(lower)) return 'Bucket';
  if (/^(drum|drums|barrel|barrels)$/i.test(lower)) return 'Drum';
  if (/^(kg|kgs|kilogram|kilograms)$/i.test(lower)) return 'Kg';
  if (/^(m3|m\^3|m³|cbm|cu\.?\s*m|cubic\s*met(?:er|re)s?)$/i.test(lower)) return 'm³';
  if (/^(m2|m\^2|m²|sqm|sq\.?\s*m|square\s*met(?:er|re)s?)$/i.test(lower)) return 'm²';
  if (/^(m|mtr|mtrs|meter|meters|metre|metres)$/i.test(lower)) return 'Mtr';
  if (/^(lot|lots|ls|lumpsum|lump\s*sum)$/i.test(lower)) return 'Lot';
  if (/^(roll|rolls)$/i.test(lower)) return 'Roll';
  if (/^(box|boxes)$/i.test(lower)) return 'Box';
  if (/^(pack|packs|pkt|pkts|package|packages)$/i.test(lower)) return 'Pack';
  if (/^(carton|cartons|ctn|ctns)$/i.test(lower)) return 'Carton';
  if (/^(pair|pairs|pr)$/i.test(lower)) return 'Pair';
  if (/^(unit|units)$/i.test(lower)) return 'Unit';
  if (/^(l|ltr|ltrs|liter|liters|litre|litres)$/i.test(lower)) return 'Ltr';

  return cleaned;
}

/**
 * Normalizes Lead Time / Availability phrases and filters out leaked quotation footer noise.
 */
export function normalizeLeadTime(leadTime?: string | null): string {
  const raw = String(leadTime || '').trim();
  if (!raw) return '';

  // Reject leaked quote-footer phrases
  if (
    /^(as\s+mentioned|refer\s+to|as\s+per\s+item|see\s+above|see\s+below|mentioned\s+against|tba|tbd|n\/a|-+)$/i.test(
      raw
    ) ||
    /as\s+mentioned\s+against/i.test(raw)
  ) {
    return '';
  }

  let s = raw.replace(/\s+/g, ' ');
  if (/^ex[\s-]*stock$/i.test(s)) return 'Ex-Stock';
  if (/^in[\s-]*stock$/i.test(s)) return 'Ex-Stock';

  // Normalize "8 - 10 weeks" -> "8-10 Weeks", "2-3 weeks ex-factory" -> "2-3 Weeks Ex-Factory"
  s = s.replace(/(\d+)\s*[-–—]\s*(\d+)\s*(weeks?|days?|months?)/gi, (_, d1, d2, unit) => {
    const uCap = unit.charAt(0).toUpperCase() + unit.slice(1).toLowerCase();
    return `${d1}-${d2} ${uCap}`;
  });
  s = s.replace(/\bex[\s-]*factory\b/gi, 'Ex-Factory');
  s = s.replace(/\bex[\s-]*works\b/gi, 'Ex-Works');
  s = s.replace(/\bex[\s-]*stock\b/gi, 'Ex-Stock');
  s = s.replace(/\bweeks\b/gi, 'Weeks');
  s = s.replace(/\bdays\b/gi, 'Days');

  return s.trim();
}

/**
 * Standardizes redundant technical specification attribute keys.
 * Maps Material/Material of Construction/Body Material/Construction Material -> MOC.
 * Never maps generic "Size" to "Grain Size" and preserves "Bulk Density" as "Bulk Density".
 */
export function normalizeSpecKey(rawKey?: string | null): string {
  const k = String(rawKey || '').trim();
  if (!k) return '';

  if (
    /^(moc|material|materials|material\s*of\s*construction|moc\s*of\s*.*|body\s*material|construction\s*material|housing\s*material|vessel\s*material|material\s*\/\s*grade)$/i.test(
      k
    )
  ) {
    return 'MOC';
  }
  if (
    /^(dimension|dimensions|dimension\s*\([^)]+\)|dimensions\s*\([^)]+\)|dimensions\s*\/\s*size|vessel\s*size|overall\s*dimensions)$/i.test(
      k
    )
  ) {
    return 'Dimensions';
  }
  if (/^(particle\s*size|granule\s*size|grain\s*size)$/i.test(k)) {
    return 'Grain Size';
  }
  if (/^effective\s*size$/i.test(k)) {
    return 'Effective Size';
  }
  if (/^bulk\s*density$/i.test(k)) {
    return 'Bulk Density';
  }
  if (
    /^(design\s*pressure|operating\s*pressure|working\s*pressure|max\.?\s*pressure|pressure\s*rating|max\.?\s*working\s*pressure)$/i.test(
      k
    )
  ) {
    return 'Design Pressure';
  }
  if (
    /^(design\s*temperature|operating\s*temperature|working\s*temperature|max\.?\s*temperature|temperature\s*rating|temp\.?\s*range)$/i.test(
      k
    )
  ) {
    return 'Operating Temperature';
  }
  if (/^(flow|flow\s*rate|rated\s*flow|service\s*flow\s*rate)$/i.test(k)) {
    return 'Flow Rate';
  }
  if (/^(capacity|volume|tank\s*capacity|capacity\s*\/\s*rating|net\s*volume)$/i.test(k)) {
    return 'Capacity';
  }
  if (/^(operation|control|valve\s*operation)$/i.test(k)) {
    return 'Operation';
  }
  if (/^(standard|certification|approval|connection\s*\/\s*standard)$/i.test(k)) {
    return 'Standard';
  }
  if (/^(pack\s*size|packing|packaging|unit\s*pack)$/i.test(k)) {
    return 'Packing';
  }
  if (/^(micron\s*rating|filtration\s*rating|pore\s*size|nominal\s*rating)$/i.test(k)) {
    return 'Micron Rating';
  }

  return k;
}

export interface DedicatedProductMetadataFields {
  brand_make?: string;
  model_part_no?: string;
  country_of_origin?: string;
  availability?: string;
  hs_code?: string;
}

export interface CleanedProductAttributesResult {
  attributes: ProductAttribute[];
  rescuedFields: DedicatedProductMetadataFields;
}

/**
 * Strips duplicate specs that belong in dedicated product metadata fields
 * (Brand/Make, Model/Part No, Country of Origin, Lead Time/Delivery/Availability, HS Code),
 * rescues their values if the dedicated fields are blank, normalizes spec keys via `normalizeSpecKey`,
 * formats spec values via `formatSiTechnicalValue`, and deduplicates case-insensitively.
 */
export function cleanProductAttributesWithRescuedFields(
  attributes: Array<{ key: string; value: string }> | undefined | null,
  dedicatedFields?: DedicatedProductMetadataFields
): CleanedProductAttributesResult {
  const rescuedFields: DedicatedProductMetadataFields = {
    brand_make: dedicatedFields?.brand_make?.trim() || undefined,
    model_part_no: dedicatedFields?.model_part_no?.trim() || undefined,
    country_of_origin: dedicatedFields?.country_of_origin?.trim() || undefined,
    availability: normalizeLeadTime(dedicatedFields?.availability) || undefined,
    hs_code: dedicatedFields?.hs_code?.trim() || undefined
  };

  const cleaned: ProductAttribute[] = [];
  const seenKeys = new Set<string>();

  for (const attr of attributes || []) {
    const rawKey = String(attr?.key || '').trim();
    const rawVal = String(attr?.value ?? '').trim();
    if (!rawKey) continue;

    // 1. Check if this attribute belongs in a dedicated product field
    if (/^(brand|make|manufacturer|brand\s*\/\s*make)$/i.test(rawKey)) {
      if (rawVal && !rescuedFields.brand_make) {
        rescuedFields.brand_make = rawVal;
      }
      continue;
    }
    if (/^(model|model\s*no\.?|part\s*no\.?|model\s*\/\s*part\s*no\.?|item\s*code|part\s*number)$/i.test(rawKey)) {
      if (rawVal && !rescuedFields.model_part_no) {
        rescuedFields.model_part_no = rawVal;
      }
      continue;
    }
    if (/^(country\s*of\s*origin|origin|coo|manufactured\s*in)$/i.test(rawKey)) {
      if (rawVal && !rescuedFields.country_of_origin) {
        rescuedFields.country_of_origin = rawVal;
      }
      continue;
    }
    if (/^(delivery|lead\s*time|lead\s*time\s*\/\s*delivery|delivery\s*period|availability|stock\s*status)$/i.test(rawKey)) {
      const normLead = normalizeLeadTime(rawVal);
      if (normLead && !rescuedFields.availability) {
        rescuedFields.availability = normLead;
      }
      continue;
    }
    if (/^(hs\s*code|tariff\s*code|customs\s*code)$/i.test(rawKey)) {
      if (rawVal && !rescuedFields.hs_code) {
        rescuedFields.hs_code = rawVal;
      }
      continue;
    }

    // 2. Canonicalize technical attribute key and SI-format the value
    const canonicalKey = normalizeSpecKey(rawKey);
    if (!canonicalKey) continue;
    const formattedVal = rawVal ? formatSiTechnicalValue(rawVal) : '';

    const normKey = canonicalKey.toLowerCase();
    if (seenKeys.has(normKey)) {
      // If existing slot was blank and new one has a value, fill it
      if (formattedVal) {
        const existingIdx = cleaned.findIndex((c) => c.key.toLowerCase() === normKey);
        if (existingIdx >= 0 && !cleaned[existingIdx].value) {
          cleaned[existingIdx] = { key: canonicalKey, value: formattedVal };
        }
      }
      continue;
    }

    seenKeys.add(normKey);
    cleaned.push({ key: canonicalKey, value: formattedVal });
  }

  return {
    attributes: cleaned,
    rescuedFields
  };
}

/**
 * Direct helper returning the cleaned, SI-formatted ProductAttribute array.
 */
export function cleanProductAttributes(
  attributes: Array<{ key: string; value: string }> | undefined | null,
  dedicatedFields?: DedicatedProductMetadataFields
): ProductAttribute[] {
  return cleanProductAttributesWithRescuedFields(attributes, dedicatedFields).attributes;
}
