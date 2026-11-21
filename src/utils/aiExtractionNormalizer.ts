import { LineItemComponent, ProductAttribute } from '../types';

/**
 * Pure deterministic post-extraction normalizer for AI RFQ / Proposal line items
 * and composite BOM sub-components.
 *
 * Enforces:
 * 1. Flow Rate vs. Volume key accuracy (LPS, L/s, LPH, LPM, m³/hr, GPM -> "Flow Rate")
 * 2. Per-item Lead Time routing & protection against generic global delivery phrases
 * 3. Dedicated core fields (Brand, Model, Origin, Lead Time) kept out of SPEC ATTRIBUTES
 * 4. Composite parent anti-bleed guard (no multi-vendor brand blends, no valve model bleed,
 *    no component-only spec bleed, no redundant synthesized narrative descriptions)
 * 5. Standards vs. Country of Origin guard ("Manufactured to USA ASME Standards" -> Standard: "USA ASME",
 *    never country_of_origin: "USA"; fixes "AMSE" -> "ASME")
 * 6. Structured sub-component parsing (brand/model/origin/attributes/description) & strict no-fabrication
 *    of placeholder remarks ("Standard", "N/A", "Included")
 */

export interface NormalizedExtractedLineItem {
  item_type?: 'product' | 'charge' | 'discount';
  charge_type?: string | null;
  product_type?: string | null;
  item_name: string;
  description: string;
  option_designation?: string;
  option?: string;
  quantity: number;
  unit: string;
  unit_price: number;
  unit_price_aed?: number;
  cost_price?: number;
  sku?: string;
  brand_make?: string;
  model_part_no?: string;
  country_of_origin?: string;
  hs_code?: string;
  lead_time_note: string;
  remarks?: string | null;
  is_composite_set?: boolean;
  sub_components?: LineItemComponent[];
  attributes: ProductAttribute[];
  image_url?: string;
  datasheet_attachment?: any;
  [key: string]: any;
}

export interface NormalizeLineItemsOptions {
  globalDeliveryPeriod?: string | null;
}

const GENERIC_GLOBAL_DELIVERY_PATTERNS: RegExp[] = [
  /^as\s+mentioned(\s+against\s+each\s+item|\s+above|\s+below|\s+in\s+(?:the\s+)?table)?\.?$/i,
  /^as\s+stated(\s+against\s+each\s+item|\s+above|\s+below|\s+per\s+item)?\.?$/i,
  /^as\s+specified(\s+against\s+each\s+item|\s+per\s+item|\s+above|\s+below)?\.?$/i,
  /^as\s+per\s+(?:each\s+)?item\.?$/i,
  /^per\s+item\.?$/i,
  /^mentioned\s+against\s+(?:each\s+)?item\.?$/i,
  /^refer\s+(?:to\s+)?(?:each\s+item|table|above|below|line\s+items?)\.?$/i,
  /^see\s+(?:each\s+item|table|above|below|line\s+items?|commercial\s+table)\.?$/i,
  /^varies\s+(?:by|per)\s+item\.?$/i,
  /^(?:tba|tbd|n\/a|na|none|nil|-+|—+)$/i,
  /^ex-stock\s*\/\s*standard$/i,
  /^standard$/i
];

/**
 * Returns true if a delivery/lead-time string is a generic pointer phrase
 * (e.g. "As mentioned against each item", "As per item", "See table") rather than
 * a concrete delivery lead time.
 */
export function isGenericGlobalDeliveryPhrase(value?: string | null): boolean {
  const s = String(value || '').trim();
  if (!s) return true;
  if (GENERIC_GLOBAL_DELIVERY_PATTERNS.some((rx) => rx.test(s))) return true;
  if (/\bas\s+mentioned\s+against\s+(?:each\s+)?item\b/i.test(s)) return true;
  if (/\bas\s+per\s+(?:each\s+)?(?:line\s+)?item\b/i.test(s)) return true;
  return false;
}

/**
 * Detects flow-rate values using explicit flow units (LPS, L/s, LPH, LPM, m³/hr, m3/hr,
 * m³/day, GPM, USGPM, etc.) while avoiding false positives on static volumes (500 Ltrs, 350 L, 10 m³).
 */
export function isFlowRateValue(value?: string | null): boolean {
  const s = String(value || '').trim();
  if (!s) return false;
  return (
    /\b\d+(?:\.\d+)?\s*(?:lps|l\/s|l\/sec|lit(?:er|re)s?\/s(?:ec)?|lph|l\/h|l\/hr|l\/hrs|lit(?:er|re)s?\/h(?:r|our)?|lpm|l\/m|l\/min|lit(?:er|re)s?\/min|usgpm|igpm|gpm|gph|gpd|mld|cfm)\b/i.test(
      s
    ) ||
    /\b\d+(?:\.\d+)?\s*(?:m3|m³|cbm)\s*\/\s*(?:h|hr|hrs|hour|hours|d|day|days|min|sec|s)\b/i.test(
      s
    )
  );
}

/**
 * Fixes common engineering OCR typos (e.g. "AMSE" -> "ASME") without corrupting other text.
 */
export function fixEngineeringTypos(text?: string | null): string {
  const s = String(text || '');
  if (!s) return '';
  return s.replace(/\bAMSE\b/gi, (m) => (m === m.toLowerCase() ? 'asme' : 'ASME'));
}

/**
 * Normalizes technical standard values:
 * - Fixes "AMSE" -> "ASME"
 * - Strips verbose wrapper phrases ("Manufactured to USA ASME Standards" -> "USA ASME")
 * - Cleans redundant trailing "Standards" after standard codes ("USA ASME Standards" -> "USA ASME")
 */
export function normalizeTechnicalStandardValue(value?: string | null): string {
  let s = fixEngineeringTypos(String(value || '')).trim();
  if (!s) return '';
  s = s.replace(/^(?:manufactured|made|built|designed|tested|certified)\s+(?:to|per|as\s+per|according\s+to|in\s+accordance\s+with)\s+/i, '');
  s = s.replace(/\b(USA\s+ASME|ASME|ASTM|ANSI|NSF|DIN|ISO|AWWA|BS|EN|UL|CE)\s+standards?\b/gi, '$1');
  s = s.replace(/\s{2,}/g, ' ').replace(/[.,;:\s]+$/, '').trim();
  return s;
}

