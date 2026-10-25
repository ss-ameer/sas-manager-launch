import React from 'react';
import {
  Quotation,
  WorkspaceDocumentProfile,
  QuotationPreset,
  QuotationPresetColumns,
  DocumentProfileBankAccount,
  BankAccountProfile,
  QuotationThemeAccent,
  QuotationSignatureStyle,
  QuotationLogoPosition,
  QuotationHeaderLayout,
  QuotationTableDensity,
  QuotationTableFontScale,
  QuotationFontSizeScale,
  QuotationBlockConfig,
  QuotationBlockId,
  StudioSelectedSection,
  QuotationHeaderConfig,
  QuotationRecipientConfig,
  QuotationFooterConfig,
  QuotationPageMode,
  QuotationLineItem,
  Attachment
} from '../../types';
import {
  amountToWords,
  amountToWordsAED,
  amountInWordsAED,
  formatAmountInWords
} from '../../utils/numberToWords';
export { amountToWords, amountToWordsAED, amountInWordsAED, formatAmountInWords };
import {
  FileText,
  Building2,
  Calendar,
  Clock,
  Mail,
  Phone,
  Globe,
  CheckCircle2,
  AlertCircle,
  Landmark,
  ShieldCheck,
  FileCheck
} from 'lucide-react';

export const QUOTATION_THEMES: Record<
  QuotationThemeAccent,
  {
    name: string;
    primaryHex: string;
    darkHex: string;
    subtleBg: string;
    badgeBg: string;
    tableHeaderBg: string;
    borderColor: string;
  }
> = {
  navy: {
    name: 'Executive Navy',
    primaryHex: '#0f172a',
    darkHex: '#020617',
    subtleBg: '#f8fafc',
    badgeBg: 'bg-slate-900',
    tableHeaderBg: 'bg-slate-900',
    borderColor: '#0f172a'
  },
  emerald: {
    name: 'Industrial Emerald',
    primaryHex: '#065f46',
    darkHex: '#064e3b',
    subtleBg: '#f0fdf4',
    badgeBg: 'bg-emerald-800',
    tableHeaderBg: 'bg-emerald-800',
    borderColor: '#065f46'
  },
  blue: {
    name: 'Corporate Blue',
    primaryHex: '#1d4ed8',
    darkHex: '#1e40af',
    subtleBg: '#eff6ff',
    badgeBg: 'bg-blue-700',
    tableHeaderBg: 'bg-blue-700',
    borderColor: '#1d4ed8'
  },
  crimson: {
    name: 'Precision Crimson',
    primaryHex: '#9f1239',
    darkHex: '#881337',
    subtleBg: '#fff1f2',
    badgeBg: 'bg-rose-900',
    tableHeaderBg: 'bg-rose-900',
    borderColor: '#9f1239'
  },
  slate: {
    name: 'Modern Slate',
    primaryHex: '#334155',
    darkHex: '#1e293b',
    subtleBg: '#f8fafc',
    badgeBg: 'bg-slate-700',
    tableHeaderBg: 'bg-slate-700',
    borderColor: '#334155'
  },
  amber: {
    name: 'Industrial Amber',
    primaryHex: '#b45309',
    darkHex: '#92400e',
    subtleBg: '#fffbeb',
    badgeBg: 'bg-amber-700',
    tableHeaderBg: 'bg-amber-700',
    borderColor: '#b45309'
  },
  teal: {
    name: 'Marine Teal',
    primaryHex: '#0f766e',
    darkHex: '#115e59',
    subtleBg: '#f0fdfa',
    badgeBg: 'bg-teal-700',
    tableHeaderBg: 'bg-teal-700',
    borderColor: '#0f766e'
  }
};

export const DEFAULT_QUOTATION_BLOCKS: QuotationBlockConfig[] = [
  { id: 'terms', enabled: true, placement: 'left', style: 'framed', fontScale: 'standard', padding: 'standard' },
  { id: 'totals', enabled: true, placement: 'right', style: 'framed', fontScale: 'standard', padding: 'standard' },
  { id: 'remittance', enabled: true, placement: 'left', style: 'framed', fontScale: 'standard', padding: 'standard' },
  { id: 'signatory', enabled: true, placement: 'right', style: 'framed', fontScale: 'standard', padding: 'standard' },
  { id: 'acceptance', enabled: true, placement: 'full', style: 'framed', fontScale: 'standard', padding: 'standard' }
];

export interface QuotationTableChunk {
  items: QuotationLineItem[];
  startIndex: number;
  isContinuation: boolean;
  splitFromItemNumber?: number;
}

export interface QuotationSheetPartition {
  sheetNumber: number;
  totalSheets: number;
  pageLabel: string;
  blocks: QuotationBlockConfig[];
  pageBreakBlock?: QuotationBlockConfig;
  showContinuationHeader: boolean;
  tableChunk?: QuotationTableChunk;
  isTableContinuationSheet?: boolean;
  isLastDocumentSheet?: boolean;
}

export function splitLineItemsIntoChunks(lineItems: QuotationLineItem[] = []): QuotationTableChunk[] {
  if (!Array.isArray(lineItems) || lineItems.length === 0) {
    return [
      {
        items: [],
        startIndex: 0,
        isContinuation: false
      }
    ];
  }

  const chunks: QuotationTableChunk[] = [];
  let currentItems: QuotationLineItem[] = [];
  let currentStartIndex = 0;
  let splitFromItemNumber: number | undefined = undefined;

  lineItems.forEach((item, idx) => {
    currentItems.push(item);
    const isLastItem = idx === lineItems.length - 1;
    if (item.page_break_after === true && !isLastItem) {
      chunks.push({
        items: currentItems,
        startIndex: currentStartIndex,
        isContinuation: chunks.length > 0,
        splitFromItemNumber
      });
      currentItems = [];
      currentStartIndex = idx + 1;
      splitFromItemNumber = idx + 1;
    }
  });

  if (currentItems.length > 0 || chunks.length === 0) {
    chunks.push({
      items: currentItems,
      startIndex: currentStartIndex,
      isContinuation: chunks.length > 0,
      splitFromItemNumber
    });
  }

  return chunks;
}

export function partitionBlocksIntoSheets(
  blocks: QuotationBlockConfig[],
  lineItems?: QuotationLineItem[]
): QuotationSheetPartition[] {
  const activeBlocks = (blocks || []).filter(
    (b) => b.enabled !== false && b.is_visible !== false
  );

  const tableChunks = splitLineItemsIntoChunks(lineItems || []);

  const rawSheets: Array<{
    sheetNumber: number;
    blocks: QuotationBlockConfig[];
    pageBreakBlock?: QuotationBlockConfig;
    showContinuationHeader: boolean;
    tableChunk?: QuotationTableChunk;
    isTableContinuationSheet?: boolean;
  }> = [
    {
      sheetNumber: 1,
      blocks: [],
      showContinuationHeader: false,
      tableChunk: tableChunks[0],
      isTableContinuationSheet: false
    }
  ];

  // Each subsequent table chunk spawns a fresh continuation sheet
  for (let i = 1; i < tableChunks.length; i++) {
    rawSheets.push({
      sheetNumber: rawSheets.length + 1,
      blocks: [],
      showContinuationHeader: true,
      tableChunk: tableChunks[i],
      isTableContinuationSheet: true
    });
  }

  // Process closing layoutBlocks after the final table chunk
  activeBlocks.forEach((b) => {
    const bType =
      b.type ||
      (b.id?.startsWith('break_')
        ? 'page_break'
        : b.id?.startsWith('spacer_')
        ? 'spacer'
        : b.id);

    if (bType === 'page_break') {
      rawSheets.push({
        sheetNumber: rawSheets.length + 1,
        blocks: [],
        pageBreakBlock: b,
        showContinuationHeader: b.show_continuation_header !== false,
        isTableContinuationSheet: false
      });
    } else {
      rawSheets[rawSheets.length - 1].blocks.push(b);
    }
  });

  // Guard against empty page_break sheets (e.g., trailing page_break at the end of layoutBlocks or consecutive page_breaks with zero blocks and zero table items)
  const sanitizedSheets = rawSheets.filter((sheet, idx) => {
    if (idx === 0) return true;
    const hasBlocks = sheet.blocks.length > 0;
    const hasTableItems = Boolean(sheet.tableChunk && sheet.tableChunk.items.length > 0);
    return hasBlocks || hasTableItems;
  });

  const totalSheets = sanitizedSheets.length;
  return sanitizedSheets.map((s, idx) => {
    const sheetNumber = idx + 1;
    const isLast = idx === totalSheets - 1;
    return {
      ...s,
      sheetNumber,
      totalSheets,
      pageLabel: `Page ${sheetNumber} of ${totalSheets}`,
      isLastDocumentSheet: isLast
    };
  });
}

export interface QuotationAnnexSheetDescriptor {
  annexNumber: number;
  sheetNumber: number;
  totalDocumentPages: number;
  headerTitle: string;
  pageLabel: string;
  attachment: Attachment;
  isLastDocumentSheet: boolean;
}

export interface QuotationSubmittalIndexEntry {
  indexNumber: number;
  id: string;
  name: string;
  url: string;
  renderAsAnnexPage: boolean;
  annexPageNumber?: number;
  badgeLabel: string;
}

export interface TopCardGridPosition {
  gridRowStart: number;
  gridColumnStart: number;
  gridColumnEnd: number;
  placementClass: string;
}

export interface ResolvedTopCardsLayout {
  recipientStyle: 'framed' | 'minimal';
  recipientPlacement: 'left' | 'full' | 'right';
  recipientWidth: '50' | '100';
  recipientRadius: 'rounded' | 'sharp';
  recipientColSpanClass: 'col-span-6 print:col-span-6' | 'col-span-12 print:col-span-12';
  recipientGridPosition: TopCardGridPosition;
  recipientCardClassName: string;
  offerStyle: 'framed' | 'minimal';
  offerPlacement: 'left' | 'full' | 'right';
  offerWidth: '50' | '100';
  offerRadius: 'rounded' | 'sharp';
  offerColSpanClass: 'col-span-6 print:col-span-6' | 'col-span-12 print:col-span-12';
  offerGridPosition: TopCardGridPosition;
  offerCardClassName: string;
  cardsOrder: 'recipient_first' | 'offer_first';
}

export function resolveTopCardsLayout(
  recipientConfig?: QuotationRecipientConfig,
  globalBlockStyle: 'framed' | 'minimal' = 'framed',
  globalCardRadius: 'rounded' | 'sharp' = 'rounded',
  cardsOrder: 'recipient_first' | 'offer_first' = 'recipient_first'
): ResolvedTopCardsLayout {
  const cfg = recipientConfig || {};
  const resolvedOrder: 'recipient_first' | 'offer_first' =
    cfg.cardsOrder || cardsOrder || 'recipient_first';

  const recipientStyle: 'framed' | 'minimal' =
    cfg.recipientCardStyle || cfg.style || globalBlockStyle || 'framed';
  const offerStyle: 'framed' | 'minimal' =
    cfg.offerCardStyle || cfg.style || globalBlockStyle || 'framed';

  const defaultRecipientPlacement: 'left' | 'right' =
    resolvedOrder === 'offer_first' ? 'right' : 'left';
  const defaultOfferPlacement: 'left' | 'right' =
    resolvedOrder === 'offer_first' ? 'left' : 'right';

  const recipientPlacement: 'left' | 'full' | 'right' =
    cfg.recipientPlacement ||
    (cfg.recipientCardWidth === '100' || cfg.layout === 'stacked'
      ? 'full'
      : defaultRecipientPlacement);

  const offerPlacement: 'left' | 'full' | 'right' =
    cfg.offerPlacement ||
    (cfg.offerCardWidth === '100' || cfg.layout === 'stacked'
      ? 'full'
      : defaultOfferPlacement);

  const recipientWidth: '50' | '100' = recipientPlacement === 'full' ? '100' : '50';
  const offerWidth: '50' | '100' = offerPlacement === 'full' ? '100' : '50';

  const recipientRadius: 'rounded' | 'sharp' =
    cfg.recipientCardRadius || cfg.globalCardRadius || globalCardRadius || 'rounded';
  const offerRadius: 'rounded' | 'sharp' =
    cfg.offerCardRadius || cfg.globalCardRadius || globalCardRadius || 'rounded';

  // Compute 2-column row-pairing positions matching renderBlocksGrid
  const orderedCards =
    resolvedOrder === 'offer_first'
      ? [
          { key: 'offer' as const, placement: offerPlacement },
          { key: 'recipient' as const, placement: recipientPlacement }
        ]
      : [
          { key: 'recipient' as const, placement: recipientPlacement },
          { key: 'offer' as const, placement: offerPlacement }
        ];

  let currentRow = 1;
  let rowHasLeft = false;
  let rowHasRight = false;
  const gridMap: Record<'recipient' | 'offer', TopCardGridPosition> = {
    recipient: {
      gridRowStart: 1,
      gridColumnStart: 1,
      gridColumnEnd: 2,
      placementClass: 'col-span-1 col-start-1'
    },
    offer: {
      gridRowStart: 1,
      gridColumnStart: 2,
      gridColumnEnd: 3,
      placementClass: 'col-span-1 col-start-2'
    }
  };

  orderedCards.forEach(({ key, placement }) => {
    if (placement === 'full') {
      if (rowHasLeft || rowHasRight) {
        currentRow++;
        rowHasLeft = false;
        rowHasRight = false;
      }
      const rowStart = currentRow;
      currentRow++;
      gridMap[key] = {
        gridRowStart: rowStart,
        gridColumnStart: 1,
        gridColumnEnd: 3,
        placementClass: 'col-span-2 col-start-1 w-full'
      };
    } else if (placement === 'left') {
      if (rowHasLeft) {
        currentRow++;
        rowHasLeft = false;
        rowHasRight = false;
      }
      const rowStart = currentRow;
      rowHasLeft = true;
      if (rowHasLeft && rowHasRight) {
        currentRow++;
        rowHasLeft = false;
        rowHasRight = false;
      }
      gridMap[key] = {
        gridRowStart: rowStart,
        gridColumnStart: 1,
        gridColumnEnd: 2,
        placementClass: 'col-span-1 col-start-1'
      };
    } else {
      if (rowHasRight) {
        currentRow++;
        rowHasLeft = false;
        rowHasRight = false;
      }
      const rowStart = currentRow;
      rowHasRight = true;
      if (rowHasLeft && rowHasRight) {
        currentRow++;
        rowHasLeft = false;
        rowHasRight = false;
      }
      gridMap[key] = {
        gridRowStart: rowStart,
        gridColumnStart: 2,
        gridColumnEnd: 3,
        placementClass: 'col-span-1 col-start-2'
      };
    }
  });

  const getCardClasses = (
    style: 'framed' | 'minimal',
    radius: 'rounded' | 'sharp',
    placement: 'left' | 'full' | 'right'
  ) => {
    if (style === 'minimal') {
      return 'border-t border-slate-200/90 rounded-none bg-transparent print:bg-transparent print:border-slate-300 pt-2 pb-1 px-1 h-full flex flex-col justify-between break-inside-avoid page-break-inside-avoid';
    }
    const radiusClass = radius === 'sharp' ? 'rounded-none' : 'rounded-lg';
    const padClass = placement === 'full' ? 'py-2 px-3' : 'p-3';
    return `border border-slate-200 bg-slate-50/50 print:bg-transparent print:border-slate-300 ${radiusClass} ${padClass} h-full flex flex-col justify-between break-inside-avoid page-break-inside-avoid`;
  };

  return {
    recipientStyle,
    recipientPlacement,
    recipientWidth,
    recipientRadius,
    recipientColSpanClass:
      recipientWidth === '100' ? 'col-span-12 print:col-span-12' : 'col-span-6 print:col-span-6',
    recipientGridPosition: gridMap.recipient,
    recipientCardClassName: getCardClasses(recipientStyle, recipientRadius, recipientPlacement),
    offerStyle,
    offerPlacement,
    offerWidth,
    offerRadius,
    offerColSpanClass:
      offerWidth === '100' ? 'col-span-12 print:col-span-12' : 'col-span-6 print:col-span-6',
    offerGridPosition: gridMap.offer,
    offerCardClassName: getCardClasses(offerStyle, offerRadius, offerPlacement),
    cardsOrder: resolvedOrder
  };
}

export function isSheetOverflowingA4(
  scrollHeightPx: number,
  clientWidthPx: number,
  tolerancePx: number = 6
): boolean {
  const a4HeightPx = clientWidthPx > 0 ? Math.ceil(clientWidthPx * (297 / 210)) : 1123;
  return scrollHeightPx > a4HeightPx + tolerancePx;
}

export function extractLineItemAttributesAndCleanDescription(item: QuotationLineItem): {
  cleanDescription: string;
  extractedSpecsAttrs: Array<{ key: string; value: string }>;
} {
  const rawDesc = item.description || '';
  const extractedSpecsAttrs: Array<{ key: string; value: string }> = [];
  const cleanLines: string[] = [];

  rawDesc.split('\n').forEach((line) => {
    const trimmed = line.trim();
    const specsMatch = trimmed.match(/^specs:\s*(.+)$/i);
    if (specsMatch && specsMatch[1]) {
      const segments = specsMatch[1].split(/\s*[•|]\s*/);
      segments.forEach((seg) => {
        const colonIdx = seg.indexOf(':');
        if (colonIdx > 0) {
          const k = seg.slice(0, colonIdx).trim();
          const v = seg.slice(colonIdx + 1).trim();
          if (k && v) {
            extractedSpecsAttrs.push({ key: k, value: v });
          }
        }
      });
    } else {
      cleanLines.push(line);
    }
  });

  return {
    cleanDescription: cleanLines.join('\n').trim(),
    extractedSpecsAttrs
  };
}

