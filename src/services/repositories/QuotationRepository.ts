import { Quotation, QuotationPreset, QuotationTaxMode } from '../../types';
import { safeGetDocs, safeGetDoc, safeSetDoc, safeAddDoc, safeUpdateDoc, db } from '../../firebase';
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

  /**
   * Pure calculation helper for tax and totals based on QuotationTaxMode:
   * - 'tax_calculated': Prices are tax-inclusive. Tax is extracted from (subtotal + freight).
   * - 'taxes_extra': Prices are tax-exclusive. Tax is added on top of (subtotal + freight).
   * - 'tax_exempt': No tax applied (tax_amount = 0).
   */
  public static calculateTotals(
    lineItems: Array<{ total_price: number; is_optional?: boolean }>,
    freightAmount: number = 0,
    taxMode: QuotationTaxMode = 'taxes_extra',
    taxRatePercent: number = 5
  ): TaxCalculationResult {
    // Only non-optional items contribute to financial totals
    const subtotal = lineItems
      .filter((item) => !item.is_optional)
      .reduce((sum, item) => sum + (Number(item.total_price) || 0), 0);

    const taxableBase = subtotal + (Number(freightAmount) || 0);

    let taxAmount = 0;
    let grandTotal = taxableBase;

    if (taxMode === 'tax_exempt' || taxRatePercent <= 0) {
      taxAmount = 0;
      grandTotal = taxableBase;
    } else if (taxMode === 'tax_calculated') {
      // Inclusive tax: Tax = Base - (Base / (1 + rate / 100))
      taxAmount = Math.round((taxableBase - taxableBase / (1 + taxRatePercent / 100)) * 100) / 100;
      grandTotal = Math.round(taxableBase * 100) / 100;
    } else if (taxMode === 'taxes_extra') {
      // Exclusive tax: Tax = Base * (rate / 100)
      taxAmount = Math.round((taxableBase * (taxRatePercent / 100)) * 100) / 100;
      grandTotal = Math.round((taxableBase + taxAmount) * 100) / 100;
    }

    return {
      subtotal: Math.round(subtotal * 100) / 100,
      freight_amount: Math.round((Number(freightAmount) || 0) * 100) / 100,
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
    return {
      ...data,
      id: id || data.id,
      workspace_id: wsId,
      workspaceId: wsId,
      revision_number: typeof data.revision_number === 'number' ? data.revision_number : 0,
      status: data.status || 'Draft',
      line_items: Array.isArray(data.line_items) ? data.line_items : [],
      tax_mode: data.tax_mode || 'taxes_extra',
      subtotal: Number(data.subtotal) || 0,
      freight_amount: Number(data.freight_amount) || 0,
      tax_rate_percent: Number(data.tax_rate_percent) || 0,
      tax_amount: Number(data.tax_amount) || 0,
      grand_total: Number(data.grand_total) || 0,
      created_at: data.created_at || new Date().toISOString()
    } as Quotation;
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
      status?: Quotation['status'];
    }
  ): Promise<Quotation> {
    const wsId = data.workspace_id || data.workspaceId || 'ws_default';
    const quoteNumber = data.quote_number || `QT-${Date.now()}`;
    const revisionNumber = 0;
    const formattedQuoteRef = `${quoteNumber}-R${revisionNumber}`;
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
   * 4. Copies parent quote state with optional overrides.
   */
  public static async createRevision(
    parentQuoteId: string,
    updates?: Partial<Quotation>
  ): Promise<Quotation> {
    const parent = await this.getQuotationById(parentQuoteId);
    if (!parent) {
      throw new Error(`Parent quote not found: ${parentQuoteId}`);
    }

    // Mark parent quote as Superseded
    const updatedParent: Quotation = {
      ...parent,
      status: 'Superseded',
      updatedAt: new Date().toISOString()
    };

    try {
      await safeUpdateDoc('quotations', parentQuoteId, {
        status: 'Superseded',
        updatedAt: updatedParent.updatedAt
      });
    } catch (_) {}

    const newRevisionNumber = (parent.revision_number ?? 0) + 1;
    const newFormattedRef = `${parent.quote_number}-R${newRevisionNumber}`;
    const newQuoteId = `quote_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const wsId = updates?.workspace_id || updates?.workspaceId || parent.workspace_id || parent.workspaceId;

    const childQuotation: Quotation = {
      ...parent,
      ...updates,
      id: newQuoteId,
      workspace_id: wsId,
      workspaceId: wsId,
      quote_number: parent.quote_number,
      revision_number: newRevisionNumber,
      formatted_quote_ref: newFormattedRef,
      status: updates?.status || 'Draft',
      created_at: new Date().toISOString(),
      parent_quote_id: parentQuoteId
    };

    try {
      await safeSetDoc('quotations', newQuoteId, childQuotation);
    } catch (_) {}

    // Update local cache
    try {
      const existing = (await getFromLocalStore<Quotation>(this.QUOTATIONS_STORE)) || [];
      const updated = existing
        .map((q) => (q.id === parentQuoteId ? updatedParent : q))
        .filter((q) => q.id !== newQuoteId)
        .concat(childQuotation);
      await saveToLocalStore(this.QUOTATIONS_STORE, updated);
    } catch (_) {}

    return childQuotation;
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
   * Saves or persists a reusable quotation preset.
   */
  public static async savePreset(
    preset: Omit<QuotationPreset, 'id'> & { id?: string }
  ): Promise<QuotationPreset> {
    const wsId = preset.workspace_id || preset.workspaceId || 'ws_default';
    const presetId = preset.id || `preset_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();

    const newPreset: QuotationPreset = {
      ...preset,
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
}
