import {
  Quotation,
  QuotationPreset,
  QuotationTaxMode,
  WorkspaceDocumentProfile,
  EnquiryQuotationSyncPayload
} from '../../types';
import { safeGetDocs, safeGetDoc, safeSetDoc, safeAddDoc, safeUpdateDoc, safeDeleteDoc, db } from '../../firebase';
import { getFromLocalStore, saveToLocalStore } from '../db';
import { where, orderBy, doc } from 'firebase/firestore';

export interface TaxCalculationResult {
  subtotal: number;
  freight_amount: number;
  tax_rate_percent: number;
  tax_amount: number;
  grand_total: number;
}

export class QuotationRepository {
  private static QUOTATIONS_STORE = 'quotations';
  private static PRESETS_STORE = 'quotation_presets';
  private static PROFILES_STORE = 'workspace_document_profiles';

  /**
   * Pure calculation helper for tax and totals based on QuotationTaxMode:
   * - 'tax_calculated': Prices are tax-inclusive. Tax is extracted from (subtotal + freight).
   * - 'taxes_extra': Prices are tax-exclusive. Tax is added on top of (subtotal + freight).
   * - 'tax_exempt': No tax applied (tax_amount = 0).
   */
  public static roundCurrency(val: number): number {
    if (!Number.isFinite(val)) return 0;
    return Math.round((val + Math.sign(val || 1) * Number.EPSILON) * 100) / 100;
  }

  public static calculateTotals(
    lineItems: Array<{
      total_price?: number;
      quantity?: number;
      unit_price?: number;
      is_optional?: boolean;
    }>,
    freightAmount: number = 0,
    taxMode: QuotationTaxMode = 'taxes_extra',
    taxRatePercent: number = 5
  ): TaxCalculationResult {
    // Only non-optional items contribute to financial totals; accumulate in integer subunits (fils) to prevent 0.1 + 0.2 drift
    const subtotalFils = (lineItems || [])
      .filter((item) => !item.is_optional)
      .reduce((sumFils, item) => {
        const rawLineTotal =
          item.total_price !== undefined && item.total_price !== null
            ? Number(item.total_price) || 0
            : (Number(item.quantity) || 0) * (Number(item.unit_price) || 0);
        const lineFils = Math.round((rawLineTotal + Math.sign(rawLineTotal || 1) * Number.EPSILON) * 100);
        return sumFils + lineFils;
      }, 0);

    const subtotal = subtotalFils / 100;
    const cleanFreight = this.roundCurrency(Number(freightAmount) || 0);
    const taxableBase = this.roundCurrency(subtotal + cleanFreight);

    let taxAmount = 0;
    let grandTotal = taxableBase;

    if (taxMode === 'tax_exempt' || taxRatePercent <= 0) {
      taxAmount = 0;
      grandTotal = taxableBase;
    } else if (taxMode === 'tax_calculated') {
      // Inclusive tax: Tax = Base - (Base / (1 + rate / 100))
      taxAmount = this.roundCurrency(taxableBase - taxableBase / (1 + taxRatePercent / 100));
      grandTotal = this.roundCurrency(taxableBase);
    } else if (taxMode === 'taxes_extra') {
      // Exclusive tax: Tax = Base * (rate / 100)
      taxAmount = this.roundCurrency(taxableBase * (taxRatePercent / 100));
      grandTotal = this.roundCurrency(taxableBase + taxAmount);
    }

    return {
      subtotal: this.roundCurrency(subtotal),
      freight_amount: cleanFreight,
      tax_rate_percent: taxRatePercent,
      tax_amount: taxAmount,
      grand_total: grandTotal
    };
  }

  /**
   * Deserializes and standardizes dual workspace fields for Quotation entities.
   */
  public static docToQuotation(id: string, data: any): Quotation {
    if (!data) return { id } as Quotation;
    const wsId = data.workspace_id || data.workspaceId || 'ws_default';
    const parentId = data.parent_quotation_id || data.parent_quote_id;
    return {
      ...data,
      id: id || data.id,
      workspace_id: wsId,
      workspaceId: wsId,
      revision_number: typeof data.revision_number === 'number' ? data.revision_number : 0,
      status: data.status || 'Draft',
      parent_quotation_id: parentId,
      parent_quote_id: parentId,
      superseded_by_id: data.superseded_by_id,
      line_items: Array.isArray(data.line_items) ? data.line_items : [],
      tax_mode: data.tax_mode || 'taxes_extra',
      subtotal: Number(data.subtotal) || 0,
      freight_amount: Number(data.freight_amount) || 0,
      tax_rate_percent: Number(data.tax_rate_percent) || 0,
      tax_amount: Number(data.tax_amount) || 0,
      grand_total: Number(data.grand_total) || 0,
      is_deleted: Boolean(data.is_deleted),
      deleted_at: data.deleted_at || null,
      deleted_by_id: data.deleted_by_id || null,
      deleted_by_name: data.deleted_by_name || null,
      created_at: data.created_at || new Date().toISOString()
    } as Quotation;
  }

  /**
   * Pure, deterministic deep-clone revision helper (R1 -> R2, etc.):
   * - Computes nextRev = Math.max(source.revision_number || 1, ...(existingRevisions || []).map(q => q.revision_number || 1)) + 1
   * - Generates a fresh ID, updates formatted_quote_ref with -R${nextRev}, sets status: 'Draft', and sets parent_quotation_id: source.id
   * - Deep-clones 100% of Phase 1–3.2 fields without shared reference mutation.
   */
  public static isGenericCameraFilename(name?: string | null): boolean {
    if (!name || !name.trim()) return true;
    const cleaned = name.trim().replace(/\.[^/.]+$/, '');
    return /^(whatsapp\s*(image|video|doc|audio)?|img[-_\s]|dsc[-_\s]|pxl[-_\s]|screenshot|screen\s*shot|photo[-_\s]?|image[-_\s]?\d*|dcim|vid[-_\s])/i.test(
      cleaned
    );
  }

  public static resolveShowTitleOnAnnex(att: {
    name?: string | null;
    show_title_on_annex?: boolean;
  }): boolean {
    if (typeof att.show_title_on_annex === 'boolean') {
      return att.show_title_on_annex;
    }
    return !this.isGenericCameraFilename(att.name);
  }