export function isGenericAnnexFilename(name?: string | null): boolean {
  if (!name || !name.trim()) return true;
  const cleaned = name.trim().replace(/\.[^/.]+$/, '');
  return /^(whatsapp\s*(image|video|doc|audio)?|img[-_\s]|dsc[-_\s]|pxl[-_\s]|screenshot|screen\s*shot|photo[-_\s]?|image[-_\s]?\d*|dcim|vid[-_\s])/i.test(
    cleaned
  );
}

export function resolveAnnexHeaderTitle(att: Attachment, annexNumber: number): string {
  const showTitle =
    typeof att.show_title_on_annex === 'boolean'
      ? att.show_title_on_annex
      : !isGenericAnnexFilename(att.name);
  const cleanName = (att.name || '').trim();
  if (!showTitle || !cleanName) {
    return `TECHNICAL ANNEX ${annexNumber}`;
  }
  return `TECHNICAL ANNEX ${annexNumber}: ${cleanName}`;
}

export function resolveDocumentPaginationWithAnnexes(
  blocks: QuotationBlockConfig[],
  lineItems?: QuotationLineItem[],
  flyerAttachments?: Attachment[],
  showSubmittalsIndex: boolean = true
): {
  mainSheets: QuotationSheetPartition[];
  annexSheetAttachments: Attachment[];
  annexSheets: QuotationAnnexSheetDescriptor[];
  totalDocumentPages: number;
  showSubmittalsIndex: boolean;
  submittalsIndexEntries: QuotationSubmittalIndexEntry[];
} {
  const partitionedMainSheets = partitionBlocksIntoSheets(blocks, lineItems);
  const allAttachments = (flyerAttachments || []).filter((att) => att && Boolean(att.url));
  const annexSheetAttachments = allAttachments.filter(
    (att) => att.render_as_annex_page !== false && Boolean(att.url)
  );
  const totalDocumentPages = partitionedMainSheets.length + annexSheetAttachments.length;

  const mainSheets: QuotationSheetPartition[] = partitionedMainSheets.map((sheet, idx) => {
    const isLastMain = idx === partitionedMainSheets.length - 1;
    return {
      ...sheet,
      totalSheets: totalDocumentPages,
      pageLabel: `Page ${sheet.sheetNumber} of ${totalDocumentPages}`,
      isLastDocumentSheet: isLastMain && annexSheetAttachments.length === 0
    };
  });

  const annexSheets: QuotationAnnexSheetDescriptor[] = annexSheetAttachments.map(
    (att, annexIdx) => {
      const sheetNumber = mainSheets.length + annexIdx + 1;
      const annexNumber = annexIdx + 1;
      const isLastAnnex = annexIdx === annexSheetAttachments.length - 1;
      return {
        annexNumber,
        sheetNumber,
        totalDocumentPages,
        headerTitle: resolveAnnexHeaderTitle(att, annexNumber),
        pageLabel: `Page ${sheetNumber} of ${totalDocumentPages}`,
        attachment: att,
        isLastDocumentSheet: isLastAnnex
      };
    }
  );

  let runningAnnexCounter = 0;
  const submittalsIndexEntries: QuotationSubmittalIndexEntry[] = allAttachments.map(
    (att, idx) => {
      const isAnnex = att.render_as_annex_page !== false && Boolean(att.url);
      let annexPageNumber: number | undefined = undefined;
      if (isAnnex) {
        runningAnnexCounter++;
        annexPageNumber = mainSheets.length + runningAnnexCounter;
      }
      return {
        indexNumber: idx + 1,
        id: att.id || `submittal_${idx + 1}`,
        name: att.name || `Technical Submittal ${idx + 1}`,
        url: att.url,
        renderAsAnnexPage: isAnnex,
        annexPageNumber,
        badgeLabel: isAnnex ? `Annex Page ${annexPageNumber}` : 'Enclosed Document'
      };
    }
  );

  return {
    mainSheets,
    annexSheetAttachments,
    annexSheets,
    totalDocumentPages,
    showSubmittalsIndex: allAttachments.length > 0 && showSubmittalsIndex !== false,
    submittalsIndexEntries
  };
}

export function resolveTableColumnLayout(columnConfig?: QuotationPresetColumns): {
  showUnitPrice: boolean;
  showUom: boolean;
  showLineTotal: boolean;
  showItemAttributes: boolean;
  widths: {
    sl: string;
    description: string;
    qty: string;
    uom: string;
    unitPrice: string;
    lineTotal: string;
  };
  activeColumnCount: number;
} {
  const cfg = columnConfig || {};
  const showUnitPrice =
    cfg.showUnitPrice !== undefined ? cfg.showUnitPrice !== false : cfg.unit_price !== false;
  const showUom = cfg.showUom !== false;
  const showLineTotal = cfg.showLineTotal !== false;
  const showItemAttributes = cfg.showItemAttributes !== false;

  const slWidth = 5;
  const qtyWidth = 7;
  const uomWidth = showUom ? 10 : 0;
  const unitPriceWidth = showUnitPrice ? 12 : 0;
  const lineTotalWidth = showLineTotal ? 14 : 0;
  const descriptionWidth = 100 - (slWidth + qtyWidth + uomWidth + unitPriceWidth + lineTotalWidth);

  const activeColumnCount =
    2 + (showUom ? 1 : 0) + 1 + (showUnitPrice ? 1 : 0) + (showLineTotal ? 1 : 0);

  return {
    showUnitPrice,
    showUom,
    showLineTotal,
    showItemAttributes,
    widths: {
      sl: `${slWidth}%`,
      description: `${descriptionWidth}%`,
      qty: `${qtyWidth}%`,
      uom: `${uomWidth}%`,
      unitPrice: `${unitPriceWidth}%`,
      lineTotal: `${lineTotalWidth}%`
    },
    activeColumnCount
  };
}

export function resolveSpacerPresentation(block: QuotationBlockConfig): {
  heightStyle: string | undefined;
  className: string;
  badgeLabel: string;
} {
  const isFill = Boolean(block.spacer_fill_remaining);
  const mm = block.spacer_height_mm ?? 20;
  return {
    heightStyle: isFill ? undefined : `${mm}mm`,
    className: isFill ? 'flex-1 w-full min-h-[10mm]' : 'w-full shrink-0',
    badgeLabel: isFill ? '↕ Spacer: Fill' : `↕ Spacer: ${mm}mm`
  };
}

export function toggleBlockVisibilityInList(
  blocks: QuotationBlockConfig[],
  id: QuotationBlockId,
  enabled: boolean
): QuotationBlockConfig[] {
  return blocks.map((b) =>
    b.id === id ? { ...b, enabled, is_visible: enabled } : b
  );
}

export function resolveModularLayoutBlocks(
  rawBlocks: QuotationBlockConfig[] = DEFAULT_QUOTATION_BLOCKS,
  resolvedBlockStyle: 'framed' | 'minimal' = 'framed',
  options?: {
    hasExplicitLayoutBlocks?: boolean;
    showBankRemittance?: boolean;
    showSignatories?: boolean;
    showCustomerAcceptance?: boolean;
  }
): QuotationBlockConfig[] {
  return rawBlocks.map((b) => {
    let enabled = b.enabled !== false && b.is_visible !== false;
    const placement: 'left' | 'right' | 'full' = b.placement || 'full';

    if (b.id === 'remittance' || b.type === 'remittance') {
      if (options?.showBankRemittance === false) {
        enabled = false;
      }
    } else if (
      b.id === 'signatory' ||
      b.id === 'signatories' ||
      b.type === 'signatory' ||
      b.type === 'signatories'
    ) {
      if (options?.showSignatories === false) {
        enabled = false;
      }
    } else if (b.id === 'acceptance' || b.type === 'acceptance') {
      if (options?.showCustomerAcceptance === false) {
        enabled = false;
      }
    }

    return {
      ...b,
      enabled,
      is_visible: enabled,
      placement,
      style: b.style || resolvedBlockStyle,
      fontScale: b.fontScale || 'standard',
      padding: b.padding || 'standard'
    };
  });
}

export const DEFAULT_HEADER_CONFIG: QuotationHeaderConfig = {
  alignment: 'split',
  headerLayoutMode: 'split_left',
  logoDisplayMode: 'logo_and_name',
  showLogo: true,
  showPhone: true,
  showEmail: true,
  showWebsite: true,
  showTrn: true,
  showCompanyName: true,
  logoSpacing: 'normal',
  logoHeightPx: 48,
  logoMaxWidthPx: 260,
  repeatHeaderOnSubsequentPages: true,
  showLogoOnContinuationPages: true
};

export interface ResolvedHeaderBrandingConfig {
  activeLogoUrl: string;
  logoDisplayMode: 'logo_and_name' | 'logo_only' | 'full_banner' | 'no_logo';
  headerLayoutMode: 'split_left' | 'split_right' | 'centered' | 'banner';
  showLogo: boolean;
  showCompanyName: boolean;
  logoHeightPx: number;
  logoMaxWidthPx: number;
  bannerMaxHeightPx: number;
  logoSpacing: 'none' | 'tight' | 'normal' | 'spacious';
  repeatHeaderOnSubsequentPages: boolean;
  showLogoOnContinuationPages: boolean;
  includeMiniLogoOnContinuation: boolean;
}

/**
 * Pure deterministic resolver for the Corporate Logo & Letterhead Engine.
 * Resolves logo source priority (headerConfig.logoUrl -> quotation.company_logo_url -> profile.logo_url -> ''),
 * 4-way display mode, 4-way layout mode, aspect-ratio dimensions, and Page 2+ mini-logo eligibility.
 */
export function resolveHeaderBrandingConfig(
  headerConfig?: QuotationHeaderConfig | null,
  quotation?: Partial<Quotation> | null,
  profile?: Partial<WorkspaceDocumentProfile> | null
): ResolvedHeaderBrandingConfig {
  const merged: QuotationHeaderConfig = {
    ...DEFAULT_HEADER_CONFIG,
    ...(profile?.header_config || {}),
    ...(quotation?.header_config || {}),
    ...(headerConfig || {})
  };

  // Explicit logoUrl override in headerConfig or quotation takes priority over workspace profile logo_url.
  // Note: if headerConfig.logoUrl is explicitly set to '' (empty string) and quotation.company_logo_url is '',
  // we fall back to profile?.logo_url only if neither headerConfig nor quotation explicitly cleared it,
  // OR if headerConfig.logoUrl || quotation.company_logo_url || profile.logo_url is non-empty.
  const hasExplicitEmptyOverride =
    (headerConfig && headerConfig.logoUrl === '') ||
    (quotation && quotation.company_logo_url === '' && headerConfig?.logoUrl === '');

  const activeLogoUrl = hasExplicitEmptyOverride
    ? ''
    : (
        merged.logoUrl ||
        quotation?.header_config?.logoUrl ||
        quotation?.company_logo_url ||
        profile?.logo_url ||
        (profile as any)?.company_logo_url ||
        ''
      ).trim();

  let logoDisplayMode: 'logo_and_name' | 'logo_only' | 'full_banner' | 'no_logo' =
    merged.logoDisplayMode || 'logo_and_name';

  if (merged.showLogo === false || logoDisplayMode === 'no_logo') {
    logoDisplayMode = 'no_logo';
  }

  let headerLayoutMode: 'split_left' | 'split_right' | 'centered' | 'banner' =
    merged.headerLayoutMode ||
    (logoDisplayMode === 'full_banner'
      ? 'banner'
      : merged.alignment === 'centered' ||
        quotation?.header_layout === 'centered_banner' ||
        profile?.header_layout === 'centered_banner'
      ? 'centered'
      : (quotation?.logo_position || profile?.logo_position) === 'right'
      ? 'split_right'
      : 'split_left');

  if (logoDisplayMode === 'full_banner') {
    headerLayoutMode = 'banner';
  }

  const showLogo = merged.showLogo !== false && logoDisplayMode !== 'no_logo';
  const showCompanyName =
    logoDisplayMode !== 'logo_only' && merged.showCompanyName !== false;

  const rawHeight = typeof merged.logoHeightPx === 'number' ? merged.logoHeightPx : 48;
  const logoHeightPx = Math.min(110, Math.max(28, rawHeight));

  const isBanner = logoDisplayMode === 'full_banner' || headerLayoutMode === 'banner';
  const explicitMaxWidth =
    headerConfig?.logoMaxWidthPx ??
    quotation?.header_config?.logoMaxWidthPx ??
    profile?.header_config?.logoMaxWidthPx;
  const logoMaxWidthPx =
    typeof explicitMaxWidth === 'number' && explicitMaxWidth > 0
      ? isBanner && explicitMaxWidth === 260
        ? 700
        : explicitMaxWidth
      : isBanner
      ? 700
      : 260;

  const bannerMaxHeightPx = Math.max(logoHeightPx, 80);
  const logoSpacing = merged.logoSpacing || 'normal';

  const repeatHeaderOnSubsequentPages =
    merged.repeatHeaderOnSubsequentPages !== false &&
    quotation?.repeatHeaderOnSubsequentPages !== false &&
    profile?.repeatHeaderOnSubsequentPages !== false;

  const showLogoOnContinuationPages = merged.showLogoOnContinuationPages !== false;
  const includeMiniLogoOnContinuation =
    Boolean(activeLogoUrl) && showLogo && showLogoOnContinuationPages;

  return {
    activeLogoUrl,
    logoDisplayMode,
    headerLayoutMode,
    showLogo,
    showCompanyName,
    logoHeightPx,
    logoMaxWidthPx,
    bannerMaxHeightPx,
    logoSpacing,
    repeatHeaderOnSubsequentPages,
    showLogoOnContinuationPages,
    includeMiniLogoOnContinuation
  };
}

export const DEFAULT_FOOTER_CONFIG: QuotationFooterConfig = {
  showPageNumbers: true,
  showDisclaimer: true,
  customDisclaimer: 'Computer-generated commercial document. Valid without manual signature when electronically issued.',
  showBankRemittance: true,
  showCustomerAcceptance: true,
  showSignatories: true,
  footerLayoutMode: 'split'
};

export const DEFAULT_RECIPIENT_CONFIG: QuotationRecipientConfig = {
  layout: 'split',
  showAttention: true,
  showSalesRep: true,
  showValidity: true,
  showEnquiryRef: true,
  showSubject: true,
  recipientPlacement: 'left',
  recipientCardWidth: '50',
  offerPlacement: 'right',
  offerCardWidth: '50'
};

export interface QuotationSheetPage {
  pageNumber: number;
  items: QuotationLineItem[];
  startIndex: number;
  hasClosingBlocks: boolean;
  isFirstPage: boolean;
  isLastPage: boolean;
}

export interface QuotationDocumentProps {
  quotation: Quotation;
  profile?: WorkspaceDocumentProfile | null;
  visibleColumns?: QuotationPresetColumns;
  columnConfig?: QuotationPresetColumns;
  isCompactView?: boolean;
  tableDensity?: QuotationTableDensity;
  tableFontScale?: QuotationTableFontScale;
  fontSizeScale?: QuotationFontSizeScale;
  headerConfig?: QuotationHeaderConfig;
  recipientConfig?: QuotationRecipientConfig;
  footerConfig?: QuotationFooterConfig;
  pageMode?: QuotationPageMode;
  showBankDetails?: boolean;
  showStampAndSignatures?: boolean;
  user?: { displayName?: string; name?: string; email?: string } | null;
  signatoryName?: string;
  signatoryTitle?: string;
  enquiry?: any;
  salesRepName?: string;
  blockStyle?: 'framed' | 'minimal';
  globalCardRadius?: 'rounded' | 'sharp';
  cardsOrder?: 'recipient_first' | 'offer_first';
  subjectPlacement?: 'above_cards' | 'below_cards';
  layoutBlocks?: QuotationBlockConfig[];
  selectedBlockId?: StudioSelectedSection;
  selectedSection?: StudioSelectedSection;
  onSelectBlock?: (id: StudioSelectedSection) => void;
  onSelectSection?: (section: StudioSelectedSection) => void;
  showPageBreakGuides?: boolean;
}

