import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  QuotationBlockConfig,
  QuotationBlockId
} from '../../types';
import { QuotationRepository } from '../../services/repositories/QuotationRepository';
import { QuotationDocument, QUOTATION_THEMES, DEFAULT_QUOTATION_BLOCKS } from './QuotationDocument';
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
  Settings2
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
  onQuotationCreated?: (quotation: Quotation) => void;
  triggerToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const BLOCK_META: Record<QuotationBlockId, { label: string; desc: string; icon: any }> = {
  terms: { label: 'Commercial Terms', desc: 'Price basis, payment & validity', icon: FileCheck },
  totals: { label: 'Financial Totals', desc: 'Subtotal, freight, taxes & grand total', icon: DollarSign },
  remittance: { label: 'Bank Remittance', desc: 'Bank wire instructions & account numbers', icon: Landmark },
  signatory: { label: 'Signatures & Stamp', desc: 'Executive signatories & company seal', icon: Stamp },
  acceptance: { label: 'Customer Acceptance', desc: 'Client confirmation & sign-back box', icon: ShieldCheck }
};

export const QuotationStudioModal: React.FC<QuotationStudioModalProps> = ({
  isOpen,
  onClose,
  enquiry,
  salespersonName,
  activeWorkspaceId,
  activeWorkspace,
  user,
  profile,
  editingQuotation,
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
  const [blockStyle, setBlockStyle] = useState<'framed' | 'minimal'>(
    editingQuotation?.block_style || (editingQuotation as any)?.presentation_preset?.block_style || 'framed'
  );
  const [layoutBlocks, setLayoutBlocks] = useState<QuotationBlockConfig[]>(() => {
    let raw = DEFAULT_QUOTATION_BLOCKS;
    if (editingQuotation?.layout_blocks && editingQuotation.layout_blocks.length > 0) {
      raw = editingQuotation.layout_blocks;
    } else if ((editingQuotation as any)?.presentation_preset?.layout_blocks && (editingQuotation as any).presentation_preset.layout_blocks.length > 0) {
      raw = (editingQuotation as any).presentation_preset.layout_blocks;
    }
    return raw.map((b) => ({
      ...b,
      fontScale: b.fontScale || 'standard',
      padding: b.padding || 'standard'
    }));
  });

  const handleToggleBlockEnabled = (id: QuotationBlockId, enabled: boolean) => {
    setLayoutBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, enabled } : b))
    );
    if (id === 'terms') setShowCommercialTerms(enabled);
    if (id === 'remittance') setShowBankDetails(enabled);
    if (id === 'signatory') setShowCompanySeal(enabled);
    if (id === 'acceptance') setCustomerAcceptanceEnabled(enabled);
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

  const handleSetGlobalBlockStyle = (style: 'framed' | 'minimal') => {
    setBlockStyle(style);
    setLayoutBlocks((prev) => prev.map((b) => ({ ...b, style })));
  };

  // Retractable Right-Side Contextual Block Inspector selection
  const [selectedBlockId, setSelectedBlockId] = useState<QuotationBlockId | null>(null);
  const selectedBlock = useMemo(
    () => layoutBlocks.find((b) => b.id === selectedBlockId) || null,
    [layoutBlocks, selectedBlockId]
  );

  // Template Preset Saving Modal
  const [isSavePresetModalOpen, setIsSavePresetModalOpen] = useState<boolean>(false);
  const [newPresetName, setNewPresetName] = useState<string>('');
  const [isSavingPreset, setIsSavingPreset] = useState<boolean>(false);

  // Commercial terms
  const [priceBasis, setPriceBasis] = useState<string>('Ex-Works / Delivered Site');
  const [paymentTerms, setPaymentTerms] = useState<string>('100% Advance against PI / Approved Credit');
  const [validityDays, setValidityDays] = useState<number>(30);
  const [customNotes, setCustomNotes] = useState<string>(
    editingQuotation?.applied_terms ?? ''
  );

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

  // Bank selection
  const [selectedBankId, setSelectedBankId] = useState<string>(
    editingQuotation?.applied_bank_account?.id || ''
  );

  // Hydrate state when editingQuotation changes
  useEffect(() => {
    if (editingQuotation) {
      if (typeof editingQuotation.freight_amount === 'number') {
        setFreightAmount(editingQuotation.freight_amount);
      }
      if (editingQuotation.tax_mode) {
        setTaxMode(editingQuotation.tax_mode);
      }
      if (typeof editingQuotation.tax_rate_percent === 'number') {
        setTaxRatePercent(editingQuotation.tax_rate_percent);
      }
      if (editingQuotation.applied_terms) {
        setCustomNotes(editingQuotation.applied_terms);
      }
      if (editingQuotation.applied_bank_account?.id) {
        setSelectedBankId(editingQuotation.applied_bank_account.id);
      }
      if (editingQuotation.header_layout) {
        setHeaderLayout(editingQuotation.header_layout);
      }
      if (editingQuotation.table_density) {
        setTableDensity(editingQuotation.table_density);
      }
      if (typeof editingQuotation.show_bank_details === 'boolean') {
        setShowBankDetails(editingQuotation.show_bank_details);
      }
      if (typeof editingQuotation.show_commercial_terms === 'boolean') {
        setShowCommercialTerms(editingQuotation.show_commercial_terms);
      }
      if (typeof editingQuotation.show_company_seal === 'boolean') {
        setShowCompanySeal(editingQuotation.show_company_seal);
      }
      if (editingQuotation.theme_accent) {
        setThemeAccent(editingQuotation.theme_accent);
      }
      if (editingQuotation.logo_position) {
        setLogoPosition(editingQuotation.logo_position);
      }
      if (typeof editingQuotation.amount_in_words_enabled === 'boolean') {
        setAmountInWordsEnabled(editingQuotation.amount_in_words_enabled);
      }
      if (typeof editingQuotation.customer_acceptance_enabled === 'boolean') {
        setCustomerAcceptanceEnabled(editingQuotation.customer_acceptance_enabled);
      }
      if (editingQuotation.signatory_type) {
        setSignatoryType(editingQuotation.signatory_type);
        setSignatoryMode(editingQuotation.signatory_type);
      }
      if (editingQuotation.signature_style) {
        setSignatureStyle(editingQuotation.signature_style);
      }
      if (editingQuotation.primary_signatory_name) {
        setSignatoryName(resolveRepFullName(editingQuotation.primary_signatory_name));
      } else if (editingQuotation.signatories?.[0]?.name) {
        setSignatoryName(resolveRepFullName(editingQuotation.signatories[0].name));
      }
      if (editingQuotation.primary_signatory_title) {
        setSignatoryTitle(editingQuotation.primary_signatory_title);
      } else if (editingQuotation.signatories?.[0]?.designation) {
        setSignatoryTitle(editingQuotation.signatories[0].designation);
      }
      if (editingQuotation.secondary_signatory_name) {
        setSecondarySignatoryName(editingQuotation.secondary_signatory_name);
      } else if (editingQuotation.signatories?.[1]?.name) {
        setSecondarySignatoryName(editingQuotation.signatories[1].name);
      }
      if (editingQuotation.secondary_signatory_title) {
        setSecondarySignatoryTitle(editingQuotation.secondary_signatory_title);
      } else if (editingQuotation.signatories?.[1]?.designation) {
        setSecondarySignatoryTitle(editingQuotation.signatories[1].designation);
      }
    }
  }, [editingQuotation]);

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
          }
        })
        .catch((err) => {
          console.warn('[QuotationStudioModal] Failed loading workspace document profile:', err);
        });
    }
    return () => {
      isMounted = false;
    };
  }, [activeWorkspaceId]);

  // Resolved active document profile prioritizing prop then hydrated repository profile
  const activeProfile = profile || workspaceProfile;

  // Set default bank if profile exists
  useEffect(() => {
    if (activeProfile?.bank_accounts && activeProfile.bank_accounts.length > 0) {
      const def = activeProfile.bank_accounts.find((b) => b.is_default) || activeProfile.bank_accounts[0];
      if (def?.id) {
        setSelectedBankId(def.id);
      }
    }
  }, [activeProfile]);

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
    if (preset.signatory_mode) {
      setSignatoryMode(preset.signatory_mode);
      if (preset.signatory_mode === 'dual' || preset.signatory_mode === 'single') {
        setSignatoryType(preset.signatory_mode);
      }
    }
    if (preset.notes_template) setCustomNotes(preset.notes_template);
    if (preset.header_layout) setHeaderLayout(preset.header_layout);
    if (preset.table_density) setTableDensity(preset.table_density);
    if (typeof preset.show_bank_details === 'boolean') setShowBankDetails(preset.show_bank_details);
    if (typeof preset.show_commercial_terms === 'boolean') setShowCommercialTerms(preset.show_commercial_terms);
    if (typeof preset.show_company_seal === 'boolean') setShowCompanySeal(preset.show_company_seal);
    if (preset.theme_accent) setThemeAccent(preset.theme_accent);
    if (typeof preset.amount_in_words_enabled === 'boolean') setAmountInWordsEnabled(preset.amount_in_words_enabled);
    if (typeof preset.customer_acceptance_enabled === 'boolean') setCustomerAcceptanceEnabled(preset.customer_acceptance_enabled);
    if (preset.signatory_type) setSignatoryType(preset.signatory_type);
    if (preset.signature_style) setSignatureStyle(preset.signature_style);
    if (preset.logo_position) setLogoPosition(preset.logo_position);
    if (preset.block_style) setBlockStyle(preset.block_style);
    if (preset.layout_blocks && preset.layout_blocks.length > 0) {
      setLayoutBlocks(
        preset.layout_blocks.map((b) => ({
          ...b,
          fontScale: b.fontScale || 'standard',
          padding: b.padding || 'standard'
        }))
      );
    }
    if (preset.primary_signatory_name) setSignatoryName(resolveRepFullName(preset.primary_signatory_name));
    if (preset.primary_signatory_title) setSignatoryTitle(preset.primary_signatory_title);
    if (preset.secondary_signatory_name) setSecondarySignatoryName(preset.secondary_signatory_name);
    if (preset.secondary_signatory_title) setSecondarySignatoryTitle(preset.secondary_signatory_title);
  };

  // Convert enquiry.line_items or editingQuotation.line_items to QuotationLineItem array
  const quotationLineItems = useMemo(() => {
    if (editingQuotation?.line_items && editingQuotation.line_items.length > 0) {
      return editingQuotation.line_items;
    }
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
  }, [editingQuotation, enquiry.line_items]);

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
    if (!activeProfile?.bank_accounts) return undefined;
    return (
      activeProfile.bank_accounts.find((b) => b.id === selectedBankId) ||
      activeProfile.bank_accounts.find((b) => b.is_default) ||
      activeProfile.bank_accounts[0]
    );
  }, [activeProfile, selectedBankId]);

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
    const rawQuoteNumber =
      editingQuotation?.quote_number ||
      enquiry.quote_ref_no ||
      `QT-${new Date().getFullYear()}-${String(enquiry.sn || 1).padStart(4, '0')}`;
    const cleanQuoteNumber = rawQuoteNumber.replace(/-R\d+$/, '');
    const revNum = editingQuotation?.revision_number ?? 0;
    const formattedQuoteRef =
      editingQuotation?.formatted_quote_ref || `${cleanQuoteNumber}-R${revNum}`;

    return {
      id: editingQuotation?.id || 'preview_draft',
      workspace_id: activeWorkspaceId,
      workspaceId: activeWorkspaceId,
      enquiry_id: enquiry.id || '',
      quote_number: cleanQuoteNumber,
      revision_number: revNum,
      formatted_quote_ref: formattedQuoteRef,
      parent_quote_id: editingQuotation?.parent_quote_id,
      status: editingQuotation?.status || 'Draft',
      client_snapshot: {
        entity_name: enquiry.company_name || enquiry.client_company || 'Valued Client',
        contact_person: enquiry.concerned_person || undefined,
        address: enquiry.project_location || enquiry.country || undefined,
        trn: undefined
      },
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
      applied_terms: customNotes || [
        `Price Basis: ${priceBasis}`,
        `Payment Terms: ${paymentTerms}`,
        `Validity: ${validityDays} Days from date of offer`
      ].join('\n'),
      applied_bank_account: activeBankAccount,
      signatories: signatories,
      header_layout: headerLayout,
      table_density: tableDensity,
      show_bank_details: showBankDetails,
      show_commercial_terms: showCommercialTerms,
      show_company_seal: showCompanySeal,
      theme_accent: themeAccent,
      logo_position: logoPosition,
      amount_in_words_enabled: amountInWordsEnabled,
      customer_acceptance_enabled: customerAcceptanceEnabled,
      signatory_type: signatoryType,
      primary_signatory_name: signatoryName,
      primary_signatory_title: signatoryTitle,
      secondary_signatory_name: secondarySignatoryName,
      secondary_signatory_title: secondarySignatoryTitle,
      signature_style: signatureStyle,
      block_style: blockStyle,
      layout_blocks: layoutBlocks,
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
    logoPosition,
    amountInWordsEnabled,
    customerAcceptanceEnabled,
    signatoryType,
    signatoryName,
    signatoryTitle,
    secondarySignatoryName,
    secondarySignatoryTitle,
    signatureStyle,
    blockStyle,
    layoutBlocks
  ]);

  // Handle Save (Draft or Issued)
  const handleSaveQuotation = async (status: 'Draft' | 'Sent') => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const quoteId =
        editingQuotation?.id ||
        `quote_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

      const payload: Quotation = {
        id: quoteId,
        workspace_id: activeWorkspaceId,
        workspaceId: activeWorkspaceId,
        enquiry_id: enquiry.id || '',
        quote_number: liveQuotation.quote_number,
        revision_number: liveQuotation.revision_number,
        formatted_quote_ref: liveQuotation.formatted_quote_ref,
        parent_quote_id: liveQuotation.parent_quote_id,
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
        header_layout: headerLayout,
        table_density: tableDensity,
        show_bank_details: showBankDetails,
        show_commercial_terms: showCommercialTerms,
        show_company_seal: showCompanySeal,
        theme_accent: themeAccent,
        logo_position: logoPosition,
        amount_in_words_enabled: amountInWordsEnabled,
        customer_acceptance_enabled: customerAcceptanceEnabled,
        signatory_type: signatoryType,
        primary_signatory_name: signatoryName,
        primary_signatory_title: signatoryTitle,
        secondary_signatory_name: secondarySignatoryName,
        secondary_signatory_title: secondarySignatoryTitle,
        signature_style: signatureStyle,
        block_style: blockStyle,
        layout_blocks: layoutBlocks,
        created_at: editingQuotation?.created_at || new Date().toISOString(),
        valid_until: liveQuotation.valid_until,
        currency: liveQuotation.currency
      };

      const saved = editingQuotation?.id
        ? await QuotationRepository.saveQuotation(payload)
        : await QuotationRepository.createQuotation(payload);

      // If issuing a revision with a parent quotation, ensure predecessor parent is marked 'Superseded'
      if (status === 'Sent' && payload.parent_quote_id) {
        try {
          await QuotationRepository.updateQuotation(payload.parent_quote_id, {
            status: 'Superseded'
          });
        } catch (supErr) {
          console.warn('[QuotationStudioModal] Predecessor update notice:', supErr);
        }
      }

      triggerToast?.(
        status === 'Sent'
          ? `Quotation #${saved.formatted_quote_ref} issued successfully!`
          : `Quotation #${saved.formatted_quote_ref} draft saved!`,
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

  // Handle Save as New Template Preset
  const handleSaveNewPreset = async () => {
    if (!newPresetName.trim()) {
      triggerToast?.('Please enter a preset name.', 'error');
      return;
    }
    setIsSavingPreset(true);
    try {
      const presetData: Omit<QuotationPreset, 'id'> = {
        workspace_id: activeWorkspaceId,
        workspaceId: activeWorkspaceId,
        preset_name: newPresetName.trim(),
        header_profile_id: activeProfile?.id,
        visible_columns: visibleColumns,
        default_tax_mode: taxMode,
        default_price_basis: priceBasis,
        default_payment_terms: paymentTerms,
        default_validity_days: validityDays,
        signatory_mode: signatoryMode,
        notes_template: customNotes,
        header_layout: headerLayout,
        table_density: tableDensity,
        show_bank_details: showBankDetails,
        show_commercial_terms: showCommercialTerms,
        show_company_seal: showCompanySeal,
        theme_accent: themeAccent,
        amount_in_words_enabled: amountInWordsEnabled,
        customer_acceptance_enabled: customerAcceptanceEnabled,
        signatory_type: signatoryType,
        primary_signatory_name: signatoryName,
        primary_signatory_title: signatoryTitle,
        secondary_signatory_name: secondarySignatoryName,
        secondary_signatory_title: secondarySignatoryTitle,
        signature_style: signatureStyle,
        logo_position: logoPosition,
        block_style: blockStyle,
        layout_blocks: layoutBlocks
      };

      const saved = await QuotationRepository.savePreset(presetData);
      setPresets((prev) => [...prev.filter((p) => p.id !== saved.id), saved]);
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

  return (
    <div className="quotation-modal-container fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-hidden print:hidden">
      <div className="bg-slate-50 w-full max-w-[1400px] h-[95vh] rounded-2xl shadow-2xl flex flex-col border border-slate-300 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Top Bar */}
        <header className="px-6 py-3.5 bg-white border-b border-slate-200 flex items-center justify-between shrink-0 print:hidden">
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
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden print:overflow-visible print:block print:w-full">
          {/* Left Column: Form Controls & Customization */}
          <div className="w-full lg:w-[460px] xl:w-[500px] bg-white border-r border-slate-200 flex flex-col shrink-0 overflow-y-auto print:hidden">
            <div className="p-5 space-y-6">
              {/* Preset Selector */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-mono font-bold text-slate-500 uppercase tracking-wider">
                    Document Preset
                  </label>
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
                </div>
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

              {/* Layout Engine & Section Toggles Accordion */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setIsLayoutOpen(!isLayoutOpen)}
                  className="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100 flex items-center justify-between text-xs font-bold text-slate-800 transition cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">
                    <Layout className="w-3.5 h-3.5 text-slate-500" />
                    Header Layout & Density
                  </span>
                  {isLayoutOpen ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                </button>
                {isLayoutOpen && (
                  <div className="p-4 space-y-4 bg-white text-xs border-t border-slate-200">
                    {/* Header Layout Selector */}
                    <div>
                      <label className="block text-slate-500 font-medium mb-1.5">
                        Header Layout Architecture
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { id: 'split', label: 'Classic Split', desc: 'Side-by-side' },
                          { id: 'centered_banner', label: 'Centered Banner', desc: 'Full-width top' },
                          { id: 'modern_compact', label: 'Modern Compact', desc: 'Slim header bar' }
                        ].map((layout) => {
                          const isSelected = headerLayout === layout.id;
                          return (
                            <button
                              key={layout.id}
                              type="button"
                              onClick={() => setHeaderLayout(layout.id as QuotationHeaderLayout)}
                              className={`p-2 rounded-lg border flex flex-col items-center justify-center text-center transition cursor-pointer ${
                                isSelected
                                  ? 'border-blue-600 bg-blue-50 text-blue-700 font-semibold ring-2 ring-blue-600/20'
                                  : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
                              }`}
                            >
                              <span className="text-[11px] font-bold block">{layout.label}</span>
                              <span className="text-[9.5px] text-slate-400 mt-0.5">{layout.desc}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Table Density Switch */}
                    <div>
                      <label className="block text-slate-500 font-medium mb-1.5">
                        Itemized Table Density
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { id: 'comfortable', label: 'Comfortable', desc: 'Spacious padding' },
                          { id: 'compact', label: 'Compact', desc: 'Tighter lines (Fit more)' }
                        ].map((d) => {
                          const isSelected = tableDensity === d.id;
                          return (
                            <button
                              key={d.id}
                              type="button"
                              onClick={() => setTableDensity(d.id as QuotationTableDensity)}
                              className={`py-2 px-3 rounded-lg border flex items-center justify-between text-xs transition cursor-pointer ${
                                isSelected
                                  ? 'border-blue-600 bg-blue-50 text-blue-700 font-semibold'
                                  : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
                              }`}
                            >
                              <span>{d.label}</span>
                              <span className="text-[10px] text-slate-400 font-normal">{d.desc}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Global Presentation Layout Style (Framed vs Minimal) */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-slate-500 font-medium">
                          Global Block Style
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

                    {/* Compact Document Blocks Overview */}
                    <div className="pt-2 border-t border-slate-100 space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <label className="block text-slate-700 font-bold text-xs">
                            Document Blocks Overview
                          </label>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            Click any block or preview card to inspect & customize
                          </p>
                        </div>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium border border-slate-200">
                          {layoutBlocks.filter((b) => b.enabled).length} of {layoutBlocks.length} Active
                        </span>
                      </div>

                      <div className="space-y-1.5 mt-2">
                        {layoutBlocks.map((block, idx) => {
                          const meta = BLOCK_META[block.id];
                          const Icon = meta.icon;
                          const isFirst = idx === 0;
                          const isLast = idx === layoutBlocks.length - 1;
                          const isInspected = selectedBlockId === block.id;

                          return (
                            <div
                              key={block.id}
                              className={`border rounded-xl px-2.5 py-2 transition-all flex items-center justify-between gap-2 ${
                                isInspected
                                  ? 'bg-blue-50/80 border-blue-400 shadow-xs ring-1 ring-blue-400/50'
                                  : block.enabled
                                  ? 'bg-white hover:bg-slate-50/80 border-slate-200'
                                  : 'bg-slate-50/60 border-slate-200/60 opacity-60'
                              }`}
                            >
                              {/* Reorder arrows + Checkbox + Block Info */}
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
                                  checked={block.enabled}
                                  onChange={(e) => handleToggleBlockEnabled(block.id, e.target.checked)}
                                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0"
                                  title={block.enabled ? 'Click to hide block' : 'Click to show block'}
                                />

                                <div
                                  className="flex items-center gap-1.5 truncate cursor-pointer flex-1"
                                  onClick={() => setSelectedBlockId(isInspected ? null : block.id)}
                                >
                                  <Icon className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                  <div className="min-w-0">
                                    <p className="font-semibold text-slate-800 text-xs truncate">
                                      {meta.label}
                                    </p>
                                    <div className="flex items-center gap-1 text-[9.5px] text-slate-400 font-mono mt-0.5">
                                      <span className="capitalize">{block.placement}</span>
                                      <span>•</span>
                                      <span className="capitalize">{block.style}</span>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Inspect / Edit Button */}
                              <button
                                type="button"
                                onClick={() => setSelectedBlockId(isInspected ? null : block.id)}
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
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Branding, Themes & Presentation Accordion */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setIsBrandingOpen(!isBrandingOpen)}
                  className="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100 flex items-center justify-between text-xs font-bold text-slate-800 transition cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">
                    <Palette className="w-3.5 h-3.5 text-slate-500" />
                    Branding, Themes & Presentation
                  </span>
                  {isBrandingOpen ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                </button>
                {isBrandingOpen && (
                  <div className="p-4 space-y-4 bg-white text-xs border-t border-slate-200">
                    {/* Theme Accent Swatches */}
                    <div>
                      <label className="block text-slate-500 font-medium mb-1.5">
                        Color Theme Accent
                      </label>
                      <div className="grid grid-cols-5 gap-1.5">
                        {(['navy', 'emerald', 'blue', 'crimson', 'slate'] as QuotationThemeAccent[]).map((themeKey) => {
                          const t = QUOTATION_THEMES[themeKey];
                          const isSelected = themeAccent === themeKey;
                          return (
                            <button
                              key={themeKey}
                              type="button"
                              onClick={() => setThemeAccent(themeKey)}
                              className={`flex flex-col items-center p-2 rounded-lg border text-center transition cursor-pointer ${
                                isSelected
                                  ? 'border-slate-900 bg-slate-50 ring-2 ring-slate-900/20'
                                  : 'border-slate-200 hover:border-slate-300 bg-white'
                              }`}
                            >
                              <div
                                className="w-5 h-5 rounded-full shadow-xs mb-1"
                                style={{ backgroundColor: t.primaryHex }}
                              />
                              <span className="text-[10px] font-bold capitalize text-slate-700">
                                {themeKey}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Logo Alignment */}
                    <div>
                      <label className="block text-slate-500 font-medium mb-1.5">
                        Logo Alignment
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { id: 'left', label: 'Left', icon: AlignLeft },
                          { id: 'center', label: 'Center', icon: AlignCenter },
                          { id: 'right', label: 'Right', icon: AlignRight }
                        ].map((pos) => {
                          const Icon = pos.icon;
                          const isSelected = logoPosition === pos.id;
                          return (
                            <button
                              key={pos.id}
                              type="button"
                              onClick={() => setLogoPosition(pos.id as QuotationLogoPosition)}
                              className={`py-1.5 px-2 rounded-lg border flex items-center justify-center gap-1.5 text-xs font-medium transition cursor-pointer ${
                                isSelected
                                  ? 'border-blue-600 bg-blue-50 text-blue-700 font-semibold'
                                  : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
                              }`}
                            >
                              <Icon className="w-3.5 h-3.5" />
                              <span>{pos.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Document Options Toggles */}
                    <div className="pt-2 border-t border-slate-100 space-y-2">
                      <label className="flex items-center space-x-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={amountInWordsEnabled}
                          onChange={(e) => setAmountInWordsEnabled(e.target.checked)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-slate-700 font-medium">Amount in Words (Total Spelled Out)</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={customerAcceptanceEnabled}
                          onChange={(e) => setCustomerAcceptanceEnabled(e.target.checked)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-slate-700 font-medium">Customer Acceptance Signature Box</span>
                      </label>
                    </div>
                  </div>
                )}
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
                    Signatories & Remittance Account
                  </span>
                  {isSignatoryOpen ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                </button>
                {isSignatoryOpen && (
                  <div className="p-4 space-y-3.5 bg-white text-xs border-t border-slate-200">
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
                          className="w-full rounded-lg border border-slate-300 p-2 text-slate-800 text-xs"
                        >
                          <option value="single">Single Signatory</option>
                          <option value="dual">Dual Signatory</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-slate-500 font-medium mb-1">Signature Style</label>
                        <select
                          value={signatureStyle}
                          onChange={(e) => setSignatureStyle(e.target.value as QuotationSignatureStyle)}
                          className="w-full rounded-lg border border-slate-300 p-2 text-slate-800 text-xs"
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

                    {activeProfile?.bank_accounts && activeProfile.bank_accounts.length > 0 && (
                      <div className="pt-2 border-t border-slate-100">
                        <label className="block text-slate-500 font-medium mb-1">Remittance Bank</label>
                        <select
                          value={selectedBankId}
                          onChange={(e) => setSelectedBankId(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 p-2 text-slate-800 text-xs"
                        >
                          {activeProfile.bank_accounts.map((b) => (
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
          <div className="flex-1 bg-slate-200/80 flex flex-col overflow-hidden print:bg-transparent print:overflow-visible print:w-full print:block">
            {/* Preview Toolbar */}
            <div className="px-4 py-2 bg-slate-100 border-b border-slate-300/80 flex items-center justify-between text-xs text-slate-600 shrink-0 print:hidden flex-wrap gap-2">
              <div className="flex items-center space-x-2">
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
                  onClick={() => window.print()}
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
                className="flex-1 overflow-auto p-4 sm:p-8 flex justify-center items-start print:hidden"
              >
                <div
                  style={{
                    transform: `scale(${zoomScale})`,
                    transformOrigin: 'top center',
                    transition: 'transform 0.1s ease-out'
                  }}
                  className="preview-canvas-wrapper w-full max-w-[210mm] shadow-2xl print:hidden flex justify-center"
                >
                  <QuotationDocument
                    quotation={liveQuotation}
                    profile={activeProfile}
                    visibleColumns={visibleColumns}
                    isCompactView={tableDensity === 'compact'}
                    showBankDetails={showBankDetails}
                    showStampAndSignatures={showCompanySeal || signatoryMode !== 'none'}
                    user={user}
                    signatoryName={signatoryName}
                    signatoryTitle={signatoryTitle}
                    blockStyle={blockStyle}
                    layoutBlocks={layoutBlocks}
                    selectedBlockId={selectedBlockId}
                    onSelectBlock={(id) => setSelectedBlockId(id)}
                    showPageBreakGuides={true}
                  />
                </div>
              </div>

              {/* Retractable Right-Side Contextual Block Inspector Drawer */}
              {selectedBlock && (() => {
                const meta = BLOCK_META[selectedBlock.id];
                const Icon = meta.icon;
                const blockIndex = layoutBlocks.findIndex((b) => b.id === selectedBlock.id);
                const isFirst = blockIndex === 0;
                const isLast = blockIndex === layoutBlocks.length - 1;

                return (
                  <aside className="w-80 md:w-84 bg-white border-l border-slate-300 shadow-xl flex flex-col shrink-0 z-20 print:hidden overflow-y-auto animate-in slide-in-from-right-4 duration-200">
                    {/* Drawer Header */}
                    <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between sticky top-0 z-10">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
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
                        onClick={() => setSelectedBlockId(null)}
                        className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/80 transition cursor-pointer"
                        title="Close Inspector"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Drawer Content */}
                    <div className="p-4 space-y-4 text-xs">
                      {/* 1. Visibility Toggle */}
                      <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-3 flex items-center justify-between">
                        <div>
                          <span className="font-semibold text-slate-800 text-xs block">
                            Document Visibility
                          </span>
                          <span className="text-[10.5px] text-slate-500">
                            {selectedBlock.enabled ? 'Rendered on quotation' : 'Hidden from output'}
                          </span>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedBlock.enabled}
                            onChange={(e) => handleToggleBlockEnabled(selectedBlock.id, e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-slate-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                      </div>

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
                          Paired Left & Right blocks on the same row stretch to equal height automatically.
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

                      {/* Quick Jump to Other Blocks */}
                      <div className="pt-3 border-t border-slate-100">
                        <label className="block text-slate-400 text-[10px] uppercase tracking-wider mb-2 font-semibold">
                          Jump to Block
                        </label>
                        <div className="flex flex-wrap gap-1">
                          {layoutBlocks.map((b) => (
                            <button
                              key={b.id}
                              type="button"
                              onClick={() => setSelectedBlockId(b.id)}
                              className={`px-2 py-1 rounded text-[10px] font-medium transition cursor-pointer ${
                                selectedBlock.id === b.id
                                  ? 'bg-blue-600 text-white font-semibold'
                                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                              }`}
                            >
                              {BLOCK_META[b.id].label.split(' ')[0]}
                            </button>
                          ))}
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
      {/* Root-Level Print Portal mounted directly to document.body */}
      {typeof document !== 'undefined' && createPortal(
        <div id="quotation-print-portal" className="hidden print:block">
          <QuotationDocument
            quotation={liveQuotation}
            profile={activeProfile}
            visibleColumns={visibleColumns}
            isCompactView={tableDensity === 'compact'}
            showBankDetails={showBankDetails}
            showStampAndSignatures={showCompanySeal || signatoryMode !== 'none'}
            user={user}
            signatoryName={signatoryName}
            signatoryTitle={signatoryTitle}
            blockStyle={blockStyle}
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