  public static cloneQuotationAsNextRevision(
    source: Quotation,
    existingRevisions?: Quotation[]
  ): Quotation {
    const nextRev =
      Math.max(
        source.revision_number || 1,
        ...(existingRevisions || []).map((q) => q.revision_number || 1)
      ) + 1;

    const freshId = `quote_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const wsId = source.workspace_id || source.workspaceId || 'ws_default';

    const baseQuoteNumber = (
      source.quote_number ||
      (source.formatted_quote_ref ? source.formatted_quote_ref.replace(/-R\d+$/i, '') : 'QT-0001')
    ).replace(/-R\d+$/i, '');

    const formattedQuoteRef = source.formatted_quote_ref
      ? /-R\d+$/i.test(source.formatted_quote_ref)
        ? source.formatted_quote_ref.replace(/-R\d+$/i, `-R${nextRev}`)
        : `${source.formatted_quote_ref}-R${nextRev}`
      : `${baseQuoteNumber}-R${nextRev}`;

    // Deep-clone line_items preserving all Phase 1–3.2 properties
    const clonedLineItems = Array.isArray(source.line_items)
      ? source.line_items.map((item) => {
          const clonedAttributes = Array.isArray(item.attributes)
            ? item.attributes.map((attr) => ({ ...attr }))
            : undefined;
          const clonedTechAttributes = Array.isArray(item.technical_attributes)
            ? item.technical_attributes.map((attr) => ({ ...attr }))
            : item.technical_attributes && typeof item.technical_attributes === 'object'
            ? { ...item.technical_attributes }
            : undefined;
          const itemAny = item as any;
          const clonedSpecs = Array.isArray(itemAny.specs)
            ? itemAny.specs.map((s: any) => ({ ...s }))
            : undefined;
          return {
            ...item,
            ...(clonedAttributes !== undefined ? { attributes: clonedAttributes } : {}),
            ...(clonedTechAttributes !== undefined
              ? { technical_attributes: clonedTechAttributes }
              : {}),
            ...(Array.isArray(item.visible_attributes)
              ? { visible_attributes: [...item.visible_attributes] }
              : {}),
            ...(Array.isArray(item.hidden_attributes)
              ? { hidden_attributes: [...item.hidden_attributes] }
              : {}),
            ...(clonedSpecs !== undefined ? { specs: clonedSpecs } : {}),
            page_break_after: Boolean(item.page_break_after),
            ...(typeof item.row_spacer_after_mm === 'number'
              ? { row_spacer_after_mm: item.row_spacer_after_mm }
              : {}),
            is_optional: Boolean(item.is_optional)
          };
        })
      : [];

    // Deep-clone layout_blocks preserving page_break & spacer configurations
    const clonedLayoutBlocks = Array.isArray(source.layout_blocks)
      ? source.layout_blocks.map((block) => ({
          ...block,
          ...(typeof block.spacer_height_mm === 'number'
            ? { spacer_height_mm: block.spacer_height_mm }
            : {}),
          ...(typeof block.spacer_fill_remaining === 'boolean'
            ? { spacer_fill_remaining: block.spacer_fill_remaining }
            : {}),
          ...(typeof block.show_continuation_header === 'boolean'
            ? { show_continuation_header: block.show_continuation_header }
            : {})
        }))
      : undefined;

    // Deep-clone visible_columns
    const clonedVisibleColumns = source.visible_columns
      ? {
          ...source.visible_columns,
          ...(Array.isArray(source.visible_columns.hiddenAttributeKeys)
            ? { hiddenAttributeKeys: [...source.visible_columns.hiddenAttributeKeys] }
            : {})
        }
      : undefined;

    // Deep-clone flyer_attachments preserving show_title_on_annex and render_as_annex_page
    const clonedFlyerAttachments = Array.isArray(source.flyer_attachments)
      ? source.flyer_attachments.map((att) => ({
          ...att,
          show_title_on_annex: this.resolveShowTitleOnAnnex(att)
        }))
      : undefined;

    // Deep-clone configs and bank snapshots
    const clonedSelectedBank = source.selectedBank
      ? { ...source.selectedBank }
      : source.selected_bank
      ? { ...source.selected_bank }
      : undefined;

    const clonedAppliedBank = source.applied_bank_account
      ? { ...source.applied_bank_account }
      : undefined;

    const clonedFooterConfig = source.footer_config
      ? {
          ...source.footer_config,
          ...(source.footer_config.selectedBank
            ? { selectedBank: { ...source.footer_config.selectedBank } }
            : {})
        }
      : undefined;

    const clonedHeaderConfig = source.header_config
      ? {
          ...source.header_config,
          logoUrl: source.header_config.logoUrl ?? source.company_logo_url
        }
      : source.company_logo_url
      ? { logoUrl: source.company_logo_url }
      : undefined;

    const clonedRecipientConfig = source.recipient_config
      ? { ...source.recipient_config }
      : undefined;

    const clonedSignatories = Array.isArray(source.signatories)
      ? source.signatories.map((sig) => ({ ...sig }))
      : undefined;

    const clonedClientSnapshot = source.client_snapshot
      ? { ...source.client_snapshot }
      : { entity_name: 'Valued Client' };

    const clonedSenderSnapshot = source.sender_snapshot
      ? { ...source.sender_snapshot }
      : { entity_name: 'Commercial Entity' };

    const now = new Date().toISOString();

    return {
      ...source,
      id: freshId,
      workspace_id: wsId,
      workspaceId: wsId,
      quote_number: baseQuoteNumber,
      revision_number: nextRev,
      formatted_quote_ref: formattedQuoteRef,
      status: 'Draft',
      parent_quotation_id: source.id,
      parent_quote_id: source.id,
      superseded_by_id: undefined,
      client_snapshot: clonedClientSnapshot,
      sender_snapshot: clonedSenderSnapshot,
      line_items: clonedLineItems,
      layout_blocks: clonedLayoutBlocks,
      visible_columns: clonedVisibleColumns,
      flyer_attachments: clonedFlyerAttachments,
      show_submittals_index: source.show_submittals_index,
      footer_config: clonedFooterConfig,
      header_config: clonedHeaderConfig,
      recipient_config: clonedRecipientConfig,
      remittanceBankId: source.remittanceBankId || source.remittance_bank_id,
      remittance_bank_id: source.remittance_bank_id || source.remittanceBankId,
      selectedBank: clonedSelectedBank,
      selected_bank: clonedSelectedBank ? { ...clonedSelectedBank } : undefined,
      applied_bank_account: clonedAppliedBank,
      signatories: clonedSignatories,
      globalCardRadius: source.globalCardRadius,
      cardsOrder: source.cardsOrder,
      subjectPlacement: source.subjectPlacement,
      fontSizeScale: source.fontSizeScale || source.font_size_scale,
      font_size_scale: source.font_size_scale || source.fontSizeScale,
      table_density: source.table_density,
      table_font_scale: source.table_font_scale,
      block_style: source.block_style,
      company_logo_url: source.company_logo_url || source.header_config?.logoUrl,
      company_seal_url: source.company_seal_url,
      signature_image_url: source.signature_image_url,
      created_at: now,
      updatedAt: now
    };
  }

  /**
   * Marks earlier revisions in the same quotation chain as 'Superseded' with superseded_by_id: activeRevisionId,
   * leaving explicitly 'Rejected' (or 'Declined') revisions untouched.
   */
  public static markPreviousRevisionsSuperseded(
    revisions: Quotation[],
    activeRevisionId: string
  ): Quotation[] {
    if (!Array.isArray(revisions)) return [];
    const activeQuote = revisions.find((r) => r.id === activeRevisionId);
    const activeRevNum = activeQuote?.revision_number;

    return revisions.map((rev) => {
      if (rev.id === activeRevisionId) {
        return { ...rev };
      }
      // Leave explicitly Rejected or Declined revisions untouched
      if (rev.status === 'Rejected' || rev.status === 'Declined') {
        return { ...rev };
      }
      // If activeQuote is in the list, only supersede earlier revisions (or any other non-active revision in the chain)
      if (
        typeof activeRevNum === 'number' &&
        typeof rev.revision_number === 'number' &&
        rev.revision_number > activeRevNum
      ) {
        return { ...rev };
      }
      return {
        ...rev,
        status: 'Superseded',
        superseded_by_id: activeRevisionId
      };
    });
  }

  /**
   * Builds a deterministic Enquiry pipeline sync payload from a Quotation,
   * accurately computing quoted_amount (excluding optional line items).
   */
  public static buildEnquiryQuotationSyncPayload(
    quotation: Quotation
  ): EnquiryQuotationSyncPayload {
    const calculatedGrandTotal =
      Array.isArray(quotation.line_items) && quotation.line_items.length > 0
        ? this.calculateTotals(
            quotation.line_items,
            quotation.freight_amount || 0,
            quotation.tax_mode || 'taxes_extra',
            quotation.tax_rate_percent ?? 5
          ).grand_total
        : Number(quotation.grand_total) || 0;

    return {
      active_quotation_id: quotation.id || '',
      latest_quote_ref: quotation.formatted_quote_ref || quotation.quote_number || '',
      quoted_amount: calculatedGrandTotal,
      quotation_status: quotation.status || 'Draft',
      latest_revision_number:
        typeof quotation.revision_number === 'number' ? quotation.revision_number : 1
    };
  }

  /**
   * Synchronizes superseded status across previous revisions for the enquiry and updates
   * the parent Enquiry record with the latest quotation sync payload.
   */
  public static async syncQuotationRevisionAndEnquiry(
    quotation: Quotation
  ): Promise<EnquiryQuotationSyncPayload> {
    const syncPayload = this.buildEnquiryQuotationSyncPayload(quotation);
    const now = new Date().toISOString();

    if (quotation.enquiry_id && quotation.id) {
      try {
        const wsId = quotation.workspace_id || quotation.workspaceId || 'ws_default';
        const existingRevisions = await this.getQuotationsForEnquiry(quotation.enquiry_id, wsId);
        if (existingRevisions.length > 1) {
          const updatedChain = this.markPreviousRevisionsSuperseded(
            existingRevisions,
            quotation.id
          );
          for (const rev of updatedChain) {
            if (
              rev.id &&
              rev.id !== quotation.id &&
              rev.status === 'Superseded' &&
              rev.superseded_by_id === quotation.id
            ) {
              await this.updateQuotation(rev.id, {
                status: 'Superseded',
                superseded_by_id: quotation.id,
                updatedAt: now
              });
            }
          }
        }
      } catch (_) {}

      try {
        await safeUpdateDoc('enquiries', quotation.enquiry_id, {
          active_quotation_id: syncPayload.active_quotation_id,
          latest_quote_ref: syncPayload.latest_quote_ref,
          quote_ref_no: syncPayload.latest_quote_ref,
          quoted_amount: syncPayload.quoted_amount,
          value_aed: syncPayload.quoted_amount,
          quotation_status: syncPayload.quotation_status,
          latest_revision_number: syncPayload.latest_revision_number,
          updated_at: now
        });
      } catch (_) {}
    }

    return syncPayload;
  }

  /**
   * Deserializes and standardizes dual workspace fields for QuotationPreset entities.
   */
  public static docToPreset(id: string, data: any): QuotationPreset {
    if (!data) return { id } as QuotationPreset;
    const wsId = data.workspace_id || data.workspaceId || 'ws_default';
    return {
      ...data,
      id: id || data.id,
      workspace_id: wsId,
      workspaceId: wsId,
      is_default: Boolean(data.is_default),
      visible_columns: data.visible_columns || {},
      default_tax_mode: data.default_tax_mode || 'taxes_extra',
      default_validity_days: typeof data.default_validity_days === 'number' ? data.default_validity_days : 30,
      signatory_mode: data.signatory_mode || 'single'
    } as QuotationPreset;
  }

  /**
   * Creates a new initial quotation (Revision 0 / R0).
   */
  public static async createQuotation(
    data: Omit<Quotation, 'id' | 'created_at' | 'revision_number' | 'formatted_quote_ref'> & {
      id?: string;
      revision_number?: number;
      formatted_quote_ref?: string;
      status?: Quotation['status'];
    }
  ): Promise<Quotation> {
    const wsId = data.workspace_id || data.workspaceId || 'ws_default';
    const quoteNumber = data.quote_number || `QT-${Date.now()}`;
    const revisionNumber = typeof data.revision_number === 'number' ? data.revision_number : 0;
    const formattedQuoteRef = data.formatted_quote_ref || `${quoteNumber}-R${revisionNumber}`;
    const createdAt = new Date().toISOString();
    const status = data.status || 'Draft';

    const quotationId = data.id || `quote_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const newQuotation: Quotation = {
      ...data,
      id: quotationId,
      workspace_id: wsId,
      workspaceId: wsId,
      quote_number: quoteNumber,
      revision_number: revisionNumber,
      formatted_quote_ref: formattedQuoteRef,
      status,
      created_at: createdAt
    };

    // Remote persistence
    try {
      await safeSetDoc('quotations', quotationId, newQuotation);
    } catch (_) {
      // In offline or non-browser environments, persist locally
    }

    // Local IndexedDB / localStorage mirror
    try {
      const existing = (await getFromLocalStore<Quotation>(this.QUOTATIONS_STORE)) || [];
      const updated = existing.filter((q) => q.id !== quotationId).concat(newQuotation);
      await saveToLocalStore(this.QUOTATIONS_STORE, updated);
    } catch (_) {}

    return newQuotation;
  }

