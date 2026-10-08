import React from 'react';
import './QuotationDocument.module.css';
import {
  Quotation,
  WorkspaceDocumentProfile,
  QuotationPreset,
  QuotationPresetColumns,
  DocumentProfileBankAccount
} from '../../types';
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

export interface QuotationDocumentProps {
  quotation: Quotation;
  profile?: WorkspaceDocumentProfile | null;
  visibleColumns?: QuotationPresetColumns;
  isCompactView?: boolean;
  showBankDetails?: boolean;
  showStampAndSignatures?: boolean;
}

export const QuotationDocument: React.FC<QuotationDocumentProps> = ({
  quotation,
  profile,
  visibleColumns = {} as QuotationPresetColumns,
  isCompactView = true,
  showBankDetails = true,
  showStampAndSignatures = true
}: QuotationDocumentProps) => {
  const currency = quotation.currency || quotation.applied_bank_account?.currency || 'AED';
  const accentColor = profile?.accent_color || '#1e3a8a'; // Corporate Navy by default

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

  // Resolve sender info from profile with fallback to quotation.sender_snapshot
  const senderEntityName =
    profile?.legal_entity_name || quotation.sender_snapshot?.entity_name || 'Commercial Entity';
  const senderTrn = profile?.trn || quotation.sender_snapshot?.trn;
  const senderAddress = [
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

  return (
    <div
      className="quotation-document-container w-full bg-slate-100 p-2 sm:p-4 md:p-8 flex justify-center text-slate-900 print:p-0 print:bg-white"
      style={{ colorScheme: 'light' }}
    >
      {/* Decoupled A4 Page Sheet */}
      <article
        className="quotation-a4-sheet relative w-full max-w-[210mm] min-h-[297mm] bg-white text-slate-800 shadow-xl border border-slate-200 p-8 sm:p-12 flex flex-col justify-between font-sans print:shadow-none print:border-none print:m-0 print:p-10"
        style={{
          boxSizing: 'border-box'
        }}
      >
        {/* Top Accent Stripe */}
        <div
          className="absolute top-0 left-0 right-0 h-2"
          style={{ backgroundColor: accentColor }}
        />

        {/* ========================================================
            HEADER & META BLOCK
           ======================================================== */}
        <header className="border-b border-slate-200 pb-6 mb-6">
          <div className="flex flex-col sm:flex-row justify-between items-start gap-6">
            {/* Left: Organization Branding & Details */}
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-3">
                {profile?.logo_url ? (
                  <img
                    src={profile.logo_url}
                    alt={senderEntityName}
                    className="h-14 max-w-[200px] object-contain"
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

          {/* ========================================================
              CLIENT SNAPSHOT CARD
             ======================================================== */}
          <div className="mt-6 bg-slate-50/70 border border-slate-200/70 rounded-lg p-4">
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

        {/* ========================================================
            ITEMIZED TABLE
           ======================================================== */}
        <section className="flex-1 my-2">
          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <table className="w-full table-fixed text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                  <th className="py-2 px-1.5 w-[5%] text-center">#</th>
                  <th className="py-2 px-2.5 break-words">Item & Description</th>
                  {showBrand && <th className="py-2 px-1.5 w-[12%] break-words">Brand</th>}
                  {showModel && <th className="py-2 px-1.5 w-[13%] break-words">Model / Part</th>}
                  {showOrigin && <th className="py-2 px-1.5 w-[10%] break-words">Origin</th>}
                  {showAvailability && <th className="py-2 px-1.5 w-[12%] break-words">Delivery</th>}
                  <th className="py-2 px-1 w-[7%] text-center">Qty</th>
                  <th className="py-2 px-1 w-[6%] text-center">UOM</th>
                  {showUnitPrice && (
                    <th className="py-2 px-2 w-[13%] text-right">Unit Price</th>
                  )}
                  <th className="py-2 px-2.5 w-[15%] text-right">Total ({currency})</th>
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
                      <td className="py-2 px-1.5 text-center font-mono text-slate-500 align-top">
                        {idx + 1}
                      </td>
                      <td className="py-2 px-2.5 align-top break-words">
                        <div className="font-bold text-slate-900 flex flex-wrap items-center gap-1.5 leading-tight">
                          <span>{item.item_name || 'Standard Line Item'}</span>
                          {item.is_optional && (
                            <span className="px-1.5 py-0.5 text-[9px] uppercase font-bold tracking-wider bg-amber-200 text-amber-900 rounded">
                              Optional
                            </span>
                          )}
                        </div>
                        {item.description && (
                          <div className="text-[11px] text-slate-600 mt-1 leading-snug break-words whitespace-pre-line">
                            {item.description}
                          </div>
                        )}
                      </td>
                      {showBrand && (
                        <td className="py-2 px-1.5 text-slate-700 font-medium align-top break-words leading-tight">
                          {item.brand_make || '—'}
                        </td>
                      )}
                      {showModel && (
                        <td className="py-2 px-1.5 font-mono text-slate-700 align-top break-words leading-tight">
                          {item.model_part_no || '—'}
                        </td>
                      )}
                      {showOrigin && (
                        <td className="py-2 px-1.5 text-slate-600 align-top break-words leading-tight">
                          {item.country_of_origin || '—'}
                        </td>
                      )}
                      {showAvailability && (
                        <td className="py-2 px-1.5 text-slate-600 align-top break-words leading-tight">
                          {item.availability || 'Ex-Stock'}
                        </td>
                      )}
                      <td className="py-2 px-1 text-center font-bold text-slate-800 align-top">
                        {item.quantity}
                      </td>
                      <td className="py-2 px-1 text-center text-slate-600 uppercase text-[11px] align-top">
                        {item.unit || 'pcs'}
                      </td>
                      {showUnitPrice && (
                        <td className="py-2 px-2 text-right font-mono text-slate-700 align-top">
                          {Number(item.unit_price || 0).toLocaleString('en-US', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                          })}
                        </td>
                      )}
                      <td className="py-2 px-2.5 text-right font-mono font-bold text-slate-900 align-top">
                        {item.is_optional ? (
                          <span className="text-amber-700 text-[11px] italic font-normal">
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
        <section className="my-4 break-inside-avoid">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
            {/* Left Column: Commercial & Delivery Terms */}
            <div className="md:col-span-7 bg-slate-50 border border-slate-200/80 rounded-xl p-4 text-xs space-y-2.5">
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

            {/* Right Column: Financial Totals Block */}
            <div className="md:col-span-5 bg-white border border-slate-200 rounded-xl p-4 shadow-sm text-xs space-y-2">
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
            </div>
          </div>
        </section>

        {/* ========================================================
            REMITTANCE & SIGNATORY BLOCK
           ======================================================== */}
        <footer className="mt-4 pt-4 border-t border-slate-200 text-xs break-inside-avoid">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-end">
            {/* Left: Remittance Bank Accounts */}
            {showBankDetails && bankAccount ? (
              <div className="md:col-span-6 bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 space-y-1">
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
                    <span className="font-medium text-slate-800">{bankAccount.account_name}</span>
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
            ) : (
              <div className="md:col-span-6 text-[11px] text-slate-500 italic">
                Thank you for your business. Please contact us for electronic wire instructions.
              </div>
            )}

            {/* Right: Signatory & Seal Authorization */}
            {showStampAndSignatures && (
              <div className="md:col-span-6 flex flex-col items-end text-right space-y-3">
                <div className="flex items-center justify-end gap-6 w-full">
                  {/* Official Stamp / Seal */}
                  {profile?.stamp_seal_url && (
                    <div className="flex flex-col items-center">
                      <img
                        src={profile.stamp_seal_url}
                        alt="Official Seal"
                        className="h-20 w-20 object-contain opacity-90 mix-blend-multiply"
                      />
                      <span className="text-[10px] text-slate-400 mt-1 uppercase tracking-wider">
                        Company Seal
                      </span>
                    </div>
                  )}

                  {/* Signatories Rendering */}
                  {quotation.signatories && quotation.signatories.length > 0 ? (
                    <div className="flex gap-6">
                      {quotation.signatories.map((sig, sIdx) => (
                        <div key={sIdx} className="text-center min-w-[120px]">
                          <div className="h-12 flex items-end justify-center mb-1">
                            {sig.signature_url ? (
                              <img
                                src={sig.signature_url}
                                alt={sig.name}
                                className="max-h-12 object-contain"
                              />
                            ) : (
                              <div className="w-24 border-b border-slate-400" />
                            )}
                          </div>
                          <p className="font-bold text-slate-800 text-xs">{sig.name}</p>
                          <p className="text-[10px] text-slate-500">{sig.designation || 'Authorized'}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center min-w-[140px]">
                      <div className="h-14 border-b border-slate-400 mb-1 flex items-end justify-center">
                        <span className="text-[10px] text-slate-400 pb-1 italic">
                          Authorized Signature
                        </span>
                      </div>
                      <p className="font-bold text-slate-800 text-xs">For {senderEntityName}</p>
                      <p className="text-[10px] text-slate-500">Authorized Signatory</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* System Footer Note */}
          <div className="mt-4 pt-3 border-t border-slate-100 flex flex-col sm:flex-row justify-between items-center text-[10px] text-slate-400">
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
