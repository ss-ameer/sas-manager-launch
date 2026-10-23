import React from 'react';
import './QuotationDocument.module.css';
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
  QuotationFooterConfig
} from '../../types';
import { amountToWords, amountToWordsAED, formatAmountInWords } from '../../utils/numberToWords';
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
  }
};

export const DEFAULT_QUOTATION_BLOCKS: QuotationBlockConfig[] = [
  { id: 'terms', enabled: true, placement: 'left', style: 'framed', fontScale: 'standard', padding: 'standard' },
  { id: 'totals', enabled: true, placement: 'right', style: 'framed', fontScale: 'standard', padding: 'standard' },
  { id: 'remittance', enabled: true, placement: 'left', style: 'framed', fontScale: 'standard', padding: 'standard' },
  { id: 'signatory', enabled: true, placement: 'right', style: 'framed', fontScale: 'standard', padding: 'standard' },
  { id: 'acceptance', enabled: true, placement: 'full', style: 'framed', fontScale: 'standard', padding: 'standard' }
];

export const DEFAULT_HEADER_CONFIG: QuotationHeaderConfig = {
  alignment: 'split',
  showPhone: true,
  showEmail: true,
  showWebsite: true,
  showTrn: true,
  showCompanyName: true,
  logoSpacing: 'normal',
  logoHeightPx: 44,
  repeatHeaderOnSubsequentPages: true
};

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
  style: 'framed',
  layout: 'split',
  showAttention: true,
  showSalesRep: true,
  showValidity: true,
  showEnquiryRef: true,
  showSubject: true,
  recipientCardStyle: 'framed',
  recipientCardWidth: '50',
  recipientCardRadius: 'rounded',
  offerCardStyle: 'framed',
  offerCardWidth: '50',
  offerCardRadius: 'rounded'
};

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

  // Visual page-break cut line and multi-page running header emulation
  const sheetRef = React.useRef<HTMLElement | null>(null);
  const [pageMarkers, setPageMarkers] = React.useState<number[]>([1]);
  const [isMultiPage, setIsMultiPage] = React.useState<boolean>(false);

  React.useEffect(() => {
    const updateMarkers = () => {
      if (!sheetRef.current) return;
      const height = sheetRef.current.offsetHeight;
      const a4Px = (297 * 96) / 25.4;
      const totalPages = Math.ceil(height / a4Px);
      const multi = height > a4Px + 40;
      setIsMultiPage(multi);
      const markers: number[] = [];
      for (let i = 1; i <= Math.max(1, totalPages); i++) {
        if (i > 1 && height < (i - 1) * a4Px + 40) break;
        markers.push(i);
      }
      setPageMarkers(markers.length > 0 ? markers : [1]);
    };

    updateMarkers();
    const ro = new ResizeObserver(updateMarkers);
    if (sheetRef.current) ro.observe(sheetRef.current);
    return () => ro.disconnect();
  }, [showPageBreakGuides, quotation, layoutBlocks]);

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
    (showStampAndSignatures || quotation.show_company_seal || profile?.show_company_seal || true);

  const footerLayoutMode: 'split' | 'stacked' | 'seller_only' =
    resolvedFooterConfig.footerLayoutMode ||
    quotation.footerLayoutMode ||
    profile?.footerLayoutMode ||
    'split';

  // Resolve modular layout blocks
  const resolvedBlocks: QuotationBlockConfig[] = React.useMemo(() => {
    const raw =
      layoutBlocks ||
      quotation.layout_blocks ||
      (quotation as any).presentation_preset?.layout_blocks ||
      DEFAULT_QUOTATION_BLOCKS;

    return raw.map((b) => {
      let enabled = b.enabled;
      let placement = b.placement;

      if (b.id === 'remittance') {
        if (!showBankRemittance) {
          enabled = false;
        }
      } else if (b.id === 'signatory') {
        if (!showSignatories) {
          enabled = false;
        } else if (footerLayoutMode === 'split') {
          placement = 'left';
        } else if (footerLayoutMode === 'stacked') {
          placement = 'full';
        } else if (footerLayoutMode === 'seller_only') {
          placement = 'full';
        }
      } else if (b.id === 'acceptance') {
        if (!showCustomerAcceptance || footerLayoutMode === 'seller_only') {
          enabled = false;
        } else if (footerLayoutMode === 'split') {
          placement = 'right';
        } else if (footerLayoutMode === 'stacked') {
          placement = 'full';
        }
      }

      return {
        ...b,
        enabled,
        placement,
        style: b.style || resolvedBlockStyle,
        fontScale: b.fontScale || 'standard',
        padding: b.padding || 'standard'
      };
    });
  }, [
    layoutBlocks,
    quotation.layout_blocks,
    (quotation as any).presentation_preset?.layout_blocks,
    resolvedBlockStyle,
    showBankRemittance,
    showSignatories,
    showCustomerAcceptance,
    footerLayoutMode
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
    quotation.show_company_seal ?? profile?.show_company_seal ?? showStampAndSignatures;

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

  const repeatHeaderOnSubsequentPages =
    resolvedHeaderConfig.repeatHeaderOnSubsequentPages !== false &&
    quotation.repeatHeaderOnSubsequentPages !== false &&
    profile?.repeatHeaderOnSubsequentPages !== false;

  const resolvedRecipientConfig: QuotationRecipientConfig = {
    ...DEFAULT_RECIPIENT_CONFIG,
    ...(profile?.recipient_config || {}),
    ...(quotation.recipient_config || {}),
    ...(propRecipientConfig || {})
  };


  // Table Density helpers
  const isCompact = tableDensity === 'compact';
  const thPad = isCompact ? 'py-1.5' : 'py-2.5';
  const tdPad = isCompact ? 'py-1.5' : 'py-2.5';
  const tableFontSize = typoScale.body;
  const tableHeadingSize = typoScale.heading;

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
  const columnConfig: QuotationPresetColumns = propColumnConfig || propVisibleColumns || {};
  const showBrand = columnConfig.brand ?? true;
  const showModel = columnConfig.model ?? true;
  const showOrigin = columnConfig.origin ?? true;
  const showAvailability = columnConfig.availability ?? true;
  const showUnitPrice = columnConfig.unit_price ?? true;
  const showItemAttributes = columnConfig.showItemAttributes !== false;
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
  const renderCompactRunningHeader = (extraClass = '') => {
    if (!repeatHeaderOnSubsequentPages) return null;
    const quoteRef = quotation.formatted_quote_ref || quotation.quote_number || 'QT-DRAFT';
    const subjectText = quotation.subject?.trim();

    return (
      <div
        className={`compact-running-header flex justify-between items-center border-b border-slate-200 pb-1.5 mb-3 w-full bg-white ${extraClass}`}
        style={{ height: '26px' }}
      >
        {/* Left: Company Legal/Short Name */}
        <div className="text-[9px] print:text-[8px] font-bold text-slate-800 tracking-tight uppercase truncate max-w-[30%]">
          {senderEntityName || 'Company'}
        </div>

        {/* Middle: Project Subject & Quotation Ref No */}
        <div className="text-[8.5px] print:text-[7.5px] text-slate-600 font-medium truncate max-w-[280px] text-center px-2">
          {subjectText ? `${subjectText} • ` : ''}{quoteRef}
        </div>

        {/* Right: Date & Document Ref indicator */}
        <div className="text-[8px] print:text-[7.5px] text-slate-500 font-mono text-right shrink-0">
          {formatDate(quotation.created_at)} • {quoteRef}
        </div>
      </div>
    );
  };

  return (
    <div
      id="quotation-printable-document"
      className={`quotation-document-container w-[210mm] min-w-[210mm] max-w-[210mm] shrink-0 flex-shrink-0 bg-slate-100 p-2 sm:p-4 md:p-8 flex justify-center text-slate-900 text-left print:p-0 print:bg-white print:w-[210mm] print:min-w-[210mm] print:max-w-none print:m-0 print:block ${
        repeatHeaderOnSubsequentPages ? 'has-running-header' : ''
      }`}
      style={{ colorScheme: 'light' }}
    >
      {/* Scoped Print Stylesheet */}
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 15mm 14mm 15mm 14mm !important;
          }
          * {
            outline: none !important;
          }
          .quotation-running-header-print {
            display: none !important;
          }
          .has-running-header .quotation-running-header-print {
            display: flex !important;
            position: fixed;
            top: 0;
            left: 14mm;
            right: 14mm;
            height: 26px;
            z-index: 5;
            background: #ffffff !important;
            box-sizing: border-box !important;
          }
          .quotation-header-branding {
            position: relative !important;
            z-index: 20 !important;
            background: #ffffff !important;
          }
          .print-page-break {
            break-before: page !important;
            page-break-before: always !important;
            padding-top: 18mm !important;
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
          body {
            counter-reset: page 1;
          }
          .print-page-number::after {
            content: counter(page);
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
          .quotation-print-sheet {
            height: auto !important;
            min-height: auto !important;
            box-shadow: none !important;
            border: none !important;
            margin: 0 auto !important;
            padding: 0 !important;
            width: 100% !important;
            min-width: 100% !important;
            max-width: 100% !important;
            box-sizing: border-box !important;
          }
          .quotation-client-offer-grid {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
          .document-print-footer {
            position: static !important;
            width: 100% !important;
            background: transparent !important;
            padding-top: 8px !important;
            padding-bottom: 4px !important;
            border-top: 1px solid #e2e8f0 !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
          .quotation-print-sheet table,
          .quotation-print-sheet .terms-card,
          .quotation-print-sheet .remittance-card,
          .quotation-print-sheet header,
          .quotation-print-sheet footer,
          .quotation-print-sheet section,
          .quotation-print-sheet .top-accent-bar,
          .quotation-print-sheet .header-flex-container {
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

      {/* Decoupled A4 Page Sheet with Strict 210mm x 297mm Physical Geometry */}
      <article
        ref={sheetRef}
        className="quotation-print-sheet quotation-a4-sheet relative w-[210mm] min-w-[210mm] max-w-[210mm] shrink-0 flex-shrink-0 min-h-[297mm] mx-auto bg-white text-slate-800 shadow-xl border border-slate-200 flex flex-col justify-between font-sans box-border print:w-[210mm] print:min-w-[210mm] print:max-w-none print:min-h-[297mm] print:shadow-none print:border-none print:m-0"
        style={{
          boxSizing: 'border-box',
          paddingLeft: '14mm',
          paddingRight: '14mm',
          paddingTop: '14mm',
          paddingBottom: '16mm'
        }}
      >
        {/* Visual Page-Break Cut Line Emulation (screen only, print:hidden) */}
        {showPageBreakGuides &&
          pageMarkers.map((page) => (
            <div
              key={page}
              className="absolute left-0 right-0 pointer-events-none z-30 border-b-2 border-dashed border-rose-400/70 print:hidden"
              style={{ top: `${page * 297}mm` }}
            >
              <span className="absolute right-2 -top-2.5 bg-rose-50 text-rose-600 border border-rose-200 text-[10px] font-mono px-1.5 py-0.5 rounded shadow-xs flex items-center gap-1 select-none">
                <span>✂</span> A4 Page {page} Cutoff ({page * 297}mm)
              </span>
            </div>
          ))}


        {/* Multi-Page Running Header strictly isolated from Page 1 */}
        {repeatHeaderOnSubsequentPages && isMultiPage && (
          <div className="quotation-running-header-print hidden print:hidden pointer-events-none">
            {renderCompactRunningHeader('w-full')}
          </div>
        )}

        {/* Top Accent Stripe */}
        <div
          className="top-accent-bar absolute top-0 left-0 right-0 h-2 w-full print:w-full print:max-w-none"
          style={{ backgroundColor: accentColor, width: '100%', maxWidth: '100%' }}
        />

        {/* ========================================================
            HEADER & META BLOCK (VARIANTS: split, centered_banner, modern_compact)
           ======================================================== */}
        {/* ========================================================
            1. HEADER & COMPANY BRANDING (SELECTABLE STRUCTURAL SECTION)
           ======================================================== */}
        {(() => {
          const effectiveHeaderAlign = resolvedHeaderConfig.alignment || (headerLayout === 'centered_banner' ? 'centered' : 'split');
          const logoHeight = resolvedHeaderConfig.logoHeightPx || 44;
          const showPhone = resolvedHeaderConfig.showPhone !== false && Boolean(senderPhone);
          const showEmail = resolvedHeaderConfig.showEmail !== false && Boolean(senderEmail);
          const showWebsite = resolvedHeaderConfig.showWebsite !== false && Boolean(senderWebsite);
          const showTrn = resolvedHeaderConfig.showTrn !== false && Boolean(senderTrn);
          const showCompanyName = resolvedHeaderConfig.showCompanyName !== false;
          const logoSpacingClass =
            resolvedHeaderConfig.logoSpacing === 'none'
              ? 'mb-0 pb-0'
              : resolvedHeaderConfig.logoSpacing === 'tight'
              ? 'mb-2 pb-0'
              : resolvedHeaderConfig.logoSpacing === 'spacious'
              ? 'mb-6 pb-2'
              : 'mb-4 pb-1';

          return (
            <header
              className={`quotation-header-branding border-b border-slate-200 pb-4 mb-4 w-full header-flex-container relative group transition-all duration-150 rounded-lg quotation-structural-section ${
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

              {effectiveHeaderAlign === 'centered' ? (
                /* Centered Stack Banner */
                <div className={`flex flex-col items-center text-center space-y-1.5 w-full ${logoSpacingClass}`} style={{ width: '100%', maxWidth: '100%' }}>
                  <div className="pb-1">
                    {profile?.logo_url && !logoLoadFailed ? (
                      <img
                        src={profile.logo_url}
                        alt={senderEntityName}
                        style={{ height: `${logoHeight}px` }}
                        className="max-w-[240px] object-contain"
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
                /* Split Layout: Logo Left / Contacts Right (or vice-versa) */
                <div className={`flex flex-row justify-between items-start gap-4 w-full ${logoSpacingClass} ${logoPosition === 'right' ? 'flex-row-reverse' : ''}`} style={{ width: '100%', maxWidth: '100%' }}>
                  <div className={`${logoPosition === 'right' ? 'w-[45%] text-right flex-col items-end' : 'w-[52%] text-left'} flex-shrink-0 flex items-start gap-3.5`}>
                    {profile?.logo_url && !logoLoadFailed ? (
                      <img
                        src={profile.logo_url}
                        alt={senderEntityName}
                        style={{ height: `${logoHeight}px` }}
                        className="max-w-[180px] object-contain shrink-0"
                        onError={() => setLogoLoadFailed(true)}
                      />
                    ) : (
                      <div
                        className="rounded-lg flex items-center justify-center text-white font-bold text-xl shadow-sm shrink-0"
                        style={{ backgroundColor: accentColor, width: `${Math.max(40, logoHeight)}px`, height: `${Math.max(40, logoHeight)}px` }}
                      >
                        <Building2 className="w-6 h-6" />
                      </div>
                    )}
                    <div className="min-w-0">
                      {showCompanyName && (
                        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 leading-tight">
                          {senderEntityName}
                        </h1>
                      )}
                      {showTrn && (
                        <p className="text-xs font-semibold text-slate-600 mt-0.5">
                          TRN / VAT Reg: <span className="text-slate-900 font-mono">{senderTrn}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  <div className={`${logoPosition === 'right' ? 'w-[52%] text-left items-start' : 'w-[45%] text-right items-end'} flex-shrink-0 flex flex-col space-y-1`}>
                    {senderAddress && (
                      <p className="text-[9.5px] print:text-[8.5px] text-slate-600 print:text-black leading-snug break-words max-w-full">
                        <span>{senderAddress}</span>
                      </p>
                    )}
                    <div className={`flex flex-col gap-0.5 text-[9.5px] print:text-[8.5px] text-slate-600 print:text-black ${logoPosition === 'right' ? 'items-start' : 'items-end'}`}>
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
          );
        })()}

        {/* ========================================================
            2. CLIENT ("recipient_info") & COMMERCIAL OFFER ("quote_meta")
            DECOUPLED CARDS & SUBJECT BANNER
           ======================================================== */}
        {(() => {
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

          const recStyle = resolvedRecipientConfig.recipientCardStyle || resolvedRecipientConfig.style || 'framed';
          const recWidth = resolvedRecipientConfig.recipientCardWidth || (resolvedRecipientConfig.layout === 'stacked' ? '100' : '50');
          const recRadius = resolvedRecipientConfig.recipientCardRadius || resolvedGlobalRadius;

          const offerStyle = resolvedRecipientConfig.offerCardStyle || resolvedRecipientConfig.style || 'framed';
          const offerWidth = resolvedRecipientConfig.offerCardWidth || (resolvedRecipientConfig.layout === 'stacked' ? '100' : '50');
          const offerRadius = resolvedRecipientConfig.offerCardRadius || resolvedGlobalRadius;

          const isStacked = recWidth === '100' || offerWidth === '100' || resolvedRecipientConfig.layout === 'stacked';

          const showAttention = resolvedRecipientConfig.showAttention !== false;
          const showSalesRep = resolvedRecipientConfig.showSalesRep !== false;
          const showValidity = resolvedRecipientConfig.showValidity !== false;
          const showEnquiryRef = resolvedRecipientConfig.showEnquiryRef !== false;

          const getCardClasses = (style: 'framed' | 'minimal', radius: 'rounded' | 'sharp') => {
            const radiusClass = radius === 'sharp' ? 'rounded-none' : 'rounded-lg';
            if (style === 'framed') {
              return `border border-slate-200 ${radiusClass} p-3.5 bg-slate-50/40 print:bg-transparent print:border-slate-300 h-full flex flex-col justify-between`;
            }
            return `border-b border-slate-200 ${radiusClass} pb-2 bg-transparent h-full flex flex-col justify-between`;
          };

          const recipientCardBase = getCardClasses(recStyle, recRadius);
          const offerCardBase = getCardClasses(offerStyle, offerRadius);

          const renderSubjectBanner = () => {
            if (!Boolean(quotation.subject || enquiry?.subject) || resolvedRecipientConfig.showSubject === false) {
              return null;
            }
            return (
              <div
                className={`mb-3 px-3 py-1.5 bg-slate-50 border border-slate-200 text-xs font-medium text-slate-800 ${globalRadiusClass} relative group transition-all duration-150 print:bg-transparent print:border-slate-300 ${
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
              <div>
                <div className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 mb-1.5">
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
                <p className="text-xs text-slate-600 mt-1">
                  {clientAddress}
                </p>
              </div>
              <div className="text-xs text-slate-600 space-y-0.5 pt-2 mt-2 border-t border-slate-200/60">
                <p>
                  <span className="text-[10px] text-slate-500 font-medium">TRN: <span className="text-slate-700">{clientTrn || 'Not Registered'}</span></span>
                </p>
                {(clientPhone || clientEmail) && (
                  <p className="text-slate-500 text-[11px]">
                    {[clientPhone, clientEmail].filter(Boolean).join(' • ')}
                  </p>
                )}
              </div>
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
              <div>
                <div className="pb-1.5 border-b border-slate-200/60">
                  <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400">
                    Commercial Offer
                  </span>
                </div>
                <div className="py-2 text-center">
                  <div className="text-base sm:text-lg font-mono font-bold text-slate-900">
                    {quotation.formatted_quote_ref || quotation.quote_number}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/60 text-xs">
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
                {quotation.status && (
                  <div className="col-span-2 pt-0.5 flex items-center justify-between">
                    <span className="text-slate-400 text-[10px] uppercase">Status</span>
                    <span className="font-bold text-slate-700 uppercase tracking-wider text-[10.5px]">
                      {quotation.status}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );

          return (
            <>
              {resolvedSubjectPlacement === 'above_cards' && renderSubjectBanner()}
              <div
                className={`w-full mb-4 quotation-client-offer-grid break-inside-avoid print:mb-4 ${
                  isStacked
                    ? 'flex flex-col gap-3 print:flex print:flex-col print:gap-3'
                    : 'grid grid-cols-2 gap-4 print:grid print:grid-cols-2 print:gap-4'
                }`}
                style={{ width: '100%', maxWidth: '100%', breakInside: 'avoid', pageBreakInside: 'avoid' }}
              >
                {resolvedCardsOrder === 'offer_first' ? (
                  <>
                    {renderOfferCard()}
                    {renderRecipientCard()}
                  </>
                ) : (
                  <>
                    {renderRecipientCard()}
                    {renderOfferCard()}
                  </>
                )}
              </div>
              {resolvedSubjectPlacement === 'below_cards' && renderSubjectBanner()}
            </>
          );
        })()}

        {/* ========================================================
            ITEMIZED TABLE (ENTERPRISE 6-COLUMN STANDARD - SELECTABLE STRUCTURAL SECTION)
           ======================================================== */}
        <section
          className={`flex-1 my-2 w-full transition-all duration-150 ${
            (propGlobalCardRadius || quotation.globalCardRadius || profile?.globalCardRadius || resolvedRecipientConfig.globalCardRadius) === 'sharp' ? 'rounded-none' : 'rounded-lg'
          } quotation-structural-section relative group print:pt-4 ${
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
          {isInteractive && (
            <div className={`absolute -top-2.5 right-3 px-2 py-0.5 rounded text-[9px] font-semibold tracking-wide uppercase shadow-xs transition-opacity print:hidden z-10 ${
              isTableSelected ? 'bg-blue-600 text-white opacity-100' : 'bg-slate-200 text-slate-700 opacity-0 group-hover:opacity-100'
            }`}>
              {isTableSelected ? 'Editing Table Layout' : 'Click to Inspect Table'}
            </div>
          )}
          <div className={`${
            (propGlobalCardRadius || quotation.globalCardRadius || profile?.globalCardRadius || resolvedRecipientConfig.globalCardRadius) === 'sharp' ? 'rounded-none' : 'rounded-lg'
          } border border-slate-200 overflow-hidden w-full`} style={{ width: '100%', maxWidth: '100%' }}>
            <table
              className={`w-full border-collapse table-fixed text-left ${tableFontSize}`}
              style={{ tableLayout: 'fixed', width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}
            >
              <colgroup><col style={{ width: '5%' }} /><col style={{ width: '52%' }} /><col style={{ width: '7%' }} /><col style={{ width: '10%' }} /><col style={{ width: '12%' }} /><col style={{ width: '14%' }} /></colgroup>
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
                    className={`${thPad} px-1.5 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-600 border-r border-slate-200 last:border-r-0 text-center`}
                  >
                    #
                  </th>
                  <th
                    className={`${thPad} px-2.5 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-600 border-r border-slate-200 last:border-r-0 text-left`}
                  >
                    Description & Technical Specifications
                  </th>
                  <th
                    className={`${thPad} px-1.5 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-600 border-r border-slate-200 last:border-r-0 text-center font-mono`}
                  >
                    Qty
                  </th>
                  <th
                    className={`${thPad} px-1.5 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-600 border-r border-slate-200 last:border-r-0 text-center`}
                  >
                    UOM
                  </th>
                  <th
                    className={`${thPad} px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-600 border-r border-slate-200 last:border-r-0 text-right`}
                  >
                    Unit Price
                  </th>
                  <th
                    className={`${thPad} px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-600 text-right`}
                  >
                    Total ({currency})
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/80" style={{ display: 'table-row-group' }}>
                {quotation.line_items?.length ? (
                  quotation.line_items.map((item, idx) => (
                    <tr
                      key={item.id || idx}
                      className={`break-inside-avoid transition-colors ${
                        item.is_optional
                          ? 'bg-amber-50/50 hover:bg-amber-50'
                          : 'hover:bg-slate-50/60'
                      }`}
                      style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
                    >
                      <td className={`${tdPad} px-1.5 text-center font-mono text-slate-500 align-top ${tableFontSize} whitespace-nowrap`}>
                        {idx + 1}
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
                        {item.description && (
                          <div className={`${tableFontSize} text-slate-600 mt-1 leading-snug break-words whitespace-pre-line`}>
                            {item.description}
                          </div>
                        )}
                        {/* Technical Specifications & Attributes Block */}
                        {(() => {
                          if (!showItemAttributes) return null;

                          // Build combined attributes list
                          const allAttrs: Array<{ key: string; value: string }> = [];

                          // 1. Column attributes if enabled
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

                          // 2. Structured & dynamic item attributes
                          const rawAttrs: Array<{ key: string; value: string }> = [];
                          const itemAny = item as any;

                          if (Array.isArray(item.attributes)) {
                            item.attributes.forEach((attr) => {
                              if (attr && (attr.key || (attr as any).name) && attr.value) {
                                rawAttrs.push({ key: String(attr.key || (attr as any).name).trim(), value: String(attr.value).trim() });
                              }
                            });
                          } else if (itemAny.attributes && typeof itemAny.attributes === 'object') {
                            Object.entries(itemAny.attributes).forEach(([k, v]) => {
                              if (v !== undefined && v !== null && String(v).trim() !== '') {
                                rawAttrs.push({ key: k.trim(), value: String(v).trim() });
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

                          // Deduplicate
                          rawAttrs.forEach((attr) => {
                            const kLower = attr.key.toLowerCase();
                            if (!allAttrs.some((a) => a.key.toLowerCase() === kLower)) {
                              allAttrs.push(attr);
                            }
                          });

                          // Non-destructive redaction:
                          // 1. Global filter: hiddenAttributeKeys
                          // 2. Per-item filter: item.visible_attributes (or item.hidden_attributes)
                          const itemVisibleKeys = Array.isArray(item.visible_attributes)
                            ? item.visible_attributes.map((k) => k.toLowerCase())
                            : undefined;
                          const itemHiddenKeys = Array.isArray(item.hidden_attributes)
                            ? item.hidden_attributes.map((k) => k.toLowerCase())
                            : undefined;

                          const visibleAttrs = allAttrs.filter((attr) => {
                            const kLower = attr.key.toLowerCase();
                            // Check global hiddenAttributeKeys
                            if (hiddenAttributeKeys.some((k) => k.toLowerCase() === kLower)) {
                              return false;
                            }
                            // Check per-item explicit visible_attributes if defined
                            if (itemVisibleKeys !== undefined) {
                              return itemVisibleKeys.includes(kLower);
                            }
                            // Check per-item explicit hidden_attributes if defined
                            if (itemHiddenKeys !== undefined) {
                              return !itemHiddenKeys.includes(kLower);
                            }
                            return true;
                          });

                          if (visibleAttrs.length === 0) return null;

                          if (attributeDisplayFormat === 'inline_text') {
                            return (
                              <div className="text-[9px] print:text-[8.5px] text-slate-600 mt-1.5 leading-normal">
                                <span className="font-semibold text-slate-700">Specs: </span>
                                {visibleAttrs.map((a) => `${a.key}: ${a.value}`).join(' • ')}
                              </div>
                            );
                          }

                          // Default: pills
                          return (
                            <div className="flex flex-wrap gap-1.5 mt-2 print:mt-1.5">
                              {visibleAttrs.map((attr, idx) => (
                                <span
                                  key={idx}
                                  className="inline-flex items-center text-[8.5px] print:text-[8px] font-mono bg-slate-50 text-slate-800 px-1.5 py-0.5 rounded border border-slate-200 print:bg-transparent print:border-slate-300 print:text-black leading-tight"
                                >
                                  <span className="text-slate-700 font-semibold mr-1">{attr.key}:</span>
                                  <span>{attr.value}</span>
                                </span>
                              ))}
                            </div>
                          );
                        })()}
                      </td>
                      <td className={`${tdPad} px-1 text-center font-mono font-bold text-slate-800 align-top ${tableFontSize} whitespace-nowrap`}>
                        {item.quantity}
                      </td>
                      <td className="text-[9.5px] font-mono text-center py-1.5 px-1 leading-tight text-slate-700 break-words align-top">
                        <span className="block px-1 text-center uppercase" title={item.unit || 'pcs'}>
                          {item.unit || 'pcs'}
                        </span>
                      </td>
                      <td className={`${tdPad} px-2 text-right font-mono text-slate-700 align-top ${tableFontSize} tabular-nums whitespace-nowrap`}>
                        {Number(item.unit_price || 0).toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}
                      </td>
                      <td className={`${tdPad} px-2.5 text-right font-mono font-bold text-slate-900 align-top ${tableFontSize} tabular-nums whitespace-nowrap`}>
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
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-8 text-center text-slate-400 italic"
                    >
                      No line items specified for this offer.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* ========================================================
            MODULAR DOCUMENT BLOCKS GRID (CSS GRID ROW-SLOT ENGINE)
           ======================================================== */}
        {(() => {
          // Render functions for each modular document block
          const renderTermsBlock = () => {
            const priceBasis = quotation.price_basis?.trim();
            const paymentTerms = quotation.payment_terms?.trim();
            const validityText = quotation.valid_until && quotation.valid_until.trim() !== ''
              ? `Valid until ${formatDate(quotation.valid_until)}`
              : undefined;

            const customNotes = (quotation.custom_notes && quotation.custom_notes.trim() !== '')
              ? quotation.custom_notes.trim()
              : (quotation.applied_terms && !quotation.applied_terms.includes('Price Basis:') && quotation.applied_terms.trim() !== '')
              ? quotation.applied_terms.trim()
              : undefined;

            const hasAnyContent = Boolean(priceBasis || paymentTerms || validityText || customNotes);

            return (
              <div className="terms-card break-inside-avoid page-break-inside-avoid flex-1 flex flex-col justify-between w-full" style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
                <div>
                  <div className="flex items-center gap-1.5 font-bold text-slate-800 uppercase tracking-wider text-[calc(var(--block-base)*1.05)] pb-1 border-b border-slate-200">
                    <FileCheck className="w-3.5 h-3.5 text-slate-500" />
                    Commercial Terms & Conditions
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
                  {amountToWords(quotation.grand_total, currency)}
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
                  {resolvedShowCompanySeal && profile?.stamp_seal_url && (
                    <div className="flex flex-col items-center">
                      <img
                        src={profile.stamp_seal_url}
                        alt="Official Seal"
                        className="h-16 w-16 object-contain opacity-90 mix-blend-multiply"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                      <span className="text-[calc(var(--block-base)*0.85)] text-slate-400 mt-0.5 uppercase tracking-wider">
                        Company Seal
                      </span>
                    </div>
                  )}

                  {/* Signatories Rendering */}
                  <div className="flex gap-4 justify-end">
                    {resolvedSignatories.map((sig, sIdx) => (
                      <div key={sIdx} className="text-center min-w-[120px]">
                        <div className="h-10 flex items-end justify-center mb-1">
                          {signatureStyle === 'image' && sig.signature_url ? (
                            <img
                              src={sig.signature_url}
                              alt={sig.name}
                              className="max-h-10 object-contain"
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
                            /* 'line' style: clean spacing above the single baseline below */
                            <div className="h-4" />
                          )}
                        </div>
                        <div className="w-24 border-b border-slate-300 mx-auto mb-1" />
                        <p className="font-bold text-slate-800 text-[calc(var(--block-base)*1.1)] leading-tight">{sig.name}</p>
                        <p className="text-[calc(var(--block-base)*0.95)] text-slate-500 leading-tight">{sig.title}</p>
                      </div>
                    ))}
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
                    Customer Acceptance & Confirmation
                  </span>
                  <span className="text-[calc(var(--block-base)*0.85)] text-slate-400 italic">
                    Sign & Return Copy with Purchase Order
                  </span>
                </div>
                <p className="text-[var(--block-base)] text-slate-600 my-1 leading-snug">
                  We hereby accept and approve this commercial offer <span className="font-semibold text-slate-800">#{quotation.formatted_quote_ref || quotation.quote_number}</span> in accordance with the specified quantities, prices, and terms.
                </p>
              </div>

              {placement === 'full' ? (
                /* Standard 4-column layout for full width */
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
                /* Adaptive 2x2 grid for 50% left/right placement */
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

          // Filter active blocks respecting enabled flag and legacy visibility options if layout_blocks not explicitly provided
          const activeBlocks = resolvedBlocks.filter((b) => {
            if (b.enabled === false) return false;
            if (!layoutBlocks && !quotation.layout_blocks && !(quotation as any).presentation_preset?.layout_blocks) {
              if (b.id === 'terms' && !resolvedShowCommercialTerms) return false;
              if (b.id === 'remittance' && !resolvedShowBankDetails) return false;
              if (b.id === 'signatory' && !showStampAndSignatures && !resolvedShowCompanySeal) return false;
              if (b.id === 'acceptance' && !customerAcceptanceEnabled) return false;
            }
            return true;
          });

          // Row-slot engine: Pair sequential Left and Right blocks into the same grid row to equalize height (items-stretch),
          // while allowing single-sided blocks (e.g. Right only) to remain anchored to their column track with natural height.
          let currentRow = 1;
          let rowHasLeft = false;
          let rowHasRight = false;

          const positionedBlocks = activeBlocks.map((b) => {
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
              // placement === 'right'
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
            <>
              {/* On-screen Page 2+ Continuation Header (Strictly Normal DOM Flow, NEVER Absolute) */}
              {repeatHeaderOnSubsequentPages && isMultiPage && (
                <div className="quotation-continuation-header-flow w-full my-4 print:hidden">
                  {/* Visual Page Break Indicator in Normal Flow */}
                  <div className="relative py-2.5 flex items-center justify-center">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t-2 border-dashed border-rose-300"></div>
                    </div>
                    <div className="relative bg-rose-50 px-3 py-0.5 rounded-full border border-rose-200 text-rose-700 text-[10px] font-mono flex items-center gap-1.5 shadow-2xs">
                      <span>✂</span> A4 Page Break • Continuation Sheet (Page 2)
                    </div>
                  </div>

                  {/* Normal Flow Running Header — pushes content down, zero collision */}
                  <div className="mt-2 p-2 bg-slate-50/80 border border-slate-200/90 rounded-lg">
                    <div className="text-[8px] uppercase font-mono text-blue-700 font-bold mb-1 flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <span>📄</span> Continuation Sheet Running Header
                      </span>
                      <span className="text-[7.5px] text-slate-400 font-normal">Page 2+ • Normal DOM Flow</span>
                    </div>
                    {renderCompactRunningHeader('mb-0 pb-0 border-b-0')}
                  </div>
                </div>
              )}

              <section className="my-3 w-full print:my-2" style={{ width: '100%', maxWidth: '100%' }}>
              <div
                className="quotation-blocks-grid grid grid-cols-2 gap-3 mt-3 items-stretch w-full"
                style={{ width: '100%', maxWidth: '100%' }}
              >
                {positionedBlocks.map(({ b, gridRowStart, gridColumnStart, gridColumnEnd, placementClass }) => {
                  const baseFontSize = b.fontScale === 'compact' ? '8.5px' : b.fontScale === 'prominent' ? '11.5px' : typoScale.rawBase;
                  const padClass = b.padding === 'compact' ? 'p-2' : 'p-3';
                  const isSelected = activeSelectedSection === b.id;
                  const isInteractive = Boolean(onSelectSection || onSelectBlock);

                  const cardStyleClass = [
                    padClass,
                    `${(propGlobalCardRadius || quotation.globalCardRadius || profile?.globalCardRadius || resolvedRecipientConfig.globalCardRadius) === 'sharp' ? 'rounded-none' : 'rounded-lg'} h-full flex flex-col justify-between transition-all duration-150`,
                    b.style === 'minimal'
                      ? 'border border-transparent bg-transparent'
                      : 'border border-slate-200 bg-slate-50/50',
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
                        {b.id === 'terms' && renderTermsBlock()}
                        {b.id === 'totals' && renderTotalsBlock()}
                        {b.id === 'remittance' && renderRemittanceBlock()}
                        {b.id === 'signatory' && renderSignatoryBlock()}
                        {b.id === 'acceptance' && renderAcceptanceBlock(b.placement)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </>
        );
      })()}

        {/* ========================================================
            DOCUMENT SYSTEM MICRO-FOOTER WATERMARK
           ======================================================== */}
        {/* ========================================================
            DOCUMENT SYSTEM MICRO-FOOTER WATERMARK (SELECTABLE STRUCTURAL SECTION)
           ======================================================== */}
        <footer
          className={`document-print-footer mt-2 pt-2 border-t border-slate-200 text-xs break-inside-avoid w-full print:mt-0 print:border-t-0 relative group transition-all duration-150 rounded-lg quotation-structural-section ${
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
          style={{ width: '100%', maxWidth: '100%', breakInside: 'avoid', pageBreakInside: 'avoid' }}
        >
          {isInteractive && (
            <div className={`absolute -top-2.5 right-3 px-2 py-0.5 rounded text-[9px] font-semibold tracking-wide uppercase shadow-xs transition-opacity print:hidden z-10 ${
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
              {quotation.revision_number !== undefined && (
                <>
                  <span>•</span>
                  <span>Rev {quotation.revision_number}</span>
                </>
              )}
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
                    Page <span className="print:hidden">1</span><span className="hidden print:inline print-page-number" />
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
      </article>
    </div>
  );
};