/**
 * Detects whether a string placed in country_of_origin is actually a technical standard
 * (e.g. "USA ASME", "USA ASME Standards", "Manufactured to USA ASME Standards", "ASME").
 */
export function isStandardCodeNotOrigin(value?: string | null): boolean {
  const s = fixEngineeringTypos(String(value || '')).trim();
  if (!s) return false;
  return (
    /\b(?:ASME|ASTM|ANSI|NSF|DIN|ISO\s*\d*|AWWA|BS\s*\d*|EN\s*\d*)\b/i.test(s) ||
    /\b(?:manufactured|made|built|designed)\s+to\b/i.test(s) ||
    /\bstandards?\b/i.test(s)
  );
}

/**
 * Extracts a clean technical standard token (e.g. "USA ASME") from freeform text when present.
 */
export function extractStandardFromText(text?: string | null): string {
  const s = fixEngineeringTypos(String(text || '')).trim();
  if (!s) return '';
  const usaAsmeMatch = s.match(
    /(?:(?:manufactured|made|built|designed)\s+to\s+)?(USA\s+ASME(?:\s+Standards?)?)/i
  );
  if (usaAsmeMatch?.[1]) {
    return normalizeTechnicalStandardValue(usaAsmeMatch[1]);
  }
  const asmeMatch = s.match(
    /(?:(?:manufactured|made|built|designed)\s+to\s+)(ASME(?:\s+Sec(?:tion)?\.?\s*[A-Z0-9]+)?(?:\s+Standards?)?)/i
  );
  if (asmeMatch?.[1]) {
    return normalizeTechnicalStandardValue(asmeMatch[1]);
  }
  return '';
}

/**
 * Detects fabricated placeholder remarks/highlights on sub-components that carry zero source info.
 */
export function isPlaceholderSubRemark(value?: string | null): boolean {
  const s = String(value || '').trim();
  if (!s) return true;
  return /^(?:standard|standard\s+(?:accessory|item|component|inclusion|supply|kit|spec|specification|unit|part|model|fit|fitting)|as\s+standard|included|included\s+(?:accessory|item|in\s+set|with\s+package|in\s+package|as\s+standard)|n\/a|na|none|nil|null|tba|tbd|-+|—+|\.)$/i.test(
    s
  );
}

export type DedicatedCoreFieldName =
  | 'brand_make'
  | 'model_part_no'
  | 'country_of_origin'
  | 'lead_time_note'
  | 'hs_code';

/**
 * Identifies whether an attribute key belongs in a dedicated core product/item field
 * rather than inside SPEC ATTRIBUTES.
 */
export function getDedicatedCoreFieldKey(rawKey?: string | null): DedicatedCoreFieldName | null {
  const k = String(rawKey || '').trim().toLowerCase();
  if (!k) return null;

  if (/^(?:brand|make|manufacturer|brand\s*\/\s*make|make\s*\/\s*brand|brand\s+name)$/.test(k)) {
    return 'brand_make';
  }
  if (
    /^(?:model|model\s*no\.?|model\s*number|model\s*\/\s*part\s*no\.?|part\s*no\.?|part\s*number|model\s*code|item\s*code)$/.test(
      k
    )
  ) {
    return 'model_part_no';
  }
  if (/^(?:origin|country\s*of\s*origin|coo|made\s*in|manufactured\s*in|country)$/.test(k)) {
    return 'country_of_origin';
  }
  if (
    /^(?:lead\s*time|lead\s*time\s*\/\s*delivery|delivery|delivery\s*period|delivery\s*time|delivery\s*lead\s*time|availability|stock\s*status|stock\s*availability)$/.test(
      k
    )
  ) {
    return 'lead_time_note';
  }
  if (/^(?:hs\s*code|tariff\s*code|customs\s*code)$/.test(k)) {
    return 'hs_code';
  }
  return null;
}

const CANONICAL_LINE_ITEM_ATTR_KEYS: Record<string, string> = {
  'flow': 'Flow Rate',
  'flow rate': 'Flow Rate',
  'design flow': 'Flow Rate',
  'design flow rate': 'Flow Rate',
  'service flow': 'Flow Rate',
  'service flow rate': 'Flow Rate',
  'rated flow': 'Flow Rate',
  'rated flow rate': 'Flow Rate',
  'operating flow': 'Flow Rate',
  'operating flow rate': 'Flow Rate',
  'system flow': 'Flow Rate',
  'system flow rate': 'Flow Rate',
  'peak flow': 'Flow Rate',
  'backwash flow': 'Flow Rate',
  'opening': 'Top/Bottom Opening',
  'openings': 'Top/Bottom Opening',
  'top/bottom opening': 'Top/Bottom Opening',
  'top & bottom opening': 'Top/Bottom Opening',
  'design pressure': 'Design Pressure',
  'working pressure': 'Design Pressure',
  'operating pressure': 'Operating Pressure',
  'max pressure': 'Design Pressure',
  'max. pressure': 'Design Pressure',
  'pressure': 'Design Pressure',
  'pressure rating': 'Design Pressure',
  'standard': 'Standard',
  'standards': 'Standard',
  'design standard': 'Standard',
  'manufacturing standard': 'Standard',
  'dimensions': 'Dimensions',
  'dimension': 'Dimensions',
  'size': 'Dimensions',
  'tank size': 'Dimensions',
  'vessel size': 'Dimensions',
  'in/out size': 'In/Out Size',
  'inlet/outlet size': 'In/Out Size',
  'inlet / outlet': 'In/Out Size',
  'port size': 'In/Out Size',
  'connection size': 'In/Out Size',
  'installation': 'Installation',
  'mounting': 'Installation',
  'operation': 'Operation',
  'application': 'Application',
  'arrangement': 'Arrangement',
  'configuration': 'Arrangement',
  'moc': 'MOC',
  'material': 'MOC',
  'material of construction': 'MOC',
  'body material': 'MOC',
  'vessel material': 'MOC',
  'volume': 'Volume',
  'resin volume': 'Resin Volume',
  'tank volume': 'Volume',
  'storage volume': 'Volume',
  'capacity': 'Capacity',
  'tank capacity': 'Capacity',
  'storage capacity': 'Capacity',
  'exchange capacity': 'Exchange Capacity'
};

