import React, { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import { lazyWithRetry, ModalLoadingFallback } from '../utils/lazyWithRetry';
import {
  Product,
  ProductType,
  UnitType,
  ProductAttribute,
  CATEGORY_SUGGESTED_ATTRIBUTES,
  Workspace,
  DropdownOption,
  Company,
  StockMovement,
  GrnReceiptData,
  StockAdjustmentData,
  StockAdjustmentMode,
  Attachment,
  LineItemComponent,
  ImageAdjustmentConfig
} from '../types';
import { db, safeAddDoc, safeUpdateDoc } from '../firebase';
import { writeBatch, doc, collection, deleteField } from 'firebase/firestore';
import { MetadataRepository } from '../services/repositories/MetadataRepository';
import { generateProductSearchTerms } from '../utils/defaults';
import { UNIVERSAL_UNITS, UNIVERSAL_CATEGORIES } from '../constants';
import { processStockGrn, processStockAdjustment, subscribeStockMovements } from '../services/inventoryService';
import { uploadWorkspaceMediaAsset, deleteFromStorageBucket, formatByteSize, sanitizeFirestorePayload } from '../services/attachmentStorage';
import CompositePackageEditor from './quotations/CompositePackageEditor';
import { recalculateCompositeItemTotals } from '../utils/compositeBomUtils';
import {
  formatSiTechnicalValue,
  normalizeCatalogUnit,
  normalizeLeadTime,
  cleanProductAttributesWithRescuedFields
} from '../utils/siUnitFormatter';
import LineItemImageOptionsPopover from './common/LineItemImageOptionsPopover';
import ImageLightboxModal from './common/ImageLightboxModal';
import {
  Package,
  Plus,
  Search,
  Edit2,
  Trash2,
  X,
  Layers,
  RotateCcw,
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Boxes,
  ArrowDownToLine,
  History,
  FileText,
  CheckCircle2,
  Globe,
  Copy,
  Sliders,
  Image as ImageIcon,
  UploadCloud,
  ExternalLink,
  Paperclip,
  Tag,
  Clock,
  Sparkles,
  Cloud,
  HardDrive,
  ShoppingBag,
  GitFork,
  Link2,
  Unlink,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal
} from 'lucide-react';
import HoverScrollText from './common/HoverScrollText';
import { PageHeader, PageBody, KpiStatCard } from './layout/UiContainer';
import {
  filterActiveCatalogProducts,
  getProductStockOnHand,
  getProductAvailableStock,
  getProductReorderLevel,
  isProductLowStock
} from '../utils/inventoryMetrics';
import {
  buildCatalogVariantAnalysisMap,
  resolveProductFamilyKey,
  resolveProductFamilyDisplayName
} from '../utils/productVariantFormat';
import {
  ParentSyncFieldKey,
  ALL_PARENT_SYNC_FIELDS,
  BulkVariantMatrixRow,
  COMMON_DIFFERENTIATING_SPEC_KEYS,
  suggestParentBaseSku,
  buildSmartVariantSku,
  deduplicateSku,
  detectProtectedVariantSpecKeys,
  isProtectedVariantSpecKey,
  getDefaultSelectedParentSyncFields,
  buildParentToVariantSyncPatch,
  detectDefaultDifferentiatingSpecKey,
  recomputeBulkVariantMatrixSkus,
  parseBulkVariantPasteLines,
  omitUndefinedDeep,
  splitFirestoreSyncPatch
} from '../utils/catalogVariantUtils';
import {
  compileDescriptionWithSpecs,
  resolveEffectiveCatalogProduct,
  mergeParentAndVariantAttributes,
  deriveSuggestedVariantLabel,
  resolveToAedMultiplier
} from './SaveToCatalogModal';
import {
  AVAILABLE_GEMINI_MODELS,
  ExtractedCatalogProductItem,
  extractCatalogProductsWithAI,
  prepareCatalogFileForAiExtraction
} from '../utils/aiExtractionClient';
const AICatalogImporterModal = lazyWithRetry(() => import('./AICatalogImporterModal'));
import { canManageWorkspace, isAdmin } from '../utils/permissions';

const UNIVERSAL_QUICK_ATTRIBUTES = [
  'Dimensions / Size',
  'MOC',
  'Capacity / Rating',
  'Operating Pressure',
  'Power / Voltage',
  'Connection / Standard',
  'Color / Finish',
  'Warranty'
];

const AVAILABILITY_PRESETS = [
  'Ex-Stock',
  'Ready for Dispatch',
  '1-2 Weeks',
  '2-3 Weeks',
  '4-6 Weeks',
  '6-8 Weeks',
  '8-10 Weeks',
  'Made to Order'
];

interface ProductManagerProps {
  key?: any;
  products: Product[];
  productCategories?: string[];
  units?: string[];
  user: any;
  setProducts?: React.Dispatch<React.SetStateAction<Product[]>>;
  setProductCategories?: React.Dispatch<React.SetStateAction<DropdownOption[]>>;
  setUnits?: React.Dispatch<React.SetStateAction<DropdownOption[]>>;
  activeWorkspace?: Workspace;
  setWorkspaces?: React.Dispatch<React.SetStateAction<Workspace[]>>;
  onOpenMobileMenu?: () => void;
  onOpenProcurement?: () => void;
  companies?: Company[];
  triggerToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export default function ProductManager({
  products,
  productCategories: propCategories,
  units: propUnits,
  user,
  setProducts,
  setProductCategories,
  setUnits,
  activeWorkspace,
  setWorkspaces,
  onOpenMobileMenu,
  onOpenProcurement,
  companies,
  triggerToast
}: ProductManagerProps) {
  const [searchInput, setSearchInput] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [brandFilter, setBrandFilter] = useState<string>('All');
  const [stockFilter, setStockFilter] = useState<'All' | 'Tracked' | 'LowStock' | 'WithDatasheet' | 'CompositeKit'>('All');
  const [groupVariantsByFamily, setGroupVariantsByFamily] = useState<boolean>(true);
  const [isToolsDropdownOpen, setIsToolsDropdownOpen] = useState<boolean>(false);
  const toolsDropdownRef = useRef<HTMLDivElement | null>(null);
  const [workspaceCatalogGuidelines, setWorkspaceCatalogGuidelines] = useState<string>(
    activeWorkspace?.catalog_ai_guidelines || ''
  );

  useEffect(() => {
    if (!isToolsDropdownOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (toolsDropdownRef.current && !toolsDropdownRef.current.contains(e.target as Node)) {
        setIsToolsDropdownOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsToolsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isToolsDropdownOpen]);

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
    setWorkspaceCatalogGuidelines(resolvedRules);
  }, [activeWorkspace?.id, activeWorkspace?.catalog_ai_guidelines]);

  // Inline Category & Unit Creation States
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const [isCreatingUnit, setIsCreatingUnit] = useState(false);
  const [newUnitInput, setNewUnitInput] = useState('');

  // Form Modal States (Organized 3-Tab Modal)
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showFormModal, setShowFormModal] = useState(false);
  const [activeFormTab, setActiveFormTab] = useState<'overview' | 'specs_media' | 'inventory'>('overview');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formVariantParentId, setFormVariantParentId] = useState<string | null>(null);
  const [formVariantLabel, setFormVariantLabel] = useState<string>('');
  const [formProductFamily, setFormProductFamily] = useState<string>('');
  const [showVariantLinkEditor, setShowVariantLinkEditor] = useState<boolean>(false);
  const [showSecondaryLogisticsFields, setShowSecondaryLogisticsFields] = useState<boolean>(false);
  const [quickLinkVariantTargetId, setQuickLinkVariantTargetId] = useState<string | null>(null);
  const [quickLinkParentSearch, setQuickLinkParentSearch] = useState<string>('');

  // Tab 1: Overview & Pricing
  const [formName, setFormName] = useState('');
  const [formProductType, setFormProductType] = useState<string>('');
  const [formSku, setFormSku] = useState('');
  const [formBrandMake, setFormBrandMake] = useState('');
  const [formModelPartNo, setFormModelPartNo] = useState('');
  const [formDefaultAvailability, setFormDefaultAvailability] = useState('');
  const [formUnit, setFormUnit] = useState<string>('');
  const [formUnitPrice, setFormUnitPrice] = useState<number | undefined>(undefined);
  const [formCostPrice, setFormCostPrice] = useState<number | undefined>(undefined);
  const [formIsCompositeSet, setFormIsCompositeSet] = useState<boolean>(false);
  const [formSubComponents, setFormSubComponents] = useState<LineItemComponent[]>([]);
  const [formPackagePricingMode, setFormPackagePricingMode] = useState<'itemized' | 'lump_sum'>('itemized');
  const [formOptionScopeNotes, setFormOptionScopeNotes] = useState<string>('');

  // Tab 2: Specs, Image & Datasheet
  const [formDescription, setFormDescription] = useState('');
  const [formAttributes, setFormAttributes] = useState<ProductAttribute[]>([]);
  const [formImageUrl, setFormImageUrl] = useState<string>('');
  const [formSecondaryImageUrl, setFormSecondaryImageUrl] = useState<string>('');
  const [formImageCaption, setFormImageCaption] = useState<string>('');
  const [formSecondaryImageCaption, setFormSecondaryImageCaption] = useState<string>('');
  const [formImageAdjustments, setFormImageAdjustments] = useState<ImageAdjustmentConfig | undefined>(undefined);
  const [lightboxProduct, setLightboxProduct] = useState<Product | null>(null);
  const [formDatasheetAttachment, setFormDatasheetAttachment] = useState<Attachment | undefined>(undefined);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageUploadProgress, setImageUploadProgress] = useState<number | null>(null);
  const [isUploadingDatasheet, setIsUploadingDatasheet] = useState(false);
  const [datasheetUploadProgress, setDatasheetUploadProgress] = useState<number | null>(null);
  const [pendingDeletedStorageUrls, setPendingDeletedStorageUrls] = useState<string[]>([]);

  // Tab 3: Inventory & Logistics
  const [formIsInventoried, setFormIsInventoried] = useState<boolean>(false);
  const [formStockOnHand, setFormStockOnHand] = useState<number | undefined>(0);
  const [formReorderLevel, setFormReorderLevel] = useState<number | undefined>(0);
  const [formStorageLocation, setFormStorageLocation] = useState<string>('');
  const [formHsCode, setFormHsCode] = useState<string>('');
  const [formCountryOfOrigin, setFormCountryOfOrigin] = useState<string>('');
  const [formGrossWeightKg, setFormGrossWeightKg] = useState<number | undefined>(undefined);

  // Confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    confirmText?: string;
    cancelText?: string;
    isDestructive?: boolean;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState<number | 'All'>(25);

  const isEditable = user?.role !== 'Viewer';
  const canViewConfidentialMargins =
    canManageWorkspace(user, activeWorkspace) ||
    isAdmin(user, activeWorkspace?.id, activeWorkspace);

  // Inbound GRN Modal State
  const [showGrnModal, setShowGrnModal] = useState(false);
  const [grnNumber, setGrnNumber] = useState('');
  const [grnDate, setGrnDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [grnProductId, setGrnProductId] = useState('');
  const [grnQuantity, setGrnQuantity] = useState<number | string>('');
  const [grnUnitCost, setGrnUnitCost] = useState<number | string>('');
  const [grnUpdateCost, setGrnUpdateCost] = useState(false);
  const [grnSupplierName, setGrnSupplierName] = useState('');
  const [grnSupplierId, setGrnSupplierId] = useState('');
  const [grnDeliveryNote, setGrnDeliveryNote] = useState('');
  const [grnStorageLocation, setGrnStorageLocation] = useState('');
  const [grnNotes, setGrnNotes] = useState('');
  const [grnSubmitting, setGrnSubmitting] = useState(false);
  const [grnFeedback, setGrnFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isGrnProductPickerOpen, setIsGrnProductPickerOpen] = useState(false);
  const [grnProductSearch, setGrnProductSearch] = useState('');

  // Quick Stock Adjustment Modal State
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustProductId, setAdjustProductId] = useState('');
  const [adjustMode, setAdjustMode] = useState<StockAdjustmentMode>('RECOUNT');
  const [adjustQty, setAdjustQty] = useState<number | string>('');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustRef, setAdjustRef] = useState('');
  const [adjustStorageLocation, setAdjustStorageLocation] = useState('');
  const [adjustUnitCost, setAdjustUnitCost] = useState<number | string>('');
  const [adjustSubmitting, setAdjustSubmitting] = useState(false);
  const [adjustFeedback, setAdjustFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isAdjustProductPickerOpen, setIsAdjustProductPickerOpen] = useState(false);
  const [adjustProductSearch, setAdjustProductSearch] = useState('');

  // Stock Movement Ledger State
  const [showLedgerModal, setShowLedgerModal] = useState(false);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [movementsSearch, setMovementsSearch] = useState('');
  const [movementsTypeFilter, setMovementsTypeFilter] = useState<string>('All');
  const [isLoadingMovements, setIsLoadingMovements] = useState(false);
  const [collapsedParentIds, setCollapsedParentIds] = useState<Record<string, boolean>>({});
  const variantLabelInputRef = useRef<HTMLInputElement | null>(null);

  // Smart Auto-SKU & Controlled Parent -> Variant Sync State
  const [isSkuAutoManaged, setIsSkuAutoManaged] = useState<boolean>(false);
  const [showParentSyncModal, setShowParentSyncModal] = useState<boolean>(false);
  const [selectedParentSyncFields, setSelectedParentSyncFields] = useState<ParentSyncFieldKey[]>([]);
  const [isSyncingVariants, setIsSyncingVariants] = useState<boolean>(false);

  // Bulk Variant Matrix (Quick-Add Multiple Sizes / Models) State
  const [showBulkVariantMatrixModal, setShowBulkVariantMatrixModal] = useState<boolean>(false);
  const [bulkVariantSpecKey, setBulkVariantSpecKey] = useState<string>('Dimensions');
  const [bulkVariantRows, setBulkVariantRows] = useState<BulkVariantMatrixRow[]>([]);
  const [showBulkPastePanel, setShowBulkPastePanel] = useState<boolean>(false);
  const [bulkPasteText, setBulkPasteText] = useState<string>('');
  const [isSavingBulkVariants, setIsSavingBulkVariants] = useState<boolean>(false);

  // AI Bulk Catalog Importer Modal State
  const [showAiCatalogModal, setShowAiCatalogModal] = useState<boolean>(false);
  const [aiModalInitialItems, setAiModalInitialItems] = useState<ExtractedCatalogProductItem[] | undefined>(undefined);
  const [aiModalInitialCurrency, setAiModalInitialCurrency] = useState<string | undefined>(undefined);

  // Single-Product / Datasheet AI Autofill Bar State (inside Add/Edit Product Modal)
  const [showFormAiAutofill, setShowFormAiAutofill] = useState<boolean>(false);
  const [formAiRawText, setFormAiRawText] = useState<string>('');
  const [formAiFile, setFormAiFile] = useState<File | null>(null);
  const [formAiModel, setFormAiModel] = useState<string>('auto');
  const [formAiLoading, setFormAiLoading] = useState<boolean>(false);
  const [formAiStatus, setFormAiStatus] = useState<string>('');
  const [formAiDetectedVariants, setFormAiDetectedVariants] = useState<ExtractedCatalogProductItem[]>([]);
  const [formAiDetectedCurrency, setFormAiDetectedCurrency] = useState<string>('AED');
  const [formAiSelectedVariantIdx, setFormAiSelectedVariantIdx] = useState<number>(0);
  const formAiFileInputRef = useRef<HTMLInputElement | null>(null);

  // Realtime subscription for stock movements ledger when modal is opened
  useEffect(() => {
    if (!showLedgerModal || !activeWorkspace?.id) return;
    setIsLoadingMovements(true);
    const unsub = subscribeStockMovements(activeWorkspace.id, (list) => {
      setMovements(list);
      setIsLoadingMovements(false);
    });
    return () => unsub();
  }, [showLedgerModal, activeWorkspace?.id]);

  const productCategories: string[] = useMemo(() => {
    const fromProps = propCategories && propCategories.length > 0 ? propCategories : [];
    const fromProducts = products.filter((p) => !p.is_deleted && p.product_type).map((p) => p.product_type);
    const activeCat = formProductType ? [formProductType] : [];
    return Array.from(new Set([...activeCat, ...UNIVERSAL_CATEGORIES, ...fromProps, ...fromProducts])).filter((c) => {
      const l = c.toLowerCase();
      return l !== 'anthrecite' && l !== 'anthresite';
    });
  }, [propCategories, products, formProductType]);

  const units: string[] = useMemo(() => {
    const fromProps = propUnits && propUnits.length > 0 ? propUnits : [];
    const fromProducts = products
      .filter((p) => !p.is_deleted && p.unit && p.unit !== 'Custom Unit')
      .map((p) => p.unit);
    const activeU = formUnit && formUnit !== 'Custom Unit' ? [formUnit] : [];
    return Array.from(new Set([...activeU, 'Nos', 'SET', 'Set', 'Pcs', ...UNIVERSAL_UNITS, ...fromProps, ...fromProducts]));
  }, [propUnits, products, formUnit]);

  // Dynamic workspace & category attribute suggestions (SaaS multi-tenant friendly)
  const suggestedAttributeChips = useMemo(() => {
    const categoryUsedKeys = new Set<string>();
    products
      .filter((p) => !p.is_deleted && (!formProductType || p.product_type === formProductType))
      .forEach((p) => {
        (p.attributes || []).forEach((attr) => {
          if (attr.key && attr.key.trim()) {
            categoryUsedKeys.add(attr.key.trim());
          }
        });
      });

    const knownCategorySuggestions = formProductType ? CATEGORY_SUGGESTED_ATTRIBUTES[formProductType] || [] : [];
    const normalizedCandidates = [
      ...Array.from(categoryUsedKeys),
      ...knownCategorySuggestions,
      ...UNIVERSAL_QUICK_ATTRIBUTES
    ].map((k) => (/^material(\s*\/\s*grade)?$/i.test(k.trim()) ? 'MOC' : k.trim()));
    const merged = Array.from(new Set(normalizedCandidates));
    const existingKeysLower = new Set(formAttributes.map((a) => a.key.trim().toLowerCase()));
    return merged.filter((k) => !existingKeysLower.has(k.toLowerCase())).slice(0, 12);
  }, [products, formProductType, formAttributes]);

  const activeCatalogProducts = useMemo(() => {
    return filterActiveCatalogProducts(products);
  }, [products]);

  const variantAnalysisMap = useMemo(() => {
    return buildCatalogVariantAnalysisMap(activeCatalogProducts);
  }, [activeCatalogProducts]);

  const variantFamilyCount = useMemo(() => {
    const familiesWithMultiple = new Set<string>();
    variantAnalysisMap.forEach((info) => {
      if (info.isVariant) familiesWithMultiple.add(info.familyKey);
    });
    return familiesWithMultiple.size;
  }, [variantAnalysisMap]);

  const inventoriedProducts = useMemo(() => {
    return activeCatalogProducts.filter((p) => Boolean(p.is_inventoried));
  }, [activeCatalogProducts]);

  // Shared stock metrics & Low-Stock predicate from ../utils/inventoryMetrics (100% parity with Dashboard)
  const lowStockProducts = useMemo(() => {
    return activeCatalogProducts.filter((p) => isProductLowStock(p));
  }, [activeCatalogProducts]);

  const totalStockOnHand = useMemo(() => {
    return activeCatalogProducts.reduce((acc, p) => acc + getProductStockOnHand(p), 0);
  }, [activeCatalogProducts]);

  const availableBrands = useMemo(() => {
    const brandSet = new Set<string>();
    for (const p of activeCatalogProducts) {
      const b = (p.brand_make || '').trim();
      if (b) brandSet.add(b);
    }
    return Array.from(brandSet).sort((a, b) => a.localeCompare(b));
  }, [activeCatalogProducts]);

  const stockTabCounts = useMemo(() => {
    let compositeKit = 0;
    let withDatasheet = 0;
    for (const p of activeCatalogProducts) {
      if (p.is_composite_set && p.sub_components && p.sub_components.length > 0) compositeKit += 1;
      if (p.datasheet_attachment?.url) withDatasheet += 1;
    }
    return {
      All: activeCatalogProducts.length,
      CompositeKit: compositeKit,
      Tracked: inventoriedProducts.length,
      LowStock: lowStockProducts.length,
      WithDatasheet: withDatasheet
    };
  }, [activeCatalogProducts, inventoriedProducts.length, lowStockProducts.length]);

  const selectedGrnProduct = useMemo(() => {
    return activeCatalogProducts.find((p) => p.id === grnProductId) || null;
  }, [activeCatalogProducts, grnProductId]);

  const selectedAdjustProduct = useMemo(() => {
    return activeCatalogProducts.find((p) => p.id === adjustProductId) || null;
  }, [activeCatalogProducts, adjustProductId]);

  const filteredMovements = useMemo(() => {
    return movements.filter((m) => {
      if (movementsTypeFilter !== 'All' && m.movement_type !== movementsTypeFilter) {
        return false;
      }
      if (movementsSearch.trim()) {
        const query = movementsSearch.toLowerCase();
        const linkedProd = products.find((p) => p.id === m.product_id);
        const prod = (
          m.product_name ||
          linkedProd?.name ||
          linkedProd?.description ||
          ''
        ).toLowerCase();
        const ref = (m.reference_number || m.reference_id || '').toLowerCase();
        const dn = (m.delivery_note_ref || '').toLowerCase();
        const sup = (m.supplier_name || '').toLowerCase();
        const notes = (m.reason_notes || '').toLowerCase();
        return prod.includes(query) || ref.includes(query) || dn.includes(query) || sup.includes(query) || notes.includes(query);
      }
      return true;
    });
  }, [movements, movementsTypeFilter, movementsSearch, products]);

  // Live Gross Margin & Markup Calculation for Modal
  const livePricingMetrics = useMemo(() => {
    const sell = typeof formUnitPrice === 'number' && !isNaN(formUnitPrice) ? formUnitPrice : 0;
    const cost = typeof formCostPrice === 'number' && !isNaN(formCostPrice) ? formCostPrice : 0;
    if (sell <= 0 || cost <= 0) return null;
    const profit = sell - cost;
    const marginPct = (profit / sell) * 100;
    const markupPct = (profit / cost) * 100;
    return {
      profit,
      marginPct,
      markupPct
    };
  }, [formUnitPrice, formCostPrice]);

  const resolveSavedProductCostForGrn = (p?: Product | null): number | string => {
    if (!p) return '';
    if (p.cost_price != null && Number(p.cost_price) > 0) {
      return Number(p.cost_price);
    }
    if (p.last_landed_cost != null && Number(p.last_landed_cost) > 0) {
      return Number(p.last_landed_cost);
    }
    return '';
  };

  // Open Inbound GRN Modal (supports any product, auto-enables tracking if untracked)
  const openGrnModal = (prod?: Product) => {
    const year = new Date().getFullYear();
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    setGrnNumber(`GRN-${year}-${randomSuffix}`);
    setGrnDate(new Date().toISOString().split('T')[0]);
    setGrnFeedback(null);
    setGrnQuantity('');
    setGrnDeliveryNote('');
    setGrnSupplierName('');
    setGrnSupplierId('');
    setGrnNotes('');
    setGrnUpdateCost(false);
    setIsGrnProductPickerOpen(false);
    setGrnProductSearch('');

    const target = prod || inventoriedProducts[0] || activeCatalogProducts[0];
    if (target) {
      setGrnProductId(target.id || '');
      setGrnUnitCost(resolveSavedProductCostForGrn(target));
      setGrnStorageLocation(target.storage_location || '');
    } else {
      setGrnProductId('');
      setGrnUnitCost('');
      setGrnStorageLocation('');
    }
    setShowGrnModal(true);
  };

  const handleGrnProductChange = (productId: string) => {
    setGrnProductId(productId);
    setIsGrnProductPickerOpen(false);
    const p = activeCatalogProducts.find((item) => item.id === productId);
    if (p) {
      setGrnUnitCost(resolveSavedProductCostForGrn(p));
      setGrnStorageLocation(p.storage_location || '');
    } else {
      setGrnUnitCost('');
      setGrnStorageLocation('');
    }
  };

  const handleSubmitGrn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!grnProductId) {
      setGrnFeedback({ type: 'error', message: 'Please select a catalog product.' });
      return;
    }
    const qty = Number(grnQuantity);
    if (!qty || qty <= 0) {
      setGrnFeedback({ type: 'error', message: 'Received quantity must be at least 1.' });
      return;
    }
    if (!grnNumber.trim()) {
      setGrnFeedback({ type: 'error', message: 'GRN Number is required.' });
      return;
    }

    const prod = activeCatalogProducts.find((p) => p.id === grnProductId);
    if (!prod) {
      setGrnFeedback({ type: 'error', message: 'Selected product was not found.' });
      return;
    }

    const unitCostNum = Number(grnUnitCost) || 0;
    const wsId = activeWorkspace?.id || 'default';

    setGrnSubmitting(true);
    setGrnFeedback(null);

    const payload: GrnReceiptData = {
      workspace_id: wsId,
      grn_number: grnNumber.trim(),
      received_date: grnDate,
      supplier_id: grnSupplierId && grnSupplierId !== '__custom__' ? grnSupplierId : undefined,
      supplier_name: grnSupplierName.trim() || 'Vendor',
      delivery_note_ref: grnDeliveryNote.trim(),
      product_id: prod.id!,
      product_name: prod.name || prod.description,
      quantity: qty,
      unit_cost: unitCostNum,
      storage_location: grnStorageLocation.trim() || undefined,
      update_cost_price: grnUpdateCost,
      notes: grnNotes.trim() || undefined
    };

    const res = await processStockGrn(payload, user);
    setGrnSubmitting(false);

    if (res.success) {
      if (setProducts) {
        setProducts((prev) =>
          prev.map((item) => {
            if (item.id === prod.id) {
              return {
                ...item,
                is_inventoried: true,
                stock_on_hand: (item.stock_on_hand || 0) + qty,
                last_landed_cost: unitCostNum > 0 ? unitCostNum : item.last_landed_cost,
                last_grn_ref: grnNumber.trim(),
                cost_price: grnUpdateCost && unitCostNum > 0 ? unitCostNum : item.cost_price,
                storage_location: grnStorageLocation.trim() || item.storage_location
              };
            }
            return item;
          })
        );
      }

      setGrnFeedback({
        type: 'success',
        message: `Received ${qty} ${prod.unit || 'units'} into stock for ${prod.name || prod.description} (GRN: ${grnNumber}).`
      });
      if (triggerToast) {
        triggerToast(`Received ${qty} ${prod.unit || 'units'} for "${prod.name || prod.description}"`, 'success');
      }

      setTimeout(() => {
        setShowGrnModal(false);
      }, 1100);
    } else {
      setGrnFeedback({
        type: 'error',
        message: res.error || 'Failed to process GRN. Please check fields and try again.'
      });
    }
  };

  // Open Quick Stock Adjustment Modal
  const openAdjustModal = (prod?: Product) => {
    const target = prod || inventoriedProducts[0] || activeCatalogProducts[0];
    const nowDate = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    setAdjustRef(`ADJ-${nowDate}-${Math.floor(1000 + Math.random() * 9000)}`);
    setAdjustFeedback(null);
    setAdjustReason('');
    setIsAdjustProductPickerOpen(false);
    setAdjustProductSearch('');
    if (target) {
      setAdjustProductId(target.id || '');
      const isUntrackedOrZero = !target.is_inventoried || (target.stock_on_hand || 0) === 0;
      setAdjustMode(isUntrackedOrZero ? 'OPENING_STOCK' : 'RECOUNT');
      setAdjustQty(target.stock_on_hand ?? 0);
      setAdjustStorageLocation(target.storage_location || '');
      setAdjustUnitCost(target.cost_price ?? '');
    } else {
      setAdjustProductId('');
      setAdjustMode('RECOUNT');
      setAdjustQty('');
      setAdjustStorageLocation('');
      setAdjustUnitCost('');
    }
    setShowAdjustModal(true);
  };

  const renderSearchableStockProductPicker = (params: {
    selectedProduct: Product | null;
    isOpen: boolean;
    setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
    searchQuery: string;
    setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
    onSelectProduct: (productId: string) => void;
    placeholderText: string;
  }) => {
    const {
      selectedProduct,
      isOpen,
      setIsOpen,
      searchQuery,
      setSearchQuery,
      onSelectProduct,
      placeholderText
    } = params;

    const q = searchQuery.trim().toLowerCase();
    const filteredList = activeCatalogProducts.filter((p) => {
      if (!q) return true;
      const nameStr = (p.name || p.description || '').toLowerCase();
      const variantStr = String((p as any).variant_label || '').toLowerCase();
      const skuStr = (p.sku || '').toLowerCase();
      const modelStr = (p.model_part_no || '').toLowerCase();
      const brandStr = (p.brand_make || '').toLowerCase();
      return (
        nameStr.includes(q) ||
        variantStr.includes(q) ||
        skuStr.includes(q) ||
        modelStr.includes(q) ||
        brandStr.includes(q)
      );
    });

    const getCleanProductMeta = (p: Product) => {
      const rawTitle = (p.name || p.description || 'Unnamed Product').split('\n')[0].trim();
      const variantPill = String((p as any).variant_label || '').trim();
      const skuOrModel = (p.sku || p.model_part_no || '').trim();
      const brand = (p.brand_make || '').trim();
      const secondaryParts = [skuOrModel ? `SKU: ${skuOrModel}` : '', brand].filter(Boolean);
      return {
        title: rawTitle,
        variantPill,
        secondaryText: secondaryParts.join(' · ')
      };
    };

    const selectedMeta = selectedProduct ? getCleanProductMeta(selectedProduct) : null;

    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 focus:border-blue-500 rounded-xl py-2 px-3 text-left flex items-center justify-between gap-2 transition cursor-pointer"
        >
          {selectedProduct && selectedMeta ? (
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                  {selectedMeta.title}
                </span>
                {selectedMeta.variantPill && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200/80 dark:border-purple-800/60 shrink-0">
                    {selectedMeta.variantPill}
                  </span>
                )}
              </div>
              {selectedMeta.secondaryText && (
                <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate mt-0.5">
                  {selectedMeta.secondaryText}
                </div>
              )}
            </div>
          ) : (
            <span className="text-xs font-medium text-slate-400 dark:text-slate-500">
              {placeholderText}
            </span>
          )}
          <div className="flex items-center gap-2 shrink-0">
            {selectedProduct && (
              <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                {selectedProduct.stock_on_hand || 0} {selectedProduct.unit || 'Nos'}
              </span>
            )}
            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </div>
        </button>

        {isOpen && (
          <div className="absolute left-0 right-0 mt-1.5 z-50 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden">
            <div className="p-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-slate-400 shrink-0 ml-1" />
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by product name, variant, SKU, or brand..."
                className="w-full bg-transparent text-xs font-medium text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
              {filteredList.length === 0 ? (
                <div className="py-6 px-4 text-center text-xs text-slate-400 dark:text-slate-500">
                  No catalog products match "{searchQuery}"
                </div>
              ) : (
                filteredList.map((p) => {
                  const meta = getCleanProductMeta(p);
                  const isSelected = p.id === selectedProduct?.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        if (p.id) onSelectProduct(p.id);
                      }}
                      className={`w-full px-3 py-2 text-left flex items-center justify-between gap-3 transition cursor-pointer ${
                        isSelected
                          ? 'bg-blue-50/80 dark:bg-blue-950/40'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                            {meta.title}
                          </span>
                          {meta.variantPill && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200/80 dark:border-purple-800/60 shrink-0">
                              {meta.variantPill}
                            </span>
                          )}
                        </div>
                        {meta.secondaryText && (
                          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate mt-0.5">
                            {meta.secondaryText}
                          </div>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          {p.stock_on_hand || 0} {p.unit || 'Nos'}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const handleSubmitAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustProductId) {
      setAdjustFeedback({ type: 'error', message: 'Please select a product.' });
      return;
    }
    const prod = activeCatalogProducts.find((p) => p.id === adjustProductId);
    if (!prod || !prod.id) {
      setAdjustFeedback({ type: 'error', message: 'Selected product was not found.' });
      return;
    }
    const numQty = Number(adjustQty);
    if (isNaN(numQty) || numQty < 0) {
      setAdjustFeedback({ type: 'error', message: 'Please enter a valid non-negative quantity.' });
      return;
    }
    if ((adjustMode === 'WRITE_OFF' || adjustMode === 'ADDITION') && numQty <= 0) {
      setAdjustFeedback({ type: 'error', message: 'Quantity must be greater than zero for additions or write-offs.' });
      return;
    }

    setAdjustSubmitting(true);
    setAdjustFeedback(null);

    const payload: StockAdjustmentData = {
      workspace_id: activeWorkspace?.id || 'default',
      product_id: prod.id,
      product_name: prod.name || prod.description,
      adjustment_mode: adjustMode,
      target_or_delta_qty: numQty,
      reason_notes: adjustReason.trim(),
      reference_number: adjustRef.trim() || undefined,
      storage_location: adjustStorageLocation.trim() || undefined,
      unit_cost: adjustUnitCost !== '' && Number(adjustUnitCost) > 0 ? Number(adjustUnitCost) : undefined
    };

    const res = await processStockAdjustment(payload, user);
    setAdjustSubmitting(false);

    if (res.success) {
      if (setProducts) {
        setProducts((prev) =>
          prev.map((item) => {
            if (item.id === prod.id) {
              return {
                ...item,
                is_inventoried: true,
                stock_on_hand: res.newOnHand,
                storage_location: adjustStorageLocation.trim() || item.storage_location,
                cost_price:
                  adjustUnitCost !== '' && Number(adjustUnitCost) > 0 ? Number(adjustUnitCost) : item.cost_price
              };
            }
            return item;
          })
        );
      }

      setAdjustFeedback({
        type: 'success',
        message: `Stock updated from ${res.previousOnHand} to ${res.newOnHand} ${prod.unit || 'units'}.`
      });
      if (triggerToast) {
        triggerToast(
          `Stock adjusted for "${prod.name || prod.description}": ${res.previousOnHand} → ${res.newOnHand} ${prod.unit || ''}`,
          'success'
        );
      }
      setTimeout(() => {
        setShowAdjustModal(false);
      }, 950);
    } else {
      setAdjustFeedback({
        type: 'error',
        message: res.error || 'Failed to process stock adjustment.'
      });
    }
  };

  const handleConfirmNewCategory = async () => {
    const trimmed = newCategoryInput.trim();
    if (!trimmed) {
      setIsCreatingCategory(false);
      return;
    }
    const match = productCategories.find((c) => c.toLowerCase() === trimmed.toLowerCase());
    if (match) {
      setFormProductType(match);
      setIsCreatingCategory(false);
      setNewCategoryInput('');
      return;
    }

    try {
      const res = await safeAddDoc('dropdown_product_categories', {
        name: trimmed,
        workspace_id: activeWorkspace?.id || undefined
      });
      const newId = res?.id || `cat_${Date.now()}`;
      if (setProductCategories) {
        setProductCategories((prev) => [...prev, { id: newId, name: trimmed, workspace_id: activeWorkspace?.id }]);
      }
      setFormProductType(trimmed);
    } catch (err) {
      console.error('Failed to create category:', err);
      setFormProductType(trimmed);
    } finally {
      setIsCreatingCategory(false);
      setNewCategoryInput('');
    }
  };

  const handleConfirmNewUnit = async () => {
    const trimmed = newUnitInput.trim();
    if (!trimmed) {
      setIsCreatingUnit(false);
      return;
    }
    const match = units.find((u) => u.toLowerCase() === trimmed.toLowerCase());
    if (match) {
      setFormUnit(match);
      setIsCreatingUnit(false);
      setNewUnitInput('');
      return;
    }

    try {
      const res = await safeAddDoc('dropdown_units', {
        name: trimmed
      });
      const newId = res?.id || `u_${Date.now()}`;
      if (setUnits) {
        setUnits((prev) => [...prev, { id: newId, name: trimmed }]);
      }
      setFormUnit(trimmed);
    } catch (err) {
      console.error('Failed to create unit:', err);
      setFormUnit(trimmed);
    } finally {
      setIsCreatingUnit(false);
      setNewUnitInput('');
    }
  };

  // Product Image Upload via Custom Storage Bucket
  const handleProductImageUpload = async (file: File) => {
    if (!file) return;
    setIsUploadingImage(true);
    setImageUploadProgress(10);
    try {
      const oldImageUrl = formImageUrl;
      const uploaded = await uploadWorkspaceMediaAsset(
        file,
        'products/images',
        (activeWorkspace as any)?.settings || activeWorkspace,
        {
          compressImage: true,
          maxDimension: 800,
          quality: 0.78,
          onProgress: (pct) => setImageUploadProgress(pct)
        }
      );
      if (oldImageUrl && oldImageUrl !== uploaded.url) {
        setPendingDeletedStorageUrls((prev) => Array.from(new Set([...prev, oldImageUrl])));
      }
      setFormImageUrl(uploaded.url);
      if (triggerToast) {
        triggerToast(
          uploaded.storageProvider === 'supabase'
            ? 'Product photo uploaded to Custom Storage Bucket.'
            : 'Product photo compressed & saved ready for quotations.',
          'success'
        );
      }
    } catch (err: any) {
      console.error('Product image upload failed:', err);
      if (triggerToast) {
        triggerToast(`Failed to upload product photo: ${err?.message || 'Unknown error'}`, 'error');
      }
    } finally {
      setIsUploadingImage(false);
      setImageUploadProgress(null);
    }
  };

  // Product Technical Datasheet Upload via Custom Storage Bucket
  const handleDatasheetUpload = async (file: File) => {
    if (!file) return;
    setIsUploadingDatasheet(true);
    setDatasheetUploadProgress(10);
    try {
      const oldDatasheetUrl = formDatasheetAttachment?.url;
      const uploaded = await uploadWorkspaceMediaAsset(
        file,
        'products/datasheets',
        (activeWorkspace as any)?.settings || activeWorkspace,
        {
          compressImage: file.type.startsWith('image/'),
          maxDimension: 1200,
          quality: 0.78,
          pdfCompressionPreset: 'standard',
          onProgress: (pct) => setDatasheetUploadProgress(pct)
        }
      );
      if (oldDatasheetUrl && oldDatasheetUrl !== uploaded.url) {
        setPendingDeletedStorageUrls((prev) => Array.from(new Set([...prev, oldDatasheetUrl])));
      }
      const attachment: Attachment = {
        id: `ds_${Date.now()}`,
        name: file.name,
        size: uploaded.compressedSize || uploaded.size || file.size,
        original_size_bytes: uploaded.originalSize,
        compressed_size_bytes: uploaded.compressedSize,
        type: uploaded.type || file.type || 'application/pdf',
        url: uploaded.url,
        uploadedAt: new Date().toISOString(),
        isLocal: uploaded.isLocal,
        storageKey: uploaded.storageKey,
        uploadedByUserName: user?.full_name || user?.username || user?.email || 'User'
      };
      setFormDatasheetAttachment(attachment);
      if (triggerToast) {
        triggerToast(
          uploaded.wasCompressed
            ? `Datasheet compressed (${formatByteSize(uploaded.originalSize)} → ${formatByteSize(uploaded.compressedSize)}) & uploaded.`
            : uploaded.storageProvider === 'supabase'
            ? `Technical datasheet "${file.name}" uploaded to Custom Storage Bucket.`
            : `Technical datasheet "${file.name}" attached.`,
          'success'
        );
      }
    } catch (err: any) {
      console.error('Datasheet upload failed:', err);
      if (triggerToast) {
        triggerToast(`Failed to upload datasheet: ${err?.message || 'Unknown error'}`, 'error');
      }
    } finally {
      setIsUploadingDatasheet(false);
      setDatasheetUploadProgress(null);
    }
  };

  const filteredProducts = useMemo(() => {
    return activeCatalogProducts.filter((p) => {
      const q = searchInput.toLowerCase().trim();
      const matchSearch =
        !q ||
        (p.name || '').toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q) ||
        (p.sku || '').toLowerCase().includes(q) ||
        (p.brand_make || '').toLowerCase().includes(q) ||
        (p.model_part_no || '').toLowerCase().includes(q) ||
        (p.product_type || '').toLowerCase().includes(q) ||
        (p.attributes || []).some(
          (a) => a.key.toLowerCase().includes(q) || a.value.toLowerCase().includes(q)
        );

      const matchesCategory = categoryFilter === 'All' || p.product_type === categoryFilter;
      const matchesBrand = brandFilter === 'All' || (p.brand_make || '').trim() === brandFilter;

      let matchesStock = true;
      if (stockFilter === 'Tracked') {
        matchesStock = Boolean(p.is_inventoried);
      } else if (stockFilter === 'LowStock') {
        matchesStock = isProductLowStock(p);
      } else if (stockFilter === 'WithDatasheet') {
        matchesStock = Boolean(p.datasheet_attachment?.url);
      } else if (stockFilter === 'CompositeKit') {
        matchesStock = Boolean(p.is_composite_set && p.sub_components && p.sub_components.length > 0);
      }

      return matchSearch && matchesCategory && matchesBrand && matchesStock;
    });
  }, [activeCatalogProducts, searchInput, categoryFilter, brandFilter, stockFilter]);

  // When Group Variants is active, sort products so Parent Families appear first with their Child Variants directly beneath them
  const orderedFilteredProducts = useMemo(() => {
    if (!groupVariantsByFamily) return filteredProducts;
    const byId = new Map<string, Product>();
    for (const p of activeCatalogProducts) {
      if (p.id) byId.set(p.id, p);
    }
    const getGroupKey = (p: Product): string => {
      const parentId = (p as any).parent_product_id || p.variant_parent_id;
      if (parentId && byId.has(parentId)) {
        const parentProd = byId.get(parentId)!;
        return `parent_${parentProd.id}`;
      }
      const hasChildren = activeCatalogProducts.some(
        (c) => c.id !== p.id && ((c as any).parent_product_id === p.id || c.variant_parent_id === p.id)
      );
      if (hasChildren && p.id) {
        return `parent_${p.id}`;
      }
      return `fam_${resolveProductFamilyKey(p)}`;
    };

    const groupCountMap = new Map<string, number>();
    for (const p of filteredProducts) {
      const gk = getGroupKey(p);
      groupCountMap.set(gk, (groupCountMap.get(gk) || 0) + 1);
    }

    return [...filteredProducts].sort((a, b) => {
      const gkA = getGroupKey(a);
      const gkB = getGroupKey(b);
      if (gkA !== gkB) {
        const isParentTreeA = gkA.startsWith('parent_') || (groupCountMap.get(gkA) || 1) > 1;
        const isParentTreeB = gkB.startsWith('parent_') || (groupCountMap.get(gkB) || 1) > 1;
        if (isParentTreeA && !isParentTreeB) return -1;
        if (isParentTreeB && !isParentTreeA) return 1;
        const nameA = (
          byId.get(gkA.replace(/^parent_/, ''))?.name ||
          resolveProductFamilyDisplayName(a) ||
          a.name ||
          ''
        ).toLowerCase();
        const nameB = (
          byId.get(gkB.replace(/^parent_/, ''))?.name ||
          resolveProductFamilyDisplayName(b) ||
          b.name ||
          ''
        ).toLowerCase();
        return nameA.localeCompare(nameB);
      }
      // Within the same parent group, always put the Parent Product row first, then child variants by price/name
      const aIsChild = Boolean((a as any).parent_product_id || a.variant_parent_id);
      const bIsChild = Boolean((b as any).parent_product_id || b.variant_parent_id);
      if (!aIsChild && bIsChild) return -1;
      if (aIsChild && !bIsChild) return 1;
      const priceDiff = (Number(a.unit_price) || 0) - (Number(b.unit_price) || 0);
      if (priceDiff !== 0) return priceDiff;
      return (a.name || a.sku || '').localeCompare(b.name || b.sku || '');
    });
  }, [filteredProducts, activeCatalogProducts, groupVariantsByFamily]);

  const hasActiveFilter = Boolean(
    searchInput.trim() || categoryFilter !== 'All' || brandFilter !== 'All' || stockFilter !== 'All'
  );

  const handleClearProductFilters = () => {
    setSearchInput('');
    setCategoryFilter('All');
    setBrandFilter('All');
    setStockFilter('All');
    setCurrentPage(1);
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchInput, categoryFilter, brandFilter, stockFilter, groupVariantsByFamily]);

  // Group contiguous parent + child variant families into atomic pagination units so a Parent and its Variants never split across pages
  const productFamilyUnits = useMemo<Product[][]>(() => {
    if (!groupVariantsByFamily || orderedFilteredProducts.length === 0) {
      return orderedFilteredProducts.map((p) => [p]);
    }
    const byId = new Map<string, Product>();
    for (const p of activeCatalogProducts) {
      if (p.id) byId.set(p.id, p);
    }
    const getUnitKey = (p: Product): string => {
      const parentId =
        (p as any).parent_product_id || p.variant_parent_id || (p as any).variant_of;
      if (parentId && byId.has(parentId)) {
        return `parent_${parentId}`;
      }
      const hasChildren = activeCatalogProducts.some(
        (c) =>
          c.id !== p.id &&
          ((c as any).parent_product_id === p.id ||
            c.variant_parent_id === p.id ||
            (c as any).variant_of === p.id)
      );
      if (hasChildren && p.id) {
        return `parent_${p.id}`;
      }
      return `fam_${resolveProductFamilyKey(p, byId)}`;
    };

    const units: Product[][] = [];
    let currentKey: string | null = null;
    for (const p of orderedFilteredProducts) {
      const uk = getUnitKey(p);
      if (units.length > 0 && uk === currentKey) {
        units[units.length - 1].push(p);
      } else {
        units.push([p]);
        currentKey = uk;
      }
    }
    return units;
  }, [orderedFilteredProducts, activeCatalogProducts, groupVariantsByFamily]);

  // Pagination details
  const totalItems = orderedFilteredProducts.length;
  const totalFamilyUnits = productFamilyUnits.length;
  const totalPages = useMemo(() => {
    if (itemsPerPage === 'All') return 1;
    return Math.ceil(totalFamilyUnits / itemsPerPage) || 1;
  }, [totalFamilyUnits, itemsPerPage]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(Math.max(1, totalPages));
    }
  }, [currentPage, totalPages]);

  const paginatedProducts = useMemo(() => {
    if (itemsPerPage === 'All') return orderedFilteredProducts;
    const startIndex = (currentPage - 1) * itemsPerPage;
    return productFamilyUnits.slice(startIndex, startIndex + itemsPerPage).flat();
  }, [orderedFilteredProducts, productFamilyUnits, currentPage, itemsPerPage]);

  const resetFormAiAutofillState = () => {
    setFormAiFile(null);
    setFormAiRawText('');
    setFormAiDetectedVariants([]);
    setFormAiSelectedVariantIdx(0);
    setFormAiStatus('');
    setShowFormAiAutofill(false);
    setShowVariantLinkEditor(false);
    setShowSecondaryLogisticsFields(false);
  };

  // CRUD handlers
  const openAddModal = () => {
    resetFormAiAutofillState();
    setEditingProduct(null);
    setPendingDeletedStorageUrls([]);
    setFormVariantParentId(null);
    setFormVariantLabel('');
    setFormProductFamily('');
    setIsCreatingCategory(false);
    setNewCategoryInput('');
    setIsCreatingUnit(false);
    setNewUnitInput('');
    setActiveFormTab('overview');
    setFormName('');
    setFormProductType(productCategories[0] || 'General Equipment');
    setFormDescription('');
    setFormUnit('Nos');
    setFormUnitPrice(undefined);
    setFormCostPrice(undefined);
    setFormIsCompositeSet(false);
    setFormSubComponents([]);
    setFormPackagePricingMode('itemized');
    setFormOptionScopeNotes('');
    setFormSku('');
    setIsSkuAutoManaged(false);
    setFormBrandMake('');
    setFormModelPartNo('');
    setFormDefaultAvailability('');
    setFormImageUrl('');
    setFormSecondaryImageUrl('');
    setFormImageCaption('');
    setFormSecondaryImageCaption('');
    setFormImageAdjustments(undefined);
    setFormDatasheetAttachment(undefined);
    setFormAttributes([]);
    setFormIsInventoried(false);
    setFormStockOnHand(0);
    setFormReorderLevel(0);
    setFormStorageLocation('');
    setFormHsCode('');
    setFormCountryOfOrigin('');
    setFormGrossWeightKg(undefined);
    setShowFormModal(true);
  };

  const openEditModal = (p: Product) => {
    resetFormAiAutofillState();
    setEditingProduct(p);
    setPendingDeletedStorageUrls([]);
    const resolvedParentId = (p as any).parent_product_id || p.variant_parent_id || null;
    setFormVariantParentId(resolvedParentId);
    setFormVariantLabel((p as any).variant_label || '');
    setFormProductFamily(p.product_family || '');
    setIsCreatingCategory(false);
    setNewCategoryInput('');
    setIsCreatingUnit(false);
    setNewUnitInput('');
    setActiveFormTab('overview');
    setFormName(p.name || p.description || '');
    setFormProductType(p.product_type || productCategories[0] || 'General Equipment');
    setFormDescription(compileDescriptionWithSpecs(p.name || '', p.description || '', p.attributes || []) || p.description || '');
    setFormUnit(p.unit && p.unit !== 'Custom Unit' ? p.unit : 'Nos');
    setFormUnitPrice(p.unit_price ?? undefined);
    setFormCostPrice(p.cost_price ?? undefined);
    setFormIsCompositeSet(Boolean(p.is_composite_set));
    setFormSubComponents((p.sub_components || []).map((c) => ({ ...c })));
    setFormPackagePricingMode(p.package_pricing_mode || 'itemized');
    setFormOptionScopeNotes(p.option_scope_notes || '');
    setFormSku(p.sku || '');
    setIsSkuAutoManaged(false);
    const brandAttr = (p.attributes || []).find((a) => /^(brand|make|manufacturer|brand \/ make)$/i.test(a.key.trim()))?.value;
    const modelAttr = (p.attributes || []).find((a) => /^(model|model no|part no|model \/ part no)$/i.test(a.key.trim()))?.value;
    setFormBrandMake(p.brand_make || brandAttr || '');
    setFormModelPartNo(p.model_part_no || modelAttr || '');
    setFormDefaultAvailability(p.default_availability || (p as any).lead_time_note || '');
    setFormImageUrl(p.image_url || '');
    setFormSecondaryImageUrl(p.secondary_image_url || '');
    setFormImageCaption(p.image_caption || '');
    setFormSecondaryImageCaption(p.secondary_image_caption || '');
    setFormImageAdjustments(p.image_adjustments);
    setFormDatasheetAttachment(p.datasheet_attachment);
    setFormAttributes(p.attributes || []);
    setFormIsInventoried(Boolean(p.is_inventoried));
    setFormStockOnHand(p.stock_on_hand ?? 0);
    setFormReorderLevel(p.reorder_level ?? 0);
    setFormStorageLocation(p.storage_location || '');
    setFormHsCode(p.hs_code || '');
    setFormCountryOfOrigin(p.country_of_origin || '');
    setFormGrossWeightKg(p.gross_weight_kg ?? undefined);
    setShowFormModal(true);
  };

  // 1-Click "+ Add Variant": Pre-links parent_product_id = parent.id, displays parent's shared attributes
  // as an "Inherited from Parent (Base Specs)" preview strip, and pre-populates any blank template keys
  const openSpecVariantModal = (p: Product) => {
    resetFormAiAutofillState();
    const rootParentId = (p as any).parent_product_id || p.variant_parent_id || p.id || null;
    const parentProd = activeCatalogProducts.find((item) => item.id === rootParentId) || p;
    const baseName = (parentProd.name || parentProd.description || '').replace(/\s*\(copy\)\s*$/i, '').trim();
    const blankTemplateKeys = (parentProd.attributes || [])
      .filter((a) => a && a.key.trim() !== '' && a.value.trim() === '')
      .map((a) => ({ key: a.key.trim(), value: '' }));

    const existingActiveSkus = activeCatalogProducts
      .map((item) => item.sku)
      .filter((s): s is string => Boolean(s && s.trim()));
    const nextVariantSku = buildSmartVariantSku(
      parentProd.sku,
      parentProd,
      {
        variant_label: '',
        model_part_no: '',
        name: baseName,
        attributes: blankTemplateKeys
      },
      existingActiveSkus
    );

    setEditingProduct(null);
    setPendingDeletedStorageUrls([]);
    setFormVariantParentId(rootParentId);
    setFormVariantLabel('');
    setFormProductFamily(parentProd.product_family || baseName);
    setIsCreatingCategory(false);
    setNewCategoryInput('');
    setIsCreatingUnit(false);
    setNewUnitInput('');
    setActiveFormTab('specs_media');
    setFormName(baseName);
    setFormProductType(parentProd.product_type || productCategories[0] || 'General Equipment');
    setFormDescription(
      compileDescriptionWithSpecs(baseName, parentProd.description || '', parentProd.attributes || []) ||
        parentProd.description ||
        ''
    );
    setFormUnit(parentProd.unit && parentProd.unit !== 'Custom Unit' ? parentProd.unit : 'Nos');
    setFormUnitPrice(parentProd.unit_price ?? undefined);
    setFormCostPrice(parentProd.cost_price ?? undefined);
    setFormIsCompositeSet(Boolean(parentProd.is_composite_set));
    setFormSubComponents((parentProd.sub_components || []).map((c, idx) => ({ ...c, id: `comp_${Date.now()}_${idx}` })));
    setFormPackagePricingMode(parentProd.package_pricing_mode || 'itemized');
    setFormOptionScopeNotes(parentProd.option_scope_notes || '');
    setFormSku(nextVariantSku);
    setIsSkuAutoManaged(true);
    setFormBrandMake(parentProd.brand_make || '');
    setFormModelPartNo(parentProd.model_part_no || '');
    setFormDefaultAvailability(parentProd.default_availability || '');
    setFormImageUrl(parentProd.image_url || '');
    setFormSecondaryImageUrl(parentProd.secondary_image_url || '');
    setFormImageCaption(parentProd.image_caption || '');
    setFormSecondaryImageCaption(parentProd.secondary_image_caption || '');
    setFormImageAdjustments(parentProd.image_adjustments);
    setFormDatasheetAttachment(parentProd.datasheet_attachment);
    setFormAttributes(
      blankTemplateKeys.length > 0 ? blankTemplateKeys : [{ key: 'Dimensions / Size', value: '' }]
    );
    setFormIsInventoried(Boolean(parentProd.is_inventoried));
    setFormStockOnHand(0);
    setFormReorderLevel(parentProd.reorder_level ?? 0);
    setFormStorageLocation(parentProd.storage_location || '');
    setFormHsCode(parentProd.hs_code || '');
    setFormCountryOfOrigin(parentProd.country_of_origin || '');
    setFormGrossWeightKg(parentProd.gross_weight_kg ?? undefined);
    setShowFormModal(true);
    setTimeout(() => {
      variantLabelInputRef.current?.focus();
      variantLabelInputRef.current?.select();
    }, 60);
    if (triggerToast) {
      triggerToast(
        `Adding Variant under "${baseName}". Shared base specs are inherited automatically—enter your Variant Label, SKU, and differentiating specs.`,
        'info'
      );
    }
  };

  // Smart Hierarchical Auto-SKU generator for both Master Parents and Child Variants
  const handleGenerateAutoSku = (overrides?: {
    variantLabel?: string;
    modelPartNo?: string;
    attributes?: ProductAttribute[];
    silent?: boolean;
  }) => {
    const otherActiveSkus = activeCatalogProducts
      .filter((p) => p.id !== editingProduct?.id)
      .map((p) => p.sku)
      .filter((s): s is string => Boolean(s && s.trim()));

    const activeVariantLabel = overrides?.variantLabel ?? formVariantLabel;
    const activeModelPartNo = overrides?.modelPartNo ?? formModelPartNo;
    const activeAttributes = overrides?.attributes ?? formAttributes;

    if (formVariantParentId) {
      const parentProd =
        activeCatalogProducts.find((c) => c.id === formVariantParentId && c.id !== editingProduct?.id) ||
        null;
      const generated = buildSmartVariantSku(
        parentProd?.sku,
        parentProd || {
          sku: undefined,
          brand_make: formBrandMake,
          name: formProductFamily || formName,
          product_type: formProductType
        },
        {
          variant_label: activeVariantLabel,
          model_part_no: activeModelPartNo,
          name: formName,
          attributes: activeAttributes
        },
        otherActiveSkus
      );
      setFormSku(generated);
      if (!overrides?.silent && triggerToast) {
        triggerToast(`Generated variant SKU: ${generated}`, 'info');
      }
      return;
    }

    const baseParentCode = suggestParentBaseSku(formBrandMake, formName, formProductType);
    const uniqueParentSku = deduplicateSku(baseParentCode, otherActiveSkus);
    setFormSku(uniqueParentSku);
    if (!overrides?.silent && triggerToast) {
      triggerToast(`Generated parent base SKU: ${uniqueParentSku}`, 'info');
    }
  };

  // Builds the effective Master Parent snapshot from the live form state for Parent -> Variant sync
  const buildLiveParentSyncSnapshot = (): Partial<Product> => {
    const cleanFormAttrs = formAttributes
      .map((a) => ({ key: a.key.trim(), value: a.value.trim() }))
      .filter((a) => a.key !== '');
    return {
      ...(editingProduct || {}),
      name: formName.trim() || editingProduct?.name,
      product_type: formProductType || editingProduct?.product_type || 'General',
      brand_make: formBrandMake.trim() || undefined,
      brand: formBrandMake.trim() || undefined,
      country_of_origin: formCountryOfOrigin.trim() || undefined,
      default_availability: formDefaultAvailability.trim() || undefined,
      description: formDescription.trim() || editingProduct?.description || '',
      image_url: formImageUrl.trim() || undefined,
      secondary_image_url: formSecondaryImageUrl.trim() || undefined,
      image_caption: formImageCaption.trim() || undefined,
      secondary_image_caption: formSecondaryImageCaption.trim() || undefined,
      image_adjustments: formImageAdjustments || undefined,
      datasheet_attachment: formDatasheetAttachment || undefined,
      datasheet_url: formDatasheetAttachment?.url || editingProduct?.datasheet_url || undefined,
      attributes: cleanFormAttrs,
      is_composite_set: formIsCompositeSet,
      sub_components: formIsCompositeSet ? formSubComponents : undefined,
      package_pricing_mode: formIsCompositeSet ? formPackagePricingMode : undefined,
      option_scope_notes:
        formIsCompositeSet && formOptionScopeNotes.trim()
          ? formOptionScopeNotes.trim()
          : undefined
    };
  };

  const getEditingLinkedVariants = (): Product[] => {
    if (!editingProduct?.id || formVariantParentId) return [];
    return activeCatalogProducts.filter(
      (c) =>
        c.id !== editingProduct.id &&
        ((c as any).parent_product_id === editingProduct.id ||
          c.variant_parent_id === editingProduct.id)
    );
  };

  const openParentSyncModal = () => {
    const linkedChildren = getEditingLinkedVariants();
    if (linkedChildren.length === 0) return;
    const liveParent = buildLiveParentSyncSnapshot();
    setSelectedParentSyncFields(getDefaultSelectedParentSyncFields(liveParent, linkedChildren));
    setShowParentSyncModal(true);
  };

  const handleExecuteParentSyncToVariants = async () => {
    if (isSyncingVariants) return;
    const linkedChildren = getEditingLinkedVariants();
    if (linkedChildren.length === 0 || selectedParentSyncFields.length === 0) return;

    setIsSyncingVariants(true);
    try {
      const liveParent = buildLiveParentSyncSnapshot();
      const preparedUpdates: Array<{
        id: string;
        firestoreUpdate: Record<string, any>;
        updatedChild: Product;
      }> = [];

      for (const child of linkedChildren) {
        if (!child.id) continue;
        const patch = buildParentToVariantSyncPatch(
          liveParent,
          child,
          selectedParentSyncFields,
          linkedChildren
        );
        if (Object.keys(patch).length === 0) continue;

        const { localPatch, clearedKeys } = splitFirestoreSyncPatch(patch);
        const sanitizedLocalPatch = omitUndefinedDeep(sanitizeFirestorePayload(localPatch));
        const firestoreUpdate: Record<string, any> = { ...sanitizedLocalPatch };
        for (const key of clearedKeys) {
          firestoreUpdate[key] = deleteField();
        }

        const nextChild: Record<string, any> = {
          ...child,
          ...sanitizedLocalPatch,
          id: child.id
        };
        for (const key of clearedKeys) {
          delete nextChild[key];
        }

        preparedUpdates.push({
          id: child.id,
          firestoreUpdate,
          updatedChild: omitUndefinedDeep(nextChild) as Product
        });
      }

      if (preparedUpdates.length === 0) {
        setShowParentSyncModal(false);
        return;
      }

      // Atomic Firestore batch commit (chunked <= 450 ops per batch) so partial sync never leaks
      const BATCH_CHUNK_SIZE = 450;
      for (let offset = 0; offset < preparedUpdates.length; offset += BATCH_CHUNK_SIZE) {
        const chunk = preparedUpdates.slice(offset, offset + BATCH_CHUNK_SIZE);
        const batch = writeBatch(db);
        for (const entry of chunk) {
          batch.update(doc(db, 'products', entry.id), entry.firestoreUpdate);
        }
        await batch.commit();
      }

      // Only persist locally & mutate React state AFTER Firestore batch commit succeeds
      const updatedMap = new Map<string, Product>();
      for (const entry of preparedUpdates) {
        await MetadataRepository.upsertLocalProduct(entry.updatedChild).catch(() => {});
        updatedMap.set(entry.id, entry.updatedChild);
      }

      if (setProducts && updatedMap.size > 0) {
        setProducts(products.map((p) => (p.id && updatedMap.has(p.id) ? updatedMap.get(p.id)! : p)));
      }

      setShowParentSyncModal(false);
      if (triggerToast) {
        const count = updatedMap.size;
        triggerToast(
          `Synced ${selectedParentSyncFields.length} shared field${selectedParentSyncFields.length === 1 ? '' : 's'} to ${count} variant${count === 1 ? '' : 's'} — child SKUs, models, prices, stock & size specs preserved.`,
          'success'
        );
      }
    } catch (err: any) {
      console.error('Parent-to-variant sync failed:', err);
      if (triggerToast) {
        triggerToast(`Sync failed: ${err?.message || 'Unable to update linked variants.'}`, 'error');
      }
    } finally {
      setIsSyncingVariants(false);
    }
  };

  // Bulk Variant Matrix helpers (Quick-Add Multiple Sizes / Models under a Master Parent)
  const createBlankBulkVariantRow = (seedIdx: number): BulkVariantMatrixRow => ({
    id: `bvr_${Date.now()}_${seedIdx}_${Math.random().toString(36).slice(2, 6)}`,
    variantLabel: '',
    modelPartNo: '',
    sku: '',
    isSkuManual: false,
    costPrice: '',
    sellingPrice: ''
  });

  const getActiveCatalogSkus = (): string[] =>
    activeCatalogProducts
      .map((p) => p.sku)
      .filter((s): s is string => Boolean(s && s.trim()));

  const recomputeBulkRows = (
    nextRows: BulkVariantMatrixRow[],
    specKeyOverride?: string
  ): BulkVariantMatrixRow[] => {
    const liveParent = buildLiveParentSyncSnapshot();
    const effectiveParentSku = (formSku.trim() || editingProduct?.sku || '').trim();
    return recomputeBulkVariantMatrixSkus(
      nextRows,
      effectiveParentSku,
      liveParent,
      getActiveCatalogSkus(),
      specKeyOverride ?? bulkVariantSpecKey
    );
  };

  const openBulkVariantMatrixModal = () => {
    if (!editingProduct?.id || formVariantParentId) return;
    const linkedChildren = getEditingLinkedVariants();
    const liveParent = buildLiveParentSyncSnapshot();
    const suggestedKey = detectDefaultDifferentiatingSpecKey(liveParent, linkedChildren);
    setBulkVariantSpecKey(suggestedKey);
    setBulkVariantRows([
      createBlankBulkVariantRow(0),
      createBlankBulkVariantRow(1),
      createBlankBulkVariantRow(2)
    ]);
    setShowBulkPastePanel(false);
    setBulkPasteText('');
    setShowBulkVariantMatrixModal(true);
  };

  const handleBulkRowFieldChange = (
    rowId: string,
    field: 'variantLabel' | 'modelPartNo' | 'sku' | 'costPrice' | 'sellingPrice',
    value: string
  ) => {
    const updated = bulkVariantRows.map((row) => {
      if (row.id !== rowId) return row;
      if (field === 'sku') {
        return {
          ...row,
          sku: value.toUpperCase(),
          isSkuManual: value.trim().length > 0
        };
      }
      return { ...row, [field]: value };
    });
    setBulkVariantRows(recomputeBulkRows(updated));
  };

  const handleResetBulkRowAutoSku = (rowId: string) => {
    const updated = bulkVariantRows.map((row) =>
      row.id === rowId ? { ...row, isSkuManual: false, sku: '' } : row
    );
    setBulkVariantRows(recomputeBulkRows(updated));
  };

  const handleApplyBulkPasteLines = () => {
    const parsed = parseBulkVariantPasteLines(bulkPasteText);
    if (parsed.length === 0) {
      triggerToast?.('Paste at least one line (e.g. 30" × 72" | 2850).', 'info');
      return;
    }
    const populatedExisting = bulkVariantRows.filter(
      (r) =>
        r.variantLabel.trim() !== '' ||
        r.modelPartNo.trim() !== '' ||
        r.sellingPrice.trim() !== '' ||
        r.costPrice.trim() !== ''
    );
    const merged = [...populatedExisting, ...parsed];
    setBulkVariantRows(recomputeBulkRows(merged));
    setBulkPasteText('');
    setShowBulkPastePanel(false);
    triggerToast?.(
      `Added ${parsed.length} variant row${parsed.length === 1 ? '' : 's'} with live smart Auto-SKUs.`,
      'success'
    );
  };

  const handleSaveBulkVariantMatrix = async () => {
    if (isSavingBulkVariants || !editingProduct?.id || !activeWorkspace?.id) return;
    const validRows = bulkVariantRows.filter(
      (r) => r.variantLabel.trim() !== '' || r.modelPartNo.trim() !== ''
    );
    if (validRows.length === 0) {
      triggerToast?.('Enter at least one Variant Label or Model / Part # before saving.', 'error');
      return;
    }

    setIsSavingBulkVariants(true);
    try {
      // P1-16: Always inherit from live edited parent snapshot merged onto editingProduct
      const liveParent = buildLiveParentSyncSnapshot();
      const effectiveParent: Partial<Product> = {
        ...editingProduct,
        ...liveParent
      };
      const parentId = editingProduct.id;
      const parentName = (effectiveParent.name || 'Product').trim();
      const familyName = (
        formProductFamily.trim() ||
        effectiveParent.product_family ||
        parentName
      ).trim();
      const cleanSpecKey = bulkVariantSpecKey.trim() || 'Dimensions';
      const cleanSpecKeyLower = cleanSpecKey.toLowerCase();

      // Shared non-blank baseline specs from live parent (excluding the differentiating spec key being populated per row)
      const sharedParentAttrs: ProductAttribute[] = (effectiveParent.attributes || [])
        .map((a) => ({ key: String(a?.key || '').trim(), value: String(a?.value || '').trim() }))
        .filter(
          (a) =>
            a.key !== '' &&
            a.value !== '' &&
            a.key.toLowerCase() !== cleanSpecKeyLower
        );

      const takenSkus: string[] = [...getActiveCatalogSkus()];
      const effectiveParentSku = (formSku.trim() || effectiveParent.sku || '').trim();
      const nowIso = new Date().toISOString();

      const preparedChildren: Array<{
        ref: ReturnType<typeof doc>;
        firestorePayload: Record<string, any>;
        savedChild: Product;
      }> = [];

      for (let i = 0; i < validRows.length; i += 1) {
        const row = validRows[i];
        const rawLabel = row.variantLabel.trim();
        const rawModel = row.modelPartNo.trim();
        const formattedDiffVal = rawLabel
          ? formatSiTechnicalValue(rawLabel) || rawLabel
          : '';
        const variantLabel = formattedDiffVal || rawModel;

        const childAttrs: ProductAttribute[] = [
          ...(formattedDiffVal ? [{ key: cleanSpecKey, value: formattedDiffVal }] : []),
          ...sharedParentAttrs.map((a) => ({ ...a }))
        ];

        const rawCandidateSku =
          row.sku.trim() ||
          buildSmartVariantSku(
            effectiveParentSku,
            effectiveParent,
            {
              variant_label: variantLabel,
              model_part_no: rawModel || undefined,
              attributes: childAttrs
            },
            takenSkus
          );
        const finalSku = deduplicateSku(rawCandidateSku, takenSkus) || undefined;
        if (finalSku) {
          takenSkus.push(finalSku);
        }

        const parsedCost = row.costPrice.trim() !== '' ? Number(row.costPrice) : undefined;
        const finalCost =
          parsedCost !== undefined && !isNaN(parsedCost) && parsedCost >= 0 ? parsedCost : undefined;
        const parsedSell = row.sellingPrice.trim() !== '' ? Number(row.sellingPrice) : 0;
        const finalSell = !isNaN(parsedSell) && parsedSell > 0 ? parsedSell : 0;

        const clonedSubComponents =
          effectiveParent.is_composite_set && Array.isArray(effectiveParent.sub_components)
            ? effectiveParent.sub_components.map((c, cIdx) =>
                omitUndefinedDeep({
                  ...c,
                  id: `comp_${Date.now()}_${i}_${cIdx}`,
                  attributes: Array.isArray(c.attributes)
                    ? c.attributes.map((a) => ({ ...a }))
                    : undefined
                })
              )
            : undefined;

        const compiledDesc =
          compileDescriptionWithSpecs(parentName, effectiveParent.description || '', childAttrs) ||
          effectiveParent.description ||
          parentName;

        // P0-10: Omit undefined optional fields cleanly (no undefined -> null Firestore drift)
        const rawChildPayload: Partial<Product> & Record<string, any> = {
          workspace_id: activeWorkspace.id,
          name: parentName,
          product_type: effectiveParent.product_type || 'General',
          description: compiledDesc,
          unit:
            formUnit ||
            effectiveParent.unit ||
            (effectiveParent.is_composite_set ? 'SET' : 'Nos'),
          currency: effectiveParent.currency || 'AED',
          unit_price: finalSell,
          cost_price: finalCost,
          sku: finalSku,
          variant_parent_id: parentId,
          parent_product_id: parentId,
          variant_label: variantLabel,
          product_family: familyName,
          brand_make: effectiveParent.brand_make || undefined,
          brand: effectiveParent.brand_make || undefined,
          model_part_no: rawModel || undefined,
          default_availability: effectiveParent.default_availability || undefined,
          country_of_origin: effectiveParent.country_of_origin || undefined,
          hs_code: formHsCode.trim() || effectiveParent.hs_code || undefined,
          image_url: effectiveParent.image_url || undefined,
          secondary_image_url: effectiveParent.secondary_image_url || undefined,
          image_caption: effectiveParent.image_caption || undefined,
          secondary_image_caption: effectiveParent.secondary_image_caption || undefined,
          image_adjustments: effectiveParent.image_adjustments
            ? { ...effectiveParent.image_adjustments }
            : undefined,
          datasheet_attachment: effectiveParent.datasheet_attachment
            ? { ...effectiveParent.datasheet_attachment }
            : undefined,
          datasheet_url:
            effectiveParent.datasheet_url || effectiveParent.datasheet_attachment?.url || undefined,
          attributes: childAttrs,
          is_composite_set: Boolean(effectiveParent.is_composite_set),
          sub_components: clonedSubComponents,
          package_pricing_mode: effectiveParent.is_composite_set
            ? effectiveParent.package_pricing_mode || 'itemized'
            : undefined,
          option_scope_notes: effectiveParent.is_composite_set
            ? effectiveParent.option_scope_notes || undefined
            : undefined,
          is_inventoried: Boolean(formIsInventoried),
          stock_on_hand: formIsInventoried ? 0 : undefined,
          stock_reserved: 0,
          reorder_level: formIsInventoried ? Number(formReorderLevel || 0) : undefined,
          storage_location:
            formIsInventoried && formStorageLocation.trim()
              ? formStorageLocation.trim()
              : undefined,
          search_terms: generateProductSearchTerms(
            `${parentName} ${variantLabel}`.trim(),
            String(effectiveParent.product_type || 'General'),
            finalSku || '',
            effectiveParent.brand_make || rawModel || variantLabel || undefined
          ),
          createdAt: nowIso,
          updatedAt: nowIso
        };

        const childRef = doc(collection(db, 'products'));
        const cleanChildPayload = omitUndefinedDeep(sanitizeFirestorePayload(rawChildPayload));
        const savedChild: Product = {
          ...cleanChildPayload,
          id: childRef.id
        } as Product;

        preparedChildren.push({
          ref: childRef,
          firestorePayload: cleanChildPayload,
          savedChild
        });
      }

      // P0-9: Commit ALL new child variants + parent `has_variants: true` atomically in writeBatch(db)
      const parentRef = doc(db, 'products', parentId);
      const parentBatchPatch = omitUndefinedDeep({
        has_variants: true,
        product_family: familyName,
        updatedAt: nowIso,
        updated_at: nowIso
      });

      const BATCH_CHUNK_SIZE = 449; // reserve 1 slot for parent update in final batch
      for (let offset = 0; offset < preparedChildren.length; offset += BATCH_CHUNK_SIZE) {
        const chunk = preparedChildren.slice(offset, offset + BATCH_CHUNK_SIZE);
        const isFinalChunk = offset + BATCH_CHUNK_SIZE >= preparedChildren.length;
        const batch = writeBatch(db);
        for (const item of chunk) {
          batch.set(item.ref, item.firestorePayload);
        }
        if (isFinalChunk) {
          batch.update(parentRef, parentBatchPatch);
        }
        await batch.commit();
      }

      // Only persist locally & mutate React state AFTER atomic Firestore commit resolves
      const createdChildren = preparedChildren.map((item) => item.savedChild);
      const updatedParent: Product = omitUndefinedDeep({
        ...effectiveParent,
        id: parentId,
        has_variants: true,
        product_family: familyName,
        updatedAt: nowIso
      }) as Product;

      for (const child of createdChildren) {
        await MetadataRepository.upsertLocalProduct(child).catch(() => {});
      }
      await MetadataRepository.upsertLocalProduct(updatedParent).catch(() => {});

      if (setProducts) {
        const createdIds = new Set(createdChildren.map((c) => c.id));
        setProducts([
          ...createdChildren,
          ...products
            .filter((p) => !createdIds.has(p.id))
            .map((p) => (p.id === parentId ? updatedParent : p))
        ]);
      }

      setShowBulkVariantMatrixModal(false);
      triggerToast?.(
        `Created ${createdChildren.length} variant${createdChildren.length === 1 ? '' : 's'} under "${parentName}" with smart Auto-SKUs.`,
        'success'
      );
    } catch (err: any) {
      console.error('Bulk variant creation failed:', err);
      triggerToast?.(
        `Failed to create bulk variants: ${err?.message || 'Unexpected error.'}`,
        'error'
      );
    } finally {
      setIsSavingBulkVariants(false);
    }
  };

  // 1-Click ISO 80000 / SI Technical Unit & Attribute Hygiene Cleanup on the Product Edit Form
  const handleCleanFormSiUnits = () => {
    const { attributes: cleanedAttrs, rescuedFields } =
      cleanProductAttributesWithRescuedFields(formAttributes, {
        brand_make: formBrandMake,
        model_part_no: formModelPartNo,
        country_of_origin: formCountryOfOrigin,
        availability: formDefaultAvailability,
        hs_code: formHsCode
      });

    if (rescuedFields.brand_make && !formBrandMake.trim()) {
      setFormBrandMake(rescuedFields.brand_make);
    }
    if (rescuedFields.model_part_no && !formModelPartNo.trim()) {
      setFormModelPartNo(rescuedFields.model_part_no);
    }
    if (rescuedFields.country_of_origin && !formCountryOfOrigin.trim()) {
      setFormCountryOfOrigin(rescuedFields.country_of_origin);
    }
    const normAvail = normalizeLeadTime(rescuedFields.availability || formDefaultAvailability);
    if (normAvail !== formDefaultAvailability) {
      setFormDefaultAvailability(normAvail);
    }
    if (rescuedFields.hs_code && !formHsCode.trim()) {
      setFormHsCode(rescuedFields.hs_code);
    }

    const normUnit = normalizeCatalogUnit(formUnit);
    if (normUnit) {
      setFormUnit(normUnit);
    }
    if (formVariantLabel.trim()) {
      setFormVariantLabel(formatSiTechnicalValue(formVariantLabel));
    }

    const prevCompiled = compileDescriptionWithSpecs(formName, '', formAttributes);
    setFormAttributes(cleanedAttrs);
    if (
      !formDescription.trim() ||
      formDescription.trim() === formName.trim() ||
      formDescription.trim() === prevCompiled.trim()
    ) {
      setFormDescription(compileDescriptionWithSpecs(formName, '', cleanedAttrs));
    }

    if (formSubComponents.length > 0) {
      setFormSubComponents((prevSubs) =>
        prevSubs.map((sc) => {
          const { attributes: scAttrs, rescuedFields: scRescued } =
            cleanProductAttributesWithRescuedFields(sc.attributes || [], {
              brand_make: sc.brand_make,
              model_part_no: sc.model_part_no
            });
          return {
            ...sc,
            unit: normalizeCatalogUnit(sc.unit || 'Nos'),
            brand_make: scRescued.brand_make || sc.brand_make || '',
            model_part_no: scRescued.model_part_no || sc.model_part_no || '',
            attributes: scAttrs
          };
        })
      );
    }

    if (triggerToast) {
      triggerToast(
        'Standardized SI / ISO 80000 units, canonicalized spec keys, and stripped duplicate fields.',
        'success'
      );
    }
  };

  // Apply an extracted AI catalog product item into the Single-Product Add/Edit form fields non-destructively
  const applyExtractedItemToProductForm = async (
    extracted: ExtractedCatalogProductItem,
    detectedCurrency = 'AED',
    allowOverwriteSku = false
  ) => {
    const mult = resolveToAedMultiplier(extracted.currency || detectedCurrency || 'AED');
    const { attributes: cleanedExtractedAttrs, rescuedFields } =
      cleanProductAttributesWithRescuedFields(extracted.attributes || [], {
        brand_make: extracted.brand_make,
        model_part_no: extracted.model_part_no,
        country_of_origin: extracted.country_of_origin,
        availability: extracted.availability,
        hs_code: extracted.hs_code
      });

    if (extracted.name) {
      setFormName(extracted.name.trim());
    }
    if (extracted.family_group_name) {
      setFormProductFamily(extracted.family_group_name.trim());
    }
    if (extracted.variant_label) {
      setFormVariantLabel(formatSiTechnicalValue(extracted.variant_label.trim()));
    }
    if (extracted.sku && (!formSku.trim() || allowOverwriteSku || !editingProduct)) {
      setFormSku(extracted.sku.trim());
    }
    const effBrand = rescuedFields.brand_make || extracted.brand_make;
    if (effBrand) {
      setFormBrandMake(effBrand.trim());
    }
    const effModel = rescuedFields.model_part_no || extracted.model_part_no;
    if (effModel) {
      setFormModelPartNo(effModel.trim());
    }
    const effOrigin = rescuedFields.country_of_origin || extracted.country_of_origin;
    if (effOrigin) {
      setFormCountryOfOrigin(effOrigin.trim());
    }
    const effHs = rescuedFields.hs_code || extracted.hs_code;
    if (effHs) {
      setFormHsCode(effHs.trim());
    }
    const effAvail = normalizeLeadTime(rescuedFields.availability || extracted.availability);
    if (effAvail) {
      setFormDefaultAvailability(effAvail);
    }
    if (extracted.unit) {
      setFormUnit(normalizeCatalogUnit(extracted.unit.trim()));
    }
    if (typeof extracted.unit_price === 'number' && extracted.unit_price > 0) {
      setFormUnitPrice(Math.round(extracted.unit_price * mult * 100) / 100);
    }
    if (typeof extracted.cost_price === 'number' && extracted.cost_price > 0) {
      setFormCostPrice(Math.round(extracted.cost_price * mult * 100) / 100);
    }
    if (extracted.category) {
      const catClean = extracted.category.trim();
      const existingMatch = productCategories.find(
        (c) => c.toLowerCase() === catClean.toLowerCase()
      );
      if (existingMatch) {
        setFormProductType(existingMatch);
      } else if (catClean) {
        setFormProductType(catClean);
        try {
          const res = await safeAddDoc('dropdown_product_categories', {
            name: catClean,
            workspace_id: activeWorkspace?.id || undefined
          });
          const newCatDoc: DropdownOption = {
            id: res?.id || `cat_${Date.now()}`,
            name: catClean,
            workspace_id: activeWorkspace?.id
          };
          if (setProductCategories) {
            setProductCategories((prev) => [...prev, newCatDoc]);
          }
          const rawLs = localStorage.getItem('omni_product_categories');
          const parsedLs: any[] = rawLs ? JSON.parse(rawLs) : [];
          localStorage.setItem('omni_product_categories', JSON.stringify([...parsedLs, newCatDoc]));
        } catch {
          // ignore
        }
      }
    }
    if (cleanedExtractedAttrs.length > 0) {
      setFormAttributes((prev) => {
        const merged = cleanProductAttributesWithRescuedFields(
          mergeParentAndVariantAttributes(
            prev.filter((a) => a.key.trim() !== ''),
            cleanedExtractedAttrs
          ),
          {
            brand_make: effBrand || formBrandMake,
            model_part_no: effModel || formModelPartNo,
            country_of_origin: effOrigin || formCountryOfOrigin,
            availability: effAvail || formDefaultAvailability,
            hs_code: effHs || formHsCode
          }
        ).attributes;
        return merged.length > 0 ? merged : cleanedExtractedAttrs;
      });
    }
    const rawExtractedDesc = (extracted.description || '').trim();
    const cleanExtractedDesc =
      rawExtractedDesc &&
      rawExtractedDesc.toLowerCase() !== (extracted.name || '').trim().toLowerCase()
        ? rawExtractedDesc
        : '';
    if (cleanExtractedDesc) {
      setFormDescription(cleanExtractedDesc);
    } else if (extracted.name || cleanedExtractedAttrs.length > 0) {
      setFormDescription(
        compileDescriptionWithSpecs(
          (extracted.name || formName || '').trim(),
          '',
          cleanedExtractedAttrs
        )
      );
    }
    if (extracted.is_composite_set && Array.isArray(extracted.sub_components) && extracted.sub_components.length > 0) {
      setFormIsCompositeSet(true);
      setFormSubComponents(
        extracted.sub_components.map((sc, idx) => {
          const { attributes: scCleanAttrs, rescuedFields: scRescued } =
            cleanProductAttributesWithRescuedFields(sc.attributes || [], {
              brand_make: sc.brand_make,
              model_part_no: sc.model_part_no
            });
          return {
            id: `comp_ai_${Date.now()}_${idx}`,
            sn: String(idx + 1),
            item_name: sc.item_name,
            quantity: sc.quantity || 1,
            unit: normalizeCatalogUnit(sc.unit || 'Nos'),
            description: sc.description || '',
            brand_make: scRescued.brand_make || sc.brand_make || '',
            model_part_no: scRescued.model_part_no || sc.model_part_no || '',
            unit_price: Number(sc.unit_price) ? Math.round(Number(sc.unit_price) * mult * 100) / 100 : 0,
            total_price: Number(sc.unit_price)
              ? Math.round(Number(sc.unit_price) * (sc.quantity || 1) * mult * 100) / 100
              : 0,
            cost_price: Number(sc.cost_price) ? Math.round(Number(sc.cost_price) * mult * 100) / 100 : 0,
            is_included_accessory: sc.is_included_accessory !== false,
            attributes: scCleanAttrs
          };
        })
      );
    }
  };

  const handleRunSingleProductAiAutofill = async (
    scanMode: 'fast' | 'deep' = 'fast',
    explicitFile?: File | null
  ) => {
    const targetFile = explicitFile !== undefined ? explicitFile : formAiFile;
    if (!targetFile && !formAiRawText.trim()) {
      if (triggerToast) {
        triggerToast('Drop a datasheet/file or paste raw specifications first.', 'error');
      }
      return;
    }

    setFormAiLoading(true);
    setFormAiStatus('Preparing specification source...');
    try {
      let content = formAiRawText.trim();
      let isBase64 = false;
      let mimeType = 'text/plain';
      let fileName = 'Pasted_Product_Specs.txt';

      if (targetFile) {
        const prepped = await prepareCatalogFileForAiExtraction(targetFile, (msg) =>
          setFormAiStatus(msg)
        );
        content = prepped.content;
        isBase64 = prepped.isBase64;
        mimeType = prepped.mimeType;
        fileName = prepped.fileName;
        if (prepped.extractedPlainTextPreview && !formAiRawText.trim()) {
          setFormAiRawText(prepped.extractedPlainTextPreview);
        }
        // Automatically attach PDF as Technical Datasheet or Image as Product Photo if none is attached yet
        if (
          (targetFile.type === 'application/pdf' || targetFile.name.toLowerCase().endsWith('.pdf')) &&
          !formDatasheetAttachment
        ) {
          void handleDatasheetUpload(targetFile);
        } else if (targetFile.type.startsWith('image/') && !formImageUrl) {
          void handleProductImageUpload(targetFile);
        }
      }

      const parentCandidatesForContext = activeCatalogProducts.filter(
        (p) => !p.variant_parent_id && !(p as any).parent_product_id
      );
      const sortedParents = [...parentCandidatesForContext].sort((a, b) => {
        const aIsFam = Boolean((a as any).has_variants || a.product_family) ? 1 : 0;
        const bIsFam = Boolean((b as any).has_variants || b.product_family) ? 1 : 0;
        return bIsFam - aIsFam;
      });
      const seenFam = new Set<string>();
      const existingParentFamilies: Array<{ name: string; category?: string; unit?: string }> = [];
      for (const p of sortedParents) {
        const famName = (p.product_family || p.name || '').trim();
        if (!famName) continue;
        const key = famName.toLowerCase();
        if (seenFam.has(key)) continue;
        seenFam.add(key);
        existingParentFamilies.push({
          name: famName,
          category: p.product_type || undefined,
          unit: p.unit || undefined
        });
        if (existingParentFamilies.length >= 60) break;
      }

      const batch = await extractCatalogProductsWithAI({
        content,
        isBase64,
        mimeType,
        fileName,
        existingCategories: productCategories,
        existingParentFamilies,
        workspaceCatalogGuidelines:
          workspaceCatalogGuidelines || activeWorkspace?.catalog_ai_guidelines || '',
        preferredModel: formAiModel,
        onStatusUpdate: (msg) => setFormAiStatus(msg),
        scanMode
      });

      if (!batch.products || batch.products.length === 0) {
        if (triggerToast) {
          triggerToast('No structured product specs detected. Try Deep Scan or clearer text.', 'error');
        }
        return;
      }

      const detectedCurr = batch.currency || 'AED';
      setFormAiDetectedVariants(batch.products);
      setFormAiDetectedCurrency(detectedCurr);
      setFormAiSelectedVariantIdx(0);
      await applyExtractedItemToProductForm(batch.products[0], detectedCurr);

      if (triggerToast) {
        if (batch.products.length > 1) {
          const firstFam = (batch.products[0].family_group_name || '').trim().toLowerCase();
          const allShareFamily =
            Boolean(firstFam) &&
            batch.products.every(
              (p) => (p.family_group_name || '').trim().toLowerCase() === firstFam
            );
          triggerToast(
            allShareFamily
              ? `Autofilled first variant & detected ${batch.products.length} total variants in source! Use the banner to switch or import all ${batch.products.length} variants.`
              : `Autofilled first item & detected ${batch.products.length} total items in source! Use the banner to switch or import all ${batch.products.length} items.`,
            'success'
          );
        } else {
          triggerToast(
            `AI Autofill populated "${batch.products[0].name}" (${(batch.products[0].attributes || []).length} specs)!`,
            'success'
          );
        }
      }
    } catch (err: any) {
      if (triggerToast) {
        triggerToast(`AI Autofill error: ${err?.message || 'Failed to extract specs'}`, 'error');
      }
    } finally {
      setFormAiLoading(false);
      setFormAiStatus('');
    }
  };

  // 1-Click Make Variant Of (converts any existing standalone item into a child variant of a chosen parent)
  const handleMakeProductVariantOf = async (childProd: Product, parentProd: Product) => {
    if (!childProd.id || !parentProd.id || childProd.id === parentProd.id) return;
    const rootParentId = (parentProd as any).parent_product_id || parentProd.variant_parent_id || parentProd.id;
    const familyName = (parentProd.product_family || parentProd.name || '').trim();
    const suggestedLabel =
      (childProd as any).variant_label ||
      deriveSuggestedVariantLabel(
        {
          item_name: childProd.name,
          model_part_no: childProd.model_part_no,
          attributes: childProd.attributes
        },
        parentProd
      );
    const mergedAttrs = mergeParentAndVariantAttributes(parentProd.attributes, childProd.attributes);
    const nowIso = new Date().toISOString();

    const childPatch: Partial<Product> & Record<string, any> = {
      variant_parent_id: rootParentId,
      parent_product_id: rootParentId,
      variant_label: suggestedLabel,
      product_family: familyName || childProd.product_family || parentProd.name,
      attributes: mergedAttrs,
      updatedAt: nowIso
    };
    const parentPatch: Partial<Product> & Record<string, any> = {
      has_variants: true,
      product_family: familyName || parentProd.name,
      updatedAt: nowIso
    };

    try {
      const updatedChild = { ...childProd, ...childPatch } as Product;
      const updatedParent = { ...parentProd, ...parentPatch } as Product;
      await safeUpdateDoc('products', childProd.id, sanitizeFirestorePayload(updatedChild));
      await safeUpdateDoc('products', parentProd.id, sanitizeFirestorePayload(updatedParent));
      const nextList = products.map((item) => {
        if (item.id === childProd.id) return updatedChild;
        if (item.id === parentProd.id) return updatedParent;
        return item;
      });
      if (setProducts) setProducts(nextList);
      await MetadataRepository.upsertLocalProduct(updatedChild).catch(() => {});
      await MetadataRepository.upsertLocalProduct(updatedParent).catch(() => {});
      setQuickLinkVariantTargetId(null);
      setQuickLinkParentSearch('');
      if (triggerToast) {
        triggerToast(
          `Linked "${childProd.name}" as a Variant (${suggestedLabel}) of "${parentProd.name}".`,
          'success'
        );
      }
    } catch (err: any) {
      if (triggerToast) {
        triggerToast(`Failed to link variant: ${err?.message || 'Error'}`, 'error');
      }
    }
  };

  // 1-Click Detach Variant as Standalone Product
  const handleDetachProductVariant = async (variantProd: Product) => {
    if (!variantProd.id) return;
    const nowIso = new Date().toISOString();
    const formerParentId =
      variantProd.variant_parent_id || (variantProd as any).parent_product_id || null;
    const resolvedStandalone = resolveEffectiveCatalogProduct(variantProd, activeCatalogProducts);
    const patch: Partial<Product> & Record<string, any> = {
      variant_parent_id: null,
      parent_product_id: null,
      variant_label: null,
      product_family: null,
      attributes: resolvedStandalone.attributes || variantProd.attributes || [],
      image_url: resolvedStandalone.image_url || variantProd.image_url,
      brand_make: resolvedStandalone.brand_make || variantProd.brand_make,
      country_of_origin: resolvedStandalone.country_of_origin || variantProd.country_of_origin,
      updatedAt: nowIso
    };
    try {
      const updatedProd = { ...variantProd, ...patch } as Product;
      await safeUpdateDoc('products', variantProd.id, sanitizeFirestorePayload(updatedProd));
      let updatedParentObj: Product | null = null;
      if (formerParentId) {
        const remainingSiblings = activeCatalogProducts.filter(
          (item) =>
            item.id !== variantProd.id &&
            !item.is_deleted &&
            (item.variant_parent_id === formerParentId ||
              (item as any).parent_product_id === formerParentId)
        );
        if (remainingSiblings.length === 0) {
          const parentProd = products.find((p) => p.id === formerParentId);
          if (parentProd) {
            updatedParentObj = {
              ...parentProd,
              has_variants: false,
              updatedAt: nowIso
            } as Product;
            await safeUpdateDoc(
              'products',
              formerParentId,
              sanitizeFirestorePayload(updatedParentObj)
            ).catch(() => {});
            await MetadataRepository.upsertLocalProduct(updatedParentObj).catch(() => {});
          }
        }
      }
      const nextList = products.map((item) => {
        if (item.id === variantProd.id) return updatedProd;
        if (updatedParentObj && item.id === updatedParentObj.id) return updatedParentObj;
        return item;
      });
      if (setProducts) setProducts(nextList);
      await MetadataRepository.upsertLocalProduct(updatedProd).catch(() => {});
      setQuickLinkVariantTargetId(null);
      if (triggerToast) {
        triggerToast(`Detached "${variantProd.name}" as a standalone product.`, 'info');
      }
    } catch (err: any) {
      if (triggerToast) {
        triggerToast(`Failed to detach variant: ${err?.message || 'Error'}`, 'error');
      }
    }
  };

  // 1-Click Extract / Create Parent Family from a Standalone Item (e.g. "AVENTURA Dosing Tank (40 L)" -> Parent "AVENTURA Dosing Tank")
  const handleCreateParentFamilyFromItem = async (sourceItem?: Product | null) => {
    const rawTitle = (sourceItem ? sourceItem.name : formName || editingProduct?.name || '').trim();
    if (!rawTitle) {
      if (triggerToast) triggerToast('Enter a product name first before extracting a Parent Family.', 'error');
      return;
    }

    // Strip trailing parenthetical size/capacity e.g. "(40 L)" or trailing dimension/flow specs e.g. "15LPH @ 3 Bar", "48\" x 72\""
    let parentTitle = rawTitle;
    let extractedSuffix = '';
    const parenMatch = rawTitle.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
    if (parenMatch && parenMatch[1].trim().length >= 3) {
      parentTitle = parenMatch[1].trim();
      extractedSuffix = parenMatch[2].trim();
    } else {
      const ratingMatch = rawTitle.match(
        /^(.+?)\s+[-–—,]?\s*(\d+(?:\.\d+)?\s*(?:LPH|GPM|M3\/H|L|Ltr|Litres?|Gal|Bar|PSI|kW|HP|mm|inch|in|["”])(?:\s*@\s*\d+(?:\.\d+)?\s*(?:Bar|PSI|m))?.*)$/i
      );
      if (ratingMatch && ratingMatch[1].trim().length >= 3) {
        parentTitle = ratingMatch[1].trim();
        extractedSuffix = ratingMatch[2].trim();
      }
    }

    const currentAttrs = sourceItem ? sourceItem.attributes || [] : formAttributes;
    const varyingKeyRegex = /^(size|dimension|dimensions|dimensions \/ size|diameter|vessel size|capacity|capacity \/ rating|volume|flow|flow rate|rating|model|model no|part no|pressure|operating pressure|output|power|voltage)$/i;

    const parentAttributes: ProductAttribute[] = [];
    for (const attr of currentAttrs) {
      const k = (attr.key || '').trim();
      const v = (attr.value || '').trim();
      if (!k) continue;
      if (/^(brand|make|manufacturer|brand\s*\/\s*make)$/i.test(k)) continue;
      if (varyingKeyRegex.test(k)) {
        // Keep the key as a blank template slot on the parent so future variants/RFQs prompt for it
        parentAttributes.push({ key: k, value: '' });
      } else {
        parentAttributes.push({ key: k, value: v });
      }
    }

    const derivedVariantLabel =
      (sourceItem ? (sourceItem as any).variant_label : formVariantLabel)?.trim() ||
      deriveSuggestedVariantLabel(
        {
          item_name: rawTitle,
          model_part_no: sourceItem ? sourceItem.model_part_no : formModelPartNo,
          attributes: currentAttrs
        },
        {
          name: parentTitle,
          product_type: (sourceItem ? sourceItem.product_type : formProductType) || 'General Equipment',
          description: parentTitle,
          unit: ((sourceItem ? sourceItem.unit : formUnit) || 'Nos') as UnitType,
          attributes: parentAttributes
        }
      ) ||
      extractedSuffix ||
      'Standard Variant';

    // Check if a Parent Product with this exact family name already exists
    const existingParent = activeCatalogProducts.find(
      (cand) =>
        cand.id !== (sourceItem?.id || editingProduct?.id) &&
        !cand.variant_parent_id &&
        !(cand as any).parent_product_id &&
        (cand.name || '').trim().toLowerCase() === parentTitle.toLowerCase()
    );

    const nowIso = new Date().toISOString();
    try {
      let targetParent: Product;
      if (existingParent) {
        const parentPatch: Partial<Product> & Record<string, any> = {
          has_variants: true,
          product_family: parentTitle,
          brand_make: existingParent.brand_make || (sourceItem ? sourceItem.brand_make : formBrandMake) || undefined,
          image_url: existingParent.image_url || (sourceItem ? sourceItem.image_url : formImageUrl) || undefined,
          updatedAt: nowIso
        };
        targetParent = { ...existingParent, ...parentPatch } as Product;
        await safeUpdateDoc('products', existingParent.id!, sanitizeFirestorePayload(targetParent));
        await MetadataRepository.upsertLocalProduct(targetParent).catch(() => {});
      } else {
        const brandVal = (sourceItem ? sourceItem.brand_make : formBrandMake).trim();
        const catVal = (sourceItem ? sourceItem.product_type : formProductType) || 'General Equipment';
        const unitVal = ((sourceItem ? sourceItem.unit : formUnit) || 'Nos') as UnitType;
        const imgVal = (sourceItem ? sourceItem.image_url : formImageUrl).trim();
        const secImgVal = (sourceItem ? sourceItem.secondary_image_url : formSecondaryImageUrl).trim();
        const originVal = (sourceItem ? sourceItem.country_of_origin : formCountryOfOrigin).trim();
        const hsVal = (sourceItem ? sourceItem.hs_code : formHsCode).trim();
        const leadVal = (sourceItem ? sourceItem.default_availability : formDefaultAvailability).trim();
        const dsVal = sourceItem ? sourceItem.datasheet_attachment : formDatasheetAttachment;

        const parentPayload: Partial<Product> & Record<string, any> = {
          workspace_id: activeWorkspace?.id || 'ws_default',
          name: parentTitle,
          product_family: parentTitle,
          has_variants: true,
          product_type: catVal,
          description:
            compileDescriptionWithSpecs(
              parentTitle,
              parentTitle,
              parentAttributes.filter((a) => a.key && a.value)
            ) || parentTitle,
          unit: unitVal,
          unit_price: 0,
          currency: 'AED',
          brand_make: brandVal || undefined,
          default_availability: leadVal || undefined,
          country_of_origin: originVal || undefined,
          hs_code: hsVal || undefined,
          image_url: imgVal || undefined,
          secondary_image_url: secImgVal || undefined,
          datasheet_attachment: dsVal || undefined,
          attributes: parentAttributes,
          is_inventoried: false,
          stock_on_hand: 0,
          stock_reserved: 0,
          search_terms: generateProductSearchTerms(parentTitle, catVal, '', brandVal),
          createdAt: nowIso,
          updatedAt: nowIso
        };
        const cleanParentPayload = sanitizeFirestorePayload(parentPayload);
        const docRef = await safeAddDoc('products', cleanParentPayload);
        const newParentId = docRef?.id || `prod_parent_${Date.now()}`;
        targetParent = { id: newParentId, ...cleanParentPayload } as Product;
        await MetadataRepository.upsertLocalProduct(targetParent).catch(() => {});
      }

      const targetChild = sourceItem || editingProduct;
      if (targetChild?.id) {
        const mergedChildAttrs = mergeParentAndVariantAttributes(targetParent.attributes, currentAttrs);
        const childPatch: Partial<Product> & Record<string, any> = {
          variant_parent_id: targetParent.id,
          parent_product_id: targetParent.id,
          variant_label: derivedVariantLabel,
          product_family: parentTitle,
          attributes: mergedChildAttrs,
          updatedAt: nowIso
        };
        const updatedChild = { ...targetChild, ...childPatch } as Product;
        await safeUpdateDoc('products', targetChild.id, sanitizeFirestorePayload(updatedChild));
        await MetadataRepository.upsertLocalProduct(updatedChild).catch(() => {});

        if (setProducts) {
          setProducts((prev) => {
            const withoutParent = prev.filter((item) => item.id !== targetParent.id);
            return [
              targetParent,
              ...withoutParent.map((item) => (item.id === updatedChild.id ? updatedChild : item))
            ];
          });
        }
      } else if (setProducts) {
        setProducts((prev) => [targetParent, ...prev.filter((item) => item.id !== targetParent.id)]);
      }

      setFormVariantParentId(targetParent.id || null);
      setFormVariantLabel(derivedVariantLabel);
      setFormProductFamily(parentTitle);
      setQuickLinkVariantTargetId(null);

      if (triggerToast) {
        triggerToast(
          `Created Parent Family "${parentTitle}" and linked "${rawTitle}" as Variant (${derivedVariantLabel})!`,
          'success'
        );
      }
    } catch (err: any) {
      if (triggerToast) {
        triggerToast(`Failed to create Parent Family: ${err?.message || 'Error'}`, 'error');
      }
    }
  };

  // 1-Click Duplicate / Clone Product for standalone copies
  const openDuplicateModal = (p: Product) => {
    resetFormAiAutofillState();
    setEditingProduct(null);
    setPendingDeletedStorageUrls([]);
    setFormVariantParentId(null);
    setFormVariantLabel('');
    setFormProductFamily('');
    setIsCreatingCategory(false);
    setNewCategoryInput('');
    setIsCreatingUnit(false);
    setNewUnitInput('');
    setActiveFormTab('overview');
    setFormName(`${p.name || p.description} (Copy)`);
    setFormProductType(p.product_type || productCategories[0] || 'General Equipment');
    setFormDescription(compileDescriptionWithSpecs(p.name || '', p.description || '', p.attributes || []) || p.description || '');
    setFormUnit(p.unit && p.unit !== 'Custom Unit' ? p.unit : 'Nos');
    setFormUnitPrice(p.unit_price ?? undefined);
    setFormCostPrice(p.cost_price ?? undefined);
    setFormIsCompositeSet(Boolean(p.is_composite_set));
    setFormSubComponents((p.sub_components || []).map((c, idx) => ({ ...c, id: `comp_${Date.now()}_${idx}` })));
    setFormPackagePricingMode(p.package_pricing_mode || 'itemized');
    setFormOptionScopeNotes(p.option_scope_notes || '');
    setFormSku(p.sku ? `${p.sku}-COPY` : '');
    setFormBrandMake(p.brand_make || '');
    setFormModelPartNo(p.model_part_no || '');
    setFormDefaultAvailability(p.default_availability || '');
    setFormImageUrl(p.image_url || '');
    setFormSecondaryImageUrl(p.secondary_image_url || '');
    setFormImageCaption(p.image_caption || '');
    setFormSecondaryImageCaption(p.secondary_image_caption || '');
    setFormImageAdjustments(p.image_adjustments);
    setFormDatasheetAttachment(p.datasheet_attachment);
    setFormAttributes((p.attributes || []).map((a) => ({ ...a })));
    setFormIsInventoried(Boolean(p.is_inventoried));
    setFormStockOnHand(0);
    setFormReorderLevel(p.reorder_level ?? 0);
    setFormStorageLocation(p.storage_location || '');
    setFormHsCode(p.hs_code || '');
    setFormCountryOfOrigin(p.country_of_origin || '');
    setFormGrossWeightKg(p.gross_weight_kg ?? undefined);
    setShowFormModal(true);
    if (triggerToast) {
      triggerToast(`Cloned "${p.name || p.description}". Adjust details & click Register Product.`, 'info');
    }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!formName.trim()) {
      if (triggerToast) {
        triggerToast('Product name is required.', 'error');
      }
      setActiveFormTab('overview');
      return;
    }

    if (formSku.trim()) {
      const isDuplicate = activeCatalogProducts.some(
        (p) => p.sku && p.sku.trim().toLowerCase() === formSku.trim().toLowerCase() && p.id !== editingProduct?.id
      );
      if (isDuplicate) {
        if (triggerToast) {
          triggerToast(`SKU "${formSku.trim()}" is already assigned to another active catalog product.`, 'error');
        }
        setActiveFormTab('overview');
        return;
      }
    }

    if (!activeWorkspace?.id) {
      setIsSubmitting(false);
      if (triggerToast) {
        triggerToast('Active workspace context lost. Cannot save product.', 'error');
      }
      return;
    }

    setIsSubmitting(true);

    // Allow saving attribute keys with empty values (placeholder template keys to be filled in per RFQ)
    const rawCleanAttributes: ProductAttribute[] = formAttributes
      .map((a) => ({ key: a.key.trim(), value: a.value.trim() }))
      .filter((a) => a.key !== '');

    const linkedParentProduct = formVariantParentId
      ? activeCatalogProducts.find((p) => p.id === formVariantParentId && p.id !== editingProduct?.id)
      : null;

    const cleanAttributes: ProductAttribute[] = linkedParentProduct
      ? mergeParentAndVariantAttributes(linkedParentProduct.attributes, rawCleanAttributes)
      : rawCleanAttributes;

    const resolvedBrand =
      formBrandMake.trim() ||
      cleanAttributes.find((a) => /^(brand|make|manufacturer)$/i.test(a.key))?.value ||
      linkedParentProduct?.brand_make ||
      undefined;
    const resolvedModel =
      formModelPartNo.trim() ||
      cleanAttributes.find((a) => /^(model|model no|part no)$/i.test(a.key))?.value ||
      undefined;

    const resolvedVariantLabel = formVariantParentId
      ? formVariantLabel.trim() ||
        deriveSuggestedVariantLabel(
          {
            item_name: formName.trim(),
            model_part_no: resolvedModel,
            attributes: rawCleanAttributes
          },
          linkedParentProduct
        )
      : null;

    const searchTerms = generateProductSearchTerms(
      formName.trim(),
      formProductType,
      formSku.trim(),
      resolvedBrand || resolvedModel || resolvedVariantLabel || undefined
    );

    const fallbackSell =
      typeof formUnitPrice === 'number' && !isNaN(formUnitPrice) && formUnitPrice >= 0
        ? formUnitPrice
        : undefined;
    const fallbackCost =
      typeof formCostPrice === 'number' && !isNaN(formCostPrice) && formCostPrice >= 0
        ? formCostPrice
        : undefined;

    const computedBomTotals =
      formIsCompositeSet && formSubComponents.length > 0
        ? recalculateCompositeItemTotals(formSubComponents, 1, fallbackSell, fallbackCost)
        : null;

    const finalSellingPrice =
      computedBomTotals && computedBomTotals.unitSellingPrice > 0
        ? computedBomTotals.unitSellingPrice
        : fallbackSell;

    const finalCostPrice =
      computedBomTotals && computedBomTotals.unitCostPrice > 0
        ? computedBomTotals.unitCostPrice
        : fallbackCost;

    const latestLiveProd =
      editingProduct?.id
        ? products.find((p) => p.id === editingProduct.id) || editingProduct
        : editingProduct;

    const initialFormStockOnHand = Number(editingProduct?.stock_on_hand ?? 0);
    const currentFormStockOnHand = Number(formStockOnHand ?? 0);
    const didUserChangeStockOnHand =
      !editingProduct || currentFormStockOnHand !== initialFormStockOnHand;
    const stockOnHandDelta = currentFormStockOnHand - initialFormStockOnHand;

    const resolvedStockOnHand = formIsInventoried
      ? !editingProduct
        ? currentFormStockOnHand
        : didUserChangeStockOnHand
        ? Math.max(
            0,
            Number(latestLiveProd?.stock_on_hand ?? initialFormStockOnHand) + stockOnHandDelta
          )
        : Number(latestLiveProd?.stock_on_hand ?? initialFormStockOnHand)
      : undefined;

    const resolvedStockReserved = latestLiveProd
      ? Number(latestLiveProd.stock_reserved ?? editingProduct?.stock_reserved ?? 0)
      : 0;

    const resolvedFamilyName = linkedParentProduct
      ? (linkedParentProduct.product_family || linkedParentProduct.name || formProductFamily || formName).trim()
      : (formProductFamily || formName).trim();

    const data: Partial<Product> & Record<string, any> = {
      workspace_id: activeWorkspace.id,
      name: formName.trim(),
      product_type: formProductType || 'General',
      description: compileDescriptionWithSpecs(formName.trim(), formDescription.trim(), cleanAttributes) || formDescription.trim() || formName.trim(),
      unit: formUnit || (formIsCompositeSet ? 'SET' : 'Nos'),
      unit_price: finalSellingPrice,
      cost_price: finalCostPrice,
      is_composite_set: formIsCompositeSet,
      sub_components: formIsCompositeSet ? formSubComponents : undefined,
      package_pricing_mode: formIsCompositeSet ? formPackagePricingMode : undefined,
      option_scope_notes: formIsCompositeSet && formOptionScopeNotes.trim() ? formOptionScopeNotes.trim() : undefined,
      sku: formSku.trim() || undefined,
      variant_parent_id: formVariantParentId || null,
      parent_product_id: formVariantParentId || null,
      variant_label: resolvedVariantLabel,
      product_family: resolvedFamilyName || undefined,
      brand_make: resolvedBrand,
      model_part_no: resolvedModel,
      default_availability: formDefaultAvailability.trim() || undefined,
      image_url: formImageUrl.trim() || (null as any),
      ...(formImageUrl.trim() ? {} : { image_storage_key: null as any }),
      secondary_image_url: formSecondaryImageUrl.trim() || (null as any),
      ...(formSecondaryImageUrl.trim() ? {} : { secondary_image_storage_key: null as any }),
      image_caption: formImageCaption.trim() || undefined,
      secondary_image_caption: formSecondaryImageCaption.trim() || undefined,
      image_adjustments: formImageAdjustments || undefined,
      datasheet_attachment: formDatasheetAttachment || (null as any),
      ...(formDatasheetAttachment
        ? {}
        : { datasheet_storage_key: null as any, datasheet_url: null as any }),
      attributes: cleanAttributes,
      search_terms: searchTerms,
      is_inventoried: formIsInventoried,
      stock_on_hand: resolvedStockOnHand,
      stock_reserved: resolvedStockReserved,
      reorder_level: formIsInventoried ? Number(formReorderLevel || 0) : undefined,
      storage_location: formIsInventoried && formStorageLocation.trim() ? formStorageLocation.trim() : undefined,
      hs_code: formHsCode.trim() || linkedParentProduct?.hs_code || undefined,
      country_of_origin: formCountryOfOrigin.trim() || linkedParentProduct?.country_of_origin || undefined,
      gross_weight_kg:
        typeof formGrossWeightKg === 'number' && !isNaN(formGrossWeightKg) && formGrossWeightKg >= 0
          ? formGrossWeightKg
          : undefined,
      updatedAt: new Date().toISOString()
    };

    try {
      let savedTargetId = editingProduct?.id || '';
      let updatedParentObj: Product | null = null;
      if (linkedParentProduct && linkedParentProduct.id) {
        const parentUpdatePatch: Partial<Product> & Record<string, any> = {
          has_variants: true,
          product_family: resolvedFamilyName || linkedParentProduct.name,
          updatedAt: new Date().toISOString()
        };
        updatedParentObj = { ...linkedParentProduct, ...parentUpdatePatch } as Product;
        await safeUpdateDoc('products', linkedParentProduct.id, sanitizeFirestorePayload(updatedParentObj)).catch(() => {});
        await MetadataRepository.upsertLocalProduct(updatedParentObj).catch(() => {});
      }

      if (editingProduct && editingProduct.id) {
        const updatedProd: Product = { ...latestLiveProd, ...data, id: editingProduct.id } as Product;
        const sanitizedPayload = sanitizeFirestorePayload(updatedProd);
        await safeUpdateDoc('products', editingProduct.id, sanitizedPayload);
        const nextList = products.map((p) => {
          if (p.id === editingProduct.id) return updatedProd;
          if (updatedParentObj && p.id === updatedParentObj.id) return updatedParentObj;
          return p;
        });
        if (setProducts) {
          setProducts(nextList);
        }
        await MetadataRepository.upsertLocalProduct(updatedProd).catch(() => {});
        savedTargetId = editingProduct.id;
      } else {
        const tempId = 'prod_' + Date.now();
        const sanitizedCreate = sanitizeFirestorePayload({
          ...data,
          id: tempId,
          createdAt: new Date().toISOString()
        });
        const { id: _ignoreId, ...createPayload } = sanitizedCreate;
        const res = await safeAddDoc('products', createPayload);
        const newId = res?.id || tempId;
        const newProd: Product = { id: newId, ...data } as Product;
        const nextList = [
          newProd,
          ...products
            .filter((p) => p.id !== newId)
            .map((p) => (updatedParentObj && p.id === updatedParentObj.id ? updatedParentObj : p))
        ];
        if (setProducts) {
          setProducts(nextList);
        }
        await MetadataRepository.upsertLocalProduct(newProd).catch(() => {});
        savedTargetId = newId;
      }

      // Now that the product save succeeded, flush any deferred media deletions that are not referenced by another active product
      if (pendingDeletedStorageUrls.length > 0) {
        const activeFinalUrls = new Set(
          [formImageUrl.trim(), formSecondaryImageUrl.trim(), formDatasheetAttachment?.url || ''].filter(Boolean)
        );
        for (const oldUrl of pendingDeletedStorageUrls) {
          if (!oldUrl || activeFinalUrls.has(oldUrl)) continue;
          const stillReferencedElsewhere = products.some(
            (p) =>
              p.id !== savedTargetId &&
              !p.is_deleted &&
              (p.image_url === oldUrl ||
                p.secondary_image_url === oldUrl ||
                p.datasheet_attachment?.url === oldUrl)
          );
          if (!stillReferencedElsewhere) {
            deleteFromStorageBucket(oldUrl, (activeWorkspace as any)?.settings || activeWorkspace).catch(() => {});
          }
        }
        setPendingDeletedStorageUrls([]);
      }

      if (triggerToast) {
        triggerToast(
          editingProduct
            ? `Product "${formName.trim()}" updated successfully.`
            : `Product "${formName.trim()}" registered in catalog.`,
          'success'
        );
      }
      setShowFormModal(false);
    } catch (err: any) {
      if (triggerToast) {
        triggerToast('Failed to save product: ' + err.message, 'error');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteProduct = async (p: Product) => {
    const targetId = p.id || (p as any)._id;
    if (!targetId) {
      if (triggerToast) {
        triggerToast('Error: Product ID is missing. Cannot delete.', 'error');
      }
      return;
    }

    if (p.stock_reserved && p.stock_reserved > 0) {
      setConfirmDialog({
        isOpen: true,
        title: 'Active Stock Reservation',
        message: `"${p.name || p.description}" has ${p.stock_reserved} unit(s) reserved for active orders. Release reservations before moving this product to the Recycle Bin.`,
        confirmText: 'Understood',
        isDestructive: false,
        onConfirm: async () => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))
      });
      return;
    }

    setConfirmDialog({
      isOpen: true,
      title: 'Move Product to Recycle Bin',
      message: `Move "${p.name || p.description}" to the Recycle Bin? It will be hidden from the active catalog and enquiry pickers, and can be restored anytime from the Recycle Bin.`,
      confirmText: 'Move to Recycle Bin',
      cancelText: 'Cancel',
      isDestructive: true,
      onConfirm: async () => {
        try {
          const deletedAtIso = new Date().toISOString();
          const deletedByName = user?.full_name || user?.username || 'Unknown';
          const deletedProd: Product = {
            ...p,
            id: targetId,
            is_deleted: true,
            deleted: true,
            deleted_at: deletedAtIso,
            deleted_by_uid: user?.uid,
            deleted_by_name: deletedByName
          };
          const nextList = products.map((prod) => (prod.id === targetId ? deletedProd : prod));
          if (setProducts) {
            setProducts(nextList);
          }
          await MetadataRepository.upsertLocalProduct(deletedProd).catch(() => {});
          await safeUpdateDoc('products', targetId, {
            is_deleted: true,
            deleted: true,
            deleted_at: deletedAtIso,
            deleted_by_uid: user?.uid || null,
            deleted_by_name: deletedByName
          });
          if (triggerToast) {
            triggerToast(`Moved "${p.name || p.description}" to Recycle Bin.`, 'info');
          }
        } catch (err: any) {
          if (triggerToast) {
            triggerToast('Failed to delete product: ' + err.message, 'error');
          }
        }
      }
    });
  };

  return (
    <div className="w-full">
      <PageHeader
        title="Products Catalog"
        subtitle="Manage catalog SKUs, spec variants, datasheets, pricing, and live inventory."
        icon={Package}
        badge={{ text: `${activeCatalogProducts.length} SKUs`, variant: 'blue' }}
        currentUser={user}
        onOpenSidebar={onOpenMobileMenu}
        beforePrimaryActions={
          <div className="relative" ref={toolsDropdownRef}>
            <button
              type="button"
              onClick={() => setIsToolsDropdownOpen((prev) => !prev)}
              className="h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 shadow-2xs transition cursor-pointer whitespace-nowrap"
              aria-expanded={isToolsDropdownOpen}
              aria-haspopup="menu"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
              <span>Tools</span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
                  isToolsDropdownOpen ? 'rotate-180' : ''
                }`}
              />
            </button>
            {isToolsDropdownOpen && (
              <div
                role="menu"
                className="absolute right-0 mt-1.5 w-60 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg py-1.5 z-50"
              >
                <div className="px-3 py-1 text-[10px] font-mono font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Catalog &amp; Inventory Tools
                </div>
                {isEditable && (
                  <>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setIsToolsDropdownOpen(false);
                        setAiModalInitialItems(undefined);
                        setAiModalInitialCurrency(undefined);
                        setShowAiCatalogModal(true);
                      }}
                      className="w-full px-3 py-2 text-left text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 transition cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                      <span>AI Scan / Paste Products</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setIsToolsDropdownOpen(false);
                        openGrnModal();
                      }}
                      className="w-full px-3 py-2 text-left text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 transition cursor-pointer"
                    >
                      <ArrowDownToLine className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span>Receive Stock (GRN)</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setIsToolsDropdownOpen(false);
                        openAdjustModal();
                      }}
                      className="w-full px-3 py-2 text-left text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 transition cursor-pointer"
                    >
                      <Sliders className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span>Adjust Stock</span>
                    </button>
                    <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
                  </>
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setIsToolsDropdownOpen(false);
                    setShowLedgerModal(true);
                  }}
                  className="w-full px-3 py-2 text-left text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 transition cursor-pointer"
                >
                  <History className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>Stock Ledger</span>
                </button>
                {canViewConfidentialMargins && onOpenProcurement && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setIsToolsDropdownOpen(false);
                      onOpenProcurement();
                    }}
                    className="w-full px-3 py-2 text-left text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 transition cursor-pointer"
                  >
                    <ShoppingBag className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    <span>Open Procurement</span>
                  </button>
                )}
              </div>
            )}
          </div>
        }
        primaryAction={
          isEditable
            ? {
                label: 'Add Product',
                icon: Plus,
                onClick: openAddModal
              }
            : undefined
        }
      />

      <PageBody className="!py-4 sm:!py-5 !space-y-3.5">
        {/* Compact 4-Card KPI Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiStatCard
            compact
            label="Catalog Items"
            value={activeCatalogProducts.length.toLocaleString()}
            subtext={stockFilter === 'All' ? 'All active catalog SKUs' : 'Click to show all SKUs'}
            icon={<Package className="w-4 h-4" />}
            tone="blue"
            onClick={() => setStockFilter('All')}
            active={stockFilter === 'All'}
          />

          <KpiStatCard
            compact
            label="Tracked Inventory"
            value={inventoriedProducts.length.toLocaleString()}
            subtext={stockFilter === 'Tracked' ? 'Filtering tracked SKUs' : 'Physical inventoried SKUs'}
            icon={<Boxes className="w-4 h-4" />}
            tone="emerald"
            onClick={() => setStockFilter((prev) => (prev === 'Tracked' ? 'All' : 'Tracked'))}
            active={stockFilter === 'Tracked'}
          />

          <KpiStatCard
            compact
            label="Total Stock on Hand"
            value={`${totalStockOnHand.toLocaleString()} units`}
            subtext="Aggregate available inventory"
            icon={<ArrowDownToLine className="w-4 h-4" />}
            tone="indigo"
          />

          <KpiStatCard
            compact
            label="Low Stock Alerts"
            value={lowStockProducts.length.toLocaleString()}
            subtext={
              lowStockProducts.length === 0
                ? 'All reorder thresholds healthy'
                : stockFilter === 'LowStock'
                ? 'Filtering low stock SKUs'
                : 'Below configured min level'
            }
            icon={<AlertTriangle className="w-4 h-4" />}
            tone={lowStockProducts.length > 0 ? 'amber' : 'slate'}
            onClick={() => setStockFilter((prev) => (prev === 'LowStock' ? 'All' : 'LowStock'))}
            active={stockFilter === 'LowStock'}
          />
        </div>

        {/* Unified 2-Row White Toolbar Card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-3 shadow-2xs space-y-2.5">
          {/* Row 1: Classification & Stock Tabs + Variant Family View Toggle */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'All', label: 'All Products', count: stockTabCounts.All },
                  { id: 'CompositeKit', label: 'Kits / BOM', count: stockTabCounts.CompositeKit },
                  { id: 'Tracked', label: 'Tracked', count: stockTabCounts.Tracked },
                  { id: 'LowStock', label: 'Low Stock', count: stockTabCounts.LowStock },
                  { id: 'WithDatasheet', label: 'With Datasheet', count: stockTabCounts.WithDatasheet }
                ] as const
              ).map((tab) => {
                const isSelectedTab = stockFilter === tab.id;
                const isAlertTab = tab.id === 'LowStock' && tab.count > 0;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setStockFilter(tab.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition whitespace-nowrap cursor-pointer ${
                      isSelectedTab
                        ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white shadow-2xs'
                        : 'bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 border-slate-200/80 dark:border-slate-700/80 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono tabular-nums leading-none ${
                        isSelectedTab
                          ? 'bg-white/20 text-white dark:bg-slate-900/15 dark:text-slate-900'
                          : isAlertTab
                          ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                          : 'bg-white dark:bg-slate-900/70 text-slate-500 dark:text-slate-400 border border-slate-200/80 dark:border-slate-700'
                      }`}
                    >
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Compact Segmented View Toggle: Grouped vs Flat */}
            <div className="inline-flex items-center p-0.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 shrink-0">
              <button
                type="button"
                onClick={() => setGroupVariantsByFamily(true)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer whitespace-nowrap ${
                  groupVariantsByFamily
                    ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-2xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
                title="Group sibling product variants under their parent Product Family"
              >
                <GitFork className="w-3 h-3 shrink-0" />
                <span>Grouped</span>
                {variantFamilyCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono tabular-nums leading-none bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300">
                    {variantFamilyCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setGroupVariantsByFamily(false)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer whitespace-nowrap ${
                  !groupVariantsByFamily
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
                title="Show all products as a flat ungrouped list"
              >
                <span>Flat List</span>
              </button>
            </div>
          </div>

          {/* Row 2: Compact h-9 Search & Dropdown Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Search by product name, brand, model, SKU, or spec..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full h-9 pl-9 pr-8 rounded-xl bg-slate-50/70 dark:bg-slate-800/80 focus:bg-white dark:focus:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-sans transition"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => setSearchInput('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                  title="Clear search"
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Category filter */}
            <div className="relative w-full sm:w-44 shrink-0 flex items-center bg-slate-50/70 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 rounded-xl h-9 transition">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                aria-label="Filter by category"
                className="appearance-none w-full bg-transparent pl-3 pr-8 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer h-full font-sans truncate"
              >
                <option value="All">All Categories</option>
                {productCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            </div>

            {/* Brand filter */}
            <div className="relative w-full sm:w-40 shrink-0 flex items-center bg-slate-50/70 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 rounded-xl h-9 transition">
              <select
                value={brandFilter}
                onChange={(e) => setBrandFilter(e.target.value)}
                aria-label="Filter by brand"
                className="appearance-none w-full bg-transparent pl-3 pr-8 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer h-full font-sans truncate"
              >
                <option value="All">All Brands</option>
                {availableBrands.map((brand) => (
                  <option key={brand} value={brand}>
                    {brand}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {/* Conditional Active Filter Strip (Zero Idle Height When Unfiltered) */}
          {hasActiveFilter && (
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                  Showing <strong className="text-slate-800 dark:text-slate-100">{filteredProducts.length}</strong> of{' '}
                  <strong className="text-slate-800 dark:text-slate-100">{activeCatalogProducts.length}</strong> products
                </span>
                {stockFilter !== 'All' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800 text-[11px] font-medium">
                    <span>
                      View:{' '}
                      {stockFilter === 'CompositeKit'
                        ? 'Kits / BOM'
                        : stockFilter === 'LowStock'
                        ? 'Low Stock'
                        : stockFilter === 'WithDatasheet'
                        ? 'With Datasheet'
                        : stockFilter}
                    </span>
                    <button
                      type="button"
                      onClick={() => setStockFilter('All')}
                      className="hover:text-blue-900 dark:hover:text-blue-100 cursor-pointer"
                      aria-label="Remove view filter"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
                {categoryFilter !== 'All' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800 text-[11px] font-medium">
                    <span>Category: {categoryFilter}</span>
                    <button
                      type="button"
                      onClick={() => setCategoryFilter('All')}
                      className="hover:text-blue-900 dark:hover:text-blue-100 cursor-pointer"
                      aria-label="Remove category filter"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
                {brandFilter !== 'All' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800 text-[11px] font-medium">
                    <span>Brand: {brandFilter}</span>
                    <button
                      type="button"
                      onClick={() => setBrandFilter('All')}
                      className="hover:text-blue-900 dark:hover:text-blue-100 cursor-pointer"
                      aria-label="Remove brand filter"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
                {searchInput.trim() && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-[11px] font-medium">
                    <span>Search: &ldquo;{searchInput.trim()}&rdquo;</span>
                    <button
                      type="button"
                      onClick={() => setSearchInput('')}
                      className="hover:text-slate-900 dark:hover:text-white cursor-pointer"
                      aria-label="Clear search query"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={handleClearProductFilters}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset Filters</span>
              </button>
            </div>
          )}
        </div>

        {/* Standalone Products Table Card (Explicit 6-Column <colgroup>, Strict colSpan Parity) */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs overflow-clip">
          <div className="w-full overflow-x-auto lg:overflow-x-visible scrollbar-thin relative">
            <table className="w-full min-w-[960px] lg:min-w-0 lg:table-fixed text-left border-collapse font-sans">
              <colgroup>
                <col className="w-auto" />
                <col className="w-[144px]" />
                <col className="w-[164px]" />
                <col className="w-[152px]" />
                <col className="w-[136px]" />
                <col className="w-[156px]" />
              </colgroup>
              <thead className="sticky top-0 z-10 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-xs border-b border-slate-200 dark:border-slate-800 text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 shadow-[0_1px_0_0_rgba(226,232,240,1)] dark:shadow-[0_1px_0_0_rgba(30,41,59,1)] select-none">
                <tr>
                  <th className="py-2.5 px-4 whitespace-nowrap truncate bg-slate-50 dark:bg-slate-900">Product &amp; Specifications</th>
                  <th className="py-2.5 px-2.5 whitespace-nowrap truncate bg-slate-50 dark:bg-slate-900">Category</th>
                  <th className="py-2.5 px-2.5 whitespace-nowrap truncate bg-slate-50 dark:bg-slate-900">Brand &amp; SKU</th>
                  <th className="py-2.5 px-2.5 whitespace-nowrap truncate bg-slate-50 dark:bg-slate-900">Stock &amp; Lead Time</th>
                  <th className="py-2.5 pl-2 pr-4 text-right whitespace-nowrap bg-slate-50 dark:bg-slate-900">Unit Price</th>
                  <th className="py-2.5 pl-2 pr-4 text-right whitespace-nowrap bg-slate-50 dark:bg-slate-900">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800 font-sans text-sm bg-white dark:bg-slate-900">
                {paginatedProducts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-14 px-4 text-center font-sans">
                      {hasActiveFilter ? (
                        <div className="max-w-md mx-auto flex flex-col items-center gap-2.5">
                          <div className="w-11 h-11 rounded-2xl bg-blue-50 dark:bg-blue-950/50 border border-blue-100 dark:border-blue-800 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                            <Search className="w-5 h-5" />
                          </div>
                          <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                            No Products Match Your Filter
                          </h4>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {searchInput.trim() ? (
                              <>
                                No products match <span className="font-semibold text-slate-800 dark:text-slate-200">&ldquo;{searchInput.trim()}&rdquo;</span>
                                {categoryFilter !== 'All' ? ` in ${categoryFilter}` : ''}
                                {brandFilter !== 'All' ? ` (${brandFilter})` : ''}.
                              </>
                            ) : (
                              <>No products match the selected category, brand, or stock filter.</>
                            )}{' '}
                            Clear your filters to restore all {activeCatalogProducts.length} catalog products.
                          </p>
                          <button
                            type="button"
                            onClick={handleClearProductFilters}
                            className="mt-1 inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition cursor-pointer"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Clear Search / Reset Filters</span>
                          </button>
                        </div>
                      ) : (
                        <div className="max-w-md mx-auto flex flex-col items-center gap-2.5">
                          <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/50 border border-blue-100 dark:border-blue-800 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                            <Package className="w-6 h-6" />
                          </div>
                          <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                            Your Product Catalog is Empty
                          </h4>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Register equipment, materials, spec variant families, or composite engineering packages to streamline quotations, stock reservations, and GRN intake.
                          </p>
                          {isEditable && (
                            <button
                              type="button"
                              onClick={() => openAddModal()}
                              className="mt-1 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Add Product</span>
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ) : (
                  paginatedProducts.map((rawProd, rowIdx) => {
                    const p = resolveEffectiveCatalogProduct(rawProd, activeCatalogProducts);
                    const parentId = (rawProd as any).parent_product_id || rawProd.variant_parent_id || null;
                    const linkedParent = parentId
                      ? activeCatalogProducts.find((cand) => cand.id === parentId)
                      : null;
                    const childVariants = activeCatalogProducts.filter(
                      (cand) =>
                        cand.id !== p.id &&
                        ((cand as any).parent_product_id === p.id || cand.variant_parent_id === p.id)
                    );
                    const childVariantsCount = childVariants.length;
                    const explicitVariantLabel = String((rawProd as any).variant_label || '').trim();

                    // When a Parent Product has empty brand_make, image_url, or unit_price === 0, inherit from its child variants for display
                    const inheritedChildBrand =
                      !p.brand_make && childVariants.length > 0
                        ? childVariants.find((c) => (c.brand_make || '').trim())?.brand_make || ''
                        : '';
                    const inheritedChildImage =
                      !p.image_url && childVariants.length > 0
                        ? childVariants.find((c) => (c.image_url || '').trim())?.image_url || ''
                        : '';
                    const effectiveRowImageUrl = p.image_url || inheritedChildImage;
                    const effectiveRowBrand = (p.brand_make || inheritedChildBrand || '').trim();

                    const childPositivePrices = childVariants
                      .map((c) => Number(c.unit_price) || 0)
                      .filter((val) => val > 0);
                    const minChildPrice =
                      childPositivePrices.length > 0 ? Math.min(...childPositivePrices) : 0;
                    const maxChildPrice =
                      childPositivePrices.length > 0 ? Math.max(...childPositivePrices) : 0;

                    const stockOnHandVal = getProductStockOnHand(p);
                    const availableQty = getProductAvailableStock(p);
                    const isLowStock = isProductLowStock(p);
                    const sellPrice = p.unit_price || 0;
                    const costPrice = p.cost_price || 0;
                    const cleanUnit = p.unit && p.unit !== 'Custom Unit' ? p.unit : 'Nos';
                    const marginPct =
                      sellPrice > 0 && costPrice > 0
                        ? Math.round(((sellPrice - costPrice) / sellPrice) * 100)
                        : null;
                    const vInfo = p.id ? variantAnalysisMap.get(p.id) : undefined;
                    const prevProd = rowIdx > 0 ? paginatedProducts[rowIdx - 1] : null;
                    const showFamilyGroupHeader =
                      groupVariantsByFamily &&
                      !linkedParent &&
                      childVariantsCount === 0 &&
                      Boolean(vInfo?.isVariant) &&
                      (!prevProd || (prevProd.id && variantAnalysisMap.get(prevProd.id)?.familyKey) !== vInfo?.familyKey);

                    const productTitle = (p.name || p.product_type || 'Unnamed Product').trim();
                    const parentAttrMap = new Map<string, string>();
                    if (linkedParent && Array.isArray(linkedParent.attributes)) {
                      for (const pa of linkedParent.attributes) {
                        if (pa && pa.key) {
                          parentAttrMap.set(pa.key.trim().toLowerCase(), (pa.value || '').trim().toLowerCase());
                        }
                      }
                    }
                    const isAttrDiffFromParent = (attr: { key: string; value: string }): boolean => {
                      const kLower = (attr.key || '').trim().toLowerCase();
                      const vLower = (attr.value || '').trim().toLowerCase();
                      if (!kLower || !vLower) return false;
                      if (linkedParent) {
                        if (!parentAttrMap.has(kLower)) return true;
                        return parentAttrMap.get(kLower) !== vLower;
                      }
                      if (vInfo?.isVariant) {
                        return vInfo.differentiatingAttributes.some(
                          (da) => da.key.trim().toLowerCase() === kLower
                        );
                      }
                      return false;
                    };

                    const rawOrderedAttrs = vInfo?.isVariant
                      ? [...vInfo.differentiatingAttributes, ...vInfo.sharedAttributes]
                      : linkedParent
                      ? [...(p.attributes || [])].sort((a, b) => {
                          const aDiff = isAttrDiffFromParent(a) ? 0 : 1;
                          const bDiff = isAttrDiffFromParent(b) ? 0 : 1;
                          return aDiff - bDiff;
                        })
                      : (p.attributes || []);

                    // Deduplicate attribute pills: exclude Brand/Make and any attribute that duplicates the row's purple variant_label badge
                    const normVariantLabel = explicitVariantLabel.toLowerCase().replace(/\s+/g, ' ').trim();
                    const orderedAttrs = rawOrderedAttrs.filter((attr) => {
                      const k = (attr.key || '').trim();
                      const v = (attr.value || '').trim();
                      if (!k) return false;
                      if (/^(brand|make|manufacturer|brand\s*\/\s*make)$/i.test(k)) return false;
                      if (normVariantLabel) {
                        const kvNorm = `${k}: ${v}`.toLowerCase().replace(/\s+/g, ' ').trim();
                        const vNorm = v.toLowerCase().replace(/\s+/g, ' ').trim();
                        if (
                          kvNorm === normVariantLabel ||
                          vNorm === normVariantLabel ||
                          normVariantLabel.includes(kvNorm)
                        ) {
                          return false;
                        }
                      }
                      return true;
                    });

                    const hasStructuredAttrs = orderedAttrs.length > 0;
                    const visibleAttrs = orderedAttrs.slice(0, 3);
                    const remainingAttrCount = Math.max(0, orderedAttrs.length - visibleAttrs.length);
                    const allSpecsTooltip = orderedAttrs.map((a) => `${a.key}: ${a.value || '(Template Blank)'}`).join(' • ');

                    // Deduplicated single-line subtitle when no structured attributes exist
                    const rawDesc = (p.description || '').trim();
                    let cleanSubtitle = rawDesc;
                    if (cleanSubtitle.toLowerCase() === productTitle.toLowerCase()) {
                      cleanSubtitle = '';
                    } else if (cleanSubtitle.toLowerCase().startsWith(productTitle.toLowerCase())) {
                      cleanSubtitle = cleanSubtitle.slice(productTitle.length).replace(/^[\s\-–—:|•,\n]+/, '').trim();
                    }
                    cleanSubtitle = cleanSubtitle.replace(/\s+/g, ' ').trim();
                    if (cleanSubtitle.toLowerCase() === productTitle.toLowerCase()) {
                      cleanSubtitle = '';
                    }

                    // Brand & SKU 2-line strings
                    const hasBrand = Boolean(effectiveRowBrand);
                    const brandLabel = hasBrand ? effectiveRowBrand : '—';
                    const skuStr = (p.sku || '').trim();
                    const modelStr = (p.model_part_no || '').trim();
                    const skuModelParts = [
                      skuStr || null,
                      modelStr && modelStr.toLowerCase() !== skuStr.toLowerCase() ? modelStr : null
                    ].filter(Boolean);
                    const skuModelLine =
                      skuModelParts.length > 0
                        ? skuModelParts.join(' · ')
                        : childVariantsCount > 0
                        ? `${childVariantsCount} Variant SKU${childVariantsCount === 1 ? '' : 's'}`
                        : '—';

                    const isIndentedChildRow = groupVariantsByFamily && Boolean(linkedParent);
                    const isParentCollapsed = Boolean(p.id && collapsedParentIds[p.id]);
                    if (
                      isIndentedChildRow &&
                      linkedParent?.id &&
                      collapsedParentIds[linkedParent.id] &&
                      !searchInput.trim()
                    ) {
                      return null;
                    }

                    const stockSubParts = [
                      p.default_availability || null,
                      p.storage_location ? `Bin: ${p.storage_location}` : null,
                      (p.stock_reserved || 0) > 0 ? `Res: ${p.stock_reserved}` : null
                    ].filter(Boolean);

                    const priceSubParts = [
                      `per ${cleanUnit}`,
                      canViewConfidentialMargins && marginPct !== null ? `${marginPct}% margin` : null,
                      canViewConfidentialMargins && p.last_landed_cost && p.last_landed_cost > 0
                        ? `Landed: ${p.last_landed_cost.toFixed(0)}`
                        : null
                    ].filter(Boolean);

                    return (
                      <React.Fragment key={p.id || rowIdx}>
                        {showFamilyGroupHeader && vInfo && (
                          <tr className="bg-indigo-50/60 dark:bg-indigo-950/30 border-y border-indigo-200/80 dark:border-indigo-800/60">
                            <td colSpan={6} className="py-2 px-4">
                              <div className="flex items-center justify-between gap-3 flex-wrap">
                                <div className="flex items-center gap-2 flex-wrap min-w-0">
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-indigo-600 text-white text-xs font-bold">
                                    <GitFork className="w-3.5 h-3.5" />
                                    <span>{vInfo.familyDisplayName}</span>
                                  </span>
                                  <span className="text-xs font-mono font-bold text-indigo-900 dark:text-indigo-200">
                                    {vInfo.siblingCount} Spec Variants
                                  </span>
                                  {vInfo.differentiatingKeys.length > 0 && (
                                    <span className="text-[11px] font-mono text-indigo-700 dark:text-indigo-300 bg-white/80 dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 px-2 py-0.5 rounded-md">
                                      Varies by: <strong>{vInfo.differentiatingKeys.join(', ')}</strong>
                                    </span>
                                  )}
                                </div>
                                {isEditable && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openSpecVariantModal(p);
                                    }}
                                    className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 hover:bg-indigo-600 text-indigo-700 dark:text-indigo-300 hover:text-white border border-indigo-300 dark:border-indigo-700 text-xs font-bold inline-flex items-center gap-1 transition cursor-pointer shadow-2xs"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                    <span>Add Spec Variant</span>
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                        <tr
                          onClick={() => openEditModal(rawProd)}
                          className={`transition-colors group cursor-pointer ${
                            isIndentedChildRow
                              ? 'bg-violet-50/25 dark:bg-violet-950/15 hover:bg-violet-50/60 dark:hover:bg-violet-900/30'
                              : childVariantsCount > 0
                              ? 'bg-indigo-50/20 dark:bg-indigo-950/20 hover:bg-indigo-50/45 dark:hover:bg-indigo-900/30'
                              : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/60'
                          }`}
                        >
                          {/* 1. PRODUCT & SPECIFICATIONS (Auto-Width Fluid Column) */}
                          <td className="py-3 px-4 overflow-hidden align-middle">
                            <div className={`flex items-center gap-2.5 min-w-0 overflow-hidden ${isIndentedChildRow ? 'pl-3' : ''}`}>
                              {isIndentedChildRow && (
                                <span
                                  className="font-mono text-xs font-bold text-violet-400 dark:text-violet-500 select-none shrink-0"
                                  title={`Child Variant under ${linkedParent?.name}`}
                                >
                                  └─
                                </span>
                              )}
                              {/* Product Image Thumbnail or Clean Placeholder */}
                              {effectiveRowImageUrl ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setLightboxProduct(p);
                                  }}
                                  className="relative group/thumb shrink-0 cursor-pointer"
                                  title="Click to inspect photo, rotate, or add technical diagram"
                                >
                                  <img
                                    src={effectiveRowImageUrl}
                                    alt={productTitle}
                                    className="w-9 h-9 rounded-xl object-contain bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 group-hover/thumb:border-blue-400 p-0.5 shrink-0 shadow-2xs transition"
                                    style={{
                                      transform: `rotate(${p.image_adjustments?.rotation || 0}deg) scale(${p.image_adjustments?.scale || 1})`
                                    }}
                                    referrerPolicy="no-referrer"
                                  />
                                  {p.secondary_image_url && (
                                    <span className="absolute -top-1 -right-1 px-1 py-0.2 rounded-full bg-indigo-600 text-white text-[8px] font-mono font-bold shadow-xs">
                                      2
                                    </span>
                                  )}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setLightboxProduct(p);
                                  }}
                                  className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-950/40 border border-slate-200/80 dark:border-slate-700 hover:border-blue-300 flex items-center justify-center text-slate-400 hover:text-blue-600 shrink-0 cursor-pointer transition"
                                  title="Click to upload or paste product image"
                                >
                                  <Package className="w-4 h-4" />
                                </button>
                              )}

                              <div className="min-w-0 flex-1 overflow-hidden">
                                {/* Line 1: HoverScrollText Product Title + Compact Inline Badges */}
                                <div className="flex items-center gap-1.5 min-w-0">
                                  {isIndentedChildRow ? (
                                    <>
                                      <HoverScrollText
                                        text={explicitVariantLabel || productTitle}
                                        title={`${productTitle}${explicitVariantLabel ? ` — ${explicitVariantLabel}` : ''}`}
                                        className="text-sm font-bold text-slate-900 dark:text-slate-100 flex-1"
                                      />
                                      <span
                                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-violet-100 dark:bg-violet-950/70 text-violet-800 dark:text-violet-200 border border-violet-300 dark:border-violet-700 shrink-0"
                                        title={`Child Variant of ${linkedParent?.name || 'Parent Family'}`}
                                      >
                                        <GitFork className="w-2.5 h-2.5" />
                                        <span>Variant</span>
                                      </span>
                                    </>
                                  ) : (
                                    <>
                                      <HoverScrollText
                                        text={productTitle}
                                        title={productTitle}
                                        className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex-1"
                                      />
                                      {linkedParent && (
                                        <>
                                          <span
                                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shrink-0 max-w-[160px] truncate"
                                            title={`Child Variant of ${linkedParent.name} (${linkedParent.sku || 'Parent'})`}
                                          >
                                            <span>↳ {linkedParent.name || linkedParent.sku}</span>
                                          </span>
                                          {explicitVariantLabel && (
                                            <span
                                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-violet-100 dark:bg-violet-950/70 text-violet-800 dark:text-violet-200 border border-violet-300 dark:border-violet-700 shrink-0"
                                              title={`Differentiating Variant Label: ${explicitVariantLabel}`}
                                            >
                                              <GitFork className="w-2.5 h-2.5" />
                                              <span>{explicitVariantLabel}</span>
                                            </span>
                                          )}
                                        </>
                                      )}
                                    </>
                                  )}
                                  {p.is_composite_set && p.sub_components && p.sub_components.length > 0 ? (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/60 shrink-0">
                                      <Layers className="w-2.5 h-2.5" />
                                      <span>Kit / BOM</span>
                                    </span>
                                  ) : p.country_of_origin && !isIndentedChildRow ? (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700 shrink-0">
                                      <span>{p.country_of_origin}</span>
                                    </span>
                                  ) : null}
                                  {p.datasheet_attachment?.url && (
                                    <a
                                      href={p.datasheet_attachment.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/60 hover:bg-indigo-100 transition shrink-0"
                                      title={`View Technical Datasheet: ${p.datasheet_attachment.name}`}
                                    >
                                      <FileText className="w-2.5 h-2.5" />
                                      <span>PDF</span>
                                    </a>
                                  )}
                                </div>

                                {/* Line 2: Parent Variant Expand/Collapse Toggle + Compact Spec Chips OR Non-Repeating Subtitle */}
                                {(!linkedParent && (childVariantsCount > 0 || (rawProd as any).has_variants)) ||
                                hasStructuredAttrs ||
                                cleanSubtitle ? (
                                  <div
                                    className="flex flex-wrap items-center gap-1 max-w-full overflow-hidden mt-1"
                                    title={allSpecsTooltip || cleanSubtitle}
                                  >
                                    {!linkedParent && (childVariantsCount > 0 || (rawProd as any).has_variants) && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (!p.id) return;
                                          if (!groupVariantsByFamily) {
                                            setGroupVariantsByFamily(true);
                                            setCollapsedParentIds((prev) => ({ ...prev, [p.id!]: false }));
                                            return;
                                          }
                                          setCollapsedParentIds((prev) => ({
                                            ...prev,
                                            [p.id!]: !prev[p.id!]
                                          }));
                                        }}
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 transition cursor-pointer shrink-0"
                                        title={
                                          isParentCollapsed
                                            ? `Click to expand ${childVariantsCount} child variant(s)`
                                            : `Click to collapse ${childVariantsCount} child variant(s)`
                                        }
                                      >
                                        <GitFork className="w-2.5 h-2.5" />
                                        <span>
                                          {childVariantsCount} Variant{childVariantsCount === 1 ? '' : 's'}{' '}
                                          {isParentCollapsed ? '▸' : '▾'}
                                        </span>
                                      </button>
                                    )}
                                    {hasStructuredAttrs ? (
                                      <>
                                        {visibleAttrs.map((attr, idx) => {
                                          const isDiff = isAttrDiffFromParent(attr);
                                          return (
                                            <span
                                              key={idx}
                                              className={`text-[10.5px] font-mono px-1.5 py-0.5 rounded border max-w-[180px] truncate shrink-0 ${
                                                !attr.value
                                                  ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60'
                                                  : isDiff
                                                  ? 'font-semibold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/60'
                                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200/80 dark:border-slate-700'
                                              }`}
                                            >
                                              {attr.key}: {attr.value || '(Fill on Quote)'}
                                            </span>
                                          );
                                        })}
                                        {remainingAttrCount > 0 && (
                                          <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200/70 dark:border-slate-700 shrink-0">
                                            +{remainingAttrCount} more
                                          </span>
                                        )}
                                      </>
                                    ) : cleanSubtitle ? (
                                      <HoverScrollText
                                        text={cleanSubtitle}
                                        title={cleanSubtitle}
                                        className="text-xs text-slate-500 dark:text-slate-400 flex-1"
                                      />
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </td>

                          {/* 2. CATEGORY (144px) */}
                          <td className="py-3 px-2.5 overflow-hidden align-middle">
                            <span
                              className="inline-block max-w-full text-[11px] font-medium px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/40 border border-blue-200/70 dark:border-blue-800/60 text-blue-700 dark:text-blue-300"
                              title={p.product_type || 'General'}
                            >
                              <HoverScrollText text={p.product_type || 'General'} />
                            </span>
                          </td>

                          {/* 3. BRAND & SKU (164px) */}
                          <td className="py-3 px-2.5 overflow-hidden align-middle">
                            <div className="flex flex-col gap-0.5 min-w-0 overflow-hidden">
                              {!hasBrand && skuModelLine !== '—' ? (
                                <>
                                  <HoverScrollText
                                    text={skuModelLine}
                                    title={skuModelLine}
                                    className="font-mono text-xs font-medium text-slate-700 dark:text-slate-300"
                                  />
                                  <span className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
                                    No brand set
                                  </span>
                                </>
                              ) : (
                                <>
                                  <HoverScrollText
                                    text={brandLabel}
                                    title={brandLabel}
                                    className="font-semibold text-xs text-slate-800 dark:text-slate-200"
                                  />
                                  <HoverScrollText
                                    text={skuModelLine}
                                    title={skuModelLine}
                                    className="font-mono text-[11px] text-slate-500 dark:text-slate-400"
                                  />
                                </>
                              )}
                            </div>
                          </td>

                          {/* 4. STOCK & LEAD TIME (152px) */}
                          <td className="py-3 px-2.5 overflow-hidden align-middle">
                            <div className="flex flex-col items-start gap-0.5 min-w-0 overflow-hidden">
                              {p.is_inventoried ? (
                                <>
                                  <span
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold truncate max-w-full ${
                                      isLowStock
                                        ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60'
                                        : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60'
                                    }`}
                                    title={`Available: ${availableQty} ${cleanUnit} (On Hand: ${stockOnHandVal}, Reserved: ${p.stock_reserved || 0}, Min: ${getProductReorderLevel(p)})`}
                                  >
                                    {isLowStock && <AlertTriangle className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />}
                                    <span className="truncate font-mono tabular-nums">
                                      In Stock: {availableQty} {cleanUnit}
                                    </span>
                                  </span>
                                  {stockSubParts.length > 0 && (
                                    <HoverScrollText
                                      text={stockSubParts.join(' · ')}
                                      title={stockSubParts.join(' · ')}
                                      className="text-[11px] text-slate-400 dark:text-slate-500"
                                    />
                                  )}
                                </>
                              ) : (
                                <>
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700 truncate max-w-full">
                                    Order / Non-Stock
                                  </span>
                                  {p.default_availability && (
                                    <HoverScrollText
                                      text={p.default_availability}
                                      title={p.default_availability}
                                      className="text-[11px] text-slate-400 dark:text-slate-500"
                                    />
                                  )}
                                </>
                              )}
                            </div>
                          </td>

                          {/* 5. UNIT PRICE (136px, Right-Aligned) */}
                          <td className="py-3 pl-2 pr-4 text-right whitespace-nowrap align-middle overflow-hidden">
                            {p.unit_price !== undefined && p.unit_price > 0 ? (
                              <div className="flex flex-col items-end gap-0.5 min-w-0">
                                <span className="font-bold font-mono tabular-nums text-xs sm:text-sm text-slate-900 dark:text-slate-100 whitespace-nowrap">
                                  AED{' '}
                                  {p.unit_price.toLocaleString(undefined, {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2
                                  })}
                                </span>
                                <HoverScrollText
                                  text={priceSubParts.join(' · ')}
                                  title={priceSubParts.join(' · ')}
                                  className="text-[11px] text-slate-400 dark:text-slate-500 text-right"
                                />
                              </div>
                            ) : minChildPrice > 0 ? (
                              <div className="flex flex-col items-end gap-0.5 min-w-0">
                                <span className="font-bold font-mono tabular-nums text-xs sm:text-sm text-indigo-700 dark:text-indigo-300 whitespace-nowrap">
                                  {minChildPrice === maxChildPrice
                                    ? `AED ${minChildPrice.toLocaleString(undefined, {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2
                                      })}`
                                    : `From AED ${minChildPrice.toLocaleString(undefined, {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2
                                      })}`}
                                </span>
                                <span className="text-[11px] text-slate-400 dark:text-slate-500 whitespace-nowrap truncate max-w-full">
                                  {childVariantsCount} variant{childVariantsCount === 1 ? '' : 's'} · per {cleanUnit}
                                </span>
                              </div>
                            ) : (
                              <div className="flex flex-col items-end gap-0.5 min-w-0">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/60 whitespace-nowrap">
                                  Price on Request
                                </span>
                                <span className="text-[11px] text-slate-400 dark:text-slate-500 whitespace-nowrap">per {cleanUnit}</span>
                              </div>
                            )}
                          </td>

                          {/* 6. ACTIONS (156px, Right-Aligned pr-4, Subtle Divider Before Delete) */}
                          <td className="py-3 pl-2 pr-4 text-right whitespace-nowrap align-middle relative" onClick={(e) => e.stopPropagation()}>
                            <div className="flex w-full items-center justify-end gap-1">
                              {isEditable ? (
                                <>
                                  {!linkedParent && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openSpecVariantModal(rawProd);
                                      }}
                                      className="w-7 h-7 rounded-lg inline-flex items-center justify-center text-indigo-700 dark:text-indigo-300 bg-indigo-50/80 dark:bg-indigo-950/50 hover:bg-indigo-600 hover:text-white border border-indigo-200 dark:border-indigo-800 transition cursor-pointer shrink-0"
                                      title="Add Spec Variant"
                                      aria-label="Add Spec Variant"
                                    >
                                      <GitFork className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  {linkedParent ? (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDetachProductVariant(rawProd);
                                      }}
                                      className="w-7 h-7 rounded-lg inline-flex items-center justify-center text-violet-600 dark:text-violet-400 hover:text-amber-700 hover:bg-amber-50 border border-violet-200/80 hover:border-amber-300 transition cursor-pointer shrink-0"
                                      title={`Detach from "${linkedParent.name}" as Standalone Product`}
                                      aria-label="Detach Variant"
                                    >
                                      <Unlink className="w-3.5 h-3.5" />
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setQuickLinkVariantTargetId((prev) => (prev === rawProd.id ? null : rawProd.id || null));
                                        setQuickLinkParentSearch('');
                                      }}
                                      className="w-7 h-7 rounded-lg inline-flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-violet-600 hover:bg-violet-50 border border-transparent hover:border-violet-200 transition cursor-pointer shrink-0"
                                      title="Make Variant Of... (Link under an existing Parent Product or Extract Parent Family)"
                                      aria-label="Link as Variant"
                                    >
                                      <Link2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openEditModal(rawProd);
                                    }}
                                    className="w-7 h-7 rounded-lg inline-flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 border border-transparent hover:border-blue-200/80 dark:hover:border-blue-800/60 transition cursor-pointer shrink-0"
                                    title="Inspect / Edit Product"
                                    aria-label="Inspect / Edit Product"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <span className="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-0.5 shrink-0" aria-hidden="true" />
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteProduct(rawProd);
                                    }}
                                    className="w-7 h-7 rounded-lg inline-flex items-center justify-center text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-transparent hover:border-rose-200 dark:hover:border-rose-800/60 transition cursor-pointer shrink-0"
                                    title="Move to Recycle Bin"
                                    aria-label="Move to Recycle Bin"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              ) : (
                                <span className="text-xs text-slate-400 italic">Viewer</span>
                              )}
                            </div>

                            {/* Inline 1-Click "Make Variant Of..." Popover */}
                            {quickLinkVariantTargetId === rawProd.id && (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                className="absolute right-3 top-full mt-1 w-72 rounded-xl bg-white dark:bg-slate-900 border border-violet-200 dark:border-violet-800 shadow-2xl p-2.5 z-50 text-left space-y-2"
                              >
                                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-1.5">
                                  <span className="text-[11px] font-bold text-violet-950 dark:text-violet-200 flex items-center gap-1">
                                    <Link2 className="w-3 h-3 text-violet-600" />
                                    <span>Make Variant Of Parent Product</span>
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setQuickLinkVariantTargetId(null)}
                                    className="text-slate-400 hover:text-slate-600 cursor-pointer"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                                <input
                                  type="text"
                                  autoFocus
                                  value={quickLinkParentSearch}
                                  onChange={(e) => setQuickLinkParentSearch(e.target.value)}
                                  placeholder="Search parent product..."
                                  className="w-full px-2.5 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-violet-500"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleCreateParentFamilyFromItem(rawProd)}
                                  className="w-full text-left px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-600 text-indigo-800 hover:text-white border border-indigo-200 text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer"
                                  title="Automatically strip size/capacity suffix, create a Parent Product, and link this item under it"
                                >
                                  <Sparkles className="w-3.5 h-3.5 shrink-0" />
                                  <span>Create Parent Family from This Item</span>
                                </button>
                                <div className="max-h-40 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                                  {activeCatalogProducts
                                    .filter(
                                      (cand) =>
                                        cand.id !== rawProd.id &&
                                        !cand.variant_parent_id &&
                                        !(cand as any).parent_product_id &&
                                        (!quickLinkParentSearch.trim() ||
                                          `${cand.name} ${cand.sku} ${cand.brand_make}`
                                            .toLowerCase()
                                            .includes(quickLinkParentSearch.trim().toLowerCase()))
                                    )
                                    .slice(0, 20)
                                    .map((cand) => (
                                      <button
                                        key={cand.id}
                                        type="button"
                                        onClick={() => handleMakeProductVariantOf(rawProd, cand)}
                                        className="w-full text-left px-2 py-1.5 hover:bg-violet-50 dark:hover:bg-violet-950/40 rounded-lg transition cursor-pointer flex items-center justify-between gap-2"
                                      >
                                        <div className="min-w-0">
                                          <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                                            {cand.name}
                                          </div>
                                          <div className="text-[10px] font-mono text-slate-500 truncate">
                                            {cand.sku || cand.product_type}
                                          </div>
                                        </div>
                                        <span className="text-[10px] font-bold text-violet-600 shrink-0">Link →</span>
                                      </button>
                                    ))}
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Unconditional Uniform Pagination Footer */}
          <div className="px-4 py-2.5 bg-slate-50/60 dark:bg-slate-900/60 border-t border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-400">
            <div className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400">
              Showing{' '}
              <span className="font-bold text-slate-900 dark:text-slate-100">
                {totalItems === 0
                  ? 0
                  : Math.min((currentPage - 1) * (itemsPerPage === 'All' ? totalItems : itemsPerPage) + 1, totalItems)}
              </span>{' '}
              to{' '}
              <span className="font-bold text-slate-900 dark:text-slate-100">
                {totalItems === 0
                  ? 0
                  : Math.min(currentPage * (itemsPerPage === 'All' ? totalItems : itemsPerPage), totalItems)}
              </span>{' '}
              of <span className="font-bold text-slate-900 dark:text-slate-100">{totalItems}</span> products
            </div>

            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <span className="text-xs text-slate-500 dark:text-slate-400 font-sans">Rows per page:</span>
                <select
                  value={itemsPerPage}
                  onChange={(e) => {
                    const val = e.target.value;
                    setItemsPerPage(val === 'All' ? 'All' : Number(val));
                    setCurrentPage(1);
                  }}
                  aria-label="Rows per page"
                  className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value="All">All</option>
                </select>
              </div>

              <div className="flex items-center space-x-1">
                <button
                  type="button"
                  onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                  disabled={totalItems === 0 || currentPage <= 1 || itemsPerPage === 'All'}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer text-xs font-semibold inline-flex items-center gap-1"
                  title="Previous Page"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Prev</span>
                </button>
                <span className="text-xs font-mono tabular-nums px-2.5 text-slate-600 dark:text-slate-400">
                  Page <span className="font-bold text-slate-900 dark:text-slate-100">{itemsPerPage === 'All' ? 1 : currentPage}</span> of{' '}
                  <span className="font-bold text-slate-900 dark:text-slate-100">{itemsPerPage === 'All' ? 1 : Math.max(1, totalPages)}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentPage((prev) => Math.min(prev + 1, Math.max(1, totalPages)))}
                  disabled={totalItems === 0 || itemsPerPage === 'All' || currentPage >= Math.max(1, totalPages)}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer text-xs font-semibold inline-flex items-center gap-1"
                  title="Next Page"
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ORGANIZED 3-CHAPTER MODAL: Register or Edit Product */}
        {showFormModal && (
          <div
            id="product-form-modal"
            className="fixed inset-0 z-[100] bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4"
          >
            <form
              onSubmit={handleSaveProduct}
              className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[96vh] sm:max-h-[92vh] w-full ${
                formIsCompositeSet ? 'max-w-5xl' : 'max-w-4xl'
              } relative animate-in fade-in zoom-in-95 duration-150 transition-all`}
            >
              {/* Standardized Modal Header with Live Pricing & Metadata Badges */}
              <div className="px-4 py-3 sm:px-6 sm:py-4 border-b border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  {formImageUrl ? (
                    <img
                      src={formImageUrl}
                      alt="Product preview"
                      className="w-10 h-10 rounded-xl object-contain bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-0.5 shrink-0"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200/80 dark:border-blue-800/60 text-blue-600 dark:text-blue-400 shrink-0">
                      <Package className="w-5 h-5" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 font-sans truncate">
                        {editingProduct
                          ? 'Edit Catalog Product'
                          : formVariantParentId
                          ? 'Register Product Spec Variant'
                          : 'Register New Catalog Product'}
                      </h3>
                      {formProductType && (
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800/60 uppercase whitespace-nowrap">
                          {formProductType}
                        </span>
                      )}
                      {formSku.trim() && (
                        <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 whitespace-nowrap">
                          SKU: {formSku.trim()}
                        </span>
                      )}
                      {formVariantParentId && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                          <GitFork className="w-3 h-3" />
                          <span>Spec Variant of {formProductFamily || formName}</span>
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-sans truncate mt-0.5">
                      Synced across Enquiries, Quotation Studio Line Items, and Warehouse Stock
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  {/* Live Price & Margin Pill */}
                  <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 text-right font-mono">
                    <div>
                      {formUnitPrice !== undefined && formUnitPrice > 0 ? (
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block whitespace-nowrap">
                          AED {Number(formUnitPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / {formUnit || 'Nos'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-sans font-semibold bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/60 whitespace-nowrap">
                          Price on Request
                        </span>
                      )}
                      {canViewConfidentialMargins && livePricingMetrics && (
                        <span
                          className={`block text-[10px] font-bold mt-0.5 ${
                            livePricingMetrics.marginPct >= 20
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : livePricingMetrics.marginPct > 0
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {livePricingMetrics.marginPct.toFixed(1)}% Margin ({livePricingMetrics.markupPct.toFixed(1)}% Markup)
                        </span>
                      )}
                    </div>
                  </div>

                  {editingProduct && (
                    <button
                      type="button"
                      onClick={() => openSpecVariantModal(editingProduct)}
                      className="h-9 px-3 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap"
                      title="Create a new Spec Variant (e.g. different size, capacity, or rating) sharing this product's base name and attributes"
                    >
                      <GitFork className="w-3.5 h-3.5" />
                      <span>Add Spec Variant</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowFormModal(false)}
                    className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* 3-Chapter Quick-Jump Step Bar */}
              <div className="px-3 sm:px-6 py-2 sm:py-2.5 border-b border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
                <div className="grid grid-cols-3 gap-1 sm:gap-2 bg-slate-100/90 dark:bg-slate-800/80 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveFormTab('overview');
                      document.getElementById('product-chapter-1')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    className={`py-1.5 px-2 sm:px-3 rounded-lg text-xs font-semibold font-sans flex items-center justify-center gap-1.5 sm:gap-2 transition cursor-pointer whitespace-nowrap min-w-0 ${
                      activeFormTab === 'overview'
                        ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    <span className="w-5 h-5 rounded-md bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-mono font-bold text-[11px] inline-flex items-center justify-center shrink-0">
                      1
                    </span>
                    <span className="truncate">
                      <span className="hidden sm:inline">Core </span>Identity<span className="hidden md:inline"> &amp; SKU</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveFormTab('inventory');
                      document.getElementById('product-chapter-2')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    className={`py-1.5 px-2 sm:px-3 rounded-lg text-xs font-semibold font-sans flex items-center justify-center gap-1.5 sm:gap-2 transition cursor-pointer whitespace-nowrap min-w-0 ${
                      activeFormTab === 'inventory'
                        ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    <span className="w-5 h-5 rounded-md bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-mono font-bold text-[11px] inline-flex items-center justify-center shrink-0">
                      2
                    </span>
                    <span className="truncate">
                      Pricing<span className="hidden sm:inline"> &amp; Stock</span>
                    </span>
                    {formIsInventoried && <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveFormTab('specs_media');
                      document.getElementById('product-chapter-3')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    className={`py-1.5 px-2 sm:px-3 rounded-lg text-xs font-semibold font-sans flex items-center justify-center gap-1.5 sm:gap-2 transition cursor-pointer whitespace-nowrap min-w-0 ${
                      activeFormTab === 'specs_media'
                        ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    <span className="w-5 h-5 rounded-md bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-mono font-bold text-[11px] inline-flex items-center justify-center shrink-0">
                      3
                    </span>
                    <span className="truncate">
                      Specs<span className="hidden sm:inline"> &amp; Media</span>
                    </span>
                    {(formImageUrl || formDatasheetAttachment || formAttributes.length > 0) && (
                      <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                    )}
                  </button>
                </div>
              </div>

              {/* Calm Tinted Scroll Canvas with Numbered Chapter Cards */}
              <div className="p-5 sm:p-6 pb-8 bg-slate-50/80 dark:bg-slate-950/70 overflow-y-auto flex-1 font-sans space-y-5 scroll-smooth">
                {/* COLLAPSIBLE SINGLE-PRODUCT & DATASHEET AI AUTOFILL BAR */}
                <div className="rounded-2xl bg-gradient-to-r from-indigo-50/90 via-white to-blue-50/80 dark:from-indigo-950/40 dark:via-slate-900 dark:to-slate-900 border border-indigo-200/90 dark:border-indigo-800/70 overflow-hidden shadow-2xs">
                  <div
                    onClick={() => setShowFormAiAutofill((prev) => !prev)}
                    className="px-4 py-2.5 flex items-center justify-between gap-2 cursor-pointer hover:bg-indigo-50/60 dark:hover:bg-indigo-950/50 transition"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="p-1.5 rounded-lg bg-indigo-600 text-white shrink-0">
                        <Sparkles className="w-3.5 h-3.5" />
                      </span>
                      <span className="text-xs font-bold text-indigo-950 dark:text-indigo-200 truncate">
                        ✨ AI Autofill from File or Pasted Specs
                      </span>
                      <span className="hidden sm:inline-block px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                        Drop PDF Datasheet / Image / Excel or Paste Specs
                      </span>
                    </div>
                    <button
                      type="button"
                      className="text-xs font-bold text-indigo-700 dark:text-indigo-300 inline-flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      <span>{showFormAiAutofill ? 'Hide' : 'Expand'}</span>
                      <ChevronDown
                        className={`w-3.5 h-3.5 transition-transform ${
                          showFormAiAutofill ? 'rotate-180' : ''
                        }`}
                      />
                    </button>
                  </div>

                  {showFormAiAutofill && (
                    <div className="px-4 pb-3.5 pt-2 border-t border-indigo-200/60 dark:border-indigo-800/60 space-y-2.5">
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5">
                        {/* File Drop / Picker */}
                        <div className="md:col-span-4">
                          <div
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                              e.preventDefault();
                              const file = e.dataTransfer.files?.[0];
                              if (file) {
                                setFormAiFile(file);
                                void handleRunSingleProductAiAutofill('fast', file);
                              }
                            }}
                            onClick={() => formAiFileInputRef.current?.click()}
                            className="h-full min-h-[76px] border-2 border-dashed border-indigo-200 dark:border-indigo-800 hover:border-indigo-500 rounded-xl bg-white dark:bg-slate-900 p-2.5 flex flex-col items-center justify-center text-center cursor-pointer transition"
                          >
                            <input
                              ref={formAiFileInputRef}
                              type="file"
                              accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.csv,.docx,.txt"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  setFormAiFile(file);
                                  void handleRunSingleProductAiAutofill('fast', file);
                                }
                                e.target.value = '';
                              }}
                            />
                            <UploadCloud className="w-5 h-5 text-indigo-500 mb-1" />
                            {formAiFile ? (
                              <span className="text-[11px] font-bold text-indigo-700 dark:text-indigo-300 truncate max-w-[200px]">
                                {formAiFile.name}
                              </span>
                            ) : (
                              <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                                Drop PDF Datasheet / Image / Excel
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Paste Raw Specs Textarea */}
                        <div className="md:col-span-8 flex flex-col gap-1.5">
                          <textarea
                            rows={2}
                            value={formAiRawText}
                            onChange={(e) => setFormAiRawText(e.target.value)}
                            placeholder="Or paste raw product description, datasheet specs, or Excel row here..."
                            className="w-full rounded-xl border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-900 p-2 text-xs font-mono text-slate-800 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
                          />
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <select
                              value={formAiModel}
                              onChange={(e) => setFormAiModel(e.target.value)}
                              className="rounded-lg border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-900 px-2 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-200 max-w-[240px]"
                            >
                              {AVAILABLE_GEMINI_MODELS.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.label}
                                </option>
                              ))}
                            </select>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                disabled={formAiLoading}
                                onClick={() => void handleRunSingleProductAiAutofill('fast')}
                                className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-1 cursor-pointer shadow-2xs"
                              >
                                <Sparkles className="w-3 h-3" />
                                <span>{formAiLoading ? 'Scanning...' : '⚡ Autofill Fields'}</span>
                              </button>
                              <button
                                type="button"
                                disabled={formAiLoading}
                                onClick={() => void handleRunSingleProductAiAutofill('deep')}
                                className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-bold cursor-pointer"
                                title="Deep scan for complex datasheets"
                              >
                                🧠 Deep
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>

                      {formAiLoading && (
                        <div className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 flex items-center gap-2">
                          <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                          <span>{formAiStatus || 'Extracting technical specifications...'}</span>
                        </div>
                      )}

                      {/* Multi-Variant / Multi-Item Datasheet Detection Banner */}
                      {formAiDetectedVariants.length > 1 && (() => {
                        const firstFam = (formAiDetectedVariants[0]?.family_group_name || '').trim().toLowerCase();
                        const allShareFamily =
                          Boolean(firstFam) &&
                          formAiDetectedVariants.every(
                            (v) => (v.family_group_name || '').trim().toLowerCase() === firstFam
                          );
                        return (
                          <div className="p-2.5 rounded-xl bg-indigo-100/80 dark:bg-indigo-950/70 border border-indigo-300 dark:border-indigo-800 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[11px] font-bold text-indigo-950 dark:text-indigo-200">
                                🧬 Detected {formAiDetectedVariants.length}{' '}
                                {allShareFamily ? 'variants' : 'items'} in source:
                              </span>
                              <select
                                value={formAiSelectedVariantIdx}
                                onChange={(e) => {
                                  const idx = Number(e.target.value);
                                  setFormAiSelectedVariantIdx(idx);
                                  if (formAiDetectedVariants[idx]) {
                                    void applyExtractedItemToProductForm(
                                      formAiDetectedVariants[idx],
                                      formAiDetectedCurrency,
                                      true
                                    );
                                  }
                                }}
                                className="rounded-lg border border-indigo-300 dark:border-indigo-700 bg-white dark:bg-slate-900 px-2 py-0.5 text-[11px] font-bold text-indigo-900 dark:text-indigo-200"
                              >
                                {formAiDetectedVariants.map((v, vIdx) => (
                                  <option key={vIdx} value={vIdx}>
                                    #{vIdx + 1}: {v.variant_label || v.model_part_no || v.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setShowFormModal(false);
                                setAiModalInitialItems(formAiDetectedVariants);
                                setAiModalInitialCurrency(formAiDetectedCurrency);
                                setShowAiCatalogModal(true);
                              }}
                              className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer shadow-2xs"
                            >
                              <GitFork className="w-3 h-3" />
                              <span>
                                {allShareFamily
                                  ? `👑 Open All ${formAiDetectedVariants.length} Variants in Bulk Family Importer`
                                  : `👑 Open All ${formAiDetectedVariants.length} Items in Bulk Importer`}
                              </span>
                            </button>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>

                {/* PARENT FAMILY / VARIANT LINK CONTROL & INHERITED BASE SPECS STRIP */}
                {(() => {
                  const selectedParent = formVariantParentId
                    ? activeCatalogProducts.find((cand) => cand.id === formVariantParentId && cand.id !== editingProduct?.id)
                    : null;
                  const parentOptions = activeCatalogProducts.filter(
                    (cand) =>
                      cand.id !== editingProduct?.id &&
                      !cand.variant_parent_id &&
                      !(cand as any).parent_product_id
                  );
                  const linkedChildVariants = editingProduct?.id
                    ? activeCatalogProducts.filter(
                        (c) =>
                          c.id !== editingProduct.id &&
                          ((c as any).parent_product_id === editingProduct.id ||
                            c.variant_parent_id === editingProduct.id)
                      )
                    : [];
                  const isEditingAlreadyParent = linkedChildVariants.length > 0;

                  if (!formVariantParentId && !showVariantLinkEditor) {
                    return (
                      <div className="px-4 py-2.5 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200/80 dark:border-indigo-800/70 flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 min-w-0">
                          <Link2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                          <span className="text-xs font-bold text-indigo-950 dark:text-indigo-200">
                            {isEditingAlreadyParent ? 'Master Parent Family Product' : 'Standalone / Master Product'}
                          </span>
                          {isEditingAlreadyParent && (
                            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700">
                              {linkedChildVariants.length} Variant{linkedChildVariants.length === 1 ? '' : 's'}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {editingProduct?.id && (
                            <button
                              type="button"
                              onClick={openBulkVariantMatrixModal}
                              className="px-2.5 py-1 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-[11px] font-bold inline-flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                              title="Quick-add multiple size, capacity, or model variants in a single spreadsheet matrix with live smart Auto-SKUs"
                            >
                              <Layers className="w-3 h-3" />
                              <span>Bulk Add Variants</span>
                            </button>
                          )}
                          {isEditingAlreadyParent && (
                            <button
                              type="button"
                              onClick={openParentSyncModal}
                              className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold inline-flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                              title="Push selected shared metadata, photos, datasheet, or base specs to all linked child variants without touching child SKUs, models, prices, or stock"
                            >
                              <RefreshCw className="w-3 h-3" />
                              <span>
                                Sync to {linkedChildVariants.length} Variant{linkedChildVariants.length === 1 ? '' : 's'}
                              </span>
                            </button>
                          )}
                          {!isEditingAlreadyParent && (
                            <button
                              type="button"
                              onClick={() => setShowVariantLinkEditor(true)}
                              className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 hover:bg-indigo-50 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700 text-[11px] font-bold inline-flex items-center gap-1 transition cursor-pointer shadow-2xs"
                            >
                              <Link2 className="w-3 h-3" />
                              <span>🔗 Link as Variant of...</span>
                            </button>
                          )}
                          {!isEditingAlreadyParent && formName.trim() && (
                            <button
                              type="button"
                              onClick={() => handleCreateParentFamilyFromItem(null)}
                              className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold inline-flex items-center gap-1 transition cursor-pointer shadow-2xs"
                              title="Automatically strip the size/capacity suffix from this item's name, create the Parent Family product with shared base specs & photo, and link this item as its child variant"
                            >
                              <Sparkles className="w-3 h-3" />
                              <span>✨ Create Parent Family</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div className="p-4 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/35 border border-indigo-200/80 dark:border-indigo-800/70 space-y-3">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-xs font-bold text-indigo-950 dark:text-indigo-200 flex items-center gap-1.5">
                          <Link2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                          <span>
                            {selectedParent
                              ? `Linked as Child Variant of "${selectedParent.name}"`
                              : 'Parent Family / Variant Link'}
                          </span>
                        </span>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {selectedParent ? (
                            <button
                              type="button"
                              onClick={() => {
                                setFormVariantParentId(null);
                                setFormVariantLabel('');
                                setShowVariantLinkEditor(false);
                              }}
                              className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 hover:bg-amber-50 text-amber-700 border border-amber-300 text-[11px] font-bold inline-flex items-center gap-1 transition cursor-pointer"
                            >
                              <Unlink className="w-3 h-3" />
                              <span>Detach as Standalone</span>
                            </button>
                          ) : (
                            <>
                              {!isEditingAlreadyParent && formName.trim() && (
                                <button
                                  type="button"
                                  onClick={() => handleCreateParentFamilyFromItem(null)}
                                  className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold inline-flex items-center gap-1 transition cursor-pointer shadow-2xs"
                                  title="Automatically strip the size/capacity suffix from this item's name, create the Parent Family product with shared base specs & photo, and link this item as its child variant"
                                >
                                  <Sparkles className="w-3 h-3" />
                                  <span>✨ Create Parent Family</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setShowVariantLinkEditor(false)}
                                className="px-2 py-1 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-100 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-[11px] font-semibold cursor-pointer"
                              >
                                Collapse
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                        <div className="sm:col-span-7">
                          <label className="block text-[10px] font-mono uppercase font-bold text-indigo-900 dark:text-indigo-300 mb-1">
                            Parent Product (🔗 Make Variant Of...)
                          </label>
                          <select
                            value={formVariantParentId || ''}
                            onChange={(e) => {
                              const nextParentId = e.target.value || null;
                              setFormVariantParentId(nextParentId);
                              if (nextParentId) {
                                const pMatch = activeCatalogProducts.find((c) => c.id === nextParentId);
                                if (pMatch) {
                                  setFormProductFamily(pMatch.product_family || pMatch.name || '');
                                  if (!formName.trim()) setFormName(pMatch.name || '');
                                  if (!formBrandMake.trim() && pMatch.brand_make) setFormBrandMake(pMatch.brand_make);
                                  if (!formCountryOfOrigin.trim() && pMatch.country_of_origin) setFormCountryOfOrigin(pMatch.country_of_origin);
                                  if (!formVariantLabel.trim()) {
                                    setFormVariantLabel(
                                      deriveSuggestedVariantLabel(
                                        {
                                          item_name: formName,
                                          model_part_no: formModelPartNo,
                                          attributes: formAttributes
                                        },
                                        pMatch
                                      )
                                    );
                                  }
                                }
                              }
                            }}
                            className="w-full rounded-xl border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
                          >
                            <option value="">— Standalone / Master Parent Product —</option>
                            {parentOptions.map((po) => (
                              <option key={po.id} value={po.id}>
                                {po.name} {po.sku ? `(${po.sku})` : ''} {po.brand_make ? `• ${po.brand_make}` : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="sm:col-span-5">
                          <label className="block text-[10px] font-mono uppercase font-bold text-indigo-900 dark:text-indigo-300 mb-1">
                            Variant Label (e.g. &ldquo;48&quot; x 72&quot;&rdquo; or &ldquo;15LPH @ 3 Bar&rdquo;)
                          </label>
                          <input
                            ref={variantLabelInputRef}
                            type="text"
                            value={formVariantLabel}
                            onChange={(e) => {
                              const nextLabel = e.target.value;
                              setFormVariantLabel(nextLabel);
                              if (isSkuAutoManaged && !editingProduct && formVariantParentId) {
                                handleGenerateAutoSku({ variantLabel: nextLabel, silent: true });
                              }
                            }}
                            placeholder='e.g. 48" x 72" or 15LPH @ 3 Bar'
                            className="w-full rounded-xl border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                      </div>

                      {/* Inherited from Parent (Base Specs) Preview Strip */}
                      {selectedParent && Array.isArray(selectedParent.attributes) && selectedParent.attributes.length > 0 && (
                        <div className="pt-2 border-t border-indigo-200/70 dark:border-indigo-800/60 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-mono uppercase font-bold text-indigo-800 dark:text-indigo-300">
                              Inherited from Parent (Base Specs — {selectedParent.attributes.length})
                            </span>
                            <span className="text-[10px] text-indigo-600 dark:text-indigo-400">
                              Click any base spec chip below to override or fill its value on this variant
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {selectedParent.attributes.map((pa, pIdx) => {
                              const overridden = formAttributes.find(
                                (fa) => fa.key.trim().toLowerCase() === pa.key.trim().toLowerCase() && fa.value.trim() !== ''
                              );
                              return (
                                <button
                                  key={pIdx}
                                  type="button"
                                  onClick={() => {
                                    setActiveFormTab('specs_media');
                                    setFormAttributes((prev) => {
                                      const exists = prev.some(
                                        (fa) => fa.key.trim().toLowerCase() === pa.key.trim().toLowerCase()
                                      );
                                      if (exists) return prev;
                                      return [...prev, { key: pa.key, value: pa.value || '' }];
                                    });
                                    document.getElementById('product-chapter-3')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                  }}
                                  className={`px-2 py-0.5 rounded-md text-[10.5px] font-mono border transition cursor-pointer ${
                                    overridden
                                      ? 'bg-indigo-600 text-white border-indigo-600 font-bold'
                                      : pa.value.trim() === ''
                                      ? 'bg-amber-50 text-amber-800 border-amber-300 font-semibold'
                                      : 'bg-white dark:bg-slate-900 text-indigo-900 dark:text-indigo-200 border-indigo-200 dark:border-indigo-700 hover:border-indigo-400'
                                  }`}
                                  title="Click to customize or override this attribute on the variant"
                                >
                                  {pa.key}: {overridden ? `${overridden.value} (Overridden)` : pa.value || '[Template Blank — Click to Fill]'}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* CHAPTER 1: CORE PRODUCT IDENTITY & SKU */}
                <div
                  id="product-chapter-1"
                  onClick={() => setActiveFormTab('overview')}
                  className="scroll-mt-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-2xs p-5 space-y-4"
                >
                  <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800/80">
                    <div className="flex items-center gap-2.5">
                      <span className="w-6 h-6 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-mono font-bold text-xs flex items-center justify-center shrink-0">
                        1
                      </span>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                          Core Product Identity &amp; SKU
                        </h4>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          Commercial product title, category classification, manufacturer brand, and part identification
                        </p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-mono text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 font-bold">
                      Product Name / Commercial Title <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 rounded-xl py-2 px-3.5 text-sm font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
                      placeholder="e.g. Industrial Control Module / Assembly"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5">
                    {/* Category Selector with Prefix Pill */}
                    <div className="sm:col-span-4">
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-[11px] font-mono text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold">
                          Category <span className="text-rose-500">*</span>
                        </label>
                        {!isCreatingCategory && (
                          <button
                            type="button"
                            onClick={() => {
                              setIsCreatingCategory(true);
                              setNewCategoryInput('');
                            }}
                            className="text-[10.5px] text-blue-600 dark:text-blue-400 hover:text-blue-700 font-bold inline-flex items-center gap-0.5 cursor-pointer hover:underline"
                          >
                            <Plus className="w-3 h-3" />
                            <span>New</span>
                          </button>
                        )}
                      </div>
                      {isCreatingCategory ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            autoFocus
                            value={newCategoryInput}
                            onChange={(e) => setNewCategoryInput(e.target.value)}
                            placeholder="Category name..."
                            className="w-full bg-white dark:bg-slate-950 border border-blue-400 rounded-xl py-2 px-2.5 text-xs text-slate-800 dark:text-slate-100 focus:outline-none"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleConfirmNewCategory();
                              } else if (e.key === 'Escape') {
                                setIsCreatingCategory(false);
                              }
                            }}
                          />
                          <button
                            type="button"
                            onClick={handleConfirmNewCategory}
                            className="px-2.5 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 shrink-0 cursor-pointer"
                          >
                            Add
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsCreatingCategory(false)}
                            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0 cursor-pointer"
                            title="Cancel custom category"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="relative flex items-center bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 focus-within:border-blue-500 rounded-xl h-[38px] overflow-hidden transition">
                          <span className="pl-2.5 pr-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 select-none shrink-0">
                            CAT
                          </span>
                          <select
                            value={formProductType}
                            onChange={(e) => {
                              if (e.target.value === '__NEW_CATEGORY__') {
                                setIsCreatingCategory(true);
                                setNewCategoryInput('');
                              } else {
                                setFormProductType(e.target.value as ProductType);
                              }
                            }}
                            className="appearance-none w-full bg-transparent pl-1 pr-7 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer h-full truncate"
                          >
                            {productCategories.map((cat) => (
                              <option key={cat} value={cat}>
                                {cat}
                              </option>
                            ))}
                            <option value="__NEW_CATEGORY__">Add Custom Category...</option>
                          </select>
                          <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 pointer-events-none" />
                        </div>
                      )}
                    </div>

                    {/* SKU / Code */}
                    <div className="sm:col-span-3">
                      <div className="flex items-center justify-between gap-1 mb-1.5">
                        <label className="block text-[11px] font-mono text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold truncate">
                          SKU / Internal Code
                        </label>
                        <button
                          type="button"
                          onClick={() => handleGenerateAutoSku()}
                          className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 border border-indigo-200/80 dark:border-indigo-800/70 px-1.5 py-0.5 rounded-md inline-flex items-center gap-0.5 transition cursor-pointer shrink-0"
                          title={
                            formVariantParentId
                              ? 'Generate hierarchical variant SKU ([PARENT_SKU]-[VARIANT_TOKEN]) from Variant Label, Spec, or Model'
                              : 'Generate clean base SKU ([BRAND]-[SERIES]) from Brand, Product Name, and Category'
                          }
                        >
                          <Sparkles className="w-2.5 h-2.5" />
                          <span>Auto-SKU</span>
                        </button>
                      </div>
                      <input
                        type="text"
                        value={formSku}
                        onChange={(e) => {
                          setFormSku(e.target.value);
                          setIsSkuAutoManaged(false);
                        }}
                        className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 rounded-xl h-[38px] px-3 text-xs font-mono font-semibold text-slate-800 dark:text-slate-100 focus:outline-none"
                        placeholder={formVariantParentId ? 'e.g. AVE-MMF-3672' : 'e.g. AVE-MMF'}
                      />
                    </div>

                    {/* Brand / Make */}
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-mono text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 font-bold">
                        Brand / Make
                      </label>
                      <input
                        type="text"
                        value={formBrandMake}
                        onChange={(e) => setFormBrandMake(e.target.value)}
                        className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 rounded-xl h-[38px] px-3 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none"
                        placeholder="e.g. Siemens"
                      />
                    </div>

                    {/* Model / Part Number */}
                    <div className="sm:col-span-3">
                      <label className="block text-[11px] font-mono text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 font-bold">
                        Model / Part Number
                      </label>
                      <input
                        type="text"
                        value={formModelPartNo}
                        onChange={(e) => {
                          const nextModel = e.target.value;
                          setFormModelPartNo(nextModel);
                          if (isSkuAutoManaged && !editingProduct && formVariantParentId) {
                            handleGenerateAutoSku({ modelPartNo: nextModel, silent: true });
                          }
                        }}
                        className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 rounded-xl h-[38px] px-3 text-xs font-mono text-slate-800 dark:text-slate-100 focus:outline-none"
                        placeholder="e.g. MOD-200X"
                      />
                    </div>
                  </div>
                </div>

                {/* CHAPTER 2: COMMERCIAL PRICING & STOCK */}
                <div
                  id="product-chapter-2"
                  onClick={() => setActiveFormTab('inventory')}
                  className="scroll-mt-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-2xs p-5 space-y-4"
                >
                  <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800/80">
                    <div className="flex items-center gap-2.5">
                      <span className="w-6 h-6 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-mono font-bold text-xs flex items-center justify-center shrink-0">
                        2
                      </span>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                          Commercial Pricing &amp; Stock
                        </h4>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          Unit of measure, selling price, composite kit BOM, lead time, and warehouse inventory tracking
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Unit, Standard Selling Price, Cost Price */}
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5">
                    <div className="sm:col-span-4">
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-[11px] font-mono text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold">
                          Unit (UOM) <span className="text-rose-500">*</span>
                        </label>
                        {!isCreatingUnit && (
                          <button
                            type="button"
                            onClick={() => {
                              setIsCreatingUnit(true);
                              setNewUnitInput('');
                            }}
                            className="text-[10.5px] text-blue-600 dark:text-blue-400 hover:text-blue-700 font-bold inline-flex items-center gap-0.5 cursor-pointer hover:underline"
                          >
                            <Plus className="w-3 h-3" />
                            <span>Add Unit</span>
                          </button>
                        )}
                      </div>
                      {isCreatingUnit ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            autoFocus
                            value={newUnitInput}
                            onChange={(e) => setNewUnitInput(e.target.value)}
                            placeholder="e.g. Roll, Pack..."
                            className="w-full bg-white dark:bg-slate-950 border border-blue-400 rounded-xl py-2 px-2.5 text-xs text-slate-800 dark:text-slate-100 focus:outline-none"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleConfirmNewUnit();
                              } else if (e.key === 'Escape') {
                                setIsCreatingUnit(false);
                              }
                            }}
                          />
                          <button
                            type="button"
                            onClick={handleConfirmNewUnit}
                            className="px-2.5 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 shrink-0 cursor-pointer"
                          >
                            Add
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setIsCreatingUnit(false);
                              setNewUnitInput('');
                            }}
                            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0 cursor-pointer"
                            title="Cancel custom unit and return to standard UOM list"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="relative flex items-center bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 focus-within:border-blue-500 rounded-xl h-[38px] overflow-hidden transition">
                          <span className="pl-2.5 pr-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 select-none shrink-0">
                            UOM
                          </span>
                          <select
                            value={formUnit || 'Nos'}
                            onChange={(e) => {
                              if (e.target.value === '__NEW_UNIT__') {
                                setIsCreatingUnit(true);
                                setNewUnitInput('');
                              } else {
                                setFormUnit(e.target.value as UnitType);
                              }
                            }}
                            className="appearance-none w-full bg-transparent pl-1 pr-7 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer h-full truncate"
                          >
                            {units.map((u) => (
                              <option key={u} value={u}>
                                {u}
                              </option>
                            ))}
                            <option value="__NEW_UNIT__">Add Custom Unit...</option>
                          </select>
                          <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 pointer-events-none" />
                        </div>
                      )}
                    </div>

                    <div className="sm:col-span-4">
                      <label className="block text-[11px] font-mono text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 font-bold">
                        Selling Price (AED)
                      </label>
                      <div className="relative flex items-center">
                        <span className="absolute left-3 text-[10px] font-mono font-bold text-slate-400 pointer-events-none">
                          AED
                        </span>
                        <input
                          type="number"
                          min={0}
                          step="any"
                          value={formUnitPrice ?? ''}
                          onChange={(e) => setFormUnitPrice(e.target.value !== '' ? Number(e.target.value) : undefined)}
                          className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 rounded-xl h-[38px] pl-10 pr-3 text-sm font-mono font-bold text-slate-900 dark:text-slate-100 focus:outline-none"
                          placeholder="0.00 (Price on Request)"
                        />
                      </div>
                    </div>

                    <div className="sm:col-span-4">
                      <label className="block text-[11px] font-mono text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 font-bold">
                        Base Cost Price (AED)
                      </label>
                      <div className="relative flex items-center">
                        <span className="absolute left-3 text-[10px] font-mono font-bold text-slate-400 pointer-events-none">
                          AED
                        </span>
                        <input
                          type="number"
                          min={0}
                          step="any"
                          value={formCostPrice ?? ''}
                          onChange={(e) => setFormCostPrice(e.target.value !== '' ? Number(e.target.value) : undefined)}
                          className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 rounded-xl h-[38px] pl-10 pr-3 text-sm font-mono text-slate-800 dark:text-slate-200 focus:outline-none"
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                  </div>

                  {canViewConfidentialMargins && livePricingMetrics && (
                    <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs flex-wrap gap-2">
                      <span className="text-slate-500 dark:text-slate-400 font-medium">
                        Estimated Gross Profit per {formUnit || 'Unit'}:
                      </span>
                      <div className="flex items-center gap-2.5 font-mono font-bold">
                        <span className={livePricingMetrics.profit >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                          AED {livePricingMetrics.profit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/60 text-[11px]">
                          Margin: {livePricingMetrics.marginPct.toFixed(1)}%
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800/60 text-[11px]">
                          Markup: {livePricingMetrics.markupPct.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Included Items & Package Sub-Components inside Products Catalog */}
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80">
                    {!formIsCompositeSet && formSubComponents.length === 0 ? (
                      <button
                        type="button"
                        onClick={() => {
                          setFormIsCompositeSet(true);
                          setFormPackagePricingMode('lump_sum');
                          setFormSubComponents([
                            {
                              id: `comp_${Date.now()}_1`,
                              sn: '1',
                              item_name: '',
                              remark: '',
                              quantity: 1,
                              unit: 'Nos',
                              cost_price: 0,
                              unit_price: 0,
                              total_price: 0,
                              line_total: 0,
                              is_included_accessory: true
                            }
                          ]);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/60 text-xs font-semibold transition cursor-pointer"
                      >
                        <Layers className="w-3.5 h-3.5" />
                        <span>+ Included Package Items / Accessories</span>
                      </button>
                    ) : (
                      <CompositePackageEditor
                        item={{
                          id: editingProduct?.id || 'catalog_bom_draft',
                          item_type: 'Product',
                          product_type: formProductType || 'System Package',
                          name: formName || 'Package / Set',
                          description: formDescription || formName || 'Package / Set',
                          quantity: 1,
                          unit: formUnit || 'SET',
                          unit_price: formUnitPrice,
                          cost_price: formCostPrice,
                          is_composite_set: formIsCompositeSet,
                          sub_components: formSubComponents,
                          package_pricing_mode: formPackagePricingMode,
                          option_scope_notes: formOptionScopeNotes
                        }}
                        currency="AED"
                        products={activeCatalogProducts.filter((p) => p.id !== editingProduct?.id)}
                        setProducts={setProducts}
                        activeWorkspace={activeWorkspace}
                        onChange={(updates) => {
                          if (updates.is_composite_set !== undefined) {
                            setFormIsCompositeSet(updates.is_composite_set);
                          }
                          if (updates.sub_components !== undefined) {
                            setFormSubComponents(updates.sub_components);
                          }
                          if (updates.package_pricing_mode !== undefined) {
                            setFormPackagePricingMode(updates.package_pricing_mode);
                          }
                          if (updates.option_scope_notes !== undefined) {
                            setFormOptionScopeNotes(updates.option_scope_notes);
                          }
                          if (updates.unit_price !== undefined && updates.unit_price > 0) {
                            setFormUnitPrice(updates.unit_price);
                          }
                          if (updates.cost_price !== undefined && updates.cost_price > 0) {
                            setFormCostPrice(updates.cost_price);
                          }
                        }}
                      />
                    )}
                  </div>

                  {/* Default Lead Time / Availability */}
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80">
                    <label className="block text-[11px] font-mono text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 font-bold">
                      Default Lead Time / Availability (Carried to Quotes)
                    </label>
                    <input
                      type="text"
                      value={formDefaultAvailability}
                      onChange={(e) => setFormDefaultAvailability(e.target.value)}
                      className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 rounded-xl py-2 px-3.5 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none"
                      placeholder="e.g. Ex-Stock, 2-3 Weeks, 6-8 Weeks from Approval"
                    />
                    <div className="flex items-center flex-wrap gap-1.5 mt-2">
                      <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 uppercase mr-1 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Quick Select:
                      </span>
                      {AVAILABILITY_PRESETS.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setFormDefaultAvailability(preset)}
                          className={`px-2 py-0.5 rounded-md text-[11px] font-medium border transition cursor-pointer ${
                            formDefaultAvailability === preset
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Track Inventory & Physical Stock Sub-Section */}
                  <div className="pt-3.5 border-t border-slate-100 dark:border-slate-800/80 space-y-3.5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                          <Boxes className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block">
                            Track Physical Warehouse Inventory
                          </span>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">
                            Maintain live stock-on-hand counts, order reservations, low-stock alerts, and bin locations
                          </span>
                        </div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer shrink-0">
                        <input
                          type="checkbox"
                          id="track-stock-checkbox"
                          checked={formIsInventoried}
                          onChange={(e) => setFormIsInventoried(e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-10 h-5.5 bg-slate-300 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[3px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4.5 after:w-4.5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>

                    {formIsInventoried && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-1">
                        <div>
                          <label className="block text-[11px] font-mono text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 font-bold">
                            On-Hand Quantity
                          </label>
                          <input
                            type="number"
                            min={0}
                            step="any"
                            value={formStockOnHand ?? 0}
                            onChange={(e) =>
                              setFormStockOnHand(e.target.value !== '' ? Number(e.target.value) : 0)
                            }
                            className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 rounded-xl py-2 px-3 text-xs text-slate-900 dark:text-slate-100 font-mono font-bold focus:outline-none"
                            placeholder="0"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-mono text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 font-bold">
                            Low-Stock Alert Threshold
                          </label>
                          <input
                            type="number"
                            min={0}
                            step="any"
                            value={formReorderLevel ?? 0}
                            onChange={(e) =>
                              setFormReorderLevel(e.target.value !== '' ? Number(e.target.value) : 0)
                            }
                            className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 rounded-xl py-2 px-3 text-xs text-slate-900 dark:text-slate-100 font-mono focus:outline-none"
                            placeholder="e.g. 5"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-mono text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 font-bold">
                            Storage Bay / Bin Location
                          </label>
                          <input
                            type="text"
                            value={formStorageLocation}
                            onChange={(e) => setFormStorageLocation(e.target.value)}
                            className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 rounded-xl py-2 px-3 text-xs text-slate-800 dark:text-slate-100 font-mono focus:outline-none"
                            placeholder="e.g. WH-1 / Rack B-04"
                          />
                        </div>
                      </div>
                    )}

                    {/* Origin, Customs & Export Logistics (Progressive Disclosure when Empty) */}
                    {(() => {
                      const hasSecondaryLogisticsValues = Boolean(
                        formCountryOfOrigin.trim() ||
                          formHsCode.trim() ||
                          (formGrossWeightKg !== undefined &&
                            formGrossWeightKg !== null &&
                            String(formGrossWeightKg) !== '')
                      );
                      if (!hasSecondaryLogisticsValues && !showSecondaryLogisticsFields) {
                        return (
                          <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80">
                            <button
                              type="button"
                              onClick={() => setShowSecondaryLogisticsFields(true)}
                              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                              <span>Add Origin, HS Tariff Code &amp; Weight</span>
                            </button>
                          </div>
                        );
                      }
                      return (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-2 border-t border-slate-100 dark:border-slate-800/80">
                          <div>
                            <label className="block text-[11px] font-mono text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 font-bold">
                              Country of Origin
                            </label>
                            <input
                              type="text"
                              value={formCountryOfOrigin}
                              onChange={(e) => setFormCountryOfOrigin(e.target.value)}
                              className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 rounded-xl py-2 px-3 text-xs text-slate-800 dark:text-slate-100 focus:outline-none"
                              placeholder="e.g. USA, Germany, UAE, Italy"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-mono text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 font-bold">
                              HS Tariff Code
                            </label>
                            <input
                              type="text"
                              value={formHsCode}
                              onChange={(e) => setFormHsCode(e.target.value)}
                              className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 rounded-xl py-2 px-3 text-xs text-slate-800 dark:text-slate-100 font-mono focus:outline-none"
                              placeholder="e.g. 8421.21.00"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-mono text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 font-bold">
                              Gross Unit Weight (kg)
                            </label>
                            <input
                              type="number"
                              min={0}
                              step="any"
                              value={formGrossWeightKg ?? ''}
                              onChange={(e) =>
                                setFormGrossWeightKg(e.target.value !== '' ? Number(e.target.value) : undefined)
                              }
                              className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 rounded-xl py-2 px-3 text-xs text-slate-800 dark:text-slate-100 font-mono focus:outline-none"
                              placeholder="e.g. 16.5"
                            />
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* CHAPTER 3: TECHNICAL SPECIFICATIONS & MEDIA */}
                <div
                  id="product-chapter-3"
                  onClick={() => setActiveFormTab('specs_media')}
                  className="scroll-mt-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-2xs p-5 space-y-4"
                >
                  <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800/80 flex-wrap">
                    <div className="flex items-center gap-2.5">
                      <span className="w-6 h-6 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-mono font-bold text-xs flex items-center justify-center shrink-0">
                        3
                      </span>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                          Technical Specifications &amp; Media
                        </h4>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          Structured key-value engineering attributes, commercial narrative, product photos, and PDF datasheet
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={handleCleanFormSiUnits}
                        className="h-8 px-2.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800 text-xs font-bold inline-flex items-center gap-1 cursor-pointer transition"
                        title="Standardize SI / ISO 80000 units, canonicalize spec keys, normalize UOM & Lead Time, and move duplicate Delivery/Origin/Model/Brand specs into dedicated fields"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>✨ Clean SI Units</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormAttributes((prev) => [...prev, { key: '', value: '' }])}
                        className="h-8 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition shrink-0 shadow-2xs"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Spec Attribute</span>
                      </button>
                    </div>
                  </div>

                  {/* 1. Dynamic Multi-Tenant Specification Attributes with Progressive Disclosure Quick-Add Chips */}
                  <div className="space-y-2.5">
                    {suggestedAttributeChips.length > 0 && (
                      <div className="flex items-center flex-wrap gap-1">
                        <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 font-semibold uppercase mr-1 flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-blue-500" /> Quick-Add:
                        </span>
                        {suggestedAttributeChips.map((chip) => (
                          <button
                            key={chip}
                            type="button"
                            onClick={() => setFormAttributes((prev) => [...prev, { key: chip, value: '' }])}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-50 dark:bg-slate-800/90 hover:bg-blue-50 dark:hover:bg-blue-950/50 text-slate-700 dark:text-slate-300 hover:text-blue-700 dark:hover:text-blue-300 border border-slate-200/80 dark:border-slate-700 hover:border-blue-200 dark:hover:border-blue-800 transition cursor-pointer"
                          >
                            <Plus className="w-2.5 h-2.5 shrink-0 opacity-70" />
                            <span>{chip}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {formAttributes.length > 0 ? (
                      <div className="space-y-2 py-0.5 pr-1">
                        {formAttributes.map((attr, index) => (
                          <div key={index} className="flex items-center gap-2">
                            <input
                              type="text"
                              placeholder="Spec Key (e.g. Color, Capacity, Range, MOC)"
                              value={attr.key ?? ''}
                              onChange={(e) => {
                                const nextKey = e.target.value;
                                const next = formAttributes.map((a, i) => (i === index ? { ...a, key: nextKey } : a));
                                const prevCompiled = compileDescriptionWithSpecs(formName, '', formAttributes);
                                setFormAttributes(next);
                                if (
                                  !formDescription.trim() ||
                                  formDescription.trim() === formName.trim() ||
                                  formDescription.trim() === prevCompiled.trim()
                                ) {
                                  setFormDescription(compileDescriptionWithSpecs(formName, '', next));
                                }
                              }}
                              className="w-32 sm:w-44 shrink-0 bg-slate-50/80 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-1.5 px-3 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-blue-500"
                            />
                            <input
                              type="text"
                              placeholder="Spec Value (e.g. Black, 1.1, 15-20, SS316L)"
                              value={attr.value ?? ''}
                              onChange={(e) => {
                                const nextVal = e.target.value;
                                const next = formAttributes.map((a, i) => (i === index ? { ...a, value: nextVal } : a));
                                const prevCompiled = compileDescriptionWithSpecs(formName, '', formAttributes);
                                setFormAttributes(next);
                                if (
                                  !formDescription.trim() ||
                                  formDescription.trim() === formName.trim() ||
                                  formDescription.trim() === prevCompiled.trim()
                                ) {
                                  setFormDescription(compileDescriptionWithSpecs(formName, '', next));
                                }
                              }}
                              className="flex-1 min-w-0 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-1.5 px-3 text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const next = formAttributes.filter((_, i) => i !== index);
                                const prevCompiled = compileDescriptionWithSpecs(formName, '', formAttributes);
                                setFormAttributes(next);
                                if (
                                  !formDescription.trim() ||
                                  formDescription.trim() === formName.trim() ||
                                  formDescription.trim() === prevCompiled.trim()
                                ) {
                                  setFormDescription(compileDescriptionWithSpecs(formName, '', next));
                                }
                              }}
                              className="p-1.5 text-slate-400 hover:text-rose-500 transition rounded-lg shrink-0 cursor-pointer"
                              title="Remove Attribute"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-slate-400 dark:text-slate-500 text-xs py-2">
                        No structured specification attributes yet. Click any Quick-Add chip above or &ldquo;Add Spec Attribute&rdquo;.
                      </p>
                    )}
                  </div>

                  {/* 2. Commercial & Technical Description */}
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80">
                    <div className="flex items-center justify-between flex-wrap gap-2 mb-1.5">
                      <label className="block text-[11px] font-mono text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold">
                        Commercial &amp; Technical Description
                      </label>
                      {formAttributes.some((a) => a.key.trim() && a.value.trim()) && (
                        <button
                          type="button"
                          onClick={() => setFormDescription(compileDescriptionWithSpecs(formName, formDescription, formAttributes))}
                          className="text-[11px] text-blue-600 dark:text-blue-400 hover:text-blue-700 font-bold inline-flex items-center gap-1 cursor-pointer hover:underline"
                          title="Compile structured specification attributes into the Commercial & Technical Description"
                        >
                          <Sparkles className="w-3 h-3" />
                          <span>Sync from Spec Attributes</span>
                        </button>
                      )}
                    </div>
                    <textarea
                      rows={3}
                      value={formDescription}
                      onChange={(e) => setFormDescription(e.target.value)}
                      className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 rounded-xl py-2 px-3.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none"
                      placeholder="Detailed commercial narrative, operating conditions, materials of construction, or scope of supply..."
                    />
                  </div>

                  {/* 3. Product Image & Technical Datasheet Upload Row (Compact Side-by-Side) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-slate-100 dark:border-slate-800/80">
                    {/* Product Photo & Secondary Technical Diagram Card */}
                    <div className="p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/50 flex flex-col justify-between space-y-2.5">
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                            <ImageIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                            <span>Product Image &amp; Diagram</span>
                          </span>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                            Primary photo + optional 2nd diagram. Click, drop, or Ctrl+V paste.
                          </p>
                        </div>
                        {formImageUrl && (
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono font-bold ${
                              formImageUrl.startsWith('http')
                                ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                                : 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                            }`}
                          >
                            {formImageUrl.startsWith('http') ? (
                              <>
                                <Cloud className="w-2.5 h-2.5" />
                                <span>BUCKET URL</span>
                              </>
                            ) : (
                              <>
                                <HardDrive className="w-2.5 h-2.5" />
                                <span>COMPRESSED</span>
                              </>
                            )}
                          </span>
                        )}
                      </div>

                      <LineItemImageOptionsPopover
                        itemTitle={formName || 'Catalog Product'}
                        imageUrl={formImageUrl}
                        secondaryImageUrl={formSecondaryImageUrl}
                        imageCaption={formImageCaption}
                        secondaryImageCaption={formSecondaryImageCaption}
                        imageAdjustments={formImageAdjustments}
                        activeWorkspace={activeWorkspace}
                        triggerToast={triggerToast}
                        showOverrideControls={false}
                        onChange={(patch) => {
                          if ('image_url' in patch) {
                            if (formImageUrl && formImageUrl !== patch.image_url) {
                              setPendingDeletedStorageUrls((prev) => Array.from(new Set([...prev, formImageUrl])));
                            }
                            setFormImageUrl(patch.image_url || '');
                          }
                          if ('secondary_image_url' in patch) {
                            if (formSecondaryImageUrl && formSecondaryImageUrl !== patch.secondary_image_url) {
                              setPendingDeletedStorageUrls((prev) => Array.from(new Set([...prev, formSecondaryImageUrl])));
                            }
                            setFormSecondaryImageUrl(patch.secondary_image_url || '');
                          }
                          if ('image_caption' in patch) setFormImageCaption(patch.image_caption || '');
                          if ('secondary_image_caption' in patch) setFormSecondaryImageCaption(patch.secondary_image_caption || '');
                          if ('image_adjustments' in patch) setFormImageAdjustments(patch.image_adjustments);
                        }}
                      />
                    </div>

                    {/* Technical Datasheet / Spec Sheet Card */}
                    <div className="p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/50 flex flex-col justify-between space-y-2.5">
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                            <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                            <span>Technical Datasheet / Spec Sheet</span>
                          </span>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                            Auto-attaches as a Technical Annex when added to a Quotation.
                          </p>
                        </div>
                        {formDatasheetAttachment && (
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono font-bold ${
                              !formDatasheetAttachment.isLocal
                                ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                                : 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                            }`}
                          >
                            {!formDatasheetAttachment.isLocal ? 'BUCKET PDF' : 'LOCAL PDF'}
                          </span>
                        )}
                      </div>

                      {formDatasheetAttachment ? (
                        <div className="flex items-center justify-between gap-3 bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 shrink-0">
                              <Paperclip className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <span
                                className="text-xs font-bold text-slate-800 dark:text-slate-100 block truncate"
                                title={formDatasheetAttachment.name}
                              >
                                {formDatasheetAttachment.name}
                              </span>
                              <span className="text-[10px] font-mono text-slate-400">
                                {((formDatasheetAttachment.size || 0) / 1024).toFixed(1)} KB
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {formDatasheetAttachment.url && (
                              <a
                                href={formDatasheetAttachment.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
                                title="Open Datasheet"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                if (formDatasheetAttachment?.url) {
                                  setPendingDeletedStorageUrls((prev) =>
                                    Array.from(new Set([...prev, formDatasheetAttachment.url]))
                                  );
                                }
                                setFormDatasheetAttachment(undefined);
                              }}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition cursor-pointer"
                              title="Remove Datasheet"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <label className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-indigo-400 bg-white dark:bg-slate-900 rounded-xl p-3.5 flex flex-col items-center justify-center text-center cursor-pointer transition">
                          <UploadCloud className="w-5 h-5 text-indigo-500 mb-1" />
                          <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                            {isUploadingDatasheet
                              ? `Uploading (${datasheetUploadProgress ?? 0}%)...`
                              : 'Click to Upload PDF / Spec Sheet'}
                          </span>
                          <span className="text-[10px] text-slate-400 mt-0.5">
                            PDF or Image · Stored in Custom Bucket (`products/datasheets`)
                          </span>
                          <input
                            type="file"
                            accept="application/pdf,image/*"
                            disabled={isUploadingDatasheet}
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handleDatasheetUpload(f);
                              e.target.value = '';
                            }}
                          />
                        </label>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Executive Sticky Footer Bar */}
              <div className="px-4 py-3 sm:px-6 sm:py-3.5 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shrink-0">
                <div className="flex items-center gap-2 sm:gap-3 flex-wrap text-xs">
                  {formUnitPrice !== undefined && formUnitPrice > 0 && (
                    <>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-mono uppercase text-slate-400 dark:text-slate-500">Rate:</span>
                        <span className="font-mono font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                          AED {Number(formUnitPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / {formUnit || 'Nos'}
                        </span>
                      </div>
                      <span className="text-slate-300 dark:text-slate-700">·</span>
                    </>
                  )}
                  <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {formAttributes.filter((a) => a.key.trim() && a.value.trim()).length} Specs
                  </span>
                  <span className="text-slate-300 dark:text-slate-700">·</span>
                  <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {formIsInventoried ? `Tracked (${formStockOnHand ?? 0} ${formUnit || 'Nos'})` : 'Non-Stock'}
                  </span>
                </div>

                <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2 sm:gap-2.5 w-full sm:w-auto sm:ml-auto">
                  <button
                    type="button"
                    onClick={() => setShowFormModal(false)}
                    className="h-9 px-4 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold rounded-lg text-xs transition cursor-pointer w-full sm:w-auto text-center"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || isUploadingImage || isUploadingDatasheet || !activeWorkspace?.id}
                    className="h-9 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold rounded-lg text-xs transition shadow-2xs inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-not-allowed whitespace-nowrap w-full sm:w-auto"
                  >
                    {isSubmitting && (
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    )}
                    <span>
                      {isSubmitting
                        ? 'Saving...'
                        : editingProduct
                        ? 'Save Product Changes'
                        : formVariantParentId
                        ? 'Register Spec Variant'
                        : 'Register Product'}
                    </span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}

        {/* Controlled Master Parent -> Linked Variants Sync Modal */}
        {showParentSyncModal && editingProduct && (() => {
          const linkedChildren = getEditingLinkedVariants();
          const liveParent = buildLiveParentSyncSnapshot();
          const protectedSpecKeys = detectProtectedVariantSpecKeys(linkedChildren);
          const syncableParentSpecs = (liveParent.attributes || []).filter(
            (a) =>
              a &&
              a.key.trim() !== '' &&
              a.value.trim() !== '' &&
              !isProtectedVariantSpecKey(a.key, protectedSpecKeys)
          );
          const mediaCount = [liveParent.image_url, liveParent.secondary_image_url].filter(
            (u) => Boolean(u && u.trim())
          ).length;

          const syncFieldOptions: Array<{
            key: ParentSyncFieldKey;
            label: string;
            preview: string;
          }> = [
            {
              key: 'category',
              label: 'Product Category',
              preview: liveParent.product_type ? String(liveParent.product_type) : 'Empty'
            },
            {
              key: 'brand_make',
              label: 'Brand / Make',
              preview: (liveParent.brand_make || '').trim() || 'Empty'
            },
            {
              key: 'country_of_origin',
              label: 'Country of Origin',
              preview: (liveParent.country_of_origin || '').trim() || 'Empty'
            },
            {
              key: 'lead_time',
              label: 'Lead Time / Availability',
              preview: (liveParent.default_availability || '').trim() || 'Empty'
            },
            {
              key: 'description',
              label: 'Commercial Description',
              preview: (liveParent.description || '').trim()
                ? `${String(liveParent.description).trim().slice(0, 48)}${String(liveParent.description).trim().length > 48 ? '…' : ''}`
                : 'Empty'
            },
            {
              key: 'media',
              label: 'Product Photos (Primary & Secondary)',
              preview: mediaCount > 0 ? `${mediaCount} photo${mediaCount === 1 ? '' : 's'} attached` : 'No photos (clears child photos)'
            },
            {
              key: 'datasheet',
              label: 'Datasheet PDF Attachment',
              preview: liveParent.datasheet_attachment?.name || (liveParent.datasheet_url ? 'Linked datasheet' : 'None')
            },
            {
              key: 'shared_specs',
              label: 'Shared Technical Specs',
              preview:
                syncableParentSpecs.length > 0
                  ? `${syncableParentSpecs.length} shared spec${syncableParentSpecs.length === 1 ? '' : 's'} (${protectedSpecKeys.size} size/variant key${protectedSpecKeys.size === 1 ? '' : 's'} protected)`
                  : 'No shared non-size specs to merge'
            },
            {
              key: 'sub_components',
              label: 'Included Items / Package Contents',
              preview:
                liveParent.is_composite_set && Array.isArray(liveParent.sub_components) && liveParent.sub_components.length > 0
                  ? `${liveParent.sub_components.length} sub-item${liveParent.sub_components.length === 1 ? '' : 's'}`
                  : 'Not a composite package'
            }
          ];

          const toggleSyncField = (key: ParentSyncFieldKey) => {
            setSelectedParentSyncFields((prev) =>
              prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
            );
          };

          return (
            <div className="fixed inset-0 z-[110] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                <div className="px-5 py-3.5 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200/80 dark:border-indigo-800/60 shrink-0">
                      <RefreshCw className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                        Sync Shared Fields to {linkedChildren.length} Variant{linkedChildren.length === 1 ? '' : 's'}
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        Master Parent: {liveParent.name || editingProduct.name}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => !isSyncingVariants && setShowParentSyncModal(false)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-4 space-y-3 max-h-[68vh] overflow-y-auto">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      Select parent fields to push down ({selectedParentSyncFields.length}/{ALL_PARENT_SYNC_FIELDS.length})
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedParentSyncFields([...ALL_PARENT_SYNC_FIELDS])}
                        className="text-indigo-600 dark:text-indigo-400 hover:underline font-semibold cursor-pointer"
                      >
                        Select All
                      </button>
                      <span className="text-slate-300">·</span>
                      <button
                        type="button"
                        onClick={() => setSelectedParentSyncFields([])}
                        className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:underline font-semibold cursor-pointer"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    {syncFieldOptions.map((opt) => {
                      const checked = selectedParentSyncFields.includes(opt.key);
                      return (
                        <label
                          key={opt.key}
                          className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition cursor-pointer ${
                            checked
                              ? 'bg-indigo-50/70 dark:bg-indigo-950/35 border-indigo-200 dark:border-indigo-800'
                              : 'bg-slate-50/50 dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleSyncField(opt.key)}
                            className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                          />
                          <div className="min-w-0 flex-1">
                            <span className="block text-xs font-bold text-slate-900 dark:text-slate-100 leading-tight">
                              {opt.label}
                            </span>
                            <span className="block text-[10.5px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                              {opt.preview}
                            </span>
                          </div>
                        </label>
                      );
                    })}
                  </div>

                  <div className="p-2.5 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200/90 dark:border-emerald-800/70 flex items-start gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    <p className="text-[11px] font-medium text-emerald-900 dark:text-emerald-200 leading-snug">
                      <span className="font-bold">Protected:</span> Child SKUs, Models, Prices, Stock &amp; size-specific specs are never overwritten.
                    </p>
                  </div>
                </div>

                <div className="px-5 py-3 border-t border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/80 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    disabled={isSyncingVariants}
                    onClick={() => setShowParentSyncModal(false)}
                    className="h-9 px-3.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isSyncingVariants || selectedParentSyncFields.length === 0}
                    onClick={() => void handleExecuteParentSyncToVariants()}
                    className="h-9 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer disabled:cursor-not-allowed shadow-2xs"
                  >
                    {isSyncingVariants ? (
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {isSyncingVariants
                        ? 'Syncing Variants...'
                        : `Push to ${linkedChildren.length} Variant${linkedChildren.length === 1 ? '' : 's'}`}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Bulk Variant Matrix Modal (Quick-Add Multiple Sizes / Models under Master Parent) */}
        {showBulkVariantMatrixModal && editingProduct && (() => {
          const validCount = bulkVariantRows.filter(
            (r) => r.variantLabel.trim() !== '' || r.modelPartNo.trim() !== ''
          ).length;
          const effectiveParentSku =
            (formSku.trim() || editingProduct.sku || '').trim() ||
            suggestParentBaseSku(formBrandMake, formName || editingProduct.name, formProductType);
          const isCustomSpecKey = !COMMON_DIFFERENTIATING_SPEC_KEYS.some(
            (k) => k.toLowerCase() === bulkVariantSpecKey.trim().toLowerCase()
          );

          return (
            <div className="fixed inset-0 z-[110] bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                {/* Modal Header */}
                <div className="px-5 py-3.5 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="p-2 rounded-xl bg-violet-50 dark:bg-violet-950/60 text-violet-600 dark:text-violet-400 border border-violet-200/80 dark:border-violet-800/60 shrink-0">
                      <Layers className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                        Bulk Add Variants
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        Master Parent: <span className="font-semibold text-slate-700 dark:text-slate-200">{formName || editingProduct.name}</span>
                        {' • '}
                        Base SKU: <span className="font-mono font-semibold text-violet-700 dark:text-violet-300">{effectiveParentSku}</span>
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => !isSavingBulkVariants && setShowBulkVariantMatrixModal(false)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Matrix Controls Toolbar */}
                <div className="px-5 py-3 border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      Differentiating Spec:
                    </label>
                    <select
                      value={isCustomSpecKey ? '__custom__' : bulkVariantSpecKey}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '__custom__') {
                          setBulkVariantSpecKey('');
                          return;
                        }
                        setBulkVariantSpecKey(val);
                        setBulkVariantRows(recomputeBulkRows(bulkVariantRows, val));
                      }}
                      className="h-8 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-violet-500"
                    >
                      {COMMON_DIFFERENTIATING_SPEC_KEYS.map((k) => (
                        <option key={k} value={k}>
                          {k}
                        </option>
                      ))}
                      <option value="__custom__">Custom Spec Key...</option>
                    </select>
                    {isCustomSpecKey && (
                      <input
                        type="text"
                        value={bulkVariantSpecKey}
                        onChange={(e) => {
                          setBulkVariantSpecKey(e.target.value);
                          setBulkVariantRows(recomputeBulkRows(bulkVariantRows, e.target.value));
                        }}
                        placeholder="e.g. Vessel Size, Pore Rating..."
                        className="h-8 w-44 rounded-lg border border-violet-300 dark:border-violet-700 bg-white dark:bg-slate-800 px-2.5 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-violet-500"
                      />
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowBulkPastePanel((prev) => !prev)}
                      className={`h-8 px-2.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer ${
                        showBulkPastePanel
                          ? 'bg-violet-50 dark:bg-violet-950/60 border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300'
                          : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>+ Paste Lines</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setBulkVariantRows((prev) => [
                          ...prev,
                          createBlankBulkVariantRow(prev.length)
                        ])
                      }
                      className="h-8 px-2.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-violet-50 dark:hover:bg-violet-950/50 border border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300 text-xs font-bold inline-flex items-center gap-1 transition cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Row</span>
                    </button>
                  </div>
                </div>

                {/* Collapsible Paste Lines Quick Importer */}
                {showBulkPastePanel && (
                  <div className="px-5 py-3 border-b border-violet-200/80 dark:border-violet-800/60 bg-violet-50/50 dark:bg-violet-950/25 space-y-2 shrink-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-violet-900 dark:text-violet-200">
                        Paste one variant per line (supports `Size`, `Size | Selling Price`, `Size | Cost | Selling`, or Excel tab-separated columns)
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowBulkPastePanel(false)}
                        className="text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <textarea
                      rows={4}
                      value={bulkPasteText}
                      onChange={(e) => setBulkPasteText(e.target.value)}
                      placeholder={'24" × 72" | 2400\n30" × 72" | 2850\n36" × 72" | 3750\n42" × 72" | 4950'}
                      className="w-full rounded-xl border border-violet-200 dark:border-violet-800 bg-white dark:bg-slate-900 p-2.5 text-xs font-mono text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-violet-500"
                    />
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setBulkPasteText('')}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-slate-500 hover:text-slate-700 cursor-pointer"
                      >
                        Clear
                      </button>
                      <button
                        type="button"
                        onClick={handleApplyBulkPasteLines}
                        className="px-3 py-1 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer shadow-2xs"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>Apply Pasted Lines</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Editable Spreadsheet Matrix Table */}
                <div className="flex-1 overflow-auto p-4 sm:p-5">
                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-100/90 dark:bg-slate-800/90 border-b border-slate-200 dark:border-slate-700 text-[10.5px] font-mono uppercase tracking-wider text-slate-600 dark:text-slate-300">
                          <th className="py-2 px-2.5 w-8 text-center">#</th>
                          <th className="py-2 px-2.5 min-w-[160px]">
                            {bulkVariantSpecKey.trim() || 'Variant Label'} *
                          </th>
                          <th className="py-2 px-2.5 min-w-[130px]">Model / Part #</th>
                          <th className="py-2 px-2.5 min-w-[165px]">Auto-SKU</th>
                          <th className="py-2 px-2.5 w-28">Cost ({editingProduct.currency || 'AED'})</th>
                          <th className="py-2 px-2.5 w-32">Selling ({editingProduct.currency || 'AED'})</th>
                          <th className="py-2 px-2 w-9 text-center"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs bg-white dark:bg-slate-900">
                        {bulkVariantRows.map((row, idx) => (
                          <tr
                            key={row.id}
                            className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                          >
                            <td className="py-1.5 px-2 text-center font-mono text-[11px] text-slate-400">
                              {idx + 1}
                            </td>
                            <td className="py-1.5 px-2">
                              <input
                                type="text"
                                value={row.variantLabel}
                                onChange={(e) =>
                                  handleBulkRowFieldChange(row.id, 'variantLabel', e.target.value)
                                }
                                placeholder='e.g. 30" × 72"'
                                className="w-full h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:border-violet-500"
                              />
                            </td>
                            <td className="py-1.5 px-2">
                              <input
                                type="text"
                                value={row.modelPartNo}
                                onChange={(e) =>
                                  handleBulkRowFieldChange(row.id, 'modelPartNo', e.target.value)
                                }
                                placeholder="Optional model"
                                className="w-full h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:border-violet-500"
                              />
                            </td>
                            <td className="py-1.5 px-2">
                              <div className="relative flex items-center">
                                <input
                                  type="text"
                                  value={row.sku}
                                  onChange={(e) =>
                                    handleBulkRowFieldChange(row.id, 'sku', e.target.value)
                                  }
                                  placeholder="Auto-generated"
                                  className={`w-full h-8 rounded-lg border px-2.5 pr-7 text-xs font-mono font-semibold focus:outline-none focus:border-violet-500 ${
                                    row.isSkuManual
                                      ? 'border-amber-300 dark:border-amber-700 bg-amber-50/40 dark:bg-amber-950/30 text-amber-950 dark:text-amber-200'
                                      : 'border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-950 text-violet-800 dark:text-violet-300'
                                  }`}
                                />
                                {row.isSkuManual && (
                                  <button
                                    type="button"
                                    onClick={() => handleResetBulkRowAutoSku(row.id)}
                                    title="Re-enable live Smart Auto-SKU for this row"
                                    className="absolute right-1.5 p-0.5 text-amber-600 hover:text-violet-600 cursor-pointer"
                                  >
                                    <RotateCcw className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            </td>
                            <td className="py-1.5 px-2">
                              <input
                                type="number"
                                step="any"
                                min="0"
                                value={row.costPrice}
                                onChange={(e) =>
                                  handleBulkRowFieldChange(row.id, 'costPrice', e.target.value)
                                }
                                placeholder="Optional"
                                className="w-full h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 text-xs font-mono tabular-nums text-slate-800 dark:text-slate-200 focus:outline-none focus:border-violet-500"
                              />
                            </td>
                            <td className="py-1.5 px-2">
                              <input
                                type="number"
                                step="any"
                                min="0"
                                value={row.sellingPrice}
                                onChange={(e) =>
                                  handleBulkRowFieldChange(row.id, 'sellingPrice', e.target.value)
                                }
                                placeholder="0 = POR"
                                className="w-full h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 text-xs font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-violet-500"
                              />
                            </td>
                            <td className="py-1.5 px-1.5 text-center">
                              <button
                                type="button"
                                disabled={bulkVariantRows.length <= 1}
                                onClick={() =>
                                  setBulkVariantRows((prev) =>
                                    recomputeBulkRows(prev.filter((r) => r.id !== row.id))
                                  )
                                }
                                title="Remove row"
                                className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <p className="mt-2.5 text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>
                      Each variant automatically inherits this Master Parent&apos;s category, brand, origin, lead time, photos, datasheet, and shared specs. Blank or 0 selling price saves as Price on Request (POR).
                    </span>
                  </p>
                </div>

                {/* Footer */}
                <div className="px-5 py-3 border-t border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/80 flex items-center justify-between gap-3 shrink-0">
                  <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                    <strong className="text-slate-900 dark:text-slate-100">{validCount}</strong>{' '}
                    variant{validCount === 1 ? '' : 's'} ready to create
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isSavingBulkVariants}
                      onClick={() => setShowBulkVariantMatrixModal(false)}
                      className="h-9 px-3.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={isSavingBulkVariants || validCount === 0}
                      onClick={() => void handleSaveBulkVariantMatrix()}
                      className="h-9 px-4 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:bg-violet-400 text-white text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer disabled:cursor-not-allowed shadow-2xs"
                    >
                      {isSavingBulkVariants ? (
                        <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      )}
                      <span>
                        {isSavingBulkVariants
                          ? 'Creating Variants...'
                          : `Create ${validCount} Variant${validCount === 1 ? '' : 's'}`}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Catalog Product Lightbox & Quick Image Inspector */}
        {lightboxProduct && (
          <ImageLightboxModal
            isOpen={true}
            onClose={() => setLightboxProduct(null)}
            title={lightboxProduct.name || lightboxProduct.description || 'Catalog Product'}
            imageUrl={lightboxProduct.image_url || ''}
            secondaryImageUrl={lightboxProduct.secondary_image_url}
            caption={lightboxProduct.image_caption}
            secondaryCaption={lightboxProduct.secondary_image_caption}
            adjustments={lightboxProduct.image_adjustments}
            activeWorkspace={activeWorkspace}
            triggerToast={triggerToast}
            canEdit={isEditable}
            onSaveChanges={async (updates) => {
              if (!lightboxProduct.id) return;
              const patch: Partial<Product> & Record<string, any> = {
                ...('image_url' in updates
                  ? {
                      image_url: updates.image_url || (null as any),
                      ...(updates.image_url ? {} : { image_storage_key: null as any })
                    }
                  : {}),
                ...('secondary_image_url' in updates
                  ? {
                      secondary_image_url: updates.secondary_image_url || (null as any),
                      ...(updates.secondary_image_url
                        ? {}
                        : { secondary_image_storage_key: null as any })
                    }
                  : {}),
                ...('image_caption' in updates ? { image_caption: updates.image_caption || undefined } : {}),
                ...('secondary_image_caption' in updates ? { secondary_image_caption: updates.secondary_image_caption || undefined } : {}),
                ...('image_adjustments' in updates ? { image_adjustments: updates.image_adjustments } : {}),
                updatedAt: new Date().toISOString()
              };
              const updatedProd = { ...lightboxProduct, ...patch } as Product;
              setLightboxProduct(updatedProd);
              if (setProducts) {
                setProducts((prev) => prev.map((prod) => (prod.id === lightboxProduct.id ? updatedProd : prod)));
              }
              await safeUpdateDoc('products', lightboxProduct.id, sanitizeFirestorePayload(updatedProd));
              await MetadataRepository.upsertLocalProduct(updatedProd).catch(() => {});
            }}
          />
        )}

        {/* Confirmation Dialog overlay */}
        {confirmDialog.isOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-2 sm:p-4 bg-slate-950/60 backdrop-blur-xs">
            <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl p-4 sm:p-6 overflow-hidden">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 font-sans mb-2">{confirmDialog.title}</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 font-sans mb-6 leading-relaxed">{confirmDialog.message}</p>
              <div className="flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
                  className="h-9 px-4 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 transition cursor-pointer"
                >
                  {confirmDialog.cancelText || 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    confirmDialog.onConfirm();
                    setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
                  }}
                  className={`h-9 px-4 rounded-lg text-xs font-semibold text-white transition cursor-pointer ${
                    confirmDialog.isDestructive ? 'bg-rose-600 hover:bg-rose-700' : 'bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-700'
                  }`}
                >
                  {confirmDialog.confirmText || 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Inbound GRN Modal */}
        {showGrnModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 bg-slate-950/60 backdrop-blur-xs">
            <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-3xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[96vh] sm:max-h-[94vh]">
              <div className="py-3.5 px-5 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between shrink-0 bg-white dark:bg-slate-900">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-xl border border-emerald-200/80 dark:border-emerald-800/60">
                    <ArrowDownToLine className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white font-sans">
                        Inbound Goods Receipt Note (GRN)
                      </h3>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                        {activeWorkspace?.name || 'Workspace'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 font-sans">
                      Receive vendor shipment into warehouse stock and write an immutable audit movement.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowGrnModal(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmitGrn} className="flex flex-col flex-1 overflow-hidden">
                <div className="p-5 bg-slate-50/80 dark:bg-slate-950/70 space-y-4 overflow-y-auto flex-1 font-sans">
                  {grnFeedback && (
                    <div
                      className={`p-3 rounded-xl border flex items-start space-x-2 text-xs font-medium ${
                        grnFeedback.type === 'success'
                          ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800'
                          : 'bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-200 border-rose-200 dark:border-rose-800'
                      }`}
                    >
                      {grnFeedback.type === 'success' ? (
                        <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                      )}
                      <span className="flex-1">{grnFeedback.message}</span>
                    </div>
                  )}

                  <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-2xs p-4 space-y-3.5">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          GRN Reference Number <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={grnNumber}
                          onChange={(e) => setGrnNumber(e.target.value)}
                          placeholder="e.g. GRN-2026-1001"
                          className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 rounded-xl py-1.5 px-3 text-xs font-mono font-semibold text-slate-800 dark:text-slate-100 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Received Date <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="date"
                          required
                          value={grnDate}
                          onChange={(e) => setGrnDate(e.target.value)}
                          className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 rounded-xl py-1.5 px-3 text-xs font-semibold text-slate-800 dark:text-slate-100 dark:[color-scheme:dark] focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Delivery Note / PO Ref
                        </label>
                        <input
                          type="text"
                          value={grnDeliveryNote}
                          onChange={(e) => setGrnDeliveryNote(e.target.value)}
                          placeholder="e.g. DN-88192 or PO-2026-44"
                          className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 rounded-xl py-1.5 px-3 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Product Selection (Any catalog product; auto-enables stock tracking if untracked) */}
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Catalog Product <span className="text-rose-500">*</span>
                      </label>
                      {renderSearchableStockProductPicker({
                        selectedProduct: selectedGrnProduct,
                        isOpen: isGrnProductPickerOpen,
                        setIsOpen: setIsGrnProductPickerOpen,
                        searchQuery: grnProductSearch,
                        setSearchQuery: setGrnProductSearch,
                        onSelectProduct: (id) => handleGrnProductChange(id),
                        placeholderText: '-- Select Product to Receive Stock --'
                      })}

                      {selectedGrnProduct && !selectedGrnProduct.is_inventoried && (
                        <div className="mt-1.5 p-2 rounded-xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 text-[11px] text-blue-800 dark:text-blue-200 flex items-center gap-2">
                          <Boxes className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                          <span>
                            <strong>Auto-Track Stock:</strong> "{selectedGrnProduct.name || selectedGrnProduct.description}" is Non-Stock. Confirming this GRN automatically enables physical stock tracking.
                          </span>
                        </div>
                      )}

                      {selectedGrnProduct && (
                        <div className="mt-2 py-2 px-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                          <div>
                            <span className="block text-[10px] text-slate-400 font-mono uppercase">On Hand</span>
                            <span className="font-bold text-slate-800 dark:text-slate-100">
                              {selectedGrnProduct.stock_on_hand || 0} {selectedGrnProduct.unit}
                            </span>
                          </div>
                          <div>
                            <span className="block text-[10px] text-slate-400 font-mono uppercase">Reserved</span>
                            <span className="font-bold text-amber-600 dark:text-amber-400">
                              {selectedGrnProduct.stock_reserved || 0} {selectedGrnProduct.unit}
                            </span>
                          </div>
                          <div>
                            <span className="block text-[10px] text-slate-400 font-mono uppercase">Available</span>
                            <span className="font-bold text-emerald-600 dark:text-emerald-400">
                              {Math.max(
                                0,
                                (selectedGrnProduct.stock_on_hand || 0) - (selectedGrnProduct.stock_reserved || 0)
                              )}{' '}
                              {selectedGrnProduct.unit}
                            </span>
                          </div>
                          <div>
                            <span className="block text-[10px] text-slate-400 font-mono uppercase">Default Bin</span>
                            <span className="font-medium text-slate-600 dark:text-slate-300 truncate block">
                              {selectedGrnProduct.storage_location || '—'}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Quantity & Unit Cost */}
                    <div className="space-y-1.5">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            Quantity Received <span className="text-rose-500">*</span>
                          </label>
                          <input
                            type="number"
                            min="1"
                            step="any"
                            required
                            value={grnQuantity ?? ''}
                            onChange={(e) => setGrnQuantity(e.target.value)}
                            placeholder="e.g. 50"
                            className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 rounded-xl py-1.5 px-3 text-xs font-semibold font-mono text-slate-800 dark:text-slate-100 focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            Landed Unit Cost (AED)
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={grnUnitCost ?? ''}
                            onChange={(e) => setGrnUnitCost(e.target.value)}
                            placeholder="Enter supplier landed cost"
                            className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 rounded-xl py-1.5 px-3 text-xs font-semibold font-mono text-slate-800 dark:text-slate-100 focus:outline-none"
                          />
                        </div>

                        <div className="py-1.5 px-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                            Receipt Value
                          </span>
                          <span className="text-xs font-bold font-mono text-slate-900 dark:text-slate-100">
                            AED{' '}
                            {((Number(grnQuantity) || 0) * (Number(grnUnitCost) || 0)).toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2
                            })}
                          </span>
                        </div>
                      </div>
                      {selectedGrnProduct && resolveSavedProductCostForGrn(selectedGrnProduct) === '' && (
                        <p className="text-[11px] font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          <span>No catalog cost saved — enter supplier cost manually</span>
                        </p>
                      )}
                    </div>

                    <div className="flex items-center space-x-2 py-1.5 px-2.5 rounded-lg bg-slate-50/70 dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800">
                      <input
                        type="checkbox"
                        id="grnUpdateCost"
                        checked={grnUpdateCost}
                        onChange={(e) => setGrnUpdateCost(e.target.checked)}
                        className="w-3.5 h-3.5 rounded text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer"
                      />
                      <label htmlFor="grnUpdateCost" className="text-[11px] text-slate-600 dark:text-slate-300 cursor-pointer select-none">
                        Overwrite catalog <strong>Standard Cost Price</strong> with this landed cost (
                        {Number(grnUnitCost) > 0 ? `AED ${Number(grnUnitCost).toFixed(2)}` : 'Current'}) —{' '}
                        <span className="text-slate-500 dark:text-slate-400">Leave unchecked to preserve standard cost &amp; only record Last Landed Cost</span>
                      </label>
                    </div>

                    {/* Supplier Selector, Bin Location & Receiving Notes */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                            Supplier / Vendor
                          </label>
                          {companies && companies.length > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                if (grnSupplierId === '__custom__') {
                                  setGrnSupplierId('');
                                  setGrnSupplierName('');
                                } else {
                                  setGrnSupplierId('__custom__');
                                }
                              }}
                              className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 cursor-pointer"
                            >
                              {grnSupplierId === '__custom__' ? 'Select from Directory' : 'Type Custom Vendor'}
                            </button>
                          )}
                        </div>
                        {companies && companies.length > 0 && grnSupplierId !== '__custom__' ? (
                          <select
                            value={grnSupplierId}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === '__custom__') {
                                setGrnSupplierId('__custom__');
                                setGrnSupplierName('');
                                return;
                              }
                              setGrnSupplierId(val);
                              const matched = companies.find((c) => c.id === val);
                              setGrnSupplierName(matched ? matched.display_name || matched.canonical_name : '');
                            }}
                            className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 rounded-xl py-1.5 px-3 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer"
                          >
                            <option value="">-- Select Supplier / Vendor --</option>
                            {companies.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.display_name || c.canonical_name}
                              </option>
                            ))}
                            <option value="__custom__">Enter Custom Supplier Name...</option>
                          </select>
                        ) : (
                          <input
                            type="text"
                            list="grn-supplier-list"
                            value={grnSupplierName}
                            onChange={(e) => {
                              const val = e.target.value;
                              setGrnSupplierName(val);
                              const match = companies?.find(
                                (c) => (c.display_name || c.canonical_name).toLowerCase() === val.toLowerCase()
                              );
                              if (match?.id) {
                                setGrnSupplierId(match.id);
                              }
                            }}
                            placeholder="e.g. Manufacturer / Supply Partner"
                            className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 rounded-xl py-1.5 px-3 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none"
                          />
                        )}
                        <datalist id="grn-supplier-list">
                          {companies?.map((c) => (
                            <option key={c.id} value={c.display_name || c.canonical_name} />
                          ))}
                        </datalist>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Warehouse Bin / Storage Location
                        </label>
                        <input
                          type="text"
                          value={grnStorageLocation}
                          onChange={(e) => setGrnStorageLocation(e.target.value)}
                          placeholder="e.g. Rack B-03, Warehouse 1"
                          className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 rounded-xl py-1.5 px-3 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Receiving Notes &amp; Inspection Remarks
                      </label>
                      <input
                        type="text"
                        value={grnNotes}
                        onChange={(e) => setGrnNotes(e.target.value)}
                        placeholder="Optional receiving remarks, batch/lot numbers..."
                        className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 rounded-xl py-1.5 px-3 text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="py-3.5 px-6 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md flex items-center justify-between gap-3 shrink-0">
                  <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                    Receipt Total:{' '}
                    <strong className="text-slate-900 dark:text-slate-100">
                      AED {((Number(grnQuantity) || 0) * (Number(grnUnitCost) || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </strong>
                  </span>
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => setShowGrnModal(false)}
                      className="h-9 px-4 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold rounded-lg text-xs transition cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={grnSubmitting || activeCatalogProducts.length === 0}
                      className="h-9 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-semibold rounded-lg text-xs transition shadow-2xs inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <ArrowDownToLine className="w-3.5 h-3.5" />
                      <span>{grnSubmitting ? 'Processing GRN...' : 'Confirm & Receive Stock'}</span>
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Quick Stock Adjustment Modal */}
        {showAdjustModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 bg-slate-950/60 backdrop-blur-xs">
            <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[96vh] sm:max-h-[90vh]">
              <div className="p-5 px-6 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900">
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-xl border border-indigo-200/80 dark:border-indigo-800/60">
                    <Sliders className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 font-sans">
                      Quick Stock Adjustment &amp; Recount
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-sans">
                      Record opening balances, physical cycle recounts, or damaged stock write-offs.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAdjustModal(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmitAdjustment} className="flex flex-col flex-1 overflow-hidden font-sans">
                <div className="p-6 bg-slate-50/80 dark:bg-slate-950/70 space-y-4 overflow-y-auto flex-1">
                  {adjustFeedback && (
                    <div
                      className={`p-3 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
                        adjustFeedback.type === 'success'
                          ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800'
                          : 'bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-200 border-rose-200 dark:border-rose-800'
                      }`}
                    >
                      {adjustFeedback.type === 'success' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                      )}
                      <span>{adjustFeedback.message}</span>
                    </div>
                  )}

                  <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-2xs p-4 space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                        Select Product <span className="text-rose-500">*</span>
                      </label>
                      {renderSearchableStockProductPicker({
                        selectedProduct: selectedAdjustProduct,
                        isOpen: isAdjustProductPickerOpen,
                        setIsOpen: setIsAdjustProductPickerOpen,
                        searchQuery: adjustProductSearch,
                        setSearchQuery: setAdjustProductSearch,
                        onSelectProduct: (id) => {
                          setAdjustProductId(id);
                          setIsAdjustProductPickerOpen(false);
                          const p = activeCatalogProducts.find((item) => item.id === id);
                          if (p) {
                            setAdjustQty(p.stock_on_hand ?? 0);
                            setAdjustStorageLocation(p.storage_location || '');
                            setAdjustUnitCost(p.cost_price ?? '');
                          }
                        },
                        placeholderText: '-- Choose Product --'
                      })}
                    </div>

                    {/* Adjustment Mode Selector */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Adjustment Type</label>
                      <div className="grid grid-cols-2 gap-2">
                        {(
                          [
                            { id: 'RECOUNT', label: 'Physical Recount (Set Exact Qty)' },
                            { id: 'OPENING_STOCK', label: 'Opening Stock Balance' },
                            { id: 'ADDITION', label: 'Manual Stock Addition' },
                            { id: 'WRITE_OFF', label: 'Damage / Write-Off Deduction' }
                          ] as const
                        ).map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => {
                              setAdjustMode(m.id);
                              if (m.id === 'WRITE_OFF' || m.id === 'ADDITION') {
                                setAdjustQty(1);
                              } else if (selectedAdjustProduct) {
                                setAdjustQty(selectedAdjustProduct.stock_on_hand ?? 0);
                              }
                            }}
                            className={`p-2.5 rounded-xl border text-left text-xs font-semibold transition cursor-pointer ${
                              adjustMode === m.id
                                ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-500 text-indigo-800 dark:text-indigo-200 shadow-2xs'
                                : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                            }`}
                          >
                            {m.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                          {adjustMode === 'RECOUNT' || adjustMode === 'OPENING_STOCK'
                            ? `New On-Hand Quantity (${selectedAdjustProduct?.unit || 'Units'}) *`
                            : adjustMode === 'WRITE_OFF'
                            ? `Quantity to Deduct (${selectedAdjustProduct?.unit || 'Units'}) *`
                            : `Quantity to Add (${selectedAdjustProduct?.unit || 'Units'}) *`}
                        </label>
                        <input
                          type="number"
                          min={0}
                          step="any"
                          required
                          value={adjustQty ?? ''}
                          onChange={(e) => setAdjustQty(e.target.value)}
                          className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 rounded-xl py-2 px-3 text-sm font-mono font-bold text-slate-900 dark:text-slate-100 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                          Storage Bin / Location
                        </label>
                        <input
                          type="text"
                          value={adjustStorageLocation}
                          onChange={(e) => setAdjustStorageLocation(e.target.value)}
                          placeholder="e.g. WH-1 / Bay 4"
                          className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 rounded-xl py-2 px-3 text-xs font-mono text-slate-800 dark:text-slate-100 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                        Audit Reason / Remarks <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={adjustReason}
                        onChange={(e) => setAdjustReason(e.target.value)}
                        placeholder="e.g. Monthly warehouse cycle count verification"
                        className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 rounded-xl py-2 px-3 text-xs text-slate-800 dark:text-slate-100 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="px-6 py-3.5 flex items-center justify-end gap-2.5 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowAdjustModal(false)}
                    className="h-9 px-4 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold rounded-lg text-xs transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={adjustSubmitting || !adjustProductId}
                    className="h-9 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-semibold rounded-lg text-xs transition cursor-pointer"
                  >
                    {adjustSubmitting ? 'Saving Adjustment...' : 'Apply Stock Adjustment'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Stock Movement Audit Ledger Modal */}
        {showLedgerModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 bg-slate-950/60 backdrop-blur-xs">
            <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-6xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[96vh] sm:max-h-[92vh]">
              <div className="p-4 px-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50/50 dark:bg-slate-950/50">
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-xl border border-blue-100 dark:border-blue-800/60">
                    <History className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <h3 className="text-base font-bold text-slate-900 dark:text-white font-sans">
                        Inventory Stock Movement Ledger &amp; Audit Log
                      </h3>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                        {movements.length} Records
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-sans mt-0.5">
                      Immutable physical inventory transaction audit trail for GRN receipts, reservations, adjustments, and dispatches.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowLedgerModal(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-3.5 px-6 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 grid grid-cols-1 sm:grid-cols-12 gap-3 shrink-0">
                <div className="sm:col-span-8 relative flex items-center">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Filter by product name, GRN / Ref #, supplier..."
                    value={movementsSearch}
                    onChange={(e) => setMovementsSearch(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-2 pl-10 pr-4 text-xs font-semibold text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 transition"
                  />
                </div>

                <div className="sm:col-span-4 relative flex items-center">
                  <select
                    value={movementsTypeFilter}
                    onChange={(e) => setMovementsTypeFilter(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-2 px-3 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-blue-500 transition cursor-pointer"
                  >
                    <option value="All">All Movement Types</option>
                    <option value="STOCK_IN">Stock In (GRN Receipts)</option>
                    <option value="STOCK_OUT">Stock Out (Dispatches)</option>
                    <option value="STOCK_RESERVE">Stock Reserved</option>
                    <option value="STOCK_RELEASE">Stock Released</option>
                    <option value="RETURN_TO_VENDOR">Return to Vendor (MRN)</option>
                    <option value="ADJUSTMENT">Adjustments &amp; Recounts</option>
                  </select>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto overflow-x-hidden p-0">
                {isLoadingMovements ? (
                  <div className="py-16 text-center text-slate-400 text-xs flex flex-col items-center justify-center space-y-2">
                    <span className="w-6 h-6 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin" />
                    <span>Loading ledger records...</span>
                  </div>
                ) : filteredMovements.length === 0 ? (
                  <div className="py-16 text-center text-slate-400 text-xs">
                    No stock movements match the current filter.
                  </div>
                ) : (
                  <div className="w-full overflow-x-auto scrollbar-thin">
                    <table className="w-full min-w-[760px] text-left border-collapse font-sans text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500 dark:text-slate-400 select-none bg-slate-50/60 dark:bg-slate-900/80 sticky top-0 z-10 backdrop-blur-xs">
                        <th className="py-2.5 px-3 w-[10%]">Date / Time</th>
                        <th className="py-2.5 px-2.5 w-[12%]">Type</th>
                        <th className="py-2.5 px-2.5 w-[13%]">Reference</th>
                        <th className="py-2.5 px-3 w-[18%]">Product Item</th>
                        <th className="py-2.5 px-2.5 w-[8%] text-right">Qty</th>
                        <th className="py-2.5 px-2.5 w-[15%] text-center">Stock Balance Impact</th>
                        <th className="py-2.5 px-2.5 w-[10%] text-right">Cost (AED)</th>
                        <th className="py-2.5 px-2.5 w-[9%]">Context</th>
                        <th className="py-2.5 px-3 w-[5%]">User</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {filteredMovements.map((m) => {
                        const isStockIn = m.movement_type === 'STOCK_IN';
                        const isStockOut = m.movement_type === 'STOCK_OUT';
                        const isReserve = m.movement_type === 'STOCK_RESERVE';
                        const isRelease = m.movement_type === 'STOCK_RELEASE';
                        const isReturnToVendor = m.movement_type === 'RETURN_TO_VENDOR';

                        const linkedProd = products.find((p) => p.id === m.product_id);
                        const resolvedProductName =
                          (m.product_name && m.product_name.trim()) ||
                          linkedProd?.name ||
                          linkedProd?.description ||
                          (m.reference_number ? `Linked Project Item (${m.reference_number})` : 'Catalog Stock Item');

                        return (
                          <tr key={m.id || `${m.product_id}-${m.created_at}`} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition">
                            <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400 font-mono whitespace-nowrap text-[11px]">
                              {m.created_at ? new Date(m.created_at).toLocaleDateString() : '—'}
                              <span className="block text-[10px] text-slate-400">
                                {m.created_at
                                  ? new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                  : ''}
                              </span>
                            </td>
                            <td className="py-2.5 px-2.5 whitespace-nowrap">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider inline-flex items-center ${
                                  isStockIn
                                    ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                                    : isStockOut
                                    ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300'
                                    : isReturnToVendor
                                    ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300'
                                    : isReserve
                                    ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                                    : isRelease
                                    ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300'
                                    : 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300'
                                }`}
                              >
                                <span>{m.movement_type.replace(/_/g, ' ')}</span>
                              </span>
                            </td>
                            <td className="py-2.5 px-2.5 font-mono font-semibold text-slate-800 dark:text-slate-200 truncate" title={m.reference_number || m.reference_id || ''}>
                              {m.reference_number || m.reference_id || '—'}
                              {m.delivery_note_ref && (
                                <span className="block text-[10px] text-slate-400 font-normal truncate">
                                  DN: {m.delivery_note_ref}
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-slate-900 dark:text-slate-100 font-medium truncate" title={resolvedProductName}>
                              {resolvedProductName}
                              {linkedProd?.sku && (
                                <span className="block text-[10px] font-mono text-slate-400 truncate">
                                  {linkedProd.sku}
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-2.5 text-right font-mono font-bold whitespace-nowrap">
                              {(() => {
                                const signedQty = Number(
                                  (m as any).quantity_delta !== undefined
                                    ? (m as any).quantity_delta
                                    : m.quantity
                                );
                                return (
                                  <span
                                    className={
                                      isStockIn
                                        ? 'text-emerald-600 dark:text-emerald-400'
                                        : isStockOut || isReturnToVendor
                                        ? 'text-rose-600 dark:text-rose-400'
                                        : isReserve
                                        ? 'text-amber-700 dark:text-amber-400'
                                        : isRelease
                                        ? 'text-purple-700 dark:text-purple-400'
                                        : signedQty > 0
                                        ? 'text-emerald-600 dark:text-emerald-400'
                                        : signedQty < 0
                                        ? 'text-rose-600 dark:text-rose-400'
                                        : 'text-slate-700 dark:text-slate-300'
                                    }
                                  >
                                    {isStockIn
                                      ? `+${Math.abs(signedQty)}`
                                      : isStockOut || isReturnToVendor
                                      ? `-${Math.abs(signedQty)}`
                                      : isReserve
                                      ? `${Math.abs(signedQty)} Res.`
                                      : isRelease
                                      ? `${Math.abs(signedQty)} Rel.`
                                      : signedQty > 0
                                      ? `+${signedQty}`
                                      : signedQty}
                                  </span>
                                );
                              })()}
                            </td>
                            <td className="py-2.5 px-2.5 text-center font-mono text-slate-500 whitespace-nowrap">
                              {isReserve ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-[10px] font-semibold">
                                  <span>Reserved +{Math.abs(m.quantity)}</span>
                                  <span className="text-amber-600/80">(OH: {m.new_on_hand})</span>
                                </span>
                              ) : isRelease ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-50 dark:bg-purple-950/50 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800 text-[10px] font-semibold">
                                  <span>Released -{Math.abs(m.quantity)}</span>
                                  <span className="text-purple-600/80">(OH: {m.new_on_hand})</span>
                                </span>
                              ) : (
                                <>
                                  <span className="text-slate-400">{m.previous_on_hand}</span>
                                  <span className="mx-1 text-slate-300 dark:text-slate-600">→</span>
                                  <span className="font-bold text-slate-800 dark:text-slate-200">{m.new_on_hand}</span>
                                </>
                              )}
                            </td>
                            <td className="py-2.5 px-2.5 text-right font-mono font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap text-[11px]">
                              {m.total_cost !== undefined && m.total_cost > 0
                                ? `AED ${m.total_cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                : m.unit_cost !== undefined && m.unit_cost > 0
                                ? `AED ${(m.unit_cost * Math.abs(m.quantity)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                : '—'}
                            </td>
                            <td className="py-2.5 px-2.5 text-slate-500 truncate" title={m.reason_notes || m.supplier_name || ''}>
                              <span className="font-medium text-slate-700 dark:text-slate-300 block truncate text-[11px]">
                                {m.supplier_name || m.reference_type || 'Internal'}
                              </span>
                              {m.reason_notes && (
                                <span className="text-[10px] text-slate-400 block truncate">{m.reason_notes}</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-slate-400 text-[11px] truncate" title={m.created_by_name || 'System'}>
                              {m.created_by_name || 'System'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="p-3.5 px-6 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md flex items-center justify-between shrink-0">
                <span className="text-xs text-slate-400">
                  Displaying {filteredMovements.length} of {movements.length} total movement records
                </span>
                <button
                  type="button"
                  onClick={() => setShowLedgerModal(false)}
                  className="h-9 px-4 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold rounded-lg text-xs transition cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* AI Bulk Catalog & Product Importer Modal */}
        {showAiCatalogModal && (
          <Suspense fallback={<ModalLoadingFallback />}>
            <AICatalogImporterModal
              isOpen={showAiCatalogModal}
              onClose={() => setShowAiCatalogModal(false)}
              products={products}
              setProducts={setProducts}
              productCategories={productCategories}
              setProductCategories={setProductCategories}
              units={units}
              activeWorkspace={activeWorkspace}
              onUpdateWorkspaceGuidelines={(newGuidelines) => {
                setWorkspaceCatalogGuidelines(newGuidelines);
                if (setWorkspaces && activeWorkspace?.id) {
                  setWorkspaces((prev) =>
                    prev.map((w) =>
                      w.id === activeWorkspace.id
                        ? { ...w, catalog_ai_guidelines: newGuidelines }
                        : w
                    )
                  );
                }
              }}
              triggerToast={triggerToast}
              initialExtractedItems={aiModalInitialItems}
              initialCurrency={aiModalInitialCurrency}
            />
          </Suspense>
        )}
      </PageBody>
    </div>
  );
}
