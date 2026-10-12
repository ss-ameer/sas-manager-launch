import React from 'react';
import './QuotationDocument.module.css';
import {
  Quotation,
  WorkspaceDocumentProfile,
  QuotationPreset,
  QuotationPresetColumns,
  DocumentProfileBankAccount,
  QuotationThemeAccent,
  QuotationSignatureStyle,
  QuotationLogoPosition,
  QuotationHeaderLayout,
  QuotationTableDensity
} from '../../types';
import { formatAmountInWords } from '../../utils/numberToWords';
import {
  FileText,
  Building2,
  Calendar,
  Clock,
  Mail,
  Phone,
  Globe,
  MapPin,
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

export interface QuotationDocumentProps {
  quotation: Quotation;
  profile?: WorkspaceDocumentProfile | null;
  visibleColumns?: QuotationPresetColumns;
  isCompactView?: boolean;
  showBankDetails?: boolean;
  showStampAndSignatures?: boolean;
  user?: { displayName?: string; name?: string; email?: string } | null;
  signatoryName?: string;
  signatoryTitle?: string;
}

export const QuotationDocument: React.FC<QuotationDocumentProps> = ({
  quotation,
  profile,
  visibleColumns = {} as QuotationPresetColumns,
  isCompactView = true,
  showBankDetails = true,
  showStampAndSignatures = true,
  user,
  signatoryName,
  signatoryTitle
}: QuotationDocumentProps) => {
  const [logoLoadFailed, setLogoLoadFailed] = React.useState(false);
  const currency = quotation.currency || quotation.applied_bank_account?.currency || 'AED';

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
    quotation.table_density || profile?.table_density || (isCompactView ? 'compact' : 'comfortable');
  const resolvedShowBankDetails: boolean =
    quotation.show_bank_details ?? profile?.show_bank_details ?? showBankDetails;
  const resolvedShowCommercialTerms: boolean =
    quotation.show_commercial_terms ?? profile?.show_commercial_terms ?? true;
  const resolvedShowCompanySeal: boolean =
    quotation.show_company_seal ?? profile?.show_company_seal ?? showStampAndSignatures;

  // Table Density helpers
  const isCompact = tableDensity === 'compact';
  const thPad = isCompact ? 'py-1.5' : 'py-2.5';
  const tdPad = isCompact ? 'py-1.5' : 'py-2.5';
  const tableFontSize = isCompact ? 'text-[11px]' : 'text-xs';

  const amountInWordsEnabled =
    quotation.amount_in_words_enabled ?? profile?.amount_in_words_enabled ?? true;
  const customerAcceptanceEnabled =
    quotation.customer_acceptance_enabled ?? profile?.customer_acceptance_enabled ?? true;
  const signatoryType: 'single' | 'dual' =
    quotation.signatory_type ||
    profile?.signatory_type ||
    (quotation.signatories && quotation.signatories.length > 1 ? 'dual' : 'single');
  const signatureStyle: QuotationSignatureStyle =
    quotation.signature_style || profile?.signature_style || 'script';

  // Bank account selection: prefer explicitly applied on quotation, then profile default, then first profile account
  const bankAccount: DocumentProfileBankAccount | undefined =
    quotation.applied_bank_account ||
    profile?.bank_accounts?.find((b) => b.is_default) ||
    profile?.bank_accounts?.[0];

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

  // Determine active columns
  const showBrand = visibleColumns.brand ?? true;
  const showModel = visibleColumns.model ?? true;
  const showOrigin = visibleColumns.origin ?? true;
  const showAvailability = visibleColumns.availability ?? true;
  const showUnitPrice = visibleColumns.unit_price ?? true;

  // Dynamic 100% Table Math & A4 Canvas Budget
  // Mathematically guarantees the sum of all active columns is ALWAYS exactly 100%,
  // while keeping total min-width (~545px) well within the 186mm A4 canvas (703px) to prevent print clipping.
  const colWidths = React.useMemo(() => {
    const slPct = 4;
    const qtyPct = 6;
    const uomPct = 5;
    const totalPct = 12;
    const unitPricePct = showUnitPrice ? 11 : 0;
    const brandPct = showBrand ? 7.5 : 0;
    const modelPct = showModel ? 7.5 : 0;
    const originPct = showOrigin ? 7.5 : 0;
    const deliveryPct = showAvailability ? 7.5 : 0;

    const otherColumnsSum =
      slPct +
      qtyPct +
      uomPct +
      totalPct +
      unitPricePct +
      brandPct +
      modelPct +
      originPct +
      deliveryPct;

    // Item & Description dynamically absorbs the exact remainder to lock the sum to 100%
    const descPct = Math.round((100 - otherColumnsSum) * 10) / 10;

    return {
      sl: { pct: slPct, style: { width: `${slPct}%` }, className: 'min-w-[24px]' },
      desc: { pct: descPct, style: { width: `${descPct}%` }, className: 'min-w-[150px]' },
      brand: { pct: brandPct, style: { width: `${brandPct}%` }, className: 'min-w-[55px]' },
      model: { pct: modelPct, style: { width: `${modelPct}%` }, className: 'min-w-[55px]' },
      origin: { pct: originPct, style: { width: `${originPct}%` }, className: 'min-w-[55px]' },
      delivery: { pct: deliveryPct, style: { width: `${deliveryPct}%` }, className: 'min-w-[55px]' },
      qty: { pct: qtyPct, style: { width: `${qtyPct}%` }, className: 'min-w-[34px]' },
      uom: { pct: uomPct, style: { width: `${uomPct}%` }, className: 'min-w-[32px]' },
      unitPrice: { pct: unitPricePct, style: { width: `${unitPricePct}%` }, className: 'min-w-[65px]' },
      total: { pct: totalPct, style: { width: `${totalPct}%` }, className: 'min-w-[70px]' }
    };
  }, [showBrand, showModel, showOrigin, showAvailability, showUnitPrice]);

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

  // Resolved Signatories for executive signatory block
  const resolvedSignatories = React.useMemo(() => {
    const list: Array<{ name: string; title: string; signature_url?: string }> = [];
    const isInitialsOrSS = (val?: string | null) => {
      if (!val) return true;
      const trimmed = val.trim();
      return !trimmed || trimmed === 'SS' || /^[A-Z]{2,3}$/.test(trimmed);
    };

    const rawPName =
      signatoryName ||
      quotation.primary_signatory_name ||
      quotation.signatories?.[0]?.name ||
      profile?.primary_signatory_name;

    let pName = rawPName;
    if (isInitialsOrSS(pName)) {
      if (profile?.primary_signatory_name && !isInitialsOrSS(profile.primary_signatory_name)) {
        pName = profile.primary_signatory_name.trim();
      } else if (user?.displayName && !isInitialsOrSS(user.displayName)) {
        pName = user.displayName.trim();
      } else if (user?.name && !isInitialsOrSS(user.name)) {
        pName = user.name.trim();
      } else {
        pName = 'Syed Sibuma';
      }
    }

    const pTitle =
      signatoryTitle ||
      quotation.primary_signatory_title ||
      quotation.signatories?.[0]?.designation ||
      profile?.primary_signatory_title ||
      'Managing Director';
    const pUrl = quotation.signatories?.[0]?.signature_url;

    list.push({ name: pName || 'Syed Sibuma', title: pTitle, signature_url: pUrl });

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
    user?.displayName,
    user?.name,
    quotation.primary_signatory_name,
    quotation.primary_signatory_title,
    quotation.secondary_signatory_name,
    quotation.secondary_signatory_title,
    quotation.signatories,
    profile?.primary_signatory_name,
    profile?.primary_signatory_title,
    profile?.secondary_signatory_name,
    profile?.secondary_signatory_title,
    signatoryType
  ]);

  return (
    <div
      id="quotation-printable-document"
      className="quotation-document-container w-full bg-slate-100 p-2 sm:p-4 md:p-8 flex justify-center text-slate-900 print:p-0 print:bg-white"
      style={{ colorScheme: 'light' }}
    >
      {/* Scoped Print Stylesheet */}
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 0mm !important;
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
            width: 210mm !important;
            min-width: 210mm !important;
            max-width: 210mm !important;
            margin: 0 auto !important;
            padding: 0 !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
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
            min-height: 0 !important;
            box-shadow: none !important;
            border: none !important;
            margin: 0 auto !important;
            padding: 12mm !important;
            width: 210mm !important;
            min-width: 210mm !important;
            max-width: none !important;
            box-sizing: border-box !important;
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
        }
      `}</style>

      {/* Decoupled A4 Page Sheet */}
      <article
        className="quotation-print-sheet quotation-a4-sheet relative w-full max-w-[210mm] min-h-[297mm] bg-white text-slate-800 shadow-xl border border-slate-200 p-8 sm:p-12 flex flex-col justify-between font-sans print:w-[210mm] print:min-w-[210mm] print:max-w-none print:h-auto print:min-h-0 print:m-0 print:p-[12mm] print:box-border print:shadow-none print:border-none"
        style={{
          boxSizing: 'border-box'
        }}
      >
        {/* Top Accent Stripe */}
        <div
          className="top-accent-bar absolute top-0 left-0 right-0 h-2 w-full print:w-full print:max-w-none"
          style={{ backgroundColor: accentColor, width: '100%', maxWidth: '100%' }}
        />

        {/* ========================================================
            HEADER & META BLOCK (VARIANTS: split, centered_banner, modern_compact)
           ======================================================== */}
        {headerLayout === 'centered_banner' ? (
          <header className="border-b border-slate-200 pb-5 mb-5 w-full header-flex-container" style={{ width: '100%', maxWidth: '100%' }}>
            {/* Centered Top Banner */}
            <div className="flex flex-col items-center text-center space-y-1.5 w-full" style={{ width: '100%', maxWidth: '100%' }}>
              <div className="pb-1">
                {profile?.logo_url && !logoLoadFailed ? (
                  <img
                    src={profile.logo_url}
                    alt={senderEntityName}
                    className="h-14 max-w-[240px] object-contain"
                    onError={() => setLogoLoadFailed(true)}
                  />
                ) : (
                  <div
                    className="w-12 h-12 rounded-lg flex items-center justify-center text-white font-bold text-xl shadow-sm"
                    style={{ backgroundColor: accentColor }}
                  >
                    <Building2 className="w-6 h-6" />
                  </div>
                )}
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 leading-tight">
                {senderEntityName}
              </h1>
              {/* Centered Address, Contact & TRN Details with divider dots */}
              {(() => {
                const contactSegments: React.ReactNode[] = [];
                if (senderAddress) {
                  contactSegments.push(
                    <span key="addr" className="inline-flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{senderAddress}</span>
                    </span>
                  );
                }
                if (senderPhone) {
                  contactSegments.push(
                    <span key="phone" className="inline-flex items-center gap-1">
                      <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                      <span>{senderPhone}</span>
                    </span>
                  );
                }
                if (senderEmail) {
                  contactSegments.push(
                    <span key="email" className="inline-flex items-center gap-1">
                      <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                      <span>{senderEmail}</span>
                    </span>
                  );
                }
                if (senderTrn) {
                  contactSegments.push(
                    <span key="trn" className="inline-flex items-center gap-1">
                      <span className="text-slate-400 font-medium">TRN:</span>
                      <span className="font-mono font-semibold text-slate-700">{senderTrn}</span>
                    </span>
                  );
                }
                if (senderWebsite) {
                  contactSegments.push(
                    <span key="web" className="inline-flex items-center gap-1">
                      <Globe className="w-3 h-3 text-slate-400 shrink-0" />
                      <span>{senderWebsite}</span>
                    </span>
                  );
                }

                if (contactSegments.length === 0) return null;

                return (
                  <div className="flex flex-wrap justify-center items-center gap-x-2.5 gap-y-1 text-xs text-slate-500 pt-1 leading-relaxed">
                    {contactSegments.map((segment, idx) => (
                      <span key={idx} className="inline-flex items-center gap-2 whitespace-nowrap">
                        <span>{segment}</span>
                        {idx < contactSegments.length - 1 && (
                          <span className="text-slate-300 font-bold select-none shrink-0" aria-hidden="true">•</span>
                        )}
                      </span>
                    ))}
                  </div>
                );
              })()}
            </div>

            {/* Accent Separator Line */}
            <div
              className="my-4 h-0.5 w-full rounded-full"
              style={{ backgroundColor: accentColor }}
            />

            {/* Two-Column Balanced Strip: Client Snapshot (Left) + Quotation Meta (Right) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch w-full" style={{ width: '100%', maxWidth: '100%' }}>
              {/* Client Snapshot Card */}
              <div className="bg-slate-50/70 border border-slate-200/70 rounded-xl p-3.5 flex flex-col justify-between w-full" style={{ width: '100%', maxWidth: '100%' }}>
                <div>
                  <div className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 mb-1.5">
                    Submitted To / Attention To
                  </div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {quotation.client_snapshot?.entity_name || 'Client Name / Unspecified'}
                  </h3>
                  {quotation.client_snapshot?.contact_person && (
                    <p className="text-xs text-slate-700 font-medium mt-0.5">
                      Attn:{' '}
                      <span className="text-slate-900 font-semibold">
                        {quotation.client_snapshot.contact_person}
                      </span>
                    </p>
                  )}
                  {quotation.client_snapshot?.address && (
                    <p className="text-xs text-slate-600 mt-1">
                      {quotation.client_snapshot.address}
                    </p>
                  )}
                </div>
                <div className="text-xs text-slate-600 space-y-0.5 pt-2 mt-2 border-t border-slate-200/60">
                  {quotation.client_snapshot?.email && (
                    <p><span className="text-slate-400">Email:</span> {quotation.client_snapshot.email}</p>
                  )}
                  {quotation.client_snapshot?.phone && (
                    <p><span className="text-slate-400">Tel:</span> {quotation.client_snapshot.phone}</p>
                  )}
                  {quotation.client_snapshot?.trn && (
                    <p><span className="text-slate-400">Client TRN:</span> <span className="font-mono">{quotation.client_snapshot.trn}</span></p>
                  )}
                </div>
              </div>

              {/* Quotation Meta Identity Card */}
              <div className="bg-slate-50/70 border border-slate-200/70 rounded-xl p-3.5 flex flex-col justify-between w-full" style={{ width: '100%', maxWidth: '100%' }}>
                <div className="flex items-center justify-between pb-1.5 border-b border-slate-200/60">
                  <span className="text-xs uppercase font-extrabold tracking-wider text-slate-500">
                    Commercial Offer
                  </span>
                  <span
                    className="px-2 py-0.5 text-xs font-bold rounded-full text-white"
                    style={{ backgroundColor: accentColor }}
                  >
                    {`R${quotation.revision_number}`}
                  </span>
                </div>
                <div className="py-2 text-center">
                  <div className="text-base sm:text-lg font-mono font-bold text-slate-900">
                    {quotation.formatted_quote_ref || quotation.quote_number}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/60 text-xs">
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase block">Date</span>
                    <span className="font-semibold text-slate-800">{formatDate(quotation.created_at)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase block">Valid Until</span>
                    <span className="font-semibold text-slate-800">{formatDate(quotation.valid_until)}</span>
                  </div>
                </div>
              </div>
            </div>
          </header>
        ) : headerLayout === 'modern_compact' ? (
          <header className="border-b border-slate-200 pb-3.5 mb-4 w-full header-flex-container" style={{ width: '100%', maxWidth: '100%' }}>
            {/* Top Bar: Compact Branding & Document Ref */}
            <div className="flex items-center justify-between gap-4 pb-2.5 w-full" style={{ width: '100%', maxWidth: '100%' }}>
              <div className="flex items-center gap-3">
                {profile?.logo_url && !logoLoadFailed ? (
                  <img
                    src={profile.logo_url}
                    alt={senderEntityName}
                    className="h-10 max-w-[160px] object-contain"
                    onError={() => setLogoLoadFailed(true)}
                  />
                ) : (
                  <div
                    className="w-9 h-9 rounded-md flex items-center justify-center text-white font-bold text-sm shadow-xs"
                    style={{ backgroundColor: accentColor }}
                  >
                    <Building2 className="w-5 h-5" />
                  </div>
                )}
                <div>
                  <h1 className="text-base sm:text-lg font-bold tracking-tight text-slate-900 leading-tight">
                    {senderEntityName}
                  </h1>
                  {senderTrn && (
                    <p className="text-[11px] font-medium text-slate-500">
                      TRN: <span className="font-mono text-slate-800">{senderTrn}</span>
                    </p>
                  )}
                </div>
              </div>

              <div className="text-right">
                <div className="flex items-center justify-end gap-1.5">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                    QUOTATION
                  </span>
                  <span
                    className="px-1.5 py-0.5 text-[10px] font-bold rounded text-white"
                    style={{ backgroundColor: accentColor }}
                  >
                    {`R${quotation.revision_number}`}
                  </span>
                </div>
                <div className="text-sm font-mono font-bold text-slate-900 mt-0.5">
                  {quotation.formatted_quote_ref || quotation.quote_number}
                </div>
              </div>
            </div>

            {/* Inline Sleek Metadata Strip */}
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-1.5 border-y border-slate-100 text-[11px] text-slate-600 bg-slate-50/60 px-2.5 rounded-md w-full" style={{ width: '100%', maxWidth: '100%' }}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                {senderAddress && <span>{senderAddress}</span>}
                {senderPhone && <span>• Tel: {senderPhone}</span>}
                {senderEmail && <span>• {senderEmail}</span>}
              </div>
              <div className="flex items-center gap-3 font-medium">
                <span>Date: <strong className="text-slate-800">{formatDate(quotation.created_at)}</strong></span>
                {quotation.valid_until && (
                  <span>Valid: <strong className="text-slate-800">{formatDate(quotation.valid_until)}</strong></span>
                )}
              </div>
            </div>

            {/* Sleek Client Strip */}
            <div className="mt-2.5 py-2 px-3 bg-slate-50/80 border border-slate-200/70 rounded-lg text-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 w-full" style={{ width: '100%', maxWidth: '100%' }}>
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mr-2">Client:</span>
                <span className="font-bold text-slate-900">{quotation.client_snapshot?.entity_name || 'Valued Client'}</span>
                {quotation.client_snapshot?.contact_person && (
                  <span className="text-slate-600 ml-1.5">(Attn: {quotation.client_snapshot.contact_person})</span>
                )}
              </div>
              <div className="flex items-center gap-3 text-[11px] text-slate-600">
                {quotation.client_snapshot?.email && <span>{quotation.client_snapshot.email}</span>}
                {quotation.client_snapshot?.phone && <span>{quotation.client_snapshot.phone}</span>}
                {quotation.client_snapshot?.trn && (
                  <span>TRN: <strong className="font-mono text-slate-800">{quotation.client_snapshot.trn}</strong></span>
                )}
              </div>
            </div>
          </header>
        ) : (
          /* 'split' (Classic) Default Layout */
          <header className="border-b border-slate-200 pb-6 mb-6 w-full header-flex-container" style={{ width: '100%', maxWidth: '100%' }}>
            <div className="flex flex-col sm:flex-row justify-between items-start gap-6 w-full" style={{ width: '100%', maxWidth: '100%' }}>
              {/* Left: Organization Branding & Details */}
              <div className="flex-1 space-y-2">
                {logoPosition === 'center' ? (
                  <div className="flex flex-col items-start space-y-2">
                    <div className="w-full flex justify-center pb-2">
                      {profile?.logo_url && !logoLoadFailed ? (
                        <img
                          src={profile.logo_url}
                          alt={senderEntityName}
                          className="h-14 max-w-[220px] object-contain"
                          onError={() => setLogoLoadFailed(true)}
                        />
                      ) : (
                        <div
                          className="w-12 h-12 rounded-lg flex items-center justify-center text-white font-bold text-xl shadow-sm"
                          style={{ backgroundColor: accentColor }}
                        >
                          <Building2 className="w-6 h-6" />
                        </div>
                      )}
                    </div>
                    <div>
                      <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 leading-tight">
                        {senderEntityName}
                      </h1>
                      {senderTrn && (
                        <p className="text-xs font-semibold text-slate-600 mt-0.5">
                          TRN / VAT Reg: <span className="text-slate-900 font-mono">{senderTrn}</span>
                        </p>
                      )}
                    </div>
                  </div>
                ) : logoPosition === 'right' ? (
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 leading-tight">
                        {senderEntityName}
                      </h1>
                      {senderTrn && (
                        <p className="text-xs font-semibold text-slate-600 mt-0.5">
                          TRN / VAT Reg: <span className="text-slate-900 font-mono">{senderTrn}</span>
                        </p>
                      )}
                    </div>
                    {profile?.logo_url && !logoLoadFailed ? (
                      <img
                        src={profile.logo_url}
                        alt={senderEntityName}
                        className="h-14 max-w-[180px] object-contain shrink-0"
                        onError={() => setLogoLoadFailed(true)}
                      />
                    ) : (
                      <div
                        className="w-12 h-12 rounded-lg flex items-center justify-center text-white font-bold text-xl shadow-sm shrink-0"
                        style={{ backgroundColor: accentColor }}
                      >
                        <Building2 className="w-6 h-6" />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    {profile?.logo_url && !logoLoadFailed ? (
                      <img
                        src={profile.logo_url}
                        alt={senderEntityName}
                        className="h-14 max-w-[200px] object-contain"
                        onError={() => setLogoLoadFailed(true)}
                      />
                    ) : (
                      <div
                        className="w-12 h-12 rounded-lg flex items-center justify-center text-white font-bold text-xl shadow-sm"
                        style={{ backgroundColor: accentColor }}
                      >
                        <Building2 className="w-6 h-6" />
                      </div>
                    )}
                    <div>
                      <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 leading-tight">
                        {senderEntityName}
                      </h1>
                      {senderTrn && (
                        <p className="text-xs font-semibold text-slate-600 mt-0.5">
                          TRN / VAT Reg: <span className="text-slate-900 font-mono">{senderTrn}</span>
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Address & Contact Details */}
                <div className="text-xs text-slate-600 space-y-0.5 pt-1">
                  {senderAddress && (
                    <p className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{senderAddress}</span>
                    </p>
                  )}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-600">
                    {senderPhone && (
                      <span className="flex items-center gap-1">
                        <Phone className="w-3 h-3 text-slate-400" />
                        {senderPhone}
                      </span>
                    )}
                    {senderEmail && (
                      <span className="flex items-center gap-1">
                        <Mail className="w-3 h-3 text-slate-400" />
                        {senderEmail}
                      </span>
                    )}
                    {senderWebsite && (
                      <span className="flex items-center gap-1">
                        <Globe className="w-3 h-3 text-slate-400" />
                        {senderWebsite}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Right: Document Identity & Revision Window */}
              <div className="sm:text-right shrink-0 bg-slate-50 border border-slate-200/80 rounded-xl p-4 min-w-[220px]">
                <div className="flex items-center sm:justify-end gap-2 mb-1">
                  <span className="text-xs uppercase font-extrabold tracking-wider text-slate-500">
                    Commercial Offer
                  </span>
                  <span
                    className="px-2 py-0.5 text-xs font-bold rounded-full text-white"
                    style={{ backgroundColor: accentColor }}
                  >
                    {`R${quotation.revision_number}`}
                  </span>
                </div>

                <div className="text-base sm:text-lg font-mono font-bold text-slate-900">
                  {quotation.formatted_quote_ref || quotation.quote_number}
                </div>

                <div className="mt-3 pt-3 border-t border-slate-200/80 space-y-1 text-xs">
                  <div className="flex justify-between sm:justify-end gap-3 text-slate-600">
                    <span className="text-slate-500 flex items-center gap-1">
                      <Calendar className="w-3 h-3" /> Date:
                    </span>
                    <span className="font-semibold text-slate-800">
                      {formatDate(quotation.created_at)}
                    </span>
                  </div>
                  {quotation.valid_until && (
                    <div className="flex justify-between sm:justify-end gap-3 text-slate-600">
                      <span className="text-slate-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Valid Until:
                      </span>
                      <span className="font-semibold text-slate-800">
                        {formatDate(quotation.valid_until)}
                      </span>
                    </div>
                  )}
                  {quotation.status && (
                    <div className="flex justify-between sm:justify-end gap-3 pt-0.5">
                      <span className="text-slate-500">Status:</span>
                      <span className="font-bold text-slate-700 uppercase tracking-wider text-[11px]">
                        {quotation.status}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Client Snapshot Card */}
            <div className="mt-6 bg-slate-50/70 border border-slate-200/70 rounded-lg p-4 w-full" style={{ width: '100%', maxWidth: '100%' }}>
              <div className="text-[11px] uppercase tracking-wider font-extrabold text-slate-400 mb-2">
                Submitted To / Attention To
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {quotation.client_snapshot?.entity_name || 'Client Name / Unspecified'}
                  </h3>
                  {quotation.client_snapshot?.contact_person && (
                    <p className="text-xs text-slate-700 font-medium mt-0.5">
                      Attn:{' '}
                      <span className="text-slate-900 font-semibold">
                        {quotation.client_snapshot.contact_person}
                      </span>
                    </p>
                  )}
                  {quotation.client_snapshot?.address && (
                    <p className="text-xs text-slate-600 mt-1">
                      {quotation.client_snapshot.address}
                    </p>
                  )}
                </div>
                <div className="text-xs text-slate-600 space-y-1 md:text-right">
                  {quotation.client_snapshot?.email && (
                    <p>
                      <span className="text-slate-500">Email:</span>{' '}
                      <span className="font-medium text-slate-800">
                        {quotation.client_snapshot.email}
                      </span>
                    </p>
                  )}
                  {quotation.client_snapshot?.phone && (
                    <p>
                      <span className="text-slate-500">Tel:</span>{' '}
                      <span className="font-medium text-slate-800">
                        {quotation.client_snapshot.phone}
                      </span>
                    </p>
                  )}
                  {quotation.client_snapshot?.trn && (
                    <p>
                      <span className="text-slate-500">Client TRN:</span>{' '}
                      <span className="font-mono font-medium text-slate-800">
                        {quotation.client_snapshot.trn}
                      </span>
                    </p>
                  )}
                </div>
              </div>
            </div>
          </header>
        )}

        {/* ========================================================
            ITEMIZED TABLE
           ======================================================== */}
        <section className="flex-1 my-2 w-full" style={{ width: '100%', maxWidth: '100%' }}>
          <div className="rounded-lg border border-slate-200 overflow-hidden w-full" style={{ width: '100%', maxWidth: '100%' }}>
            <table
              className={`w-full table-fixed text-left border-collapse ${tableFontSize}`}
              style={{ tableLayout: 'fixed', width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}
            >
              <thead>
                <tr
                  className="font-semibold text-slate-700 bg-slate-100 border-b border-slate-200"
                  style={{
                    backgroundColor: theme.subtleBg || '#f8fafc',
                    borderColor: '#e2e8f0'
                  }}
                >
                  <th
                    className={`${thPad} px-1.5 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-600 overflow-hidden text-ellipsis whitespace-nowrap border-r border-slate-200 last:border-r-0 ${colWidths.sl.className} text-center`}
                    style={colWidths.sl.style}
                  >
                    #
                  </th>
                  <th
                    className={`${thPad} px-1.5 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-600 overflow-hidden text-ellipsis whitespace-nowrap border-r border-slate-200 last:border-r-0 ${colWidths.desc.className} text-left`}
                    style={colWidths.desc.style}
                  >
                    Description
                  </th>
                  {showBrand && (
                    <th
                      className={`${thPad} px-1.5 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-600 overflow-hidden text-ellipsis whitespace-nowrap border-r border-slate-200 last:border-r-0 ${colWidths.brand.className} text-center`}
                      style={colWidths.brand.style}
                    >
                      Brand
                    </th>
                  )}
                  {showModel && (
                    <th
                      className={`${thPad} px-1.5 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-600 overflow-hidden text-ellipsis whitespace-nowrap border-r border-slate-200 last:border-r-0 ${colWidths.model.className} text-center`}
                      style={colWidths.model.style}
                    >
                      Model
                    </th>
                  )}
                  {showOrigin && (
                    <th
                      className={`${thPad} px-1.5 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-600 overflow-hidden text-ellipsis whitespace-nowrap border-r border-slate-200 last:border-r-0 ${colWidths.origin.className} text-center`}
                      style={colWidths.origin.style}
                    >
                      Origin
                    </th>
                  )}
                  {showAvailability && (
                    <th
                      className={`${thPad} px-1.5 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-600 overflow-hidden text-ellipsis whitespace-nowrap border-r border-slate-200 last:border-r-0 ${colWidths.delivery.className} text-center`}
                      style={colWidths.delivery.style}
                    >
                      Delivery
                    </th>
                  )}
                  <th
                    className={`${thPad} px-1.5 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-600 overflow-hidden text-ellipsis whitespace-nowrap border-r border-slate-200 last:border-r-0 ${colWidths.qty.className} text-center`}
                    style={colWidths.qty.style}
                  >
                    Qty
                  </th>
                  <th
                    className={`${thPad} px-1.5 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-600 overflow-hidden text-ellipsis whitespace-nowrap border-r border-slate-200 last:border-r-0 ${colWidths.uom.className} text-center`}
                    style={colWidths.uom.style}
                  >
                    UOM
                  </th>
                  {showUnitPrice && (
                    <th
                      className={`${thPad} px-1.5 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-600 overflow-hidden text-ellipsis whitespace-nowrap border-r border-slate-200 last:border-r-0 ${colWidths.unitPrice.className} text-right`}
                      style={colWidths.unitPrice.style}
                    >
                      Unit Price
                    </th>
                  )}
                  <th
                    className={`${thPad} px-1.5 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-600 overflow-hidden text-ellipsis whitespace-nowrap border-r border-slate-200 last:border-r-0 ${colWidths.total.className} text-right`}
                    style={colWidths.total.style}
                  >
                    Total ({currency})
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/80">
                {quotation.line_items?.length ? (
                  quotation.line_items.map((item, idx) => (
                    <tr
                      key={item.id || idx}
                      className={`break-inside-avoid transition-colors ${
                        item.is_optional
                          ? 'bg-amber-50/50 hover:bg-amber-50'
                          : 'hover:bg-slate-50/60'
                      }`}
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
                        {/* Line Item Specification Pills */}
                        {(() => {
                          const rawAttrs: Array<{ key: string; value: string }> = [];
                          const itemAny = item as any;

                          if (Array.isArray(itemAny.attributes)) {
                            itemAny.attributes.forEach((attr: any) => {
                              if (attr && (attr.key || attr.name) && attr.value) {
                                rawAttrs.push({ key: String(attr.key || attr.name), value: String(attr.value) });
                              }
                            });
                          } else if (itemAny.attributes && typeof itemAny.attributes === 'object') {
                            Object.entries(itemAny.attributes).forEach(([k, v]) => {
                              if (v !== undefined && v !== null && String(v).trim() !== '') {
                                rawAttrs.push({ key: k, value: String(v) });
                              }
                            });
                          }

                          if (Array.isArray(itemAny.specs)) {
                            itemAny.specs.forEach((s: any) => {
                              if (s && s.key && s.value) {
                                rawAttrs.push({ key: String(s.key), value: String(s.value) });
                              }
                            });
                          } else if (itemAny.specs && typeof itemAny.specs === 'object') {
                            Object.entries(itemAny.specs).forEach(([k, v]) => {
                              if (v !== undefined && v !== null && String(v).trim() !== '') {
                                rawAttrs.push({ key: k, value: String(v) });
                              }
                            });
                          }

                          if (Array.isArray(itemAny.specifications)) {
                            itemAny.specifications.forEach((s: any) => {
                              if (s && s.key && s.value) {
                                rawAttrs.push({ key: String(s.key), value: String(s.value) });
                              }
                            });
                          } else if (itemAny.specifications && typeof itemAny.specifications === 'object') {
                            Object.entries(itemAny.specifications).forEach(([k, v]) => {
                              if (v !== undefined && v !== null && String(v).trim() !== '') {
                                rawAttrs.push({ key: k, value: String(v) });
                              }
                            });
                          }

                          const uniqueAttrs = rawAttrs.filter(
                            (attr, i, self) =>
                              i === self.findIndex((a) => a.key.toLowerCase() === attr.key.toLowerCase())
                          );

                          if (uniqueAttrs.length === 0) return null;

                          return (
                            <div className="flex flex-wrap items-center gap-1 mt-1.5">
                              {uniqueAttrs.map((attr, aIdx) => (
                                <span
                                  key={aIdx}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-700 font-mono border border-slate-200"
                                >
                                  <span className="font-semibold text-slate-500">{attr.key}:</span>
                                  <span>{attr.value}</span>
                                </span>
                              ))}
                            </div>
                          );
                        })()}
                      </td>
                      {showBrand && (
                        <td className={`${tdPad} px-1.5 text-center text-slate-700 font-medium align-top break-words leading-snug ${tableFontSize}`}>
                          {item.brand_make || '—'}
                        </td>
                      )}
                      {showModel && (
                        <td className={`${tdPad} px-1.5 text-center font-mono text-slate-700 align-top break-words leading-snug ${tableFontSize}`}>
                          {item.model_part_no || '—'}
                        </td>
                      )}
                      {showOrigin && (
                        <td className={`${tdPad} px-1.5 text-center text-slate-600 align-top break-words leading-snug ${tableFontSize}`}>
                          {item.country_of_origin || '—'}
                        </td>
                      )}
                      {showAvailability && (
                        <td className={`${tdPad} px-1.5 text-center text-slate-600 align-top break-words leading-snug ${tableFontSize}`}>
                          {item.availability || 'Ex-Stock'}
                        </td>
                      )}
                      <td className={`${tdPad} px-1 text-center font-bold text-slate-800 align-top ${tableFontSize} whitespace-nowrap`}>
                        {item.quantity}
                      </td>
                      <td
                        className={`${tdPad} px-1 text-center text-slate-600 uppercase ${tableFontSize} align-top whitespace-nowrap overflow-hidden text-ellipsis`}
                        style={{ maxWidth: colWidths.unit.style.width }}
                        title={item.unit || 'pcs'}
                      >
                        {item.unit || 'pcs'}
                      </td>
                      {showUnitPrice && (
                        <td className={`${tdPad} px-2 text-right font-mono text-slate-700 align-top ${tableFontSize} whitespace-nowrap`}>
                          {Number(item.unit_price || 0).toLocaleString('en-US', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                          })}
                        </td>
                      )}
                      <td className={`${tdPad} px-2.5 text-right font-mono font-bold text-slate-900 align-top ${tableFontSize} whitespace-nowrap`}>
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
                      colSpan={10}
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
            COMMERCIAL TERMS & TOTALS SECTION
           ======================================================== */}
        <section className="my-4 break-inside-avoid w-full" style={{ width: '100%', maxWidth: '100%' }}>
          <div
            className={
              resolvedShowCommercialTerms
                ? 'grid grid-cols-1 md:grid-cols-12 gap-6 items-start w-full'
                : 'flex justify-end w-full'
            }
            style={{ width: '100%', maxWidth: '100%' }}
          >
            {/* Left Column: Commercial & Delivery Terms */}
            {resolvedShowCommercialTerms && (
              <div
                className="terms-card md:col-span-7 bg-slate-50 border border-slate-200/80 rounded-xl p-4 text-xs space-y-2.5 w-full"
                style={{ width: '100%', maxWidth: '100%' }}
              >
                <div className="flex items-center gap-1.5 font-bold text-slate-800 uppercase tracking-wider text-[11px] pb-1 border-b border-slate-200">
                  <FileCheck className="w-3.5 h-3.5 text-slate-500" />
                  Commercial Terms & Conditions
                </div>
                <div className="space-y-1.5 text-slate-700">
                  {quotation.applied_terms ? (
                    <div className="whitespace-pre-line leading-relaxed text-slate-600">
                      {quotation.applied_terms}
                    </div>
                  ) : (
                    <>
                      <p className="flex justify-between">
                        <span className="font-semibold text-slate-500">Price Basis:</span>
                        <span className="text-slate-800 font-medium">Ex-Works / Delivered Site</span>
                      </p>
                      <p className="flex justify-between">
                        <span className="font-semibold text-slate-500">Payment Terms:</span>
                        <span className="text-slate-800 font-medium">100% Advance against PI / Approved Credit</span>
                      </p>
                      <p className="flex justify-between">
                        <span className="font-semibold text-slate-500">Validity:</span>
                        <span className="text-slate-800 font-medium">
                          {quotation.valid_until
                            ? `Valid until ${formatDate(quotation.valid_until)}`
                            : '30 Days from date of offer'}
                        </span>
                      </p>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Right Column: Financial Totals Block */}
            <div
              className={
                resolvedShowCommercialTerms
                  ? 'md:col-span-5 bg-white border border-slate-200 rounded-xl p-4 shadow-sm text-xs space-y-2 w-full'
                  : 'w-full max-w-sm bg-white border border-slate-200 rounded-xl p-4 shadow-sm text-xs space-y-2'
              }
              style={resolvedShowCommercialTerms ? { width: '100%', maxWidth: '100%' } : undefined}
            >
              <div className="flex justify-between text-slate-600 py-1">
                <span>Subtotal:</span>
                <span className="font-mono font-semibold text-slate-800">
                  {formatCurrency(quotation.subtotal)}
                </span>
              </div>

              {Number(quotation.freight_amount) > 0 && (
                <div className="flex justify-between text-slate-600 py-1 border-t border-slate-100">
                  <span>Freight / Logistics:</span>
                  <span className="font-mono font-semibold text-slate-800">
                    {formatCurrency(quotation.freight_amount)}
                  </span>
                </div>
              )}

              {/* Tax Mode Display */}
              {quotation.tax_mode === 'tax_calculated' && (
                <div className="flex justify-between text-slate-600 py-1 border-t border-slate-100">
                  <span>VAT ({quotation.tax_rate_percent || 5}%):</span>
                  <span className="font-mono font-semibold text-slate-800">
                    {formatCurrency(quotation.tax_amount)}
                  </span>
                </div>
              )}

              {quotation.tax_mode === 'taxes_extra' && (
                <div className="py-1 border-t border-slate-100 text-slate-600 space-y-0.5">
                  <div className="flex justify-between">
                    <span>VAT ({quotation.tax_rate_percent || 5}%):</span>
                    <span className="font-mono font-semibold text-slate-800">
                      {formatCurrency(quotation.tax_amount)}
                    </span>
                  </div>
                  <p className="text-[10px] text-amber-700 italic">
                    * Taxes EXTRA to client account as applicable
                  </p>
                </div>
              )}

              {quotation.tax_mode === 'tax_exempt' && (
                <div className="flex justify-between text-slate-600 py-1 border-t border-slate-100 items-center">
                  <span>Tax Status:</span>
                  <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 rounded">
                    Tax Exempt (0%)
                  </span>
                </div>
              )}

              {/* Grand Total */}
              <div
                className="flex justify-between items-center pt-2.5 mt-1 border-t-2 text-sm font-extrabold"
                style={{ borderColor: accentColor }}
              >
                <span className="text-slate-900 uppercase tracking-tight">Grand Total:</span>
                <span className="font-mono text-base" style={{ color: accentColor }}>
                  {formatCurrency(quotation.grand_total)}
                </span>
              </div>

              {/* Amount in Words */}
              {amountInWordsEnabled && (
                <div className="mt-2.5 pt-2 border-t border-slate-100 text-[11px] leading-tight">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                    Amount in Words
                  </span>
                  <p className="font-medium text-slate-800 italic">
                    {formatAmountInWords(quotation.grand_total, currency)}
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Customer Acceptance Block */}
        {customerAcceptanceEnabled && (
          <div
            className="my-3 p-3 bg-slate-50/80 rounded-xl border border-dashed border-slate-300 text-xs break-inside-avoid w-full"
            style={{ width: '100%', maxWidth: '100%' }}
          >
            <div className="flex items-center justify-between pb-1.5 border-b border-slate-200">
              <span className="font-bold text-slate-800 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                <FileCheck className="w-3.5 h-3.5 text-slate-600" />
                Customer Acceptance & Confirmation
              </span>
              <span className="text-[10px] text-slate-400 italic">
                Sign & Return Copy with Purchase Order
              </span>
            </div>
            <p className="text-[10.5px] text-slate-600 my-1.5 leading-snug">
              We hereby accept and approve this commercial offer <span className="font-semibold text-slate-800">#{quotation.formatted_quote_ref}</span> in accordance with the specified quantities, prices, and terms.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 text-[10.5px]">
              <div>
                <span className="text-slate-400 text-[9.5px] uppercase tracking-wider block">Authorized Signature</span>
                <div className="h-6 border-b border-slate-300 mt-1" />
              </div>
              <div>
                <span className="text-slate-400 text-[9.5px] uppercase tracking-wider block">Signatory Name</span>
                <div className="h-6 border-b border-slate-300 mt-1" />
              </div>
              <div>
                <span className="text-slate-400 text-[9.5px] uppercase tracking-wider block">Date</span>
                <div className="h-6 border-b border-slate-300 mt-1" />
              </div>
              <div>
                <span className="text-slate-400 text-[9.5px] uppercase tracking-wider block">Company Stamp</span>
                <div className="h-6 border-b border-slate-300 border-dotted mt-1" />
              </div>
            </div>
          </div>
        )}

        {/* ========================================================
            REMITTANCE & SIGNATORY BLOCK
           ======================================================== */}
        <footer className="mt-4 pt-4 border-t border-slate-200 text-xs break-inside-avoid w-full" style={{ width: '100%', maxWidth: '100%' }}>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-end w-full" style={{ width: '100%', maxWidth: '100%' }}>
            {/* Left: Remittance Bank Accounts */}
            {resolvedShowBankDetails && bankAccount ? (
              <div
                className="remittance-card md:col-span-6 bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 space-y-1 w-full"
                style={{ width: '100%', maxWidth: '100%' }}
              >
                <div className="flex items-center gap-1.5 font-bold text-slate-800 uppercase tracking-wider text-[11px] mb-1">
                  <Landmark className="w-3.5 h-3.5 text-slate-500" />
                  Bank Remittance Details
                </div>
                <div className="text-[11px] text-slate-700 space-y-0.5">
                  <p>
                    <span className="text-slate-500">Bank:</span>{' '}
                    <span className="font-semibold text-slate-900">{bankAccount.bank_name}</span>
                  </p>
                  <p>
                    <span className="text-slate-500">Beneficiary:</span>{' '}
                    <span className="font-medium text-slate-800">
                      {bankAccount.account_name ||
                        (bankAccount as any)?.beneficiary_name ||
                        profile?.legal_entity_name ||
                        (profile as any)?.company_legal_name ||
                        senderEntityName}
                    </span>
                  </p>
                  <p>
                    <span className="text-slate-500">Account No:</span>{' '}
                    <span className="font-mono font-medium text-slate-900">
                      {bankAccount.account_number}
                    </span>
                  </p>
                  {bankAccount.iban && (
                    <p>
                      <span className="text-slate-500">IBAN:</span>{' '}
                      <span className="font-mono font-bold text-slate-900">
                        {bankAccount.iban}
                      </span>
                    </p>
                  )}
                  {bankAccount.swift_bic && (
                    <p>
                      <span className="text-slate-500">SWIFT / BIC:</span>{' '}
                      <span className="font-mono font-semibold text-slate-900">
                        {bankAccount.swift_bic}
                      </span>
                    </p>
                  )}
                </div>
              </div>
            ) : resolvedShowBankDetails ? (
              <div className="md:col-span-6 text-[11px] text-slate-500 italic w-full">
                Thank you for your business. Please contact us for electronic wire instructions.
              </div>
            ) : (
              <div className="md:col-span-6" />
            )}

            {/* Right: Signatory & Seal Authorization */}
            {showStampAndSignatures && (
              <div className="md:col-span-6 flex flex-col items-end text-right space-y-3 w-full" style={{ width: '100%', maxWidth: '100%' }}>
                <div className="flex items-center justify-end gap-6 w-full">
                  {/* Official Stamp / Seal */}
                  {resolvedShowCompanySeal && profile?.stamp_seal_url && (
                    <div className="flex flex-col items-center">
                      <img
                        src={profile.stamp_seal_url}
                        alt="Official Seal"
                        className="h-20 w-20 object-contain opacity-90 mix-blend-multiply"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                      <span className="text-[10px] text-slate-400 mt-1 uppercase tracking-wider">
                        Company Seal
                      </span>
                    </div>
                  )}

                  {/* Signatories Rendering */}
                  <div className="flex gap-6">
                    {resolvedSignatories.map((sig, sIdx) => (
                      <div key={sIdx} className="text-center min-w-[130px]">
                        <div className="h-12 flex items-end justify-center mb-1">
                          {signatureStyle === 'image' && sig.signature_url ? (
                            <img
                              src={sig.signature_url}
                              alt={sig.name}
                              className="max-h-12 object-contain"
                            />
                          ) : signatureStyle === 'script' ? (
                            <span className="font-serif italic text-base sm:text-lg text-slate-800 tracking-wide font-medium select-none transform -rotate-1 pb-1">
                              {sig.name}
                            </span>
                          ) : signatureStyle === 'image' ? (
                            <div className="h-10 w-28 border border-dashed border-slate-300 rounded flex items-center justify-center text-[10px] text-slate-400 italic">
                              Digital Signature
                            </div>
                          ) : (
                            /* 'line' style */
                            <div className="w-28 border-b border-slate-400 pb-1" />
                          )}
                        </div>
                        <div className="w-28 border-b border-slate-300 mx-auto mb-1" />
                        <p className="font-bold text-slate-800 text-xs">{sig.name}</p>
                        <p className="text-[10px] text-slate-500">{sig.title}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* System Footer Note */}
          <div className="mt-4 pt-3 border-t border-slate-100 flex flex-col sm:flex-row justify-between items-center text-[10px] text-slate-400 w-full" style={{ width: '100%', maxWidth: '100%' }}>
            <span>
              Generated via Omni Suite Quotation Engine • Ref: {quotation.formatted_quote_ref}
            </span>
            <span>This is a computer-generated commercial document.</span>
          </div>
        </footer>
      </article>
    </div>
  );
};
