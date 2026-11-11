import { LineItem, LineItemComponent } from '../types';

/**
 * Recalculates parent composite item totals (unit_price, cost_price, total_price)
 * from its sub_components list and parent quantity.
 */
export const recalculateCompositeItemTotals = (
  components: LineItemComponent[],
  parentQty: number = 1,
  fallbackUnitPrice?: number,
  fallbackCostPrice?: number
): {
  unit_price: number;
  cost_price: number;
  total_price: number;
  line_total: number;
  unitSellingPrice: number;
  unitCostPrice: number;
  totalSellingPrice: number;
  normalizedComponents: LineItemComponent[];
} => {
  const safeParentQty = Math.max(1, Number(parentQty) || 1);
  let totalUnitSelling = 0;
  let totalUnitCost = 0;

  let pricedSn = 1;
  const normalizedComponents: LineItemComponent[] = (components || []).map((comp) => {
    const rawUnitPrice = Number(comp.unit_price) || 0;
    const isAcc = rawUnitPrice <= 0 ? true : Boolean(comp.is_included_accessory && rawUnitPrice <= 0);
    const compQty = Math.max(0, Number(comp.quantity) || 0);
    const compUnitPrice = isAcc ? 0 : rawUnitPrice;
    const compCostPrice = Math.max(0, Number(comp.cost_price) || 0);
    const compTotal = isAcc ? 0 : Math.round(compQty * compUnitPrice * 100) / 100;

    if (!isAcc) {
      totalUnitSelling += compTotal;
    }
    if (compCostPrice > 0) {
      totalUnitCost += compQty * compCostPrice;
    }

    return {
      ...comp,
      sn: isAcc ? undefined : String(pricedSn++),
      is_included_accessory: isAcc,
      quantity: compQty,
      unit_price: compUnitPrice,
      cost_price: compCostPrice,
      total_price: compTotal,
      line_total: compTotal,
    };
  });

  const computedUnitSelling = Math.round(totalUnitSelling * 100) / 100;
  const computedUnitCost = Math.round(totalUnitCost * 100) / 100;

  const roundedUnitSelling =
    computedUnitSelling > 0
      ? computedUnitSelling
      : Number(fallbackUnitPrice) > 0
      ? Math.round(Number(fallbackUnitPrice) * 100) / 100
      : 0;

  const roundedUnitCost =
    computedUnitCost > 0
      ? computedUnitCost
      : Number(fallbackCostPrice) > 0
      ? Math.round(Number(fallbackCostPrice) * 100) / 100
      : 0;

  const totalPrice = Math.round(roundedUnitSelling * safeParentQty * 100) / 100;

  return {
    unit_price: roundedUnitSelling,
    cost_price: roundedUnitCost,
    total_price: totalPrice,
    line_total: totalPrice,
    unitSellingPrice: roundedUnitSelling,
    unitCostPrice: roundedUnitCost,
    totalSellingPrice: totalPrice,
    normalizedComponents,
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
): { clonedItem: T; updatedSourceOption?: string; targetOption: string } => {
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

  return { clonedItem, updatedSourceOption, targetOption };
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
  const optLower = opt.toLowerCase();
  const winning = (designatedWinningOption || '').trim();
  const winningLower = winning.toLowerCase();

  const hasExplicitWinning =
    Boolean(winning) &&
    winningLower !== 'none / single option' &&
    !winningLower.startsWith('multi-option');

  if (hasExplicitWinning) {
    if (optLower === winningLower) return true;
    const normOpt = optLower.match(/^option\s+[a-z0-9]+/i)?.[0];
    const normWin = winningLower.match(/^option\s+[a-z0-9]+/i)?.[0];
    if (normOpt && normWin && normOpt === normWin) return true;
    return optLower.startsWith(winningLower + ' ') || winningLower.startsWith(optLower + ' ');
  }

  if (optLower.includes('optional')) {
    return false;
  }

  // When no specific winning option is designated, Option A is the primary baseline option
  return optLower === 'option a' || optLower.startsWith('option a ') || optLower.startsWith('option a(');
};

/**
 * Checks whether a single line inside a technical description is a section sub-heading
 * (e.g. "MOTOR SPECIFICATIONS:-", "GEARBOX SPECIFICATIONS:", "PUMP PARAMETERS:-", "SCOPE OF SUPPLY:").
 */
export const isTechnicalSectionHeaderLine = (line: string): boolean => {
  const trimmed = (line || '').trim();
  if (!trimmed || trimmed.length > 75) return false;
  if (/^[•\-*]\s/.test(trimmed)) return false;
  if (trimmed.endsWith(':-') || trimmed.endsWith(':–') || trimmed.endsWith(':—')) {
    return true;
  }
  if (
    /^[A-Z0-9\s&/()._-]{3,}(?:SPECIFICATIONS|SPECS|DETAILS|PARAMETERS|DATA|SCOPE|ACCESSORIES|FEATURES|CONSTRUCTION|CONFIGURATION|STANDARDS)\s*[:\-–—]*$/i.test(
      trimmed
    ) &&
    trimmed === trimmed.toUpperCase()
  ) {
    return true;
  }
  // Uppercase heading ending in colon without a value after it
  if (/^[A-Z][A-Z0-9\s&/()._-]{2,50}:$/.test(trimmed)) {
    return true;
  }
  return false;
};

/**
 * Converts dense slash-separated technical descriptions (such as Item #9 Anoxic Tank Mixer:
 * "Supply of Submersible Mixer... MOTOR SPECIFICATIONS - Make: PYTHON / Origin: Poland / ... GEARBOX SPECIFICATIONS - Make: ATLAS / ...")
 * into cleanly structured multi-section headings ("MOTOR SPECIFICATIONS:-") and bulleted lines ("• Make: PYTHON").
 */
export const formatSlashSeparatedDescription = (rawText: string): string => {
  if (!rawText || !rawText.trim()) return '';

  let working = rawText.replace(/\r\n/g, '\n').trim();

  // 1. Promote inline section headers like "MOTOR SPECIFICATIONS - " or "GEARBOX SPECIFICATIONS: " onto their own sub-heading lines
  working = working.replace(
    /(?:^|\.\s+|\n+|\s{2,}|\s*\/\s*)([A-Z][A-Z0-9\s&()_-]{1,42}?(?:SPECIFICATIONS|SPECS|DETAILS|PARAMETERS|DATA|SCOPE|ACCESSORIES|FEATURES|CONSTRUCTION))\s*(?::-|[-:–—]+)\s*/g,
    (_match, heading: string) => `\n\n${heading.trim().toUpperCase()}:-\n`
  );

  // 2. Also promote any ALL-CAPS section header followed by " - " before a Key: Value pair
  working = working.replace(
    /(?:^|\.\s+|\n+)([A-Z][A-Z0-9\s&]{3,35})\s+[-–—]+\s+(?=[A-Za-z0-9\s()]+\s*:)/g,
    (_match, heading: string) => `\n\n${heading.trim().toUpperCase()}:-\n`
  );

  // 3. Process line-by-line and split " / " separated technical segments into clean bullets
  const rawLines = working.split('\n');
  const outputLines: string[] = [];

  for (const rawLine of rawLines) {
    const line = rawLine.trim();
    if (!line) {
      if (outputLines.length > 0 && outputLines[outputLines.length - 1] !== '') {
        outputLines.push('');
      }
      continue;
    }

    if (isTechnicalSectionHeaderLine(line)) {
      if (outputLines.length > 0 && outputLines[outputLines.length - 1] !== '') {
        outputLines.push('');
      }
      const cleanHeader = line.replace(/\s*[:\-–—]+$/, '').trim().toUpperCase();
      outputLines.push(`${cleanHeader}:-`);
      continue;
    }

    // If the line contains spaced slashes (" / ") or multiple Key: Value pairs separated by "/", split them
    if (/\s+\/\s+/.test(line) || (line.split('/').length >= 3 && /:\s*[^/]+\//.test(line))) {
      const segments = line
        .split(/\s+\/\s+|(?<=:\s*[^/\n]{1,45})\s*\/\s*(?=[A-Z][A-Za-z0-9\s()._-]{1,28}:)/)
        .map((s) => s.trim())
        .filter(Boolean);

      if (segments.length > 1) {
        segments.forEach((seg) => {
          // Check if the final segment has a trailing sentence that starts a new section or note
          const cleanedSeg = seg.replace(/^[•\-*]\s*/, '').replace(/\.\s*$/, '').trim();
          if (!cleanedSeg) return;
          if (isTechnicalSectionHeaderLine(cleanedSeg)) {
            if (outputLines.length > 0 && outputLines[outputLines.length - 1] !== '') {
              outputLines.push('');
            }
            outputLines.push(`${cleanedSeg.replace(/\s*[:\-–—]+$/, '').toUpperCase()}:-`);
          } else {
            outputLines.push(`• ${cleanedSeg}`);
          }
        });
        continue;
      }
    }

    outputLines.push(line);
  }

  return outputLines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