  /**
   * Creates a new revision from an existing quote:
   * 1. Marks the parent quote as 'Superseded'.
   * 2. Increments revision_number (R0 -> R1, R1 -> R2, etc.).
   * 3. Formats updated quote reference (e.g., QT-2026-0042-R1).
   * 4. Copies parent quote state, pricing adjustments, tax mode, validity, payment terms, and line items.
   */
  public static async createRevision(
    parentQuoteId: string,
    updates?: Partial<Quotation>
  ): Promise<Quotation> {
    const parent = await this.getQuotationById(parentQuoteId);
    if (!parent) {
      throw new Error(`Parent quote not found: ${parentQuoteId}`);
    }

    const wsId =
      updates?.workspace_id ||
      updates?.workspaceId ||
      parent.workspace_id ||
      parent.workspaceId ||
      'ws_default';

    let existingRevisions: Quotation[] = [];
    if (parent.enquiry_id) {
      try {
        existingRevisions = await this.getQuotationsForEnquiry(parent.enquiry_id, wsId);
      } catch (_) {}
    }

    const clonedBase = this.cloneQuotationAsNextRevision(parent, existingRevisions);
    const childQuotation: Quotation = {
      ...clonedBase,
      ...updates,
      id: clonedBase.id,
      workspace_id: wsId,
      workspaceId: wsId,
      quote_number: clonedBase.quote_number,
      revision_number: clonedBase.revision_number,
      formatted_quote_ref: clonedBase.formatted_quote_ref,
      status: updates?.status || 'Draft',
      parent_quote_id: parentQuoteId,
      parent_quotation_id: parentQuoteId,
      line_items: updates?.line_items || clonedBase.line_items
    };

    // Mark parent quote as Superseded with superseded_by_id link
    const now = new Date().toISOString();
    const updatedParent: Quotation = {
      ...parent,
      status: 'Superseded',
      superseded_by_id: childQuotation.id,
      updatedAt: now
    };

    try {
      await safeUpdateDoc('quotations', parentQuoteId, {
        status: 'Superseded',
        superseded_by_id: childQuotation.id,
        updatedAt: now
      });
    } catch (_) {}

    try {
      await safeSetDoc('quotations', childQuotation.id!, childQuotation);
    } catch (_) {}

    // Update local cache
    try {
      const existing = (await getFromLocalStore<Quotation>(this.QUOTATIONS_STORE)) || [];
      const updated = existing
        .map((q) => (q.id === parentQuoteId ? updatedParent : q))
        .filter((q) => q.id !== childQuotation.id)
        .concat(childQuotation);
      await saveToLocalStore(this.QUOTATIONS_STORE, updated);
    } catch (_) {}

    return childQuotation;
  }

