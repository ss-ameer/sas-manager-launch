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
  QuotationPageMode,
  Attachment,
  EnquiryQuotationSyncPayload
} from '../../types';
import { QuotationRepository } from '../../services/repositories/QuotationRepository';
import {
  QuotationDocument,
  QUOTATION_THEMES,
  DEFAULT_QUOTATION_BLOCKS,
  DEFAULT_HEADER_CONFIG,
  DEFAULT_RECIPIENT_CONFIG,
  DEFAULT_FOOTER_CONFIG,
  extractLineItemAttributesAndCleanDescription
} from './QuotationDocument';
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
  Upload
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
  onEnquirySync?: (syncPayload: EnquiryQuotationSyncPayload) => void;
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
  return (
    BLOCK_META[block.id] ||
    BLOCK_META[blockType] || {
      label: block.title || block.id,
      desc: 'Modular document section',
      icon: Layers
    }
  );
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
  onEnquirySync,
  triggerToast
}) => {
  if (!isOpen) return null;

  // Presets and loading states
  const [presets, setPresets] = useState<QuotationPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');
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
      (editingQuotation as any)?.companySettings?.company_seal_url ||
      profile?.stamp_seal_url ||
      ''
  );
  const [signatureImageUrl, setSignatureImageUrl] = useState<string>(
    () =>
      editingQuotation?.signature_image_url ||
      editingQuotation?.signatories?.[0]?.signature_url ||
      ''
  );
  const logoFileInputRef = useRef<HTMLInputElement | null>(null);
  const sealFileInputRef = useRef<HTMLInputElement | null>(null);
  const signatureFileInputRef = useRef<HTMLInputElement | null>(null);

  const handleUploadCompanyLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUri = typeof reader.result === 'string' ? reader.result : '';
      if (dataUri) {
        setCompanyLogoUrl(dataUri);
        setHeaderConfig((prev) => ({
          ...prev,
          logoUrl: dataUri,
          showLogo: true,
          logoDisplayMode:
            prev.logoDisplayMode === 'no_logo' ? 'logo_and_name' : prev.logoDisplayMode || 'logo_and_name'
        }));
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleUploadCompanySeal = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUri = typeof reader.result === 'string' ? reader.result : '';
      if (dataUri) {
        setCompanySealUrl(dataUri);
        setShowCompanySeal(true);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleUploadSignatureImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUri = typeof reader.result === 'string' ? reader.result : '';
      if (dataUri) {
        setSignatureImageUrl(dataUri);
        setSignatureStyle('image');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };
  const [blockStyle, setBlockStyle] = useState<'framed' | 'minimal'>(
    editingQuotation?.block_style || (editingQuotation as any)?.presentation_preset?.block_style || 'framed'
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
  const [showPageBreakGuides, setShowPageBreakGuides] = useState<boolean>(true);

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

  const handleAddPageBreak = () => {
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
    setLayoutBlocks((prev) => [...prev, newBlock]);
    setSelectedSection(newId);
  };

  const handleAddSpacer = () => {
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
    setLayoutBlocks((prev) => [...prev, newBlock]);
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
    if (editingQuotation?.price_basis !== undefined) return editingQuotation.price_basis;
    return 'Ex-Works / Delivered Site';
  });
  const [paymentTerms, setPaymentTerms] = useState<string>(() => {
    if (editingQuotation?.payment_terms !== undefined) return editingQuotation.payment_terms;
    return '100% Advance against PI / Approved Credit';
  });
  const [validityDays, setValidityDays] = useState<number>(30);
  const [customNotes, setCustomNotes] = useState<string>(() => {
    if (editingQuotation?.custom_notes !== undefined) return editingQuotation.custom_notes;
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
        beneficiaryName: b.beneficiaryName || b.account_name,
        accountNumber: b.accountNumber || b.account_number,
        iban: b.iban,
        swiftCode: b.swiftCode || b.swift_bic,
        branchName: b.branchName || b.branch_address
      };
    }
    return null;
  });

  const [isEditingBankDetails, setIsEditingBankDetails] = useState<boolean>(false);

  // Attention Contact Person inheritance
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

      if (targetQuote) {
        setClientContactPerson(
          targetQuote.client_contact_person ||
            targetQuote.client_snapshot?.client_contact_person ||
            targetQuote.client_snapshot?.contact_person ||
            (enquiry as any)?.contact_person_name ||
            enquiry?.concerned_person ||
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

        if (targetQuote.selectedBank || targetQuote.applied_bank_account) {
          const b: any = targetQuote.selectedBank || targetQuote.applied_bank_account;
          setCustomBankOverride({
            bankName: b.bankName || b.bank_name,
            beneficiaryName: b.beneficiaryName || b.account_name,
            accountNumber: b.accountNumber || b.account_number,
            iban: b.iban,
            swiftCode: b.swiftCode || b.swift_bic,
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

  const handleUploadAnnexFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    (Array.from(files) as File[]).forEach((file: File, idx: number) => {
      const isImage = file.type.startsWith('image/');
      const reader = new FileReader();
      reader.onload = () => {
        const dataUri = typeof reader.result === 'string' ? reader.result : '';
        if (!dataUri) return;
        const cleanTitle = file.name.replace(/\.[^/.]+$/, '');
        const resolvedTitle = cleanTitle || `Annex Datasheet ${flyerAttachments.length + idx + 1}`;
        const newAtt: Attachment = {
          id: `annex_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
          name: resolvedTitle,
          url: dataUri,
          type: file.type || (isImage ? 'image/png' : 'application/pdf'),
          size: file.size,
          uploadedAt: new Date().toISOString(),
          render_as_annex_page: isImage,
          show_title_on_annex: QuotationRepository.resolveShowTitleOnAnnex({ name: resolvedTitle })
        };
        setFlyerAttachments((prev) => [...prev, newAtt]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
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
      render_as_annex_page: !isPdfOrDoc,
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
        if (loadedPresets.length > 0 && !editingQuotation) {
          const defaultPreset =
            loadedPresets.find((p) => p.is_default) || loadedPresets[0];
          applyPreset(defaultPreset);
        }
      })
      .catch((err) => {
        console.warn('Failed loading presets:', err);
      });
    return () => {
      isMounted = false;
    };
  }, [activeWorkspaceId, editingQuotation]);

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
    if (preset.notes_template !== undefined) setCustomNotes(preset.notes_template);
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
  };

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
    if (sourceQuotation?.line_items && sourceQuotation.line_items.length > 0) {
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

          const { cleanDescription, extractedSpecsAttrs } =
            extractLineItemAttributesAndCleanDescription({
              item_name: li.item_name || li.product_type || `Item ${idx + 1}`,
              description: li.description || '',
              quantity: qty,
              unit: li.unit || 'pcs',
              unit_price: uPrice,
              total_price: tPrice
            });

          // Extract attributes if available
          const brandAttr =
            li.attributes?.find((a) => a.key.toLowerCase().includes('brand'))?.value ||
            extractedSpecsAttrs.find((a) => a.key.toLowerCase().includes('brand'))?.value;
          const modelAttr =
            li.attributes?.find((a) => a.key.toLowerCase().includes('model') || a.key.toLowerCase().includes('part'))?.value ||
            extractedSpecsAttrs.find((a) => a.key.toLowerCase().includes('model') || a.key.toLowerCase().includes('part'))?.value;
          const originAttr =
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

          return {
            id: li.id || `item_${idx}`,
            item_name: li.item_name || li.product_type || `Item ${idx + 1}`,
            description: cleanDescription,
            quantity: qty,
            unit: li.unit || 'pcs',
            unit_price: uPrice,
            total_price: tPrice,
            brand_make: brandAttr || undefined,
            model_part_no: modelAttr || undefined,
            country_of_origin: originAttr || undefined,
            availability: li.lead_time_note || 'Ex-Stock / Standard',
            is_optional: Boolean((li as any).is_optional),
            attributes: itemAttrs,
            page_break_after: li.page_break_after,
            row_spacer_after_mm: li.row_spacer_after_mm
          };
        });
      }
    }

    return baseItems.map((item, idx) => {
      const itemKey = item.id || `item_${idx}`;
      const customVisible = itemVisibleAttributes[itemKey] ?? item.visible_attributes;
      const customPageBreak =
        itemPageBreaks[itemKey] !== undefined
          ? itemPageBreaks[itemKey]
          : Boolean(item.page_break_after);
      return {
        ...item,
        visible_attributes: customVisible,
        page_break_after: customPageBreak
      };
    });
  }, [activeSourceQuotation, editingQuotation, enquiry?.line_items, itemVisibleAttributes, itemPageBreaks]);

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
    setItemPageBreaks((prev) => {
      const active = prev[itemKey] !== undefined ? prev[itemKey] : Boolean(currentVal);
      return {
        ...prev,
        [itemKey]: !active
      };
    });
  };

  // Calculate live financial figures
  const financialTotals = useMemo(() => {
    return QuotationRepository.calculateTotals(
      quotationLineItems,
      freightAmount,
      taxMode,
      taxRatePercent
    );
  }, [quotationLineItems, freightAmount, taxMode, taxRatePercent]);

  // Dynamic Bank Profile Registry from workspace document profile
  const bankRegistry: BankAccountProfile[] = useMemo(() => {
    const list: any[] = activeProfile?.bank_accounts || profile?.bank_accounts || [];
    const accounts: BankAccountProfile[] = list.map((b, idx) => ({
      id: b.id || `bank-${idx}`,
      bankName: b.bankName || b.bank_name || 'Corporate Bank',
      beneficiaryName: b.beneficiaryName || b.account_name || activeProfile?.legal_entity_name || '',
      accountNumber: b.accountNumber || b.account_number || '',
      iban: b.iban || '',
      swiftCode: b.swiftCode || b.swift_bic || '',
      branchName: b.branchName || b.branch_address || '',
      currency: b.currency || 'AED',
      isDefault: b.isDefault ?? b.is_default ?? false,
      bank_name: b.bankName || b.bank_name || 'Corporate Bank',
      account_name: b.beneficiaryName || b.account_name || activeProfile?.legal_entity_name || '',
      account_number: b.accountNumber || b.account_number || '',
      swift_bic: b.swiftCode || b.swift_bic || ''
    }));

    if (accounts.length === 0 && editingQuotation?.applied_bank_account) {
      const b: any = editingQuotation.applied_bank_account;
      accounts.push({
        id: b.id || 'quote-bank-applied',
        bankName: b.bankName || b.bank_name || 'Corporate Bank',
        beneficiaryName: b.beneficiaryName || b.account_name || activeProfile?.legal_entity_name || '',
        accountNumber: b.accountNumber || b.account_number || '',
        iban: b.iban || '',
        swiftCode: b.swiftCode || b.swift_bic || '',
        branchName: b.branchName || b.branch_address || '',
        currency: b.currency || 'AED',
        isDefault: true,
        bank_name: b.bankName || b.bank_name || 'Corporate Bank',
        account_name: b.beneficiaryName || b.account_name || activeProfile?.legal_entity_name || '',
        account_number: b.accountNumber || b.account_number || '',
        swift_bic: b.swiftCode || b.swift_bic || ''
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
      (base?.beneficiaryName || base?.account_name || activeProfile?.legal_entity_name || '');
    const bAcctNo = customBankOverride?.accountNumber ?? (base?.accountNumber || base?.account_number || '');
    const bIban = customBankOverride?.iban ?? (base?.iban || '');
    const bSwift = customBankOverride?.swiftCode ?? (base?.swiftCode || base?.swift_bic || '');
    const bBranch = customBankOverride?.branchName ?? (base?.branchName || base?.branch_address || '');
    const bCurr = base?.currency || 'AED';

    return {
      id: base?.id || selectedBankId || 'active-bank',
      bankName: bName,
      bank_name: bName,
      beneficiaryName: bBeneficiary,
      account_name: bBeneficiary,
      accountNumber: bAcctNo,
      account_number: bAcctNo,
      iban: bIban,
      swiftCode: bSwift,
      swift_bic: bSwift,
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
        entity_name: enquiry.company_name || enquiry.client_company || 'Valued Client',
        contact_person: clientContactPerson || enquiry.concerned_person || undefined,
        address: enquiry.project_location || enquiry.country || undefined,
        trn: undefined
      },
      client_contact_person: clientContactPerson || undefined,
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
      company_seal_url: companySealUrl || undefined,
      signature_image_url: signatureImageUrl || undefined,
      block_style: blockStyle,
      globalCardRadius: globalCardRadius,
      cardsOrder: cardsOrder,
      subjectPlacement: subjectPlacement,
      pageMode: pageMode,
      layout_blocks: layoutBlocks,
      flyer_attachments: flyerAttachments,
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
        selectedBank: activeBankProfile
      },
      visible_columns: visibleColumns,
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
    companyLogoUrl,
    companySealUrl,
    signatureImageUrl,
    blockStyle,
    globalCardRadius,
    cardsOrder,
    subjectPlacement,
    layoutBlocks,
    flyerAttachments,
    showSubmittalsIndex,
    headerConfig,
    recipientConfig,
    footerConfig,
    visibleColumns,
    clientContactPerson,
    preparedBy,
    quotationSubject,
    pageMode,
    activeQuotationId,
    parentQuotationId,
    revisionNumber,
    formattedQuoteRefOverride,
    quotationStatus
  ]);

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

  // One-click deep-clone revision handler (R1 -> R2, etc.)
  const handleCloneAsNextRevision = () => {
    const cloned = QuotationRepository.cloneQuotationAsNextRevision(
      liveQuotation,
      enquiryRevisions
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
        company_seal_url: companySealUrl || undefined,
        signature_image_url: signatureImageUrl || undefined,
        block_style: blockStyle,
        globalCardRadius: globalCardRadius,
        cardsOrder: cardsOrder,
        subjectPlacement: subjectPlacement,
        pageMode: pageMode,
        layout_blocks: layoutBlocks,
        flyer_attachments: flyerAttachments,
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
          selectedBank: activeBankProfile
        },
        visible_columns: visibleColumns as any,
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
      company_seal_url: companySealUrl || undefined,
      signature_image_url: signatureImageUrl || undefined,
      logo_position: logoPosition,
      block_style: blockStyle,
      globalCardRadius: globalCardRadius,
      cardsOrder: cardsOrder,
      subjectPlacement: subjectPlacement,
      pageMode: pageMode,
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
        selectedBank: activeBankProfile
      }
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
      <div className="bg-slate-50 w-full max-w-[1400px] h-[95vh] rounded-2xl shadow-2xl flex flex-col border border-slate-300 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
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
          <div className="w-full lg:w-[460px] xl:w-[500px] bg-white border-r border-slate-200 flex flex-col shrink-0 overflow-y-auto print:hidden">
            {/* Sticky Top Bar: Document Preset Selector + 2-Tab Mode Switcher */}
            <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-xs border-b border-slate-200 px-5 pt-4 pb-3 space-y-3">
              {/* Preset Selector */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-[11px] font-mono font-bold text-slate-500 uppercase tracking-wider">
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

                {/* Quick-Action Lifecycle Controls when a custom preset is selected */}
                {selectedPreset && (
                  <div className="mt-2 flex items-center justify-between gap-1.5 pt-1.5 border-t border-slate-100">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        disabled={isSavingPreset}
                        onClick={handleUpdatePreset}
                        title="Overwrite this preset with current studio settings"
                        className="px-2.5 py-1 text-[11px] font-semibold rounded-md bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        <Save className="w-3 h-3" />
                        <span>💾 Update Preset</span>
                      </button>

                      {selectedPreset.is_default ? (
                        <span
                          title="This preset automatically hydrates new quotations"
                          className="px-2.5 py-1 text-[11px] font-semibold rounded-md bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1"
                        >
                          <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                          <span>★ Default</span>
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={isSavingPreset}
                          onClick={handleSetDefaultPreset}
                          title="Set as default preset for new quotations in this workspace"
                          className="px-2.5 py-1 text-[11px] font-semibold rounded-md bg-slate-100 text-slate-700 border border-slate-200 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-200 transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        >
                          <Star className="w-3 h-3" />
                          <span>⭐ Set Default</span>
                        </button>
                      )}
                    </div>

                    <button
                      type="button"
                      disabled={isSavingPreset}
                      onClick={handleDeletePreset}
                      title="Delete selected custom preset"
                      className="px-2 py-1 text-[11px] font-semibold rounded-md bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>🗑️ Delete</span>
                    </button>
                  </div>
                )}
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

                    {/* Accent Color Theme: 6 Swatches (Navy, Emerald, Slate, Amber, Crimson, Teal) */}
                    <div>
                      <label className="block text-slate-500 font-medium mb-1.5">
                        Accent Color Theme
                      </label>
                      <div className="grid grid-cols-6 gap-1.5">
                        {(['navy', 'emerald', 'slate', 'amber', 'crimson', 'teal'] as QuotationThemeAccent[]).map((themeKey) => {
                          const t = QUOTATION_THEMES[themeKey] || QUOTATION_THEMES.navy;
                          const isSelected = themeAccent === themeKey;
                          return (
                            <button
                              key={themeKey}
                              type="button"
                              onClick={() => setThemeAccent(themeKey)}
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
                    </div>

                    {/* Global Font Size Scale */}
                    <div className="pt-2.5 border-t border-slate-100 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-slate-600 font-medium flex items-center gap-1.5">
                          <Type className="w-3.5 h-3.5 text-slate-400" />
                          Global Font Size Scale
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

                    {/* Canvas Page Break Guides: On | Off */}
                    <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between">
                      <div>
                        <span className="text-slate-700 font-medium block">Canvas Page Break Guides</span>
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

                  {/* Card 2: Unified Document Outline (Single Reorderable & Inspectable Tree) */}
                  <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-4 text-xs shadow-2xs">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-bold text-slate-800 flex items-center gap-1.5 text-xs">
                          <Layers className="w-3.5 h-3.5 text-blue-600" />
                          Unified Document Outline
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

                    {/* Reorderable Closing Sequence (layoutBlocks) */}
                    <div className="pt-3 border-t border-slate-100 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-slate-400">
                          Reorderable Closing Sequence
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
                          const isRemovable = blockType === 'page_break' || blockType === 'spacer';

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
                                  <Icon className={`w-3.5 h-3.5 shrink-0 ${blockType === 'page_break' ? 'text-amber-600' : 'text-slate-500'}`} />
                                  <div className="min-w-0">
                                    <p className="font-semibold text-slate-800 text-xs truncate">
                                      {meta.label}
                                    </p>
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
                                          <span className="capitalize">{block.placement || 'full'}</span>
                                          <span>•</span>
                                          <span className="capitalize">{block.style || 'framed'}</span>
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

                      {/* Bottom Action Buttons: + Insert Page Break & + Insert Vertical Spacer */}
                      <div className="grid grid-cols-2 gap-2 pt-1.5">
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
                  </div>

                  {/* Card 2: Commercial Terms & Validity */}
                  <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-3 text-xs shadow-2xs">
                    <span className="font-bold text-slate-800 flex items-center gap-1.5 text-xs">
                      <FileCheck className="w-3.5 h-3.5 text-blue-600" />
                      Commercial Terms &amp; Validity
                    </span>
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
                          <span>📤 Upload Stamp / Seal Image</span>
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
                            onClick={() => setCompanySealUrl('')}
                            className="px-2 py-1 rounded-md text-[10px] font-semibold text-rose-600 hover:bg-rose-50 border border-rose-200 transition cursor-pointer shrink-0"
                          >
                            🗑️ Remove Stamp Image
                          </button>
                        </div>
                      )}

                      {signatureStyle === 'image' && (
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
                              <span>📤 Upload Signature Image</span>
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
                                onClick={() => setSignatureImageUrl('')}
                                className="px-2 py-1 rounded-md text-[10px] font-semibold text-rose-600 hover:bg-rose-50 border border-rose-200 transition cursor-pointer shrink-0"
                              >
                                🗑️ Remove
                              </button>
                            </div>
                          )}
                        </div>
                      )}
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

                  {/* Card 4: Technical Annexures & Flyers */}
                  <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-3.5 text-xs shadow-2xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800 flex items-center gap-1.5 text-xs">
                        <Paperclip className="w-3.5 h-3.5 text-blue-600" />
                        <span>Technical Annexures &amp; Flyers</span>
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
                        Show Technical Submittals Index on Quotation
                      </span>
                    </label>

                    {/* Upload Image File or Add by Title + URL */}
                    <div className="space-y-2 pt-1 border-t border-slate-100">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-700 text-[11px]">
                          Add Datasheet / Product Flyer
                        </span>
                        <input
                          ref={annexFileInputRef}
                          type="file"
                          accept="image/*,.pdf"
                          multiple
                          onChange={handleUploadAnnexFiles}
                          className="hidden"
                        />
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
                          placeholder="Display Title (e.g., Annex A: Disk Diffuser Datasheet)"
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
                          <span className="font-semibold text-slate-700">Attached Submittals ({flyerAttachments.length})</span>
                          <span className="font-mono">
                            {flyerAttachments.filter((a) => a.render_as_annex_page !== false && a.url).length} A4 Annex Sheet(s)
                          </span>
                        </div>
                        <div className="space-y-2 max-h-72 overflow-y-auto pr-0.5">
                          {flyerAttachments.map((att, idx) => {
                            const attId = att.id || `annex_${idx}`;
                            const isAnnexPage = att.render_as_annex_page !== false;
                            const showTitleInHeader = att.show_title_on_annex !== false;
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
                                      alt={att.name || `Annex ${idx + 1}`}
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

                                {/* Show Title in Annex Header Toggle */}
                                {isAnnexPage && (
                                  <label className="flex items-center justify-between px-2 py-1 rounded-lg bg-white border border-slate-200/80 cursor-pointer select-none">
                                    <span className="text-[10.5px] font-medium text-slate-700">
                                      Show Title in Annex Header
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

                                <div className="grid grid-cols-2 gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleUpdateAttachment(attId, { render_as_annex_page: true })
                                    }
                                    className={`py-1.5 px-2 rounded-lg border text-[10.5px] font-semibold flex items-center justify-center gap-1 transition cursor-pointer ${
                                      isAnnexPage
                                        ? 'border-blue-600 bg-blue-600 text-white shadow-2xs'
                                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                                    }`}
                                  >
                                    <span>📄 Full-Page Annex Sheet</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleUpdateAttachment(attId, { render_as_annex_page: false })
                                    }
                                    className={`py-1.5 px-2 rounded-lg border text-[10.5px] font-semibold flex items-center justify-center gap-1 transition cursor-pointer ${
                                      !isAnnexPage
                                        ? 'border-slate-800 bg-slate-800 text-white shadow-2xs'
                                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                                    }`}
                                  >
                                    <span>📎 Index Reference Only</span>
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-400 italic text-center py-2">
                        No technical flyers or datasheets attached yet.
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
                disabled={isSaving}
                className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 font-medium text-xs rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSaveQuotation(quotationStatus || 'Draft')}
                  disabled={isSaving}
                  className="px-3.5 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-xl shadow-2xs transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5 text-slate-500" />
                  <span>{quotationStatus && quotationStatus !== 'Draft' ? `Save (${quotationStatus})` : 'Save Draft'}</span>
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
                    onSelectSection={(sec) => setSelectedSection(sec)}
                    onSelectBlock={(id) => setSelectedSection(id)}
                    showPageBreakGuides={showPageBreakGuides}
                  />
                </div>
              </div>

              {/* Retractable Right-Side Contextual Header Inspector Drawer */}
              {selectedSection === 'header' && (
                <aside className="w-80 md:w-84 bg-white border-l border-slate-300 shadow-xl flex flex-col shrink-0 z-20 print:hidden overflow-y-auto animate-in slide-in-from-right-4 duration-200">
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
                          <div className="space-y-2">
                            <label className="block text-slate-800 font-bold text-xs flex items-center gap-1.5">
                              <ImageIcon className="w-3.5 h-3.5 text-blue-600" />
                              Corporate Logo &amp; Letterhead Graphic
                            </label>
                            <p className="text-[10.5px] text-slate-500 leading-normal">
                              Upload a transparent PNG, SVG, or full-width letterhead banner for this quotation and saved presets.
                            </p>

                            <input
                              ref={logoFileInputRef}
                              type="file"
                              accept="image/*"
                              onChange={handleUploadCompanyLogo}
                              className="hidden"
                            />

                            <div className="flex items-center gap-2 pt-0.5">
                              <button
                                type="button"
                                onClick={() => logoFileInputRef.current?.click()}
                                className="flex-1 py-2 px-3 rounded-xl border border-blue-200 bg-blue-50/70 hover:bg-blue-100/80 text-blue-700 font-semibold text-[11px] flex items-center justify-center gap-1.5 transition cursor-pointer shadow-2xs"
                              >
                                <Upload className="w-3.5 h-3.5 shrink-0" />
                                <span>📤 Upload Corporate Logo (PNG / JPG / SVG)</span>
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
                                    <span>🗑️ Remove Custom Logo</span>
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

                          {/* 2. 4-Way Logo & Identity Display Mode */}
                          <div className="space-y-2 pt-2 border-t border-slate-100">
                            <label className="block text-slate-800 font-bold text-xs flex items-center gap-1.5">
                              <Sliders className="w-3.5 h-3.5 text-blue-600" />
                              Logo &amp; Identity Display Mode
                            </label>
                            <p className="text-[10.5px] text-slate-500 leading-normal">
                              Choose how your logo lockup and legal entity name combine in the letterhead.
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
                                  label: 'Wide Logo Lockup Only',
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

                            {/* Logo Breathing Room */}
                            <div className="pt-1.5">
                              <label className="block text-[10.5px] font-semibold text-slate-700 mb-1.5">
                                Logo Breathing Room
                              </label>
                              <div className="grid grid-cols-4 gap-1.5">
                                {[
                                  { id: 'none' as const, label: 'None', desc: '0px' },
                                  { id: 'tight' as const, label: 'Compact', desc: '8px' },
                                  { id: 'normal' as const, label: 'Normal', desc: '16px' },
                                  { id: 'spacious' as const, label: 'Spacious', desc: '24px' }
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

                          {/* 5. Contact & Legal Visibility Toggles */}
                          <div className="space-y-2 pt-2 border-t border-slate-100">
                            <label className="block text-slate-800 font-bold text-xs flex items-center gap-1.5">
                              <Columns className="w-3.5 h-3.5 text-blue-600" />
                              Contact &amp; Legal Visibility
                            </label>
                            <div className="space-y-1.5 pt-0.5">
                              {[
                                {
                                  key: 'showCompanyName' as const,
                                  label: 'Company Legal Entity Name',
                                  desc: 'Render corporate name text alongside brand logo',
                                  checked:
                                    activeLogoDisplayMode !== 'logo_only' &&
                                    headerConfig.showCompanyName !== false
                                },
                                {
                                  key: 'showTrn' as const,
                                  label: 'TRN / Tax Registration',
                                  desc: 'Official VAT / Tax identification number',
                                  checked: headerConfig.showTrn !== false
                                },
                                {
                                  key: 'showPhone' as const,
                                  label: 'Phone Number',
                                  desc: 'Official contact phone number',
                                  checked: headerConfig.showPhone !== false
                                },
                                {
                                  key: 'showEmail' as const,
                                  label: 'Email Address',
                                  desc: 'Primary corporate quotation inbox',
                                  checked: headerConfig.showEmail !== false
                                },
                                {
                                  key: 'showWebsite' as const,
                                  label: 'Website URL',
                                  desc: 'Corporate domain / online portal',
                                  checked: headerConfig.showWebsite !== false
                                }
                              ].map((item) => (
                                <div
                                  key={item.key}
                                  className={`border rounded-xl p-2 transition-all flex items-center justify-between gap-2 ${
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
                                      onChange={(e) => {
                                        const checked = e.target.checked;
                                        setHeaderConfig((prev) => ({
                                          ...prev,
                                          [item.key]: checked,
                                          ...(item.key === 'showCompanyName' && checked && prev.logoDisplayMode === 'logo_only'
                                            ? { logoDisplayMode: 'logo_and_name' }
                                            : {})
                                        }));
                                      }}
                                      className="sr-only peer"
                                    />
                                    <div className="w-8 h-4.5 bg-slate-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-blue-600"></div>
                                  </label>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* 6. Page 2+ Continuation Header Controls */}
                          <div className="space-y-2 pt-2 border-t border-slate-100">
                            <label className="block text-slate-800 font-bold text-xs flex items-center gap-1.5">
                              <FileText className="w-3.5 h-3.5 text-blue-600" />
                              Page 2+ Continuation &amp; Annex Headers
                            </label>
                            <div className="space-y-1.5">
                              <div
                                className={`border rounded-xl p-2.5 transition-all flex items-center justify-between gap-2 ${
                                  headerConfig.repeatHeaderOnSubsequentPages !== false
                                    ? 'bg-white border-slate-200 shadow-2xs'
                                    : 'bg-slate-50/70 border-slate-200/60 opacity-60'
                                }`}
                              >
                                <div className="min-w-0 pr-1">
                                  <span className="font-semibold text-slate-800 text-xs block leading-tight">
                                    Repeat Compact Header on Page 2+
                                  </span>
                                  <span className="text-[10px] text-slate-400 block mt-0.5 truncate">
                                    Company name, quote ref &amp; date on continuation sheets
                                  </span>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                                  <input
                                    type="checkbox"
                                    checked={headerConfig.repeatHeaderOnSubsequentPages !== false}
                                    onChange={(e) =>
                                      setHeaderConfig((prev) => ({
                                        ...prev,
                                        repeatHeaderOnSubsequentPages: e.target.checked
                                      }))
                                    }
                                    className="sr-only peer"
                                  />
                                  <div className="w-8 h-4.5 bg-slate-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-blue-600"></div>
                                </label>
                              </div>

                              <div
                                className={`border rounded-xl p-2.5 transition-all flex items-center justify-between gap-2 ${
                                  headerConfig.showLogoOnContinuationPages !== false
                                    ? 'bg-white border-slate-200 shadow-2xs'
                                    : 'bg-slate-50/70 border-slate-200/60 opacity-60'
                                }`}
                              >
                                <div className="min-w-0 pr-1">
                                  <span className="font-semibold text-slate-800 text-xs block leading-tight">
                                    Include Mini Logo on Page 2+ &amp; Annex Headers
                                  </span>
                                  <span className="text-[10px] text-slate-400 block mt-0.5 truncate">
                                    Render compact h-5 logo mark beside company name
                                  </span>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                                  <input
                                    type="checkbox"
                                    checked={headerConfig.showLogoOnContinuationPages !== false}
                                    onChange={(e) =>
                                      setHeaderConfig((prev) => ({
                                        ...prev,
                                        showLogoOnContinuationPages: e.target.checked
                                      }))
                                    }
                                    className="sr-only peer"
                                  />
                                  <div className="w-8 h-4.5 bg-slate-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-blue-600"></div>
                                </label>
                              </div>
                            </div>
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
                <aside className="w-80 md:w-84 bg-white border-l border-slate-300 shadow-xl flex flex-col shrink-0 z-20 print:hidden overflow-y-auto animate-in slide-in-from-right-4 duration-200">
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

                    {/* 3. B2B Corporate Snapshot Overview */}
                    <div className="space-y-2 pt-2 border-t border-slate-100">
                      <label className="block text-slate-800 font-bold text-xs flex items-center gap-1.5">
                        <Building className="w-3.5 h-3.5 text-blue-600" />
                        Client Corporate Details (Snapshot)
                      </label>
                      <div className="border border-slate-200 bg-slate-50/70 rounded-xl p-3 space-y-2 text-[11px]">
                        <div>
                          <span className="text-slate-400 text-[10px] uppercase font-bold block">Company / Client Name</span>
                          <span className="font-semibold text-slate-900">
                            {liveQuotation.client_snapshot?.entity_name || 'Client Name / Unspecified'}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 text-[10px] uppercase font-bold block">Contact Person (Attn)</span>
                          <span className="text-slate-800">
                            {liveQuotation.client_contact_person ||
                              liveQuotation.client_snapshot?.client_contact_person ||
                              liveQuotation.client_snapshot?.contact_person ||
                              'Procurement / Commercial Dept.'}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 text-[10px] uppercase font-bold block">Registered Address</span>
                          <span className="text-slate-700">
                            {liveQuotation.client_address ||
                              liveQuotation.client_snapshot?.client_address ||
                              liveQuotation.client_snapshot?.address ||
                              liveQuotation.client_snapshot?.city ||
                              'United Arab Emirates'}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 text-[10px] uppercase font-bold block">Tax Registration (TRN)</span>
                          <span className="font-mono text-slate-800">
                            {liveQuotation.client_trn ||
                              liveQuotation.client_snapshot?.client_trn ||
                              liveQuotation.client_snapshot?.trn ||
                              'Not Registered'}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 text-[10px] uppercase font-bold block">Communications</span>
                          <span className="text-slate-700">
                            {[
                              liveQuotation.client_phone || liveQuotation.client_snapshot?.client_phone || liveQuotation.client_snapshot?.phone,
                              liveQuotation.client_email || liveQuotation.client_snapshot?.client_email || liveQuotation.client_snapshot?.email
                            ]
                              .filter(Boolean)
                              .join(' • ') || '—'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Informational Guardrail Card */}
                    <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-3 text-slate-600 space-y-1">
                      <div className="font-semibold text-blue-900 text-[11px] flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                        CRM Snapshot Isolation
                      </div>
                      <p className="text-[10px] text-slate-500 leading-relaxed">
                        Client contact person, address and TRN are securely snapped to this document version.
                      </p>
                    </div>
                  </div>
                </aside>
              )}

              {/* Retractable Right-Side Contextual Commercial Offer Inspector Drawer */}
              {selectedSection === 'quote_meta' && (
                <aside className="w-80 md:w-84 bg-white border-l border-slate-300 shadow-xl flex flex-col shrink-0 z-20 print:hidden overflow-y-auto animate-in slide-in-from-right-4 duration-200">
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
                <aside className="w-80 md:w-84 bg-white border-l border-slate-300 shadow-xl flex flex-col shrink-0 z-20 print:hidden overflow-y-auto animate-in slide-in-from-right-4 duration-200">
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
                      <textarea
                        rows={3}
                        value={quotationSubject}
                        onChange={(e) => setQuotationSubject(e.target.value)}
                        placeholder="e.g. Proposal for RO Equipment – Job 3463"
                        className="w-full px-2.5 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs leading-relaxed resize-none"
                      />
                      <p className="text-[10px] text-slate-400">
                        Inherited automatically from customer enquiry subject if available.
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
                <aside className="w-80 md:w-84 bg-white border-l border-slate-300 shadow-xl flex flex-col shrink-0 z-20 print:hidden overflow-y-auto animate-in slide-in-from-right-4 duration-200">
                  {/* Drawer Header */}
                  <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between sticky top-0 z-10">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                        <ShieldCheck className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-bold text-slate-900 text-xs truncate">
                          Footer &amp; Legal Baseline
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

                    {/* 2. Custom Micro-Footer Disclaimer Text */}
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
                      <textarea
                        rows={3}
                        value={footerConfig.customDisclaimer ?? DEFAULT_FOOTER_CONFIG.customDisclaimer ?? ''}
                        onChange={(e) =>
                          setFooterConfig((prev) => ({
                            ...prev,
                            customDisclaimer: e.target.value
                          }))
                        }
                        className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition resize-none"
                        placeholder="Enter custom micro-footer disclaimer..."
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
                <aside className="w-80 md:w-84 bg-white border-l border-slate-300 shadow-xl flex flex-col shrink-0 z-20 print:hidden overflow-y-auto animate-in slide-in-from-right-4 duration-200">
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

                    {/* Line-Item Row Page Breaks ("Split Table Here") Inspector Section */}
                    <div className="pt-2 border-t border-slate-100 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                          <Scissors className="w-3.5 h-3.5 text-amber-600" />
                          Line-Item Row Page Breaks
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">
                          {quotationLineItems.slice(0, -1).filter((it) => it.page_break_after).length} Active
                        </span>
                      </div>
                      <p className="text-[10.5px] text-slate-500 leading-normal">
                        Split long quotation tables cleanly onto a new A4 sheet after any line item row with repeated column headers and continuous item numbering.
                      </p>

                      <div className="space-y-2 pt-1 max-h-60 overflow-y-auto pr-1">
                        {quotationLineItems.map((item, idx) => {
                          const itemKey = item.id || `item_${idx}`;
                          const isLastItem = idx === quotationLineItems.length - 1;
                          const hasBreakAfter = Boolean(item.page_break_after) && !isLastItem;

                          return (
                            <div
                              key={itemKey}
                              className={`p-2.5 rounded-xl border transition space-y-1.5 ${
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
                                  <span className="font-semibold text-slate-800 text-[11px] truncate" title={item.item_name}>
                                    {item.item_name}
                                  </span>
                                </div>
                                {!isLastItem ? (
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
                                    <span>✂ Page Break After Item</span>
                                  </button>
                                ) : (
                                  <span className="text-[9.5px] font-mono text-slate-400 shrink-0">
                                    Last Item
                                  </span>
                                )}
                              </div>
                              {hasBreakAfter && (
                                <div className="px-2 py-1 rounded-md bg-amber-100/90 border border-amber-300 text-amber-900 text-[10px] font-mono font-semibold flex items-center justify-between">
                                  <span>📄 Splits to Next Page After Item #{idx + 1}</span>
                                  <span className="text-[9px] text-amber-700">Sheet Break</span>
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

                      {/* Granular Attribute Key Filter */}
                      {visibleColumns.showItemAttributes !== false && availableAttributeKeys.length > 0 && (
                        <div className="space-y-2 pt-1 border-t border-slate-100">
                          <div className="flex items-center justify-between">
                            <label className="text-[11px] font-semibold text-slate-700">
                              Granular Attribute Key Filter
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

                    {/* 2. Row Padding Density */}
                    <div className="pt-2 border-t border-slate-100 space-y-2">
                      <label className="block text-slate-800 font-bold text-xs">
                        Row Padding Density
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

                    {/* 3. Table Typography Scaling */}
                    <div className="pt-2 border-t border-slate-100 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="block text-slate-800 font-bold text-xs flex items-center gap-1.5">
                          <Type className="w-3.5 h-3.5 text-blue-600" />
                          Table Typography Scaling
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
                  <aside className="w-80 md:w-84 bg-white border-l border-slate-300 shadow-xl flex flex-col shrink-0 z-20 print:hidden overflow-y-auto animate-in slide-in-from-right-4 duration-200">
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

                      {/* STANDARD BLOCK CONTROLS */}
                      {selectedBlockType !== 'page_break' && selectedBlockType !== 'spacer' && (
                        <>
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

                          {/* Financial Totals Specific Options */}
                          {selectedBlock.id === 'totals' && (
                            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 space-y-2">
                              <div className="flex items-center justify-between">
                                <div>
                                  <span className="font-semibold text-slate-800 text-xs block">
                                    Show Amount in Words (Legal Phrasing)
                                  </span>
                                  <span className="text-[10.5px] text-slate-500">
                                    Formal legal spelling of Grand Total (e.g. "Say UAE Dirhams...")
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
                            </div>
                          )}

                          {/* Signatory Block Specific Options */}
                          {selectedBlock.id === 'signatory' && (
                            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 space-y-3">
                              <div className="flex items-center justify-between">
                                <div>
                                  <span className="font-semibold text-slate-800 text-xs block">
                                    Show Company Seal Placeholder
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
                                  <span>📤 Upload Stamp / Seal Image</span>
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
                                        Stamp Image Uploaded
                                      </span>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => setCompanySealUrl('')}
                                      className="px-2 py-1 rounded-md text-[10px] font-semibold text-rose-600 hover:bg-rose-50 border border-rose-200 transition cursor-pointer shrink-0"
                                    >
                                      🗑️ Remove Stamp Image
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

                              {signatureStyle === 'image' && (
                                <div className="space-y-2">
                                  <button
                                    type="button"
                                    onClick={() => signatureFileInputRef.current?.click()}
                                    className="w-full py-1.5 px-3 rounded-lg bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 font-semibold text-[11px] flex items-center justify-center gap-1.5 transition cursor-pointer shadow-2xs"
                                  >
                                    <Upload className="w-3.5 h-3.5" />
                                    <span>📤 Upload Signature Image</span>
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
                                          Signature Uploaded
                                        </span>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => setSignatureImageUrl('')}
                                        className="px-2 py-1 rounded-md text-[10px] font-semibold text-rose-600 hover:bg-rose-50 border border-rose-200 transition cursor-pointer shrink-0"
                                      >
                                        🗑️ Remove
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}

                              <button
                                type="button"
                                onClick={() => setActiveLeftTab('content')}
                                className="w-full py-2 px-3 rounded-lg border border-blue-200 bg-blue-50/70 hover:bg-blue-100 text-blue-700 font-semibold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                              >
                                <span>📝 Edit Signatory Names in Deal Data</span>
                              </button>
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

                              <button
                                type="button"
                                onClick={() => {
                                  setActiveLeftTab('content');
                                  setIsEditingBankDetails(true);
                                }}
                                className="w-full py-2 px-3 rounded-lg border border-blue-200 bg-blue-50/70 hover:bg-blue-100 text-blue-700 font-semibold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                              >
                                <span>📝 Edit Wire Details in Deal Data</span>
                              </button>
                            </div>
                          )}
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
                            onClick={handleAddPageBreak}
                            className="py-1.5 px-2 rounded-lg border border-dashed border-amber-300 bg-amber-50/50 hover:bg-amber-100/70 text-amber-800 font-semibold text-[11px] flex items-center justify-center gap-1 transition cursor-pointer"
                          >
                            <Scissors className="w-3 h-3 text-amber-600" />
                            <span>+ Page Break</span>
                          </button>
                          <button
                            type="button"
                            onClick={handleAddSpacer}
                            className="py-1.5 px-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold text-[11px] flex items-center justify-center gap-1 transition cursor-pointer"
                          >
                            <MoveVertical className="w-3 h-3 text-slate-500" />
                            <span>+ Spacer</span>
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