/**
 * Value-aware attribute key canonicalizer.
 * Guarantees that any value in flow-rate units (LPS, L/s, LPH, LPM, m³/hr, GPM, etc.)
 * under keys like "Volume", "Capacity", "Flow", or "Rating" is ALWAYS mapped to "Flow Rate".
 */
export function normalizeLineItemAttributeKey(rawKey: string, rawValue?: string): string {
  const trimmed = String(rawKey || '').trim();
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase().replace(/\s+/g, ' ');

  // 1. Value-aware Flow Rate override: flow-rate units must NEVER be labeled Volume or Capacity
  if (
    rawValue &&
    isFlowRateValue(rawValue) &&
    /^(?:volume|capacity|flow|flow\s*rate|design\s*flow(?:\s*rate)?|service\s*flow(?:\s*rate)?|rated\s*flow(?:\s*rate)?|operating\s*flow(?:\s*rate)?|system\s*flow(?:\s*rate)?|throughput|output|duty|rating|capacity\s*\/\s*flow|flow\s*\/\s*capacity)$/.test(
      lower
    )
  ) {
    return 'Flow Rate';
  }

  // 2. Canonical lookup
  if (CANONICAL_LINE_ITEM_ATTR_KEYS[lower]) {
    return CANONICAL_LINE_ITEM_ATTR_KEYS[lower];
  }

  return trimmed;
}

function cleanAttributeValue(key: string, rawVal: string): string {
  let val = fixEngineeringTypos(String(rawVal || ''))
    .replace(/^[•▪▸\-*]\s*/, '')
    .trim();
  if (!val) return '';
  if (key.toLowerCase() === 'standard') {
    val = normalizeTechnicalStandardValue(val);
  }
  return val;
}

function normalizeOriginValue(rawOrigin?: string | null): string {
  const cleaned = fixEngineeringTypos(String(rawOrigin || ''))
    .replace(/^\((.+)\)$/, '$1')
    .replace(/^(?:origin|made\s+in|country\s+of\s+origin)\s*[:=-]?\s*/i, '')
    .trim();
  if (!cleaned) return '';
  if (/^(?:n\/a|na|none|nil|tba|tbd|standard|-+|—+)$/i.test(cleaned)) return '';
  return cleaned;
}

function hasExplicitUsaOriginText(text: string): boolean {
  if (!text) return false;
  return (
    /(?:country\s+of\s+origin|origin|coo)\s*[:(\s-]+\s*(?:u\.?s\.?a\.?|united\s+states)\b/i.test(text) ||
    /\bmade\s+in\s+(?:the\s+)?(?:u\.?s\.?a\.?|united\s+states)\b/i.test(text) ||
    /\(\s*u\.?s\.?a\.?\s*\)/i.test(text)
  );
}

function isUsaOriginToken(origin?: string | null): boolean {
  const s = String(origin || '').trim().toLowerCase();
  return s === 'usa' || s === 'u.s.a.' || s === 'u.s.a' || s === 'us' || s === 'united states';
}

function upsertAttr(attrs: ProductAttribute[], key: string, value: string): void {
  const cleanKey = normalizeLineItemAttributeKey(key, value);
  const cleanVal = cleanAttributeValue(cleanKey, value);
  if (!cleanKey || !cleanVal) return;
  const idx = attrs.findIndex((a) => a.key.toLowerCase() === cleanKey.toLowerCase());
  if (idx === -1) {
    attrs.push({ key: cleanKey, value: cleanVal });
  } else if (!attrs[idx].value) {
    attrs[idx] = { key: cleanKey, value: cleanVal };
  }
}

/**
 * Checks whether a text line looks like a multi-layer media / composition breakdown
 * that should stay in sub-component `description` rather than be forced into KV pills.
 */
function isMediaCompositionLine(line: string): boolean {
  const s = line.trim();
  if (!s) return false;
  return (
    /\b(?:anthracite|silica\s*sand|gravel|pebbles?|garnet|activated\s*carbon|cation\s*resin|anion\s*resin|media\s*layer|supporting\s*bed|coarse\s*gravel|fine\s*sand)\b/i.test(
      s
    ) &&
    (/\b\d+(?:\.\d+)?\s*(?:kg|kgs|bags?|ltrs?|lit(?:er|re)s?|mm|mesh)\b/i.test(s) ||
      /\d+\s*[x×]\s*\d+/i.test(s))
  );
}

interface ParsedInlineMav {
  item_name: string;
  quantity: number;
  unit: string;
}

/**
 * Detects an embedded MAV / Motorized Alternating Valve mention with explicit quantity
 * (e.g. "MAV: 1 No.", "Motorized Alternating Valve (MAV) - 1 No.") inside a sub-item's
 * remark/highlight text when the LLM forgot to split it into its own hardware sub-component.
 */
function extractEmbeddedMavFromSegment(segment: string): ParsedInlineMav | null {
  const s = segment.trim();
  if (!s) return null;
  const mavMatch = s.match(
    /^(?:incl(?:uding|\.)?\s+|with\s+)?(?:(MAV(?:\s*\([^)]+\))?|Motorized\s+Alternating\s+Valve(?:\s*\(MAV\))?)\s*[:=-]\s*(\d+)\s*(Nos?\.?|Sets?|Pcs\.?|Units?)?|(\d+)\s*[x×]\s*(MAV(?:\s*\([^)]+\))?|Motorized\s+Alternating\s+Valve(?:\s*\(MAV\))?))$/i
  );
  if (!mavMatch) return null;
  const qty = Number(mavMatch[2] || mavMatch[4] || 1) || 1;
  const rawLabel = (mavMatch[1] || mavMatch[5] || '').trim();
  const unitRaw = (mavMatch[3] || 'Nos').trim();
  const unit = /^sets?$/i.test(unitRaw) ? 'Set' : 'Nos';
  const itemName = /^mav$/i.test(rawLabel)
    ? 'Motorized Alternating Valve (MAV)'
    : rawLabel;
  return { item_name: itemName, quantity: qty, unit };
}

/**
 * Strips an inline trailing/comma-delimited MAV mention (e.g. "..., MAV: 1 No." or "with MAV: 1 No.")
 * from a longer text segment and returns both the remaining text and the extracted MAV descriptor.
 */