  /**
   * Pure deterministic helper: Hydrates studio state fields from a Quotation (when editing or switching revisions)
   * or resets cleanly to profile/preset defaults (when opening a brand-new quotation), preventing any state leakage.
   */
  public static hydrateStudioStateFromQuotation(
    quotation: Quotation | null | undefined,
    profile?: WorkspaceDocumentProfile | null,
    defaultPreset?: QuotationPreset | null
  ) {
    if (!quotation && defaultPreset) {
      const fromPreset = this.hydrateFromPresetSnapshot(defaultPreset);
      return {
        activeQuotationId: '',
        parentQuotationId: undefined,
        revisionNumber: 1,
        formattedQuoteRefOverride: '',
        quotationStatus: 'Draft' as Quotation['status'],
        visibleColumns: { ...fromPreset.visibleColumns },
        layoutBlocks: fromPreset.layoutBlocks.map((b) => ({ ...b })),
        flyerAttachments: fromPreset.flyerAttachments.map((a) => ({ ...a })),
        showSubmittalsIndex: fromPreset.showSubmittalsIndex,
        tableDensity: fromPreset.tableDensity,
        fontSizeScale: fromPreset.fontSizeScale,
        blockStyle: fromPreset.blockStyle,
        globalCardRadius: fromPreset.globalCardRadius,
        cardsOrder: fromPreset.cardsOrder,
        subjectPlacement: fromPreset.subjectPlacement,
        selectedBankId:
          fromPreset.remittanceBankId ||
          profile?.bank_accounts?.find((b) => b.is_default)?.id ||
          profile?.bank_accounts?.[0]?.id ||
          '',
        taxMode: fromPreset.defaultTaxMode,
        priceBasis: fromPreset.defaultPriceBasis,
        paymentTerms: fromPreset.defaultPaymentTerms,
        validityDays: fromPreset.defaultValidityDays,
        freightAmount: 0,
        taxRatePercent: 5,
        companyLogoUrl:
          fromPreset.companyLogoUrl ||
          fromPreset.headerConfig?.logoUrl ||
          profile?.logo_url ||
          '',
        headerConfig: { ...fromPreset.headerConfig },
        companySealUrl: fromPreset.companySealUrl || profile?.stamp_seal_url || '',
        signatureImageUrl: fromPreset.signatureImageUrl || ''
      };
    }

    const rawCols = quotation?.visible_columns || (profile as any)?.visible_columns || {};
    const resolvedUnitPrice =
      rawCols.showUnitPrice !== undefined
        ? rawCols.showUnitPrice !== false
        : rawCols.unit_price !== false;

    const visibleColumns = {
      brand: rawCols.brand ?? true,
      model: rawCols.model ?? true,
      origin: rawCols.origin ?? true,
      availability: rawCols.availability ?? true,
      unit_price: resolvedUnitPrice,
      showUnitPrice: resolvedUnitPrice,
      showUom: rawCols.showUom !== false,
      showLineTotal: rawCols.showLineTotal !== false,
      showItemAttributes: rawCols.showItemAttributes !== false,
      attributeDisplayFormat: rawCols.attributeDisplayFormat || ('pills' as const),
      hiddenAttributeKeys: Array.isArray(rawCols.hiddenAttributeKeys)
        ? [...rawCols.hiddenAttributeKeys]
        : [],
      showAmountInWords:
        rawCols.showAmountInWords ??
        quotation?.amount_in_words_enabled ??
        profile?.amount_in_words_enabled ??
        true
    };

    const layoutBlocks = Array.isArray(quotation?.layout_blocks)
      ? quotation!.layout_blocks.map((b) => ({ ...b }))
      : [];

    const flyerAttachments = Array.isArray(quotation?.flyer_attachments)
      ? quotation!.flyer_attachments.map((att) => ({
          ...att,
          show_title_on_annex: this.resolveShowTitleOnAnnex(att)
        }))
      : [];

    const showSubmittalsIndex =
      typeof quotation?.show_submittals_index === 'boolean'
        ? quotation.show_submittals_index
        : true;

    const selectedBankId =
      quotation?.remittanceBankId ||
      quotation?.remittance_bank_id ||
      quotation?.applied_bank_account?.id ||
      quotation?.footer_config?.remittanceBankId ||
      profile?.bank_accounts?.find((b) => b.is_default)?.id ||
      profile?.bank_accounts?.[0]?.id ||
      '';

    return {
      activeQuotationId: quotation?.id || '',
      parentQuotationId: quotation?.parent_quotation_id || quotation?.parent_quote_id,
      revisionNumber: quotation?.revision_number ?? 1,
      formattedQuoteRefOverride: quotation?.formatted_quote_ref || '',
      quotationStatus: (quotation?.status || 'Draft') as Quotation['status'],
      visibleColumns,
      layoutBlocks,
      flyerAttachments,
      showSubmittalsIndex,
      tableDensity: quotation?.table_density || profile?.table_density || 'comfortable',
      fontSizeScale:
        quotation?.fontSizeScale ||
        quotation?.font_size_scale ||
        profile?.fontSizeScale ||
        profile?.font_size_scale ||
        'standard',
      blockStyle: quotation?.block_style || 'framed',
      globalCardRadius:
        quotation?.globalCardRadius ||
        quotation?.recipient_config?.globalCardRadius ||
        profile?.globalCardRadius ||
        'rounded',
      cardsOrder:
        quotation?.cardsOrder ||
        quotation?.recipient_config?.cardsOrder ||
        profile?.cardsOrder ||
        'recipient_first',
      subjectPlacement:
        quotation?.subjectPlacement ||
        quotation?.recipient_config?.subjectPlacement ||
        profile?.subjectPlacement ||
        'below_cards',
      selectedBankId,
      taxMode: quotation?.tax_mode || 'taxes_extra',
      priceBasis: quotation?.price_basis || (profile as any)?.default_price_basis || 'Ex-Works',
      paymentTerms: quotation?.payment_terms || (profile as any)?.default_payment_terms || '100% Advance',
      validityDays: 30,
      freightAmount: Number(quotation?.freight_amount) || 0,
      taxRatePercent: quotation?.tax_rate_percent ?? 5,
      companyLogoUrl:
        quotation?.header_config?.logoUrl ||
        quotation?.company_logo_url ||
        profile?.logo_url ||
        '',
      headerConfig: {
        alignment: 'split' as const,
        headerLayoutMode: 'split_left' as const,
        logoDisplayMode: 'logo_and_name' as const,
        showLogo: true,
        showPhone: true,
        showEmail: true,
        showWebsite: true,
        showTrn: true,
        showCompanyName: true,
        logoSpacing: 'normal' as const,
        logoHeightPx: 48,
        logoMaxWidthPx: 260,
        repeatHeaderOnSubsequentPages: true,
        showLogoOnContinuationPages: true,
        ...(profile?.header_config || {}),
        ...(quotation?.header_config || {}),
        ...(quotation?.header_config?.logoUrl || quotation?.company_logo_url
          ? { logoUrl: quotation?.header_config?.logoUrl || quotation?.company_logo_url }
          : {})
      },
      companySealUrl:
        quotation?.company_seal_url ||
        (quotation as any)?.companySettings?.company_seal_url ||
        profile?.stamp_seal_url ||
        '',
      signatureImageUrl:
        quotation?.signature_image_url ||
        quotation?.signatories?.[0]?.signature_url ||
        ''
    };
  }

  /**
   * Updates an existing quotation document by ID.
   */
  public static async updateQuotation(
    id: string,
    updates: Partial<Quotation>
  ): Promise<Quotation | null> {
    const existing = await this.getQuotationById(id);
    if (!existing) return null;

    const updatedQuote: Quotation = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    try {
      await safeUpdateDoc('quotations', id, {
        ...updates,
        updatedAt: updatedQuote.updatedAt
      });
    } catch (_) {}

    try {
      const all = (await getFromLocalStore<Quotation>(this.QUOTATIONS_STORE)) || [];
      const refreshed = all.map((q) => (q.id === id ? updatedQuote : q));
      await saveToLocalStore(this.QUOTATIONS_STORE, refreshed);
    } catch (_) {}

    return updatedQuote;
  }

  /**
   * Accepts / approves a quotation: sets status to 'Approved' and updatedAt timestamp.
   */
  public static async acceptQuotation(id: string): Promise<Quotation | null> {
    return this.updateQuotation(id, {
      status: 'Approved'
    });
  }

  /**
   * Declines / rejects a quotation: sets status to 'Declined' with decline_reason and optional notes.
   */
  public static async declineQuotation(
    id: string,
    reason: string,
    notes?: string
  ): Promise<Quotation | null> {
    const now = new Date().toISOString();
    return this.updateQuotation(id, {
      status: 'Declined',
      decline_reason: reason,
      decline_notes: notes || '',
      declined_at: now
    });
  }