export const QuotationDocument: React.FC<QuotationDocumentProps> = ({
  quotation,
  profile,
  visibleColumns: propVisibleColumns = {} as QuotationPresetColumns,
  columnConfig: propColumnConfig,
  isCompactView = true,
  tableDensity: propTableDensity,
  tableFontScale: propTableFontScale,
  fontSizeScale: propFontSizeScale,
  headerConfig: propHeaderConfig,
  recipientConfig: propRecipientConfig,
  footerConfig: propFooterConfig,
  pageMode: propPageMode,
  showBankDetails = true,
  showStampAndSignatures = true,
  user,
  signatoryName,
  signatoryTitle,
  enquiry,
  salesRepName,
  blockStyle = 'framed',
  globalCardRadius: propGlobalCardRadius,
  cardsOrder: propCardsOrder,
  subjectPlacement: propSubjectPlacement,
  layoutBlocks,
  selectedBlockId,
  selectedSection,
  onSelectBlock,
  onSelectSection,
  showPageBreakGuides = false
}: QuotationDocumentProps) => {
  const [logoLoadFailed, setLogoLoadFailed] = React.useState(false);
  const currency = quotation.currency || quotation.applied_bank_account?.currency || 'AED';

  // Visual page-break cut line and multi-page pagination engine
  const sheetRef = React.useRef<HTMLElement | null>(null);
  const page2Ref = React.useRef<HTMLElement | null>(null);
  const tableRef = React.useRef<HTMLDivElement | null>(null);
  const sheetElsRef = React.useRef<Record<number, HTMLElement | null>>({});
  const [overflowingSheets, setOverflowingSheets] = React.useState<Record<number, boolean>>({});

  // Resolve presentation theme & block style
  const resolvedBlockStyle: 'framed' | 'minimal' =
    blockStyle ||
    quotation.block_style ||
    (quotation as any).presentation_preset?.block_style ||
    'framed';
  const isMinimal = resolvedBlockStyle === 'minimal';

  const resolvedFooterConfig: QuotationFooterConfig = {
    ...DEFAULT_FOOTER_CONFIG,
    ...(profile?.footer_config || {}),
    ...(quotation.footer_config || {}),
    ...(propFooterConfig || {})
  };

  const showBankRemittance =
    resolvedFooterConfig.showBankRemittance ??
    quotation.showBankRemittance ??
    quotation.show_bank_details ??
    profile?.showBankRemittance ??
    profile?.show_bank_details ??
    showBankDetails ??
    true;

  const showCustomerAcceptance =
    resolvedFooterConfig.showCustomerAcceptance ??
    quotation.showCustomerAcceptance ??
    quotation.customer_acceptance_enabled ??
    profile?.showCustomerAcceptance ??
    profile?.customer_acceptance_enabled ??
    true;

  const showSignatories =
    resolvedFooterConfig.showSignatories ??
    quotation.showSignatories ??
    showStampAndSignatures ??
    true;

  const footerLayoutMode: 'split' | 'stacked' | 'seller_only' =
    resolvedFooterConfig.footerLayoutMode ||
    quotation.footerLayoutMode ||
    profile?.footerLayoutMode ||
    'split';

  const rawLineItems: QuotationLineItem[] = React.useMemo(() => {
    return quotation.line_items || [];
  }, [quotation.line_items]);

  const hasExplicitLayoutBlocks = Boolean(
    (layoutBlocks && layoutBlocks.length > 0) ||
    (quotation.layout_blocks && quotation.layout_blocks.length > 0) ||
    ((quotation as any).presentation_preset?.layout_blocks &&
      (quotation as any).presentation_preset.layout_blocks.length > 0)
  );

  // Resolve modular layout blocks using each block's own placement & visibility directly
  const resolvedBlocks: QuotationBlockConfig[] = React.useMemo(() => {
    const raw =
      layoutBlocks ||
      quotation.layout_blocks ||
      (quotation as any).presentation_preset?.layout_blocks ||
      DEFAULT_QUOTATION_BLOCKS;

    return resolveModularLayoutBlocks(raw, resolvedBlockStyle, {
      hasExplicitLayoutBlocks,
      showBankRemittance,
      showSignatories,
      showCustomerAcceptance
    });
  }, [
    layoutBlocks,
    quotation.layout_blocks,
    (quotation as any).presentation_preset?.layout_blocks,
    resolvedBlockStyle,
    hasExplicitLayoutBlocks,
    showBankRemittance,
    showSignatories,
    showCustomerAcceptance
  ]);

  // Resolve theme accent
  const activeThemeKey: QuotationThemeAccent =
    quotation.theme_accent || profile?.theme_accent || 'navy';
  const theme = QUOTATION_THEMES[activeThemeKey] || QUOTATION_THEMES.navy;
  const accentColor = profile?.accent_color || theme.primaryHex;

  // Resolve presentation controls
  const logoPosition: QuotationLogoPosition =
    quotation.logo_position || profile?.logo_position || 'left';
  const headerLayout: QuotationHeaderLayout =
    quotation.header_layout || profile?.header_layout || 'split';
  const tableDensity: QuotationTableDensity =
    propTableDensity || quotation.table_density || profile?.table_density || (isCompactView ? 'compact' : 'comfortable');
  const tableFontScale: QuotationTableFontScale =
    propTableFontScale || quotation.table_font_scale || profile?.table_font_scale || (tableDensity === 'compact' ? 'compact' : 'standard');

  const fontSizeScale: 'compact' | 'standard' | 'comfortable' | 'large' =
    propFontSizeScale ||
    quotation.fontSizeScale ||
    quotation.font_size_scale ||
    profile?.fontSizeScale ||
    profile?.font_size_scale ||
    (tableFontScale === 'compact' ? 'compact' : tableFontScale === 'prominent' ? 'comfortable' : 'standard') ||
    'standard';

  const typoScale = React.useMemo(() => {
    switch (fontSizeScale) {
      case 'compact':
        return {
          body: 'text-[8.5px] print:text-[8px]',
          heading: 'text-[9.5px] print:text-[9px]',
          sub: 'text-[8px] print:text-[7.5px]',
          rawBase: '8.5px'
        };
      case 'comfortable':
        return {
          body: 'text-[10.5px] print:text-[10px]',
          heading: 'text-[11.5px] print:text-[11px]',
          sub: 'text-[9.5px] print:text-[9px]',
          rawBase: '10.5px'
        };
      case 'large':
        return {
          body: 'text-[11.5px] print:text-[11px]',
          heading: 'text-[12.5px] print:text-[12px]',
          sub: 'text-[10.5px] print:text-[10px]',
          rawBase: '11.5px'
        };
      case 'standard':
      default:
        return {
          body: 'text-[9.5px] print:text-[9px]',
          heading: 'text-[10.5px] print:text-[10px]',
          sub: 'text-[8.5px] print:text-[8px]',
          rawBase: '9.5px'
        };
    }
  }, [fontSizeScale]);


  const resolvedShowBankDetails: boolean =
    quotation.show_bank_details ?? profile?.show_bank_details ?? showBankDetails;
  const resolvedShowCommercialTerms: boolean =
    quotation.show_commercial_terms ?? profile?.show_commercial_terms ?? true;
  const resolvedShowCompanySeal: boolean =
    quotation.show_company_seal ?? profile?.show_company_seal ?? true;

  const activeSelectedSection: StudioSelectedSection = selectedSection !== undefined ? selectedSection : (selectedBlockId as StudioSelectedSection);
  const isHeaderSelected = activeSelectedSection === 'header';
  const isRecipientSelected = activeSelectedSection === 'recipient_info' || activeSelectedSection === 'recipient_meta';
  const isQuoteMetaSelected = activeSelectedSection === 'quote_meta';
  const isTableSelected = activeSelectedSection === 'items_table';
  const isFooterSelected = activeSelectedSection === 'footer';
  const isInteractive = Boolean(onSelectSection || onSelectBlock);

  const resolvedHeaderConfig: QuotationHeaderConfig = {
    ...DEFAULT_HEADER_CONFIG,
    ...(profile?.header_config || {}),
    ...(quotation.header_config || {}),
    ...(propHeaderConfig || {})
  };

  const headerBranding = React.useMemo(
    () => resolveHeaderBrandingConfig(resolvedHeaderConfig, quotation, profile),
    [resolvedHeaderConfig, quotation, profile]
  );

  React.useEffect(() => {
    setLogoLoadFailed(false);
  }, [headerBranding.activeLogoUrl]);

  const repeatHeaderOnSubsequentPages = headerBranding.repeatHeaderOnSubsequentPages;

  const resolvedRecipientConfig: QuotationRecipientConfig = {
    ...DEFAULT_RECIPIENT_CONFIG,
    ...(profile?.recipient_config || {}),
    ...(quotation.recipient_config || {}),
    ...(propRecipientConfig || {})
  };


  // Table Density & Typography helpers
  const isCompact = tableDensity === 'compact';
  const thPad = isCompact ? 'py-1.5' : 'py-2.5';
  const tdPad = isCompact ? 'py-1.5' : 'py-2.5';
  const explicitTableFont = propTableFontScale || quotation.table_font_scale;
  const tableFontSize =
    !propFontSizeScale && !quotation.fontSizeScale && explicitTableFont === 'compact'
      ? 'text-[8.5px] print:text-[8px]'
      : !propFontSizeScale && !quotation.fontSizeScale && explicitTableFont === 'prominent'
      ? 'text-[10.5px] print:text-[10px]'
      : typoScale.body;
  const tableHeadingSize =
    !propFontSizeScale && !quotation.fontSizeScale && explicitTableFont === 'compact'
      ? 'text-[9.5px] print:text-[9px]'
      : !propFontSizeScale && !quotation.fontSizeScale && explicitTableFont === 'prominent'
      ? 'text-[11.5px] print:text-[11px]'
      : typoScale.heading;

  const showAmountInWords =
    quotation.showAmountInWords ??
    quotation.show_amount_in_words ??
    quotation.amount_in_words_enabled ??
    propVisibleColumns?.showAmountInWords ??
    profile?.showAmountInWords ??
    profile?.amount_in_words_enabled ??
    true;
  const amountInWordsEnabled = showAmountInWords;
  const customerAcceptanceEnabled =
    quotation.customer_acceptance_enabled ?? profile?.customer_acceptance_enabled ?? true;
  const signatoryType: 'single' | 'dual' =
    quotation.signatory_type ||
    profile?.signatory_type ||
    (quotation.signatories && quotation.signatories.length > 1 ? 'dual' : 'single');
  const signatureStyle: QuotationSignatureStyle =
    quotation.signature_style || profile?.signature_style || 'script';

  // Helper formatting numbers
  const formatCurrency = (val?: number) => {
    const num = Number(val) || 0;
    return `${currency} ${num.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  };

  const formatDate = (isoString?: string) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return isoString;
      return d.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
    } catch {
      return isoString;
    }
  };

  // Determine active columns & technical attributes config
  const columnConfig: QuotationPresetColumns = propColumnConfig || propVisibleColumns || quotation.visible_columns || {};
  const showBrand = columnConfig.brand ?? true;
  const showModel = columnConfig.model ?? true;
  const showOrigin = columnConfig.origin ?? true;
  const showAvailability = columnConfig.availability ?? true;
  const tableColLayout = React.useMemo(() => resolveTableColumnLayout(columnConfig), [columnConfig]);
  const showUnitPrice = tableColLayout.showUnitPrice;
  const showUom = tableColLayout.showUom;
  const showLineTotal = tableColLayout.showLineTotal;
  const showItemAttributes = tableColLayout.showItemAttributes;
  const attributeDisplayFormat = columnConfig.attributeDisplayFormat || 'pills';
  const hiddenAttributeKeys: string[] = columnConfig.hiddenAttributeKeys || [];

  // Dynamic Table Column Geometry & Predictable Allocation
  const colWidths = React.useMemo(() => {
    return {
      sl: { className: 'w-10' },
      desc: { className: 'w-auto' },
      brand: { className: 'w-20' },
      model: { className: 'w-20' },
      origin: { className: 'w-20' },
      delivery: { className: 'w-20' },
      qty: { className: 'w-14' },
      uom: { className: 'w-24' },
      unit: { className: 'w-24' },
      unitPrice: { className: 'w-28' },
      total: { className: 'w-28' }
    };
  }, []);

  // Resolve sender info from profile with fallback to quotation.sender_snapshot
  const senderEntityName =
    profile?.legal_entity_name ||
    (profile as any)?.company_name ||
    quotation.sender_snapshot?.entity_name ||
    'Commercial Entity';
  const senderTrn =
    profile?.trn ||
    (profile as any)?.trn_vat_number ||
    quotation.sender_snapshot?.trn;
  const senderAddress =
    (profile as any)?.registered_address ||
    [
      profile?.address_line_1 || quotation.sender_snapshot?.address,
      profile?.address_line_2,
      profile?.city,
      profile?.country
    ]
      .filter(Boolean)
      .join(', ');
  const senderPhone = profile?.phone || quotation.sender_snapshot?.phone;
  const senderEmail = profile?.email || quotation.sender_snapshot?.email;
  const senderWebsite = profile?.website;

  // Bank account selection: prefer explicitly applied on quotation / selectedBank, then by remittanceBankId, then profile default, then first profile account
  const rawBank: any =
    quotation.selectedBank ||
    quotation.selected_bank ||
    propFooterConfig?.selectedBank ||
    (quotation.remittanceBankId || propFooterConfig?.remittanceBankId || quotation.remittance_bank_id
      ? profile?.bank_accounts?.find(
          (b) => b.id === (quotation.remittanceBankId || propFooterConfig?.remittanceBankId || quotation.remittance_bank_id)
        ) ||
        (profile as any)?.bankAccounts?.find(
          (b: any) => b.id === (quotation.remittanceBankId || propFooterConfig?.remittanceBankId || quotation.remittance_bank_id)
        )
      : undefined) ||
    quotation.applied_bank_account ||
    profile?.bank_accounts?.find((b) => b.is_default || (b as any).isDefault) ||
    profile?.bank_accounts?.[0] ||
    (profile as any)?.bankAccounts?.find((b: any) => b.isDefault || b.is_default) ||
    (profile as any)?.bankAccounts?.[0];

  const resolvedBank = React.useMemo(() => {
    if (!rawBank) return undefined;
    const bName = (rawBank.bankName || rawBank.bank_name || '').trim();
    const bAcctNo = (rawBank.accountNumber || rawBank.account_number || '').trim();
    const bIban = (rawBank.iban || '').trim();
    const bSwift = (rawBank.swiftCode || rawBank.swift_bic || '').trim();
    const bBeneficiary = (
      rawBank.beneficiaryName ||
      rawBank.account_name ||
      profile?.legal_entity_name ||
      (profile as any)?.company_legal_name ||
      senderEntityName ||
      ''
    ).trim();

    if (!bName && !bAcctNo && !bIban && !bSwift) return undefined;

    return {
      bankName: bName || 'Corporate Bank',
      beneficiaryName: bBeneficiary || 'Account Holder',
      accountNumber: bAcctNo,
      iban: bIban,
      swiftCode: bSwift,
      currency: rawBank.currency || currency || 'AED'
    };
  }, [rawBank, profile, senderEntityName, currency]);

  const bankAccount: DocumentProfileBankAccount | undefined = rawBank;
  const enquiryRef = quotation.enquiry_id || enquiry?.enquiry_number || enquiry?.reference || enquiry?.id;
  const resolvedSalesRep =
    salesRepName ||
    quotation.prepared_by ||
    (quotation as any)?.salesperson_name ||
    enquiry?.assigned_salesperson ||
    enquiry?.assignedSalesperson ||
    enquiry?.sales_representative ||
    enquiry?.salesperson ||
    user?.displayName;

  // Resolved B2B Client Details
  const clientEntityName = quotation.client_snapshot?.entity_name || 'Client Name / Unspecified';
  const clientContactPerson =
    quotation.client_contact_person ||
    quotation.client_snapshot?.client_contact_person ||
    quotation.client_snapshot?.contact_person ||
    enquiry?.contact_person_name ||
    (enquiry as any)?.contact_name ||
    enquiry?.concerned_person;
  const clientAddress = quotation.client_address || quotation.client_snapshot?.client_address || quotation.client_snapshot?.address || quotation.client_snapshot?.city || 'United Arab Emirates';
  const clientTrn = quotation.client_trn || quotation.client_snapshot?.client_trn || quotation.client_snapshot?.trn;
  const clientPhone = quotation.client_phone || quotation.client_snapshot?.client_phone || quotation.client_snapshot?.phone;
  const clientEmail = quotation.client_email || quotation.client_snapshot?.client_email || quotation.client_snapshot?.email;

  // Resolved Signatories for executive signatory block
  const resolvedSignatories = React.useMemo(() => {
    const list: Array<{ name: string; title: string; signature_url?: string }> = [];

    // Helper to detect unpopulated or initial-only values (e.g. "SS", "PV", or <= 3 chars all uppercase)
    const isUnsetOrInitials = (val?: string | null): boolean => {
      if (!val) return true;
      const trimmed = val.trim();
      return !trimmed || trimmed === 'SS' || (trimmed.length <= 3 && trimmed === trimmed.toUpperCase());
    };

    const rawPName =
      signatoryName ||
      quotation.primary_signatory_name ||
      quotation.signatories?.[0]?.name;

    let pName = rawPName;

    // If unset or initials only, resolve via 5-tier fallback hierarchy
    if (isUnsetOrInitials(pName)) {
      const candidates = [
        salesRepName,
        enquiry?.sales_representative,
        enquiry?.salesperson,
        enquiry?.assignedSalesperson,
        enquiry?.sales_person,
        (quotation as any)?.salesperson_name,
        (quotation as any)?.assigned_to_name,
        profile?.primary_signatory_name,
        user?.displayName,
        user?.name
      ];

      const match = candidates.find((c) => !isUnsetOrInitials(c));
      pName = match ? match.trim() : (senderEntityName ? `${senderEntityName} Authorized Signatory` : 'Authorized Signatory');
    }

    const pTitle =
      signatoryTitle ||
      quotation.primary_signatory_title ||
      quotation.signatories?.[0]?.designation ||
      profile?.primary_signatory_title ||
      'Authorized Representative';
    const pUrl = quotation.signatories?.[0]?.signature_url;

    list.push({ name: pName || 'Authorized Signatory', title: pTitle, signature_url: pUrl });

    if (signatoryType === 'dual') {
      const sName =
        quotation.secondary_signatory_name ||
        quotation.signatories?.[1]?.name ||
        profile?.secondary_signatory_name ||
        'Authorized Director';
      const sTitle =
        quotation.secondary_signatory_title ||
        quotation.signatories?.[1]?.designation ||
        profile?.secondary_signatory_title ||
        'Commercial Approver';
      const sUrl = quotation.signatories?.[1]?.signature_url;
      list.push({ name: sName, title: sTitle, signature_url: sUrl });
    }
    return list;
  }, [
    signatoryName,
    signatoryTitle,
    salesRepName,
    enquiry?.sales_representative,
    enquiry?.salesperson,
    enquiry?.assignedSalesperson,
    enquiry?.sales_person,
    user?.displayName,
    user?.name,
    quotation.primary_signatory_name,
    quotation.primary_signatory_title,
    quotation.secondary_signatory_name,
    quotation.secondary_signatory_title,
    quotation.signatories,
    (quotation as any)?.salesperson_name,
    (quotation as any)?.assigned_to_name,
    profile?.primary_signatory_name,
    profile?.primary_signatory_title,
    profile?.secondary_signatory_name,
    profile?.secondary_signatory_title,
    senderEntityName,
    signatoryType
  ]);

  // Compact corporate running header rendered on Page 2+ (continuation sheets)
  const renderCompactRunningHeader = (pageNumber = 2, total = 2, extraClass = '') => {
    if (!repeatHeaderOnSubsequentPages) return null;
    const quoteRef = quotation.formatted_quote_ref || quotation.quote_number || 'QT-DRAFT';
    const subjectText = quotation.subject?.trim();

    return (
      <div
        className={`compact-running-header flex justify-between items-center border-b border-slate-200 pb-1.5 mb-3 w-full bg-white ${extraClass}`}
        style={{ height: '26px' }}
      >
        {/* Left: Mini Logo + Company Legal/Short Name */}
        <div className="flex items-center min-w-0 max-w-[36%]">
          {headerBranding.includeMiniLogoOnContinuation && !logoLoadFailed && (
            <img
              src={headerBranding.activeLogoUrl}
              alt=""
              className="h-5 w-auto max-w-[110px] object-contain mr-2 shrink-0"
              onError={() => setLogoLoadFailed(true)}
            />
          )}
          <div className="text-[9px] print:text-[8px] font-bold text-slate-800 tracking-tight uppercase truncate">
            {senderEntityName || 'Company'}
          </div>
        </div>

        {/* Middle: Project Subject & Quotation Ref No */}
        <div className="text-[8.5px] print:text-[7.5px] text-slate-600 font-medium truncate max-w-[260px] text-center px-2">
          {subjectText ? `${subjectText} • ` : ''}{quoteRef}
        </div>

        {/* Right: Date & Document Ref indicator */}
        <div className="text-[8px] print:text-[7.5px] text-slate-500 font-mono text-right shrink-0">
          {formatDate(quotation.created_at)} • {quoteRef} • Page {pageNumber} of {total}
        </div>
      </div>
    );
  };

  // Reusable micro-footer watermark helper
  const renderFooter = (pageNumber: number, totalPages: number) => (
    <footer
      className={`document-print-footer quotation-page-footer mt-auto pt-2 border-t border-slate-200 bg-white text-xs break-inside-avoid page-break-inside-avoid w-full print:mt-auto print:border-t print:border-slate-200 relative z-10 group transition-all duration-150 rounded-lg quotation-structural-section ${
        isInteractive ? 'cursor-pointer' : ''
      } ${
        isFooterSelected
          ? 'ring-2 ring-blue-500 ring-offset-2 shadow-sm print:ring-0 !print:ring-0 print:outline-none !print:outline-none print:shadow-none !print:shadow-none'
          : isInteractive
          ? 'hover:ring-1 hover:ring-blue-300 print:ring-0 !print:ring-0 print:outline-none !print:outline-none'
          : ''
      }`}
      onClick={isInteractive ? (e) => {
        e.stopPropagation();
        onSelectSection?.('footer');
        onSelectBlock?.('footer' as any);
      } : undefined}
      style={{
        width: '100%',
        maxWidth: '100%',
        marginTop: 'auto',
        position: 'relative',
        zIndex: 1,
        backgroundColor: '#ffffff',
        paddingTop: '2mm',
        breakInside: 'avoid',
        pageBreakInside: 'avoid'
      }}
    >
      {isInteractive && (
        <div className={`quotation-canvas-guide absolute -top-2.5 right-3 px-2 py-0.5 rounded text-[9px] font-semibold tracking-wide uppercase shadow-xs transition-opacity print:hidden z-10 ${
          isFooterSelected ? 'bg-blue-600 text-white opacity-100' : 'bg-slate-200 text-slate-700 opacity-0 group-hover:opacity-100'
        }`}>
          Footer &amp; Legal
        </div>
      )}
      <div className="flex flex-col sm:flex-row justify-between items-center text-[9.5px] text-slate-400 w-full print:flex-row print:justify-between print:text-[8.5px]" style={{ width: '100%', maxWidth: '100%' }}>
        <span className="flex items-center gap-1.5 flex-wrap">
          <span>Omni Suite Commercial Engine</span>
          <span>•</span>
          <span className="font-mono font-medium text-slate-500">Ref: {quotation.formatted_quote_ref || quotation.quote_number}</span>
          <span>•</span>
          <span>Rev {quotation.revision_number || 1}</span>
          <span>•</span>
          <span className="font-semibold uppercase text-slate-500">
            {String(quotation.status || 'Draft').toUpperCase()}
          </span>
          {enquiry?.enquiry_number && (
            <>
              <span>•</span>
              <span>Enq: {enquiry.enquiry_number}</span>
            </>
          )}
          <span>•</span>
          <span>Date: {formatDate(quotation.created_at)}</span>
          {resolvedFooterConfig.showPageNumbers !== false && (
            <>
              <span>•</span>
              <span className="font-mono text-[9px] text-slate-500">
                Page {pageNumber} of {totalPages}
              </span>
            </>
          )}
        </span>
        {resolvedFooterConfig.showDisclaimer !== false && (
          <span className="mt-1 sm:mt-0 italic">
            {resolvedFooterConfig.customDisclaimer || 'Computer-generated commercial document. Valid without manual signature when electronically issued.'}
          </span>
        )}
      </div>
    </footer>
  );

  // Partition active layoutBlocks + lineItems + flyer_attachments into discrete A4 main & annex sheets
  const paginationWithAnnexes = React.useMemo(() => {
    const activeBlocks = resolvedBlocks.filter((b) => {
      if (b.enabled === false || b.is_visible === false) return false;
      if (!hasExplicitLayoutBlocks) {
        if (b.id === 'terms' && !resolvedShowCommercialTerms) return false;
        if (b.id === 'remittance' && !resolvedShowBankDetails) return false;
        if ((b.id === 'signatory' || b.id === 'signatories') && !showStampAndSignatures) return false;
        if (b.id === 'acceptance' && !customerAcceptanceEnabled) return false;
      }
      return true;
    });

    return resolveDocumentPaginationWithAnnexes(
      activeBlocks,
      rawLineItems,
      quotation.flyer_attachments,
      quotation.show_submittals_index !== false
    );
  }, [
    resolvedBlocks,
    rawLineItems,
    quotation.flyer_attachments,
    quotation.show_submittals_index,
    layoutBlocks,
    quotation.layout_blocks,
    (quotation as any).presentation_preset?.layout_blocks,
    resolvedShowCommercialTerms,
    resolvedShowBankDetails,
    showStampAndSignatures,
    resolvedShowCompanySeal,
    customerAcceptanceEnabled
  ]);

  const sheetPartitions = paginationWithAnnexes.mainSheets;
  const annexSheetAttachments = paginationWithAnnexes.annexSheetAttachments;
  const annexSheets = paginationWithAnnexes.annexSheets;
  const totalDocumentPages = paginationWithAnnexes.totalDocumentPages;
  const totalSheets = totalDocumentPages;
  const totalPages = totalDocumentPages;

  // Dynamically measure sheet height vs 297mm A4 boundary so the overflow warning only shows when a sheet actually overflows
  React.useEffect(() => {
    const checkOverflows = () => {
      const next: Record<number, boolean> = {};
      (Object.entries(sheetElsRef.current) as Array<[string, HTMLElement | null]>).forEach(
        ([idxStr, el]) => {
          const idx = Number(idxStr);
          if (el) {
            next[idx] = isSheetOverflowingA4(el.scrollHeight, el.clientWidth, 6);
          }
        }
      );
      setOverflowingSheets((prev) => {
        const prevKeys = Object.keys(prev);
        const nextKeys = Object.keys(next);
        if (
          prevKeys.length === nextKeys.length &&
          nextKeys.every((k) => prev[Number(k)] === next[Number(k)])
        ) {
          return prev;
        }
        return next;
      });
    };

    checkOverflows();

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => checkOverflows());
      (Object.values(sheetElsRef.current) as Array<HTMLElement | null>).forEach((el) => {
        if (el) ro.observe(el);
      });
      return () => ro.disconnect();
    }
  }, [sheetPartitions, rawLineItems, resolvedBlocks, fontSizeScale, tableDensity, resolvedBlockStyle]);

  // Render compact executive "Attached Technical Submittals & Enclosures" index strip
  const renderSubmittalsIndex = () => {
    if (!paginationWithAnnexes.showSubmittalsIndex || paginationWithAnnexes.submittalsIndexEntries.length === 0) {
      return null;
    }
    const radiusClass =
      (propGlobalCardRadius || quotation.globalCardRadius || profile?.globalCardRadius || resolvedRecipientConfig.globalCardRadius) === 'sharp'
        ? 'rounded-none'
        : 'rounded-lg';

    return (
      <section
        className={`quotation-submittals-index mb-3 print:mb-2 p-2.5 border border-slate-200 bg-slate-50/60 print:bg-transparent print:border-slate-300 break-inside-avoid ${radiusClass}`}
        style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
      >
        <div className="flex items-center justify-between border-b border-slate-200/80 pb-1.5 mb-2">
          <span
            className="text-[9.5px] font-bold uppercase tracking-wider flex items-center gap-1.5"
            style={{ color: accentColor }}
          >
            <FileText className="w-3 h-3 shrink-0" />
            <span>Attached Technical Submittals &amp; Enclosures</span>
          </span>
          <span className="text-[8.5px] font-mono text-slate-500">
            {paginationWithAnnexes.submittalsIndexEntries.length}{' '}
            {paginationWithAnnexes.submittalsIndexEntries.length === 1 ? 'Document' : 'Documents'}
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {paginationWithAnnexes.submittalsIndexEntries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center justify-between gap-2 px-2 py-1 rounded bg-white border border-slate-200/80 print:border-slate-300 text-[9.5px]"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="w-4 h-4 rounded bg-slate-100 text-slate-700 font-mono font-bold text-[8.5px] flex items-center justify-center shrink-0">
                  {entry.indexNumber}
                </span>
                <span className="font-medium text-slate-800 truncate" title={entry.name}>
                  {entry.name}
                </span>
              </div>
              <span
                className={`px-1.5 py-0.5 rounded font-mono text-[8px] font-semibold shrink-0 border ${
                  entry.renderAsAnnexPage
                    ? 'bg-blue-50 text-blue-700 border-blue-200 print:bg-transparent print:text-slate-800 print:border-slate-400'
                    : 'bg-slate-100 text-slate-600 border-slate-200 print:bg-transparent print:text-slate-700 print:border-slate-300'
                }`}
              >
                {entry.badgeLabel}
              </span>
            </div>
          ))}
        </div>
      </section>
    );
  };

  // ========================================================
  // MODULAR DOCUMENT BLOCKS GRID (CSS GRID ROW-SLOT ENGINE)
  // ========================================================
  const renderBlocksGrid = (blocksForSheet: QuotationBlockConfig[] = resolvedBlocks) => {
    const renderTermsBlock = () => {
      const priceBasis = quotation.price_basis?.trim();
      const paymentTerms = quotation.payment_terms?.trim();
      const validityText = quotation.valid_until && quotation.valid_until.trim() !== ''
        ? `Valid until ${formatDate(quotation.valid_until)}`
        : undefined;

      const rawCustomNotes = (quotation.custom_notes && quotation.custom_notes.trim() !== '')
        ? quotation.custom_notes.trim()
        : (quotation.applied_terms && quotation.applied_terms.trim() !== '')
        ? quotation.applied_terms.trim()
        : undefined;

      // Clean Commercial Terms Deduplication:
      // If structured key-value rows (Price Basis, Payment Terms, Validity) are displayed,
      // suppress repeating them verbatim or as labeled lines in the notes block below.
      const customNotes = (() => {
        if (!rawCustomNotes) return undefined;
        const lines = rawCustomNotes.split('\n');
        const filtered = lines.filter((line) => {
          const trimmed = line.trim();
          const lower = trimmed.toLowerCase();
          if (!trimmed) return false;
          if (priceBasis) {
            if (lower.startsWith('price basis:') || lower.startsWith('price basis -') || lower.startsWith('price basis')) return false;
            if (lower === priceBasis.toLowerCase()) return false;
          }
          if (paymentTerms) {
            if (lower.startsWith('payment terms:') || lower.startsWith('payment terms -') || lower.startsWith('payment:') || lower.startsWith('payment -')) return false;
            if (lower === paymentTerms.toLowerCase()) return false;
          }
          if (validityText || quotation.valid_until) {
            if (lower.startsWith('validity:') || lower.startsWith('validity -') || lower.startsWith('valid until:') || lower.startsWith('valid until')) return false;
          }
          return true;
        });
        const cleaned = filtered.join('\n').trim();
        return cleaned.length > 0 ? cleaned : undefined;
      })();

      const hasAnyContent = Boolean(priceBasis || paymentTerms || validityText || customNotes);

      return (
        <div className="terms-card break-inside-avoid page-break-inside-avoid flex-1 flex flex-col justify-between w-full" style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
          <div>
            <div className="flex items-center gap-1.5 font-bold text-slate-800 uppercase tracking-wider text-[calc(var(--block-base)*1.05)] pb-1 border-b border-slate-200">
              <FileCheck className="w-3.5 h-3.5 text-slate-500" />
              Commercial Terms &amp; Conditions
            </div>
            <div className="space-y-1 text-slate-700 text-[var(--block-base)] leading-relaxed mt-2">
              {priceBasis && (
                <p className="flex justify-between">
                  <span className="font-semibold text-slate-500">Price Basis:</span>
                  <span className="text-slate-800 font-medium">{priceBasis}</span>
                </p>
              )}
              {paymentTerms && (
                <p className="flex justify-between">
                  <span className="font-semibold text-slate-500">Payment Terms:</span>
                  <span className="text-slate-800 font-medium">{paymentTerms}</span>
                </p>
              )}
              {validityText && (
                <p className="flex justify-between">
                  <span className="font-semibold text-slate-500">Validity:</span>
                  <span className="text-slate-800 font-medium">{validityText}</span>
                </p>
              )}
              {customNotes && (
                <div className={`whitespace-pre-line text-slate-600 text-xs ${(priceBasis || paymentTerms || validityText) ? 'mt-2 pt-2 border-t border-slate-200/60' : ''}`}>
                  {customNotes}
                </div>
              )}
              {!hasAnyContent && (
                <p className="text-slate-400 italic text-[10px] py-1">
                  No commercial terms specified.
                </p>
              )}
            </div>
          </div>
        </div>
      );
    };

    const renderTotalsBlock = () => (
      <div className="totals-card break-inside-avoid page-break-inside-avoid flex-1 space-y-1.5 w-full flex flex-col justify-between" style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
        <div className="space-y-1.5 w-full">
          <div className="flex justify-between text-slate-600 py-0.5 text-[var(--block-base)]">
            <span>Subtotal:</span>
            <span className="font-mono font-semibold text-slate-800">
              {formatCurrency(quotation.subtotal)}
            </span>
          </div>

          {Number(quotation.freight_amount) > 0 && (
            <div className="flex justify-between text-slate-600 py-0.5 border-t border-slate-100 text-[var(--block-base)]">
              <span>Freight / Logistics:</span>
              <span className="font-mono font-semibold text-slate-800">
                {formatCurrency(quotation.freight_amount)}
              </span>
            </div>
          )}

          {/* Tax Mode Display */}
          {quotation.tax_mode === 'tax_calculated' && (
            <div className="flex justify-between text-slate-600 py-0.5 border-t border-slate-100 text-[var(--block-base)]">
              <span>VAT ({quotation.tax_rate_percent || 5}%):</span>
              <span className="font-mono font-semibold text-slate-800">
                {formatCurrency(quotation.tax_amount)}
              </span>
            </div>
          )}

          {quotation.tax_mode === 'taxes_extra' && (
            <div className="py-0.5 border-t border-slate-100 text-slate-600 space-y-0.5 text-[var(--block-base)]">
              <div className="flex justify-between">
                <span>VAT ({quotation.tax_rate_percent || 5}%):</span>
                <span className="font-mono font-semibold text-slate-800">
                  {formatCurrency(quotation.tax_amount)}
                </span>
              </div>
              <p className="text-[calc(var(--block-base)*0.85)] text-amber-700 not-italic">
                * Taxes EXTRA to client account as applicable
              </p>
            </div>
          )}

          {quotation.tax_mode === 'tax_exempt' && (
            <div className="flex justify-between text-slate-600 py-0.5 border-t border-slate-100 items-center text-[var(--block-base)]">
              <span>Tax Status:</span>
              <span className="px-1.5 py-0.5 text-[calc(var(--block-base)*0.85)] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 rounded">
                Tax Exempt (0%)
              </span>
            </div>
          )}

          {/* Grand Total */}
          <div
            className="flex justify-between items-center pt-2 mt-1 border-t-2 font-extrabold"
            style={{ borderColor: accentColor }}
          >
            <span className="text-slate-900 uppercase tracking-tight text-[calc(var(--block-base)*1.15)]">Grand Total:</span>
            <span className="font-mono font-bold text-[calc(var(--block-base)*1.35)]" style={{ color: accentColor }}>
              {formatCurrency(quotation.grand_total)}
            </span>
          </div>
        </div>

        {/* Amount in Words */}
        {showAmountInWords !== false && (quotation.grand_total ?? 0) > 0 && (
          <div className="text-[calc(var(--block-base)*0.95)] font-medium text-slate-700 not-italic border-t border-slate-100 pt-1.5 mt-1.5 break-words">
            <span className="font-semibold text-slate-800 not-italic">Amount in Words ({currency || 'AED'}): </span>
            <span className="not-italic">{amountToWords(quotation.grand_total, currency)}</span>
          </div>
        )}
      </div>
    );

    const renderRemittanceBlock = () => (
      <div className="remittance-card break-inside-avoid page-break-inside-avoid flex-1 flex flex-col justify-between w-full" style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
        <div>
          <div className="flex items-center gap-1.5 font-bold text-slate-800 uppercase tracking-wider text-[calc(var(--block-base)*1.05)] mb-1 pb-1 border-b border-slate-200/80">
            <Landmark className="w-3.5 h-3.5 text-slate-500" />
            Bank Remittance Details
          </div>
          {resolvedBank ? (
            <div className="text-[var(--block-base)] text-slate-700 space-y-0.5 mt-1.5">
              {resolvedBank.bankName && (
                <p>
                  <span className="text-slate-500">Bank:</span>{' '}
                  <span className="font-semibold text-slate-900">{resolvedBank.bankName}</span>
                </p>
              )}
              {resolvedBank.beneficiaryName && (
                <p>
                  <span className="text-slate-500">Beneficiary:</span>{' '}
                  <span className="font-medium text-slate-800">{resolvedBank.beneficiaryName}</span>
                </p>
              )}
              {resolvedBank.accountNumber && (
                <p>
                  <span className="text-slate-500">Account No:</span>{' '}
                  <span className="font-mono font-medium text-slate-900">
                    {resolvedBank.accountNumber}
                  </span>
                </p>
              )}
              {resolvedBank.iban ? (
                <p>
                  <span className="text-slate-500">IBAN:</span>{' '}
                  <span className="font-mono font-bold text-slate-900">
                    {resolvedBank.iban}
                  </span>
                </p>
              ) : null}
              {resolvedBank.swiftCode ? (
                <p>
                  <span className="text-slate-500">SWIFT / BIC:</span>{' '}
                  <span className="font-mono font-semibold text-slate-900">
                    {resolvedBank.swiftCode}
                  </span>
                </p>
              ) : null}
            </div>
          ) : (
            <div className="text-[var(--block-base)] text-slate-500 italic p-2 mt-1">
              Thank you for your business. Please contact us for electronic wire instructions.
            </div>
          )}
        </div>
      </div>
    );

    const resolvedCompanySealUrl =
      quotation.company_seal_url ||
      (quotation as any).companySettings?.company_seal_url ||
      profile?.stamp_seal_url ||
      '';

    const renderSignatoryBlock = () => (
      <div className="signatory-card break-inside-avoid page-break-inside-avoid flex-1 flex flex-col justify-end w-full" style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
        <div className={`flex items-center ${footerLayoutMode === 'seller_only' ? 'justify-between' : 'justify-end'} gap-5 w-full`}>
          {footerLayoutMode === 'seller_only' && (
            <div className="text-left text-slate-600 pr-4">
              <p className="font-bold text-slate-800 text-[calc(var(--block-base)*1.05)] uppercase tracking-wider">
                For and on behalf of {senderEntityName || 'Company'}
              </p>
              <p className="text-slate-400 text-[calc(var(--block-base)*0.85)] mt-0.5">
                Authorized Signatures &amp; Official Seal
              </p>
            </div>
          )}
          <div className="flex items-center gap-5 shrink-0">
            {/* Official Stamp / Seal */}
            {resolvedShowCompanySeal && (
              <div className="company-seal-box flex flex-col items-center">
                {resolvedCompanySealUrl ? (
                  <img
                    src={resolvedCompanySealUrl}
                    alt="Company Seal"
                    className="max-h-16 max-w-[110px] object-contain mx-auto opacity-95 mix-blend-multiply"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="company-seal-placeholder h-14 w-14 rounded-full border border-dashed border-slate-300 flex items-center justify-center text-center p-1">
                    <span className="text-[7.5px] font-mono uppercase tracking-wider text-slate-400 leading-tight">
                      Official Seal
                    </span>
                  </div>
                )}
                <span className="text-[calc(var(--block-base)*0.85)] text-slate-400 mt-0.5 uppercase tracking-wider">
                  Company Seal
                </span>
              </div>
            )}

            {/* Signatories Rendering */}
            <div className="flex gap-4 justify-end">
              {resolvedSignatories.map((sig, sIdx) => {
                const resolvedSignatureImgUrl =
                  (sIdx === 0 ? quotation.signature_image_url : undefined) ||
                  sig.signature_url ||
                  '';
                return (
                  <div key={sIdx} className="text-center min-w-[120px]">
                    <div className="h-12 flex items-end justify-center mb-1">
                      {signatureStyle === 'image' && resolvedSignatureImgUrl ? (
                        <img
                          src={resolvedSignatureImgUrl}
                          alt="Authorized Signature"
                          className="max-h-12 object-contain mx-auto"
                        />
                      ) : signatureStyle === 'script' ? (
                        <span className="font-serif italic text-base text-slate-800 tracking-wide font-medium select-none transform -rotate-1 pb-1">
                          {sig.name}
                        </span>
                      ) : signatureStyle === 'image' ? (
                        <div className="h-8 w-24 border border-dashed border-slate-300 rounded flex items-center justify-center text-[calc(var(--block-base)*0.85)] text-slate-400 italic">
                          Digital Signature
                        </div>
                      ) : (
                        <div className="h-4" />
                      )}
                    </div>
                    <div className="w-24 border-b border-slate-300 mx-auto mb-1" />
                    <p className="font-bold text-slate-800 text-[calc(var(--block-base)*1.1)] leading-tight">{sig.name}</p>
                    <p className="text-[calc(var(--block-base)*0.95)] text-slate-500 leading-tight">{sig.title}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );

    const renderAcceptanceBlock = (placement: 'left' | 'right' | 'full' = 'full') => (
      <div className="acceptance-card break-inside-avoid page-break-inside-avoid w-full flex-1 flex flex-col justify-between" style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
        <div>
          <div className="flex items-center justify-between pb-1 border-b border-slate-200">
            <span className="font-bold text-slate-800 text-[calc(var(--block-base)*1.05)] uppercase tracking-wider flex items-center gap-1.5">
              <FileCheck className="w-3.5 h-3.5 text-slate-600" />
              Customer Acceptance &amp; Confirmation
            </span>
            <span className="text-[calc(var(--block-base)*0.85)] text-slate-400 italic">
              Sign &amp; Return Copy with Purchase Order
            </span>
          </div>
          <p className="text-[var(--block-base)] text-slate-600 my-1 leading-snug">
            We hereby accept and approve this commercial offer <span className="font-semibold text-slate-800">#{quotation.formatted_quote_ref || quotation.quote_number}</span> in accordance with the specified quantities, prices, and terms.
          </p>
        </div>

        {placement === 'full' ? (
          <div className="grid grid-cols-4 gap-3 text-center pt-2 text-[var(--block-base)]">
            <div>
              <span className="text-slate-400 text-[calc(var(--block-base)*0.85)] uppercase tracking-wider block">Authorized Signature</span>
              <div className="h-5 border-b border-slate-300 mt-1" />
            </div>
            <div>
              <span className="text-slate-400 text-[calc(var(--block-base)*0.85)] uppercase tracking-wider block">Signatory Name</span>
              <div className="h-5 border-b border-slate-300 mt-1" />
            </div>
            <div>
              <span className="text-slate-400 text-[calc(var(--block-base)*0.85)] uppercase tracking-wider block">Date</span>
              <div className="h-5 border-b border-slate-300 mt-1" />
            </div>
            <div>
              <span className="text-slate-400 text-[calc(var(--block-base)*0.85)] uppercase tracking-wider block">Company Stamp</span>
              <div className="h-5 border-b border-slate-300 border-dotted mt-1" />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 text-center pt-2 text-[var(--block-base)]">
            <div>
              <span className="text-slate-400 text-[calc(var(--block-base)*0.85)] uppercase tracking-wider block">Authorized Signature</span>
              <div className="h-4 border-b border-slate-300 mt-1" />
            </div>
            <div>
              <span className="text-slate-400 text-[calc(var(--block-base)*0.85)] uppercase tracking-wider block">Signatory Name</span>
              <div className="h-4 border-b border-slate-300 mt-1" />
            </div>
            <div>
              <span className="text-slate-400 text-[calc(var(--block-base)*0.85)] uppercase tracking-wider block">Date</span>
              <div className="h-4 border-b border-slate-300 mt-1" />
            </div>
            <div>
              <span className="text-slate-400 text-[calc(var(--block-base)*0.85)] uppercase tracking-wider block">Company Stamp</span>
              <div className="h-4 border-b border-slate-300 border-dotted mt-1" />
            </div>
          </div>
        )}
      </div>
    );

    const targetBlocks = blocksForSheet.filter((b) => {
      if (b.enabled === false || b.is_visible === false) return false;
      if (!hasExplicitLayoutBlocks) {
        if (b.id === 'terms' && !resolvedShowCommercialTerms) return false;
        if (b.id === 'remittance' && !resolvedShowBankDetails) return false;
        if ((b.id === 'signatory' || b.id === 'signatories') && !showStampAndSignatures) return false;
        if (b.id === 'acceptance' && !customerAcceptanceEnabled) return false;
      }
      return true;
    });

    if (targetBlocks.length === 0) return null;

    // Group targetBlocks into sequential segments: either 'spacer' or contiguous 'grid' blocks
    type BlockSegment =
      | { kind: 'spacer'; block: QuotationBlockConfig }
      | { kind: 'grid'; blocks: QuotationBlockConfig[] };

    const segments: BlockSegment[] = [];
    targetBlocks.forEach((b) => {
      const bType = b.type || (b.id?.startsWith('spacer_') ? 'spacer' : b.id);
      if (bType === 'spacer') {
        segments.push({ kind: 'spacer', block: b });
      } else {
        const lastSeg = segments[segments.length - 1];
        if (lastSeg && lastSeg.kind === 'grid') {
          lastSeg.blocks.push(b);
        } else {
          segments.push({ kind: 'grid', blocks: [b] });
        }
      }
    });

    return (
      <>
        {segments.map((seg, segIdx) => {
          if (seg.kind === 'spacer') {
            const b = seg.block;
            const isSelected = activeSelectedSection === b.id;
            const isInteractive = Boolean(onSelectSection || onSelectBlock);
            const spacerMeta = resolveSpacerPresentation(b);
            const showGuides = isInteractive && showPageBreakGuides !== false;
            return (
              <div
                key={b.id}
                onClick={isInteractive ? () => (onSelectSection ? onSelectSection(b.id) : onSelectBlock?.(b.id)) : undefined}
                style={{
                  height: spacerMeta.heightStyle
                }}
                className={`quotation-spacer-block ${spacerMeta.className} ${
                  showGuides
                    ? 'cursor-pointer rounded-lg border border-dashed border-slate-200/80 hover:border-blue-400 hover:bg-blue-50/30 print:border-none print:bg-transparent transition-all relative group'
                    : isInteractive
                    ? 'cursor-pointer relative group'
                    : ''
                } ${
                  isSelected
                    ? 'ring-2 ring-blue-500 border-blue-400 bg-blue-50/30 print:ring-0 print:border-none print:bg-transparent'
                    : ''
                }`}
              >
                {showGuides && (
                  <div
                    className={`quotation-canvas-guide absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity print:hidden ${
                      isSelected ? 'opacity-100' : 'opacity-60 group-hover:opacity-100'
                    }`}
                  >
                    <span className={`px-2 py-0.5 rounded text-[9px] font-mono shadow-2xs ${
                      isSelected ? 'bg-blue-600 text-white font-semibold' : 'bg-slate-800/75 text-white'
                    }`}>
                      {spacerMeta.badgeLabel}
                    </span>
                  </div>
                )}
              </div>
            );
          }

          let currentRow = 1;
          let rowHasLeft = false;
          let rowHasRight = false;

          const positionedBlocks = seg.blocks.map((b) => {
            if (b.placement === 'full') {
              if (rowHasLeft || rowHasRight) {
                currentRow++;
                rowHasLeft = false;
                rowHasRight = false;
              }
              const rowStart = currentRow;
              currentRow++;
              return {
                b,
                gridRowStart: rowStart,
                gridColumnStart: 1,
                gridColumnEnd: 3,
                placementClass: 'col-span-2 col-start-1 w-full'
              };
            } else if (b.placement === 'left') {
              if (rowHasLeft) {
                currentRow++;
                rowHasLeft = false;
                rowHasRight = false;
              }
              const rowStart = currentRow;
              rowHasLeft = true;
              if (rowHasLeft && rowHasRight) {
                currentRow++;
                rowHasLeft = false;
                rowHasRight = false;
              }
              return {
                b,
                gridRowStart: rowStart,
                gridColumnStart: 1,
                gridColumnEnd: 2,
                placementClass: 'col-span-1 col-start-1'
              };
            } else {
              if (rowHasRight) {
                currentRow++;
                rowHasLeft = false;
                rowHasRight = false;
              }
              const rowStart = currentRow;
              rowHasRight = true;
              if (rowHasLeft && rowHasRight) {
                currentRow++;
                rowHasLeft = false;
                rowHasRight = false;
              }
              return {
                b,
                gridRowStart: rowStart,
                gridColumnStart: 2,
                gridColumnEnd: 3,
                placementClass: 'col-span-1 col-start-2'
              };
            }
          });

          return (
            <section key={`grid_seg_${segIdx}`} className="mb-3 w-full print:mb-2" style={{ width: '100%', maxWidth: '100%' }}>
              <div
                className="quotation-blocks-grid grid grid-cols-2 gap-3 items-stretch w-full"
                style={{ width: '100%', maxWidth: '100%' }}
              >
                {positionedBlocks.map(({ b, gridRowStart, gridColumnStart, gridColumnEnd, placementClass }) => {
                  const baseFontSize = b.fontScale === 'compact' ? '8.5px' : b.fontScale === 'prominent' ? '11.5px' : typoScale.rawBase;
                  const isMinimalBlock = b.style === 'minimal';
                  const padClass = isMinimalBlock
                    ? 'pt-2 pb-1 px-1'
                    : b.padding === 'compact'
                    ? 'p-2'
                    : 'p-3';
                  const isSelected = activeSelectedSection === b.id;
                  const isInteractive = Boolean(onSelectSection || onSelectBlock);
                  const bType = b.type || b.id;

                  const cardStyleClass = [
                    padClass,
                    isMinimalBlock
                      ? 'rounded-none border-t border-slate-200/90 bg-transparent print:bg-transparent print:border-slate-300'
                      : `${(propGlobalCardRadius || quotation.globalCardRadius || profile?.globalCardRadius || resolvedRecipientConfig.globalCardRadius) === 'sharp' ? 'rounded-none' : 'rounded-lg'} border border-slate-200 bg-slate-50/50`,
                    'h-full flex flex-col justify-between transition-all duration-150',
                    isInteractive ? 'cursor-pointer' : '',
                    isSelected
                      ? 'ring-2 ring-blue-500 ring-offset-2 shadow-sm print:ring-0 !print:ring-0 print:outline-none !print:outline-none print:shadow-none !print:shadow-none'
                      : isInteractive
                      ? 'hover:ring-1 hover:ring-blue-300 print:ring-0 !print:ring-0 print:outline-none !print:outline-none'
                      : ''
                  ].filter(Boolean).join(' ');

                  return (
                    <div
                      key={b.id}
                      className={`${placementClass} break-inside-avoid page-break-inside-avoid quotation-block-slot ${b.id}-card`}
                      style={{
                        breakInside: 'avoid',
                        pageBreakInside: 'avoid',
                        gridRowStart,
                        gridColumnStart,
                        gridColumnEnd
                      }}
                    >
                      <div
                        className={`${cardStyleClass} break-inside-avoid page-break-inside-avoid`}
                        onClick={isInteractive ? () => (onSelectSection ? onSelectSection(b.id) : onSelectBlock?.(b.id)) : undefined}
                        style={{
                          breakInside: 'avoid',
                          pageBreakInside: 'avoid',
                          ['--block-base' as any]: baseFontSize,
                          fontSize: 'var(--block-base)'
                        }}
                      >
                        {(bType === 'terms' || b.id === 'terms') && renderTermsBlock()}
                        {(bType === 'totals' || b.id === 'totals') && renderTotalsBlock()}
                        {(bType === 'remittance' || b.id === 'remittance') && renderRemittanceBlock()}
                        {(bType === 'signatory' || bType === 'signatories' || b.id === 'signatory' || b.id === 'signatories') && renderSignatoryBlock()}
                        {(bType === 'acceptance' || b.id === 'acceptance') && renderAcceptanceBlock(b.placement)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </>
    );
  };

  const renderTopSection = () => {
    const {
      activeLogoUrl,
      logoDisplayMode,
      headerLayoutMode,
      showLogo,
      showCompanyName,
      logoHeightPx: logoHeight,
      logoMaxWidthPx,
      bannerMaxHeightPx,
      logoSpacing
    } = headerBranding;
    const isBannerHeader =
      headerLayoutMode === 'banner' || logoDisplayMode === 'full_banner';
    const isCenteredHeader = headerLayoutMode === 'centered';
    const isSplitRight = headerLayoutMode === 'split_right';
    const showPhone = resolvedHeaderConfig.showPhone !== false && Boolean(senderPhone);
    const showEmail = resolvedHeaderConfig.showEmail !== false && Boolean(senderEmail);
    const showWebsite = resolvedHeaderConfig.showWebsite !== false && Boolean(senderWebsite);
    const showTrn = resolvedHeaderConfig.showTrn !== false && Boolean(senderTrn);
    const logoSpacingClass =
      logoSpacing === 'none'
        ? 'mb-0 pb-0'
        : logoSpacing === 'tight'
        ? 'mb-1 pb-0'
        : logoSpacing === 'spacious'
        ? 'mb-3 pb-1'
        : 'mb-1.5 pb-0';
    const logoGapClass =
      logoSpacing === 'none'
        ? 'gap-1.5'
        : logoSpacing === 'tight'
        ? 'gap-2.5'
        : logoSpacing === 'spacious'
        ? 'gap-5'
        : 'gap-3.5';

    const resolvedGlobalRadius =
      propGlobalCardRadius ||
      quotation.globalCardRadius ||
      profile?.globalCardRadius ||
      resolvedRecipientConfig.globalCardRadius ||
      'rounded';
    const globalRadiusClass = resolvedGlobalRadius === 'sharp' ? 'rounded-none' : 'rounded-lg';

    const resolvedCardsOrder =
      propCardsOrder ||
      quotation.cardsOrder ||
      profile?.cardsOrder ||
      resolvedRecipientConfig.cardsOrder ||
      'recipient_first';

    const resolvedSubjectPlacement =
      propSubjectPlacement ||
      quotation.subjectPlacement ||
      profile?.subjectPlacement ||
      resolvedRecipientConfig.subjectPlacement ||
      'below_cards';

    const topCardsLayout = resolveTopCardsLayout(
      resolvedRecipientConfig,
      resolvedBlockStyle,
      resolvedGlobalRadius,
      resolvedCardsOrder
    );

    const showAttention = resolvedRecipientConfig.showAttention !== false;
    const showSalesRep = resolvedRecipientConfig.showSalesRep !== false;
    const showValidity = resolvedRecipientConfig.showValidity !== false;
    const showEnquiryRef = resolvedRecipientConfig.showEnquiryRef !== false;

    const recipientCardBase = topCardsLayout.recipientCardClassName;
    const offerCardBase = topCardsLayout.offerCardClassName;
    const isRecipientFullWidth = topCardsLayout.recipientPlacement === 'full';
    const isOfferFullWidth = topCardsLayout.offerPlacement === 'full';

    const renderSubjectBanner = () => {
      if (!Boolean(quotation.subject || enquiry?.subject) || resolvedRecipientConfig.showSubject === false) {
        return null;
      }
      return (
        <div
          className={`mb-3 px-3 py-1.5 ${
            isMinimal
              ? 'border-y border-slate-200/90 bg-transparent rounded-none'
              : `bg-slate-50 border border-slate-200 ${globalRadiusClass}`
          } text-xs font-medium text-slate-800 relative group transition-all duration-150 print:bg-transparent print:border-slate-300 ${
            isInteractive ? 'cursor-pointer hover:border-slate-400' : ''
          } ${
            activeSelectedSection === 'subject'
              ? 'ring-2 ring-blue-500 ring-offset-2 shadow-sm print:ring-0 !print:ring-0'
              : ''
          }`}
          onClick={isInteractive ? (e) => {
            e.stopPropagation();
            onSelectSection?.('subject');
          } : undefined}
        >
          {isInteractive && (
            <div className={`absolute -top-2.5 right-3 px-2 py-0.5 rounded text-[9px] font-semibold tracking-wide uppercase shadow-xs transition-opacity print:hidden z-10 ${
              activeSelectedSection === 'subject' ? 'bg-blue-600 text-white opacity-100' : 'bg-slate-200 text-slate-700 opacity-0 group-hover:opacity-100'
            }`}>
              Subject Banner
            </div>
          )}
          <span className="text-slate-500 font-normal mr-1.5">Subject:</span>
          <span className="text-slate-800 font-semibold">{quotation.subject || enquiry?.subject}</span>
        </div>
      );
    };

    const renderRecipientCard = () => (
      <div
        key="recipient_card"
        className={`quotation-recipient-info relative group transition-all duration-150 quotation-structural-section ${
          recipientCardBase
        } ${isInteractive ? 'cursor-pointer' : ''} ${
          isRecipientSelected
            ? 'ring-2 ring-blue-500 ring-offset-2 shadow-sm print:ring-0 !print:ring-0 print:outline-none !print:outline-none print:shadow-none !print:shadow-none'
            : isInteractive
            ? 'hover:ring-1 hover:ring-blue-300 print:ring-0 !print:ring-0 print:outline-none !print:outline-none'
            : ''
        }`}
        onClick={isInteractive ? (e) => {
          e.stopPropagation();
          onSelectSection?.('recipient_info');
          onSelectBlock?.('recipient_info' as any);
        } : undefined}
        style={{ width: '100%', maxWidth: '100%' }}
      >
        {isInteractive && (
          <div className={`absolute -top-2.5 right-3 px-2 py-0.5 rounded text-[9px] font-semibold tracking-wide uppercase shadow-xs transition-opacity print:hidden z-10 ${
            isRecipientSelected ? 'bg-blue-600 text-white opacity-100' : 'bg-slate-200 text-slate-700 opacity-0 group-hover:opacity-100'
          }`}>
            Submitted To
          </div>
        )}
        {isRecipientFullWidth ? (
          /* Compact 100% Full-Width Horizontal Strip Layout */
          <div>
            <div className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 mb-1">
              Submitted To / Attention To
            </div>
            <div className="flex flex-row items-baseline justify-between gap-4">
              <div className="min-w-0">
                <span className="text-sm font-bold text-slate-900 mr-2">{clientEntityName}</span>
                {showAttention && (
                  <span className="text-xs text-slate-700 font-medium">
                    • Attn:{' '}
                    <span className="text-slate-900 font-semibold">
                      {clientContactPerson || 'Procurement / Commercial Dept.'}
                    </span>
                  </span>
                )}
                <p className="text-xs text-slate-600 mt-0.5">{clientAddress}</p>
              </div>
              <div className="text-right shrink-0 text-xs text-slate-600 space-y-0.5">
                <p>
                  <span className="text-[10px] text-slate-500 font-medium">
                    TRN: <span className="text-slate-700 font-mono">{clientTrn || 'Not Registered'}</span>
                  </span>
                </p>
                {(clientPhone || clientEmail) && (
                  <p className="text-slate-500 text-[11px]">
                    {[clientPhone, clientEmail].filter(Boolean).join(' • ')}
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Standard 50% Half-Width Vertical Card Layout */
          <>
            <div>
              <div className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 mb-1">
                Submitted To / Attention To
              </div>
              <h3 className="text-sm font-bold text-slate-900">
                {clientEntityName}
              </h3>
              {showAttention && (
                <p className="text-xs text-slate-700 font-medium mt-0.5">
                  Attn:{' '}
                  <span className="text-slate-900 font-semibold">
                    {clientContactPerson || 'Procurement / Commercial Dept.'}
                  </span>
                </p>
              )}
              <p className="text-xs text-slate-600 mt-0.5">
                {clientAddress}
              </p>
            </div>
            <div className="text-xs text-slate-600 space-y-0.5 pt-1.5 mt-1.5 border-t border-slate-200/60">
              <p>
                <span className="text-[10px] text-slate-500 font-medium">TRN: <span className="text-slate-700">{clientTrn || 'Not Registered'}</span></span>
              </p>
              {(clientPhone || clientEmail) && (
                <p className="text-slate-500 text-[11px]">
                  {[clientPhone, clientEmail].filter(Boolean).join(' • ')}
                </p>
              )}
            </div>
          </>
        )}
      </div>
    );

    const renderOfferCard = () => (
      <div
        key="offer_card"
        className={`quotation-quote-meta relative group transition-all duration-150 quotation-structural-section ${
          offerCardBase
        } ${isInteractive ? 'cursor-pointer' : ''} ${
          isQuoteMetaSelected
            ? 'ring-2 ring-blue-500 ring-offset-2 shadow-sm print:ring-0 !print:ring-0 print:outline-none !print:outline-none print:shadow-none !print:shadow-none'
            : isInteractive
            ? 'hover:ring-1 hover:ring-blue-300 print:ring-0 !print:ring-0 print:outline-none !print:outline-none'
            : ''
        }`}
        onClick={isInteractive ? (e) => {
          e.stopPropagation();
          onSelectSection?.('quote_meta');
          onSelectBlock?.('quote_meta' as any);
        } : undefined}
        style={{ width: '100%', maxWidth: '100%' }}
      >
        {isInteractive && (
          <div className={`absolute -top-2.5 right-3 px-2 py-0.5 rounded text-[9px] font-semibold tracking-wide uppercase shadow-xs transition-opacity print:hidden z-10 ${
            isQuoteMetaSelected ? 'bg-blue-600 text-white opacity-100' : 'bg-slate-200 text-slate-700 opacity-0 group-hover:opacity-100'
          }`}>
            Commercial Offer
          </div>
        )}
        {isOfferFullWidth ? (
          /* Compact 100% Full-Width 4-Column Horizontal Metadata Strip */
          <div>
            <div className="pb-1.5 border-b border-slate-200/60 flex items-center justify-between gap-2">
              <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400">
                Commercial Offer
              </span>
              <div className="flex items-center gap-2">
                <span className="text-sm sm:text-base font-mono font-bold text-slate-900">
                  {quotation.formatted_quote_ref || quotation.quote_number}
                </span>
                <span className="text-[10px] font-mono font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200/80">
                  Rev {quotation.revision_number || 1}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-3 pt-1.5 text-xs items-center">
              <div>
                <span className="text-slate-400 text-[9.5px] uppercase block">Date</span>
                <span className="font-semibold text-slate-800">{formatDate(quotation.created_at)}</span>
              </div>
              {showValidity && quotation.valid_until && quotation.valid_until.trim() !== '' ? (
                <div>
                  <span className="text-slate-400 text-[9.5px] uppercase block">Valid Until</span>
                  <span className="font-semibold text-slate-800">{formatDate(quotation.valid_until)}</span>
                </div>
              ) : showEnquiryRef && enquiryRef ? (
                <div>
                  <span className="text-slate-400 text-[9.5px] uppercase block">Enquiry Ref</span>
                  <span className="font-semibold text-slate-800 font-mono truncate block">{enquiryRef}</span>
                </div>
              ) : (
                <div>
                  <span className="text-slate-400 text-[9.5px] uppercase block">Validity</span>
                  <span className="font-semibold text-slate-800">Standard</span>
                </div>
              )}
              <div>
                <span className="text-slate-400 text-[9.5px] uppercase block">Prepared By</span>
                <span className="font-semibold text-slate-800 truncate block">
                  {showSalesRep && resolvedSalesRep ? resolvedSalesRep : 'Authorized Rep'}
                </span>
              </div>
              <div className="text-right">
                <span className="text-slate-400 text-[9.5px] uppercase block">Status</span>
                <span className="font-bold text-slate-700 uppercase tracking-wider text-[10.5px]">
                  {String(quotation.status || 'Draft').toUpperCase()}
                </span>
              </div>
            </div>
          </div>
        ) : (
          /* Standard 50% Half-Width Vertical Card Layout */
          <>
            <div>
              <div className="pb-1 border-b border-slate-200/60 flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400">
                  Commercial Offer
                </span>
                <span className="text-[10px] font-mono font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200/80">
                  Rev {quotation.revision_number || 1}
                </span>
              </div>
              <div className="py-1.5 text-center">
                <div className="text-base sm:text-lg font-mono font-bold text-slate-900">
                  {quotation.formatted_quote_ref || quotation.quote_number}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5 pt-1.5 border-t border-slate-200/60 text-xs">
              <div>
                <span className="text-slate-400 text-[10px] uppercase block">Date</span>
                <span className="font-semibold text-slate-800">{formatDate(quotation.created_at)}</span>
              </div>
              {showValidity && quotation.valid_until && quotation.valid_until.trim() !== '' && (
                <div>
                  <span className="text-slate-400 text-[10px] uppercase block">Valid Until</span>
                  <span className="font-semibold text-slate-800">{formatDate(quotation.valid_until)}</span>
                </div>
              )}
              {showSalesRep && resolvedSalesRep && (
                <div>
                  <span className="text-slate-400 text-[10px] uppercase block">Prepared By</span>
                  <span className="font-semibold text-slate-800 truncate block">{resolvedSalesRep}</span>
                </div>
              )}
              {showEnquiryRef && enquiryRef && (
                <div>
                  <span className="text-slate-400 text-[10px] uppercase block">Enquiry Ref</span>
                  <span className="font-semibold text-slate-800 font-mono truncate block">{enquiryRef}</span>
                </div>
              )}
              <div className="col-span-2 pt-0.5 flex items-center justify-between">
                <span className="text-slate-400 text-[10px] uppercase">Status</span>
                <span className="font-bold text-slate-700 uppercase tracking-wider text-[10.5px]">
                  {String(quotation.status || 'Draft').toUpperCase()}
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    );

    return (
      <>
        <header
          className={`quotation-header-branding border-b border-slate-200 pb-3 mb-3 w-full header-flex-container relative group transition-all duration-150 rounded-lg quotation-structural-section ${
            isInteractive ? 'cursor-pointer' : ''
          } ${
            isHeaderSelected
              ? 'ring-2 ring-blue-500 ring-offset-2 shadow-sm print:ring-0 !print:ring-0 print:outline-none !print:outline-none print:shadow-none !print:shadow-none'
              : isInteractive
              ? 'hover:ring-1 hover:ring-blue-300 print:ring-0 !print:ring-0 print:outline-none !print:outline-none'
              : ''
          }`}
          onClick={isInteractive ? (e) => {
            e.stopPropagation();
            if (onSelectSection) {
              onSelectSection('header');
            } else if (onSelectBlock) {
              onSelectBlock('header' as any);
            }
          } : undefined}
          style={{ width: '100%', maxWidth: '100%' }}
        >
          {isInteractive && (
            <div className={`absolute -top-2.5 right-3 px-2 py-0.5 rounded text-[9px] font-semibold tracking-wide uppercase shadow-xs transition-opacity print:hidden z-10 ${
              isHeaderSelected ? 'bg-blue-600 text-white opacity-100' : 'bg-slate-200 text-slate-700 opacity-0 group-hover:opacity-100'
            }`}>
              Header &amp; Branding
            </div>
          )}

          {isBannerHeader ? (
            /* Full Letterhead Banner Mode (Top Span) */
            <div
              className={`flex flex-col items-center text-center space-y-1.5 w-full ${logoSpacingClass}`}
              style={{ width: '100%', maxWidth: '100%' }}
            >
              {showLogo && (
                <div className="w-full pb-1 flex justify-center">
                  {activeLogoUrl && !logoLoadFailed ? (
                    <img
                      src={activeLogoUrl}
                      alt={senderEntityName}
                      style={{
                        maxHeight: `${bannerMaxHeightPx}px`,
                        maxWidth: `${logoMaxWidthPx || 700}px`
                      }}
                      className="w-full h-auto object-contain mx-auto"
                      onError={() => setLogoLoadFailed(true)}
                    />
                  ) : (
                    <div
                      className="rounded-lg flex items-center justify-center text-white font-bold text-xl shadow-sm"
                      style={{
                        backgroundColor: accentColor,
                        width: `${Math.max(40, logoHeight)}px`,
                        height: `${Math.max(40, logoHeight)}px`
                      }}
                    >
                      <Building2 className="w-6 h-6" />
                    </div>
                  )}
                </div>
              )}
              {showCompanyName && (
                <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 leading-tight">
                  {senderEntityName}
                </h1>
              )}
              {(() => {
                const segments: React.ReactNode[] = [];
                if (senderAddress) {
                  segments.push(
                    <span key="addr" className="inline-flex items-center gap-1">
                      <span>{senderAddress}</span>
                    </span>
                  );
                }
                if (showPhone) {
                  segments.push(
                    <span key="phone" className="inline-flex items-center gap-1">
                      <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                      <span>{senderPhone}</span>
                    </span>
                  );
                }
                if (showEmail) {
                  segments.push(
                    <span key="email" className="inline-flex items-center gap-1">
                      <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                      <span>{senderEmail}</span>
                    </span>
                  );
                }
                if (showTrn) {
                  segments.push(
                    <span key="trn" className="inline-flex items-center gap-1">
                      <span className="text-slate-400 font-medium">TRN:</span>
                      <span className="font-mono font-semibold text-slate-700">{senderTrn}</span>
                    </span>
                  );
                }
                if (showWebsite) {
                  segments.push(
                    <span key="web" className="inline-flex items-center gap-1">
                      <Globe className="w-3 h-3 text-slate-400 shrink-0" />
                      <span>{senderWebsite}</span>
                    </span>
                  );
                }
                if (segments.length === 0) return null;
                return (
                  <div className="flex flex-wrap justify-center items-center gap-x-2.5 gap-y-1 text-xs text-slate-500 pt-0.5 leading-relaxed">
                    {segments.map((segment, idx) => (
                      <span key={idx} className="inline-flex items-center gap-2 whitespace-nowrap">
                        <span>{segment}</span>
                        {idx < segments.length - 1 && (
                          <span className="text-slate-300 font-bold select-none shrink-0" aria-hidden="true">•</span>
                        )}
                      </span>
                    ))}
                  </div>
                );
              })()}
            </div>
          ) : isCenteredHeader ? (
            /* Centered Executive Stack */
            <div className={`flex flex-col items-center text-center space-y-1.5 w-full ${logoSpacingClass}`} style={{ width: '100%', maxWidth: '100%' }}>
              {showLogo && (
                <div className="pb-1">
                  {activeLogoUrl && !logoLoadFailed ? (
                    <img
                      src={activeLogoUrl}
                      alt={senderEntityName}
                      style={{
                        height: `${logoHeight}px`,
                        maxWidth: `${logoMaxWidthPx || 260}px`
                      }}
                      className="w-auto object-contain shrink-0"
                      onError={() => setLogoLoadFailed(true)}
                    />
                  ) : (
                    <div
                      className="rounded-lg flex items-center justify-center text-white font-bold text-xl shadow-sm"
                      style={{ backgroundColor: accentColor, width: `${Math.max(40, logoHeight)}px`, height: `${Math.max(40, logoHeight)}px` }}
                    >
                      <Building2 className="w-6 h-6" />
                    </div>
                  )}
                </div>
              )}
              {showCompanyName && (
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 leading-tight">
                  {senderEntityName}
                </h1>
              )}
              {/* Address, Contacts & TRN */}
              {(() => {
                const segments: React.ReactNode[] = [];
                if (senderAddress) {
                  segments.push(
                    <span key="addr" className="inline-flex items-center gap-1">
                      <span>{senderAddress}</span>
                    </span>
                  );
                }
                if (showPhone) {
                  segments.push(
                    <span key="phone" className="inline-flex items-center gap-1">
                      <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                      <span>{senderPhone}</span>
                    </span>
                  );
                }
                if (showEmail) {
                  segments.push(
                    <span key="email" className="inline-flex items-center gap-1">
                      <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                      <span>{senderEmail}</span>
                    </span>
                  );
                }
                if (showTrn) {
                  segments.push(
                    <span key="trn" className="inline-flex items-center gap-1">
                      <span className="text-slate-400 font-medium">TRN:</span>
                      <span className="font-mono font-semibold text-slate-700">{senderTrn}</span>
                    </span>
                  );
                }
                if (showWebsite) {
                  segments.push(
                    <span key="web" className="inline-flex items-center gap-1">
                      <Globe className="w-3 h-3 text-slate-400 shrink-0" />
                      <span>{senderWebsite}</span>
                    </span>
                  );
                }
                if (segments.length === 0) return null;
                return (
                  <div className="flex flex-wrap justify-center items-center gap-x-2.5 gap-y-1 text-xs text-slate-500 pt-0.5 leading-relaxed">
                    {segments.map((segment, idx) => (
                      <span key={idx} className="inline-flex items-center gap-2 whitespace-nowrap">
                        <span>{segment}</span>
                        {idx < segments.length - 1 && (
                          <span className="text-slate-300 font-bold select-none shrink-0" aria-hidden="true">•</span>
                        )}
                      </span>
                    ))}
                  </div>
                );
              })()}
            </div>
          ) : (
            /* Split Classic (Logo Left / Contacts Right) or Split Reversed (Contacts Left / Logo Right) */
            <div
              className={`flex flex-row justify-between items-start gap-4 w-full ${logoSpacingClass} ${
                isSplitRight ? 'flex-row-reverse' : ''
              }`}
              style={{ width: '100%', maxWidth: '100%' }}
            >
              <div
                className={`${
                  isSplitRight
                    ? 'w-[54%] text-right flex-row-reverse justify-start'
                    : 'w-[56%] text-left flex-row'
                } flex-shrink-0 flex items-start ${logoGapClass}`}
              >
                {showLogo &&
                  (activeLogoUrl && !logoLoadFailed ? (
                    <img
                      src={activeLogoUrl}
                      alt={senderEntityName}
                      style={{
                        height: `${logoHeight}px`,
                        maxWidth: `${logoMaxWidthPx || 260}px`
                      }}
                      className="w-auto object-contain shrink-0"
                      onError={() => setLogoLoadFailed(true)}
                    />
                  ) : (
                    <div
                      className="rounded-lg flex items-center justify-center text-white font-bold text-xl shadow-sm shrink-0"
                      style={{
                        backgroundColor: accentColor,
                        width: `${Math.max(40, logoHeight)}px`,
                        height: `${Math.max(40, logoHeight)}px`
                      }}
                    >
                      <Building2 className="w-6 h-6" />
                    </div>
                  ))}
                <div className="min-w-0">
                  {showCompanyName && (
                    <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 leading-tight">
                      {senderEntityName}
                    </h1>
                  )}
                  {showTrn && (
                    <p className={`text-xs font-semibold text-slate-600 ${showCompanyName ? 'mt-0.5' : 'mt-0'}`}>
                      TRN / VAT Reg: <span className="text-slate-900 font-mono">{senderTrn}</span>
                    </p>
                  )}
                </div>
              </div>

              <div
                className={`${
                  isSplitRight ? 'w-[44%] text-left items-start' : 'w-[42%] text-right items-end'
                } flex-shrink-0 flex flex-col space-y-1`}
              >
                {senderAddress && (
                  <p className="text-[9.5px] print:text-[8.5px] text-slate-600 print:text-black leading-snug break-words max-w-full">
                    <span>{senderAddress}</span>
                  </p>
                )}
                <div
                  className={`flex flex-col gap-0.5 text-[9.5px] print:text-[8.5px] text-slate-600 print:text-black ${
                    isSplitRight ? 'items-start' : 'items-end'
                  }`}
                >
                  {showPhone && senderPhone && (
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                      <span>{senderPhone}</span>
                    </span>
                  )}
                  {showEmail && senderEmail && (
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                      <span>{senderEmail}</span>
                    </span>
                  )}
                  {showWebsite && senderWebsite && (
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      <Globe className="w-3 h-3 text-slate-400 shrink-0" />
                      <span>{senderWebsite}</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </header>

        {resolvedSubjectPlacement === 'above_cards' && renderSubjectBanner()}
        <div
          className="w-full mb-3 quotation-client-offer-grid grid grid-cols-2 gap-3 print:grid print:grid-cols-2 print:gap-3 items-stretch break-inside-avoid page-break-inside-avoid print:mb-3"
          style={{ width: '100%', maxWidth: '100%', breakInside: 'avoid', pageBreakInside: 'avoid' }}
        >
          <div
            className={`${topCardsLayout.recipientGridPosition.placementClass} flex flex-col break-inside-avoid page-break-inside-avoid`}
            style={{
              gridRowStart: topCardsLayout.recipientGridPosition.gridRowStart,
              gridColumnStart: topCardsLayout.recipientGridPosition.gridColumnStart,
              gridColumnEnd: topCardsLayout.recipientGridPosition.gridColumnEnd,
              breakInside: 'avoid',
              pageBreakInside: 'avoid'
            }}
          >
            {renderRecipientCard()}
          </div>
          <div
            className={`${topCardsLayout.offerGridPosition.placementClass} flex flex-col break-inside-avoid page-break-inside-avoid`}
            style={{
              gridRowStart: topCardsLayout.offerGridPosition.gridRowStart,
              gridColumnStart: topCardsLayout.offerGridPosition.gridColumnStart,
              gridColumnEnd: topCardsLayout.offerGridPosition.gridColumnEnd,
              breakInside: 'avoid',
              pageBreakInside: 'avoid'
            }}
          >
            {renderOfferCard()}
          </div>
        </div>
        {resolvedSubjectPlacement === 'below_cards' && renderSubjectBanner()}
      </>
    );
  };

  const renderItemsTable = (
    pageItems: QuotationLineItem[],
    startIndex: number,
    showEmptyPlaceholder: boolean,
    isContinuation: boolean = false
  ) => {
    const resolvedTableRadiusClass =
      (propGlobalCardRadius || quotation.globalCardRadius || profile?.globalCardRadius || resolvedRecipientConfig.globalCardRadius) === 'sharp'
        ? 'rounded-none'
        : 'rounded-lg';

    return (
      <section
        ref={!isContinuation ? tableRef : undefined}
        className={`quotation-items-section mb-3 print:mb-2 w-full transition-all duration-150 ${
          isMinimal ? 'rounded-none' : resolvedTableRadiusClass
        } quotation-structural-section relative group ${
          isInteractive ? 'cursor-pointer' : ''
        } ${
          isTableSelected
            ? 'ring-2 ring-blue-500 ring-offset-2 shadow-sm print:ring-0 !print:ring-0 print:outline-none !print:outline-none print:shadow-none !print:shadow-none'
            : isInteractive
            ? 'hover:ring-1 hover:ring-blue-300 print:ring-0 !print:ring-0 print:outline-none !print:outline-none'
            : ''
        }`}
        onClick={isInteractive ? (e) => {
          e.stopPropagation();
          if (onSelectSection) {
            onSelectSection('items_table');
          } else if (onSelectBlock) {
            onSelectBlock('items_table' as any);
          }
        } : undefined}
        style={{ width: '100%', maxWidth: '100%' }}
      >
        {isInteractive && !isContinuation && (
          <div className={`absolute -top-2.5 right-3 px-2 py-0.5 rounded text-[9px] font-semibold tracking-wide uppercase shadow-xs transition-opacity print:hidden z-10 ${
            isTableSelected ? 'bg-blue-600 text-white opacity-100' : 'bg-slate-200 text-slate-700 opacity-0 group-hover:opacity-100'
          }`}>
            {isTableSelected ? 'Editing Table Layout' : 'Click to Inspect Table'}
          </div>
        )}
        <div
          className={`${
            isMinimal
              ? 'border-y border-slate-200/90 rounded-none'
              : `${resolvedTableRadiusClass} border border-slate-200`
          } overflow-hidden w-full`}
          style={{ width: '100%', maxWidth: '100%' }}
        >
          <table
            className={`w-full border-collapse table-fixed text-left ${tableFontSize}`}
            style={{ tableLayout: 'fixed', width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}
          >
            <colgroup>
              <col style={{ width: tableColLayout.widths.sl }} />
              <col style={{ width: tableColLayout.widths.description }} />
              <col style={{ width: tableColLayout.widths.qty }} />
              {showUom && <col style={{ width: tableColLayout.widths.uom }} />}
              {showUnitPrice && <col style={{ width: tableColLayout.widths.unitPrice }} />}
              {showLineTotal && <col style={{ width: tableColLayout.widths.lineTotal }} />}
            </colgroup>
            <thead style={{ display: 'table-header-group' }}>
              <tr
                className="font-semibold text-slate-700 bg-slate-100 border-b border-slate-200"
                style={{
                  backgroundColor: theme.subtleBg || '#f8fafc',
                  borderColor: '#e2e8f0',
                  breakInside: 'avoid',
                  pageBreakInside: 'avoid'
                }}
              >
                <th
                  className={`${thPad} px-1.5 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-600 border-r border-slate-200 last:border-r-0 text-center whitespace-nowrap`}
                >
                  #
                </th>
                <th
                  className={`${thPad} px-2.5 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-600 border-r border-slate-200 last:border-r-0 text-left`}
                >
                  Description &amp; Technical Specifications
                </th>
                <th
                  className={`${thPad} px-1.5 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-600 border-r border-slate-200 last:border-r-0 text-center font-mono whitespace-nowrap`}
                >
                  Qty
                </th>
                {showUom && (
                  <th
                    className={`${thPad} px-1.5 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-600 border-r border-slate-200 last:border-r-0 text-center whitespace-nowrap`}
                  >
                    UOM
                  </th>
                )}
                {showUnitPrice && (
                  <th
                    className={`${thPad} pl-2 pr-3.5 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-600 border-r border-slate-200 last:border-r-0 text-right whitespace-nowrap`}
                    style={{ paddingRight: !showLineTotal ? '16px' : undefined }}
                  >
                    Unit Price
                  </th>
                )}
                {showLineTotal && (
                  <th
                    className={`${thPad} pl-3 pr-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-600 text-right whitespace-nowrap`}
                    style={{ paddingRight: '16px' }}
                  >
                    Total ({currency})
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/80" style={{ display: 'table-row-group' }}>
              {pageItems.length > 0 ? (
                pageItems.map((item, idx) => {
                  const itemNumber = startIndex + idx + 1;
                  const rowSpacerMm = item.row_spacer_after_mm && item.row_spacer_after_mm > 0 ? item.row_spacer_after_mm : 0;
                  return (
                    <React.Fragment key={item.id || itemNumber}>
                      <tr
                        className={`break-inside-avoid transition-colors ${
                          item.is_optional
                            ? 'bg-amber-50/50 hover:bg-amber-50'
                            : 'hover:bg-slate-50/60'
                        }`}
                        style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
                      >
                        <td className={`${tdPad} px-1.5 text-center font-mono text-slate-500 align-top ${tableFontSize} whitespace-nowrap`}>
                          {itemNumber}
                        </td>
                        <td className={`${tdPad} px-2.5 align-top break-words`}>
                          <div className={`font-bold text-slate-900 flex flex-wrap items-center gap-1.5 leading-snug ${tableFontSize} break-words`}>
                            <span>{item.item_name || 'Standard Line Item'}</span>
                            {item.is_optional && (
                              <span className="px-1.5 py-0.5 text-[9px] uppercase font-bold tracking-wider bg-amber-200 text-amber-900 rounded shrink-0">
                                Optional
                              </span>
                            )}
                          </div>
                          {(() => {
                            const { cleanDescription, extractedSpecsAttrs } =
                              extractLineItemAttributesAndCleanDescription(item);

                            return (
                              <>
                                {cleanDescription && (
                                  <div className={`${tableFontSize} text-slate-600 mt-1 leading-snug break-words whitespace-pre-line`}>
                                    {cleanDescription}
                                  </div>
                                )}
                                {/* Technical Specifications & Attributes Block */}
                                {(() => {
                                  if (!showItemAttributes) return null;
                                  const allAttrs: Array<{ key: string; value: string }> = [];

                                  if (showBrand && item.brand_make && item.brand_make.trim() && item.brand_make !== '—') {
                                    allAttrs.push({ key: 'Brand', value: item.brand_make.trim() });
                                  }
                                  if (showModel && item.model_part_no && item.model_part_no.trim() && item.model_part_no !== '—') {
                                    allAttrs.push({ key: 'Model', value: item.model_part_no.trim() });
                                  }
                                  if (showOrigin && item.country_of_origin && item.country_of_origin.trim() && item.country_of_origin !== '—') {
                                    allAttrs.push({ key: 'Origin', value: item.country_of_origin.trim() });
                                  }
                                  if (showAvailability && item.availability && item.availability.trim()) {
                                    allAttrs.push({ key: 'Delivery', value: item.availability.trim() });
                                  }

                                  const rawAttrs: Array<{ key: string; value: string }> = [...extractedSpecsAttrs];
                                  const itemAny = item as any;
                                  const isRealDiffuserOrPump =
                                    item.item_name?.toLowerCase().includes('diffuser') ||
                                    item.item_name?.toLowerCase().includes('jackson') ||
                                    item.item_name?.toLowerCase().includes('dosing pump') ||
                                    item.item_name?.toLowerCase().includes('item one');

                                  const isLegacySampleAttr = (k: string, v: string) => {
                                    if (isRealDiffuserOrPump || extractedSpecsAttrs.length === 0) return false;
                                    return (
                                      (k === 'Size' && v === '9 Inch / DN200') ||
                                      (k === 'Material' && v === 'EPDM Membrane / ABS Body') ||
                                      (k === 'Connection' && v === '3/4" NPT Thread') ||
                                      (k === 'Design Flow' && v === '2 - 5 Nm³/h') ||
                                      (k === 'Capacity' && v === '15 LPH') ||
                                      (k === 'Pressure' && v === '10 bar') ||
                                      (k === 'Power Supply' && v === '220V / 50Hz / 1Ph')
                                    );
                                  };

                                  if (Array.isArray(item.attributes)) {
                                    item.attributes.forEach((attr) => {
                                      if (attr && (attr.key || (attr as any).name) && attr.value) {
                                        const k = String(attr.key || (attr as any).name).trim();
                                        const v = String(attr.value).trim();
                                        if (!isLegacySampleAttr(k, v)) {
                                          rawAttrs.push({ key: k, value: v });
                                        }
                                      }
                                    });
                                  } else if (itemAny.attributes && typeof itemAny.attributes === 'object') {
                                    Object.entries(itemAny.attributes).forEach(([k, v]) => {
                                      if (v !== undefined && v !== null && String(v).trim() !== '') {
                                        const kTrim = k.trim();
                                        const vTrim = String(v).trim();
                                        if (!isLegacySampleAttr(kTrim, vTrim)) {
                                          rawAttrs.push({ key: kTrim, value: vTrim });
                                        }
                                      }
                                    });
                                  }

                                  if (Array.isArray(itemAny.specs)) {
                                    itemAny.specs.forEach((s: any) => {
                                      if (s && s.key && s.value) {
                                        rawAttrs.push({ key: String(s.key).trim(), value: String(s.value).trim() });
                                      }
                                    });
                                  }

                                  if (Array.isArray(itemAny.specifications)) {
                                    itemAny.specifications.forEach((s: any) => {
                                      if (s && s.key && s.value) {
                                        rawAttrs.push({ key: String(s.key).trim(), value: String(s.value).trim() });
                                      }
                                    });
                                  }

                                  rawAttrs.forEach((attr) => {
                                    const kLower = attr.key.toLowerCase();
                                    if (!allAttrs.some((a) => a.key.toLowerCase() === kLower)) {
                                      allAttrs.push(attr);
                                    }
                                  });

                                  const itemVisibleKeys = Array.isArray(item.visible_attributes)
                                    ? item.visible_attributes.map((k) => k.toLowerCase())
                                    : undefined;
                                  const itemHiddenKeys = Array.isArray(item.hidden_attributes)
                                    ? item.hidden_attributes.map((k) => k.toLowerCase())
                                    : undefined;

                                  const visibleAttrs = allAttrs.filter((attr) => {
                                    const kLower = attr.key.toLowerCase();
                                    if (hiddenAttributeKeys.some((k) => k.toLowerCase() === kLower)) {
                                      return false;
                                    }
                                    if (itemVisibleKeys !== undefined) {
                                      return itemVisibleKeys.includes(kLower);
                                    }
                                    if (itemHiddenKeys !== undefined) {
                                      return !itemHiddenKeys.includes(kLower);
                                    }
                                    return true;
                                  });

                                  if (visibleAttrs.length === 0) return null;

                                  if (attributeDisplayFormat === 'inline_text') {
                                    return (
                                      <div className="text-[9px] print:text-[8.5px] text-slate-600 mt-1 leading-normal">
                                        <span className="font-semibold text-slate-700">Specs: </span>
                                        {visibleAttrs.map((a) => `${a.key}: ${a.value}`).join(' • ')}
                                      </div>
                                    );
                                  }

                                  return (
                                    <div className="flex flex-wrap gap-1.5 mt-1.5 print:mt-1">
                                      {visibleAttrs.map((attr, aIdx) => (
                                        <span
                                          key={aIdx}
                                          className="inline-flex items-center text-[8.5px] print:text-[8px] font-mono bg-slate-50 text-slate-800 px-1.5 py-0.5 rounded border border-slate-200 print:bg-transparent print:border-slate-300 print:text-black leading-tight"
                                        >
                                          <span className="text-slate-700 font-semibold mr-1">{attr.key}:</span>
                                          <span>{attr.value}</span>
                                        </span>
                                      ))}
                                    </div>
                                  );
                                })()}
                              </>
                            );
                          })()}
                        </td>
                        <td className={`${tdPad} px-1 text-center font-mono font-bold text-slate-800 align-top ${tableFontSize} whitespace-nowrap`}>
                          {item.quantity}
                        </td>
                        {showUom && (
                          <td className="text-[9.5px] font-mono text-center py-1.5 px-1 leading-tight text-slate-700 break-words align-top">
                            <span className="block px-1 text-center uppercase" title={item.unit || 'pcs'}>
                              {item.unit || 'pcs'}
                            </span>
                          </td>
                        )}
                        {showUnitPrice && (
                          <td
                            className={`${tdPad} pl-2 pr-3.5 text-right font-mono text-slate-700 align-top ${tableFontSize} tabular-nums whitespace-nowrap`}
                            style={{ paddingRight: !showLineTotal ? '16px' : undefined }}
                          >
                            {Number(item.unit_price || 0).toLocaleString('en-US', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2
                            })}
                          </td>
                        )}
                        {showLineTotal && (
                          <td
                            className={`${tdPad} pl-3 pr-4 text-right font-mono font-bold text-slate-900 align-top ${tableFontSize} tabular-nums whitespace-nowrap`}
                            style={{ paddingRight: '16px' }}
                          >
                            {item.is_optional ? (
                              <span className={`text-amber-700 ${tableFontSize} italic font-normal`}>
                                [Excluded]
                              </span>
                            ) : (
                              Number(item.total_price || 0).toLocaleString('en-US', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2
                              })
                            )}
                          </td>
                        )}
                      </tr>
                      {rowSpacerMm > 0 && (
                        <tr className="quotation-row-spacer border-none" style={{ height: `${rowSpacerMm}mm` }}>
                          <td colSpan={tableColLayout.activeColumnCount} className="p-0 border-none" />
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              ) : showEmptyPlaceholder ? (
                <tr>
                  <td
                    colSpan={tableColLayout.activeColumnCount}
                    className="py-8 text-center text-slate-400 italic"
                  >
                    No line items specified for this offer.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    );
  };

  return (
    <div
      id="quotation-printable-document"
      className="quotation-document-container w-[210mm] min-w-[210mm] max-w-[210mm] shrink-0 flex-shrink-0 flex flex-col items-center bg-transparent text-slate-900 text-left print:p-0 print:bg-white print:w-[210mm] print:min-w-[210mm] print:max-w-none print:m-0 print:block"
      style={{ colorScheme: 'light' }}
    >
      {/* Scoped Print Stylesheet */}
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 0 !important;
          }
          * {
            outline: none !important;
          }
          .quotation-running-header-print {
            display: none !important;
          }
          .quotation-header-branding {
            position: relative !important;
            z-index: 20 !important;
            background: #ffffff !important;
          }
          .quotation-page-sheet {
            width: 210mm !important;
            min-height: 294mm !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            margin: 0 !important;
            padding-top: 10mm !important;
            padding-bottom: 8mm !important;
            padding-left: 14mm !important;
            padding-right: 14mm !important;
            box-shadow: none !important;
            border: none !important;
            box-sizing: border-box !important;
            background: #ffffff !important;
            page-break-after: always !important;
            break-after: page !important;
          }
          .quotation-page-sheet:last-child,
          .quotation-page-sheet.quotation-last-sheet {
            page-break-after: auto !important;
            break-after: auto !important;
          }
          .quotation-canvas-guide {
            display: none !important;
          }
          .quotation-spacer-block {
            border: none !important;
            background: transparent !important;
            box-shadow: none !important;
          }
          .break-inside-avoid {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
          .quotation-block-slot,
          .quotation-block-slot > div,
          .quotation-structural-section,
          .quotation-header-branding,
          .quotation-recipient-meta,
          .quotation-recipient-info,
          .quotation-quote-meta,
          .quotation-client-offer-grid,
          .document-print-footer,
          header,
          section,
          table,
          [class*="ring-"] {
            outline: none !important;
            box-shadow: none !important;
            --tw-ring-shadow: none !important;
            --tw-ring-offset-shadow: none !important;
          }
          body, #root, .quotation-modal-container {
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          #quotation-printable-document,
          .quotation-document-container {
            width: 100% !important;
            min-width: 100% !important;
            max-width: 100% !important;
            margin: 0 auto !important;
            padding: 0 !important;
            position: static !important;
            background: #ffffff !important;
            box-sizing: border-box !important;
          }
          .preview-canvas-wrapper {
            transform: none !important;
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .quotation-client-offer-grid {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
          .document-print-footer,
          .quotation-page-footer {
            position: relative !important;
            z-index: 1 !important;
            width: 100% !important;
            background: #ffffff !important;
            padding-top: 2mm !important;
            padding-bottom: 1mm !important;
            border-top: 1px solid #e2e8f0 !important;
            page-break-before: avoid !important;
            break-before: avoid !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
            margin-top: auto !important;
          }
          .quotation-page-sheet table,
          .quotation-page-sheet .terms-card,
          .quotation-page-sheet .remittance-card,
          .quotation-page-sheet header,
          .quotation-page-sheet footer,
          .quotation-page-sheet section,
          .quotation-page-sheet .top-accent-bar,
          .quotation-page-sheet .header-flex-container {
            width: 100% !important;
            max-width: 100% !important;
          }
          thead {
            display: table-header-group !important;
          }
          tbody {
            display: table-row-group !important;
          }
          tfoot {
            display: table-footer-group !important;
          }
          tr {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
          .break-inside-avoid,
          .terms-card,
          .remittance-card,
          .totals-card,
          .signatory-card,
          .acceptance-card,
          .quotation-block-slot,
          .quotation-block-slot > div {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
          .grid-print-2col,
          .quotation-blocks-grid {
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 0.75rem !important;
            width: 100% !important;
          }
        }
      `}</style>

      {/* ========================================================
          DYNAMIC DISCRETE A4 SHEETS (PARTITIONED BY PAGE BREAKS)
         ======================================================== */}
      {sheetPartitions.map((sheet, sheetIdx) => {
        const isFirst = sheetIdx === 0;
        const isLastMainSheet = sheetIdx === sheetPartitions.length - 1;
        const isVeryLastDocumentSheet = isLastMainSheet && annexSheets.length === 0;
        const isContinuation = !isFirst;
        const isBreakSelected = Boolean(sheet.pageBreakBlock && activeSelectedSection === sheet.pageBreakBlock.id);
        const sheetKey = sheet.pageBreakBlock ? sheet.pageBreakBlock.id : `sheet_${sheet.sheetNumber}`;

        return (
          <React.Fragment key={sheetKey}>
            {/* Interactive Page Break Studio Divider Rendered in Gray Workspace Gap OUTSIDE White A4 Sheet */}
            {isContinuation &&
              isInteractive &&
              showPageBreakGuides !== false &&
              (sheet.pageBreakBlock || sheet.isTableContinuationSheet) && (
                <div
                  onClick={() => {
                    if (sheet.pageBreakBlock) {
                      onSelectSection
                        ? onSelectSection(sheet.pageBreakBlock.id)
                        : onSelectBlock?.(sheet.pageBreakBlock.id);
                    } else {
                      onSelectSection
                        ? onSelectSection('items_table')
                        : onSelectBlock?.('items_table');
                    }
                  }}
                  className={`quotation-canvas-guide w-[210mm] max-w-[210mm] -mt-4 mb-4 px-3.5 py-1.5 rounded-xl border border-dashed flex items-center justify-between text-[10.5px] font-mono cursor-pointer transition shadow-xs print:hidden ${
                    isBreakSelected || (sheet.isTableContinuationSheet && isTableSelected)
                      ? 'bg-amber-100 border-amber-500 text-amber-950 ring-2 ring-amber-400/60'
                      : 'bg-amber-50/95 hover:bg-amber-100/90 border-amber-400 text-amber-900'
                  }`}
                >
                  <span className="font-semibold flex items-center gap-1.5">
                    {sheet.isTableContinuationSheet
                      ? `📄 Table Split Continuation (After Item #${sheet.tableChunk?.splitFromItemNumber || sheet.tableChunk?.startIndex || 1}) • Sheet ${sheet.sheetNumber} of ${totalDocumentPages}`
                      : `✂ Page Break • Sheet ${sheet.sheetNumber} of ${totalDocumentPages}`}
                  </span>
                  <span className="text-[9.5px] font-bold underline">
                    {sheet.isTableContinuationSheet ? 'Inspect Line Items Table' : 'Inspect Page Break'}
                  </span>
                </div>
              )}

            <article
              ref={(el) => {
                sheetElsRef.current[sheetIdx] = el;
                if (isFirst) sheetRef.current = el;
                else if (sheetIdx === 1) page2Ref.current = el;
              }}
              className={`quotation-page-sheet quotation-page-${sheet.sheetNumber} relative w-[210mm] min-w-[210mm] max-w-[210mm] min-h-[297mm] bg-white text-slate-800 shadow-xl border border-slate-200/80 font-sans box-border p-[14mm] flex flex-col justify-between mx-auto mb-8 print:shadow-none print:border-none print:m-0 print:mb-0 print:px-[14mm] print:pt-[10mm] print:pb-[8mm] ${
                isVeryLastDocumentSheet
                  ? 'quotation-last-sheet print:break-after-avoid'
                  : 'print:break-after-page'
              } print:min-h-[294mm]`}
              style={{ boxSizing: 'border-box' }}
            >
              {/* Top Accent Stripe */}
              <div
                className="top-accent-bar absolute top-0 left-0 right-0 h-2 w-full print:w-full"
                style={{ backgroundColor: accentColor }}
              />

              {/* Subtle Non-Printing 297mm A4 Height Limit Boundary Guide Line — Rendered ONLY when sheet actually overflows 297mm */}
              {showPageBreakGuides !== false && overflowingSheets[sheetIdx] === true && (
                <div
                  className="quotation-canvas-guide pointer-events-none absolute left-0 right-0 top-[297mm] border-t-2 border-dashed border-rose-400/80 z-30 print:hidden flex justify-end pr-3"
                  aria-hidden="true"
                >
                  <span className="-mt-2.5 px-2 py-0.5 rounded-full bg-rose-600/95 text-white text-[8.5px] font-mono font-semibold shadow-xs">
                    ⚠️ 297mm A4 Page Boundary — Add a Page Break or reduce Spacer height to prevent extra print page
                  </span>
                </div>
              )}

              {/* Page Body Content */}
              <div className="flex-1 flex flex-col justify-start w-full">
                {isFirst ? (
                  <>
                    {renderTopSection()}
                    {sheet.tableChunk &&
                      renderItemsTable(
                        sheet.tableChunk.items,
                        sheet.tableChunk.startIndex,
                        rawLineItems.length === 0,
                        false
                      )}
                  </>
                ) : (
                  <>
                    {sheet.showContinuationHeader && repeatHeaderOnSubsequentPages && (
                      <div className={`quotation-page${sheet.sheetNumber}-continuation-header w-full mb-3`}>
                        {renderCompactRunningHeader(sheet.sheetNumber, totalDocumentPages)}
                      </div>
                    )}
                    {sheet.tableChunk &&
                      sheet.tableChunk.items.length > 0 &&
                      renderItemsTable(
                        sheet.tableChunk.items,
                        sheet.tableChunk.startIndex,
                        false,
                        true
                      )}
                  </>
                )}

                {renderBlocksGrid(sheet.blocks)}
                {isLastMainSheet && renderSubmittalsIndex()}
              </div>

              {/* Sheet Micro-Footer: Strictly in Document Flex Flow */}
              {renderFooter(sheetIdx + 1, totalDocumentPages)}
            </article>
          </React.Fragment>
        );
      })}

      {/* ========================================================
          FULL-PAGE A4 TECHNICAL ANNEX SHEETS
         ======================================================== */}
      {annexSheetAttachments.map((att, annexIdx) => {
        const annexPageNumber = sheetPartitions.length + annexIdx + 1;
        const isLastAnnexSheet = annexIdx === annexSheetAttachments.length - 1;
        const quoteRef = quotation.formatted_quote_ref || quotation.quote_number || 'QT-DRAFT';
        const annexHeaderTitle = resolveAnnexHeaderTitle(att, annexIdx + 1);

        return (
          <article
            key={att.id || `annex_sheet_${annexIdx + 1}`}
            className={`quotation-page-sheet quotation-annex-sheet quotation-page-${annexPageNumber} relative w-[210mm] min-w-[210mm] max-w-[210mm] min-h-[297mm] bg-white text-slate-800 shadow-xl border border-slate-200/80 font-sans box-border p-[14mm] flex flex-col justify-between mx-auto mb-8 print:shadow-none print:border-none print:m-0 print:mb-0 print:px-[14mm] print:pt-[10mm] print:pb-[8mm] ${
              isLastAnnexSheet
                ? 'quotation-last-sheet print:break-after-avoid'
                : 'print:break-after-page'
            } print:min-h-[294mm]`}
            style={{ boxSizing: 'border-box' }}
          >
            {/* Top Accent Stripe */}
            <div
              className="top-accent-bar absolute top-0 left-0 right-0 h-2 w-full print:w-full"
              style={{ backgroundColor: accentColor }}
            />

            {/* Continuation Running Header for Technical Annex */}
            <div className="w-full">
              <div
                className="compact-running-header flex justify-between items-center border-b border-slate-200 pb-1.5 mb-2 w-full bg-white"
                style={{ height: '26px' }}
              >
                <div className="flex items-center min-w-0 max-w-[34%]">
                  {headerBranding.includeMiniLogoOnContinuation && !logoLoadFailed && (
                    <img
                      src={headerBranding.activeLogoUrl}
                      alt=""
                      className="h-5 w-auto max-w-[110px] object-contain mr-2 shrink-0"
                      onError={() => setLogoLoadFailed(true)}
                    />
                  )}
                  <div className="text-[9px] print:text-[8px] font-bold text-slate-800 tracking-tight uppercase truncate">
                    {senderEntityName || 'Company'}
                  </div>
                </div>
                <div
                  className="text-[9px] print:text-[8px] font-bold uppercase tracking-wide truncate max-w-[42%] text-center px-2"
                  style={{ color: accentColor }}
                >
                  {annexHeaderTitle}
                </div>
                <div className="text-[8px] print:text-[7.5px] text-slate-500 font-mono text-right shrink-0">
                  {quoteRef} • Page {annexPageNumber} of {totalDocumentPages}
                </div>
              </div>
            </div>

            {/* Bounded Flex-1 Image Viewport */}
            <div className="flex-1 flex flex-col items-center justify-center w-full my-2 overflow-hidden">
              <img
                src={att.url}
                alt={att.name || `Technical Annex ${annexIdx + 1}`}
                className="max-h-[235mm] max-w-full w-auto h-auto object-contain rounded border border-slate-200/80"
              />
            </div>

            {/* Locked Bottom Micro-Footer */}
            {renderFooter(annexPageNumber, totalDocumentPages)}
          </article>
        );
      })}
    </div>
  );
};
