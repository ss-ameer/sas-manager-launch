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
  QuotationHeaderFieldItem,
  QuotationRecipientConfig,
  QuotationFooterConfig,
  QuotationPageMode,
  QuotationLineItem,
  Attachment,
  QuotationDocumentFontFamily,
  QuotationTopAccentBarStyle,
  QuotationSectionHeaderStyle,
  QuotationSignatoryBlockAlign,
  QuotationSignatoryTextAlign,
  QuotationStampPlacement,
  QuotationSignatureVerticalSpacing,
  QuotationSignatureLineWidth,
  QuotationSignatoryCustomLine
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
  Smartphone,
  MapPin,
  Hash,
  User,
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

  // If the last line item has page_break_after === true, split the closing blocks onto a new continuation sheet after the table
  const hasBreakAfterLastLineItem =
    Array.isArray(lineItems) &&
    lineItems.length > 0 &&
    lineItems[lineItems.length - 1]?.page_break_after === true;

  if (hasBreakAfterLastLineItem && activeBlocks.length > 0) {
    rawSheets.push({
      sheetNumber: rawSheets.length + 1,
      blocks: [],
      showContinuationHeader: true,
      tableChunk: {
        items: [],
        startIndex: lineItems!.length,
        isContinuation: true,
        splitFromItemNumber: lineItems!.length
      },
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
      const currentSheet = rawSheets[rawSheets.length - 1];
      const isCurrentSheetEmptyContinuation =
        rawSheets.length > 1 &&
        currentSheet.blocks.length === 0 &&
        (!currentSheet.tableChunk || currentSheet.tableChunk.items.length === 0) &&
        !currentSheet.pageBreakBlock;

      if (isCurrentSheetEmptyContinuation) {
        currentSheet.pageBreakBlock = b;
        currentSheet.showContinuationHeader = b.show_continuation_header !== false;
        currentSheet.isTableContinuationSheet = false;
      } else {
        rawSheets.push({
          sheetNumber: rawSheets.length + 1,
          blocks: [],
          pageBreakBlock: b,
          showContinuationHeader: b.show_continuation_header !== false,
          isTableContinuationSheet: false
        });
      }
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

export interface QuotationCoverSheetDescriptor {
  coverNumber: number;
  sheetNumber?: number;
  totalDocumentPages: number;
  attachment: Attachment;
  fullBleed: boolean;
  excludedFromPageCount: boolean;
  pageLabel: string;
  isLastDocumentSheet: boolean;
}

export interface QuotationAnnexSheetDescriptor {
  annexNumber: number;
  sheetNumber: number;
  totalDocumentPages: number;
  headerTitle: string;
  pageLabel: string;
  attachment: Attachment;
  fullBleed?: boolean;
  isLastDocumentSheet: boolean;
}

export interface QuotationSubmittalIndexEntry {
  indexNumber: number;
  id: string;
  name: string;
  url: string;
  renderAsAnnexPage: boolean;
  pagePlacement?: 'cover_before' | 'annex_after' | 'index_only';
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
      return 'border-0 rounded-none bg-transparent print:bg-transparent shadow-none pt-1 pb-1 px-0.5 h-full flex flex-col justify-between break-inside-avoid page-break-inside-avoid';
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
  coverSheetAttachments: Attachment[];
  coverSheets: QuotationCoverSheetDescriptor[];
  mainSheets: QuotationSheetPartition[];
  annexSheetAttachments: Attachment[];
  annexSheets: QuotationAnnexSheetDescriptor[];
  totalDocumentPages: number;
  showSubmittalsIndex: boolean;
  submittalsIndexEntries: QuotationSubmittalIndexEntry[];
} {
  const partitionedMainSheets = partitionBlocksIntoSheets(blocks, lineItems);
  const allAttachments = (flyerAttachments || []).filter((att) => att && Boolean(att.url));

  const coverSheetAttachments = allAttachments.filter(
    (att) => att.page_placement === 'cover_before' && Boolean(att.url)
  );
  const annexSheetAttachments = allAttachments.filter((att) => {
    if (!Boolean(att.url)) return false;
    if (att.page_placement === 'cover_before' || att.page_placement === 'index_only') {
      return false;
    }
    if (att.page_placement === 'annex_after') return true;
    return att.render_as_annex_page !== false;
  });

  const countedCoverCount = coverSheetAttachments.filter(
    (att) => !Boolean(att.exclude_from_page_count)
  ).length;

  const totalDocumentPages =
    countedCoverCount + partitionedMainSheets.length + annexSheetAttachments.length;

  let runningCountedCover = 0;
  const coverSheets: QuotationCoverSheetDescriptor[] = coverSheetAttachments.map(
    (att, coverIdx) => {
      const excluded = Boolean(att.exclude_from_page_count);
      let sheetNumber: number | undefined = undefined;
      if (!excluded) {
        runningCountedCover++;
        sheetNumber = runningCountedCover;
      }
      return {
        coverNumber: coverIdx + 1,
        sheetNumber,
        totalDocumentPages,
        attachment: att,
        fullBleed: Boolean(att.full_bleed),
        excludedFromPageCount: excluded,
        pageLabel: excluded
          ? 'Cover Page'
          : `Page ${sheetNumber} of ${totalDocumentPages}`,
        isLastDocumentSheet: false
      };
    }
  );

  const mainSheets: QuotationSheetPartition[] = partitionedMainSheets.map((sheet, idx) => {
    const isLastMain = idx === partitionedMainSheets.length - 1;
    const effectiveSheetNumber = countedCoverCount + sheet.sheetNumber;
    return {
      ...sheet,
      sheetNumber: effectiveSheetNumber,
      totalSheets: totalDocumentPages,
      pageLabel: `Page ${effectiveSheetNumber} of ${totalDocumentPages}`,
      isLastDocumentSheet: isLastMain && annexSheetAttachments.length === 0
    };
  });

  const annexSheets: QuotationAnnexSheetDescriptor[] = annexSheetAttachments.map(
    (att, annexIdx) => {
      const sheetNumber = countedCoverCount + mainSheets.length + annexIdx + 1;
      const annexNumber = annexIdx + 1;
      const isLastAnnex = annexIdx === annexSheetAttachments.length - 1;
      return {
        annexNumber,
        sheetNumber,
        totalDocumentPages,
        headerTitle: resolveAnnexHeaderTitle(att, annexNumber),
        pageLabel: `Page ${sheetNumber} of ${totalDocumentPages}`,
        attachment: att,
        fullBleed: Boolean(att.full_bleed),
        isLastDocumentSheet: isLastAnnex
      };
    }
  );

  let runningAnnexCounter = 0;
  let runningCoverIndexCounter = 0;
  const submittalsIndexEntries: QuotationSubmittalIndexEntry[] = allAttachments.map(
    (att, idx) => {
      const placement: 'cover_before' | 'annex_after' | 'index_only' =
        att.page_placement ||
        (att.render_as_annex_page === false ? 'index_only' : 'annex_after');
      const isAnnex = placement === 'annex_after' && Boolean(att.url);
      const isCover = placement === 'cover_before' && Boolean(att.url);
      let annexPageNumber: number | undefined = undefined;
      let badgeLabel = 'Enclosed Document';

      if (isCover) {
        runningCoverIndexCounter++;
        badgeLabel =
          coverSheets[runningCoverIndexCounter - 1]?.excludedFromPageCount
            ? 'Cover Page'
            : `Cover (Page ${coverSheets[runningCoverIndexCounter - 1]?.sheetNumber || 1})`;
      } else if (isAnnex) {
        runningAnnexCounter++;
        annexPageNumber = countedCoverCount + mainSheets.length + runningAnnexCounter;
        badgeLabel = `Annex Page ${annexPageNumber}`;
      }

      return {
        indexNumber: idx + 1,
        id: att.id || `submittal_${idx + 1}`,
        name: att.name || `Technical Submittal ${idx + 1}`,
        url: att.url,
        renderAsAnnexPage: isAnnex || isCover,
        pagePlacement: placement,
        annexPageNumber,
        badgeLabel
      };
    }
  );

  return {
    coverSheetAttachments,
    coverSheets,
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
  showHeaderIcons: true,
  logoSpacing: 'normal',
  logoHeightPx: 48,
  logoMaxWidthPx: 260,
  repeatHeaderOnSubsequentPages: true,
  showLogoOnContinuationPages: true,
  continuationHeaderMode: 'compact',
  continuationLogoHeightPx: 22,
  showCompanyNameOnContinuation: true,
  showSubjectOnContinuation: true,
  showQuoteRefOnContinuation: true,
  showPageNumberOnContinuation: true,
  showContinuationDivider: true
};

export interface ResolvedHeaderBrandingConfig {
  activeLogoUrl: string;
  logoDisplayMode: 'logo_and_name' | 'logo_only' | 'full_banner' | 'no_logo';
  headerLayoutMode: 'split_left' | 'split_right' | 'centered' | 'banner';
  showLogo: boolean;
  showCompanyName: boolean;
  showHeaderIcons: boolean;
  logoHeightPx: number;
  logoMaxWidthPx: number;
  bannerMaxHeightPx: number;
  logoSpacing: 'none' | 'tight' | 'normal' | 'spacious';
  repeatHeaderOnSubsequentPages: boolean;
  showLogoOnContinuationPages: boolean;
  includeMiniLogoOnContinuation: boolean;
  continuationHeaderMode: 'compact' | 'full_repeat' | 'logo_only' | 'none';
  continuationLogoHeightPx: number;
  showCompanyNameOnContinuation: boolean;
  showSubjectOnContinuation: boolean;
  showQuoteRefOnContinuation: boolean;
  showPageNumberOnContinuation: boolean;
  showContinuationDivider: boolean;
  brandHorizontalAlign: 'left' | 'center' | 'right';
  brandVerticalAlign: 'top' | 'middle' | 'bottom';
  contactHorizontalAlign: 'left' | 'center' | 'right';
  contactVerticalAlign: 'top' | 'middle' | 'bottom';
}

/**
 * Pure deterministic resolver for the Corporate Logo & Letterhead Engine.
 * Resolves logo source priority (headerConfig.logoUrl -> quotation.company_logo_url -> profile.logo_url -> ''),
 * 4-way display mode, 4-way layout mode, aspect-ratio dimensions, 2D alignment, and Page 2+ running header options.
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
  const showHeaderIcons = merged.showHeaderIcons !== false;

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

  const rawContinuationMode = merged.continuationHeaderMode;
  const repeatHeaderOnSubsequentPages =
    rawContinuationMode === 'none'
      ? false
      : merged.repeatHeaderOnSubsequentPages !== false &&
        quotation?.repeatHeaderOnSubsequentPages !== false &&
        profile?.repeatHeaderOnSubsequentPages !== false;

  const continuationHeaderMode: 'compact' | 'full_repeat' | 'logo_only' | 'none' =
    !repeatHeaderOnSubsequentPages
      ? 'none'
      : rawContinuationMode || 'compact';

  const rawContLogoHeight =
    typeof merged.continuationLogoHeightPx === 'number'
      ? merged.continuationLogoHeightPx
      : 22;
  const continuationLogoHeightPx = Math.min(48, Math.max(16, rawContLogoHeight));

  const showLogoOnContinuationPages =
    continuationHeaderMode === 'logo_only'
      ? true
      : merged.showLogoOnContinuationPages !== false;
  const includeMiniLogoOnContinuation =
    Boolean(activeLogoUrl) && showLogo && showLogoOnContinuationPages;

  const showCompanyNameOnContinuation = merged.showCompanyNameOnContinuation !== false;
  const showSubjectOnContinuation = merged.showSubjectOnContinuation !== false;
  const showQuoteRefOnContinuation = merged.showQuoteRefOnContinuation !== false;
  const showPageNumberOnContinuation = merged.showPageNumberOnContinuation !== false;
  const showContinuationDivider = merged.showContinuationDivider !== false;

  const brandHorizontalAlign: 'left' | 'center' | 'right' =
    merged.brandHorizontalAlign ||
    (headerLayoutMode === 'centered' || headerLayoutMode === 'banner'
      ? 'center'
      : headerLayoutMode === 'split_right'
      ? 'right'
      : 'left');
  const brandVerticalAlign: 'top' | 'middle' | 'bottom' =
    merged.brandVerticalAlign || 'top';

  const contactHorizontalAlign: 'left' | 'center' | 'right' =
    merged.contactHorizontalAlign ||
    (headerLayoutMode === 'centered' || headerLayoutMode === 'banner'
      ? 'center'
      : headerLayoutMode === 'split_right'
      ? 'left'
      : 'right');
  const contactVerticalAlign: 'top' | 'middle' | 'bottom' =
    merged.contactVerticalAlign || 'top';

  return {
    activeLogoUrl,
    logoDisplayMode,
    headerLayoutMode,
    showLogo,
    showCompanyName,
    showHeaderIcons,
    logoHeightPx,
    logoMaxWidthPx,
    bannerMaxHeightPx,
    logoSpacing,
    repeatHeaderOnSubsequentPages,
    showLogoOnContinuationPages,
    includeMiniLogoOnContinuation,
    continuationHeaderMode,
    continuationLogoHeightPx,
    showCompanyNameOnContinuation,
    showSubjectOnContinuation,
    showQuoteRefOnContinuation,
    showPageNumberOnContinuation,
    showContinuationDivider,
    brandHorizontalAlign,
    brandVerticalAlign,
    contactHorizontalAlign,
    contactVerticalAlign
  };
}

export interface ResolvedDocumentThemePalette {
  primaryHex: string;
  tintBg: string;
  tintStrongBg: string;
  borderTint: string;
  textAccent: string;
}

/**
 * Pure deterministic helper that builds a harmonized 5-token document color palette
 * from customThemeColor (if provided) or the active preset theme (navy, emerald, blue, crimson, slate).
 */
export function resolveDocumentThemePalette(
  themeAccent?: QuotationThemeAccent | null,
  customThemeColor?: string | null,
  profileAccentColor?: string | null
): ResolvedDocumentThemePalette {
  const cleanCustom = (customThemeColor || '').trim();
  const isHex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(cleanCustom);
  const presetTheme = themeAccent && QUOTATION_THEMES[themeAccent] ? QUOTATION_THEMES[themeAccent] : null;
  const rawPrimary = isHex
    ? cleanCustom
    : presetTheme
    ? presetTheme.primaryHex
    : profileAccentColor && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(profileAccentColor.trim())
    ? profileAccentColor.trim()
    : QUOTATION_THEMES.navy.primaryHex;

  // Expand 3-digit hex to 6-digit hex if needed
  const normalizedHex =
    rawPrimary.length === 4
      ? `#${rawPrimary[1]}${rawPrimary[1]}${rawPrimary[2]}${rawPrimary[2]}${rawPrimary[3]}${rawPrimary[3]}`.toLowerCase()
      : rawPrimary.toLowerCase();

  const r = parseInt(normalizedHex.slice(1, 3), 16) || 15;
  const g = parseInt(normalizedHex.slice(3, 5), 16) || 23;
  const b = parseInt(normalizedHex.slice(5, 7), 16) || 42;

  return {
    primaryHex: normalizedHex,
    tintBg: `rgba(${r}, ${g}, ${b}, 0.06)`,
    tintStrongBg: `rgba(${r}, ${g}, ${b}, 0.11)`,
    borderTint: `rgba(${r}, ${g}, ${b}, 0.24)`,
    textAccent: normalizedHex
  };
}

export interface ResolvedStampSignatureOverlayConfig {
  activeSealUrl: string;
  activeSignatureUrl: string;
  sealSizePx: number;
  sealRotationDeg: number;
  sealOffsetX: number;
  sealOffsetY: number;
  signatureSizePx: number;
  signatureRotationDeg: number;
  signatureOffsetX: number;
  signatureOffsetY: number;
  stampSignatureOverlapMode: 'side_by_side' | 'realistic_overlap' | 'stamp_over_name';
  inkMultiplyBlend: boolean;
  showCompanySealLabel: boolean;
  sealTransformStyle: string;
  signatureTransformStyle: string;
}

/**
 * Pure deterministic resolver for MS Word "In Front of Text" free-floating Stamp & Signature overlays.
 */
export function resolveStampSignatureOverlayConfig(
  footerConfig?: QuotationFooterConfig | null,
  quotation?: Partial<Quotation> | null,
  profile?: Partial<WorkspaceDocumentProfile> | null
): ResolvedStampSignatureOverlayConfig {
  const mergedFooter: QuotationFooterConfig = {
    ...(profile?.footer_config || {}),
    ...(quotation?.footer_config || {}),
    ...(footerConfig || {})
  };

  const activeSealUrl = (
    quotation?.company_seal_url ||
    mergedFooter.companySealUrl ||
    (quotation as any)?.companySettings?.company_seal_url ||
    profile?.company_seal_url ||
    profile?.stamp_seal_url ||
    quotation?.sender_snapshot?.stamp_seal_url ||
    ''
  ).trim();

  const activeSignatureUrl = (
    quotation?.signature_image_url ||
    quotation?.signatories?.[0]?.signature_url ||
    profile?.signature_image_url ||
    ''
  ).trim();

  const clamp = (val: number | undefined, min: number, max: number, fallback: number) =>
    typeof val === 'number' && Number.isFinite(val) ? Math.min(max, Math.max(min, val)) : fallback;

  const sealSizePx = clamp(mergedFooter.sealSizePx, 60, 180, 105);
  const sealRotationDeg = clamp(mergedFooter.sealRotationDeg, -35, 35, -6);
  const sealOffsetX = clamp(mergedFooter.sealOffsetX, -120, 120, 0);
  const sealOffsetY = clamp(mergedFooter.sealOffsetY, -80, 80, 0);

  const signatureSizePx = clamp(mergedFooter.signatureSizePx, 32, 130, 56);
  const signatureRotationDeg = clamp(mergedFooter.signatureRotationDeg, -25, 25, 0);
  const signatureOffsetX = clamp(mergedFooter.signatureOffsetX, -120, 120, 0);
  const signatureOffsetY = clamp(mergedFooter.signatureOffsetY, -80, 80, 0);

  const stampSignatureOverlapMode: 'side_by_side' | 'realistic_overlap' | 'stamp_over_name' =
    mergedFooter.stampSignatureOverlapMode || 'realistic_overlap';

  const inkMultiplyBlend = mergedFooter.inkMultiplyBlend !== false;
  const showCompanySealLabel = !Boolean(activeSealUrl);

  const modeExtraX =
    stampSignatureOverlapMode === 'realistic_overlap'
      ? 20
      : stampSignatureOverlapMode === 'stamp_over_name'
      ? 46
      : 0;
  const modeExtraY =
    stampSignatureOverlapMode === 'stamp_over_name' ? 14 : 0;

  const totalSealX = sealOffsetX + modeExtraX;
  const totalSealY = sealOffsetY + modeExtraY;

  return {
    activeSealUrl,
    activeSignatureUrl,
    sealSizePx,
    sealRotationDeg,
    sealOffsetX,
    sealOffsetY,
    signatureSizePx,
    signatureRotationDeg,
    signatureOffsetX,
    signatureOffsetY,
    stampSignatureOverlapMode,
    inkMultiplyBlend,
    showCompanySealLabel,
    sealTransformStyle: `translate(${totalSealX}px, ${totalSealY}px) rotate(${sealRotationDeg}deg)`,
    signatureTransformStyle: `translate(${signatureOffsetX}px, ${signatureOffsetY}px) rotate(${signatureRotationDeg}deg)`
  };
}

export interface ResolvedHeaderFieldRenderItem extends QuotationHeaderFieldItem {
  resolvedValue: string;
  fontSizeClass: string;
  fontWeightClass: string;
}

/**
 * Pure deterministic resolver for the Modular Header Field Composer.
 * Supports custom text overrides, custom fields (e.g. Secondary Mobile), zone routing
 * ('under_logo', 'under_name', 'contact_block', 'bottom_bar'), reordering, and per-field typography.
 */
export function resolveHeaderFields(
  headerConfig?: QuotationHeaderConfig | null,
  sender?: {
    address_line_1?: string;
    address_line_2?: string;
    city?: string;
    country?: string;
    address?: string;
    phone?: string;
    email?: string;
    website?: string;
    trn?: string;
  } | null,
  fallbackSender?: {
    address_line_1?: string;
    address_line_2?: string;
    city?: string;
    country?: string;
    address?: string;
    phone?: string;
    email?: string;
    website?: string;
    trn?: string;
  } | null,
  fontSizeScale: QuotationFontSizeScale = 'standard'
): {
  allFields: ResolvedHeaderFieldRenderItem[];
  underLogo: ResolvedHeaderFieldRenderItem[];
  underName: ResolvedHeaderFieldRenderItem[];
  contactBlock: ResolvedHeaderFieldRenderItem[];
  bottomBar: ResolvedHeaderFieldRenderItem[];
  brandHorizontalAlign: 'left' | 'center' | 'right';
  brandVerticalAlign: 'top' | 'middle' | 'bottom';
  contactHorizontalAlign: 'left' | 'center' | 'right';
  contactVerticalAlign: 'top' | 'middle' | 'bottom';
  showHeaderIcons: boolean;
} {
  const cfg = headerConfig || {};
  const s = {
    ...(fallbackSender || {}),
    ...(sender || {})
  };

  const cityCountry = [s.city, s.country].filter(Boolean).join(', ');
  const combinedParts = [s.address_line_1, s.address_line_2, cityCountry]
    .map((p) => (p || '').trim())
    .filter(Boolean);
  const unifiedAddress =
    combinedParts.length > 0 ? combinedParts.join(', ') : (s.address || '').trim();
  const fallbackFullAddress =
    !s.address_line_1 && !s.address_line_2 && !cityCountry ? s.address || '' : '';

  const defaultValuesById: Record<string, string> = {
    trn: s.trn || '',
    address: unifiedAddress,
    address_line_1: s.address_line_1 || fallbackFullAddress || '',
    address_line_2: s.address_line_2 || '',
    city_country: cityCountry,
    phone: s.phone || '',
    email: s.email || '',
    website: s.website || ''
  };

  const defaultLabelsById: Record<string, string> = {
    trn: 'TRN / VAT Reg:',
    address: '',
    address_line_1: '',
    address_line_2: '',
    city_country: '',
    phone: 'Tel:',
    email: 'Email:',
    website: 'Web:'
  };

  const defaultIconsById: Record<string, QuotationHeaderFieldItem['icon']> = {
    trn: 'hash',
    address: 'map-pin',
    address_line_1: 'map-pin',
    address_line_2: 'map-pin',
    city_country: 'map-pin',
    phone: 'phone',
    email: 'mail',
    website: 'globe'
  };

  const hasCustomHeaderFields = Array.isArray(cfg.headerFields) && cfg.headerFields.length > 0;

  // Migrate/collapse legacy 3-part address_line_1 / address_line_2 / city_country into unified 'address' if no 'address' field exists yet
  const normalizedCustomFields = (() => {
    if (!hasCustomHeaderFields) return [];
    const list = cfg.headerFields!;
    const hasLegacyAddressParts = list.some(
      (f) => f.id === 'address_line_1' || f.id === 'address_line_2' || f.id === 'city_country'
    );
    const hasUnifiedAddress = list.some((f) => f.id === 'address');
    if (!hasLegacyAddressParts) return list;

    const legacyParts = list.filter(
      (f) => f.id === 'address_line_1' || f.id === 'address_line_2' || f.id === 'city_country'
    );
    const anyLegacyEnabled = legacyParts.some((f) => f.enabled !== false);
    const firstLegacy = legacyParts[0];
    const customOverrideParts = legacyParts
      .map((f) =>
        f.valueOverride !== undefined && f.valueOverride.trim() !== ''
          ? f.valueOverride.trim()
          : (defaultValuesById[f.id] || '').trim()
      )
      .filter(Boolean);
    const hasAnyExplicitOverride = legacyParts.some(
      (f) => f.valueOverride !== undefined && f.valueOverride.trim() !== ''
    );

    const out: QuotationHeaderFieldItem[] = [];
    let insertedAddress = hasUnifiedAddress;
    for (const f of list) {
      if (f.id === 'address_line_1' || f.id === 'address_line_2' || f.id === 'city_country') {
        if (!insertedAddress) {
          insertedAddress = true;
          out.push({
            id: 'address',
            label: firstLegacy?.label ?? '',
            valueOverride: hasAnyExplicitOverride ? customOverrideParts.join(', ') : undefined,
            enabled: anyLegacyEnabled,
            zone: firstLegacy?.zone || 'contact_block',
            fontSize: firstLegacy?.fontSize || 'xs',
            fontWeight: firstLegacy?.fontWeight || 'normal',
            icon: firstLegacy?.icon || 'map-pin',
            showIcon: firstLegacy?.showIcon ?? true
          });
        }
      } else {
        out.push(f);
      }
    }
    return out;
  })();

  const rawItems: QuotationHeaderFieldItem[] = hasCustomHeaderFields
    ? normalizedCustomFields
    : [
        {
          id: 'trn',
          label: 'TRN / VAT Reg:',
          enabled: cfg.showTrn !== false && Boolean(defaultValuesById.trn),
          zone: 'under_name',
          fontSize: 'xs',
          fontWeight: 'bold',
          icon: 'hash',
          showIcon: false
        },
        {
          id: 'address',
          label: '',
          enabled: Boolean(defaultValuesById.address),
          zone: 'contact_block',
          fontSize: 'xs',
          fontWeight: 'normal',
          icon: 'map-pin',
          showIcon: true
        },
        {
          id: 'phone',
          label: 'Tel:',
          enabled: cfg.showPhone !== false && Boolean(defaultValuesById.phone),
          zone: 'contact_block',
          fontSize: 'xs',
          fontWeight: 'normal',
          icon: 'phone',
          showIcon: true
        },
        {
          id: 'email',
          label: 'Email:',
          enabled: cfg.showEmail !== false && Boolean(defaultValuesById.email),
          zone: 'contact_block',
          fontSize: 'xs',
          fontWeight: 'normal',
          icon: 'mail',
          showIcon: true
        },
        {
          id: 'website',
          label: 'Web:',
          enabled: cfg.showWebsite !== false && Boolean(defaultValuesById.website),
          zone: 'contact_block',
          fontSize: 'xs',
          fontWeight: 'normal',
          icon: 'globe',
          showIcon: true
        }
      ];

  const fontSizeMapByScale: Record<QuotationFontSizeScale, Record<string, string>> = {
    compact: {
      xs: 'text-[8.5px] print:text-[8px]',
      sm: 'text-[9.5px] print:text-[8.5px]',
      base: 'text-[10.5px] print:text-[9.5px]',
      lg: 'text-xs print:text-[10.5px]'
    },
    standard: {
      xs: 'text-[9.5px] print:text-[8.5px]',
      sm: 'text-[10.5px] print:text-[9.5px]',
      base: 'text-xs print:text-[10.5px]',
      lg: 'text-sm print:text-xs'
    },
    comfortable: {
      xs: 'text-[10.5px] print:text-[9.5px]',
      sm: 'text-[11.5px] print:text-[10.5px]',
      base: 'text-[13px] print:text-[11.5px]',
      lg: 'text-base print:text-sm'
    },
    large: {
      xs: 'text-[11.5px] print:text-[10.5px]',
      sm: 'text-[12.5px] print:text-[11.5px]',
      base: 'text-sm print:text-xs',
      lg: 'text-lg print:text-base'
    }
  };
  const fontSizeMap = fontSizeMapByScale[fontSizeScale] || fontSizeMapByScale.standard;

  const fontWeightMap: Record<string, string> = {
    normal: 'font-normal',
    medium: 'font-medium',
    bold: 'font-bold'
  };

  const allFields: ResolvedHeaderFieldRenderItem[] = rawItems.map((item) => {
    const hasOverride = item.valueOverride !== undefined && item.valueOverride.trim() !== '';
    const resolvedValue = hasOverride
      ? item.valueOverride!.trim()
      : (defaultValuesById[item.id] || '').trim();

    let effectiveEnabled = Boolean(item.enabled);
    if (!hasCustomHeaderFields) {
      effectiveEnabled = effectiveEnabled && Boolean(resolvedValue);
      if (item.id === 'phone' && cfg.showPhone === false) effectiveEnabled = false;
      if (item.id === 'email' && cfg.showEmail === false) effectiveEnabled = false;
      if (item.id === 'website' && cfg.showWebsite === false) effectiveEnabled = false;
      if (item.id === 'trn' && cfg.showTrn === false) effectiveEnabled = false;
    }

    const resolvedIcon: QuotationHeaderFieldItem['icon'] =
      item.icon ||
      defaultIconsById[item.id] ||
      (item.id.startsWith('custom_mob') ? 'smartphone' : 'none');

    const resolvedShowIcon =
      item.showIcon !== undefined
        ? Boolean(item.showIcon)
        : item.id === 'trn'
        ? false
        : resolvedIcon !== 'none';

    return {
      ...item,
      icon: resolvedIcon,
      showIcon: resolvedShowIcon,
      label: item.label !== undefined ? item.label : (defaultLabelsById[item.id] ?? ''),
      enabled: effectiveEnabled,
      resolvedValue,
      fontSizeClass: fontSizeMap[item.fontSize || 'xs'] || fontSizeMap.xs,
      fontWeightClass: fontWeightMap[item.fontWeight || 'normal'] || fontWeightMap.normal
    };
  });

  const active = allFields.filter((f) => f.enabled && Boolean(f.resolvedValue));

  return {
    allFields,
    underLogo: active.filter((f) => f.zone === 'under_logo'),
    underName: active.filter((f) => f.zone === 'under_name'),
    contactBlock: active.filter((f) => f.zone === 'contact_block'),
    bottomBar: active.filter((f) => f.zone === 'bottom_bar'),
    brandHorizontalAlign: cfg.brandHorizontalAlign || 'left',
    brandVerticalAlign: cfg.brandVerticalAlign || 'top',
    contactHorizontalAlign: cfg.contactHorizontalAlign || 'right',
    contactVerticalAlign: cfg.contactVerticalAlign || 'top',
    showHeaderIcons: cfg.showHeaderIcons !== false
  };
}

export function resolveFooterPresentation(
  footerConfig?: QuotationFooterConfig | null
) {
  const cfg = footerConfig || {};
  return {
    footerHorizontalAlign: cfg.footerHorizontalAlign || 'split',
    footerVerticalAlign: cfg.footerVerticalAlign || 'middle',
    showSystemTagline: cfg.showSystemTagline !== false,
    systemTaglineText:
      cfg.systemTaglineText !== undefined && cfg.systemTaglineText.trim() !== ''
        ? cfg.systemTaglineText.trim()
        : 'Omni Suite Commercial Engine',
    showReferenceInFooter: cfg.showReferenceInFooter !== false,
    showIssueDateInFooter: cfg.showIssueDateInFooter !== false,
    showPageNumbers: cfg.showPageNumbers !== false,
    showDisclaimer: cfg.showDisclaimer !== false,
    customDisclaimer:
      cfg.customDisclaimer ||
      'Computer-generated commercial document. Valid without manual signature when electronically issued.',
    customFooterPills: Array.isArray(cfg.customFooterPills)
      ? cfg.customFooterPills.map((p) => String(p).trim()).filter(Boolean)
      : []
  };
}

export const DEFAULT_FOOTER_CONFIG: QuotationFooterConfig = {
  showPageNumbers: true,
  showDisclaimer: true,
  customDisclaimer: 'Computer-generated commercial document. Valid without manual signature when electronically issued.',
  showBankRemittance: true,
  showCustomerAcceptance: true,
  showSignatories: true,
  footerLayoutMode: 'split',
  sealSizePx: 105,
  sealRotationDeg: -6,
  sealOffsetX: 0,
  sealOffsetY: 0,
  signatureSizePx: 56,
  signatureRotationDeg: 0,
  signatureOffsetX: 0,
  signatureOffsetY: 0,
  stampSignatureOverlapMode: 'realistic_overlap',
  inkMultiplyBlend: true,
  footerHorizontalAlign: 'split',
  footerVerticalAlign: 'middle',
  systemTaglineText: 'Omni Suite Commercial Engine',
  showSystemTagline: true,
  showReferenceInFooter: true,
  showIssueDateInFooter: true,
  customFooterPills: []
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
  customThemeColor?: string;
  documentFontFamily?: QuotationDocumentFontFamily;
  topAccentBarStyle?: QuotationTopAccentBarStyle;
  tableHeaderStyle?: QuotationSectionHeaderStyle;
  blockHeaderStyle?: QuotationSectionHeaderStyle;
  layoutBlocks?: QuotationBlockConfig[];
  selectedBlockId?: StudioSelectedSection;
  selectedSection?: StudioSelectedSection;
  onSelectBlock?: (id: StudioSelectedSection) => void;
  onSelectSection?: (section: StudioSelectedSection, subTarget?: string) => void;
  onInlineFieldEdit?: (fieldKey: string, nextValue: string) => void;
  showPageBreakGuides?: boolean;
}

interface EditableCanvasTextProps {
  value: string;
  fieldKey: string;
  canEdit: boolean;
  onCommit?: (fieldKey: string, nextValue: string) => void;
  className?: string;
  multiline?: boolean;
  placeholder?: string;
}

const EditableCanvasText: React.FC<EditableCanvasTextProps> = ({
  value,
  fieldKey,
  canEdit,
  onCommit,
  className = '',
  multiline = false,
  placeholder = 'Click to edit...'
}) => {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value || '');

  React.useEffect(() => {
    if (!editing) {
      setDraft(value || '');
    }
  }, [value, editing]);

  if (!canEdit || !onCommit) {
    return <span className={className}>{value}</span>;
  }

  if (editing) {
    const commit = () => {
      setEditing(false);
      if (draft !== (value || '')) {
        onCommit(fieldKey, draft);
      }
    };
    if (multiline) {
      return (
        <textarea
          autoFocus
          value={draft}
          rows={2}
          placeholder={placeholder}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setDraft(value || '');
              setEditing(false);
            } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              commit();
            }
          }}
          className={`bg-white text-slate-900 border border-blue-500 rounded px-1.5 py-0.5 outline-none ring-2 ring-blue-300/60 w-full max-w-full font-sans print:hidden ${className}`}
        />
      );
    }
    return (
      <input
        type="text"
        autoFocus
        value={draft}
        placeholder={placeholder}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            e.stopPropagation();
            setDraft(value || '');
            setEditing(false);
          }
        }}
        className={`bg-white text-slate-900 border border-blue-500 rounded px-1 py-0 outline-none ring-2 ring-blue-300/60 min-w-[90px] max-w-full print:hidden ${className}`}
      />
    );
  }

  return (
    <span
      title="Click to edit text directly on page"
      onClick={(e) => {
        e.stopPropagation();
        setDraft(value || '');
        setEditing(true);
      }}
      className={`cursor-text border-b border-dashed border-blue-400/70 hover:bg-blue-50/70 hover:border-blue-600 rounded-xs px-0.5 -mx-0.5 transition-colors print:border-none print:bg-transparent print:p-0 print:m-0 ${className}`}
    >
      {value || <span className="text-slate-400 italic print:hidden">{placeholder}</span>}
    </span>
  );
};

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
  customThemeColor: propCustomThemeColor,
  documentFontFamily: propDocumentFontFamily,
  topAccentBarStyle: propTopAccentBarStyle,
  tableHeaderStyle: propTableHeaderStyle,
  blockHeaderStyle: propBlockHeaderStyle,
  layoutBlocks,
  selectedBlockId,
  selectedSection,
  onSelectBlock,
  onSelectSection,
  onInlineFieldEdit,
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

  // Resolve theme accent & unified document theme palette
  const activeThemeKey: QuotationThemeAccent =
    quotation.theme_accent || profile?.theme_accent || 'navy';
  const theme = QUOTATION_THEMES[activeThemeKey] || QUOTATION_THEMES.navy;
  const resolvedCustomThemeColor =
    propCustomThemeColor ||
    quotation.customThemeColor ||
    profile?.customThemeColor ||
    undefined;
  const themePalette = React.useMemo(
    () =>
      resolveDocumentThemePalette(
        activeThemeKey,
        resolvedCustomThemeColor,
        profile?.accent_color
      ),
    [activeThemeKey, resolvedCustomThemeColor, profile?.accent_color]
  );
  const accentColor = themePalette.primaryHex;

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
          h1: 'text-lg sm:text-xl print:text-lg',
          quoteRef: 'text-sm sm:text-base print:text-sm',
          entityTitle: 'text-xs print:text-[11px]',
          heading: 'text-[9.5px] print:text-[9px]',
          body: 'text-[8.5px] print:text-[8px]',
          sub: 'text-[8px] print:text-[7.5px]',
          micro: 'text-[7.5px] print:text-[7px]',
          rawBase: '8.5px'
        };
      case 'comfortable':
        return {
          h1: 'text-2xl sm:text-[26px] print:text-2xl',
          quoteRef: 'text-lg sm:text-xl print:text-lg',
          entityTitle: 'text-base print:text-sm',
          heading: 'text-[11.5px] print:text-[11px]',
          body: 'text-[10.5px] print:text-[10px]',
          sub: 'text-[9.5px] print:text-[9px]',
          micro: 'text-[9px] print:text-[8.5px]',
          rawBase: '10.5px'
        };
      case 'large':
        return {
          h1: 'text-2xl sm:text-3xl print:text-[26px]',
          quoteRef: 'text-xl sm:text-2xl print:text-xl',
          entityTitle: 'text-lg print:text-base',
          heading: 'text-[12.5px] print:text-[12px]',
          body: 'text-[11.5px] print:text-[11px]',
          sub: 'text-[10.5px] print:text-[10px]',
          micro: 'text-[9.5px] print:text-[9px]',
          rawBase: '11.5px'
        };
      case 'standard':
      default:
        return {
          h1: 'text-xl sm:text-2xl print:text-xl',
          quoteRef: 'text-base sm:text-lg print:text-base',
          entityTitle: 'text-sm print:text-xs',
          heading: 'text-[10.5px] print:text-[10px]',
          body: 'text-[9.5px] print:text-[9px]',
          sub: 'text-[8.5px] print:text-[8px]',
          micro: 'text-[8px] print:text-[7.5px]',
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
  const canEditCanvasInline = Boolean(isInteractive && onInlineFieldEdit);

  const resolvedHeaderConfig: QuotationHeaderConfig = {
    ...DEFAULT_HEADER_CONFIG,
    ...(profile?.header_config || {}),
    ...(quotation.header_config || {}),
    ...(propHeaderConfig || {})
  };

  // Resolve Sister-Company & Multi-Brand Visual Differentiation Styles
  const resolvedDocumentFontFamily: QuotationDocumentFontFamily =
    propDocumentFontFamily ||
    quotation.documentFontFamily ||
    resolvedHeaderConfig.documentFontFamily ||
    (quotation as any).presentation_preset?.documentFontFamily ||
    'sans';

  const documentFontClass =
    resolvedDocumentFontFamily === 'serif'
      ? 'font-serif'
      : resolvedDocumentFontFamily === 'technical'
      ? 'font-mono'
      : 'font-sans';

  const resolvedTopAccentBarStyle: QuotationTopAccentBarStyle =
    propTopAccentBarStyle ||
    quotation.topAccentBarStyle ||
    resolvedHeaderConfig.topAccentBarStyle ||
    (quotation as any).presentation_preset?.topAccentBarStyle ||
    'thick';

  const resolvedTableHeaderStyle: QuotationSectionHeaderStyle =
    propTableHeaderStyle ||
    quotation.tableHeaderStyle ||
    resolvedHeaderConfig.tableHeaderStyle ||
    (quotation as any).presentation_preset?.tableHeaderStyle ||
    'tinted';

  const resolvedBlockHeaderStyle: QuotationSectionHeaderStyle =
    propBlockHeaderStyle ||
    quotation.blockHeaderStyle ||
    resolvedHeaderConfig.blockHeaderStyle ||
    (quotation as any).presentation_preset?.blockHeaderStyle ||
    'underline';

  const renderTopAccentBar = () => {
    if (resolvedTopAccentBarStyle === 'none') return null;
    if (resolvedTopAccentBarStyle === 'double') {
      return (
        <div className="top-accent-bar absolute top-0 left-0 right-0 w-full print:w-full flex flex-col">
          <div className="h-1.5 w-full" style={{ backgroundColor: accentColor }} />
          <div className="h-0.5 w-full bg-white" />
          <div className="h-0.5 w-full" style={{ backgroundColor: accentColor, opacity: 0.7 }} />
        </div>
      );
    }
    if (resolvedTopAccentBarStyle === 'side_accent') {
      return (
        <div
          className="top-accent-bar absolute top-0 bottom-0 left-0 w-2 h-full"
          style={{ backgroundColor: accentColor }}
        />
      );
    }
    return (
      <div
        className="top-accent-bar absolute top-0 left-0 right-0 h-2 w-full print:w-full"
        style={{ backgroundColor: accentColor }}
      />
    );
  };

  const getBlockHeaderBannerStyle = (
    blockConfig?: QuotationBlockConfig
  ): { className: string; style: React.CSSProperties; iconColor: string; hidden?: boolean } => {
    const effectiveStyle =
      blockConfig?.headerStyleOverride && blockConfig.headerStyleOverride !== 'inherit'
        ? blockConfig.headerStyleOverride
        : resolvedBlockHeaderStyle;

    if (effectiveStyle === 'none') {
      return {
        className: 'hidden',
        style: {},
        iconColor: themePalette.textAccent,
        hidden: true
      };
    }
    if (effectiveStyle === 'solid') {
      return {
        className: 'px-2 py-1 rounded-xs mb-1.5',
        style: { backgroundColor: themePalette.primaryHex, color: '#ffffff' },
        iconColor: '#ffffff'
      };
    }
    if (effectiveStyle === 'tinted') {
      return {
        className: 'px-2 py-1 rounded-xs mb-1.5 border-l-2',
        style: {
          backgroundColor: themePalette.tintStrongBg,
          borderColor: themePalette.primaryHex,
          color: themePalette.textAccent
        },
        iconColor: themePalette.textAccent
      };
    }
    if (effectiveStyle === 'minimal') {
      return {
        className: 'pb-0.5 mb-1',
        style: { color: themePalette.textAccent },
        iconColor: themePalette.textAccent
      };
    }
    // default 'underline'
    return {
      className: 'pb-1 mb-1 border-b border-slate-200',
      style: { color: themePalette.textAccent, borderColor: themePalette.borderTint },
      iconColor: themePalette.textAccent
    };
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
  const signatoryType: 'single' | 'dual' | 'stamp_only' | 'none' =
    quotation.signatory_type ||
    quotation.signatory_mode ||
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

  // Resolve sender info from preset/header override first (Sister-Company support), then profile, then quotation.sender_snapshot
  const senderEntityName =
    (resolvedHeaderConfig.companyNameOverride && resolvedHeaderConfig.companyNameOverride.trim()) ||
    (quotation.companyNameOverride && quotation.companyNameOverride.trim()) ||
    ((quotation as any).presentation_preset?.companyNameOverride &&
      String((quotation as any).presentation_preset.companyNameOverride).trim()) ||
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
    const bSwift = (rawBank.swiftCode || rawBank.swift_bic || rawBank.swift_code || '').trim();
    const bBranch = (rawBank.branchName || rawBank.branch_address || '').trim();
    const bBeneficiary = (
      rawBank.beneficiaryName ||
      rawBank.account_name ||
      rawBank.account_title ||
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
      branchName: bBranch,
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
    if (!repeatHeaderOnSubsequentPages || headerBranding.continuationHeaderMode === 'none') {
      return null;
    }
    const quoteRef = quotation.formatted_quote_ref || quotation.quote_number || 'QT-DRAFT';
    const subjectText = (quotation.subject || enquiry?.subject || '').trim();
    const contLogoHeight = headerBranding.continuationLogoHeightPx || 20;
    const dividerClass = headerBranding.showContinuationDivider
      ? 'border-b border-slate-200 pb-1.5'
      : 'pb-1';

    if (headerBranding.continuationHeaderMode === 'logo_only') {
      return (
        <div
          className={`compact-running-header flex justify-between items-center ${dividerClass} mb-3 w-full bg-white ${extraClass}`}
          style={{ minHeight: `${Math.max(24, contLogoHeight + 6)}px` }}
        >
          <div className="flex items-center">
            {headerBranding.activeLogoUrl && !logoLoadFailed && (
              <img
                src={headerBranding.activeLogoUrl}
                alt={senderEntityName || ''}
                style={{ height: `${contLogoHeight}px`, maxWidth: '160px' }}
                className="w-auto object-contain shrink-0"
                onError={() => setLogoLoadFailed(true)}
              />
            )}
          </div>
          {headerBranding.showPageNumberOnContinuation && (
            <div className={`${typoScale.micro} text-slate-500 font-mono text-right shrink-0`}>
              Page {pageNumber} of {total}
            </div>
          )}
        </div>
      );
    }

    const rightTokens: string[] = [formatDate(quotation.created_at)];
    if (headerBranding.showQuoteRefOnContinuation) {
      rightTokens.push(quoteRef);
    }
    if (headerBranding.showPageNumberOnContinuation) {
      rightTokens.push(`Page ${pageNumber} of ${total}`);
    }

    return (
      <div
        className={`compact-running-header flex justify-between items-center ${dividerClass} mb-3 w-full bg-white ${extraClass}`}
        style={{ minHeight: `${Math.max(26, contLogoHeight + 6)}px` }}
      >
        {/* Left: Mini Logo + Company Legal/Short Name */}
        <div className="flex items-center min-w-0 max-w-[38%]">
          {headerBranding.includeMiniLogoOnContinuation && !logoLoadFailed && (
            <img
              src={headerBranding.activeLogoUrl}
              alt=""
              style={{ height: `${contLogoHeight}px`, maxWidth: '130px' }}
              className="w-auto object-contain mr-2 shrink-0"
              onError={() => setLogoLoadFailed(true)}
            />
          )}
          {headerBranding.showCompanyNameOnContinuation && (
            <div className={`${typoScale.sub} font-bold text-slate-800 tracking-tight uppercase truncate`}>
              {senderEntityName || 'Company'}
            </div>
          )}
        </div>

        {/* Middle: Project Subject (no duplicate quoteRef here) */}
        <div className={`${typoScale.sub} text-slate-600 font-medium truncate max-w-[260px] text-center px-2`}>
          {headerBranding.showSubjectOnContinuation && subjectText ? subjectText : ''}
        </div>

        {/* Right: Date, Quote Ref & Page indicator */}
        <div className={`${typoScale.micro} text-slate-500 font-mono text-right shrink-0`}>
          {rightTokens.join(' • ')}
        </div>
      </div>
    );
  };

  const footerPresentation = React.useMemo(
    () => resolveFooterPresentation(resolvedFooterConfig),
    [resolvedFooterConfig]
  );

  // Reusable micro-footer watermark helper
  const renderFooter = (pageNumber: number, totalPages: number) => {
    const hAlign = footerPresentation.footerHorizontalAlign;
    const vAlign = footerPresentation.footerVerticalAlign;
    const vAlignClass =
      vAlign === 'top' ? 'items-start' : vAlign === 'bottom' ? 'items-end' : 'items-center';
    const layoutClass =
      hAlign === 'center'
        ? `flex flex-col items-center text-center gap-1`
        : hAlign === 'left'
        ? `flex flex-col items-start text-left gap-1`
        : hAlign === 'right'
        ? `flex flex-col items-end text-right gap-1`
        : `flex flex-col sm:flex-row justify-between ${vAlignClass} print:flex-row print:justify-between`;

    const metaTokens: React.ReactNode[] = [];
    if (footerPresentation.showSystemTagline && footerPresentation.systemTaglineText) {
      metaTokens.push(<span key="tagline">{footerPresentation.systemTaglineText}</span>);
    }
    if (footerPresentation.showReferenceInFooter) {
      metaTokens.push(
        <span key="ref" className="font-mono font-medium text-slate-500">
          Ref: {quotation.formatted_quote_ref || quotation.quote_number}
        </span>
      );
      metaTokens.push(<span key="rev">Rev {quotation.revision_number || 1}</span>);
      metaTokens.push(
        <span key="status" className="font-semibold uppercase text-slate-500">
          {String(quotation.status || 'Draft').toUpperCase()}
        </span>
      );
      if (enquiry?.enquiry_number) {
        metaTokens.push(<span key="enq">Enq: {enquiry.enquiry_number}</span>);
      }
    }
    if (footerPresentation.showIssueDateInFooter) {
      metaTokens.push(<span key="date">Date: {formatDate(quotation.created_at)}</span>);
    }
    if (footerPresentation.showPageNumbers) {
      metaTokens.push(
        <span key="page" className={`font-mono ${typoScale.sub} text-slate-500`}>
          Page {pageNumber} of {totalPages}
        </span>
      );
    }
    footerPresentation.customFooterPills.forEach((pill, pIdx) => {
      metaTokens.push(
        <span key={`custom_pill_${pIdx}`} className="font-medium text-slate-500">
          {pill}
        </span>
      );
    });

    return (
      <footer
        className={`document-print-footer quotation-page-footer mt-auto pt-2 border-t border-slate-200 bg-white ${typoScale.sub} break-inside-avoid page-break-inside-avoid w-full print:mt-auto print:border-t print:border-slate-200 relative z-10 group transition-all duration-150 rounded-lg quotation-structural-section ${
          isInteractive ? 'cursor-pointer' : ''
        } ${
          isFooterSelected
            ? 'ring-2 ring-blue-500 ring-offset-2 shadow-sm print:ring-0 !print:ring-0 print:outline-none !print:outline-none print:shadow-none !print:shadow-none'
            : isInteractive
            ? 'hover:ring-1 hover:ring-blue-300 print:ring-0 !print:ring-0 print:outline-none !print:outline-none'
            : ''
        }`}
        onClick={
          isInteractive
            ? (e) => {
                e.stopPropagation();
                onSelectSection?.('footer');
                onSelectBlock?.('footer' as any);
              }
            : undefined
        }
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
          <div
            className={`quotation-canvas-guide absolute -top-2.5 right-3 px-2 py-0.5 rounded text-[9px] font-semibold tracking-wide uppercase shadow-xs transition-opacity print:hidden z-10 ${
              isFooterSelected
                ? 'bg-blue-600 text-white opacity-100'
                : 'bg-slate-200 text-slate-700 opacity-0 group-hover:opacity-100'
            }`}
          >
            Footer &amp; Legal
          </div>
        )}
        <div
          className={`${layoutClass} ${typoScale.sub} text-slate-400 w-full`}
          style={{ width: '100%', maxWidth: '100%' }}
        >
          {metaTokens.length > 0 && (
            <span
              className={`flex items-center gap-1.5 flex-wrap ${
                hAlign === 'center'
                  ? 'justify-center'
                  : hAlign === 'right'
                  ? 'justify-end'
                  : 'justify-start'
              }`}
            >
              {metaTokens.map((tok, tIdx) => (
                <React.Fragment key={tIdx}>
                  {tok}
                  {tIdx < metaTokens.length - 1 && <span>•</span>}
                </React.Fragment>
              ))}
            </span>
          )}
          {footerPresentation.showDisclaimer && (
            <span className="mt-1 sm:mt-0 italic">
              <EditableCanvasText
                value={footerPresentation.customDisclaimer}
                fieldKey="footer_disclaimer"
                canEdit={canEditCanvasInline && isFooterSelected}
                onCommit={onInlineFieldEdit}
                placeholder="Enter footer disclaimer..."
              />
            </span>
          )}
        </div>
      </footer>
    );
  };

  // Partition active layoutBlocks + lineItems + flyer_attachments into discrete A4 cover, main & annex sheets
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

  const coverSheets = paginationWithAnnexes.coverSheets;
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
            className={`${typoScale.heading} font-bold uppercase tracking-wider flex items-center gap-1.5`}
            style={{ color: accentColor }}
          >
            <FileText className="w-3 h-3 shrink-0" />
            <span>Attached Technical Submittals &amp; Enclosures</span>
          </span>
          <span className={`${typoScale.sub} font-mono text-slate-500`}>
            {paginationWithAnnexes.submittalsIndexEntries.length}{' '}
            {paginationWithAnnexes.submittalsIndexEntries.length === 1 ? 'Document' : 'Documents'}
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {paginationWithAnnexes.submittalsIndexEntries.map((entry) => (
            <div
              key={entry.id}
              className={`flex items-center justify-between gap-2 px-2 py-1 rounded bg-white border border-slate-200/80 print:border-slate-300 ${typoScale.body}`}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span className={`w-4 h-4 rounded bg-slate-100 text-slate-700 font-mono font-bold ${typoScale.sub} flex items-center justify-center shrink-0`}>
                  {entry.indexNumber}
                </span>
                <span className="font-medium text-slate-800 truncate" title={entry.name}>
                  {entry.name}
                </span>
              </div>
              <span
                className={`px-1.5 py-0.5 rounded font-mono ${typoScale.micro} font-semibold shrink-0 border ${
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
    const isTermsBlockSelected = activeSelectedSection === 'terms';
    const isRemittanceBlockSelected = activeSelectedSection === 'remittance';
    const isAcceptanceBlockSelected = activeSelectedSection === 'acceptance';

    const renderBlockSectionHeader = (
      blockConfig: QuotationBlockConfig | undefined,
      defaultTitle: string,
      IconComp: React.ComponentType<{ className?: string; style?: React.CSSProperties }>,
      defaultSubtitle?: string
    ) => {
      const blockHdr = getBlockHeaderBannerStyle(blockConfig);
      if (blockHdr.hidden) return null;
      const titleText =
        blockConfig?.titleOverride !== undefined && blockConfig.titleOverride.trim() !== ''
          ? blockConfig.titleOverride
          : blockConfig?.title && blockConfig.title.trim() !== '' && blockConfig.title !== defaultTitle
          ? blockConfig.title
          : defaultTitle;
      const subtitleText =
        blockConfig?.subtitleOverride !== undefined
          ? blockConfig.subtitleOverride
          : defaultSubtitle;
      const showIcon = blockConfig?.showHeaderIcon !== false;

      return (
        <div
          className={`flex items-center justify-between gap-2 ${blockHdr.className}`}
          style={blockHdr.style}
        >
          <span
            className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[calc(var(--block-base)*1.05)]"
            style={{ color: blockHdr.style.color || blockHdr.iconColor }}
          >
            {showIcon && <IconComp className="w-3.5 h-3.5 shrink-0" style={{ color: blockHdr.iconColor }} />}
            <span>{titleText}</span>
          </span>
          {subtitleText && (
            <span
              className="text-[calc(var(--block-base)*0.85)] italic opacity-80 shrink-0"
              style={{ color: blockHdr.style.color || undefined }}
            >
              {subtitleText}
            </span>
          )}
        </div>
      );
    };

    const renderStandardizedKeyValueRows = (
      blockConfig: QuotationBlockConfig | undefined,
      rows: Array<{
        key: string;
        label: string;
        value: React.ReactNode;
        isMono?: boolean;
        isBold?: boolean;
      }>
    ) => {
      if (rows.length === 0) return null;
      const layoutMode = blockConfig?.fieldLayoutMode || 'split';
      const showDividers = Boolean(blockConfig?.showRowDividers);
      const valAlign =
        blockConfig?.valueAlign || (layoutMode === 'split' ? 'right' : 'left');

      if (layoutMode === 'grid_2col') {
        return (
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-slate-700 text-[var(--block-base)] leading-relaxed mt-1.5">
            {rows.map((row) => (
              <div
                key={row.key}
                className={`flex items-baseline justify-between gap-2 ${
                  showDividers ? 'border-b border-slate-200/70 pb-1' : ''
                }`}
              >
                <span className="font-semibold text-slate-500 shrink-0">{row.label}:</span>
                <span
                  className={`${valAlign === 'right' ? 'text-right' : 'text-left'} ${
                    row.isMono ? 'font-mono tabular-nums' : ''
                  } ${row.isBold ? 'font-bold text-slate-900' : 'font-medium text-slate-800'}`}
                >
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        );
      }

      if (layoutMode === 'inline') {
        return (
          <div className="space-y-1 text-slate-700 text-[var(--block-base)] leading-relaxed mt-1.5">
            {rows.map((row, idx) => (
              <div
                key={row.key}
                className={`flex items-baseline gap-1.5 ${
                  valAlign === 'right' ? 'justify-end text-right' : 'justify-start text-left'
                } ${
                  showDividers && idx < rows.length - 1
                    ? 'border-b border-slate-200/70 pb-1'
                    : ''
                }`}
              >
                <span className="font-semibold text-slate-500 shrink-0">{row.label}:</span>
                <span
                  className={`${row.isMono ? 'font-mono tabular-nums' : ''} ${
                    row.isBold ? 'font-bold text-slate-900' : 'font-medium text-slate-800'
                  }`}
                >
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        );
      }

      // Default 'split' (matches Commercial Terms & Conditions Left Label / Right Value)
      return (
        <div className="space-y-1 text-slate-700 text-[var(--block-base)] leading-relaxed mt-1.5">
          {rows.map((row, idx) => (
            <div
              key={row.key}
              className={`flex items-baseline justify-between gap-3 ${
                showDividers && idx < rows.length - 1
                  ? 'border-b border-slate-200/70 pb-1'
                  : ''
              }`}
            >
              <span className="font-semibold text-slate-500 shrink-0">{row.label}:</span>
              <span
                className={`${valAlign === 'left' ? 'text-left' : 'text-right'} ${
                  row.isMono ? 'font-mono tabular-nums' : ''
                } ${row.isBold ? 'font-bold text-slate-900' : 'font-medium text-slate-800'}`}
              >
                {row.value}
              </span>
            </div>
          ))}
        </div>
      );
    };

    const renderTermsBlock = (blockConfig?: QuotationBlockConfig) => {
      const vis = blockConfig?.visibleFields || {};
      const labels = blockConfig?.fieldLabels || {};
      const priceBasis = quotation.price_basis?.trim();
      const paymentTerms = quotation.payment_terms?.trim();
      const validityText =
        quotation.valid_until && quotation.valid_until.trim() !== ''
          ? `Valid until ${formatDate(quotation.valid_until)}`
          : undefined;

      const rawCustomNotes =
        quotation.custom_notes && quotation.custom_notes.trim() !== ''
          ? quotation.custom_notes.trim()
          : quotation.applied_terms && quotation.applied_terms.trim() !== ''
          ? quotation.applied_terms.trim()
          : undefined;

      const customNotes = (() => {
        if (!rawCustomNotes) return undefined;
        const lines = rawCustomNotes.split('\n');
        const filtered = lines.filter((line) => {
          const trimmed = line.trim();
          const lower = trimmed.toLowerCase();
          if (!trimmed) return false;
          if (priceBasis) {
            if (
              lower.startsWith('price basis:') ||
              lower.startsWith('price basis -') ||
              lower.startsWith('price basis')
            )
              return false;
            if (lower === priceBasis.toLowerCase()) return false;
          }
          if (paymentTerms) {
            if (
              lower.startsWith('payment terms:') ||
              lower.startsWith('payment terms -') ||
              lower.startsWith('payment:') ||
              lower.startsWith('payment -')
            )
              return false;
            if (lower === paymentTerms.toLowerCase()) return false;
          }
          if (validityText || quotation.valid_until) {
            if (
              lower.startsWith('validity:') ||
              lower.startsWith('validity -') ||
              lower.startsWith('valid until:') ||
              lower.startsWith('valid until')
            )
              return false;
          }
          return true;
        });
        const cleaned = filtered.join('\n').trim();
        return cleaned.length > 0 ? cleaned : undefined;
      })();

      const builtInRowMap: Record<
        string,
        { key: string; label: string; value: React.ReactNode; isMono?: boolean; isBold?: boolean } | null
      > = {
        price_basis:
          vis.price_basis !== false && priceBasis
            ? {
                key: 'price_basis',
                label: labels.price_basis || 'Price Basis',
                value: (
                  <EditableCanvasText
                    value={priceBasis}
                    fieldKey="price_basis"
                    canEdit={canEditCanvasInline && isTermsBlockSelected}
                    onCommit={onInlineFieldEdit}
                  />
                )
              }
            : null,
        payment_terms:
          vis.payment_terms !== false && paymentTerms
            ? {
                key: 'payment_terms',
                label: labels.payment_terms || 'Payment Terms',
                value: (
                  <EditableCanvasText
                    value={paymentTerms}
                    fieldKey="payment_terms"
                    canEdit={canEditCanvasInline && isTermsBlockSelected}
                    onCommit={onInlineFieldEdit}
                  />
                )
              }
            : null,
        validity:
          vis.validity !== false && validityText
            ? {
                key: 'validity',
                label: labels.validity || 'Validity',
                value: validityText
              }
            : null
      };

      const order = blockConfig?.fieldOrder || ['price_basis', 'payment_terms', 'validity'];
      const orderedRows: Array<{
        key: string;
        label: string;
        value: React.ReactNode;
        isMono?: boolean;
        isBold?: boolean;
      }> = [];
      order.forEach((k) => {
        if (builtInRowMap[k]) orderedRows.push(builtInRowMap[k]!);
      });
      Object.keys(builtInRowMap).forEach((k) => {
        if (!order.includes(k) && builtInRowMap[k]) orderedRows.push(builtInRowMap[k]!);
      });

      (blockConfig?.customRows || []).forEach((cr) => {
        if (cr.enabled !== false && (cr.label || cr.value)) {
          orderedRows.push({
            key: cr.id,
            label: cr.label || 'Term',
            value: cr.value
          });
        }
      });

      const showClauses = vis.clauses !== false && Boolean(customNotes);
      const hasAnyContent = orderedRows.length > 0 || showClauses;

      return (
        <div
          className="terms-card break-inside-avoid page-break-inside-avoid flex-1 flex flex-col justify-between w-full"
          style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
        >
          <div>
            {renderBlockSectionHeader(
              blockConfig,
              'Commercial Terms & Conditions',
              FileCheck
            )}
            {renderStandardizedKeyValueRows(blockConfig, orderedRows)}
            {showClauses && customNotes && (
              <div
                className={`whitespace-pre-line text-slate-600 text-[var(--block-base)] leading-relaxed ${
                  orderedRows.length > 0 ? 'mt-2 pt-2 border-t border-slate-200/60' : 'mt-1.5'
                }`}
              >
                <EditableCanvasText
                  value={customNotes}
                  fieldKey="custom_notes"
                  canEdit={canEditCanvasInline && isTermsBlockSelected}
                  onCommit={onInlineFieldEdit}
                  multiline
                />
              </div>
            )}
            {!hasAnyContent && (
              <p className="text-slate-400 italic text-[calc(var(--block-base)*0.95)] py-1 mt-1">
                No commercial terms specified.
              </p>
            )}
          </div>
        </div>
      );
    };

    const renderTotalsBlock = (blockConfig?: QuotationBlockConfig, isMinimalBlock = false) => {
      const showDividers =
        blockConfig?.showRowDividers !== undefined
          ? blockConfig.showRowDividers
          : !isMinimalBlock;
      const rowBorderClass = showDividers ? 'border-t border-slate-100' : '';
      const labels = blockConfig?.fieldLabels || {};
      const vis = blockConfig?.visibleFields || {};

      return (
        <div
          className="totals-card break-inside-avoid page-break-inside-avoid flex-1 space-y-1.5 w-full flex flex-col justify-between"
          style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
        >
          <div className="space-y-1.5 w-full">
            {blockConfig?.titleOverride && (
              <div>
                {renderBlockSectionHeader(blockConfig, blockConfig.titleOverride, DollarSign)}
              </div>
            )}
            {vis.subtotal !== false && (
              <div className="flex justify-between text-slate-600 py-0.5 text-[var(--block-base)]">
                <span>{labels.subtotal || 'Subtotal'}:</span>
                <span className="font-mono tabular-nums font-semibold text-slate-800">
                  {formatCurrency(quotation.subtotal)}
                </span>
              </div>
            )}

            {vis.freight !== false && Number(quotation.freight_amount) > 0 && (
              <div
                className={`flex justify-between text-slate-600 py-0.5 ${rowBorderClass} text-[var(--block-base)]`}
              >
                <span>{labels.freight || 'Freight / Logistics'}:</span>
                <span className="font-mono tabular-nums font-semibold text-slate-800">
                  {formatCurrency(quotation.freight_amount)}
                </span>
              </div>
            )}

            {/* Custom Financial Rows (e.g. Discount, Handling, Packing) */}
            {(blockConfig?.customRows || []).map((cr) => {
              if (cr.enabled === false || (!cr.label && !cr.value)) return null;
              return (
                <div
                  key={cr.id}
                  className={`flex justify-between text-slate-600 py-0.5 ${rowBorderClass} text-[var(--block-base)]`}
                >
                  <span>{cr.label}:</span>
                  <span className="font-mono tabular-nums font-semibold text-slate-800">
                    {cr.value}
                  </span>
                </div>
              );
            })}

            {/* Tax Mode Display */}
            {vis.tax !== false && quotation.tax_mode === 'tax_calculated' && (
              <div
                className={`flex justify-between text-slate-600 py-0.5 ${rowBorderClass} text-[var(--block-base)]`}
              >
                <span>{labels.tax || `VAT (${quotation.tax_rate_percent || 5}%)`}:</span>
                <span className="font-mono tabular-nums font-semibold text-slate-800">
                  {formatCurrency(quotation.tax_amount)}
                </span>
              </div>
            )}

            {vis.tax !== false && quotation.tax_mode === 'taxes_extra' && (
              <div
                className={`py-0.5 ${rowBorderClass} text-slate-600 space-y-0.5 text-[var(--block-base)]`}
              >
                <div className="flex justify-between">
                  <span>{labels.tax || `VAT (${quotation.tax_rate_percent || 5}%)`}:</span>
                  <span className="font-mono tabular-nums font-semibold text-slate-800">
                    {formatCurrency(quotation.tax_amount)}
                  </span>
                </div>
                <p className="text-[calc(var(--block-base)*0.85)] text-amber-700 not-italic">
                  * Taxes EXTRA to client account as applicable
                </p>
              </div>
            )}

            {vis.tax !== false && quotation.tax_mode === 'tax_exempt' && (
              <div
                className={`flex justify-between text-slate-600 py-0.5 ${rowBorderClass} items-center text-[var(--block-base)]`}
              >
                <span>Tax Status:</span>
                <span className="px-1.5 py-0.5 text-[calc(var(--block-base)*0.85)] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 rounded">
                  Tax Exempt (0%)
                </span>
              </div>
            )}

            {/* Grand Total */}
            <div
              className="flex justify-between items-center pt-2 mt-1 border-t-2 font-extrabold"
              style={{ borderColor: themePalette.primaryHex }}
            >
              <span className="text-slate-900 uppercase tracking-tight text-[calc(var(--block-base)*1.15)]">
                {labels.grand_total || 'Grand Total'}:
              </span>
              <span
                className="font-mono tabular-nums font-bold text-[calc(var(--block-base)*1.35)]"
                style={{ color: themePalette.textAccent }}
              >
                {formatCurrency(quotation.grand_total)}
              </span>
            </div>
          </div>

          {/* Amount in Words */}
          {showAmountInWords !== false && (quotation.grand_total ?? 0) > 0 && (
            <div
              className={`text-[calc(var(--block-base)*0.95)] font-medium text-slate-700 not-italic ${rowBorderClass} pt-1.5 mt-1.5 break-words`}
            >
              <span className="font-semibold text-slate-800 not-italic">
                Amount in Words ({currency || 'AED'}):{' '}
              </span>
              <span className="not-italic">{amountToWords(quotation.grand_total, currency)}</span>
            </div>
          )}
        </div>
      );
    };

    const renderRemittanceBlock = (blockConfig?: QuotationBlockConfig) => {
      const vis = blockConfig?.visibleFields || {};
      const labels = blockConfig?.fieldLabels || {};

      const bankRowsMap: Record<
        string,
        { key: string; label: string; value: React.ReactNode; isMono?: boolean; isBold?: boolean } | null
      > = resolvedBank
        ? {
            bankName:
              vis.bankName !== false && resolvedBank.bankName
                ? {
                    key: 'bankName',
                    label: labels.bankName || 'Bank',
                    value: resolvedBank.bankName,
                    isBold: true
                  }
                : null,
            beneficiaryName:
              vis.beneficiaryName !== false && resolvedBank.beneficiaryName
                ? {
                    key: 'beneficiaryName',
                    label: labels.beneficiaryName || 'Beneficiary',
                    value: resolvedBank.beneficiaryName
                  }
                : null,
            accountNumber:
              vis.accountNumber !== false && resolvedBank.accountNumber
                ? {
                    key: 'accountNumber',
                    label: labels.accountNumber || 'Account No',
                    value: resolvedBank.accountNumber,
                    isMono: true
                  }
                : null,
            iban:
              vis.iban !== false && resolvedBank.iban
                ? {
                    key: 'iban',
                    label: labels.iban || 'IBAN',
                    value: resolvedBank.iban,
                    isMono: true,
                    isBold: true
                  }
                : null,
            swiftCode:
              vis.swiftCode !== false && resolvedBank.swiftCode
                ? {
                    key: 'swiftCode',
                    label: labels.swiftCode || 'SWIFT / BIC',
                    value: resolvedBank.swiftCode,
                    isMono: true
                  }
                : null,
            branchName:
              vis.branchName !== false && resolvedBank.branchName
                ? {
                    key: 'branchName',
                    label: labels.branchName || 'Branch',
                    value: resolvedBank.branchName
                  }
                : null,
            currency:
              vis.currency === true && resolvedBank.currency
                ? {
                    key: 'currency',
                    label: labels.currency || 'Currency',
                    value: resolvedBank.currency,
                    isMono: true
                  }
                : null
          }
        : {};

      const defaultOrder = [
        'bankName',
        'beneficiaryName',
        'accountNumber',
        'iban',
        'swiftCode',
        'branchName',
        'currency'
      ];
      const order = blockConfig?.fieldOrder || defaultOrder;
      const orderedBankRows: Array<{
        key: string;
        label: string;
        value: React.ReactNode;
        isMono?: boolean;
        isBold?: boolean;
      }> = [];
      order.forEach((k) => {
        if (bankRowsMap[k]) orderedBankRows.push(bankRowsMap[k]!);
      });
      defaultOrder.forEach((k) => {
        if (!order.includes(k) && bankRowsMap[k]) orderedBankRows.push(bankRowsMap[k]!);
      });

      (blockConfig?.customRows || []).forEach((cr) => {
        if (cr.enabled !== false && (cr.label || cr.value)) {
          orderedBankRows.push({
            key: cr.id,
            label: cr.label || 'Detail',
            value: cr.value
          });
        }
      });

      return (
        <div
          className="remittance-card break-inside-avoid page-break-inside-avoid flex-1 flex flex-col justify-between w-full"
          style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
        >
          <div>
            {renderBlockSectionHeader(
              blockConfig,
              'Bank Remittance Details',
              Landmark,
              blockConfig?.subtitleOverride
            )}
            {orderedBankRows.length > 0 ? (
              renderStandardizedKeyValueRows(blockConfig, orderedBankRows)
            ) : (
              <div className="text-[var(--block-base)] text-slate-500 italic p-2 mt-1">
                Thank you for your business. Please contact us for electronic wire instructions.
              </div>
            )}
            {blockConfig?.customNote && blockConfig.customNote.trim() !== '' && (
              <p className="text-[calc(var(--block-base)*0.9)] text-slate-600 mt-2 pt-1.5 border-t border-slate-200/60 whitespace-pre-line">
                {blockConfig.customNote}
              </p>
            )}
          </div>
        </div>
      );
    };

    const stampSigOverlay = resolveStampSignatureOverlayConfig(
      resolvedFooterConfig,
      quotation,
      profile
    );
    const resolvedCompanySealUrl = stampSigOverlay.activeSealUrl;

    const isSignatoryBlockSelected =
      activeSelectedSection === 'signatory' || activeSelectedSection === 'signatories';

    const renderSignatoryBlock = (blockConfig?: QuotationBlockConfig) => {
      const blockAlign: QuotationSignatoryBlockAlign =
        resolvedFooterConfig.signatoryBlockAlign ||
        (footerLayoutMode === 'seller_only' ? 'space_between' : 'right');

      const textAlign: QuotationSignatoryTextAlign =
        resolvedFooterConfig.signatoryTextAlign || 'center';

      const stampPlacement: QuotationStampPlacement =
        resolvedFooterConfig.stampPlacement || 'left';

      const verticalSpacing: QuotationSignatureVerticalSpacing =
        resolvedFooterConfig.signatureVerticalSpacing || 'standard';

      const lineWidth: QuotationSignatureLineWidth =
        resolvedFooterConfig.signatureLineWidth || 'standard';

      const showForAndOnBehalf =
        resolvedFooterConfig.showForAndOnBehalf !== undefined
          ? resolvedFooterConfig.showForAndOnBehalf
          : footerLayoutMode === 'seller_only';

      const forAndOnBehalfText =
        (resolvedFooterConfig.forAndOnBehalfText && resolvedFooterConfig.forAndOnBehalfText.trim()) ||
        `For and on behalf of ${senderEntityName || 'Company'}`;

      const showDateSignedLine = Boolean(resolvedFooterConfig.showDateSignedLine);
      const showSignatoryPhone = Boolean(resolvedFooterConfig.showSignatoryPhone);
      const showSignatoryEmail = Boolean(resolvedFooterConfig.showSignatoryEmail);
      const contactFormat = resolvedFooterConfig.signatoryContactFormat || 'icon';
      const visibleSigLines = resolvedFooterConfig.visibleSignatoryLines || {};
      const lineStyles = resolvedFooterConfig.signatoryLineStyles || {};
      const lineOrder: Array<'name' | 'title' | 'phone' | 'email' | 'custom' | 'date'> =
        resolvedFooterConfig.signatoryLineOrder && resolvedFooterConfig.signatoryLineOrder.length > 0
          ? resolvedFooterConfig.signatoryLineOrder
          : ['name', 'title', 'phone', 'email', 'custom', 'date'];

      const customLines: QuotationSignatoryCustomLine[] = Array.isArray(
        resolvedFooterConfig.signatoryCustomLines
      )
        ? resolvedFooterConfig.signatoryCustomLines
        : [];

      const getLineStyleInfo = (
        lineKey: string,
        defaultWeight: 'normal' | 'medium' | 'bold',
        defaultColor: 'default' | 'muted' | 'accent'
      ) => {
        const cfg = lineStyles[lineKey] || {};
        const w = cfg.weight || defaultWeight;
        const c = cfg.color || defaultColor;
        const weightClass =
          w === 'bold' ? 'font-bold' : w === 'medium' ? 'font-medium' : 'font-normal';
        const colorClass =
          c === 'muted'
            ? 'text-slate-500'
            : c === 'default'
            ? 'text-slate-800'
            : '';
        const colorStyle: React.CSSProperties =
          c === 'accent' ? { color: themePalette.textAccent } : {};
        return { weightClass, colorClass, colorStyle };
      };

      const containerJustifyClass =
        blockAlign === 'left'
          ? 'justify-start'
          : blockAlign === 'center'
          ? 'justify-center'
          : blockAlign === 'space_between'
          ? 'justify-between'
          : 'justify-end';

      const textAlignmentClass =
        textAlign === 'left'
          ? 'text-left items-start'
          : textAlign === 'right'
          ? 'text-right items-end'
          : 'text-center items-center';

      const sigAnchorHeightClass =
        verticalSpacing === 'compact'
          ? 'h-10'
          : verticalSpacing === 'spacious'
          ? 'h-20'
          : 'h-14';

      const sigLineClass =
        lineWidth === 'none'
          ? 'hidden'
          : lineWidth === 'narrow'
          ? 'w-20 border-b border-slate-300 mb-1'
          : lineWidth === 'wide'
          ? 'w-36 border-b border-slate-300 mb-1'
          : 'w-28 border-b border-slate-300 mb-1';

      const renderSealBox = (extraPositionClass = '') => {
        if (!resolvedShowCompanySeal) return null;
        return (
          <div
            onClick={
              isInteractive
                ? (e) => {
                    e.stopPropagation();
                    if (onSelectSection) {
                      onSelectSection('signatory', 'stamp');
                    } else if (onSelectBlock) {
                      onSelectBlock('signatory');
                    }
                  }
                : undefined
            }
            title={isInteractive ? 'Click to inspect & adjust Company Stamp / Seal' : undefined}
            className={`company-seal-box w-16 ${sigAnchorHeightClass} shrink-0 flex flex-col items-center justify-center overflow-visible relative z-20 ${
              isInteractive ? 'cursor-pointer' : ''
            } ${extraPositionClass}`}
          >
            {resolvedCompanySealUrl ? (
              <img
                src={resolvedCompanySealUrl}
                alt="Company Seal"
                style={{
                  position: 'absolute',
                  height: `${stampSigOverlay.sealSizePx}px`,
                  width: 'auto',
                  maxWidth: 'none',
                  transform: stampSigOverlay.sealTransformStyle,
                  mixBlendMode: stampSigOverlay.inkMultiplyBlend ? 'multiply' : 'normal'
                }}
                className={`object-contain mx-auto opacity-95 select-none z-20 ${
                  isInteractive ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none'
                }`}
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            ) : (
              <>
                <div className="company-seal-placeholder h-12 w-12 rounded-full border border-dashed border-slate-300 flex items-center justify-center text-center p-1">
                  <span className={`${typoScale.micro} font-mono uppercase tracking-wider text-slate-400 leading-tight`}>
                    Official Seal
                  </span>
                </div>
                {stampSigOverlay.showCompanySealLabel && (
                  <span className="text-[calc(var(--block-base)*0.85)] text-slate-400 mt-0.5 uppercase tracking-wider">
                    Company Seal
                  </span>
                )}
              </>
            )}
          </div>
        );
      };

      const renderSingleSignatoryColumn = (
        sig: { name: string; title: string; signature_url?: string },
        sIdx: number
      ) => {
        const resolvedSignatureImgUrl =
          (sIdx === 0 ? stampSigOverlay.activeSignatureUrl : undefined) ||
          sig.signature_url ||
          '';
        const useUploadedSignatureImage =
          Boolean(resolvedSignatureImgUrl) &&
          (signatureStyle === 'image' ||
            Boolean(quotation.signature_image_url) ||
            Boolean(stampSigOverlay.activeSignatureUrl));
        const nameFieldKey = sIdx === 0 ? 'primary_signatory_name' : 'secondary_signatory_name';
        const titleFieldKey = sIdx === 0 ? 'primary_signatory_title' : 'secondary_signatory_title';

        const sigPhone =
          sIdx === 0
            ? resolvedFooterConfig.signatoryPhone || senderPhone || ''
            : resolvedFooterConfig.secondarySignatoryPhone || '';
        const sigEmail =
          sIdx === 0
            ? resolvedFooterConfig.signatoryEmail || senderEmail || user?.email || ''
            : resolvedFooterConfig.secondarySignatoryEmail || '';

        const applicableCustomLines = customLines.filter((line) => {
          if (!line.value && !line.label) return false;
          const target = line.target || 'primary';
          if (target === 'both') return true;
          return sIdx === 0 ? target === 'primary' : target === 'secondary';
        });

        const nameStyle = getLineStyleInfo('name', 'bold', 'default');
        const titleStyle = getLineStyleInfo('title', 'normal', 'muted');
        const phoneStyle = getLineStyleInfo('phone', 'normal', 'muted');
        const emailStyle = getLineStyleInfo('email', 'normal', 'muted');
        const customStyle = getLineStyleInfo('custom', 'medium', 'default');

        const renderDetailLine = (lineType: 'name' | 'title' | 'phone' | 'email' | 'custom' | 'date') => {
          if (visibleSigLines[lineType] === false) return null;

          if (lineType === 'name') {
            return (
              <p
                key="sig-name"
                className={`${nameStyle.weightClass} ${nameStyle.colorClass} text-[calc(var(--block-base)*1.08)] leading-tight`}
                style={nameStyle.colorStyle}
              >
                <EditableCanvasText
                  value={sig.name}
                  fieldKey={nameFieldKey}
                  canEdit={canEditCanvasInline && isSignatoryBlockSelected}
                  onCommit={onInlineFieldEdit}
                />
              </p>
            );
          }

          if (lineType === 'title') {
            return (
              <p
                key="sig-title"
                className={`${titleStyle.weightClass} ${titleStyle.colorClass} text-[calc(var(--block-base)*0.95)] leading-tight mt-0.5`}
                style={titleStyle.colorStyle}
              >
                <EditableCanvasText
                  value={sig.title}
                  fieldKey={titleFieldKey}
                  canEdit={canEditCanvasInline && isSignatoryBlockSelected}
                  onCommit={onInlineFieldEdit}
                />
              </p>
            );
          }

          if (lineType === 'phone' && showSignatoryPhone && sigPhone) {
            return (
              <p
                key="sig-phone"
                className={`${phoneStyle.weightClass} ${phoneStyle.colorClass} text-[calc(var(--block-base)*0.88)] leading-tight mt-0.5 flex items-center gap-1`}
                style={phoneStyle.colorStyle}
              >
                {contactFormat === 'icon' && <Phone className="w-2.5 h-2.5 text-slate-400 shrink-0" />}
                {contactFormat === 'label' && <span className="text-slate-400 font-medium">Tel:</span>}
                <span>{sigPhone}</span>
              </p>
            );
          }

          if (lineType === 'email' && showSignatoryEmail && sigEmail) {
            return (
              <p
                key="sig-email"
                className={`${emailStyle.weightClass} ${emailStyle.colorClass} text-[calc(var(--block-base)*0.88)] leading-tight mt-0.5 flex items-center gap-1`}
                style={emailStyle.colorStyle}
              >
                {contactFormat === 'icon' && <Mail className="w-2.5 h-2.5 text-slate-400 shrink-0" />}
                {contactFormat === 'label' && <span className="text-slate-400 font-medium">Email:</span>}
                <span>{sigEmail}</span>
              </p>
            );
          }

          if (lineType === 'custom' && applicableCustomLines.length > 0) {
            return (
              <React.Fragment key="sig-custom">
                {applicableCustomLines.map((line) => (
                  <p
                    key={line.id}
                    className={`${customStyle.weightClass} ${customStyle.colorClass} text-[calc(var(--block-base)*0.88)] leading-tight mt-0.5`}
                    style={customStyle.colorStyle}
                  >
                    {line.label && contactFormat !== 'plain' ? (
                      <>
                        <span className="text-slate-400 font-medium">{line.label}: </span>
                        <span>{line.value}</span>
                      </>
                    ) : (
                      <span>{line.value}</span>
                    )}
                  </p>
                ))}
              </React.Fragment>
            );
          }

          if (lineType === 'date' && showDateSignedLine) {
            return (
              <p key="sig-date" className="text-[calc(var(--block-base)*0.85)] text-slate-500 mt-1.5 pt-0.5">
                Date: <span className="inline-block w-20 border-b border-slate-300 ml-1" />
              </p>
            );
          }

          return null;
        };

        return (
          <div
            key={sIdx}
            className={`flex flex-col ${textAlignmentClass} min-w-[130px] overflow-visible relative`}
          >
            {/* Fixed-height signature anchor box: resizing image never stretches block height */}
            <div
              onClick={
                isInteractive
                  ? (e) => {
                      e.stopPropagation();
                      if (onSelectSection) {
                        onSelectSection('signatory', 'signature');
                      } else if (onSelectBlock) {
                        onSelectBlock('signatory');
                      }
                    }
                  : undefined
              }
              title={isInteractive ? 'Click to inspect & adjust Authorized Signature' : undefined}
              className={`${sigAnchorHeightClass} w-28 flex items-end justify-center mb-1 overflow-visible relative ${
                isInteractive ? 'cursor-pointer' : ''
              }`}
            >
              {stampPlacement === 'overlay' && sIdx === 0 && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 overflow-visible">
                  {renderSealBox('pointer-events-auto')}
                </div>
              )}
              {useUploadedSignatureImage ? (
                <img
                  src={resolvedSignatureImgUrl}
                  alt="Authorized Signature"
                  style={{
                    position: 'absolute',
                    bottom: '2px',
                    height: `${stampSigOverlay.signatureSizePx}px`,
                    width: 'auto',
                    maxWidth: 'none',
                    transform: stampSigOverlay.signatureTransformStyle,
                    mixBlendMode: stampSigOverlay.inkMultiplyBlend ? 'multiply' : 'normal'
                  }}
                  className={`object-contain mx-auto select-none z-20 ${
                    isInteractive ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none'
                  }`}
                />
              ) : signatureStyle === 'script' ? (
                <span className="font-serif italic text-base text-slate-800 tracking-wide font-medium select-none transform -rotate-1 pb-1 z-20">
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

            <div className={sigLineClass} />

            {lineOrder.map((lineType) => renderDetailLine(lineType))}
          </div>
        );
      };

      return (
        <div
          className="signatory-card overflow-visible relative break-inside-avoid page-break-inside-avoid flex-1 flex flex-col justify-end w-full"
          style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
        >
          {blockConfig?.titleOverride && (
            <div className="mb-1.5">
              {renderBlockSectionHeader(
                blockConfig,
                blockConfig.titleOverride,
                ShieldCheck,
                blockConfig.subtitleOverride
              )}
            </div>
          )}

          {/* When "For and on behalf of" is shown above a non-space_between layout */}
          {showForAndOnBehalf && blockAlign !== 'space_between' && (
            <div
              className={`mb-1.5 ${
                blockAlign === 'left'
                  ? 'text-left'
                  : blockAlign === 'center'
                  ? 'text-center'
                  : 'text-right'
              }`}
            >
              <p
                className="font-bold text-[calc(var(--block-base)*1.02)] uppercase tracking-wider"
                style={{ color: themePalette.textAccent }}
              >
                {forAndOnBehalfText}
              </p>
            </div>
          )}

          <div
            className={`flex items-center ${containerJustifyClass} gap-5 w-full overflow-visible relative`}
          >
            {blockAlign === 'space_between' && (
              <div className="text-left text-slate-600 pr-4">
                {showForAndOnBehalf ? (
                  <>
                    <p
                      className="font-bold text-[calc(var(--block-base)*1.05)] uppercase tracking-wider"
                      style={{ color: themePalette.textAccent }}
                    >
                      {forAndOnBehalfText}
                    </p>
                    <p className="text-slate-400 text-[calc(var(--block-base)*0.85)] mt-0.5">
                      {blockConfig?.subtitleOverride || 'Authorized Signatures & Official Seal'}
                    </p>
                  </>
                ) : (
                  <p className="text-slate-400 text-[calc(var(--block-base)*0.85)] uppercase tracking-wider font-semibold">
                    {blockConfig?.subtitleOverride || 'Authorized Signatures'}
                  </p>
                )}
              </div>
            )}

            <div className="flex items-center gap-5 shrink-0 overflow-visible relative">
              {stampPlacement === 'left' && renderSealBox()}

              {/* Signatories Rendering */}
              <div className="flex items-end gap-5 overflow-visible relative">
                {resolvedSignatories.length === 2 && stampPlacement === 'center' ? (
                  <>
                    {renderSingleSignatoryColumn(resolvedSignatories[0], 0)}
                    {renderSealBox()}
                    {renderSingleSignatoryColumn(resolvedSignatories[1], 1)}
                  </>
                ) : (
                  <>
                    {stampPlacement === 'center' && resolvedSignatories.length === 1 && renderSealBox()}
                    {resolvedSignatories.map((sig, sIdx) => renderSingleSignatoryColumn(sig, sIdx))}
                  </>
                )}
              </div>

              {stampPlacement === 'right' && renderSealBox()}
            </div>
          </div>
        </div>
      );
    };

    const renderAcceptanceBlock = (
      blockConfig?: QuotationBlockConfig,
      placement: 'left' | 'right' | 'full' = 'full'
    ) => {
      const vis = blockConfig?.visibleFields || {};
      const labels = blockConfig?.fieldLabels || {};
      const defaultSlots = [
        { key: 'signature', label: labels.signature || 'Authorized Signature', dotted: false, defaultOn: true },
        { key: 'name', label: labels.name || 'Signatory Name', dotted: false, defaultOn: true },
        { key: 'title', label: labels.title || 'Title / Designation', dotted: false, defaultOn: false },
        { key: 'po_number', label: labels.po_number || 'PO Number', dotted: false, defaultOn: false },
        { key: 'date', label: labels.date || 'Date', dotted: false, defaultOn: true },
        { key: 'stamp', label: labels.stamp || 'Company Stamp', dotted: true, defaultOn: true }
      ];

      const activeSlots = defaultSlots.filter((slot) =>
        vis[slot.key] !== undefined ? vis[slot.key] : slot.defaultOn
      );

      (blockConfig?.customRows || []).forEach((cr) => {
        if (cr.enabled !== false && (cr.label || cr.value)) {
          activeSlots.push({
            key: cr.id,
            label: cr.label || cr.value || 'Field',
            dotted: false,
            defaultOn: true
          });
        }
      });

      const effectiveLayout =
        blockConfig?.acceptanceLayout ||
        (placement === 'full' ? 'row_4col' : 'grid_2x2');

      const gridClass =
        effectiveLayout === 'compact'
          ? 'grid grid-cols-2 sm:grid-cols-3 gap-2 text-left pt-1.5'
          : effectiveLayout === 'grid_2x2' || placement !== 'full'
          ? 'grid grid-cols-2 gap-2.5 text-center pt-2'
          : activeSlots.length <= 3
          ? 'grid grid-cols-3 gap-3 text-center pt-2'
          : 'grid grid-cols-4 gap-3 text-center pt-2';

      return (
        <div
          className="acceptance-card break-inside-avoid page-break-inside-avoid w-full flex-1 flex flex-col justify-between"
          style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
        >
          <div>
            {renderBlockSectionHeader(
              blockConfig,
              'Customer Acceptance & Confirmation',
              FileCheck,
              'Sign & Return Copy with Purchase Order'
            )}
            {vis.statement !== false && (
              <p className="text-[var(--block-base)] text-slate-600 my-1 leading-snug">
                {blockConfig?.acceptanceStatementOverride &&
                blockConfig.acceptanceStatementOverride.trim() !== '' ? (
                  blockConfig.acceptanceStatementOverride
                ) : (
                  <>
                    We hereby accept and approve this commercial offer{' '}
                    <span className="font-semibold text-slate-800">
                      #{quotation.formatted_quote_ref || quotation.quote_number}
                    </span>{' '}
                    in accordance with the specified quantities, prices, and terms.
                  </>
                )}
              </p>
            )}
          </div>

          {activeSlots.length > 0 && (
            <div className={`${gridClass} text-[var(--block-base)]`}>
              {activeSlots.map((slot) => (
                <div key={slot.key}>
                  <span className="text-slate-400 text-[calc(var(--block-base)*0.85)] uppercase tracking-wider block">
                    {slot.label}
                  </span>
                  <div
                    className={`${
                      effectiveLayout === 'compact' ? 'h-3.5' : 'h-5'
                    } border-b border-slate-300 ${slot.dotted ? 'border-dotted' : ''} mt-1`}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      );
    };

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
            <section key={`grid_seg_${segIdx}`} className="mb-3 w-full print:mb-2 overflow-visible" style={{ width: '100%', maxWidth: '100%' }}>
              <div
                className="quotation-blocks-grid grid grid-cols-2 gap-3 items-stretch w-full overflow-visible"
                style={{ width: '100%', maxWidth: '100%' }}
              >
                {positionedBlocks.map(({ b, gridRowStart, gridColumnStart, gridColumnEnd, placementClass }) => {
                  const baseFontSize = b.fontScale === 'compact' ? '8.5px' : b.fontScale === 'prominent' ? '11.5px' : typoScale.rawBase;
                  const isMinimalBlock = b.style === 'minimal';
                  const padClass = isMinimalBlock
                    ? 'pt-1 pb-1 px-0.5'
                    : b.padding === 'compact'
                    ? 'p-2'
                    : 'p-3';
                  const isSelected = activeSelectedSection === b.id;
                  const isInteractive = Boolean(onSelectSection || onSelectBlock);
                  const bType = b.type || b.id;
                  const isSignatorySlot =
                    bType === 'signatory' ||
                    bType === 'signatories' ||
                    b.id === 'signatory' ||
                    b.id === 'signatories';

                  const cardStyleClass = [
                    padClass,
                    isMinimalBlock
                      ? 'rounded-none border-0 bg-transparent print:bg-transparent shadow-none'
                      : `${(propGlobalCardRadius || quotation.globalCardRadius || profile?.globalCardRadius || resolvedRecipientConfig.globalCardRadius) === 'sharp' ? 'rounded-none' : 'rounded-lg'} border border-slate-200 bg-slate-50/50`,
                    'h-full flex flex-col justify-between transition-all duration-150',
                    isSignatorySlot ? 'overflow-visible relative' : '',
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
                      className={`${placementClass} break-inside-avoid page-break-inside-avoid quotation-block-slot ${b.id}-card ${
                        isSignatorySlot ? 'overflow-visible relative' : ''
                      }`}
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
                        {(bType === 'terms' || b.id === 'terms') && renderTermsBlock(b)}
                        {(bType === 'totals' || b.id === 'totals') && renderTotalsBlock(b, isMinimalBlock)}
                        {(bType === 'remittance' || b.id === 'remittance') && renderRemittanceBlock(b)}
                        {isSignatorySlot && renderSignatoryBlock(b)}
                        {(bType === 'acceptance' || b.id === 'acceptance') && renderAcceptanceBlock(b, b.placement)}
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

  const renderHeaderBrandingElement = (isContinuationRepeat = false) => {
    const {
      activeLogoUrl,
      logoDisplayMode,
      headerLayoutMode,
      showLogo,
      showCompanyName,
      logoHeightPx: logoHeight,
      logoMaxWidthPx,
      bannerMaxHeightPx,
      logoSpacing,
      brandHorizontalAlign,
      brandVerticalAlign,
      contactHorizontalAlign,
      contactVerticalAlign,
      showHeaderIcons
    } = headerBranding;
    const isBannerHeader =
      headerLayoutMode === 'banner' || logoDisplayMode === 'full_banner';
    const isCenteredHeader = headerLayoutMode === 'centered';
    const isSplitRight = headerLayoutMode === 'split_right';

    const resolvedHeaderFieldsMap = resolveHeaderFields(
      resolvedHeaderConfig,
      {
        address_line_1: profile?.address_line_1,
        address_line_2: profile?.address_line_2,
        city: profile?.city,
        country: profile?.country,
        address: senderAddress,
        phone: senderPhone,
        email: senderEmail,
        website: senderWebsite,
        trn: senderTrn
      },
      undefined,
      fontSizeScale
    );

    // Logo Padding applied directly to the Logo wrapper container, keeping <header> bottom rhythm constant
    const logoWrapperPaddingClass =
      logoSpacing === 'none'
        ? 'p-0'
        : logoSpacing === 'tight'
        ? 'p-1'
        : logoSpacing === 'spacious'
        ? 'p-3.5'
        : 'p-2';
    const logoGapClass =
      logoSpacing === 'none'
        ? 'gap-1.5'
        : logoSpacing === 'tight'
        ? 'gap-2.5'
        : logoSpacing === 'spacious'
        ? 'gap-5'
        : 'gap-3.5';

    const brandVAlignClass =
      brandVerticalAlign === 'middle'
        ? 'items-center'
        : brandVerticalAlign === 'bottom'
        ? 'items-end'
        : 'items-start';
    const brandColumnVJustifyClass =
      brandVerticalAlign === 'middle'
        ? 'justify-center'
        : brandVerticalAlign === 'bottom'
        ? 'justify-end'
        : 'justify-start';
    const brandHAlignClass =
      brandHorizontalAlign === 'center'
        ? 'text-center items-center'
        : brandHorizontalAlign === 'right'
        ? 'text-right items-end'
        : 'text-left items-start';
    const brandRowJustifyClass =
      brandHorizontalAlign === 'center'
        ? 'justify-center'
        : brandHorizontalAlign === 'right'
        ? isSplitRight
          ? 'justify-start'
          : 'justify-end'
        : isSplitRight
        ? 'justify-end'
        : 'justify-start';

    const contactVAlignClass =
      contactVerticalAlign === 'middle'
        ? 'justify-center'
        : contactVerticalAlign === 'bottom'
        ? 'justify-end'
        : 'justify-start';
    const contactHAlignClass =
      contactHorizontalAlign === 'center'
        ? 'text-center items-center'
        : contactHorizontalAlign === 'left'
        ? 'text-left items-start'
        : 'text-right items-end';

    const renderFieldIcon = (iconName?: string) => {
      if (!showHeaderIcons || !iconName || iconName === 'none') return null;
      const cls = 'w-3 h-3 text-slate-400 shrink-0';
      switch (iconName) {
        case 'map-pin':
          return <MapPin className={cls} />;
        case 'phone':
          return <Phone className={cls} />;
        case 'smartphone':
          return <Smartphone className={cls} />;
        case 'mail':
          return <Mail className={cls} />;
        case 'globe':
          return <Globe className={cls} />;
        case 'building':
          return <Building2 className={cls} />;
        case 'hash':
          return <Hash className={cls} />;
        case 'user':
          return <User className={cls} />;
        case 'shield':
          return <ShieldCheck className={cls} />;
        default:
          return null;
      }
    };

    const renderFieldItemNode = (field: ResolvedHeaderFieldRenderItem, inlineMode = false) => {
      const iconNode = field.showIcon ? renderFieldIcon(field.icon) : null;

      return (
        <span
          key={field.id}
          onClick={
            isInteractive && !isContinuationRepeat
              ? (e) => {
                  e.stopPropagation();
                  if (onSelectSection) {
                    onSelectSection('header', `field:${field.id}`);
                  } else if (onSelectBlock) {
                    onSelectBlock('header' as any);
                  }
                }
              : undefined
          }
          title={isInteractive && !isContinuationRepeat ? `Click to configure ${field.label || field.id} in Header Inspector` : undefined}
          className={`${inlineMode ? 'inline-flex items-center' : 'block'} ${field.fontSizeClass} ${field.fontWeightClass} text-slate-600 print:text-black leading-snug break-words whitespace-normal max-w-full ${
            isInteractive && !isContinuationRepeat ? 'cursor-pointer hover:text-slate-900 rounded-xs transition-colors' : ''
          }`}
        >
          {iconNode && (
            <span className="inline-flex items-center align-[-2px] mr-1.5 shrink-0">
              {iconNode}
            </span>
          )}
          {field.label ? (
            <span className="text-slate-500 font-medium mr-1">{field.label}</span>
          ) : null}
          <span className={field.id === 'trn' ? 'font-mono text-slate-800' : 'text-slate-700'}>
            <EditableCanvasText
              value={field.resolvedValue}
              fieldKey={`header_field:${field.id}`}
              canEdit={canEditCanvasInline && isHeaderSelected && !isContinuationRepeat}
              onCommit={onInlineFieldEdit}
            />
          </span>
        </span>
      );
    };

    const allStackedHeaderFields = [
      ...resolvedHeaderFieldsMap.underLogo,
      ...resolvedHeaderFieldsMap.underName,
      ...resolvedHeaderFieldsMap.contactBlock,
      ...resolvedHeaderFieldsMap.bottomBar
    ];

    const stackedBrandFieldsWhenLogoOnly = [
      ...resolvedHeaderFieldsMap.underLogo,
      ...resolvedHeaderFieldsMap.underName
    ];

    return (
      <header
        className={`quotation-header-branding border-b border-slate-200 pb-3 mb-3 w-full header-flex-container relative group transition-all duration-150 rounded-lg quotation-structural-section px-1 box-border ${
          isInteractive && !isContinuationRepeat ? 'cursor-pointer' : ''
        } ${
          isHeaderSelected && !isContinuationRepeat
            ? 'ring-2 ring-inset ring-blue-500 shadow-sm print:ring-0 !print:ring-0 print:outline-none !print:outline-none print:shadow-none !print:shadow-none'
            : isInteractive && !isContinuationRepeat
            ? 'hover:ring-1 hover:ring-inset hover:ring-blue-300 print:ring-0 !print:ring-0 print:outline-none !print:outline-none'
            : ''
        }`}
        onClick={
          isInteractive && !isContinuationRepeat
            ? (e) => {
                e.stopPropagation();
                if (onSelectSection) {
                  onSelectSection('header');
                } else if (onSelectBlock) {
                  onSelectBlock('header' as any);
                }
              }
            : undefined
        }
        style={{ width: '100%', maxWidth: '100%' }}
      >
        {isInteractive && !isContinuationRepeat && (
          <div
            className={`quotation-canvas-guide absolute -top-2.5 right-3 px-2 py-0.5 rounded text-[9px] font-semibold tracking-wide uppercase shadow-xs transition-opacity print:hidden z-10 ${
              isHeaderSelected ? 'bg-blue-600 text-white opacity-100' : 'bg-slate-200 text-slate-700 opacity-0 group-hover:opacity-100'
            }`}
          >
            Header &amp; Branding
          </div>
        )}

        {isBannerHeader || isCenteredHeader ? (
          /* Full Letterhead Banner Mode OR Centered Executive Stack */
          <div
            className="flex flex-col items-center text-center space-y-1.5 w-full"
            style={{ width: '100%', maxWidth: '100%' }}
          >
            {showLogo && (
              <div
                onClick={
                  isInteractive && !isContinuationRepeat
                    ? (e) => {
                        e.stopPropagation();
                        onSelectSection?.('header', 'logo');
                      }
                    : undefined
                }
                title={isInteractive && !isContinuationRepeat ? 'Click to adjust Corporate Logo in Header Inspector' : undefined}
                className={`w-full flex flex-col items-center justify-center ${logoWrapperPaddingClass}`}
              >
                {activeLogoUrl && !logoLoadFailed ? (
                  <img
                    src={activeLogoUrl}
                    alt={senderEntityName}
                    style={
                      isBannerHeader
                        ? {
                            maxHeight: `${bannerMaxHeightPx}px`,
                            maxWidth: `${logoMaxWidthPx || 700}px`
                          }
                        : {
                            height: `${logoHeight}px`,
                            maxWidth: `${logoMaxWidthPx || 260}px`
                          }
                    }
                    className={
                      isBannerHeader
                        ? 'w-full h-auto object-contain mx-auto'
                        : 'w-auto object-contain shrink-0 mx-auto'
                    }
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
                {resolvedHeaderFieldsMap.underLogo.length > 0 && (
                  <div className="flex flex-col items-center gap-0.5 mt-1">
                    {resolvedHeaderFieldsMap.underLogo.map((f) => renderFieldItemNode(f, true))}
                  </div>
                )}
              </div>
            )}
            {showCompanyName && (
              <h1 className={`${typoScale.h1} font-bold tracking-tight text-slate-900 leading-tight`}>
                {senderEntityName}
              </h1>
            )}
            {allStackedHeaderFields.filter((f) => f.zone !== 'under_logo').length > 0 && (
              <div className={`flex flex-wrap justify-center items-center gap-x-2.5 gap-y-1 ${typoScale.body} text-slate-500 pt-0.5 leading-relaxed`}>
                {allStackedHeaderFields
                  .filter((f) => f.zone !== 'under_logo')
                  .map((f, idx, arr) => (
                    <span key={f.id} className="inline-flex items-center gap-2">
                      {renderFieldItemNode(f, true)}
                      {idx < arr.length - 1 && (
                        <span className="text-slate-300 font-bold select-none shrink-0" aria-hidden="true">
                          •
                        </span>
                      )}
                    </span>
                  ))}
              </div>
            )}
          </div>
        ) : (
          /* Split Classic (Logo Left / Contacts Right) or Split Reversed (Contacts Left / Logo Right) via 12-Col Grid */
          <>
            <div
              className="grid grid-cols-12 gap-4 w-full items-stretch"
              style={{ width: '100%', maxWidth: '100%' }}
            >
              {/* Brand Lockup Zone (col-span-7) */}
              {!showCompanyName ? (
                /* Logo-Only Mode: Stack underLogo + underName fields directly below the logo & align logo box via Brand Zone 2D controls */
                <div
                  className={`${
                    isSplitRight
                      ? 'col-span-7 col-start-6 row-start-1'
                      : 'col-span-7 col-start-1 row-start-1'
                  } min-w-0 h-full flex flex-col ${brandColumnVJustifyClass} ${brandHAlignClass}`}
                >
                  {showLogo && (
                    <div
                      onClick={
                        isInteractive && !isContinuationRepeat
                          ? (e) => {
                              e.stopPropagation();
                              onSelectSection?.('header', 'logo');
                            }
                          : undefined
                      }
                      title={isInteractive && !isContinuationRepeat ? 'Click to adjust Corporate Logo in Header Inspector' : undefined}
                      className={`flex flex-col ${brandHAlignClass} shrink-0 ${logoWrapperPaddingClass}`}
                    >
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
                          className="rounded-lg flex items-center justify-center text-white font-bold text-xl shadow-sm shrink-0"
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
                  {stackedBrandFieldsWhenLogoOnly.length > 0 && (
                    <div className={`flex flex-col gap-0.5 mt-1 ${brandHAlignClass}`}>
                      {stackedBrandFieldsWhenLogoOnly.map((f) => renderFieldItemNode(f))}
                    </div>
                  )}
                </div>
              ) : (
                /* Logo + Company Name Lockup Mode */
                <div
                  className={`${
                    isSplitRight
                      ? 'col-span-7 col-start-6 row-start-1 flex-row-reverse'
                      : 'col-span-7 col-start-1 row-start-1 flex-row'
                  } min-w-0 h-full flex ${brandRowJustifyClass} ${brandVAlignClass} ${logoGapClass}`}
                >
                  {showLogo && (
                    <div
                      onClick={
                        isInteractive && !isContinuationRepeat
                          ? (e) => {
                              e.stopPropagation();
                              onSelectSection?.('header', 'logo');
                            }
                          : undefined
                      }
                      title={isInteractive && !isContinuationRepeat ? 'Click to adjust Corporate Logo in Header Inspector' : undefined}
                      className={`flex flex-col ${brandHAlignClass} shrink-0 ${logoWrapperPaddingClass}`}
                    >
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
                          className="rounded-lg flex items-center justify-center text-white font-bold text-xl shadow-sm shrink-0"
                          style={{
                            backgroundColor: accentColor,
                            width: `${Math.max(40, logoHeight)}px`,
                            height: `${Math.max(40, logoHeight)}px`
                          }}
                        >
                          <Building2 className="w-6 h-6" />
                        </div>
                      )}
                      {resolvedHeaderFieldsMap.underLogo.length > 0 && (
                        <div className={`flex flex-col gap-0.5 mt-1 ${brandHAlignClass}`}>
                          {resolvedHeaderFieldsMap.underLogo.map((f) => renderFieldItemNode(f))}
                        </div>
                      )}
                    </div>
                  )}
                  <div className={`min-w-0 flex flex-col ${brandHAlignClass}`}>
                    {showCompanyName && (
                      <h1 className={`${typoScale.h1} font-bold tracking-tight text-slate-900 leading-tight break-words`}>
                        {senderEntityName}
                      </h1>
                    )}
                    {resolvedHeaderFieldsMap.underName.length > 0 && (
                      <div className={`flex flex-col gap-0.5 ${showCompanyName ? 'mt-0.5' : 'mt-0'} ${brandHAlignClass}`}>
                        {resolvedHeaderFieldsMap.underName.map((f) => renderFieldItemNode(f))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Contact Block Zone (col-span-5) */}
              <div
                className={`${
                  isSplitRight
                    ? 'col-span-5 col-start-1 row-start-1 pl-1'
                    : 'col-span-5 col-start-8 row-start-1 pr-1.5'
                } min-w-0 h-full flex flex-col space-y-0.5 box-border max-w-full ${contactVAlignClass} ${contactHAlignClass}`}
              >
                {resolvedHeaderFieldsMap.contactBlock.map((f) => renderFieldItemNode(f))}
              </div>
            </div>

            {/* Optional Full-Width Bottom Header Bar Zone */}
            {resolvedHeaderFieldsMap.bottomBar.length > 0 && (
              <div className="w-full pt-2 mt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                {resolvedHeaderFieldsMap.bottomBar.map((f) => renderFieldItemNode(f, true))}
              </div>
            )}
          </>
        )}
      </header>
    );
  };

  const renderTopSection = () => {
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
      const isSubjectSelected = activeSelectedSection === 'subject';
      return (
        <div
          className={`mb-3 ${
            isMinimal
              ? 'border-0 border-l-2 bg-transparent rounded-none pl-2.5 py-1'
              : `px-3 py-1.5 border border-slate-200 ${globalRadiusClass}`
          } ${typoScale.heading} font-medium text-slate-800 relative group transition-all duration-150 print:bg-transparent ${
            isInteractive ? 'cursor-pointer hover:border-slate-400' : ''
          } ${
            isSubjectSelected
              ? 'ring-2 ring-blue-500 ring-offset-2 shadow-sm print:ring-0 !print:ring-0'
              : ''
          }`}
          style={
            isMinimal
              ? {
                  borderLeftColor: themePalette.primaryHex
                }
              : {
                  backgroundColor: themePalette.tintBg,
                  borderLeftWidth: '3px',
                  borderLeftColor: themePalette.primaryHex
                }
          }
          onClick={isInteractive ? (e) => {
            e.stopPropagation();
            onSelectSection?.('subject');
          } : undefined}
        >
          {isInteractive && (
            <div className={`quotation-canvas-guide absolute -top-2.5 right-3 px-2 py-0.5 rounded text-[9px] font-semibold tracking-wide uppercase shadow-xs transition-opacity print:hidden z-10 ${
              isSubjectSelected ? 'bg-blue-600 text-white opacity-100' : 'bg-slate-200 text-slate-700 opacity-0 group-hover:opacity-100'
            }`}>
              Subject Banner
            </div>
          )}
          <span className="font-semibold mr-1.5" style={{ color: themePalette.textAccent }}>
            Subject:
          </span>
          <span className="text-slate-800 font-semibold">
            <EditableCanvasText
              value={quotation.subject || enquiry?.subject || ''}
              fieldKey="subject"
              canEdit={canEditCanvasInline && isSubjectSelected}
              onCommit={onInlineFieldEdit}
              placeholder="Enter quotation subject..."
            />
          </span>
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
          <div className={`quotation-canvas-guide absolute -top-2.5 right-3 px-2 py-0.5 rounded text-[9px] font-semibold tracking-wide uppercase shadow-xs transition-opacity print:hidden z-10 ${
            isRecipientSelected ? 'bg-blue-600 text-white opacity-100' : 'bg-slate-200 text-slate-700 opacity-0 group-hover:opacity-100'
          }`}>
            Submitted To
          </div>
        )}
        {isRecipientFullWidth ? (
          /* Compact 100% Full-Width Horizontal Strip Layout */
          <div>
            <div
              className={`${typoScale.heading} uppercase tracking-wider font-extrabold mb-1`}
              style={{ color: themePalette.textAccent }}
            >
              Submitted To / Attention To
            </div>
            <div className="flex flex-row items-baseline justify-between gap-4">
              <div className="min-w-0">
                <span className={`${typoScale.entityTitle} font-bold text-slate-900 mr-2`}>
                  <EditableCanvasText
                    value={clientEntityName}
                    fieldKey="client_name"
                    canEdit={canEditCanvasInline && isRecipientSelected}
                    onCommit={onInlineFieldEdit}
                  />
                </span>
                {showAttention && (
                  <span className={`${typoScale.body} text-slate-700 font-medium`}>
                    • Attn:{' '}
                    <span className="text-slate-900 font-semibold">
                      <EditableCanvasText
                        value={clientContactPerson || 'Procurement / Commercial Dept.'}
                        fieldKey="client_contact_person"
                        canEdit={canEditCanvasInline && isRecipientSelected}
                        onCommit={onInlineFieldEdit}
                      />
                    </span>
                  </span>
                )}
                <p className={`${typoScale.body} text-slate-600 mt-0.5`}>
                  <EditableCanvasText
                    value={clientAddress}
                    fieldKey="client_address"
                    canEdit={canEditCanvasInline && isRecipientSelected}
                    onCommit={onInlineFieldEdit}
                  />
                </p>
              </div>
              <div className={`text-right shrink-0 ${typoScale.body} text-slate-600 space-y-0.5`}>
                <p>
                  <span className={`${typoScale.sub} text-slate-500 font-medium`}>
                    TRN:{' '}
                    <span className="text-slate-700 font-mono">
                      <EditableCanvasText
                        value={clientTrn || 'Not Registered'}
                        fieldKey="client_trn"
                        canEdit={canEditCanvasInline && isRecipientSelected}
                        onCommit={onInlineFieldEdit}
                      />
                    </span>
                  </span>
                </p>
                {(clientPhone || clientEmail) && (
                  <p className={`text-slate-500 ${typoScale.sub}`}>
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
              <div
                className={`${typoScale.heading} uppercase tracking-wider font-extrabold mb-1`}
                style={{ color: themePalette.textAccent }}
              >
                Submitted To / Attention To
              </div>
              <h3 className={`${typoScale.entityTitle} font-bold text-slate-900`}>
                <EditableCanvasText
                  value={clientEntityName}
                  fieldKey="client_name"
                  canEdit={canEditCanvasInline && isRecipientSelected}
                  onCommit={onInlineFieldEdit}
                />
              </h3>
              {showAttention && (
                <p className={`${typoScale.body} text-slate-700 font-medium mt-0.5`}>
                  Attn:{' '}
                  <span className="text-slate-900 font-semibold">
                    <EditableCanvasText
                      value={clientContactPerson || 'Procurement / Commercial Dept.'}
                      fieldKey="client_contact_person"
                      canEdit={canEditCanvasInline && isRecipientSelected}
                      onCommit={onInlineFieldEdit}
                    />
                  </span>
                </p>
              )}
              <p className={`${typoScale.body} text-slate-600 mt-0.5`}>
                <EditableCanvasText
                  value={clientAddress}
                  fieldKey="client_address"
                  canEdit={canEditCanvasInline && isRecipientSelected}
                  onCommit={onInlineFieldEdit}
                />
              </p>
            </div>
            <div className={`${typoScale.body} text-slate-600 space-y-0.5 ${isMinimal ? 'pt-1 mt-1' : 'pt-1.5 mt-1.5 border-t border-slate-200/60'}`}>
              <p>
                <span className={`${typoScale.sub} text-slate-500 font-medium`}>
                  TRN:{' '}
                  <span className="text-slate-700">
                    <EditableCanvasText
                      value={clientTrn || 'Not Registered'}
                      fieldKey="client_trn"
                      canEdit={canEditCanvasInline && isRecipientSelected}
                      onCommit={onInlineFieldEdit}
                    />
                  </span>
                </span>
              </p>
              {(clientPhone || clientEmail) && (
                <p className={`text-slate-500 ${typoScale.sub}`}>
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
          <div className={`quotation-canvas-guide absolute -top-2.5 right-3 px-2 py-0.5 rounded text-[9px] font-semibold tracking-wide uppercase shadow-xs transition-opacity print:hidden z-10 ${
            isQuoteMetaSelected ? 'bg-blue-600 text-white opacity-100' : 'bg-slate-200 text-slate-700 opacity-0 group-hover:opacity-100'
          }`}>
            Commercial Offer
          </div>
        )}
        {isOfferFullWidth ? (
          /* Compact 100% Full-Width 4-Column Horizontal Metadata Strip */
          <div>
            <div className={`${isMinimal ? 'pb-1' : 'pb-1.5 border-b border-slate-200/60'} flex items-center justify-between gap-2`}>
              <span
                className={`${typoScale.heading} uppercase tracking-wider font-extrabold`}
                style={{ color: themePalette.textAccent }}
              >
                Commercial Offer
              </span>
              <div className="flex items-center gap-2">
                <span className={`${typoScale.quoteRef} font-mono font-bold text-slate-900`}>
                  {quotation.formatted_quote_ref || quotation.quote_number}
                </span>
                <span className={`${typoScale.sub} font-mono font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200/80`}>
                  Rev {quotation.revision_number || 1}
                </span>
              </div>
            </div>
            <div className={`grid grid-cols-4 gap-3 pt-1.5 ${typoScale.body} items-center`}>
              <div>
                <span className={`text-slate-400 ${typoScale.sub} uppercase block`}>Date</span>
                <span className="font-semibold text-slate-800">{formatDate(quotation.created_at)}</span>
              </div>
              {showValidity && quotation.valid_until && quotation.valid_until.trim() !== '' ? (
                <div>
                  <span className={`text-slate-400 ${typoScale.sub} uppercase block`}>Valid Until</span>
                  <span className="font-semibold text-slate-800">{formatDate(quotation.valid_until)}</span>
                </div>
              ) : showEnquiryRef && enquiryRef ? (
                <div>
                  <span className={`text-slate-400 ${typoScale.sub} uppercase block`}>Enquiry Ref</span>
                  <span className="font-semibold text-slate-800 font-mono truncate block">{enquiryRef}</span>
                </div>
              ) : (
                <div>
                  <span className={`text-slate-400 ${typoScale.sub} uppercase block`}>Validity</span>
                  <span className="font-semibold text-slate-800">Standard</span>
                </div>
              )}
              <div>
                <span className={`text-slate-400 ${typoScale.sub} uppercase block`}>Prepared By</span>
                <span className="font-semibold text-slate-800 truncate block">
                  <EditableCanvasText
                    value={showSalesRep && resolvedSalesRep ? resolvedSalesRep : 'Authorized Rep'}
                    fieldKey="prepared_by"
                    canEdit={canEditCanvasInline && isQuoteMetaSelected}
                    onCommit={onInlineFieldEdit}
                  />
                </span>
              </div>
              <div className="text-right">
                <span className={`text-slate-400 ${typoScale.sub} uppercase block`}>Status</span>
                <span className={`font-bold text-slate-700 uppercase tracking-wider ${typoScale.heading}`}>
                  {String(quotation.status || 'Draft').toUpperCase()}
                </span>
              </div>
            </div>
          </div>
        ) : (
          /* Standard 50% Half-Width Vertical Card Layout */
          <>
            <div>
              <div className={`${isMinimal ? 'pb-0.5' : 'pb-1 border-b border-slate-200/60'} flex items-center justify-between gap-2`}>
                <span
                  className={`${typoScale.heading} uppercase tracking-wider font-extrabold`}
                  style={{ color: themePalette.textAccent }}
                >
                  Commercial Offer
                </span>
                <span className={`${typoScale.sub} font-mono font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200/80`}>
                  Rev {quotation.revision_number || 1}
                </span>
              </div>
              <div className="py-1.5 text-center">
                <div className={`${typoScale.quoteRef} font-mono font-bold text-slate-900`}>
                  {quotation.formatted_quote_ref || quotation.quote_number}
                </div>
              </div>
            </div>

            <div className={`grid grid-cols-2 gap-1.5 ${isMinimal ? 'pt-1' : 'pt-1.5 border-t border-slate-200/60'} ${typoScale.body}`}>
              <div>
                <span className={`text-slate-400 ${typoScale.sub} uppercase block`}>Date</span>
                <span className="font-semibold text-slate-800">{formatDate(quotation.created_at)}</span>
              </div>
              {showValidity && quotation.valid_until && quotation.valid_until.trim() !== '' && (
                <div>
                  <span className={`text-slate-400 ${typoScale.sub} uppercase block`}>Valid Until</span>
                  <span className="font-semibold text-slate-800">{formatDate(quotation.valid_until)}</span>
                </div>
              )}
              {showSalesRep && resolvedSalesRep && (
                <div>
                  <span className={`text-slate-400 ${typoScale.sub} uppercase block`}>Prepared By</span>
                  <span className="font-semibold text-slate-800 truncate block">
                    <EditableCanvasText
                      value={resolvedSalesRep}
                      fieldKey="prepared_by"
                      canEdit={canEditCanvasInline && isQuoteMetaSelected}
                      onCommit={onInlineFieldEdit}
                    />
                  </span>
                </div>
              )}
              {showEnquiryRef && enquiryRef && (
                <div>
                  <span className={`text-slate-400 ${typoScale.sub} uppercase block`}>Enquiry Ref</span>
                  <span className="font-semibold text-slate-800 font-mono truncate block">{enquiryRef}</span>
                </div>
              )}
              <div className="col-span-2 pt-0.5 flex items-center justify-between">
                <span className={`text-slate-400 ${typoScale.sub} uppercase`}>Status</span>
                <span className={`font-bold text-slate-700 uppercase tracking-wider ${typoScale.heading}`}>
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
        {renderHeaderBrandingElement(false)}

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
          <div className={`quotation-canvas-guide absolute -top-2.5 right-3 px-2 py-0.5 rounded text-[9px] font-semibold tracking-wide uppercase shadow-xs transition-opacity print:hidden z-10 ${
            isTableSelected ? 'bg-blue-600 text-white opacity-100' : 'bg-slate-200 text-slate-700 opacity-0 group-hover:opacity-100'
          }`}>
            {isTableSelected ? 'Editing Table Layout' : 'Click to Inspect Table'}
          </div>
        )}
        <div
          className={`${
            isMinimal
              ? 'border-b border-slate-200/80 rounded-none'
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
              {(() => {
                const isSolidHdr = resolvedTableHeaderStyle === 'solid';
                const isUnderlineHdr = resolvedTableHeaderStyle === 'underline';
                const isMinimalHdr = resolvedTableHeaderStyle === 'minimal';
                const thTextColor = isSolidHdr ? '#ffffff' : themePalette.textAccent;
                const thBorderClass = isSolidHdr
                  ? 'border-r border-white/20 last:border-r-0'
                  : isMinimalHdr
                  ? 'border-r-0'
                  : 'border-r border-slate-200/80 last:border-r-0';
                const trStyle: React.CSSProperties = isSolidHdr
                  ? {
                      backgroundColor: themePalette.primaryHex,
                      borderBottom: `2px solid ${themePalette.darkHex || themePalette.primaryHex}`,
                      color: '#ffffff',
                      breakInside: 'avoid',
                      pageBreakInside: 'avoid'
                    }
                  : isUnderlineHdr
                  ? {
                      backgroundColor: '#ffffff',
                      borderBottom: `2px solid ${themePalette.primaryHex}`,
                      color: themePalette.textAccent,
                      breakInside: 'avoid',
                      pageBreakInside: 'avoid'
                    }
                  : isMinimalHdr
                  ? {
                      backgroundColor: 'transparent',
                      borderBottom: '1px solid #cbd5e1',
                      color: themePalette.textAccent,
                      breakInside: 'avoid',
                      pageBreakInside: 'avoid'
                    }
                  : {
                      backgroundColor: themePalette.tintStrongBg,
                      borderBottom: `2px solid ${themePalette.primaryHex}`,
                      color: themePalette.textAccent,
                      breakInside: 'avoid',
                      pageBreakInside: 'avoid'
                    };

                return (
                  <tr className="font-semibold border-b" style={trStyle}>
                    <th
                      className={`${thPad} px-1.5 py-2 ${tableHeadingSize} font-bold uppercase tracking-wider ${thBorderClass} text-center whitespace-nowrap`}
                      style={{ color: thTextColor }}
                    >
                      #
                    </th>
                    <th
                      className={`${thPad} px-2.5 py-2 ${tableHeadingSize} font-bold uppercase tracking-wider ${thBorderClass} text-left`}
                      style={{ color: thTextColor }}
                    >
                      Description &amp; Technical Specifications
                    </th>
                    <th
                      className={`${thPad} px-1.5 py-2 ${tableHeadingSize} font-bold uppercase tracking-wider ${thBorderClass} text-center font-mono whitespace-nowrap`}
                      style={{ color: thTextColor }}
                    >
                      Qty
                    </th>
                    {showUom && (
                      <th
                        className={`${thPad} px-1.5 py-2 ${tableHeadingSize} font-bold uppercase tracking-wider ${thBorderClass} text-center whitespace-nowrap`}
                        style={{ color: thTextColor }}
                      >
                        UOM
                      </th>
                    )}
                    {showUnitPrice && (
                      <th
                        className={`${thPad} pl-2 pr-3.5 py-2 ${tableHeadingSize} font-bold uppercase tracking-wider ${thBorderClass} text-right whitespace-nowrap`}
                        style={{ paddingRight: !showLineTotal ? '16px' : undefined, color: thTextColor }}
                      >
                        Unit Price
                      </th>
                    )}
                    {showLineTotal && (
                      <th
                        className={`${thPad} pl-3 pr-4 py-2 ${tableHeadingSize} font-bold uppercase tracking-wider text-right whitespace-nowrap`}
                        style={{ paddingRight: '16px', color: thTextColor }}
                      >
                        Total ({currency})
                      </th>
                    )}
                  </tr>
                );
              })()}
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
                              <span className={`px-1.5 py-0.5 ${typoScale.micro} uppercase font-bold tracking-wider bg-amber-200 text-amber-900 rounded shrink-0`}>
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
                                      <div className={`${typoScale.sub} text-slate-600 mt-1 leading-normal`}>
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
                                          className={`inline-flex items-center ${typoScale.sub} font-mono bg-slate-50 text-slate-800 px-1.5 py-0.5 rounded border border-slate-200 print:bg-transparent print:border-slate-300 print:text-black leading-tight`}
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
                          <td className={`${tableFontSize} font-mono text-center py-1.5 px-1 leading-tight text-slate-700 break-words align-top`}>
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
          .quotation-page-sheet.quotation-full-bleed-sheet {
            padding: 0 !important;
            min-height: 297mm !important;
            height: 297mm !important;
            overflow: hidden !important;
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
          FULL-PAGE A4 COVER SHEETS (BEFORE PAGE 1)
         ======================================================== */}
      {coverSheets.map((cover, coverIdx) => {
        const att = cover.attachment;
        const isFullBleed = cover.fullBleed;
        return (
          <article
            key={att.id || `cover_sheet_${coverIdx + 1}`}
            className={`quotation-page-sheet quotation-cover-sheet ${
              isFullBleed
                ? 'quotation-full-bleed-sheet p-0 print:p-0 overflow-hidden h-[297mm]'
                : 'p-[14mm] print:px-[14mm] print:pt-[10mm] print:pb-[8mm]'
            } relative w-[210mm] min-w-[210mm] max-w-[210mm] min-h-[297mm] bg-white text-slate-800 shadow-xl border border-slate-200/80 ${documentFontClass} box-border flex flex-col justify-between mx-auto mb-8 print:shadow-none print:border-none print:m-0 print:mb-0 print:break-after-page print:min-h-[294mm]`}
            style={{ boxSizing: 'border-box' }}
          >
            {isFullBleed ? (
              <img
                src={att.url}
                alt={att.name || `Cover Page ${coverIdx + 1}`}
                className="w-[210mm] h-[297mm] object-cover block m-0 p-0"
              />
            ) : (
              <>
                {renderTopAccentBar()}
                <div className="flex-1 flex flex-col items-center justify-center w-full my-2 overflow-hidden">
                  {att.show_title !== false && att.name && (
                    <div
                      className={`${typoScale.heading} font-bold uppercase tracking-wider mb-3 text-center`}
                      style={{ color: accentColor }}
                    >
                      {att.name.replace(/\.(png|jpe?g|webp|gif|bmp|svg|pdf)$/i, '')}
                    </div>
                  )}
                  <img
                    src={att.url}
                    alt={att.name || `Cover Page ${coverIdx + 1}`}
                    className="max-h-[245mm] max-w-full w-auto h-auto object-contain rounded border border-slate-200/80"
                  />
                </div>
                {!cover.excludeFromPageCount && cover.displayPageNumber !== null &&
                  renderFooter(cover.displayPageNumber, totalDocumentPages)}
              </>
            )}
          </article>
        );
      })}

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
        const displayPageNum = sheet.displayPageNumber || sheetIdx + 1;

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
                      ? `📄 Table Split Continuation (After Item #${sheet.tableChunk?.splitFromItemNumber || sheet.tableChunk?.startIndex || 1}) • Page ${displayPageNum} of ${totalDocumentPages}`
                      : `✂ Page Break • Page ${displayPageNum} of ${totalDocumentPages}`}
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
              className={`quotation-page-sheet quotation-page-${sheet.sheetNumber} relative w-[210mm] min-w-[210mm] max-w-[210mm] min-h-[297mm] bg-white text-slate-800 shadow-xl border border-slate-200/80 ${documentFontClass} box-border p-[14mm] flex flex-col justify-between mx-auto mb-8 print:shadow-none print:border-none print:m-0 print:mb-0 print:px-[14mm] print:pt-[10mm] print:pb-[8mm] ${
                isVeryLastDocumentSheet
                  ? 'quotation-last-sheet print:break-after-avoid'
                  : 'print:break-after-page'
              } print:min-h-[294mm]`}
              style={{ boxSizing: 'border-box' }}
            >
              {/* Top Accent Stripe */}
              {renderTopAccentBar()}

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
                        {headerBranding.continuationHeaderMode === 'full_repeat'
                          ? renderHeaderBrandingElement(true)
                          : renderCompactRunningHeader(displayPageNum, totalDocumentPages)}
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
              {renderFooter(displayPageNum, totalDocumentPages)}
            </article>
          </React.Fragment>
        );
      })}

      {/* Interactive Studio Guide for Trailing Page Break(s) Appended Below the Last Block */}
      {isInteractive &&
        showPageBreakGuides !== false &&
        (() => {
          const activeList = resolvedBlocks.filter(
            (b) => b.enabled !== false && b.is_visible !== false
          );
          const lastActive = activeList[activeList.length - 1];
          const isLastTrailingBreak =
            lastActive &&
            (lastActive.type === 'page_break' || lastActive.id?.startsWith('break_'));
          if (!isLastTrailingBreak) return null;
          const isTrailingSelected = activeSelectedSection === lastActive.id;
          return (
            <div
              onClick={() => {
                onSelectSection
                  ? onSelectSection(lastActive.id)
                  : onSelectBlock?.(lastActive.id);
              }}
              className={`quotation-canvas-guide w-[210mm] max-w-[210mm] -mt-4 mb-6 px-3.5 py-2 rounded-xl border border-dashed flex items-center justify-between text-[10.5px] font-mono cursor-pointer transition shadow-xs print:hidden ${
                isTrailingSelected
                  ? 'bg-amber-100 border-amber-500 text-amber-950 ring-2 ring-amber-400/60'
                  : 'bg-amber-50/95 hover:bg-amber-100/90 border-amber-400 text-amber-900'
              }`}
            >
              <span className="font-semibold flex items-center gap-1.5">
                ✂ Page Break (Below Last Section — Move Up in Left Panel to Split Blocks onto Next Page)
              </span>
              <span className="text-[9.5px] font-bold underline">Inspect Page Break</span>
            </div>
          );
        })()}

      {/* ========================================================
          FULL-PAGE A4 TECHNICAL ANNEX SHEETS
         ======================================================== */}
      {annexSheets.map((annexDescriptor, annexIdx) => {
        const att = annexDescriptor.attachment;
        const annexPageNumber = annexDescriptor.displayPageNumber;
        const isLastAnnexSheet = annexIdx === annexSheets.length - 1;
        const quoteRef = quotation.formatted_quote_ref || quotation.quote_number || 'QT-DRAFT';
        const annexHeaderTitle = annexDescriptor.headerTitle;
        const isFullBleed = annexDescriptor.fullBleed;

        return (
          <article
            key={att.id || `annex_sheet_${annexIdx + 1}`}
            className={`quotation-page-sheet quotation-annex-sheet quotation-page-${annexDescriptor.sheetNumber} ${
              isFullBleed
                ? 'quotation-full-bleed-sheet p-0 print:p-0 overflow-hidden h-[297mm]'
                : 'p-[14mm] print:px-[14mm] print:pt-[10mm] print:pb-[8mm]'
            } relative w-[210mm] min-w-[210mm] max-w-[210mm] min-h-[297mm] bg-white text-slate-800 shadow-xl border border-slate-200/80 ${documentFontClass} box-border flex flex-col justify-between mx-auto mb-8 print:shadow-none print:border-none print:m-0 print:mb-0 ${
              isLastAnnexSheet
                ? 'quotation-last-sheet print:break-after-avoid'
                : 'print:break-after-page'
            } print:min-h-[294mm]`}
            style={{ boxSizing: 'border-box' }}
          >
            {isFullBleed ? (
              <img
                src={att.url}
                alt={att.name || `Technical Annex ${annexIdx + 1}`}
                className="w-[210mm] h-[297mm] object-cover block m-0 p-0"
              />
            ) : (
              <>
                {/* Top Accent Stripe */}
                {renderTopAccentBar()}

                {/* Continuation Running Header for Technical Annex */}
                <div className="w-full">
                  <div
                    className="compact-running-header flex justify-between items-center border-b border-slate-200 pb-1.5 mb-2 w-full bg-white"
                    style={{ minHeight: `${Math.max(26, (headerBranding.continuationLogoHeightPx || 20) + 6)}px` }}
                  >
                    <div className="flex items-center min-w-0 max-w-[34%]">
                      {headerBranding.includeMiniLogoOnContinuation && !logoLoadFailed && (
                        <img
                          src={headerBranding.activeLogoUrl}
                          alt=""
                          style={{ height: `${headerBranding.continuationLogoHeightPx || 20}px`, maxWidth: '110px' }}
                          className="w-auto object-contain mr-2 shrink-0"
                          onError={() => setLogoLoadFailed(true)}
                        />
                      )}
                      {headerBranding.showCompanyNameOnContinuation && (
                        <div className={`${typoScale.sub} font-bold text-slate-800 tracking-tight uppercase truncate`}>
                          {senderEntityName || 'Company'}
                        </div>
                      )}
                    </div>
                    <div
                      className={`${typoScale.sub} font-bold uppercase tracking-wide truncate max-w-[42%] text-center px-2`}
                      style={{ color: accentColor }}
                    >
                      {annexHeaderTitle}
                    </div>
                    <div className={`${typoScale.micro} text-slate-500 font-mono text-right shrink-0`}>
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
              </>
            )}
          </article>
        );
      })}
    </div>
  );
};

