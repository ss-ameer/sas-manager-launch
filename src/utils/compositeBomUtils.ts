import { LineItem, LineItemComponent } from '../types';

/**
 * Recalculates parent composite item totals (unit_price, cost_price, total_price)
 * from its sub_components list and parent quantity.
 */
export const recalculateCompositeItemTotals = (
  components: LineItemComponent[],
  parentQty: number = 1
): { unit_price: number; cost_price: number; total_price: number; line_total: number } => {
  const safeParentQty = Math.max(1, Number(parentQty) || 1);
  let totalUnitSelling = 0;
  let totalUnitCost = 0;

  (components || []).forEach((comp) => {
    if (comp.is_included_accessory) return;
    const compQty = Number(comp.quantity) || 0;
    const compUnitPrice = Number(comp.unit_price) || 0;
    const compCostPrice = Number(comp.cost_price) || 0;
    totalUnitSelling += compQty * compUnitPrice;
    totalUnitCost += compQty * compCostPrice;
  });

  const roundedUnitSelling = Math.round(totalUnitSelling * 100) / 100;
  const roundedUnitCost = Math.round(totalUnitCost * 100) / 100;
  const totalPrice = Math.round(roundedUnitSelling * safeParentQty * 100) / 100;

  return {
    unit_price: roundedUnitSelling,
    cost_price: roundedUnitCost,
    total_price: totalPrice,
    line_total: totalPrice,
  };
};

/**
 * Applies a uniform markup percentage across all priced sub-components that have a supplier cost > 0.
 */
export const applyMarkupToSubComponents = (
  components: LineItemComponent[],
  markupPercent: number
): LineItemComponent[] => {
  const factor = 1 + (Number(markupPercent) || 0) / 100;
  return (components || []).map((comp) => {
    if (comp.is_included_accessory) return comp;
    const baseCost = Number(comp.cost_price) || 0;
    if (baseCost <= 0) return comp;
    const newUnitPrice = Math.round(baseCost * factor * 100) / 100;
    const qty = Number(comp.quantity) || 0;
    const total = Math.round(newUnitPrice * qty * 100) / 100;
    return {
      ...comp,
      unit_price: newUnitPrice,
      total_price: total,
      line_total: total,
    };
  });
};

/**
 * Parses multi-line spreadsheet/TSV/CSV/pipe text into structured LineItemComponent rows.
 * Supports formats:
 * - Item Name | Scope/Application Note | Qty | UOM | Supplier Cost | Selling Price
 * - Item Name | Qty | UOM | Selling Price
 * - Item Name | Scope/Application Note (auto-classified as included zero-price accessory if no numbers or 0 price)
 */