function stripInlineMavFromText(text: string): { remaining: string; mav: ParsedInlineMav | null } {
  const s = text.trim();
  if (!s || !/\b(?:mav|motorized\s+alternating\s+valve)\b/i.test(s)) {
    return { remaining: s, mav: null };
  }
  const exact = extractEmbeddedMavFromSegment(s);
  if (exact) return { remaining: '', mav: exact };

  const inlineRx =
    /(?:[,;|]\s*|\s+(?:and|with|incl(?:uding|\.)?)\s+)(?:(MAV(?:\s*\([^)]+\))?|Motorized\s+Alternating\s+Valve(?:\s*\(MAV\))?)\s*[:=-]\s*(\d+)\s*(Nos?\.?|Sets?|Pcs\.?|Units?)|(\d+)\s*[x×]\s*(MAV(?:\s*\([^)]+\))?|Motorized\s+Alternating\s+Valve(?:\s*\(MAV\))?))/i;
  const m = s.match(inlineRx);
  if (!m) return { remaining: s, mav: null };

  const qty = Number(m[2] || m[4] || 1) || 1;
  const rawLabel = (m[1] || m[5] || '').trim();
  const unitRaw = (m[3] || 'Nos').trim();
  const unit = /^sets?$/i.test(unitRaw) ? 'Set' : 'Nos';
  const itemName = /^mav$/i.test(rawLabel)
    ? 'Motorized Alternating Valve (MAV)'
    : rawLabel;
  const remaining = s.replace(inlineRx, '').replace(/[,;|\s]+$/, '').trim();
  return { remaining, mav: { item_name: itemName, quantity: qty, unit } };
}

export interface ParsedSubComponentResult {
  component: LineItemComponent;
  extractedSiblings: LineItemComponent[];
}

/**
 * Normalizes a single raw AI sub-component into a clean, structured `LineItemComponent`.
 * - Preserves structured `brand_make`, `model_part_no`, `country_of_origin`, `attributes`, `description`, `remark`.
 * - Parses pipe/semicolon-separated `Key: Value` blobs out of legacy `technical_Highlight` / `remark` / `scope_note`.
 * - Strips fabricated placeholder remarks ("Standard", "N/A", "Included").
 * - Enforces Flow Rate vs Volume and ASME-Standard vs USA-Origin hygiene.
 */
