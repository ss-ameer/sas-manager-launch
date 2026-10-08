import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  LineItem
} from '../../types';
import { QuotationRepository } from '../../services/repositories/QuotationRepository';
import { QuotationDocument } from './QuotationDocument';
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
  User,
  Percent,
  Truck,
  Landmark,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  FileCheck
} from 'lucide-react';

export interface QuotationStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  enquiry: Enquiry;
  salespersonName?: string;
  activeWorkspaceId: string;
  user: UserProfile;
  profile?: WorkspaceDocumentProfile | null;
  onQuotationCreated?: (quotation: Quotation) => void;
  triggerToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export const QuotationStudioModal: React.FC<QuotationStudioModalProps> = ({
  isOpen,
  onClose,
  enquiry,
  salespersonName,
  activeWorkspaceId,
  user,
  profile,
  onQuotationCreated,
  triggerToast
}) => {
  if (!isOpen) return null;

  // Presets and loading states
  const [presets, setPresets] = useState<QuotationPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Column visibility toggles
  const [visibleColumns, setVisibleColumns] = useState<QuotationPresetColumns>({
    brand: true,
    model: true,
    origin: true,
    availability: true,
    unit_price: true
  });

  // Financial & Tax adjustments
  const [freightAmount, setFreightAmount] = useState<number>(0);
  const [taxMode, setTaxMode] = useState<QuotationTaxMode>('taxes_extra');
  const [taxRatePercent, setTaxRatePercent] = useState<number>(5);

  // Commercial terms
  const [priceBasis, setPriceBasis] = useState<string>('Ex-Works / Delivered Site');
  const [paymentTerms, setPaymentTerms] = useState<string>('100% Advance against PI / Approved Credit');
  const [validityDays, setValidityDays] = useState<number>(30);
  const [customNotes, setCustomNotes] = useState<string>('');

  // Signatory & Remittance choices
  const [signatoryMode, setSignatoryMode] = useState<QuotationSignatoryMode>('single');
  const [signatoryName, setSignatoryName] = useState<string>(
    salespersonName || user.displayName || user.name || 'Sales Representative'
  );
  const [signatoryTitle, setSignatoryTitle] = useState<string>('Account Manager');
  const [secondarySignatoryName, setSecondarySignatoryName] = useState<string>('Branch Manager');
  const [secondarySignatoryTitle, setSecondarySignatoryTitle] = useState<string>('Authorized Signatory');

  // Bank selection
  const [selectedBankId, setSelectedBankId] = useState<string>('');

  // Zoom / Preview scale controls
  const [zoomScale, setZoomScale] = useState<number>(0.85);

  // Collapsible accordions
  const [isTermsOpen, setIsTermsOpen] = useState<boolean>(true);
  const [isSignatoryOpen, setIsSignatoryOpen] = useState<boolean>(true);

  // Load Presets on Mount
  useEffect(() => {
    let isMounted = true;
    QuotationRepository.getPresets(activeWorkspaceId)
      .then((loadedPresets) => {
        if (!isMounted) return;
        setPresets(loadedPresets);
        if (loadedPresets.length > 0) {
          applyPreset(loadedPresets[0]);
        }
      })
      .catch((err) => {
        console.warn('Failed loading presets:', err);
      });
    return () => {
      isMounted = false;
    };
  }, [activeWorkspaceId]);

  // Set default bank if profile exists
  useEffect(() => {
    if (profile?.bank_accounts && profile.bank_accounts.length > 0) {
      const def = profile.bank_accounts.find((b) => b.is_default) || profile.bank_accounts[0];
      if (def?.id) {
        setSelectedBankId(def.id);
      }
    }
  }, [profile]);

  // Apply chosen preset
  const applyPreset = (preset: QuotationPreset) => {
    setSelectedPresetId(preset.id || '');
    if (preset.visible_columns) {
      setVisibleColumns({
        brand: preset.visible_columns.brand ?? true,
        model: preset.visible_columns.model ?? true,
        origin: preset.visible_columns.origin ?? true,
        availability: preset.visible_columns.availability ?? true,
        unit_price: preset.visible_columns.unit_price ?? true
      });
    }
    if (preset.default_tax_mode) setTaxMode(preset.default_tax_mode);
    if (preset.default_price_basis) setPriceBasis(preset.default_price_basis);
    if (preset.default_payment_terms) setPaymentTerms(preset.default_payment_terms);
    if (preset.default_validity_days) setValidityDays(preset.default_validity_days);
    if (preset.signatory_mode) setSignatoryMode(preset.signatory_mode);
    if (preset.notes_template) setCustomNotes(preset.notes_template);
  };

  // Convert enquiry.line_items to QuotationLineItem array
  const quotationLineItems = useMemo(() => {
    const rawItems: LineItem[] = enquiry.line_items || [];
    return rawItems.map((li, idx) => {
      const qty = Number(li.quantity) || 1;
      const uPrice = Number(li.unit_price) || 0;
      const tPrice = Number(li.total_price) || qty * uPrice;

      // Extract attributes if available
      const brandAttr = li.attributes?.find((a) => a.key.toLowerCase().includes('brand'))?.value;
      const modelAttr = li.attributes?.find((a) => a.key.toLowerCase().includes('model') || a.key.toLowerCase().includes('part'))?.value;
      const originAttr = li.attributes?.find((a) => a.key.toLowerCase().includes('origin'))?.value;

      return {
        id: li.id || `item_${idx}`,
        item_name: li.item_name || li.product_type || `Item ${idx + 1}`,
        description: li.description || '',
        quantity: qty,
        unit: li.unit || 'pcs',
        unit_price: uPrice,
        total_price: tPrice,
        brand_make: brandAttr || undefined,
        model_part_no: modelAttr || undefined,
        country_of_origin: originAttr || undefined,
        availability: li.lead_time_note || 'Ex-Stock / Standard',
        is_optional: false
      };
    });
  }, [enquiry.line_items]);

  // Calculate live financial figures
  const financialTotals = useMemo(() => {
    return QuotationRepository.calculateTotals(
      quotationLineItems,
      freightAmount,
      taxMode,
      taxRatePercent
    );
  }, [quotationLineItems, freightAmount, taxMode, taxRatePercent]);

  // Selected bank account
  const activeBankAccount: DocumentProfileBankAccount | undefined = useMemo(() => {
    if (!profile?.bank_accounts) return undefined;
    return (
      profile.bank_accounts.find((b) => b.id === selectedBankId) ||
      profile.bank_accounts.find((b) => b.is_default) ||
      profile.bank_accounts[0]
    );
  }, [profile, selectedBankId]);

  // Resolved Signatories array
  const signatories = useMemo(() => {
    if (signatoryMode === 'none' || signatoryMode === 'stamp_only') return [];
    if (signatoryMode === 'dual') {
      return [
        { name: signatoryName, designation: signatoryTitle },
        { name: secondarySignatoryName, designation: secondarySignatoryTitle }
      ];
    }
    return [{ name: signatoryName, designation: signatoryTitle }];
  }, [
    signatoryMode,
    signatoryName,
    signatoryTitle,
    secondarySignatoryName,
    secondarySignatoryTitle
  ]);

  // Derived validity date
  const validUntilDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + (Number(validityDays) || 30));
    return d.toISOString();
  }, [validityDays]);

  // Constructed live Quotation object for preview
  const liveQuotation: Quotation = useMemo(() => {
    const rawQuoteNumber = enquiry.quote_ref_no || `QT-${new Date().getFullYear()}-${String(enquiry.sn || 1).padStart(4, '0')}`;
    const cleanQuoteNumber = rawQuoteNumber.replace(/-R\d+$/, '');

    return {
      id: 'preview_draft',
      workspace_id: activeWorkspaceId,
      workspaceId: activeWorkspaceId,
      enquiry_id: enquiry.id || '',
      quote_number: cleanQuoteNumber,
      revision_number: 0,
      formatted_quote_ref: `${cleanQuoteNumber}-R0`,
      status: 'Draft',
      client_snapshot: {
        entity_name: enquiry.company_name || enquiry.client_company || 'Valued Client',
        contact_person: enquiry.concerned_person || undefined,
        address: enquiry.project_location || enquiry.country || undefined,
        trn: undefined
      },
      sender_snapshot: {
        entity_name: profile?.legal_entity_name || 'Industrial Trading LLC',
        trn: profile?.trn,
        address: profile?.address_line_1,
        phone: profile?.phone,
        email: profile?.email
      },
      line_items: quotationLineItems,
      tax_mode: taxMode,
      subtotal: financialTotals.subtotal,
      freight_amount: financialTotals.freight_amount,
      tax_rate_percent: financialTotals.tax_rate_percent,
      tax_amount: financialTotals.tax_amount,
      grand_total: financialTotals.grand_total,
      applied_terms: customNotes || [
        `Price Basis: ${priceBasis}`,
        `Payment Terms: ${paymentTerms}`,
        `Validity: ${validityDays} Days from date of offer`
      ].join('\n'),
      applied_bank_account: activeBankAccount,
      signatories: signatories,
      created_at: new Date().toISOString(),
      valid_until: validUntilDate,
      currency: (enquiry.currency as string) || activeBankAccount?.currency || 'AED'
    };
  }, [
    activeWorkspaceId,
    enquiry,
    profile,
    quotationLineItems,
    taxMode,
    financialTotals,
    customNotes,
    priceBasis,
    paymentTerms,
    validityDays,
    activeBankAccount,
    signatories,
    validUntilDate
  ]);

  // Handle Save (Draft or Issued)
  const handleSaveQuotation = async (status: 'Draft' | 'Sent') => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const payload: Omit<Quotation, 'id'> = {
        workspace_id: activeWorkspaceId,
        workspaceId: activeWorkspaceId,
        enquiry_id: enquiry.id || '',
        quote_number: liveQuotation.quote_number,
        revision_number: 0,
        formatted_quote_ref: liveQuotation.formatted_quote_ref,
        status: status,
        client_snapshot: liveQuotation.client_snapshot,
        sender_snapshot: liveQuotation.sender_snapshot,
        line_items: liveQuotation.line_items,
        tax_mode: liveQuotation.tax_mode,
        subtotal: liveQuotation.subtotal,
        freight_amount: liveQuotation.freight_amount,
        tax_rate_percent: liveQuotation.tax_rate_percent,
        tax_amount: liveQuotation.tax_amount,
        grand_total: liveQuotation.grand_total,
        applied_terms: liveQuotation.applied_terms,
        applied_bank_account: liveQuotation.applied_bank_account,
        signatories: liveQuotation.signatories,
        created_at: new Date().toISOString(),
        valid_until: liveQuotation.valid_until,
        currency: liveQuotation.currency
      };

      const created = await QuotationRepository.createQuotation(payload);

      if (triggerToast) {
        triggerToast(
          status === 'Sent'
            ? `Quotation ${created.formatted_quote_ref} issued successfully!`
            : `Draft quote ${created.formatted_quote_ref} saved.`,
          'success'
        );
      }

      if (onQuotationCreated) {
        onQuotationCreated(created);
      }

      onClose();
    } catch (err: any) {
      console.error('Error saving quotation:', err);
      if (triggerToast) {
        triggerToast(err?.message || 'Failed to save quotation', 'error');
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-hidden">
      <div className="bg-slate-50 w-full max-w-[1400px] h-[95vh] rounded-2xl shadow-2xl flex flex-col border border-slate-300 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Top Bar */}
        <header className="px-6 py-3.5 bg-white border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold text-slate-900">Quotation Studio</h2>
                <span className="px-2 py-0.5 text-xs font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200 rounded-md">
                  {liveQuotation.formatted_quote_ref}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Client: <span className="font-semibold text-slate-700">{liveQuotation.client_snapshot.entity_name}</span>
                {salespersonName && ` • Assigned: ${salespersonName}`}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Modal Body: Two-Pane Split Layout */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          {/* Left Column: Form Controls & Customization */}
          <div className="w-full lg:w-[460px] xl:w-[500px] bg-white border-r border-slate-200 flex flex-col shrink-0 overflow-y-auto">
            <div className="p-5 space-y-6">
              {/* Preset Selector */}
              <div>
                <label className="block text-xs font-mono font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Document Preset
                </label>
                <div className="flex gap-2">
                  <select
                    value={selectedPresetId}
                    onChange={(e) => {
                      const found = presets.find((p) => p.id === e.target.value);
                      if (found) applyPreset(found);
                    }}
                    className="w-full text-xs font-medium rounded-lg border border-slate-300 p-2.5 bg-slate-50 text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  >
                    <option value="">Standard Default Template</option>
                    {presets.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.preset_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Column Visibility Toggles */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-slate-500" />
                    Visible Table Columns
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">5 Custom Columns</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <label className="flex items-center space-x-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={visibleColumns.brand}
                      onChange={(e) =>
                        setVisibleColumns((prev) => ({ ...prev, brand: e.target.checked }))
                      }
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-slate-700">Brand / Make</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={visibleColumns.model}
                      onChange={(e) =>
                        setVisibleColumns((prev) => ({ ...prev, model: e.target.checked }))
                      }
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-slate-700">Model / Part #</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={visibleColumns.origin}
                      onChange={(e) =>
                        setVisibleColumns((prev) => ({ ...prev, origin: e.target.checked }))
                      }
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-slate-700">Origin</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={visibleColumns.availability}
                      onChange={(e) =>
                        setVisibleColumns((prev) => ({ ...prev, availability: e.target.checked }))
                      }
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-slate-700">Delivery Time</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer select-none col-span-2">
                    <input
                      type="checkbox"
                      checked={visibleColumns.unit_price}
                      onChange={(e) =>
                        setVisibleColumns((prev) => ({ ...prev, unit_price: e.target.checked }))
                      }
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-slate-700">Unit Price Column</span>
                  </label>
                </div>
              </div>

              {/* Financial & Tax Adjustments */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 space-y-3.5">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-slate-500" />
                  Tax & Financial Adjustments
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

                {/* Subtotal & Grand Total Quick Review */}
                <div className="pt-2 border-t border-slate-200 flex justify-between items-center text-xs">
                  <span className="text-slate-500">Live Calculated Total:</span>
                  <span className="font-mono font-bold text-sm text-blue-900">
                    {liveQuotation.currency} {financialTotals.grand_total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {/* Commercial Terms Accordion */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setIsTermsOpen(!isTermsOpen)}
                  className="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100 flex items-center justify-between text-xs font-bold text-slate-800 transition cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">
                    <FileCheck className="w-3.5 h-3.5 text-slate-500" />
                    Commercial Terms & Validity
                  </span>
                  {isTermsOpen ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                </button>
                {isTermsOpen && (
                  <div className="p-4 space-y-3 bg-white text-xs border-t border-slate-200">
                    <div>
                      <label className="block text-slate-500 font-medium mb-1">Price Basis</label>
                      <input
                        type="text"
                        value={priceBasis}
                        onChange={(e) => setPriceBasis(e.target.value)}
                        placeholder="e.g., Ex-Works Dubai / Delivered Site"
                        className="w-full rounded-lg border border-slate-300 p-2 text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-500 font-medium mb-1">Payment Terms</label>
                      <input
                        type="text"
                        value={paymentTerms}
                        onChange={(e) => setPaymentTerms(e.target.value)}
                        placeholder="e.g., 100% Advance / 30 Days Net"
                        className="w-full rounded-lg border border-slate-300 p-2 text-slate-800"
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
                      <label className="block text-slate-500 font-medium mb-1">Custom Notes / Scope Disclaimer</label>
                      <textarea
                        rows={3}
                        value={customNotes}
                        onChange={(e) => setCustomNotes(e.target.value)}
                        placeholder="Optional remarks, warranty periods, delivery timeline..."
                        className="w-full rounded-lg border border-slate-300 p-2 text-slate-800 text-xs"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Signatory & Remittance Accordion */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setIsSignatoryOpen(!isSignatoryOpen)}
                  className="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100 flex items-center justify-between text-xs font-bold text-slate-800 transition cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-slate-500" />
                    Signatory & Remittance Account
                  </span>
                  {isSignatoryOpen ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                </button>
                {isSignatoryOpen && (
                  <div className="p-4 space-y-3 bg-white text-xs border-t border-slate-200">
                    <div>
                      <label className="block text-slate-500 font-medium mb-1">Signatory Mode</label>
                      <select
                        value={signatoryMode}
                        onChange={(e) => setSignatoryMode(e.target.value as QuotationSignatoryMode)}
                        className="w-full rounded-lg border border-slate-300 p-2 text-slate-800"
                      >
                        <option value="single">Single Signatory (Deal Owner)</option>
                        <option value="dual">Dual Signatory (Owner + Manager)</option>
                        <option value="stamp_only">Company Seal Only</option>
                        <option value="none">None / Plain Document</option>
                      </select>
                    </div>

                    {(signatoryMode === 'single' || signatoryMode === 'dual') && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-slate-500 font-medium mb-1">Signatory Name</label>
                          <input
                            type="text"
                            value={signatoryName}
                            onChange={(e) => setSignatoryName(e.target.value)}
                            className="w-full rounded-lg border border-slate-300 p-2 text-slate-800 text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-500 font-medium mb-1">Designation</label>
                          <input
                            type="text"
                            value={signatoryTitle}
                            onChange={(e) => setSignatoryTitle(e.target.value)}
                            className="w-full rounded-lg border border-slate-300 p-2 text-slate-800 text-xs"
                          />
                        </div>
                      </div>
                    )}

                    {signatoryMode === 'dual' && (
                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                        <div>
                          <label className="block text-slate-500 font-medium mb-1">Co-Signatory Name</label>
                          <input
                            type="text"
                            value={secondarySignatoryName}
                            onChange={(e) => setSecondarySignatoryName(e.target.value)}
                            className="w-full rounded-lg border border-slate-300 p-2 text-slate-800 text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-500 font-medium mb-1">Co-Designation</label>
                          <input
                            type="text"
                            value={secondarySignatoryTitle}
                            onChange={(e) => setSecondarySignatoryTitle(e.target.value)}
                            className="w-full rounded-lg border border-slate-300 p-2 text-slate-800 text-xs"
                          />
                        </div>
                      </div>
                    )}

                    {profile?.bank_accounts && profile.bank_accounts.length > 0 && (
                      <div className="pt-2 border-t border-slate-100">
                        <label className="block text-slate-500 font-medium mb-1">Remittance Bank</label>
                        <select
                          value={selectedBankId}
                          onChange={(e) => setSelectedBankId(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 p-2 text-slate-800 text-xs"
                        >
                          {profile.bank_accounts.map((b) => (
                            <option key={b.id || b.account_number} value={b.id || ''}>
                              {b.bank_name} ({b.account_number}) - {b.currency || 'AED'}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Actions Bar */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 mt-auto flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 font-medium text-xs rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSaveQuotation('Draft')}
                  disabled={isSaving}
                  className="px-3.5 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-xl shadow-2xs transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5 text-slate-500" />
                  <span>Save Draft</span>
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
            </div>
          </div>

          {/* Right Column: Live A4 Document Preview */}
          <div className="flex-1 bg-slate-200/80 flex flex-col overflow-hidden">
            {/* Preview Toolbar */}
            <div className="px-4 py-2.5 bg-slate-100 border-b border-slate-300/80 flex items-center justify-between text-xs text-slate-600 shrink-0">
              <div className="flex items-center space-x-2">
                <span className="font-semibold text-slate-700">Live Preview:</span>
                <span className="font-mono text-[11px] bg-white px-2 py-0.5 rounded border border-slate-300 text-slate-600">
                  A4 Landscape Scale: {Math.round(zoomScale * 100)}%
                </span>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setZoomScale((prev) => Math.max(0.5, prev - 0.1))}
                  className="p-1.5 hover:bg-white rounded border border-slate-300/60 text-slate-700 transition"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setZoomScale(0.85)}
                  className="p-1.5 hover:bg-white rounded border border-slate-300/60 text-slate-700 transition"
                  title="Reset Zoom"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setZoomScale((prev) => Math.min(1.3, prev + 0.1))}
                  className="p-1.5 hover:bg-white rounded border border-slate-300/60 text-slate-700 transition"
                  title="Zoom In"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-2.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 font-medium rounded text-xs flex items-center gap-1.5 transition ml-2 shadow-2xs"
                >
                  <Printer className="w-3.5 h-3.5 text-slate-500" />
                  <span>Print Document</span>
                </button>
              </div>
            </div>

            {/* Scaled Preview Canvas */}
            <div className="flex-1 overflow-auto p-4 sm:p-8 flex justify-center items-start">
              <div
                style={{
                  transform: `scale(${zoomScale})`,
                  transformOrigin: 'top center',
                  transition: 'transform 0.1s ease-out'
                }}
                className="w-full max-w-[210mm] shadow-2xl"
              >
                <QuotationDocument
                  quotation={liveQuotation}
                  profile={profile}
                  visibleColumns={visibleColumns}
                  showBankDetails={true}
                  showStampAndSignatures={signatoryMode !== 'none'}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
