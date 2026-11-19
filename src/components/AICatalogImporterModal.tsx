import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Product,
  ProductAttribute,
  LineItemComponent,
  Workspace,
  DropdownOption,
  UnitType
} from '../types';
import {
  AVAILABLE_GEMINI_MODELS,
  ExtractedCatalogProductItem,
  extractCatalogProductsWithAI,
  prepareCatalogFileForAiExtraction
} from '../utils/aiExtractionClient';
import {
  formatSiTechnicalValue,
  normalizeCatalogUnit,
  normalizeLeadTime,
  cleanProductAttributesWithRescuedFields
} from '../utils/siUnitFormatter';
import {
  resolveToAedMultiplier,
  compileDescriptionWithSpecs,
  mergeParentAndVariantAttributes,
  deriveSuggestedVariantLabel
} from './SaveToCatalogModal';
import { safeAddDoc, safeUpdateDoc, safeSetDoc } from '../firebase';
import { MetadataRepository } from '../services/repositories/MetadataRepository';
import { sanitizeFirestorePayload } from '../services/attachmentStorage';
import { generateProductSearchTerms } from '../utils/defaults';
import {
  Sparkles,
  UploadCloud,
  FileText,
  X,
  Plus,
  Trash2,
  CheckCircle2,
  GitFork,
  Layers,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Package
} from 'lucide-react';

export type StagedResolutionMode =
  | 'standalone'
  | 'variant_of_existing'
  | 'new_variant_family'
  | 'update_existing';

export interface StagedCatalogProductRow {
  tempId: string;
  selected: boolean;
  resolutionMode: StagedResolutionMode;
  targetExistingProductId?: string;
  targetParentProductId?: string;
  familyGroupName: string;
  name: string;
  variantLabel: string;
  category: string;
  brand_make: string;
  model_part_no: string;
  sku: string;
  country_of_origin: string;
  hs_code: string;
  unit: string;
  availability: string;
  rawSourcePrice: number;
  rawSourceCost: number;
  cost_price_aed: number;
  unit_price_aed: number;
  description: string;
  attributes: ProductAttribute[];
  is_composite_set: boolean;
  sub_components: LineItemComponent[];
  updateDiffBadge?: string;
}

interface AICatalogImporterModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  setProducts?: React.Dispatch<React.SetStateAction<Product[]>>;
  productCategories: string[];
  setProductCategories?: React.Dispatch<React.SetStateAction<DropdownOption[]>>;
  units: string[];
  activeWorkspace?: Workspace;
  onUpdateWorkspaceGuidelines?: (guidelines: string) => void;
  triggerToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
  initialExtractedItems?: ExtractedCatalogProductItem[];
  initialCurrency?: string;
}

const SOURCE_CURRENCIES = ['AED', 'USD', 'EUR', 'GBP', 'SAR'] as const;

