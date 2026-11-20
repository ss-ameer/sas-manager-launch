/**
 * Pure helpers for Quotation Studio Inline Canvas Quick-Edit mode.
 *
 * Kept dependency-free so both `QuotationDocument` and `QuotationStudioModal`
 * share identical field-key encoding, `@tag` raw template seeding, and numeric/validity parsing.
 */

export type InlineLineItemField =
  | 'item_name'
  | 'quantity'
  | 'unit'
  | 'unit_price'
  | 'description';

const VALID_LINE_ITEM_FIELDS = new Set<InlineLineItemField>([
  'item_name',
  'quantity',
  'unit',
  'unit_price',
  'description'
]);

/**
 * Builds a canonical field key for an on-canvas line-item cell.
 */
export function buildInlineLineItemFieldKey(
  index: number,
  field: InlineLineItemField
): string {
  return `line_item:${index}:${field}`;
}

/**
 * Parses a line-item inline field key back into its 0-based index and field name.
 */
export function parseInlineLineItemFieldKey(
  fieldKey: string
): { index: number; field: InlineLineItemField } | null {
  if (!fieldKey || !fieldKey.startsWith('line_item:')) return null;
  const parts = fieldKey.split(':');
  if (parts.length !== 3) return null;
  const idx = Number(parts[1]);
  const field = parts[2] as InlineLineItemField;
  if (!Number.isInteger(idx) || idx < 0) return null;
  if (!VALID_LINE_ITEM_FIELDS.has(field)) return null;
  return { index: idx, field };
}

/**
 * Resolves the initial string to seed into an inline canvas editor.
 *
 * When a field is driven by a dynamic `@tag` template (e.g.
 * `"Mr. @contact_person (@contact_designation)"`), `rawFieldValues[fieldKey]`
 * holds the underlying template so inline editing exposes the raw template
 * instead of silently overwriting it with resolved plain text.
 */
export function resolveInlineEditSeedValue(
  fieldKey: string,
  fallbackValue: string,
  rawFieldValues?: Record<string, string>
): string {
  if (
    rawFieldValues &&
    Object.prototype.hasOwnProperty.call(rawFieldValues, fieldKey)
  ) {
    const raw = rawFieldValues[fieldKey];
    if (typeof raw === 'string' && raw.length > 0) {
      return raw;
    }
  }
  return fallbackValue || '';
}

/**
 * Parses an inline numeric edit (such as quantity or unit price) safely into
 * a non-negative finite number, ignoring currency symbols and thousand separators.
 */
export function parseInlineNumericValue(raw: string, fallback: number): number {
  const trimmed = String(raw ?? '').trim();
  if (trimmed === '') return 0;
  const cleaned = trimmed.replace(/[^0-9.-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.' || cleaned === '-.') {
    return fallback;
  }
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

/**
 * Extracts a positive validity day count (clamped to 1..365) from an inline
 * edit such as `"45"`, `"45 Days"`, or `"Valid for 30 days"`.
 */
export function parseInlineValidityDays(
  raw: string,
  fallbackDays: number
): number {
  const match = String(raw ?? '').match(/\d+/);
  if (!match) return fallbackDays;
  const parsed = parseInt(match[0], 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallbackDays;
  return Math.max(1, Math.min(365, parsed));
}