export const parseBulkSubComponentsText = (
  rawText: string,
  defaultAsAccessory: boolean = false
): LineItemComponent[] => {
  if (!rawText || !rawText.trim()) return [];

  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const results: LineItemComponent[] = [];

  const parseNum = (val?: string): number => {
    if (!val) return 0;
    const cleaned = val.replace(/[^0-9.-]/g, '');
    const num = parseFloat(cleaned);
    return Number.isFinite(num) ? num : 0;
  };

  const isLikelyNumber = (val?: string): boolean => {
    if (!val) return false;
    const cleaned = val.replace(/[,$\sAEDUSRSAR€£]/gi, '').trim();
    return /^-?\d+(\.\d+)?$/.test(cleaned);
  };

  lines.forEach((line, idx) => {
    // Skip obvious header rows
    if (
      idx === 0 &&
      /^(item|component|description|part|s\/n|no\.?)\b/i.test(line) &&
      /(qty|quantity|price|rate|cost|uom|unit)/i.test(line)
    ) {
      return;
    }

    const delimiter = line.includes('\t')
      ? '\t'
      : line.includes('|')
      ? '|'
      : ',';

    let cols = line.split(delimiter).map((c) => c.trim());
    // Strip leading serial index column like "1", "1.1", "a)" if > 2 columns
    if (cols.length >= 3 && /^(\d+(\.\d+)?|[a-z]\))$/i.test(cols[0])) {
      cols = cols.slice(1);
    }

    let itemName = cols[0] || `Component ${idx + 1}`;
    let remark = '';
    let quantity = 1;
    let unit = 'Nos';
    let costPrice = 0;
    let unitPrice = 0;
    let isAccessory = defaultAsAccessory;

    if (cols.length === 1) {
      itemName = cols[0];
      isAccessory = true;
    } else if (cols.length === 2) {
      if (isLikelyNumber(cols[1])) {
        unitPrice = parseNum(cols[1]);
        isAccessory = unitPrice === 0 ? defaultAsAccessory : false;
      } else {
        remark = cols[1];
        isAccessory = true;
      }
    } else if (cols.length === 3) {
      if (isLikelyNumber(cols[1]) && isLikelyNumber(cols[2])) {
        quantity = Math.max(1, parseNum(cols[1]));
        unitPrice = parseNum(cols[2]);
        isAccessory = unitPrice === 0;
      } else if (!isLikelyNumber(cols[1]) && isLikelyNumber(cols[2])) {
        remark = cols[1];
        quantity = Math.max(1, parseNum(cols[2]));
        isAccessory = true;
      } else {
        remark = cols[1];
        unit = cols[2] || 'Nos';
        isAccessory = true;
      }
    } else if (cols.length === 4) {
      if (isLikelyNumber(cols[1]) && isLikelyNumber(cols[3])) {
        quantity = Math.max(1, parseNum(cols[1]));
        unit = cols[2] || 'Nos';
        unitPrice = parseNum(cols[3]);
        isAccessory = unitPrice === 0;
      } else {
        remark = cols[1];
        quantity = Math.max(1, parseNum(cols[2]));
        unit = cols[3] || 'Nos';
        isAccessory = true;
      }
    } else if (cols.length === 5) {
      if (isLikelyNumber(cols[1]) && isLikelyNumber(cols[3]) && isLikelyNumber(cols[4])) {
        quantity = Math.max(1, parseNum(cols[1]));
        unit = cols[2] || 'Nos';
        costPrice = parseNum(cols[3]);
        unitPrice = parseNum(cols[4]);
        isAccessory = unitPrice === 0 && costPrice === 0;
      } else {
        remark = cols[1];
        quantity = Math.max(1, parseNum(cols[2]));
        unit = cols[3] || 'Nos';
        unitPrice = parseNum(cols[4]);
        isAccessory = unitPrice === 0;
      }
    } else if (cols.length >= 6) {
      remark = cols[1];
      quantity = Math.max(1, parseNum(cols[2]));
      unit = cols[3] || 'Nos';
      costPrice = parseNum(cols[4]);
      unitPrice = parseNum(cols[5]);
      isAccessory = unitPrice === 0 && costPrice === 0 && defaultAsAccessory;
    }

    if (unitPrice === 0 && costPrice > 0) {
      unitPrice = costPrice;
    }

    const totalPrice = isAccessory ? 0 : Math.round(quantity * unitPrice * 100) / 100;

    results.push({
      id: `sub_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
      sn: isAccessory ? undefined : String(results.filter((r) => !r.is_included_accessory).length + 1),
      item_name: itemName,
      remark,
      description: remark,
      quantity,
      unit,
      cost_price: isAccessory ? 0 : costPrice,
      unit_price: isAccessory ? 0 : unitPrice,
      total_price: totalPrice,
      line_total: totalPrice,
      is_included_accessory: isAccessory,
    });
  });

  return results;
};

/**
 * Determines the next logical Option Designation (`Option A`, `Option B`, `Option C`, `Option D`)
 * when cloning a line item or package for side-by-side commercial comparison.
 */
export const getNextOptionLabel = (
  currentOption?: string,
  existingItems: Array<{ option?: string; item_option?: string; option_designation?: string }> = []
): string => {
  const norm = (currentOption || '').trim();
  const usedOptions = new Set(
    existingItems
      .map((i) => (i.option || i.item_option || i.option_designation || '').trim())
      .filter(Boolean)
  );

  if (!norm || norm === 'Default' || norm === 'Default / Included' || norm === 'Baseline / All') {
    if (!usedOptions.has('Option A')) return 'Option A';
    if (!usedOptions.has('Option B')) return 'Option B';
    if (!usedOptions.has('Option C')) return 'Option C';
    return 'Option B';
  }
  if (norm === 'Option A') {
    if (!usedOptions.has('Option B')) return 'Option B';
    if (!usedOptions.has('Option C')) return 'Option C';
    return 'Option B';
  }
  if (norm === 'Option B') {
    if (!usedOptions.has('Option C')) return 'Option C';
    return 'Option D';
  }
  if (norm === 'Option C') {
    return 'Option D';
  }
  return 'Option B';
};

/**
 * Deep-clones a LineItem (including all sub_components with fresh IDs) into the next Option group.
 */
export const cloneLineItemToNextOption = <T extends LineItem>(
  sourceItem: T,
  existingItems: T[] = []
): { clonedItem: T; updatedSourceOption?: string } => {
  const currentOpt = (
    sourceItem.option ||
    sourceItem.item_option ||
    sourceItem.option_designation ||
    ''
  ).trim();
  const isSourceDefault =
    !currentOpt || currentOpt === 'Default' || currentOpt === 'Default / Included';

  // If the source item was in Default, promote source to Option A and clone as Option B
  const updatedSourceOption = isSourceDefault ? 'Option A' : undefined;
  const targetOption = isSourceDefault
    ? 'Option B'
    : getNextOptionLabel(currentOpt, existingItems);

  const clonedSubs: LineItemComponent[] | undefined = sourceItem.sub_components
    ? sourceItem.sub_components.map((sub, sIdx) => ({
        ...sub,
        id: `sub_${Date.now()}_${sIdx}_${Math.random().toString(36).slice(2, 6)}`,
        specifications: sub.specifications ? { ...sub.specifications } : undefined,
      }))
    : undefined;

  const clonedItem: T = {
    ...sourceItem,
    id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    option: targetOption,
    item_option: targetOption,
    option_designation: targetOption,
    sub_components: clonedSubs,
    attributes: sourceItem.attributes ? sourceItem.attributes.map((a) => ({ ...a })) : [],
    specifications: sourceItem.specifications ? { ...sourceItem.specifications } : {},
  };

  return { clonedItem, updatedSourceOption };
};

/**
 * Checks if a line item's `option` should be active for baseline totals and inventory reservation.
 * Default / Included items and Option A (or the explicitly designated winning option on the enquiry) are active;
 * alternative options (Option B, Option C, Option D, Optional / Add-On) are excluded unless designated as winningOption.
 */
export const isOptionActiveForInventoryAndBaseline = (
  itemOption?: string,
  designatedWinningOption?: string
): boolean => {
  const opt = (itemOption || '').trim();
  if (!opt || opt === 'Default' || opt === 'Default / Included' || opt === 'Baseline / All') {
    return true;
  }
  const winning = (designatedWinningOption || '').trim();
  if (winning && winning !== 'None / Single Option' && winning !== 'Multi-Option') {
    return opt.toLowerCase() === winning.toLowerCase();
  }
  // When no specific winning option is designated, Option A is the primary baseline option
  return opt === 'Option A' || opt.startsWith('Option A ');
};
