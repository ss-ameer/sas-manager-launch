import React, { useState, useEffect, useMemo } from 'react';
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
import { safeAddDoc, safeUpdateDoc } from '../firebase';
import { saveToLocalStore } from '../services/db';
import { generateProductSearchTerms } from '../utils/defaults';
import { UNIVERSAL_UNITS, UNIVERSAL_CATEGORIES } from '../constants';
import { processStockGrn, processStockAdjustment, subscribeStockMovements } from '../services/inventoryService';
import { uploadWorkspaceMediaAsset, deleteFromStorageBucket, formatByteSize } from '../services/attachmentStorage';
import CompositePackageEditor from './quotations/CompositePackageEditor';
import { recalculateCompositeItemTotals } from '../utils/compositeBomUtils';
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
  GitFork
} from 'lucide-react';
import SearchResultCounter from './common/SearchResultCounter';
import HoverScrollText from './common/HoverScrollText';
import { PageHeader, PageBody, KpiStatCard } from './layout/UiContainer';
import {
  buildCatalogVariantAnalysisMap,
  resolveProductFamilyKey,
  resolveProductFamilyDisplayName,
  formatProductVariantSelectorLabel
} from '../utils/productVariantFormat';
import { compileDescriptionWithSpecs } from './SaveToCatalogModal';
import { canManageWorkspace, isAdmin } from '../utils/permissions';

