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
  prepareCatalogFileForAiExtraction,
  canonicalizeCatalogAttributeKey
} from '../utils/aiExtractionClient';
import {
  resolveToAedMultiplier,
  compileDescriptionWithSpecs,
  mergeParentAndVariantAttributes,
  deriveSuggestedVariantLabel
} from './SaveToCatalogModal';
import { safeAddDoc, safeUpdateDoc } from '../firebase';
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
  triggerToast,
  initialExtractedItems,
  initialCurrency
}: AICatalogImporterModalProps) {
  const [selectedModel, setSelectedModel] = useState<string>('auto');
  const [sourceCurrency, setSourceCurrency] = useState<string>(initialCurrency || 'AED');
  const [priceBasisMode, setPriceBasisMode] = useState<'selling' | 'cost_plus_markup'>('selling');
  const [defaultMarkupPct, setDefaultMarkupPct] = useState<number>(25);

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

  const computePricesInAed = (
    rawSell: number,
    rawCost: number,
    curr: string,
    basis: 'selling' | 'cost_plus_markup',
    markupPct: number
  ): { costAed: number; sellAed: number } => {
    const mult = resolveToAedMultiplier(curr || 'AED');
    const cleanSell = Math.max(0, Number(rawSell) || 0);
    const cleanCost = Math.max(0, Number(rawCost) || 0);

    if (basis === 'cost_plus_markup') {
      const baseCostSource = cleanCost > 0 ? cleanCost : cleanSell;
      const costAed = Math.round(baseCostSource * mult * 100) / 100;
      const sellAed =
        cleanCost > 0 && cleanSell > cleanCost
          ? Math.round(cleanSell * mult * 100) / 100
          : Math.round(costAed * (1 + Math.max(0, markupPct) / 100) * 100) / 100;
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
    markupPct: number
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
          markupPct
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
        markupPct
      );

      const derivedVarLabel =
        cleanVariant ||
        (cleanFamily || matchingExistingParent
          ? deriveSuggestedVariantLabel(
              {
                item_name: cleanName,
                model_part_no: cleanModel,
                attributes: it.attributes || []
              },
              matchingExistingParent || {
                name: cleanFamily || cleanName,
                product_type: matchedCat,
                description: cleanName,
                unit: (it.unit || 'Nos') as UnitType
              }
            )
          : '');

      const subComponents: LineItemComponent[] = (it.sub_components || []).map((sc, sIdx) => {
        const rawSubSell = Number(sc.unit_price) || 0;
        const rawSubCost = Number(sc.cost_price) || 0;
        const { costAed: subCostAed, sellAed: subSellAed } = computePricesInAed(
          rawSubSell,
          rawSubCost,
          detectedCurr,
          basis,
          markupPct
        );
        const subQty = sc.quantity || 1;
        return {
          id: `ai_sub_${Date.now()}_${idx}_${sIdx}`,
          sn: String(sIdx + 1),
          item_name: sc.item_name,
          quantity: subQty,
          unit: sc.unit || 'Nos',
          description: sc.description || '',
          brand_make: sc.brand_make || '',
          model_part_no: sc.model_part_no || '',
          unit_price: subSellAed,
          total_price: Math.round(subSellAed * subQty * 100) / 100,
          cost_price: subCostAed,
          is_included_accessory: sc.is_included_accessory !== false,
          attributes: sc.attributes || [],
          _raw_unit_price: rawSubSell,
          _raw_cost_price: rawSubCost
        } as LineItemComponent & { _raw_unit_price?: number; _raw_cost_price?: number };
      });

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
        brand_make: cleanBrand,
        model_part_no: cleanModel,
        sku: cleanSku,
        country_of_origin: (it.country_of_origin || '').trim(),
        hs_code: (it.hs_code || '').trim(),
        unit: (it.unit || (subComponents.length > 0 ? 'SET' : 'Nos')).trim(),
        availability: (it.availability || '').trim(),
        rawSourcePrice,
        rawSourceCost,
        cost_price_aed: costAed,
        unit_price_aed: sellAed,
        description: (it.description || cleanName).trim(),
        attributes: (it.attributes || []).map((a) => ({
          key: canonicalizeCatalogAttributeKey(a.key),
          value: String(a.value || '').trim()
        })),
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
    nextMarkup: number
  ) => {
    setSourceCurrency(nextCurr);
    setPriceBasisMode(nextBasis);
    setDefaultMarkupPct(nextMarkup);
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
              nextMarkup
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
                nextMarkup
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
        const cleanAttrs = row.attributes
          .map((a) => ({ key: a.key.trim(), value: a.value.trim() }))
          .filter((a) => a.key !== '');

        if (row.resolutionMode === 'update_existing' && row.targetExistingProductId) {
          const existingProd = workingProducts.find((p) => p.id === row.targetExistingProductId);
          if (existingProd && existingProd.id) {
            const mergedAttrs = mergeParentAndVariantAttributes(existingProd.attributes, cleanAttrs);
            const updatedProd: Product = {
              ...existingProd,
              name: row.name.trim() || existingProd.name,
              product_type: row.category || existingProd.product_type,
              brand_make: row.brand_make.trim() || existingProd.brand_make,
              model_part_no: row.model_part_no.trim() || existingProd.model_part_no,
              sku: row.sku.trim() || existingProd.sku,
              country_of_origin: row.country_of_origin.trim() || existingProd.country_of_origin,
              hs_code: row.hs_code.trim() || existingProd.hs_code,
              unit: (row.unit || existingProd.unit || 'Nos') as UnitType,
              default_availability: row.availability.trim() || existingProd.default_availability,
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
                row.brand_make.trim() || row.model_part_no.trim()
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
          unit: (row.unit || parentProd?.unit || (row.is_composite_set ? 'SET' : 'Nos')) as UnitType,
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
          {/* 1. Source Input & AI Controls Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 bg-slate-50/80 dark:bg-slate-950/50 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-4">
            {/* Left: File Dropzone */}
            <div className="lg:col-span-5 flex flex-col justify-between gap-3">
              <div>
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
                  className="border-2 border-dashed border-indigo-200 dark:border-indigo-800/70 hover:border-indigo-500 bg-white dark:bg-slate-900 rounded-xl p-4 text-center cursor-pointer transition flex flex-col items-center justify-center min-h-[126px]"
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

              {/* Model & Currency Controls */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-mono uppercase font-bold text-slate-500 mb-1">
                    AI Engine
                  </label>
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100"
                  >
                    {AVAILABLE_GEMINI_MODELS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-mono uppercase font-bold text-slate-500 mb-1">
                    Source Currency → AED
                  </label>
                  <select
                    value={sourceCurrency}
                    onChange={(e) =>
                      handleRecalculateAllCurrencyAndMarkup(
                        e.target.value,
                        priceBasisMode,
                        defaultMarkupPct
                      )
                    }
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-mono font-bold text-slate-800 dark:text-slate-100"
                  >
                    {SOURCE_CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c} {c !== 'AED' ? `(×${resolveToAedMultiplier(c)} to AED)` : '(Base AED)'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Right: Persistent Editable Paste Textarea & Scan Triggers */}
            <div className="lg:col-span-7 flex flex-col justify-between gap-2.5">
              <div>
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
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-xs font-mono text-slate-800 dark:text-slate-100 focus:outline-none focus:border-indigo-500 resize-y"
                />
              </div>

              {/* Price Basis & Action Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="inline-flex rounded-xl bg-slate-200/70 dark:bg-slate-800 p-0.5 text-[11px] font-semibold">
                    <button
                      type="button"
                      onClick={() =>
                        handleRecalculateAllCurrencyAndMarkup(
                          sourceCurrency,
                          'selling',
                          defaultMarkupPct
                        )
                      }
                      className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
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
                          defaultMarkupPct
                        )
                      }
                      className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                        priceBasisMode === 'cost_plus_markup'
                          ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-2xs'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      Source = Cost Prices (+Markup)
                    </button>
                  </div>

                  {priceBasisMode === 'cost_plus_markup' && (
                    <div className="inline-flex items-center gap-1 bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 rounded-xl px-2 py-1">
                      <span className="text-[10px] font-mono font-bold text-indigo-700 dark:text-indigo-300">
                        Markup %:
                      </span>
                      <input
                        type="number"
                        step="1"
                        value={defaultMarkupPct}
                        onChange={(e) =>
                          handleRecalculateAllCurrencyAndMarkup(
                            sourceCurrency,
                            'cost_plus_markup',
                            Number(e.target.value) || 0
                          )
                        }
                        className="w-12 text-xs font-mono font-bold text-slate-900 dark:text-slate-100 focus:outline-none text-right"
                      />
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {rawPasteText.trim() && stagedRows.length > 0 && (
                    <button
                      type="button"
                      disabled={isScanning}
                      onClick={() => void runAiCatalogScan('fast', null, rawPasteText)}
                      className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-100 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
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
                    className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-xs transition cursor-pointer disabled:opacity-50"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>⚡ Fast Scan</span>
                  </button>
                  <button
                    type="button"
                    disabled={isScanning}
                    onClick={() => void runAiCatalogScan('deep')}
                    className="px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-indigo-950 dark:hover:bg-indigo-900 text-white text-xs font-bold inline-flex items-center gap-1.5 border border-slate-800 dark:border-indigo-700 transition cursor-pointer disabled:opacity-50"
                    title="Deep reasoning scan for dense multi-model datasheet tables"
                  >
                    <span>🧠 Deep Scan</span>
                  </button>
                </div>
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
                        <th className="py-2.5 px-3 w-[250px]">Catalog Resolution Mode</th>
                        <th className="py-2.5 px-3">Product Name &amp; Variant Label</th>
                        <th className="py-2.5 px-3 w-[145px]">Category</th>
                        <th className="py-2.5 px-3 w-[150px]">Brand / Model / SKU</th>
                        <th className="py-2.5 px-3 w-[185px]">Unit / Cost &amp; Sell (AED)</th>
                        <th className="py-2.5 px-3 w-[125px] text-right">Specs &amp; BOM</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                      {stagedRows.map((row) => {
                        const isExpanded = expandedRowId === row.tempId;
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
                              </td>

                              {/* Category */}
                              <td className="py-2.5 px-3 align-top space-y-1">
                                <input
                                  type="text"
                                  list="ai-catalog-categories-datalist"
                                  value={row.category}
                                  onChange={(e) =>
                                    updateRow(row.tempId, { category: e.target.value })
                                  }
                                  placeholder="Category"
                                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-[11px] font-semibold text-slate-800 dark:text-slate-100"
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

                              {/* Brand / Model / SKU */}
                              <td className="py-2.5 px-3 align-top space-y-1">
                                <input
                                  type="text"
                                  value={row.brand_make}
                                  onChange={(e) =>
                                    updateRow(row.tempId, { brand_make: e.target.value })
                                  }
                                  placeholder="Brand / Make"
                                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-0.5 text-[11px] font-semibold text-slate-800 dark:text-slate-100"
                                />
                                <div className="grid grid-cols-2 gap-1">
                                  <input
                                    type="text"
                                    value={row.model_part_no}
                                    onChange={(e) =>
                                      updateRow(row.tempId, { model_part_no: e.target.value })
                                    }
                                    placeholder="Model"
                                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-1.5 py-0.5 text-[10.5px] font-mono text-slate-700 dark:text-slate-300"
                                  />
                                  <input
                                    type="text"
                                    value={row.sku}
                                    onChange={(e) => updateRow(row.tempId, { sku: e.target.value })}
                                    placeholder="SKU"
                                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-1.5 py-0.5 text-[10.5px] font-mono text-slate-700 dark:text-slate-300"
                                  />
                                </div>
                              </td>

                              {/* Unit, Cost (AED) & Selling Price (AED) */}
                              <td className="py-2.5 px-3 align-top space-y-1">
                                <div className="flex items-center gap-1">
                                  <select
                                    value={row.unit}
                                    onChange={(e) =>
                                      updateRow(row.tempId, { unit: e.target.value })
                                    }
                                    className="w-16 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-1 py-0.5 text-[10.5px] font-semibold"
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
                                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-0.5 text-[11px] font-mono font-bold text-slate-900 dark:text-slate-100"
                                    />
                                  </div>
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className="text-[9.5px] font-mono text-slate-400 w-16">
                                    Cost AED:
                                  </span>
                                  <input
                                    type="number"
                                    step="any"
                                    value={row.cost_price_aed}
                                    onChange={(e) =>
                                      updateRow(row.tempId, {
                                        cost_price_aed: Number(e.target.value) || 0
                                      })
                                    }
                                    placeholder="Cost AED"
                                    className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-0.5 text-[10.5px] font-mono text-slate-600 dark:text-slate-300"
                                  />
                                </div>
                              </td>

                              {/* Expandable Specs & BOM Pills */}
                              <td className="py-2.5 px-3 align-top text-right space-y-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedRowId((prev) =>
                                      prev === row.tempId ? null : row.tempId
                                    )
                                  }
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-[10.5px] font-mono font-bold cursor-pointer"
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

                            {/* Expanded Attributes & BOM Sub-Components Drawer */}
                            {isExpanded && (
                              <tr className="bg-slate-50/90 dark:bg-slate-950/70">
                                <td colSpan={7} className="p-3.5 space-y-3 border-t border-slate-200/70 dark:border-slate-800">
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