  /**
   * Soft deletes a quotation and handles revision fallback non-destructively:
   * 1. Sets is_deleted: true, deleted_at, deleted_by_id, deleted_by_name.
   * 2. If this quote was a revision (has parent_quote_id), and the parent is 'Superseded',
   *    re-activates the parent quote back to 'Sent' (or its previous state), so the enquiry
   *    has an active commercial offer available.
   * 3. CRITICAL: NEVER alters the parent enquiry deal status to Lost or Cancelled.
   */
  public static async softDeleteQuotation(
    quotationId: string,
    actor: { id: string; name?: string }
  ): Promise<Quotation | null> {
    const existing = await this.getQuotationById(quotationId);
    if (!existing) return null;

    const now = new Date().toISOString();
    const updates: Partial<Quotation> = {
      is_deleted: true,
      deleted_at: now,
      deleted_by_id: actor.id || 'unknown',
      deleted_by_name: actor.name || 'User',
      updatedAt: now
    };

    const updated = await this.updateQuotation(quotationId, updates);

    // Revision Fallback & Deal Value Sync:
    // 1. If this was a revision that superseded a parent quote, reactivate the parent quote if Superseded
    let fallbackActiveQuote: Quotation | null = null;
    if (existing.parent_quote_id) {
      try {
        const parent = await this.getQuotationById(existing.parent_quote_id);
        if (parent && !parent.is_deleted) {
          if (parent.status === 'Superseded') {
            await this.updateQuotation(parent.id, {
              status: 'Sent',
              updatedAt: now
            });
            parent.status = 'Sent';
          }
          fallbackActiveQuote = parent;
        }
      } catch (err) {
        console.warn('Failed to reactivate superseded parent quote:', err);
      }
    }

    // 2. Root Revision (R0) Discard Safety & Fallback Lookup:
    // If no parent quote was reactivated, look for any remaining active quotes for this enquiry
    if (existing.enquiry_id) {
      try {
        if (!fallbackActiveQuote) {
          const quotes = await this.getQuotationsForEnquiry(
            existing.enquiry_id,
            existing.workspace_id || 'ws_default'
          );
          const activeQuotes = quotes.filter((q) => q.id !== quotationId && !q.is_deleted);
          fallbackActiveQuote =
            activeQuotes.find((q) => q.status === 'Approved') ||
            activeQuotes.find((q) => q.status === 'Sent') ||
            activeQuotes.find((q) => q.status === 'Draft') ||
            (activeQuotes.length > 0 ? activeQuotes[0] : null);
        }

        if (fallbackActiveQuote) {
          // Update parent enquiry's value_aed and quote_ref_no to match the active quotation
          await safeUpdateDoc('enquiries', existing.enquiry_id, {
            value_aed: Number(fallbackActiveQuote.grand_total || 0),
            quote_ref_no: fallbackActiveQuote.formatted_quote_ref,
            updated_at: now
          });
        } else {
          // R0 Discard: No other quotation exists. Safely recalculate fallback value from line items
          const enquiryDoc = await safeGetDoc('enquiries', existing.enquiry_id);
          if (enquiryDoc && enquiryDoc.exists()) {
            const enquiryData = enquiryDoc.data();
            const fallbackValue = (enquiryData.line_items || []).reduce(
              (sum: number, it: any) => sum + (Number(it.quantity || 0) * Number(it.unit_price || 0)),
              0
            );
            await safeUpdateDoc('enquiries', existing.enquiry_id, {
              value_aed: fallbackValue,
              updated_at: now
            });
          }
        }
      } catch (syncErr) {
        console.warn('[QuotationRepository] Non-fatal: deal value sync failed on quotation discard:', syncErr);
      }
    }

    return updated;
  }

  /**
   * Restores a soft-deleted quotation from the recycle bin.
   */
  public static async restoreQuotation(quotationId: string): Promise<Quotation | null> {
    const existing = await this.getQuotationById(quotationId);
    if (!existing) return null;

    const now = new Date().toISOString();
    const updates: Partial<Quotation> = {
      is_deleted: false,
      deleted_at: null,
      deleted_by_id: null,
      deleted_by_name: null,
      updatedAt: now
    };

    const updated = await this.updateQuotation(quotationId, updates);

    // If this restored quotation superseded a parent quote that is currently 'Sent',
    // re-mark the parent as 'Superseded'
    if (existing.parent_quote_id) {
      try {
        const parent = await this.getQuotationById(existing.parent_quote_id);
        if (parent && parent.status === 'Sent' && !parent.is_deleted) {
          await this.updateQuotation(parent.id, {
            status: 'Superseded',
            updatedAt: now
          });
        }
      } catch (err) {
        console.warn('Failed to re-supersede parent quote on restore:', err);
      }
    }

    // Deal Value Sync on Restore:
    // Update parent enquiry's value_aed and quote_ref_no to match the restored quotation
    if (existing.enquiry_id) {
      try {
        await safeUpdateDoc('enquiries', existing.enquiry_id, {
          value_aed: Number(existing.grand_total || 0),
          quote_ref_no: existing.formatted_quote_ref,
          updated_at: now
        });
      } catch (syncErr) {
        console.warn('[QuotationRepository] Non-fatal: deal value sync failed on quotation restore:', syncErr);
      }
    }

    return updated;
  }

  /**
   * Permanently purges a quotation from Firestore and local cache storage.
   */
  public static async purgeQuotationPermanently(quotationId: string): Promise<boolean> {
    if (!quotationId) return false;

    try {
      await safeDeleteDoc('quotations', quotationId);
    } catch (_) {}

    try {
      const existing = (await getFromLocalStore<Quotation>(this.QUOTATIONS_STORE)) || [];
      const updated = existing.filter((q) => q.id !== quotationId);
      await saveToLocalStore(this.QUOTATIONS_STORE, updated);
    } catch (_) {}

    return true;
  }

  /**
   * Retrieves all soft-deleted quotations for a workspace (for Trash / Recycle Bin).
   */
  public static async getDeletedQuotations(workspaceId?: string): Promise<Quotation[]> {
    const wsId = workspaceId || 'ws_default';
    let quotes: Quotation[] = [];

    // Check remote Firestore
    try {
      const snap = await safeGetDocs('quotations');
      if (snap && !snap.empty) {
        snap.forEach((d) => {
          const item = this.docToQuotation(d.id, d.data());
          const itemWsId = item.workspace_id || item.workspaceId;
          if ((!workspaceId || itemWsId === wsId) && item.is_deleted) {
            quotes.push(item);
          }
        });
      }
    } catch (_) {}

    // Fallback or union with IndexedDB store
    try {
      const local = (await getFromLocalStore<Quotation>(this.QUOTATIONS_STORE)) || [];
      const remoteIds = new Set(quotes.map((q) => q.id));
      for (const raw of local) {
        const item = this.docToQuotation(raw.id!, raw);
        const itemWsId = item.workspace_id || item.workspaceId;
        if ((!workspaceId || itemWsId === wsId) && item.is_deleted && !remoteIds.has(item.id)) {
          quotes.push(item);
        }
      }
    } catch (_) {}

    return quotes.sort((a, b) => {
      const dateA = new Date(a.deleted_at || a.updatedAt || a.created_at || 0).getTime();
      const dateB = new Date(b.deleted_at || b.updatedAt || b.created_at || 0).getTime();
      return dateB - dateA;
    });
  }

  /**
   * Saves or overwrites an entire quotation document.
   */
  public static async saveQuotation(quotation: Quotation): Promise<Quotation> {
    const wsId = quotation.workspace_id || quotation.workspaceId || 'ws_default';
    const now = new Date().toISOString();
    const toSave: Quotation = {
      ...quotation,
      workspace_id: wsId,
      workspaceId: wsId,
      updatedAt: now
    };

    try {
      await safeSetDoc('quotations', toSave.id!, toSave);
    } catch (_) {}

    try {
      const existing = (await getFromLocalStore<Quotation>(this.QUOTATIONS_STORE)) || [];
      const updated = existing.filter((q) => q.id !== toSave.id).concat(toSave);
      await saveToLocalStore(this.QUOTATIONS_STORE, updated);
    } catch (_) {}

    return toSave;
  }

  /**
   * Fetches a quotation by ID with local cache fallback.
   */
  public static async getQuotationById(id: string): Promise<Quotation | null> {
    // Check local store first
    try {
      const localItems = await getFromLocalStore<Quotation>(this.QUOTATIONS_STORE);
      const match = (localItems || []).find((q) => q.id === id);
      if (match) return this.docToQuotation(match.id!, match);
    } catch (_) {}

    try {
      const snap = await safeGetDoc('quotations', id);
      if (snap && snap.exists()) {
        return this.docToQuotation(snap.id, snap.data());
      }
    } catch (_) {}

    return null;
  }