const UNIVERSAL_QUICK_ATTRIBUTES = [
  'Dimensions / Size',
  'Material / Grade',
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
  onOpenMobileMenu,
  onOpenProcurement,
  companies,
  triggerToast
}: ProductManagerProps) {
  const [searchInput, setSearchInput] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [stockFilter, setStockFilter] = useState<'All' | 'Tracked' | 'LowStock' | 'WithDatasheet' | 'CompositeKit'>('All');
  const [groupVariantsByFamily, setGroupVariantsByFamily] = useState<boolean>(false);

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
  const [formProductFamily, setFormProductFamily] = useState<string>('');

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

  // Stock Movement Ledger State
  const [showLedgerModal, setShowLedgerModal] = useState(false);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [movementsSearch, setMovementsSearch] = useState('');
  const [movementsTypeFilter, setMovementsTypeFilter] = useState<string>('All');
  const [isLoadingMovements, setIsLoadingMovements] = useState(false);

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
    const merged = Array.from(
      new Set([...Array.from(categoryUsedKeys), ...knownCategorySuggestions, ...UNIVERSAL_QUICK_ATTRIBUTES])
    );
    const existingKeysLower = new Set(formAttributes.map((a) => a.key.trim().toLowerCase()));
    return merged.filter((k) => !existingKeysLower.has(k.toLowerCase())).slice(0, 12);
  }, [products, formProductType, formAttributes]);

  const activeCatalogProducts = useMemo(() => {
    return products.filter((p) => !p.is_deleted);
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

  const lowStockProducts = useMemo(() => {
    return inventoriedProducts.filter((p) => {
      const available = (p.stock_on_hand || 0) - (p.stock_reserved || 0);
      const threshold = p.reorder_level || 0;
      return available <= threshold;
    });
  }, [inventoriedProducts]);

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

    const target = prod || inventoriedProducts[0] || activeCatalogProducts[0];
    if (target) {
      setGrnProductId(target.id || '');
      setGrnUnitCost(target.cost_price != null ? target.cost_price : target.unit_price ?? '');
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
    const p = activeCatalogProducts.find((item) => item.id === productId);
    if (p) {
      if (p.cost_price != null && p.cost_price > 0) {
        setGrnUnitCost(p.cost_price);
      } else if (p.unit_price != null && p.unit_price > 0) {
        setGrnUnitCost(p.unit_price);
      } else {
        setGrnUnitCost('');
      }
      setGrnStorageLocation(p.storage_location || '');
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
      const uploaded = await uploadWorkspaceMediaAsset(
        file,
        'products/images',
        (activeWorkspace as any)?.settings || activeWorkspace,
        {
          compressImage: true,
          maxDimension: 800,
          quality: 0.78,
          previousUrlToDelete: formImageUrl || undefined,
          onProgress: (pct) => setImageUploadProgress(pct)
        }
      );
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
      const uploaded = await uploadWorkspaceMediaAsset(
        file,
        'products/datasheets',
        (activeWorkspace as any)?.settings || activeWorkspace,
        {
          compressImage: file.type.startsWith('image/'),
          maxDimension: 1200,
          quality: 0.78,
          pdfCompressionPreset: 'standard',
          previousUrlToDelete: formDatasheetAttachment?.url,
          onProgress: (pct) => setDatasheetUploadProgress(pct)
        }
      );
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

      let matchesStock = true;
      if (stockFilter === 'Tracked') {
        matchesStock = Boolean(p.is_inventoried);
      } else if (stockFilter === 'LowStock') {
        const available = (p.stock_on_hand || 0) - (p.stock_reserved || 0);
        matchesStock = Boolean(p.is_inventoried) && available <= (p.reorder_level || 0);
      } else if (stockFilter === 'WithDatasheet') {
        matchesStock = Boolean(p.datasheet_attachment?.url);
      } else if (stockFilter === 'CompositeKit') {
        matchesStock = Boolean(p.is_composite_set && p.sub_components && p.sub_components.length > 0);
      }

      return matchSearch && matchesCategory && matchesStock;
    });
  }, [activeCatalogProducts, searchInput, categoryFilter, stockFilter]);

  // When Group Variants is active, sort products so sibling variants stay contiguous under their family
  const orderedFilteredProducts = useMemo(() => {
    if (!groupVariantsByFamily) return filteredProducts;
    return [...filteredProducts].sort((a, b) => {
      const famA = resolveProductFamilyKey(a);
      const famB = resolveProductFamilyKey(b);
      if (famA !== famB) {
        const countA = (a.id && variantAnalysisMap.get(a.id)?.siblingCount) || 1;
        const countB = (b.id && variantAnalysisMap.get(b.id)?.siblingCount) || 1;
        if (countA > 1 && countB <= 1) return -1;
        if (countB > 1 && countA <= 1) return 1;
        return famA.localeCompare(famB);
      }
      return (a.sku || a.name || '').localeCompare(b.sku || b.name || '');
    });
  }, [filteredProducts, groupVariantsByFamily, variantAnalysisMap]);

  const handleClearProductFilters = () => {
    setSearchInput('');
    setCategoryFilter('All');
    setStockFilter('All');
  };

  // Pagination details
  const totalItems = orderedFilteredProducts.length;
  const totalPages = useMemo(() => {
    if (itemsPerPage === 'All') return 1;
    return Math.ceil(totalItems / itemsPerPage) || 1;
  }, [totalItems, itemsPerPage]);

  const paginatedProducts = useMemo(() => {
    if (itemsPerPage === 'All') return orderedFilteredProducts;
    const startIndex = (currentPage - 1) * itemsPerPage;
    return orderedFilteredProducts.slice(startIndex, startIndex + itemsPerPage);
  }, [orderedFilteredProducts, currentPage, itemsPerPage]);

  // CRUD handlers
  const openAddModal = () => {
    setEditingProduct(null);
    setFormVariantParentId(null);
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
    setEditingProduct(p);
    setFormVariantParentId(p.variant_parent_id || null);
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

  // 1-Click "+ Add Spec Variant": Keeps exact base product name (I1), links variant_parent_id & product_family,
  // clones existing spec attribute keys/values (S1, S2, S3), and opens directly on Tab 2 (Specs)
  const openSpecVariantModal = (p: Product) => {
    const baseName = (p.name || p.description || '').replace(/\s*\(copy\)\s*$/i, '').trim();
    const familyKey = resolveProductFamilyKey(p);
    const siblingCount = activeCatalogProducts.filter((item) => resolveProductFamilyKey(item) === familyKey).length;
    const baseSku = (p.sku || '').replace(/-V\d+$/i, '').trim();
    const nextVariantSku = baseSku ? `${baseSku}-V${siblingCount + 1}` : '';

    setEditingProduct(null);
    setFormVariantParentId(p.variant_parent_id || p.id || null);
    setFormProductFamily(p.product_family || baseName);
    setIsCreatingCategory(false);
    setNewCategoryInput('');
    setIsCreatingUnit(false);
    setNewUnitInput('');
    setActiveFormTab('specs_media');
    setFormName(baseName);
    setFormProductType(p.product_type || productCategories[0] || 'General Equipment');
    setFormDescription(compileDescriptionWithSpecs(baseName, p.description || '', p.attributes || []) || p.description || '');
    setFormUnit(p.unit && p.unit !== 'Custom Unit' ? p.unit : 'Nos');
    setFormUnitPrice(p.unit_price ?? undefined);
    setFormCostPrice(p.cost_price ?? undefined);
    setFormIsCompositeSet(Boolean(p.is_composite_set));
    setFormSubComponents((p.sub_components || []).map((c, idx) => ({ ...c, id: `comp_${Date.now()}_${idx}` })));
    setFormPackagePricingMode(p.package_pricing_mode || 'itemized');
    setFormOptionScopeNotes(p.option_scope_notes || '');
    setFormSku(nextVariantSku);
    setFormBrandMake(p.brand_make || '');
    setFormModelPartNo(p.model_part_no || '');
    setFormDefaultAvailability(p.default_availability || '');
    setFormImageUrl(p.image_url || '');
    setFormSecondaryImageUrl(p.secondary_image_url || '');
    setFormImageCaption(p.image_caption || '');
    setFormSecondaryImageCaption(p.secondary_image_caption || '');
    setFormImageAdjustments(p.image_adjustments);
    setFormDatasheetAttachment(p.datasheet_attachment);
    setFormAttributes(
      p.attributes && p.attributes.length > 0
        ? p.attributes.map((a) => ({ ...a }))
        : [{ key: '', value: '' }]
    );
    setFormIsInventoried(Boolean(p.is_inventoried));
    setFormStockOnHand(0);
    setFormReorderLevel(p.reorder_level ?? 0);
    setFormStorageLocation(p.storage_location || '');
    setFormHsCode(p.hs_code || '');
    setFormCountryOfOrigin(p.country_of_origin || '');
    setFormGrossWeightKg(p.gross_weight_kg ?? undefined);
    setShowFormModal(true);
    if (triggerToast) {
      triggerToast(
        `Creating Spec Variant for "${baseName}". Edit the differing specification value & SKU below, then click Register Spec Variant.`,
        'info'
      );
    }
  };

  // 1-Click Duplicate / Clone Product for standalone copies
  const openDuplicateModal = (p: Product) => {
    setEditingProduct(null);
    setFormVariantParentId(null);
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
      throw new Error('Critical Error: Active workspace context lost. Cannot save record.');
    }

    setIsSubmitting(true);

    const cleanAttributes: ProductAttribute[] = formAttributes
      .map((a) => ({ key: a.key.trim(), value: a.value.trim() }))
      .filter((a) => a.key !== '' && a.value !== '');

    const resolvedBrand =
      formBrandMake.trim() ||
      cleanAttributes.find((a) => /^(brand|make|manufacturer)$/i.test(a.key))?.value ||
      undefined;
    const resolvedModel =
      formModelPartNo.trim() ||
      cleanAttributes.find((a) => /^(model|model no|part no)$/i.test(a.key))?.value ||
      undefined;

    const searchTerms = generateProductSearchTerms(
      formName.trim(),
      formProductType,
      formSku.trim(),
      resolvedBrand || resolvedModel
    );

    const computedBomTotals =
      formIsCompositeSet && formSubComponents.length > 0
        ? recalculateCompositeItemTotals(formSubComponents, 1)
        : null;

    const finalSellingPrice = computedBomTotals
      ? computedBomTotals.unitSellingPrice
      : typeof formUnitPrice === 'number' && !isNaN(formUnitPrice) && formUnitPrice >= 0
      ? formUnitPrice
      : undefined;

    const finalCostPrice = computedBomTotals
      ? computedBomTotals.unitCostPrice
      : typeof formCostPrice === 'number' && !isNaN(formCostPrice) && formCostPrice >= 0
      ? formCostPrice
      : undefined;

    const data: Partial<Product> = {
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
      variant_parent_id: formVariantParentId || undefined,
      product_family: (formProductFamily || formName).trim() || undefined,
      brand_make: resolvedBrand,
      model_part_no: resolvedModel,
      default_availability: formDefaultAvailability.trim() || undefined,
      image_url: formImageUrl.trim() || undefined,
      secondary_image_url: formSecondaryImageUrl.trim() || undefined,
      image_caption: formImageCaption.trim() || undefined,
      secondary_image_caption: formSecondaryImageCaption.trim() || undefined,
      image_adjustments: formImageAdjustments || undefined,
      datasheet_attachment: formDatasheetAttachment || undefined,
      attributes: cleanAttributes,
      search_terms: searchTerms,
      is_inventoried: formIsInventoried,
      stock_on_hand: formIsInventoried ? Number(formStockOnHand || 0) : undefined,
      stock_reserved: editingProduct ? editingProduct.stock_reserved || 0 : 0,
      reorder_level: formIsInventoried ? Number(formReorderLevel || 0) : undefined,
      storage_location: formIsInventoried && formStorageLocation.trim() ? formStorageLocation.trim() : undefined,
      hs_code: formHsCode.trim() || undefined,
      country_of_origin: formCountryOfOrigin.trim() || undefined,
      gross_weight_kg:
        typeof formGrossWeightKg === 'number' && !isNaN(formGrossWeightKg) && formGrossWeightKg >= 0
          ? formGrossWeightKg
          : undefined,
      updatedAt: new Date().toISOString()
    };

    try {
      if (editingProduct && editingProduct.id) {
        const updatedProd: Product = { ...editingProduct, ...data } as Product;
        await safeUpdateDoc('products', editingProduct.id, data);
        const nextList = products.map((p) => (p.id === editingProduct.id ? updatedProd : p));
        if (setProducts) {
          setProducts(nextList);
        }
        try {
          await saveToLocalStore('products', nextList);
          localStorage.setItem('omni_products', JSON.stringify(nextList));
        } catch (_) {}
      } else {
        const res = await safeAddDoc('products', {
          ...data,
          createdAt: new Date().toISOString()
        });
        const newId = res?.id || 'prod_' + Date.now();
        const newProd: Product = { id: newId, ...data } as Product;
        const nextList = [newProd, ...products.filter((p) => p.id !== newId)];
        if (setProducts) {
          setProducts(nextList);
        }
        try {
          await saveToLocalStore('products', nextList);
          localStorage.setItem('omni_products', JSON.stringify(nextList));
        } catch (_) {}
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
          const nextList = products.map((prod) =>
            prod.id === targetId
              ? {
                  ...prod,
                  is_deleted: true,
                  deleted: true,
                  deleted_at: deletedAtIso,
                  deleted_by_uid: user?.uid,
                  deleted_by_name: deletedByName
                }
              : prod
          );
          if (setProducts) {
            setProducts(nextList);
          }
          try {
            await saveToLocalStore('products', nextList);
            localStorage.setItem('omni_products', JSON.stringify(nextList));
          } catch (_) {}
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
        subtitle="Manage quotation template products, images, technical datasheets, pricing, and live inventory."
        icon={Package}
        badge={{ text: `${activeCatalogProducts.length} Products`, variant: 'blue' }}
        currentUser={user}
        onOpenSidebar={onOpenMobileMenu}
        primaryAction={
          isEditable
            ? {
                label: 'Create Product',
                icon: Plus,
                onClick: openAddModal
              }
            : undefined
        }
        secondaryActions={
          isEditable
            ? [
                {
                  label: 'Receive Stock (GRN)',
                  icon: ArrowDownToLine,
                  onClick: () => openGrnModal(),
                  variant: 'outline' as const
                },
                {
                  label: 'Adjust Stock',
                  icon: Sliders,
                  onClick: () => openAdjustModal(),
                  variant: 'outline' as const
                }
              ]
            : []
        }
      />

      <PageBody>
        {/* Metrics Section */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiStatCard
            label="Catalog Items"
            value={`${activeCatalogProducts.length} active`}
            subtext="Standardized product catalog"
            icon={<Package className="w-5 h-5" />}
            tone="blue"
          />

          <KpiStatCard
            label="Tracked Inventory"
            value={`${inventoriedProducts.length} physical SKUs`}
            subtext="Warehouse stock tracking enabled"
            icon={<Boxes className="w-5 h-5" />}
            tone="emerald"
          />

          <KpiStatCard
            label="Total Stock on Hand"
            value={`${activeCatalogProducts.reduce((acc, p) => acc + (p.stock_on_hand || 0), 0).toLocaleString()} units`}
            subtext="Aggregate available inventory"
            icon={<ArrowDownToLine className="w-5 h-5" />}
            tone="indigo"
          />

          <KpiStatCard
            label="Low Stock Alerts"
            value={`${lowStockProducts.length} ${lowStockProducts.length === 1 ? 'item' : 'items'}`}
            subtext={stockFilter === 'LowStock' ? 'Showing low stock items (click to reset)' : 'Click to filter low stock SKUs'}
            icon={<AlertTriangle className="w-5 h-5" />}
            tone={lowStockProducts.length > 0 ? 'amber' : 'slate'}
            onClick={() => setStockFilter((prev) => (prev === 'LowStock' ? 'All' : 'LowStock'))}
            active={stockFilter === 'LowStock'}
          />
        </div>

        {/* Filters and Search Console */}
        <div className="relative z-10 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
          <div className="flex flex-wrap items-center gap-2.5 w-full">
            {/* Search bar */}
            <div className="relative flex-1 min-w-[260px] flex items-center">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
              <input
                type="text"
                placeholder="Search by name, brand, model, SKU, or spec..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 focus:border-blue-500 rounded-xl py-2 pl-10 pr-8 text-xs font-semibold text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none transition h-10"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => setSearchInput('')}
                  className="absolute right-2.5 p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Category filter */}
            <div className="relative w-full sm:w-52 shrink-0 flex items-center bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 rounded-xl shadow-2xs h-10 transition">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="appearance-none w-full bg-transparent pl-3 pr-8 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer h-full font-sans truncate"
              >
                <option value="All">All Categories</option>
                {productCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>

            {/* Stock & Media Filter Segmented Control */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl h-10 shrink-0 overflow-x-auto max-w-full">
              {(
                [
                  { id: 'All', label: 'All' },
                  { id: 'CompositeKit', label: 'Kits / BOM' },
                  { id: 'Tracked', label: 'Tracked' },
                  { id: 'LowStock', label: `Low (${lowStockProducts.length})` },
                  { id: 'WithDatasheet', label: 'Datasheet' }
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStockFilter(tab.id)}
                  className={`h-full rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap px-2.5 ${
                    stockFilter === tab.id
                      ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Quick Tools Group */}
            <div className="flex items-center gap-2 flex-wrap shrink-0 ml-auto">
              <button
                type="button"
                onClick={() => setGroupVariantsByFamily((prev) => !prev)}
                className={`h-10 px-3 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition cursor-pointer shrink-0 ${
                  groupVariantsByFamily
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                    : 'bg-white dark:bg-slate-950 hover:bg-indigo-50/60 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-300 hover:text-indigo-700 border-slate-200 dark:border-slate-800'
                }`}
                title="Group sibling product variants under their parent Product Family header"
              >
                <GitFork className="w-3.5 h-3.5 shrink-0" />
                <span>Group Variants</span>
                {variantFamilyCount > 0 && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                      groupVariantsByFamily
                        ? 'bg-indigo-800 text-indigo-100'
                        : 'bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300'
                    }`}
                  >
                    {variantFamilyCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setShowLedgerModal(true)}
                className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-300 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition cursor-pointer shrink-0"
                title="Open Inventory Stock Movement Ledger & Audit Log"
              >
                <History className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>Stock Ledger</span>
              </button>

              {canViewConfidentialMargins && onOpenProcurement && (
                <button
                  type="button"
                  onClick={onOpenProcurement}
                  className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-300 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition cursor-pointer shrink-0"
                  title="Open Procurement & Payables Hub"
                >
                  <ShoppingBag className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                  <span>Procurement</span>
                </button>
              )}
            </div>
          </div>

          {/* Standard Search Result Counter & Filter Status Banner */}
          <SearchResultCounter
            totalCount={activeCatalogProducts.length}
            filteredCount={filteredProducts.length}
            searchQuery={searchInput}
            entityLabel="Products"
            singularEntityLabel="Product"
            onClear={handleClearProductFilters}
            activeFilterLabels={[
              ...(categoryFilter !== 'All' ? [`Category: ${categoryFilter}`] : []),
              ...(stockFilter !== 'All' ? [`Filter: ${stockFilter}`] : []),
              ...(groupVariantsByFamily ? ['Grouped by Variant Family'] : [])
            ]}
          />
        </div>

        {/* Products Table Layout */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-2xl shadow-xs overflow-clip">
          {paginatedProducts.length > 0 ? (
            <>
              <div className="w-full overflow-x-auto scrollbar-thin">
                <table className="w-full min-w-[760px] sm:min-w-[820px] text-left border-collapse">
                  <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 sticky top-[76px] z-20 shadow-[0_1px_0_0_rgba(226,232,240,1)] dark:shadow-[0_1px_0_0_rgba(30,41,59,1)] select-none">
                    <tr>
                      <th className="py-3 px-4 w-[36%] truncate bg-slate-50 dark:bg-slate-900">Product &amp; Specifications</th>
                      <th className="py-3 px-2.5 w-[14%] truncate bg-slate-50 dark:bg-slate-900">Category</th>
                      <th className="py-3 px-2.5 w-[15%] truncate bg-slate-50 dark:bg-slate-900">Brand &amp; SKU</th>
                      <th className="py-3 px-2.5 w-[13%] truncate bg-slate-50 dark:bg-slate-900">Stock &amp; Lead Time</th>
                      <th className="py-3 pl-2 pr-4 w-[11%] text-right truncate bg-slate-50 dark:bg-slate-900">Unit Price</th>
                      <th className="py-3 pl-2 pr-3 w-[116px] text-right whitespace-nowrap bg-slate-50 dark:bg-slate-900">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-sans text-sm">
                    {paginatedProducts.map((p, rowIdx) => {
                      const availableQty = (p.stock_on_hand || 0) - (p.stock_reserved || 0);
                      const isLowStock = Boolean(p.is_inventoried) && availableQty <= (p.reorder_level || 0);
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
                        Boolean(vInfo?.isVariant) &&
                        (!prevProd || (prevProd.id && variantAnalysisMap.get(prevProd.id)?.familyKey) !== vInfo?.familyKey);

                      const productTitle = (p.name || p.product_type || 'Unnamed Product').trim();
                      const orderedAttrs = vInfo?.isVariant
                        ? [...vInfo.differentiatingAttributes, ...vInfo.sharedAttributes]
                        : (p.attributes || []);
                      const hasStructuredAttrs = orderedAttrs.length > 0;
                      const visibleAttrs = orderedAttrs.slice(0, 3);
                      const remainingAttrCount = Math.max(0, orderedAttrs.length - visibleAttrs.length);
                      const allSpecsTooltip = orderedAttrs.map((a) => `${a.key}: ${a.value || '—'}`).join(' • ');

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
                      const hasBrand = Boolean((p.brand_make || '').trim());
                      const brandLabel = hasBrand ? (p.brand_make || '').trim() : '—';
                      const skuStr = (p.sku || '').trim();
                      const modelStr = (p.model_part_no || '').trim();
                      const skuModelParts = [
                        skuStr || null,
                        modelStr && modelStr.toLowerCase() !== skuStr.toLowerCase() ? modelStr : null
                      ].filter(Boolean);
                      const skuModelLine = skuModelParts.length > 0 ? skuModelParts.join(' · ') : '—';

                      return (
                        <React.Fragment key={p.id || rowIdx}>
                          {showFamilyGroupHeader && vInfo && (
                            <tr className="bg-indigo-50/60 dark:bg-indigo-950/30 border-y border-indigo-200/80 dark:border-indigo-800/60">
                              <td colSpan={6} className="py-2 px-4">
                                <div className="flex items-center justify-between gap-3 flex-wrap">
                                  <div className="flex items-center gap-2 flex-wrap">
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
                            onClick={() => openEditModal(p)}
                            className={`transition-colors group cursor-pointer ${
                              groupVariantsByFamily && vInfo?.isVariant
                                ? 'bg-indigo-50/10 dark:bg-indigo-950/15 hover:bg-indigo-50/40 dark:hover:bg-indigo-900/30'
                                : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/60'
                            }`}
                          >
                            {/* 1. PRODUCT & SPECIFICATIONS (Strict 2-Line Cell, Zero Duplicate Specs) */}
                            <td className="py-3 px-4 overflow-hidden align-middle">
                              <div className="flex items-center gap-3 min-w-0 overflow-hidden">
                                {/* Product Image Thumbnail or Clean Placeholder */}
                                {p.image_url ? (
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
                                      src={p.image_url}
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
                                  {/* Line 1: Bold Product Name + Compact Inline Kit/Origin/Datasheet Badge */}
                                  <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
                                    <span
                                      className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate"
                                      title={productTitle}
                                    >
                                      {productTitle}
                                    </span>
                                    {p.is_composite_set && p.sub_components && p.sub_components.length > 0 ? (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/60 shrink-0">
                                        <Layers className="w-2.5 h-2.5" />
                                        <span>Kit / BOM</span>
                                      </span>
                                    ) : p.country_of_origin ? (
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

                                  {/* Line 2: Either up to 3 compact spec pills (+N more) OR a single non-repeating subtitle line */}
                                  {hasStructuredAttrs ? (
                                    <div
                                      className="flex items-center gap-1.5 overflow-hidden whitespace-nowrap mt-1"
                                      title={allSpecsTooltip}
                                    >
                                      {visibleAttrs.map((attr, idx) => {
                                        const isDiff =
                                          Boolean(vInfo?.isVariant) &&
                                          idx < (vInfo?.differentiatingAttributes.length || 0);
                                        return (
                                          <span
                                            key={idx}
                                            className={`text-[10.5px] font-mono px-1.5 py-0.5 rounded border max-w-[160px] truncate shrink-0 ${
                                              isDiff
                                                ? 'font-semibold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/60'
                                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200/80 dark:border-slate-700'
                                            }`}
                                          >
                                            {attr.key}: {attr.value || '—'}
                                          </span>
                                        );
                                      })}
                                      {remainingAttrCount > 0 && (
                                        <span className="text-[10.5px] font-mono text-slate-400 dark:text-slate-500 shrink-0">
                                          +{remainingAttrCount} more
                                        </span>
                                      )}
                                    </div>
                                  ) : cleanSubtitle ? (
                                    <span
                                      className="text-xs text-slate-500 dark:text-slate-400 block truncate mt-0.5"
                                      title={cleanSubtitle}
                                    >
                                      {cleanSubtitle}
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                            </td>

                            {/* 2. CATEGORY */}
                            <td className="py-3 px-2.5 overflow-hidden align-middle">
                              <span
                                className="inline-block text-[11px] font-medium px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/40 border border-blue-200/70 dark:border-blue-800/60 text-blue-700 dark:text-blue-300 truncate max-w-full"
                                title={p.product_type || 'General'}
                              >
                                {p.product_type || 'General'}
                              </span>
                            </td>

                            {/* 3. BRAND & SKU (Max 2 Lines) */}
                            <td className="py-3 px-2.5 overflow-hidden align-middle">
                              <div className="flex flex-col gap-0.5 min-w-0 overflow-hidden">
                                {!hasBrand && skuModelLine !== '—' ? (
                                  <>
                                    <span
                                      className="font-mono text-xs font-medium text-slate-700 dark:text-slate-300 truncate"
                                      title={skuModelLine}
                                    >
                                      {skuModelLine}
                                    </span>
                                    <span className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
                                      No brand set
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <span
                                      className="font-semibold text-xs text-slate-800 dark:text-slate-200 truncate"
                                      title={brandLabel}
                                    >
                                      {brandLabel}
                                    </span>
                                    <span
                                      className="font-mono text-[11px] text-slate-500 dark:text-slate-400 truncate"
                                      title={skuModelLine}
                                    >
                                      {skuModelLine}
                                    </span>
                                  </>
                                )}
                              </div>
                            </td>

                            {/* 4. STOCK & LEAD TIME (Max 2 Lines) */}
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
                                      title={`Available: ${availableQty} ${cleanUnit} (On Hand: ${p.stock_on_hand || 0}, Reserved: ${p.stock_reserved || 0})`}
                                    >
                                      {isLowStock && <AlertTriangle className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />}
                                      <span className="truncate">
                                        In Stock: {availableQty} {cleanUnit}
                                      </span>
                                    </span>
                                    {(() => {
                                      const stockSubParts = [
                                        p.default_availability || null,
                                        p.storage_location ? `Bin: ${p.storage_location}` : null,
                                        (p.stock_reserved || 0) > 0 ? `Res: ${p.stock_reserved}` : null
                                      ].filter(Boolean);
                                      if (stockSubParts.length === 0) return null;
                                      return (
                                        <span
                                          className="text-[11px] text-slate-400 dark:text-slate-500 truncate max-w-full"
                                          title={stockSubParts.join(' · ')}
                                        >
                                          {stockSubParts.join(' · ')}
                                        </span>
                                      );
                                    })()}
                                  </>
                                ) : (
                                  <>
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700 truncate max-w-full">
                                      Order / Non-Stock
                                    </span>
                                    {p.default_availability && (
                                      <span
                                        className="text-[11px] text-slate-400 dark:text-slate-500 truncate max-w-full"
                                        title={p.default_availability}
                                      >
                                        {p.default_availability}
                                      </span>
                                    )}
                                  </>
                                )}
                              </div>
                            </td>

                            {/* 5. UNIT PRICE (Right-Aligned with pr-4, Max 2 Lines) */}
                            <td className="py-3 pl-2 pr-4 text-right whitespace-nowrap overflow-hidden align-middle">
                              {p.unit_price !== undefined && p.unit_price > 0 ? (
                                <div className="flex flex-col items-end gap-0.5 min-w-0 overflow-hidden">
                                  <span className="font-bold font-mono tabular-nums text-sm text-slate-900 dark:text-slate-100 truncate max-w-full">
                                    AED{' '}
                                    {p.unit_price.toLocaleString(undefined, {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2
                                    })}
                                  </span>
                                  {(() => {
                                    const subParts = [
                                      `per ${cleanUnit}`,
                                      canViewConfidentialMargins && marginPct !== null ? `${marginPct}% margin` : null,
                                      canViewConfidentialMargins && p.last_landed_cost && p.last_landed_cost > 0
                                        ? `Landed: ${p.last_landed_cost.toFixed(0)}`
                                        : null
                                    ].filter(Boolean);
                                    return (
                                      <span
                                        className="text-[11px] text-slate-400 dark:text-slate-500 truncate max-w-full"
                                        title={subParts.join(' · ')}
                                      >
                                        {subParts.join(' · ')}
                                      </span>
                                    );
                                  })()}
                                </div>
                              ) : (
                                <div className="flex flex-col items-end gap-0.5 min-w-0 overflow-hidden">
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/60 whitespace-nowrap">
                                    Price on Request
                                  </span>
                                  <span className="text-[11px] text-slate-400 dark:text-slate-500 truncate">per {cleanUnit}</span>
                                </div>
                              )}
                            </td>

                            {/* 6. ACTIONS (Compact Icon Buttons, Never Clips) */}
                            <td className="py-3 pl-2 pr-3 w-[116px] text-right whitespace-nowrap align-middle" onClick={(e) => e.stopPropagation()}>
                              <div className="inline-flex items-center justify-end gap-1">
                                {isEditable ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openEditModal(p);
                                      }}
                                      className="w-7 h-7 rounded-lg inline-flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 border border-transparent hover:border-blue-200/80 dark:hover:border-blue-800/60 transition cursor-pointer shrink-0"
                                      title="Inspect / Edit Product"
                                      aria-label="Inspect / Edit Product"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openSpecVariantModal(p);
                                      }}
                                      className="w-7 h-7 rounded-lg inline-flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 border border-transparent hover:border-indigo-200/80 dark:hover:border-indigo-800/60 transition cursor-pointer shrink-0"
                                      title="Add Spec Variant"
                                      aria-label="Add Spec Variant"
                                    >
                                      <GitFork className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteProduct(p);
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
                            </td>
                          </tr>
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination controls */}
              <div className="px-4 py-3 bg-slate-50/60 dark:bg-slate-900/60 border-t border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-400">
                <div className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400">
                  Showing{' '}
                  <span className="font-bold text-slate-900 dark:text-slate-100">
                    {Math.min((currentPage - 1) * (itemsPerPage === 'All' ? totalItems : itemsPerPage) + 1, totalItems)}
                  </span>{' '}
                  to{' '}
                  <span className="font-bold text-slate-900 dark:text-slate-100">
                    {Math.min(currentPage * (itemsPerPage === 'All' ? totalItems : itemsPerPage), totalItems)}
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
                      disabled={currentPage <= 1 || itemsPerPage === 'All'}
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
                      disabled={itemsPerPage === 'All' || currentPage >= Math.max(1, totalPages)}
                      className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer text-xs font-semibold inline-flex items-center gap-1"
                      title="Next Page"
                    >
                      <span>Next</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="py-16 px-4 text-center font-sans">
              {searchInput || categoryFilter !== 'All' || stockFilter !== 'All' ? (
                <div className="max-w-md mx-auto flex flex-col items-center gap-2.5">
                  <div className="w-11 h-11 rounded-2xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center">
                    <Search className="w-5 h-5" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-900">
                    No Products Match Your Filter
                  </h4>
                  <p className="text-xs text-slate-500">
                    {searchInput.trim() ? (
                      <>
                        No products match <span className="font-semibold text-slate-800">&ldquo;{searchInput.trim()}&rdquo;</span>
                        {categoryFilter !== 'All' ? ` in ${categoryFilter}` : ''}.
                      </>
                    ) : (
                      <>No products match the selected category or stock status filter.</>
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
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center">
                    <Package className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-900">
                    Your Product Catalog is Empty
                  </h4>
                  <p className="text-xs text-slate-500">
                    Register equipment, materials, spec variant families, or composite engineering packages to streamline quotations, stock reservations, and GRN intake.
                  </p>
                  {isEditable && (
                    <button
                      type="button"
                      onClick={() => openAddModal()}
                      className="mt-1 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Create New Product</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ORGANIZED 3-CHAPTER MODAL: Register or Edit Product */}
        {showFormModal && (
          <div
            id="product-form-modal"
            className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4"
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
              <div className="p-5 sm:p-6 bg-slate-50/80 dark:bg-slate-950/70 overflow-y-auto flex-1 font-sans space-y-5">
                {/* Spec Variant Quick Setup Banner (Surfaced at Top when creating a Spec Variant) */}
                {formVariantParentId && !editingProduct && (
                  <div className="p-4 rounded-2xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/70 space-y-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-xs font-bold text-indigo-950 dark:text-indigo-200 flex items-center gap-1.5">
                        <GitFork className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                        <span>Spec Variant Quick Setup — {formName}</span>
                      </span>
                      <span className="text-[11px] text-indigo-700 dark:text-indigo-300">
                        Adjust differing specification attribute(s), SKU, price, or opening stock below
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-[10px] font-mono uppercase font-bold text-indigo-900 dark:text-indigo-300 mb-1">
                          Variant SKU Code
                        </label>
                        <input
                          type="text"
                          value={formSku}
                          onChange={(e) => setFormSku(e.target.value)}
                          placeholder="e.g. SKU-1042-V2"
                          className="w-full rounded-lg border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-mono uppercase font-bold text-indigo-900 dark:text-indigo-300 mb-1">
                          Selling Price (AED)
                        </label>
                        <input
                          type="number"
                          min={0}
                          step="any"
                          value={formUnitPrice ?? ''}
                          onChange={(e) => setFormUnitPrice(e.target.value !== '' ? Number(e.target.value) : undefined)}
                          placeholder="0.00"
                          className="w-full rounded-lg border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-mono font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-mono uppercase font-bold text-indigo-900 dark:text-indigo-300 mb-1">
                          Base Cost (AED)
                        </label>
                        <input
                          type="number"
                          min={0}
                          step="any"
                          value={formCostPrice ?? ''}
                          onChange={(e) => setFormCostPrice(e.target.value !== '' ? Number(e.target.value) : undefined)}
                          placeholder="0.00"
                          className="w-full rounded-lg border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-mono uppercase font-bold text-indigo-900 dark:text-indigo-300 mb-1">
                          Opening Stock ({formUnit || 'Nos'})
                        </label>
                        <input
                          type="number"
                          min={0}
                          step="any"
                          value={formIsInventoried ? (formStockOnHand ?? 0) : ''}
                          onChange={(e) => {
                            const val = e.target.value !== '' ? Number(e.target.value) : 0;
                            setFormIsInventoried(val > 0 || formIsInventoried);
                            setFormStockOnHand(val);
                          }}
                          placeholder="Non-Stock (0)"
                          className="w-full rounded-lg border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* CHAPTER 1: CORE PRODUCT IDENTITY & SKU */}
                <div
                  id="product-chapter-1"
                  onClick={() => setActiveFormTab('overview')}
                  className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-2xs p-5 space-y-4"
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
                      <label className="block text-[11px] font-mono text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 font-bold">
                        SKU / Internal Code
                      </label>
                      <input
                        type="text"
                        value={formSku}
                        onChange={(e) => setFormSku(e.target.value)}
                        className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 rounded-xl h-[38px] px-3 text-xs font-mono font-semibold text-slate-800 dark:text-slate-100 focus:outline-none"
                        placeholder="e.g. SKU-1042-A"
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
                        onChange={(e) => setFormModelPartNo(e.target.value)}
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
                  className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-2xs p-5 space-y-4"
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
                    {(!formUnitPrice || formUnitPrice <= 0) && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/60 whitespace-nowrap">
                        Price on Request
                      </span>
                    )}
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

                  {/* Composite Package / Kit (BOM) Builder inside Products Catalog */}
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80">
                    <CompositePackageEditor
                      item={{
                        id: editingProduct?.id || 'catalog_bom_draft',
                        item_type: 'Product',
                        product_type: formProductType || 'System Package',
                        name: formName || 'Composite Package / Kit',
                        description: formDescription || formName || 'Composite Package / Kit',
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
                      onChange={(updates) => {
                        if (updates.is_composite_set !== undefined) {
                          setFormIsCompositeSet(updates.is_composite_set);
                          if (updates.is_composite_set && (!formUnit || formUnit === 'Nos')) {
                            setFormUnit('SET');
                          }
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
                        if (updates.unit_price !== undefined) {
                          setFormUnitPrice(updates.unit_price);
                        }
                        if (updates.cost_price !== undefined) {
                          setFormCostPrice(updates.cost_price);
                        }
                      }}
                    />
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

                    {/* Origin, Customs & Export Logistics */}
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
                  </div>
                </div>

                {/* CHAPTER 3: TECHNICAL SPECIFICATIONS & MEDIA */}
                <div
                  id="product-chapter-3"
                  onClick={() => setActiveFormTab('specs_media')}
                  className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-2xs p-5 space-y-4"
                >
                  <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800/80">
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
                    <button
                      type="button"
                      onClick={() => setFormAttributes((prev) => [...prev, { key: '', value: '' }])}
                      className="h-8 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition shrink-0 shadow-2xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Spec Attribute</span>
                    </button>
                  </div>

                  {/* 1. Dynamic Multi-Tenant Specification Attributes with Progressive Disclosure Quick-Add Chips */}
                  <div className="space-y-3">
                    {suggestedAttributeChips.length > 0 && (
                      <div className="flex items-center flex-wrap gap-1.5">
                        <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 font-semibold uppercase mr-0.5 flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-blue-500" /> Quick-Add Spec Chips:
                        </span>
                        {suggestedAttributeChips.map((chip) => (
                          <button
                            key={chip}
                            type="button"
                            onClick={() => setFormAttributes((prev) => [...prev, { key: chip, value: '' }])}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-slate-50 dark:bg-slate-800/90 hover:bg-blue-50 dark:hover:bg-blue-950/50 text-slate-700 dark:text-slate-300 hover:text-blue-700 dark:hover:text-blue-300 border border-slate-200/80 dark:border-slate-700 hover:border-blue-200 dark:hover:border-blue-800 transition cursor-pointer"
                          >
                            <Plus className="w-2.5 h-2.5 shrink-0 opacity-70" />
                            <span>{chip}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {formAttributes.length > 0 ? (
                      <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                        {formAttributes.map((attr, index) => (
                          <div key={index} className="flex items-center gap-2">
                            <input
                              type="text"
                              placeholder="Spec Key (e.g. Color, Capacity, Range, Material)"
                              value={attr.key ?? ''}
                              onChange={(e) => {
                                const nextKey = e.target.value;
                                setFormAttributes((prev) => {
                                  const next = prev.map((a, i) => (i === index ? { ...a, key: nextKey } : a));
                                  const prevCompiled = compileDescriptionWithSpecs(formName, '', prev);
                                  if (!formDescription.trim() || formDescription.trim() === formName.trim() || formDescription.trim() === prevCompiled.trim()) {
                                    setFormDescription(compileDescriptionWithSpecs(formName, '', next));
                                  }
                                  return next;
                                });
                              }}
                              className="w-[42%] bg-slate-50/80 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-1.5 px-3 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-blue-500"
                            />
                            <input
                              type="text"
                              placeholder="Spec Value (e.g. Black, 1.1, 15-20, SS316L)"
                              value={attr.value ?? ''}
                              onChange={(e) => {
                                const nextVal = e.target.value;
                                setFormAttributes((prev) => {
                                  const next = prev.map((a, i) => (i === index ? { ...a, value: nextVal } : a));
                                  const prevCompiled = compileDescriptionWithSpecs(formName, '', prev);
                                  if (!formDescription.trim() || formDescription.trim() === formName.trim() || formDescription.trim() === prevCompiled.trim()) {
                                    setFormDescription(compileDescriptionWithSpecs(formName, '', next));
                                  }
                                  return next;
                                });
                              }}
                              className="flex-1 min-w-0 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-1.5 px-3 text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setFormAttributes((prev) => {
                                  const next = prev.filter((_, i) => i !== index);
                                  const prevCompiled = compileDescriptionWithSpecs(formName, '', prev);
                                  if (!formDescription.trim() || formDescription.trim() === formName.trim() || formDescription.trim() === prevCompiled.trim()) {
                                    setFormDescription(compileDescriptionWithSpecs(formName, '', next));
                                  }
                                  return next;
                                })
                              }
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
                    <div className="flex items-center justify-between mb-1.5">
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
                              deleteFromStorageBucket(formImageUrl).catch(() => {});
                            }
                            setFormImageUrl(patch.image_url || '');
                          }
                          if ('secondary_image_url' in patch) {
                            if (formSecondaryImageUrl && formSecondaryImageUrl !== patch.secondary_image_url) {
                              deleteFromStorageBucket(formSecondaryImageUrl).catch(() => {});
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
                                  deleteFromStorageBucket(formDatasheetAttachment.url).catch(() => {});
                                }
                                setFormDatasheetAttachment(undefined);
                              }}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition cursor-pointer"
                              title="Remove Datasheet & Delete from Cloud Bucket"
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
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-mono uppercase text-slate-400 dark:text-slate-500">Rate:</span>
                    {formUnitPrice !== undefined && formUnitPrice > 0 ? (
                      <span className="font-mono font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        AED {Number(formUnitPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / {formUnit || 'Nos'}
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/60 whitespace-nowrap">
                        Price on Request
                      </span>
                    )}
                  </div>
                  <span className="text-slate-300 dark:text-slate-700">·</span>
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
              const patch: Partial<Product> = {
                ...('image_url' in updates ? { image_url: updates.image_url || undefined } : {}),
                ...('secondary_image_url' in updates ? { secondary_image_url: updates.secondary_image_url || undefined } : {}),
                ...('image_caption' in updates ? { image_caption: updates.image_caption || undefined } : {}),
                ...('secondary_image_caption' in updates ? { secondary_image_caption: updates.secondary_image_caption || undefined } : {}),
                ...('image_adjustments' in updates ? { image_adjustments: updates.image_adjustments } : {}),
                updatedAt: new Date().toISOString()
              };
              const updatedProd = { ...lightboxProduct, ...patch };
              setLightboxProduct(updatedProd);
              if (setProducts) {
                setProducts((prev) => prev.map((prod) => (prod.id === lightboxProduct.id ? updatedProd : prod)));
              }
              await safeUpdateDoc('products', lightboxProduct.id, patch);
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
                      <select
                        required
                        value={grnProductId}
                        onChange={(e) => handleGrnProductChange(e.target.value)}
                        className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 rounded-xl py-2 px-3 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer"
                      >
                        <option value="">-- Select Product to Receive Stock --</option>
                        {activeCatalogProducts.map((p) => (
                          <option key={p.id} value={p.id}>
                            {formatProductVariantSelectorLabel(p, activeCatalogProducts)}
                          </option>
                        ))}
                      </select>

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
                          placeholder="0.00"
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
                      <select
                        required
                        value={adjustProductId}
                        onChange={(e) => {
                          const id = e.target.value;
                          setAdjustProductId(id);
                          const p = activeCatalogProducts.find((item) => item.id === id);
                          if (p) {
                            setAdjustQty(p.stock_on_hand ?? 0);
                            setAdjustStorageLocation(p.storage_location || '');
                            setAdjustUnitCost(p.cost_price ?? '');
                          }
                        }}
                        className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 rounded-xl py-2.5 px-3 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer"
                      >
                        <option value="">-- Choose Product --</option>
                        {activeCatalogProducts.map((p) => (
                          <option key={p.id} value={p.id}>
                            {formatProductVariantSelectorLabel(p, activeCatalogProducts)}
                          </option>
                        ))}
                      </select>
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
                                    : isReserve
                                    ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                                    : isRelease
                                    ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300'
                                    : 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300'
                                }`}
                              >
                                <span>{m.movement_type.replace('_', ' ')}</span>
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
                              <span
                                className={
                                  isStockIn
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : isStockOut
                                    ? 'text-rose-600 dark:text-rose-400'
                                    : isReserve
                                    ? 'text-amber-700 dark:text-amber-400'
                                    : isRelease
                                    ? 'text-purple-700 dark:text-purple-400'
                                    : m.quantity > 0
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : m.quantity < 0
                                    ? 'text-rose-600 dark:text-rose-400'
                                    : 'text-slate-700 dark:text-slate-300'
                                }
                              >
                                {isStockIn
                                  ? `+${m.quantity}`
                                  : isStockOut
                                  ? `-${Math.abs(m.quantity)}`
                                  : isReserve
                                  ? `${Math.abs(m.quantity)} Res.`
                                  : isRelease
                                  ? `${Math.abs(m.quantity)} Rel.`
                                  : m.quantity > 0
                                  ? `+${m.quantity}`
                                  : m.quantity}
                              </span>
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
      </PageBody>
    </div>
  );
}
