import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Quotation,
  QuotationPreset,
  QuotationPresetColumns,
  QuotationTaxMode,
  QuotationSignatoryMode,
  WorkspaceDocumentProfile,
  DocumentProfileBankAccount,
  Enquiry,
  Salesperson,
  UserProfile,
  LineItem,
  Workspace,
  QuotationThemeAccent,
  QuotationSignatureStyle,
  QuotationLogoPosition,
  QuotationHeaderLayout,
  QuotationTableDensity,
  QuotationTableFontScale,
  QuotationFontSizeScale,
  BankAccountProfile,
  QuotationBlockConfig,
  QuotationBlockId,
  StudioSelectedSection,
  QuotationHeaderConfig,
  QuotationRecipientConfig,
  QuotationFooterConfig,
  QuotationItemAttribute,
  QuotationLineItem,
  LineItemComponent,
  QuotationPageMode,
  QuotationHeaderFieldItem,
  Attachment,
  EnquiryQuotationSyncPayload,
  Product,
  QuotationOptionDisplayMode,
  QuotationBlockPiece,
  QuotationBlockPieceType,
  QuotationTextFormatStyle,
  QuotationBlockFieldRowItem,
  SavedCustomBlockTemplate
} from '../../types';
import { QuotationRepository } from '../../services/repositories/QuotationRepository';
import { uploadWorkspaceMediaAsset } from '../../services/attachmentStorage';
import SaveToCatalogModal, {
  parseLineItemTitleAndSpec,
  hasCatalogDrift,
  syncLineItemToCatalogProduct
} from '../SaveToCatalogModal';
import CompositePackageEditor from './CompositePackageEditor';
import LineItemImageOptionsPopover from '../common/LineItemImageOptionsPopover';
import { db } from '../../firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import {
  QuotationDocument,
  QUOTATION_THEMES,
  DEFAULT_QUOTATION_BLOCKS,
  DEFAULT_HEADER_CONFIG,
  DEFAULT_RECIPIENT_CONFIG,
  DEFAULT_FOOTER_CONFIG,
  extractLineItemAttributesAndCleanDescription,
  resolveHeaderFields,
  resolveStampSignatureOverlayConfig,
  amountToWords
} from './QuotationDocument';
import {
  AtMentionInput,
  AtMentionTextarea,
  toggleInlineSelectionWrap
} from './AtMentionField';
import {
  QUOTATION_AT_TAGS,
  QuotationTokenContext,
  QuotationAtTagDefinition,
  buildQuotationTokenMap,
  findUnknownAtTokensInQuotation
} from '../../utils/quotationTokenResolver';
import {
  X,
  FileText,
  Sliders,
  DollarSign,
  Printer,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  CheckCircle2,
  Send,
  Save,
  Building,
  Image as ImageIcon,
  User,
  Percent,
  Truck,
  Landmark,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  FileCheck,
  Palette,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Layout,
  Columns,
  Plus,
  BookmarkPlus,
  Layers,
  Stamp,
  ArrowUp,
  ArrowDown,
  Settings2,
  Table,
  Type,
  Tag,
  Square,
  Check,
  ArrowLeftRight,
  MoveVertical,
  CheckSquare,
  Edit3,
  Scissors,
  Trash2,
  Star,
  Paperclip,
  Upload,
  AtSign,
  Copy,
  Eye,
  EyeOff,
  AlertTriangle,
  PanelLeft,
  PanelLeftClose,
  AlignJustify,
  Bold,
  Italic,
  Underline
} from 'lucide-react';

export interface QuotationStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  enquiry: Enquiry;
  salespersonName?: string;
  activeWorkspaceId: string;
  activeWorkspace?: Workspace;
  user: UserProfile;
  profile?: WorkspaceDocumentProfile | null;
  editingQuotation?: Quotation | null;
  isSandboxMode?: boolean;
  initialPresetId?: string;
  onProfileAndPresetSaved?: (
    savedProfile: WorkspaceDocumentProfile,
    savedPreset?: QuotationPreset
  ) => void;
  onQuotationCreated?: (quotation: Quotation) => void;
  onEnquirySync?: (syncPayload: EnquiryQuotationSyncPayload) => void;
  products?: Product[];
  setProducts?: React.Dispatch<React.SetStateAction<Product[]>>;
  triggerToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const BLOCK_META: Record<string, { label: string; desc: string; icon: any }> = {
  terms: { label: 'Commercial Terms', desc: 'Price basis, payment & validity', icon: FileCheck },
  totals: { label: 'Financial Totals', desc: 'Subtotal, freight, taxes & grand total', icon: DollarSign },
  remittance: { label: 'Bank Remittance', desc: 'Bank wire instructions & account numbers', icon: Landmark },
  signatory: { label: 'Signatures & Stamp', desc: 'Executive signatories & company seal', icon: Stamp },
  signatories: { label: 'Signatures & Stamp', desc: 'Executive signatories & company seal', icon: Stamp },
  acceptance: { label: 'Customer Acceptance', desc: 'Client confirmation & sign-back box', icon: ShieldCheck }
};

const getBlockMeta = (block: QuotationBlockConfig): { label: string; desc: string; icon: any } => {
  const blockType =
    block.type ||
    (block.id?.startsWith('break_')
      ? 'page_break'
      : block.id?.startsWith('spacer_')
      ? 'spacer'
      : block.id);
  if (blockType === 'page_break') {
    return {
      label: block.title || 'Page Break',
      desc:
        block.show_continuation_header !== false
          ? 'Starts a new A4 sheet with running header'
          : 'Starts a new A4 sheet without running header',
      icon: Scissors
    };
  }
  if (blockType === 'spacer') {
    return {
      label: block.title || 'Spacer',
      desc: block.spacer_fill_remaining
        ? 'Expands to fill remaining vertical sheet space'
        : `Vertical spacing block (${block.spacer_height_mm || 20}mm)`,
      icon: MoveVertical
    };
  }
  if (blockType === 'custom' || Array.isArray(block.pieces)) {
    const pieceCount = Array.isArray(block.pieces) ? block.pieces.length : 0;
    return {
      label: block.title || 'Custom Block',
      desc: `${block.zone === 'pre_table' ? 'Above Table' : 'Below Table'} • ${pieceCount} Lego piece${pieceCount === 1 ? '' : 's'}`,
      icon: Layers
    };
  }
  return (
    BLOCK_META[block.id] ||
    BLOCK_META[blockType] || {
      label: block.title || block.id,
      desc: 'Modular document section',
      icon: Layers
    }
  );
};

const makeUniqueId = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

const deepClonePiece = (piece: QuotationBlockPiece): QuotationBlockPiece => ({
  ...piece,
  id: makeUniqueId('piece'),
  style: piece.style ? { ...piece.style } : undefined,
  labelStyle: piece.labelStyle ? { ...piece.labelStyle } : undefined,
  valueStyle: piece.valueStyle ? { ...piece.valueStyle } : undefined,
  items: piece.items ? [...piece.items] : undefined,
  fieldRows: piece.fieldRows
    ? piece.fieldRows.map((r) => ({ ...r, id: makeUniqueId('frow') }))
    : undefined,
  tableHeaders: piece.tableHeaders ? [...piece.tableHeaders] : undefined,
  tableColAlignments: piece.tableColAlignments ? [...piece.tableColAlignments] : undefined,
  tableRows: piece.tableRows ? piece.tableRows.map((r) => [...r]) : undefined,
  moneyRows: piece.moneyRows
    ? piece.moneyRows.map((r) => ({ ...r, id: makeUniqueId('mrow') }))
    : undefined,
  leftPieces: piece.leftPieces ? piece.leftPieces.map(deepClonePiece) : undefined,
  rightPieces: piece.rightPieces ? piece.rightPieces.map(deepClonePiece) : undefined
});

const deepCloneCustomBlock = (
  sourceBlock: QuotationBlockConfig,
  titleOverride?: string
): QuotationBlockConfig => ({
  ...sourceBlock,
  id: makeUniqueId('custom_block'),
  type: 'custom',
  title: titleOverride || sourceBlock.title || 'Custom Block',
  enabled: true,
  is_visible: true,
  zone: sourceBlock.zone || 'post_table',
  placement: sourceBlock.placement || 'full',
  style: sourceBlock.style || 'framed',
  borderStyleOverride: sourceBlock.borderStyleOverride || 'inherit',
  allowPageSplit: Boolean(sourceBlock.allowPageSplit),
  pieces: (sourceBlock.pieces || []).map(deepClonePiece)
});

const createDefaultPiece = (pieceType: QuotationBlockPieceType): QuotationBlockPiece => {
  const id = makeUniqueId('piece');
  switch (pieceType) {
    case 'heading':
      return {
        id,
        type: 'heading',
        enabled: true,
        text: 'SECTION HEADING',
        showAccentBar: true,
        style: { fontSize: 'sm', fontWeight: 'bold', letterSpacing: 'uppercase_tracked', textColor: 'accent' }
      };
    case 'rich_text':
      return {
        id,
        type: 'rich_text',
        enabled: true,
        text: 'Prepared for **@client_company** regarding *@subject*. Reference: __@quote_ref__.',
        style: { fontSize: 'sm', fontWeight: 'normal', lineHeight: 'normal', textAlign: 'left' }
      };
    case 'list':
      return {
        id,
        type: 'list',
        enabled: true,
        listStyle: 'bullet',
        items: [
          'All equipment supplied is brand new and covered by manufacturer warranty.',
          'Delivery scheduled to @client_address upon receipt of official Purchase Order.',
          'Validity of this offer is @validity_days days from @quote_date.'
        ],
        style: { fontSize: 'sm', lineHeight: 'normal' }
      };
    case 'field_rows':
      return {
        id,
        type: 'field_rows',
        enabled: true,
        gridColumns: 1,
        fieldRows: [
          { id: makeUniqueId('frow'), enabled: true, label: 'Client Entity:', value: '@client_company' },
          { id: makeUniqueId('frow'), enabled: true, label: 'Attention:', value: '@contact_person' },
          { id: makeUniqueId('frow'), enabled: true, label: 'Quotation Ref:', value: '@quote_ref' }
        ],
        labelStyle: { fontSize: 'xs', fontWeight: 'semibold', textColor: 'muted' },
        valueStyle: { fontSize: 'xs', fontWeight: 'semibold', textColor: 'default' }
      };
    case 'table':
      return {
        id,
        type: 'table',
        enabled: true,
        tableHeaders: ['Milestone / Stage', 'Payment %', 'Trigger / Schedule'],
        tableColAlignments: ['left', 'right', 'left'],
        tableRows: [
          ['Advance Downpayment', '50%', 'Against Official PO'],
          ['Balance Upon Delivery', '50%', 'Prior to Site Dispatch']
        ],
        style: { fontSize: 'xs' }
      };
    case 'money_summary':
      return {
        id,
        type: 'money_summary',
        enabled: true,
        moneyRows: [
          { id: makeUniqueId('mrow'), enabled: true, label: 'Net Subtotal', value: '@subtotal' },
          { id: makeUniqueId('mrow'), enabled: true, label: 'VAT (@tax_rate)', value: '@tax_amount' },
          { id: makeUniqueId('mrow'), enabled: true, label: 'Grand Total Payable', value: '@grand_total', isGrandTotal: true }
        ],
        style: { fontSize: 'xs' }
      };
    case 'image':
      return {
        id,
        type: 'image',
        enabled: true,
        imageUrl: '',
        imageCaption: 'Authorized Stamp / Certification Asset',
        imageHeightMm: 22,
        imageAlign: 'left'
      };
    case 'signature_box':
      return {
        id,
        type: 'signature_box',
        enabled: true,
        signerLabel: 'Authorized Signatory — @company_name',
        signerName: '@signatory_name',
        signerTitle: '@signatory_title',
        showDateLine: true,
        showStampPlaceholder: true
      };
    case 'qr_code':
      return {
        id,
        type: 'qr_code',
        enabled: true,
        qrValue: 'QUOTE:@quote_ref|CLIENT:@client_company|TOTAL:@grand_total',
        qrCaption: 'Scan to verify @quote_ref',
        qrSizeMm: 22
      };
    case 'divider':
      return {
        id,
        type: 'divider',
        enabled: true,
        dividerStyle: 'solid',
        spacingMm: 2
      };
    case 'columns':
      return {
        id,
        type: 'columns',
        enabled: true,
        columnRatio: '50_50',
        leftPieces: [
          {
            id: makeUniqueId('piece'),
            type: 'heading',
            enabled: true,
            text: '',
            showAccentBar: true,
            style: { fontSize: 'xs', fontWeight: 'bold', letterSpacing: 'uppercase_tracked' }
          },
          {
            id: makeUniqueId('piece'),
            type: 'rich_text',
            enabled: true,
            text: 'Prepared by **@prepared_by** for @client_company.',
            style: { fontSize: 'xs' }
          }
        ],
        rightPieces: [
          {
            id: makeUniqueId('piece'),
            type: 'heading',
            enabled: true,
            text: '',
            showAccentBar: true,
            style: { fontSize: 'xs', fontWeight: 'bold', letterSpacing: 'uppercase_tracked' }
          },
          {
            id: makeUniqueId('piece'),
            type: 'field_rows',
            enabled: true,
            gridColumns: 1,
            fieldRows: [
              { id: makeUniqueId('frow'), enabled: true, label: 'Quote Ref:', value: '@quote_ref' },
              { id: makeUniqueId('frow'), enabled: true, label: 'Valid Until:', value: '@valid_until' }
            ]
          }
        ]
      };
  }
};

const createCustomBlockFromPreset = (
  presetKey: string,
  defaultZone: 'pre_table' | 'post_table' = 'post_table'
): QuotationBlockConfig => {
  const id = makeUniqueId('custom_block');
  switch (presetKey) {
    case 'blank_rich_text':
      return {
        id,
        type: 'custom',
        title: 'Executive Introduction / Scope Note',
        enabled: true,
        is_visible: true,
        zone: defaultZone,
        placement: 'full',
        style: 'framed',
        borderStyleOverride: 'inherit',
        allowPageSplit: false,
        pieces: [
          {
            id: makeUniqueId('piece'),
            type: 'heading',
            enabled: true,
            text: 'EXECUTIVE SUMMARY & SCOPE OF SUPPLY',
            showAccentBar: true,
            style: { fontSize: 'xs', fontWeight: 'bold', letterSpacing: 'uppercase_tracked', textColor: 'accent' }
          },
          {
            id: makeUniqueId('piece'),
            type: 'rich_text',
            enabled: true,
            text: 'Dear **@contact_person**, we are pleased to submit our commercial and technical proposal **@quote_ref** for **@client_company** regarding *@subject*.',
            style: { fontSize: 'sm', lineHeight: 'relaxed' }
          }
        ]
      };
    case 'key_value_grid':
      return {
        id,
        type: 'custom',
        title: 'Project & Delivery Metadata',
        enabled: true,
        is_visible: true,
        zone: defaultZone,
        placement: 'full',
        style: 'framed',
        borderStyleOverride: 'inherit',
        allowPageSplit: false,
        pieces: [
          {
            id: makeUniqueId('piece'),
            type: 'heading',
            enabled: true,
            text: 'PROJECT & DISPATCH SPECIFICATIONS',
            showAccentBar: true,
            style: { fontSize: 'xs', fontWeight: 'bold', letterSpacing: 'uppercase_tracked', textColor: 'accent' }
          },
          {
            id: makeUniqueId('piece'),
            type: 'field_rows',
            enabled: true,
            gridColumns: 2,
            fieldRows: [
              { id: makeUniqueId('frow'), enabled: true, label: 'Client Company:', value: '@client_company' },
              { id: makeUniqueId('frow'), enabled: true, label: 'Quotation Ref:', value: '@quote_ref' },
              { id: makeUniqueId('frow'), enabled: true, label: 'Delivery Site:', value: '@client_address' },
              { id: makeUniqueId('frow'), enabled: true, label: 'Lead Time:', value: '@lead_time' }
            ]
          }
        ]
      };
    case 'bullet_checklist':
      return {
        id,
        type: 'custom',
        title: 'Technical Compliance & Checklist',
        enabled: true,
        is_visible: true,
        zone: defaultZone,
        placement: 'full',
        style: 'framed',
        borderStyleOverride: 'inherit',
        allowPageSplit: false,
        pieces: [
          {
            id: makeUniqueId('piece'),
            type: 'heading',
            enabled: true,
            text: 'SCOPE INCLUSIONS & COMPLIANCE CHECKLIST',
            showAccentBar: true,
            style: { fontSize: 'xs', fontWeight: 'bold', letterSpacing: 'uppercase_tracked', textColor: 'accent' }
          },
          {
            id: makeUniqueId('piece'),
            type: 'list',
            enabled: true,
            listStyle: 'check',
            items: [
              'Factory test certificate & compliance documentation included.',
              '12-month standard manufacturer warranty from date of delivery.',
              'Packing suitable for site handling at @client_address.'
            ],
            style: { fontSize: 'xs', lineHeight: 'relaxed' }
          }
        ]
      };
    case 'mini_spec_table':
      return {
        id,
        type: 'custom',
        title: 'Payment Milestone Schedule',
        enabled: true,
        is_visible: true,
        zone: defaultZone,
        placement: 'full',
        style: 'framed',
        borderStyleOverride: 'inherit',
        allowPageSplit: false,
        pieces: [
          {
            id: makeUniqueId('piece'),
            type: 'heading',
            enabled: true,
            text: 'PAYMENT MILESTONE SCHEDULE',
            showAccentBar: true,
            style: { fontSize: 'xs', fontWeight: 'bold', letterSpacing: 'uppercase_tracked', textColor: 'accent' }
          },
          {
            id: makeUniqueId('piece'),
            type: 'table',
            enabled: true,
            tableHeaders: ['Stage', 'Allocation', 'Condition / Milestone'],
            tableColAlignments: ['left', 'right', 'left'],
            tableRows: [
              ['Milestone 1 — Advance', '40%', 'Upon PO Issuance & Order Confirmation'],
              ['Milestone 2 — Dispatch', '50%', 'Upon Readiness for Site Delivery'],
              ['Milestone 3 — Handover', '10%', 'Upon Final Site Acceptance']
            ],
            style: { fontSize: 'xs' }
          }
        ]
      };
    case 'two_column_split':
      return {
        id,
        type: 'custom',
        title: 'Two-Column Commercial Split',
        enabled: true,
        is_visible: true,
        zone: defaultZone,
        placement: 'full',
        style: 'framed',
        borderStyleOverride: 'inherit',
        allowPageSplit: false,
        pieces: [createDefaultPiece('columns')]
      };
    case 'visual_qr_banner':
      return {
        id,
        type: 'custom',
        title: 'Digital Verification & QR Code Box',
        enabled: true,
        is_visible: true,
        zone: defaultZone,
        placement: 'right',
        style: 'framed',
        borderStyleOverride: 'inherit',
        allowPageSplit: false,
        pieces: [
          {
            id: makeUniqueId('piece'),
            type: 'heading',
            enabled: true,
            text: 'DIGITAL QUOTE VERIFICATION',
            showAccentBar: true,
            style: { fontSize: 'xs', fontWeight: 'bold', letterSpacing: 'uppercase_tracked', textColor: 'accent' }
          },
          createDefaultPiece('qr_code')
        ]
      };
    case 'clone_terms':
      return {
        id,
        type: 'custom',
        title: 'Commercial Terms (Custom)',
        enabled: true,
        is_visible: true,
        zone: 'post_table',
        placement: 'left',
        style: 'framed',
        borderStyleOverride: 'inherit',
        allowPageSplit: false,
        pieces: [
          {
            id: makeUniqueId('piece'),
            type: 'heading',
            enabled: true,
            text: 'COMMERCIAL TERMS & CONDITIONS',
            showAccentBar: true,
            style: { fontSize: 'xs', fontWeight: 'bold', letterSpacing: 'uppercase_tracked', textColor: 'accent' }
          },
          {
            id: makeUniqueId('piece'),
            type: 'field_rows',
            enabled: true,
            gridColumns: 1,
            fieldRows: [
              { id: makeUniqueId('frow'), enabled: true, label: 'Price Basis:', value: '@price_basis' },
              { id: makeUniqueId('frow'), enabled: true, label: 'Payment Terms:', value: '@payment_terms' },
              { id: makeUniqueId('frow'), enabled: true, label: 'Offer Validity:', value: '@validity_days Days (Until @valid_until)' },
              { id: makeUniqueId('frow'), enabled: true, label: 'Lead Time:', value: '@lead_time' }
            ]
          },
          {
            id: makeUniqueId('piece'),
            type: 'divider',
            enabled: true,
            dividerStyle: 'dashed',
            spacingMm: 1.5
          },
          {
            id: makeUniqueId('piece'),
            type: 'rich_text',
            enabled: true,
            text: 'All prices are quoted in **@currency** and remain subject to prior sale until firm Purchase Order receipt.',
            style: { fontSize: 'xs', textColor: 'muted' }
          }
        ]
      };
    case 'clone_remittance':
      return {
        id,
        type: 'custom',
        title: 'Bank Remittance Instructions (Custom)',
        enabled: true,
        is_visible: true,
        zone: 'post_table',
        placement: 'left',
        style: 'framed',
        borderStyleOverride: 'inherit',
        allowPageSplit: false,
        pieces: [
          {
            id: makeUniqueId('piece'),
            type: 'heading',
            enabled: true,
            text: 'BANK REMITTANCE INSTRUCTIONS',
            showAccentBar: true,
            style: { fontSize: 'xs', fontWeight: 'bold', letterSpacing: 'uppercase_tracked', textColor: 'accent' }
          },
          {
            id: makeUniqueId('piece'),
            type: 'field_rows',
            enabled: true,
            gridColumns: 1,
            fieldRows: [
              { id: makeUniqueId('frow'), enabled: true, label: 'Bank Name:', value: '@bank_name' },
              { id: makeUniqueId('frow'), enabled: true, label: 'Beneficiary:', value: '@beneficiary' },
              { id: makeUniqueId('frow'), enabled: true, label: 'Account No:', value: '@account_number' },
              { id: makeUniqueId('frow'), enabled: true, label: 'IBAN:', value: '@iban' },
              { id: makeUniqueId('frow'), enabled: true, label: 'SWIFT / BIC:', value: '@swift' },
              { id: makeUniqueId('frow'), enabled: true, label: 'Branch:', value: '@branch' }
            ]
          },
          {
            id: makeUniqueId('piece'),
            type: 'rich_text',
            enabled: true,
            text: 'Please quote reference **@quote_ref** on all wire transfers.',
            style: { fontSize: 'xs', italic: true, textColor: 'muted' }
          }
        ]
      };
    case 'clone_totals':
      return {
        id,
        type: 'custom',
        title: 'Financial Summary (Custom)',
        enabled: true,
        is_visible: true,
        zone: 'post_table',
        placement: 'right',
        style: 'framed',
        borderStyleOverride: 'inherit',
        allowPageSplit: false,
        pieces: [
          {
            id: makeUniqueId('piece'),
            type: 'heading',
            enabled: true,
            text: 'FINANCIAL SUMMARY',
            showAccentBar: true,
            style: { fontSize: 'xs', fontWeight: 'bold', letterSpacing: 'uppercase_tracked', textColor: 'accent' }
          },
          {
            id: makeUniqueId('piece'),
            type: 'money_summary',
            enabled: true,
            moneyRows: [
              { id: makeUniqueId('mrow'), enabled: true, label: 'Net Items Subtotal', value: '@subtotal' },
              { id: makeUniqueId('mrow'), enabled: true, label: 'Freight & Handling', value: '@freight' },
              { id: makeUniqueId('mrow'), enabled: true, label: 'VAT (@tax_rate)', value: '@tax_amount' },
              { id: makeUniqueId('mrow'), enabled: true, label: 'Grand Total Payable', value: '@grand_total', isGrandTotal: true }
            ]
          },
          {
            id: makeUniqueId('piece'),
            type: 'rich_text',
            enabled: true,
            text: '**Amount in Words:** @amount_in_words',
            style: { fontSize: 'xs', highlightBg: 'ThemeTint' }
          }
        ]
      };
    case 'clone_acceptance':
      return {
        id,
        type: 'custom',
        title: 'Customer Acceptance (Custom)',
        enabled: true,
        is_visible: true,
        zone: 'post_table',
        placement: 'left',
        style: 'framed',
        borderStyleOverride: 'inherit',
        allowPageSplit: false,
        pieces: [
          {
            id: makeUniqueId('piece'),
            type: 'heading',
            enabled: true,
            text: 'CUSTOMER ACCEPTANCE & SIGN-BACK',
            showAccentBar: true,
            style: { fontSize: 'xs', fontWeight: 'bold', letterSpacing: 'uppercase_tracked', textColor: 'accent' }
          },
          {
            id: makeUniqueId('piece'),
            type: 'rich_text',
            enabled: true,
            text: 'We hereby confirm acceptance of Quotation **@quote_ref** totaling **@grand_total** in accordance with the stated commercial terms.',
            style: { fontSize: 'xs' }
          },
          {
            id: makeUniqueId('piece'),
            type: 'signature_box',
            enabled: true,
            signerLabel: 'For & On Behalf of @client_company',
            signerName: '@contact_person',
            signerTitle: 'Authorized Client Representative',
            showDateLine: true,
            showStampPlaceholder: true
          }
        ]
      };
    case 'clone_signatory':
    default:
      return {
        id,
        type: 'custom',
        title: 'Authorized Signatory & Seal (Custom)',
        enabled: true,
        is_visible: true,
        zone: 'post_table',
        placement: 'right',
        style: 'framed',
        borderStyleOverride: 'inherit',
        allowPageSplit: false,
        pieces: [
          {
            id: makeUniqueId('piece'),
            type: 'heading',
            enabled: true,
            text: 'FOR @company_name',
            showAccentBar: true,
            style: { fontSize: 'xs', fontWeight: 'bold', letterSpacing: 'uppercase_tracked', textColor: 'accent' }
          },
          {
            id: makeUniqueId('piece'),
            type: 'signature_box',
            enabled: true,
            signerLabel: 'Authorized Commercial Signatory',
            signerName: '@signatory_name',
            signerTitle: '@signatory_title',
            showDateLine: true,
            showStampPlaceholder: true
          }
        ]
      };
  }
};

const QuotationStudioModalInner: React.FC<QuotationStudioModalProps> = ({
  isOpen,
  onClose,
  enquiry,
  salespersonName,
  activeWorkspaceId,
  activeWorkspace,
  user,
  profile,
  editingQuotation,
  isSandboxMode = false,
  initialPresetId,
  onProfileAndPresetSaved,
  onQuotationCreated,
  onEnquirySync,
  products: propProducts,
  setProducts: propSetProducts,
  triggerToast
}) => {
  const isEffectiveSandbox =
    Boolean(isSandboxMode) || editingQuotation?.id === 'sandbox_preview_quotation';

  // Presets and loading states
  const [presets, setPresets] = useState<QuotationPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>(initialPresetId || '');
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Active Quotation Revision & Lifecycle Status State
  const [activeSourceQuotation, setActiveSourceQuotation] = useState<Quotation | null>(
    () => editingQuotation || null
  );
  const [enquiryRevisions, setEnquiryRevisions] = useState<Quotation[]>([]);
  const [activeQuotationId, setActiveQuotationId] = useState<string>(
    () => editingQuotation?.id || ''
  );
  const [parentQuotationId, setParentQuotationId] = useState<string | undefined>(
    () => editingQuotation?.parent_quotation_id || editingQuotation?.parent_quote_id
  );
  const [revisionNumber, setRevisionNumber] = useState<number>(
    () => editingQuotation?.revision_number ?? 1
  );
  const [formattedQuoteRefOverride, setFormattedQuoteRefOverride] = useState<string>(
    () => editingQuotation?.formatted_quote_ref || ''
  );
  const [quotationStatus, setQuotationStatus] = useState<Quotation['status']>(
    () => editingQuotation?.status || 'Draft'
  );

  // Column visibility & technical attributes toggles
  const [visibleColumns, setVisibleColumns] = useState<QuotationPresetColumns>(() => ({
    brand: true,
    model: true,
    origin: true,
    availability: true,
    unit_price: true,
    showUnitPrice: true,
    showUom: true,
    showLineTotal: true,
    showItemAttributes: true,
    attributeDisplayFormat: 'pills',
    hiddenAttributeKeys: [],
    showLineItemImages: false,
    lineItemImageLayout: 'inline',
    lineItemImageSize: 'md',
    ...(profile?.visible_columns || {}),
    ...((editingQuotation as any)?.visible_columns || {})
  }));

  // Financial & Tax adjustments
  const [freightAmount, setFreightAmount] = useState<number>(
    editingQuotation?.freight_amount ?? 0
  );
  const [taxMode, setTaxMode] = useState<QuotationTaxMode>(
    editingQuotation?.tax_mode ?? 'taxes_extra'
  );
  const [taxRatePercent, setTaxRatePercent] = useState<number>(
    editingQuotation?.tax_rate_percent ?? 5
  );

  // Executive Styling & Layout Controls
  const [headerLayout, setHeaderLayout] = useState<QuotationHeaderLayout>(
    editingQuotation?.header_layout || profile?.header_layout || 'split'
  );
  const [tableDensity, setTableDensity] = useState<QuotationTableDensity>(
    editingQuotation?.table_density || profile?.table_density || 'comfortable'
  );
  const [tableFontScale, setTableFontScale] = useState<QuotationTableFontScale>(
    editingQuotation?.table_font_scale || profile?.table_font_scale || (editingQuotation?.table_density === 'compact' ? 'compact' : 'standard')
  );
  const [fontSizeScale, setFontSizeScale] = useState<QuotationFontSizeScale>(() => {
    if (editingQuotation?.fontSizeScale) return editingQuotation.fontSizeScale;
    if ((editingQuotation as any)?.font_size_scale) return (editingQuotation as any).font_size_scale;
    if (profile?.fontSizeScale) return profile.fontSizeScale;
    if ((profile as any)?.font_size_scale) return (profile as any).font_size_scale;
    return editingQuotation?.table_font_scale === 'compact' ? 'compact' : editingQuotation?.table_font_scale === 'prominent' ? 'comfortable' : 'standard';
  });
  const [showBankDetails, setShowBankDetails] = useState<boolean>(
    editingQuotation?.show_bank_details ?? profile?.show_bank_details ?? true
  );
  const [showCommercialTerms, setShowCommercialTerms] = useState<boolean>(
    editingQuotation?.show_commercial_terms ?? profile?.show_commercial_terms ?? true
  );
  const [showCompanySeal, setShowCompanySeal] = useState<boolean>(
    editingQuotation?.show_company_seal ?? profile?.show_company_seal ?? true
  );

  const [themeAccent, setThemeAccent] = useState<QuotationThemeAccent>(
    editingQuotation?.theme_accent || profile?.theme_accent || 'navy'
  );
  const [customThemeColor, setCustomThemeColor] = useState<string>(
    editingQuotation?.customThemeColor ||
      profile?.customThemeColor ||
      profile?.accent_color ||
      ''
  );
  const [newCustomFooterPill, setNewCustomFooterPill] = useState<string>('');
  const [logoPosition, setLogoPosition] = useState<QuotationLogoPosition>(
    editingQuotation?.logo_position || profile?.logo_position || 'left'
  );
  const [amountInWordsEnabled, setAmountInWordsEnabled] = useState<boolean>(
    editingQuotation?.amount_in_words_enabled ?? profile?.amount_in_words_enabled ?? true
  );
  const [customerAcceptanceEnabled, setCustomerAcceptanceEnabled] = useState<boolean>(
    editingQuotation?.customer_acceptance_enabled ?? profile?.customer_acceptance_enabled ?? true
  );
  const [signatureStyle, setSignatureStyle] = useState<QuotationSignatureStyle>(
    editingQuotation?.signature_style || profile?.signature_style || 'script'
  );
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string>(
    () =>
      editingQuotation?.header_config?.logoUrl ||
      editingQuotation?.company_logo_url ||
      profile?.logo_url ||
      ''
  );
  const [companySealUrl, setCompanySealUrl] = useState<string>(
    () =>
      editingQuotation?.company_seal_url ||
      editingQuotation?.footer_config?.companySealUrl ||
      (editingQuotation as any)?.companySettings?.company_seal_url ||
      profile?.company_seal_url ||
      profile?.stamp_seal_url ||
      ''
  );
  const [signatureImageUrl, setSignatureImageUrl] = useState<string>(
    () =>
      editingQuotation?.signature_image_url ||
      editingQuotation?.footer_config?.signatureImageUrl ||
      editingQuotation?.signatories?.[0]?.signature_url ||
      profile?.signature_image_url ||
      ''
  );
  const logoFileInputRef = useRef<HTMLInputElement | null>(null);
  const sealFileInputRef = useRef<HTMLInputElement | null>(null);
  const signatureFileInputRef = useRef<HTMLInputElement | null>(null);

  const handleUploadCompanyLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const uploaded = await uploadWorkspaceMediaAsset(file, 'branding/logos', activeWorkspace, {
        maxWidth: 600,
        maxHeight: 400,
        quality: 0.85,
        preserveTransparency: true
      });
      if (uploaded.url) {
        setCompanyLogoUrl(uploaded.url);
        setHeaderConfig((prev) => ({
          ...prev,
          logoUrl: uploaded.url,
          showLogo: true,
          logoDisplayMode:
            prev.logoDisplayMode === 'no_logo' ? 'logo_and_name' : prev.logoDisplayMode || 'logo_and_name'
        }));
      }
    } catch (err) {
      console.warn('[QuotationStudioModal] Logo upload fallback:', err);
    }
  };

  const handleUploadCompanySeal = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const uploaded = await uploadWorkspaceMediaAsset(file, 'branding/stamps', activeWorkspace, {
        maxWidth: 600,
        maxHeight: 400,
        quality: 0.85,
        preserveTransparency: true
      });
      if (uploaded.url) {
        setCompanySealUrl(uploaded.url);
        setShowCompanySeal(true);
        setFooterConfig((prev) => ({
          ...prev,
          companySealUrl: uploaded.url
        }));
      }
    } catch (err) {
      console.warn('[QuotationStudioModal] Seal upload fallback:', err);
    }
  };

  const handleUploadSignatureImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const uploaded = await uploadWorkspaceMediaAsset(file, 'branding/signatures', activeWorkspace, {
        maxWidth: 600,
        maxHeight: 400,
        quality: 0.85,
        preserveTransparency: true
      });
      if (uploaded.url) {
        setSignatureImageUrl(uploaded.url);
        setSignatureStyle('image');
        setFooterConfig((prev) => ({
          ...prev,
          signatureImageUrl: uploaded.url
        }));
      }
    } catch (err) {
      console.warn('[QuotationStudioModal] Signature upload fallback:', err);
    }
  };
  const [blockStyle, setBlockStyle] = useState<'framed' | 'minimal'>(
    editingQuotation?.block_style ||
      (editingQuotation as any)?.presentation_preset?.block_style ||
      profile?.block_style ||
      'framed'
  );
  const [globalCardRadius, setGlobalCardRadius] = useState<'rounded' | 'sharp'>(
    editingQuotation?.globalCardRadius ||
    profile?.globalCardRadius ||
    editingQuotation?.recipient_config?.globalCardRadius ||
    'rounded'
  );
  const [cardsOrder, setCardsOrder] = useState<'recipient_first' | 'offer_first'>(
    editingQuotation?.cardsOrder ||
    profile?.cardsOrder ||
    editingQuotation?.recipient_config?.cardsOrder ||
    'recipient_first'
  );
  const [subjectPlacement, setSubjectPlacement] = useState<'above_cards' | 'below_cards'>(
    editingQuotation?.subjectPlacement ||
    profile?.subjectPlacement ||
    editingQuotation?.recipient_config?.subjectPlacement ||
    'below_cards'
  );
  const [headerConfig, setHeaderConfig] = useState<QuotationHeaderConfig>(() => ({
    ...DEFAULT_HEADER_CONFIG,
    ...(profile?.header_config || {}),
    ...(editingQuotation?.header_config || {})
  }));
  const [recipientConfig, setRecipientConfig] = useState<QuotationRecipientConfig>(() => ({
    ...DEFAULT_RECIPIENT_CONFIG,
    globalCardRadius: editingQuotation?.globalCardRadius || profile?.globalCardRadius || 'rounded',
    cardsOrder: editingQuotation?.cardsOrder || profile?.cardsOrder || 'recipient_first',
    subjectPlacement: editingQuotation?.subjectPlacement || profile?.subjectPlacement || 'below_cards',
    ...(profile?.recipient_config || {}),
    ...(editingQuotation?.recipient_config || {})
  }));
  const [footerConfig, setFooterConfig] = useState<QuotationFooterConfig>(() => ({
    ...DEFAULT_FOOTER_CONFIG,
    ...(profile?.footer_config || {}),
    ...(editingQuotation?.footer_config || {})
  }));
  const [pageMode, setPageMode] = useState<QuotationPageMode>(() => {
    return (
      editingQuotation?.pageMode ||
      editingQuotation?.footer_config?.pageMode ||
      profile?.pageMode ||
      profile?.footer_config?.pageMode ||
      'auto'
    );
  });
  const [layoutBlocks, setLayoutBlocks] = useState<QuotationBlockConfig[]>(() => {
    let raw = DEFAULT_QUOTATION_BLOCKS;
    if (editingQuotation?.layout_blocks && editingQuotation.layout_blocks.length > 0) {
      raw = editingQuotation.layout_blocks;
    } else if ((editingQuotation as any)?.presentation_preset?.layout_blocks && (editingQuotation as any).presentation_preset.layout_blocks.length > 0) {
      raw = (editingQuotation as any).presentation_preset.layout_blocks;
    }
    return raw.map((b) => ({
      ...b,
      enabled: b.enabled ?? b.is_visible ?? true,
      is_visible: b.is_visible ?? b.enabled ?? true,
      fontScale: b.fontScale || 'standard',
      padding: b.padding || 'standard'
    }));
  });

  const [activeLeftTab, setActiveLeftTab] = useState<'structure' | 'content'>('structure');
  const [isLeftDrawerOpen, setIsLeftDrawerOpen] = useState<boolean>(true);
  const pieceInputRefs = useRef<Record<string, HTMLInputElement | HTMLTextAreaElement | null>>({});
  const activeListItemIndexRef = useRef<Record<string, number>>({});
  const [showPageBreakGuides, setShowPageBreakGuides] = useState<boolean>(true);
  const [omittedFields, setOmittedFields] = useState<Record<string, boolean>>(() =>
    editingQuotation?.omitted_fields ? { ...editingQuotation.omitted_fields } : {}
  );
  const [isIncludeOmitOpen, setIsIncludeOmitOpen] = useState<boolean>(true);
  const [copiedTagKey, setCopiedTagKey] = useState<string | null>(null);
  const [pendingPrintWarnings, setPendingPrintWarnings] = useState<
    Array<{ token: string; location: string }> | null
  >(null);

  const handleToggleBlockEnabled = (id: QuotationBlockId, enabled: boolean) => {
    setLayoutBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, enabled, is_visible: enabled } : b))
    );
    if (id === 'terms') setShowCommercialTerms(enabled);
    if (id === 'remittance') {
      setShowBankDetails(enabled);
      setFooterConfig((prev) => ({ ...prev, showBankRemittance: enabled }));
    }
    if (id === 'signatory') {
      // Decoupled from showCompanySeal: toggling signatory block visibility never overwrites showCompanySeal
      setFooterConfig((prev) => ({ ...prev, showSignatories: enabled }));
    }
    if (id === 'acceptance') {
      setCustomerAcceptanceEnabled(enabled);
      setFooterConfig((prev) => ({ ...prev, showCustomerAcceptance: enabled }));
    }
  };

  const handleSetBlockPlacement = (id: QuotationBlockId, placement: 'left' | 'right' | 'full') => {
    setLayoutBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, placement } : b))
    );
  };

  const handleSetBlockStyle = (id: QuotationBlockId, style: 'framed' | 'minimal') => {
    setLayoutBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, style } : b))
    );
  };

  const handleSetBlockFontScale = (id: QuotationBlockId, fontScale: 'compact' | 'standard' | 'prominent') => {
    setLayoutBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, fontScale } : b))
    );
  };

  const handleSetBlockPadding = (id: QuotationBlockId, padding: 'compact' | 'standard') => {
    setLayoutBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, padding } : b))
    );
  };

  const handleMoveBlock = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= layoutBlocks.length) return;
    setLayoutBlocks((prev) => {
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  };

  const handleAddPageBreak = (insertBeforeBlockId?: string | React.MouseEvent) => {
    const newId = `break_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newBlock: QuotationBlockConfig = {
      id: newId,
      type: 'page_break',
      title: 'Page Break',
      is_visible: true,
      enabled: true,
      placement: 'full',
      style: 'minimal',
      show_continuation_header: true
    };
    const targetId = typeof insertBeforeBlockId === 'string' ? insertBeforeBlockId : undefined;
    setLayoutBlocks((prev) => {
      if (targetId) {
        const idx = prev.findIndex((b) => b.id === targetId);
        if (idx !== -1) {
          const next = [...prev];
          next.splice(idx, 0, newBlock);
          return next;
        }
      }
      return [...prev, newBlock];
    });
    setSelectedSection(newId);
  };

  const handleAddSpacer = (insertBeforeBlockId?: string | React.MouseEvent) => {
    const newId = `spacer_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newBlock: QuotationBlockConfig = {
      id: newId,
      type: 'spacer',
      title: 'Spacer',
      spacer_height_mm: 20,
      spacer_fill_remaining: false,
      is_visible: true,
      enabled: true,
      placement: 'full',
      style: 'minimal'
    };
    const targetId = typeof insertBeforeBlockId === 'string' ? insertBeforeBlockId : undefined;
    setLayoutBlocks((prev) => {
      if (targetId) {
        const idx = prev.findIndex((b) => b.id === targetId);
        if (idx !== -1) {
          const next = [...prev];
          next.splice(idx, 0, newBlock);
          return next;
        }
      }
      return [...prev, newBlock];
    });
    setSelectedSection(newId);
  };

  const handleDeleteBlock = (id: QuotationBlockId) => {
    setLayoutBlocks((prev) => prev.filter((b) => b.id !== id));
    if (selectedSection === id) {
      setSelectedSection(null);
    }
  };

  const handleUpdateBlockConfig = (id: QuotationBlockId, patch: Partial<QuotationBlockConfig>) => {
    setLayoutBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, ...patch } : b))
    );
  };

  // Universal Custom Block Engine & "My Saved Blocks" Library State
  const [showAddBlockPicker, setShowAddBlockPicker] = useState<boolean>(false);
  const [addBlockPickerTab, setAddBlockPickerTab] = useState<'layouts' | 'clones' | 'saved'>('layouts');
  const [newBlockTargetZone, setNewBlockTargetZone] = useState<'pre_table' | 'post_table'>('post_table');
  const [savedCustomBlocks, setSavedCustomBlocks] = useState<SavedCustomBlockTemplate[]>(() => {
    const fromProfile = profile?.saved_custom_blocks || [];
    try {
      const rawLocal = localStorage.getItem('crm_saved_custom_blocks_v1');
      if (rawLocal) {
        const parsed = JSON.parse(rawLocal);
        if (Array.isArray(parsed)) {
          const mergedMap = new Map<string, SavedCustomBlockTemplate>();
          [...fromProfile, ...parsed].forEach((item) => {
            if (item && item.id) mergedMap.set(item.id, item);
          });
          return Array.from(mergedMap.values());
        }
      }
    } catch {
      // ignore storage errors
    }
    return fromProfile;
  });
  const [saveToLibraryBlockId, setSaveToLibraryBlockId] = useState<string | null>(null);
  const [saveLibraryTitle, setSaveLibraryTitle] = useState<string>('');
  const [saveLibraryVisibility, setSaveLibraryVisibility] = useState<'private' | 'workspace'>('workspace');

  const handleInsertCustomBlockFromPreset = (
    presetKey: string,
    zoneOverride?: 'pre_table' | 'post_table'
  ) => {
    const targetZone = zoneOverride || newBlockTargetZone;
    const newBlock = createCustomBlockFromPreset(presetKey, targetZone);
    setLayoutBlocks((prev) => [...prev, newBlock]);
    setSelectedSection(newBlock.id);
    setShowAddBlockPicker(false);
    triggerToast?.(`Added "${newBlock.title}" (${targetZone === 'pre_table' ? 'Above Table' : 'Below Table'})`, 'success');
  };

  const handleInsertSavedCustomBlock = (
    template: SavedCustomBlockTemplate,
    zoneOverride?: 'pre_table' | 'post_table'
  ) => {
    const rawConfig =
      template.blockConfig ||
      template.block_config ||
      createCustomBlockFromPreset('blank_rich_text');
    const cloned = deepCloneCustomBlock(rawConfig, template.name);
    if (zoneOverride) {
      cloned.zone = zoneOverride;
    }
    setLayoutBlocks((prev) => [...prev, cloned]);
    setSelectedSection(cloned.id);
    setShowAddBlockPicker(false);
    triggerToast?.(`Inserted copy of "${template.name}" into quotation`, 'success');
  };

  const handleConvertLegacyBlockToCustom = (legacyBlock: QuotationBlockConfig) => {
    const cloneMap: Record<string, string> = {
      terms: 'clone_terms',
      remittance: 'clone_remittance',
      totals: 'clone_totals',
      acceptance: 'clone_acceptance',
      signatory: 'clone_signatory',
      signatories: 'clone_signatory'
    };
    const presetKey = cloneMap[legacyBlock.id] || 'blank_rich_text';
    const customClone = createCustomBlockFromPreset(presetKey, legacyBlock.zone || 'post_table');
    customClone.placement = legacyBlock.placement || customClone.placement;
    customClone.style = legacyBlock.style || customClone.style;
    customClone.fontScale = legacyBlock.fontScale || 'standard';
    customClone.padding = legacyBlock.padding || 'standard';

    setLayoutBlocks((prev) => {
      const idx = prev.findIndex((b) => b.id === legacyBlock.id);
      const next = prev.map((b) =>
        b.id === legacyBlock.id ? { ...b, enabled: false, is_visible: false } : b
      );
      if (idx !== -1) {
        next.splice(idx + 1, 0, customClone);
      } else {
        next.push(customClone);
      }
      return next;
    });
    if (legacyBlock.id === 'terms') setShowCommercialTerms(false);
    if (legacyBlock.id === 'remittance') setShowBankDetails(false);
    if (legacyBlock.id === 'acceptance') setCustomerAcceptanceEnabled(false);
    setSelectedSection(customClone.id);
    triggerToast?.(
      `Converted "${getBlockMeta(legacyBlock).label}" into an editable Custom Block (original hidden)`,
      'success'
    );
  };

  const persistSavedCustomBlocksList = async (nextList: SavedCustomBlockTemplate[]) => {
    setSavedCustomBlocks(nextList);
    try {
      localStorage.setItem('crm_saved_custom_blocks_v1', JSON.stringify(nextList));
    } catch {
      // ignore
    }
    const baseProf = workspaceProfile || profile;
    if (baseProf && activeWorkspaceId) {
      try {
        const savedProf = await QuotationRepository.saveWorkspaceDocumentProfile({
          ...baseProf,
          workspace_id: activeWorkspaceId,
          saved_custom_blocks: nextList,
          updated_at: new Date().toISOString()
        });
        setWorkspaceProfile(savedProf);
      } catch (err) {
        console.warn('[QuotationStudioModal] Could not persist saved_custom_blocks to profile:', err);
      }
    }
  };

  const handleSaveBlockToLibrary = async (block: QuotationBlockConfig) => {
    const cleanName = (saveLibraryTitle || block.title || 'Saved Custom Block').trim();
    const clonedConfig = deepCloneCustomBlock(block, cleanName);
    const uid = user?.id || user?.email || 'current_user';
    const uname = user?.displayName || user?.name || user?.email || 'User';
    const nowIso = new Date().toISOString();
    const newTemplate: SavedCustomBlockTemplate = {
      id: makeUniqueId('saved_blk'),
      name: cleanName,
      description: `${(block.pieces || []).length} piece${(block.pieces || []).length === 1 ? '' : 's'} • ${
        block.zone === 'pre_table' ? 'Above Table' : 'Below Table'
      }`,
      category: 'custom',
      visibility: saveLibraryVisibility,
      created_by_user_id: uid,
      createdByUserId: uid,
      created_by_name: uname,
      createdByName: uname,
      created_at: nowIso,
      createdAt: nowIso,
      block_config: clonedConfig,
      blockConfig: clonedConfig
    };
    const nextList = [newTemplate, ...savedCustomBlocks];
    await persistSavedCustomBlocksList(nextList);
    setSaveToLibraryBlockId(null);
    setSaveLibraryTitle('');
    triggerToast?.(
      `Saved "${cleanName}" to My Blocks (${
        saveLibraryVisibility === 'workspace' ? 'Shared with Workspace' : 'Private'
      })`,
      'success'
    );
  };

  const handleDeleteSavedBlockTemplate = async (templateId: string) => {
    const nextList = savedCustomBlocks.filter((t) => t.id !== templateId);
    await persistSavedCustomBlocksList(nextList);
    triggerToast?.('Removed block template from My Saved Blocks', 'info');
  };

  const handleAddPieceToBlock = (blockId: string, pieceType: QuotationBlockPieceType) => {
    const newPiece = createDefaultPiece(pieceType);
    setLayoutBlocks((prev) =>
      prev.map((b) =>
        b.id === blockId ? { ...b, pieces: [...(b.pieces || []), newPiece] } : b
      )
    );
  };

  const handleUpdatePieceInBlock = (
    blockId: string,
    pieceId: string,
    updater: (piece: QuotationBlockPiece) => QuotationBlockPiece
  ) => {
    setLayoutBlocks((prev) =>
      prev.map((b) => {
        if (b.id !== blockId) return b;
        return {
          ...b,
          pieces: (b.pieces || []).map((p) => (p.id === pieceId ? updater(p) : p))
        };
      })
    );
  };

  const handleMovePieceInBlock = (blockId: string, index: number, direction: 'up' | 'down') => {
    setLayoutBlocks((prev) =>
      prev.map((b) => {
        if (b.id !== blockId) return b;
        const list = [...(b.pieces || [])];
        const targetIdx = direction === 'up' ? index - 1 : index + 1;
        if (targetIdx < 0 || targetIdx >= list.length) return b;
        const [moved] = list.splice(index, 1);
        list.splice(targetIdx, 0, moved);
        return { ...b, pieces: list };
      })
    );
  };

  const handleDuplicatePieceInBlock = (blockId: string, index: number) => {
    setLayoutBlocks((prev) =>
      prev.map((b) => {
        if (b.id !== blockId) return b;
        const list = [...(b.pieces || [])];
        const source = list[index];
        if (!source) return b;
        const clone = deepClonePiece(source);
        list.splice(index + 1, 0, clone);
        return { ...b, pieces: list };
      })
    );
  };

  const handleDeletePieceFromBlock = (blockId: string, pieceId: string) => {
    setLayoutBlocks((prev) =>
      prev.map((b) =>
        b.id === blockId
          ? { ...b, pieces: (b.pieces || []).filter((p) => p.id !== pieceId) }
          : b
      )
    );
  };

  const handleUploadCustomPieceImage = async (
    blockId: string,
    pieceId: string,
    file?: File
  ) => {
    if (!file) return;
    try {
      const uploaded = await uploadWorkspaceMediaAsset(file, 'branding/custom_blocks', activeWorkspace, {
        maxWidth: 900,
        maxHeight: 600,
        quality: 0.85,
        preserveTransparency: true
      });
      if (uploaded.url) {
        handleUpdatePieceInBlock(blockId, pieceId, (p) => ({
          ...p,
          imageUrl: uploaded.url
        }));
      }
    } catch (err) {
      console.warn('[QuotationStudioModal] Custom piece image upload failed:', err);
    }
  };

  const handleSetGlobalBlockStyle = (style: 'framed' | 'minimal') => {
    setBlockStyle(style);
    setRecipientConfig((prev) => ({
      ...prev,
      style,
      recipientCardStyle: style,
      offerCardStyle: style
    }));
    setLayoutBlocks((prev) =>
      prev.map((b) => {
        const bType =
          b.type ||
          (b.id?.startsWith('break_')
            ? 'page_break'
            : b.id?.startsWith('spacer_')
            ? 'spacer'
            : b.id);
        if (bType === 'page_break' || bType === 'spacer') return b;
        return { ...b, style };
      })
    );
  };

  const handleSetGlobalCardRadius = (radius: 'rounded' | 'sharp') => {
    setGlobalCardRadius(radius);
    setRecipientConfig((prev) => ({
      ...prev,
      globalCardRadius: radius,
      recipientCardRadius: radius,
      offerCardRadius: radius
    }));
  };

  const handleSetFontSizeScale = (scale: QuotationFontSizeScale) => {
    setFontSizeScale(scale);
    setTableFontScale(scale === 'compact' ? 'compact' : scale === 'large' ? 'prominent' : 'standard');
    setFooterConfig((prev) => ({ ...prev, fontSizeScale: scale }));
  };

  // Canonical Block Visibility Delegators (Single Source of Truth)
  const handleToggleBankRemittance = (enabled: boolean) => {
    handleToggleBlockEnabled('remittance', enabled);
  };

  const handleToggleCustomerAcceptance = (enabled: boolean) => {
    handleToggleBlockEnabled('acceptance', enabled);
  };

  const handleToggleSignatories = (enabled: boolean) => {
    handleToggleBlockEnabled('signatory', enabled);
  };

  // Retractable Right-Side Contextual Block & Section Inspector selection
  const [selectedSection, setSelectedSection] = useState<StudioSelectedSection>(null);
  const [inspectorSubTarget, setInspectorSubTarget] = useState<string | null>(null);
  const [highlightedInspectorTarget, setHighlightedInspectorTarget] = useState<string | null>(null);

  useEffect(() => {
    if (!inspectorSubTarget) return;
    const parts = inspectorSubTarget.split('::');
    const targetKey = parts[0];
    if (!targetKey) return;

    setHighlightedInspectorTarget(targetKey);
    const scrollTimer = window.setTimeout(() => {
      const el = document.getElementById(`inspector-target-${targetKey}`);
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 60);

    const clearTimer = window.setTimeout(() => {
      setHighlightedInspectorTarget((prev) => (prev === targetKey ? null : prev));
    }, 2200);

    return () => {
      window.clearTimeout(scrollTimer);
      window.clearTimeout(clearTimer);
    };
  }, [inspectorSubTarget, selectedSection]);

  const handleCanvasSelectSection = (section: StudioSelectedSection, subTarget?: string) => {
    setSelectedSection(section);
    if (subTarget) {
      setInspectorSubTarget(`${subTarget}::${Date.now()}`);
    } else {
      setInspectorSubTarget(null);
    }
  };

  const selectedBlockId =
    selectedSection &&
    selectedSection !== 'items_table' &&
    selectedSection !== 'header' &&
    selectedSection !== 'recipient_meta' &&
    selectedSection !== 'recipient_info' &&
    selectedSection !== 'quote_meta' &&
    selectedSection !== 'subject' &&
    selectedSection !== 'footer' &&
    selectedSection !== 'signatories' &&
    selectedSection !== 'style'
      ? selectedSection
      : null;
  const selectedBlock = useMemo(() => {
    if (!selectedBlockId) return null;
    const found = layoutBlocks.find((b) => b.id === selectedBlockId);
    if (!found) return null;
    return found;
  }, [layoutBlocks, selectedBlockId]);

  const handleInspectBlock = (id: QuotationBlockId) => {
    if (selectedSection === id) {
      setSelectedSection(null);
    } else {
      setSelectedSection(id);
    }
  };

  const handleInspectSection = (section: StudioSelectedSection) => {
    if (selectedSection === section) {
      setSelectedSection(null);
    } else if (
      section === 'items_table' ||
      section === 'header' ||
      section === 'recipient_meta' ||
      section === 'recipient_info' ||
      section === 'quote_meta' ||
      section === 'subject' ||
      section === 'footer'
    ) {
      setSelectedSection(section);
    } else if (section) {
      handleInspectBlock(section as QuotationBlockId);
    } else {
      setSelectedSection(null);
    }
  };

  // Template Preset Saving Modal
  const [isSavePresetModalOpen, setIsSavePresetModalOpen] = useState<boolean>(false);
  const [newPresetName, setNewPresetName] = useState<string>('');
  const [isSavingPreset, setIsSavingPreset] = useState<boolean>(false);

  // Commercial terms
  const [priceBasis, setPriceBasis] = useState<string>(() => {
    if (editingQuotation?.price_basis != null) return editingQuotation.price_basis;
    return 'Ex-Works / Delivered Site';
  });
  const [paymentTerms, setPaymentTerms] = useState<string>(() => {
    if (editingQuotation?.payment_terms != null) return editingQuotation.payment_terms;
    return '100% Advance against PI / Approved Credit';
  });
  const [validityDays, setValidityDays] = useState<number>(30);
  const [customNotes, setCustomNotes] = useState<string>(() => {
    if (editingQuotation?.custom_notes != null) return editingQuotation.custom_notes;
    return editingQuotation?.applied_terms ?? '';
  });

  // Per-item visible attributes mapping: itemId -> string[]
  const [itemVisibleAttributes, setItemVisibleAttributes] = useState<Record<string, string[]>>(() => {
    const initialMap: Record<string, string[]> = {};
    if (editingQuotation?.line_items) {
      editingQuotation.line_items.forEach((item, idx) => {
        const key = item.id || `item_${idx}`;
        if (item.visible_attributes) {
          initialMap[key] = item.visible_attributes;
        }
      });
    }
    return initialMap;
  });

  // Per-item row page break mapping: itemId -> boolean
  const [itemPageBreaks, setItemPageBreaks] = useState<Record<string, boolean>>(() => {
    const initialMap: Record<string, boolean> = {};
    const sourceItems = editingQuotation?.line_items || enquiry?.line_items || [];
    sourceItems.forEach((item: any, idx: number) => {
      const key = item.id || `item_${idx}`;
      if (typeof item.page_break_after === 'boolean') {
        initialMap[key] = item.page_break_after;
      }
    });
    return initialMap;
  });

  // Auto-paginate long tables & BOM sets across A4 sheets
  const [autoPaginateItems, setAutoPaginateItems] = useState<boolean>(() =>
    Boolean(editingQuotation?.auto_paginate_items)
  );
  // Expanded state for custom row notes in the right inspector
  const [expandedInspectorRowNotes, setExpandedInspectorRowNotes] = useState<Record<string, boolean>>({});

  // Per-item product image URL override mapping: itemId -> string
  const [itemImageOverrides, setItemImageOverrides] = useState<Record<string, string>>({});
  // Per-item technical datasheet inclusion toggle mapping: itemId -> boolean
  const [itemDatasheetToggles, setItemDatasheetToggles] = useState<Record<string, boolean>>({});
  // Per-item optional toggle override mapping: itemId -> boolean
  const [itemOptionalOverrides, setItemOptionalOverrides] = useState<Record<string, boolean>>({});
  // Per-item newly linked product ID mapping: itemId -> string
  const [itemLinkedProductIds, setItemLinkedProductIds] = useState<Record<string, string>>({});
  // Save to Catalog modal state
  const [catalogModalTarget, setCatalogModalTarget] = useState<{ itemKey: string; item: QuotationLineItem } | null>(null);
  // Workspace catalog products for automatic image/datasheet/stock lookup
  const [workspaceProducts, setWorkspaceProducts] = useState<Product[]>(() => propProducts || []);

  useEffect(() => {
    if (propProducts && propProducts.length > 0) {
      setWorkspaceProducts(propProducts.filter((p) => !p.is_deleted));
      return;
    }
    let isMounted = true;
    if (!activeWorkspaceId) return;
    getDocs(query(collection(db, 'products'), where('workspace_id', '==', activeWorkspaceId)))
      .then((snap) => {
        if (!isMounted) return;
        const loaded: Product[] = [];
        snap.forEach((docSnap) => {
          const data = docSnap.data() as Product;
          if (!data.is_deleted) {
            loaded.push({ ...data, id: docSnap.id });
          }
        });
        if (loaded.length > 0) {
          setWorkspaceProducts(loaded);
        }
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, [activeWorkspaceId, propProducts]);

  const handleUploadLineItemImage = async (itemKey: string, file?: File) => {
    if (!file) return;
    try {
      const uploaded = await uploadWorkspaceMediaAsset(file, 'products/images', activeWorkspace, {
        maxWidth: 800,
        maxHeight: 800,
        quality: 0.84,
        preserveTransparency: true
      });
      if (uploaded.url) {
        setItemImageOverrides((prev) => ({
          ...prev,
          [itemKey]: uploaded.url
        }));
        setVisibleColumns((prev) => ({
          ...prev,
          showLineItemImages: true
        }));
      }
    } catch (err) {
      console.warn('[QuotationStudioModal] Line item image upload failed:', err);
    }
  };

  // Helper to check if a value is strictly an uppercase initial abbreviation (2-3 chars, e.g. "SS", "PV", "ANR")
  // Legitimate 3-letter names (e.g. "Ali", "Dan", "Tom", "Roy", "Guy", "Amy", "Joy") contain lowercase letters,
  // so /^[A-Z]{2,3}$/.test(...) evaluates to false, ensuring valid 3-letter legal names are NEVER discarded.
  const isInitialsOnly = (name?: string | null): boolean => {
    if (!name) return false;
    const trimmed = name.trim();
    return /^[A-Z]{2,3}$/.test(trimmed);
  };

  // Helper to resolve full rep name, protecting against uppercase initials and multi-user attribution overwrites
  const resolveRepFullName = (candidate?: string | null): string => {
    if (candidate && !isInitialsOnly(candidate)) {
      return candidate.trim();
    }

    // Candidate is missing or matches uppercase initials (e.g. "SS", "PV")
    // Attribution Integrity Guard: First look up assigned representative fields from enquiry, team or profile
    const assignedCandidates = [
      enquiry?.sales_representative,
      enquiry?.salesperson,
      enquiry?.assignedSalesperson,
      enquiry?.sales_person,
      salespersonName,
      (editingQuotation as any)?.assigned_to_name,
      (editingQuotation as any)?.salesperson_name,
      enquiry?.created_by_name,
      profile?.primary_signatory_name
    ];

    for (const name of assignedCandidates) {
      if (name && !isInitialsOnly(name) && name.trim().length > 1) {
        return name.trim();
      }
    }

    // Direct SS resolution to full name
    if (candidate === 'SS' || (candidate && candidate.trim() === 'SS')) {
      return (
        profile?.primary_signatory_name?.trim() ||
        user?.displayName?.trim() ||
        user?.name?.trim() ||
        'Syed Sibuma'
      );
    }

    // If candidate has initials (other than SS) and editing an existing quotation, preserve candidate attribution
    // rather than overwriting with an unrelated admin / current session user
    if (editingQuotation && candidate && candidate.trim().length > 0) {
      return candidate.trim();
    }

    // Only fall back to current logged-in user if creating a brand-new quotation where no assigned rep exists
    if (!editingQuotation && (user?.displayName || user?.name)) {
      const sessionUser = user.displayName || user.name;
      if (sessionUser && !isInitialsOnly(sessionUser)) {
        return sessionUser.trim();
      }
    }

    return (
      (candidate && !isInitialsOnly(candidate) ? candidate.trim() : '') ||
      profile?.primary_signatory_name?.trim() ||
      user?.displayName?.trim() ||
      user?.name?.trim() ||
      'Syed Sibuma'
    );
  };

  // Signatory & Remittance choices
  const [signatoryType, setSignatoryType] = useState<'single' | 'dual'>(
    editingQuotation?.signatory_type ||
      (editingQuotation?.signatories && editingQuotation.signatories.length > 1 ? 'dual' : 'single')
  );
  const [signatoryMode, setSignatoryMode] = useState<QuotationSignatoryMode>(
    editingQuotation?.signatories && editingQuotation.signatories.length > 1
      ? 'dual'
      : 'single'
  );
  const [signatoryName, setSignatoryName] = useState<string>(() => {
    const rawCandidate =
      editingQuotation?.primary_signatory_name ||
      editingQuotation?.signatories?.[0]?.name ||
      salespersonName ||
      enquiry?.sales_representative ||
      enquiry?.salesperson ||
      profile?.primary_signatory_name ||
      user?.displayName ||
      user?.name;

    return resolveRepFullName(rawCandidate);
  });
  const [signatoryTitle, setSignatoryTitle] = useState<string>(
    editingQuotation?.primary_signatory_title ||
      editingQuotation?.signatories?.[0]?.designation ||
      profile?.primary_signatory_title ||
      'Account Manager'
  );
  const [secondarySignatoryName, setSecondarySignatoryName] = useState<string>(
    editingQuotation?.secondary_signatory_name ||
      editingQuotation?.signatories?.[1]?.name ||
      profile?.secondary_signatory_name ||
      'Authorized Director'
  );
  const [secondarySignatoryTitle, setSecondarySignatoryTitle] = useState<string>(
    editingQuotation?.secondary_signatory_title ||
      editingQuotation?.signatories?.[1]?.designation ||
      profile?.secondary_signatory_title ||
      'Commercial Approver'
  );

  // Multi-Account Bank Registry Selection & Custom Overrides
  const [selectedBankId, setSelectedBankId] = useState<string>(() => {
    return (
      editingQuotation?.remittanceBankId ||
      editingQuotation?.remittance_bank_id ||
      editingQuotation?.applied_bank_account?.id ||
      editingQuotation?.footer_config?.remittanceBankId ||
      profile?.bank_accounts?.find((b) => b.is_default)?.id ||
      profile?.bank_accounts?.[0]?.id ||
      ''
    );
  });

  const [customBankOverride, setCustomBankOverride] = useState<{
    bankName?: string;
    beneficiaryName?: string;
    accountNumber?: string;
    iban?: string;
    swiftCode?: string;
    branchName?: string;
  } | null>(() => {
    if (editingQuotation?.selectedBank || editingQuotation?.applied_bank_account) {
      const b: any = editingQuotation.selectedBank || editingQuotation.applied_bank_account;
      return {
        bankName: b.bankName || b.bank_name,
        beneficiaryName: b.beneficiaryName || b.account_name || b.account_title,
        accountNumber: b.accountNumber || b.account_number,
        iban: b.iban,
        swiftCode: b.swiftCode || b.swift_bic || b.swift_code,
        branchName: b.branchName || b.branch_address
      };
    }
    return null;
  });

  const [isEditingBankDetails, setIsEditingBankDetails] = useState<boolean>(false);

  // Attention Contact Person & Client Snapshot overrides
  const [clientContactPerson, setClientContactPerson] = useState<string>(() => {
    return (
      editingQuotation?.client_contact_person ||
      editingQuotation?.client_snapshot?.client_contact_person ||
      editingQuotation?.client_snapshot?.contact_person ||
      (enquiry as any)?.contact_person_name ||
      (enquiry as any)?.contact_name ||
      enquiry?.concerned_person ||
      ''
    );
  });

  const [clientNameOverride, setClientNameOverride] = useState<string>(() => {
    return (
      editingQuotation?.client_snapshot?.entity_name ||
      enquiry?.company_name ||
      enquiry?.client_company ||
      ''
    );
  });

  const [clientAddressOverride, setClientAddressOverride] = useState<string>(() => {
    return (
      editingQuotation?.client_address ||
      editingQuotation?.client_snapshot?.client_address ||
      editingQuotation?.client_snapshot?.address ||
      enquiry?.project_location ||
      enquiry?.country ||
      ''
    );
  });

  const [clientTrnOverride, setClientTrnOverride] = useState<string>(() => {
    return (
      editingQuotation?.client_trn ||
      editingQuotation?.client_snapshot?.client_trn ||
      editingQuotation?.client_snapshot?.trn ||
      ''
    );
  });

  // Sales representative / Prepared By inheritance
  const [preparedBy, setPreparedBy] = useState<string>(() => {
    if (editingQuotation?.prepared_by) return resolveRepFullName(editingQuotation.prepared_by);
    const candidate =
      (enquiry as any)?.assigned_salesperson ||
      enquiry?.assignedSalesperson ||
      enquiry?.sales_representative ||
      enquiry?.salesperson ||
      salespersonName ||
      user?.displayName ||
      user?.name ||
      '';
    return resolveRepFullName(candidate);
  });

  // Project / Quotation Subject inheritance
  const [quotationSubject, setQuotationSubject] = useState<string>(() => {
    return (
      editingQuotation?.subject ||
      enquiry?.subject ||
      profile?.subject ||
      ''
    );
  });

  // Complete, leak-free state hydration helper when switching quotations, enquiries, or revisions (R1 <-> R2)
  const hydrateStudioFromQuotation = useCallback(
    (targetQuote: Quotation | null) => {
      setActiveSourceQuotation(targetQuote);
      const defaultPreset = presets.find((p) => p.is_default) || presets[0] || null;
      const hydrated = QuotationRepository.hydrateStudioStateFromQuotation(
        targetQuote,
        profile,
        !targetQuote ? defaultPreset : null
      );

      setActiveQuotationId(hydrated.activeQuotationId);
      setParentQuotationId(hydrated.parentQuotationId);
      setRevisionNumber(hydrated.revisionNumber);
      setFormattedQuoteRefOverride(hydrated.formattedQuoteRefOverride);
      setQuotationStatus(hydrated.quotationStatus);
      setVisibleColumns(hydrated.visibleColumns);
      setFreightAmount(hydrated.freightAmount);
      setTaxMode(hydrated.taxMode);
      setTaxRatePercent(hydrated.taxRatePercent);
      setPriceBasis(hydrated.priceBasis);
      setPaymentTerms(hydrated.paymentTerms);
      setTableDensity(hydrated.tableDensity);
      setFontSizeScale(hydrated.fontSizeScale);
      setTableFontScale(
        hydrated.fontSizeScale === 'compact'
          ? 'compact'
          : hydrated.fontSizeScale === 'large'
          ? 'prominent'
          : 'standard'
      );
      setBlockStyle(hydrated.blockStyle);
      setGlobalCardRadius(hydrated.globalCardRadius);
      setCardsOrder(hydrated.cardsOrder);
      setSubjectPlacement(hydrated.subjectPlacement);
      setSelectedBankId(hydrated.selectedBankId);
      setFlyerAttachments(hydrated.flyerAttachments);
      setShowSubmittalsIndex(hydrated.showSubmittalsIndex);
      setCompanyLogoUrl(hydrated.companyLogoUrl || '');
      if (hydrated.headerConfig) {
        setHeaderConfig({
          ...DEFAULT_HEADER_CONFIG,
          ...hydrated.headerConfig
        });
      }
      setCompanySealUrl(hydrated.companySealUrl || '');
      setSignatureImageUrl(hydrated.signatureImageUrl || '');
      if (hydrated.customThemeColor !== undefined) {
        setCustomThemeColor(hydrated.customThemeColor || '');
      }
      setOmittedFields(hydrated.omittedFields ? { ...hydrated.omittedFields } : {});
      setAutoPaginateItems(Boolean(hydrated.autoPaginateItems));

      if (targetQuote) {
        setClientContactPerson(
          targetQuote.client_contact_person ||
            targetQuote.client_snapshot?.client_contact_person ||
            targetQuote.client_snapshot?.contact_person ||
            (enquiry as any)?.contact_person_name ||
            enquiry?.concerned_person ||
            ''
        );
        setClientNameOverride(
          targetQuote.client_snapshot?.entity_name ||
            enquiry?.company_name ||
            enquiry?.client_company ||
            ''
        );
        setClientAddressOverride(
          targetQuote.client_address ||
            targetQuote.client_snapshot?.client_address ||
            targetQuote.client_snapshot?.address ||
            enquiry?.project_location ||
            enquiry?.country ||
            ''
        );
        setClientTrnOverride(
          targetQuote.client_trn ||
            targetQuote.client_snapshot?.client_trn ||
            targetQuote.client_snapshot?.trn ||
            ''
        );
        setPreparedBy(
          targetQuote.prepared_by
            ? resolveRepFullName(targetQuote.prepared_by)
            : resolveRepFullName(
                (enquiry as any)?.assigned_salesperson ||
                  enquiry?.sales_representative ||
                  salespersonName
              )
        );
        setQuotationSubject(targetQuote.subject || enquiry?.subject || profile?.subject || '');
        setCustomNotes(
          targetQuote.custom_notes ||
            targetQuote.applied_terms ||
            profile?.default_notes ||
            'All prices are subject to availability at the time of firm order.'
        );
        setHeaderLayout(targetQuote.header_layout || profile?.header_layout || 'split');
        setShowBankDetails(targetQuote.show_bank_details ?? profile?.show_bank_details ?? true);
        setShowCommercialTerms(
          targetQuote.show_commercial_terms ?? profile?.show_commercial_terms ?? true
        );
        setShowCompanySeal(targetQuote.show_company_seal ?? profile?.show_company_seal ?? true);
        setThemeAccent(targetQuote.theme_accent || profile?.theme_accent || 'navy');
        setCustomThemeColor(
          targetQuote.customThemeColor || profile?.customThemeColor || profile?.accent_color || ''
        );
        setLogoPosition(targetQuote.logo_position || profile?.logo_position || 'left');
        setAmountInWordsEnabled(
          targetQuote.amount_in_words_enabled ?? profile?.amount_in_words_enabled ?? true
        );
        setCustomerAcceptanceEnabled(
          targetQuote.customer_acceptance_enabled ?? profile?.customer_acceptance_enabled ?? true
        );
        const sType =
          targetQuote.signatory_type ||
          (targetQuote.signatories && targetQuote.signatories.length > 1 ? 'dual' : 'single');
        setSignatoryType(sType);
        setSignatoryMode(sType);
        setSignatureStyle(targetQuote.signature_style || profile?.signature_style || 'script');
        setSignatoryName(
          resolveRepFullName(
            targetQuote.primary_signatory_name ||
              targetQuote.signatories?.[0]?.name ||
              salespersonName
          )
        );
        setSignatoryTitle(
          targetQuote.primary_signatory_title ||
            targetQuote.signatories?.[0]?.designation ||
            profile?.primary_signatory_title ||
            'Account Manager'
        );
        setSecondarySignatoryName(
          targetQuote.secondary_signatory_name ||
            targetQuote.signatories?.[1]?.name ||
            profile?.secondary_signatory_name ||
            'Authorized Director'
        );
        setSecondarySignatoryTitle(
          targetQuote.secondary_signatory_title ||
            targetQuote.signatories?.[1]?.designation ||
            profile?.secondary_signatory_title ||
            'Commercial Approver'
        );
        setPageMode(
          targetQuote.pageMode ||
            targetQuote.footer_config?.pageMode ||
            profile?.pageMode ||
            'auto'
        );
        setHeaderConfig({
          ...DEFAULT_HEADER_CONFIG,
          ...(profile?.header_config || {}),
          ...(targetQuote.header_config || {}),
          ...(targetQuote.header_config?.logoUrl || targetQuote.company_logo_url
            ? { logoUrl: targetQuote.header_config?.logoUrl || targetQuote.company_logo_url }
            : {})
        });
        setRecipientConfig({
          ...DEFAULT_RECIPIENT_CONFIG,
          ...(profile?.recipient_config || {}),
          ...(targetQuote.recipient_config || {}),
          style: targetQuote.recipient_config?.style || hydrated.blockStyle,
          recipientCardStyle:
            targetQuote.recipient_config?.recipientCardStyle ||
            targetQuote.recipient_config?.style ||
            hydrated.blockStyle,
          offerCardStyle:
            targetQuote.recipient_config?.offerCardStyle ||
            targetQuote.recipient_config?.style ||
            hydrated.blockStyle,
          globalCardRadius: hydrated.globalCardRadius,
          recipientCardRadius:
            targetQuote.recipient_config?.recipientCardRadius || hydrated.globalCardRadius,
          offerCardRadius:
            targetQuote.recipient_config?.offerCardRadius || hydrated.globalCardRadius,
          cardsOrder: hydrated.cardsOrder,
          subjectPlacement: hydrated.subjectPlacement
        });
        setFooterConfig({
          ...DEFAULT_FOOTER_CONFIG,
          ...(profile?.footer_config || {}),
          ...(targetQuote.footer_config || {})
        });

        const savedBlocks =
          targetQuote.layout_blocks || (targetQuote as any)?.presentation_preset?.layout_blocks;
        const blocksToUse =
          savedBlocks && Array.isArray(savedBlocks) && savedBlocks.length > 0
            ? savedBlocks
            : DEFAULT_QUOTATION_BLOCKS;
        setLayoutBlocks(
          blocksToUse.map((b: QuotationBlockConfig) => ({
            ...b,
            enabled: b.enabled ?? b.is_visible ?? true,
            is_visible: b.is_visible ?? b.enabled ?? true,
            fontScale: b.fontScale || 'standard',
            padding: b.padding || 'standard'
          }))
        );

        const initialMap: Record<string, string[]> = {};
        const initialBreaks: Record<string, boolean> = {};
        (targetQuote.line_items || []).forEach((item, idx) => {
          const key = item.id || `item_${idx}`;
          if (item.visible_attributes) {
            initialMap[key] = item.visible_attributes;
          }
          if (typeof item.page_break_after === 'boolean') {
            initialBreaks[key] = item.page_break_after;
          }
        });
        setItemVisibleAttributes(initialMap);
        setItemPageBreaks(initialBreaks);
        setItemCompositeOverrides({});

        if (targetQuote.selectedBank || targetQuote.applied_bank_account) {
          const b: any = targetQuote.selectedBank || targetQuote.applied_bank_account;
          setCustomBankOverride({
            bankName: b.bankName || b.bank_name,
            beneficiaryName: b.beneficiaryName || b.account_name || b.account_title,
            accountNumber: b.accountNumber || b.account_number,
            iban: b.iban,
            swiftCode: b.swiftCode || b.swift_bic || b.swift_code,
            branchName: b.branchName || b.branch_address
          });
        } else {
          setCustomBankOverride(null);
        }
      } else {
        setClientContactPerson(
          (enquiry as any)?.contact_person_name ||
            (enquiry as any)?.contact_name ||
            enquiry?.concerned_person ||
            ''
        );
        setPreparedBy(
          resolveRepFullName(
            (enquiry as any)?.assigned_salesperson ||
              enquiry?.sales_representative ||
              salespersonName
          )
        );
        setQuotationSubject(enquiry?.subject || profile?.subject || '');
        setCustomNotes(
          profile?.default_notes ||
            'All prices are subject to availability at the time of firm order.'
        );
        setLayoutBlocks(
          (hydrated.layoutBlocks.length > 0
            ? hydrated.layoutBlocks
            : DEFAULT_QUOTATION_BLOCKS
          ).map((b: QuotationBlockConfig) => ({
            ...b,
            enabled: b.enabled ?? b.is_visible ?? true,
            is_visible: b.is_visible ?? b.enabled ?? true,
            fontScale: b.fontScale || 'standard',
            padding: b.padding || 'standard'
          }))
        );
        const initialBreaks: Record<string, boolean> = {};
        (enquiry?.line_items || []).forEach((item: any, idx: number) => {
          const key = item.id || `item_${idx}`;
          if (typeof item.page_break_after === 'boolean') {
            initialBreaks[key] = item.page_break_after;
          }
        });
        setItemVisibleAttributes({});
        setItemPageBreaks(initialBreaks);
        setItemCompositeOverrides({});
        setCustomBankOverride(null);
      }
    },
    [enquiry, profile, presets, salespersonName]
  );

  // Hydrate state when editingQuotation or enquiry.id changes
  useEffect(() => {
    hydrateStudioFromQuotation(editingQuotation || null);
  }, [editingQuotation, enquiry?.id]);

  // Load revision chain for the current enquiry so the In-Studio Revision History Switcher is populated
  useEffect(() => {
    let isMounted = true;
    if (enquiry?.id && activeWorkspaceId) {
      QuotationRepository.getQuotationsForEnquiry(enquiry.id, activeWorkspaceId)
        .then((loaded) => {
          if (!isMounted) return;
          const merged = [...loaded];
          if (editingQuotation?.id && !merged.some((q) => q.id === editingQuotation.id)) {
            merged.push(editingQuotation);
          }
          merged.sort((a, b) => (a.revision_number || 1) - (b.revision_number || 1));
          setEnquiryRevisions(merged);
        })
        .catch(() => {});
    } else if (editingQuotation) {
      setEnquiryRevisions([editingQuotation]);
    } else {
      setEnquiryRevisions([]);
    }
    return () => {
      isMounted = false;
    };
  }, [enquiry?.id, activeWorkspaceId, editingQuotation]);

  // Zoom / Preview scale controls
  const [zoomScale, setZoomScale] = useState<number>(0.85);
  const previewScrollRef = useRef<HTMLDivElement | null>(null);

  const handleFitPage = () => {
    if (previewScrollRef.current) {
      const containerHeight = previewScrollRef.current.clientHeight;
      const availableHeight = containerHeight - 48;
      const fitScale = Math.min(1.0, Math.max(0.45, Number((availableHeight / 1123).toFixed(2))));
      setZoomScale(fitScale);
    } else {
      setZoomScale(0.70);
    }
  };

  // Collapsible accordions
  const [isLayoutOpen, setIsLayoutOpen] = useState<boolean>(true);
  const [isBrandingOpen, setIsBrandingOpen] = useState<boolean>(false);
  const [isTermsOpen, setIsTermsOpen] = useState<boolean>(false);
  const [isSignatoryOpen, setIsSignatoryOpen] = useState<boolean>(false);
  const [isAnnexOpen, setIsAnnexOpen] = useState<boolean>(false);

  // Technical Annexures & Flyers State
  const [flyerAttachments, setFlyerAttachments] = useState<Attachment[]>(() =>
    Array.isArray(editingQuotation?.flyer_attachments)
      ? editingQuotation!.flyer_attachments!
      : []
  );
  const [showSubmittalsIndex, setShowSubmittalsIndex] = useState<boolean>(
    () => editingQuotation?.show_submittals_index ?? true
  );
  const [newAttachmentTitle, setNewAttachmentTitle] = useState<string>('');
  const [newAttachmentUrl, setNewAttachmentUrl] = useState<string>('');
  const annexFileInputRef = useRef<HTMLInputElement | null>(null);

  const handleUploadAnnexFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const fileList = Array.from(files) as File[];
    e.target.value = '';
    for (let idx = 0; idx < fileList.length; idx++) {
      const file = fileList[idx];
      const isImage = file.type.startsWith('image/');
      try {
        const uploaded = await uploadWorkspaceMediaAsset(file, 'quotations/annexes', activeWorkspace, {
          maxWidth: 1200,
          maxHeight: 1600,
          quality: 0.78,
          preserveTransparency: false
        });
        if (!uploaded.url) continue;
        const cleanTitle = file.name.replace(/\.[^/.]+$/, '');
        const resolvedTitle = cleanTitle || `Annex Datasheet ${flyerAttachments.length + idx + 1}`;
        const newAtt: Attachment = {
          id: `annex_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
          name: resolvedTitle,
          url: uploaded.url,
          storagePath: uploaded.storagePath,
          type: file.type || (isImage ? 'image/jpeg' : 'application/pdf'),
          size: uploaded.size || file.size,
          uploadedAt: new Date().toISOString(),
          page_placement: isImage ? 'annex_after' : 'index_only',
          render_as_annex_page: isImage,
          full_bleed: false,
          exclude_from_page_count: false,
          show_title_on_annex: QuotationRepository.resolveShowTitleOnAnnex({ name: resolvedTitle })
        };
        setFlyerAttachments((prev) => [...prev, newAtt]);
      } catch (err) {
        console.warn('[QuotationStudioModal] Annex upload error:', err);
      }
    }
  };

  const handleAddAttachmentByUrl = () => {
    const trimmedUrl = newAttachmentUrl.trim();
    if (!trimmedUrl) {
      triggerToast?.('Please enter an image or document URL.', 'error');
      return;
    }
    const trimmedTitle =
      newAttachmentTitle.trim() || `Annex ${String.fromCharCode(65 + flyerAttachments.length)}: Technical Submittal`;
    const lowerUrl = trimmedUrl.toLowerCase();
    const isPdfOrDoc =
      lowerUrl.endsWith('.pdf') ||
      lowerUrl.endsWith('.doc') ||
      lowerUrl.endsWith('.docx') ||
      lowerUrl.includes('application/pdf');
    const newAtt: Attachment = {
      id: `annex_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: trimmedTitle,
      url: trimmedUrl,
      type: isPdfOrDoc ? 'pdf' : 'image',
      uploadedAt: new Date().toISOString(),
      page_placement: !isPdfOrDoc ? 'annex_after' : 'index_only',
      render_as_annex_page: !isPdfOrDoc,
      full_bleed: false,
      exclude_from_page_count: false,
      show_title_on_annex: QuotationRepository.resolveShowTitleOnAnnex({ name: trimmedTitle })
    };
    setFlyerAttachments((prev) => [...prev, newAtt]);
    setNewAttachmentTitle('');
    setNewAttachmentUrl('');
  };

  const handleUpdateAttachment = (id: string, patch: Partial<Attachment>) => {
    setFlyerAttachments((prev) =>
      prev.map((att, idx) =>
        (att.id || `annex_${idx}`) === id ? { ...att, ...patch } : att
      )
    );
  };

  const handleMoveAttachment = (idx: number, direction: 'up' | 'down') => {
    setFlyerAttachments((prev) => {
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;
      const copy = [...prev];
      const [moved] = copy.splice(idx, 1);
      copy.splice(targetIdx, 0, moved);
      return copy;
    });
  };

  const handleDeleteAttachment = (id: string) => {
    setFlyerAttachments((prev) =>
      prev.filter((att, idx) => (att.id || `annex_${idx}`) !== id)
    );
  };

  // Load Presets on Mount
  useEffect(() => {
    let isMounted = true;
    QuotationRepository.getPresets(activeWorkspaceId)
      .then((loadedPresets) => {
        if (!isMounted) return;
        setPresets(loadedPresets);
        if (initialPresetId && loadedPresets.some((p) => p.id === initialPresetId)) {
          setSelectedPresetId(initialPresetId);
        } else if (loadedPresets.length > 0 && !editingQuotation) {
          const defaultPreset =
            loadedPresets.find((p) => p.is_default) || loadedPresets[0];
          applyPreset(defaultPreset);
        } else if (loadedPresets.length > 0 && isEffectiveSandbox && !selectedPresetId) {
          const defaultPreset =
            loadedPresets.find((p) => p.is_default) || loadedPresets[0];
          if (defaultPreset?.id) {
            setSelectedPresetId(defaultPreset.id);
          }
        }
      })
      .catch((err) => {
        console.warn('Failed loading presets:', err);
      });
    return () => {
      isMounted = false;
    };
  }, [activeWorkspaceId, editingQuotation, initialPresetId]);

  // Hydrated workspace document profile state
  const [workspaceProfile, setWorkspaceProfile] = useState<WorkspaceDocumentProfile | null>(profile || null);

  useEffect(() => {
    if (profile) {
      setWorkspaceProfile(profile);
    }
  }, [profile]);

  useEffect(() => {
    let isMounted = true;
    if (activeWorkspaceId) {
      QuotationRepository.getWorkspaceDocumentProfile(activeWorkspaceId)
        .then((loaded) => {
          if (!isMounted) return;
          if (loaded) {
            setWorkspaceProfile(loaded);
            if (!editingQuotation && !selectedPresetId) {
              if (loaded.theme_accent) setThemeAccent(loaded.theme_accent);
              if (loaded.customThemeColor || loaded.accent_color) {
                setCustomThemeColor(loaded.customThemeColor || loaded.accent_color || '');
              }
              if (loaded.block_style) setBlockStyle(loaded.block_style);
              if (loaded.globalCardRadius) setGlobalCardRadius(loaded.globalCardRadius);
              if (loaded.fontSizeScale) setFontSizeScale(loaded.fontSizeScale);
              if (loaded.table_density) setTableDensity(loaded.table_density);
              if (loaded.signatory_type) {
                setSignatoryType(loaded.signatory_type);
                setSignatoryMode(loaded.signatory_type);
              }
              if (loaded.signature_style) setSignatureStyle(loaded.signature_style);
              if (loaded.signature_image_url) setSignatureImageUrl(loaded.signature_image_url);
              if (loaded.primary_signatory_name) setSignatoryName(loaded.primary_signatory_name);
              if (loaded.primary_signatory_title) setSignatoryTitle(loaded.primary_signatory_title);
              if (loaded.secondary_signatory_name) setSecondarySignatoryName(loaded.secondary_signatory_name);
              if (loaded.secondary_signatory_title) setSecondarySignatoryTitle(loaded.secondary_signatory_title);
              if (loaded.logo_url) setCompanyLogoUrl(loaded.logo_url);
              if (loaded.company_seal_url || loaded.stamp_seal_url) {
                setCompanySealUrl(loaded.company_seal_url || loaded.stamp_seal_url || '');
              }
              if (loaded.header_config) {
                setHeaderConfig((prev) => ({
                  ...prev,
                  ...loaded.header_config,
                  logoUrl: loaded.header_config?.logoUrl || loaded.logo_url || prev.logoUrl
                }));
              }
              if (loaded.footer_config) {
                setFooterConfig((prev) => ({
                  ...prev,
                  ...loaded.footer_config
                }));
              }
            }
            if (Array.isArray(loaded.saved_custom_blocks) && loaded.saved_custom_blocks.length > 0) {
              setSavedCustomBlocks((prev) => {
                const merged = new Map<string, SavedCustomBlockTemplate>();
                [...loaded.saved_custom_blocks!, ...prev].forEach((item) => {
                  if (item && item.id) merged.set(item.id, item);
                });
                return Array.from(merged.values());
              });
            }
          }
        })
        .catch((err) => {
          console.warn('[QuotationStudioModal] Failed loading workspace document profile:', err);
        });
    }
    return () => {
      isMounted = false;
    };
  }, [activeWorkspaceId, editingQuotation, selectedPresetId]);

  // Resolved active document profile prioritizing freshly fetched workspaceProfile then prop fallback
  const activeProfile = workspaceProfile || profile;

  // Set default bank if profile exists and no explicit bank was already selected by draft/preset
  useEffect(() => {
    if (
      !selectedBankId &&
      !editingQuotation?.applied_bank_account?.id &&
      !editingQuotation?.remittanceBankId &&
      activeProfile?.bank_accounts &&
      activeProfile.bank_accounts.length > 0
    ) {
      const def = activeProfile.bank_accounts.find((b) => b.is_default) || activeProfile.bank_accounts[0];
      if (def?.id) {
        setSelectedBankId(def.id);
      }
    }
  }, [activeProfile, selectedBankId, editingQuotation]);

  // Apply chosen preset (Full Phase 1 & Phase 2 Snapshot Hydration)
  const applyPreset = (preset: QuotationPreset) => {
    const hydrated = QuotationRepository.hydrateFromPresetSnapshot(preset);
    setSelectedPresetId(preset.id || '');
    if (preset.visible_columns) {
      setVisibleColumns((prev) => ({
        ...prev,
        ...hydrated.visibleColumns
      }));
      if (typeof hydrated.visibleColumns.showAmountInWords === 'boolean') {
        setAmountInWordsEnabled(hydrated.visibleColumns.showAmountInWords);
      }
    }
    if (preset.default_tax_mode) setTaxMode(preset.default_tax_mode);
    if (preset.default_price_basis) setPriceBasis(preset.default_price_basis);
    if (preset.default_payment_terms) setPaymentTerms(preset.default_payment_terms);
    if (preset.default_validity_days) setValidityDays(preset.default_validity_days);
    if (preset.signatory_mode) {
      setSignatoryMode(preset.signatory_mode);
      if (preset.signatory_mode === 'dual' || preset.signatory_mode === 'single') {
        setSignatoryType(preset.signatory_mode);
      }
    }
    if (preset.notes_template !== undefined) setCustomNotes(preset.notes_template || '');
    if (preset.header_layout) setHeaderLayout(preset.header_layout);
    if (preset.table_density) setTableDensity(preset.table_density);
    if (preset.table_font_scale) setTableFontScale(preset.table_font_scale);
    if (preset.fontSizeScale || (preset as any).font_size_scale) {
      handleSetFontSizeScale(preset.fontSizeScale || (preset as any).font_size_scale);
    }
    if (typeof preset.show_bank_details === 'boolean') setShowBankDetails(preset.show_bank_details);
    const presetBankId =
      preset.remittanceBankId ||
      (preset as any).remittance_bank_id ||
      preset.footer_config?.remittanceBankId;
    if (presetBankId) {
      handleSelectBank(presetBankId);
    }
    if (typeof preset.show_commercial_terms === 'boolean') setShowCommercialTerms(preset.show_commercial_terms);
    if (typeof preset.show_company_seal === 'boolean') setShowCompanySeal(preset.show_company_seal);
    if (preset.theme_accent) setThemeAccent(preset.theme_accent);
    if (preset.customThemeColor !== undefined) {
      setCustomThemeColor(preset.customThemeColor || '');
    }
    if (typeof preset.amount_in_words_enabled === 'boolean') {
      setAmountInWordsEnabled(preset.amount_in_words_enabled);
    }
    if (typeof preset.customer_acceptance_enabled === 'boolean') {
      setCustomerAcceptanceEnabled(preset.customer_acceptance_enabled);
    }
    if (preset.signatory_type) setSignatoryType(preset.signatory_type);
    if (preset.signature_style) setSignatureStyle(preset.signature_style);
    if (preset.company_logo_url !== undefined || preset.header_config?.logoUrl !== undefined) {
      setCompanyLogoUrl(preset.header_config?.logoUrl ?? preset.company_logo_url ?? '');
    }
    if (preset.company_seal_url !== undefined) setCompanySealUrl(preset.company_seal_url || '');
    if (preset.signature_image_url !== undefined) setSignatureImageUrl(preset.signature_image_url || '');
    if (preset.logo_position) setLogoPosition(preset.logo_position);
    if (preset.recipient_config) {
      setRecipientConfig((prev) => ({
        ...prev,
        ...preset.recipient_config,
        ...(preset.block_style
          ? {
              style: preset.block_style,
              recipientCardStyle: preset.recipient_config?.recipientCardStyle || preset.block_style,
              offerCardStyle: preset.recipient_config?.offerCardStyle || preset.block_style
            }
          : {}),
        ...(preset.globalCardRadius
          ? {
              globalCardRadius: preset.globalCardRadius,
              recipientCardRadius: preset.recipient_config?.recipientCardRadius || preset.globalCardRadius,
              offerCardRadius: preset.recipient_config?.offerCardRadius || preset.globalCardRadius
            }
          : {}),
        ...(preset.cardsOrder ? { cardsOrder: preset.cardsOrder } : {}),
        ...(preset.subjectPlacement ? { subjectPlacement: preset.subjectPlacement } : {})
      }));
    }
    if (preset.block_style) {
      handleSetGlobalBlockStyle(preset.block_style);
    }
    if (preset.globalCardRadius) {
      handleSetGlobalCardRadius(preset.globalCardRadius);
    }
    if (preset.cardsOrder) {
      setCardsOrder(preset.cardsOrder);
      setRecipientConfig((prev) => ({
        ...prev,
        cardsOrder: preset.cardsOrder
      }));
    }
    if (preset.subjectPlacement) {
      setSubjectPlacement(preset.subjectPlacement);
      setRecipientConfig((prev) => ({
        ...prev,
        subjectPlacement: preset.subjectPlacement
      }));
    }
    if (preset.header_config || hydrated.headerConfig) {
      setHeaderConfig((prev) => ({
        ...prev,
        ...(hydrated.headerConfig || {}),
        ...(preset.header_config || {}),
        ...(preset.documentFontFamily
          ? { documentFontFamily: preset.documentFontFamily }
          : {}),
        ...(preset.topAccentBarStyle
          ? { topAccentBarStyle: preset.topAccentBarStyle }
          : {}),
        ...(preset.tableHeaderStyle
          ? { tableHeaderStyle: preset.tableHeaderStyle }
          : {}),
        ...(preset.blockHeaderStyle
          ? { blockHeaderStyle: preset.blockHeaderStyle }
          : {}),
        ...(preset.companyNameOverride !== undefined
          ? { companyNameOverride: preset.companyNameOverride }
          : {}),
        ...(preset.header_config?.logoUrl || preset.company_logo_url
          ? { logoUrl: preset.header_config?.logoUrl || preset.company_logo_url }
          : {})
      }));
    }
    if (preset.footer_config) {
      setFooterConfig((prev) => ({
        ...prev,
        ...preset.footer_config,
        ...(presetBankId ? { remittanceBankId: presetBankId } : {})
      }));
    }
    if (typeof preset.showBankRemittance === 'boolean') {
      handleToggleBankRemittance(preset.showBankRemittance);
    } else if (typeof preset.footer_config?.showBankRemittance === 'boolean') {
      handleToggleBankRemittance(preset.footer_config.showBankRemittance);
    }
    if (typeof preset.showCustomerAcceptance === 'boolean') {
      handleToggleCustomerAcceptance(preset.showCustomerAcceptance);
    } else if (typeof preset.footer_config?.showCustomerAcceptance === 'boolean') {
      handleToggleCustomerAcceptance(preset.footer_config.showCustomerAcceptance);
    }
    if (typeof preset.showSignatories === 'boolean') {
      handleToggleSignatories(preset.showSignatories);
    } else if (typeof preset.footer_config?.showSignatories === 'boolean') {
      handleToggleSignatories(preset.footer_config.showSignatories);
    }
    if (preset.footerLayoutMode || preset.footer_config?.footerLayoutMode) {
      const legacyMode = preset.footerLayoutMode || preset.footer_config?.footerLayoutMode;
      setFooterConfig((prev) => ({ ...prev, footerLayoutMode: legacyMode }));
    }
    if (preset.layout_blocks && preset.layout_blocks.length > 0) {
      setLayoutBlocks(
        preset.layout_blocks.map((b, idx) => ({
          ...b,
          order: typeof b.order === 'number' ? b.order : idx,
          enabled: b.enabled ?? b.is_visible ?? true,
          is_visible: b.is_visible ?? b.enabled ?? true,
          fontScale: b.fontScale || 'standard',
          padding: b.padding || 'standard',
          ...(b.type === 'spacer' || b.id?.startsWith('spacer_')
            ? {
                type: 'spacer' as const,
                spacer_height_mm: typeof b.spacer_height_mm === 'number' ? b.spacer_height_mm : 20,
                spacer_fill_remaining: Boolean(b.spacer_fill_remaining)
              }
            : {}),
          ...(b.type === 'page_break' || b.id?.startsWith('break_')
            ? {
                type: 'page_break' as const,
                show_continuation_header: b.show_continuation_header !== false
              }
            : {})
        }))
      );
    }
    if (Array.isArray(preset.flyer_attachments)) {
      setFlyerAttachments(hydrated.flyerAttachments);
    }
    if (typeof preset.show_submittals_index === 'boolean') {
      setShowSubmittalsIndex(preset.show_submittals_index);
    }
    if (preset.primary_signatory_name) setSignatoryName(resolveRepFullName(preset.primary_signatory_name));
    if (preset.primary_signatory_title) setSignatoryTitle(preset.primary_signatory_title);
    if (preset.secondary_signatory_name) setSecondarySignatoryName(preset.secondary_signatory_name);
    if (preset.secondary_signatory_title) setSecondarySignatoryTitle(preset.secondary_signatory_title);
    if (preset.option_display_mode) setOptionDisplayMode(preset.option_display_mode);
    if (preset.option_group_titles) setOptionGroupTitles(preset.option_group_titles);
    if (typeof preset.show_combined_options_total === 'boolean') {
      setShowCombinedOptionsTotal(preset.show_combined_options_total);
    }
    if (preset.omitted_fields) {
      setOmittedFields({ ...preset.omitted_fields });
    }
    if (typeof preset.auto_paginate_items === 'boolean') {
      setAutoPaginateItems(preset.auto_paginate_items);
    }
  };

  const [optionDisplayMode, setOptionDisplayMode] = useState<QuotationOptionDisplayMode>(
    editingQuotation?.option_display_mode || 'all_separate_tables'
  );
  const [optionGroupTitles, setOptionGroupTitles] = useState<Record<string, string>>(
    () => editingQuotation?.option_group_titles || enquiry?.option_group_titles || {}
  );
  const [showCombinedOptionsTotal, setShowCombinedOptionsTotal] = useState<boolean>(
    () => Boolean(editingQuotation?.show_combined_options_total ?? enquiry?.show_combined_options_total ?? false)
  );
  const [itemCompositeOverrides, setItemCompositeOverrides] = useState<
    Record<string, Partial<QuotationLineItem>>
  >({});
  const [customStudioLineItems, setCustomStudioLineItems] = useState<QuotationLineItem[] | null>(null);
  const [expandedCompositeKey, setExpandedCompositeKey] = useState<string | null>(null);

  // Convert enquiry.line_items or editingQuotation.line_items to QuotationLineItem array
  const quotationLineItems = useMemo(() => {
    const FALLBACK_ITEMS: QuotationLineItem[] = [
      {
        id: 'sample_item_1',
        item_name: 'Jackson Disk Diffuser',
        description: 'Fine bubble membrane aeration diffuser for biological wastewater treatment and aeration basins.',
        quantity: 120,
        unit: 'pcs',
        unit_price: 185.0,
        total_price: 22200.0,
        brand_make: 'Jackson Environmental',
        model_part_no: 'JDD-9-EPDM',
        country_of_origin: 'USA / UAE Assembly',
        availability: 'Ex-Stock (1-2 Days)',
        is_optional: false,
        attributes: [
          { key: 'Size', value: '9 Inch / DN200' },
          { key: 'Material', value: 'EPDM Membrane / ABS Body' },
          { key: 'Connection', value: '3/4" NPT Thread' },
          { key: 'Design Flow', value: '2 - 5 Nm³/h' }
        ]
      },
      {
        id: 'sample_item_2',
        item_name: 'Item One / Dosing Pump',
        description: 'Electromagnetic diaphragm metering pump for chemical dosage and pH correction with digital stroke control.',
        quantity: 2,
        unit: 'set',
        unit_price: 2450.0,
        total_price: 4900.0,
        brand_make: 'Seko / Prominent',
        model_part_no: 'KMS-MF-1510',
        country_of_origin: 'Italy',
        availability: '3 - 5 Days',
        is_optional: false,
        attributes: [
          { key: 'Capacity', value: '15 LPH' },
          { key: 'Pressure', value: '10 bar' },
          { key: 'Power Supply', value: '220V / 50Hz / 1Ph' }
        ]
      }
    ];

    const sourceQuotation = activeSourceQuotation || editingQuotation;
    let baseItems: QuotationLineItem[];
    if (customStudioLineItems && customStudioLineItems.length > 0) {
      baseItems = customStudioLineItems;
    } else if (sourceQuotation?.line_items && sourceQuotation.line_items.length > 0) {
      baseItems = sourceQuotation.line_items.map((item) => {
        const { cleanDescription, extractedSpecsAttrs } =
          extractLineItemAttributesAndCleanDescription(item);
        if (extractedSpecsAttrs.length > 0) {
          const existingAttrs = Array.isArray(item.attributes) ? item.attributes : [];
          const isRealDiffuserOrPump =
            item.item_name?.toLowerCase().includes('diffuser') ||
            item.item_name?.toLowerCase().includes('jackson') ||
            item.item_name?.toLowerCase().includes('dosing pump') ||
            item.item_name?.toLowerCase().includes('item one');
          const filteredExisting = existingAttrs.filter((a) => {
            if (isRealDiffuserOrPump) return true;
            return !(
              (a.key === 'Size' && a.value === '9 Inch / DN200') ||
              (a.key === 'Material' && a.value === 'EPDM Membrane / ABS Body') ||
              (a.key === 'Connection' && a.value === '3/4" NPT Thread') ||
              (a.key === 'Design Flow' && a.value === '2 - 5 Nm³/h') ||
              (a.key === 'Capacity' && a.value === '15 LPH') ||
              (a.key === 'Pressure' && a.value === '10 bar') ||
              (a.key === 'Power Supply' && a.value === '220V / 50Hz / 1Ph')
            );
          });
          const mergedAttrs = [...extractedSpecsAttrs];
          filteredExisting.forEach((a) => {
            if (!mergedAttrs.some((m) => m.key.toLowerCase() === a.key.toLowerCase())) {
              mergedAttrs.push(a);
            }
          });
          return {
            ...item,
            description: cleanDescription,
            attributes: mergedAttrs
          };
        }
        return item;
      });
    } else {
      const rawItems: LineItem[] = enquiry?.line_items || [];
      if (rawItems.length === 0) {
        baseItems = FALLBACK_ITEMS;
      } else {
        baseItems = rawItems.map((li, idx) => {
          const qty = Number(li.quantity) || 1;
          const uPrice = Number(li.unit_price) || 0;
          const tPrice =
            li.total_price !== undefined
              ? QuotationRepository.roundCurrency(Number(li.total_price) || 0)
              : QuotationRepository.roundCurrency(qty * uPrice);

          const parsedLegacy = parseLineItemTitleAndSpec(li.item_name, li.description);
          const resolvedTitle =
            (li.item_name && li.item_name.trim()) ||
            parsedLegacy.title ||
            (li.product_type && li.product_type !== 'Custom' ? li.product_type : `Item ${idx + 1}`);
          const resolvedRawDesc =
            !li.item_name && parsedLegacy.wasSplit ? parsedLegacy.spec : li.description || '';

          const { cleanDescription, extractedSpecsAttrs } =
            extractLineItemAttributesAndCleanDescription({
              item_name: resolvedTitle,
              description: resolvedRawDesc,
              quantity: qty,
              unit: li.unit || 'pcs',
              unit_price: uPrice,
              total_price: tPrice
            });

          // Extract attributes if available
          const brandAttr =
            li.brand_make ||
            li.attributes?.find((a) => a.key.toLowerCase().includes('brand'))?.value ||
            extractedSpecsAttrs.find((a) => a.key.toLowerCase().includes('brand'))?.value;
          const modelAttr =
            li.model_part_no ||
            li.attributes?.find((a) => a.key.toLowerCase().includes('model') || a.key.toLowerCase().includes('part'))?.value ||
            extractedSpecsAttrs.find((a) => a.key.toLowerCase().includes('model') || a.key.toLowerCase().includes('part'))?.value;
          const originAttr =
            li.country_of_origin ||
            li.attributes?.find((a) => a.key.toLowerCase().includes('origin'))?.value ||
            extractedSpecsAttrs.find((a) => a.key.toLowerCase().includes('origin'))?.value;

          let itemAttrs: QuotationItemAttribute[] | undefined = undefined;
          if (Array.isArray(li.attributes) && li.attributes.length > 0) {
            itemAttrs = li.attributes.map((a) => ({ key: a.key, value: a.value }));
            extractedSpecsAttrs.forEach((ea) => {
              if (!itemAttrs!.some((ia) => ia.key.toLowerCase() === ea.key.toLowerCase())) {
                itemAttrs!.push(ea);
              }
            });
          } else if (extractedSpecsAttrs.length > 0) {
            itemAttrs = extractedSpecsAttrs;
          }

          const optLabel = (li.option || (li as any).option_designation || '').trim();
          const isOptionalFromOption =
            Boolean((li as any).is_optional) ||
            optLabel === 'Optional / Add-On' ||
            optLabel === 'Option B' ||
            optLabel === 'Option C' ||
            /^option\s+[b-z]/i.test(optLabel);

          return {
            id: li.id || `item_${idx}`,
            product_id: li.product_id,
            sku: li.sku,
            item_name: resolvedTitle,
            description: cleanDescription,
            quantity: qty,
            unit: li.unit || 'pcs',
            unit_price: uPrice,
            cost_price: li.cost_price,
            total_price: tPrice,
            brand_make: brandAttr || undefined,
            model_part_no: modelAttr || undefined,
            country_of_origin: originAttr || undefined,
            hs_code: li.hs_code || undefined,
            availability: li.lead_time_note || 'Ex-Stock / Standard',
            is_optional: isOptionalFromOption,
            option: optLabel || undefined,
            option_group: optLabel || undefined,
            option_scope_notes: li.option_scope_notes || undefined,
            is_composite_set: li.is_composite_set,
            sub_components: li.sub_components,
            package_pricing_mode: li.package_pricing_mode,
            attributes: itemAttrs,
            image_url: li.image_url,
            secondary_image_url: li.secondary_image_url,
            image_caption: li.image_caption,
            secondary_image_caption: li.secondary_image_caption,
            image_adjustments: li.image_adjustments,
            image_display_override: li.image_display_override,
            image_size_override: li.image_size_override,
            image_aspect_override: li.image_aspect_override,
            datasheet_attachment: li.datasheet_attachment,
            include_datasheet_in_quote: li.include_datasheet_in_quote !== false,
            page_break_after: li.page_break_after,
            row_spacer_after_mm: li.row_spacer_after_mm,
            row_note: li.row_note,
            row_highlight: li.row_highlight,
            row_bold: li.row_bold,
            hide_row_price: li.hide_row_price
          };
        });
      }
    }

    return baseItems.map((item, idx) => {
      const itemKey = item.id || `item_${idx}`;
      const effectiveProductId = itemLinkedProductIds[itemKey] || item.product_id;
      const matchedCatalogProduct = workspaceProducts.find(
        (p) =>
          (effectiveProductId && p.id === effectiveProductId) ||
          (item.sku && p.sku && p.sku.toLowerCase() === item.sku.toLowerCase()) ||
          (item.item_name &&
            (p.name || p.description || '').trim().toLowerCase() === item.item_name.trim().toLowerCase())
      );

      const customVisible = itemVisibleAttributes[itemKey] ?? item.visible_attributes;
      const compOverride = itemCompositeOverrides[itemKey] || {};
      const customPageBreak =
        compOverride.page_break_after !== undefined
          ? compOverride.page_break_after
          : itemPageBreaks[itemKey] !== undefined
          ? itemPageBreaks[itemKey]
          : Boolean(item.page_break_after);
      const resolvedImageUrl =
        compOverride.image_url !== undefined
          ? compOverride.image_url
          : itemImageOverrides[itemKey] !== undefined
          ? itemImageOverrides[itemKey]
          : item.image_url || matchedCatalogProduct?.image_url;
      const resolvedSecondaryImageUrl =
        compOverride.secondary_image_url !== undefined
          ? compOverride.secondary_image_url
          : item.secondary_image_url ?? matchedCatalogProduct?.secondary_image_url;
      const resolvedImageCaption =
        compOverride.image_caption !== undefined
          ? compOverride.image_caption
          : item.image_caption ?? matchedCatalogProduct?.image_caption;
      const resolvedSecondaryImageCaption =
        compOverride.secondary_image_caption !== undefined
          ? compOverride.secondary_image_caption
          : item.secondary_image_caption ?? matchedCatalogProduct?.secondary_image_caption;
      const resolvedImageAdjustments =
        compOverride.image_adjustments !== undefined
          ? compOverride.image_adjustments
          : item.image_adjustments ?? matchedCatalogProduct?.image_adjustments;
      const resolvedDatasheet =
        item.datasheet_attachment || matchedCatalogProduct?.datasheet_attachment;
      const resolvedIncludeDatasheet =
        itemDatasheetToggles[itemKey] !== undefined
          ? itemDatasheetToggles[itemKey]
          : item.include_datasheet_in_quote !== false;
      const resolvedOptional =
        itemOptionalOverrides[itemKey] !== undefined
          ? itemOptionalOverrides[itemKey]
          : Boolean(item.is_optional);

      const rawSubComponents =
        compOverride.sub_components ??
        item.sub_components ??
        matchedCatalogProduct?.sub_components;
      const normalizedSubComponents = Array.isArray(rawSubComponents)
        ? rawSubComponents.map((sub, sIdx) => ({
            ...sub,
            id: sub.id || `${itemKey}_sub_${sIdx}`
          }))
        : undefined;

      return {
        ...item,
        product_id: effectiveProductId || matchedCatalogProduct?.id,
        sku: item.sku || matchedCatalogProduct?.sku,
        brand_make: item.brand_make || matchedCatalogProduct?.brand_make,
        model_part_no: item.model_part_no || matchedCatalogProduct?.model_part_no,
        country_of_origin: item.country_of_origin || matchedCatalogProduct?.country_of_origin,
        hs_code: compOverride.hs_code ?? item.hs_code ?? matchedCatalogProduct?.hs_code,
        image_url: resolvedImageUrl,
        secondary_image_url: resolvedSecondaryImageUrl,
        image_caption: resolvedImageCaption,
        secondary_image_caption: resolvedSecondaryImageCaption,
        image_adjustments: resolvedImageAdjustments,
        image_display_override: compOverride.image_display_override ?? item.image_display_override,
        image_size_override: compOverride.image_size_override ?? item.image_size_override,
        image_aspect_override: compOverride.image_aspect_override ?? item.image_aspect_override,
        datasheet_attachment: resolvedDatasheet,
        include_datasheet_in_quote: resolvedIncludeDatasheet,
        is_optional: resolvedOptional,
        visible_attributes: customVisible,
        page_break_after: customPageBreak,
        row_spacer_after_mm: compOverride.row_spacer_after_mm ?? item.row_spacer_after_mm,
        row_note: compOverride.row_note ?? item.row_note,
        row_highlight: compOverride.row_highlight ?? item.row_highlight,
        row_bold: compOverride.row_bold ?? item.row_bold,
        hide_row_price: compOverride.hide_row_price ?? item.hide_row_price,
        is_composite_set:
          compOverride.is_composite_set ??
          item.is_composite_set ??
          matchedCatalogProduct?.is_composite_set,
        sub_components: normalizedSubComponents,
        package_pricing_mode:
          compOverride.package_pricing_mode ??
          item.package_pricing_mode ??
          matchedCatalogProduct?.package_pricing_mode,
        option_scope_notes:
          compOverride.option_scope_notes ??
          item.option_scope_notes ??
          matchedCatalogProduct?.option_scope_notes,
        ...(compOverride.unit_price !== undefined ? { unit_price: compOverride.unit_price } : {}),
        ...(compOverride.cost_price !== undefined ? { cost_price: compOverride.cost_price } : {}),
        ...(compOverride.total_price !== undefined ? { total_price: compOverride.total_price } : {}),
        ...(compOverride.item_name !== undefined ? { item_name: compOverride.item_name } : {}),
        ...(compOverride.description !== undefined ? { description: compOverride.description } : {}),
        ...(compOverride.option !== undefined
          ? { option: compOverride.option, option_group: compOverride.option }
          : {})
      };
    });
  }, [
    customStudioLineItems,
    activeSourceQuotation,
    editingQuotation,
    enquiry?.line_items,
    itemVisibleAttributes,
    itemPageBreaks,
    itemImageOverrides,
    itemDatasheetToggles,
    itemOptionalOverrides,
    itemCompositeOverrides,
    itemLinkedProductIds,
    workspaceProducts
  ]);

  // Dynamically extract all unique attribute keys present across active line items
  const availableAttributeKeys = useMemo(() => {
    const keysSet = new Set<string>();
    quotationLineItems.forEach((item) => {
      const { extractedSpecsAttrs } = extractLineItemAttributesAndCleanDescription(item);
      extractedSpecsAttrs.forEach((a) => {
        if (a && a.key && a.key.trim()) keysSet.add(a.key.trim());
      });
      if (item.attributes && Array.isArray(item.attributes)) {
        item.attributes.forEach((a) => {
          if (a && a.key && a.key.trim()) {
            keysSet.add(a.key.trim());
          }
        });
      }
      const itemAny = item as any;
      if (itemAny.specs && Array.isArray(itemAny.specs)) {
        itemAny.specs.forEach((s: any) => {
          if (s && s.key && s.key.trim()) keysSet.add(s.key.trim());
        });
      }
    });
    return Array.from(keysSet);
  }, [quotationLineItems]);

  const toggleAttributeKeyVisibility = (key: string) => {
    setVisibleColumns((prev) => {
      const currentHidden = prev.hiddenAttributeKeys || [];
      const isCurrentlyHidden = currentHidden.includes(key);
      const updatedHidden = isCurrentlyHidden
        ? currentHidden.filter((k) => k !== key)
        : [...currentHidden, key];
      return { ...prev, hiddenAttributeKeys: updatedHidden };
    });
  };

  const showAllAttributes = () => {
    setVisibleColumns((prev) => ({
      ...prev,
      hiddenAttributeKeys: []
    }));
  };

  const hideAllAttributes = () => {
    setVisibleColumns((prev) => ({
      ...prev,
      hiddenAttributeKeys: [...availableAttributeKeys]
    }));
  };

  // Helper to extract all specification attribute keys for a specific line item
  const getItemAttributeKeys = useCallback((item: QuotationLineItem): string[] => {
    const keys: string[] = [];
    if (Array.isArray(item.attributes)) {
      item.attributes.forEach((a) => {
        if (a && a.key && a.key.trim() && !keys.includes(a.key.trim())) {
          keys.push(a.key.trim());
        }
      });
    }
    const itemAny = item as any;
    if (itemAny.attributes && typeof itemAny.attributes === 'object' && !Array.isArray(itemAny.attributes)) {
      Object.keys(itemAny.attributes).forEach((k) => {
        if (k.trim() && !keys.includes(k.trim())) keys.push(k.trim());
      });
    }
    if (Array.isArray(itemAny.specs)) {
      itemAny.specs.forEach((s: any) => {
        if (s && s.key && s.key.trim() && !keys.includes(s.key.trim())) keys.push(s.key.trim());
      });
    }
    if (Array.isArray(itemAny.specifications)) {
      itemAny.specifications.forEach((s: any) => {
        if (s && s.key && s.key.trim() && !keys.includes(s.key.trim())) keys.push(s.key.trim());
      });
    }
    if (item.brand_make && item.brand_make.trim() && item.brand_make !== '—' && !keys.includes('Brand')) {
      keys.push('Brand');
    }
    if (item.model_part_no && item.model_part_no.trim() && item.model_part_no !== '—' && !keys.includes('Model')) {
      keys.push('Model');
    }
    if (item.country_of_origin && item.country_of_origin.trim() && item.country_of_origin !== '—' && !keys.includes('Origin')) {
      keys.push('Origin');
    }
    if (item.availability && item.availability.trim() && !keys.includes('Delivery')) {
      keys.push('Delivery');
    }
    return keys;
  }, []);

  const toggleItemAttribute = (itemKey: string, allItemKeys: string[], attrKey: string) => {
    setItemVisibleAttributes((prev) => {
      const current = prev[itemKey] ?? allItemKeys;
      const isVisible = current.includes(attrKey);
      const updated = isVisible
        ? current.filter((k) => k !== attrKey)
        : [...current, attrKey];
      return {
        ...prev,
        [itemKey]: updated
      };
    });
  };

  const showAllItemAttributes = (itemKey: string, allItemKeys: string[]) => {
    setItemVisibleAttributes((prev) => ({
      ...prev,
      [itemKey]: [...allItemKeys]
    }));
  };

  const hideAllItemAttributes = (itemKey: string) => {
    setItemVisibleAttributes((prev) => ({
      ...prev,
      [itemKey]: []
    }));
  };

  const toggleItemPageBreak = (itemKey: string, currentVal?: boolean) => {
    const nextVal = !(itemPageBreaks[itemKey] !== undefined ? itemPageBreaks[itemKey] : Boolean(currentVal));
    setItemPageBreaks((prev) => ({
      ...prev,
      [itemKey]: nextVal
    }));
    setItemCompositeOverrides((prev) => ({
      ...prev,
      [itemKey]: {
        ...(prev[itemKey] || {}),
        page_break_after: nextVal
      }
    }));
    if (customStudioLineItems) {
      setCustomStudioLineItems((prev) =>
        prev
          ? prev.map((it, i) => ((it.id || `item_${i}`) === itemKey ? { ...it, page_break_after: nextVal } : it))
          : prev
      );
    }
  };

  const handleUpdateTopItemRowOption = (
    itemKey: string,
    patch: Partial<QuotationLineItem>
  ) => {
    if (patch.page_break_after !== undefined) {
      setItemPageBreaks((prev) => ({
        ...prev,
        [itemKey]: Boolean(patch.page_break_after)
      }));
    }
    setItemCompositeOverrides((prev) => ({
      ...prev,
      [itemKey]: {
        ...(prev[itemKey] || {}),
        ...patch
      }
    }));
    if (customStudioLineItems) {
      setCustomStudioLineItems((prev) =>
        prev
          ? prev.map((it, i) => ((it.id || `item_${i}`) === itemKey ? { ...it, ...patch } : it))
          : prev
      );
    }
  };

  const handleUpdateSubComponentRowOption = (
    itemKey: string,
    item: QuotationLineItem,
    subIdx: number,
    patch: Partial<LineItemComponent>
  ) => {
    const currentSubs = Array.isArray(item.sub_components) ? item.sub_components : [];
    const nextSubs = currentSubs.map((sub, i) =>
      i === subIdx
        ? {
            ...sub,
            id: sub.id || `${itemKey}_sub_${i}`,
            ...patch
          }
        : sub
    );
    setItemCompositeOverrides((prev) => ({
      ...prev,
      [itemKey]: {
        ...(prev[itemKey] || {}),
        sub_components: nextSubs
      }
    }));
    if (customStudioLineItems) {
      setCustomStudioLineItems((prev) =>
        prev
          ? prev.map((it, i) =>
              (it.id || `item_${i}`) === itemKey ? { ...it, sub_components: nextSubs } : it
            )
          : prev
      );
    }
  };

  // Choice B1 Price-Restore Memory for switching into/out of Unpriced Submittal / DO Mode
  const savedPricedConfigRef = useRef<{
    showUnitPrice: boolean;
    showLineTotal: boolean;
    totalsBlockVisible: boolean;
    showAmountInWords: boolean;
    optionDisplayMode: QuotationOptionDisplayMode;
  } | null>(null);

  const totalsLayoutBlock = useMemo(
    () => layoutBlocks.find((b) => b.id === 'totals'),
    [layoutBlocks]
  );
  const isTotalsBlockVisible = totalsLayoutBlock
    ? totalsLayoutBlock.enabled !== false && totalsLayoutBlock.is_visible !== false
    : true;
  const isUnpricedSubmittalMode =
    visibleColumns.showUnitPrice === false &&
    visibleColumns.showLineTotal === false &&
    !isTotalsBlockVisible;

  const handleEnterUnpricedSubmittalMode = () => {
    if (!isUnpricedSubmittalMode) {
      savedPricedConfigRef.current = {
        showUnitPrice:
          visibleColumns.unit_price !== false && visibleColumns.showUnitPrice !== false,
        showLineTotal: visibleColumns.showLineTotal !== false,
        totalsBlockVisible: isTotalsBlockVisible,
        showAmountInWords: amountInWordsEnabled,
        optionDisplayMode
      };
    }
    setVisibleColumns((prev) => ({
      ...prev,
      unit_price: false,
      showUnitPrice: false,
      showLineTotal: false
    }));
    setLayoutBlocks((prev) =>
      prev.map((b) =>
        b.id === 'totals' ? { ...b, enabled: false, is_visible: false } : b
      )
    );
  };

  const handleRestorePricedQuoteMode = (nextOptionMode?: QuotationOptionDisplayMode) => {
    const snap = savedPricedConfigRef.current;
    setVisibleColumns((prev) => ({
      ...prev,
      unit_price: snap ? snap.showUnitPrice : true,
      showUnitPrice: snap ? snap.showUnitPrice : true,
      showLineTotal: snap ? snap.showLineTotal : true
    }));
    setLayoutBlocks((prev) =>
      prev.map((b) =>
        b.id === 'totals'
          ? {
              ...b,
              enabled: snap ? snap.totalsBlockVisible : true,
              is_visible: snap ? snap.totalsBlockVisible : true
            }
          : b
      )
    );
    if (snap) {
      setAmountInWordsEnabled(snap.showAmountInWords);
    }
    if (nextOptionMode) {
      setOptionDisplayMode(nextOptionMode);
    } else if (snap?.optionDisplayMode) {
      setOptionDisplayMode(snap.optionDisplayMode);
    }
  };

  const handleBatchSetBomPricingMode = (mode: 'lump_sum' | 'itemized') => {
    setItemCompositeOverrides((prev) => {
      const next = { ...prev };
      quotationLineItems.forEach((item, idx) => {
        const isComp = Boolean(
          item.is_composite_set ||
            (Array.isArray(item.sub_components) && item.sub_components.length > 0)
        );
        if (isComp) {
          const itemKey = item.id || `item_${idx}`;
          next[itemKey] = {
            ...(next[itemKey] || {}),
            package_pricing_mode: mode
          };
        }
      });
      return next;
    });
    if (customStudioLineItems) {
      setCustomStudioLineItems((prev) =>
        prev
          ? prev.map((it) => {
              const isComp = Boolean(
                it.is_composite_set ||
                  (Array.isArray(it.sub_components) && it.sub_components.length > 0)
              );
              return isComp ? { ...it, package_pricing_mode: mode } : it;
            })
          : prev
      );
    }
  };

  // Calculate live financial figures based on active optionDisplayMode
  const financialTotals = useMemo(() => {
    const itemsForTotals =
      optionDisplayMode === 'option_c_only'
        ? quotationLineItems
            .filter((it) => {
              const opt = String(it.option || it.option_group || '').trim();
              return !opt || opt === 'Default / Included' || /^option\s*c\b/i.test(opt) || /^option\s*3\b/i.test(opt);
            })
            .map((it) => ({ ...it, is_optional: false }))
        : optionDisplayMode === 'option_b_only'
        ? quotationLineItems
            .filter((it) => {
              const opt = String(it.option || it.option_group || '').trim();
              return !opt || opt === 'Default / Included' || /^option\s*b\b/i.test(opt) || /^option\s*2\b/i.test(opt);
            })
            .map((it) => ({ ...it, is_optional: false }))
        : optionDisplayMode === 'option_a_only'
        ? quotationLineItems
            .filter((it) => {
              const opt = String(it.option || it.option_group || '').trim();
              return !opt || opt === 'Default / Included' || /^option\s*a\b/i.test(opt) || /^option\s*1\b/i.test(opt);
            })
            .map((it) => ({ ...it, is_optional: false }))
        : quotationLineItems;

    return QuotationRepository.calculateTotals(
      itemsForTotals,
      freightAmount,
      taxMode,
      taxRatePercent
    );
  }, [quotationLineItems, optionDisplayMode, freightAmount, taxMode, taxRatePercent]);

  // Dynamic Bank Profile Registry from workspace document profile
  const bankRegistry: BankAccountProfile[] = useMemo(() => {
    const list: any[] = activeProfile?.bank_accounts || profile?.bank_accounts || [];
    const accounts: BankAccountProfile[] = list.map((b, idx) => {
      const bankName = b.bankName || b.bank_name || 'Corporate Bank';
      const beneficiaryName =
        b.beneficiaryName || b.account_name || b.account_title || activeProfile?.legal_entity_name || '';
      const accountNumber = b.accountNumber || b.account_number || '';
      const iban = b.iban || '';
      const swiftCode = b.swiftCode || b.swift_bic || b.swift_code || '';
      const branchName = b.branchName || b.branch_address || '';
      return {
        id: b.id || `bank-${idx}`,
        bankName,
        beneficiaryName,
        accountNumber,
        iban,
        swiftCode,
        branchName,
        currency: b.currency || 'AED',
        isDefault: b.isDefault ?? b.is_default ?? false,
        bank_name: bankName,
        account_name: beneficiaryName,
        account_title: beneficiaryName,
        account_number: accountNumber,
        swift_bic: swiftCode,
        swift_code: swiftCode,
        branch_address: branchName
      };
    });

    if (accounts.length === 0 && editingQuotation?.applied_bank_account) {
      const b: any = editingQuotation.applied_bank_account;
      const bankName = b.bankName || b.bank_name || 'Corporate Bank';
      const beneficiaryName =
        b.beneficiaryName || b.account_name || b.account_title || activeProfile?.legal_entity_name || '';
      const accountNumber = b.accountNumber || b.account_number || '';
      const swiftCode = b.swiftCode || b.swift_bic || b.swift_code || '';
      const branchName = b.branchName || b.branch_address || '';
      accounts.push({
        id: b.id || 'quote-bank-applied',
        bankName,
        beneficiaryName,
        accountNumber,
        iban: b.iban || '',
        swiftCode,
        branchName,
        currency: b.currency || 'AED',
        isDefault: true,
        bank_name: bankName,
        account_name: beneficiaryName,
        account_title: beneficiaryName,
        account_number: accountNumber,
        swift_bic: swiftCode,
        swift_code: swiftCode,
        branch_address: branchName
      });
    }

    return accounts;
  }, [activeProfile, profile, editingQuotation]);

  // Selected bank account with custom override capability
  const activeBankAccount: DocumentProfileBankAccount | undefined = useMemo(() => {
    let base =
      bankRegistry.find((b) => b.id === selectedBankId) ||
      bankRegistry.find((b) => b.isDefault || b.is_default) ||
      bankRegistry[0];

    if (!base && !customBankOverride) return undefined;

    const bName = customBankOverride?.bankName ?? (base?.bankName || base?.bank_name || 'Corporate Bank');
    const bBeneficiary =
      customBankOverride?.beneficiaryName ??
      (base?.beneficiaryName || base?.account_name || base?.account_title || activeProfile?.legal_entity_name || '');
    const bAcctNo = customBankOverride?.accountNumber ?? (base?.accountNumber || base?.account_number || '');
    const bIban = customBankOverride?.iban ?? (base?.iban || '');
    const bSwift = customBankOverride?.swiftCode ?? (base?.swiftCode || base?.swift_bic || base?.swift_code || '');
    const bBranch = customBankOverride?.branchName ?? (base?.branchName || base?.branch_address || '');
    const bCurr = base?.currency || 'AED';

    return {
      id: base?.id || selectedBankId || 'active-bank',
      bankName: bName,
      bank_name: bName,
      beneficiaryName: bBeneficiary,
      account_name: bBeneficiary,
      account_title: bBeneficiary,
      accountNumber: bAcctNo,
      account_number: bAcctNo,
      iban: bIban,
      swiftCode: bSwift,
      swift_bic: bSwift,
      swift_code: bSwift,
      branchName: bBranch,
      branch_address: bBranch,
      currency: bCurr,
      isDefault: base?.isDefault || false,
      is_default: base?.is_default || false
    };
  }, [bankRegistry, selectedBankId, customBankOverride, activeProfile]);

  const activeBankProfile: BankAccountProfile | undefined = activeBankAccount as unknown as BankAccountProfile;

  const handleSelectBank = (bankId: string) => {
    setSelectedBankId(bankId);
    const target = bankRegistry.find((b) => b.id === bankId);
    if (target) {
      setCustomBankOverride({
        bankName: target.bankName,
        beneficiaryName: target.beneficiaryName,
        accountNumber: target.accountNumber,
        iban: target.iban,
        swiftCode: target.swiftCode,
        branchName: target.branchName
      });
      setFooterConfig((prev) => ({
        ...prev,
        remittanceBankId: bankId,
        selectedBank: target
      }));
    } else {
      setCustomBankOverride(null);
      setFooterConfig((prev) => ({
        ...prev,
        remittanceBankId: bankId
      }));
    }
  };

  const handleResetBankOverride = () => {
    const target = bankRegistry.find((b) => b.id === selectedBankId) || bankRegistry[0];
    if (target) {
      setCustomBankOverride({
        bankName: target.bankName,
        beneficiaryName: target.beneficiaryName,
        accountNumber: target.accountNumber,
        iban: target.iban,
        swiftCode: target.swiftCode,
        branchName: target.branchName
      });
      setFooterConfig((prev) => ({
        ...prev,
        remittanceBankId: target.id,
        selectedBank: target
      }));
    } else {
      setCustomBankOverride(null);
    }
  };

  // Resolved Signatories array
  const signatories = useMemo(() => {
    if (signatoryMode === 'none' || signatoryMode === 'stamp_only') return [];
    const primarySig = {
      name: signatoryName,
      designation: signatoryTitle,
      ...(signatureImageUrl ? { signature_url: signatureImageUrl } : {})
    };
    if (signatoryMode === 'dual') {
      return [
        primarySig,
        { name: secondarySignatoryName, designation: secondarySignatoryTitle }
      ];
    }
    return [primarySig];
  }, [
    signatoryMode,
    signatoryName,
    signatoryTitle,
    secondarySignatoryName,
    secondarySignatoryTitle,
    signatureImageUrl
  ]);

  // Derived validity date
  const validUntilDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + (Number(validityDays) || 30));
    return d.toISOString();
  }, [validityDays]);

  // Combined Annexes: Explicit studio flyers + Enquiry RFQ attachments marked for Quote Annex + Line-item Datasheets
  const resolvedFlyerAttachments = useMemo(() => {
    const merged: Attachment[] = [...flyerAttachments];
    const hasExisting = (url?: string, name?: string) =>
      merged.some(
        (existing) =>
          (url && existing.url === url) ||
          (name && existing.name.toLowerCase().trim() === name.toLowerCase().trim())
      );

    // 1. Enquiry RFQ attachments with include_in_quote_annex === true
    (enquiry?.attachments || []).forEach((att, idx) => {
      if (att.include_in_quote_annex && att.url && !hasExisting(att.url, att.name)) {
        const isImg = att.type?.startsWith('image/') || /\.(png|jpe?g|webp|gif|svg)$/i.test(att.name || '');
        merged.push({
          ...att,
          id: att.id || `enq_annex_${idx}`,
          render_as_annex_page: att.render_as_annex_page ?? isImg,
          page_placement: att.page_placement || (isImg ? 'annex_after' : 'index_only')
        });
      }
    });

    // 2. Line-item datasheets with include_datasheet_in_quote !== false
    quotationLineItems.forEach((item, idx) => {
      const ds = item.datasheet_attachment;
      if (ds && ds.url && item.include_datasheet_in_quote !== false && !hasExisting(ds.url, ds.name)) {
        const isImg = ds.type?.startsWith('image/') || /\.(png|jpe?g|webp|gif|svg)$/i.test(ds.name || '');
        merged.push({
          ...ds,
          id: ds.id || `item_ds_${item.id || idx}`,
          name: ds.name || `${item.item_name || 'Product'} Datasheet`,
          render_as_annex_page: ds.render_as_annex_page ?? isImg,
          page_placement: ds.page_placement || (isImg ? 'annex_after' : 'index_only')
        });
      }
    });

    return merged;
  }, [flyerAttachments, enquiry?.attachments, quotationLineItems]);

  // Constructed live Quotation object for preview
  const liveQuotation: Quotation = useMemo(() => {
    const rawQuoteNumber =
      editingQuotation?.quote_number ||
      enquiry.quote_ref_no ||
      `QT-${new Date().getFullYear()}-${String(enquiry.sn || 1).padStart(4, '0')}`;
    const cleanQuoteNumber = rawQuoteNumber.replace(/-R\d+$/, '');
    const revNum = revisionNumber ?? editingQuotation?.revision_number ?? 1;
    const formattedQuoteRef = formattedQuoteRefOverride
      ? formattedQuoteRefOverride.replace(/-R\d+$/i, `-R${revNum}`)
      : `${cleanQuoteNumber}-R${revNum}`;

    return {
      id: activeQuotationId || editingQuotation?.id || 'preview_draft',
      workspace_id: activeWorkspaceId,
      workspaceId: activeWorkspaceId,
      enquiry_id: enquiry.id || '',
      quote_number: cleanQuoteNumber,
      revision_number: revNum,
      formatted_quote_ref: formattedQuoteRef,
      parent_quote_id: parentQuotationId,
      parent_quotation_id: parentQuotationId,
      status: quotationStatus || 'Draft',
      client_snapshot: {
        entity_name:
          clientNameOverride || enquiry.company_name || enquiry.client_company || 'Valued Client',
        contact_person: clientContactPerson || enquiry.concerned_person || undefined,
        client_contact_person: clientContactPerson || enquiry.concerned_person || undefined,
        address:
          clientAddressOverride || enquiry.project_location || enquiry.country || undefined,
        client_address:
          clientAddressOverride || enquiry.project_location || enquiry.country || undefined,
        trn: clientTrnOverride || undefined,
        client_trn: clientTrnOverride || undefined
      },
      client_contact_person: clientContactPerson || undefined,
      client_address: clientAddressOverride || undefined,
      client_trn: clientTrnOverride || undefined,
      prepared_by: preparedBy || signatoryName,
      subject: quotationSubject,
      sender_snapshot: {
        entity_name:
          activeProfile?.legal_entity_name ||
          (activeProfile as any)?.company_name ||
          activeWorkspace?.name ||
          'Commercial Entity LLC',
        trn: activeProfile?.trn || (activeProfile as any)?.trn_vat_number,
        address:
          (activeProfile as any)?.registered_address ||
          [
            activeProfile?.address_line_1,
            activeProfile?.address_line_2,
            activeProfile?.city,
            activeProfile?.country
          ]
            .filter(Boolean)
            .join(', ') ||
          undefined,
        phone: activeProfile?.phone,
        email: activeProfile?.email
      },
      line_items: quotationLineItems,
      tax_mode: taxMode,
      subtotal: financialTotals.subtotal,
      freight_amount: financialTotals.freight_amount,
      tax_rate_percent: financialTotals.tax_rate_percent,
      tax_amount: financialTotals.tax_amount,
      grand_total: financialTotals.grand_total,
      price_basis: priceBasis,
      payment_terms: paymentTerms,
      custom_notes: customNotes,
      applied_terms: customNotes,
      applied_bank_account: activeBankAccount,
      remittanceBankId: selectedBankId,
      remittance_bank_id: selectedBankId,
      selectedBank: activeBankProfile,
      selected_bank: activeBankProfile,
      signatories: signatories,
      header_layout: headerLayout,
      table_density: tableDensity,
      table_font_scale: tableFontScale,
      fontSizeScale: fontSizeScale,
      font_size_scale: fontSizeScale,
      show_bank_details: showBankDetails,
      show_commercial_terms: showCommercialTerms,
      show_company_seal: showCompanySeal,
      theme_accent: themeAccent,
      customThemeColor: customThemeColor || undefined,
      logo_position: logoPosition,
      amount_in_words_enabled: amountInWordsEnabled,
      showAmountInWords: amountInWordsEnabled,
      show_amount_in_words: amountInWordsEnabled,
      customer_acceptance_enabled: customerAcceptanceEnabled,
      showBankRemittance: footerConfig.showBankRemittance !== false,
      showCustomerAcceptance: footerConfig.showCustomerAcceptance !== false,
      showSignatories: footerConfig.showSignatories !== false,
      footerLayoutMode: footerConfig.footerLayoutMode || 'split',
      signatory_type: signatoryType,
      primary_signatory_name: signatoryName,
      primary_signatory_title: signatoryTitle,
      secondary_signatory_name: secondarySignatoryName,
      secondary_signatory_title: secondarySignatoryTitle,
      signature_style: signatureStyle,
      company_logo_url: companyLogoUrl || headerConfig.logoUrl || undefined,
      company_seal_url: companySealUrl || footerConfig.companySealUrl || undefined,
      signature_image_url: signatureImageUrl || footerConfig.signatureImageUrl || undefined,
      block_style: blockStyle,
      globalCardRadius: globalCardRadius,
      documentFontFamily: headerConfig.documentFontFamily || 'sans',
      topAccentBarStyle: headerConfig.topAccentBarStyle || 'thick',
      tableHeaderStyle: headerConfig.tableHeaderStyle || 'tinted',
      blockHeaderStyle: headerConfig.blockHeaderStyle || 'underline',
      companyNameOverride: headerConfig.companyNameOverride || undefined,
      cardsOrder: cardsOrder,
      subjectPlacement: subjectPlacement,
      pageMode: pageMode,
      option_display_mode: optionDisplayMode,
      option_group_titles: optionGroupTitles,
      show_combined_options_total: showCombinedOptionsTotal,
      layout_blocks: layoutBlocks,
      flyer_attachments: resolvedFlyerAttachments,
      show_submittals_index: showSubmittalsIndex,
      header_config: {
        ...headerConfig,
        ...(companyLogoUrl !== undefined && companyLogoUrl !== ''
          ? { logoUrl: companyLogoUrl }
          : {})
      },
      recipient_config: recipientConfig,
      footer_config: {
        ...footerConfig,
        pageMode: pageMode,
        remittanceBankId: selectedBankId,
        selectedBank: activeBankProfile,
        ...(companySealUrl ? { companySealUrl } : {}),
        ...(signatureImageUrl ? { signatureImageUrl } : {})
      },
      visible_columns: visibleColumns,
      omitted_fields: omittedFields,
      auto_paginate_items: autoPaginateItems,
      created_at: editingQuotation?.created_at || new Date().toISOString(),
      valid_until: validUntilDate,
      currency: (enquiry.currency as string) || activeBankAccount?.currency || 'AED'
    };
  }, [
    editingQuotation,
    activeWorkspaceId,
    activeWorkspace,
    enquiry,
    activeProfile,
    quotationLineItems,
    taxMode,
    financialTotals,
    customNotes,
    priceBasis,
    paymentTerms,
    validityDays,
    activeBankAccount,
    signatories,
    validUntilDate,
    headerLayout,
    tableDensity,
    showBankDetails,
    showCommercialTerms,
    showCompanySeal,
    themeAccent,
    customThemeColor,
    logoPosition,
    amountInWordsEnabled,
    customerAcceptanceEnabled,
    signatoryType,
    signatoryName,
    signatoryTitle,
    secondarySignatoryName,
    secondarySignatoryTitle,
    signatureStyle,
    companyLogoUrl,
    companySealUrl,
    signatureImageUrl,
    blockStyle,
    globalCardRadius,
    cardsOrder,
    subjectPlacement,
    layoutBlocks,
    resolvedFlyerAttachments,
    showSubmittalsIndex,
    headerConfig,
    recipientConfig,
    footerConfig,
    visibleColumns,
    omittedFields,
    autoPaginateItems,
    clientContactPerson,
    clientNameOverride,
    clientAddressOverride,
    clientTrnOverride,
    preparedBy,
    quotationSubject,
    pageMode,
    optionDisplayMode,
    optionGroupTitles,
    showCombinedOptionsTotal,
    activeQuotationId,
    parentQuotationId,
    revisionNumber,
    formattedQuoteRefOverride,
    quotationStatus
  ]);

  // Smart '@' Token Resolution Context & Map
  const studioTokenContext = useMemo<QuotationTokenContext>(
    () => ({
      quotation: liveQuotation,
      enquiry,
      profile: activeProfile,
      omittedFields,
      activeBank: activeBankAccount || undefined,
      amountInWordsText: amountToWords(
        Number(liveQuotation.grand_total || 0),
        liveQuotation.currency || 'AED'
      )
    }),
    [liveQuotation, enquiry, activeProfile, omittedFields, activeBankAccount]
  );

  const studioTokenMap = useMemo(
    () => buildQuotationTokenMap(studioTokenContext),
    [studioTokenContext]
  );

  // 2-Way Synchronized Field Omission Toggle: updates omittedFields AND structural card/block visibility
  const handleToggleFieldOmission = useCallback(
    (tagDef: QuotationAtTagDefinition) => {
      const willBeOmitted = !omittedFields[tagDef.key];
      const willBeVisible = !willBeOmitted;
      setOmittedFields((prev) => ({
        ...prev,
        [tagDef.key]: willBeOmitted
      }));

      const sync = tagDef.structuralSyncTarget;
      if (!sync) return;

      if (sync === 'recipient.contact_person') {
        setRecipientConfig((prev) => ({ ...prev, showAttention: willBeVisible }));
      } else if (sync === 'recipient.trn') {
        setRecipientConfig((prev) => ({ ...prev, showCustomerTrn: willBeVisible }));
      } else if (sync === 'offer.enquiry_ref') {
        setRecipientConfig((prev) => ({ ...prev, showEnquiryRef: willBeVisible }));
      } else if (sync === 'offer.valid_until') {
        setRecipientConfig((prev) => ({ ...prev, showValidity: willBeVisible }));
      } else if (sync === 'offer.sales_person') {
        setRecipientConfig((prev) => ({ ...prev, showSalesRep: willBeVisible }));
      } else if (sync === 'subject.banner') {
        setRecipientConfig((prev) => ({ ...prev, showSubject: willBeVisible }));
      } else if (sync === 'header.company_name') {
        setHeaderConfig((prev) => ({ ...prev, showCompanyName: willBeVisible }));
      } else if (sync === 'header.trn') {
        setHeaderConfig((prev) => ({ ...prev, showTrn: willBeVisible }));
      } else if (sync === 'header.phone') {
        setHeaderConfig((prev) => ({ ...prev, showPhone: willBeVisible }));
      } else if (sync === 'header.email') {
        setHeaderConfig((prev) => ({ ...prev, showEmail: willBeVisible }));
      } else if (sync.startsWith('terms.')) {
        const fieldKey = sync.replace('terms.', '');
        setLayoutBlocks((prev) =>
          prev.map((b) =>
            b.id === 'terms'
              ? {
                  ...b,
                  visibleFields: {
                    ...(b.visibleFields || {}),
                    [fieldKey]: willBeVisible
                  }
                }
              : b
          )
        );
      } else if (sync.startsWith('remittance.')) {
        const fieldKey = sync.replace('remittance.', '');
        setLayoutBlocks((prev) =>
          prev.map((b) =>
            b.id === 'remittance'
              ? {
                  ...b,
                  visibleFields: {
                    ...(b.visibleFields || {}),
                    [fieldKey]: willBeVisible
                  }
                }
              : b
          )
        );
      }
    },
    [omittedFields]
  );

  const triggerPrintAfterImagesDecode = useCallback(async () => {
    try {
      const portalEl = document.getElementById('quotation-print-portal') || document.getElementById('quotation-printable-document');
      if (portalEl) {
        const imgs = Array.from(portalEl.querySelectorAll('img'));
        await Promise.all(
          imgs.map((img) => {
            if (img.complete && img.naturalWidth > 0) return Promise.resolve();
            if (typeof img.decode === 'function') {
              return img.decode().catch(() => {});
            }
            return new Promise<void>((resolve) => {
              img.addEventListener('load', () => resolve(), { once: true });
              img.addEventListener('error', () => resolve(), { once: true });
              window.setTimeout(resolve, 1500);
            });
          })
        );
      }
    } catch {
      // ignore image decode timeout
    }
    window.print();
  }, []);

  const handleRequestPrint = useCallback(() => {
    const warnings = findUnknownAtTokensInQuotation(liveQuotation);
    if (warnings.length > 0) {
      setPendingPrintWarnings(warnings);
    } else {
      triggerPrintAfterImagesDecode();
    }
  }, [liveQuotation, triggerPrintAfterImagesDecode]);

  // Direct On-Canvas Click-to-Edit Handler for Focused Section / Block Text
  const handleInlineFieldEdit = useCallback(
    (fieldKey: string, nextValue: string) => {
      if (fieldKey.startsWith('header_field:')) {
        const targetId = fieldKey.replace('header_field:', '');
        setHeaderConfig((prev) => {
          const currentFields = resolveHeaderFields(
            prev,
            activeProfile,
            liveQuotation.sender_snapshot
          ).allFields;
          const updatedFields = currentFields.map((f) =>
            f.id === targetId ? { ...f, valueOverride: nextValue } : f
          );
          return {
            ...prev,
            headerFields: updatedFields
          };
        });
        return;
      }

      switch (fieldKey) {
        case 'subject':
          setQuotationSubject(nextValue);
          break;
        case 'client_name':
          setClientNameOverride(nextValue);
          break;
        case 'client_contact_person':
          setClientContactPerson(nextValue);
          break;
        case 'client_address':
          setClientAddressOverride(nextValue);
          break;
        case 'client_trn':
          setClientTrnOverride(nextValue);
          break;
        case 'prepared_by':
          setPreparedBy(nextValue);
          break;
        case 'price_basis':
          setPriceBasis(nextValue);
          break;
        case 'payment_terms':
          setPaymentTerms(nextValue);
          break;
        case 'custom_notes':
          setCustomNotes(nextValue);
          break;
        case 'primary_signatory_name':
          setSignatoryName(nextValue);
          break;
        case 'primary_signatory_title':
          setSignatoryTitle(nextValue);
          break;
        case 'secondary_signatory_name':
          setSecondarySignatoryName(nextValue);
          break;
        case 'secondary_signatory_title':
          setSecondarySignatoryTitle(nextValue);
          break;
        case 'footer_disclaimer':
          setFooterConfig((prev) => ({
            ...prev,
            customDisclaimerText: nextValue
          }));
          break;
        default:
          break;
      }
    },
    [activeProfile, liveQuotation.sender_snapshot]
  );

  // Switch between revisions in-studio (R1 <-> R2) without leaving the modal
  const handleSelectRevisionInStudio = (targetQuote: Quotation) => {
    setEnquiryRevisions((prev) =>
      prev.map((q) => (q.id === liveQuotation.id ? { ...liveQuotation } : q))
    );
    hydrateStudioFromQuotation(targetQuote);
    triggerToast?.(
      `Switched to Revision R${targetQuote.revision_number || 1} (${targetQuote.status || 'Draft'})`,
      'info'
    );
  };

  // One-click deep-clone revision handler (R1 -> R2, etc.) — refreshes snapshot from live enquiry/profile for the new Draft revision
  const handleCloneAsNextRevision = () => {
    const cloned = QuotationRepository.cloneQuotationAsNextRevision(
      liveQuotation,
      enquiryRevisions,
      { enquiry, profile: activeProfile }
    );
    setEnquiryRevisions((prev) => {
      const withCurrent = prev.some((q) => q.id === liveQuotation.id)
        ? prev.map((q) => (q.id === liveQuotation.id ? { ...liveQuotation } : q))
        : [...prev, { ...liveQuotation }];
      const supersededChain = QuotationRepository.markPreviousRevisionsSuperseded(
        [...withCurrent, cloned],
        cloned.id!
      );
      return supersededChain.sort((a, b) => (a.revision_number || 1) - (b.revision_number || 1));
    });
    hydrateStudioFromQuotation(cloned);
    triggerToast?.(`Cloned as Revision R${cloned.revision_number}`, 'success');
  };

  // Handle Save (Draft, Issued, or Custom Lifecycle Status)
  const handleSaveQuotation = async (statusOverride?: Quotation['status']) => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const effectiveStatus = statusOverride || quotationStatus || 'Draft';
      setQuotationStatus(effectiveStatus);

      const quoteId =
        activeQuotationId && activeQuotationId !== 'preview_draft'
          ? activeQuotationId
          : editingQuotation?.id ||
            `quote_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

      const payload: Quotation = {
        id: quoteId,
        workspace_id: activeWorkspaceId,
        workspaceId: activeWorkspaceId,
        enquiry_id: enquiry.id || '',
        quote_number: liveQuotation.quote_number,
        revision_number: liveQuotation.revision_number,
        formatted_quote_ref: liveQuotation.formatted_quote_ref,
        parent_quote_id: liveQuotation.parent_quotation_id || liveQuotation.parent_quote_id,
        parent_quotation_id: liveQuotation.parent_quotation_id || liveQuotation.parent_quote_id,
        status: effectiveStatus,
        client_snapshot: liveQuotation.client_snapshot,
        client_contact_person: clientContactPerson || liveQuotation.client_contact_person,
        prepared_by: preparedBy || liveQuotation.prepared_by,
        subject: quotationSubject || liveQuotation.subject,
        sender_snapshot: liveQuotation.sender_snapshot,
        line_items: liveQuotation.line_items,
        option_display_mode: optionDisplayMode,
        option_group_titles: optionGroupTitles,
        show_combined_options_total: showCombinedOptionsTotal,
        tax_mode: liveQuotation.tax_mode,
        subtotal: liveQuotation.subtotal,
        freight_amount: liveQuotation.freight_amount,
        tax_rate_percent: liveQuotation.tax_rate_percent,
        tax_amount: liveQuotation.tax_amount,
        grand_total: liveQuotation.grand_total,
        price_basis: priceBasis,
        payment_terms: paymentTerms,
        custom_notes: customNotes,
        applied_terms: customNotes,
        applied_bank_account: liveQuotation.applied_bank_account,
        remittanceBankId: selectedBankId,
        remittance_bank_id: selectedBankId,
        selectedBank: activeBankProfile,
        selected_bank: activeBankProfile,
        signatories: liveQuotation.signatories,
        header_layout: headerLayout,
        table_density: tableDensity,
        table_font_scale: tableFontScale,
        fontSizeScale: fontSizeScale,
        font_size_scale: fontSizeScale,
        show_bank_details: showBankDetails,
        show_commercial_terms: showCommercialTerms,
        show_company_seal: showCompanySeal,
        theme_accent: themeAccent,
        customThemeColor: customThemeColor || undefined,
        logo_position: logoPosition,
        amount_in_words_enabled: amountInWordsEnabled,
        showAmountInWords: amountInWordsEnabled,
        show_amount_in_words: amountInWordsEnabled,
        customer_acceptance_enabled: customerAcceptanceEnabled,
        showBankRemittance: footerConfig.showBankRemittance !== false,
        showCustomerAcceptance: footerConfig.showCustomerAcceptance !== false,
        showSignatories: footerConfig.showSignatories !== false,
        footerLayoutMode: footerConfig.footerLayoutMode || 'split',
        signatory_type: signatoryType,
        primary_signatory_name: signatoryName,
        primary_signatory_title: signatoryTitle,
        secondary_signatory_name: secondarySignatoryName,
        secondary_signatory_title: secondarySignatoryTitle,
        signature_style: signatureStyle,
        company_logo_url: companyLogoUrl || headerConfig.logoUrl || undefined,
        company_seal_url: companySealUrl || footerConfig.companySealUrl || undefined,
        signature_image_url: signatureImageUrl || footerConfig.signatureImageUrl || undefined,
        block_style: blockStyle,
        globalCardRadius: globalCardRadius,
        cardsOrder: cardsOrder,
        subjectPlacement: subjectPlacement,
        pageMode: pageMode,
        layout_blocks: layoutBlocks,
        flyer_attachments: resolvedFlyerAttachments,
        show_submittals_index: showSubmittalsIndex,
        header_config: {
          ...headerConfig,
          ...(companyLogoUrl !== undefined && companyLogoUrl !== ''
            ? { logoUrl: companyLogoUrl }
            : {})
        },
        recipient_config: recipientConfig,
        footer_config: {
          ...footerConfig,
          pageMode: pageMode,
          remittanceBankId: selectedBankId,
          selectedBank: activeBankProfile,
          ...(companySealUrl ? { companySealUrl } : {}),
          ...(signatureImageUrl ? { signatureImageUrl } : {})
        },
        visible_columns: visibleColumns as any,
        omitted_fields: omittedFields,
        auto_paginate_items: autoPaginateItems,
        created_at: editingQuotation?.created_at || new Date().toISOString(),
        valid_until: liveQuotation.valid_until,
        currency: liveQuotation.currency
      };

      const saved = await QuotationRepository.saveQuotation(payload);

      // Mark superseded revisions where applicable and sync Enquiry pipeline fields
      const parentId = payload.parent_quotation_id || payload.parent_quote_id;
      if (parentId) {
        try {
          await QuotationRepository.updateQuotation(parentId, {
            status: 'Superseded',
            superseded_by_id: saved.id
          });
        } catch (supErr) {
          console.warn('[QuotationStudioModal] Predecessor update notice:', supErr);
        }
      }

      const syncPayload = await QuotationRepository.syncQuotationRevisionAndEnquiry(saved);
      onEnquirySync?.(syncPayload);

      triggerToast?.(
        effectiveStatus === 'Sent'
          ? `Quotation #${saved.formatted_quote_ref} issued successfully!`
          : `Quotation #${saved.formatted_quote_ref} (${effectiveStatus}) saved!`,
        'success'
      );

      if (onQuotationCreated) {
        onQuotationCreated(saved);
      }
      onClose();
    } catch (err) {
      console.error('[QuotationStudioModal] Error saving quotation:', err);
      triggerToast?.('Failed to save quotation. Please try again.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Construct complete Phase 1 & Phase 2 preset snapshot from current studio settings
  const buildCurrentPresetPayload = (
    presetName: string,
    isDefault?: boolean
  ): Omit<QuotationPreset, 'id'> => {
    return QuotationRepository.serializePresetSnapshot({
      workspace_id: activeWorkspaceId,
      workspaceId: activeWorkspaceId,
      preset_name: presetName.trim(),
      is_default: Boolean(isDefault),
      header_profile_id: activeProfile?.id,
      visible_columns: {
        ...visibleColumns,
        unit_price: visibleColumns.showUnitPrice !== false,
        showUnitPrice: visibleColumns.showUnitPrice !== false,
        showUom: visibleColumns.showUom !== false,
        showLineTotal: visibleColumns.showLineTotal !== false,
        showItemAttributes: visibleColumns.showItemAttributes !== false,
        attributeDisplayFormat: visibleColumns.attributeDisplayFormat || 'pills',
        hiddenAttributeKeys: visibleColumns.hiddenAttributeKeys || [],
        showAmountInWords: amountInWordsEnabled
      },
      default_tax_mode: taxMode,
      default_price_basis: priceBasis,
      default_payment_terms: paymentTerms,
      default_validity_days: validityDays,
      signatory_mode: signatoryMode,
      notes_template: customNotes,
      header_layout: headerLayout,
      table_density: tableDensity,
      table_font_scale: tableFontScale,
      fontSizeScale: fontSizeScale,
      font_size_scale: fontSizeScale,
      show_bank_details: showBankDetails,
      show_commercial_terms: showCommercialTerms,
      show_company_seal: showCompanySeal,
      theme_accent: themeAccent,
      customThemeColor: customThemeColor || undefined,
      amount_in_words_enabled: amountInWordsEnabled,
      customer_acceptance_enabled: customerAcceptanceEnabled,
      showBankRemittance: footerConfig.showBankRemittance !== false,
      showCustomerAcceptance: footerConfig.showCustomerAcceptance !== false,
      showSignatories: footerConfig.showSignatories !== false,
      footerLayoutMode: footerConfig.footerLayoutMode || 'split',
      signatory_type: signatoryType,
      primary_signatory_name: signatoryName,
      primary_signatory_title: signatoryTitle,
      secondary_signatory_name: secondarySignatoryName,
      secondary_signatory_title: secondarySignatoryTitle,
      signature_style: signatureStyle,
      company_logo_url: companyLogoUrl || headerConfig.logoUrl || undefined,
      company_seal_url: companySealUrl || footerConfig.companySealUrl || undefined,
      signature_image_url: signatureImageUrl || footerConfig.signatureImageUrl || undefined,
      logo_position: logoPosition,
      block_style: blockStyle,
      globalCardRadius: globalCardRadius,
      documentFontFamily: headerConfig.documentFontFamily || 'sans',
      topAccentBarStyle: headerConfig.topAccentBarStyle || 'thick',
      tableHeaderStyle: headerConfig.tableHeaderStyle || 'tinted',
      blockHeaderStyle: headerConfig.blockHeaderStyle || 'underline',
      companyNameOverride: headerConfig.companyNameOverride || undefined,
      cardsOrder: cardsOrder,
      subjectPlacement: subjectPlacement,
      pageMode: pageMode,
      option_display_mode: optionDisplayMode,
      option_group_titles: optionGroupTitles,
      show_combined_options_total: showCombinedOptionsTotal,
      layout_blocks: layoutBlocks,
      flyer_attachments: flyerAttachments,
      show_submittals_index: showSubmittalsIndex,
      header_config: {
        ...headerConfig,
        ...(companyLogoUrl !== undefined && companyLogoUrl !== ''
          ? { logoUrl: companyLogoUrl }
          : {})
      },
      recipient_config: {
        ...recipientConfig,
        globalCardRadius,
        cardsOrder,
        subjectPlacement
      },
      remittanceBankId: selectedBankId,
      remittance_bank_id: selectedBankId,
      selectedBank: activeBankProfile,
      selected_bank: activeBankProfile,
      footer_config: {
        ...footerConfig,
        pageMode: pageMode,
        remittanceBankId: selectedBankId,
        selectedBank: activeBankProfile,
        ...(companySealUrl ? { companySealUrl } : {}),
        ...(signatureImageUrl ? { signatureImageUrl } : {})
      },
      omitted_fields: omittedFields,
      auto_paginate_items: autoPaginateItems
    });
  };

  // Handle Save as New Template Preset
  const handleSaveNewPreset = async () => {
    if (!newPresetName.trim()) {
      triggerToast?.('Please enter a preset name.', 'error');
      return;
    }
    setIsSavingPreset(true);
    try {
      const presetData = buildCurrentPresetPayload(
        newPresetName.trim(),
        presets.length === 0
      );

      const saved = await QuotationRepository.savePreset(presetData);
      setPresets((prev) => QuotationRepository.applyPresetUpdateInList(prev, saved));
      setSelectedPresetId(saved.id || '');
      setIsSavePresetModalOpen(false);
      setNewPresetName('');
      triggerToast?.(`Template preset "${saved.preset_name}" saved successfully!`, 'success');
    } catch (err) {
      console.error('[QuotationStudioModal] Error saving preset:', err);
      triggerToast?.('Failed to save preset.', 'error');
    } finally {
      setIsSavingPreset(false);
    }
  };

  // Selected custom preset object
  const selectedPreset = useMemo(
    () => presets.find((p) => p.id === selectedPresetId),
    [presets, selectedPresetId]
  );

  // Overwrite currently selected custom preset with all current studio settings
  const handleUpdatePreset = async () => {
    if (!selectedPresetId || !selectedPreset) return;
    setIsSavingPreset(true);
    try {
      const payload = buildCurrentPresetPayload(
        selectedPreset.preset_name,
        selectedPreset.is_default
      );
      const updated = await QuotationRepository.updatePreset(selectedPresetId, {
        ...payload,
        id: selectedPresetId,
        createdAt: selectedPreset.createdAt
      });
      setPresets((prev) => QuotationRepository.applyPresetUpdateInList(prev, updated));
      triggerToast?.(`Preset "${updated.preset_name}" updated with current studio settings!`, 'success');
    } catch (err) {
      console.error('[QuotationStudioModal] Error updating preset:', err);
      triggerToast?.('Failed to update preset.', 'error');
    } finally {
      setIsSavingPreset(false);
    }
  };

  // Save current Studio configuration directly to the Active Workspace Document Profile AND Active/Default Preset
  const handleSaveToActiveProfileAndPreset = async (closeAfterSave = false) => {
    if (isSaving || isSavingPreset) return;
    setIsSavingPreset(true);
    try {
      const resolvedLogoUrl = companyLogoUrl || headerConfig.logoUrl || activeProfile?.logo_url || '';
      const resolvedSealUrl =
        companySealUrl ||
        footerConfig.companySealUrl ||
        activeProfile?.company_seal_url ||
        activeProfile?.stamp_seal_url ||
        '';
      const resolvedSigUrl =
        signatureImageUrl ||
        footerConfig.signatureImageUrl ||
        activeProfile?.signature_image_url ||
        '';

      const getHeaderFieldOverride = (fieldId: string): string | undefined => {
        const found = headerConfig.headerFields?.find((f) => f.id === fieldId);
        return found?.valueOverride !== undefined && found.valueOverride.trim() !== ''
          ? found.valueOverride.trim()
          : undefined;
      };

      const resolvedTrn =
        getHeaderFieldOverride('trn') ??
        activeProfile?.trn ??
        (activeProfile as any)?.tax_registration_number ??
        '';

      const updatedProfilePayload: WorkspaceDocumentProfile & { workspace_id: string } = {
        ...(activeProfile || ({} as WorkspaceDocumentProfile)),
        id: activeProfile?.id || `doc_prof_${activeWorkspaceId}`,
        workspace_id: activeWorkspaceId || activeProfile?.workspace_id || 'default',
        legal_entity_name:
          getHeaderFieldOverride('company_name') ||
          activeProfile?.legal_entity_name ||
          activeWorkspace?.name ||
          'Corporate Entity',
        short_brand_name: activeProfile?.short_brand_name || activeWorkspace?.name || '',
        logo_url: resolvedLogoUrl,
        company_seal_url: resolvedSealUrl,
        stamp_seal_url: resolvedSealUrl,
        signature_image_url: resolvedSigUrl,
        tax_registration_label:
          (activeProfile as any)?.tax_registration_label || 'TRN / VAT Reg',
        trn: resolvedTrn,
        tax_registration_number: resolvedTrn,
        address_line_1:
          getHeaderFieldOverride('address') ?? activeProfile?.address_line_1 ?? '',
        address_line_2: activeProfile?.address_line_2 ?? '',
        city: activeProfile?.city ?? '',
        country: activeProfile?.country ?? 'UAE',
        phone: getHeaderFieldOverride('phone') ?? activeProfile?.phone ?? '',
        email: getHeaderFieldOverride('email') ?? activeProfile?.email ?? '',
        website: getHeaderFieldOverride('website') ?? activeProfile?.website ?? '',
        accent_color: customThemeColor || activeProfile?.accent_color || '#1e293b',
        theme_accent: themeAccent,
        customThemeColor: customThemeColor || undefined,
        block_style: blockStyle,
        globalCardRadius: globalCardRadius,
        cardsOrder: cardsOrder,
        subjectPlacement: subjectPlacement,
        header_layout: headerLayout,
        logo_position: logoPosition,
        table_density: tableDensity,
        table_font_scale: tableFontScale,
        fontSizeScale: fontSizeScale,
        font_size_scale: fontSizeScale,
        show_bank_details: showBankDetails,
        show_commercial_terms: showCommercialTerms,
        show_company_seal: showCompanySeal,
        amount_in_words_enabled: amountInWordsEnabled,
        showAmountInWords: amountInWordsEnabled,
        customer_acceptance_enabled: customerAcceptanceEnabled,
        signatory_type: signatoryType,
        signature_style: signatureStyle,
        primary_signatory_name: signatoryName,
        primary_signatory_title: signatoryTitle,
        secondary_signatory_name: secondarySignatoryName,
        secondary_signatory_title: secondarySignatoryTitle,
        default_notes: customNotes,
        bank_accounts: activeProfile?.bank_accounts || [],
        header_config: {
          ...headerConfig,
          logoUrl: resolvedLogoUrl
        },
        recipient_config: {
          ...recipientConfig,
          globalCardRadius,
          cardsOrder,
          subjectPlacement
        },
        footer_config: {
          ...footerConfig,
          pageMode,
          remittanceBankId: selectedBankId,
          ...(resolvedSealUrl ? { companySealUrl: resolvedSealUrl } : {}),
          ...(resolvedSigUrl ? { signatureImageUrl: resolvedSigUrl } : {})
        },
        layout_blocks: layoutBlocks,
        saved_custom_blocks: savedCustomBlocks,
        visible_columns: {
          ...visibleColumns,
          unit_price: visibleColumns.showUnitPrice !== false,
          showUnitPrice: visibleColumns.showUnitPrice !== false,
          showUom: visibleColumns.showUom !== false,
          showLineTotal: visibleColumns.showLineTotal !== false,
          showItemAttributes: visibleColumns.showItemAttributes !== false,
          showAmountInWords: amountInWordsEnabled
        },
        updated_at: new Date().toISOString()
      };

      const savedProfile = await QuotationRepository.saveWorkspaceDocumentProfile(
        updatedProfilePayload
      );
      setWorkspaceProfile(savedProfile);

      // Also update the active or default preset if one exists
      const targetPreset =
        selectedPreset || presets.find((p) => p.is_default) || presets[0];
      let savedPreset: QuotationPreset | undefined = undefined;
      if (targetPreset && targetPreset.id) {
        const presetPayload = buildCurrentPresetPayload(
          targetPreset.preset_name,
          targetPreset.is_default
        );
        savedPreset = await QuotationRepository.updatePreset(targetPreset.id, {
          ...presetPayload,
          id: targetPreset.id,
          createdAt: targetPreset.createdAt
        });
        setPresets((prev) =>
          QuotationRepository.applyPresetUpdateInList(prev, savedPreset!)
        );
      }

      onProfileAndPresetSaved?.(savedProfile, savedPreset);

      triggerToast?.(
        savedPreset
          ? `Saved changes to Workspace Profile & "${savedPreset.preset_name}" preset!`
          : 'Saved changes to Workspace Document Profile!',
        'success'
      );

      if (closeAfterSave) {
        onClose();
      }
    } catch (err) {
      console.error('[QuotationStudioModal] Error saving to active profile & preset:', err);
      triggerToast?.('Failed to save changes to profile & preset.', 'error');
    } finally {
      setIsSavingPreset(false);
    }
  };

  // Mark currently selected preset as the workspace default
  const handleSetDefaultPreset = async () => {
    if (!selectedPresetId || !selectedPreset) return;
    setIsSavingPreset(true);
    try {
      await QuotationRepository.setDefaultPreset(activeWorkspaceId, selectedPresetId);
      setPresets((prev) =>
        QuotationRepository.applyDefaultPresetInList(prev, selectedPresetId)
      );
      triggerToast?.(`"${selectedPreset.preset_name}" set as default preset!`, 'success');
    } catch (err) {
      console.error('[QuotationStudioModal] Error setting default preset:', err);
      triggerToast?.('Failed to set default preset.', 'error');
    } finally {
      setIsSavingPreset(false);
    }
  };

  // Delete currently selected custom preset with guard so system template is never broken
  const handleDeletePreset = async () => {
    if (!selectedPresetId || !selectedPreset) return;
    const deletedName = selectedPreset.presetName || selectedPreset.preset_name;
    setIsSavingPreset(true);
    try {
      await QuotationRepository.deletePreset(selectedPresetId);
      const remaining = presets.filter((p) => p.id !== selectedPresetId);
      setPresets(remaining);
      const fallbackDefault = remaining.find((p) => p.is_default);
      if (fallbackDefault) {
        applyPreset(fallbackDefault);
      } else {
        setSelectedPresetId('');
      }
      triggerToast?.(`Preset "${deletedName}" deleted.`, 'info');
    } catch (err) {
      console.error('[QuotationStudioModal] Error deleting preset:', err);
      triggerToast?.('Failed to delete preset.', 'error');
    } finally {
      setIsSavingPreset(false);
    }
  };

  return (
    <div className="quotation-modal-container fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-hidden print:hidden">
      {/* Top-Level Hidden File Inputs (Always mounted regardless of which Left Tab or Right Inspector is open) */}
      <input
        ref={logoFileInputRef}
        type="file"
        accept="image/*"
        onChange={handleUploadCompanyLogo}
        className="hidden"
      />
      <input
        ref={sealFileInputRef}
        type="file"
        accept="image/*"
        onChange={handleUploadCompanySeal}
        className="hidden"
      />
      <input
        ref={signatureFileInputRef}
        type="file"
        accept="image/*"
        onChange={handleUploadSignatureImage}
        className="hidden"
      />
      <input
        ref={annexFileInputRef}
        type="file"
        accept="image/*,.pdf"
        multiple
        onChange={handleUploadAnnexFiles}
        className="hidden"
      />

      <div className="bg-slate-50 w-[96vw] max-w-[1600px] h-[95vh] rounded-2xl shadow-2xl flex flex-col border border-slate-300 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Top Bar */}
        <header className="px-6 py-3.5 bg-white border-b border-slate-200 flex items-center justify-between gap-3 flex-wrap shrink-0 print:hidden">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center flex-wrap gap-2">
                <h2 className="text-base font-bold text-slate-900">Quotation Studio</h2>
                <span className="px-2 py-0.5 text-xs font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200 rounded-md">
                  {liveQuotation.formatted_quote_ref}
                </span>

                <button
                  type="button"
                  onClick={() => setIsLeftDrawerOpen((prev) => !prev)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition cursor-pointer flex items-center gap-1.5 ${
                    isLeftDrawerOpen
                      ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                      : 'bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200 shadow-2xs'
                  }`}
                  title={isLeftDrawerOpen ? 'Hide Left Controls (Focus on Preview)' : 'Show Controls Panel'}
                >
                  {isLeftDrawerOpen ? <PanelLeftClose className="w-3.5 h-3.5" /> : <PanelLeft className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">{isLeftDrawerOpen ? 'Hide Controls' : 'Show Controls'}</span>
                </button>

                {/* Interactive Quotation Status Lifecycle Selector Pill */}
                <div className="inline-flex items-center gap-1 bg-slate-100 border border-slate-200 rounded-lg p-0.5">
                  {(
                    [
                      { id: 'Draft', label: 'Draft' },
                      { id: 'Sent', label: 'Sent' },
                      { id: 'Approved', label: 'Approved' },
                      { id: 'Rejected', label: 'Rejected' },
                      { id: 'Superseded', label: 'Superseded' }
                    ] as const
                  ).map((st) => {
                    const isActive = (quotationStatus || 'Draft') === st.id;
                    const activeColor =
                      st.id === 'Approved'
                        ? 'bg-emerald-600 text-white shadow-2xs'
                        : st.id === 'Sent'
                        ? 'bg-blue-600 text-white shadow-2xs'
                        : st.id === 'Rejected'
                        ? 'bg-rose-600 text-white shadow-2xs'
                        : st.id === 'Superseded'
                        ? 'bg-amber-600 text-white shadow-2xs'
                        : 'bg-slate-800 text-white shadow-2xs';
                    return (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => setQuotationStatus(st.id)}
                        className={`px-2 py-0.5 text-[10.5px] font-semibold rounded-md transition cursor-pointer ${
                          isActive
                            ? activeColor
                            : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
                        }`}
                      >
                        {st.label}
                      </button>
                    );
                  })}
                </div>

                {/* One-Click Revision Cloner Button */}
                <button
                  type="button"
                  onClick={handleCloneAsNextRevision}
                  title={`Deep-clone current quotation into Revision R${(liveQuotation.revision_number || 1) + 1}`}
                  className="px-2.5 py-1 text-[11px] font-bold font-mono bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg transition flex items-center gap-1 cursor-pointer shadow-2xs"
                >
                  <span>⎘ Clone as R{(liveQuotation.revision_number || 1) + 1}</span>
                </button>

                {/* In-Studio Revision History Switcher (R1 <-> R2) */}
                {enquiryRevisions.length > 1 && (
                  <div className="inline-flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-0.5">
                    <span className="text-[10px] font-mono font-bold text-slate-400 uppercase mr-1">
                      Revisions:
                    </span>
                    {enquiryRevisions.map((rev) => {
                      const isCurrent =
                        rev.id === liveQuotation.id ||
                        rev.revision_number === liveQuotation.revision_number;
                      const isSuperseded = rev.status === 'Superseded';
                      return (
                        <button
                          key={rev.id || `rev_${rev.revision_number}`}
                          type="button"
                          onClick={() => handleSelectRevisionInStudio(rev)}
                          title={`Switch to ${rev.formatted_quote_ref} (${rev.status || 'Draft'})`}
                          className={`px-2 py-0.5 text-[10.5px] font-mono font-bold rounded transition cursor-pointer flex items-center gap-1 ${
                            isCurrent
                              ? 'bg-indigo-600 text-white shadow-2xs'
                              : isSuperseded
                              ? 'bg-amber-50 text-amber-800 border border-amber-200/80 hover:bg-amber-100'
                              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          <span>R{rev.revision_number || 1}</span>
                          <span
                            className={`text-[9px] font-sans font-normal ${
                              isCurrent ? 'text-indigo-100' : 'text-slate-400'
                            }`}
                          >
                            ({rev.status || 'Draft'})
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Client: <span className="font-semibold text-slate-700">{liveQuotation.client_snapshot.entity_name}</span>
                {salespersonName && ` • Assigned: ${salespersonName}`}
                {liveQuotation.parent_quotation_id && (
                  <span className="ml-2 text-[10.5px] font-mono text-indigo-600">
                    • Revision R{liveQuotation.revision_number || 1}
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {!isLeftDrawerOpen && (
              isEffectiveSandbox ? (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleSaveToActiveProfileAndPreset(false)}
                    disabled={isSavingPreset}
                    className="px-2.5 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-lg shadow-2xs transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="hidden sm:inline">Update Preset</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSaveToActiveProfileAndPreset(true)}
                    disabled={isSavingPreset}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Update &amp; Close</span>
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleSaveQuotation(quotationStatus || 'Draft')}
                    disabled={isSaving}
                    className="px-2.5 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-lg shadow-2xs transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5 text-slate-500" />
                    <span className="hidden sm:inline">Save Quotation</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSaveQuotation('Sent')}
                    disabled={isSaving}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Issue Quotation</span>
                  </button>
                </div>
              )
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Superseded Revision Inspection Banner */}
        {(quotationStatus || 'Draft') === 'Superseded' && (
          <div className="px-6 py-2 bg-amber-50 border-b border-amber-200 flex items-center justify-between gap-3 flex-wrap text-xs text-amber-900 shrink-0 print:hidden">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-amber-200 text-amber-950 font-mono font-bold text-[10.5px] uppercase">
                Superseded Revision R{liveQuotation.revision_number || 1}
              </span>
              <span>
                You are inspecting a historical superseded revision (
                <strong className="font-mono">{liveQuotation.formatted_quote_ref}</strong>). Saving
                will update this record, or you can switch to the latest revision or fork a new
                revision.
              </span>
            </div>
            <div className="flex items-center gap-2">
              {enquiryRevisions.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    const latest =
                      enquiryRevisions.find((r) => r.status !== 'Superseded' && r.status !== 'Rejected') ||
                      enquiryRevisions[enquiryRevisions.length - 1];
                    if (latest) handleSelectRevisionInStudio(latest);
                  }}
                  className="px-2.5 py-1 rounded-md bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 font-semibold text-[11px] transition cursor-pointer"
                >
                  Switch to Latest Revision
                </button>
              )}
              <button
                type="button"
                onClick={handleCloneAsNextRevision}
                className="px-2.5 py-1 rounded-md bg-amber-600 hover:bg-amber-700 text-white font-semibold text-[11px] transition cursor-pointer"
              >
                ⎘ Clone as New Revision
              </button>
            </div>
          </div>
        )}

        {/* Modal Body: Two-Pane Split Layout */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden print:overflow-visible print:block print:w-full">
          {/* Left Column: Form Controls & Customization */}
          {isLeftDrawerOpen && (
          <div className="w-full lg:w-[460px] xl:w-[500px] bg-white border-r border-slate-200 flex flex-col shrink-0 overflow-y-auto print:hidden animate-in slide-in-from-left-4 duration-150">
            {/* Sticky Top Bar: Document Preset Selector + 2-Tab Mode Switcher */}
            <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-xs border-b border-slate-200 px-5 pt-4 pb-3 space-y-3">
              {/* Preset Selector */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-[11px] font-mono font-bold text-slate-500 uppercase tracking-wider">
                    Document Preset
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setNewPresetName('');
                        setIsSavePresetModalOpen(true);
                      }}
                      className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 transition cursor-pointer hover:underline"
                    >
                      <BookmarkPlus className="w-3.5 h-3.5" />
                      <span>+ Save as New Preset</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsLeftDrawerOpen(false)}
                      className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                      title="Collapse Left Drawer"
                    >
                      <PanelLeftClose className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="flex gap-2">
                  <select
                    value={selectedPresetId}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (!val) {
                        setSelectedPresetId('');
                        return;
                      }
                      const found = presets.find((p) => p.id === val);
                      if (found) applyPreset(found);
                    }}
                    className="w-full text-xs font-medium rounded-lg border border-slate-300 p-2 bg-slate-50 text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  >
                    <option value="">Standard Default Template</option>
                    {presets.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.preset_name}{p.is_default ? ' (★ Default)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Quick-Action Lifecycle Controls for Active Profile & Preset */}
                <div className="mt-2 flex items-center justify-between gap-1.5 pt-1.5 border-t border-slate-100 flex-wrap">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      disabled={isSavingPreset}
                      onClick={() => handleSaveToActiveProfileAndPreset(false)}
                      title="Save layout, styling, and brand overrides to the selected preset"
                      className="px-2.5 py-1 text-[11px] font-semibold rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition flex items-center gap-1 cursor-pointer disabled:opacity-50 shadow-2xs"
                    >
                      <Save className="w-3 h-3" />
                      <span>
                        {selectedPreset
                          ? `Update Preset`
                          : 'Save to Default Profile'}
                      </span>
                    </button>

                    {selectedPreset && (
                      <>
                        {selectedPreset.is_default ? (
                          <span
                            title="This preset automatically hydrates new quotations"
                            className="px-2 py-1 text-[10.5px] font-semibold rounded-md bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1"
                          >
                            <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                            <span>Default</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={isSavingPreset}
                            onClick={handleSetDefaultPreset}
                            title="Set as default preset for new quotations in this workspace"
                            className="px-2 py-1 text-[10.5px] font-semibold rounded-md bg-slate-100 text-slate-700 border border-slate-200 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-200 transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
                          >
                            <Star className="w-3 h-3" />
                            <span>Set Default</span>
                          </button>
                        )}
                      </>
                    )}
                  </div>

                  {selectedPreset && (
                    <button
                      type="button"
                      disabled={isSavingPreset}
                      onClick={handleDeletePreset}
                      title="Delete selected custom preset"
                      className="px-2 py-1 text-[10.5px] font-semibold rounded-md bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Delete</span>
                    </button>
                  )}
                </div>
              </div>

              {/* 2-Tab Segmented Switcher */}
              <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200/80">
                <button
                  type="button"
                  onClick={() => setActiveLeftTab('structure')}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                    activeLeftTab === 'structure'
                      ? 'bg-white text-blue-700 shadow-xs border border-slate-200/60'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>📐 Structure &amp; Theme</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveLeftTab('content')}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                    activeLeftTab === 'content'
                      ? 'bg-white text-blue-700 shadow-xs border border-slate-200/60'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>📝 Deal Data &amp; Content</span>
                </button>
              </div>
            </div>

            <div className="p-5 space-y-5 flex-1">
              {activeLeftTab === 'structure' ? (
                <>
                  {/* Card 1: Global Theme & Presentation (Single Consolidated Card) */}
                  <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-4 text-xs shadow-2xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800 flex items-center gap-1.5 text-xs">
                        <Palette className="w-3.5 h-3.5 text-blue-600" />
                        Global Theme &amp; Presentation
                      </span>
                      <span className="text-[10px] font-mono text-slate-400 capitalize">
                        {themeAccent} • {fontSizeScale}
                      </span>
                    </div>

                    {/* Accent Color Theme: 6 Swatches + Custom Brand Hex Color Picker */}
                    <div className="space-y-2.5">
                      <label className="block text-slate-500 font-medium">
                        Accent Color Theme
                      </label>
                      <div className="grid grid-cols-6 gap-1.5">
                        {(['navy', 'emerald', 'slate', 'amber', 'crimson', 'teal'] as QuotationThemeAccent[]).map((themeKey) => {
                          const t = QUOTATION_THEMES[themeKey] || QUOTATION_THEMES.navy;
                          const isSelected = themeAccent === themeKey && !customThemeColor;
                          return (
                            <button
                              key={themeKey}
                              type="button"
                              onClick={() => {
                                setThemeAccent(themeKey);
                                setCustomThemeColor('');
                              }}
                              className={`flex flex-col items-center p-1.5 rounded-lg border text-center transition cursor-pointer ${
                                isSelected
                                  ? 'border-slate-900 bg-slate-50 ring-2 ring-slate-900/20'
                                  : 'border-slate-200 hover:border-slate-300 bg-white'
                              }`}
                            >
                              <div
                                className="w-4 h-4 rounded-full shadow-xs mb-1"
                                style={{ backgroundColor: t.primaryHex }}
                              />
                              <span className="text-[9.5px] font-bold capitalize text-slate-700">
                                {themeKey}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Custom Brand Hex Color Picker */}
                      <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-slate-50 border border-slate-200/80">
                        <div className="flex items-center gap-2 min-w-0">
                          <input
                            type="color"
                            value={
                              /^#([0-9a-fA-F]{6})$/.test(customThemeColor.trim())
                                ? customThemeColor.trim()
                                : (QUOTATION_THEMES[themeAccent] || QUOTATION_THEMES.navy).primaryHex
                            }
                            onChange={(e) => setCustomThemeColor(e.target.value)}
                            className="w-7 h-7 rounded-lg border border-slate-300 cursor-pointer bg-white p-0.5 shrink-0"
                            title="Pick custom corporate brand hex color"
                          />
                          <div className="min-w-0">
                            <span className="text-[10.5px] font-bold text-slate-700 block leading-tight">
                              Custom Brand Color
                            </span>
                            <span className="text-[9.5px] text-slate-400 block truncate">
                              Drives top bar, table header, card borders &amp; grand total
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <input
                            type="text"
                            value={customThemeColor}
                            onChange={(e) => setCustomThemeColor(e.target.value)}
                            placeholder="#1e3a8a"
                            className="w-20 px-2 py-1 rounded-md border border-slate-300 bg-white font-mono text-[10.5px] text-slate-800"
                          />
                          {customThemeColor && (
                            <button
                              type="button"
                              onClick={() => setCustomThemeColor('')}
                              title="Reset to theme swatch"
                              className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 transition cursor-pointer"
                            >
                              <RotateCcw className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Document Font Size */}
                    <div className="pt-2.5 border-t border-slate-100 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-slate-600 font-medium flex items-center gap-1.5">
                          <Type className="w-3.5 h-3.5 text-slate-400" />
                          Document Font Size
                        </label>
                        <span className="text-[10px] font-mono text-slate-400 capitalize">
                          {fontSizeScale}
                        </span>
                      </div>
                      <div className="grid grid-cols-4 gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200/80">
                        {[
                          { id: 'compact', label: 'Compact', pt: '9pt' },
                          { id: 'standard', label: 'Standard', pt: '10pt' },
                          { id: 'comfortable', label: 'Comfort', pt: '11pt' },
                          { id: 'large', label: 'Large', pt: '12pt' }
                        ].map((s) => {
                          const isSelected = fontSizeScale === s.id;
                          return (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => handleSetFontSizeScale(s.id as QuotationFontSizeScale)}
                              className={`py-1.5 px-1 rounded-lg text-center transition cursor-pointer flex flex-col items-center justify-center ${
                                isSelected
                                  ? 'bg-blue-600 text-white font-semibold shadow-xs'
                                  : 'hover:bg-white text-slate-600'
                              }`}
                            >
                              <span className="text-[10px] font-semibold leading-tight">{s.label}</span>
                              <span className={`text-[8.5px] font-mono mt-0.5 ${isSelected ? 'text-blue-100' : 'text-slate-400'}`}>({s.pt})</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Presentation Style: Framed vs Minimal */}
                    <div className="pt-2.5 border-t border-slate-100">
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-slate-600 font-medium">
                          Presentation Style
                        </label>
                        <span className="text-[10px] text-slate-400 font-mono capitalize">{blockStyle}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { id: 'framed', label: 'Framed', desc: 'Unified cards & boxes' },
                          { id: 'minimal', label: 'Minimal', desc: 'Clean hairline dividers' }
                        ].map((b) => {
                          const isSelected = blockStyle === b.id;
                          return (
                            <button
                              key={b.id}
                              type="button"
                              onClick={() => handleSetGlobalBlockStyle(b.id as 'framed' | 'minimal')}
                              className={`py-2 px-3 rounded-lg border flex items-center justify-between text-xs transition cursor-pointer ${
                                isSelected
                                  ? 'border-blue-600 bg-blue-50 text-blue-700 font-semibold ring-2 ring-blue-600/20'
                                  : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
                              }`}
                            >
                              <span className="font-medium">{b.label}</span>
                              <span className="text-[10px] text-slate-400 font-normal">{b.desc}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Document Font Family */}
                    <div className="pt-2.5 border-t border-slate-100 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-slate-600 font-medium">
                          Document Font Family
                        </label>
                        <span className="text-[10px] font-mono text-slate-400 capitalize">
                          {headerConfig.documentFontFamily || 'sans'}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {[
                          { id: 'sans' as const, label: 'Modern Sans', sample: 'Inter / Sans' },
                          { id: 'serif' as const, label: 'Classic Serif', sample: 'Editorial' },
                          { id: 'technical' as const, label: 'Technical', sample: 'Monospace' }
                        ].map((f) => {
                          const isSelected = (headerConfig.documentFontFamily || 'sans') === f.id;
                          return (
                            <button
                              key={f.id}
                              type="button"
                              onClick={() =>
                                setHeaderConfig((prev) => ({ ...prev, documentFontFamily: f.id }))
                              }
                              className={`py-1.5 px-2 rounded-lg border text-center transition cursor-pointer flex flex-col items-center justify-center ${
                                isSelected
                                  ? 'border-blue-600 bg-blue-50 text-blue-700 font-semibold ring-2 ring-blue-600/20'
                                  : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
                              }`}
                            >
                              <span className="text-[10.5px] font-semibold">{f.label}</span>
                              <span className="text-[9px] text-slate-400">{f.sample}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Top Letterhead Accent Bar Style */}
                    <div className="pt-2.5 border-t border-slate-100 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-slate-600 font-medium">
                          Top Accent Bar Style
                        </label>
                        <span className="text-[10px] font-mono text-slate-400 capitalize">
                          {(headerConfig.topAccentBarStyle || 'thick').replace('_', ' ')}
                        </span>
                      </div>
                      <div className="grid grid-cols-4 gap-1">
                        {[
                          { id: 'thick' as const, label: 'Thick Bar' },
                          { id: 'double' as const, label: 'Double Line' },
                          { id: 'side_accent' as const, label: 'Left Side' },
                          { id: 'none' as const, label: 'None' }
                        ].map((bar) => {
                          const isSelected = (headerConfig.topAccentBarStyle || 'thick') === bar.id;
                          return (
                            <button
                              key={bar.id}
                              type="button"
                              onClick={() =>
                                setHeaderConfig((prev) => ({ ...prev, topAccentBarStyle: bar.id }))
                              }
                              className={`py-1.5 px-1 rounded-lg border text-[10px] font-semibold transition cursor-pointer ${
                                isSelected
                                  ? 'border-blue-600 bg-blue-50 text-blue-700 ring-1 ring-blue-600/20'
                                  : 'border-slate-200 hover:border-slate-300 text-slate-600 bg-white'
                              }`}
                            >
                              {bar.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Table & Section Header Styles */}
                    <div className="pt-2.5 border-t border-slate-100 grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-slate-600 font-medium text-[11px] mb-1">
                          Table Header Style
                        </label>
                        <select
                          value={headerConfig.tableHeaderStyle || 'tinted'}
                          onChange={(e) =>
                            setHeaderConfig((prev) => ({
                              ...prev,
                              tableHeaderStyle: e.target.value as any
                            }))
                          }
                          className="w-full rounded-lg border border-slate-300 p-1.5 bg-white text-slate-800 text-[11px] font-medium"
                        >
                          <option value="solid">Solid Brand Fill</option>
                          <option value="tinted">Tinted Fill (Default)</option>
                          <option value="underline">Clean Underline</option>
                          <option value="minimal">Minimal</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-slate-600 font-medium text-[11px] mb-1">
                          Section Title Style
                        </label>
                        <select
                          value={headerConfig.blockHeaderStyle || 'underline'}
                          onChange={(e) =>
                            setHeaderConfig((prev) => ({
                              ...prev,
                              blockHeaderStyle: e.target.value as any
                            }))
                          }
                          className="w-full rounded-lg border border-slate-300 p-1.5 bg-white text-slate-800 text-[11px] font-medium"
                        >
                          <option value="underline">Underline (Default)</option>
                          <option value="tinted">Tinted Banner</option>
                          <option value="solid">Solid Brand Banner</option>
                          <option value="minimal">Minimal</option>
                        </select>
                      </div>
                    </div>

                    {/* Sister-Company / Brand Identity Override (Saved Per Preset) */}
                    <div className="pt-2.5 border-t border-slate-100 space-y-2 bg-slate-50/70 p-2.5 rounded-xl border border-slate-200/70">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-700 text-[11px] flex items-center gap-1">
                          <Building className="w-3.5 h-3.5 text-indigo-600" />
                          Preset Brand / Sister-Company Override
                        </span>
                        {headerConfig.companyNameOverride && (
                          <button
                            type="button"
                            onClick={() =>
                              setHeaderConfig((prev) => ({ ...prev, companyNameOverride: '' }))
                            }
                            className="text-[10px] text-rose-600 hover:underline font-medium cursor-pointer"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      <input
                        type="text"
                        value={headerConfig.companyNameOverride || ''}
                        onChange={(e) =>
                          setHeaderConfig((prev) => ({
                            ...prev,
                            companyNameOverride: e.target.value
                          }))
                        }
                        placeholder={
                          activeProfile?.company_name ||
                          activeWorkspace?.company_name ||
                          'Alternate Trading / Sister Company Name (Optional)'
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-800 placeholder:text-slate-400"
                      />
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() => logoFileInputRef.current?.click()}
                          className="py-1.5 px-2 rounded-lg bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 font-semibold text-[10.5px] flex items-center justify-center gap-1 transition cursor-pointer"
                        >
                          <Upload className="w-3 h-3" />
                          <span>Preset Logo</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => sealFileInputRef.current?.click()}
                          className="py-1.5 px-2 rounded-lg bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 font-semibold text-[10.5px] flex items-center justify-center gap-1 transition cursor-pointer"
                        >
                          <Upload className="w-3 h-3" />
                          <span>Preset Stamp</span>
                        </button>
                      </div>
                    </div>

                    {/* Corner Style: Rounded (8px) vs Sharp (0px) */}
                    <div className="pt-2.5 border-t border-slate-100">
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-slate-600 font-medium">
                          Corner Style
                        </label>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {globalCardRadius === 'sharp' ? 'Sharp (0px)' : 'Rounded (8px)'}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { id: 'rounded' as const, label: 'Rounded (8px)' },
                          { id: 'sharp' as const, label: 'Sharp (0px)' }
                        ].map((cr) => {
                          const isSelected = globalCardRadius === cr.id;
                          return (
                            <button
                              key={cr.id}
                              type="button"
                              onClick={() => handleSetGlobalCardRadius(cr.id)}
                              className={`py-2 px-3 rounded-lg border flex items-center justify-between text-xs transition cursor-pointer ${
                                isSelected
                                  ? 'border-blue-600 bg-blue-50 text-blue-700 font-semibold ring-2 ring-blue-600/20'
                                  : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
                              }`}
                            >
                              <span className="font-medium">{cr.label}</span>
                              {isSelected && <Check className="w-3.5 h-3.5 text-blue-600" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Show Page Margins & Break Lines: On | Off */}
                    <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between">
                      <div>
                        <span className="text-slate-700 font-medium block">Show Page Margins &amp; Break Lines</span>
                        <span className="text-[10px] text-slate-400">Visual A4 sheet boundary markers on preview</span>
                      </div>
                      <div className="grid grid-cols-2 gap-1 p-0.5 bg-slate-100 rounded-lg border border-slate-200">
                        <button
                          type="button"
                          onClick={() => setShowPageBreakGuides(true)}
                          className={`px-2.5 py-1 rounded-md text-[10.5px] font-semibold transition cursor-pointer ${
                            showPageBreakGuides
                              ? 'bg-blue-600 text-white shadow-2xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          On
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowPageBreakGuides(false)}
                          className={`px-2.5 py-1 rounded-md text-[10.5px] font-semibold transition cursor-pointer ${
                            !showPageBreakGuides
                              ? 'bg-slate-700 text-white shadow-2xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Off
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Card 2: Document Sections & Page Order */}
                  <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-4 text-xs shadow-2xs">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-bold text-slate-800 flex items-center gap-1.5 text-xs">
                          <Layers className="w-3.5 h-3.5 text-blue-600" />
                          Document Sections &amp; Page Order
                        </span>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          Click any section to inspect &amp; customize in the Right Panel
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setLayoutBlocks(
                            DEFAULT_QUOTATION_BLOCKS.map((b) => ({
                              ...b,
                              enabled: true,
                              is_visible: true,
                              fontScale: 'standard',
                              padding: 'standard'
                            }))
                          );
                          setCardsOrder('recipient_first');
                          setSubjectPlacement('below_cards');
                          setRecipientConfig((prev) => ({
                            ...prev,
                            cardsOrder: 'recipient_first',
                            subjectPlacement: 'below_cards',
                            showSubjectBanner: true
                          }));
                          setShowCommercialTerms(true);
                          setShowBankDetails(true);
                          setCustomerAcceptanceEnabled(true);
                          setFooterConfig((prev) => ({
                            ...prev,
                            showBankRemittance: true,
                            showCustomerAcceptance: true,
                            showSignatories: true
                          }));
                        }}
                        className="px-2 py-1 rounded-md text-[10.5px] font-semibold text-slate-600 hover:text-blue-700 bg-slate-100 hover:bg-blue-50 border border-slate-200 transition flex items-center gap-1 cursor-pointer"
                        title="Reset outline order and visibility to standard defaults"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Reset Default</span>
                      </button>
                    </div>

                    {/* Fixed Top Sections */}
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-slate-400 block">
                        Fixed Top Sections
                      </span>

                      {/* 1. Document Header */}
                      <div
                        onClick={() => handleInspectSection('header')}
                        className={`border rounded-xl px-2.5 py-2 transition-all flex items-center justify-between gap-2 cursor-pointer ${
                          selectedSection === 'header'
                            ? 'bg-blue-50/80 border-blue-400 shadow-xs ring-1 ring-blue-400/50'
                            : 'bg-white hover:bg-slate-50/80 border-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <div className="w-6 h-6 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                            <Building className="w-3.5 h-3.5" />
                          </div>
                          <div className="truncate">
                            <span className="text-xs font-semibold text-slate-800 block leading-tight">
                              Document Header
                            </span>
                            <span className="text-[10px] text-slate-400 block font-mono mt-0.5">
                              {headerConfig.alignment || 'split'} • {headerConfig.logoHeightPx || 44}px logo
                            </span>
                          </div>
                        </div>
                        <span className={`text-[10.5px] px-2 py-0.5 rounded-md font-medium transition ${
                          selectedSection === 'header'
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}>
                          {selectedSection === 'header' ? 'Inspecting' : 'Inspect'}
                        </span>
                      </div>

                      {/* 2. Submitted To (Client) & Commercial Offer Row with inline Swap Order */}
                      <div className="border border-slate-200 rounded-xl p-2 bg-slate-50/50 space-y-1.5">
                        <div className="flex items-center justify-between px-1">
                          <span className="text-[10px] font-mono font-semibold text-slate-500">
                            {cardsOrder === 'offer_first' ? 'Offer Left ↔ Client Right' : 'Client Left ↔ Offer Right'}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              const nextOrder = cardsOrder === 'offer_first' ? 'recipient_first' : 'offer_first';
                              setCardsOrder(nextOrder);
                              setRecipientConfig((prev) => ({ ...prev, cardsOrder: nextOrder }));
                            }}
                            className="px-2 py-0.5 rounded-md bg-white hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 text-[10px] font-semibold transition cursor-pointer flex items-center gap-1"
                            title="Swap left/right order of Client & Commercial Offer cards"
                          >
                            <span>⇄ Swap Order</span>
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-1.5">
                          <div
                            onClick={() => handleInspectSection('recipient_info')}
                            className={`border rounded-lg px-2 py-1.5 transition-all flex items-center justify-between gap-1.5 cursor-pointer ${
                              selectedSection === 'recipient_info' || selectedSection === 'recipient_meta'
                                ? 'bg-blue-50/90 border-blue-400 ring-1 ring-blue-400/50'
                                : 'bg-white hover:bg-slate-50 border-slate-200'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <User className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                              <div className="truncate">
                                <span className="text-[11px] font-semibold text-slate-800 block truncate">
                                  Submitted To (Client)
                                </span>
                                <span className="text-[9.5px] text-slate-400 font-mono block truncate">
                                  {liveQuotation.client_snapshot?.entity_name || 'B2B Client'}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div
                            onClick={() => handleInspectSection('quote_meta')}
                            className={`border rounded-lg px-2 py-1.5 transition-all flex items-center justify-between gap-1.5 cursor-pointer ${
                              selectedSection === 'quote_meta'
                                ? 'bg-blue-50/90 border-blue-400 ring-1 ring-blue-400/50'
                                : 'bg-white hover:bg-slate-50 border-slate-200'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <FileCheck className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                              <div className="truncate">
                                <span className="text-[11px] font-semibold text-slate-800 block truncate">
                                  Commercial Offer
                                </span>
                                <span className="text-[9.5px] text-slate-400 font-mono block truncate">
                                  Rev {liveQuotation.revision_number}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* 3. Project Subject Banner (with visibility switch + click row -> subject Inspector) */}
                      <div
                        className={`border rounded-xl px-2.5 py-2 transition-all flex items-center justify-between gap-2 ${
                          selectedSection === 'subject'
                            ? 'bg-blue-50/80 border-blue-400 shadow-xs ring-1 ring-blue-400/50'
                            : recipientConfig.showSubjectBanner !== false
                            ? 'bg-white hover:bg-slate-50/80 border-slate-200'
                            : 'bg-slate-50/60 border-slate-200/60 opacity-65'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <input
                            type="checkbox"
                            checked={recipientConfig.showSubjectBanner !== false}
                            onChange={(e) =>
                              setRecipientConfig((prev) => ({
                                ...prev,
                                showSubjectBanner: e.target.checked
                              }))
                            }
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0"
                            title="Toggle Project Subject Banner visibility"
                          />
                          <div
                            onClick={() => handleInspectSection('subject')}
                            className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer"
                          >
                            <div className="w-6 h-6 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                              <Tag className="w-3.5 h-3.5" />
                            </div>
                            <div className="truncate">
                              <span className="text-xs font-semibold text-slate-800 block leading-tight">
                                Project Subject Banner
                              </span>
                              <span className="text-[10px] text-slate-400 block font-mono mt-0.5 truncate">
                                {quotationSubject || 'No subject set'} • {subjectPlacement === 'above_cards' ? 'Above Cards' : 'Below Cards'}
                              </span>
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleInspectSection('subject')}
                          className={`text-[10.5px] px-2 py-0.5 rounded-md font-medium transition cursor-pointer ${
                            selectedSection === 'subject'
                              ? 'bg-blue-600 text-white'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {selectedSection === 'subject' ? 'Inspecting' : 'Inspect'}
                        </button>
                      </div>

                      {/* 4. Line Items Table */}
                      <div
                        onClick={() => handleInspectSection('items_table')}
                        className={`border rounded-xl px-2.5 py-2 transition-all flex items-center justify-between gap-2 cursor-pointer ${
                          selectedSection === 'items_table'
                            ? 'bg-blue-50/80 border-blue-400 shadow-xs ring-1 ring-blue-400/50'
                            : 'bg-white hover:bg-slate-50/80 border-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <div className="w-6 h-6 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                            <Table className="w-3.5 h-3.5" />
                          </div>
                          <div className="truncate">
                            <span className="text-xs font-semibold text-slate-800 block leading-tight">
                              Line Items Table
                            </span>
                            <span className="text-[10px] text-slate-400 block font-mono mt-0.5">
                              {tableDensity} • {tableFontScale} • {quotationLineItems.slice(0, -1).filter((it) => it.page_break_after).length} row break(s)
                            </span>
                          </div>
                        </div>
                        <span className={`text-[10.5px] px-2 py-0.5 rounded-md font-medium transition ${
                          selectedSection === 'items_table'
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}>
                          {selectedSection === 'items_table' ? 'Inspecting' : 'Inspect'}
                        </span>
                      </div>
                    </div>

                    {/* Bottom Sections (Drag or Reorder) (layoutBlocks) */}
                    <div className="pt-3 border-t border-slate-100 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-slate-400">
                          Bottom Sections (Drag or Reorder)
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium border border-slate-200">
                          {layoutBlocks.filter((b) => b.enabled !== false && b.is_visible !== false).length} of {layoutBlocks.length} Active
                        </span>
                      </div>

                      <div className="space-y-1.5">
                        {layoutBlocks.map((block, idx) => {
                          const meta = getBlockMeta(block);
                          const Icon = meta.icon;
                          const isFirst = idx === 0;
                          const isLast = idx === layoutBlocks.length - 1;
                          const isInspected = selectedBlockId === block.id;
                          const blockType =
                            block.type ||
                            (block.id.startsWith('break_')
                              ? 'page_break'
                              : block.id.startsWith('spacer_')
                              ? 'spacer'
                              : block.id);
                          const isRemovable =
                            blockType === 'page_break' ||
                            blockType === 'spacer' ||
                            blockType === 'custom' ||
                            Array.isArray(block.pieces);
                          const isCustomLego =
                            blockType === 'custom' || Array.isArray(block.pieces);

                          return (
                            <div
                              key={block.id}
                              className={`border rounded-xl px-2.5 py-2 transition-all flex items-center justify-between gap-2 ${
                                isInspected
                                  ? 'bg-blue-50/80 border-blue-400 shadow-xs ring-1 ring-blue-400/50'
                                  : block.enabled !== false && block.is_visible !== false
                                  ? blockType === 'page_break'
                                    ? 'bg-amber-50/40 hover:bg-amber-50/70 border-amber-200'
                                    : blockType === 'spacer'
                                    ? 'bg-slate-50/80 hover:bg-slate-100/80 border-slate-200 border-dashed'
                                    : isCustomLego
                                    ? 'bg-indigo-50/35 hover:bg-indigo-50/70 border-indigo-200'
                                    : 'bg-white hover:bg-slate-50/80 border-slate-200'
                                  : 'bg-slate-50/60 border-slate-200/60 opacity-60'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <div className="flex flex-col gap-0.5 shrink-0">
                                  <button
                                    type="button"
                                    disabled={isFirst}
                                    onClick={() => handleMoveBlock(idx, 'up')}
                                    className="p-0.5 rounded hover:bg-slate-200 disabled:opacity-20 text-slate-500 transition cursor-pointer"
                                    title="Move Up"
                                  >
                                    <ArrowUp className="w-2.5 h-2.5" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isLast}
                                    onClick={() => handleMoveBlock(idx, 'down')}
                                    className="p-0.5 rounded hover:bg-slate-200 disabled:opacity-20 text-slate-500 transition cursor-pointer"
                                    title="Move Down"
                                  >
                                    <ArrowDown className="w-2.5 h-2.5" />
                                  </button>
                                </div>

                                <input
                                  type="checkbox"
                                  checked={block.enabled !== false && block.is_visible !== false}
                                  onChange={(e) => handleToggleBlockEnabled(block.id, e.target.checked)}
                                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0"
                                  title={block.enabled !== false ? 'Click to hide block' : 'Click to show block'}
                                />

                                <div
                                  className="flex items-center gap-1.5 truncate cursor-pointer flex-1"
                                  onClick={() => handleInspectBlock(block.id)}
                                >
                                  <Icon
                                    className={`w-3.5 h-3.5 shrink-0 ${
                                      blockType === 'page_break'
                                        ? 'text-amber-600'
                                        : isCustomLego
                                        ? 'text-indigo-600'
                                        : 'text-slate-500'
                                    }`}
                                  />
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1">
                                      <p className="font-semibold text-slate-800 text-xs truncate">
                                        {meta.label}
                                      </p>
                                      {isCustomLego && (
                                        <span className="px-1 py-0.2 rounded bg-indigo-100 text-indigo-700 font-mono text-[8.5px] font-bold shrink-0">
                                          LEGO
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-1 text-[9.5px] text-slate-400 font-mono mt-0.5">
                                      {blockType === 'page_break' ? (
                                        <>
                                          <span className="text-amber-700 font-semibold">New A4 Sheet</span>
                                          <span>•</span>
                                          <span>{block.show_continuation_header !== false ? 'Running Header' : 'No Header'}</span>
                                        </>
                                      ) : blockType === 'spacer' ? (
                                        <>
                                          <span>{block.spacer_fill_remaining ? 'Fill Space' : `${block.spacer_height_mm || 20}mm`}</span>
                                          <span>•</span>
                                          <span>Vertical Gap</span>
                                        </>
                                      ) : (
                                        <>
                                          <span
                                            className={`font-semibold ${
                                              block.zone === 'pre_table' ? 'text-indigo-600' : 'text-slate-500'
                                            }`}
                                          >
                                            {block.zone === 'pre_table' ? '⬆️ Above Table' : '⬇️ Below Table'}
                                          </span>
                                          <span>•</span>
                                          <span className="capitalize">{block.placement || 'full'}</span>
                                          {isCustomLego && (
                                            <>
                                              <span>•</span>
                                              <span>{(block.pieces || []).length} pcs</span>
                                            </>
                                          )}
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                {isRemovable && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteBlock(block.id)}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition cursor-pointer"
                                    title={`Delete ${meta.label}`}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleInspectBlock(block.id)}
                                  className={`px-2.5 py-1 rounded-lg text-[10.5px] font-medium transition flex items-center gap-1 shrink-0 cursor-pointer ${
                                    isInspected
                                      ? 'bg-blue-600 text-white shadow-2xs font-semibold'
                                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                                  }`}
                                >
                                  <Settings2 className="w-3 h-3" />
                                  <span>{isInspected ? 'Inspecting' : 'Inspect'}</span>
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Universal + Add Custom / Library Block Picker */}
                      <div className="pt-1.5 space-y-2">
                        <button
                          type="button"
                          onClick={() => setShowAddBlockPicker((prev) => !prev)}
                          className="w-full py-2 px-3 rounded-xl border border-indigo-300 bg-indigo-50/80 hover:bg-indigo-100/80 text-indigo-900 font-bold text-xs flex items-center justify-between transition cursor-pointer shadow-2xs"
                        >
                          <span className="flex items-center gap-1.5">
                            <Plus className="w-3.5 h-3.5 text-indigo-600" />
                            <span>+ Add Custom / Library Block</span>
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-200/70 text-indigo-800">
                            11 Lego Pieces • My Blocks
                          </span>
                        </button>

                        {showAddBlockPicker && (
                          <div className="p-2.5 rounded-xl border border-indigo-200 bg-white shadow-sm space-y-2.5">
                            {/* Target Zone Bar */}
                            <div className="flex items-center justify-between gap-1 bg-slate-50 p-1.5 rounded-lg border border-slate-200">
                              <span className="text-[10px] font-semibold text-slate-600 pl-1">
                                Insert Zone:
                              </span>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => setNewBlockTargetZone('pre_table')}
                                  className={`px-2 py-0.5 rounded text-[10px] font-semibold transition cursor-pointer ${
                                    newBlockTargetZone === 'pre_table'
                                      ? 'bg-indigo-600 text-white'
                                      : 'bg-white text-slate-600 border border-slate-200'
                                  }`}
                                >
                                  ⬆️ Above Items Table
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setNewBlockTargetZone('post_table')}
                                  className={`px-2 py-0.5 rounded text-[10px] font-semibold transition cursor-pointer ${
                                    newBlockTargetZone === 'post_table'
                                      ? 'bg-indigo-600 text-white'
                                      : 'bg-white text-slate-600 border border-slate-200'
                                  }`}
                                >
                                  ⬇️ Below Items Table
                                </button>
                              </div>
                            </div>

                            {/* 3-Tab Selector */}
                            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg text-[10px] font-semibold">
                              <button
                                type="button"
                                onClick={() => setAddBlockPickerTab('layouts')}
                                className={`py-1 px-1.5 rounded transition cursor-pointer ${
                                  addBlockPickerTab === 'layouts'
                                    ? 'bg-white text-indigo-700 shadow-2xs'
                                    : 'text-slate-600 hover:text-slate-900'
                                }`}
                              >
                                1. Blank &amp; Layouts
                              </button>
                              <button
                                type="button"
                                onClick={() => setAddBlockPickerTab('clones')}
                                className={`py-1 px-1.5 rounded transition cursor-pointer ${
                                  addBlockPickerTab === 'clones'
                                    ? 'bg-white text-indigo-700 shadow-2xs'
                                    : 'text-slate-600 hover:text-slate-900'
                                }`}
                              >
                                2. Built-In Clones
                              </button>
                              <button
                                type="button"
                                onClick={() => setAddBlockPickerTab('saved')}
                                className={`py-1 px-1.5 rounded transition cursor-pointer ${
                                  addBlockPickerTab === 'saved'
                                    ? 'bg-white text-indigo-700 shadow-2xs'
                                    : 'text-slate-600 hover:text-slate-900'
                                }`}
                              >
                                3. My Blocks ({savedCustomBlocks.length})
                              </button>
                            </div>

                            {addBlockPickerTab === 'layouts' && (
                              <div className="grid grid-cols-2 gap-1.5">
                                {[
                                  {
                                    key: 'blank_rich_text',
                                    title: 'Blank Rich Text Card',
                                    desc: 'Heading + formatted paragraph with @tags'
                                  },
                                  {
                                    key: 'key_value_grid',
                                    title: 'Key-Value Info Box',
                                    desc: '2-column label/value rows with @tags'
                                  },
                                  {
                                    key: 'bullet_checklist',
                                    title: 'Checklist / Bullet Card',
                                    desc: 'Checkmarks, numbered or bulleted points'
                                  },
                                  {
                                    key: 'mini_spec_table',
                                    title: 'Mini Schedule / Table',
                                    desc: 'Payment milestones or spec schedule'
                                  },
                                  {
                                    key: 'two_column_split',
                                    title: '2-Column Split Card',
                                    desc: 'Side-by-side left & right Lego pieces'
                                  },
                                  {
                                    key: 'visual_qr_banner',
                                    title: 'QR & Verification Box',
                                    desc: 'Offline scannable SVG QR code + caption'
                                  }
                                ].map((item) => (
                                  <button
                                    key={item.key}
                                    type="button"
                                    onClick={() => handleInsertCustomBlockFromPreset(item.key)}
                                    className="p-2 rounded-lg border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/40 text-left transition cursor-pointer"
                                  >
                                    <p className="font-bold text-[11px] text-slate-800">{item.title}</p>
                                    <p className="text-[9.5px] text-slate-500 mt-0.5 leading-tight">{item.desc}</p>
                                  </button>
                                ))}
                              </div>
                            )}

                            {addBlockPickerTab === 'clones' && (
                              <div className="space-y-1.5">
                                <p className="text-[10px] text-slate-500">
                                  Insert a 100% unlocked Lego clone of any built-in block to customize its rows, text styles, or layout freely:
                                </p>
                                <div className="grid grid-cols-1 gap-1.5">
                                  {[
                                    {
                                      key: 'clone_terms',
                                      title: 'Commercial Terms Clone',
                                      desc: 'Heading + @price_basis, @payment_terms, @validity_days + rich notes'
                                    },
                                    {
                                      key: 'clone_remittance',
                                      title: 'Bank Remittance Clone',
                                      desc: 'Heading + @bank_name, @beneficiary, @iban, @swift + wire note'
                                    },
                                    {
                                      key: 'clone_totals',
                                      title: 'Financial Summary Clone',
                                      desc: 'Heading + @subtotal, @freight, @tax_amount, @grand_total + @amount_in_words'
                                    },
                                    {
                                      key: 'clone_acceptance',
                                      title: 'Customer Acceptance Clone',
                                      desc: 'Heading + confirmation text + client sign-back & stamp box'
                                    },
                                    {
                                      key: 'clone_signatory',
                                      title: 'Authorized Signatory Clone',
                                      desc: 'Heading + @signatory_name, @signatory_title + seal & signature box'
                                    }
                                  ].map((item) => (
                                    <button
                                      key={item.key}
                                      type="button"
                                      onClick={() => handleInsertCustomBlockFromPreset(item.key)}
                                      className="p-2 rounded-lg border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/40 text-left transition flex items-center justify-between gap-2 cursor-pointer"
                                    >
                                      <div>
                                        <p className="font-bold text-[11px] text-slate-800">{item.title}</p>
                                        <p className="text-[9.5px] text-slate-500">{item.desc}</p>
                                      </div>
                                      <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 font-semibold text-[10px] shrink-0">
                                        + Insert
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}

                            {addBlockPickerTab === 'saved' && (
                              <div className="space-y-1.5 max-h-56 overflow-y-auto">
                                {savedCustomBlocks.filter(
                                  (t) =>
                                    t.visibility === 'workspace' ||
                                    (t.createdByUserId || t.created_by_user_id) ===
                                      (user?.id || user?.email || 'current_user')
                                ).length === 0 ? (
                                  <div className="p-3 rounded-lg bg-slate-50 border border-dashed border-slate-200 text-center text-[10.5px] text-slate-500">
                                    No saved custom blocks yet. Open any Custom Block in the Right Inspector and click <strong>💾 Save to My Blocks</strong>!
                                  </div>
                                ) : (
                                  savedCustomBlocks
                                    .filter(
                                      (t) =>
                                        t.visibility === 'workspace' ||
                                        (t.createdByUserId || t.created_by_user_id) ===
                                          (user?.id || user?.email || 'current_user')
                                    )
                                    .map((tmpl) => (
                                      <div
                                        key={tmpl.id}
                                        className="p-2 rounded-lg border border-slate-200 bg-slate-50/60 flex items-center justify-between gap-2"
                                      >
                                        <div className="min-w-0 flex-1">
                                          <div className="flex items-center gap-1.5">
                                            <p className="font-bold text-[11px] text-slate-800 truncate">
                                              {tmpl.name}
                                            </p>
                                            <span
                                              className={`px-1.5 py-0.2 rounded text-[8.5px] font-semibold ${
                                                tmpl.visibility === 'workspace'
                                                  ? 'bg-emerald-100 text-emerald-800'
                                                  : 'bg-amber-100 text-amber-800'
                                              }`}
                                            >
                                              {tmpl.visibility === 'workspace' ? '🌐 Workspace' : '🔒 Private'}
                                            </span>
                                          </div>
                                          <p className="text-[9.5px] text-slate-500 truncate">
                                            {tmpl.description ||
                                              `${((tmpl.blockConfig || tmpl.block_config)?.pieces || []).length} pieces`}
                                          </p>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                          <button
                                            type="button"
                                            onClick={() => handleInsertSavedCustomBlock(tmpl)}
                                            className="px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-[10px] cursor-pointer"
                                          >
                                            Insert Copy
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => handleDeleteSavedBlockTemplate(tmpl.id)}
                                            className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                                            title="Delete saved block from library"
                                          >
                                            <Trash2 className="w-3 h-3" />
                                          </button>
                                        </div>
                                      </div>
                                    ))
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Bottom Action Buttons: + Insert Page Break & + Insert Vertical Spacer */}
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <button
                          type="button"
                          onClick={handleAddPageBreak}
                          className="py-1.5 px-2.5 rounded-xl border border-dashed border-amber-300 bg-amber-50/50 hover:bg-amber-100/70 text-amber-800 font-semibold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                          title="Insert a Page Break block to start a new A4 sheet"
                        >
                          <Scissors className="w-3.5 h-3.5 text-amber-600" />
                          <span>+ Insert Page Break</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleAddSpacer}
                          className="py-1.5 px-2.5 rounded-xl border border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                          title="Insert an adjustable vertical Spacer block"
                        >
                          <MoveVertical className="w-3.5 h-3.5 text-slate-500" />
                          <span>+ Insert Vertical Spacer</span>
                        </button>
                      </div>
                    </div>

                    {/* Document Baseline */}
                    <div className="pt-3 border-t border-slate-100 space-y-1.5">
                      <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-slate-400 block">
                        Document Baseline
                      </span>
                      <div
                        onClick={() => handleInspectSection('footer')}
                        className={`border rounded-xl px-2.5 py-2 transition-all flex items-center justify-between gap-2 cursor-pointer ${
                          selectedSection === 'footer'
                            ? 'bg-blue-50/80 border-blue-400 shadow-xs ring-1 ring-blue-400/50'
                            : 'bg-white hover:bg-slate-50/80 border-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <div className="w-6 h-6 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                            <ShieldCheck className="w-3.5 h-3.5" />
                          </div>
                          <div className="truncate">
                            <span className="text-xs font-semibold text-slate-800 block leading-tight">
                              Footer &amp; Legal Disclaimer
                            </span>
                            <span className="text-[10px] text-slate-400 block font-mono mt-0.5">
                              {footerConfig.showPageNumbers !== false ? 'Page #' : 'No Page #'} • {footerConfig.showDisclaimer !== false ? 'Legal Active' : 'No Legal'}
                            </span>
                          </div>
                        </div>
                        <span className={`text-[10.5px] px-2 py-0.5 rounded-md font-medium transition ${
                          selectedSection === 'footer'
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}>
                          {selectedSection === 'footer' ? 'Inspecting' : 'Inspect'}
                        </span>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* TAB 2: Deal Data & Content */}
                  {/* Card 0: Smart '@' Fields — Include / Omit Checklist */}
                  <div className="border border-blue-200/90 rounded-xl bg-white shadow-2xs overflow-hidden text-xs">
                    <button
                      type="button"
                      onClick={() => setIsIncludeOmitOpen((prev) => !prev)}
                      className="w-full px-4 py-3 bg-blue-50/60 hover:bg-blue-50/90 border-b border-blue-100 flex items-center justify-between gap-2 transition cursor-pointer text-left"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-6 h-6 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
                          <AtSign className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0">
                          <span className="font-bold text-slate-900 text-xs block leading-tight">
                            Document Data &amp; <span className="font-mono text-blue-700">@</span> Fields (Include / Omit)
                          </span>
                          <span className="text-[10px] text-slate-500 block mt-0.5 truncate">
                            Type <span className="font-mono font-semibold text-blue-700">@</span> in any field or toggle visibility below
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {(() => {
                          const omittedCount = QUOTATION_AT_TAGS.filter((t) => Boolean(omittedFields[t.key])).length;
                          const includedCount = QUOTATION_AT_TAGS.length - omittedCount;
                          return (
                            <span className="px-2 py-0.5 rounded-md bg-white border border-blue-200 text-[10px] font-mono font-semibold text-blue-800">
                              {includedCount} Active{omittedCount > 0 ? ` • ${omittedCount} Omitted` : ''}
                            </span>
                          );
                        })()}
                        {isIncludeOmitOpen ? (
                          <ChevronUp className="w-4 h-4 text-slate-500" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-slate-500" />
                        )}
                      </div>
                    </button>

                    {isIncludeOmitOpen && (
                      <div className="p-3.5 space-y-3">
                        <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-2 text-[10.5px] text-slate-600">
                          <span>
                            Omitted or empty <span className="font-mono font-semibold text-blue-700">@tags</span> resolve cleanly to <strong className="font-mono text-slate-800">—</strong> on the quote and sync with card field visibility.
                          </span>
                          {Object.values(omittedFields).some(Boolean) && (
                            <button
                              type="button"
                              onClick={() => setOmittedFields({})}
                              className="px-2 py-0.5 rounded bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 font-semibold text-[10px] shrink-0 cursor-pointer"
                            >
                              Include All
                            </button>
                          )}
                        </div>

                        <div className="max-h-72 overflow-y-auto pr-0.5 space-y-3">
                          {(
                            [
                              'Dates',
                              'Client & Project',
                              'Our Company & Quote',
                              'Commercial, Bank & Totals'
                            ] as const
                          ).map((cat) => {
                            const items = QUOTATION_AT_TAGS.filter((t) => t.category === cat);
                            if (items.length === 0) return null;
                            return (
                              <div key={cat} className="space-y-1">
                                <div className="text-[9.5px] font-mono font-bold uppercase tracking-wider text-slate-400 px-1">
                                  {cat}
                                </div>
                                <div className="space-y-1">
                                  {items.map((item) => {
                                    const isOmitted = Boolean(omittedFields[item.key]);
                                    const rawVal = studioTokenMap[item.key] || '';
                                    const isCopied = copiedTagKey === item.key;
                                    return (
                                      <div
                                        key={item.key}
                                        className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border transition ${
                                          isOmitted
                                            ? 'bg-amber-50/40 border-amber-200/80 opacity-75'
                                            : 'bg-slate-50/70 hover:bg-slate-50 border-slate-200/80'
                                        }`}
                                      >
                                        <div className="min-w-0 flex-1">
                                          <div className="flex items-center gap-1.5">
                                            <span className="font-mono font-bold text-[10.5px] text-blue-700">
                                              @{item.key}
                                            </span>
                                            <span className="text-[10.5px] font-medium text-slate-700 truncate">
                                              {item.label}
                                            </span>
                                          </div>
                                          <div className="text-[10px] font-mono truncate mt-0.5">
                                            {isOmitted ? (
                                              <span className="text-amber-700 font-semibold">
                                                — (Omitted on Quote)
                                              </span>
                                            ) : rawVal ? (
                                              <span className="text-slate-600">{rawVal}</span>
                                            ) : (
                                              <span className="text-slate-400 italic">— (Empty)</span>
                                            )}
                                          </div>
                                        </div>

                                        <div className="flex items-center gap-1 shrink-0">
                                          <button
                                            type="button"
                                            onClick={() => {
                                              navigator.clipboard?.writeText(`@${item.key}`);
                                              setCopiedTagKey(item.key);
                                              window.setTimeout(() => {
                                                setCopiedTagKey((prev) =>
                                                  prev === item.key ? null : prev
                                                );
                                              }, 1400);
                                            }}
                                            title={`Copy @${item.key}`}
                                            className="px-1.5 py-1 rounded-md bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 text-[9.5px] font-mono flex items-center gap-0.5 cursor-pointer transition"
                                          >
                                            {isCopied ? (
                                              <>
                                                <Check className="w-2.5 h-2.5 text-emerald-600" />
                                                <span className="text-emerald-700 font-semibold">Copied</span>
                                              </>
                                            ) : (
                                              <>
                                                <Copy className="w-2.5 h-2.5" />
                                                <span>Copy</span>
                                              </>
                                            )}
                                          </button>

                                          <button
                                            type="button"
                                            onClick={() => handleToggleFieldOmission(item)}
                                            title={
                                              isOmitted
                                                ? `Click to Include @${item.key} on Quote`
                                                : `Click to Omit @${item.key} (resolves to — and hides linked card field)`
                                            }
                                            className={`px-2 py-1 rounded-md border text-[9.5px] font-semibold flex items-center gap-1 cursor-pointer transition ${
                                              isOmitted
                                                ? 'bg-amber-100/80 border-amber-300 text-amber-900 hover:bg-amber-200/70'
                                                : 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100'
                                            }`}
                                          >
                                            {isOmitted ? (
                                              <>
                                                <EyeOff className="w-3 h-3 text-amber-700" />
                                                <span>Omitted</span>
                                              </>
                                            ) : (
                                              <>
                                                <Eye className="w-3 h-3 text-emerald-600" />
                                                <span>Included</span>
                                              </>
                                            )}
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Card 1: Tax & Financial Adjustments */}
                  <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 space-y-3.5">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <DollarSign className="w-3.5 h-3.5 text-blue-600" />
                      Tax &amp; Financial Adjustments
                    </span>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <label className="block text-slate-500 font-medium mb-1">Tax Calculation</label>
                        <select
                          value={taxMode}
                          onChange={(e) => setTaxMode(e.target.value as QuotationTaxMode)}
                          className="w-full text-xs rounded-lg border border-slate-300 p-2 bg-white text-slate-800 focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="taxes_extra">Taxes Extra (5% add-on)</option>
                          <option value="tax_calculated">Inclusive (Tax in price)</option>
                          <option value="tax_exempt">Tax Exempt (0%)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-slate-500 font-medium mb-1">Freight / Shipping</label>
                        <div className="relative">
                          <input
                            type="number"
                            min="0"
                            step="50"
                            value={freightAmount}
                            onChange={(e) => setFreightAmount(Number(e.target.value) || 0)}
                            className="w-full text-xs rounded-lg border border-slate-300 p-2 pl-7 font-mono bg-white text-slate-800"
                          />
                          <Truck className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-2.5" />
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-200 flex justify-between items-center text-xs">
                      <span className="text-slate-500">Live Calculated Total:</span>
                      <span className="font-mono font-bold text-sm text-blue-900">
                        {liveQuotation.currency} {financialTotals.grand_total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleCanvasSelectSection('totals')}
                      className="w-full py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs flex items-center justify-between transition shadow-2xs cursor-pointer"
                    >
                      <span>Configure Totals, Options &amp; Price Display</span>
                      <span className="font-mono text-sm leading-none">&rarr;</span>
                    </button>
                  </div>

                  {/* Card 2: Subject, Commercial Terms & Validity */}
                  <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-3 text-xs shadow-2xs">
                    <span className="font-bold text-slate-800 flex items-center gap-1.5 text-xs">
                      <FileCheck className="w-3.5 h-3.5 text-blue-600" />
                      Subject, Commercial Terms &amp; Validity
                    </span>
                    <div>
                      <label className="block text-slate-500 font-medium mb-1">
                        Quotation Subject / Project Scope <span className="text-[10px] font-mono text-blue-600">(Type @ for tags)</span>
                      </label>
                      <AtMentionInput
                        value={quotationSubject}
                        onChange={setQuotationSubject}
                        tokenContext={studioTokenContext}
                        placeholder="e.g., Supply of RO Equipment for @project_name — Ref @enquiry_ref"
                        className="w-full rounded-lg border border-slate-300 p-2 text-slate-800 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-500 font-medium mb-1">
                        Price Basis <span className="text-[10px] font-mono text-blue-600">(Type @ for tags)</span>
                      </label>
                      <AtMentionInput
                        value={priceBasis}
                        onChange={setPriceBasis}
                        tokenContext={studioTokenContext}
                        placeholder="e.g., Ex-Works Dubai / Delivered to @project_location"
                        className="w-full rounded-lg border border-slate-300 p-2 text-slate-800 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-500 font-medium mb-1">
                        Payment Terms <span className="text-[10px] font-mono text-blue-600">(Type @ for tags)</span>
                      </label>
                      <AtMentionInput
                        value={paymentTerms}
                        onChange={setPaymentTerms}
                        tokenContext={studioTokenContext}
                        placeholder="e.g., 100% Advance / 30 Days Net"
                        className="w-full rounded-lg border border-slate-300 p-2 text-slate-800 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-500 font-medium mb-1">Validity (Days)</label>
                      <input
                        type="number"
                        min="1"
                        max="180"
                        value={validityDays}
                        onChange={(e) => setValidityDays(Number(e.target.value) || 30)}
                        className="w-full rounded-lg border border-slate-300 p-2 font-mono text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-500 font-medium mb-1">
                        Custom Notes / Scope Disclaimer <span className="text-[10px] font-mono text-blue-600">(Type @ for tags)</span>
                      </label>
                      <AtMentionTextarea
                        rows={3}
                        value={customNotes}
                        onChange={setCustomNotes}
                        tokenContext={studioTokenContext}
                        placeholder="Optional remarks, warranty periods, delivery timeline... Type @ to insert live fields like @valid_until or @bank_iban"
                        className="w-full rounded-lg border border-slate-300 p-2 text-slate-800 text-xs"
                      />
                    </div>
                  </div>

                  {/* Card 3: Signatory & Remittance Account Data (Pure Data Only — Zero Layout/Visibility Duplication) */}
                  <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-3.5 text-xs shadow-2xs">
                    <span className="font-bold text-slate-800 flex items-center gap-1.5 text-xs">
                      <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                      Signatory &amp; Remittance Account Data
                    </span>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-500 font-medium mb-1">Signatory Count</label>
                        <select
                          value={signatoryType}
                          onChange={(e) => {
                            const val = e.target.value as 'single' | 'dual';
                            setSignatoryType(val);
                            setSignatoryMode(val);
                          }}
                          className="w-full rounded-lg border border-slate-300 p-2 text-slate-800 text-xs bg-white"
                        >
                          <option value="single">Single Signatory</option>
                          <option value="dual">Dual Signatory</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-slate-500 font-medium mb-1">Signature Render Style</label>
                        <select
                          value={signatureStyle}
                          onChange={(e) => setSignatureStyle(e.target.value as QuotationSignatureStyle)}
                          className="w-full rounded-lg border border-slate-300 p-2 text-slate-800 text-xs bg-white"
                        >
                          <option value="script">Script (Cursive Autopen)</option>
                          <option value="line">Classic Sign Line</option>
                          <option value="image">Digital Image / Box</option>
                        </select>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100">
                      <span className="text-[11px] font-bold text-slate-700 block mb-1.5">Primary Signatory</span>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-slate-400 text-[10px] mb-0.5">Full Name</label>
                          <input
                            type="text"
                            value={signatoryName}
                            onChange={(e) => setSignatoryName(e.target.value)}
                            placeholder="e.g. Syed Ameer Sibuma"
                            className="w-full rounded-lg border border-slate-300 p-2 text-slate-800 text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-400 text-[10px] mb-0.5">Designation</label>
                          <input
                            type="text"
                            value={signatoryTitle}
                            onChange={(e) => setSignatoryTitle(e.target.value)}
                            placeholder="e.g. Account Manager"
                            className="w-full rounded-lg border border-slate-300 p-2 text-slate-800 text-xs"
                          />
                        </div>
                      </div>
                    </div>

                    {signatoryType === 'dual' && (
                      <div className="pt-2 border-t border-slate-100">
                        <span className="text-[11px] font-bold text-slate-700 block mb-1.5">Secondary Signatory</span>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-slate-400 text-[10px] mb-0.5">Full Name</label>
                            <input
                              type="text"
                              value={secondarySignatoryName}
                              onChange={(e) => setSecondarySignatoryName(e.target.value)}
                              placeholder="e.g. Authorized Director"
                              className="w-full rounded-lg border border-slate-300 p-2 text-slate-800 text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-slate-400 text-[10px] mb-0.5">Designation</label>
                            <input
                              type="text"
                              value={secondarySignatoryTitle}
                              onChange={(e) => setSecondarySignatoryTitle(e.target.value)}
                              placeholder="e.g. Commercial Approver"
                              className="w-full rounded-lg border border-slate-300 p-2 text-slate-800 text-xs"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Company Seal / Stamp Image Uploader & Signature Image Uploader */}
                    <div className="pt-2.5 border-t border-slate-100 space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                          <Stamp className="w-3.5 h-3.5 text-blue-600" />
                          Company Stamp / Seal Image
                        </span>
                        <button
                          type="button"
                          onClick={() => sealFileInputRef.current?.click()}
                          className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-semibold text-[10.5px] flex items-center gap-1 transition cursor-pointer"
                        >
                          <Upload className="w-3 h-3" />
                          <span>Upload Stamp / Seal Image</span>
                        </button>
                      </div>

                      {companySealUrl && (
                        <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200">
                          <div className="flex items-center gap-2 min-w-0">
                            <img
                              src={companySealUrl}
                              alt="Stamp Preview"
                              className="h-12 w-12 object-contain border border-slate-200 rounded bg-white p-1 shrink-0"
                            />
                            <span className="text-[10.5px] text-slate-600 font-medium truncate">
                              Custom Stamp / Seal Active
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setCompanySealUrl('');
                              setFooterConfig((prev) => ({ ...prev, companySealUrl: '' }));
                            }}
                            className="px-2 py-1 rounded-md text-[10px] font-semibold text-rose-600 hover:bg-rose-50 border border-rose-200 transition cursor-pointer shrink-0 flex items-center gap-1"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Remove Stamp</span>
                          </button>
                        </div>
                      )}

                      <div className="pt-2 border-t border-slate-100 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-bold text-slate-700">
                            Authorized Signature Image
                          </span>
                          <button
                            type="button"
                            onClick={() => signatureFileInputRef.current?.click()}
                            className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-semibold text-[10.5px] flex items-center gap-1 transition cursor-pointer"
                          >
                            <Upload className="w-3 h-3" />
                            <span>Upload Signature Image</span>
                          </button>
                        </div>

                        {signatureImageUrl && (
                          <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200">
                            <div className="flex items-center gap-2 min-w-0">
                              <img
                                src={signatureImageUrl}
                                alt="Signature Preview"
                                className="h-10 w-20 object-contain border border-slate-200 rounded bg-white p-1 shrink-0"
                              />
                              <span className="text-[10.5px] text-slate-600 font-medium truncate">
                                Digital Signature Active
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setSignatureImageUrl('');
                                setFooterConfig((prev) => ({ ...prev, signatureImageUrl: '' }));
                              }}
                              className="px-2 py-1 rounded-md text-[10px] font-semibold text-rose-600 hover:bg-rose-50 border border-rose-200 transition cursor-pointer shrink-0 flex items-center gap-1"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Remove</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Remittance Bank Account Selector + Edit Wire Details inline override */}
                    <div className="pt-2.5 border-t border-slate-100 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <label className="block text-slate-700 font-bold text-[11px] flex items-center gap-1.5">
                          <Landmark className="w-3.5 h-3.5 text-blue-600" />
                          Remittance Bank Account
                        </label>
                        <button
                          type="button"
                          onClick={() => setIsEditingBankDetails((prev) => !prev)}
                          className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 text-[10.5px] font-semibold transition cursor-pointer"
                        >
                          {isEditingBankDetails ? 'Hide Wire Details' : 'Edit Wire Details'}
                        </button>
                      </div>

                      {bankRegistry && bankRegistry.length > 0 && (
                        <select
                          value={selectedBankId}
                          onChange={(e) => handleSelectBank(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 p-2 text-slate-800 text-xs bg-white font-medium focus:ring-2 focus:ring-blue-500"
                        >
                          {bankRegistry.map((b) => {
                            const acctLabel = b.accountNumber ? b.accountNumber : (b.iban || 'No Acct');
                            return (
                              <option key={b.id} value={b.id}>
                                {b.bankName} - {acctLabel} ({b.currency})
                              </option>
                            );
                          })}
                        </select>
                      )}

                      {isEditingBankDetails && (
                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10.5px] font-bold text-slate-700">Inline Wire Details Override</span>
                            <button
                              type="button"
                              onClick={handleResetBankOverride}
                              className="text-[10px] text-slate-500 hover:text-blue-600 underline cursor-pointer"
                            >
                              Reset to Registry
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-slate-400 text-[10px] mb-0.5">Bank Name</label>
                              <input
                                type="text"
                                value={customBankOverride?.bankName ?? activeBankAccount?.bankName ?? ''}
                                onChange={(e) =>
                                  setCustomBankOverride((prev) => ({
                                    ...(prev || {}),
                                    bankName: e.target.value
                                  }))
                                }
                                placeholder="Bank Name"
                                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs bg-white text-slate-800"
                              />
                            </div>
                            <div>
                              <label className="block text-slate-400 text-[10px] mb-0.5">Beneficiary Name</label>
                              <input
                                type="text"
                                value={customBankOverride?.beneficiaryName ?? activeBankAccount?.beneficiaryName ?? ''}
                                onChange={(e) =>
                                  setCustomBankOverride((prev) => ({
                                    ...(prev || {}),
                                    beneficiaryName: e.target.value
                                  }))
                                }
                                placeholder="Beneficiary Name"
                                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs bg-white text-slate-800"
                              />
                            </div>
                            <div>
                              <label className="block text-slate-400 text-[10px] mb-0.5">Account Number</label>
                              <input
                                type="text"
                                value={customBankOverride?.accountNumber ?? activeBankAccount?.accountNumber ?? ''}
                                onChange={(e) =>
                                  setCustomBankOverride((prev) => ({
                                    ...(prev || {}),
                                    accountNumber: e.target.value
                                  }))
                                }
                                placeholder="Account Number"
                                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs font-mono bg-white text-slate-800"
                              />
                            </div>
                            <div>
                              <label className="block text-slate-400 text-[10px] mb-0.5">SWIFT / BIC</label>
                              <input
                                type="text"
                                value={customBankOverride?.swiftCode ?? activeBankAccount?.swiftCode ?? ''}
                                onChange={(e) =>
                                  setCustomBankOverride((prev) => ({
                                    ...(prev || {}),
                                    swiftCode: e.target.value
                                  }))
                                }
                                placeholder="SWIFT Code"
                                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs font-mono bg-white text-slate-800"
                              />
                            </div>
                            <div className="col-span-2">
                              <label className="block text-slate-400 text-[10px] mb-0.5">IBAN</label>
                              <input
                                type="text"
                                value={customBankOverride?.iban ?? activeBankAccount?.iban ?? ''}
                                onChange={(e) =>
                                  setCustomBankOverride((prev) => ({
                                    ...(prev || {}),
                                    iban: e.target.value
                                  }))
                                }
                                placeholder="IBAN"
                                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs font-mono bg-white text-slate-800"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card 4: Attachments, Cover Pages & Technical Annexes */}
                  <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-3.5 text-xs shadow-2xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800 flex items-center gap-1.5 text-xs">
                        <Paperclip className="w-3.5 h-3.5 text-blue-600" />
                        <span>Attachments, Cover Pages &amp; Technical Annexes</span>
                      </span>
                      {flyerAttachments.length > 0 && (
                        <span className="px-1.5 py-0.5 text-[10px] font-mono rounded-full bg-blue-100 text-blue-700 font-semibold">
                          {flyerAttachments.length} Attached
                        </span>
                      )}
                    </div>

                    {/* Submittals Index Visibility Toggle */}
                    <label className="flex items-center space-x-2 cursor-pointer select-none p-2 rounded-lg bg-slate-50 border border-slate-200/80">
                      <input
                        type="checkbox"
                        checked={showSubmittalsIndex}
                        onChange={(e) => setShowSubmittalsIndex(e.target.checked)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-slate-700 font-medium text-[11px]">
                        Show Attached Files List on Quote
                      </span>
                    </label>

                    {/* Upload Image File or Add by Title + URL */}
                    <div className="space-y-2 pt-1 border-t border-slate-100">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-700 text-[11px]">
                          Add Cover Page, Datasheet or Flyer
                        </span>
                        <button
                          type="button"
                          onClick={() => annexFileInputRef.current?.click()}
                          className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-semibold text-[11px] flex items-center gap-1 transition cursor-pointer"
                        >
                          <Upload className="w-3 h-3" />
                          <span>Upload File</span>
                        </button>
                      </div>

                      <div className="space-y-1.5 bg-slate-50/80 p-2.5 rounded-lg border border-slate-200/80">
                        <input
                          type="text"
                          value={newAttachmentTitle}
                          onChange={(e) => setNewAttachmentTitle(e.target.value)}
                          placeholder="Display Title (e.g., Executive Cover Page or Annex A: Datasheet)"
                          className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs bg-white text-slate-800"
                        />
                        <div className="flex gap-1.5">
                          <input
                            type="text"
                            value={newAttachmentUrl}
                            onChange={(e) => setNewAttachmentUrl(e.target.value)}
                            placeholder="Image URL / Data-URI or Document Link"
                            className="flex-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs bg-white text-slate-800 font-mono"
                          />
                          <button
                            type="button"
                            onClick={handleAddAttachmentByUrl}
                            className="px-2.5 py-1.5 rounded-md bg-slate-800 hover:bg-slate-900 text-white font-semibold text-[11px] shrink-0 transition cursor-pointer flex items-center gap-1"
                          >
                            <Plus className="w-3 h-3" />
                            <span>Add</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Active Attachments List */}
                    {flyerAttachments.length > 0 ? (
                      <div className="space-y-2 pt-1 border-t border-slate-100">
                        <div className="flex items-center justify-between text-[10.5px] text-slate-500">
                          <span className="font-semibold text-slate-700">Attached Files ({flyerAttachments.length})</span>
                          <span className="font-mono">
                            {flyerAttachments.filter((a) => (a.page_placement || (a.render_as_annex_page === false ? 'index_only' : 'annex_after')) !== 'index_only' && a.url).length} A4 Sheet(s)
                          </span>
                        </div>
                        <div className="space-y-2 max-h-80 overflow-y-auto pr-0.5">
                          {flyerAttachments.map((att, idx) => {
                            const attId = att.id || `annex_${idx}`;
                            const activePlacement: 'cover_before' | 'annex_after' | 'index_only' =
                              att.page_placement ||
                              (att.render_as_annex_page === false ? 'index_only' : 'annex_after');
                            const isRenderedSheet = activePlacement !== 'index_only';
                            const showTitleInHeader = att.show_title_on_annex !== false;
                            const isFullBleed = Boolean(att.full_bleed);
                            const isExcludedFromCount = Boolean(att.exclude_from_page_count);
                            const isFirst = idx === 0;
                            const isLast = idx === flyerAttachments.length - 1;

                            return (
                              <div
                                key={attId}
                                className="p-2.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2"
                              >
                                <div className="flex items-center gap-2">
                                  {/* 40x40px Thumbnail Preview */}
                                  {att.url && att.type !== 'pdf' ? (
                                    <img
                                      src={att.url}
                                      alt={att.name || `Attachment ${idx + 1}`}
                                      className="w-10 h-10 object-cover rounded border border-slate-200 bg-white shrink-0"
                                      onError={(e) => {
                                        e.currentTarget.style.display = 'none';
                                      }}
                                    />
                                  ) : (
                                    <div className="w-10 h-10 rounded border border-slate-200 bg-white flex items-center justify-center text-slate-400 shrink-0">
                                      <FileText className="w-4 h-4" />
                                    </div>
                                  )}

                                  <span className="w-5 h-5 rounded-md bg-slate-200 text-slate-700 font-mono font-bold text-[10px] flex items-center justify-center shrink-0">
                                    #{idx + 1}
                                  </span>
                                  <input
                                    type="text"
                                    value={att.name}
                                    onChange={(e) =>
                                      handleUpdateAttachment(attId, { name: e.target.value })
                                    }
                                    className="flex-1 min-w-0 rounded-md border border-slate-300 px-2 py-1 text-xs bg-white text-slate-800 font-medium"
                                    placeholder="Optional Display Title (leave blank or uncheck below to hide)"
                                  />
                                  <div className="flex items-center gap-0.5 shrink-0">
                                    <button
                                      type="button"
                                      disabled={isFirst}
                                      onClick={() => handleMoveAttachment(idx, 'up')}
                                      title="Move Up"
                                      className="p-1 rounded hover:bg-slate-200 text-slate-600 disabled:opacity-30 cursor-pointer"
                                    >
                                      <ArrowUp className="w-3 h-3" />
                                    </button>
                                    <button
                                      type="button"
                                      disabled={isLast}
                                      onClick={() => handleMoveAttachment(idx, 'down')}
                                      title="Move Down"
                                      className="p-1 rounded hover:bg-slate-200 text-slate-600 disabled:opacity-30 cursor-pointer"
                                    >
                                      <ArrowDown className="w-3 h-3" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteAttachment(attId)}
                                      title="Delete Attachment"
                                      className="p-1 rounded hover:bg-rose-100 text-rose-600 cursor-pointer"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>

                                {/* 3-Way Page Placement Selector */}
                                <div className="grid grid-cols-3 gap-1">
                                  {[
                                    {
                                      id: 'cover_before' as const,
                                      label: '📘 Cover Page',
                                      sub: 'Before Page 1'
                                    },
                                    {
                                      id: 'annex_after' as const,
                                      label: '📄 Annex Sheet',
                                      sub: 'After Quote'
                                    },
                                    {
                                      id: 'index_only' as const,
                                      label: '📎 List Only',
                                      sub: 'No A4 Sheet'
                                    }
                                  ].map((opt) => {
                                    const active = activePlacement === opt.id;
                                    return (
                                      <button
                                        key={opt.id}
                                        type="button"
                                        onClick={() =>
                                          handleUpdateAttachment(attId, {
                                            page_placement: opt.id,
                                            render_as_annex_page: opt.id !== 'index_only'
                                          })
                                        }
                                        className={`py-1.5 px-1.5 rounded-lg border text-center transition cursor-pointer flex flex-col items-center justify-center ${
                                          active
                                            ? 'border-blue-600 bg-blue-600 text-white shadow-2xs'
                                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                                        }`}
                                      >
                                        <span className="text-[10px] font-semibold leading-tight">{opt.label}</span>
                                        <span className={`text-[8.5px] leading-tight mt-0.5 ${active ? 'text-blue-100' : 'text-slate-400'}`}>
                                          {opt.sub}
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>

                                {/* Sheet Options: Full-Bleed, Show Title, Exclude Cover from Page Count */}
                                {isRenderedSheet && (
                                  <div className="space-y-1 pt-0.5">
                                    <label className="flex items-center justify-between px-2 py-1 rounded-lg bg-white border border-slate-200/80 cursor-pointer select-none">
                                      <span className="text-[10.5px] font-medium text-slate-700">
                                        Full-Bleed Edge-to-Edge (No Margins)
                                      </span>
                                      <input
                                        type="checkbox"
                                        checked={isFullBleed}
                                        onChange={(e) =>
                                          handleUpdateAttachment(attId, {
                                            full_bleed: e.target.checked
                                          })
                                        }
                                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                      />
                                    </label>

                                    {!isFullBleed && (
                                      <label className="flex items-center justify-between px-2 py-1 rounded-lg bg-white border border-slate-200/80 cursor-pointer select-none">
                                        <span className="text-[10.5px] font-medium text-slate-700">
                                          Show Title in Sheet Header
                                        </span>
                                        <input
                                          type="checkbox"
                                          checked={showTitleInHeader}
                                          onChange={(e) =>
                                            handleUpdateAttachment(attId, {
                                              show_title_on_annex: e.target.checked
                                            })
                                          }
                                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                        />
                                      </label>
                                    )}

                                    {activePlacement === 'cover_before' && (
                                      <label className="flex items-center justify-between px-2 py-1 rounded-lg bg-white border border-slate-200/80 cursor-pointer select-none">
                                        <span className="text-[10.5px] font-medium text-slate-700">
                                          Exclude Cover from Page Numbering
                                        </span>
                                        <input
                                          type="checkbox"
                                          checked={isExcludedFromCount}
                                          onChange={(e) =>
                                            handleUpdateAttachment(attId, {
                                              exclude_from_page_count: e.target.checked
                                            })
                                          }
                                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                        />
                                      </label>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-400 italic text-center py-2">
                        No cover pages, technical flyers or datasheets attached yet.
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Bottom Actions Bar */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 mt-auto flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving || isSavingPreset}
                className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 font-medium text-xs rounded-xl transition cursor-pointer"
              >
                {isEffectiveSandbox ? 'Close' : 'Cancel'}
              </button>

              {isEffectiveSandbox ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleSaveToActiveProfileAndPreset(false)}
                    disabled={isSavingPreset}
                    className="px-3.5 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-xl shadow-2xs transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Update Preset</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSaveToActiveProfileAndPreset(true)}
                    disabled={isSavingPreset}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Update Preset &amp; Close</span>
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleSaveQuotation(quotationStatus || 'Draft')}
                    disabled={isSaving}
                    className="px-3.5 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-xl shadow-2xs transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5 text-slate-500" />
                    <span>Save Quotation</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSaveQuotation('Sent')}
                    disabled={isSaving}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Issue Quotation</span>
                  </button>
                </div>
              )}
            </div>
          </div>
          )}

          {/* Right Column: Live A4 Document Preview */}
          <div className="flex-1 bg-slate-200/80 flex flex-col overflow-hidden print:bg-transparent print:overflow-visible print:w-full print:block">
            {/* Preview Toolbar */}
            <div className="px-4 py-2 bg-slate-100 border-b border-slate-300/80 flex items-center justify-between text-xs text-slate-600 shrink-0 print:hidden flex-wrap gap-2">
              <div className="flex items-center space-x-2">
                {!isLeftDrawerOpen && (
                  <button
                    type="button"
                    onClick={() => setIsLeftDrawerOpen(true)}
                    className="px-2 py-1 rounded-md bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 font-semibold text-[11px] flex items-center gap-1 shadow-2xs cursor-pointer transition"
                  >
                    <PanelLeft className="w-3.5 h-3.5" />
                    <span>Show Controls</span>
                  </button>
                )}
                <span className="font-semibold text-slate-700">Live Preview:</span>
                <span className="font-mono text-[11px] bg-white px-2 py-0.5 rounded border border-slate-300 text-slate-600">
                  A4 210mm × 297mm
                </span>
                <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">
                  • 1:1 Physical Geometry
                </span>
              </div>

              <div className="flex items-center space-x-2">
                {/* Scale Dropdown: 50%, 75%, 85%, 100%, Fit Page */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-slate-500 font-medium hidden md:inline">Scale:</span>
                  <select
                    value={
                      [0.5, 0.75, 0.85, 1.0].includes(Number(zoomScale.toFixed(2)))
                        ? String(zoomScale.toFixed(2))
                        : 'custom'
                    }
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === 'fit') {
                        handleFitPage();
                      } else if (val !== 'custom') {
                        setZoomScale(parseFloat(val));
                      }
                    }}
                    className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs font-mono text-slate-700 cursor-pointer focus:ring-1 focus:ring-blue-500 focus:outline-hidden"
                  >
                    <option value="0.50">50%</option>
                    <option value="0.75">75%</option>
                    <option value="0.85">85% (Default)</option>
                    <option value="1.00">100% (Actual Size)</option>
                    <option value="fit">Fit Page</option>
                    {![0.5, 0.75, 0.85, 1.0].includes(Number(zoomScale.toFixed(2))) && (
                      <option value="custom">{Math.round(zoomScale * 100)}%</option>
                    )}
                  </select>
                </div>

                {/* Zoom Out */}
                <button
                  type="button"
                  onClick={() => setZoomScale((prev) => Math.max(0.4, Number((prev - 0.1).toFixed(2))))}
                  className="p-1.5 hover:bg-white rounded-lg border border-slate-300/60 text-slate-700 transition cursor-pointer"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                {/* Reset Zoom */}
                <button
                  type="button"
                  onClick={() => setZoomScale(0.85)}
                  className="p-1.5 hover:bg-white rounded-lg border border-slate-300/60 text-slate-700 transition cursor-pointer"
                  title="Reset Zoom (85%)"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
                {/* Zoom In */}
                <button
                  type="button"
                  onClick={() => setZoomScale((prev) => Math.min(1.4, Number((prev + 0.1).toFixed(2))))}
                  className="p-1.5 hover:bg-white rounded-lg border border-slate-300/60 text-slate-700 transition cursor-pointer"
                  title="Zoom In"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                {/* Fit Page Button */}
                <button
                  type="button"
                  onClick={handleFitPage}
                  className="px-2 py-1 bg-white hover:bg-slate-50 border border-slate-300/80 rounded-lg text-slate-700 font-medium text-xs transition cursor-pointer hidden sm:flex items-center gap-1"
                  title="Fit to Page Height"
                >
                  <span>Fit Page</span>
                </button>
                {/* Print Document */}
                <button
                  type="button"
                  onClick={handleRequestPrint}
                  className="px-2.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 font-semibold rounded-lg text-xs flex items-center gap-1.5 transition ml-1 shadow-2xs cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-slate-500" />
                  <span>Print Document</span>
                </button>
              </div>
            </div>

            {/* Scaled Preview Canvas & Retractable Inspector Drawer */}
            <div className="flex-1 flex overflow-hidden relative print:block">
              {/* Scaled Preview Canvas */}
              <div
                ref={previewScrollRef}
                className="flex-1 overflow-auto w-full h-full relative p-4 sm:p-8 flex print:hidden"
              >
                <div
                  style={{
                    transform: `scale(${zoomScale})`,
                    transformOrigin: 'top center',
                    transition: 'transform 0.1s ease-out'
                  }}
                  className="preview-canvas-wrapper m-auto inline-block origin-top text-center shrink-0 flex-shrink-0 w-[210mm] min-w-[210mm] max-w-[210mm] print:hidden text-left"
                >
                  <QuotationDocument
                    quotation={liveQuotation}
                    profile={activeProfile}
                    visibleColumns={visibleColumns}
                    columnConfig={visibleColumns}
                    tableDensity={tableDensity}
                    tableFontScale={tableFontScale}
                    fontSizeScale={fontSizeScale}
                    headerConfig={headerConfig}
                    recipientConfig={recipientConfig}
                    footerConfig={footerConfig}
                    pageMode={pageMode}
                    isCompactView={tableDensity === 'compact'}
                    showBankDetails={showBankDetails}
                    showStampAndSignatures={showCompanySeal || signatoryMode !== 'none'}
                    user={user}
                    signatoryName={signatoryName}
                    signatoryTitle={signatoryTitle}
                    blockStyle={blockStyle}
                    globalCardRadius={globalCardRadius}
                    cardsOrder={cardsOrder}
                    subjectPlacement={subjectPlacement}
                    layoutBlocks={layoutBlocks}
                    selectedSection={selectedSection}
                    selectedBlockId={selectedBlockId}
                    onSelectSection={handleCanvasSelectSection}
                    onSelectBlock={(id) => handleCanvasSelectSection(id)}
                    onInlineFieldEdit={handleInlineFieldEdit}
                    showPageBreakGuides={showPageBreakGuides}
                  />
                </div>
              </div>

              {/* Retractable Right-Side Contextual Header Inspector Drawer */}
              {selectedSection === 'header' && (
                <aside className="w-full sm:w-[380px] xl:w-[410px] bg-white border-l border-slate-300 shadow-xl flex flex-col shrink-0 z-20 print:hidden overflow-y-auto animate-in slide-in-from-right-4 duration-200">
                  {/* Drawer Header */}
                  <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between sticky top-0 z-10">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                        <Building className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-bold text-slate-900 text-xs truncate">
                          Header &amp; Branding
                        </h4>
                        <p className="text-[10px] text-slate-400 font-mono">
                          Structural Section • Company Identity
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedSection(null)}
                      className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/80 transition cursor-pointer"
                      title="Close Inspector"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Drawer Content */}
                  <div className="p-4 space-y-4 text-xs">
                    {(() => {
                      const activePreviewLogoUrl =
                        companyLogoUrl ||
                        headerConfig.logoUrl ||
                        activeProfile?.logo_url ||
                        '';
                      const activeLogoDisplayMode =
                        headerConfig.logoDisplayMode ||
                        (headerConfig.showLogo === false ? 'no_logo' : 'logo_and_name');
                      const activeHeaderLayoutMode =
                        headerConfig.headerLayoutMode ||
                        (activeLogoDisplayMode === 'full_banner'
                          ? 'banner'
                          : headerConfig.alignment === 'centered' || headerLayout === 'centered_banner'
                          ? 'centered'
                          : logoPosition === 'right'
                          ? 'split_right'
                          : 'split_left');
                      const currentLogoHeightPx = headerConfig.logoHeightPx || 48;

                      return (
                        <>
                          {/* 1. Corporate Logo Uploader & Preview Card */}
                          <div
                            id="inspector-target-logo"
                            className={`space-y-2 rounded-xl transition-all duration-300 ${
                              highlightedInspectorTarget === 'logo'
                                ? 'ring-2 ring-blue-500 bg-blue-50/40 p-2 -mx-2'
                                : ''
                            }`}
                          >
                            <label className="block text-slate-800 font-bold text-xs flex items-center gap-1.5">
                              <ImageIcon className="w-3.5 h-3.5 text-blue-600" />
                              Corporate Logo &amp; Letterhead Graphic
                            </label>
                            <p className="text-[10.5px] text-slate-500 leading-normal">
                              Upload a transparent PNG, SVG, or full-width letterhead banner for this quotation and saved presets.
                            </p>

                            <div className="flex items-center gap-2 pt-0.5">
                              <button
                                type="button"
                                onClick={() => logoFileInputRef.current?.click()}
                                className="flex-1 py-2 px-3 rounded-xl border border-blue-200 bg-blue-50/70 hover:bg-blue-100/80 text-blue-700 font-semibold text-[11px] flex items-center justify-center gap-1.5 transition cursor-pointer shadow-2xs"
                              >
                                <Upload className="w-3.5 h-3.5 shrink-0" />
                                <span>Upload Corporate Logo (PNG / JPG / SVG)</span>
                              </button>
                            </div>

                            {activePreviewLogoUrl ? (
                              <div className="space-y-1.5 pt-1">
                                <div className="h-16 flex items-center justify-center p-2 border border-slate-200 rounded-lg bg-slate-50/70 relative overflow-hidden">
                                  <img
                                    src={activePreviewLogoUrl}
                                    alt="Corporate Logo Preview"
                                    className="max-h-12 max-w-full w-auto object-contain"
                                  />
                                </div>
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[10px] text-emerald-700 font-medium flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                                    Active corporate logo loaded
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setCompanyLogoUrl('');
                                      setHeaderConfig((prev) => ({
                                        ...prev,
                                        logoUrl: ''
                                      }));
                                    }}
                                    className="px-2 py-1 rounded-lg border border-rose-200 bg-rose-50/70 hover:bg-rose-100 text-rose-700 text-[10px] font-semibold flex items-center gap-1 transition cursor-pointer"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                    <span>Remove Custom Logo</span>
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="border rounded-xl p-2.5 bg-slate-50/80 border-slate-200 flex items-center justify-between gap-2">
                                <div className="min-w-0 pr-1">
                                  <span className="font-semibold text-slate-800 text-xs block leading-tight">
                                    Show Default Placeholder Icon
                                  </span>
                                  <span className="text-[10px] text-slate-400 block mt-0.5">
                                    Render vector emblem when no custom logo is uploaded
                                  </span>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                                  <input
                                    type="checkbox"
                                    checked={headerConfig.showLogo !== false}
                                    onChange={(e) => {
                                      const enabled = e.target.checked;
                                      setHeaderConfig((prev) => ({
                                        ...prev,
                                        showLogo: enabled,
                                        logoDisplayMode: enabled
                                          ? prev.logoDisplayMode === 'no_logo'
                                            ? 'logo_and_name'
                                            : prev.logoDisplayMode || 'logo_and_name'
                                          : 'no_logo'
                                      }));
                                    }}
                                    className="sr-only peer"
                                  />
                                  <div className="w-8 h-4.5 bg-slate-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-blue-600"></div>
                                </label>
                              </div>
                            )}

                            <div className="pt-1">
                              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                                Or Paste Direct Logo Image URL
                              </label>
                              <input
                                type="text"
                                value={companyLogoUrl}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setCompanyLogoUrl(val);
                                  setHeaderConfig((prev) => ({
                                    ...prev,
                                    logoUrl: val,
                                    ...(val.trim()
                                      ? {
                                          showLogo: true,
                                          logoDisplayMode:
                                            prev.logoDisplayMode === 'no_logo'
                                              ? 'logo_and_name'
                                              : prev.logoDisplayMode || 'logo_and_name'
                                        }
                                      : {})
                                  }));
                                }}
                                placeholder="https://example.com/company-logo.png"
                                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-800 text-xs focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                              />
                            </div>
                          </div>

                          {/* 2. 4-Way Header Logo Style */}
                          <div className="space-y-2 pt-2 border-t border-slate-100">
                            <label className="block text-slate-800 font-bold text-xs flex items-center gap-1.5">
                              <Sliders className="w-3.5 h-3.5 text-blue-600" />
                              Header Logo Style
                            </label>
                            <p className="text-[10.5px] text-slate-500 leading-normal">
                              Choose how your logo and company name appear in the header.
                            </p>
                            <div className="grid grid-cols-2 gap-1.5 pt-1">
                              {[
                                {
                                  id: 'logo_and_name' as const,
                                  label: 'Logo + Company Name',
                                  desc: 'Emblem + bold entity heading'
                                },
                                {
                                  id: 'logo_only' as const,
                                  label: 'Logo Only (Hide Company Name)',
                                  desc: 'Hides duplicate text heading'
                                },
                                {
                                  id: 'full_banner' as const,
                                  label: 'Full Letterhead Banner',
                                  desc: '100% width banner + TRN strip'
                                },
                                {
                                  id: 'no_logo' as const,
                                  label: 'No Logo (Text Only)',
                                  desc: 'Clean typographic header'
                                }
                              ].map((mode) => {
                                const isSelected = activeLogoDisplayMode === mode.id;
                                return (
                                  <button
                                    key={mode.id}
                                    type="button"
                                    onClick={() => {
                                      if (mode.id === 'logo_and_name') {
                                        setHeaderConfig((prev) => ({
                                          ...prev,
                                          logoDisplayMode: 'logo_and_name',
                                          showLogo: true,
                                          showCompanyName: true,
                                          logoMaxWidthPx: 260,
                                          headerLayoutMode:
                                            prev.headerLayoutMode === 'banner'
                                              ? 'split_left'
                                              : prev.headerLayoutMode || 'split_left',
                                          alignment:
                                            prev.headerLayoutMode === 'centered' ? 'centered' : 'split'
                                        }));
                                      } else if (mode.id === 'logo_only') {
                                        setHeaderConfig((prev) => ({
                                          ...prev,
                                          logoDisplayMode: 'logo_only',
                                          showLogo: true,
                                          showCompanyName: false,
                                          logoMaxWidthPx: 300,
                                          headerLayoutMode:
                                            prev.headerLayoutMode === 'banner'
                                              ? 'split_left'
                                              : prev.headerLayoutMode || 'split_left'
                                        }));
                                      } else if (mode.id === 'full_banner') {
                                        setHeaderLayout('centered_banner');
                                        setHeaderConfig((prev) => ({
                                          ...prev,
                                          logoDisplayMode: 'full_banner',
                                          headerLayoutMode: 'banner',
                                          alignment: 'centered',
                                          showLogo: true,
                                          logoMaxWidthPx: 700
                                        }));
                                      } else {
                                        setHeaderConfig((prev) => ({
                                          ...prev,
                                          logoDisplayMode: 'no_logo',
                                          showLogo: false,
                                          showCompanyName: true
                                        }));
                                      }
                                    }}
                                    className={`py-2 px-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                                      isSelected
                                        ? 'border-blue-600 bg-blue-50/80 text-blue-900 font-semibold ring-2 ring-blue-600/20'
                                        : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
                                    }`}
                                  >
                                    <span className="text-[11px] font-semibold leading-tight">{mode.label}</span>
                                    <span className="text-[9.5px] text-slate-400 mt-0.5 leading-tight">{mode.desc}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* 3. Unified Header Layout & Alignment (2x2 Grid) */}
                          <div className="space-y-2 pt-2 border-t border-slate-100">
                            <label className="block text-slate-800 font-bold text-xs flex items-center gap-1.5">
                              <Sliders className="w-3.5 h-3.5 text-blue-600" />
                              Unified Header Layout &amp; Alignment
                            </label>
                            <p className="text-[10.5px] text-slate-500 leading-normal">
                              Position your brand identity and corporate contact details across the top of Page 1.
                            </p>
                            <div className="grid grid-cols-2 gap-1.5 pt-1">
                              {[
                                {
                                  id: 'split_left' as const,
                                  label: 'Split Classic',
                                  desc: 'Logo Left • Contact Right'
                                },
                                {
                                  id: 'split_right' as const,
                                  label: 'Split Reversed',
                                  desc: 'Contact Left • Logo Right'
                                },
                                {
                                  id: 'centered' as const,
                                  label: 'Centered Executive',
                                  desc: 'Stacked Center Alignment'
                                },
                                {
                                  id: 'banner' as const,
                                  label: 'Full Banner',
                                  desc: 'Top Span Letterhead'
                                }
                              ].map((layout) => {
                                const isSelected = activeHeaderLayoutMode === layout.id;
                                return (
                                  <button
                                    key={layout.id}
                                    type="button"
                                    onClick={() => {
                                      if (layout.id === 'split_left') {
                                        setLogoPosition('left');
                                        setHeaderLayout('split');
                                        setHeaderConfig((prev) => ({
                                          ...prev,
                                          headerLayoutMode: 'split_left',
                                          alignment: 'split',
                                          logoDisplayMode:
                                            prev.logoDisplayMode === 'full_banner'
                                              ? 'logo_and_name'
                                              : prev.logoDisplayMode,
                                          logoMaxWidthPx: 260
                                        }));
                                      } else if (layout.id === 'split_right') {
                                        setLogoPosition('right');
                                        setHeaderLayout('split');
                                        setHeaderConfig((prev) => ({
                                          ...prev,
                                          headerLayoutMode: 'split_right',
                                          alignment: 'split',
                                          logoDisplayMode:
                                            prev.logoDisplayMode === 'full_banner'
                                              ? 'logo_and_name'
                                              : prev.logoDisplayMode,
                                          logoMaxWidthPx: 260
                                        }));
                                      } else if (layout.id === 'centered') {
                                        setLogoPosition('center');
                                        setHeaderLayout('centered_banner');
                                        setHeaderConfig((prev) => ({
                                          ...prev,
                                          headerLayoutMode: 'centered',
                                          alignment: 'centered',
                                          logoDisplayMode:
                                            prev.logoDisplayMode === 'full_banner'
                                              ? 'logo_and_name'
                                              : prev.logoDisplayMode,
                                          logoMaxWidthPx: 260
                                        }));
                                      } else {
                                        setLogoPosition('center');
                                        setHeaderLayout('centered_banner');
                                        setHeaderConfig((prev) => ({
                                          ...prev,
                                          headerLayoutMode: 'banner',
                                          alignment: 'centered',
                                          logoDisplayMode: 'full_banner',
                                          showLogo: true,
                                          logoMaxWidthPx: 700
                                        }));
                                      }
                                    }}
                                    className={`py-2 px-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                                      isSelected
                                        ? 'border-blue-600 bg-blue-50/80 text-blue-900 font-semibold ring-2 ring-blue-600/20'
                                        : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
                                    }`}
                                  >
                                    <span className="text-[11px] font-semibold leading-tight">{layout.label}</span>
                                    <span className="text-[9.5px] text-slate-400 mt-0.5 leading-tight">{layout.desc}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* 4. Logo Dimensions & Breathing Room */}
                          <div className="space-y-2.5 pt-2 border-t border-slate-100">
                            <div className="flex items-center justify-between">
                              <label className="text-slate-800 font-bold text-xs flex items-center gap-1.5">
                                <Sliders className="w-3.5 h-3.5 text-blue-600" />
                                Logo Dimensions &amp; Scale
                              </label>
                              <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-mono font-bold text-[10px] border border-blue-200/60">
                                {currentLogoHeightPx}px
                              </span>
                            </div>

                            <div className="grid grid-cols-4 gap-1.5">
                              {[
                                { px: 36, label: 'Compact', desc: '36px' },
                                { px: 48, label: 'Standard', desc: '48px' },
                                { px: 64, label: 'Prominent', desc: '64px' },
                                { px: 84, label: 'Large', desc: '84px' }
                              ].map((item) => {
                                const isSelected = currentLogoHeightPx === item.px;
                                return (
                                  <button
                                    key={item.px}
                                    type="button"
                                    onClick={() =>
                                      setHeaderConfig((prev) => ({ ...prev, logoHeightPx: item.px }))
                                    }
                                    className={`py-1.5 px-1 rounded-xl border text-center transition cursor-pointer flex flex-col items-center justify-center ${
                                      isSelected
                                        ? 'border-blue-600 bg-blue-50/80 text-blue-700 font-semibold ring-2 ring-blue-600/20'
                                        : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
                                    }`}
                                  >
                                    <span className="text-[11px] font-semibold">{item.label}</span>
                                    <span className="text-[9px] font-mono text-slate-400">{item.desc}</span>
                                  </button>
                                );
                              })}
                            </div>

                            {/* Smooth Slider (28px - 110px) */}
                            <div className="pt-1">
                              <input
                                type="range"
                                min={28}
                                max={110}
                                step={2}
                                value={currentLogoHeightPx}
                                onChange={(e) =>
                                  setHeaderConfig((prev) => ({
                                    ...prev,
                                    logoHeightPx: Number(e.target.value) || 48
                                  }))
                                }
                                className="w-full accent-blue-600 cursor-pointer h-1.5 bg-slate-200 rounded-lg"
                              />
                              <div className="flex justify-between text-[9px] font-mono text-slate-400 mt-0.5">
                                <span>28px (Min)</span>
                                <span>64px</span>
                                <span>110px (Max Banner)</span>
                              </div>
                            </div>

                            {/* Logo Padding */}
                            <div className="pt-1.5">
                              <label className="block text-[10.5px] font-semibold text-slate-700 mb-1.5">
                                Logo Padding
                              </label>
                              <div className="grid grid-cols-4 gap-1.5">
                                {[
                                  { id: 'none' as const, label: 'None', desc: '0px' },
                                  { id: 'tight' as const, label: 'Compact', desc: '4px' },
                                  { id: 'normal' as const, label: 'Normal', desc: '8px' },
                                  { id: 'spacious' as const, label: 'Spacious', desc: '14px' }
                                ].map((item) => {
                                  const isSelected = (headerConfig.logoSpacing || 'normal') === item.id;
                                  return (
                                    <button
                                      key={item.id}
                                      type="button"
                                      onClick={() =>
                                        setHeaderConfig((prev) => ({ ...prev, logoSpacing: item.id }))
                                      }
                                      className={`py-1.5 px-1 rounded-xl border text-center transition cursor-pointer flex flex-col items-center justify-center ${
                                        isSelected
                                          ? 'border-blue-600 bg-blue-50/80 text-blue-700 font-semibold ring-2 ring-blue-600/20'
                                          : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
                                      }`}
                                    >
                                      <span className="text-[11px] font-semibold">{item.label}</span>
                                      <span className="text-[9px] font-mono text-slate-400">{item.desc}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </div>

                          {/* 5. Header Content Alignment (Horizontal + Vertical) */}
                          <div className="space-y-2.5 pt-2 border-t border-slate-100">
                            <label className="block text-slate-800 font-bold text-xs flex items-center gap-1.5">
                              <AlignLeft className="w-3.5 h-3.5 text-blue-600" />
                              Header Content Alignment
                            </label>
                            <div className="grid grid-cols-1 gap-2.5">
                              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5">
                                <span className="text-[10.5px] font-bold text-slate-700 block">
                                  Brand / Logo Zone
                                </span>
                                <div className="grid grid-cols-3 gap-1">
                                  {(['left', 'center', 'right'] as const).map((hAlign) => {
                                    const active = (headerConfig.brandHorizontalAlign || 'left') === hAlign;
                                    return (
                                      <button
                                        key={hAlign}
                                        type="button"
                                        onClick={() =>
                                          setHeaderConfig((prev) => ({
                                            ...prev,
                                            brandHorizontalAlign: hAlign
                                          }))
                                        }
                                        className={`py-1 rounded text-[9.5px] font-semibold capitalize cursor-pointer transition ${
                                          active
                                            ? 'bg-blue-600 text-white'
                                            : 'bg-white text-slate-600 border border-slate-200'
                                        }`}
                                      >
                                        {hAlign}
                                      </button>
                                    );
                                  })}
                                </div>
                                <div className="grid grid-cols-3 gap-1">
                                  {(['top', 'middle', 'bottom'] as const).map((vAlign) => {
                                    const active = (headerConfig.brandVerticalAlign || 'middle') === vAlign;
                                    return (
                                      <button
                                        key={vAlign}
                                        type="button"
                                        onClick={() =>
                                          setHeaderConfig((prev) => ({
                                            ...prev,
                                            brandVerticalAlign: vAlign
                                          }))
                                        }
                                        className={`py-1 rounded text-[9.5px] font-semibold capitalize cursor-pointer transition ${
                                          active
                                            ? 'bg-slate-800 text-white'
                                            : 'bg-white text-slate-600 border border-slate-200'
                                        }`}
                                      >
                                        {vAlign}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>

                              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5">
                                <span className="text-[10.5px] font-bold text-slate-700 block">
                                  Contact / Details Zone
                                </span>
                                <div className="grid grid-cols-3 gap-1">
                                  {(['left', 'center', 'right'] as const).map((hAlign) => {
                                    const active = (headerConfig.contactHorizontalAlign || 'right') === hAlign;
                                    return (
                                      <button
                                        key={hAlign}
                                        type="button"
                                        onClick={() =>
                                          setHeaderConfig((prev) => ({
                                            ...prev,
                                            contactHorizontalAlign: hAlign
                                          }))
                                        }
                                        className={`py-1 rounded text-[9.5px] font-semibold capitalize cursor-pointer transition ${
                                          active
                                            ? 'bg-blue-600 text-white'
                                            : 'bg-white text-slate-600 border border-slate-200'
                                        }`}
                                      >
                                        {hAlign}
                                      </button>
                                    );
                                  })}
                                </div>
                                <div className="grid grid-cols-3 gap-1">
                                  {(['top', 'middle', 'bottom'] as const).map((vAlign) => {
                                    const active = (headerConfig.contactVerticalAlign || 'top') === vAlign;
                                    return (
                                      <button
                                        key={vAlign}
                                        type="button"
                                        onClick={() =>
                                          setHeaderConfig((prev) => ({
                                            ...prev,
                                            contactVerticalAlign: vAlign
                                          }))
                                        }
                                        className={`py-1 rounded text-[9.5px] font-semibold capitalize cursor-pointer transition ${
                                          active
                                            ? 'bg-slate-800 text-white'
                                            : 'bg-white text-slate-600 border border-slate-200'
                                        }`}
                                      >
                                        {vAlign}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* 6. Header Text & Contact Fields */}
                          <div className="space-y-2.5 pt-2 border-t border-slate-100">
                            <div className="flex items-center justify-between">
                              <label className="text-slate-800 font-bold text-xs flex items-center gap-1.5">
                                <Columns className="w-3.5 h-3.5 text-blue-600" />
                                Header Text &amp; Contact Fields
                              </label>
                              <button
                                type="button"
                                onClick={() => {
                                  const currentFields = resolveHeaderFields(
                                    headerConfig,
                                    activeProfile,
                                    liveQuotation.sender_snapshot
                                  ).allFields;
                                  const newField: QuotationHeaderFieldItem = {
                                    id: `custom_${Date.now().toString(36)}`,
                                    label: 'Mobile',
                                    valueOverride: '+971 50 000 0000',
                                    enabled: true,
                                    zone: 'contact_block',
                                    fontSize: 'sm',
                                    fontWeight: 'medium',
                                    icon: 'smartphone',
                                    showIcon: true
                                  };
                                  setHeaderConfig((prev) => ({
                                    ...prev,
                                    headerFields: [...currentFields, newField]
                                  }));
                                }}
                                className="px-2 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-semibold text-[10px] flex items-center gap-1 transition cursor-pointer"
                              >
                                <Plus className="w-3 h-3" />
                                <span>+ Add Custom Line</span>
                              </button>
                            </div>
                            <p className="text-[10px] text-slate-500 leading-normal">
                              Edit text here or click directly on the A4 preview. Move fields below the logo, choose icons, or adjust font size.
                            </p>

                            {/* Master Toggle: Show Field Icons */}
                            <label className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200/80 cursor-pointer select-none">
                              <span className="text-[10.5px] font-semibold text-slate-700">
                                Show Contact &amp; Address Icons
                              </span>
                              <input
                                type="checkbox"
                                checked={headerConfig.showHeaderIcons !== false}
                                onChange={(e) =>
                                  setHeaderConfig((prev) => ({
                                    ...prev,
                                    showHeaderIcons: e.target.checked
                                  }))
                                }
                                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                              />
                            </label>

                            <div className="space-y-2 max-h-96 overflow-y-auto pr-0.5">
                              {(() => {
                                const resolvedList = resolveHeaderFields(
                                  headerConfig,
                                  activeProfile,
                                  liveQuotation.sender_snapshot
                                ).allFields;
                                const updateHeaderFieldList = (nextList: QuotationHeaderFieldItem[]) => {
                                  const companyItem = nextList.find((f) => f.id === 'company_name');
                                  const trnItem = nextList.find((f) => f.id === 'trn');
                                  const phoneItem = nextList.find((f) => f.id === 'phone');
                                  const emailItem = nextList.find((f) => f.id === 'email');
                                  const websiteItem = nextList.find((f) => f.id === 'website');
                                  setHeaderConfig((prev) => ({
                                    ...prev,
                                    headerFields: nextList,
                                    ...(companyItem ? { showCompanyName: companyItem.enabled } : {}),
                                    ...(trnItem ? { showTrn: trnItem.enabled } : {}),
                                    ...(phoneItem ? { showPhone: phoneItem.enabled } : {}),
                                    ...(emailItem ? { showEmail: emailItem.enabled } : {}),
                                    ...(websiteItem ? { showWebsite: websiteItem.enabled } : {})
                                  }));
                                };

                                const fieldBadgeMap: Record<string, string> = {
                                  company_name: 'Company Name',
                                  tagline: 'Tagline',
                                  trn: 'TRN / Tax ID',
                                  address: 'Address',
                                  phone: 'Phone',
                                  email: 'Email',
                                  website: 'Website'
                                };

                                return resolvedList.map((field, idx) => {
                                  const isCustom = !['company_name', 'tagline', 'trn', 'address', 'phone', 'email', 'website'].includes(field.id);
                                  const friendlyBadge = fieldBadgeMap[field.id] || 'Custom Line';
                                  const activeIconVal =
                                    field.showIcon === false ? 'none' : field.icon || 'none';

                                  return (
                                    <div
                                      key={field.id}
                                      id={`inspector-target-field:${field.id}`}
                                      className={`p-2.5 rounded-xl border space-y-2 transition-all duration-300 ${
                                        highlightedInspectorTarget === `field:${field.id}`
                                          ? 'ring-2 ring-blue-500 bg-blue-50/50 border-blue-400 shadow-sm'
                                          : field.enabled
                                          ? 'bg-white border-slate-200 shadow-2xs'
                                          : 'bg-slate-50/70 border-slate-200/60 opacity-60'
                                      }`}
                                    >
                                      <div className="flex items-center justify-between gap-1.5">
                                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                          <input
                                            type="checkbox"
                                            checked={field.enabled}
                                            onChange={(e) => {
                                              const next = resolvedList.map((f, i) =>
                                                i === idx ? { ...f, enabled: e.target.checked } : f
                                              );
                                              updateHeaderFieldList(next);
                                            }}
                                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0"
                                          />
                                          <input
                                            type="text"
                                            value={field.label}
                                            onChange={(e) => {
                                              const next = resolvedList.map((f, i) =>
                                                i === idx ? { ...f, label: e.target.value } : f
                                              );
                                              updateHeaderFieldList(next);
                                            }}
                                            placeholder="Prefix (optional)"
                                            className="w-24 px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 text-[10.5px] font-semibold text-slate-700"
                                          />
                                          <span className="text-[9.5px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium truncate">
                                            {friendlyBadge}
                                          </span>
                                        </div>

                                        <div className="flex items-center gap-0.5 shrink-0">
                                          <button
                                            type="button"
                                            disabled={idx === 0}
                                            onClick={() => {
                                              if (idx === 0) return;
                                              const copy = [...resolvedList];
                                              const [moved] = copy.splice(idx, 1);
                                              copy.splice(idx - 1, 0, moved);
                                              updateHeaderFieldList(copy);
                                            }}
                                            className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 text-slate-500 cursor-pointer"
                                            title="Move Field Up"
                                          >
                                            <ArrowUp className="w-3 h-3" />
                                          </button>
                                          <button
                                            type="button"
                                            disabled={idx === resolvedList.length - 1}
                                            onClick={() => {
                                              if (idx === resolvedList.length - 1) return;
                                              const copy = [...resolvedList];
                                              const [moved] = copy.splice(idx, 1);
                                              copy.splice(idx + 1, 0, moved);
                                              updateHeaderFieldList(copy);
                                            }}
                                            className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 text-slate-500 cursor-pointer"
                                            title="Move Field Down"
                                          >
                                            <ArrowDown className="w-3 h-3" />
                                          </button>
                                          {isCustom && (
                                            <button
                                              type="button"
                                              onClick={() => {
                                                const next = resolvedList.filter((_, i) => i !== idx);
                                                updateHeaderFieldList(next);
                                              }}
                                              className="p-1 rounded hover:bg-rose-50 text-rose-600 cursor-pointer"
                                              title="Delete Custom Field"
                                            >
                                              <Trash2 className="w-3 h-3" />
                                            </button>
                                          )}
                                        </div>
                                      </div>

                                      {/* Inline Value Override Input */}
                                      <input
                                        type="text"
                                        value={field.valueOverride ?? ''}
                                        onChange={(e) => {
                                          const next = resolvedList.map((f, i) =>
                                            i === idx ? { ...f, valueOverride: e.target.value } : f
                                          );
                                          updateHeaderFieldList(next);
                                        }}
                                        placeholder="Text on this quote (or click text on A4 preview)..."
                                        className="w-full px-2 py-1 rounded-lg border border-slate-200 bg-white text-[11px] text-slate-800"
                                      />

                                      {/* Position, Icon & Font Scale Selectors */}
                                      <div className="grid grid-cols-3 gap-1.5">
                                        <select
                                          value={field.zone}
                                          onChange={(e) => {
                                            const next = resolvedList.map((f, i) =>
                                              i === idx
                                                ? { ...f, zone: e.target.value as QuotationHeaderFieldItem['zone'] }
                                                : f
                                            );
                                            updateHeaderFieldList(next);
                                          }}
                                          className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-1 text-[10px] font-medium text-slate-700"
                                          title="Header Position"
                                        >
                                          <option value="under_logo">Position: Below Logo</option>
                                          <option value="under_name">Position: Below Company Name</option>
                                          <option value="contact_block">Position: Contact Column</option>
                                          <option value="bottom_bar">Position: Bottom Strip</option>
                                        </select>

                                        <select
                                          value={activeIconVal}
                                          onChange={(e) => {
                                            const val = e.target.value as NonNullable<QuotationHeaderFieldItem['icon']>;
                                            const next = resolvedList.map((f, i) =>
                                              i === idx
                                                ? {
                                                    ...f,
                                                    icon: val,
                                                    showIcon: val !== 'none'
                                                  }
                                                : f
                                            );
                                            updateHeaderFieldList(next);
                                          }}
                                          className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-1 text-[10px] font-medium text-slate-700"
                                          title="Field Icon"
                                        >
                                          <option value="none">Icon: None</option>
                                          <option value="map-pin">📍 Location Pin</option>
                                          <option value="phone">📞 Phone</option>
                                          <option value="smartphone">📱 Mobile</option>
                                          <option value="mail">✉️ Email</option>
                                          <option value="globe">🌐 Website</option>
                                          <option value="building">🏢 Building</option>
                                          <option value="hash">#️⃣ Tax / Ref</option>
                                          <option value="user">👤 Contact</option>
                                          <option value="shield">🛡️ Certified</option>
                                        </select>

                                        <select
                                          value={field.fontSize || 'sm'}
                                          onChange={(e) => {
                                            const next = resolvedList.map((f, i) =>
                                              i === idx
                                                ? {
                                                    ...f,
                                                    fontSize: e.target.value as QuotationHeaderFieldItem['fontSize']
                                                  }
                                                : f
                                            );
                                            updateHeaderFieldList(next);
                                          }}
                                          className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-1 text-[10px] font-mono text-slate-700"
                                          title="Field Font Size"
                                        >
                                          <option value="xs">Size: XS</option>
                                          <option value="sm">Size: SM</option>
                                          <option value="base">Size: MD</option>
                                          <option value="lg">Size: LG</option>
                                        </select>
                                      </div>
                                    </div>
                                  );
                                });
                              })()}
                            </div>
                          </div>

                          {/* 7. Page 2+ Running Header Controls */}
                          <div className="space-y-2.5 pt-2 border-t border-slate-100">
                            <label className="block text-slate-800 font-bold text-xs flex items-center gap-1.5">
                              <FileText className="w-3.5 h-3.5 text-blue-600" />
                              Page 2+ Running Header
                            </label>
                            <p className="text-[10px] text-slate-500 leading-normal">
                              Choose how the header appears on continuation pages (Page 2+) and technical annex sheets.
                            </p>

                            {/* 4-Way Continuation Header Mode */}
                            <div className="grid grid-cols-2 gap-1.5">
                              {[
                                {
                                  id: 'compact' as const,
                                  label: 'Compact Bar',
                                  desc: 'Slim running header'
                                },
                                {
                                  id: 'full_repeat' as const,
                                  label: 'Full Repeat',
                                  desc: 'Full Page 1 letterhead'
                                },
                                {
                                  id: 'logo_only' as const,
                                  label: 'Logo Only',
                                  desc: 'Logo mark + page number'
                                },
                                {
                                  id: 'none' as const,
                                  label: 'Hidden',
                                  desc: 'No header on Page 2+'
                                }
                              ].map((m) => {
                                const currentMode =
                                  headerConfig.continuationHeaderMode ||
                                  (headerConfig.repeatHeaderOnSubsequentPages === false ? 'none' : 'compact');
                                const isSelected = currentMode === m.id;
                                return (
                                  <button
                                    key={m.id}
                                    type="button"
                                    onClick={() =>
                                      setHeaderConfig((prev) => ({
                                        ...prev,
                                        continuationHeaderMode: m.id,
                                        repeatHeaderOnSubsequentPages: m.id !== 'none'
                                      }))
                                    }
                                    className={`py-1.5 px-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                                      isSelected
                                        ? 'border-blue-600 bg-blue-50/80 text-blue-900 font-semibold ring-2 ring-blue-600/20'
                                        : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
                                    }`}
                                  >
                                    <span className="text-[11px] font-semibold leading-tight">{m.label}</span>
                                    <span className="text-[9.5px] text-slate-400 mt-0.5 leading-tight">{m.desc}</span>
                                  </button>
                                );
                              })}
                            </div>

                            {headerConfig.continuationHeaderMode !== 'none' &&
                              headerConfig.repeatHeaderOnSubsequentPages !== false && (
                                <div className="space-y-2 pt-1">
                                  {/* Page 2+ Logo Height Slider */}
                                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5">
                                    <div className="flex items-center justify-between text-[10.5px]">
                                      <span className="font-semibold text-slate-700">Page 2+ Logo Size</span>
                                      <span className="font-mono font-bold text-blue-700">
                                        {headerConfig.continuationLogoHeightPx || 20}px
                                      </span>
                                    </div>
                                    <input
                                      type="range"
                                      min={14}
                                      max={40}
                                      step={2}
                                      value={headerConfig.continuationLogoHeightPx || 20}
                                      onChange={(e) =>
                                        setHeaderConfig((prev) => ({
                                          ...prev,
                                          continuationLogoHeightPx: Number(e.target.value) || 20
                                        }))
                                      }
                                      className="w-full accent-blue-600 cursor-pointer h-1.5 bg-slate-200 rounded-lg"
                                    />
                                  </div>

                                  {/* Element Visibility Checkboxes */}
                                  <div className="grid grid-cols-2 gap-1.5">
                                    {[
                                      {
                                        key: 'showLogoOnContinuationPages' as const,
                                        label: 'Mini Logo',
                                        checked: headerConfig.showLogoOnContinuationPages !== false
                                      },
                                      {
                                        key: 'showCompanyNameOnContinuation' as const,
                                        label: 'Company Name',
                                        checked: headerConfig.showCompanyNameOnContinuation !== false
                                      },
                                      {
                                        key: 'showSubjectOnContinuation' as const,
                                        label: 'Project Subject',
                                        checked: headerConfig.showSubjectOnContinuation !== false
                                      },
                                      {
                                        key: 'showQuoteRefOnContinuation' as const,
                                        label: 'Quote Ref #',
                                        checked: headerConfig.showQuoteRefOnContinuation !== false
                                      },
                                      {
                                        key: 'showPageNumberOnContinuation' as const,
                                        label: 'Page Number',
                                        checked: headerConfig.showPageNumberOnContinuation !== false
                                      },
                                      {
                                        key: 'showContinuationDivider' as const,
                                        label: 'Bottom Divider',
                                        checked: headerConfig.showContinuationDivider !== false
                                      }
                                    ].map((item) => (
                                      <label
                                        key={item.key}
                                        className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-white border border-slate-200/80 cursor-pointer select-none"
                                      >
                                        <span className="text-[10.5px] font-medium text-slate-700">
                                          {item.label}
                                        </span>
                                        <input
                                          type="checkbox"
                                          checked={item.checked}
                                          onChange={(e) =>
                                            setHeaderConfig((prev) => ({
                                              ...prev,
                                              [item.key]: e.target.checked
                                            }))
                                          }
                                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                        />
                                      </label>
                                    ))}
                                  </div>
                                </div>
                              )}
                          </div>

                          {/* Informational Guardrail Card */}
                          <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-3 text-slate-600 space-y-1">
                            <div className="font-semibold text-blue-900 text-[11px] flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                              Document Instance &amp; Preset Snapshot
                            </div>
                            <p className="text-[10px] text-slate-500 leading-relaxed">
                              Custom uploaded logos, display modes, and dimensions persist automatically on this quotation, across R1→R2 revisions, and in saved Studio Presets.
                            </p>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </aside>
              )}

              {/* Retractable Right-Side Contextual Recipient Info Inspector Drawer */}
              {(selectedSection === 'recipient_info' || selectedSection === 'recipient_meta') && (
                <aside className="w-full sm:w-[380px] xl:w-[410px] bg-white border-l border-slate-300 shadow-xl flex flex-col shrink-0 z-20 print:hidden overflow-y-auto animate-in slide-in-from-right-4 duration-200">
                  {/* Drawer Header */}
                  <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between sticky top-0 z-10">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                        <User className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-bold text-slate-900 text-xs truncate">
                          Client &amp; Recipient Info
                        </h4>
                        <p className="text-[10px] text-slate-400 font-mono">
                          Structural Section • Submitted To / Attention
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedSection(null)}
                      className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/80 transition cursor-pointer"
                      title="Close Inspector"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Drawer Content */}
                  <div className="p-4 space-y-4 text-xs">
                    {/* 1. Presentation Style */}
                    <div className="space-y-2">
                      <label className="block text-slate-800 font-bold text-xs flex items-center gap-1.5">
                        <Sliders className="w-3.5 h-3.5 text-blue-600" />
                        Card Presentation Style
                      </label>
                      <p className="text-[10.5px] text-slate-500 leading-normal">
                        Toggle between an enterprise framed card box or a clean minimal divider line.
                      </p>
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        {[
                          { id: 'framed' as const, label: 'Framed Box', desc: 'Bordered card container' },
                          { id: 'minimal' as const, label: 'Minimal', desc: 'Clean accent divider' }
                        ].map((item) => {
                          const isSelected = (recipientConfig.recipientCardStyle || recipientConfig.style || blockStyle || 'framed') === item.id;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => setRecipientConfig((prev) => ({
                                ...prev,
                                recipientCardStyle: item.id
                              }))}
                              className={`py-2 px-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                                isSelected
                                  ? 'border-blue-600 bg-blue-50/80 text-blue-900 font-semibold ring-2 ring-blue-600/20'
                                  : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
                              }`}
                            >
                              <span className="text-xs font-semibold">{item.label}</span>
                              <span className="text-[9.5px] text-slate-400 mt-0.5">{item.desc}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* 2. Card Placement & Width (3-Way Placement Track) */}
                    <div className="space-y-2 pt-2 border-t border-slate-100">
                      <label className="block text-slate-800 font-bold text-xs flex items-center gap-1.5">
                        <Columns className="w-3.5 h-3.5 text-blue-600" />
                        Card Placement &amp; Width
                      </label>
                      <p className="text-[10.5px] text-slate-500 leading-normal">
                        Position on the 2-column A4 grid or span full 100% width.
                      </p>
                      <div className="grid grid-cols-3 gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
                        {[
                          { id: 'left' as const, label: 'Left 50%' },
                          { id: 'full' as const, label: 'Full 100%' },
                          { id: 'right' as const, label: 'Right 50%' }
                        ].map((opt) => {
                          const defaultPlacement =
                            (recipientConfig.cardsOrder || cardsOrder || 'recipient_first') === 'offer_first'
                              ? 'right'
                              : 'left';
                          const activePlacement =
                            recipientConfig.recipientPlacement ||
                            (recipientConfig.recipientCardWidth === '100' ? 'full' : defaultPlacement);
                          const isSelected = activePlacement === opt.id;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() =>
                                setRecipientConfig((prev) => ({
                                  ...prev,
                                  recipientPlacement: opt.id,
                                  recipientCardWidth: opt.id === 'full' ? '100' : '50',
                                  layout:
                                    opt.id === 'full' && (prev.offerPlacement === 'full' || prev.offerCardWidth === '100')
                                      ? 'stacked'
                                      : 'split'
                                }))
                              }
                              className={`py-2 px-2 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                                isSelected
                                  ? 'bg-blue-600 text-white shadow-xs'
                                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                              }`}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                      {/* Quick-Pair Action Buttons */}
                      <div className="grid grid-cols-2 gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            const currentOrder = recipientConfig.cardsOrder || cardsOrder || 'recipient_first';
                            setRecipientConfig((prev) => ({
                              ...prev,
                              layout: 'split',
                              recipientPlacement: currentOrder === 'offer_first' ? 'right' : 'left',
                              offerPlacement: currentOrder === 'offer_first' ? 'left' : 'right',
                              recipientCardWidth: '50',
                              offerCardWidth: '50'
                            }));
                          }}
                          className="py-1.5 px-2 rounded-lg border border-slate-200 hover:border-blue-300 bg-slate-50 hover:bg-blue-50/50 text-[10px] font-semibold text-slate-700 transition cursor-pointer"
                        >
                          Pair 50/50 Side-by-Side
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setRecipientConfig((prev) => ({
                              ...prev,
                              layout: 'stacked',
                              recipientPlacement: 'full',
                              offerPlacement: 'full',
                              recipientCardWidth: '100',
                              offerCardWidth: '100'
                            }))
                          }
                          className="py-1.5 px-2 rounded-lg border border-slate-200 hover:border-blue-300 bg-slate-50 hover:bg-blue-50/50 text-[10px] font-semibold text-slate-700 transition cursor-pointer"
                        >
                          Stack Both 100%
                        </button>
                      </div>
                    </div>

                    {/* 3. Card Corners */}
                    <div className="space-y-2 pt-2 border-t border-slate-100">
                      <label className="block text-slate-800 font-bold text-xs flex items-center gap-1.5">
                        <Square className="w-3.5 h-3.5 text-blue-600" />
                        Card Corner Radius
                      </label>
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        {[
                          { id: 'rounded' as const, label: 'Rounded Corners', desc: 'Modern enterprise' },
                          { id: 'sharp' as const, label: 'Sharp Corners', desc: 'Classic rectangular' }
                        ].map((item) => {
                          const isSelected = (recipientConfig.recipientCardRadius || globalCardRadius || 'rounded') === item.id;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => setRecipientConfig((prev) => ({
                                ...prev,
                                recipientCardRadius: item.id
                              }))}
                              className={`py-2 px-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                                isSelected
                                  ? 'border-blue-600 bg-blue-50/80 text-blue-900 font-semibold ring-2 ring-blue-600/20'
                                  : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
                              }`}
                            >
                              <span className="text-xs font-semibold">{item.label}</span>
                              <span className="text-[9.5px] text-slate-400 mt-0.5">{item.desc}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Top Cards Ordering */}
                    <div className="space-y-2 pt-2 border-t border-slate-100">
                      <label className="block text-slate-800 font-bold text-xs flex items-center gap-1.5">
                        <ArrowLeftRight className="w-3.5 h-3.5 text-blue-600" />
                        Top Cards Sequence
                      </label>
                      <p className="text-[10.5px] text-slate-500 leading-normal">
                        Order of Client Information and Commercial Offer cards.
                      </p>
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        {[
                          { id: 'recipient_first' as const, label: 'Submitted To First', desc: 'Client first / left' },
                          { id: 'offer_first' as const, label: 'Commercial Offer First', desc: 'Offer first / left' }
                        ].map((item) => {
                          const isSelected = (recipientConfig.cardsOrder || cardsOrder || 'recipient_first') === item.id;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => {
                                setCardsOrder(item.id);
                                setRecipientConfig((prev) => {
                                  const isRecFull = prev.recipientPlacement === 'full' || prev.recipientCardWidth === '100';
                                  const isOffFull = prev.offerPlacement === 'full' || prev.offerCardWidth === '100';
                                  return {
                                    ...prev,
                                    cardsOrder: item.id,
                                    ...(!isRecFull && !isOffFull
                                      ? {
                                          recipientPlacement: item.id === 'offer_first' ? 'right' : 'left',
                                          offerPlacement: item.id === 'offer_first' ? 'left' : 'right'
                                        }
                                      : {})
                                  };
                                });
                              }}
                              className={`py-2 px-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                                isSelected
                                  ? 'border-blue-600 bg-blue-50/80 text-blue-900 font-semibold ring-2 ring-blue-600/20'
                                  : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
                              }`}
                            >
                              <span className="text-xs font-semibold">{item.label}</span>
                              <span className="text-[9.5px] text-slate-400 mt-0.5">{item.desc}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* 4. Attention To Toggle */}
                    <div className="space-y-2 pt-2 border-t border-slate-100">
                      <label className="block text-slate-800 font-bold text-xs flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-blue-600" />
                        Attention Contact Visibility
                      </label>
                      <div className="pt-1">
                        <div
                          className={`border rounded-xl p-2.5 transition-all flex items-center justify-between gap-2 ${
                            recipientConfig.showAttention !== false
                              ? 'bg-white border-slate-200 shadow-2xs'
                              : 'bg-slate-50/70 border-slate-200/60 opacity-60'
                          }`}
                        >
                          <div className="min-w-0 pr-1">
                            <span className="font-semibold text-slate-800 text-xs block leading-tight">
                              Attention To (Attn:)
                            </span>
                            <span className="text-[10px] text-slate-400 block mt-0.5 truncate">
                              Client contact person or department
                            </span>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer shrink-0">
                            <input
                              type="checkbox"
                              checked={recipientConfig.showAttention !== false}
                              onChange={(e) =>
                                setRecipientConfig((prev) => ({
                                  ...prev,
                                  showAttention: e.target.checked
                                }))
                              }
                              className="sr-only peer"
                            />
                            <div className="w-8 h-4.5 bg-slate-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-blue-600"></div>
                          </label>
                        </div>

                        {recipientConfig.showAttention !== false && (
                          <div className="space-y-1 pt-1.5">
                            <label className="text-slate-700 font-semibold text-[11px] block">
                              Attention Contact Person Name
                            </label>
                            <input
                              type="text"
                              value={clientContactPerson}
                              onChange={(e) => setClientContactPerson(e.target.value)}
                              placeholder="e.g. Monali Kharge"
                              className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs"
                            />
                            <p className="text-[10px] text-slate-400">
                              Inherited directly from customer enquiry or contact record.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 3. Client Details on This Quote (Editable Snapshot) */}
                    <div className="space-y-2 pt-2 border-t border-slate-100">
                      <label className="block text-slate-800 font-bold text-xs flex items-center gap-1.5">
                        <Building className="w-3.5 h-3.5 text-blue-600" />
                        Client Details on This Quote
                      </label>
                      <p className="text-[10px] text-slate-500 leading-normal">
                        Edit client details below or click directly on the A4 preview card.
                      </p>
                      <div className="border border-slate-200 bg-slate-50/70 rounded-xl p-3 space-y-2.5 text-[11px]">
                        <div>
                          <label className="text-slate-500 text-[10px] uppercase font-bold block mb-1">
                            Company / Client Name
                          </label>
                          <input
                            type="text"
                            value={clientNameOverride}
                            onChange={(e) => setClientNameOverride(e.target.value)}
                            placeholder="Client Company Name"
                            className="w-full px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-900 font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="text-slate-500 text-[10px] uppercase font-bold block mb-1">
                            Registered Address
                          </label>
                          <input
                            type="text"
                            value={clientAddressOverride}
                            onChange={(e) => setClientAddressOverride(e.target.value)}
                            placeholder="City, Country or P.O. Box"
                            className="w-full px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="text-slate-500 text-[10px] uppercase font-bold block mb-1">
                            Tax Registration (TRN)
                          </label>
                          <input
                            type="text"
                            value={clientTrnOverride}
                            onChange={(e) => setClientTrnOverride(e.target.value)}
                            placeholder="Optional Client TRN"
                            className="w-full px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Informational Guardrail Card */}
                    <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-3 text-slate-600 space-y-1">
                      <div className="font-semibold text-blue-900 text-[11px] flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                        Saved With This Quote Only
                      </div>
                      <p className="text-[10px] text-slate-500 leading-relaxed">
                        Changes to client details here apply only to this quotation version without overwriting your master CRM records.
                      </p>
                    </div>
                  </div>
                </aside>
              )}

              {/* Retractable Right-Side Contextual Commercial Offer Inspector Drawer */}
              {selectedSection === 'quote_meta' && (
                <aside className="w-full sm:w-[380px] xl:w-[410px] bg-white border-l border-slate-300 shadow-xl flex flex-col shrink-0 z-20 print:hidden overflow-y-auto animate-in slide-in-from-right-4 duration-200">
                  {/* Drawer Header */}
                  <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between sticky top-0 z-10">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                        <FileCheck className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-bold text-slate-900 text-xs truncate">
                          Commercial Offer Metadata
                        </h4>
                        <p className="text-[10px] text-slate-400 font-mono">
                          Structural Section • Quotation Header
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedSection(null)}
                      className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/80 transition cursor-pointer"
                      title="Close Inspector"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Drawer Content */}
                  <div className="p-4 space-y-4 text-xs">
                    {/* 1. Presentation Style */}
                    <div className="space-y-2">
                      <label className="block text-slate-800 font-bold text-xs flex items-center gap-1.5">
                        <Sliders className="w-3.5 h-3.5 text-blue-600" />
                        Card Presentation Style
                      </label>
                      <p className="text-[10.5px] text-slate-500 leading-normal">
                        Bordered card box vs clean minimal divider.
                      </p>
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        {[
                          { id: 'framed' as const, label: 'Framed Box', desc: 'Bordered container' },
                          { id: 'minimal' as const, label: 'Minimal', desc: 'Clean divider' }
                        ].map((item) => {
                          const isSelected = (recipientConfig.offerCardStyle || recipientConfig.style || blockStyle || 'framed') === item.id;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => setRecipientConfig((prev) => ({
                                ...prev,
                                offerCardStyle: item.id
                              }))}
                              className={`py-2 px-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                                isSelected
                                  ? 'border-blue-600 bg-blue-50/80 text-blue-900 font-semibold ring-2 ring-blue-600/20'
                                  : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
                              }`}
                            >
                              <span className="text-xs font-semibold">{item.label}</span>
                              <span className="text-[9.5px] text-slate-400 mt-0.5">{item.desc}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* 2. Card Placement & Width (3-Way Placement Track) */}
                    <div className="space-y-2 pt-2 border-t border-slate-100">
                      <label className="block text-slate-800 font-bold text-xs flex items-center gap-1.5">
                        <Columns className="w-3.5 h-3.5 text-blue-600" />
                        Card Placement &amp; Width
                      </label>
                      <p className="text-[10.5px] text-slate-500 leading-normal">
                        Position on the 2-column A4 grid or span full 100% width (compact 4-column horizontal bar).
                      </p>
                      <div className="grid grid-cols-3 gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
                        {[
                          { id: 'left' as const, label: 'Left 50%' },
                          { id: 'full' as const, label: 'Full 100%' },
                          { id: 'right' as const, label: 'Right 50%' }
                        ].map((opt) => {
                          const defaultPlacement =
                            (recipientConfig.cardsOrder || cardsOrder || 'recipient_first') === 'offer_first'
                              ? 'left'
                              : 'right';
                          const activePlacement =
                            recipientConfig.offerPlacement ||
                            (recipientConfig.offerCardWidth === '100' ? 'full' : defaultPlacement);
                          const isSelected = activePlacement === opt.id;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() =>
                                setRecipientConfig((prev) => ({
                                  ...prev,
                                  offerPlacement: opt.id,
                                  offerCardWidth: opt.id === 'full' ? '100' : '50',
                                  layout:
                                    opt.id === 'full' && (prev.recipientPlacement === 'full' || prev.recipientCardWidth === '100')
                                      ? 'stacked'
                                      : 'split'
                                }))
                              }
                              className={`py-2 px-2 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                                isSelected
                                  ? 'bg-blue-600 text-white shadow-xs'
                                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                              }`}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                      {/* Quick-Pair Action Buttons */}
                      <div className="grid grid-cols-2 gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            const currentOrder = recipientConfig.cardsOrder || cardsOrder || 'recipient_first';
                            setRecipientConfig((prev) => ({
                              ...prev,
                              layout: 'split',
                              recipientPlacement: currentOrder === 'offer_first' ? 'right' : 'left',
                              offerPlacement: currentOrder === 'offer_first' ? 'left' : 'right',
                              recipientCardWidth: '50',
                              offerCardWidth: '50'
                            }));
                          }}
                          className="py-1.5 px-2 rounded-lg border border-slate-200 hover:border-blue-300 bg-slate-50 hover:bg-blue-50/50 text-[10px] font-semibold text-slate-700 transition cursor-pointer"
                        >
                          Pair 50/50 Side-by-Side
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setRecipientConfig((prev) => ({
                              ...prev,
                              layout: 'stacked',
                              recipientPlacement: 'full',
                              offerPlacement: 'full',
                              recipientCardWidth: '100',
                              offerCardWidth: '100'
                            }))
                          }
                          className="py-1.5 px-2 rounded-lg border border-slate-200 hover:border-blue-300 bg-slate-50 hover:bg-blue-50/50 text-[10px] font-semibold text-slate-700 transition cursor-pointer"
                        >
                          Stack Both 100%
                        </button>
                      </div>
                    </div>

                    {/* 3. Card Corners */}
                    <div className="space-y-2 pt-2 border-t border-slate-100">
                      <label className="block text-slate-800 font-bold text-xs flex items-center gap-1.5">
                        <Square className="w-3.5 h-3.5 text-blue-600" />
                        Card Corner Radius
                      </label>
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        {[
                          { id: 'rounded' as const, label: 'Rounded Corners', desc: 'Modern enterprise' },
                          { id: 'sharp' as const, label: 'Sharp Corners', desc: 'Classic rectangular' }
                        ].map((item) => {
                          const isSelected = (recipientConfig.offerCardRadius || globalCardRadius || 'rounded') === item.id;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => setRecipientConfig((prev) => ({
                                ...prev,
                                offerCardRadius: item.id
                              }))}
                              className={`py-2 px-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                                isSelected
                                  ? 'border-blue-600 bg-blue-50/80 text-blue-900 font-semibold ring-2 ring-blue-600/20'
                                  : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
                              }`}
                            >
                              <span className="text-xs font-semibold">{item.label}</span>
                              <span className="text-[9.5px] text-slate-400 mt-0.5">{item.desc}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Top Cards Ordering */}
                    <div className="space-y-2 pt-2 border-t border-slate-100">
                      <label className="block text-slate-800 font-bold text-xs flex items-center gap-1.5">
                        <ArrowLeftRight className="w-3.5 h-3.5 text-blue-600" />
                        Top Cards Sequence
                      </label>
                      <p className="text-[10.5px] text-slate-500 leading-normal">
                        Order of Client Information and Commercial Offer cards.
                      </p>
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        {[
                          { id: 'recipient_first' as const, label: 'Submitted To First', desc: 'Client first / left' },
                          { id: 'offer_first' as const, label: 'Commercial Offer First', desc: 'Offer first / left' }
                        ].map((item) => {
                          const isSelected = (recipientConfig.cardsOrder || cardsOrder || 'recipient_first') === item.id;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => {
                                setCardsOrder(item.id);
                                setRecipientConfig((prev) => {
                                  const isRecFull = prev.recipientPlacement === 'full' || prev.recipientCardWidth === '100';
                                  const isOffFull = prev.offerPlacement === 'full' || prev.offerCardWidth === '100';
                                  return {
                                    ...prev,
                                    cardsOrder: item.id,
                                    ...(!isRecFull && !isOffFull
                                      ? {
                                          recipientPlacement: item.id === 'offer_first' ? 'right' : 'left',
                                          offerPlacement: item.id === 'offer_first' ? 'left' : 'right'
                                        }
                                      : {})
                                  };
                                });
                              }}
                              className={`py-2 px-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                                isSelected
                                  ? 'border-blue-600 bg-blue-50/80 text-blue-900 font-semibold ring-2 ring-blue-600/20'
                                  : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
                              }`}
                            >
                              <span className="text-xs font-semibold">{item.label}</span>
                              <span className="text-[9.5px] text-slate-400 mt-0.5">{item.desc}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* 4. Metadata Field Toggles */}
                    <div className="space-y-2 pt-2 border-t border-slate-100">
                      <label className="block text-slate-800 font-bold text-xs flex items-center gap-1.5">
                        <Columns className="w-3.5 h-3.5 text-blue-600" />
                        Commercial Field Visibility
                      </label>
                      <p className="text-[10.5px] text-slate-500 leading-normal">
                        Toggle commercial validity, representative, and enquiry reference fields.
                      </p>
                      <div className="space-y-1.5 pt-1">
                        {[
                          {
                            key: 'showValidity' as const,
                            label: 'Validity Expiry Date',
                            desc: 'Offer expiration deadline date',
                            checked: recipientConfig.showValidity !== false
                          },
                          {
                            key: 'showSalesRep' as const,
                            label: 'Prepared By / Sales Rep',
                            desc: 'Account representative name',
                            checked: recipientConfig.showSalesRep !== false
                          },
                          {
                            key: 'showEnquiryRef' as const,
                            label: 'Enquiry Reference',
                            desc: 'Linked customer enquiry ref',
                            checked: recipientConfig.showEnquiryRef !== false
                          }
                        ].map((item) => (
                          <div
                            key={item.key}
                            className={`border rounded-xl p-2.5 transition-all flex items-center justify-between gap-2 ${
                              item.checked
                                ? 'bg-white border-slate-200 shadow-2xs'
                                : 'bg-slate-50/70 border-slate-200/60 opacity-60'
                            }`}
                          >
                            <div className="min-w-0 pr-1">
                              <span className="font-semibold text-slate-800 text-xs block leading-tight">
                                {item.label}
                              </span>
                              <span className="text-[10px] text-slate-400 block mt-0.5 truncate">
                                {item.desc}
                              </span>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer shrink-0">
                              <input
                                type="checkbox"
                                checked={item.checked}
                                onChange={(e) =>
                                  setRecipientConfig((prev) => ({
                                    ...prev,
                                    [item.key]: e.target.checked
                                  }))
                                }
                                className="sr-only peer"
                              />
                              <div className="w-8 h-4.5 bg-slate-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-blue-600"></div>
                            </label>
                          </div>
                        ))}

                        {recipientConfig.showSalesRep !== false && (
                          <div className="space-y-1 pt-1.5">
                            <label className="text-slate-700 font-semibold text-[11px] block">
                              Sales Representative (Prepared By)
                            </label>
                            <input
                              type="text"
                              value={preparedBy}
                              onChange={(e) => setPreparedBy(e.target.value)}
                              placeholder="e.g. Nitin Srivastava"
                              className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs"
                            />
                            <p className="text-[10px] text-slate-400">
                              Inherited directly from assigned salesperson.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 3. Offer Summary Info */}
                    <div className="space-y-2 pt-2 border-t border-slate-100">
                      <label className="block text-slate-800 font-bold text-xs flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-blue-600" />
                        Document Reference Data
                      </label>
                      <div className="border border-slate-200 bg-slate-50/70 rounded-xl p-3 space-y-1.5 text-[11px]">
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400">Quote Ref:</span>
                          <span className="font-mono font-bold text-slate-900">
                            {liveQuotation.formatted_quote_ref || liveQuotation.quote_number}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400">Revision:</span>
                          <span className="font-semibold text-slate-800">
                            Rev {liveQuotation.revision_number}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400">Document Status:</span>
                          <span className="font-bold text-slate-700 uppercase tracking-wide text-[10px]">
                            {liveQuotation.status}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </aside>
              )}

              {/* Retractable Right-Side Contextual Project Subject Banner Inspector Drawer */}
              {selectedSection === 'subject' && (
                <aside className="w-full sm:w-[380px] xl:w-[410px] bg-white border-l border-slate-300 shadow-xl flex flex-col shrink-0 z-20 print:hidden overflow-y-auto animate-in slide-in-from-right-4 duration-200">
                  {/* Drawer Header */}
                  <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between sticky top-0 z-10">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                        <Tag className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-bold text-slate-900 text-xs truncate">
                          Project Subject Banner
                        </h4>
                        <p className="text-[10px] text-slate-400 font-mono">
                          Structural Section • Document Scope
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedSection(null)}
                      className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/80 transition cursor-pointer"
                      title="Close Inspector"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Drawer Content */}
                  <div className="p-4 space-y-4 text-xs">
                    {/* 1. Visibility Toggle */}
                    <div className="border rounded-xl p-3 bg-white border-slate-200 shadow-2xs flex items-center justify-between gap-2">
                      <div className="min-w-0 pr-1">
                        <span className="font-semibold text-slate-800 text-xs block leading-tight">
                          Show Subject Banner
                        </span>
                        <span className="text-[10px] text-slate-400 block mt-0.5 truncate">
                          Render subject directly above line items
                        </span>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer shrink-0">
                        <input
                          type="checkbox"
                          checked={recipientConfig.showSubject !== false}
                          onChange={(e) =>
                            setRecipientConfig((prev) => ({
                              ...prev,
                              showSubject: e.target.checked
                            }))
                          }
                          className="sr-only peer"
                        />
                        <div className="w-8 h-4.5 bg-slate-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>

                    {/* 2. Subject Line Input */}
                    <div className="space-y-1.5 pt-1">
                      <label className="text-slate-800 font-bold text-xs flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-blue-600" />
                        Quotation Subject / Scope Line
                      </label>
                      <p className="text-[10.5px] text-slate-500 leading-normal">
                        Concise summary of project scope, enquiry equipment or job reference.
                      </p>
                      <AtMentionTextarea
                        rows={3}
                        value={quotationSubject}
                        onChange={setQuotationSubject}
                        tokenContext={studioTokenContext}
                        placeholder="e.g. Proposal for RO Equipment – @project_name"
                        className="w-full px-2.5 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs leading-relaxed resize-none"
                      />
                      <p className="text-[10px] text-slate-400">
                        Inherited automatically from customer enquiry subject if available. Type <span className="font-mono text-blue-600">@</span> to insert live fields.
                      </p>
                    </div>

                    {/* 3. Subject Banner Placement */}
                    <div className="space-y-2 pt-2 border-t border-slate-100">
                      <label className="block text-slate-800 font-bold text-xs flex items-center gap-1.5">
                        <MoveVertical className="w-3.5 h-3.5 text-blue-600" />
                        Banner Placement
                      </label>
                      <p className="text-[10.5px] text-slate-500 leading-normal">
                        Choose whether the subject banner displays above cards or below cards (directly above table).
                      </p>
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        {[
                          { id: 'above_cards' as const, label: 'Above Cards', desc: 'Directly below header' },
                          { id: 'below_cards' as const, label: 'Below Cards', desc: 'Directly above table' }
                        ].map((item) => {
                          const isSelected = (recipientConfig.subjectPlacement || subjectPlacement || 'below_cards') === item.id;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => {
                                setSubjectPlacement(item.id);
                                setRecipientConfig((prev) => ({
                                  ...prev,
                                  subjectPlacement: item.id
                                }));
                              }}
                              className={`py-2 px-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                                isSelected
                                  ? 'border-blue-600 bg-blue-50/80 text-blue-900 font-semibold ring-2 ring-blue-600/20'
                                  : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
                              }`}
                            >
                              <span className="text-xs font-semibold">{item.label}</span>
                              <span className="text-[9.5px] text-slate-400 mt-0.5">{item.desc}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Informational Guardrail Card */}
                    <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-3 text-slate-600 space-y-1">
                      <div className="font-semibold text-blue-900 text-[11px] flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                        Clean Enterprise Banner
                      </div>
                      <p className="text-[10px] text-slate-500 leading-relaxed">
                        The subject banner appears above the itemized table with balanced neutral styling and full print parity.
                      </p>
                    </div>
                  </div>
                </aside>
              )}

              {/* Retractable Right-Side Contextual Footer & Legal Inspector Drawer */}
              {selectedSection === 'footer' && (
                <aside className="w-full sm:w-[380px] xl:w-[410px] bg-white border-l border-slate-300 shadow-xl flex flex-col shrink-0 z-20 print:hidden overflow-y-auto animate-in slide-in-from-right-4 duration-200">
                  {/* Drawer Header */}
                  <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between sticky top-0 z-10">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                        <ShieldCheck className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-bold text-slate-900 text-xs truncate">
                          Page Footer &amp; Disclaimer
                        </h4>
                        <p className="text-[10px] text-slate-400 font-mono">
                          Structural Section • Legal Watermark
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedSection(null)}
                      className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/80 transition cursor-pointer"
                      title="Close Inspector"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Drawer Content */}
                  <div className="p-4 space-y-4 text-xs">
                    {/* 1. Page Numbers & Legal Disclaimer Toggles */}
                    <div className="space-y-2">
                      <label className="block text-slate-800 font-bold text-xs flex items-center gap-1.5">
                        <Sliders className="w-3.5 h-3.5 text-blue-600" />
                        Footer Features
                      </label>
                      <p className="text-[10.5px] text-slate-500 leading-normal">
                        Configure page numbering and automatic computer-generated legal disclaimer.
                      </p>
                      <div className="space-y-1.5 pt-1">
                        <div
                          className={`border rounded-xl p-2.5 transition-all flex items-center justify-between gap-2 ${
                            footerConfig.showPageNumbers !== false
                              ? 'bg-white border-slate-200 shadow-2xs'
                              : 'bg-slate-50/70 border-slate-200/60 opacity-60'
                          }`}
                        >
                          <div className="min-w-0 pr-1">
                            <span className="font-semibold text-slate-800 text-xs block leading-tight">
                              Show Page Numbers
                            </span>
                            <span className="text-[10px] text-slate-400 block mt-0.5 truncate">
                              Print dynamic sheet-page counter
                            </span>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer shrink-0">
                            <input
                              type="checkbox"
                              checked={footerConfig.showPageNumbers !== false}
                              onChange={(e) =>
                                setFooterConfig((prev) => ({
                                  ...prev,
                                  showPageNumbers: e.target.checked
                                }))
                              }
                              className="sr-only peer"
                            />
                            <div className="w-8 h-4.5 bg-slate-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-blue-600"></div>
                          </label>
                        </div>

                        <div
                          className={`border rounded-xl p-2.5 transition-all flex items-center justify-between gap-2 ${
                            footerConfig.showDisclaimer !== false
                              ? 'bg-white border-slate-200 shadow-2xs'
                              : 'bg-slate-50/70 border-slate-200/60 opacity-60'
                          }`}
                        >
                          <div className="min-w-0 pr-1">
                            <span className="font-semibold text-slate-800 text-xs block leading-tight">
                              Show Legal Disclaimer
                            </span>
                            <span className="text-[10px] text-slate-400 block mt-0.5 truncate">
                              Display micro-footer legal text
                            </span>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer shrink-0">
                            <input
                              type="checkbox"
                              checked={footerConfig.showDisclaimer !== false}
                              onChange={(e) =>
                                setFooterConfig((prev) => ({
                                  ...prev,
                                  showDisclaimer: e.target.checked
                                }))
                              }
                              className="sr-only peer"
                            />
                            <div className="w-8 h-4.5 bg-slate-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-blue-600"></div>
                          </label>
                        </div>
                      </div>
                    </div>

                    {/* 2. Footer Alignment & Badges */}
                    <div className="space-y-2.5 pt-2 border-t border-slate-100">
                      <label className="block text-slate-800 font-bold text-xs flex items-center gap-1.5">
                        <AlignLeft className="w-3.5 h-3.5 text-blue-600" />
                        Footer Alignment &amp; Badges
                      </label>
                      <div className="grid grid-cols-4 gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200/80">
                        {(['split', 'left', 'center', 'right'] as const).map((hMode) => {
                          const isSelected = (footerConfig.footerHorizontalAlign || 'split') === hMode;
                          return (
                            <button
                              key={hMode}
                              type="button"
                              onClick={() =>
                                setFooterConfig((prev) => ({
                                  ...prev,
                                  footerHorizontalAlign: hMode
                                }))
                              }
                              className={`py-1.5 rounded-lg text-[10.5px] font-semibold capitalize transition cursor-pointer ${
                                isSelected
                                  ? 'bg-blue-600 text-white shadow-2xs'
                                  : 'text-slate-600 hover:bg-white'
                              }`}
                            >
                              {hMode}
                            </button>
                          );
                        })}
                      </div>

                      <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200/80">
                        {(['top', 'middle', 'bottom'] as const).map((vMode) => {
                          const isSelected = (footerConfig.footerVerticalAlign || 'middle') === vMode;
                          return (
                            <button
                              key={vMode}
                              type="button"
                              onClick={() =>
                                setFooterConfig((prev) => ({
                                  ...prev,
                                  footerVerticalAlign: vMode
                                }))
                              }
                              className={`py-1 rounded-lg text-[10px] font-semibold capitalize transition cursor-pointer ${
                                isSelected
                                  ? 'bg-slate-800 text-white shadow-2xs'
                                  : 'text-slate-600 hover:bg-white'
                              }`}
                            >
                              Align {vMode}
                            </button>
                          );
                        })}
                      </div>

                      <div className="space-y-1.5 pt-1">
                        {[
                          {
                            key: 'showSystemTagline' as const,
                            label: 'Show System Tagline',
                            checked: footerConfig.showSystemTagline !== false
                          },
                          {
                            key: 'showReferenceInFooter' as const,
                            label: 'Show Quote Ref Pill in Footer',
                            checked: footerConfig.showReferenceInFooter !== false
                          },
                          {
                            key: 'showIssueDateInFooter' as const,
                            label: 'Show Issue Date Pill in Footer',
                            checked: footerConfig.showIssueDateInFooter !== false
                          }
                        ].map((fItem) => (
                          <label
                            key={fItem.key}
                            className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200/80 cursor-pointer"
                          >
                            <span className="text-[11px] font-medium text-slate-700">{fItem.label}</span>
                            <input
                              type="checkbox"
                              checked={fItem.checked}
                              onChange={(e) =>
                                setFooterConfig((prev) => ({
                                  ...prev,
                                  [fItem.key]: e.target.checked
                                }))
                              }
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                          </label>
                        ))}
                      </div>

                      {footerConfig.showSystemTagline !== false && (
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">
                            System Tagline Override
                          </label>
                          <input
                            type="text"
                            value={footerConfig.systemTaglineText ?? 'Generated via DealFlow Commercial Engine'}
                            onChange={(e) =>
                              setFooterConfig((prev) => ({
                                ...prev,
                                systemTaglineText: e.target.value
                              }))
                            }
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-800"
                          />
                        </div>
                      )}

                      {/* Custom Footer Pills */}
                      <div className="space-y-1.5 pt-1">
                        <label className="block text-[10px] font-semibold text-slate-500 uppercase">
                          Custom Footer Metadata Pills (e.g. ISO 9001:2015)
                        </label>
                        <div className="flex gap-1.5">
                          <input
                            type="text"
                            value={newCustomFooterPill}
                            onChange={(e) => setNewCustomFooterPill(e.target.value)}
                            placeholder="Add custom footer badge..."
                            className="flex-1 px-2 py-1 rounded-lg border border-slate-200 bg-white text-xs text-slate-800"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const trimmed = newCustomFooterPill.trim();
                              if (!trimmed) return;
                              setFooterConfig((prev) => ({
                                ...prev,
                                customFooterPills: [...(prev.customFooterPills || []), trimmed]
                              }));
                              setNewCustomFooterPill('');
                            }}
                            className="px-2.5 py-1 rounded-lg bg-slate-800 text-white text-[11px] font-semibold cursor-pointer"
                          >
                            + Add
                          </button>
                        </div>
                        {Array.isArray(footerConfig.customFooterPills) &&
                          footerConfig.customFooterPills.length > 0 && (
                            <div className="flex flex-wrap gap-1 pt-1">
                              {footerConfig.customFooterPills.map((pill, pIdx) => (
                                <span
                                  key={`${pill}_${pIdx}`}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-mono"
                                >
                                  <span>{pill}</span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setFooterConfig((prev) => ({
                                        ...prev,
                                        customFooterPills: (prev.customFooterPills || []).filter(
                                          (_, idx) => idx !== pIdx
                                        )
                                      }))
                                    }
                                    className="text-blue-400 hover:text-rose-600 cursor-pointer"
                                  >
                                    ×
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                      </div>
                    </div>

                    {/* 3. Custom Micro-Footer Disclaimer Text */}
                    <div className="space-y-2 pt-2 border-t border-slate-100">
                      <div className="flex items-center justify-between">
                        <label className="block text-slate-800 font-bold text-xs flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-blue-600" />
                          Custom Disclaimer Notice
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            setFooterConfig((prev) => ({
                              ...prev,
                              customDisclaimer: DEFAULT_FOOTER_CONFIG.customDisclaimer
                            }))
                          }
                          className="text-[10px] text-blue-600 hover:text-blue-800 font-medium cursor-pointer"
                        >
                          Reset Default
                        </button>
                      </div>
                      <p className="text-[10.5px] text-slate-500 leading-normal">
                        Custom legal baseline text printed at the bottom of each page.
                      </p>
                      <AtMentionTextarea
                        rows={3}
                        value={footerConfig.customDisclaimer ?? DEFAULT_FOOTER_CONFIG.customDisclaimer ?? ''}
                        onChange={(nextVal) =>
                          setFooterConfig((prev) => ({
                            ...prev,
                            customDisclaimer: nextVal
                          }))
                        }
                        tokenContext={studioTokenContext}
                        className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition resize-none"
                        placeholder="Enter custom micro-footer disclaimer... Type @ for live tags"
                      />
                    </div>

                    {/* Informational Guardrail Card */}
                    <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-3 text-slate-600 space-y-1">
                      <div className="font-semibold text-blue-900 text-[11px] flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                        Print Watermark Baseline
                      </div>
                      <p className="text-[10px] text-slate-500 leading-relaxed">
                        The footer remains anchored to the bottom edge in print geometry and automatically repeats cleanly across multi-page sheets.
                      </p>
                    </div>
                  </div>
                </aside>
              )}

              {/* Retractable Right-Side Contextual Table Inspector Drawer */}
              {selectedSection === 'items_table' && (
                <aside className="w-full sm:w-[380px] xl:w-[410px] bg-white border-l border-slate-300 shadow-xl flex flex-col shrink-0 z-20 print:hidden overflow-y-auto animate-in slide-in-from-right-4 duration-200">
                  {/* Drawer Header */}
                  <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between sticky top-0 z-10">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                        <Table className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-bold text-slate-900 text-xs truncate">
                          Line Items Table
                        </h4>
                        <p className="text-[10px] text-slate-400 font-mono">
                          Structural Section • Fixed Canvas Layout
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedSection(null)}
                      className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/80 transition cursor-pointer"
                      title="Close Inspector"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Drawer Content */}
                  <div className="p-4 space-y-4 text-xs">
                    {/* 0. Unified Commercial Summary & Totals Hub Shortcut */}
                    <div className="p-3 rounded-xl border border-indigo-200 bg-indigo-50/60 space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-indigo-950 text-xs flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-indigo-600" />
                          Option Display, BOM Pricing &amp; Totals
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[9.5px] font-mono font-bold bg-white border border-indigo-200 text-indigo-700">
                          {isUnpricedSubmittalMode
                            ? 'Unpriced / DO'
                            : optionDisplayMode === 'combined_table'
                            ? 'Standard Table'
                            : 'Multi-Option'}
                        </span>
                      </div>
                      <p className="text-[10.5px] text-indigo-900/80 leading-relaxed">
                        Multi-Option table layout, Unpriced Submittal / DO mode, batch BOM Set pricing, and financial summary rows are managed in the unified Commercial Summary &amp; Totals Hub.
                      </p>
                      <button
                        type="button"
                        onClick={() => handleCanvasSelectSection('totals')}
                        className="w-full py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-[11px] flex items-center justify-between transition shadow-2xs cursor-pointer"
                      >
                        <span>Configure Totals, Options &amp; Price Display</span>
                        <span className="font-mono text-sm leading-none">&rarr;</span>
                      </button>
                    </div>

                    {/* 1. Column Visibility Toggles */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                          <Columns className="w-3.5 h-3.5 text-blue-600" />
                          Column Visibility
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">
                          {Object.values(visibleColumns).filter(Boolean).length} Active
                        </span>
                      </div>
                      <p className="text-[10.5px] text-slate-500 leading-normal">
                        Toggle optional technical specifications and commercial rate columns on the quotation document.
                      </p>

                      <div className="space-y-1.5 pt-1">
                        {[
                          {
                            key: 'brand' as const,
                            label: 'Brand / Make',
                            desc: 'Show equipment brand / manufacturer',
                            checked: visibleColumns.brand !== false,
                            onChange: (checked: boolean) =>
                              setVisibleColumns((prev) => ({ ...prev, brand: checked }))
                          },
                          {
                            key: 'model' as const,
                            label: 'Model / Part #',
                            desc: 'Catalog item or part designation',
                            checked: visibleColumns.model !== false,
                            onChange: (checked: boolean) =>
                              setVisibleColumns((prev) => ({ ...prev, model: checked }))
                          },
                          {
                            key: 'origin' as const,
                            label: 'Origin / Country',
                            desc: 'Manufacturing country of origin',
                            checked: visibleColumns.origin !== false,
                            onChange: (checked: boolean) =>
                              setVisibleColumns((prev) => ({ ...prev, origin: checked }))
                          },
                          {
                            key: 'availability' as const,
                            label: 'Delivery / Availability',
                            desc: 'Dispatch lead time & stock timeline',
                            checked: visibleColumns.availability !== false,
                            onChange: (checked: boolean) =>
                              setVisibleColumns((prev) => ({ ...prev, availability: checked }))
                          },
                          {
                            key: 'unit_price' as const,
                            label: 'Show Unit Price Column',
                            desc: 'Show individual rates (auto-expands Description when hidden)',
                            checked: visibleColumns.unit_price !== false && visibleColumns.showUnitPrice !== false,
                            onChange: (checked: boolean) =>
                              setVisibleColumns((prev) => ({
                                ...prev,
                                unit_price: checked,
                                showUnitPrice: checked
                              }))
                          },
                          {
                            key: 'showUom' as const,
                            label: 'Show UOM / Unit Column',
                            desc: 'Show unit of measure column (pcs, set, lot)',
                            checked: visibleColumns.showUom !== false,
                            onChange: (checked: boolean) =>
                              setVisibleColumns((prev) => ({ ...prev, showUom: checked }))
                          }
                        ].map((col) => (
                          <div
                            key={col.key}
                            className={`border rounded-xl p-2.5 transition-all flex items-center justify-between gap-2 ${
                              col.checked
                                ? 'bg-white border-slate-200 shadow-2xs'
                                : 'bg-slate-50/70 border-slate-200/60 opacity-60'
                            }`}
                          >
                            <div className="min-w-0 pr-1">
                              <span className="font-semibold text-slate-800 text-xs block leading-tight">
                                {col.label}
                              </span>
                              <span className="text-[10px] text-slate-400 block mt-0.5 truncate">
                                {col.desc}
                              </span>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer shrink-0">
                              <input
                                type="checkbox"
                                checked={col.checked}
                                onChange={(e) => col.onChange(e.target.checked)}
                                className="sr-only peer"
                              />
                              <div className="w-8 h-4.5 bg-slate-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-blue-600"></div>
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Product Images & Technical Datasheets Section */}
                    <div className="pt-2 border-t border-slate-100 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                          <ImageIcon className="w-3.5 h-3.5 text-blue-600" />
                          Product Images &amp; Datasheets
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">
                          {quotationLineItems.filter((it) => Boolean(it.image_url)).length}/{quotationLineItems.length} Photos
                        </span>
                      </div>

                      {/* Master Toggle: Show Product Images */}
                      <div
                        className={`border rounded-xl p-2.5 transition-all flex items-center justify-between gap-2 ${
                          visibleColumns.showLineItemImages
                            ? 'bg-blue-50/60 border-blue-200 shadow-2xs'
                            : 'bg-white border-slate-200'
                        }`}
                      >
                        <div className="min-w-0 pr-1">
                          <span className="font-semibold text-slate-800 text-xs block leading-tight">
                            Show Product Images on Quote
                          </span>
                          <span className="text-[10px] text-slate-400 block mt-0.5">
                            Render catalog photos in line items table
                          </span>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer shrink-0">
                          <input
                            type="checkbox"
                            checked={Boolean(visibleColumns.showLineItemImages)}
                            onChange={(e) =>
                              setVisibleColumns((prev) => ({
                                ...prev,
                                showLineItemImages: e.target.checked
                              }))
                            }
                            className="sr-only peer"
                          />
                          <div className="w-8 h-4.5 bg-slate-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                      </div>

                      {visibleColumns.showLineItemImages && (
                        <div className="space-y-3 pt-1">
                          {/* 1. Image Placement Mode (5 Distinct B2B Modes in clean 2-col grid) */}
                          <div>
                            <label className="block text-[10.5px] font-semibold text-slate-600 mb-1.5">
                              Image Placement Mode
                            </label>
                            <div className="grid grid-cols-2 gap-1.5">
                              {[
                                {
                                  id: 'inline_left' as const,
                                  matchIds: ['inline', 'inline_left'],
                                  label: 'Inline Left',
                                  desc: 'Beside title & specs'
                                },
                                {
                                  id: 'inline_right' as const,
                                  matchIds: ['inline_right'],
                                  label: 'Inline Right',
                                  desc: 'Floated right of specs'
                                },
                                {
                                  id: 'column' as const,
                                  matchIds: ['column'],
                                  label: 'Dedicated Column',
                                  desc: 'Separate table column'
                                },
                                {
                                  id: 'below_specs' as const,
                                  matchIds: ['below_specs'],
                                  label: 'Below Specs Banner',
                                  desc: 'Wide diagram card'
                                },
                                {
                                  id: 'photo_schedule' as const,
                                  matchIds: ['photo_schedule'],
                                  label: 'Bottom Photo Grid',
                                  desc: '2/3-col visual schedule'
                                }
                              ].map((mode, mIdx) => {
                                const curLayout = visibleColumns.lineItemImageLayout || 'inline_left';
                                const isSel = mode.matchIds.includes(curLayout);
                                return (
                                  <button
                                    key={mode.id}
                                    type="button"
                                    onClick={() =>
                                      setVisibleColumns((prev) => ({
                                        ...prev,
                                        lineItemImageLayout: mode.id
                                      }))
                                    }
                                    className={`p-2 rounded-xl border text-left transition cursor-pointer ${
                                      mIdx === 4 ? 'col-span-2' : ''
                                    } ${
                                      isSel
                                        ? 'border-blue-600 bg-blue-50/80 ring-2 ring-blue-600/20'
                                        : 'border-slate-200 hover:border-slate-300 bg-white'
                                    }`}
                                  >
                                    <span
                                      className={`text-[11px] font-semibold block leading-tight ${
                                        isSel ? 'text-blue-700' : 'text-slate-800'
                                      }`}
                                    >
                                      {mode.label}
                                    </span>
                                    <span className="text-[9.5px] text-slate-400 block mt-0.5 leading-tight">
                                      {mode.desc}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* Conditional Sub-Controls for Dedicated Column */}
                          {visibleColumns.lineItemImageLayout === 'column' && (
                            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
                              <div className="grid grid-cols-2 gap-1.5">
                                {[
                                  { id: 'before_desc' as const, label: 'Before Description' },
                                  { id: 'after_desc' as const, label: 'After Description' }
                                ].map((pos) => {
                                  const isSel =
                                    (visibleColumns.lineItemImageColumnPosition || 'before_desc') === pos.id;
                                  return (
                                    <button
                                      key={pos.id}
                                      type="button"
                                      onClick={() =>
                                        setVisibleColumns((prev) => ({
                                          ...prev,
                                          lineItemImageColumnPosition: pos.id
                                        }))
                                      }
                                      className={`py-1.5 px-2 rounded-lg text-[10px] font-semibold border transition cursor-pointer whitespace-nowrap ${
                                        isSel
                                          ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                                          : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                                      }`}
                                    >
                                      {pos.label}
                                    </button>
                                  );
                                })}
                              </div>
                              <label className="flex items-center justify-between gap-2 text-[10px] text-slate-600 cursor-pointer pt-0.5">
                                <span>Auto-collapse column if zero items have photos</span>
                                <input
                                  type="checkbox"
                                  checked={visibleColumns.lineItemImageAutoCollapseColumn !== false}
                                  onChange={(e) =>
                                    setVisibleColumns((prev) => ({
                                      ...prev,
                                      lineItemImageAutoCollapseColumn: e.target.checked
                                    }))
                                  }
                                  className="rounded border-slate-300 text-blue-600 cursor-pointer"
                                />
                              </label>
                            </div>
                          )}

                          {/* Conditional Sub-Controls for Photo Schedule */}
                          {visibleColumns.lineItemImageLayout === 'photo_schedule' && (
                            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
                              <div className="grid grid-cols-2 gap-1.5">
                                {[
                                  { cols: 2 as const, label: '2 Columns Grid' },
                                  { cols: 3 as const, label: '3 Columns Grid' }
                                ].map((c) => {
                                  const isSel = (visibleColumns.photoScheduleColumns || 3) === c.cols;
                                  return (
                                    <button
                                      key={c.cols}
                                      type="button"
                                      onClick={() =>
                                        setVisibleColumns((prev) => ({
                                          ...prev,
                                          photoScheduleColumns: c.cols
                                        }))
                                      }
                                      className={`py-1.5 px-2 rounded-lg text-[10px] font-semibold border transition cursor-pointer whitespace-nowrap ${
                                        isSel
                                          ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                                          : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                                      }`}
                                    >
                                      {c.label}
                                    </button>
                                  );
                                })}
                              </div>
                              <label className="flex items-center justify-between gap-2 text-[10px] text-slate-600 cursor-pointer pt-0.5">
                                <span>Start Photo Schedule on dedicated new Annex page</span>
                                <input
                                  type="checkbox"
                                  checked={Boolean(visibleColumns.photoScheduleNewPage)}
                                  onChange={(e) =>
                                    setVisibleColumns((prev) => ({
                                      ...prev,
                                      photoScheduleNewPage: e.target.checked
                                    }))
                                  }
                                  className="rounded border-slate-300 text-blue-600 cursor-pointer"
                                />
                              </label>
                            </div>
                          )}

                          {/* 2. Expanded Image Size Presets (XS to XL + Custom Slider) */}
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-[10.5px] font-semibold text-slate-600">
                                Product Image Size
                              </label>
                              <span className="text-[9.5px] font-mono text-blue-600 font-bold">
                                {visibleColumns.lineItemImageSize === 'custom'
                                  ? `${visibleColumns.lineItemImageCustomWidthPx || 84}px`
                                  : (visibleColumns.lineItemImageSize || 'md').toUpperCase()}
                              </span>
                            </div>
                            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200/80">
                              {[
                                { id: 'xs' as const, label: 'XS (32px)' },
                                { id: 'sm' as const, label: 'SM (48px)' },
                                { id: 'md' as const, label: 'MD (72px)' },
                                { id: 'lg' as const, label: 'LG (110px)' },
                                { id: 'xl' as const, label: 'XL (160px)' },
                                { id: 'custom' as const, label: 'Custom px' }
                              ].map((sz) => {
                                const isSel = (visibleColumns.lineItemImageSize || 'md') === sz.id;
                                return (
                                  <button
                                    key={sz.id}
                                    type="button"
                                    onClick={() =>
                                      setVisibleColumns((prev) => ({
                                        ...prev,
                                        lineItemImageSize: sz.id,
                                        ...(sz.id === 'custom' && !prev.lineItemImageCustomWidthPx
                                          ? { lineItemImageCustomWidthPx: 84 }
                                          : {})
                                      }))
                                    }
                                    className={`py-1.5 px-1 rounded-lg text-[10px] font-semibold transition cursor-pointer whitespace-nowrap ${
                                      isSel
                                        ? 'bg-blue-600 text-white shadow-2xs'
                                        : 'text-slate-600 hover:bg-white'
                                    }`}
                                  >
                                    {sz.label}
                                  </button>
                                );
                              })}
                            </div>
                            {visibleColumns.lineItemImageSize === 'custom' && (
                              <div className="pt-2 px-1">
                                <input
                                  type="range"
                                  min={24}
                                  max={220}
                                  step={4}
                                  value={visibleColumns.lineItemImageCustomWidthPx || 84}
                                  onChange={(e) =>
                                    setVisibleColumns((prev) => ({
                                      ...prev,
                                      lineItemImageCustomWidthPx: Number(e.target.value) || 84
                                    }))
                                  }
                                  className="w-full accent-blue-600 cursor-pointer h-1.5 bg-slate-200 rounded-lg"
                                />
                                <div className="flex justify-between text-[9px] font-mono text-slate-400 mt-0.5">
                                  <span>24px</span>
                                  <span>{visibleColumns.lineItemImageCustomWidthPx || 84}px</span>
                                  <span>220px</span>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* 3. Clean 2-Column Grid for Aspect Ratio, Frame, Fit & Background */}
                          <div className="grid grid-cols-2 gap-2 pt-0.5">
                            <div>
                              <label className="block text-[9.5px] font-mono font-bold text-slate-500 uppercase mb-1">
                                Aspect Ratio
                              </label>
                              <select
                                value={visibleColumns.lineItemImageAspectRatio || '1:1'}
                                onChange={(e) =>
                                  setVisibleColumns((prev) => ({
                                    ...prev,
                                    lineItemImageAspectRatio: e.target.value as any
                                  }))
                                }
                                className="w-full px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-[10.5px] font-semibold text-slate-700 cursor-pointer"
                              >
                                <option value="1:1">1:1 Square</option>
                                <option value="4:3">4:3 Standard</option>
                                <option value="16:9">16:9 Wide</option>
                                <option value="auto">Auto Natural</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-[9.5px] font-mono font-bold text-slate-500 uppercase mb-1">
                                Frame Style
                              </label>
                              <select
                                value={visibleColumns.lineItemImageFrame || 'card'}
                                onChange={(e) =>
                                  setVisibleColumns((prev) => ({
                                    ...prev,
                                    lineItemImageFrame: e.target.value as any
                                  }))
                                }
                                className="w-full px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-[10.5px] font-semibold text-slate-700 cursor-pointer"
                              >
                                <option value="card">Bordered Card</option>
                                <option value="rounded">Soft Rounded</option>
                                <option value="minimal">Borderless</option>
                                <option value="shadow">Elevated Shadow</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-[9.5px] font-mono font-bold text-slate-500 uppercase mb-1">
                                Image Fit
                              </label>
                              <select
                                value={visibleColumns.lineItemImageObjectFit || 'contain'}
                                onChange={(e) =>
                                  setVisibleColumns((prev) => ({
                                    ...prev,
                                    lineItemImageObjectFit: e.target.value as any
                                  }))
                                }
                                className="w-full px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-[10.5px] font-semibold text-slate-700 cursor-pointer"
                              >
                                <option value="contain">Contain (Full Part)</option>
                                <option value="cover">Cover (Fill Box)</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-[9.5px] font-mono font-bold text-slate-500 uppercase mb-1">
                                Background Fill
                              </label>
                              <select
                                value={visibleColumns.lineItemImageBgFill || 'white'}
                                onChange={(e) =>
                                  setVisibleColumns((prev) => ({
                                    ...prev,
                                    lineItemImageBgFill: e.target.value as any
                                  }))
                                }
                                className="w-full px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-[10.5px] font-semibold text-slate-700 cursor-pointer"
                              >
                                <option value="white">Pure White</option>
                                <option value="slate">Soft Neutral</option>
                                <option value="transparent">Transparent</option>
                              </select>
                            </div>
                          </div>

                          {/* 4. BOM Sub-Component Images Mode */}
                          <div>
                            <label className="block text-[9.5px] font-mono font-bold text-slate-500 uppercase mb-1">
                              BOM Sub-Component (1.1..1.N) Photos
                            </label>
                            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200/80">
                              {[
                                { id: 'off' as const, label: 'Hidden' },
                                { id: 'small' as const, label: 'Small (30px)' },
                                { id: 'match_parent' as const, label: 'Match Parent' }
                              ].map((bm) => {
                                const isSel = (visibleColumns.bomSubComponentImageMode || 'small') === bm.id;
                                return (
                                  <button
                                    key={bm.id}
                                    type="button"
                                    onClick={() =>
                                      setVisibleColumns((prev) => ({
                                        ...prev,
                                        bomSubComponentImageMode: bm.id
                                      }))
                                    }
                                    className={`py-1 px-1 rounded-lg text-[10px] font-semibold transition cursor-pointer whitespace-nowrap ${
                                      isSel
                                        ? 'bg-blue-600 text-white shadow-2xs'
                                        : 'text-slate-600 hover:bg-white'
                                    }`}
                                  >
                                    {bm.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Per-Item Progressive Disclosure Image Controls, Datasheet Toggle, Catalog Sync & BOM */}
                      <div className="space-y-2 max-h-80 overflow-y-auto pr-0.5 pt-1">
                        {quotationLineItems.map((item, idx) => {
                          const itemKey = item.id || `item_${idx}`;
                          const matchedProd = workspaceProducts.find(
                            (p) =>
                              (item.product_id && p.id === item.product_id) ||
                              (item.sku && p.sku && p.sku.toLowerCase() === item.sku.toLowerCase()) ||
                              (item.item_name &&
                                (p.name || p.description || '').trim().toLowerCase() === item.item_name.trim().toLowerCase())
                          );
                          const isTracked = Boolean(matchedProd?.is_inventoried);
                          const currentStock = Math.max(
                            0,
                            Number(matchedProd?.stock_on_hand ?? matchedProd?.current_stock ?? 0) -
                              Number(matchedProd?.stock_reserved ?? 0)
                          );
                          const reorderLvl = Number(matchedProd?.reorder_level || 0);
                          const itemDrifted = matchedProd ? hasCatalogDrift(item, matchedProd, liveQuotation.currency) : false;

                          return (
                            <div
                              key={itemKey}
                              className="p-2.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <span className="font-semibold text-slate-800 text-[11px] block truncate" title={item.item_name}>
                                    #{idx + 1} {item.item_name}
                                  </span>
                                  <div className="flex items-center gap-1 flex-wrap mt-0.5">
                                    {isTracked && (
                                      <span
                                        className={`inline-block text-[9.5px] font-bold px-1.5 py-0.2 rounded ${
                                          currentStock <= 0
                                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                            : reorderLvl > 0 && currentStock <= reorderLvl
                                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                        }`}
                                      >
                                        {currentStock <= 0
                                          ? 'Out of Stock (0)'
                                          : `In Stock: ${currentStock} ${matchedProd?.unit || matchedProd?.uom || item.unit || 'pcs'}`}
                                      </span>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setItemOptionalOverrides((prev) => ({
                                          ...prev,
                                          [itemKey]: !item.is_optional
                                        }))
                                      }
                                      className={`text-[9.5px] font-semibold px-1.5 py-0.2 rounded border transition cursor-pointer ${
                                        item.is_optional
                                          ? 'bg-amber-50 text-amber-800 border-amber-300'
                                          : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                                      }`}
                                      title="Toggle whether this item is Optional / Excluded from Baseline Subtotal"
                                    >
                                      {item.is_optional ? 'Optional (Excl. Total)' : 'Baseline Item'}
                                    </button>
                                  </div>
                                </div>
                              </div>

                              {/* Progressive Disclosure Image Thumbnail + Options Popover */}
                              <LineItemImageOptionsPopover
                                itemTitle={`#${idx + 1} ${item.item_name}`}
                                imageUrl={item.image_url}
                                secondaryImageUrl={item.secondary_image_url}
                                imageCaption={item.image_caption}
                                secondaryImageCaption={item.secondary_image_caption}
                                imageAdjustments={item.image_adjustments}
                                displayOverride={item.image_display_override || 'inherit'}
                                sizeOverride={item.image_size_override || 'inherit'}
                                aspectOverride={item.image_aspect_override || 'inherit'}
                                showPerItemLayoutOverrides={true}
                                activeWorkspace={activeWorkspace}
                                canSyncToCatalog={Boolean(matchedProd)}
                                onSyncToCatalog={
                                  matchedProd
                                    ? async () => {
                                        const updated = await syncLineItemToCatalogProduct(
                                          item,
                                          matchedProd,
                                          setWorkspaceProducts,
                                          triggerToast,
                                          liveQuotation.currency
                                        );
                                        if (updated && propSetProducts) {
                                          propSetProducts((prev) =>
                                            prev.map((p) => (p.id === updated.id ? updated : p))
                                          );
                                        }
                                      }
                                    : undefined
                                }
                                onChange={(patch) => {
                                  if (patch.image_url !== undefined) {
                                    setItemImageOverrides((prev) => ({
                                      ...prev,
                                      [itemKey]: patch.image_url || ''
                                    }));
                                    if (patch.image_url) {
                                      setVisibleColumns((prev) => ({
                                        ...prev,
                                        showLineItemImages: true
                                      }));
                                    }
                                  }
                                  handleUpdateTopItemRowOption(itemKey, patch);
                                }}
                                compact
                              />

                              {/* Two-Way Catalog Sync Actions */}
                              <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200/60">
                                {!matchedProd ? (
                                  <button
                                    type="button"
                                    onClick={() => setCatalogModalTarget({ itemKey, item })}
                                    className="px-2 py-0.5 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-[10px] font-semibold transition cursor-pointer"
                                  >
                                    + Save to Catalog
                                  </button>
                                ) : (
                                  <span className="text-[10px] text-slate-500 font-mono truncate">
                                    Catalog SKU: {matchedProd.sku || matchedProd.id?.slice(0, 8)}
                                  </span>
                                )}
                                {matchedProd && itemDrifted && (
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      const updated = await syncLineItemToCatalogProduct(
                                        item,
                                        matchedProd,
                                        setWorkspaceProducts,
                                        triggerToast,
                                        liveQuotation.currency
                                      );
                                      if (updated && propSetProducts) {
                                        propSetProducts((prev) =>
                                          prev.map((p) => (p.id === updated.id ? updated : p))
                                        );
                                      }
                                    }}
                                    className="px-2 py-0.5 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-[10px] font-semibold transition cursor-pointer shrink-0"
                                  >
                                    Sync to Catalog
                                  </button>
                                )}
                              </div>

                              {item.datasheet_attachment && item.datasheet_attachment.url && (
                                <label className="flex items-center justify-between px-2 py-1 rounded-lg bg-indigo-50/70 border border-indigo-200/80 cursor-pointer">
                                  <span className="text-[10px] font-medium text-indigo-900 truncate pr-2">
                                    📎 Annex Datasheet: {item.datasheet_attachment.name}
                                  </span>
                                  <input
                                    type="checkbox"
                                    checked={item.include_datasheet_in_quote !== false}
                                    onChange={(e) =>
                                      setItemDatasheetToggles((prev) => ({
                                        ...prev,
                                        [itemKey]: e.target.checked
                                      }))
                                    }
                                    className="rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer shrink-0"
                                  />
                                </label>
                              )}

                              {/* Multi-Component Set / BOM & Pricing Mode Quick Controls */}
                              <div className="pt-1 border-t border-slate-200/60 space-y-1.5">
                                <div className="flex items-center justify-between gap-1">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setExpandedCompositeKey((prev) => (prev === itemKey ? null : itemKey))
                                    }
                                    className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border flex items-center gap-1 transition cursor-pointer ${
                                      Array.isArray(item.sub_components) && item.sub_components.length > 0
                                        ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                                    }`}
                                  >
                                    <Layers className="w-3 h-3" />
                                    <span>
                                      {Array.isArray(item.sub_components) && item.sub_components.length > 0
                                        ? `BOM Set (${item.sub_components.length} parts)`
                                        : '+ Configure Multi-Component Set'}
                                    </span>
                                  </button>

                                  {Array.isArray(item.sub_components) && item.sub_components.length > 0 && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setItemCompositeOverrides((prev) => ({
                                          ...prev,
                                          [itemKey]: {
                                            ...(prev[itemKey] || {}),
                                            package_pricing_mode:
                                              item.package_pricing_mode === 'lump_sum'
                                                ? 'itemized'
                                                : 'lump_sum'
                                          }
                                        }))
                                      }
                                      className="px-2 py-0.5 rounded-md bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 text-[9.5px] font-semibold cursor-pointer"
                                      title="Toggle between showing individual component prices vs a single package lump-sum price"
                                    >
                                      {item.package_pricing_mode === 'lump_sum'
                                        ? 'Mode: Lump-Sum Set'
                                        : 'Mode: Itemized Rates'}
                                    </button>
                                  )}
                                </div>

                                {expandedCompositeKey === itemKey && (
                                  <div className="pt-1">
                                    <CompositePackageEditor
                                      compact
                                      isCompositeSet={Boolean(
                                        item.is_composite_set ||
                                          (item.sub_components && item.sub_components.length > 0)
                                      )}
                                      subComponents={item.sub_components || []}
                                      packagePricingMode={item.package_pricing_mode || 'itemized'}
                                      optionScopeNotes={item.option_scope_notes || ''}
                                      parentQuantity={item.quantity || 1}
                                      currency={(enquiry?.currency as string) || 'USD'}
                                      products={workspaceProducts}
                                      activeWorkspace={activeWorkspace}
                                      tokenContext={studioTokenContext}
                                      onChange={(patch) =>
                                        setItemCompositeOverrides((prev) => ({
                                          ...prev,
                                          [itemKey]: {
                                            ...(prev[itemKey] || {}),
                                            ...patch
                                          }
                                        }))
                                      }
                                    />
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Line-Item Pagination, Spacing & Row Options ("Split Table Here" + Sub-Components 1.1..1.N) */}
                    <div className="pt-2 border-t border-slate-100 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                          <Scissors className="w-3.5 h-3.5 text-amber-600" />
                          Line-Item Pagination, Spacing &amp; Row Options
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">
                          {quotationLineItems.reduce(
                            (acc, it) =>
                              acc +
                              (it.page_break_after ? 1 : 0) +
                              (Array.isArray(it.sub_components)
                                ? it.sub_components.filter((s) => s.page_break_after).length
                                : 0),
                            0
                          )}{' '}
                          Breaks
                        </span>
                      </div>
                      <p className="text-[10.5px] text-slate-500 leading-normal">
                        Configure manual page breaks, row spacing, highlight/bold styling, price masking, and @tag row notes on any line item or BOM Set sub-component (1.1, 1.2, ...).
                      </p>

                      {/* Auto-Paginate Long Tables & Sets Master Toggle */}
                      <div
                        className={`border rounded-xl p-2.5 transition-all flex items-center justify-between gap-2 ${
                          autoPaginateItems
                            ? 'bg-amber-50/70 border-amber-300 shadow-2xs'
                            : 'bg-white border-slate-200'
                        }`}
                      >
                        <div className="min-w-0 pr-1">
                          <span className="font-semibold text-slate-800 text-xs block leading-tight">
                            Auto-Paginate Long Tables &amp; Sets
                          </span>
                          <span className="text-[10px] text-slate-500 block mt-0.5 leading-snug">
                            Automatically split long item tables &amp; multi-part BOM Sets across A4 sheets (keeps Set header + 1.1 together)
                          </span>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer shrink-0">
                          <input
                            type="checkbox"
                            checked={autoPaginateItems}
                            onChange={(e) => setAutoPaginateItems(e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-8 h-4.5 bg-slate-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-amber-600"></div>
                        </label>
                      </div>

                      <div className="space-y-2 pt-1 max-h-96 overflow-y-auto pr-1">
                        {quotationLineItems.map((item, idx) => {
                          const itemKey = item.id || `item_${idx}`;
                          const isLastItem = idx === quotationLineItems.length - 1;
                          const hasBreakAfter = Boolean(item.page_break_after);
                          const hasSubComponents =
                            Array.isArray(item.sub_components) && item.sub_components.length > 0;
                          const isTopNoteOpen =
                            Boolean(expandedInspectorRowNotes[itemKey]) || Boolean(item.row_note);

                          return (
                            <div
                              key={itemKey}
                              className={`p-2.5 rounded-xl border transition space-y-2 ${
                                hasBreakAfter
                                  ? 'bg-amber-50/80 border-amber-300 shadow-2xs'
                                  : 'bg-slate-50/70 border-slate-200/90'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0 flex items-center gap-1.5 flex-1">
                                  <span className="w-4 h-4 rounded-full bg-slate-200 text-slate-700 text-[9px] font-mono font-bold flex items-center justify-center shrink-0">
                                    {idx + 1}
                                  </span>
                                  <span
                                    className="font-semibold text-slate-800 text-[11px] truncate"
                                    title={item.item_name}
                                  >
                                    {item.item_name}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => toggleItemPageBreak(itemKey, item.page_break_after)}
                                  className={`px-2 py-1 rounded-lg text-[10px] font-semibold flex items-center gap-1 shrink-0 transition cursor-pointer ${
                                    hasBreakAfter
                                      ? 'bg-amber-600 text-white shadow-2xs'
                                      : 'bg-white hover:bg-amber-50 text-slate-700 hover:text-amber-800 border border-slate-200'
                                  }`}
                                >
                                  <Scissors className="w-3 h-3" />
                                  <span>
                                    {isLastItem ? '✂ Break After Table' : '✂ Page Break After Item'}
                                  </span>
                                </button>
                              </div>

                              {/* Top-Level Item Row Customization Pill Bar */}
                              <div className="flex flex-wrap items-center gap-1 pt-0.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleUpdateTopItemRowOption(itemKey, {
                                      row_highlight: !item.row_highlight
                                    })
                                  }
                                  className={`px-1.5 py-0.5 rounded text-[9.5px] font-semibold border transition cursor-pointer ${
                                    item.row_highlight
                                      ? 'bg-amber-100 text-amber-900 border-amber-300'
                                      : 'bg-white text-slate-600 border-slate-200 hover:border-amber-300'
                                  }`}
                                  title="Soft amber highlight on this row"
                                >
                                  🎨 Highlight
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    handleUpdateTopItemRowOption(itemKey, {
                                      row_bold: !item.row_bold
                                    })
                                  }
                                  className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold border transition cursor-pointer ${
                                    item.row_bold
                                      ? 'bg-slate-800 text-white border-slate-800'
                                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                                  }`}
                                  title="Bold emphasis on this row"
                                >
                                  B Bold
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    handleUpdateTopItemRowOption(itemKey, {
                                      hide_row_price: !item.hide_row_price
                                    })
                                  }
                                  className={`px-1.5 py-0.5 rounded text-[9.5px] font-semibold border transition cursor-pointer ${
                                    item.hide_row_price
                                      ? 'bg-indigo-100 text-indigo-800 border-indigo-300'
                                      : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                                  }`}
                                  title="Visually show 'Included' on this row while keeping its price in the total"
                                >
                                  {item.hide_row_price ? 'Price: Included' : 'Hide Price'}
                                </button>

                                <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white border border-slate-200 text-[9.5px] text-slate-600">
                                  <span>Spacer:</span>
                                  <select
                                    value={Number(item.row_spacer_after_mm) || 0}
                                    onChange={(e) =>
                                      handleUpdateTopItemRowOption(itemKey, {
                                        row_spacer_after_mm: Number(e.target.value) || undefined
                                      })
                                    }
                                    className="bg-transparent font-mono font-semibold text-slate-800 focus:outline-none cursor-pointer"
                                  >
                                    <option value={0}>0mm</option>
                                    <option value={4}>4mm</option>
                                    <option value={8}>8mm</option>
                                    <option value={12}>12mm</option>
                                    <option value={16}>16mm</option>
                                  </select>
                                </div>

                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedInspectorRowNotes((prev) => ({
                                      ...prev,
                                      [itemKey]: !isTopNoteOpen
                                    }))
                                  }
                                  className={`px-1.5 py-0.5 rounded text-[9.5px] font-semibold border transition cursor-pointer ${
                                    isTopNoteOpen || item.row_note
                                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                                      : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
                                  }`}
                                >
                                  {item.row_note ? '✎ Note Active' : '+ Note'}
                                </button>
                              </div>

                              {isTopNoteOpen && (
                                <div className="pt-0.5">
                                  <AtMentionInput
                                    value={item.row_note || ''}
                                    onChange={(nextVal) =>
                                      handleUpdateTopItemRowOption(itemKey, { row_note: nextVal })
                                    }
                                    tokenContext={studioTokenContext}
                                    placeholder={`Custom note for Item #${idx + 1} (type @ for live tags)...`}
                                    className="w-full bg-white border border-blue-200 focus:border-blue-500 rounded-md px-2 py-1 text-[10px] text-slate-700 focus:outline-none"
                                  />
                                </div>
                              )}

                              {hasBreakAfter && (
                                <div className="px-2 py-1 rounded-md bg-amber-100/90 border border-amber-300 text-amber-900 text-[10px] font-mono font-semibold flex items-center justify-between">
                                  <span>
                                    {isLastItem
                                      ? `📄 Splits Closing Blocks to Next Page After Item #${idx + 1}`
                                      : `📄 Splits Table to Next Page After Item #${idx + 1}`}
                                  </span>
                                  <span className="text-[9px] text-amber-700">Sheet Break</span>
                                </div>
                              )}

                              {/* Nested BOM Set Sub-Components (1.1, 1.2, ..., 1.N) Row Options */}
                              {hasSubComponents && (
                                <div className="mt-1.5 pt-2 border-t border-slate-200/80 pl-2.5 border-l-2 border-l-indigo-300 space-y-1.5">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[9.5px] font-mono font-bold uppercase tracking-wider text-indigo-700">
                                      Set Sub-Components ({item.sub_components!.length} Rows)
                                    </span>
                                    <span className="text-[9px] text-slate-400 font-mono">
                                      {idx + 1}.1 – {idx + 1}.{item.sub_components!.length}
                                    </span>
                                  </div>

                                  {item.sub_components!.map((sub, subIdx) => {
                                    const subNumberLabel = `${idx + 1}.${subIdx + 1}`;
                                    const subNoteKey = `${itemKey}_sub_note_${subIdx}`;
                                    const isSubNoteOpen =
                                      Boolean(expandedInspectorRowNotes[subNoteKey]) ||
                                      Boolean(sub.row_note);
                                    const isLastSubOfLastItem =
                                      isLastItem && subIdx === item.sub_components!.length - 1;

                                    return (
                                      <div
                                        key={sub.id || `${itemKey}_sub_${subIdx}`}
                                        className={`p-2 rounded-lg border transition space-y-1.5 ${
                                          sub.page_break_after
                                            ? 'bg-amber-50/90 border-amber-300'
                                            : 'bg-white border-slate-200/90'
                                        }`}
                                      >
                                        <div className="flex items-center justify-between gap-1.5">
                                          <div className="min-w-0 flex items-center gap-1.5 flex-1">
                                            <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 text-[9px] font-mono font-bold shrink-0">
                                              {subNumberLabel}
                                            </span>
                                            <span
                                              className="font-medium text-slate-700 text-[10.5px] truncate"
                                              title={sub.name}
                                            >
                                              {sub.name || `Sub-Component ${subNumberLabel}`}
                                            </span>
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleUpdateSubComponentRowOption(
                                                itemKey,
                                                item,
                                                subIdx,
                                                { page_break_after: !sub.page_break_after }
                                              )
                                            }
                                            className={`px-1.5 py-0.5 rounded text-[9.5px] font-semibold flex items-center gap-1 shrink-0 transition cursor-pointer ${
                                              sub.page_break_after
                                                ? 'bg-amber-600 text-white shadow-2xs'
                                                : 'bg-slate-50 hover:bg-amber-50 text-slate-700 hover:text-amber-800 border border-slate-200'
                                            }`}
                                          >
                                            <Scissors className="w-2.5 h-2.5" />
                                            <span>
                                              {isLastSubOfLastItem
                                                ? `✂ Break After Table`
                                                : `✂ Break After ${subNumberLabel}`}
                                            </span>
                                          </button>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-1">
                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleUpdateSubComponentRowOption(
                                                itemKey,
                                                item,
                                                subIdx,
                                                { row_highlight: !sub.row_highlight }
                                              )
                                            }
                                            className={`px-1.5 py-0.5 rounded text-[9px] font-semibold border transition cursor-pointer ${
                                              sub.row_highlight
                                                ? 'bg-amber-100 text-amber-900 border-amber-300'
                                                : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-amber-300'
                                            }`}
                                          >
                                            🎨 Highlight
                                          </button>

                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleUpdateSubComponentRowOption(
                                                itemKey,
                                                item,
                                                subIdx,
                                                { row_bold: !sub.row_bold }
                                              )
                                            }
                                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold border transition cursor-pointer ${
                                              sub.row_bold
                                                ? 'bg-slate-800 text-white border-slate-800'
                                                : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300'
                                            }`}
                                          >
                                            B Bold
                                          </button>

                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleUpdateSubComponentRowOption(
                                                itemKey,
                                                item,
                                                subIdx,
                                                { hide_row_price: !sub.hide_row_price }
                                              )
                                            }
                                            className={`px-1.5 py-0.5 rounded text-[9px] font-semibold border transition cursor-pointer ${
                                              sub.hide_row_price
                                                ? 'bg-indigo-100 text-indigo-800 border-indigo-300'
                                                : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-indigo-300'
                                            }`}
                                          >
                                            {sub.hide_row_price ? 'Price: Included' : 'Hide Price'}
                                          </button>

                                          <div className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-slate-50 border border-slate-200 text-[9px] text-slate-600">
                                            <span>Spacer:</span>
                                            <select
                                              value={Number(sub.row_spacer_after_mm) || 0}
                                              onChange={(e) =>
                                                handleUpdateSubComponentRowOption(
                                                  itemKey,
                                                  item,
                                                  subIdx,
                                                  {
                                                    row_spacer_after_mm:
                                                      Number(e.target.value) || undefined
                                                  }
                                                )
                                              }
                                              className="bg-transparent font-mono font-semibold text-slate-800 focus:outline-none cursor-pointer"
                                            >
                                              <option value={0}>0mm</option>
                                              <option value={4}>4mm</option>
                                              <option value={8}>8mm</option>
                                              <option value={12}>12mm</option>
                                              <option value={16}>16mm</option>
                                            </select>
                                          </div>

                                          <button
                                            type="button"
                                            onClick={() =>
                                              setExpandedInspectorRowNotes((prev) => ({
                                                ...prev,
                                                [subNoteKey]: !isSubNoteOpen
                                              }))
                                            }
                                            className={`px-1.5 py-0.5 rounded text-[9px] font-semibold border transition cursor-pointer ${
                                              isSubNoteOpen || sub.row_note
                                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                                : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-blue-300'
                                            }`}
                                          >
                                            {sub.row_note ? '✎ Note' : '+ Note'}
                                          </button>
                                        </div>

                                        {isSubNoteOpen && (
                                          <div className="pt-0.5">
                                            <AtMentionInput
                                              value={sub.row_note || ''}
                                              onChange={(nextVal) =>
                                                handleUpdateSubComponentRowOption(
                                                  itemKey,
                                                  item,
                                                  subIdx,
                                                  { row_note: nextVal }
                                                )
                                              }
                                              tokenContext={studioTokenContext}
                                              placeholder={`Custom note for ${subNumberLabel} (type @ for live tags)...`}
                                              className="w-full bg-slate-50 border border-blue-200 focus:border-blue-500 rounded-md px-2 py-1 text-[10px] text-slate-700 focus:outline-none"
                                            />
                                          </div>
                                        )}

                                        {sub.page_break_after && (
                                          <div className="px-2 py-0.5 rounded bg-amber-100/90 border border-amber-300 text-amber-900 text-[9.5px] font-mono font-semibold flex items-center justify-between">
                                            <span>
                                              {isLastSubOfLastItem
                                                ? `📄 Splits Closing Blocks to Next Page After ${subNumberLabel}`
                                                : `📄 Splits Set #${idx + 1} to Next Page After ${subNumberLabel}`}
                                            </span>
                                            <span className="text-[8.5px] text-amber-700">
                                              Set Cont.
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Technical Specifications & Attributes */}
                    <div className="pt-2 border-t border-slate-100 space-y-3">
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                            <Sliders className="w-3.5 h-3.5 text-blue-600" />
                            Technical Specifications &amp; Attributes
                          </span>
                          {availableAttributeKeys.length > 0 && (
                            <span className="text-[10px] font-mono text-slate-400">
                              {availableAttributeKeys.length - (visibleColumns.hiddenAttributeKeys?.length || 0)} / {availableAttributeKeys.length} Visible
                            </span>
                          )}
                        </div>
                        <p className="text-[10.5px] text-slate-500 leading-normal mt-0.5">
                          Inquiry-specific product parameters &amp; selective visibility
                        </p>
                      </div>

                      {/* Master Toggle */}
                      <div
                        className={`border rounded-xl p-2.5 transition-all flex items-center justify-between gap-2 ${
                          visibleColumns.showItemAttributes !== false
                            ? 'bg-white border-slate-200 shadow-2xs'
                            : 'bg-slate-50/70 border-slate-200/60 opacity-60'
                        }`}
                      >
                        <div className="min-w-0 pr-1">
                          <span className="font-semibold text-slate-800 text-xs block leading-tight">
                            Display Technical Specs / Attributes
                          </span>
                          <span className="text-[10px] text-slate-400 block mt-0.5">
                            Render equipment attributes inside item description
                          </span>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer shrink-0">
                          <input
                            type="checkbox"
                            checked={visibleColumns.showItemAttributes !== false}
                            onChange={(e) =>
                              setVisibleColumns((prev) => ({
                                ...prev,
                                showItemAttributes: e.target.checked
                              }))
                            }
                            className="sr-only peer"
                          />
                          <div className="w-8 h-4.5 bg-slate-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                      </div>

                      {/* Presentation Format: Badges vs Inline Text */}
                      {visibleColumns.showItemAttributes !== false && (
                        <div className="space-y-1.5 pt-1">
                          <label className="block text-[11px] font-semibold text-slate-700">
                            Display Format
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            {[
                              { id: 'pills' as const, label: 'Badges / Pills', desc: 'Framed badge chips' },
                              { id: 'inline_text' as const, label: 'Inline Subtitle', desc: 'Dot-separated text' }
                            ].map((fmt) => {
                              const isSelected = (visibleColumns.attributeDisplayFormat || 'pills') === fmt.id;
                              return (
                                <button
                                  key={fmt.id}
                                  type="button"
                                  onClick={() =>
                                    setVisibleColumns((prev) => ({
                                      ...prev,
                                      attributeDisplayFormat: fmt.id
                                    }))
                                  }
                                  className={`p-2 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                                    isSelected
                                      ? 'border-blue-600 bg-blue-50/80 ring-2 ring-blue-600/20'
                                      : 'border-slate-200 hover:border-slate-300 bg-white'
                                  }`}
                                >
                                  <span className={`text-xs font-semibold ${isSelected ? 'text-blue-700' : 'text-slate-800'}`}>
                                    {fmt.label}
                                  </span>
                                  <span className="text-[9.5px] text-slate-400 mt-0.5">{fmt.desc}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Show / Hide Specific Specs */}
                      {visibleColumns.showItemAttributes !== false && availableAttributeKeys.length > 0 && (
                        <div className="space-y-2 pt-1 border-t border-slate-100">
                          <div className="flex items-center justify-between">
                            <label className="text-[11px] font-semibold text-slate-700">
                              Show / Hide Specific Specs
                            </label>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={showAllAttributes}
                                className="text-[10px] font-medium text-blue-600 hover:text-blue-800 transition cursor-pointer"
                              >
                                Show All
                              </button>
                              <span className="text-slate-300 text-[10px]">•</span>
                              <button
                                type="button"
                                onClick={hideAllAttributes}
                                className="text-[10px] font-medium text-slate-500 hover:text-slate-700 transition cursor-pointer"
                              >
                                Hide All
                              </button>
                            </div>
                          </div>
                          <p className="text-[10px] text-slate-400 leading-normal">
                            Click to toggle visibility of individual attribute tags on the document:
                          </p>
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {availableAttributeKeys.map((key) => {
                              const isHidden = visibleColumns.hiddenAttributeKeys?.includes(key);
                              const isVisible = !isHidden;
                              return (
                                <button
                                  key={key}
                                  type="button"
                                  onClick={() => toggleAttributeKeyVisibility(key)}
                                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                                    isVisible
                                      ? 'bg-blue-50 text-blue-800 border border-blue-200 shadow-2xs hover:bg-blue-100'
                                      : 'bg-slate-100 text-slate-400 border border-dashed border-slate-300 line-through hover:bg-slate-200'
                                  }`}
                                  title={isVisible ? `Click to mute ${key}` : `Click to show ${key}`}
                                >
                                  <span className="text-[10px]">{isVisible ? '✓' : '✕'}</span>
                                  <span>{key}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Per-Item Specification Attributes (Row-Level Control) */}
                      {visibleColumns.showItemAttributes !== false && quotationLineItems.some((item) => getItemAttributeKeys(item).length > 0) && (
                        <div className="space-y-2 pt-2 border-t border-slate-100">
                          <div className="flex items-center justify-between">
                            <label className="text-[11px] font-semibold text-slate-700 flex items-center gap-1.5">
                              <CheckSquare className="w-3.5 h-3.5 text-blue-600" />
                              Item Attributes (Row-Level)
                            </label>
                            <span className="text-[10px] text-slate-400 font-mono">
                              Per-Row Filter
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-400 leading-normal">
                            Selectively show or hide technical parameters on individual line items:
                          </p>

                          <div className="space-y-2 pt-1 max-h-64 overflow-y-auto pr-1">
                            {quotationLineItems.map((item, idx) => {
                              const itemKey = item.id || `item_${idx}`;
                              const itemAttrs = getItemAttributeKeys(item);
                              if (itemAttrs.length === 0) return null;

                              const currentVisible = itemVisibleAttributes[itemKey] ?? item.visible_attributes ?? itemAttrs;
                              const visibleCount = itemAttrs.filter((k) => currentVisible.includes(k)).length;

                              return (
                                <div
                                  key={itemKey}
                                  className="p-2.5 rounded-xl border border-slate-200/90 bg-slate-50/70 space-y-2"
                                >
                                  <div className="flex items-center justify-between gap-1.5">
                                    <div className="min-w-0 flex items-center gap-1.5">
                                      <span className="w-4 h-4 rounded-full bg-slate-200 text-slate-700 text-[9px] font-mono font-bold flex items-center justify-center shrink-0">
                                        {idx + 1}
                                      </span>
                                      <span className="font-semibold text-slate-800 text-[11px] truncate" title={item.item_name}>
                                        {item.item_name}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <span className="text-[9.5px] font-mono text-slate-400">
                                        {visibleCount}/{itemAttrs.length}
                                      </span>
                                      {itemAttrs.length >= 3 && (
                                        <div className="flex items-center gap-1 ml-1 pl-1.5 border-l border-slate-200">
                                          <button
                                            type="button"
                                            onClick={() => showAllItemAttributes(itemKey, itemAttrs)}
                                            className="text-[9.5px] font-semibold text-blue-600 hover:text-blue-800 transition cursor-pointer"
                                            title="Show all attributes on this item"
                                          >
                                            Show All
                                          </button>
                                          <span className="text-slate-300 text-[9px]">•</span>
                                          <button
                                            type="button"
                                            onClick={() => hideAllItemAttributes(itemKey)}
                                            className="text-[9.5px] font-semibold text-slate-400 hover:text-slate-600 transition cursor-pointer"
                                            title="Hide all attributes on this item"
                                          >
                                            Hide All
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  {/* Attribute Toggle Chips */}
                                  <div className="flex flex-wrap gap-1.5">
                                    {itemAttrs.map((attrKey) => {
                                      const isVisible = currentVisible.includes(attrKey);
                                      return (
                                        <button
                                          key={attrKey}
                                          type="button"
                                          onClick={() => toggleItemAttribute(itemKey, itemAttrs, attrKey)}
                                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-medium transition cursor-pointer ${
                                            isVisible
                                              ? 'bg-white text-blue-700 border border-blue-300 shadow-2xs hover:bg-blue-50/50'
                                              : 'bg-slate-100 text-slate-400 border border-dashed border-slate-300 line-through hover:bg-slate-200/60'
                                          }`}
                                          title={isVisible ? `Hide ${attrKey} for item ${idx + 1}` : `Show ${attrKey} for item ${idx + 1}`}
                                        >
                                          <span className="text-[9px]">{isVisible ? '✓' : '✕'}</span>
                                          <span>{attrKey}</span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 2. Table Row Spacing */}
                    <div className="pt-2 border-t border-slate-100 space-y-2">
                      <label className="block text-slate-800 font-bold text-xs">
                        Table Row Spacing
                      </label>
                      <p className="text-[10.5px] text-slate-500 leading-normal">
                        Control table row height to fit more lines or maximize readability.
                      </p>
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        {[
                          {
                            id: 'comfortable',
                            label: 'Comfortable',
                            sub: '2.5 padding',
                            desc: 'Standard executive layout'
                          },
                          {
                            id: 'compact',
                            label: 'Compact',
                            sub: '1.5 padding',
                            desc: 'Higher density per page'
                          }
                        ].map((d) => {
                          const isSelected = tableDensity === d.id;
                          return (
                            <button
                              key={d.id}
                              type="button"
                              onClick={() => setTableDensity(d.id as QuotationTableDensity)}
                              className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                                isSelected
                                  ? 'border-blue-600 bg-blue-50/80 ring-2 ring-blue-600/20'
                                  : 'border-slate-200 hover:border-slate-300 bg-white'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className={`font-semibold text-xs ${isSelected ? 'text-blue-700' : 'text-slate-800'}`}>
                                  {d.label}
                                </span>
                                <span className="text-[9px] font-mono text-slate-400">{d.sub}</span>
                              </div>
                              <span className="text-[10px] text-slate-500 mt-1 leading-snug">
                                {d.desc}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* 3. Table Text Size */}
                    <div className="pt-2 border-t border-slate-100 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="block text-slate-800 font-bold text-xs flex items-center gap-1.5">
                          <Type className="w-3.5 h-3.5 text-blue-600" />
                          Table Text Size
                        </label>
                        <span className="text-[10px] font-mono text-slate-400 capitalize">
                          {tableFontScale}
                        </span>
                      </div>
                      <p className="text-[10.5px] text-slate-500 leading-normal">
                        Scale font sizes specifically for descriptions, item titles, and numbers across table cells.
                      </p>
                      <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200/80">
                        {[
                          { id: 'compact' as const, label: 'Compact', pt: '9pt' },
                          { id: 'standard' as const, label: 'Standard', pt: '10pt' },
                          { id: 'prominent' as const, label: 'Prominent', pt: '11pt' }
                        ].map((s) => {
                          const isSelected = tableFontScale === s.id;
                          return (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => setTableFontScale(s.id)}
                              className={`py-2 px-1 rounded-lg text-center transition cursor-pointer flex flex-col items-center justify-center ${
                                isSelected
                                  ? 'bg-blue-600 text-white font-semibold shadow-xs'
                                  : 'hover:bg-white text-slate-600'
                              }`}
                            >
                              <span className="text-[10px] font-semibold leading-tight">{s.label}</span>
                              <span className={`text-[8.5px] font-mono mt-0.5 ${isSelected ? 'text-blue-100' : 'text-slate-400'}`}>({s.pt})</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Informational Guardrail Card */}
                    <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-3 text-slate-600 space-y-1">
                      <div className="font-semibold text-blue-900 text-[11px] flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                        Fixed Structural Section
                      </div>
                      <p className="text-[10px] text-slate-500 leading-relaxed">
                        The Line Items Table is anchored above commercial terms and totals. Density and column choices are saved with this quote snapshot.
                      </p>
                    </div>
                  </div>
                </aside>
              )}

              {/* Retractable Right-Side Contextual Block Inspector Drawer */}
              {selectedBlock && (() => {
                const meta = getBlockMeta(selectedBlock);
                const Icon = meta.icon;
                const blockIndex = layoutBlocks.findIndex((b) => b.id === selectedBlock.id);
                const isFirst = blockIndex === 0;
                const isLast = blockIndex === layoutBlocks.length - 1;
                const isBlockHidden = selectedBlock.enabled === false || selectedBlock.is_visible === false;
                const selectedBlockType =
                  selectedBlock.type ||
                  (selectedBlock.id.startsWith('break_')
                    ? 'page_break'
                    : selectedBlock.id.startsWith('spacer_')
                    ? 'spacer'
                    : selectedBlock.id);

                return (
                  <aside className="w-full sm:w-[380px] xl:w-[410px] bg-white border-l border-slate-300 shadow-xl flex flex-col shrink-0 z-20 print:hidden overflow-y-auto animate-in slide-in-from-right-4 duration-200">
                    {/* Drawer Header */}
                    <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between sticky top-0 z-10">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                          selectedBlockType === 'page_break'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-bold text-slate-900 text-xs truncate">
                            {meta.label}
                          </h4>
                          <p className="text-[10px] text-slate-400 font-mono">
                            Block Inspector • Slot #{blockIndex + 1}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedSection(null)}
                        className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/80 transition cursor-pointer"
                        title="Close Inspector"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Drawer Content */}
                    <div className="p-4 space-y-4 text-xs">
                      {/* Unified Commercial Summary & Totals Hub (Top of Totals Inspector) */}
                      {selectedBlock.id === 'totals' && (
                        <div className="space-y-3.5 pb-2 border-b border-slate-200">
                          {/* Card 1 — Document Pricing & Option Mode */}
                          <div className="p-3 rounded-xl border border-indigo-200 bg-indigo-50/50 space-y-3">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold text-indigo-950 text-xs flex items-center gap-1.5">
                                <Layers className="w-3.5 h-3.5 text-indigo-600" />
                                1. Document Pricing &amp; Option Mode
                              </span>
                            </div>

                            {/* 3 Top-Level Mode Pills */}
                            <div className="grid grid-cols-3 gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleRestorePricedQuoteMode('combined_table')}
                                className={`p-2 rounded-lg border text-left transition cursor-pointer ${
                                  !isUnpricedSubmittalMode && optionDisplayMode === 'combined_table'
                                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                                    : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300'
                                }`}
                              >
                                <span className="text-[10.5px] font-bold block leading-tight">
                                  Standard / Combined
                                </span>
                                <span
                                  className={`text-[9px] block mt-0.5 ${
                                    !isUnpricedSubmittalMode && optionDisplayMode === 'combined_table'
                                      ? 'text-indigo-100'
                                      : 'text-slate-400'
                                  }`}
                                >
                                  Single priced table
                                </span>
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  handleRestorePricedQuoteMode(
                                    optionDisplayMode === 'combined_table'
                                      ? 'all_separate_tables'
                                      : optionDisplayMode
                                  )
                                }
                                className={`p-2 rounded-lg border text-left transition cursor-pointer ${
                                  !isUnpricedSubmittalMode && optionDisplayMode !== 'combined_table'
                                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                                    : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300'
                                }`}
                              >
                                <span className="text-[10.5px] font-bold block leading-tight">
                                  Multi-Option View
                                </span>
                                <span
                                  className={`text-[9px] block mt-0.5 ${
                                    !isUnpricedSubmittalMode && optionDisplayMode !== 'combined_table'
                                      ? 'text-indigo-100'
                                      : 'text-slate-400'
                                  }`}
                                >
                                  Option A / B / C tables
                                </span>
                              </button>

                              <button
                                type="button"
                                onClick={handleEnterUnpricedSubmittalMode}
                                className={`p-2 rounded-lg border text-left transition cursor-pointer ${
                                  isUnpricedSubmittalMode
                                    ? 'bg-amber-600 text-white border-amber-600 shadow-2xs'
                                    : 'bg-white text-slate-700 border-slate-200 hover:border-amber-300'
                                }`}
                              >
                                <span className="text-[10.5px] font-bold block leading-tight">
                                  Unpriced Submittal / DO
                                </span>
                                <span
                                  className={`text-[9px] block mt-0.5 ${
                                    isUnpricedSubmittalMode ? 'text-amber-100' : 'text-slate-400'
                                  }`}
                                >
                                  Qty &amp; specs only
                                </span>
                              </button>
                            </div>

                            {/* Unpriced Submittal / DO Active Banner with 1-Click Restore (Choice B1) */}
                            {isUnpricedSubmittalMode && (
                              <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-300 space-y-2">
                                <p className="text-[10.5px] text-amber-950 font-medium leading-relaxed">
                                  <strong>Unpriced Submittal / Delivery Order Mode Active:</strong> Unit Price, Line Total, Option Subtotals, and Bottom Summary Totals are hidden while preserving quantities and technical specifications.
                                </p>
                                <button
                                  type="button"
                                  onClick={() => handleRestorePricedQuoteMode()}
                                  className="w-full py-1.5 px-2.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-[10.5px] transition cursor-pointer shadow-2xs"
                                >
                                  Restore Priced Quote Settings
                                </button>
                              </div>
                            )}

                            {/* Multi-Option Sub-Controls when Multi-Option View is selected */}
                            {!isUnpricedSubmittalMode && optionDisplayMode !== 'combined_table' && (
                              <div className="space-y-2.5 pt-2 border-t border-indigo-200/70">
                                <div>
                                  <label className="block text-[10px] font-mono font-bold uppercase text-indigo-900/70 mb-1">
                                    Option Table Filter &amp; Layout
                                  </label>
                                  <div className="grid grid-cols-2 gap-1">
                                    {[
                                      {
                                        id: 'all_separate_tables' as const,
                                        label: 'All Options (Separate Tables)',
                                        desc: 'Dedicated table per Option'
                                      },
                                      {
                                        id: 'option_a_only' as const,
                                        label: 'Option A Only',
                                        desc: 'Filter to Option A items'
                                      },
                                      {
                                        id: 'option_b_only' as const,
                                        label: 'Option B Only',
                                        desc: 'Filter to Option B items'
                                      },
                                      {
                                        id: 'option_c_only' as const,
                                        label: 'Option C Only',
                                        desc: 'Filter to Option C items'
                                      }
                                    ].map((optMode) => {
                                      const active = optionDisplayMode === optMode.id;
                                      return (
                                        <button
                                          key={optMode.id}
                                          type="button"
                                          onClick={() => setOptionDisplayMode(optMode.id)}
                                          className={`p-1.5 rounded-lg border text-left transition cursor-pointer ${
                                            active
                                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                                              : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300'
                                          }`}
                                        >
                                          <span className="text-[10.5px] font-bold block leading-tight">
                                            {optMode.label}
                                          </span>
                                          <span
                                            className={`text-[9px] block mt-0.5 ${
                                              active ? 'text-indigo-100' : 'text-slate-400'
                                            }`}
                                          >
                                            {optMode.desc}
                                          </span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>

                                {/* 2-Choice Toggle when All Separate Tables is active */}
                                {optionDisplayMode === 'all_separate_tables' && (
                                  <div className="space-y-1.5 pt-1.5 border-t border-indigo-200/60">
                                    <label className="block text-[10px] font-mono font-bold uppercase text-indigo-900/70">
                                      Multi-Option Bottom Totals Behavior
                                    </label>
                                    <div className="grid grid-cols-2 gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => setShowCombinedOptionsTotal(false)}
                                        className={`p-2 rounded-lg border text-left transition cursor-pointer ${
                                          !showCombinedOptionsTotal
                                            ? 'bg-indigo-900 text-white border-indigo-900 shadow-2xs'
                                            : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300'
                                        }`}
                                      >
                                        <span className="text-[10px] font-bold block leading-tight">
                                          Per-Option Totals Only
                                        </span>
                                        <span
                                          className={`text-[9px] block mt-0.5 ${
                                            !showCombinedOptionsTotal ? 'text-indigo-200' : 'text-slate-400'
                                          }`}
                                        >
                                          Alternatives (No combined sum)
                                        </span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setShowCombinedOptionsTotal(true)}
                                        className={`p-2 rounded-lg border text-left transition cursor-pointer ${
                                          showCombinedOptionsTotal
                                            ? 'bg-indigo-900 text-white border-indigo-900 shadow-2xs'
                                            : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300'
                                        }`}
                                      >
                                        <span className="text-[10px] font-bold block leading-tight">
                                          Per-Option + Combined Bottom
                                        </span>
                                        <span
                                          className={`text-[9px] block mt-0.5 ${
                                            showCombinedOptionsTotal ? 'text-indigo-200' : 'text-slate-400'
                                          }`}
                                        >
                                          Sum all options in summary
                                        </span>
                                      </button>
                                    </div>
                                    {!showCombinedOptionsTotal && (
                                      <div className="p-2 rounded-lg bg-indigo-100/80 border border-indigo-200 text-indigo-950 text-[10px] leading-relaxed">
                                        Each Option table displays its own Total row on the PDF; bottom combined Grand Total is suppressed so alternative options are not added together.
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* Custom Option Banner Titles */}
                                {(() => {
                                  const detectedOpts: string[] = Array.from(
                                    new Set(
                                      quotationLineItems
                                        .map((it) => String(it.option || it.option_group || '').trim())
                                        .filter((o): o is string => Boolean(o && o !== 'Default / Included'))
                                    )
                                  );
                                  if (detectedOpts.length === 0) return null;
                                  return (
                                    <div className="space-y-1.5 pt-1.5 border-t border-indigo-200/60">
                                      <label className="block text-[10px] font-mono font-bold uppercase text-indigo-900/70">
                                        Custom Option Banner Titles
                                      </label>
                                      {detectedOpts.map((optKey) => (
                                        <div key={optKey} className="flex items-center gap-1.5">
                                          <span className="text-[10px] font-mono font-bold text-indigo-900 w-20 shrink-0 truncate">
                                            {optKey}:
                                          </span>
                                          <input
                                            type="text"
                                            value={optionGroupTitles[optKey] ?? ''}
                                            onChange={(e) =>
                                              setOptionGroupTitles((prev) => ({
                                                ...prev,
                                                [optKey]: e.target.value
                                              }))
                                            }
                                            placeholder={`Custom banner title for ${optKey}...`}
                                            className="flex-1 min-w-0 bg-white border border-indigo-200 rounded-md px-2 py-1 text-[10.5px] text-slate-800 focus:outline-none focus:border-indigo-500"
                                          />
                                        </div>
                                      ))}
                                    </div>
                                  );
                                })()}
                              </div>
                            )}
                          </div>

                          {/* Card 2 — BOM Set Pricing Default (Batch Action Without Locking Individual Overrides) */}
                          {(() => {
                            const compositeItems = quotationLineItems.filter((it) =>
                              Boolean(
                                it.is_composite_set ||
                                  (Array.isArray(it.sub_components) && it.sub_components.length > 0)
                              )
                            );
                            const lumpSumCount = compositeItems.filter(
                              (it) => (it.package_pricing_mode || 'lump_sum') === 'lump_sum'
                            ).length;
                            const itemizedCount = compositeItems.length - lumpSumCount;
                            return (
                              <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/80 space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-bold text-slate-800 text-xs">
                                    2. BOM Set Pricing Default
                                  </span>
                                  <span className="px-2 py-0.5 rounded-full text-[9.5px] font-mono font-semibold bg-white border border-slate-200 text-slate-600">
                                    {compositeItems.length === 0
                                      ? '0 BOM Sets'
                                      : `${lumpSumCount} Lump Sum • ${itemizedCount} Itemized`}
                                  </span>
                                </div>
                                <p className="text-[10px] text-slate-500 leading-normal">
                                  Batch-apply pricing mode across all BOM Sets. You can still override individual sets in the Line Items list.
                                </p>
                                <div className="grid grid-cols-2 gap-1.5">
                                  <button
                                    type="button"
                                    disabled={compositeItems.length === 0}
                                    onClick={() => handleBatchSetBomPricingMode('lump_sum')}
                                    className="py-1.5 px-2.5 rounded-lg border border-slate-300 bg-white hover:bg-blue-50 hover:border-blue-300 disabled:opacity-40 text-slate-800 font-semibold text-[10.5px] transition cursor-pointer shadow-2xs"
                                  >
                                    Set All Packages to Lump Sum
                                  </button>
                                  <button
                                    type="button"
                                    disabled={compositeItems.length === 0}
                                    onClick={() => handleBatchSetBomPricingMode('itemized')}
                                    className="py-1.5 px-2.5 rounded-lg border border-slate-300 bg-white hover:bg-blue-50 hover:border-blue-300 disabled:opacity-40 text-slate-800 font-semibold text-[10.5px] transition cursor-pointer shadow-2xs"
                                  >
                                    Set All Packages to Itemized
                                  </button>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      )}

                      {/* 1. Visibility Toggle */}
                      <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-3 flex items-center justify-between">
                        <div>
                          <span className="font-semibold text-slate-800 text-xs block">
                            Document Visibility
                          </span>
                          <span className="text-[10.5px] text-slate-500">
                            {!isBlockHidden
                              ? 'Active in layout sequence'
                              : 'Hidden from output'}
                          </span>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!isBlockHidden}
                            onChange={(e) => handleToggleBlockEnabled(selectedBlock.id, e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-slate-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                      </div>

                      {/* Amber Notice Banner when Block is Hidden */}
                      {isBlockHidden && (
                        <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-[11px] font-medium leading-relaxed">
                          This block is currently hidden on the PDF. Toggle Document Visibility on to render it.
                        </div>
                      )}

                      {/* 2. Reordering Controls (Up / Down) */}
                      <div>
                        <label className="block text-slate-500 font-medium mb-1.5 text-[11px]">
                          Sequential Ordering
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            disabled={isFirst}
                            onClick={() => handleMoveBlock(blockIndex, 'up')}
                            className="py-1.5 px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-30 text-slate-700 font-medium text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                          >
                            <ArrowUp className="w-3.5 h-3.5 text-slate-500" />
                            <span>Move Up</span>
                          </button>
                          <button
                            type="button"
                            disabled={isLast}
                            onClick={() => handleMoveBlock(blockIndex, 'down')}
                            className="py-1.5 px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-30 text-slate-700 font-medium text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                          >
                            <ArrowDown className="w-3.5 h-3.5 text-slate-500" />
                            <span>Move Down</span>
                          </button>
                        </div>
                      </div>

                      {/* PAGE BREAK INSPECTOR PANEL */}
                      {selectedBlockType === 'page_break' && (
                        <div className="space-y-4 pt-2 border-t border-slate-100">
                          <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3 space-y-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <span className="font-semibold text-slate-800 text-xs block">
                                  Show Continuation Header on next page
                                </span>
                                <span className="text-[10.5px] text-slate-500">
                                  Renders compact corporate running header at the top of the new A4 sheet
                                </span>
                              </div>
                              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                                <input
                                  type="checkbox"
                                  checked={selectedBlock.show_continuation_header !== false}
                                  onChange={(e) =>
                                    handleUpdateBlockConfig(selectedBlock.id, {
                                      show_continuation_header: e.target.checked
                                    })
                                  }
                                  className="sr-only peer"
                                />
                                <div className="w-9 h-5 bg-slate-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                              </label>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleDeleteBlock(selectedBlock.id)}
                            className="w-full py-2 px-3 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 font-semibold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Delete Page Break</span>
                          </button>
                        </div>
                      )}

                      {/* SPACER INSPECTOR PANEL */}
                      {selectedBlockType === 'spacer' && (
                        <div className="space-y-4 pt-2 border-t border-slate-100">
                          <div>
                            <div className="flex items-center justify-between mb-1.5 text-[11px]">
                              <span className="text-slate-500 font-medium">Height Presets</span>
                              <span className="font-mono text-slate-700 font-semibold">
                                {selectedBlock.spacer_fill_remaining
                                  ? 'Fill Remaining'
                                  : `${selectedBlock.spacer_height_mm || 20}mm`}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-1.5">
                              {[
                                { label: '10mm', mm: 10, fill: false },
                                { label: '20mm', mm: 20, fill: false },
                                { label: '40mm', mm: 40, fill: false },
                                { label: 'Fill Remaining', mm: 20, fill: true }
                              ].map((preset) => {
                                const isSelected = preset.fill
                                  ? Boolean(selectedBlock.spacer_fill_remaining)
                                  : !selectedBlock.spacer_fill_remaining &&
                                    (selectedBlock.spacer_height_mm || 20) === preset.mm;
                                return (
                                  <button
                                    key={preset.label}
                                    type="button"
                                    onClick={() =>
                                      handleUpdateBlockConfig(selectedBlock.id, {
                                        spacer_fill_remaining: preset.fill,
                                        spacer_height_mm: preset.fill
                                          ? selectedBlock.spacer_height_mm || 20
                                          : preset.mm
                                      })
                                    }
                                    className={`py-2 px-2.5 rounded-xl border text-center text-xs font-medium transition cursor-pointer ${
                                      isSelected
                                        ? 'border-blue-600 bg-blue-600 text-white font-semibold shadow-2xs'
                                        : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                                    }`}
                                  >
                                    {preset.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {!selectedBlock.spacer_fill_remaining && (
                            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 space-y-2">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="text-slate-600 font-medium">Custom Height (mm)</span>
                                <span className="font-mono font-bold text-blue-700">
                                  {selectedBlock.spacer_height_mm || 20} mm
                                </span>
                              </div>
                              <input
                                type="range"
                                min={5}
                                max={100}
                                step={5}
                                value={selectedBlock.spacer_height_mm || 20}
                                onChange={(e) =>
                                  handleUpdateBlockConfig(selectedBlock.id, {
                                    spacer_fill_remaining: false,
                                    spacer_height_mm: Number(e.target.value)
                                  })
                                }
                                className="w-full accent-blue-600 cursor-pointer"
                              />
                              <div className="flex justify-between text-[9.5px] text-slate-400 font-mono">
                                <span>5mm</span>
                                <span>50mm</span>
                                <span>100mm</span>
                              </div>
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={() => handleDeleteBlock(selectedBlock.id)}
                            className="w-full py-2 px-3 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 font-semibold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Delete Spacer</span>
                          </button>
                        </div>
                      )}

                      {/* STANDARD & CUSTOM LEGO BLOCK CONTROLS */}
                      {selectedBlockType !== 'page_break' && selectedBlockType !== 'spacer' && (
                        <>
                          {/* Convert Built-In Legacy Block to Full Custom Block Button */}
                          {['terms', 'remittance', 'totals', 'acceptance', 'signatory', 'signatories'].includes(
                            selectedBlock.id
                          ) &&
                            selectedBlockType !== 'custom' &&
                            !Array.isArray(selectedBlock.pieces) && (
                              <div className="p-2.5 rounded-xl bg-indigo-50/70 border border-indigo-200 flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-[11px] font-bold text-indigo-950">
                                    Want 100% Lego Customization?
                                  </p>
                                  <p className="text-[9.5px] text-indigo-700 leading-tight">
                                    Hides this legacy block &amp; inserts an editable Custom Block clone in its place.
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleConvertLegacyBlockToCustom(selectedBlock)}
                                  className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] shrink-0 transition cursor-pointer shadow-2xs"
                                >
                                  ✨ Convert to Custom
                                </button>
                              </div>
                            )}

                          {/* Position Zone (Above Items Table vs Below Items Table) */}
                          <div>
                            <div className="flex items-center justify-between mb-1.5 text-[11px]">
                              <span className="text-slate-500 font-medium">Document Position Zone</span>
                              <span className="font-mono text-indigo-600 font-semibold">
                                {selectedBlock.zone === 'pre_table' ? '⬆️ Above Table' : '⬇️ Below Table'}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200/80">
                              <button
                                type="button"
                                onClick={() =>
                                  handleUpdateBlockConfig(selectedBlock.id, { zone: 'pre_table' })
                                }
                                className={`py-1.5 px-2 rounded-lg text-[10.5px] font-medium transition cursor-pointer ${
                                  selectedBlock.zone === 'pre_table'
                                    ? 'bg-indigo-600 text-white font-semibold shadow-2xs'
                                    : 'hover:bg-white text-slate-600'
                                }`}
                              >
                                ⬆️ Above Items Table
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleUpdateBlockConfig(selectedBlock.id, { zone: 'post_table' })
                                }
                                className={`py-1.5 px-2 rounded-lg text-[10.5px] font-medium transition cursor-pointer ${
                                  selectedBlock.zone !== 'pre_table'
                                    ? 'bg-indigo-600 text-white font-semibold shadow-2xs'
                                    : 'hover:bg-white text-slate-600'
                                }`}
                              >
                                ⬇️ Below Items Table
                              </button>
                            </div>
                          </div>

                          {/* 3. Placement Selector: 3-Way Segmented Control */}
                          <div>
                            <div className="flex items-center justify-between mb-1.5 text-[11px]">
                              <span className="text-slate-500 font-medium">Placement Track</span>
                              <span className="font-mono text-slate-400 capitalize">{selectedBlock.placement} width</span>
                            </div>
                            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200/80">
                              {[
                                { id: 'left', label: 'Left 50%' },
                                { id: 'full', label: 'Full 100%' },
                                { id: 'right', label: 'Right 50%' }
                              ].map((p) => {
                                const isSelected = selectedBlock.placement === p.id;
                                return (
                                  <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => handleSetBlockPlacement(selectedBlock.id, p.id as any)}
                                    className={`py-1.5 px-1 rounded-lg text-[11px] font-medium transition text-center cursor-pointer ${
                                      isSelected
                                        ? 'bg-blue-600 text-white font-semibold shadow-xs'
                                        : 'hover:bg-white text-slate-600'
                                    }`}
                                  >
                                    {p.label}
                                  </button>
                                );
                              })}
                            </div>
                            <p className="text-[10px] text-slate-400 mt-1">
                              Paired Left &amp; Right blocks on the same row stretch to equal height automatically.
                            </p>
                          </div>

                          {/* 4. Style Selector: Framed vs Minimal */}
                          <div>
                            <div className="flex items-center justify-between mb-1.5 text-[11px]">
                              <span className="text-slate-500 font-medium">Presentation Style</span>
                              <span className="font-mono text-slate-400 capitalize">{selectedBlock.style}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              {[
                                { id: 'framed', label: 'Framed', desc: 'Card border & fill' },
                                { id: 'minimal', label: 'Minimal', desc: 'Hairline divider' }
                              ].map((s) => {
                                const isSelected = selectedBlock.style === s.id;
                                return (
                                  <button
                                    key={s.id}
                                    type="button"
                                    onClick={() => handleSetBlockStyle(selectedBlock.id, s.id as any)}
                                    className={`py-2 px-2.5 rounded-xl border text-left transition cursor-pointer ${
                                      isSelected
                                        ? 'border-blue-600 bg-blue-50/80 text-blue-900 ring-2 ring-blue-600/20'
                                        : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
                                    }`}
                                  >
                                    <p className="font-semibold text-xs">{s.label}</p>
                                    <p className="text-[10px] text-slate-400 mt-0.5">{s.desc}</p>
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* 5. Font Scale: Compact (9px) / Standard (10px) / Prominent (11px) */}
                          <div>
                            <div className="flex items-center justify-between mb-1.5 text-[11px]">
                              <span className="text-slate-500 font-medium">Typography Scale</span>
                              <span className="font-mono text-slate-400 capitalize">{selectedBlock.fontScale || 'standard'}</span>
                            </div>
                            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200/80">
                              {[
                                { id: 'compact', label: 'Small', size: '9px' },
                                { id: 'standard', label: 'Base', size: '10px' },
                                { id: 'prominent', label: 'Large', size: '11px' }
                              ].map((f) => {
                                const isSelected = (selectedBlock.fontScale || 'standard') === f.id;
                                return (
                                  <button
                                    key={f.id}
                                    type="button"
                                    onClick={() => handleSetBlockFontScale(selectedBlock.id, f.id as any)}
                                    className={`py-1.5 px-1 rounded-lg text-[11px] font-medium transition text-center cursor-pointer ${
                                      isSelected
                                        ? 'bg-blue-600 text-white font-semibold shadow-xs'
                                        : 'hover:bg-white text-slate-600'
                                    }`}
                                  >
                                    <div>{f.label}</div>
                                    <div className={`text-[9px] ${isSelected ? 'text-blue-100' : 'text-slate-400'}`}>{f.size}</div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* 6. Padding: Tight (p-2) vs Normal (p-3) */}
                          <div>
                            <div className="flex items-center justify-between mb-1.5 text-[11px]">
                              <span className="text-slate-500 font-medium">Card Padding</span>
                              <span className="font-mono text-slate-400 capitalize">{selectedBlock.padding || 'standard'}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              {[
                                { id: 'compact', label: 'Tight', desc: 'p-2 (8px)' },
                                { id: 'standard', label: 'Normal', desc: 'p-3 (12px)' }
                              ].map((p) => {
                                const isSelected = (selectedBlock.padding || 'standard') === p.id;
                                return (
                                  <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => handleSetBlockPadding(selectedBlock.id, p.id as any)}
                                    className={`py-1.5 px-2.5 rounded-xl border text-center transition cursor-pointer ${
                                      isSelected
                                        ? 'border-blue-600 bg-blue-50/80 text-blue-900 font-semibold ring-2 ring-blue-600/20'
                                        : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
                                    }`}
                                  >
                                    <p className="text-xs font-semibold">{p.label}</p>
                                    <p className="text-[10px] text-slate-400 mt-0.5">{p.desc}</p>
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* Standardized Section Header & Banner Override (for Content & Signatory Blocks) */}
                          {(selectedBlock.id === 'terms' ||
                            selectedBlock.id === 'remittance' ||
                            selectedBlock.id === 'acceptance' ||
                            selectedBlock.id === 'totals' ||
                            selectedBlock.id === 'signatory') && (
                            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 space-y-2.5">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold text-slate-800">
                                  Section Header &amp; Banner
                                </span>
                                <label className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-600 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={selectedBlock.showHeaderIcon !== false}
                                    onChange={(e) =>
                                      handleUpdateBlockConfig(selectedBlock.id, {
                                        showHeaderIcon: e.target.checked
                                      })
                                    }
                                    className="rounded border-slate-300 text-blue-600 cursor-pointer"
                                  />
                                  <span>Show Icon</span>
                                </label>
                              </div>

                                <div className="grid grid-cols-2 gap-1.5">
                                <div>
                                  <label className="block text-[9.5px] font-semibold text-slate-500 mb-0.5">
                                    Section Heading
                                  </label>
                                  <AtMentionInput
                                    value={selectedBlock.titleOverride ?? ''}
                                    onChange={(val) =>
                                      handleUpdateBlockConfig(selectedBlock.id, {
                                        titleOverride: val
                                      })
                                    }
                                    tokenContext={studioTokenContext}
                                    compact
                                    placeholder={
                                      selectedBlock.id === 'terms'
                                        ? 'Commercial Terms & Conditions'
                                        : selectedBlock.id === 'remittance'
                                          ? 'Bank Remittance Details'
                                          : selectedBlock.id === 'acceptance'
                                            ? 'Customer Acceptance & Confirmation'
                                            : selectedBlock.id === 'totals'
                                              ? 'Financial Summary (opt)'
                                              : 'Authorized Signatories (opt)'
                                    }
                                    className="w-full px-2 py-1 rounded-md border border-slate-300 bg-white text-[11px] text-slate-800"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[9.5px] font-semibold text-slate-500 mb-0.5">
                                    Right Subtitle (opt)
                                  </label>
                                  <AtMentionInput
                                    value={selectedBlock.subtitleOverride ?? ''}
                                    onChange={(val) =>
                                      handleUpdateBlockConfig(selectedBlock.id, {
                                        subtitleOverride: val
                                      })
                                    }
                                    tokenContext={studioTokenContext}
                                    compact
                                    placeholder={
                                      selectedBlock.id === 'acceptance'
                                        ? 'Sign & Return Copy with PO'
                                        : 'Optional subtitle'
                                    }
                                    className="w-full px-2 py-1 rounded-md border border-slate-300 bg-white text-[11px] text-slate-800"
                                  />
                                </div>
                              </div>

                              <div>
                                <label className="block text-[9.5px] font-semibold text-slate-500 mb-1">
                                  Header Banner Style
                                </label>
                                <div className="grid grid-cols-3 gap-1">
                                  {[
                                    { id: 'inherit' as const, label: 'Global' },
                                    { id: 'underline' as const, label: 'Underline' },
                                    { id: 'tinted' as const, label: 'Tinted' },
                                    { id: 'solid' as const, label: 'Solid Fill' },
                                    { id: 'minimal' as const, label: 'Minimal' },
                                    { id: 'none' as const, label: 'Hide Title' }
                                  ].map((opt) => {
                                    const active = (selectedBlock.headerStyleOverride || 'inherit') === opt.id;
                                    return (
                                      <button
                                        key={opt.id}
                                        type="button"
                                        onClick={() =>
                                          handleUpdateBlockConfig(selectedBlock.id, {
                                            headerStyleOverride: opt.id
                                          })
                                        }
                                        className={`py-1 px-1.5 rounded-md text-[10px] font-semibold transition cursor-pointer ${
                                          active
                                            ? 'bg-blue-600 text-white shadow-2xs'
                                            : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                                        }`}
                                      >
                                        {opt.label}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Standardized Field Layout & Row Formatting (for Terms, Remittance, Totals) */}
                          {(selectedBlock.id === 'terms' ||
                            selectedBlock.id === 'remittance' ||
                            selectedBlock.id === 'totals') && (
                            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 space-y-2.5">
                              <span className="text-[11px] font-bold text-slate-800 block">
                                Field Layout &amp; Row Formatting
                              </span>

                              {selectedBlock.id !== 'totals' && (
                                <div>
                                  <label className="block text-[9.5px] font-semibold text-slate-500 mb-1">
                                    Key-Value Layout Mode
                                  </label>
                                  <div className="grid grid-cols-3 gap-1">
                                    {[
                                      { id: 'split' as const, label: 'Split L/R' },
                                      { id: 'inline' as const, label: 'Inline' },
                                      { id: 'grid_2col' as const, label: '2-Col Grid' }
                                    ].map((mode) => {
                                      const active = (selectedBlock.fieldLayoutMode || 'split') === mode.id;
                                      return (
                                        <button
                                          key={mode.id}
                                          type="button"
                                          onClick={() =>
                                            handleUpdateBlockConfig(selectedBlock.id, {
                                              fieldLayoutMode: mode.id
                                            })
                                          }
                                          className={`py-1.5 px-1.5 rounded-lg text-[10px] font-semibold transition cursor-pointer ${
                                            active
                                              ? 'bg-blue-600 text-white shadow-2xs'
                                              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                                          }`}
                                        >
                                          {mode.label}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              <div className="grid grid-cols-2 gap-2 items-center pt-1">
                                <label className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-white border border-slate-200 cursor-pointer">
                                  <span className="text-[10px] font-semibold text-slate-700">
                                    Row Dividers
                                  </span>
                                  <input
                                    type="checkbox"
                                    checked={
                                      selectedBlock.showRowDividers !== undefined
                                        ? selectedBlock.showRowDividers
                                        : selectedBlock.id === 'totals'
                                    }
                                    onChange={(e) =>
                                      handleUpdateBlockConfig(selectedBlock.id, {
                                        showRowDividers: e.target.checked
                                      })
                                    }
                                    className="rounded border-slate-300 text-blue-600 cursor-pointer"
                                  />
                                </label>

                                {selectedBlock.id !== 'totals' && (
                                  <div className="grid grid-cols-2 gap-1 bg-white p-0.5 rounded-lg border border-slate-200">
                                    {[
                                      { id: 'left' as const, label: 'Val Left' },
                                      { id: 'right' as const, label: 'Val Right' }
                                    ].map((alignOpt) => {
                                      const currentAlign =
                                        selectedBlock.valueAlign ||
                                        ((selectedBlock.fieldLayoutMode || 'split') === 'split'
                                          ? 'right'
                                          : 'left');
                                      const active = currentAlign === alignOpt.id;
                                      return (
                                        <button
                                          key={alignOpt.id}
                                          type="button"
                                          onClick={() =>
                                            handleUpdateBlockConfig(selectedBlock.id, {
                                              valueAlign: alignOpt.id
                                            })
                                          }
                                          className={`py-1 rounded-md text-[9.5px] font-semibold transition cursor-pointer ${
                                            active
                                              ? 'bg-blue-600 text-white'
                                              : 'text-slate-600 hover:bg-slate-100'
                                          }`}
                                        >
                                          {alignOpt.label}
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Commercial Terms Specific Options */}
                          {selectedBlock.id === 'terms' && (
                            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 space-y-3">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold text-slate-800">
                                  Commercial Terms Fields
                                </span>
                                <span className="text-[9.5px] text-slate-500">
                                  Toggle, rename &amp; edit values
                                </span>
                              </div>

                              {(() => {
                                const vis = selectedBlock.visibleFields || {};
                                const lbls = selectedBlock.fieldLabels || {};
                                const defaultOrder = ['price_basis', 'payment_terms', 'validity'];
                                const activeOrder =
                                  selectedBlock.fieldOrder && selectedBlock.fieldOrder.length > 0
                                    ? selectedBlock.fieldOrder
                                    : defaultOrder;

                                const moveTermField = (key: string, dir: -1 | 1) => {
                                  const idx = activeOrder.indexOf(key);
                                  if (idx === -1) return;
                                  const target = idx + dir;
                                  if (target < 0 || target >= activeOrder.length) return;
                                  const copy = [...activeOrder];
                                  const [item] = copy.splice(idx, 1);
                                  copy.splice(target, 0, item);
                                  handleUpdateBlockConfig('terms', { fieldOrder: copy });
                                };

                                const termMeta: Record<
                                  string,
                                  {
                                    defaultLabel: string;
                                    value: string;
                                    onChange: (val: string) => void;
                                    isNumber?: boolean;
                                  }
                                > = {
                                  price_basis: {
                                    defaultLabel: 'Price Basis:',
                                    value: priceBasis,
                                    onChange: (val) => setPriceBasis(val)
                                  },
                                  payment_terms: {
                                    defaultLabel: 'Payment Terms:',
                                    value: paymentTerms,
                                    onChange: (val) => setPaymentTerms(val)
                                  },
                                  validity: {
                                    defaultLabel: 'Validity:',
                                    value: String(validityDays),
                                    onChange: (val) => setValidityDays(Math.max(1, Number(val) || 30)),
                                    isNumber: true
                                  }
                                };

                                return (
                                  <div className="space-y-2">
                                    {activeOrder
                                      .filter((k) => Boolean(termMeta[k]))
                                      .map((key, idx) => {
                                        const meta = termMeta[key];
                                        const isChecked = vis[key] !== false;
                                        return (
                                          <div
                                            key={key}
                                            className="p-2 rounded-lg bg-white border border-slate-200 space-y-1.5"
                                          >
                                            <div className="flex items-center justify-between gap-1">
                                              <label className="flex items-center gap-1.5 cursor-pointer flex-1 min-w-0">
                                                <input
                                                  type="checkbox"
                                                  checked={isChecked}
                                                  onChange={(e) =>
                                                    handleUpdateBlockConfig('terms', {
                                                      visibleFields: {
                                                        ...vis,
                                                        [key]: e.target.checked
                                                      }
                                                    })
                                                  }
                                                  className="rounded border-slate-300 text-blue-600 cursor-pointer"
                                                />
                                                <input
                                                  type="text"
                                                  value={lbls[key] ?? meta.defaultLabel}
                                                  onChange={(e) =>
                                                    handleUpdateBlockConfig('terms', {
                                                      fieldLabels: {
                                                        ...lbls,
                                                        [key]: e.target.value
                                                      }
                                                    })
                                                  }
                                                  className="text-[10.5px] font-semibold text-slate-700 bg-transparent border-b border-transparent focus:border-blue-400 focus:outline-hidden w-full"
                                                />
                                              </label>
                                              <div className="flex items-center gap-0.5 shrink-0">
                                                <button
                                                  type="button"
                                                  disabled={idx === 0}
                                                  onClick={() => moveTermField(key, -1)}
                                                  className="p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                                                  title="Move Up"
                                                >
                                                  <ArrowUp className="w-3 h-3" />
                                                </button>
                                                <button
                                                  type="button"
                                                  disabled={idx === activeOrder.length - 1}
                                                  onClick={() => moveTermField(key, 1)}
                                                  className="p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                                                  title="Move Down"
                                                >
                                                  <ArrowDown className="w-3 h-3" />
                                                </button>
                                              </div>
                                            </div>
                                            {isChecked && (
                                              <div className="flex items-center gap-1.5">
                                                {meta.isNumber ? (
                                                  <>
                                                    <input
                                                      type="number"
                                                      value={meta.value ?? ''}
                                                      onChange={(e) => meta.onChange(e.target.value)}
                                                      className="w-full px-2 py-1 rounded border border-slate-300 bg-slate-50/60 focus:bg-white text-[11px] text-slate-800"
                                                    />
                                                    <span className="text-[10px] font-semibold text-slate-500 shrink-0">
                                                      Days
                                                    </span>
                                                  </>
                                                ) : (
                                                  <div className="w-full">
                                                    <AtMentionInput
                                                      value={meta.value ?? ''}
                                                      onChange={(val) => meta.onChange(val)}
                                                      tokenContext={studioTokenContext}
                                                      compact
                                                      className="w-full px-2 py-1 rounded border border-slate-300 bg-slate-50/60 focus:bg-white text-[11px] text-slate-800"
                                                    />
                                                  </div>
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}

                                    {/* Clauses / Notes Toggle & Direct Textarea */}
                                    <div className="p-2 rounded-lg bg-white border border-slate-200 space-y-1.5">
                                      <label className="flex items-center justify-between cursor-pointer">
                                        <span className="text-[10.5px] font-semibold text-slate-700">
                                          Show Terms &amp; Clauses Paragraph
                                        </span>
                                        <input
                                          type="checkbox"
                                          checked={vis.clauses !== false}
                                          onChange={(e) =>
                                            handleUpdateBlockConfig('terms', {
                                              visibleFields: {
                                                ...vis,
                                                clauses: e.target.checked
                                              }
                                            })
                                          }
                                          className="rounded border-slate-300 text-blue-600 cursor-pointer"
                                        />
                                      </label>
                                      {vis.clauses !== false && (
                                        <AtMentionTextarea
                                          rows={3}
                                          value={customNotes ?? ''}
                                          onChange={setCustomNotes}
                                          tokenContext={studioTokenContext}
                                          compact
                                          placeholder="1. All supplied items carry standard warranty... Type @ for tags"
                                          className="w-full px-2 py-1 rounded border border-slate-300 bg-slate-50/60 focus:bg-white text-[10.5px] text-slate-800"
                                        />
                                      )}
                                    </div>
                                  </div>
                                );
                              })()}

                              {/* Custom Key-Value Rows for Commercial Terms */}
                              <div className="p-2 rounded-lg bg-white border border-slate-200 space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10.5px] font-semibold text-slate-700">
                                    Custom Term Rows (e.g. Warranty, Origin)
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const nextRow = {
                                        id: `term_row_${Date.now()}`,
                                        label: 'Warranty:',
                                        value: '12 Months Standard Manufacturer Warranty',
                                        enabled: true
                                      };
                                      handleUpdateBlockConfig('terms', {
                                        customRows: [...(selectedBlock.customRows || []), nextRow]
                                      });
                                    }}
                                    className="text-[10px] font-semibold text-blue-600 hover:underline flex items-center gap-0.5 cursor-pointer"
                                  >
                                    <Plus className="w-3 h-3" />
                                    <span>Add Row</span>
                                  </button>
                                </div>
                                {(selectedBlock.customRows || []).map((row, rIdx) => (
                                  <div
                                    key={row.id || rIdx}
                                    className="flex items-center gap-1 bg-slate-50 p-1.5 rounded border border-slate-200"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={row.enabled !== false}
                                      onChange={(e) => {
                                        const updated = (selectedBlock.customRows || []).map((item, i) =>
                                          i === rIdx ? { ...item, enabled: e.target.checked } : item
                                        );
                                        handleUpdateBlockConfig('terms', { customRows: updated });
                                      }}
                                      className="rounded border-slate-300 text-blue-600 cursor-pointer shrink-0"
                                    />
                                    <input
                                      type="text"
                                      value={row.label ?? ''}
                                      onChange={(e) => {
                                        const updated = (selectedBlock.customRows || []).map((item, i) =>
                                          i === rIdx ? { ...item, label: e.target.value } : item
                                        );
                                        handleUpdateBlockConfig('terms', { customRows: updated });
                                      }}
                                      placeholder="Label"
                                      className="w-24 px-1.5 py-0.5 rounded border border-slate-300 bg-white text-[10px] text-slate-700"
                                    />
                                    <div className="flex-1 min-w-0">
                                      <AtMentionInput
                                        value={row.value ?? ''}
                                        onChange={(val) => {
                                          const updated = (selectedBlock.customRows || []).map((item, i) =>
                                            i === rIdx ? { ...item, value: val } : item
                                          );
                                          handleUpdateBlockConfig('terms', { customRows: updated });
                                        }}
                                        tokenContext={studioTokenContext}
                                        compact
                                        placeholder="Value or @tag"
                                        className="w-full px-1.5 py-0.5 rounded border border-slate-300 bg-white text-[10px] text-slate-800"
                                      />
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const updated = (selectedBlock.customRows || []).map((item, i) =>
                                          i === rIdx ? { ...item, hideIfEmpty: !item.hideIfEmpty } : item
                                        );
                                        handleUpdateBlockConfig('terms', { customRows: updated });
                                      }}
                                      title={
                                        row.hideIfEmpty
                                          ? 'Row auto-hides when @tag is empty/omitted (Click to show — dash instead)'
                                          : 'Row shows — dash when @tag is empty/omitted (Click to auto-hide row if empty)'
                                      }
                                      className={`px-1 py-0.5 rounded text-[9px] font-mono border cursor-pointer shrink-0 ${
                                        row.hideIfEmpty
                                          ? 'bg-amber-50 border-amber-300 text-amber-800 font-semibold'
                                          : 'bg-white border-slate-200 text-slate-400 hover:text-slate-700'
                                      }`}
                                    >
                                      {row.hideIfEmpty ? 'Hide ∅' : 'Show —'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const updated = (selectedBlock.customRows || []).filter(
                                          (_, i) => i !== rIdx
                                        );
                                        handleUpdateBlockConfig('terms', { customRows: updated });
                                      }}
                                      className="p-1 text-rose-500 hover:bg-rose-50 rounded cursor-pointer shrink-0"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Card 3 — Financial Summary Rows & Live AED Preview */}
                          {selectedBlock.id === 'totals' && (
                            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 space-y-3">
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-slate-800 text-xs">
                                  3. Financial Summary Rows &amp; Live Preview
                                </span>
                                <span className="font-mono font-bold text-[11px] text-blue-900 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md">
                                  {liveQuotation.currency}{' '}
                                  {financialTotals.grand_total.toLocaleString('en-US', {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2
                                  })}
                                </span>
                              </div>

                              {/* Reorderable Standard Rows + Grand Total Row */}
                              {(() => {
                                const vis = selectedBlock.visibleFields || {};
                                const lbls = selectedBlock.fieldLabels || {};
                                const defaultStdOrder = ['subtotal', 'freight', 'tax'];
                                const currentStdOrder = (() => {
                                  const configured = Array.isArray(selectedBlock.fieldOrder)
                                    ? selectedBlock.fieldOrder.filter((k) => defaultStdOrder.includes(k))
                                    : [];
                                  return [
                                    ...configured,
                                    ...defaultStdOrder.filter((k) => !configured.includes(k))
                                  ];
                                })();

                                const stdRowMeta: Record<
                                  string,
                                  { defaultLabel: string; formattedAmount: string }
                                > = {
                                  subtotal: {
                                    defaultLabel: 'Subtotal (Excl. Tax):',
                                    formattedAmount: `${liveQuotation.currency} ${financialTotals.subtotal.toLocaleString(
                                      'en-US',
                                      { minimumFractionDigits: 2, maximumFractionDigits: 2 }
                                    )}`
                                  },
                                  freight: {
                                    defaultLabel: 'Freight / Logistics Charges:',
                                    formattedAmount: `${liveQuotation.currency} ${Number(
                                      freightAmount || 0
                                    ).toLocaleString('en-US', {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2
                                    })}`
                                  },
                                  tax: {
                                    defaultLabel: `VAT / Tax (${taxRatePercent}%):`,
                                    formattedAmount:
                                      taxMode === 'taxes_extra'
                                        ? `${liveQuotation.currency} ${financialTotals.tax_amount.toLocaleString(
                                            'en-US',
                                            { minimumFractionDigits: 2, maximumFractionDigits: 2 }
                                          )}`
                                        : taxMode === 'tax_exempt'
                                        ? `0.00 (Exempt)`
                                        : `${liveQuotation.currency} ${financialTotals.tax_amount.toLocaleString(
                                            'en-US',
                                            { minimumFractionDigits: 2, maximumFractionDigits: 2 }
                                          )}`
                                  }
                                };

                                const moveStdRow = (idx: number, dir: 'up' | 'down') => {
                                  const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
                                  if (swapIdx < 0 || swapIdx >= currentStdOrder.length) return;
                                  const nextOrder = [...currentStdOrder];
                                  const temp = nextOrder[idx];
                                  nextOrder[idx] = nextOrder[swapIdx];
                                  nextOrder[swapIdx] = temp;
                                  handleUpdateBlockConfig('totals', { fieldOrder: nextOrder });
                                };

                                return (
                                  <div className="space-y-1.5">
                                    <span className="text-[10.5px] font-bold text-slate-700 block">
                                      Standard Accounting Rows (Reorderable)
                                    </span>
                                    {currentStdOrder.map((key, idx) => {
                                      const meta = stdRowMeta[key];
                                      if (!meta) return null;
                                      return (
                                        <div
                                          key={key}
                                          className="flex items-center gap-1.5 bg-white p-1.5 rounded-lg border border-slate-200"
                                        >
                                          <input
                                            type="checkbox"
                                            checked={vis[key] !== false}
                                            onChange={(e) =>
                                              handleUpdateBlockConfig('totals', {
                                                visibleFields: { ...vis, [key]: e.target.checked }
                                              })
                                            }
                                            className="rounded border-slate-300 text-blue-600 cursor-pointer shrink-0"
                                          />
                                          <div className="flex flex-col gap-0.5 shrink-0">
                                            <button
                                              type="button"
                                              disabled={idx === 0}
                                              onClick={() => moveStdRow(idx, 'up')}
                                              title="Move Row Up"
                                              className="p-0.5 rounded hover:bg-slate-100 disabled:opacity-30 text-slate-500 cursor-pointer"
                                            >
                                              <ArrowUp className="w-2.5 h-2.5" />
                                            </button>
                                            <button
                                              type="button"
                                              disabled={idx === currentStdOrder.length - 1}
                                              onClick={() => moveStdRow(idx, 'down')}
                                              title="Move Row Down"
                                              className="p-0.5 rounded hover:bg-slate-100 disabled:opacity-30 text-slate-500 cursor-pointer"
                                            >
                                              <ArrowDown className="w-2.5 h-2.5" />
                                            </button>
                                          </div>
                                          <input
                                            type="text"
                                            value={lbls[key] ?? meta.defaultLabel}
                                            onChange={(e) =>
                                              handleUpdateBlockConfig('totals', {
                                                fieldLabels: { ...lbls, [key]: e.target.value }
                                              })
                                            }
                                            className="flex-1 min-w-0 px-1.5 py-0.5 rounded border border-slate-200 text-[10.5px] font-medium text-slate-700"
                                          />
                                          <span className="font-mono text-[10px] font-semibold text-slate-600 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200 shrink-0">
                                            {meta.formattedAmount}
                                          </span>
                                        </div>
                                      );
                                    })}

                                    {/* Grand Total Row */}
                                    <div className="flex items-center gap-1.5 bg-blue-50/60 p-1.5 rounded-lg border border-blue-200">
                                      <input
                                        type="checkbox"
                                        checked={vis.grand_total !== false}
                                        onChange={(e) =>
                                          handleUpdateBlockConfig('totals', {
                                            visibleFields: { ...vis, grand_total: e.target.checked }
                                          })
                                        }
                                        className="rounded border-slate-300 text-blue-600 cursor-pointer shrink-0"
                                      />
                                      <input
                                        type="text"
                                        value={lbls.grand_total ?? 'GRAND TOTAL:'}
                                        onChange={(e) =>
                                          handleUpdateBlockConfig('totals', {
                                            fieldLabels: { ...lbls, grand_total: e.target.value }
                                          })
                                        }
                                        className="flex-1 min-w-0 px-1.5 py-0.5 rounded border border-blue-200 bg-white text-[10.5px] font-bold text-slate-900"
                                      />
                                      <span className="font-mono text-[10.5px] font-bold text-blue-900 bg-white px-1.5 py-0.5 rounded border border-blue-200 shrink-0">
                                        {liveQuotation.currency}{' '}
                                        {financialTotals.grand_total.toLocaleString('en-US', {
                                          minimumFractionDigits: 2,
                                          maximumFractionDigits: 2
                                        })}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })()}

                              {/* Amount in Words Toggle */}
                              <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                                <div>
                                  <span className="font-semibold text-slate-800 text-xs block">
                                    Show Amount in Words (Legal Phrasing)
                                  </span>
                                  <span className="text-[10.5px] text-slate-500">
                                    Formal legal spelling of Grand Total
                                  </span>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-2">
                                  <input
                                    type="checkbox"
                                    checked={amountInWordsEnabled}
                                    onChange={(e) => setAmountInWordsEnabled(e.target.checked)}
                                    className="sr-only peer"
                                  />
                                  <div className="w-9 h-5 bg-slate-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                                </label>
                              </div>

                              {/* Custom Financial Rows (Reorderable, Enable/Disable, Highlight, Above/Below Grand Total) */}
                              <div className="p-2.5 rounded-lg bg-white border border-slate-200 space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10.5px] font-semibold text-slate-700">
                                    Custom Financial Rows (Discounts / Fees / Notes)
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const nextRow = {
                                        id: `tot_row_${Date.now()}`,
                                        label: 'Packing & Documentation:',
                                        value: 'Included',
                                        enabled: true,
                                        isHighlight: false,
                                        position: 'above_grand_total' as const
                                      };
                                      handleUpdateBlockConfig('totals', {
                                        customRows: [...(selectedBlock.customRows || []), nextRow]
                                      });
                                    }}
                                    className="text-[10px] font-semibold text-blue-600 hover:underline flex items-center gap-0.5 cursor-pointer"
                                  >
                                    <Plus className="w-3 h-3" />
                                    <span>Add Row</span>
                                  </button>
                                </div>
                                {(selectedBlock.customRows || []).map((row, rIdx) => {
                                  const rowsArr = selectedBlock.customRows || [];
                                  const moveCustomRow = (dir: 'up' | 'down') => {
                                    const swapIdx = dir === 'up' ? rIdx - 1 : rIdx + 1;
                                    if (swapIdx < 0 || swapIdx >= rowsArr.length) return;
                                    const updated = [...rowsArr];
                                    const temp = updated[rIdx];
                                    updated[rIdx] = updated[swapIdx];
                                    updated[swapIdx] = temp;
                                    handleUpdateBlockConfig('totals', { customRows: updated });
                                  };
                                  return (
                                    <div
                                      key={row.id || rIdx}
                                      className={`space-y-1.5 p-2 rounded-lg border ${
                                        row.isHighlight
                                          ? 'bg-amber-50/70 border-amber-300'
                                          : 'bg-slate-50 border-slate-200'
                                      }`}
                                    >
                                      <div className="flex items-center gap-1">
                                        <input
                                          type="checkbox"
                                          checked={row.enabled !== false}
                                          onChange={(e) => {
                                            const updated = rowsArr.map((item, i) =>
                                              i === rIdx ? { ...item, enabled: e.target.checked } : item
                                            );
                                            handleUpdateBlockConfig('totals', { customRows: updated });
                                          }}
                                          title="Enable / Disable Row"
                                          className="rounded border-slate-300 text-blue-600 cursor-pointer shrink-0"
                                        />
                                        <div className="flex flex-col gap-0.5 shrink-0">
                                          <button
                                            type="button"
                                            disabled={rIdx === 0}
                                            onClick={() => moveCustomRow('up')}
                                            title="Move Custom Row Up"
                                            className="p-0.5 rounded hover:bg-slate-200 disabled:opacity-30 text-slate-500 cursor-pointer"
                                          >
                                            <ArrowUp className="w-2.5 h-2.5" />
                                          </button>
                                          <button
                                            type="button"
                                            disabled={rIdx === rowsArr.length - 1}
                                            onClick={() => moveCustomRow('down')}
                                            title="Move Custom Row Down"
                                            className="p-0.5 rounded hover:bg-slate-200 disabled:opacity-30 text-slate-500 cursor-pointer"
                                          >
                                            <ArrowDown className="w-2.5 h-2.5" />
                                          </button>
                                        </div>
                                        <input
                                          type="text"
                                          value={row.label ?? ''}
                                          onChange={(e) => {
                                            const updated = rowsArr.map((item, i) =>
                                              i === rIdx ? { ...item, label: e.target.value } : item
                                            );
                                            handleUpdateBlockConfig('totals', { customRows: updated });
                                          }}
                                          placeholder="Label"
                                          className="w-28 px-1.5 py-0.5 rounded border border-slate-300 bg-white text-[10px] text-slate-700"
                                        />
                                        <div className="flex-1 min-w-0">
                                          <AtMentionInput
                                            value={row.value ?? ''}
                                            onChange={(val) => {
                                              const updated = rowsArr.map((item, i) =>
                                                i === rIdx ? { ...item, value: val } : item
                                              );
                                              handleUpdateBlockConfig('totals', { customRows: updated });
                                            }}
                                            tokenContext={studioTokenContext}
                                            compact
                                            placeholder="Value or @tag"
                                            className="w-full px-1.5 py-0.5 rounded border border-slate-300 bg-white text-[10px] text-slate-800"
                                          />
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const updated = rowsArr.filter((_, i) => i !== rIdx);
                                            handleUpdateBlockConfig('totals', { customRows: updated });
                                          }}
                                          className="p-1 text-rose-500 hover:bg-rose-50 rounded cursor-pointer shrink-0"
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                      </div>

                                      {/* Row Placement & Style Controls */}
                                      <div className="flex items-center justify-between gap-1.5 pl-5">
                                        <div className="flex items-center gap-1">
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const updated = rowsArr.map((item, i) =>
                                                i === rIdx
                                                  ? { ...item, isHighlight: !item.isHighlight }
                                                  : item
                                              );
                                              handleUpdateBlockConfig('totals', { customRows: updated });
                                            }}
                                            className={`px-1.5 py-0.5 rounded text-[9px] font-semibold border cursor-pointer ${
                                              row.isHighlight
                                                ? 'bg-amber-100 border-amber-400 text-amber-900'
                                                : 'bg-white border-slate-200 text-slate-500 hover:text-slate-800'
                                            }`}
                                          >
                                            ★ Bold / Highlight
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const updated = rowsArr.map((item, i) =>
                                                i === rIdx
                                                  ? { ...item, hideIfEmpty: !item.hideIfEmpty }
                                                  : item
                                              );
                                              handleUpdateBlockConfig('totals', { customRows: updated });
                                            }}
                                            title={
                                              row.hideIfEmpty
                                                ? 'Row auto-hides when @tag is empty/omitted'
                                                : 'Row shows — dash when @tag is empty/omitted'
                                            }
                                            className={`px-1.5 py-0.5 rounded text-[9px] font-mono border cursor-pointer ${
                                              row.hideIfEmpty
                                                ? 'bg-amber-50 border-amber-300 text-amber-800 font-semibold'
                                                : 'bg-white border-slate-200 text-slate-400 hover:text-slate-700'
                                            }`}
                                          >
                                            {row.hideIfEmpty ? 'Hide ∅' : 'Show —'}
                                          </button>
                                        </div>

                                        <select
                                          value={row.position || 'above_grand_total'}
                                          onChange={(e) => {
                                            const nextPos = e.target.value as
                                              | 'above_grand_total'
                                              | 'below_grand_total';
                                            const updated = rowsArr.map((item, i) =>
                                              i === rIdx ? { ...item, position: nextPos } : item
                                            );
                                            handleUpdateBlockConfig('totals', { customRows: updated });
                                          }}
                                          className="text-[9.5px] font-medium bg-white border border-slate-200 rounded px-1.5 py-0.5 text-slate-700 cursor-pointer"
                                        >
                                          <option value="above_grand_total">Above Grand Total</option>
                                          <option value="below_grand_total">Below Grand Total</option>
                                        </select>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Customer Acceptance Block Specific Options */}
                          {selectedBlock.id === 'acceptance' && (
                            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 space-y-3">
                              <div>
                                <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                                  Signature Slots Layout
                                </label>
                                <div className="grid grid-cols-3 gap-1">
                                  {[
                                    { id: 'row_4col' as const, label: '4-Col Row' },
                                    { id: 'grid_2x2' as const, label: '2x2 Grid' },
                                    { id: 'compact' as const, label: 'Compact' }
                                  ].map((mode) => {
                                    const active = (selectedBlock.acceptanceLayout || 'row_4col') === mode.id;
                                    return (
                                      <button
                                        key={mode.id}
                                        type="button"
                                        onClick={() =>
                                          handleUpdateBlockConfig('acceptance', {
                                            acceptanceLayout: mode.id
                                          })
                                        }
                                        className={`py-1.5 px-1.5 rounded-lg text-[10px] font-semibold transition cursor-pointer ${
                                          active
                                            ? 'bg-blue-600 text-white shadow-2xs'
                                            : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                                        }`}
                                      >
                                        {mode.label}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>

                              {/* Acceptance Statement Text Override */}
                              <div className="p-2 rounded-lg bg-white border border-slate-200 space-y-1.5">
                                <label className="flex items-center justify-between cursor-pointer">
                                  <span className="text-[10.5px] font-semibold text-slate-700">
                                    Show Legal Acceptance Statement
                                  </span>
                                  <input
                                    type="checkbox"
                                    checked={(selectedBlock.visibleFields || {}).statement !== false}
                                    onChange={(e) =>
                                      handleUpdateBlockConfig('acceptance', {
                                        visibleFields: {
                                          ...(selectedBlock.visibleFields || {}),
                                          statement: e.target.checked
                                        }
                                      })
                                    }
                                    className="rounded border-slate-300 text-blue-600 cursor-pointer"
                                  />
                                </label>
                                {(selectedBlock.visibleFields || {}).statement !== false && (
                                  <AtMentionTextarea
                                    rows={2}
                                    value={selectedBlock.acceptanceStatementOverride ?? ''}
                                    onChange={(val) =>
                                      handleUpdateBlockConfig('acceptance', {
                                        acceptanceStatementOverride: val
                                      })
                                    }
                                    tokenContext={studioTokenContext}
                                    compact
                                    placeholder="We hereby accept the above commercial offer... Type @ for tags"
                                    className="w-full px-2 py-1 rounded border border-slate-300 bg-slate-50/60 focus:bg-white text-[10.5px] text-slate-800"
                                  />
                                )}
                              </div>

                              {/* Toggleable & Renameable Acceptance Signature Slots */}
                              {(() => {
                                const vis = selectedBlock.visibleFields || {};
                                const lbls = selectedBlock.fieldLabels || {};
                                const slots = [
                                  { key: 'signature', defaultLabel: 'Authorized Signature', defOn: true },
                                  { key: 'name', defaultLabel: 'Signatory Name', defOn: true },
                                  { key: 'title', defaultLabel: 'Title / Designation', defOn: false },
                                  { key: 'po_number', defaultLabel: 'PO Number', defOn: true },
                                  { key: 'date', defaultLabel: 'Date', defOn: true },
                                  { key: 'stamp', defaultLabel: 'Company Stamp / Seal', defOn: false }
                                ];
                                return (
                                  <div className="space-y-1.5">
                                    <span className="text-[10.5px] font-bold text-slate-700 block">
                                      Acceptance Fields &amp; Labels
                                    </span>
                                    {slots.map((slot) => {
                                      const isOn =
                                        vis[slot.key] !== undefined ? vis[slot.key] : slot.defOn;
                                      return (
                                        <div
                                          key={slot.key}
                                          className="flex items-center gap-1.5 bg-white p-1.5 rounded-lg border border-slate-200"
                                        >
                                          <input
                                            type="checkbox"
                                            checked={isOn}
                                            onChange={(e) =>
                                              handleUpdateBlockConfig('acceptance', {
                                                visibleFields: { ...vis, [slot.key]: e.target.checked }
                                              })
                                            }
                                            className="rounded border-slate-300 text-blue-600 cursor-pointer shrink-0"
                                          />
                                          <input
                                            type="text"
                                            value={lbls[slot.key] ?? slot.defaultLabel}
                                            onChange={(e) =>
                                              handleUpdateBlockConfig('acceptance', {
                                                fieldLabels: { ...lbls, [slot.key]: e.target.value }
                                              })
                                            }
                                            className="flex-1 min-w-0 px-1.5 py-0.5 rounded border border-slate-200 text-[10.5px] font-medium text-slate-700"
                                          />
                                        </div>
                                      );
                                    })}
                                  </div>
                                );
                              })()}

                              {/* Custom Acceptance Slots */}
                              <div className="p-2 rounded-lg bg-white border border-slate-200 space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10.5px] font-semibold text-slate-700">
                                    Custom Acceptance Slots
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const nextRow = {
                                        id: `acc_slot_${Date.now()}`,
                                        label: 'Project Code / Ref',
                                        value: '',
                                        enabled: true
                                      };
                                      handleUpdateBlockConfig('acceptance', {
                                        customRows: [...(selectedBlock.customRows || []), nextRow]
                                      });
                                    }}
                                    className="text-[10px] font-semibold text-blue-600 hover:underline flex items-center gap-0.5 cursor-pointer"
                                  >
                                    <Plus className="w-3 h-3" />
                                    <span>Add Slot</span>
                                  </button>
                                </div>
                                {(selectedBlock.customRows || []).map((row, rIdx) => (
                                  <div
                                    key={row.id || rIdx}
                                    className="flex items-center gap-1 bg-slate-50 p-1.5 rounded border border-slate-200"
                                  >
                                    <div className="flex-1 min-w-0">
                                      <AtMentionInput
                                        value={row.label ?? ''}
                                        onChange={(val) => {
                                          const updated = (selectedBlock.customRows || []).map((item, i) =>
                                            i === rIdx ? { ...item, label: val } : item
                                          );
                                          handleUpdateBlockConfig('acceptance', { customRows: updated });
                                        }}
                                        tokenContext={studioTokenContext}
                                        compact
                                        placeholder="Slot Label or @tag"
                                        className="w-full px-1.5 py-0.5 rounded border border-slate-300 bg-white text-[10px] text-slate-700"
                                      />
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const updated = (selectedBlock.customRows || []).filter(
                                          (_, i) => i !== rIdx
                                        );
                                        handleUpdateBlockConfig('acceptance', { customRows: updated });
                                      }}
                                      className="p-1 text-rose-500 hover:bg-rose-50 rounded cursor-pointer shrink-0"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Signatory Block Specific Options */}
                          {selectedBlock.id === 'signatory' && (
                            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 space-y-3">
                              {/* Direct Signatory Mode & Primary/Secondary Identity Editor */}
                              <div className="p-2.5 rounded-lg bg-white border border-slate-200 space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-[11px] font-bold text-slate-800">
                                    Signatory Identity &amp; Mode
                                  </span>
                                  <div className="grid grid-cols-2 gap-1 bg-slate-100 p-0.5 rounded-md">
                                    {[
                                      { id: 'single' as const, label: 'Single' },
                                      { id: 'dual' as const, label: 'Dual (2)' }
                                    ].map((m) => {
                                      const active = signatoryType === m.id;
                                      return (
                                        <button
                                          key={m.id}
                                          type="button"
                                          onClick={() => {
                                            setSignatoryType(m.id);
                                            setSignatoryMode(m.id);
                                          }}
                                          className={`px-2 py-0.5 rounded text-[9.5px] font-semibold transition cursor-pointer ${
                                            active
                                              ? 'bg-blue-600 text-white shadow-2xs'
                                              : 'text-slate-600 hover:text-slate-900'
                                          }`}
                                        >
                                          {m.label}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 gap-1.5">
                                  <div>
                                    <label className="block text-[9.5px] font-semibold text-slate-500 mb-0.5">
                                      Primary Signatory Name
                                    </label>
                                    <input
                                      type="text"
                                      value={signatoryName}
                                      onChange={(e) => setSignatoryName(e.target.value)}
                                      placeholder="Full Name"
                                      className="w-full px-2 py-1 rounded border border-slate-300 text-[11px] text-slate-800"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[9.5px] font-semibold text-slate-500 mb-0.5">
                                      Primary Title / Role
                                    </label>
                                    <input
                                      type="text"
                                      value={signatoryTitle}
                                      onChange={(e) => setSignatoryTitle(e.target.value)}
                                      placeholder="Account Manager"
                                      className="w-full px-2 py-1 rounded border border-slate-300 text-[11px] text-slate-800"
                                    />
                                  </div>
                                </div>

                                {signatoryType === 'dual' && (
                                  <div className="grid grid-cols-2 gap-1.5 pt-1.5 border-t border-slate-100">
                                    <div>
                                      <label className="block text-[9.5px] font-semibold text-slate-500 mb-0.5">
                                        Secondary Signatory Name
                                      </label>
                                      <input
                                        type="text"
                                        value={secondarySignatoryName}
                                        onChange={(e) => setSecondarySignatoryName(e.target.value)}
                                        placeholder="Authorized Director"
                                        className="w-full px-2 py-1 rounded border border-slate-300 text-[11px] text-slate-800"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-[9.5px] font-semibold text-slate-500 mb-0.5">
                                        Secondary Title / Role
                                      </label>
                                      <input
                                        type="text"
                                        value={secondarySignatoryTitle}
                                        onChange={(e) => setSecondarySignatoryTitle(e.target.value)}
                                        placeholder="Commercial Approver"
                                        className="w-full px-2 py-1 rounded border border-slate-300 text-[11px] text-slate-800"
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center justify-between">
                                <div>
                                  <span className="font-semibold text-slate-800 text-xs block">
                                    Show Company Seal / Stamp
                                  </span>
                                  <span className="text-[10.5px] text-slate-500">
                                    Render official stamp image or dashed seal box inside signatory card
                                  </span>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-2">
                                  <input
                                    type="checkbox"
                                    checked={showCompanySeal}
                                    onChange={(e) => setShowCompanySeal(e.target.checked)}
                                    className="sr-only peer"
                                  />
                                  <div className="w-9 h-5 bg-slate-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                                </label>
                              </div>

                              {/* Company Seal / Stamp Image Uploader inside Right Inspector */}
                              <div className="pt-2 border-t border-slate-200/80 space-y-2">
                                <button
                                  type="button"
                                  onClick={() => sealFileInputRef.current?.click()}
                                  className="w-full py-1.5 px-3 rounded-lg bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 font-semibold text-[11px] flex items-center justify-center gap-1.5 transition cursor-pointer shadow-2xs"
                                >
                                  <Upload className="w-3.5 h-3.5" />
                                  <span>Upload Stamp / Seal Image</span>
                                </button>

                                {companySealUrl && (
                                  <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-white border border-slate-200">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <img
                                        src={companySealUrl}
                                        alt="Stamp Preview"
                                        className="h-12 w-12 object-contain border border-slate-200 rounded bg-white p-1 shrink-0"
                                      />
                                      <span className="text-[10.5px] text-slate-600 font-medium truncate">
                                        Stamp Image Active
                                      </span>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setCompanySealUrl('');
                                        setFooterConfig((prev) => ({ ...prev, companySealUrl: '' }));
                                      }}
                                      className="px-2 py-1 rounded-md text-[10px] font-semibold text-rose-600 hover:bg-rose-50 border border-rose-200 transition cursor-pointer shrink-0 flex items-center gap-1"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                      <span>Remove</span>
                                    </button>
                                  </div>
                                )}
                              </div>

                              <div>
                                <label className="block text-slate-600 font-medium text-[11px] mb-1">
                                  Signature Style
                                </label>
                                <select
                                  value={signatureStyle}
                                  onChange={(e) => setSignatureStyle(e.target.value as QuotationSignatureStyle)}
                                  className="w-full rounded-lg border border-slate-300 p-2 bg-white text-slate-800 text-xs font-medium"
                                >
                                  <option value="script">Script (Cursive Autopen)</option>
                                  <option value="line">Blank Line (For Wet Signature &amp; Stamp)</option>
                                  <option value="image">Digital Image / Box</option>
                                </select>
                              </div>

                              <div className="space-y-2">
                                <button
                                  type="button"
                                  onClick={() => signatureFileInputRef.current?.click()}
                                  className="w-full py-1.5 px-3 rounded-lg bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 font-semibold text-[11px] flex items-center justify-center gap-1.5 transition cursor-pointer shadow-2xs"
                                >
                                  <Upload className="w-3.5 h-3.5" />
                                  <span>Upload Signature Image</span>
                                </button>

                                {signatureImageUrl && (
                                  <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-white border border-slate-200">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <img
                                        src={signatureImageUrl}
                                        alt="Signature Preview"
                                        className="h-10 w-20 object-contain border border-slate-200 rounded bg-white p-1 shrink-0"
                                      />
                                      <span className="text-[10.5px] text-slate-600 font-medium truncate">
                                        Signature Active
                                      </span>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSignatureImageUrl('');
                                        setFooterConfig((prev) => ({ ...prev, signatureImageUrl: '' }));
                                      }}
                                      className="px-2 py-1 rounded-md text-[10px] font-semibold text-rose-600 hover:bg-rose-50 border border-rose-200 transition cursor-pointer shrink-0 flex items-center gap-1"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                      <span>Remove</span>
                                    </button>
                                  </div>
                                )}
                              </div>

                              {/* MS Word "In Front of Text" Free-Floating Overlay Controls */}
                              {(() => {
                                const overlay = resolveStampSignatureOverlayConfig(footerConfig);
                                return (
                                  <div className="pt-2.5 border-t border-slate-200 space-y-2.5">
                                    <div className="flex items-center justify-between">
                                      <span className="text-[11px] font-bold text-slate-800 flex items-center gap-1">
                                        <Layers className="w-3.5 h-3.5 text-blue-600" />
                                        Stamp &amp; Signature Position
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setFooterConfig((prev) => ({
                                            ...prev,
                                            stampSignatureOverlapMode: 'side_by_side',
                                            sealSizePx: 96,
                                            sealRotationDeg: 0,
                                            sealOffsetX: 0,
                                            sealOffsetY: 0,
                                            signatureSizePx: 56,
                                            signatureRotationDeg: 0,
                                            signatureOffsetX: 0,
                                            signatureOffsetY: 0,
                                            inkMultiplyBlend: true
                                          }))
                                        }
                                        className="text-[10px] text-blue-600 hover:underline font-semibold cursor-pointer"
                                      >
                                        Reset Position
                                      </button>
                                    </div>

                                    {/* Overlap Preset Selector */}
                                    <div className="grid grid-cols-3 gap-1">
                                      {[
                                        { id: 'side_by_side' as const, label: 'Side-by-Side' },
                                        { id: 'realistic_overlap' as const, label: 'Overlap Seal' },
                                        { id: 'stamp_over_name' as const, label: 'Over Name' }
                                      ].map((mode) => {
                                        const active = overlay.stampSignatureOverlapMode === mode.id;
                                        return (
                                          <button
                                            key={mode.id}
                                            type="button"
                                            onClick={() =>
                                              setFooterConfig((prev) => ({
                                                ...prev,
                                                stampSignatureOverlapMode: mode.id
                                              }))
                                            }
                                            className={`py-1.5 px-1 rounded-lg text-[10px] font-semibold transition cursor-pointer ${
                                              active
                                                ? 'bg-blue-600 text-white shadow-2xs'
                                                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                                            }`}
                                          >
                                            {mode.label}
                                          </button>
                                        );
                                      })}
                                    </div>

                                    {/* Stamp Size, Rotation & X/Y Nudge */}
                                    <div
                                      id="inspector-target-stamp"
                                      className={`p-2 rounded-lg bg-white border space-y-1.5 transition-all duration-300 ${
                                        highlightedInspectorTarget === 'stamp'
                                          ? 'ring-2 ring-blue-500 border-blue-400 bg-blue-50/40'
                                          : 'border-slate-200'
                                      }`}
                                    >
                                      <div className="flex justify-between text-[10px] font-semibold text-slate-700">
                                        <span>Stamp Size &amp; Angle</span>
                                        <span className="font-mono text-blue-700">
                                          {overlay.sealSizePx}px • {overlay.sealRotationDeg}°
                                        </span>
                                      </div>
                                      <div className="grid grid-cols-2 gap-2">
                                        <div>
                                          <span className="text-[9px] text-slate-400 block">Size (60–180px)</span>
                                          <input
                                            type="range"
                                            min={60}
                                            max={180}
                                            step={4}
                                            value={overlay.sealSizePx}
                                            onChange={(e) =>
                                              setFooterConfig((prev) => ({
                                                ...prev,
                                                sealSizePx: Number(e.target.value)
                                              }))
                                            }
                                            className="w-full accent-blue-600 cursor-pointer"
                                          />
                                        </div>
                                        <div>
                                          <span className="text-[9px] text-slate-400 block">Tilt (-35° to +35°)</span>
                                          <input
                                            type="range"
                                            min={-35}
                                            max={35}
                                            step={1}
                                            value={overlay.sealRotationDeg}
                                            onChange={(e) =>
                                              setFooterConfig((prev) => ({
                                                ...prev,
                                                sealRotationDeg: Number(e.target.value)
                                              }))
                                            }
                                            className="w-full accent-blue-600 cursor-pointer"
                                          />
                                        </div>
                                      </div>
                                      <div className="grid grid-cols-2 gap-2">
                                        <div>
                                          <span className="text-[9px] text-slate-400 block">
                                            Stamp X ({overlay.sealOffsetX}px)
                                          </span>
                                          <input
                                            type="range"
                                            min={-120}
                                            max={120}
                                            step={4}
                                            value={overlay.sealOffsetX}
                                            onChange={(e) =>
                                              setFooterConfig((prev) => ({
                                                ...prev,
                                                sealOffsetX: Number(e.target.value)
                                              }))
                                            }
                                            className="w-full accent-blue-600 cursor-pointer"
                                          />
                                        </div>
                                        <div>
                                          <span className="text-[9px] text-slate-400 block">
                                            Stamp Y ({overlay.sealOffsetY}px)
                                          </span>
                                          <input
                                            type="range"
                                            min={-80}
                                            max={80}
                                            step={4}
                                            value={overlay.sealOffsetY}
                                            onChange={(e) =>
                                              setFooterConfig((prev) => ({
                                                ...prev,
                                                sealOffsetY: Number(e.target.value)
                                              }))
                                            }
                                            className="w-full accent-blue-600 cursor-pointer"
                                          />
                                        </div>
                                      </div>
                                    </div>

                                    {/* Signature Size, Rotation & X/Y Nudge */}
                                    <div
                                      id="inspector-target-signature"
                                      className={`p-2 rounded-lg bg-white border space-y-1.5 transition-all duration-300 ${
                                        highlightedInspectorTarget === 'signature'
                                          ? 'ring-2 ring-blue-500 border-blue-400 bg-blue-50/40'
                                          : 'border-slate-200'
                                      }`}
                                    >
                                      <div className="flex justify-between text-[10px] font-semibold text-slate-700">
                                        <span>Signature Size &amp; Angle</span>
                                        <span className="font-mono text-blue-700">
                                          {overlay.signatureSizePx}px • {overlay.signatureRotationDeg}°
                                        </span>
                                      </div>
                                      <div className="grid grid-cols-2 gap-2">
                                        <div>
                                          <span className="text-[9px] text-slate-400 block">Height (32–130px)</span>
                                          <input
                                            type="range"
                                            min={32}
                                            max={130}
                                            step={2}
                                            value={overlay.signatureSizePx}
                                            onChange={(e) =>
                                              setFooterConfig((prev) => ({
                                                ...prev,
                                                signatureSizePx: Number(e.target.value)
                                              }))
                                            }
                                            className="w-full accent-blue-600 cursor-pointer"
                                          />
                                        </div>
                                        <div>
                                          <span className="text-[9px] text-slate-400 block">Tilt (-25° to +25°)</span>
                                          <input
                                            type="range"
                                            min={-25}
                                            max={25}
                                            step={1}
                                            value={overlay.signatureRotationDeg}
                                            onChange={(e) =>
                                              setFooterConfig((prev) => ({
                                                ...prev,
                                                signatureRotationDeg: Number(e.target.value)
                                              }))
                                            }
                                            className="w-full accent-blue-600 cursor-pointer"
                                          />
                                        </div>
                                      </div>
                                      <div className="grid grid-cols-2 gap-2">
                                        <div>
                                          <span className="text-[9px] text-slate-400 block">
                                            Sig X ({overlay.signatureOffsetX}px)
                                          </span>
                                          <input
                                            type="range"
                                            min={-120}
                                            max={120}
                                            step={4}
                                            value={overlay.signatureOffsetX}
                                            onChange={(e) =>
                                              setFooterConfig((prev) => ({
                                                ...prev,
                                                signatureOffsetX: Number(e.target.value)
                                              }))
                                            }
                                            className="w-full accent-blue-600 cursor-pointer"
                                          />
                                        </div>
                                        <div>
                                          <span className="text-[9px] text-slate-400 block">
                                            Sig Y ({overlay.signatureOffsetY}px)
                                          </span>
                                          <input
                                            type="range"
                                            min={-80}
                                            max={80}
                                            step={4}
                                            value={overlay.signatureOffsetY}
                                            onChange={(e) =>
                                              setFooterConfig((prev) => ({
                                                ...prev,
                                                signatureOffsetY: Number(e.target.value)
                                              }))
                                            }
                                            className="w-full accent-blue-600 cursor-pointer"
                                          />
                                        </div>
                                      </div>
                                    </div>

                                    {/* Realistic Ink Multiply Blend Toggle */}
                                    <label className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 cursor-pointer">
                                      <span className="text-[10.5px] font-medium text-slate-700">
                                        Blend Stamp Like Real Ink
                                      </span>
                                      <input
                                        type="checkbox"
                                        checked={overlay.inkMultiplyBlend}
                                        onChange={(e) =>
                                          setFooterConfig((prev) => ({
                                            ...prev,
                                            inkMultiplyBlend: e.target.checked
                                          }))
                                        }
                                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                      />
                                    </label>
                                  </div>
                                );
                              })()}

                              {/* Alignment, Spacing & Signature Line Controls */}
                              <div className="pt-2.5 border-t border-slate-200 space-y-2.5">
                                <span className="text-[11px] font-bold text-slate-800 block">
                                  Signature Area Alignment &amp; Spacing
                                </span>

                                {/* Horizontal Block Alignment */}
                                <div>
                                  <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                                    Signatory Block Alignment
                                  </label>
                                  <div className="grid grid-cols-4 gap-1">
                                    {[
                                      { id: 'left' as const, label: 'Left' },
                                      { id: 'center' as const, label: 'Center' },
                                      { id: 'right' as const, label: 'Right' },
                                      { id: 'space_between' as const, label: 'Spread' }
                                    ].map((opt) => {
                                      const active = (footerConfig.signatoryBlockAlign || 'space_between') === opt.id;
                                      return (
                                        <button
                                          key={opt.id}
                                          type="button"
                                          onClick={() =>
                                            setFooterConfig((prev) => ({
                                              ...prev,
                                              signatoryBlockAlign: opt.id
                                            }))
                                          }
                                          className={`py-1 px-1.5 rounded-md text-[10px] font-semibold transition cursor-pointer ${
                                            active
                                              ? 'bg-blue-600 text-white shadow-2xs'
                                              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                                          }`}
                                        >
                                          {opt.label}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>

                                {/* Signatory Text Alignment & Stamp Placement */}
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                                      Text Alignment
                                    </label>
                                    <div className="grid grid-cols-3 gap-1">
                                      {[
                                        { id: 'left' as const, label: 'Left' },
                                        { id: 'center' as const, label: 'Center' },
                                        { id: 'right' as const, label: 'Right' }
                                      ].map((opt) => {
                                        const active = (footerConfig.signatoryTextAlign || 'left') === opt.id;
                                        return (
                                          <button
                                            key={opt.id}
                                            type="button"
                                            onClick={() =>
                                              setFooterConfig((prev) => ({
                                                ...prev,
                                                signatoryTextAlign: opt.id
                                              }))
                                            }
                                            className={`py-1 rounded-md text-[10px] font-semibold transition cursor-pointer ${
                                              active
                                                ? 'bg-blue-600 text-white'
                                                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                                            }`}
                                          >
                                            {opt.label}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>

                                  <div>
                                    <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                                      Stamp Placement
                                    </label>
                                    <select
                                      value={footerConfig.stampPlacement || 'right'}
                                      onChange={(e) =>
                                        setFooterConfig((prev) => ({
                                          ...prev,
                                          stampPlacement: e.target.value as any
                                        }))
                                      }
                                      className="w-full rounded-md border border-slate-200 py-1 px-1.5 bg-white text-[10.5px] font-semibold text-slate-700"
                                    >
                                      <option value="right">Right of Signature</option>
                                      <option value="left">Left of Signature</option>
                                      <option value="center">Centered</option>
                                      <option value="overlay">Overlay on Signature</option>
                                    </select>
                                  </div>
                                </div>

                                {/* Vertical Spacing & Signature Line Width */}
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                                      Vertical Spacing
                                    </label>
                                    <select
                                      value={footerConfig.signatureVerticalSpacing || 'standard'}
                                      onChange={(e) =>
                                        setFooterConfig((prev) => ({
                                          ...prev,
                                          signatureVerticalSpacing: e.target.value as any
                                        }))
                                      }
                                      className="w-full rounded-md border border-slate-200 py-1 px-1.5 bg-white text-[10.5px] font-semibold text-slate-700"
                                    >
                                      <option value="compact">Compact</option>
                                      <option value="standard">Standard</option>
                                      <option value="spacious">Spacious</option>
                                    </select>
                                  </div>

                                  <div>
                                    <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                                      Signature Line Width
                                    </label>
                                    <select
                                      value={footerConfig.signatureLineWidth || 'standard'}
                                      onChange={(e) =>
                                        setFooterConfig((prev) => ({
                                          ...prev,
                                          signatureLineWidth: e.target.value as any
                                        }))
                                      }
                                      className="w-full rounded-md border border-slate-200 py-1 px-1.5 bg-white text-[10.5px] font-semibold text-slate-700"
                                    >
                                      <option value="narrow">Narrow (160px)</option>
                                      <option value="standard">Standard (220px)</option>
                                      <option value="wide">Full Width</option>
                                      <option value="none">No Line</option>
                                    </select>
                                  </div>
                                </div>
                              </div>

                              {/* Signatory Custom Details, Line Order & Contact Info */}
                              <div className="pt-2.5 border-t border-slate-200 space-y-2.5">
                                <div className="flex items-center justify-between">
                                  <span className="text-[11px] font-bold text-slate-800">
                                    Signatory Details &amp; Formatting
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const ownerName = resolveRepFullName(
                                        salespersonName ||
                                          enquiry?.sales_representative ||
                                          enquiry?.salesperson ||
                                          user?.displayName ||
                                          user?.name
                                      );
                                      const ownerEmail =
                                        (enquiry as any)?.salesperson_email ||
                                        user?.email ||
                                        activeProfile?.official_email ||
                                        '';
                                      const ownerPhone =
                                        (enquiry as any)?.salesperson_phone ||
                                        (user as any)?.phone ||
                                        activeProfile?.contact_phone ||
                                        '';
                                      if (ownerName) setSignatoryName(ownerName);
                                      setFooterConfig((prev) => ({
                                        ...prev,
                                        showSignatoryPhone: Boolean(ownerPhone) || prev.showSignatoryPhone,
                                        signatoryPhone: ownerPhone || prev.signatoryPhone || '',
                                        showSignatoryEmail: Boolean(ownerEmail) || prev.showSignatoryEmail,
                                        signatoryEmail: ownerEmail || prev.signatoryEmail || ''
                                      }));
                                      triggerToast?.('Filled signatory details from Deal Owner.', 'success');
                                    }}
                                    className="text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition cursor-pointer"
                                  >
                                    Auto-Fill from Deal Owner
                                  </button>
                                </div>

                                {/* Contact Display Format */}
                                <div>
                                  <label className="block text-[9.5px] font-semibold text-slate-500 mb-1">
                                    Contact Detail Format
                                  </label>
                                  <div className="grid grid-cols-3 gap-1">
                                    {[
                                      { id: 'icon' as const, label: 'Icon + Text' },
                                      { id: 'label' as const, label: 'Tel: / Email:' },
                                      { id: 'plain' as const, label: 'Plain Text' }
                                    ].map((fmt) => {
                                      const active = (footerConfig.signatoryContactFormat || 'icon') === fmt.id;
                                      return (
                                        <button
                                          key={fmt.id}
                                          type="button"
                                          onClick={() =>
                                            setFooterConfig((prev) => ({
                                              ...prev,
                                              signatoryContactFormat: fmt.id
                                            }))
                                          }
                                          className={`py-1 rounded-md text-[10px] font-semibold transition cursor-pointer ${
                                            active
                                              ? 'bg-blue-600 text-white'
                                              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                                          }`}
                                        >
                                          {fmt.label}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>

                                {/* Signatory Line Order, Visibility & Font/Color Styling */}
                                {(() => {
                                  const defaultLineOrder: Array<'name' | 'title' | 'phone' | 'email' | 'custom' | 'date'> = [
                                    'name',
                                    'title',
                                    'phone',
                                    'email',
                                    'custom',
                                    'date'
                                  ];
                                  const lineOrder =
                                    footerConfig.signatoryLineOrder && footerConfig.signatoryLineOrder.length > 0
                                      ? footerConfig.signatoryLineOrder
                                      : defaultLineOrder;
                                  const visLines = footerConfig.visibleSignatoryLines || {};
                                  const lineStyles = footerConfig.signatoryLineStyles || {};

                                  const moveSigLine = (key: 'name' | 'title' | 'phone' | 'email' | 'custom' | 'date', dir: -1 | 1) => {
                                    const idx = lineOrder.indexOf(key);
                                    if (idx === -1) return;
                                    const target = idx + dir;
                                    if (target < 0 || target >= lineOrder.length) return;
                                    const copy = [...lineOrder];
                                    const [moved] = copy.splice(idx, 1);
                                    copy.splice(target, 0, moved);
                                    setFooterConfig((prev) => ({
                                      ...prev,
                                      signatoryLineOrder: copy
                                    }));
                                  };

                                  const lineLabels: Record<string, string> = {
                                    name: 'Signatory Name',
                                    title: 'Title / Designation',
                                    phone: 'Direct Phone',
                                    email: 'Email Address',
                                    custom: 'Custom Lines',
                                    date: 'Date Signed Line'
                                  };

                                  return (
                                    <div className="p-2 rounded-lg bg-white border border-slate-200 space-y-1.5">
                                      <span className="text-[10px] font-bold text-slate-700 block">
                                        Detail Line Order, Weight &amp; Color
                                      </span>
                                      {lineOrder.map((lineKey, idx) => {
                                        const isLineVisible =
                                          lineKey === 'phone'
                                            ? Boolean(footerConfig.showSignatoryPhone) && visLines.phone !== false
                                            : lineKey === 'email'
                                              ? Boolean(footerConfig.showSignatoryEmail) && visLines.email !== false
                                              : lineKey === 'date'
                                                ? Boolean(footerConfig.showDateSignedLine) && visLines.date !== false
                                                : visLines[lineKey] !== false;
                                        const st = lineStyles[lineKey] || {};
                                        return (
                                          <div
                                            key={lineKey}
                                            className="flex items-center justify-between gap-1 bg-slate-50 px-1.5 py-1 rounded border border-slate-200/80"
                                          >
                                            <label className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-700 cursor-pointer min-w-0 flex-1">
                                              <input
                                                type="checkbox"
                                                checked={isLineVisible}
                                                onChange={(e) => {
                                                  const checked = e.target.checked;
                                                  setFooterConfig((prev) => ({
                                                    ...prev,
                                                    ...(lineKey === 'phone' ? { showSignatoryPhone: checked } : {}),
                                                    ...(lineKey === 'email' ? { showSignatoryEmail: checked } : {}),
                                                    ...(lineKey === 'date' ? { showDateSignedLine: checked } : {}),
                                                    visibleSignatoryLines: {
                                                      ...(prev.visibleSignatoryLines || {}),
                                                      [lineKey]: checked
                                                    }
                                                  }));
                                                }}
                                                className="rounded border-slate-300 text-blue-600 cursor-pointer shrink-0"
                                              />
                                              <span className="truncate">{lineLabels[lineKey] || lineKey}</span>
                                            </label>

                                            <select
                                              value={st.weight || (lineKey === 'name' ? 'bold' : 'normal')}
                                              onChange={(e) =>
                                                setFooterConfig((prev) => ({
                                                  ...prev,
                                                  signatoryLineStyles: {
                                                    ...(prev.signatoryLineStyles || {}),
                                                    [lineKey]: {
                                                      ...((prev.signatoryLineStyles || {})[lineKey] || {}),
                                                      weight: e.target.value as any
                                                    }
                                                  }
                                                }))
                                              }
                                              className="rounded border border-slate-200 bg-white px-1 py-0.5 text-[9.5px] text-slate-700"
                                              title="Font Weight"
                                            >
                                              <option value="normal">Reg</option>
                                              <option value="medium">Med</option>
                                              <option value="bold">Bold</option>
                                            </select>

                                            <select
                                              value={st.color || (lineKey === 'name' ? 'default' : 'muted')}
                                              onChange={(e) =>
                                                setFooterConfig((prev) => ({
                                                  ...prev,
                                                  signatoryLineStyles: {
                                                    ...(prev.signatoryLineStyles || {}),
                                                    [lineKey]: {
                                                      ...((prev.signatoryLineStyles || {})[lineKey] || {}),
                                                      color: e.target.value as any
                                                    }
                                                  }
                                                }))
                                              }
                                              className="rounded border border-slate-200 bg-white px-1 py-0.5 text-[9.5px] text-slate-700"
                                              title="Color Emphasis"
                                            >
                                              <option value="default">Dark</option>
                                              <option value="muted">Muted</option>
                                              <option value="accent">Brand</option>
                                            </select>

                                            <div className="flex items-center shrink-0">
                                              <button
                                                type="button"
                                                disabled={idx === 0}
                                                onClick={() => moveSigLine(lineKey, -1)}
                                                className="p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                                              >
                                                <ArrowUp className="w-3 h-3" />
                                              </button>
                                              <button
                                                type="button"
                                                disabled={idx === lineOrder.length - 1}
                                                onClick={() => moveSigLine(lineKey, 1)}
                                                className="p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                                              >
                                                <ArrowDown className="w-3 h-3" />
                                              </button>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  );
                                })()}

                                {/* For and on behalf of toggle */}
                                <div className="space-y-1.5">
                                  <label className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 cursor-pointer">
                                    <span className="text-[10.5px] font-medium text-slate-700">
                                      &ldquo;For and on behalf of [Company]&rdquo;
                                    </span>
                                    <input
                                      type="checkbox"
                                      checked={Boolean(footerConfig.showForAndOnBehalf)}
                                      onChange={(e) =>
                                        setFooterConfig((prev) => ({
                                          ...prev,
                                          showForAndOnBehalf: e.target.checked
                                        }))
                                      }
                                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                    />
                                  </label>

                                  {footerConfig.showForAndOnBehalf && (
                                    <AtMentionInput
                                      value={footerConfig.forAndOnBehalfText || ''}
                                      onChange={(val) =>
                                        setFooterConfig((prev) => ({
                                          ...prev,
                                          forAndOnBehalfText: val
                                        }))
                                      }
                                      tokenContext={studioTokenContext}
                                      compact
                                      placeholder={`For and on behalf of ${
                                        headerConfig.companyNameOverride ||
                                        activeProfile?.company_name ||
                                        activeWorkspace?.company_name ||
                                        '@our_company'
                                      }`}
                                      className="w-full px-2 py-1 rounded-md border border-slate-300 bg-white text-[11px] text-slate-800"
                                    />
                                  )}
                                </div>

                                {/* Direct Phone & Email Values */}
                                <div className="grid grid-cols-2 gap-1.5">
                                  <div className="p-2 rounded-lg bg-white border border-slate-200 space-y-1">
                                    <label className="block text-[9.5px] font-semibold text-slate-500">
                                      Signatory Phone
                                    </label>
                                    <input
                                      type="text"
                                      value={footerConfig.signatoryPhone ?? activeProfile?.contact_phone ?? ''}
                                      onChange={(e) =>
                                        setFooterConfig((prev) => ({
                                          ...prev,
                                          showSignatoryPhone: true,
                                          signatoryPhone: e.target.value
                                        }))
                                      }
                                      placeholder="+971 50 000 0000"
                                      className="w-full px-2 py-1 rounded border border-slate-300 text-[10.5px] text-slate-800"
                                    />
                                  </div>

                                  <div className="p-2 rounded-lg bg-white border border-slate-200 space-y-1">
                                    <label className="block text-[9.5px] font-semibold text-slate-500">
                                      Signatory Email
                                    </label>
                                    <input
                                      type="email"
                                      value={footerConfig.signatoryEmail ?? activeProfile?.official_email ?? ''}
                                      onChange={(e) =>
                                        setFooterConfig((prev) => ({
                                          ...prev,
                                          showSignatoryEmail: true,
                                          signatoryEmail: e.target.value
                                        }))
                                      }
                                      placeholder="rep@company.com"
                                      className="w-full px-2 py-1 rounded border border-slate-300 text-[10.5px] text-slate-800"
                                    />
                                  </div>
                                </div>

                                {/* Custom Text Lines per Signatory (Department, License #, ID, etc.) */}
                                <div className="p-2 rounded-lg bg-white border border-slate-200 space-y-2">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[10.5px] font-semibold text-slate-700">
                                      Custom Signatory Lines
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const nextLine = {
                                          id: `sig_line_${Date.now()}`,
                                          label: 'Department',
                                          value: 'Commercial & Projects',
                                          enabled: true,
                                          target: 'primary' as const
                                        };
                                        setFooterConfig((prev) => ({
                                          ...prev,
                                          signatoryCustomLines: [
                                            ...(prev.signatoryCustomLines || []),
                                            nextLine
                                          ]
                                        }));
                                      }}
                                      className="text-[10px] font-semibold text-blue-600 hover:underline flex items-center gap-0.5 cursor-pointer"
                                    >
                                      <Plus className="w-3 h-3" />
                                      <span>Add Line</span>
                                    </button>
                                  </div>

                                  {(footerConfig.signatoryCustomLines || []).length === 0 ? (
                                    <p className="text-[10px] text-slate-400 italic">
                                      Add custom lines like Department, License #, or Employee ID under the signatory.
                                    </p>
                                  ) : (
                                    <div className="space-y-1.5">
                                      {(footerConfig.signatoryCustomLines || []).map((line, lIdx) => (
                                        <div
                                          key={line.id || lIdx}
                                          className="flex items-center gap-1 bg-slate-50 p-1.5 rounded border border-slate-200"
                                        >
                                          <input
                                            type="text"
                                            value={line.label ?? ''}
                                            onChange={(e) => {
                                              const val = e.target.value;
                                              setFooterConfig((prev) => ({
                                                ...prev,
                                                signatoryCustomLines: (prev.signatoryCustomLines || []).map(
                                                  (item, i) => (i === lIdx ? { ...item, label: val } : item)
                                                )
                                              }));
                                            }}
                                            placeholder="Label (opt)"
                                            className="w-20 px-1.5 py-0.5 rounded border border-slate-300 bg-white text-[10px] text-slate-700"
                                          />
                                          <div className="flex-1 min-w-0">
                                            <AtMentionInput
                                              value={line.value ?? ''}
                                              onChange={(val) => {
                                                setFooterConfig((prev) => ({
                                                  ...prev,
                                                  signatoryCustomLines: (prev.signatoryCustomLines || []).map(
                                                    (item, i) => (i === lIdx ? { ...item, value: val } : item)
                                                  )
                                                }));
                                              }}
                                              tokenContext={studioTokenContext}
                                              compact
                                              placeholder="Value or @tag"
                                              className="w-full px-1.5 py-0.5 rounded border border-slate-300 bg-white text-[10px] text-slate-800"
                                            />
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setFooterConfig((prev) => ({
                                                ...prev,
                                                signatoryCustomLines: (prev.signatoryCustomLines || []).filter(
                                                  (_, i) => i !== lIdx
                                                )
                                              }))
                                            }
                                            className="p-1 text-rose-500 hover:bg-rose-50 rounded cursor-pointer shrink-0"
                                            title="Remove custom line"
                                          >
                                            <Trash2 className="w-3 h-3" />
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Remittance Block Specific Options */}
                          {selectedBlock.id === 'remittance' && (
                            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 space-y-3">
                              <div>
                                <label className="block text-slate-600 font-medium text-[11px] mb-1">
                                  Remittance Bank Account
                                </label>
                                <select
                                  value={selectedBankId}
                                  onChange={(e) => handleSelectBank(e.target.value)}
                                  className="w-full rounded-lg border border-slate-300 p-2 bg-white text-slate-800 text-xs font-medium"
                                >
                                  {bankRegistry.map((b) => {
                                    const acctLabel = b.accountNumber ? b.accountNumber : (b.iban || 'No Acct');
                                    return (
                                      <option key={b.id} value={b.id}>
                                        {b.bankName} - {acctLabel} ({b.currency})
                                      </option>
                                    );
                                  })}
                                  {bankRegistry.length === 0 && (
                                    <option value="">Default Corporate Wire Account (AED)</option>
                                  )}
                                </select>
                              </div>

                              {/* Direct Bank Wire Fields: Toggle, Reorder, Rename & Edit Values */}
                              {(() => {
                                const vis = selectedBlock.visibleFields || {};
                                const lbls = selectedBlock.fieldLabels || {};
                                const defaultOrder = [
                                  'bank_name',
                                  'beneficiary',
                                  'account_number',
                                  'iban',
                                  'swift',
                                  'branch',
                                  'currency'
                                ];
                                const activeOrder =
                                  selectedBlock.fieldOrder && selectedBlock.fieldOrder.length > 0
                                    ? selectedBlock.fieldOrder
                                    : defaultOrder;

                                const moveBankField = (key: string, dir: -1 | 1) => {
                                  const idx = activeOrder.indexOf(key);
                                  if (idx === -1) return;
                                  const target = idx + dir;
                                  if (target < 0 || target >= activeOrder.length) return;
                                  const copy = [...activeOrder];
                                  const [item] = copy.splice(idx, 1);
                                  copy.splice(target, 0, item);
                                  handleUpdateBlockConfig('remittance', { fieldOrder: copy });
                                };

                                const updateBankOverrideField = (
                                  fieldKey:
                                    | 'bankName'
                                    | 'beneficiaryName'
                                    | 'accountNumber'
                                    | 'iban'
                                    | 'swiftCode'
                                    | 'branchName',
                                  val: string
                                ) => {
                                  setCustomBankOverride((prev) => ({
                                    bankName: prev?.bankName ?? activeBankAccount?.bankName ?? '',
                                    beneficiaryName:
                                      prev?.beneficiaryName ?? activeBankAccount?.beneficiaryName ?? '',
                                    accountNumber:
                                      prev?.accountNumber ?? activeBankAccount?.accountNumber ?? '',
                                    iban: prev?.iban ?? activeBankAccount?.iban ?? '',
                                    swiftCode: prev?.swiftCode ?? activeBankAccount?.swiftCode ?? '',
                                    branchName: prev?.branchName ?? activeBankAccount?.branchName ?? '',
                                    [fieldKey]: val
                                  }));
                                };

                                const bankFieldMeta: Record<
                                  string,
                                  {
                                    defaultLabel: string;
                                    defaultOn: boolean;
                                    value: string;
                                    onChange?: (val: string) => void;
                                  }
                                > = {
                                  bank_name: {
                                    defaultLabel: 'Bank:',
                                    defaultOn: true,
                                    value: activeBankAccount?.bankName || '',
                                    onChange: (val) => updateBankOverrideField('bankName', val)
                                  },
                                  beneficiary: {
                                    defaultLabel: 'Beneficiary:',
                                    defaultOn: true,
                                    value: activeBankAccount?.beneficiaryName || '',
                                    onChange: (val) => updateBankOverrideField('beneficiaryName', val)
                                  },
                                  account_number: {
                                    defaultLabel: 'Account No:',
                                    defaultOn: true,
                                    value: activeBankAccount?.accountNumber || '',
                                    onChange: (val) => updateBankOverrideField('accountNumber', val)
                                  },
                                  iban: {
                                    defaultLabel: 'IBAN:',
                                    defaultOn: true,
                                    value: activeBankAccount?.iban || '',
                                    onChange: (val) => updateBankOverrideField('iban', val)
                                  },
                                  swift: {
                                    defaultLabel: 'SWIFT / BIC:',
                                    defaultOn: true,
                                    value: activeBankAccount?.swiftCode || '',
                                    onChange: (val) => updateBankOverrideField('swiftCode', val)
                                  },
                                  branch: {
                                    defaultLabel: 'Branch:',
                                    defaultOn: true,
                                    value: activeBankAccount?.branchName || '',
                                    onChange: (val) => updateBankOverrideField('branchName', val)
                                  },
                                  currency: {
                                    defaultLabel: 'Currency:',
                                    defaultOn: false,
                                    value: activeBankAccount?.currency || 'AED'
                                  }
                                };

                                return (
                                  <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                      <span className="text-[10.5px] font-bold text-slate-700">
                                        Bank Fields &amp; Wire Values
                                      </span>
                                      <span className="text-[9.5px] text-slate-400">
                                        Toggle, reorder &amp; edit
                                      </span>
                                    </div>
                                    {activeOrder
                                      .filter((k) => Boolean(bankFieldMeta[k]))
                                      .map((key, idx) => {
                                        const meta = bankFieldMeta[key];
                                        const isChecked =
                                          vis[key] !== undefined ? vis[key] : meta.defaultOn;
                                        return (
                                          <div
                                            key={key}
                                            className="p-2 rounded-lg bg-white border border-slate-200 space-y-1"
                                          >
                                            <div className="flex items-center justify-between gap-1">
                                              <label className="flex items-center gap-1.5 cursor-pointer flex-1 min-w-0">
                                                <input
                                                  type="checkbox"
                                                  checked={isChecked}
                                                  onChange={(e) =>
                                                    handleUpdateBlockConfig('remittance', {
                                                      visibleFields: {
                                                        ...vis,
                                                        [key]: e.target.checked
                                                      }
                                                    })
                                                  }
                                                  className="rounded border-slate-300 text-blue-600 cursor-pointer shrink-0"
                                                />
                                                <input
                                                  type="text"
                                                  value={lbls[key] ?? meta.defaultLabel}
                                                  onChange={(e) =>
                                                    handleUpdateBlockConfig('remittance', {
                                                      fieldLabels: {
                                                        ...lbls,
                                                        [key]: e.target.value
                                                      }
                                                    })
                                                  }
                                                  className="text-[10.5px] font-semibold text-slate-700 bg-transparent border-b border-transparent focus:border-blue-400 focus:outline-hidden w-full"
                                                />
                                              </label>
                                              <div className="flex items-center gap-0.5 shrink-0">
                                                <button
                                                  type="button"
                                                  disabled={idx === 0}
                                                  onClick={() => moveBankField(key, -1)}
                                                  className="p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                                                >
                                                  <ArrowUp className="w-3 h-3" />
                                                </button>
                                                <button
                                                  type="button"
                                                  disabled={idx === activeOrder.length - 1}
                                                  onClick={() => moveBankField(key, 1)}
                                                  className="p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                                                >
                                                  <ArrowDown className="w-3 h-3" />
                                                </button>
                                              </div>
                                            </div>
                                            {isChecked && meta.onChange && (
                                              <input
                                                type="text"
                                                value={meta.value ?? ''}
                                                onChange={(e) => meta.onChange?.(e.target.value)}
                                                className="w-full px-2 py-1 rounded border border-slate-300 bg-slate-50/60 focus:bg-white text-[10.5px] text-slate-800"
                                              />
                                            )}
                                          </div>
                                        );
                                      })}
                                  </div>
                                );
                              })()}

                              {/* Custom Bank Rows */}
                              <div className="p-2 rounded-lg bg-white border border-slate-200 space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10.5px] font-semibold text-slate-700">
                                    Custom Bank Rows (e.g. Routing / Sort Code)
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const nextRow = {
                                        id: `bank_row_${Date.now()}`,
                                        label: 'Correspondent Bank:',
                                        value: 'Standard Chartered NY',
                                        enabled: true
                                      };
                                      handleUpdateBlockConfig('remittance', {
                                        customRows: [...(selectedBlock.customRows || []), nextRow]
                                      });
                                    }}
                                    className="text-[10px] font-semibold text-blue-600 hover:underline flex items-center gap-0.5 cursor-pointer"
                                  >
                                    <Plus className="w-3 h-3" />
                                    <span>Add Row</span>
                                  </button>
                                </div>
                                {(selectedBlock.customRows || []).map((row, rIdx) => (
                                  <div
                                    key={row.id || rIdx}
                                    className="flex items-center gap-1 bg-slate-50 p-1.5 rounded border border-slate-200"
                                  >
                                    <input
                                      type="text"
                                      value={row.label ?? ''}
                                      onChange={(e) => {
                                        const updated = (selectedBlock.customRows || []).map((item, i) =>
                                          i === rIdx ? { ...item, label: e.target.value } : item
                                        );
                                        handleUpdateBlockConfig('remittance', { customRows: updated });
                                      }}
                                      placeholder="Label"
                                      className="w-24 px-1.5 py-0.5 rounded border border-slate-300 bg-white text-[10px] text-slate-700"
                                    />
                                    <div className="flex-1 min-w-0">
                                      <AtMentionInput
                                        value={row.value ?? ''}
                                        onChange={(val) => {
                                          const updated = (selectedBlock.customRows || []).map((item, i) =>
                                            i === rIdx ? { ...item, value: val } : item
                                          );
                                          handleUpdateBlockConfig('remittance', { customRows: updated });
                                        }}
                                        tokenContext={studioTokenContext}
                                        compact
                                        placeholder="Value or @tag"
                                        className="w-full px-1.5 py-0.5 rounded border border-slate-300 bg-white text-[10px] text-slate-800"
                                      />
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const updated = (selectedBlock.customRows || []).map((item, i) =>
                                          i === rIdx ? { ...item, hideIfEmpty: !item.hideIfEmpty } : item
                                        );
                                        handleUpdateBlockConfig('remittance', { customRows: updated });
                                      }}
                                      title={
                                        row.hideIfEmpty
                                          ? 'Row auto-hides when @tag is empty/omitted (Click to show — dash instead)'
                                          : 'Row shows — dash when @tag is empty/omitted (Click to auto-hide row if empty)'
                                      }
                                      className={`px-1 py-0.5 rounded text-[9px] font-mono border cursor-pointer shrink-0 ${
                                        row.hideIfEmpty
                                          ? 'bg-amber-50 border-amber-300 text-amber-800 font-semibold'
                                          : 'bg-white border-slate-200 text-slate-400 hover:text-slate-700'
                                      }`}
                                    >
                                      {row.hideIfEmpty ? 'Hide ∅' : 'Show —'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const updated = (selectedBlock.customRows || []).filter(
                                          (_, i) => i !== rIdx
                                        );
                                        handleUpdateBlockConfig('remittance', { customRows: updated });
                                      }}
                                      className="p-1 text-rose-500 hover:bg-rose-50 rounded cursor-pointer shrink-0"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                ))}
                              </div>

                              {/* Custom Remittance Note */}
                              <div className="p-2 rounded-lg bg-white border border-slate-200 space-y-1">
                                <label className="block text-[10px] font-semibold text-slate-600">
                                  Remittance Footer Note (opt)
                                </label>
                                <AtMentionInput
                                  value={selectedBlock.customNote ?? ''}
                                  onChange={(val) =>
                                    handleUpdateBlockConfig('remittance', {
                                      customNote: val
                                    })
                                  }
                                  tokenContext={studioTokenContext}
                                  compact
                                  placeholder="e.g. Please quote @quote_ref on wire transfer."
                                  className="w-full px-2 py-1 rounded border border-slate-300 bg-slate-50/60 focus:bg-white text-[10.5px] text-slate-800"
                                />
                              </div>
                            </div>
                          )}

                          {/* UNIVERSAL CUSTOM LEGO BLOCK & PIECE EDITOR (2-LEVEL INSPECTOR) */}
                          {(selectedBlockType === 'custom' || Array.isArray(selectedBlock.pieces)) && (() => {
                            const renderStandardTextToolbar = (
                              curStyle: QuotationTextFormatStyle | undefined,
                              onChangeStyle: (patch: Partial<QuotationTextFormatStyle>) => void,
                              onInsertTag?: (tag: string) => void,
                              pieceId?: string,
                              pieceText?: string,
                              onChangeText?: (nextText: string) => void
                            ) => {
                              const st = curStyle || {};
                              const handleInlineOrPieceFormat = (
                                marker: '**' | '*' | '__',
                                fallbackPatch: Partial<QuotationTextFormatStyle>
                              ) => {
                                if (pieceId && onChangeText && typeof pieceText === 'string') {
                                  const el = pieceInputRefs.current[pieceId];
                                  if (toggleInlineSelectionWrap(el, pieceText, onChangeText, marker)) {
                                    return;
                                  }
                                }
                                onChangeStyle(fallbackPatch);
                              };

                              return (
                                <div className="rounded-lg border border-slate-200 bg-slate-50/90 p-2 space-y-2">
                                  {/* Row 1: Single-Row Word-Style Ribbon */}
                                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                                    <div className="flex flex-wrap items-center gap-1">
                                      {/* Font Size Group */}
                                      <div className="inline-flex items-center bg-white rounded-md p-0.5 border border-slate-200 shadow-2xs">
                                        {(
                                          [
                                            { id: 'xs', label: 'XS' },
                                            { id: 'sm', label: 'SM' },
                                            { id: 'base', label: 'MD' },
                                            { id: 'lg', label: 'LG' },
                                            { id: 'xl', label: 'XL' }
                                          ] as const
                                        ).map((sz) => (
                                          <button
                                            key={sz.id}
                                            type="button"
                                            onMouseDown={(e) => e.preventDefault()}
                                            onClick={() => onChangeStyle({ fontSize: sz.id })}
                                            className={`px-1.5 py-0.5 rounded text-[9.5px] font-mono transition cursor-pointer ${
                                              (st.fontSize || 'sm') === sz.id
                                                ? 'bg-indigo-600 text-white font-bold shadow-2xs'
                                                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                                            }`}
                                            title={`Font Size: ${sz.label}`}
                                          >
                                            {sz.label}
                                          </button>
                                        ))}
                                      </div>

                                      {/* B / I / U / AA Group (Selection-Aware) */}
                                      <div className="inline-flex items-center bg-white rounded-md p-0.5 border border-slate-200 shadow-2xs">
                                        <button
                                          type="button"
                                          onMouseDown={(e) => e.preventDefault()}
                                          onClick={() =>
                                            handleInlineOrPieceFormat('**', {
                                              fontWeight: st.fontWeight === 'bold' ? 'normal' : 'bold'
                                            })
                                          }
                                          className={`p-1 rounded transition cursor-pointer ${
                                            st.fontWeight === 'bold'
                                              ? 'bg-indigo-600 text-white shadow-2xs'
                                              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                                          }`}
                                          title="Bold (Formats highlighted text with **bold**, or toggles whole piece)"
                                        >
                                          <Bold className="w-3 h-3" />
                                        </button>
                                        <button
                                          type="button"
                                          onMouseDown={(e) => e.preventDefault()}
                                          onClick={() =>
                                            handleInlineOrPieceFormat('*', {
                                              italic: !st.italic
                                            })
                                          }
                                          className={`p-1 rounded transition cursor-pointer ${
                                            st.italic
                                              ? 'bg-indigo-600 text-white shadow-2xs'
                                              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                                          }`}
                                          title="Italic (Formats highlighted text with *italic*, or toggles whole piece)"
                                        >
                                          <Italic className="w-3 h-3" />
                                        </button>
                                        <button
                                          type="button"
                                          onMouseDown={(e) => e.preventDefault()}
                                          onClick={() =>
                                            handleInlineOrPieceFormat('__', {
                                              underline: !st.underline
                                            })
                                          }
                                          className={`p-1 rounded transition cursor-pointer ${
                                            st.underline
                                              ? 'bg-indigo-600 text-white shadow-2xs'
                                              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                                          }`}
                                          title="Underline (Formats highlighted text with __underline__, or toggles whole piece)"
                                        >
                                          <Underline className="w-3 h-3" />
                                        </button>
                                        <button
                                          type="button"
                                          onMouseDown={(e) => e.preventDefault()}
                                          onClick={() =>
                                            onChangeStyle({
                                              letterSpacing:
                                                st.letterSpacing === 'uppercase_tracked'
                                                  ? 'normal'
                                                  : 'uppercase_tracked'
                                            })
                                          }
                                          className={`px-1 py-0.5 rounded text-[9px] font-mono font-bold transition cursor-pointer ${
                                            st.letterSpacing === 'uppercase_tracked'
                                              ? 'bg-indigo-600 text-white shadow-2xs'
                                              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                                          }`}
                                          title="Uppercase Tracked"
                                        >
                                          AA
                                        </button>
                                      </div>

                                      {/* Alignment Icons Group */}
                                      <div className="inline-flex items-center bg-white rounded-md p-0.5 border border-slate-200 shadow-2xs">
                                        {(
                                          [
                                            { id: 'left', icon: AlignLeft, title: 'Align Left' },
                                            { id: 'center', icon: AlignCenter, title: 'Align Center' },
                                            { id: 'right', icon: AlignRight, title: 'Align Right' },
                                            { id: 'justify', icon: AlignJustify, title: 'Justify' }
                                          ] as const
                                        ).map((al) => {
                                          const IconComp = al.icon;
                                          return (
                                            <button
                                              key={al.id}
                                              type="button"
                                              onMouseDown={(e) => e.preventDefault()}
                                              onClick={() => onChangeStyle({ textAlign: al.id })}
                                              className={`p-1 rounded transition cursor-pointer ${
                                                (st.textAlign || 'left') === al.id
                                                  ? 'bg-indigo-600 text-white shadow-2xs'
                                                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                                              }`}
                                              title={al.title}
                                            >
                                              <IconComp className="w-3 h-3" />
                                            </button>
                                          );
                                        })}
                                      </div>
                                    </div>

                                    {onInsertTag && (
                                      <select
                                        value=""
                                        onChange={(e) => {
                                          if (e.target.value) {
                                            onInsertTag(e.target.value);
                                          }
                                        }}
                                        className="px-1.5 py-0.5 rounded-md border border-indigo-200 bg-white text-indigo-700 font-mono text-[9.5px] font-semibold cursor-pointer max-w-[115px] shadow-2xs"
                                        title="Insert dynamic @Data Tag"
                                      >
                                        <option value="">+ @Tag</option>
                                        {QUOTATION_AT_TAGS.map((t) => (
                                          <option key={t.tag} value={t.tag}>
                                            {t.tag} ({t.label})
                                          </option>
                                        ))}
                                      </select>
                                    )}
                                  </div>

                                  {/* Row 2: 3-Column Labeled Dropdowns (Color, Spacing, Highlight) */}
                                  <div className="grid grid-cols-3 gap-1.5 pt-1 border-t border-slate-200/70">
                                    <div>
                                      <label className="block text-[8.5px] font-mono font-bold text-slate-400 uppercase tracking-wider mb-0.5">
                                        Color
                                      </label>
                                      <select
                                        value={st.textColor || 'default'}
                                        onChange={(e) =>
                                          onChangeStyle({ textColor: e.target.value as any })
                                        }
                                        className="w-full rounded border border-slate-200 bg-white px-1.5 py-1 text-[10px] font-medium text-slate-700 cursor-pointer"
                                        title="Text Color"
                                      >
                                        <option value="default">Dark Ink</option>
                                        <option value="muted">Muted Grey</option>
                                        <option value="accent">Brand Accent</option>
                                      </select>
                                    </div>

                                    <div>
                                      <label className="block text-[8.5px] font-mono font-bold text-slate-400 uppercase tracking-wider mb-0.5">
                                        Spacing
                                      </label>
                                      <select
                                        value={st.lineHeight || 'normal'}
                                        onChange={(e) =>
                                          onChangeStyle({ lineHeight: e.target.value as any })
                                        }
                                        className="w-full rounded border border-slate-200 bg-white px-1.5 py-1 text-[10px] font-medium text-slate-700 cursor-pointer"
                                        title="Line Spacing"
                                      >
                                        <option value="tight">Tight</option>
                                        <option value="normal">Normal</option>
                                        <option value="relaxed">Relaxed</option>
                                      </select>
                                    </div>

                                    <div>
                                      <label className="block text-[8.5px] font-mono font-bold text-slate-400 uppercase tracking-wider mb-0.5">
                                        Highlight
                                      </label>
                                      <select
                                        value={st.highlightBg || 'none'}
                                        onChange={(e) =>
                                          onChangeStyle({ highlightBg: e.target.value as any })
                                        }
                                        className="w-full rounded border border-slate-200 bg-white px-1.5 py-1 text-[10px] font-medium text-slate-700 cursor-pointer"
                                        title="Highlight Fill"
                                      >
                                        <option value="none">None</option>
                                        <option value="SoftYellow">Yellow</option>
                                        <option value="SoftBlue">Blue</option>
                                        <option value="SoftEmerald">Green</option>
                                        <option value="SoftRose">Rose</option>
                                        <option value="ThemeTint">Brand Tint</option>
                                      </select>
                                    </div>
                                  </div>
                                </div>
                              );
                            };

                            return (
                              <div className="space-y-3.5 pt-2 border-t border-slate-200">
                                {/* LEVEL 1: BLOCK BAR (Title, Border Style Override, Page Split, Save to My Blocks) */}
                                <div className="p-3 rounded-xl bg-indigo-50/60 border border-indigo-200 space-y-2.5">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-[11px] font-bold text-indigo-950 flex items-center gap-1.5">
                                      <Layers className="w-3.5 h-3.5 text-indigo-600" />
                                      Custom Block Container
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (saveToLibraryBlockId === selectedBlock.id) {
                                          setSaveToLibraryBlockId(null);
                                        } else {
                                          setSaveToLibraryBlockId(selectedBlock.id);
                                          setSaveLibraryTitle(selectedBlock.title || 'Custom Block');
                                        }
                                      }}
                                      className="px-2 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-[10px] flex items-center gap-1 cursor-pointer shadow-2xs"
                                    >
                                      <BookmarkPlus className="w-3 h-3" />
                                      <span>💾 Save to My Blocks</span>
                                    </button>
                                  </div>

                                  {/* Save to My Blocks Inline Popover */}
                                  {saveToLibraryBlockId === selectedBlock.id && (
                                    <div className="p-2.5 rounded-lg bg-white border border-indigo-300 shadow-xs space-y-2">
                                      <label className="block text-[10px] font-bold text-indigo-950">
                                        Save Block to Reusable Library
                                      </label>
                                      <input
                                        type="text"
                                        value={saveLibraryTitle}
                                        onChange={(e) => setSaveLibraryTitle(e.target.value)}
                                        placeholder="Template Name (e.g. Export Letter of Credit Terms)"
                                        className="w-full px-2 py-1 rounded border border-slate-300 text-xs text-slate-800"
                                      />
                                      <div className="grid grid-cols-2 gap-1.5">
                                        <button
                                          type="button"
                                          onClick={() => setSaveLibraryVisibility('private')}
                                          className={`py-1.5 px-2 rounded border text-[10px] font-semibold cursor-pointer ${
                                            saveLibraryVisibility === 'private'
                                              ? 'bg-amber-50 border-amber-400 text-amber-900'
                                              : 'bg-slate-50 border-slate-200 text-slate-600'
                                          }`}
                                        >
                                          🔒 Private (Only Me)
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setSaveLibraryVisibility('workspace')}
                                          className={`py-1.5 px-2 rounded border text-[10px] font-semibold cursor-pointer ${
                                            saveLibraryVisibility === 'workspace'
                                              ? 'bg-emerald-50 border-emerald-400 text-emerald-900'
                                              : 'bg-slate-50 border-slate-200 text-slate-600'
                                          }`}
                                        >
                                          🌐 Share with Workspace
                                        </button>
                                      </div>
                                      <div className="flex items-center justify-end gap-1.5">
                                        <button
                                          type="button"
                                          onClick={() => setSaveToLibraryBlockId(null)}
                                          className="px-2 py-1 rounded text-[10px] text-slate-500 hover:bg-slate-100 cursor-pointer"
                                        >
                                          Cancel
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleSaveBlockToLibrary(selectedBlock)}
                                          className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] cursor-pointer"
                                        >
                                          Save Block Template
                                        </button>
                                      </div>
                                    </div>
                                  )}

                                  {/* Block Name */}
                                  <div>
                                    <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                                      Block Name (Inspector Label)
                                    </label>
                                    <input
                                      type="text"
                                      value={selectedBlock.title || ''}
                                      onChange={(e) =>
                                        handleUpdateBlockConfig(selectedBlock.id, { title: e.target.value })
                                      }
                                      placeholder="Custom Block Title"
                                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-800"
                                    />
                                  </div>

                                  {/* Box Style Override */}
                                  <div>
                                    <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                                      Box Frame Style
                                    </label>
                                    <div className="grid grid-cols-5 gap-1">
                                      {(
                                        [
                                          { id: 'inherit', label: 'Auto' },
                                          { id: 'framed', label: 'Card' },
                                          { id: 'tinted', label: 'Tinted' },
                                          { id: 'left_accent', label: 'Bar' },
                                          { id: 'minimal', label: 'None' }
                                        ] as const
                                      ).map((bs) => (
                                        <button
                                          key={bs.id}
                                          type="button"
                                          onClick={() =>
                                            handleUpdateBlockConfig(selectedBlock.id, {
                                              borderStyleOverride: bs.id
                                            })
                                          }
                                          className={`py-1 px-1 rounded border text-[9.5px] font-semibold transition cursor-pointer ${
                                            (selectedBlock.borderStyleOverride || 'inherit') === bs.id
                                              ? 'bg-indigo-600 text-white border-indigo-600'
                                              : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                                          }`}
                                        >
                                          {bs.label}
                                        </button>
                                      ))}
                                    </div>
                                  </div>

                                  {/* Allow Page Split */}
                                  <div className="flex items-center justify-between pt-1">
                                    <div>
                                      <span className="text-[10.5px] font-semibold text-slate-700 block">
                                        Allow Multi-Page Split
                                      </span>
                                      <span className="text-[9.5px] text-slate-500">
                                        Permit long custom blocks to break across A4 sheets
                                      </span>
                                    </div>
                                    <input
                                      type="checkbox"
                                      checked={Boolean(selectedBlock.allowPageSplit)}
                                      onChange={(e) =>
                                        handleUpdateBlockConfig(selectedBlock.id, {
                                          allowPageSplit: e.target.checked
                                        })
                                      }
                                      className="rounded border-slate-300 text-indigo-600 cursor-pointer"
                                    />
                                  </div>
                                </div>

                                {/* LEVEL 2: LEGO PIECES STACK */}
                                <div className="space-y-2.5">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-bold text-slate-800">
                                      Lego Pieces Stack ({(selectedBlock.pieces || []).length})
                                    </span>
                                    <span className="text-[9.5px] text-slate-400 font-mono">
                                      Reorder • Style • @Tags
                                    </span>
                                  </div>

                                  {(selectedBlock.pieces || []).map((piece, pIdx) => {
                                    const totalPieces = (selectedBlock.pieces || []).length;
                                    return (
                                      <div
                                        key={piece.id}
                                        className={`p-2.5 rounded-xl border space-y-2 transition ${
                                          piece.enabled === false
                                            ? 'bg-slate-50 border-slate-200 opacity-60'
                                            : 'bg-white border-slate-200 shadow-2xs'
                                        }`}
                                      >
                                        {/* Piece Header Bar */}
                                        <div className="flex items-center justify-between gap-1 pb-1.5 border-b border-slate-100">
                                          <div className="flex items-center gap-1.5">
                                            <input
                                              type="checkbox"
                                              checked={piece.enabled !== false}
                                              onChange={(e) =>
                                                handleUpdatePieceInBlock(selectedBlock.id, piece.id, (p) => ({
                                                  ...p,
                                                  enabled: e.target.checked
                                                }))
                                              }
                                              className="rounded border-slate-300 text-indigo-600 cursor-pointer"
                                            />
                                            <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-800 font-mono text-[9.5px] font-bold uppercase">
                                              #{pIdx + 1} • {piece.type.replace('_', ' ')}
                                            </span>
                                          </div>
                                          <div className="flex items-center gap-0.5">
                                            <button
                                              type="button"
                                              disabled={pIdx === 0}
                                              onClick={() =>
                                                handleMovePieceInBlock(selectedBlock.id, pIdx, 'up')
                                              }
                                              className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-25 cursor-pointer"
                                              title="Move Piece Up"
                                            >
                                              <ArrowUp className="w-3 h-3" />
                                            </button>
                                            <button
                                              type="button"
                                              disabled={pIdx === totalPieces - 1}
                                              onClick={() =>
                                                handleMovePieceInBlock(selectedBlock.id, pIdx, 'down')
                                              }
                                              className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-25 cursor-pointer"
                                              title="Move Piece Down"
                                            >
                                              <ArrowDown className="w-3 h-3" />
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                handleDuplicatePieceInBlock(selectedBlock.id, pIdx)
                                              }
                                              className="p-1 text-slate-400 hover:text-indigo-600 cursor-pointer"
                                              title="Duplicate Piece"
                                            >
                                              <Copy className="w-3 h-3" />
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                handleDeletePieceFromBlock(selectedBlock.id, piece.id)
                                              }
                                              className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                                              title="Remove Piece"
                                            >
                                              <Trash2 className="w-3 h-3" />
                                            </button>
                                          </div>
                                        </div>

                                        {/* 1. HEADING PIECE EDITOR */}
                                        {piece.type === 'heading' && (
                                          <div className="space-y-2">
                                            {renderStandardTextToolbar(
                                              piece.style,
                                              (patch) =>
                                                handleUpdatePieceInBlock(selectedBlock.id, piece.id, (p) => ({
                                                  ...p,
                                                  style: { ...(p.style || {}), ...patch }
                                                })),
                                              (tag) =>
                                                handleUpdatePieceInBlock(selectedBlock.id, piece.id, (p) => ({
                                                  ...p,
                                                  text: `${p.text || ''} ${tag}`.trim()
                                                })),
                                              piece.id,
                                              piece.text || '',
                                              (nextText) =>
                                                handleUpdatePieceInBlock(selectedBlock.id, piece.id, (p) => ({
                                                  ...p,
                                                  text: nextText
                                                }))
                                            )}
                                            <AtMentionInput
                                              inputRefProp={(el) => {
                                                pieceInputRefs.current[piece.id] = el;
                                              }}
                                              value={piece.text || ''}
                                              onChange={(val) =>
                                                handleUpdatePieceInBlock(selectedBlock.id, piece.id, (p) => ({
                                                  ...p,
                                                  text: val
                                                }))
                                              }
                                              tokenContext={studioTokenContext}
                                              compact
                                              placeholder="Section Heading or @tag"
                                              className="w-full px-2.5 py-1.5 rounded-md border border-slate-300 text-xs font-bold text-slate-800"
                                            />
                                            <label className="flex items-center gap-1.5 text-[10px] text-slate-600 cursor-pointer">
                                              <input
                                                type="checkbox"
                                                checked={piece.showAccentBar !== false}
                                                onChange={(e) =>
                                                  handleUpdatePieceInBlock(selectedBlock.id, piece.id, (p) => ({
                                                    ...p,
                                                    showAccentBar: e.target.checked
                                                  }))
                                                }
                                                className="rounded border-slate-300 text-indigo-600"
                                              />
                                              <span>Show vertical brand accent bar &amp; bottom border</span>
                                            </label>
                                          </div>
                                        )}

                                        {/* 2. RICH TEXT PIECE EDITOR */}
                                        {piece.type === 'rich_text' && (
                                          <div className="space-y-2">
                                            {renderStandardTextToolbar(
                                              piece.style,
                                              (patch) =>
                                                handleUpdatePieceInBlock(selectedBlock.id, piece.id, (p) => ({
                                                  ...p,
                                                  style: { ...(p.style || {}), ...patch }
                                                })),
                                              (tag) =>
                                                handleUpdatePieceInBlock(selectedBlock.id, piece.id, (p) => ({
                                                  ...p,
                                                  text: `${p.text || ''} ${tag}`.trim()
                                                })),
                                              piece.id,
                                              piece.text || '',
                                              (nextText) =>
                                                handleUpdatePieceInBlock(selectedBlock.id, piece.id, (p) => ({
                                                  ...p,
                                                  text: nextText
                                                }))
                                            )}
                                            <AtMentionTextarea
                                              textareaRefProp={(el) => {
                                                pieceInputRefs.current[piece.id] = el;
                                              }}
                                              value={piece.text || ''}
                                              onChange={(val) =>
                                                handleUpdatePieceInBlock(selectedBlock.id, piece.id, (p) => ({
                                                  ...p,
                                                  text: val
                                                }))
                                              }
                                              tokenContext={studioTokenContext}
                                              showInsertBar={false}
                                              rows={3}
                                              placeholder="Type paragraph text... Highlight words and click B / I / U, or type @ for live tags"
                                              className="w-full px-2.5 py-1.5 rounded-md border border-slate-300 text-xs text-slate-800 leading-relaxed"
                                            />
                                            <p className="text-[9.5px] text-slate-400">
                                              Tip: Highlight text and click <strong className="text-slate-600">B</strong>, <em className="text-slate-600">I</em>, or <span className="underline text-slate-600">U</span> to format selected words, or type <code className="font-mono font-bold text-indigo-600">@</code> for live deal data.
                                            </p>
                                          </div>
                                        )}

                                        {/* 3. LIST PIECE EDITOR */}
                                        {piece.type === 'list' && (
                                          <div className="space-y-2">
                                            <div className="flex items-center justify-between gap-1">
                                              <span className="text-[10px] font-semibold text-slate-600">
                                                List Marker Style:
                                              </span>
                                              <div className="flex items-center gap-1">
                                                {(
                                                  [
                                                    { id: 'bullet', label: '• Bullet' },
                                                    { id: 'numbered', label: '1. Number' },
                                                    { id: 'check', label: '✓ Check' },
                                                    { id: 'dash', label: '— Dash' }
                                                  ] as const
                                                ).map((ls) => (
                                                  <button
                                                    key={ls.id}
                                                    type="button"
                                                    onClick={() =>
                                                      handleUpdatePieceInBlock(selectedBlock.id, piece.id, (p) => ({
                                                        ...p,
                                                        listStyle: ls.id
                                                      }))
                                                    }
                                                    className={`px-1.5 py-0.5 rounded text-[9.5px] font-semibold cursor-pointer ${
                                                      (piece.listStyle || 'bullet') === ls.id
                                                        ? 'bg-indigo-600 text-white'
                                                        : 'bg-slate-100 text-slate-600'
                                                    }`}
                                                  >
                                                    {ls.label}
                                                  </button>
                                                ))}
                                              </div>
                                            </div>
                                            {renderStandardTextToolbar(
                                              piece.style,
                                              (patch) =>
                                                handleUpdatePieceInBlock(selectedBlock.id, piece.id, (p) => ({
                                                  ...p,
                                                  style: { ...(p.style || {}), ...patch }
                                                })),
                                              undefined,
                                              piece.id,
                                              (piece.items || [])[activeListItemIndexRef.current[piece.id] ?? 0] || '',
                                              (nextItemText) => {
                                                const targetIdx = activeListItemIndexRef.current[piece.id] ?? 0;
                                                handleUpdatePieceInBlock(selectedBlock.id, piece.id, (p) => ({
                                                  ...p,
                                                  items: (p.items || []).map((it, k) =>
                                                    k === targetIdx ? nextItemText : it
                                                  )
                                                }));
                                              }
                                            )}
                                            <div className="space-y-1">
                                              {(piece.items || []).map((itemText, iIdx) => (
                                                <div key={iIdx} className="flex items-center gap-1">
                                                  <div className="flex-1 min-w-0">
                                                    <AtMentionInput
                                                      inputRefProp={(el) => {
                                                        if (
                                                          el &&
                                                          (activeListItemIndexRef.current[piece.id] ?? 0) === iIdx
                                                        ) {
                                                          pieceInputRefs.current[piece.id] = el;
                                                        }
                                                      }}
                                                      onFocus={(e) => {
                                                        activeListItemIndexRef.current[piece.id] = iIdx;
                                                        pieceInputRefs.current[piece.id] = e.currentTarget;
                                                      }}
                                                      value={itemText}
                                                      onChange={(val) =>
                                                        handleUpdatePieceInBlock(selectedBlock.id, piece.id, (p) => ({
                                                          ...p,
                                                          items: (p.items || []).map((it, k) =>
                                                            k === iIdx ? val : it
                                                          )
                                                        }))
                                                      }
                                                      tokenContext={studioTokenContext}
                                                      compact
                                                      placeholder="List point or @tag"
                                                      className="w-full px-2 py-1 rounded border border-slate-300 text-[11px]"
                                                    />
                                                  </div>
                                                  <button
                                                    type="button"
                                                    onClick={() =>
                                                      handleUpdatePieceInBlock(selectedBlock.id, piece.id, (p) => ({
                                                        ...p,
                                                        items: (p.items || []).filter((_, k) => k !== iIdx)
                                                      }))
                                                    }
                                                    className="p-1 text-rose-500 hover:bg-rose-50 rounded cursor-pointer"
                                                  >
                                                    <Trash2 className="w-3 h-3" />
                                                  </button>
                                                </div>
                                              ))}
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  handleUpdatePieceInBlock(selectedBlock.id, piece.id, (p) => ({
                                                    ...p,
                                                    items: [...(p.items || []), 'New list item']
                                                  }))
                                                }
                                                className="text-[10px] font-semibold text-indigo-600 hover:underline flex items-center gap-1 cursor-pointer"
                                              >
                                                <Plus className="w-3 h-3" />
                                                <span>Add List Item</span>
                                              </button>
                                            </div>
                                          </div>
                                        )}

                                        {/* 4. FIELD ROWS (KEY-VALUE GRID) PIECE EDITOR */}
                                        {piece.type === 'field_rows' && (
                                          <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                              <span className="text-[10px] font-semibold text-slate-600">
                                                Grid Columns:
                                              </span>
                                              <div className="flex items-center gap-1">
                                                {[1, 2].map((cols) => (
                                                  <button
                                                    key={cols}
                                                    type="button"
                                                    onClick={() =>
                                                      handleUpdatePieceInBlock(selectedBlock.id, piece.id, (p) => ({
                                                        ...p,
                                                        gridColumns: cols as 1 | 2
                                                      }))
                                                    }
                                                    className={`px-2 py-0.5 rounded text-[9.5px] font-semibold cursor-pointer ${
                                                      (piece.gridColumns || 1) === cols
                                                        ? 'bg-indigo-600 text-white'
                                                        : 'bg-slate-100 text-slate-600'
                                                    }`}
                                                  >
                                                    {cols} Col{cols > 1 ? 's' : ''}
                                                  </button>
                                                ))}
                                              </div>
                                            </div>
                                            <div className="space-y-1.5">
                                              {(piece.fieldRows || []).map((row, rIdx) => (
                                                <div
                                                  key={row.id || rIdx}
                                                  className="flex items-center gap-1 bg-slate-50 p-1.5 rounded border border-slate-200"
                                                >
                                                  <input
                                                    type="checkbox"
                                                    checked={row.enabled !== false}
                                                    onChange={(e) =>
                                                      handleUpdatePieceInBlock(selectedBlock.id, piece.id, (p) => ({
                                                        ...p,
                                                        fieldRows: (p.fieldRows || []).map((it, k) =>
                                                          k === rIdx ? { ...it, enabled: e.target.checked } : it
                                                        )
                                                      }))
                                                    }
                                                    className="rounded border-slate-300 text-indigo-600 shrink-0"
                                                  />
                                                  <input
                                                    type="text"
                                                    value={row.label}
                                                    onChange={(e) =>
                                                      handleUpdatePieceInBlock(selectedBlock.id, piece.id, (p) => ({
                                                        ...p,
                                                        fieldRows: (p.fieldRows || []).map((it, k) =>
                                                          k === rIdx ? { ...it, label: e.target.value } : it
                                                        )
                                                      }))
                                                    }
                                                    placeholder="Label"
                                                    className="w-24 px-1.5 py-0.5 rounded border border-slate-300 bg-white text-[10px]"
                                                  />
                                                  <div className="flex-1 min-w-0">
                                                    <AtMentionInput
                                                      value={row.value}
                                                      onChange={(val) =>
                                                        handleUpdatePieceInBlock(selectedBlock.id, piece.id, (p) => ({
                                                          ...p,
                                                          fieldRows: (p.fieldRows || []).map((it, k) =>
                                                            k === rIdx ? { ...it, value: val } : it
                                                          )
                                                        }))
                                                      }
                                                      tokenContext={studioTokenContext}
                                                      compact
                                                      placeholder="Value or @tag"
                                                      className="w-full px-1.5 py-0.5 rounded border border-slate-300 bg-white text-[10px]"
                                                    />
                                                  </div>
                                                  <button
                                                    type="button"
                                                    onClick={() =>
                                                      handleUpdatePieceInBlock(selectedBlock.id, piece.id, (p) => ({
                                                        ...p,
                                                        fieldRows: (p.fieldRows || []).map((it, k) =>
                                                          k === rIdx ? { ...it, hideIfEmpty: !it.hideIfEmpty } : it
                                                        )
                                                      }))
                                                    }
                                                    className={`px-1 py-0.5 rounded text-[8.5px] font-mono border cursor-pointer shrink-0 ${
                                                      row.hideIfEmpty
                                                        ? 'bg-amber-50 border-amber-300 text-amber-800'
                                                        : 'bg-white border-slate-200 text-slate-400'
                                                    }`}
                                                    title="Toggle auto-hide when empty vs — dash"
                                                  >
                                                    {row.hideIfEmpty ? 'Hide ∅' : 'Show —'}
                                                  </button>
                                                  <button
                                                    type="button"
                                                    onClick={() =>
                                                      handleUpdatePieceInBlock(selectedBlock.id, piece.id, (p) => ({
                                                        ...p,
                                                        fieldRows: (p.fieldRows || []).filter((_, k) => k !== rIdx)
                                                      }))
                                                    }
                                                    className="p-0.5 text-rose-500 hover:bg-rose-50 rounded cursor-pointer"
                                                  >
                                                    <Trash2 className="w-3 h-3" />
                                                  </button>
                                                </div>
                                              ))}
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  handleUpdatePieceInBlock(selectedBlock.id, piece.id, (p) => ({
                                                    ...p,
                                                    fieldRows: [
                                                      ...(p.fieldRows || []),
                                                      {
                                                        id: makeUniqueId('frow'),
                                                        enabled: true,
                                                        label: 'Field:',
                                                        value: '@quote_ref'
                                                      }
                                                    ]
                                                  }))
                                                }
                                                className="text-[10px] font-semibold text-indigo-600 hover:underline flex items-center gap-1 cursor-pointer"
                                              >
                                                <Plus className="w-3 h-3" />
                                                <span>Add Field Row</span>
                                              </button>
                                            </div>
                                          </div>
                                        )}

                                        {/* 5. MINI TABLE PIECE EDITOR */}
                                        {piece.type === 'table' && (
                                          <div className="space-y-2">
                                            <div>
                                              <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                                                Column Headers (comma separated)
                                              </label>
                                              <input
                                                type="text"
                                                value={(piece.tableHeaders || []).join(', ')}
                                                onChange={(e) => {
                                                  const headers = e.target.value
                                                    .split(',')
                                                    .map((s) => s.trim());
                                                  handleUpdatePieceInBlock(selectedBlock.id, piece.id, (p) => ({
                                                    ...p,
                                                    tableHeaders: headers
                                                  }));
                                                }}
                                                className="w-full px-2 py-1 rounded border border-slate-300 text-[10.5px]"
                                              />
                                            </div>
                                            <div className="space-y-1">
                                              <span className="block text-[10px] font-semibold text-slate-600">
                                                Table Rows (pipe | separated cells, supports @tags)
                                              </span>
                                              {(piece.tableRows || []).map((tRow, rIdx) => (
                                                <div key={rIdx} className="flex items-center gap-1">
                                                  <div className="flex-1 min-w-0">
                                                    <AtMentionInput
                                                      value={tRow.join(' | ')}
                                                      onChange={(val) => {
                                                        const cells = val.split('|').map((c) => c.trim());
                                                        handleUpdatePieceInBlock(selectedBlock.id, piece.id, (p) => ({
                                                          ...p,
                                                          tableRows: (p.tableRows || []).map((r, k) =>
                                                            k === rIdx ? cells : r
                                                          )
                                                        }));
                                                      }}
                                                      tokenContext={studioTokenContext}
                                                      compact
                                                      className="w-full px-2 py-1 rounded border border-slate-300 text-[10.5px]"
                                                    />
                                                  </div>
                                                  <button
                                                    type="button"
                                                    onClick={() =>
                                                      handleUpdatePieceInBlock(selectedBlock.id, piece.id, (p) => ({
                                                        ...p,
                                                        tableRows: (p.tableRows || []).filter((_, k) => k !== rIdx)
                                                      }))
                                                    }
                                                    className="p-1 text-rose-500 hover:bg-rose-50 rounded cursor-pointer"
                                                  >
                                                    <Trash2 className="w-3 h-3" />
                                                  </button>
                                                </div>
                                              ))}
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  handleUpdatePieceInBlock(selectedBlock.id, piece.id, (p) => ({
                                                    ...p,
                                                    tableRows: [
                                                      ...(p.tableRows || []),
                                                      (p.tableHeaders || ['Col 1', 'Col 2']).map(() => 'Value')
                                                    ]
                                                  }))
                                                }
                                                className="text-[10px] font-semibold text-indigo-600 hover:underline flex items-center gap-1 cursor-pointer"
                                              >
                                                <Plus className="w-3 h-3" />
                                                <span>Add Table Row</span>
                                              </button>
                                            </div>
                                          </div>
                                        )}

                                        {/* 6. MONEY SUMMARY PIECE EDITOR */}
                                        {piece.type === 'money_summary' && (
                                          <div className="space-y-1.5">
                                            {(piece.moneyRows || []).map((mRow, rIdx) => (
                                              <div
                                                key={mRow.id || rIdx}
                                                className="flex items-center gap-1 bg-slate-50 p-1.5 rounded border border-slate-200"
                                              >
                                                <input
                                                  type="checkbox"
                                                  checked={mRow.enabled !== false}
                                                  onChange={(e) =>
                                                    handleUpdatePieceInBlock(selectedBlock.id, piece.id, (p) => ({
                                                      ...p,
                                                      moneyRows: (p.moneyRows || []).map((it, k) =>
                                                        k === rIdx ? { ...it, enabled: e.target.checked } : it
                                                      )
                                                    }))
                                                  }
                                                  className="rounded border-slate-300 text-indigo-600 shrink-0"
                                                />
                                                <input
                                                  type="text"
                                                  value={mRow.label}
                                                  onChange={(e) =>
                                                    handleUpdatePieceInBlock(selectedBlock.id, piece.id, (p) => ({
                                                      ...p,
                                                      moneyRows: (p.moneyRows || []).map((it, k) =>
                                                        k === rIdx ? { ...it, label: e.target.value } : it
                                                      )
                                                    }))
                                                  }
                                                  className="w-24 px-1.5 py-0.5 rounded border border-slate-300 bg-white text-[10px]"
                                                />
                                                <div className="flex-1 min-w-0">
                                                  <AtMentionInput
                                                    value={mRow.value}
                                                    onChange={(val) =>
                                                      handleUpdatePieceInBlock(selectedBlock.id, piece.id, (p) => ({
                                                        ...p,
                                                        moneyRows: (p.moneyRows || []).map((it, k) =>
                                                          k === rIdx ? { ...it, value: val } : it
                                                        )
                                                      }))
                                                    }
                                                    tokenContext={studioTokenContext}
                                                    compact
                                                    className="w-full px-1.5 py-0.5 rounded border border-slate-300 bg-white text-[10px]"
                                                  />
                                                </div>
                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    handleUpdatePieceInBlock(selectedBlock.id, piece.id, (p) => ({
                                                      ...p,
                                                      moneyRows: (p.moneyRows || []).map((it, k) =>
                                                        k === rIdx ? { ...it, isGrandTotal: !it.isGrandTotal } : it
                                                      )
                                                    }))
                                                  }
                                                  className={`px-1 py-0.5 rounded text-[8.5px] font-bold border cursor-pointer ${
                                                    mRow.isGrandTotal
                                                      ? 'bg-indigo-600 text-white border-indigo-600'
                                                      : 'bg-white text-slate-500 border-slate-200'
                                                  }`}
                                                  title="Highlight as Grand Total Banner"
                                                >
                                                  TOTAL
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    handleUpdatePieceInBlock(selectedBlock.id, piece.id, (p) => ({
                                                      ...p,
                                                      moneyRows: (p.moneyRows || []).filter((_, k) => k !== rIdx)
                                                    }))
                                                  }
                                                  className="p-0.5 text-rose-500 hover:bg-rose-50 rounded cursor-pointer"
                                                >
                                                  <Trash2 className="w-3 h-3" />
                                                </button>
                                              </div>
                                            ))}
                                            <button
                                              type="button"
                                              onClick={() =>
                                                handleUpdatePieceInBlock(selectedBlock.id, piece.id, (p) => ({
                                                  ...p,
                                                  moneyRows: [
                                                    ...(p.moneyRows || []),
                                                    {
                                                      id: makeUniqueId('mrow'),
                                                      enabled: true,
                                                      label: 'Adjustment',
                                                      value: 'AED 0.00'
                                                    }
                                                  ]
                                                }))
                                              }
                                              className="text-[10px] font-semibold text-indigo-600 hover:underline flex items-center gap-1 cursor-pointer"
                                            >
                                              <Plus className="w-3 h-3" />
                                              <span>Add Money Row</span>
                                            </button>
                                          </div>
                                        )}

                                        {/* 7. IMAGE PIECE EDITOR */}
                                        {piece.type === 'image' && (
                                          <div
                                            className="space-y-2"
                                            onPaste={async (e) => {
                                              const items = e.clipboardData?.items;
                                              if (!items) return;
                                              for (let i = 0; i < items.length; i++) {
                                                if (items[i].type.startsWith('image/')) {
                                                  const file = items[i].getAsFile();
                                                  if (file) {
                                                    e.preventDefault();
                                                    await handleUploadCustomPieceImage(
                                                      selectedBlock.id,
                                                      piece.id,
                                                      file
                                                    );
                                                    return;
                                                  }
                                                }
                                              }
                                            }}
                                          >
                                            {/* Primary Image Row */}
                                            <div className="flex items-center gap-1.5">
                                              <input
                                                type="text"
                                                value={piece.imageUrl || ''}
                                                onChange={(e) =>
                                                  handleUpdatePieceInBlock(selectedBlock.id, piece.id, (p) => ({
                                                    ...p,
                                                    imageUrl: e.target.value
                                                  }))
                                                }
                                                placeholder="Primary Image URL or Ctrl+V paste"
                                                className="flex-1 min-w-0 px-2 py-1 rounded border border-slate-300 text-[10.5px]"
                                              />
                                              <label className="px-2 py-1 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-[10px] cursor-pointer shrink-0 border border-indigo-200">
                                                Upload
                                                <input
                                                  type="file"
                                                  accept="image/*"
                                                  className="hidden"
                                                  onChange={(e) =>
                                                    handleUploadCustomPieceImage(
                                                      selectedBlock.id,
                                                      piece.id,
                                                      e.target.files?.[0]
                                                    )
                                                  }
                                                />
                                              </label>
                                            </div>

                                            {/* Secondary Side-by-Side Image Row */}
                                            <div className="flex items-center gap-1.5">
                                              <input
                                                type="text"
                                                value={piece.imageSecondaryUrl || ''}
                                                onChange={(e) =>
                                                  handleUpdatePieceInBlock(selectedBlock.id, piece.id, (p) => ({
                                                    ...p,
                                                    imageSecondaryUrl: e.target.value
                                                  }))
                                                }
                                                placeholder="2nd Side-by-Side Image URL (optional)"
                                                className="flex-1 min-w-0 px-2 py-1 rounded border border-slate-300 text-[10.5px]"
                                              />
                                              <label className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[10px] cursor-pointer shrink-0 border border-slate-200">
                                                + 2nd Img
                                                <input
                                                  type="file"
                                                  accept="image/*"
                                                  className="hidden"
                                                  onChange={async (e) => {
                                                    const f = e.target.files?.[0];
                                                    e.target.value = '';
                                                    if (!f) return;
                                                    try {
                                                      const uploaded = await uploadWorkspaceMediaAsset(
                                                        f,
                                                        'branding/custom_blocks',
                                                        activeWorkspace,
                                                        {
                                                          maxWidth: 900,
                                                          maxHeight: 600,
                                                          quality: 0.85,
                                                          preserveTransparency: true
                                                        }
                                                      );
                                                      if (uploaded.url) {
                                                        handleUpdatePieceInBlock(
                                                          selectedBlock.id,
                                                          piece.id,
                                                          (p) => ({
                                                            ...p,
                                                            imageSecondaryUrl: uploaded.url
                                                          })
                                                        );
                                                      }
                                                    } catch {
                                                      // ignore
                                                    }
                                                  }}
                                                />
                                              </label>
                                            </div>

                                            {/* Captions & Height */}
                                            <div className="grid grid-cols-2 gap-1.5">
                                              <input
                                                type="text"
                                                value={piece.imageCaption || ''}
                                                onChange={(e) =>
                                                  handleUpdatePieceInBlock(selectedBlock.id, piece.id, (p) => ({
                                                    ...p,
                                                    imageCaption: e.target.value
                                                  }))
                                                }
                                                placeholder="Caption 1 (optional)"
                                                className="px-2 py-1 rounded border border-slate-300 text-[10.5px]"
                                              />
                                              <input
                                                type="text"
                                                value={piece.imageSecondaryCaption || ''}
                                                onChange={(e) =>
                                                  handleUpdatePieceInBlock(selectedBlock.id, piece.id, (p) => ({
                                                    ...p,
                                                    imageSecondaryCaption: e.target.value
                                                  }))
                                                }
                                                placeholder="Caption 2 (optional)"
                                                className="px-2 py-1 rounded border border-slate-300 text-[10.5px]"
                                              />
                                            </div>

                                            {/* Width %, Height mm, Frame Style & Fit */}
                                            <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                                              <div>
                                                <label className="block text-[9px] font-mono font-bold text-slate-400 uppercase mb-0.5">
                                                  Width %
                                                </label>
                                                <select
                                                  value={piece.imageWidthPercent || 100}
                                                  onChange={(e) =>
                                                    handleUpdatePieceInBlock(selectedBlock.id, piece.id, (p) => ({
                                                      ...p,
                                                      imageWidthPercent: Number(e.target.value) as 25 | 50 | 75 | 100
                                                    }))
                                                  }
                                                  className="w-full px-1.5 py-1 rounded border border-slate-300 bg-white text-[10px] font-semibold text-slate-700"
                                                >
                                                  <option value={25}>25% Width</option>
                                                  <option value={50}>50% Half</option>
                                                  <option value={75}>75% Wide</option>
                                                  <option value={100}>100% Full</option>
                                                </select>
                                              </div>
                                              <div>
                                                <label className="block text-[9px] font-mono font-bold text-slate-400 uppercase mb-0.5">
                                                  Height (mm)
                                                </label>
                                                <input
                                                  type="number"
                                                  min={8}
                                                  max={120}
                                                  value={piece.imageHeightMm || 28}
                                                  onChange={(e) =>
                                                    handleUpdatePieceInBlock(selectedBlock.id, piece.id, (p) => ({
                                                      ...p,
                                                      imageHeightMm: Number(e.target.value) || 28
                                                    }))
                                                  }
                                                  className="w-full px-2 py-1 rounded border border-slate-300 bg-white text-[10.5px]"
                                                />
                                              </div>
                                              <div>
                                                <label className="block text-[9px] font-mono font-bold text-slate-400 uppercase mb-0.5">
                                                  Frame Style
                                                </label>
                                                <select
                                                  value={piece.imageFrameStyle || 'card'}
                                                  onChange={(e) =>
                                                    handleUpdatePieceInBlock(selectedBlock.id, piece.id, (p) => ({
                                                      ...p,
                                                      imageFrameStyle: e.target.value as any
                                                    }))
                                                  }
                                                  className="w-full px-1.5 py-1 rounded border border-slate-300 bg-white text-[10px] font-semibold text-slate-700"
                                                >
                                                  <option value="card">Bordered Card</option>
                                                  <option value="rounded">Soft Rounded</option>
                                                  <option value="minimal">Borderless</option>
                                                  <option value="shadow">Elevated Shadow</option>
                                                </select>
                                              </div>
                                              <div>
                                                <label className="block text-[9px] font-mono font-bold text-slate-400 uppercase mb-0.5">
                                                  Object Fit
                                                </label>
                                                <select
                                                  value={piece.imageObjectFit || 'contain'}
                                                  onChange={(e) =>
                                                    handleUpdatePieceInBlock(selectedBlock.id, piece.id, (p) => ({
                                                      ...p,
                                                      imageObjectFit: e.target.value as any
                                                    }))
                                                  }
                                                  className="w-full px-1.5 py-1 rounded border border-slate-300 bg-white text-[10px] font-semibold text-slate-700"
                                                >
                                                  <option value="contain">Contain</option>
                                                  <option value="cover">Cover</option>
                                                </select>
                                              </div>
                                            </div>
                                          </div>
                                        )}

                                        {/* 8. SIGNATURE BOX PIECE EDITOR */}
                                        {piece.type === 'signature_box' && (
                                          <div className="space-y-1.5">
                                            <AtMentionInput
                                              value={piece.signerLabel || ''}
                                              onChange={(val) =>
                                                handleUpdatePieceInBlock(selectedBlock.id, piece.id, (p) => ({
                                                  ...p,
                                                  signerLabel: val
                                                }))
                                              }
                                              tokenContext={studioTokenContext}
                                              compact
                                              placeholder="Header Label (e.g. For @company_name)"
                                              className="w-full px-2 py-1 rounded border border-slate-300 text-[10.5px]"
                                            />
                                            <div className="grid grid-cols-2 gap-1.5">
                                              <AtMentionInput
                                                value={piece.signerName || ''}
                                                onChange={(val) =>
                                                  handleUpdatePieceInBlock(selectedBlock.id, piece.id, (p) => ({
                                                    ...p,
                                                    signerName: val
                                                  }))
                                                }
                                                tokenContext={studioTokenContext}
                                                compact
                                                placeholder="Signer Name or @signatory_name"
                                                className="w-full px-2 py-1 rounded border border-slate-300 text-[10.5px]"
                                              />
                                              <AtMentionInput
                                                value={piece.signerTitle || ''}
                                                onChange={(val) =>
                                                  handleUpdatePieceInBlock(selectedBlock.id, piece.id, (p) => ({
                                                    ...p,
                                                    signerTitle: val
                                                  }))
                                                }
                                                tokenContext={studioTokenContext}
                                                compact
                                                placeholder="Title or @signatory_title"
                                                className="w-full px-2 py-1 rounded border border-slate-300 text-[10.5px]"
                                              />
                                            </div>
                                          </div>
                                        )}

                                        {/* 9. QR CODE PIECE EDITOR */}
                                        {piece.type === 'qr_code' && (
                                          <div className="space-y-1.5">
                                            <AtMentionInput
                                              value={piece.qrValue || ''}
                                              onChange={(val) =>
                                                handleUpdatePieceInBlock(selectedBlock.id, piece.id, (p) => ({
                                                  ...p,
                                                  qrValue: val
                                                }))
                                              }
                                              tokenContext={studioTokenContext}
                                              compact
                                              placeholder="URL or @tags (e.g. https://verify/@quote_ref)"
                                              className="w-full px-2 py-1 rounded border border-slate-300 text-[10.5px]"
                                            />
                                            <div className="flex items-center gap-1.5">
                                              <div className="flex-1">
                                                <AtMentionInput
                                                  value={piece.qrCaption || ''}
                                                  onChange={(val) =>
                                                    handleUpdatePieceInBlock(selectedBlock.id, piece.id, (p) => ({
                                                      ...p,
                                                      qrCaption: val
                                                    }))
                                                  }
                                                  tokenContext={studioTokenContext}
                                                  compact
                                                  placeholder="Caption (e.g. Scan to verify @quote_ref)"
                                                  className="w-full px-2 py-1 rounded border border-slate-300 text-[10.5px]"
                                                />
                                              </div>
                                              <input
                                                type="number"
                                                min={14}
                                                max={45}
                                                value={piece.qrSizeMm || 22}
                                                onChange={(e) =>
                                                  handleUpdatePieceInBlock(selectedBlock.id, piece.id, (p) => ({
                                                    ...p,
                                                    qrSizeMm: Number(e.target.value) || 22
                                                  }))
                                                }
                                                className="w-14 px-1.5 py-1 rounded border border-slate-300 text-[10.5px]"
                                                title="QR Size (mm)"
                                              />
                                            </div>
                                          </div>
                                        )}

                                        {/* 10. DIVIDER PIECE EDITOR */}
                                        {piece.type === 'divider' && (
                                          <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-1">
                                              {(['solid', 'dashed', 'double', 'blank'] as const).map((ds) => (
                                                <button
                                                  key={ds}
                                                  type="button"
                                                  onClick={() =>
                                                    handleUpdatePieceInBlock(selectedBlock.id, piece.id, (p) => ({
                                                      ...p,
                                                      dividerStyle: ds
                                                    }))
                                                  }
                                                  className={`px-2 py-0.5 rounded text-[9.5px] capitalize cursor-pointer ${
                                                    (piece.dividerStyle || 'solid') === ds
                                                      ? 'bg-indigo-600 text-white font-semibold'
                                                      : 'bg-slate-100 text-slate-600'
                                                  }`}
                                                >
                                                  {ds}
                                                </button>
                                              ))}
                                            </div>
                                            <div className="flex items-center gap-1">
                                              <span className="text-[9.5px] text-slate-500">Gap(mm):</span>
                                              <input
                                                type="number"
                                                min={1}
                                                max={25}
                                                value={piece.spacingMm ?? 2}
                                                onChange={(e) =>
                                                  handleUpdatePieceInBlock(selectedBlock.id, piece.id, (p) => ({
                                                    ...p,
                                                    spacingMm: Number(e.target.value) || 2
                                                  }))
                                                }
                                                className="w-12 px-1 py-0.5 rounded border border-slate-300 text-[10px]"
                                              />
                                            </div>
                                          </div>
                                        )}

                                        {/* 11. TWO-COLUMN SPLIT PIECE EDITOR */}
                                        {piece.type === 'columns' && (
                                          <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                              <span className="text-[10px] font-semibold text-slate-600">
                                                Split Ratio:
                                              </span>
                                              <div className="flex items-center gap-1">
                                                {(
                                                  [
                                                    { id: '50_50', label: '50 / 50' },
                                                    { id: '60_40', label: '60 / 40' },
                                                    { id: '40_60', label: '40 / 60' }
                                                  ] as const
                                                ).map((cr) => (
                                                  <button
                                                    key={cr.id}
                                                    type="button"
                                                    onClick={() =>
                                                      handleUpdatePieceInBlock(selectedBlock.id, piece.id, (p) => ({
                                                        ...p,
                                                        columnRatio: cr.id
                                                      }))
                                                    }
                                                    className={`px-2 py-0.5 rounded text-[9.5px] font-mono cursor-pointer ${
                                                      (piece.columnRatio || '50_50') === cr.id
                                                        ? 'bg-indigo-600 text-white font-bold'
                                                        : 'bg-slate-100 text-slate-600'
                                                    }`}
                                                  >
                                                    {cr.label}
                                                  </button>
                                                ))}
                                              </div>
                                            </div>
                                            <p className="text-[9.5px] text-slate-500">
                                              Left &amp; Right columns render side-by-side inside this block.
                                            </p>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}

                                  {/* + Add Lego Piece Palette (All 11 Piece Types) */}
                                  <div className="p-2.5 rounded-xl bg-slate-50 border border-dashed border-indigo-300 space-y-2">
                                    <span className="block text-[10px] font-bold text-indigo-950 uppercase tracking-wider">
                                      + Add Lego Piece to Block
                                    </span>
                                    <div className="grid grid-cols-3 gap-1">
                                      {(
                                        [
                                          { type: 'heading', label: 'Heading' },
                                          { type: 'rich_text', label: 'Rich Text' },
                                          { type: 'list', label: 'Bullet List' },
                                          { type: 'field_rows', label: 'Key-Value' },
                                          { type: 'table', label: 'Mini Table' },
                                          { type: 'money_summary', label: 'Money Rows' },
                                          { type: 'image', label: 'Image/Seal' },
                                          { type: 'signature_box', label: 'Sign Box' },
                                          { type: 'qr_code', label: 'QR Code' },
                                          { type: 'divider', label: 'Divider' },
                                          { type: 'columns', label: '2 Columns' }
                                        ] as const
                                      ).map((item) => (
                                        <button
                                          key={item.type}
                                          type="button"
                                          onClick={() =>
                                            handleAddPieceToBlock(selectedBlock.id, item.type)
                                          }
                                          className="py-1.5 px-1.5 rounded-lg border border-slate-200 bg-white hover:border-indigo-400 hover:bg-indigo-50 text-[10px] font-semibold text-slate-700 transition cursor-pointer text-center"
                                        >
                                          + {item.label}
                                        </button>
                                      ))}
                                    </div>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => handleDeleteBlock(selectedBlock.id)}
                                    className="w-full py-2 px-3 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 font-semibold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>Delete Custom Block</span>
                                  </button>
                                </div>
                              </div>
                            );
                          })()}
                        </>
                      )}

                      {/* Quick Jump & Add Blocks */}
                      <div className="pt-3 border-t border-slate-100 space-y-2.5">
                        <div>
                          <label className="block text-slate-400 text-[10px] uppercase tracking-wider mb-1.5 font-semibold">
                            Jump to Block
                          </label>
                          <div className="flex flex-wrap gap-1">
                            {layoutBlocks.map((b) => (
                              <button
                                key={b.id}
                                type="button"
                                onClick={() => handleInspectBlock(b.id)}
                                className={`px-2 py-1 rounded text-[10px] font-medium transition cursor-pointer ${
                                  selectedBlock.id === b.id
                                    ? 'bg-blue-600 text-white font-semibold'
                                    : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                                }`}
                              >
                                {getBlockMeta(b).label.split(' ')[0]}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-1.5 pt-1">
                          <button
                            type="button"
                            onClick={() => handleAddPageBreak(selectedBlock.id)}
                            title={`Insert a Page Break immediately above ${meta.label}`}
                            className="py-1.5 px-2 rounded-lg border border-dashed border-amber-300 bg-amber-50/50 hover:bg-amber-100/70 text-amber-800 font-semibold text-[11px] flex items-center justify-center gap-1 transition cursor-pointer"
                          >
                            <Scissors className="w-3 h-3 text-amber-600" />
                            <span>+ Page Break Above</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAddSpacer(selectedBlock.id)}
                            title={`Insert a Vertical Spacer immediately above ${meta.label}`}
                            className="py-1.5 px-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold text-[11px] flex items-center justify-center gap-1 transition cursor-pointer"
                          >
                            <MoveVertical className="w-3 h-3 text-slate-500" />
                            <span>+ Spacer Above</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </aside>
                );
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* Save as New Template Preset Modal */}
      {isSavePresetModalOpen && (
        <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-200 p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <BookmarkPlus className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-slate-900 text-sm">Save as New Template Preset</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsSavePresetModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Save your current layout (<strong className="capitalize">{headerLayout.replace('_', ' ')}</strong>),
              density (<strong className="capitalize">{tableDensity}</strong>), color theme (<strong className="capitalize">{themeAccent}</strong>),
              style (<strong className="capitalize">{blockStyle}</strong>), and section toggles as a reusable preset across your workspace.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Preset Name
              </label>
              <input
                type="text"
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                placeholder="e.g. Modern Executive Offer, Rapid Delivery Quick Quote"
                className="w-full text-xs rounded-xl border border-slate-300 p-2.5 text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSaveNewPreset();
                  }
                }}
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsSavePresetModalOpen(false)}
                disabled={isSavingPreset}
                className="px-3.5 py-1.5 border border-slate-300 text-slate-700 text-xs font-medium rounded-xl hover:bg-slate-50 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveNewPreset}
                disabled={isSavingPreset || !newPresetName.trim()}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSavingPreset ? 'Saving...' : 'Save Preset'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Pre-Print Unknown @Tag Warning Modal */}
      {pendingPrintWarnings && pendingPrintWarnings.length > 0 && (
        <div className="fixed inset-0 z-70 bg-slate-900/60 backdrop-blur-2xs flex items-center justify-center p-4 print:hidden">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-rose-200 p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">
                    Unrecognized <span className="font-mono text-rose-600">@tag</span> Detected
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Review before printing or exporting to PDF
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPendingPrintWarnings(null)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              The following <span className="font-mono font-semibold text-rose-700">@tags</span> do not match any known Quotation Studio field and may be typos:
            </p>

            <div className="max-h-44 overflow-y-auto space-y-1.5 bg-rose-50/50 border border-rose-200/80 rounded-xl p-3">
              {pendingPrintWarnings.map((w, idx) => (
                <div
                  key={`${w.token}_${idx}`}
                  className="flex items-center justify-between gap-2 text-xs bg-white px-2.5 py-1.5 rounded-lg border border-rose-200"
                >
                  <span className="font-mono font-bold text-rose-700">{w.token}</span>
                  <span className="text-[11px] text-slate-500 truncate">{w.location}</span>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setPendingPrintWarnings(null)}
                className="px-3.5 py-2 border border-slate-300 text-slate-700 text-xs font-semibold rounded-xl hover:bg-slate-50 transition cursor-pointer"
              >
                Cancel &amp; Fix Tags
              </button>
              <button
                type="button"
                onClick={() => {
                  setPendingPrintWarnings(null);
                  window.setTimeout(() => triggerPrintAfterImagesDecode(), 60);
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Anyway</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save Line Item to Catalog Modal */}
      <SaveToCatalogModal
        isOpen={Boolean(catalogModalTarget)}
        onClose={() => setCatalogModalTarget(null)}
        lineItem={catalogModalTarget?.item || null}
        currency={liveQuotation.currency || 'AED'}
        activeWorkspace={activeWorkspace}
        user={user}
        products={workspaceProducts}
        setProducts={setWorkspaceProducts}
        onSaved={(newProd) => {
          if (propSetProducts) {
            propSetProducts((prev) => [newProd, ...prev.filter((p) => p.id !== newProd.id)]);
          }
          if (catalogModalTarget?.itemKey && newProd.id) {
            setItemLinkedProductIds((prev) => ({
              ...prev,
              [catalogModalTarget.itemKey]: newProd.id!
            }));
          }
        }}
        triggerToast={triggerToast}
      />

      {/* Root-Level Print Portal mounted directly to document.body */}
      {typeof document !== 'undefined' && createPortal(
        <div id="quotation-print-portal" className="hidden print:block">
          <QuotationDocument
            quotation={liveQuotation}
            profile={activeProfile}
            visibleColumns={visibleColumns}
            tableDensity={tableDensity}
            tableFontScale={tableFontScale}
            fontSizeScale={fontSizeScale}
            headerConfig={headerConfig}
            recipientConfig={recipientConfig}
            footerConfig={footerConfig}
            pageMode={pageMode}
            columnConfig={visibleColumns}
            isCompactView={tableDensity === 'compact'}
            showBankDetails={showBankDetails}
            showStampAndSignatures={showCompanySeal || signatoryMode !== 'none'}
            user={user}
            signatoryName={signatoryName}
            signatoryTitle={signatoryTitle}
            blockStyle={blockStyle}
            globalCardRadius={globalCardRadius}
            cardsOrder={cardsOrder}
            subjectPlacement={subjectPlacement}
            layoutBlocks={layoutBlocks}
          />
        </div>,
        document.body
      )}

      {/* Scoped Print Portal Styles */}
      <style>{`
        @media print {
          #root {
            display: none !important;
          }
          #quotation-print-portal {
            display: block !important;
            position: static !important;
            width: 210mm !important;
            min-width: 210mm !important;
            max-width: 210mm !important;
            margin: 0 auto !important;
            padding: 0 !important;
            background: #ffffff !important;
          }
        }
      `}</style>
    </div>
  );
};

export const QuotationStudioModal: React.FC<QuotationStudioModalProps> = (props) => {
  if (!props.isOpen) return null;
  return <QuotationStudioModalInner {...props} />;
};