export default function AICatalogImporterModal({
  isOpen,
  onClose,
  products,
  setProducts,
  productCategories,
  setProductCategories,
  units,
  activeWorkspace,
  onUpdateWorkspaceGuidelines,
  triggerToast,
  initialExtractedItems,
  initialCurrency
}: AICatalogImporterModalProps) {
  const [selectedModel, setSelectedModel] = useState<string>('auto');
  const [sourceCurrency, setSourceCurrency] = useState<string>(initialCurrency || 'AED');
  const [priceBasisMode, setPriceBasisMode] = useState<'selling' | 'cost_plus_markup'>('selling');
  const [costCalcMode, setCostCalcMode] = useState<'margin' | 'markup'>('margin');
  const [defaultMarkupPct, setDefaultMarkupPct] = useState<number>(25);

  const [showWorkspaceRules, setShowWorkspaceRules] = useState<boolean>(false);
  const [workspaceRulesDraft, setWorkspaceRulesDraft] = useState<string>(
    activeWorkspace?.catalog_ai_guidelines || ''
  );
  const [isSavingWorkspaceRules, setIsSavingWorkspaceRules] = useState<boolean>(false);

  const [rawPasteText, setRawPasteText] = useState<string>('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanStatusText, setScanStatusText] = useState<string>('');
  const [scanError, setScanError] = useState<string | null>(null);
  const [lastModelUsed, setLastModelUsed] = useState<string>('');

  const [stagedRows, setStagedRows] = useState<StagedCatalogProductRow[]>([]);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [isCommitting, setIsCommitting] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!activeWorkspace?.id) return;
    let resolvedRules = activeWorkspace.catalog_ai_guidelines || '';
    if (!resolvedRules) {
      try {
        const rawWs = localStorage.getItem('omni_workspaces');
        if (rawWs) {
          const parsedWs: Workspace[] = JSON.parse(rawWs);
          const matched = Array.isArray(parsedWs)
            ? parsedWs.find((w) => w.id === activeWorkspace.id)
            : undefined;
          if (matched?.catalog_ai_guidelines) {
            resolvedRules = matched.catalog_ai_guidelines;
          }
        }
      } catch {
        // ignore
      }
    }
    setWorkspaceRulesDraft(resolvedRules);
  }, [activeWorkspace?.id, activeWorkspace?.catalog_ai_guidelines, isOpen]);

  const activeCatalogProducts = useMemo(
    () => (products || []).filter((p) => !p.is_deleted),
    [products]
  );

  const parentCandidates = useMemo(
    () =>
      activeCatalogProducts.filter(
        (p) => !p.variant_parent_id && !(p as any).parent_product_id
      ),
    [activeCatalogProducts]
  );

  const existingParentFamiliesContext = useMemo(() => {
    const sorted = [...parentCandidates].sort((a, b) => {
      const aIsFam = Boolean((a as any).has_variants || a.product_family) ? 1 : 0;
      const bIsFam = Boolean((b as any).has_variants || b.product_family) ? 1 : 0;
      return bIsFam - aIsFam;
    });
    const seen = new Set<string>();
    const result: Array<{ name: string; category?: string; unit?: string }> = [];
    for (const p of sorted) {
      const famName = (p.product_family || p.name || '').trim();
      if (!famName) continue;
      const key = famName.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({
        name: famName,
        category: p.product_type || undefined,
        unit: p.unit || undefined
      });
      if (result.length >= 60) break;
    }
    return result;
  }, [parentCandidates]);

  const handleSaveWorkspaceRules = async () => {
    if (!activeWorkspace?.id || isSavingWorkspaceRules) return;
    setIsSavingWorkspaceRules(true);
    const cleanedRules = workspaceRulesDraft.trim();
    try {
      await safeUpdateDoc('workspaces', activeWorkspace.id, {
        catalog_ai_guidelines: cleanedRules
      }).catch(async () => {
        await safeSetDoc(
          'workspaces',
          activeWorkspace.id,
          { catalog_ai_guidelines: cleanedRules },
          { merge: true }
        );
      });
      activeWorkspace.catalog_ai_guidelines = cleanedRules;
      try {
        const rawWs = localStorage.getItem('omni_workspaces');
        if (rawWs) {
          const parsedWs: Workspace[] = JSON.parse(rawWs);
          if (Array.isArray(parsedWs)) {
            const updatedWs = parsedWs.map((w) =>
              w.id === activeWorkspace.id
                ? { ...w, catalog_ai_guidelines: cleanedRules }
                : w
            );
            localStorage.setItem('omni_workspaces', JSON.stringify(updatedWs));
          }
        }
      } catch {
        // ignore localStorage errors
      }
      onUpdateWorkspaceGuidelines?.(cleanedRules);
      setWorkspaceRulesDraft(cleanedRules);
      triggerToast?.(
        cleanedRules
          ? `Saved Catalog AI Rules for ${activeWorkspace.name || 'Workspace'}.`
          : `Cleared custom Catalog AI Rules for ${activeWorkspace.name || 'Workspace'}.`,
        'success'
      );
    } catch (err: any) {
      triggerToast?.(
        `Failed to save workspace rules: ${err?.message || 'Error'}`,
        'error'
      );
    } finally {
      setIsSavingWorkspaceRules(false);
    }
  };

  const computePricesInAed = (
    rawSell: number,
    rawCost: number,
    curr: string,
    basis: 'selling' | 'cost_plus_markup',
    pctValue: number,
    calcMode: 'margin' | 'markup' = costCalcMode
  ): { costAed: number; sellAed: number } => {
    const mult = resolveToAedMultiplier(curr || 'AED');
    const cleanSell = Math.max(0, Number(rawSell) || 0);
    const cleanCost = Math.max(0, Number(rawCost) || 0);

    if (basis === 'cost_plus_markup') {
      const baseCostSource = cleanCost > 0 ? cleanCost : cleanSell;
      const costAed = Math.round(baseCostSource * mult * 100) / 100;
      if (cleanCost > 0 && cleanSell > cleanCost) {
        return {
          costAed,
          sellAed: Math.round(cleanSell * mult * 100) / 100
        };
      }
      const cleanPct = Math.max(0, Number(pctValue) || 0);
      if (calcMode === 'margin') {
        const safeMarginPct = Math.min(99.9, cleanPct);
        const divisor = Math.max(0.001, 1 - safeMarginPct / 100);
        const sellAed = Math.round((costAed / divisor) * 100) / 100;
        return { costAed, sellAed };
      }
      const sellAed = Math.round(costAed * (1 + cleanPct / 100) * 100) / 100;
      return { costAed, sellAed };
    }

    const sellAed = Math.round(cleanSell * mult * 100) / 100;
    const costAed = cleanCost > 0 ? Math.round(cleanCost * mult * 100) / 100 : 0;
    return { costAed, sellAed };
  };

  const buildStagedRowsFromExtracted = (
    items: ExtractedCatalogProductItem[],
    detectedCurr: string,
    basis: 'selling' | 'cost_plus_markup',
    markupPct: number,
    calcMode: 'margin' | 'markup' = costCalcMode
  ): StagedCatalogProductRow[] => {
    // Count how many extracted items share the same family_group_name
    const familyCounts = new Map<string, number>();
    for (const it of items) {
      const fg = (it.family_group_name || '').trim().toLowerCase();
      if (fg) {
        familyCounts.set(fg, (familyCounts.get(fg) || 0) + 1);
      }
    }

    return items.map((it, idx) => {
      const cleanName = (it.name || 'Unnamed Product').trim();
      const cleanSku = (it.sku || '').trim();
      const cleanModel = (it.model_part_no || '').trim();
      const cleanBrand = (it.brand_make || '').trim();
      const cleanFamily = (it.family_group_name || '').trim();
      const cleanVariant = (it.variant_label || '').trim();

      // Match against existing catalog products
      const exactSkuMatch = cleanSku
        ? activeCatalogProducts.find(
            (p) => (p.sku || '').trim().toLowerCase() === cleanSku.toLowerCase()
          )
        : undefined;

      const exactNameAndVariantMatch = activeCatalogProducts.find((p) => {
        const pName = (p.name || '').trim().toLowerCase();
        const pVar = String((p as any).variant_label || '').trim().toLowerCase();
        const pModel = (p.model_part_no || '').trim().toLowerCase();
        if (cleanVariant && pName === cleanName.toLowerCase() && pVar === cleanVariant.toLowerCase()) {
          return true;
        }
        if (cleanModel && pModel === cleanModel.toLowerCase() && pName === cleanName.toLowerCase()) {
          return true;
        }
        if (!cleanVariant && !cleanFamily && pName === cleanName.toLowerCase()) {
          return true;
        }
        return false;
      });

      const existingMatch = exactSkuMatch || exactNameAndVariantMatch;

      // Match against existing Parent Family in catalog
      const matchingExistingParent = parentCandidates.find((p) => {
        const pFam = (p.product_family || p.name || '').trim().toLowerCase();
        if (!pFam) return false;
        if (cleanFamily && pFam === cleanFamily.toLowerCase()) return true;
        if (
          cleanFamily &&
          (pFam.includes(cleanFamily.toLowerCase()) || cleanFamily.toLowerCase().includes(pFam))
        ) {
          return true;
        }
        if (cleanVariant && pFam === cleanName.replace(/\([^)]+\)$/, '').trim().toLowerCase()) {
          return true;
        }
        return false;
      });

      const hasMultiRowFamilyInBatch =
        Boolean(cleanFamily) && (familyCounts.get(cleanFamily.toLowerCase()) || 0) >= 2;

      let resolutionMode: StagedResolutionMode = 'standalone';
      let targetExistingProductId: string | undefined;
      let targetParentProductId: string | undefined;
      let updateDiffBadge: string | undefined;

      if (existingMatch && existingMatch.id) {
        resolutionMode = 'update_existing';
        targetExistingProductId = existingMatch.id;
        const diffParts: string[] = [];
        const { sellAed } = computePricesInAed(
          it.unit_price || 0,
          it.cost_price || 0,
          detectedCurr,
          basis,
          markupPct,
          calcMode
        );
        if (sellAed > 0 && Math.abs((existingMatch.unit_price || 0) - sellAed) > 0.01) {
          diffParts.push(`Price: AED ${(existingMatch.unit_price || 0).toLocaleString()} → ${sellAed.toLocaleString()}`);
        }
        if ((it.attributes || []).length > 0) {
          diffParts.push(`${(it.attributes || []).length} Specs`);
        }
        updateDiffBadge = diffParts.length > 0 ? `Updates ${diffParts.join(', ')}` : 'Updates Specs & Metadata';
      } else if (matchingExistingParent && matchingExistingParent.id) {
        resolutionMode = 'variant_of_existing';
        targetParentProductId = matchingExistingParent.id;
      } else if (hasMultiRowFamilyInBatch || (cleanFamily && cleanVariant)) {
        resolutionMode = 'new_variant_family';
      }

      // Match category case-insensitively against existing workspace categories
      const rawCat = (it.category || 'General Equipment').trim();
      const matchedCat =
        productCategories.find((c) => c.toLowerCase() === rawCat.toLowerCase()) || rawCat;

      const rawSourcePrice = Number(it.unit_price) || 0;
      const rawSourceCost = Number(it.cost_price) || 0;
      const { costAed, sellAed } = computePricesInAed(
        rawSourcePrice,
        rawSourceCost,
        detectedCurr,
        basis,
        markupPct,
        calcMode
      );

      const { attributes: cleanedTopAttrs, rescuedFields } =
        cleanProductAttributesWithRescuedFields(it.attributes || [], {
          brand_make: cleanBrand,
          model_part_no: cleanModel,
          country_of_origin: (it.country_of_origin || '').trim(),
          availability: (it.availability || '').trim(),
          hs_code: (it.hs_code || '').trim()
        });

      const resolvedBrand = rescuedFields.brand_make || cleanBrand;
      const resolvedModel = rescuedFields.model_part_no || cleanModel;
      const resolvedOrigin = rescuedFields.country_of_origin || (it.country_of_origin || '').trim();
      const resolvedAvailability = rescuedFields.availability || normalizeLeadTime(it.availability || '');
      const resolvedHsCode = rescuedFields.hs_code || (it.hs_code || '').trim();

      const rawDerivedVarLabel =
        cleanVariant ||
        (cleanFamily || matchingExistingParent
          ? deriveSuggestedVariantLabel(
              {
                item_name: cleanName,
                model_part_no: resolvedModel,
                attributes: cleanedTopAttrs
              },
              matchingExistingParent || {
                name: cleanFamily || cleanName,
                product_type: matchedCat,
                description: cleanName,
                unit: normalizeCatalogUnit(it.unit || 'Nos') as UnitType
              }
            )
          : '');
      const derivedVarLabel = rawDerivedVarLabel
        ? formatSiTechnicalValue(rawDerivedVarLabel)
        : '';

      const subComponents: LineItemComponent[] = (it.sub_components || []).map((sc, sIdx) => {
        const rawSubSell = Number(sc.unit_price) || 0;
        const rawSubCost = Number(sc.cost_price) || 0;
        const { costAed: subCostAed, sellAed: subSellAed } = computePricesInAed(
          rawSubSell,
          rawSubCost,
          detectedCurr,
          basis,
          markupPct,
          calcMode
        );
        const subQty = sc.quantity || 1;
        const { attributes: cleanedSubAttrs, rescuedFields: subRescued } =
          cleanProductAttributesWithRescuedFields(sc.attributes || [], {
            brand_make: sc.brand_make || '',
            model_part_no: sc.model_part_no || ''
          });
        return {
          id: `ai_sub_${Date.now()}_${idx}_${sIdx}`,
          sn: String(sIdx + 1),
          item_name: sc.item_name,
          quantity: subQty,
          unit: normalizeCatalogUnit(sc.unit || 'Nos'),
          description: sc.description || '',
          brand_make: subRescued.brand_make || sc.brand_make || '',
          model_part_no: subRescued.model_part_no || sc.model_part_no || '',
          unit_price: subSellAed,
          total_price: Math.round(subSellAed * subQty * 100) / 100,
          cost_price: subCostAed,
          is_included_accessory: sc.is_included_accessory !== false,
          attributes: cleanedSubAttrs,
          _raw_unit_price: rawSubSell,
          _raw_cost_price: rawSubCost
        } as LineItemComponent & { _raw_unit_price?: number; _raw_cost_price?: number };
      });

      const rawItDesc = (it.description || '').trim();
      const cleanItDesc =
        rawItDesc && rawItDesc.toLowerCase() !== cleanName.toLowerCase() ? rawItDesc : '';

      return {
        tempId: `staged_${Date.now()}_${idx}`,
        selected: true,
        resolutionMode,
        targetExistingProductId,
        targetParentProductId: targetParentProductId || parentCandidates[0]?.id,
        familyGroupName: cleanFamily || matchingExistingParent?.name || cleanName.replace(/\s*\([^)]+\)\s*$/, '').trim(),
        name: cleanName,
        variantLabel: derivedVarLabel,
        category: matchedCat,
        brand_make: resolvedBrand,
        model_part_no: resolvedModel,
        sku: cleanSku,
        country_of_origin: resolvedOrigin,
        hs_code: resolvedHsCode,
        unit: normalizeCatalogUnit(it.unit || (subComponents.length > 0 ? 'Set' : 'Nos')),
        availability: resolvedAvailability,
        rawSourcePrice,
        rawSourceCost,
        cost_price_aed: costAed,
        unit_price_aed: sellAed,
        description: cleanItDesc,
        attributes: cleanedTopAttrs,
        is_composite_set: Boolean(it.is_composite_set || subComponents.length > 0),
        sub_components: subComponents,
        updateDiffBadge
      };
    });
  };

  useEffect(() => {
    if (isOpen && initialExtractedItems && initialExtractedItems.length > 0) {
      const curr = initialCurrency || sourceCurrency || 'AED';
      setSourceCurrency(curr);
      setStagedRows(
        buildStagedRowsFromExtracted(
          initialExtractedItems,
          curr,
          priceBasisMode,
          defaultMarkupPct
        )
      );
    }
  }, [isOpen, initialExtractedItems]);

  if (!isOpen) return null;

  const handleRecalculateAllCurrencyAndMarkup = (
    nextCurr: string,
    nextBasis: 'selling' | 'cost_plus_markup',
    nextMarkup: number,
    nextCalcMode: 'margin' | 'markup' = costCalcMode
  ) => {
    setSourceCurrency(nextCurr);
    setPriceBasisMode(nextBasis);
    setDefaultMarkupPct(nextMarkup);
    setCostCalcMode(nextCalcMode);
    setStagedRows((prev) =>
      prev.map((row) => {
        const hasParentRaw = row.rawSourcePrice > 0 || row.rawSourceCost > 0;
        const hasSubRaw =
          Array.isArray(row.sub_components) &&
          row.sub_components.some(
            (sc: any) =>
              Number(sc._raw_unit_price ?? sc.unit_price) > 0 ||
              Number(sc._raw_cost_price ?? sc.cost_price) > 0
          );
        if (!hasParentRaw && !hasSubRaw) return row;

        const { costAed, sellAed } = hasParentRaw
          ? computePricesInAed(
              row.rawSourcePrice,
              row.rawSourceCost,
              nextCurr,
              nextBasis,
              nextMarkup,
              nextCalcMode
            )
          : { costAed: row.cost_price_aed, sellAed: row.unit_price_aed };

        const nextSubComponents = Array.isArray(row.sub_components)
          ? row.sub_components.map((sc: any) => {
              const rawSubSell = Number(sc._raw_unit_price ?? sc.unit_price) || 0;
              const rawSubCost = Number(sc._raw_cost_price ?? sc.cost_price) || 0;
              if (rawSubSell <= 0 && rawSubCost <= 0) return sc;
              const { costAed: subCostAed, sellAed: subSellAed } = computePricesInAed(
                rawSubSell,
                rawSubCost,
                nextCurr,
                nextBasis,
                nextMarkup,
                nextCalcMode
              );
              const subQty = Number(sc.quantity) || 1;
              return {
                ...sc,
                unit_price: subSellAed,
                total_price: Math.round(subSellAed * subQty * 100) / 100,
                cost_price: subCostAed,
                _raw_unit_price: rawSubSell,
                _raw_cost_price: rawSubCost
              };
            })
          : row.sub_components;

        return {
          ...row,
          cost_price_aed: costAed,
          unit_price_aed: sellAed,
          sub_components: nextSubComponents
        };
      })
    );
  };

  const runAiCatalogScan = async (
    mode: 'fast' | 'deep',
    explicitFile?: File | null,
    explicitText?: string
  ) => {
    const targetFile = explicitFile !== undefined ? explicitFile : uploadedFile;
    const targetText = explicitText !== undefined ? explicitText : rawPasteText;

    if (!targetFile && !targetText.trim()) {
      setScanError('Please upload a file (PDF, Image, Excel, Word) or paste specification text / Excel rows first.');
      return;
    }

    if (abortControllerRef.current) {
      try {
        abortControllerRef.current.abort();
      } catch {
        // ignore
      }
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsScanning(true);
    setScanError(null);
    setScanStatusText('Preparing source for AI extraction...');

    try {
      let payloadContent = targetText.trim();
      let payloadIsBase64 = false;
      let payloadMime = 'text/plain';
      let payloadFileName = 'Pasted_Catalog_Specs.txt';

      if (targetFile) {
        const prepped = await prepareCatalogFileForAiExtraction(targetFile, (msg) =>
          setScanStatusText(msg)
        );
        payloadContent = prepped.content;
        payloadIsBase64 = prepped.isBase64;
        payloadMime = prepped.mimeType;
        payloadFileName = prepped.fileName;
        if (prepped.extractedPlainTextPreview && !rawPasteText.trim()) {
          setRawPasteText(prepped.extractedPlainTextPreview);
        }
        // If both file and custom edited text exist and the file was converted to plain text, use the user's edited textarea if they clicked Re-Scan Text
        if (explicitFile === null && targetText.trim()) {
          payloadContent = targetText.trim();
          payloadIsBase64 = false;
          payloadMime = 'text/plain';
          payloadFileName = 'Edited_Catalog_Specs.txt';
        }
      }

      const batch = await extractCatalogProductsWithAI({
        content: payloadContent,
        isBase64: payloadIsBase64,
        mimeType: payloadMime,
        fileName: payloadFileName,
        existingCategories: productCategories,
        existingParentFamilies: existingParentFamiliesContext,
        workspaceCatalogGuidelines:
          workspaceRulesDraft.trim() || activeWorkspace?.catalog_ai_guidelines || '',
        signal: controller.signal,
        preferredModel: selectedModel,
        onStatusUpdate: (msg) => setScanStatusText(msg),
        scanMode: mode
      });

      if (!batch.products || batch.products.length === 0) {
        setScanError('No structured product items were detected in the provided source. Try pasting clearer spec text or switching to Deep Scan.');
        return;
      }

      const detectedCurr = SOURCE_CURRENCIES.includes(batch.currency as any)
        ? (batch.currency as string)
        : sourceCurrency;
      setSourceCurrency(detectedCurr);
      setLastModelUsed(batch._ai_model_used || selectedModel);

      const rows = buildStagedRowsFromExtracted(
        batch.products,
        detectedCurr,
        priceBasisMode,
        defaultMarkupPct
      );
      setStagedRows(rows);
      if (triggerToast) {
        triggerToast(
          `Extracted ${rows.length} catalog item(s) via ${batch._ai_model_used || 'Gemini AI'}. Review & click Import below.`,
          'success'
        );
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      setScanError(err?.message || 'AI Catalog extraction failed.');
    } finally {
      setIsScanning(false);
      setScanStatusText('');
    }
  };

  const updateRow = (tempId: string, patch: Partial<StagedCatalogProductRow>) => {
    setStagedRows((prev) =>
      prev.map((r) => (r.tempId === tempId ? { ...r, ...patch } : r))
    );
  };

  const selectedRows = stagedRows.filter((r) => r.selected);

  const handleCommitImport = async () => {
    if (selectedRows.length === 0 || isCommitting) return;
    const workspaceId = activeWorkspace?.id || 'default';
    setIsCommitting(true);

    try {
      const nowIso = new Date().toISOString();
      const workingProducts = [...products];
      const upsertedMap = new Map<string, Product>();

      // 1. Discover and persist any brand-new Product Categories
      const existingCatsLower = new Set(productCategories.map((c) => c.toLowerCase()));
      const newCategoryNames: string[] = [];
      for (const row of selectedRows) {
        const cat = (row.category || '').trim();
        if (cat && !existingCatsLower.has(cat.toLowerCase())) {
          existingCatsLower.add(cat.toLowerCase());
          newCategoryNames.push(cat);
        }
      }

      if (newCategoryNames.length > 0) {
        const createdCatDocs: DropdownOption[] = [];
        for (const catName of newCategoryNames) {
          try {
            const res = await safeAddDoc('dropdown_product_categories', {
              name: catName,
              workspace_id: workspaceId
            });
            createdCatDocs.push({
              id: res?.id || `cat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              name: catName,
              workspace_id: workspaceId
            });
          } catch {
            createdCatDocs.push({
              id: `cat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              name: catName,
              workspace_id: workspaceId
            });
          }
        }
        if (setProductCategories && createdCatDocs.length > 0) {
          setProductCategories((prev) => [...prev, ...createdCatDocs]);
        }
        try {
          const rawLs = localStorage.getItem('omni_product_categories');
          const parsedLs: any[] = rawLs ? JSON.parse(rawLs) : [];
          const mergedLs = [...parsedLs, ...createdCatDocs];
          localStorage.setItem('omni_product_categories', JSON.stringify(mergedLs));
        } catch {
          // ignore localStorage quota errors
        }
      }

      // 2. Pre-create or resolve Parent Products for rows with resolutionMode === 'new_variant_family'
      const familyParentByGroupKey = new Map<string, Product>();
      const familyGroups = new Map<string, StagedCatalogProductRow[]>();
      for (const row of selectedRows) {
        if (row.resolutionMode === 'new_variant_family') {
          const famName = (row.familyGroupName || row.name).trim();
          const gk = famName.toLowerCase();
          const list = familyGroups.get(gk) || [];
          list.push(row);
          familyGroups.set(gk, list);
        }
      }

      for (const [gk, groupRows] of familyGroups.entries()) {
        const firstRow = groupRows[0];
        const famTitle = (firstRow.familyGroupName || firstRow.name).trim();

        // Check if a parent with this exact family title already exists in the catalog
        const existingParent = workingProducts.find(
          (p) =>
            !p.is_deleted &&
            !p.variant_parent_id &&
            !(p as any).parent_product_id &&
            (p.name || '').trim().toLowerCase() === gk
        );

        if (existingParent && existingParent.id) {
          const patchedParent: Product = {
            ...existingParent,
            has_variants: true,
            product_family: famTitle,
            brand_make: existingParent.brand_make || firstRow.brand_make || undefined,
            country_of_origin: existingParent.country_of_origin || firstRow.country_of_origin || undefined,
            updatedAt: nowIso
          } as Product;
          await safeUpdateDoc('products', existingParent.id, sanitizeFirestorePayload(patchedParent)).catch(() => {});
          await MetadataRepository.upsertLocalProduct(patchedParent).catch(() => {});
          upsertedMap.set(existingParent.id, patchedParent);
          familyParentByGroupKey.set(gk, patchedParent);
        } else {
          // Compute shared attributes vs differentiating template keys across the family group
          const keyValSets = new Map<string, Set<string>>();
          const keyDisplayNames = new Map<string, string>();
          for (const gr of groupRows) {
            for (const attr of gr.attributes) {
              const kClean = (attr.key || '').trim();
              const vClean = (attr.value || '').trim();
              if (!kClean) continue;
              const kNorm = kClean.toLowerCase();
              if (!keyDisplayNames.has(kNorm)) keyDisplayNames.set(kNorm, kClean);
              const set = keyValSets.get(kNorm) || new Set<string>();
              set.add(vClean);
              keyValSets.set(kNorm, set);
            }
          }

          const varyingKeyRegex =
            /^(size|dimension|dimensions|dimensions \/ size|diameter|vessel size|capacity|capacity \/ rating|volume|flow|flow rate|rating|model|model no|part no|model \/ part no)$/i;
          const parentAttributes: ProductAttribute[] = [];
          for (const [kNorm, valSet] of keyValSets.entries()) {
            const displayKey = keyDisplayNames.get(kNorm) || kNorm;
            const values = Array.from(valSet).filter(Boolean);
            if (groupRows.length > 1) {
              if (values.length === 1) {
                parentAttributes.push({ key: displayKey, value: values[0] });
              } else {
                // Varying attribute across siblings -> blank template slot on Parent
                parentAttributes.push({ key: displayKey, value: '' });
              }
            } else {
              // Single-row family: keep shared base engineering specs populated on Parent and only blank out differentiating size/capacity/model slots
              if (values.length === 1 && !varyingKeyRegex.test(displayKey)) {
                parentAttributes.push({ key: displayKey, value: values[0] });
              } else {
                parentAttributes.push({ key: displayKey, value: '' });
              }
            }
          }

          const parentPayload: Partial<Product> & Record<string, any> = {
            workspace_id: workspaceId,
            name: famTitle,
            product_family: famTitle,
            has_variants: true,
            product_type: firstRow.category || 'General Equipment',
            description:
              compileDescriptionWithSpecs(
                famTitle,
                famTitle,
                parentAttributes.filter((a) => a.key && a.value)
              ) || famTitle,
            unit: (firstRow.unit || 'Nos') as UnitType,
            unit_price: 0,
            currency: 'AED',
            brand_make: firstRow.brand_make || undefined,
            country_of_origin: firstRow.country_of_origin || undefined,
            hs_code: firstRow.hs_code || undefined,
            default_availability: firstRow.availability || undefined,
            attributes: parentAttributes,
            is_inventoried: false,
            stock_on_hand: 0,
            stock_reserved: 0,
            search_terms: generateProductSearchTerms(
              famTitle,
              firstRow.category || 'General Equipment',
              '',
              firstRow.brand_make
            ),
            createdAt: nowIso,
            updatedAt: nowIso
          };

          const cleanParentPayload = sanitizeFirestorePayload(parentPayload);
          const docRef = await safeAddDoc('products', cleanParentPayload);
          const newParentId = docRef?.id || `prod_fam_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          const newParentProd: Product = { id: newParentId, ...cleanParentPayload } as Product;
          await MetadataRepository.upsertLocalProduct(newParentProd).catch(() => {});
          upsertedMap.set(newParentId, newParentProd);
          workingProducts.unshift(newParentProd);
          familyParentByGroupKey.set(gk, newParentProd);
        }
      }

      // 3. Process each selected row according to its resolutionMode
      let createdCount = 0;
      let updatedCount = 0;

      for (let i = 0; i < selectedRows.length; i++) {
        const row = selectedRows[i];
        const { attributes: cleanAttrs, rescuedFields } =
          cleanProductAttributesWithRescuedFields(row.attributes, {
            brand_make: row.brand_make,
            model_part_no: row.model_part_no,
            country_of_origin: row.country_of_origin,
            availability: row.availability,
            hs_code: row.hs_code
          });
        const effBrand = (rescuedFields.brand_make || row.brand_make).trim();
        const effModel = (rescuedFields.model_part_no || row.model_part_no).trim();
        const effOrigin = (rescuedFields.country_of_origin || row.country_of_origin).trim();
        const effAvailability = normalizeLeadTime(rescuedFields.availability || row.availability);
        const effHsCode = (rescuedFields.hs_code || row.hs_code).trim();
        const effUnit = normalizeCatalogUnit(row.unit || (row.is_composite_set ? 'Set' : 'Nos'));

        if (row.resolutionMode === 'update_existing' && row.targetExistingProductId) {
          const existingProd = workingProducts.find((p) => p.id === row.targetExistingProductId);
          if (existingProd && existingProd.id) {
            const mergedAttrs = cleanProductAttributesWithRescuedFields(
              mergeParentAndVariantAttributes(existingProd.attributes, cleanAttrs),
              {
                brand_make: effBrand || existingProd.brand_make,
                model_part_no: effModel || existingProd.model_part_no,
                country_of_origin: effOrigin || existingProd.country_of_origin,
                availability: effAvailability || existingProd.default_availability,
                hs_code: effHsCode || existingProd.hs_code
              }
            ).attributes;
            const updatedProd: Product = {
              ...existingProd,
              name: row.name.trim() || existingProd.name,
              product_type: row.category || existingProd.product_type,
              brand_make: effBrand || existingProd.brand_make,
              model_part_no: effModel || existingProd.model_part_no,
              sku: row.sku.trim() || existingProd.sku,
              country_of_origin: effOrigin || existingProd.country_of_origin,
              hs_code: effHsCode || existingProd.hs_code,
              unit: (effUnit || existingProd.unit || 'Nos') as UnitType,
              default_availability: effAvailability || existingProd.default_availability,
              unit_price: row.unit_price_aed > 0 ? row.unit_price_aed : existingProd.unit_price,
              cost_price: row.cost_price_aed > 0 ? row.cost_price_aed : existingProd.cost_price,
              attributes: mergedAttrs,
              description:
                compileDescriptionWithSpecs(
                  row.name.trim() || existingProd.name || '',
                  row.description.trim() || existingProd.description || '',
                  mergedAttrs
                ) || existingProd.description,
              is_composite_set: row.is_composite_set || existingProd.is_composite_set,
              sub_components:
                row.sub_components.length > 0 ? row.sub_components : existingProd.sub_components,
              search_terms: generateProductSearchTerms(
                row.name.trim() || existingProd.name || '',
                row.category || existingProd.product_type,
                row.sku.trim() || existingProd.sku || '',
                effBrand || effModel
              ),
              updatedAt: nowIso
            };
            await safeUpdateDoc('products', existingProd.id, sanitizeFirestorePayload(updatedProd));
            await MetadataRepository.upsertLocalProduct(updatedProd).catch(() => {});
            upsertedMap.set(existingProd.id, updatedProd);
            updatedCount++;
            continue;
          }
        }

        // Resolve parent product if variant_of_existing or new_variant_family
        let parentProd: Product | undefined;
        if (row.resolutionMode === 'variant_of_existing' && row.targetParentProductId) {
          parentProd =
            upsertedMap.get(row.targetParentProductId) ||
            workingProducts.find((p) => p.id === row.targetParentProductId);
          if (parentProd && parentProd.id && !(parentProd as any).has_variants) {
            const patchedParent: Product = {
              ...parentProd,
              has_variants: true,
              product_family: parentProd.product_family || parentProd.name,
              updatedAt: nowIso
            } as Product;
            await safeUpdateDoc('products', parentProd.id, sanitizeFirestorePayload(patchedParent)).catch(() => {});
            await MetadataRepository.upsertLocalProduct(patchedParent).catch(() => {});
            upsertedMap.set(parentProd.id, patchedParent);
            parentProd = patchedParent;
          }
        } else if (row.resolutionMode === 'new_variant_family') {
          const gk = (row.familyGroupName || row.name).trim().toLowerCase();
          parentProd = familyParentByGroupKey.get(gk);
        }

        const finalAttrs = parentProd
          ? mergeParentAndVariantAttributes(parentProd.attributes, cleanAttrs)
          : cleanAttrs;

        const resolvedVarLabel = parentProd
          ? row.variantLabel.trim() ||
            deriveSuggestedVariantLabel(
              {
                item_name: row.name,
                model_part_no: row.model_part_no,
                attributes: finalAttrs
              },
              parentProd
            ) ||
            `Variant ${i + 1}`
          : null;

        const baseName = row.name.trim() || parentProd?.name || 'Catalog Product';
        const autoSku =
          row.sku.trim() ||
          (parentProd?.sku
            ? `${parentProd.sku.replace(/-V\d+$/i, '')}-V${i + 1}`
            : undefined);

        const newPayload: Partial<Product> & Record<string, any> = {
          workspace_id: workspaceId,
          name: baseName,
          product_type: row.category || parentProd?.product_type || 'General Equipment',
          description:
            compileDescriptionWithSpecs(baseName, row.description.trim(), finalAttrs) ||
            row.description.trim() ||
            baseName,
          unit: (effUnit || parentProd?.unit || (row.is_composite_set ? 'Set' : 'Nos')) as UnitType,
          unit_price: row.unit_price_aed >= 0 ? row.unit_price_aed : undefined,
          cost_price: row.cost_price_aed > 0 ? row.cost_price_aed : undefined,
          currency: 'AED',
          sku: autoSku,
          brand_make: row.brand_make.trim() || parentProd?.brand_make || undefined,
          model_part_no: row.model_part_no.trim() || undefined,
          country_of_origin: row.country_of_origin.trim() || parentProd?.country_of_origin || undefined,
          hs_code: row.hs_code.trim() || parentProd?.hs_code || undefined,
          default_availability: row.availability.trim() || parentProd?.default_availability || undefined,
          variant_parent_id: parentProd?.id || null,
          parent_product_id: parentProd?.id || null,
          variant_label: resolvedVarLabel,
          product_family: parentProd
            ? parentProd.product_family || parentProd.name
            : undefined,
          attributes: finalAttrs,
          is_composite_set: row.is_composite_set,
          sub_components: row.is_composite_set && row.sub_components.length > 0 ? row.sub_components : undefined,
          package_pricing_mode: row.is_composite_set ? 'lump_sum' : undefined,
          is_inventoried: Boolean(parentProd?.is_inventoried),
          stock_on_hand: 0,
          stock_reserved: 0,
          search_terms: generateProductSearchTerms(
            baseName,
            row.category || 'General Equipment',
            autoSku || '',
            row.brand_make || row.model_part_no || resolvedVarLabel || undefined
          ),
          createdAt: nowIso,
          updatedAt: nowIso
        };

        const cleanCreate = sanitizeFirestorePayload(newPayload);
        const res = await safeAddDoc('products', cleanCreate);
        const newId = res?.id || `prod_ai_${Date.now()}_${i}`;
        const createdProd: Product = { id: newId, ...cleanCreate } as Product;
        await MetadataRepository.upsertLocalProduct(createdProd).catch(() => {});
        upsertedMap.set(newId, createdProd);
        createdCount++;
      }

      const mergeUpsertedProducts = (baseList: Product[]): Product[] => {
        const existingIds = new Set(baseList.map((p) => p.id));
        const updatedPrev = baseList.map((p) =>
          p.id && upsertedMap.has(p.id) ? upsertedMap.get(p.id)! : p
        );
        const brandNew: Product[] = [];
        for (const [id, prod] of upsertedMap.entries()) {
          if (!existingIds.has(id)) {
            brandNew.push(prod);
          }
        }
        return [...brandNew, ...updatedPrev];
      };

      try {
        const rawLs = localStorage.getItem('omni_products');
        const parsedLs: Product[] = rawLs ? JSON.parse(rawLs) : products;
        const mergedLs = mergeUpsertedProducts(Array.isArray(parsedLs) ? parsedLs : products);
        localStorage.setItem('omni_products', JSON.stringify(mergedLs));
      } catch {
        // ignore localStorage quota errors
      }

      if (setProducts) {
        setProducts((prev) => mergeUpsertedProducts(prev));
      }

      if (triggerToast) {
        const summaryParts: string[] = [];
        if (createdCount > 0) summaryParts.push(`${createdCount} created`);
        if (updatedCount > 0) summaryParts.push(`${updatedCount} updated`);
        if (familyParentByGroupKey.size > 0) {
          summaryParts.push(`${familyParentByGroupKey.size} variant ${familyParentByGroupKey.size === 1 ? 'family' : 'families'}`);
        }
        triggerToast(
          `AI Catalog Import complete (${summaryParts.join(', ')})!`,
          'success'
        );
      }
      onClose();
    } catch (err: any) {
      if (triggerToast) {
        triggerToast(`Failed to commit catalog import: ${err?.message || 'Error'}`, 'error');
      }
    } finally {
      setIsCommitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[94vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-4 py-3.5 sm:px-6 border-b border-slate-200 dark:border-slate-800 bg-gradient-to-r from-indigo-50/70 via-white to-blue-50/60 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950/30 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-indigo-600 text-white shadow-xs shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                  AI Catalog &amp; Product Extractor
                </h3>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                  Datasheets • Excel • Spec Tables • Variant Families
                </span>
                {lastModelUsed && (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                    Scanned with {lastModelUsed}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                Upload PDF datasheets, spec table images, Excel/Word sheets, or paste raw rows to extract products, specs, BOMs &amp; variant families.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* 1. Source Input & AI Controls Container */}
          <div className="bg-slate-50/80 dark:bg-slate-950/50 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-4 space-y-3">
            {/* Top 2-Column Grid: Strictly Upload Datasheet (Left) & Paste/Edit Raw Text (Right) with Matched Heights */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
              {/* Left: File Dropzone */}
              <div className="lg:col-span-5 flex flex-col">
                <label className="block text-[11px] font-mono uppercase font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  1. Upload Datasheet, Price List, Excel or Image
                </label>
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const file = e.dataTransfer.files?.[0];
                    if (file) {
                      setUploadedFile(file);
                      void runAiCatalogScan('fast', file);
                    }
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 border-2 border-dashed border-indigo-200 dark:border-indigo-800/70 hover:border-indigo-500 bg-white dark:bg-slate-900 rounded-xl p-4 text-center cursor-pointer transition flex flex-col items-center justify-center min-h-[132px]"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.csv,.docx,.txt"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setUploadedFile(file);
                        void runAiCatalogScan('fast', file);
                      }
                      e.target.value = '';
                    }}
                  />
                  <UploadCloud className="w-7 h-7 text-indigo-500 mb-1.5" />
                  {uploadedFile ? (
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-indigo-700 dark:text-indigo-300 truncate max-w-[260px]">
                        {uploadedFile.name}
                      </p>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setUploadedFile(null);
                        }}
                        className="text-[10px] font-semibold text-rose-600 hover:underline cursor-pointer"
                      >
                        Remove File
                      </button>
                    </div>
                  ) : (
                    <>
                      <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                        Drop file here or <span className="text-indigo-600 underline">browse</span>
                      </p>
                      <p className="text-[10.5px] text-slate-400 mt-0.5">
                        Supports PDF, PNG/JPG, Excel (.xlsx/.csv), Word (.docx)
                      </p>
                    </>
                  )}
                </div>
              </div>

              {/* Right: Persistent Editable Paste Textarea */}
              <div className="lg:col-span-7 flex flex-col">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label className="text-[11px] font-mono uppercase font-bold text-slate-700 dark:text-slate-300">
                    2. Or Paste / Edit Raw Text, Excel Rows, or Specification Table
                  </label>
                  {rawPasteText.trim() && (
                    <button
                      type="button"
                      onClick={() => setRawPasteText('')}
                      className="text-[10px] font-semibold text-slate-400 hover:text-rose-600 cursor-pointer"
                    >
                      Clear Text
                    </button>
                  )}
                </div>
                <textarea
                  rows={5}
                  value={rawPasteText}
                  onChange={(e) => setRawPasteText(e.target.value)}
                  placeholder={`Paste multi-column Excel product rows, supplier quotation lines, or datasheet specs here...\nExample:\nAVENTURA FRP Filter Vessel 42" x 72" | 6 Bar | Top & Bottom Flange | AED 12,970\nAVENTURA FRP Filter Vessel 48" x 72" | 6 Bar | Top & Bottom Flange | AED 15,200`}
                  className="flex-1 w-full min-h-[132px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-xs font-mono text-slate-800 dark:text-slate-100 focus:outline-none focus:border-indigo-500 resize-y"
                />
              </div>
            </div>

            {/* Full-Width Collapsible Bar: Workspace Catalog AI Rules */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowWorkspaceRules((prev) => !prev)}
                className="w-full px-3.5 py-2 flex items-center justify-between gap-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition cursor-pointer"
              >
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                    ⚙️ Workspace Catalog AI Rules
                  </span>
                  {Boolean(
                    workspaceRulesDraft.trim() ||
                      activeWorkspace?.catalog_ai_guidelines?.trim()
                  ) ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9.5px] font-mono font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span>Active for {activeWorkspace?.name || 'Workspace'}</span>
                    </span>
                  ) : (
                    <span className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
                      Optional per-workspace brand, category, SKU prefix, and family grouping conventions
                    </span>
                  )}
                </div>
                <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 shrink-0">
                  <span>{showWorkspaceRules ? 'Hide Rules' : 'Configure'}</span>
                  {showWorkspaceRules ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </div>
              </button>

              {showWorkspaceRules && (
                <div className="px-3.5 pb-3.5 pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2 bg-slate-50/50 dark:bg-slate-950/40">
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                    Custom AI catalog extraction instructions for{' '}
                    <strong className="text-slate-700 dark:text-slate-200">
                      {activeWorkspace?.name || 'this workspace'}
                    </strong>{' '}
                    (e.g., preferred brand naming, category conventions, SKU prefixes, or spec keys).
                  </p>
                  <textarea
                    rows={3}
                    value={workspaceRulesDraft}
                    onChange={(e) => setWorkspaceRulesDraft(e.target.value)}
                    placeholder={`Example rules for ${activeWorkspace?.name || 'this workspace'}:\n- Group all FRP Vessels under "AVENTURA Multimedia FRP Filter Vessel"\n- Use category "Filter Media" for sand, carbon, and anthracite`}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2.5 text-[11px] font-mono text-slate-800 dark:text-slate-100 focus:outline-none focus:border-indigo-500 resize-y"
                  />
                  <div className="flex items-center justify-end">
                    <button
                      type="button"
                      disabled={isSavingWorkspaceRules || !activeWorkspace?.id}
                      onClick={() => void handleSaveWorkspaceRules()}
                      className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold transition cursor-pointer disabled:opacity-50"
                    >
                      {isSavingWorkspaceRules
                        ? 'Saving...'
                        : `Save Rules for ${activeWorkspace?.name || 'Workspace'}`}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Dedicated Full-Width Action Bar: AI Engine, Source Currency, Price Basis (Margin/Markup) & Scan Buttons */}
            <div className="pt-1 flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex flex-wrap items-center gap-2">
                {/* AI Engine */}
                <div className="inline-flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 h-9">
                  <span className="text-[10px] font-mono uppercase font-bold text-slate-400">
                    AI:
                  </span>
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="bg-transparent text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer max-w-[190px] truncate"
                  >
                    {AVAILABLE_GEMINI_MODELS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Source Currency → AED */}
                <div className="inline-flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 h-9">
                  <span className="text-[10px] font-mono uppercase font-bold text-slate-400">
                    FX:
                  </span>
                  <select
                    value={sourceCurrency}
                    onChange={(e) =>
                      handleRecalculateAllCurrencyAndMarkup(
                        e.target.value,
                        priceBasisMode,
                        defaultMarkupPct,
                        costCalcMode
                      )
                    }
                    className="bg-transparent text-xs font-mono font-bold text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer"
                  >
                    {SOURCE_CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c} {c !== 'AED' ? `→ AED (×${resolveToAedMultiplier(c)})` : '(Base AED)'}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Price Basis Mode */}
                <div className="inline-flex rounded-xl bg-slate-200/75 dark:bg-slate-800 p-0.5 text-[11px] font-semibold h-9 items-center">
                  <button
                    type="button"
                    onClick={() =>
                      handleRecalculateAllCurrencyAndMarkup(
                        sourceCurrency,
                        'selling',
                        defaultMarkupPct,
                        costCalcMode
                      )
                    }
                    className={`h-8 px-2.5 rounded-lg transition cursor-pointer whitespace-nowrap ${
                      priceBasisMode === 'selling'
                        ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-2xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Source = Selling Prices
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleRecalculateAllCurrencyAndMarkup(
                        sourceCurrency,
                        'cost_plus_markup',
                        defaultMarkupPct,
                        costCalcMode
                      )
                    }
                    className={`h-8 px-2.5 rounded-lg transition cursor-pointer whitespace-nowrap ${
                      priceBasisMode === 'cost_plus_markup'
                        ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-2xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Source = Cost Prices
                  </button>
                </div>

                {/* Gross Margin % vs Cost-Plus Markup % Toggle & Input */}
                {priceBasisMode === 'cost_plus_markup' && (
                  <div className="inline-flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 rounded-xl px-2 h-9">
                    <div className="inline-flex rounded-lg bg-indigo-50 dark:bg-indigo-950/70 p-0.5 text-[10px] font-mono font-bold">
                      <button
                        type="button"
                        onClick={() =>
                          handleRecalculateAllCurrencyAndMarkup(
                            sourceCurrency,
                            'cost_plus_markup',
                            defaultMarkupPct,
                            'margin'
                          )
                        }
                        className={`px-2 py-0.5 rounded-md transition cursor-pointer ${
                          costCalcMode === 'margin'
                            ? 'bg-indigo-600 text-white shadow-2xs'
                            : 'text-indigo-700 dark:text-indigo-300 hover:text-indigo-900'
                        }`}
                        title="Gross Margin Formula: Selling Price = Cost ÷ (1 - Margin%)"
                      >
                        Margin %
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleRecalculateAllCurrencyAndMarkup(
                            sourceCurrency,
                            'cost_plus_markup',
                            defaultMarkupPct,
                            'markup'
                          )
                        }
                        className={`px-2 py-0.5 rounded-md transition cursor-pointer ${
                          costCalcMode === 'markup'
                            ? 'bg-indigo-600 text-white shadow-2xs'
                            : 'text-indigo-700 dark:text-indigo-300 hover:text-indigo-900'
                        }`}
                        title="Cost-Plus Markup Formula: Selling Price = Cost × (1 + Markup%)"
                      >
                        Markup %
                      </button>
                    </div>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      max={costCalcMode === 'margin' ? '99' : '1000'}
                      value={defaultMarkupPct}
                      onChange={(e) =>
                        handleRecalculateAllCurrencyAndMarkup(
                          sourceCurrency,
                          'cost_plus_markup',
                          Number(e.target.value) || 0,
                          costCalcMode
                        )
                      }
                      className="w-11 text-xs font-mono font-bold text-slate-900 dark:text-slate-100 bg-transparent focus:outline-none text-right"
                    />
                    <span
                      className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-mono font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap"
                      title={
                        costCalcMode === 'margin'
                          ? `Selling Price = Cost ÷ ${(1 - Math.min(99.9, Math.max(0, defaultMarkupPct)) / 100).toFixed(2)}`
                          : `Selling Price = Cost × ${(1 + Math.max(0, defaultMarkupPct) / 100).toFixed(2)}`
                      }
                    >
                      {costCalcMode === 'margin'
                        ? `÷ ${(1 - Math.min(99.9, Math.max(0, defaultMarkupPct)) / 100).toFixed(2)}`
                        : `× ${(1 + Math.max(0, defaultMarkupPct) / 100).toFixed(2)}`}
                    </span>
                  </div>
                )}
              </div>

              {/* Right-Pinned Scan Action Buttons */}
              <div className="flex items-center gap-2 ml-auto shrink-0">
                {rawPasteText.trim() && stagedRows.length > 0 && (
                  <button
                    type="button"
                    disabled={isScanning}
                    onClick={() => void runAiCatalogScan('fast', null, rawPasteText)}
                    className="h-9 px-3 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-100 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 whitespace-nowrap"
                    title="Re-scan the edited text in the box above"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
                    <span>Re-Scan Text</span>
                  </button>
                )}
                <button
                  type="button"
                  disabled={isScanning}
                  onClick={() => void runAiCatalogScan('fast')}
                  className="h-9 px-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-xs transition cursor-pointer disabled:opacity-50 whitespace-nowrap"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>⚡ Fast Scan</span>
                </button>
                <button
                  type="button"
                  disabled={isScanning}
                  onClick={() => void runAiCatalogScan('deep')}
                  className="h-9 px-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-indigo-950 dark:hover:bg-indigo-900 text-white text-xs font-bold inline-flex items-center gap-1.5 border border-slate-800 dark:border-indigo-700 transition cursor-pointer disabled:opacity-50 whitespace-nowrap"
                  title="Deep reasoning scan for dense multi-model datasheet tables"
                >
                  <span>🧠 Deep Scan</span>
                </button>
              </div>
            </div>
          </div>

          {/* Status & Error Banners */}
          {isScanning && (
            <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-800 dark:text-indigo-200 text-xs font-semibold">
              <div className="flex items-center gap-2.5">
                <RefreshCw className="w-4 h-4 animate-spin text-indigo-600 shrink-0" />
                <span>{scanStatusText || 'Extracting products & variant families with Gemini AI...'}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  abortControllerRef.current?.abort();
                  setIsScanning(false);
                }}
                className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 text-rose-600 border border-rose-200 text-[11px] font-bold cursor-pointer"
              >
                Stop
              </button>
            </div>
          )}

          {scanError && (
            <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-200 text-xs font-semibold">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{scanError}</span>
            </div>
          )}

          {/* 2. Smart Staging & Resolution Table */}
          {stagedRows.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2.5">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    Staged Products for Review ({selectedRows.length} of {stagedRows.length} selected)
                  </h4>
                  <button
                    type="button"
                    onClick={() => {
                      const allSel = stagedRows.every((r) => r.selected);
                      setStagedRows((prev) => prev.map((r) => ({ ...r, selected: !allSel })));
                    }}
                    className="text-xs font-semibold text-indigo-600 hover:underline cursor-pointer"
                  >
                    {stagedRows.every((r) => r.selected) ? 'Deselect All' : 'Select All'}
                  </button>
                </div>

                {/* Quick Batch Resolution Switcher */}
                <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                  <span className="text-slate-500 font-medium">Set All Selected To:</span>
                  <button
                    type="button"
                    onClick={() =>
                      setStagedRows((prev) =>
                        prev.map((r) => (r.selected ? { ...r, resolutionMode: 'standalone' } : r))
                      )
                    }
                    className="px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold cursor-pointer"
                  >
                    🆕 Standalone
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const defaultFam =
                        stagedRows.find((r) => r.familyGroupName)?.familyGroupName ||
                        stagedRows[0]?.name.replace(/\s*\([^)]+\)\s*$/, '').trim() ||
                        'New Product Family';
                      setStagedRows((prev) =>
                        prev.map((r) =>
                          r.selected
                            ? {
                                ...r,
                                resolutionMode: 'new_variant_family',
                                familyGroupName: r.familyGroupName || defaultFam
                              }
                            : r
                        )
                      );
                    }}
                    className="px-2 py-0.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-semibold cursor-pointer"
                  >
                    👑 Group as New Variant Family
                  </button>
                </div>
              </div>

              <datalist id="ai-catalog-categories-datalist">
                {productCategories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>

              <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-900">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[980px]">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-[10px] font-mono uppercase text-slate-500">
                        <th className="py-2.5 px-3 w-9 text-center">Use</th>
                        <th className="py-2.5 px-3 w-[235px]">Catalog Resolution Mode</th>
                        <th className="py-2.5 px-3">Product Name &amp; Variant</th>
                        <th className="py-2.5 px-3 w-[195px]">Category</th>
                        <th className="py-2.5 px-3 w-[155px]">Brand · Model · SKU</th>
                        <th className="py-2.5 px-3 w-[175px]">Unit &amp; Sell Price (AED)</th>
                        <th className="py-2.5 px-3 w-[135px] text-right">Details, Specs &amp; BOM</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                      {stagedRows.map((row) => {
                        const isExpanded = expandedRowId === row.tempId;
                        const showVariantInput =
                          row.resolutionMode === 'new_variant_family' ||
                          row.resolutionMode === 'variant_of_existing' ||
                          Boolean(row.variantLabel.trim());
                        const modelSkuSummary = [
                          row.model_part_no.trim() || null,
                          row.sku.trim() ? `SKU: ${row.sku.trim()}` : null
                        ]
                          .filter(Boolean)
                          .join(' · ');

                        return (
                          <React.Fragment key={row.tempId}>
                            <tr
                              className={`transition ${
                                !row.selected
                                  ? 'opacity-45 bg-slate-50/40 dark:bg-slate-950/30'
                                  : row.resolutionMode === 'new_variant_family'
                                  ? 'bg-indigo-50/20 dark:bg-indigo-950/15'
                                  : row.resolutionMode === 'variant_of_existing'
                                  ? 'bg-violet-50/20 dark:bg-violet-950/15'
                                  : row.resolutionMode === 'update_existing'
                                  ? 'bg-emerald-50/20 dark:bg-emerald-950/15'
                                  : ''
                              }`}
                            >
                              {/* Checkbox */}
                              <td className="py-2.5 px-3 text-center align-top pt-3.5">
                                <input
                                  type="checkbox"
                                  checked={row.selected}
                                  onChange={(e) =>
                                    updateRow(row.tempId, { selected: e.target.checked })
                                  }
                                  className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                />
                              </td>

                              {/* Smart Resolution Mode Selector */}
                              <td className="py-2.5 px-3 align-top space-y-1.5">
                                <select
                                  value={row.resolutionMode}
                                  onChange={(e) =>
                                    updateRow(row.tempId, {
                                      resolutionMode: e.target.value as StagedResolutionMode
                                    })
                                  }
                                  className={`w-full rounded-lg border px-2 py-1 text-[11px] font-bold focus:outline-none ${
                                    row.resolutionMode === 'new_variant_family'
                                      ? 'border-indigo-300 bg-indigo-50 text-indigo-900 dark:bg-indigo-950/60 dark:text-indigo-200 dark:border-indigo-800'
                                      : row.resolutionMode === 'variant_of_existing'
                                      ? 'border-violet-300 bg-violet-50 text-violet-900 dark:bg-violet-950/60 dark:text-violet-200 dark:border-violet-800'
                                      : row.resolutionMode === 'update_existing'
                                      ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-800'
                                      : 'border-slate-200 bg-white text-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-700'
                                  }`}
                                >
                                  <option value="standalone">🆕 Create Standalone Product</option>
                                  <option value="new_variant_family">
                                    👑 Group as New Variant Family
                                  </option>
                                  <option value="variant_of_existing">
                                    🧬 Add as Variant of Existing...
                                  </option>
                                  <option value="update_existing">
                                    🔄 Update Existing Product...
                                  </option>
                                </select>

                                {row.resolutionMode === 'new_variant_family' && (
                                  <div>
                                    <label className="block text-[9.5px] font-mono uppercase text-indigo-700 dark:text-indigo-300 font-bold">
                                      Shared Parent Family Name
                                    </label>
                                    <input
                                      type="text"
                                      value={row.familyGroupName}
                                      onChange={(e) =>
                                        updateRow(row.tempId, { familyGroupName: e.target.value })
                                      }
                                      placeholder="e.g. AVENTURA FRP Filter Vessel"
                                      className="w-full mt-0.5 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-900 px-2 py-1 text-[11px] font-semibold text-indigo-900 dark:text-indigo-200"
                                    />
                                  </div>
                                )}

                                {row.resolutionMode === 'variant_of_existing' && (
                                  <select
                                    value={row.targetParentProductId || ''}
                                    onChange={(e) =>
                                      updateRow(row.tempId, {
                                        targetParentProductId: e.target.value
                                      })
                                    }
                                    className="w-full rounded-lg border border-violet-200 dark:border-violet-800 bg-white dark:bg-slate-900 px-2 py-1 text-[11px] font-semibold text-violet-900 dark:text-violet-200"
                                  >
                                    <option value="">-- Select Existing Parent --</option>
                                    {parentCandidates.map((p) => (
                                      <option key={p.id} value={p.id}>
                                        {p.name} {p.sku ? `(${p.sku})` : ''}
                                      </option>
                                    ))}
                                  </select>
                                )}

                                {row.resolutionMode === 'update_existing' && (
                                  <div className="space-y-1">
                                    <select
                                      value={row.targetExistingProductId || ''}
                                      onChange={(e) =>
                                        updateRow(row.tempId, {
                                          targetExistingProductId: e.target.value
                                        })
                                      }
                                      className="w-full rounded-lg border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-slate-900 px-2 py-1 text-[11px] font-semibold text-emerald-900 dark:text-emerald-200"
                                    >
                                      <option value="">-- Select Existing SKU --</option>
                                      {activeCatalogProducts.map((p) => (
                                        <option key={p.id} value={p.id}>
                                          {p.name} {p.sku ? `[${p.sku}]` : ''}
                                        </option>
                                      ))}
                                    </select>
                                    {row.updateDiffBadge && (
                                      <span className="inline-block px-1.5 py-0.5 rounded text-[9.5px] font-mono font-bold bg-emerald-100/80 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300">
                                        {row.updateDiffBadge}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </td>

                              {/* Product Name & Variant Label */}
                              <td className="py-2.5 px-3 align-top space-y-1.5">
                                <input
                                  type="text"
                                  value={row.name}
                                  onChange={(e) => updateRow(row.tempId, { name: e.target.value })}
                                  placeholder="Product Title"
                                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 text-xs font-bold text-slate-900 dark:text-slate-100"
                                />
                                {showVariantInput ? (
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] font-mono text-slate-400 shrink-0">
                                      Variant / Size:
                                    </span>
                                    <input
                                      type="text"
                                      value={row.variantLabel}
                                      onChange={(e) =>
                                        updateRow(row.tempId, { variantLabel: e.target.value })
                                      }
                                      placeholder='e.g. 48" x 72" or 10 LPH'
                                      className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-0.5 text-[11px] font-mono font-semibold text-violet-700 dark:text-violet-300"
                                    />
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setExpandedRowId(row.tempId)}
                                    className="text-[10px] font-mono text-slate-400 hover:text-indigo-600 cursor-pointer"
                                  >
                                    + Set Variant / Size in Details
                                  </button>
                                )}
                              </td>

                              {/* Category (Widened for full readability) */}
                              <td className="py-2.5 px-3 align-top space-y-1">
                                <input
                                  type="text"
                                  list="ai-catalog-categories-datalist"
                                  value={row.category}
                                  onChange={(e) =>
                                    updateRow(row.tempId, { category: e.target.value })
                                  }
                                  placeholder="Category"
                                  title={row.category}
                                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-slate-800 dark:text-slate-100"
                                />
                                {row.category &&
                                  !productCategories.some(
                                    (c) => c.toLowerCase() === row.category.trim().toLowerCase()
                                  ) && (
                                    <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                      + New Category
                                    </span>
                                  )}
                              </td>

                              {/* Brand · Model · SKU (Clean 2-Line Read-Only Metadata Stack, Clickable to Open Drawer) */}
                              <td className="py-2.5 px-3 align-top">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedRowId((prev) =>
                                      prev === row.tempId ? null : row.tempId
                                    )
                                  }
                                  className="w-full text-left rounded-lg px-2 py-1 hover:bg-slate-100/80 dark:hover:bg-slate-800/60 border border-transparent hover:border-slate-200 dark:hover:border-slate-700 transition cursor-pointer group"
                                  title="Click to edit Brand, Model, and SKU in Details drawer"
                                >
                                  <div className="text-[11px] font-bold text-slate-800 dark:text-slate-100 truncate">
                                    {row.brand_make.trim() || (
                                      <span className="text-slate-400 font-normal">No brand set</span>
                                    )}
                                  </div>
                                  <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                    {modelSkuSummary || 'Set Model / SKU ▾'}
                                  </div>
                                </button>
                              </td>

                              {/* Unit & Sell Price (AED) + Compact Clickable Cost Summary */}
                              <td className="py-2.5 px-3 align-top space-y-1">
                                <div className="flex items-center gap-1">
                                  <select
                                    value={row.unit}
                                    onChange={(e) =>
                                      updateRow(row.tempId, { unit: e.target.value })
                                    }
                                    className="w-16 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-1 py-1 text-[11px] font-semibold"
                                  >
                                    {Array.from(new Set([row.unit, ...units])).map((u) => (
                                      <option key={u} value={u}>
                                        {u}
                                      </option>
                                    ))}
                                  </select>
                                  <div className="flex-1">
                                    <input
                                      type="number"
                                      step="any"
                                      value={row.unit_price_aed}
                                      onChange={(e) =>
                                        updateRow(row.tempId, {
                                          unit_price_aed: Number(e.target.value) || 0
                                        })
                                      }
                                      placeholder="Sell AED"
                                      title="Selling Price (AED)"
                                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-[11px] font-mono font-bold text-slate-900 dark:text-slate-100"
                                    />
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedRowId((prev) =>
                                      prev === row.tempId ? null : row.tempId
                                    )
                                  }
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 hover:bg-indigo-50 dark:bg-slate-800 dark:hover:bg-indigo-950/50 text-[10px] font-mono text-slate-600 dark:text-slate-300 hover:text-indigo-700 transition cursor-pointer"
                                  title="Click to edit Cost Price (AED) in Details drawer"
                                >
                                  <span>
                                    Cost:{' '}
                                    {row.cost_price_aed > 0
                                      ? `AED ${row.cost_price_aed.toLocaleString(undefined, {
                                          minimumFractionDigits: 2,
                                          maximumFractionDigits: 2
                                        })}`
                                      : '—'}
                                  </span>
                                  <span className="text-[9px] text-indigo-500">✎</span>
                                </button>
                              </td>

                              {/* Expandable Details, Specs & BOM Pills */}
                              <td className="py-2.5 px-3 align-top text-right space-y-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedRowId((prev) =>
                                      prev === row.tempId ? null : row.tempId
                                    )
                                  }
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-[10.5px] font-mono font-bold cursor-pointer whitespace-nowrap"
                                >
                                  <span>Specs ({row.attributes.length})</span>
                                  {row.sub_components.length > 0 && (
                                    <span>• BOM ({row.sub_components.length})</span>
                                  )}
                                  {isExpanded ? (
                                    <ChevronUp className="w-3 h-3" />
                                  ) : (
                                    <ChevronDown className="w-3 h-3" />
                                  )}
                                </button>
                                <div>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setStagedRows((prev) =>
                                        prev.filter((r) => r.tempId !== row.tempId)
                                      )
                                    }
                                    className="text-[10px] text-slate-400 hover:text-rose-600 cursor-pointer"
                                  >
                                    Remove
                                  </button>
                                </div>
                              </td>
                            </tr>

                            {/* Expanded Details, Attributes & BOM Sub-Components Drawer */}
                            {isExpanded && (
                              <tr className="bg-slate-50/90 dark:bg-slate-950/70">
                                <td colSpan={7} className="p-3.5 space-y-3.5 border-t border-slate-200/70 dark:border-slate-800">
                                  {/* Full-Width Editable Identity & Cost Strip Inside Drawer */}
                                  <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5 pb-3 border-b border-slate-200/70 dark:border-slate-800">
                                    <div>
                                      <label className="block text-[9.5px] font-mono uppercase font-bold text-slate-500 mb-0.5">
                                        Brand / Make
                                      </label>
                                      <input
                                        type="text"
                                        value={row.brand_make}
                                        onChange={(e) =>
                                          updateRow(row.tempId, { brand_make: e.target.value })
                                        }
                                        placeholder="e.g. AVENTURA, Grundfos"
                                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-slate-800 dark:text-slate-100"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-[9.5px] font-mono uppercase font-bold text-slate-500 mb-0.5">
                                        Model / Part No.
                                      </label>
                                      <input
                                        type="text"
                                        value={row.model_part_no}
                                        onChange={(e) =>
                                          updateRow(row.tempId, { model_part_no: e.target.value })
                                        }
                                        placeholder="Model / Part No."
                                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 text-[11px] font-mono text-slate-800 dark:text-slate-100"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-[9.5px] font-mono uppercase font-bold text-slate-500 mb-0.5">
                                        SKU / Internal Code
                                      </label>
                                      <input
                                        type="text"
                                        value={row.sku}
                                        onChange={(e) =>
                                          updateRow(row.tempId, { sku: e.target.value })
                                        }
                                        placeholder="Auto-generated if blank"
                                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 text-[11px] font-mono text-slate-800 dark:text-slate-100"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-[9.5px] font-mono uppercase font-bold text-slate-500 mb-0.5">
                                        Variant / Size Label
                                      </label>
                                      <input
                                        type="text"
                                        value={row.variantLabel}
                                        onChange={(e) =>
                                          updateRow(row.tempId, { variantLabel: e.target.value })
                                        }
                                        placeholder='e.g. 48" x 72"'
                                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 text-[11px] font-mono text-violet-700 dark:text-violet-300"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-[9.5px] font-mono uppercase font-bold text-slate-500 mb-0.5">
                                        Cost Price (AED)
                                      </label>
                                      <input
                                        type="number"
                                        step="any"
                                        value={row.cost_price_aed}
                                        onChange={(e) =>
                                          updateRow(row.tempId, {
                                            cost_price_aed: Number(e.target.value) || 0
                                          })
                                        }
                                        placeholder="0.00"
                                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 text-[11px] font-mono font-semibold text-slate-800 dark:text-slate-100"
                                      />
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                    {/* Left: Technical Specification Attributes */}
                                    <div className="space-y-2">
                                      <div className="flex items-center justify-between">
                                        <span className="text-[10.5px] font-mono uppercase font-bold text-slate-700 dark:text-slate-300">
                                          Technical Specification Attributes ({row.attributes.length})
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            updateRow(row.tempId, {
                                              attributes: [
                                                ...row.attributes,
                                                { key: '', value: '' }
                                              ]
                                            })
                                          }
                                          className="text-[10.5px] font-bold text-indigo-600 hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                                        >
                                          <Plus className="w-3 h-3" />
                                          <span>Add Spec</span>
                                        </button>
                                      </div>
                                      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                                        {row.attributes.map((attr, aIdx) => (
                                          <div key={aIdx} className="flex items-center gap-1.5">
                                            <input
                                              type="text"
                                              value={attr.key}
                                              onChange={(e) => {
                                                const next = [...row.attributes];
                                                next[aIdx] = { ...next[aIdx], key: e.target.value };
                                                updateRow(row.tempId, { attributes: next });
                                              }}
                                              placeholder="Spec Key (e.g. Dimensions)"
                                              className="w-36 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-[11px] font-mono font-semibold"
                                            />
                                            <input
                                              type="text"
                                              value={attr.value}
                                              onChange={(e) => {
                                                const next = [...row.attributes];
                                                next[aIdx] = {
                                                  ...next[aIdx],
                                                  value: e.target.value
                                                };
                                                updateRow(row.tempId, { attributes: next });
                                              }}
                                              placeholder="Spec Value"
                                              className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-[11px] font-mono"
                                            />
                                            <button
                                              type="button"
                                              onClick={() =>
                                                updateRow(row.tempId, {
                                                  attributes: row.attributes.filter(
                                                    (_, i) => i !== aIdx
                                                  )
                                                })
                                              }
                                              className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                                            >
                                              <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                          </div>
                                        ))}
                                      </div>
                                    </div>

                                    {/* Right: Description, Origin/Availability & BOM Sub-Items */}
                                    <div className="space-y-2">
                                      <div className="grid grid-cols-2 gap-2">
                                        <div>
                                          <label className="block text-[9.5px] font-mono uppercase text-slate-500">
                                            Country of Origin
                                          </label>
                                          <input
                                            type="text"
                                            value={row.country_of_origin}
                                            onChange={(e) =>
                                              updateRow(row.tempId, {
                                                country_of_origin: e.target.value
                                              })
                                            }
                                            placeholder="e.g. UAE, USA, Italy"
                                            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-[11px]"
                                          />
                                        </div>
                                        <div>
                                          <label className="block text-[9.5px] font-mono uppercase text-slate-500">
                                            Lead Time / Availability
                                          </label>
                                          <input
                                            type="text"
                                            value={row.availability}
                                            onChange={(e) =>
                                              updateRow(row.tempId, {
                                                availability: e.target.value
                                              })
                                            }
                                            placeholder="e.g. Ex-Stock, 6-8 Weeks"
                                            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-[11px]"
                                          />
                                        </div>
                                      </div>

                                      {/* BOM Sub-Components */}
                                      <div className="pt-1">
                                        <div className="flex items-center justify-between mb-1">
                                          <span className="text-[10.5px] font-mono uppercase font-bold text-slate-700 dark:text-slate-300">
                                            Package / BOM Sub-Items ({row.sub_components.length})
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              updateRow(row.tempId, {
                                                is_composite_set: true,
                                                sub_components: [
                                                  ...row.sub_components,
                                                  {
                                                    id: `sub_${Date.now()}`,
                                                    sn: String(row.sub_components.length + 1),
                                                    item_name: '',
                                                    quantity: 1,
                                                    unit: 'Nos',
                                                    unit_price: 0,
                                                    total_price: 0,
                                                    is_included_accessory: true
                                                  }
                                                ]
                                              })
                                            }
                                            className="text-[10.5px] font-bold text-indigo-600 hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                                          >
                                            <Plus className="w-3 h-3" />
                                            <span>Add Sub-Item</span>
                                          </button>
                                        </div>
                                        {row.sub_components.length > 0 && (
                                          <div className="space-y-1 max-h-36 overflow-y-auto">
                                            {row.sub_components.map((sub, sIdx) => (
                                              <div
                                                key={sub.id || sIdx}
                                                className="flex items-center gap-1.5"
                                              >
                                                <input
                                                  type="number"
                                                  value={sub.quantity}
                                                  onChange={(e) => {
                                                    const next = [...row.sub_components];
                                                    next[sIdx] = {
                                                      ...next[sIdx],
                                                      quantity: Number(e.target.value) || 1
                                                    };
                                                    updateRow(row.tempId, {
                                                      sub_components: next
                                                    });
                                                  }}
                                                  className="w-12 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-1.5 py-0.5 text-[11px] font-mono text-center"
                                                />
                                                <input
                                                  type="text"
                                                  value={sub.unit}
                                                  onChange={(e) => {
                                                    const next = [...row.sub_components];
                                                    next[sIdx] = {
                                                      ...next[sIdx],
                                                      unit: e.target.value
                                                    };
                                                    updateRow(row.tempId, {
                                                      sub_components: next
                                                    });
                                                  }}
                                                  className="w-14 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-1.5 py-0.5 text-[11px] font-mono"
                                                />
                                                <input
                                                  type="text"
                                                  value={sub.item_name}
                                                  onChange={(e) => {
                                                    const next = [...row.sub_components];
                                                    next[sIdx] = {
                                                      ...next[sIdx],
                                                      item_name: e.target.value
                                                    };
                                                    updateRow(row.tempId, {
                                                      sub_components: next
                                                    });
                                                  }}
                                                  placeholder="Sub-component name"
                                                  className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-0.5 text-[11px]"
                                                />
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    const next = row.sub_components.filter(
                                                      (_, i) => i !== sIdx
                                                    );
                                                    updateRow(row.tempId, {
                                                      sub_components: next,
                                                      is_composite_set: next.length > 0
                                                    });
                                                  }}
                                                  className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                                                >
                                                  <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 sm:px-6 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-500">
            {selectedRows.length > 0 ? (
              <span>
                Ready to commit <strong>{selectedRows.length}</strong> catalog item(s) in{' '}
                <strong>AED</strong>.
              </span>
            ) : (
              <span>Upload a file or paste text above and click Fast Scan or Deep Scan.</span>
            )}
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={selectedRows.length === 0 || isCommitting}
              onClick={handleCommitImport}
              className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-xs transition cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {isCommitting
                  ? 'Importing to Catalog...'
                  : `✓ Import ${selectedRows.length} Product${selectedRows.length === 1 ? '' : 's'} to Catalog`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