  /**
   * Retrieves all quotations for a specific enquiry, strictly isolated by workspace.
   */
  public static async getQuotationsForEnquiry(
    enquiryId: string,
    workspaceId: string
  ): Promise<Quotation[]> {
    if (!enquiryId || !workspaceId) return [];

    let quotes: Quotation[] = [];

    // Query remote Firestore first
    try {
      const snap = await safeGetDocs(
        'quotations',
        where('enquiry_id', '==', enquiryId)
      );

      if (snap && !snap.empty) {
        snap.forEach((d) => {
          const item = this.docToQuotation(d.id, d.data());
          // Strict workspace filtering checking dual fields
          const itemWsId = item.workspace_id || item.workspaceId;
          if (itemWsId === workspaceId && !item.is_deleted) {
            quotes.push(item);
          }
        });
      }
    } catch (_) {}

    // If empty or in offline environment, fall back to local store
    if (quotes.length === 0) {
      try {
        const local = (await getFromLocalStore<Quotation>(this.QUOTATIONS_STORE)) || [];
        quotes = local
          .filter((q) => {
            const itemWsId = q.workspace_id || q.workspaceId;
            return q.enquiry_id === enquiryId && itemWsId === workspaceId && !q.is_deleted;
          })
          .map((q) => this.docToQuotation(q.id!, q));
      } catch (_) {}
    }

    // Sort descending by revision_number
    return quotes.sort((a, b) => (b.revision_number ?? 0) - (a.revision_number ?? 0));
  }

  /**
   * Retrieves all quotations for a workspace, strictly isolated by workspace.
   */
  public static async getQuotationsForWorkspace(workspaceId: string): Promise<Quotation[]> {
    const wsId = workspaceId || 'ws_default';
    let quotes: Quotation[] = [];

    // Query remote Firestore
    try {
      const snap = await safeGetDocs('quotations');
      if (snap && !snap.empty) {
        snap.forEach((d) => {
          const item = this.docToQuotation(d.id, d.data());
          const itemWsId = item.workspace_id || item.workspaceId;
          if ((!workspaceId || itemWsId === wsId) && !item.is_deleted) {
            quotes.push(item);
          }
        });
      }
    } catch (_) {}

    // Fallback or union with IndexedDB store
    try {
      const local = (await getFromLocalStore<Quotation>(this.QUOTATIONS_STORE)) || [];
      const remoteIds = new Set(quotes.map((q) => q.id));
      for (const raw of local) {
        const item = this.docToQuotation(raw.id!, raw);
        const itemWsId = item.workspace_id || item.workspaceId;
        if ((!workspaceId || itemWsId === wsId) && !item.is_deleted && !remoteIds.has(item.id)) {
          quotes.push(item);
        }
      }
    } catch (_) {}

    return quotes.sort((a, b) => (b.revision_number ?? 0) - (a.revision_number ?? 0));
  }

  /**
   * Serializes a complete studio preset snapshot preserving 100% of Phase 1 & Phase 2 settings.
   */
  public static serializePresetSnapshot(
    input: Omit<QuotationPreset, 'id'> & { id?: string }
  ): Omit<QuotationPreset, 'id'> & { id?: string } {
    const wsId = input.workspace_id || input.workspaceId || 'ws_default';
    const rawCols = input.visible_columns || {
      brand: true,
      model: true,
      origin: true,
      availability: true,
      unit_price: true
    };
    const resolvedUnitPrice =
      rawCols.showUnitPrice !== undefined
        ? rawCols.showUnitPrice
        : rawCols.unit_price ?? true;
    const resolvedUom = rawCols.showUom !== undefined ? rawCols.showUom : true;
    const resolvedLineTotal = rawCols.showLineTotal !== undefined ? rawCols.showLineTotal : true;
    const resolvedAmountInWords =
      rawCols.showAmountInWords !== undefined
        ? rawCols.showAmountInWords
        : input.amount_in_words_enabled ?? true;

    const normalizedColumns = {
      ...rawCols,
      brand: rawCols.brand ?? true,
      model: rawCols.model ?? true,
      origin: rawCols.origin ?? true,
      availability: rawCols.availability ?? true,
      unit_price: resolvedUnitPrice,
      showUnitPrice: resolvedUnitPrice,
      showUom: resolvedUom,
      showLineTotal: resolvedLineTotal,
      showItemAttributes: rawCols.showItemAttributes ?? true,
      attributeDisplayFormat: rawCols.attributeDisplayFormat ?? 'pills',
      hiddenAttributeKeys: Array.isArray(rawCols.hiddenAttributeKeys)
        ? [...rawCols.hiddenAttributeKeys]
        : [],
      showAmountInWords: resolvedAmountInWords
    };

    const normalizedBlocks = Array.isArray(input.layout_blocks)
      ? input.layout_blocks.map((block, index) => ({
          ...block,
          order: typeof block.order === 'number' ? block.order : index,
          enabled: block.enabled ?? block.is_visible ?? true,
          is_visible: block.is_visible ?? block.enabled ?? true,
          ...(block.type === 'spacer' || block.id?.startsWith('spacer_')
            ? {
                type: 'spacer' as const,
                spacer_height_mm:
                  typeof block.spacer_height_mm === 'number' ? block.spacer_height_mm : 20,
                spacer_fill_remaining: Boolean(block.spacer_fill_remaining)
              }
            : {}),
          ...(block.type === 'page_break' || block.id?.startsWith('break_')
            ? {
                type: 'page_break' as const,
                show_continuation_header: block.show_continuation_header !== false
              }
            : {})
        }))
      : undefined;

    const resolvedBankId =
      input.remittanceBankId ||
      input.remittance_bank_id ||
      input.footer_config?.remittanceBankId;

    const normalizedFooterConfig = input.footer_config
      ? {
          ...input.footer_config,
          footerLayoutMode:
            input.footer_config.footerLayoutMode || input.footerLayoutMode || 'split',
          showBankRemittance:
            input.footer_config.showBankRemittance ?? input.showBankRemittance ?? true,
          showCustomerAcceptance:
            input.footer_config.showCustomerAcceptance ?? input.showCustomerAcceptance ?? true,
          showSignatories:
            input.footer_config.showSignatories ?? input.showSignatories ?? true,
          showPageNumbers: input.footer_config.showPageNumbers ?? true,
          showDisclaimer: input.footer_config.showDisclaimer ?? true,
          customDisclaimer: input.footer_config.customDisclaimer,
          remittanceBankId: resolvedBankId
        }
      : {
          footerLayoutMode: input.footerLayoutMode || 'split',
          showBankRemittance: input.showBankRemittance ?? true,
          showCustomerAcceptance: input.showCustomerAcceptance ?? true,
          showSignatories: input.showSignatories ?? true,
          showPageNumbers: true,
          showDisclaimer: true,
          remittanceBankId: resolvedBankId
        };

    const normalizedFlyerAttachments = Array.isArray(input.flyer_attachments)
      ? input.flyer_attachments
          .filter((att) => att && Boolean(att.url))
          .map((att, idx) => {
            const rawType = (att.type || 'image').toLowerCase();
            const isNonImageDoc =
              rawType === 'pdf' ||
              rawType === 'document' ||
              rawType.includes('pdf') ||
              rawType.includes('msword') ||
              rawType.includes('officedocument');
            const renderAsAnnex =
              typeof att.render_as_annex_page === 'boolean'
                ? att.render_as_annex_page
                : !isNonImageDoc;
            const showTitleOnAnnex = this.resolveShowTitleOnAnnex(att);
            return {
              ...att,
              id: att.id || `annex_${idx + 1}`,
              name: att.name !== undefined ? att.name : `Technical Annex ${idx + 1}`,
              url: att.url,
              type: att.type || 'image',
              render_as_annex_page: renderAsAnnex,
              show_title_on_annex: showTitleOnAnnex
            };
          })
      : [];

    const normalizedShowSubmittalsIndex =
      typeof input.show_submittals_index === 'boolean'
        ? input.show_submittals_index
        : true;

    const resolvedLogoUrl = input.header_config?.logoUrl ?? input.company_logo_url;
    const rawHeaderCfg = input.header_config || {};
    const resolvedDisplayMode =
      rawHeaderCfg.logoDisplayMode ||
      (rawHeaderCfg.showLogo === false ? 'no_logo' : 'logo_and_name');
    const resolvedLayoutMode =
      rawHeaderCfg.headerLayoutMode ||
      (resolvedDisplayMode === 'full_banner' || input.header_layout === 'centered_banner'
        ? rawHeaderCfg.headerLayoutMode || (resolvedDisplayMode === 'full_banner' ? 'banner' : 'centered')
        : rawHeaderCfg.alignment === 'centered'
        ? 'centered'
        : input.logo_position === 'right'
        ? 'split_right'
        : 'split_left');

    const normalizedHeaderConfig = {
      alignment:
        rawHeaderCfg.alignment ||
        (resolvedLayoutMode === 'centered' || resolvedLayoutMode === 'banner' ? 'centered' : 'split'),
      showPhone: rawHeaderCfg.showPhone ?? true,
      showEmail: rawHeaderCfg.showEmail ?? true,
      showWebsite: rawHeaderCfg.showWebsite ?? true,
      showTrn: rawHeaderCfg.showTrn ?? true,
      showCompanyName:
        resolvedDisplayMode === 'logo_only'
          ? false
          : rawHeaderCfg.showCompanyName ?? true,
      showLogo:
        resolvedDisplayMode === 'no_logo'
          ? false
          : rawHeaderCfg.showLogo ?? true,
      logoDisplayMode: resolvedDisplayMode,
      headerLayoutMode: resolvedLayoutMode,
      logoSpacing: rawHeaderCfg.logoSpacing || 'normal',
      logoHeightPx:
        typeof rawHeaderCfg.logoHeightPx === 'number' ? rawHeaderCfg.logoHeightPx : 48,
      logoMaxWidthPx:
        typeof rawHeaderCfg.logoMaxWidthPx === 'number'
          ? rawHeaderCfg.logoMaxWidthPx
          : resolvedDisplayMode === 'full_banner' || resolvedLayoutMode === 'banner'
          ? 700
          : 260,
      repeatHeaderOnSubsequentPages: rawHeaderCfg.repeatHeaderOnSubsequentPages ?? true,
      showLogoOnContinuationPages: rawHeaderCfg.showLogoOnContinuationPages ?? true,
      ...rawHeaderCfg,
      ...(resolvedLogoUrl !== undefined ? { logoUrl: resolvedLogoUrl } : {})
    };

    return {
      ...input,
      workspace_id: wsId,
      workspaceId: wsId,
      is_default: Boolean(input.is_default),
      visible_columns: normalizedColumns,
      layout_blocks: normalizedBlocks,
      flyer_attachments: normalizedFlyerAttachments,
      show_submittals_index: normalizedShowSubmittalsIndex,
      table_density: input.table_density || 'comfortable',
      fontSizeScale: input.fontSizeScale || input.font_size_scale || 'standard',
      font_size_scale: input.fontSizeScale || input.font_size_scale || 'standard',
      block_style: input.block_style || 'framed',
      globalCardRadius: input.globalCardRadius || 'rounded',
      cardsOrder: input.cardsOrder || 'recipient_first',
      subjectPlacement: input.subjectPlacement || 'below_cards',
      remittanceBankId: resolvedBankId,
      remittance_bank_id: resolvedBankId,
      amount_in_words_enabled: resolvedAmountInWords,
      showBankRemittance: normalizedFooterConfig.showBankRemittance,
      showCustomerAcceptance: normalizedFooterConfig.showCustomerAcceptance,
      showSignatories: normalizedFooterConfig.showSignatories,
      footerLayoutMode: normalizedFooterConfig.footerLayoutMode,
      company_logo_url: resolvedLogoUrl,
      company_seal_url: input.company_seal_url,
      signature_image_url: input.signature_image_url,
      header_config: normalizedHeaderConfig,
      footer_config: normalizedFooterConfig
    };
  }