export function parseStructuredSubComponent(
  rawSub: any,
  index: number
): ParsedSubComponentResult {
  const itemName = fixEngineeringTypos(String(rawSub?.item_name || rawSub?.name || '').trim());
  const qty = Number(rawSub?.quantity) > 0 ? Number(rawSub.quantity) : 1;
  const unit = String(rawSub?.unit || rawSub?.uom || 'Nos').trim() || 'Nos';
  const unitPrice = Number(rawSub?.unit_price) || 0;
  const costPrice = Number(rawSub?.cost_price) || 0;

  let brandMake = String(rawSub?.brand_make || rawSub?.brand || rawSub?.make || '').trim();
  let modelPartNo = String(rawSub?.model_part_no || rawSub?.model || '').trim();
  let countryOfOrigin = normalizeOriginValue(rawSub?.country_of_origin || rawSub?.origin || '');
  const attrs: ProductAttribute[] = [];
  const descLines: string[] = [];
  const genuineRemarkParts: string[] = [];
  const extractedSiblings: LineItemComponent[] = [];

  // Raw narrative provenance text used to distinguish explicit "Origin: USA" from "USA ASME Standards"
  // Intentionally excludes structured `attributes` so an AI-hallucinated { key: "Origin", value: "USA" }
  // alongside "USA ASME Standards" does not falsely pass as explicit narrative origin.
  const rawProvenanceText = [
    itemName,
    rawSub?.brand_make,
    rawSub?.description,
    rawSub?.scope_note,
    rawSub?.remark,
    rawSub?.technical_Highlight
  ]
    .filter(Boolean)
    .join(' | ');

  // 1. Check if raw country_of_origin is actually a Standard (e.g. "USA ASME Standards")
  if (countryOfOrigin && isStandardCodeNotOrigin(countryOfOrigin)) {
    const std = normalizeTechnicalStandardValue(countryOfOrigin);
    if (std) upsertAttr(attrs, 'Standard', std);
    countryOfOrigin = '';
  }

  // 2. Check if brand_make contains inline origin like "Clack (USA)"
  if (brandMake) {
    const brandOriginMatch = brandMake.match(/^(.+?)\s*\(\s*([A-Za-z.\s]{2,24})\s*\)$/);
    if (brandOriginMatch) {
      const parenToken = brandOriginMatch[2].trim();
      if (!isStandardCodeNotOrigin(parenToken) && /^(?:usa|u\.s\.a\.?|uk|germany|italy|china|india|uae|france|spain|taiwan|japan|korea|europe|eu)$/i.test(parenToken)) {
        brandMake = brandOriginMatch[1].trim();
        if (!countryOfOrigin) {
          countryOfOrigin = parenToken.toUpperCase() === 'USA' || parenToken.toLowerCase() === 'u.s.a.' ? 'USA' : parenToken;
        }
      }
    }
  }

  // 3. Process structured rawSub.attributes
  if (Array.isArray(rawSub?.attributes)) {
    for (const attr of rawSub.attributes) {
      const k = String(attr?.key || '').trim();
      const v = fixEngineeringTypos(String(attr?.value ?? '').replace(/^[•▪▸\-*]\s*/, '').trim());
      if (!k || !v) continue;

      const dedicated = getDedicatedCoreFieldKey(k);
      if (dedicated === 'brand_make') {
        if (!brandMake) brandMake = v;
        continue;
      }
      if (dedicated === 'model_part_no') {
        if (!modelPartNo) modelPartNo = v;
        continue;
      }
      if (dedicated === 'country_of_origin') {
        if (isStandardCodeNotOrigin(v)) {
          upsertAttr(attrs, 'Standard', v);
        } else if (!countryOfOrigin) {
          countryOfOrigin = normalizeOriginValue(v);
        }
        continue;
      }
      if (dedicated === 'lead_time_note' || dedicated === 'hs_code') {
        continue;
      }
      upsertAttr(attrs, k, v);
    }
  }

  // 4. Process rawSub.description & rawSub.scope_note (multi-line composition vs KV)
  const rawDescSource = [rawSub?.description, rawSub?.scope_note]
    .map((x) => fixEngineeringTypos(String(x || '')).trim())
    .filter(Boolean)
    .join('\n');

  if (rawDescSource) {
    const lines = rawDescSource.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      if (isPlaceholderSubRemark(line)) continue;
      if (isMediaCompositionLine(line)) {
        descLines.push(line);
        continue;
      }
      const embeddedMav = extractEmbeddedMavFromSegment(line);
      if (embeddedMav) {
        extractedSiblings.push({
          id: `sub_${Date.now()}_${index + 1}_mav_${extractedSiblings.length + 1}`,
          sn: '',
          item_name: embeddedMav.item_name,
          remark: '',
          quantity: embeddedMav.quantity,
          unit: embeddedMav.unit,
          cost_price: 0,
          unit_price: 0,
          total_price: 0,
          line_total: 0,
          is_included_accessory: true
        });
        continue;
      }
      // Check if line is purely pipe/semicolon-separated KV specs
      const segs = line.split(/\s*[|;]\s*/).map((s) => s.trim()).filter(Boolean);
      const allSimpleKv =
        segs.length > 0 &&
        segs.every((seg) => {
          if (extractStandardFromText(seg)) return true;
          const m = seg.match(/^([A-Za-z][A-Za-z0-9 /.&()-]{1,28})\s*[:=]\s*(.+)$/);
          return Boolean(m && !isMediaCompositionLine(seg));
        });
      if (allSimpleKv) {
        for (const seg of segs) {
          const kv = seg.match(/^([A-Za-z][A-Za-z0-9 /.&()-]{1,28})\s*[:=]\s*(.+)$/);
          if (kv) {
            const k = kv[1].trim();
            const v = kv[2].trim();
            const dedicated = getDedicatedCoreFieldKey(k);
            if (dedicated === 'brand_make') {
              if (!brandMake) brandMake = v;
            } else if (dedicated === 'model_part_no') {
              if (!modelPartNo) modelPartNo = v;
            } else if (dedicated === 'country_of_origin') {
              if (isStandardCodeNotOrigin(v)) {
                upsertAttr(attrs, 'Standard', v);
              } else if (!countryOfOrigin) {
                countryOfOrigin = normalizeOriginValue(v);
              }
            } else if (!dedicated) {
              upsertAttr(attrs, k, v);
            }
          } else {
            const std = extractStandardFromText(seg);
            if (std) upsertAttr(attrs, 'Standard', std);
          }
        }
      } else {
        descLines.push(line);
      }
    }
  }

  // 5. Process legacy technical_Highlight / remark fields
  const rawHighlightSources = [rawSub?.remark, rawSub?.technical_Highlight]
    .map((x) => fixEngineeringTypos(String(x || '')).trim())
    .filter(Boolean);
  const uniqueHighlightSources = Array.from(new Set(rawHighlightSources));

  for (const sourceStr of uniqueHighlightSources) {
    if (isPlaceholderSubRemark(sourceStr)) continue;

    // Split on newlines, pipes, or semicolons
    const lines = sourceStr.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      if (isPlaceholderSubRemark(line)) continue;
      if (isMediaCompositionLine(line)) {
        if (!descLines.includes(line)) descLines.push(line);
        continue;
      }

      const segments = line.split(/\s*[|;]\s*/).map((s) => s.trim()).filter(Boolean);
      for (let seg of segments) {
        if (isPlaceholderSubRemark(seg)) continue;

        if (isMediaCompositionLine(seg)) {
          if (!descLines.includes(seg)) descLines.push(seg);
          continue;
        }

        const inlineMavCheck = stripInlineMavFromText(seg);
        if (inlineMavCheck.mav) {
          extractedSiblings.push({
            id: `sub_${Date.now()}_${index + 1}_mav_${extractedSiblings.length + 1}`,
            sn: '',
            item_name: inlineMavCheck.mav.item_name,
            remark: '',
            quantity: inlineMavCheck.mav.quantity,
            unit: inlineMavCheck.mav.unit,
            cost_price: 0,
            unit_price: 0,
            total_price: 0,
            line_total: 0,
            is_included_accessory: true
          });
          if (!inlineMavCheck.remaining || isPlaceholderSubRemark(inlineMavCheck.remaining)) {
            continue;
          }
          seg = inlineMavCheck.remaining;
        }

        const kv = seg.match(/^([A-Za-z][A-Za-z0-9 /.&()-]{1,28})\s*[:=]\s*(.+)$/);
        if (kv) {
          const k = kv[1].trim();
          const v = kv[2].trim();
          const dedicated = getDedicatedCoreFieldKey(k);
          if (dedicated === 'brand_make') {
            if (!brandMake) brandMake = v;
            continue;
          }
          if (dedicated === 'model_part_no') {
            if (!modelPartNo) modelPartNo = v;
            continue;
          }
          if (dedicated === 'country_of_origin') {
            if (isStandardCodeNotOrigin(v)) {
              upsertAttr(attrs, 'Standard', v);
            } else if (!countryOfOrigin) {
              countryOfOrigin = normalizeOriginValue(v);
            }
            continue;
          }
          if (dedicated === 'lead_time_note' || dedicated === 'hs_code') {
            continue;
          }
          upsertAttr(attrs, k, v);
          continue;
        }

        // Check for standalone "Manufactured to USA ASME Standards" / "Made to USA AMSE Standards"
        const std = extractStandardFromText(seg);
        if (std) {
          upsertAttr(attrs, 'Standard', std);
          continue;
        }

        // Check for standalone "Origin (China)" or "Origin (USA)"
        const parenOrigin = seg.match(/^origin\s*\(\s*([^)]+)\s*\)$/i);
        if (parenOrigin?.[1]) {
          const parsedOrig = normalizeOriginValue(parenOrigin[1]);
          if (parsedOrig && !isStandardCodeNotOrigin(parsedOrig) && !countryOfOrigin) {
            countryOfOrigin = parsedOrig;
          }
          continue;
        }

        // Otherwise keep as a genuine non-KV remark (avoid duplicating description or item name)
        if (
          seg.toLowerCase() !== itemName.toLowerCase() &&
          !genuineRemarkParts.some((p) => p.toLowerCase() === seg.toLowerCase())
        ) {
          genuineRemarkParts.push(seg);
        }
      }
    }
  }

  // 6. Guard against inventing country_of_origin: "USA" solely from "USA ASME Standards"
  const hasUsaAsmeStandard =
    attrs.some((a) => a.key.toLowerCase() === 'standard' && /\busa\s+asme\b/i.test(a.value)) ||
    /\busa\s+asme\b/i.test(fixEngineeringTypos(rawProvenanceText));

  if (
    isUsaOriginToken(countryOfOrigin) &&
    hasUsaAsmeStandard &&
    !hasExplicitUsaOriginText(rawProvenanceText)
  ) {
    countryOfOrigin = '';
  }

  // If brandMake still had "(USA)" and we extracted it or if it's empty
  const cleanDescription = descLines.join('\n').trim();
  const cleanRemark = genuineRemarkParts.join(' | ').trim();
  const finalRemark = isPlaceholderSubRemark(cleanRemark) ? '' : cleanRemark;

  const component: LineItemComponent = {
    id: rawSub?.id || `sub_${Date.now()}_${index + 1}`,
    sn: String(index + 1),
    item_name: itemName,
    remark: finalRemark,
    ...(cleanDescription ? { description: cleanDescription } : {}),
    quantity: qty,
    unit,
    cost_price: costPrice,
    unit_price: unitPrice,
    total_price: Number((qty * unitPrice).toFixed(2)),
    line_total: Number((qty * unitPrice).toFixed(2)),
    is_included_accessory:
      rawSub?.is_included_accessory !== undefined
        ? Boolean(rawSub.is_included_accessory)
        : unitPrice <= 0,
    ...(rawSub?.product_id ? { product_id: rawSub.product_id } : {}),
    ...(rawSub?.sku ? { sku: rawSub.sku } : {}),
    ...(brandMake ? { brand_make: brandMake } : {}),
    ...(modelPartNo ? { model_part_no: modelPartNo } : {}),
    ...(countryOfOrigin ? { country_of_origin: countryOfOrigin } : {}),
    ...(attrs.length > 0 ? { attributes: attrs, show_attributes: true } : {})
  };

  return { component, extractedSiblings };
}