  /**
   * Hydrates normalized studio state from a saved QuotationPreset snapshot.
   */
  public static hydrateFromPresetSnapshot(preset: QuotationPreset) {
    const serialized = this.serializePresetSnapshot(preset);
    return {
      presetId: preset.id || '',
      isDefault: Boolean(preset.is_default),
      visibleColumns: { ...serialized.visible_columns },
      layoutBlocks: serialized.layout_blocks ? serialized.layout_blocks.map((b) => ({ ...b })) : [],
      flyerAttachments: serialized.flyer_attachments
        ? serialized.flyer_attachments.map((att) => ({ ...att }))
        : [],
      showSubmittalsIndex: serialized.show_submittals_index !== false,
      tableDensity: serialized.table_density || 'comfortable',
      fontSizeScale: serialized.fontSizeScale || 'standard',
      blockStyle: serialized.block_style || 'framed',
      globalCardRadius: serialized.globalCardRadius || 'rounded',
      cardsOrder: serialized.cardsOrder || 'recipient_first',
      subjectPlacement: serialized.subjectPlacement || 'below_cards',
      remittanceBankId: serialized.remittanceBankId || '',
      headerConfig: { ...serialized.header_config },
      footerConfig: { ...serialized.footer_config },
      amountInWordsEnabled:
        serialized.visible_columns.showAmountInWords ??
        serialized.amount_in_words_enabled ??
        true,
      defaultTaxMode: serialized.default_tax_mode || 'taxes_extra',
      defaultPriceBasis: serialized.default_price_basis || 'Ex-Works',
      defaultPaymentTerms: serialized.default_payment_terms || '100% Advance',
      defaultValidityDays: serialized.default_validity_days ?? 30,
      companyLogoUrl: serialized.company_logo_url || serialized.header_config?.logoUrl || '',
      companySealUrl: serialized.company_seal_url || '',
      signatureImageUrl: serialized.signature_image_url || ''
    };
  }

  /**
   * Pure helper: replaces an existing preset configuration in a preset array without duplicating IDs.
   */
  public static applyPresetUpdateInList(
    presets: QuotationPreset[],
    updatedPreset: QuotationPreset
  ): QuotationPreset[] {
    const exists = presets.some((p) => p.id === updatedPreset.id);
    if (!exists) {
      return [...presets, updatedPreset];
    }
    return presets.map((p) => (p.id === updatedPreset.id ? { ...p, ...updatedPreset } : p));
  }

  /**
   * Pure helper: marks `is_default: true` exclusively on `targetPresetId` while clearing `is_default` on sibling presets.
   */
  public static applyDefaultPresetInList(
    presets: QuotationPreset[],
    targetPresetId: string
  ): QuotationPreset[] {
    return presets.map((p) => ({
      ...p,
      is_default: p.id === targetPresetId
    }));
  }

  /**
   * Saves or persists a reusable quotation preset.
   */
  public static async savePreset(
    preset: Omit<QuotationPreset, 'id'> & { id?: string }
  ): Promise<QuotationPreset> {
    const normalized = this.serializePresetSnapshot(preset);
    const wsId = normalized.workspace_id || normalized.workspaceId || 'ws_default';
    const presetId = preset.id || `preset_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();

    const newPreset: QuotationPreset = {
      ...normalized,
      id: presetId,
      workspace_id: wsId,
      workspaceId: wsId,
      createdAt: preset.createdAt || now,
      updatedAt: now
    };

    try {
      await safeSetDoc('quotation_presets', presetId, newPreset);
    } catch (_) {}

    try {
      const existing = (await getFromLocalStore<QuotationPreset>(this.PRESETS_STORE)) || [];
      const updated = existing.filter((p) => p.id !== presetId).concat(newPreset);
      await saveToLocalStore(this.PRESETS_STORE, updated);
    } catch (_) {}

    return newPreset;
  }

  /**
   * Overwrites an existing quotation preset in-place without duplicating preset IDs.
   */
  public static async updatePreset(
    presetId: string,
    presetUpdates: Partial<QuotationPreset>
  ): Promise<QuotationPreset> {
    const now = new Date().toISOString();
    let existingPreset: QuotationPreset | undefined;

    try {
      const existingList = (await getFromLocalStore<QuotationPreset>(this.PRESETS_STORE)) || [];
      existingPreset = existingList.find((p) => p.id === presetId);
    } catch (_) {}

    const mergedInput = {
      ...(existingPreset || {}),
      ...presetUpdates,
      id: presetId,
      workspace_id:
        presetUpdates.workspace_id ||
        presetUpdates.workspaceId ||
        existingPreset?.workspace_id ||
        'ws_default',
      preset_name: presetUpdates.preset_name || existingPreset?.preset_name || 'Updated Preset',
      default_tax_mode:
        presetUpdates.default_tax_mode || existingPreset?.default_tax_mode || 'taxes_extra',
      default_validity_days:
        presetUpdates.default_validity_days ?? existingPreset?.default_validity_days ?? 30,
      signatory_mode: presetUpdates.signatory_mode || existingPreset?.signatory_mode || 'single',
      visible_columns:
        presetUpdates.visible_columns ||
        existingPreset?.visible_columns || {
          brand: true,
          model: true,
          origin: true,
          availability: true,
          unit_price: true
        },
      is_default: presetUpdates.is_default ?? existingPreset?.is_default ?? false,
      createdAt: existingPreset?.createdAt || now,
      updatedAt: now
    } as QuotationPreset;

    const normalized: QuotationPreset = {
      ...this.serializePresetSnapshot(mergedInput),
      id: presetId,
      createdAt: mergedInput.createdAt,
      updatedAt: now
    };

    try {
      await safeSetDoc('quotation_presets', presetId, normalized);
    } catch (_) {}

    try {
      const existing = (await getFromLocalStore<QuotationPreset>(this.PRESETS_STORE)) || [];
      const updated = this.applyPresetUpdateInList(existing, normalized);
      await saveToLocalStore(this.PRESETS_STORE, updated);
    } catch (_) {}

    return normalized;
  }

  /**
   * Marks `presetId` as `is_default: true` and clears `is_default` on all sibling presets in the workspace.
   */
  public static async setDefaultPreset(
    workspaceId: string,
    presetId: string
  ): Promise<QuotationPreset[]> {
    const wsId = workspaceId || 'ws_default';
    const now = new Date().toISOString();
    const currentPresets = await this.getPresets(wsId);
    const updatedWorkspacePresets = this.applyDefaultPresetInList(currentPresets, presetId).map(
      (p) => ({
        ...p,
        updatedAt: now
      })
    );

    // Sync to Firestore
    for (const preset of updatedWorkspacePresets) {
      if (preset.id) {
        try {
          await safeUpdateDoc('quotation_presets', preset.id, {
            is_default: Boolean(preset.is_default),
            updatedAt: now
          });
        } catch (_) {}
      }
    }

    // Sync to Local Store
    try {
      const allLocal = (await getFromLocalStore<QuotationPreset>(this.PRESETS_STORE)) || [];
      const updatedAllLocal = allLocal.map((p) => {
        const itemWs = p.workspace_id || p.workspaceId;
        if (itemWs === wsId && !p.is_deleted) {
          return {
            ...p,
            is_default: p.id === presetId,
            updatedAt: now
          };
        }
        return p;
      });
      await saveToLocalStore(this.PRESETS_STORE, updatedAllLocal);
    } catch (_) {}

    return updatedWorkspacePresets;
  }

  /**
   * Retrieves all quotation presets for a workspace, strictly isolated.
   */
  public static async getPresets(workspaceId: string): Promise<QuotationPreset[]> {
    if (!workspaceId) return [];

    let presets: QuotationPreset[] = [];

    try {
      const snap = await safeGetDocs('quotation_presets');
      if (snap && !snap.empty) {
        snap.forEach((d) => {
          const item = this.docToPreset(d.id, d.data());
          const itemWsId = item.workspace_id || item.workspaceId;
          if (itemWsId === workspaceId && !item.is_deleted) {
            presets.push(item);
          }
        });
      }
    } catch (_) {}

    if (presets.length === 0) {
      try {
        const local = (await getFromLocalStore<QuotationPreset>(this.PRESETS_STORE)) || [];
        presets = local
          .filter((p) => {
            const itemWsId = p.workspace_id || p.workspaceId;
            return itemWsId === workspaceId && !p.is_deleted;
          })
          .map((p) => this.docToPreset(p.id!, p));
      } catch (_) {}
    }

    return presets.sort((a, b) => (a.preset_name || '').localeCompare(b.preset_name || ''));
  }

  /**
   * Deletes a quotation preset (soft delete with local and cloud sync).
   */
  public static async deletePreset(presetId: string): Promise<boolean> {
    if (!presetId) return false;
    const now = new Date().toISOString();
    try {
      await safeUpdateDoc('quotation_presets', presetId, {
        is_deleted: true,
        is_default: false,
        deleted_at: now
      });
    } catch (_) {}

    try {
      const existing = (await getFromLocalStore<QuotationPreset>(this.PRESETS_STORE)) || [];
      const updated = existing.map((p) =>
        p.id === presetId ? { ...p, is_deleted: true, is_default: false, deleted_at: now } : p
      );
      await saveToLocalStore(this.PRESETS_STORE, updated);
    } catch (_) {}

    return true;
  }

  /**
   * Retrieves the active document profile for a workspace, strictly isolated.
   */
  public static async getWorkspaceDocumentProfile(
    workspaceId: string
  ): Promise<WorkspaceDocumentProfile | null> {
    if (!workspaceId) return null;

    // 1. Try Firestore fetch
    try {
      const snap = await safeGetDocs('workspace_document_profiles');
      if (snap && !snap.empty) {
        let found: WorkspaceDocumentProfile | null = null;
        snap.forEach((d) => {
          const data = d.data() as any;
          const itemWsId = data.workspace_id || data.workspaceId;
          if (itemWsId === workspaceId && !data.is_deleted) {
            found = {
              id: d.id,
              ...data,
              workspace_id: workspaceId,
              workspaceId: workspaceId
            };
          }
        });
        if (found) return found;
      }
    } catch (_) {}

    // 2. Fallback to Local IndexedDB Cache
    try {
      const local =
        (await getFromLocalStore<WorkspaceDocumentProfile>(this.PROFILES_STORE)) || [];
      const cached = local.find((p) => {
        const itemWsId = p.workspace_id || p.workspaceId;
        return itemWsId === workspaceId && !p.is_deleted;
      });
      if (cached) return cached;
    } catch (_) {}

    return null;
  }

  /**
   * Saves or updates the document profile for a workspace.
   */
  public static async saveWorkspaceDocumentProfile(
    profile: Partial<WorkspaceDocumentProfile> & { workspace_id: string }
  ): Promise<WorkspaceDocumentProfile> {
    const wsId = profile.workspace_id || profile.workspaceId || 'ws_default';
    const profileId = profile.id || `docprof_${wsId}`;
    const now = new Date().toISOString();

    const fullProfile: WorkspaceDocumentProfile = {
      id: profileId,
      workspace_id: wsId,
      workspaceId: wsId,
      profile_name: profile.profile_name || 'Standard Legal Profile',
      legal_entity_name: profile.legal_entity_name || '',
      trn: profile.trn || '',
      address_line_1: profile.address_line_1 || '',
      address_line_2: profile.address_line_2 || '',
      city: profile.city || '',
      country: profile.country || '',
      phone: profile.phone || '',
      email: profile.email || '',
      website: profile.website || '',
      logo_url: profile.logo_url || '',
      stamp_seal_url: profile.stamp_seal_url || '',
      accent_color: profile.accent_color || '#2563eb',
      bank_accounts: profile.bank_accounts || [],
      is_default: profile.is_default ?? true,
      createdAt: profile.createdAt || now,
      updatedAt: now
    };

    // 1. Persist to Firestore
    try {
      await safeSetDoc('workspace_document_profiles', profileId, fullProfile);
    } catch (_) {}

    // 2. Persist to IndexedDB cache
    try {
      const existing =
        (await getFromLocalStore<WorkspaceDocumentProfile>(this.PROFILES_STORE)) || [];
      const updated = existing
        .filter((p) => p.id !== profileId && (p.workspace_id || p.workspaceId) !== wsId)
        .concat(fullProfile);
      await saveToLocalStore(this.PROFILES_STORE, updated);
    } catch (_) {}

    return fullProfile;
  }
}