/**
 * Detects whether a brand string is a multi-vendor composite blend
 * (e.g. "AVENTURA / AQUAFIL / Clack (USA)", "Aventura, Clack & Pentair").
 */
function isBlendedMultiVendorBrand(brand: string, subBrands: string[]): boolean {
  const s = brand.trim();
  if (!s) return false;
  const parts = s
    .split(/\s*(?:\/|,|&|\+|;)\s*/)
    .map((p) => p.replace(/\([^)]*\)/g, '').trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    // Two or more distinct vendor tokens combined with separators
    return true;
  }
  const uniqueSubBrands = Array.from(
    new Set(subBrands.map((b) => b.trim().toLowerCase()).filter(Boolean))
  );
  if (uniqueSubBrands.length >= 2) {
    // Composite system has multiple distinct sub-component brands; don't bleed one vendor onto the parent
    const lower = s.replace(/\([^)]*\)/g, '').trim().toLowerCase();
    if (uniqueSubBrands.includes(lower)) return true;
  }
  return false;
}

/**
 * Detects whether a parent model string was bled up from a sub-component
 * (e.g. "WS3 (Multiport Valve)", "WS3", "WS2EI").
 */
function isSubComponentBledModel(parentModel: string, subComponents: LineItemComponent[]): boolean {
  const pm = parentModel.trim();
  if (!pm) return false;
  if (/\((?:multiport\s+valve|control\s+valve|valve|vessel|tank|media|pump|meter)\)/i.test(pm)) {
    return true;
  }
  const pmClean = pm.replace(/\([^)]*\)/g, '').trim().toLowerCase();
  if (!pmClean) return false;
  return subComponents.some((sub) => {
    const sm = String(sub.model_part_no || '').trim().toLowerCase();
    if (!sm) return false;
    return sm === pmClean || pmClean.includes(sm) || sm.includes(pmClean);
  });
}

const SYSTEM_LEVEL_COMPOSITE_KEYS = new Set([
  'flow rate',
  'arrangement',
  'configuration',
  'system type',
  'design pressure',
  'operating pressure',
  'operating temperature',
  'power supply',
  'electrical supply',
  'control',
  'duty',
  'regeneration',
  'cycle capacity',
  'output',
  'feed water',
  'treated water'
]);

const COMPONENT_ONLY_KEYS_ON_COMPOSITE = new Set([
  'in/out size',
  'installation',
  'mounting',
  'application',
  'top/bottom opening',
  'grain size',
  'bulk density',
  'packing',
  'valve size',
  'valve model',
  'vessel size',
  'tank size',
  'dimensions'
]);

/**
 * Detects whether a parent description on a composite set is just a redundant AI-synthesized
 * narrative summary repeating the item title, attributes, or sub-component list.
 */
function isRedundantCompositeNarrativeDescription(
  desc: string,
  itemName: string,
  subComponents: LineItemComponent[]
): boolean {
  const d = desc.trim();
  if (!d) return true;
  const dLower = d.toLowerCase();
  const nameLower = itemName.trim().toLowerCase();

  // Exact or near-exact repeat of item name
  if (nameLower && (dLower === nameLower || dLower.startsWith(nameLower) && dLower.length <= nameLower.length + 25)) {
    return true;
  }

  // Typical AI summary openers for composite packages
  if (
    /^(?:complete|automatic|duplex|simplex|triplex|skid[- ]mounted|packaged|supply\s+of|complete\s+supply\s+of)\b.*\b(?:consisting\s+of|comprising|including|complete\s+with|equipped\s+with|supplied\s+with|with\s+frp|with\s+clack|with\s+multiport|system\s+with)\b/i.test(
      d
    )
  ) {
    return true;
  }

  // Mentions 2+ sub-component names or brands/models already structured in sub_components
  let subMentions = 0;
  for (const sub of subComponents) {
    const tokens = [sub.item_name, sub.brand_make, sub.model_part_no]
      .map((t) => String(t || '').trim().toLowerCase())
      .filter((t) => t.length >= 3);
    if (tokens.some((tok) => dLower.includes(tok))) {
      subMentions++;
    }
  }
  if (subMentions >= 2) return true;

  // Bullet list of "1 x ...", "2 x ..." already extracted into sub_components
  const lines = d.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length > 0 && lines.every((l) => /^(?:including\s+with\s+followings?:?|includes?:?|\d+\s*[x×]\s+)/i.test(l))) {
    return true;
  }

  return false;
}

/**
 * Pure deterministic post-processor for AI-extracted enquiry/proposal line items.
 * Safe to run both immediately after Gemini JSON extraction (`aiExtractionClient.ts`)
 * and during form hydration (`EnquiryForm.tsx`) — fully idempotent.
 */
export function normalizeExtractedLineItems(
  rawLineItems: any[],
  options?: NormalizeLineItemsOptions
): NormalizedExtractedLineItem[] {
  if (!Array.isArray(rawLineItems)) return [];

  const globalDelivery = String(options?.globalDeliveryPeriod || '').trim();
  const hasConcreteGlobalDelivery = Boolean(globalDelivery && !isGenericGlobalDeliveryPhrase(globalDelivery));

  return rawLineItems.map((rawItem: any) => {
    const item = rawItem && typeof rawItem === 'object' ? { ...rawItem } : {};
    const itemName = fixEngineeringTypos(String(item.item_name || item.name || '').trim());
    const rawDesc = fixEngineeringTypos(String(item.description || '').trim());
    const qty = Number(item.quantity) > 0 ? Number(item.quantity) : 1;
    const rawUnitPrice =
      Number(item.unit_price) ||
      Number(item.unit_price_aed) ||
      Number(item.price) ||
      Number(item.unitPrice) ||
      0;

    let brandMake = String(item.brand_make || item.brand || item.make || '').trim();
    let modelPartNo = String(item.model_part_no || item.model || '').trim();
    let countryOfOrigin = normalizeOriginValue(item.country_of_origin || item.origin || '');
    let hsCode = String(item.hs_code || '').trim();

    // Candidate per-item lead times (concrete only — generic global phrases rejected)
    const rawLeadCandidates = [
      item.lead_time_note,
      item.availability,
      item.delivery,
      item.delivery_time,
      item.lead_time
    ];
    let leadTimeNote = '';
    for (const cand of rawLeadCandidates) {
      const s = String(cand || '').trim();
      if (s && !isGenericGlobalDeliveryPhrase(s)) {
        leadTimeNote = s;
        break;
      }
    }

    const parentAttrs: ProductAttribute[] = [];

    // Raw narrative provenance text on the parent to check for explicit Origin: USA vs USA ASME Standards
    const parentProvenanceText = [
      itemName,
      rawDesc,
      item.brand_make,
      item.remarks
    ]
      .filter(Boolean)
      .join(' | ');

    // 1. Check if parent country_of_origin is actually a Standard (e.g. "USA ASME Standards")
    if (countryOfOrigin && isStandardCodeNotOrigin(countryOfOrigin)) {
      const std = normalizeTechnicalStandardValue(countryOfOrigin);
      if (std) upsertAttr(parentAttrs, 'Standard', std);
      countryOfOrigin = '';
    }

    // 2. Process parent attributes: route dedicated core fields out, fix Flow Rate vs Volume, clean Standards
    const rawAttrs: any[] = Array.isArray(item.attributes) ? item.attributes : [];
    for (const rawAttr of rawAttrs) {
      const rawK = String(rawAttr?.key || '').trim();
      const rawV = fixEngineeringTypos(
        String(rawAttr?.value ?? '').replace(/^[•▪▸\-*]\s*/, '').trim()
      );
      if (!rawK || !rawV) continue;

      const dedicated = getDedicatedCoreFieldKey(rawK);
      if (dedicated === 'brand_make') {
        if (!brandMake) brandMake = rawV;
        continue;
      }
      if (dedicated === 'model_part_no') {
        if (!modelPartNo) modelPartNo = rawV;
        continue;
      }
      if (dedicated === 'country_of_origin') {
        if (isStandardCodeNotOrigin(rawV)) {
          upsertAttr(parentAttrs, 'Standard', rawV);
        } else if (!countryOfOrigin) {
          countryOfOrigin = normalizeOriginValue(rawV);
        }
        continue;
      }
      if (dedicated === 'lead_time_note') {
        if (!leadTimeNote && !isGenericGlobalDeliveryPhrase(rawV)) {
          leadTimeNote = rawV;
        }
        continue;
      }
      if (dedicated === 'hs_code') {
        if (!hsCode) hsCode = rawV;
        continue;
      }

      upsertAttr(parentAttrs, rawK, rawV);
    }

    // 2b. Split inline Brand (Origin) on standalone single-brand items (e.g. "Clack (USA)")
    if (brandMake && !/[\/,&+;]/.test(brandMake)) {
      const brandOriginMatch = brandMake.match(/^(.+?)\s*\(\s*([A-Za-z.\s]{2,24})\s*\)$/);
      if (brandOriginMatch) {
        const parenToken = brandOriginMatch[2].trim();
        if (
          !isStandardCodeNotOrigin(parenToken) &&
          /^(?:usa|u\.s\.a\.?|uk|germany|italy|china|india|uae|france|spain|taiwan|japan|korea|europe|eu)$/i.test(
            parenToken
          )
        ) {
          brandMake = brandOriginMatch[1].trim();
          if (!countryOfOrigin) {
            countryOfOrigin =
              parenToken.toUpperCase() === 'USA' || parenToken.toLowerCase() === 'u.s.a.'
                ? 'USA'
                : parenToken;
          }
        }
      }
    }

    // 3. Check if USA ASME standard appears in parent description/attributes and guard against false USA origin
    const parentStdFromDesc = extractStandardFromText(rawDesc);
    if (parentStdFromDesc && !(Array.isArray(item.sub_components) && item.sub_components.length > 0)) {
      upsertAttr(parentAttrs, 'Standard', parentStdFromDesc);
    }
    const parentHasUsaAsme =
      parentAttrs.some((a) => a.key.toLowerCase() === 'standard' && /\busa\s+asme\b/i.test(a.value)) ||
      /\busa\s+asme\b/i.test(fixEngineeringTypos(parentProvenanceText));

    if (
      isUsaOriginToken(countryOfOrigin) &&
      parentHasUsaAsme &&
      !hasExplicitUsaOriginText(parentProvenanceText)
    ) {
      countryOfOrigin = '';
    }

    // 4. Normalize sub_components structurally
    const rawSubs: any[] = Array.isArray(item.sub_components) ? item.sub_components : [];
    const normalizedSubs: LineItemComponent[] = [];
    const deferredSiblings: LineItemComponent[] = [];

    rawSubs.forEach((rawSub: any, sIdx: number) => {
      const { component, extractedSiblings } = parseStructuredSubComponent(rawSub, sIdx);
      if (component.item_name) {
        normalizedSubs.push(component);
      }
      if (extractedSiblings.length > 0) {
        deferredSiblings.push(...extractedSiblings);
      }
    });

    // Append any extracted embedded MAV siblings that aren't already present as a sub-component
    for (const sib of deferredSiblings) {
      const alreadyHasMav = normalizedSubs.some((sub) =>
        /\b(?:mav|motorized\s+alternating\s+valve)\b/i.test(sub.item_name)
      );
      if (!alreadyHasMav) {
        normalizedSubs.push(sib);
      }
    }

    // Remove legacy duplicate Row #1 if it just repeats parent title with 0 price and no unique attrs
    let finalSubs = normalizedSubs;
    if (
      finalSubs.length > 1 &&
      finalSubs[0].unit_price === 0 &&
      itemName &&
      finalSubs[0].item_name.toLowerCase() === itemName.toLowerCase() &&
      (!finalSubs[0].attributes || finalSubs[0].attributes.length === 0)
    ) {
      finalSubs = finalSubs.slice(1);
    }
    finalSubs = finalSubs.map((s, idx) => ({ ...s, sn: String(idx + 1) }));

    const isComposite = finalSubs.length > 0;
    let finalParentAttrs = parentAttrs;
    let finalDescription = rawDesc;

    // 5. Composite Set Parent Anti-Bleed Guard
    if (isComposite) {
      const subBrands = finalSubs.map((s) => s.brand_make || '').filter(Boolean);
      const subOrigins = finalSubs.map((s) => s.country_of_origin || '').filter(Boolean);

      // 5a. Clear multi-vendor / sub-bled parent brand
      if (brandMake && isBlendedMultiVendorBrand(brandMake, subBrands)) {
        brandMake = '';
      }

      // 5b. Clear sub-component model bled onto parent (e.g. "WS3 (Multiport Valve)")
      if (modelPartNo && isSubComponentBledModel(modelPartNo, finalSubs)) {
        modelPartNo = '';
      }

      // 5c. Clear parent origin if bled from a sub-component or from a sub-component's USA ASME Standard
      if (countryOfOrigin) {
        const anySubHasUsaAsme = finalSubs.some((s) =>
          (s.attributes || []).some(
            (a) => a.key.toLowerCase() === 'standard' && /\busa\s+asme\b/i.test(a.value)
          )
        );
        const uniqueSubBrands = new Set(subBrands.map((b) => b.toLowerCase()));
        const originMatchesSubOnly = subOrigins.some(
          (o) => o.toLowerCase() === countryOfOrigin.toLowerCase()
        );
        if (
          (isUsaOriginToken(countryOfOrigin) && anySubHasUsaAsme && !hasExplicitUsaOriginText(rawDesc)) ||
          (originMatchesSubOnly && (uniqueSubBrands.size >= 2 || finalSubs.length >= 2) && !brandMake)
        ) {
          countryOfOrigin = '';
        }
      }

      // 5d. Strip tank-only / valve-only / sub-duplicated attributes from parent
      const subAttrKeySet = new Set<string>();
      const subAttrPairSet = new Set<string>();
      const subModelTokens = finalSubs
        .map((s) => String(s.model_part_no || '').trim().toLowerCase())
        .filter((m) => m.length >= 2);

      for (const sub of finalSubs) {
        for (const a of sub.attributes || []) {
          const kl = a.key.toLowerCase();
          const vl = a.value.toLowerCase();
          subAttrKeySet.add(kl);
          subAttrPairSet.add(`${kl}::${vl}`);
        }
      }

      finalParentAttrs = parentAttrs.filter((attr) => {
        const kl = attr.key.toLowerCase();
        const vl = attr.value.toLowerCase();

        // Always keep core system-level attributes (Flow Rate, Arrangement, Design Pressure, etc.)
        if (SYSTEM_LEVEL_COMPOSITE_KEYS.has(kl)) {
          return true;
        }
        // Strip component-only keys (Dimensions, In/Out Size, Installation, Application, etc.)
        if (COMPONENT_ONLY_KEYS_ON_COMPOSITE.has(kl)) {
          return false;
        }
        // Strip if exact same key+value already exists on a sub-component
        if (subAttrPairSet.has(`${kl}::${vl}`)) {
          return false;
        }
        // Strip Standard/MOC/Operation/Volume/Capacity on parent if already specified on a sub-component
        if (
          (kl === 'standard' || kl === 'moc' || kl === 'operation' || kl === 'volume' || kl === 'capacity') &&
          subAttrKeySet.has(kl)
        ) {
          return false;
        }
        // Strip if value explicitly references a sub-component model (e.g. "WS3")
        if (subModelTokens.some((tok) => new RegExp(`\\b${tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(vl))) {
          return false;
        }
        return true;
      });

      // 5e. Strip redundant AI-synthesized narrative summary paragraph on composite parent
      if (finalDescription && isRedundantCompositeNarrativeDescription(finalDescription, itemName, finalSubs)) {
        finalDescription = '';
      }
    }

    // 6. Never overwrite concrete per-item lead time with global delivery; never copy generic global phrase
    const finalLeadTime =
      leadTimeNote && !isGenericGlobalDeliveryPhrase(leadTimeNote)
        ? leadTimeNote
        : hasConcreteGlobalDelivery && !leadTimeNote
        ? ''
        : '';

    const normalizedUnit = String(item.unit || item.uom || '').trim() || (isComposite ? 'Set' : 'Nos');

    return {
      ...item,
      item_name: itemName,
      description: finalDescription,
      quantity: qty,
      unit: normalizedUnit,
      unit_price: rawUnitPrice,
      unit_price_aed: Number(item.unit_price_aed) || rawUnitPrice,
      brand_make: brandMake || undefined,
      model_part_no: modelPartNo || undefined,
      country_of_origin: countryOfOrigin || undefined,
      hs_code: hsCode || undefined,
      lead_time_note: finalLeadTime,
      is_composite_set: isComposite ? true : Boolean(item.is_composite_set) || undefined,
      sub_components: isComposite ? finalSubs : undefined,
      attributes: finalParentAttrs
    };
  });
}
