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
  LineItemComponent
} from '../types';
import { safeAddDoc, safeUpdateDoc } from '../firebase';
import { generateProductSearchTerms } from '../utils/defaults';
import { UNIVERSAL_UNITS, UNIVERSAL_CATEGORIES } from '../constants';
import { processStockGrn, processStockAdjustment, subscribeStockMovements } from '../services/inventoryService';
import { uploadWorkspaceMediaAsset } from '../services/attachmentStorage';
import CompositePackageEditor from './quotations/CompositePackageEditor';
import { recalculateCompositeItemTotals } from '../utils/compositeBomUtils';
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
  HardDrive
} from 'lucide-react';
import SearchResultCounter from './common/SearchResultCounter';
import { PageHeader, PageBody, KpiStatCard } from './layout/UiContainer';

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
  products: Product[];
  productCategories?: string[];
  units?: string[];
  user: any;
  setProducts?: React.Dispatch<React.SetStateAction<Product[]>>;
  setProductCategories?: React.Dispatch<React.SetStateAction<DropdownOption[]>>;
  setUnits?: React.Dispatch<React.SetStateAction<DropdownOption[]>>;
  activeWorkspace?: Workspace;
  onOpenMobileMenu?: () => void;
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
  companies,
  triggerToast
}: ProductManagerProps) {
  const [searchInput, setSearchInput] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [stockFilter, setStockFilter] = useState<'All' | 'Tracked' | 'LowStock' | 'WithDatasheet' | 'CompositeKit'>('All');

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

  // Inbound GRN Modal State
  const [showGrnModal, setShowGrnModal] = useState(false);
  const [grnNumber, setGrnNumber] = useState('');
  const [grnDate, setGrnDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [grnProductId, setGrnProductId] = useState('');
  const [grnQuantity, setGrnQuantity] = useState<number | string>('');
  const [grnUnitCost, setGrnUnitCost] = useState<number | string>('');
  const [grnUpdateCost, setGrnUpdateCost] = useState(true);
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
    const list = propCategories && propCategories.length > 0 ? propCategories : [...UNIVERSAL_CATEGORIES];
    const fromProducts = products.filter((p) => !p.is_deleted && p.product_type).map((p) => p.product_type);
    return Array.from(new Set([...list, ...fromProducts])).filter((c) => {
      const l = c.toLowerCase();
      return l !== 'anthrecite' && l !== 'anthresite';
    });
  }, [propCategories, products]);

  const units: string[] = useMemo(() => {
    const list = propUnits && propUnits.length > 0 ? propUnits : [...UNIVERSAL_UNITS];
    const fromProducts = products.filter((p) => !p.is_deleted && p.unit).map((p) => p.unit);
    return Array.from(new Set([...list, ...fromProducts]));
  }, [propUnits, products]);

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
        const prod = (m.product_name || '').toLowerCase();
        const ref = (m.reference_number || m.reference_id || '').toLowerCase();
        const dn = (m.delivery_note_ref || '').toLowerCase();
        const sup = (m.supplier_name || '').toLowerCase();
        const notes = (m.reason_notes || '').toLowerCase();
        return prod.includes(query) || ref.includes(query) || dn.includes(query) || sup.includes(query) || notes.includes(query);
      }
      return true;
    });
  }, [movements, movementsTypeFilter, movementsSearch]);

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
    setGrnUpdateCost(true);

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
      supplier_id: grnSupplierId || undefined,
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
          maxDimension: 650,
          quality: 0.84,
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
          maxDimension: 1400,
          quality: 0.86,
          onProgress: (pct) => setDatasheetUploadProgress(pct)
        }
      );
      const attachment: Attachment = {
        id: `ds_${Date.now()}`,
        name: file.name,
        size: uploaded.size || file.size,
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
          uploaded.storageProvider === 'supabase'
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

  const handleClearProductFilters = () => {
    setSearchInput('');
    setCategoryFilter('All');
    setStockFilter('All');
  };

  // Pagination details
  const totalItems = filteredProducts.length;
  const totalPages = useMemo(() => {
    if (itemsPerPage === 'All') return 1;
    return Math.ceil(totalItems / itemsPerPage) || 1;
  }, [totalItems, itemsPerPage]);

  const paginatedProducts = useMemo(() => {
    if (itemsPerPage === 'All') return filteredProducts;
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredProducts.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredProducts, currentPage, itemsPerPage]);

  // CRUD handlers
  const openAddModal = () => {
    setEditingProduct(null);
    setActiveFormTab('overview');
    setFormName('');
    setFormProductType(productCategories[0] || 'General Equipment');
    setFormDescription('');
    setFormUnit(units[0] || 'Nos');
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
    setActiveFormTab('overview');
    setFormName(p.name || p.description || '');
    setFormProductType(p.product_type || productCategories[0] || 'General Equipment');
    setFormDescription(p.description || '');
    setFormUnit(p.unit || units[0] || 'Nos');
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

  // 1-Click Duplicate / Clone Product for variants (e.g. sizes, ratings, materials)
  const openDuplicateModal = (p: Product) => {
    setEditingProduct(null);
    setActiveFormTab('overview');
    setFormName(`${p.name || p.description} (Copy)`);
    setFormProductType(p.product_type || productCategories[0] || 'General Equipment');
    setFormDescription(p.description || '');
    setFormUnit(p.unit || units[0] || 'Nos');
    setFormUnitPrice(p.unit_price ?? undefined);
    setFormCostPrice(p.cost_price ?? undefined);
    setFormIsCompositeSet(Boolean(p.is_composite_set));
    setFormSubComponents((p.sub_components || []).map((c, idx) => ({ ...c, id: `comp_${Date.now()}_${idx}` })));
    setFormPackagePricingMode(p.package_pricing_mode || 'itemized');
    setFormOptionScopeNotes(p.option_scope_notes || '');
    setFormSku(p.sku ? `${p.sku}-VAR` : '');
    setFormBrandMake(p.brand_make || '');
    setFormModelPartNo(p.model_part_no || '');
    setFormDefaultAvailability(p.default_availability || '');
    setFormImageUrl(p.image_url || '');
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
      triggerToast(`Cloned "${p.name || p.description}". Adjust variant details & click Register Product.`, 'info');
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
      description: formDescription.trim() || formName.trim(),
      unit: formUnit || (formIsCompositeSet ? 'SET' : 'Nos'),
      unit_price: finalSellingPrice,
      cost_price: finalCostPrice,
      is_composite_set: formIsCompositeSet,
      sub_components: formIsCompositeSet ? formSubComponents : undefined,
      package_pricing_mode: formIsCompositeSet ? formPackagePricingMode : undefined,
      option_scope_notes: formIsCompositeSet && formOptionScopeNotes.trim() ? formOptionScopeNotes.trim() : undefined,
      sku: formSku.trim() || undefined,
      brand_make: resolvedBrand,
      model_part_no: resolvedModel,
      default_availability: formDefaultAvailability.trim() || undefined,
      image_url: formImageUrl.trim() || undefined,
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
        if (setProducts) {
          setProducts((prev) => prev.map((p) => (p.id === editingProduct.id ? updatedProd : p)));
        }
      } else {
        const res = await safeAddDoc('products', {
          ...data,
          createdAt: new Date().toISOString()
        });
        const newId = res?.id || 'prod_' + Date.now();
        const newProd: Product = { id: newId, ...data } as Product;
        if (setProducts) {
          setProducts((prev) => [newProd, ...prev.filter((p) => p.id !== newId)]);
        }
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
          if (setProducts) {
            setProducts((prev) =>
              prev.map((prod) =>
                prod.id === targetId
                  ? {
                      ...prod,
                      is_deleted: true,
                      deleted_at: new Date().toISOString(),
                      deleted_by_uid: user?.uid,
                      deleted_by_name: user?.full_name || user?.username || 'Unknown'
                    }
                  : prod
              )
            );
          }
          await safeUpdateDoc('products', targetId, {
            is_deleted: true,
            deleted_at: new Date().toISOString(),
            deleted_by_uid: user?.uid || null,
            deleted_by_name: user?.full_name || user?.username || 'Unknown'
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
    <>
      <PageHeader
        title="Product Catalog"
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
        secondaryActions={[
          ...(isEditable
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
            : []),
          {
            label: 'Stock Ledger',
            icon: History,
            onClick: () => setShowLedgerModal(true),
            variant: 'ghost' as const
          }
        ]}
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
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            {/* Search bar */}
            <div className="md:col-span-6 relative flex items-center">
              <Search className="w-4 h-4 text-slate-400 absolute left-4 pointer-events-none" />
              <input
                type="text"
                placeholder="Search products by name, brand, model, SKU, specs..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full bg-white border border-slate-200 hover:border-slate-300 focus:border-blue-500 rounded-xl py-2 pl-11 pr-4 text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none transition h-11"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => setSearchInput('')}
                  className="absolute right-3 p-1 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Category filter */}
            <div className="md:col-span-3 relative flex items-center bg-white border border-slate-200 hover:border-slate-300 rounded-xl shadow-sm h-11 transition">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="appearance-none w-full bg-transparent pl-4 pr-10 text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer h-full font-sans"
              >
                <option value="All">All Categories</option>
                {productCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3.5 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>

            {/* Stock & Media Filter Segmented Control */}
            <div className="md:col-span-3 flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl h-11 overflow-x-auto">
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
                  className={`flex-1 h-full rounded-lg text-[10px] font-bold transition cursor-pointer whitespace-nowrap px-1.5 ${
                    stockFilter === tab.id
                      ? 'bg-white dark:bg-slate-900 text-blue-600 shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
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
              ...(stockFilter !== 'All' ? [`Filter: ${stockFilter}`] : [])
            ]}
            className="mt-4"
          />
        </div>

        {/* Products Table Layout */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-2xl shadow-sm overflow-hidden">
          {paginatedProducts.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold tracking-wider text-slate-500 dark:text-slate-400 select-none bg-slate-50/50 dark:bg-slate-950/50">
                      <th className="py-4 px-6">Product & Specifications</th>
                      <th className="py-4 px-4">Category</th>
                      <th className="py-4 px-4">Brand / Model / SKU</th>
                      <th className="py-4 px-4">Stock & Lead Time</th>
                      <th className="py-4 px-4">Unit</th>
                      <th className="py-4 px-5 text-right">Standard Price</th>
                      <th className="py-4 px-5 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-sans text-sm">
                    {paginatedProducts.map((p) => {
                      const availableQty = (p.stock_on_hand || 0) - (p.stock_reserved || 0);
                      const isLowStock = Boolean(p.is_inventoried) && availableQty <= (p.reorder_level || 0);
                      const sellPrice = p.unit_price || 0;
                      const costPrice = p.cost_price || 0;
                      const marginPct =
                        sellPrice > 0 && costPrice > 0
                          ? Math.round(((sellPrice - costPrice) / sellPrice) * 100)
                          : null;

                      return (
                        <tr key={p.id} className="hover:bg-slate-50/60 transition duration-150 group">
                          <td className="py-4 px-6">
                            <div className="flex items-start gap-3.5">
                              {/* Product Image Thumbnail or Clean Placeholder */}
                              {p.image_url ? (
                                <img
                                  src={p.image_url}
                                  alt={p.name || p.description}
                                  className="w-11 h-11 rounded-xl object-contain bg-white border border-slate-200 p-0.5 shrink-0 shadow-2xs"
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <div className="w-11 h-11 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 flex items-center justify-center text-slate-400 shrink-0">
                                  <Package className="w-5 h-5" />
                                </div>
                              )}

                              <div className="space-y-1 min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold text-slate-900 dark:text-white font-sans">
                                    {p.name || p.product_type}
                                  </span>
                                  {p.is_composite_set && p.sub_components && p.sub_components.length > 0 && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                      <Layers className="w-3 h-3" />
                                      <span>Kit / BOM • {p.sub_components.length} parts</span>
                                    </span>
                                  )}
                                  {p.datasheet_attachment?.url && (
                                    <a
                                      href={p.datasheet_attachment.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition"
                                      title={`View Technical Datasheet: ${p.datasheet_attachment.name}`}
                                    >
                                      <FileText className="w-3 h-3" />
                                      <span>Datasheet</span>
                                    </a>
                                  )}
                                  {p.country_of_origin && (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-100 text-slate-600 border border-slate-200">
                                      <Globe className="w-2.5 h-2.5 text-slate-400" />
                                      <span>{p.country_of_origin}</span>
                                    </span>
                                  )}
                                </div>
                                <span
                                  className="text-xs text-slate-500 block max-w-md truncate"
                                  title={p.description}
                                >
                                  {p.description}
                                </span>
                                {p.attributes && p.attributes.length > 0 && (
                                  <div className="flex flex-wrap gap-1.5 pt-1">
                                    {p.attributes.slice(0, 5).map((attr, idx) => (
                                      <span
                                        key={idx}
                                        className="text-[10px] font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200"
                                      >
                                        {attr.key}: {attr.value || '—'}
                                      </span>
                                    ))}
                                    {p.attributes.length > 5 && (
                                      <span className="text-[10px] font-mono text-slate-400 px-1 py-0.5">
                                        +{p.attributes.length - 5} more
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>

                          <td className="py-4 px-4">
                            <span className="inline-flex items-center text-[11px] font-mono font-bold px-2.5 py-1 rounded-full bg-blue-50 border border-blue-100 text-blue-700 uppercase whitespace-nowrap">
                              {p.product_type}
                            </span>
                          </td>

                          <td className="py-4 px-4">
                            <div className="space-y-1 text-xs">
                              {(p.brand_make || p.model_part_no) ? (
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {p.brand_make && (
                                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                                      {p.brand_make}
                                    </span>
                                  )}
                                  {p.model_part_no && (
                                    <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                                      {p.model_part_no}
                                    </span>
                                  )}
                                </div>
                              ) : null}
                              <span className="block font-mono text-[11px] text-slate-500">
                                {p.sku ? `SKU: ${p.sku}` : '—'}
                              </span>
                            </div>
                          </td>

                          <td className="py-4 px-4">
                            <div className="space-y-1">
                              {p.is_inventoried ? (
                                <>
                                  <span
                                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${
                                      isLowStock
                                        ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                        : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                    }`}
                                  >
                                    {isLowStock && <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />}
                                    <span>
                                      Avail: {availableQty} {p.unit}
                                    </span>
                                  </span>
                                  <div className="text-[10px] font-mono text-slate-400 flex items-center gap-2">
                                    <span>On Hand: {p.stock_on_hand || 0}</span>
                                    {(p.stock_reserved || 0) > 0 && (
                                      <span className="text-amber-600">Res: {p.stock_reserved}</span>
                                    )}
                                  </div>
                                  {p.storage_location && (
                                    <span
                                      className="block text-[10px] text-slate-400 font-mono truncate max-w-[140px]"
                                      title={p.storage_location}
                                    >
                                      Bin: {p.storage_location}
                                    </span>
                                  )}
                                </>
                              ) : (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200 whitespace-nowrap">
                                  {p.default_availability || 'Order / Non-Stock'}
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="py-4 px-4 font-mono text-xs text-slate-600 font-semibold whitespace-nowrap">
                            {p.unit || 'Nos'}
                          </td>

                          <td className="py-4 px-5 text-right whitespace-nowrap">
                            {p.unit_price !== undefined && p.unit_price > 0 ? (
                              <div>
                                <span className="font-bold font-mono text-slate-900 dark:text-white block">
                                  AED{' '}
                                  {p.unit_price.toLocaleString(undefined, {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2
                                  })}
                                </span>
                                {marginPct !== null && (
                                  <span
                                    className={`inline-block text-[10px] font-mono font-semibold px-1.5 py-0.2 rounded ${
                                      marginPct >= 20
                                        ? 'text-emerald-700 bg-emerald-50'
                                        : marginPct > 0
                                        ? 'text-amber-700 bg-amber-50'
                                        : 'text-rose-700 bg-rose-50'
                                    }`}
                                  >
                                    {marginPct}% margin
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs font-medium text-slate-400 italic">On Request / Variable</span>
                            )}
                          </td>

                          <td className="py-4 px-5 text-center">
                            <div className="flex items-center justify-center space-x-1.5">
                              {isEditable ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => openGrnModal(p)}
                                    className="p-1.5 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-200 text-slate-500 hover:text-emerald-700 rounded-lg transition cursor-pointer"
                                    title="Receive Stock (Inbound GRN)"
                                  >
                                    <ArrowDownToLine className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openAdjustModal(p)}
                                    className="p-1.5 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 text-slate-500 hover:text-indigo-700 rounded-lg transition cursor-pointer"
                                    title="Quick Stock Adjustment (Recount / Opening Stock / Write-Off)"
                                  >
                                    <Sliders className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openDuplicateModal(p)}
                                    className="p-1.5 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 text-slate-500 hover:text-blue-700 rounded-lg transition cursor-pointer"
                                    title="Duplicate / Clone Product Variant"
                                  >
                                    <Copy className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openEditModal(p)}
                                    className="p-1.5 hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-500 hover:text-slate-800 transition cursor-pointer"
                                    title="Edit Product"
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteProduct(p)}
                                    className="p-1.5 hover:bg-rose-50 border border-slate-200 hover:border-rose-100 text-slate-400 hover:text-rose-600 rounded-lg transition cursor-pointer"
                                    title="Move to Recycle Bin"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </>
                              ) : (
                                <span className="text-xs text-slate-400 italic">Viewer Mode</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination controls */}
              <div className="flex flex-col sm:flex-row items-center justify-between px-6 py-4 bg-slate-50 border-t border-slate-200 gap-4">
                <div className="text-xs font-mono text-slate-500">
                  Showing{' '}
                  <span className="font-bold text-slate-950">
                    {Math.min((currentPage - 1) * (itemsPerPage === 'All' ? totalItems : itemsPerPage) + 1, totalItems)}
                  </span>{' '}
                  to{' '}
                  <span className="font-bold text-slate-950">
                    {Math.min(currentPage * (itemsPerPage === 'All' ? totalItems : itemsPerPage), totalItems)}
                  </span>{' '}
                  of <span className="font-bold text-slate-950">{totalItems}</span> products
                </div>

                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-slate-500 font-sans">Show:</span>
                    <select
                      value={itemsPerPage}
                      onChange={(e) => {
                        const val = e.target.value;
                        setItemsPerPage(val === 'All' ? 'All' : Number(val));
                        setCurrentPage(1);
                      }}
                      className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer"
                    >
                      <option value={10}>10</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                      <option value="All">All</option>
                    </select>
                  </div>

                  {totalPages > 1 && itemsPerPage !== 'All' && (
                    <div className="flex items-center space-x-1">
                      <button
                        type="button"
                        onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                        disabled={currentPage === 1}
                        className="py-1 px-2.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white transition cursor-pointer text-xs font-semibold"
                      >
                        Prev
                      </button>
                      <span className="text-xs font-mono px-3 text-slate-500">
                        Page {currentPage} of {totalPages}
                      </span>
                      <button
                        type="button"
                        onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                        disabled={currentPage === totalPages}
                        className="py-1 px-2.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white transition cursor-pointer text-xs font-semibold"
                      >
                        Next
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="py-24 text-center text-slate-400 font-sans">
              <p>No products found matching your catalog search criteria.</p>
              {(searchInput || categoryFilter !== 'All' || stockFilter !== 'All') && (
                <button
                  type="button"
                  onClick={handleClearProductFilters}
                  className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset all filters and search</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* ORGANIZED 3-TAB MODAL: Register or Edit Product */}
        {showFormModal && (
          <div
            id="product-form-modal"
            className="fixed inset-0 bg-slate-950/55 backdrop-blur-xs z-50 flex items-center justify-center p-4"
          >
            <form
              onSubmit={handleSaveProduct}
              className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full ${
                formIsCompositeSet ? 'max-w-5xl' : 'max-w-3xl'
              } shadow-2xl relative flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150 transition-all`}
            >
              {/* Pinned Modal Header + Live Product Summary Banner */}
              <div className="p-5 px-6 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 shrink-0 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-blue-600 text-white shadow-xs">
                      <Package className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white font-sans">
                        {editingProduct ? 'Edit Catalog Product' : 'Register New Catalog Product'}
                      </h3>
                      <p className="text-[11px] text-slate-500 font-sans">
                        Synced across Enquiries, Quotation Studio Line Items, and Warehouse Stock
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowFormModal(false)}
                    className="text-slate-400 hover:text-slate-800 transition p-1.5 rounded-xl hover:bg-slate-200/60 cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Live Header Summary Card */}
                <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {formImageUrl ? (
                      <img
                        src={formImageUrl}
                        alt="Product preview"
                        className="w-12 h-12 rounded-xl object-contain bg-white border border-slate-200 p-0.5 shrink-0"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 shrink-0">
                        <ImageIcon className="w-5 h-5" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
                          {formName.trim() || 'Untitled Catalog Product'}
                        </span>
                        {formProductType && (
                          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 uppercase whitespace-nowrap">
                            {formProductType}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono mt-0.5 flex-wrap">
                        <span>{formSku.trim() ? `SKU: ${formSku.trim()}` : 'No SKU'}</span>
                        {formBrandMake.trim() && <span>• Brand: {formBrandMake.trim()}</span>}
                        {formModelPartNo.trim() && <span>• Model: {formModelPartNo.trim()}</span>}
                        {formDatasheetAttachment && (
                          <span className="text-indigo-600 font-sans font-semibold">• Datasheet Attached</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 sm:text-right shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100">
                    <div>
                      <span className="text-[10px] font-mono uppercase text-slate-400 block">Selling Price</span>
                      <span className="text-sm font-bold font-mono text-slate-900 dark:text-white">
                        {formUnitPrice !== undefined && formUnitPrice > 0
                          ? `AED ${Number(formUnitPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / ${formUnit || 'Unit'}`
                          : 'On Request'}
                      </span>
                      {livePricingMetrics && (
                        <span
                          className={`block text-[10px] font-mono font-bold ${
                            livePricingMetrics.marginPct >= 20
                              ? 'text-emerald-600'
                              : livePricingMetrics.marginPct > 0
                              ? 'text-amber-600'
                              : 'text-rose-600'
                          }`}
                        >
                          {livePricingMetrics.marginPct.toFixed(1)}% Margin ({livePricingMetrics.markupPct.toFixed(1)}% Markup)
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 3-Tab Navigation Bar */}
                <div className="grid grid-cols-3 gap-1.5 bg-slate-200/70 dark:bg-slate-800 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setActiveFormTab('overview')}
                    className={`py-2 px-3 rounded-lg text-xs font-bold font-sans flex items-center justify-center gap-2 transition cursor-pointer ${
                      activeFormTab === 'overview'
                        ? 'bg-white dark:bg-slate-900 text-blue-600 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    <Tag className="w-3.5 h-3.5" />
                    <span>1. Overview & Pricing</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveFormTab('specs_media')}
                    className={`py-2 px-3 rounded-lg text-xs font-bold font-sans flex items-center justify-center gap-2 transition cursor-pointer ${
                      activeFormTab === 'specs_media'
                        ? 'bg-white dark:bg-slate-900 text-blue-600 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    <ImageIcon className="w-3.5 h-3.5" />
                    <span>2. Specs, Image & Datasheet</span>
                    {(formImageUrl || formDatasheetAttachment || formAttributes.length > 0) && (
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveFormTab('inventory')}
                    className={`py-2 px-3 rounded-lg text-xs font-bold font-sans flex items-center justify-center gap-2 transition cursor-pointer ${
                      activeFormTab === 'inventory'
                        ? 'bg-white dark:bg-slate-900 text-blue-600 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    <Boxes className="w-3.5 h-3.5" />
                    <span>3. Inventory & Logistics</span>
                    {formIsInventoried && <span className="w-2 h-2 rounded-full bg-blue-500" />}
                  </button>
                </div>
              </div>

              {/* Scrollable Tab Body */}
              <div className="p-6 overflow-y-auto flex-1 font-sans">
                {/* TAB 1: OVERVIEW & PRICING */}
                {activeFormTab === 'overview' && (
                  <div className="space-y-5">
                    <div>
                      <label className="block text-[11px] font-mono text-slate-500 uppercase tracking-wider mb-1.5 font-bold">
                        Product Name / Commercial Title <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={formName}
                        onChange={(e) => setFormName(e.target.value)}
                        className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2.5 px-3.5 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
                        placeholder='e.g. High-Rejection Seawater RO Membrane Element (8" SWC5-LD)'
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Category Selector */}
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="block text-[11px] font-mono text-slate-500 uppercase tracking-wider font-bold">
                            Category <span className="text-rose-500">*</span>
                          </label>
                          {!isCreatingCategory && (
                            <button
                              type="button"
                              onClick={() => {
                                setIsCreatingCategory(true);
                                setNewCategoryInput('');
                              }}
                              className="text-[11px] text-blue-600 hover:text-blue-700 font-bold flex items-center space-x-0.5 cursor-pointer hover:underline"
                            >
                              <Plus className="w-3 h-3" />
                              <span>Add Category</span>
                            </button>
                          )}
                        </div>
                        {isCreatingCategory ? (
                          <div className="flex items-center space-x-1.5">
                            <input
                              type="text"
                              autoFocus
                              value={newCategoryInput}
                              onChange={(e) => setNewCategoryInput(e.target.value)}
                              placeholder="Enter category name..."
                              className="w-full bg-white border border-blue-400 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-none"
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
                              className="px-3 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 shrink-0 cursor-pointer"
                            >
                              Add
                            </button>
                            <button
                              type="button"
                              onClick={() => setIsCreatingCategory(false)}
                              className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 shrink-0 cursor-pointer"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
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
                            className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2.5 px-3 text-sm text-slate-800 focus:outline-none"
                          >
                            {productCategories.map((cat) => (
                              <option key={cat} value={cat}>
                                {cat}
                              </option>
                            ))}
                            <option value="__NEW_CATEGORY__">+ Add Custom Category...</option>
                          </select>
                        )}
                      </div>

                      {/* SKU / Code */}
                      <div>
                        <label className="block text-[11px] font-mono text-slate-500 uppercase tracking-wider mb-1.5 font-bold">
                          SKU / Internal Code
                        </label>
                        <input
                          type="text"
                          value={formSku}
                          onChange={(e) => setFormSku(e.target.value)}
                          className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2.5 px-3 text-sm font-mono text-slate-800 focus:outline-none"
                          placeholder="e.g. SKU-SWC5-LD"
                        />
                      </div>
                    </div>

                    {/* First-Class Brand/Make & Model/Part No (Auto-populates Quotation Columns) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[11px] font-mono text-slate-500 uppercase tracking-wider mb-1.5 font-bold">
                          Brand / Make
                        </label>
                        <input
                          type="text"
                          value={formBrandMake}
                          onChange={(e) => setFormBrandMake(e.target.value)}
                          className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2.5 px-3 text-sm text-slate-800 focus:outline-none"
                          placeholder="e.g. Hydranautics, Grundfos, Pentair, Aventura"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-mono text-slate-500 uppercase tracking-wider mb-1.5 font-bold">
                          Model / Part Number
                        </label>
                        <input
                          type="text"
                          value={formModelPartNo}
                          onChange={(e) => setFormModelPartNo(e.target.value)}
                          className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2.5 px-3 text-sm font-mono text-slate-800 focus:outline-none"
                          placeholder="e.g. SWC5-LD-8040"
                        />
                      </div>
                    </div>

                    {/* Unit, Standard Selling Price, Cost Price */}
                    <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80 space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <label className="block text-[11px] font-mono text-slate-500 uppercase tracking-wider font-bold">
                              Unit (UOM) <span className="text-rose-500">*</span>
                            </label>
                            {!isCreatingUnit && (
                              <button
                                type="button"
                                onClick={() => {
                                  setIsCreatingUnit(true);
                                  setNewUnitInput('');
                                }}
                                className="text-[11px] text-blue-600 hover:text-blue-700 font-bold flex items-center space-x-0.5 cursor-pointer hover:underline"
                              >
                                <Plus className="w-3 h-3" />
                                <span>Add Unit</span>
                              </button>
                            )}
                          </div>
                          {isCreatingUnit ? (
                            <div className="flex items-center space-x-1">
                              <input
                                type="text"
                                autoFocus
                                value={newUnitInput}
                                onChange={(e) => setNewUnitInput(e.target.value)}
                                placeholder="e.g. Roll, Pack..."
                                className="w-full bg-white border border-blue-400 rounded-xl py-2 px-2.5 text-xs text-slate-800 focus:outline-none"
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
                            </div>
                          ) : (
                            <select
                              value={formUnit}
                              onChange={(e) => {
                                if (e.target.value === '__NEW_UNIT__') {
                                  setIsCreatingUnit(true);
                                  setNewUnitInput('');
                                } else {
                                  setFormUnit(e.target.value as UnitType);
                                }
                              }}
                              className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2.5 px-3 text-sm font-semibold text-slate-800 focus:outline-none"
                            >
                              {units.map((u) => (
                                <option key={u} value={u}>
                                  {u}
                                </option>
                              ))}
                              <option value="__NEW_UNIT__">+ Add Custom Unit...</option>
                            </select>
                          )}
                        </div>

                        <div>
                          <label className="block text-[11px] font-mono text-slate-500 uppercase tracking-wider mb-1.5 font-bold">
                            Selling Price (AED)
                          </label>
                          <input
                            type="number"
                            min={0}
                            step="any"
                            value={formUnitPrice ?? ''}
                            onChange={(e) => setFormUnitPrice(e.target.value !== '' ? Number(e.target.value) : undefined)}
                            className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2.5 px-3 text-sm font-mono font-bold text-slate-900 focus:outline-none"
                            placeholder="0.00 (or leave blank)"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-mono text-slate-500 uppercase tracking-wider mb-1.5 font-bold">
                            Base Cost Price (AED)
                          </label>
                          <input
                            type="number"
                            min={0}
                            step="any"
                            value={formCostPrice ?? ''}
                            onChange={(e) => setFormCostPrice(e.target.value !== '' ? Number(e.target.value) : undefined)}
                            className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2.5 px-3 text-sm font-mono text-slate-800 focus:outline-none"
                            placeholder="0.00"
                          />
                        </div>
                      </div>

                      {livePricingMetrics && (
                        <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between text-xs">
                          <span className="text-slate-500 font-medium">Estimated Gross Profit per {formUnit || 'Unit'}:</span>
                          <div className="flex items-center gap-3 font-mono font-bold">
                            <span className={livePricingMetrics.profit >= 0 ? 'text-emerald-700' : 'text-rose-600'}>
                              AED {livePricingMetrics.profit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[11px]">
                              Margin: {livePricingMetrics.marginPct.toFixed(1)}%
                            </span>
                            <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-[11px]">
                              Markup: {livePricingMetrics.markupPct.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Composite Package / Kit (BOM) Builder inside Products Catalog */}
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

                    {/* Default Lead Time / Availability */}
                    <div>
                      <label className="block text-[11px] font-mono text-slate-500 uppercase tracking-wider mb-1.5 font-bold">
                        Default Lead Time / Availability (Carried to Quotes)
                      </label>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="text"
                          value={formDefaultAvailability}
                          onChange={(e) => setFormDefaultAvailability(e.target.value)}
                          className="flex-1 bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-none"
                          placeholder="e.g. Ex-Stock, 2-3 Weeks, 6-8 Weeks from Approval"
                        />
                      </div>
                      <div className="flex items-center flex-wrap gap-1.5 mt-2">
                        <span className="text-[10px] font-mono text-slate-400 uppercase mr-1 flex items-center gap-1">
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
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-200'
                            }`}
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 2: SPECS, IMAGE & DATASHEET */}
                {activeFormTab === 'specs_media' && (
                  <div className="space-y-5">
                    {/* Product Image & Technical Datasheet Upload Row (Custom Bucket Storage) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Product Photo Card */}
                      <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/60 flex flex-col justify-between space-y-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                              <ImageIcon className="w-4 h-4 text-blue-600" />
                              <span>Product Image (Quotation Line Item)</span>
                            </span>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              Renders automatically in Quotation Line Items when enabled. Stored in Custom Bucket.
                            </p>
                          </div>
                          {formImageUrl && (
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono font-bold ${
                                formImageUrl.startsWith('http')
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-blue-50 text-blue-700 border border-blue-200'
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

                        {formImageUrl ? (
                          <div className="flex items-center gap-3 bg-white p-2.5 rounded-xl border border-slate-200">
                            <img
                              src={formImageUrl}
                              alt="Product"
                              className="w-16 h-16 rounded-lg object-contain border border-slate-100 bg-slate-50 p-1 shrink-0"
                              referrerPolicy="no-referrer"
                            />
                            <div className="flex-1 min-w-0 space-y-1.5">
                              <span className="text-xs font-semibold text-emerald-700 block truncate">
                                Product Image Ready
                              </span>
                              <div className="flex items-center gap-2">
                                <label className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-semibold cursor-pointer transition">
                                  Replace
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => {
                                      const f = e.target.files?.[0];
                                      if (f) handleProductImageUpload(f);
                                      e.target.value = '';
                                    }}
                                  />
                                </label>
                                <button
                                  type="button"
                                  onClick={() => setFormImageUrl('')}
                                  className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg text-[11px] font-semibold cursor-pointer transition"
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <label className="border-2 border-dashed border-slate-300 hover:border-blue-400 bg-white rounded-xl p-4 flex flex-col items-center justify-center text-center cursor-pointer transition">
                            <UploadCloud className="w-6 h-6 text-blue-500 mb-1" />
                            <span className="text-xs font-bold text-slate-700">
                              {isUploadingImage
                                ? `Uploading (${imageUploadProgress ?? 0}%)...`
                                : 'Click to Upload Product Image'}
                            </span>
                            <span className="text-[10px] text-slate-400 mt-0.5">
                              PNG, JPG, WebP or SVG • Auto-optimized for PDF Quotes
                            </span>
                            <input
                              type="file"
                              accept="image/*"
                              disabled={isUploadingImage}
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handleProductImageUpload(f);
                                e.target.value = '';
                              }}
                            />
                          </label>
                        )}
                      </div>

                      {/* Technical Datasheet / Spec Sheet Card */}
                      <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/60 flex flex-col justify-between space-y-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                              <FileText className="w-4 h-4 text-indigo-600" />
                              <span>Technical Datasheet / Spec Sheet</span>
                            </span>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              Auto-attaches as a Technical Annex when this product is added to a Quotation.
                            </p>
                          </div>
                          {formDatasheetAttachment && (
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono font-bold ${
                                !formDatasheetAttachment.isLocal
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-blue-50 text-blue-700 border border-blue-200'
                              }`}
                            >
                              {!formDatasheetAttachment.isLocal ? 'BUCKET PDF' : 'LOCAL PDF'}
                            </span>
                          )}
                        </div>

                        {formDatasheetAttachment ? (
                          <div className="flex items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600 shrink-0">
                                <Paperclip className="w-4 h-4" />
                              </div>
                              <div className="min-w-0">
                                <span
                                  className="text-xs font-bold text-slate-800 block truncate"
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
                                  className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition"
                                  title="Open Datasheet"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              )}
                              <button
                                type="button"
                                onClick={() => setFormDatasheetAttachment(undefined)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                                title="Remove Datasheet"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <label className="border-2 border-dashed border-slate-300 hover:border-indigo-400 bg-white rounded-xl p-4 flex flex-col items-center justify-center text-center cursor-pointer transition">
                            <UploadCloud className="w-6 h-6 text-indigo-500 mb-1" />
                            <span className="text-xs font-bold text-slate-700">
                              {isUploadingDatasheet
                                ? `Uploading (${datasheetUploadProgress ?? 0}%)...`
                                : 'Click to Upload PDF / Spec Sheet'}
                            </span>
                            <span className="text-[10px] text-slate-400 mt-0.5">
                              PDF or Image • Stored in Custom Bucket (`products/datasheets`)
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

                    {/* Specification Description */}
                    <div>
                      <label className="block text-[11px] font-mono text-slate-500 uppercase tracking-wider mb-1.5 font-bold">
                        Commercial & Technical Description
                      </label>
                      <textarea
                        rows={3}
                        value={formDescription}
                        onChange={(e) => setFormDescription(e.target.value)}
                        className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2.5 px-3.5 text-sm text-slate-800 focus:outline-none"
                        placeholder="Detailed commercial narrative, operating conditions, materials of construction, or scope of supply..."
                      />
                    </div>

                    {/* Dynamic Multi-Tenant Specification Attributes */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <label className="block text-[11px] font-mono text-slate-500 uppercase tracking-wider font-bold">
                            Technical Specification Attributes (Key / Value)
                          </label>
                          <span className="text-[11px] text-slate-400">
                            Displayed as structured pills or inline specs on Quotations.
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setFormAttributes((prev) => [...prev, { key: '', value: '' }])}
                          className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-xs font-bold flex items-center space-x-1 cursor-pointer transition"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add Attribute Row</span>
                        </button>
                      </div>

                      {suggestedAttributeChips.length > 0 && (
                        <div className="mb-3 flex items-center flex-wrap gap-1.5">
                          <span className="text-[10px] font-mono text-slate-400 font-semibold uppercase mr-0.5 flex items-center gap-1">
                            <Sparkles className="w-3 h-3 text-blue-500" /> Quick Add:
                          </span>
                          {suggestedAttributeChips.map((chip) => (
                            <button
                              key={chip}
                              type="button"
                              onClick={() => setFormAttributes((prev) => [...prev, { key: chip, value: '' }])}
                              className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 hover:bg-blue-50 text-slate-600 hover:text-blue-700 border border-slate-200 hover:border-blue-200 transition cursor-pointer"
                            >
                              <Plus className="w-2.5 h-2.5 shrink-0 opacity-70" />
                              <span>{chip}</span>
                            </button>
                          ))}
                        </div>
                      )}

                      <div className="space-y-2 max-h-56 overflow-y-auto border border-slate-200 p-3 rounded-xl bg-slate-50/50">
                        {formAttributes.length > 0 ? (
                          formAttributes.map((attr, index) => (
                            <div key={index} className="flex items-center gap-2">
                              <input
                                type="text"
                                placeholder="Attribute Name (e.g. Dimensions, Voltage, Material)"
                                value={attr.key ?? ''}
                                onChange={(e) =>
                                  setFormAttributes((prev) =>
                                    prev.map((a, i) => (i === index ? { ...a, key: e.target.value } : a))
                                  )
                                }
                                className="w-[42%] bg-white border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs font-semibold text-slate-800 focus:outline-none focus:border-blue-500"
                              />
                              <input
                                type="text"
                                placeholder="Value (e.g. 8040, SS316L, 15 Bar)"
                                value={attr.value ?? ''}
                                onChange={(e) =>
                                  setFormAttributes((prev) =>
                                    prev.map((a, i) => (i === index ? { ...a, value: e.target.value } : a))
                                  )
                                }
                                className="flex-1 min-w-0 bg-white border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                              />
                              <button
                                type="button"
                                onClick={() => setFormAttributes((prev) => prev.filter((_, i) => i !== index))}
                                className="p-1.5 text-slate-400 hover:text-rose-500 transition rounded-md shrink-0 cursor-pointer"
                                title="Remove Attribute"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ))
                        ) : (
                          <p className="text-center text-slate-400 text-xs py-4">
                            No specification attributes added yet. Click any Quick Add chip above or "+ Add Attribute Row".
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 3: INVENTORY & LOGISTICS */}
                {activeFormTab === 'inventory' && (
                  <div className="space-y-5">
                    {/* Track Inventory & Physical Stock Card */}
                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="p-2.5 rounded-xl bg-blue-100 text-blue-700">
                            <Boxes className="w-5 h-5" />
                          </div>
                          <div>
                            <span className="text-sm font-bold text-slate-900 block">
                              Track Inventory & Physical Stock
                            </span>
                            <span className="text-xs text-slate-500">
                              Maintain live stock-on-hand counts, order reservations, low-stock alerts, and warehouse bin locations.
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
                          <div className="w-10 h-5.5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[3px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4.5 after:w-4.5 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                      </div>

                      {formIsInventoried ? (
                        <div className="p-4 rounded-xl border border-blue-200 bg-white space-y-4">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div>
                              <label className="block text-[11px] font-mono text-slate-500 uppercase tracking-wider mb-1.5 font-bold">
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
                                className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2 px-3 text-sm text-slate-900 font-mono font-bold focus:outline-none"
                                placeholder="0"
                              />
                            </div>

                            <div>
                              <label className="block text-[11px] font-mono text-slate-500 uppercase tracking-wider mb-1.5 font-bold">
                                Minimum Stock Alert Threshold
                              </label>
                              <input
                                type="number"
                                min={0}
                                step="any"
                                value={formReorderLevel ?? 0}
                                onChange={(e) =>
                                  setFormReorderLevel(e.target.value !== '' ? Number(e.target.value) : 0)
                                }
                                className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2 px-3 text-sm text-slate-900 font-mono focus:outline-none"
                                placeholder="e.g. 5"
                              />
                            </div>

                            <div>
                              <label className="block text-[11px] font-mono text-slate-500 uppercase tracking-wider mb-1.5 font-bold">
                                Storage Bay / Bin Location
                              </label>
                              <input
                                type="text"
                                value={formStorageLocation}
                                onChange={(e) => setFormStorageLocation(e.target.value)}
                                className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2 px-3 text-sm text-slate-800 font-mono focus:outline-none"
                                placeholder="e.g. WH-1 / Rack B-04"
                              />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500 border-t border-slate-200/80 pt-3">
                          Currently configured as non-stock / procured-to-order. Note: Receiving an Inbound GRN for this product will automatically enable stock tracking.
                        </p>
                      )}
                    </div>

                    {/* International Trade & Customs Metadata */}
                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
                      <div className="flex items-center space-x-3">
                        <div className="p-2.5 rounded-xl bg-indigo-100 text-indigo-700">
                          <Globe className="w-5 h-5" />
                        </div>
                        <div>
                          <span className="text-sm font-bold text-slate-900 block">
                            Origin, Customs & Export Logistics
                          </span>
                          <span className="text-xs text-slate-500">
                            Country of Origin automatically populates the Quotation Origin column when enabled.
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
                        <div>
                          <label className="block text-[11px] font-mono text-slate-500 uppercase tracking-wider mb-1.5 font-bold">
                            Country of Origin
                          </label>
                          <input
                            type="text"
                            value={formCountryOfOrigin}
                            onChange={(e) => setFormCountryOfOrigin(e.target.value)}
                            className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-none"
                            placeholder="e.g. USA, Germany, UAE, Italy"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-mono text-slate-500 uppercase tracking-wider mb-1.5 font-bold">
                            HS Tariff Code
                          </label>
                          <input
                            type="text"
                            value={formHsCode}
                            onChange={(e) => setFormHsCode(e.target.value)}
                            className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2 px-3 text-sm text-slate-800 font-mono focus:outline-none"
                            placeholder="e.g. 8421.21.00"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-mono text-slate-500 uppercase tracking-wider mb-1.5 font-bold">
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
                            className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2 px-3 text-sm text-slate-800 font-mono focus:outline-none"
                            placeholder="e.g. 16.5"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Pinned Modal Footer */}
              <div className="p-4 px-6 border-t border-slate-200 bg-slate-50/80 rounded-b-2xl flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  {activeFormTab !== 'overview' && (
                    <button
                      type="button"
                      onClick={() =>
                        setActiveFormTab(activeFormTab === 'inventory' ? 'specs_media' : 'overview')
                      }
                      className="px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 rounded-xl transition cursor-pointer"
                    >
                      ← Previous Tab
                    </button>
                  )}
                  {activeFormTab !== 'inventory' && (
                    <button
                      type="button"
                      onClick={() =>
                        setActiveFormTab(activeFormTab === 'overview' ? 'specs_media' : 'inventory')
                      }
                      className="px-3 py-2 text-xs font-semibold text-blue-600 hover:bg-blue-50 rounded-xl transition cursor-pointer"
                    >
                      Next Tab →
                    </button>
                  )}
                </div>

                <div className="flex items-center space-x-3">
                  <button
                    type="button"
                    onClick={() => setShowFormModal(false)}
                    className="px-4 py-2 border border-slate-200 hover:bg-slate-100 text-slate-600 font-semibold rounded-xl text-xs transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || isUploadingImage || isUploadingDatasheet || !activeWorkspace?.id}
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold rounded-xl text-xs transition shadow-xs flex items-center justify-center space-x-1.5 cursor-pointer disabled:cursor-not-allowed"
                  >
                    {isSubmitting && (
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    )}
                    <span>
                      {isSubmitting ? 'Saving...' : editingProduct ? 'Save Product Changes' : 'Register Product'}
                    </span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}

        {/* Confirmation Dialog overlay */}
        {confirmDialog.isOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
            <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-6 overflow-hidden">
              <h3 className="text-lg font-bold text-slate-900 font-sans mb-2">{confirmDialog.title}</h3>
              <p className="text-sm text-slate-600 font-sans mb-6 leading-relaxed">{confirmDialog.message}</p>
              <div className="flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
                  className="py-2 px-4 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 transition cursor-pointer"
                >
                  {confirmDialog.cancelText || 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    confirmDialog.onConfirm();
                    setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
                  }}
                  className={`py-2 px-4 rounded-xl text-xs font-bold text-white transition cursor-pointer ${
                    confirmDialog.isDestructive ? 'bg-rose-600 hover:bg-rose-700' : 'bg-slate-900 hover:bg-slate-800'
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
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
            <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
              <div className="p-5 px-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50/50 dark:bg-slate-950/50">
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100">
                    <ArrowDownToLine className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <h3 className="text-base font-bold text-slate-900 dark:text-white font-sans">
                        Inbound Goods Receipt Note (GRN)
                      </h3>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                        {activeWorkspace?.name || 'Workspace'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 font-sans mt-0.5">
                      Receive vendor shipment into warehouse stock and write an immutable audit movement.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowGrnModal(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmitGrn} className="flex flex-col flex-1 overflow-hidden">
                <div className="p-6 space-y-4 overflow-y-auto flex-1 font-sans">
                  {grnFeedback && (
                    <div
                      className={`p-3.5 rounded-xl border flex items-start space-x-2.5 text-xs font-medium ${
                        grnFeedback.type === 'success'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : 'bg-rose-50 text-rose-800 border-rose-200'
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

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        GRN Reference Number <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={grnNumber}
                        onChange={(e) => setGrnNumber(e.target.value)}
                        placeholder="e.g. GRN-2026-1001"
                        className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2 px-3 text-xs font-mono font-semibold text-slate-800 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Received Date <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="date"
                        required
                        value={grnDate}
                        onChange={(e) => setGrnDate(e.target.value)}
                        className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2 px-3 text-xs font-semibold text-slate-800 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Product Selection (Any catalog product; auto-enables stock tracking if untracked) */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Catalog Product <span className="text-rose-500">*</span>
                    </label>
                    <select
                      required
                      value={grnProductId}
                      onChange={(e) => handleGrnProductChange(e.target.value)}
                      className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2.5 px-3 text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer"
                    >
                      <option value="">-- Select Product to Receive Stock --</option>
                      {activeCatalogProducts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name || p.description} {p.sku ? `(SKU: ${p.sku})` : ''} —{' '}
                          {p.is_inventoried
                            ? `On Hand: ${p.stock_on_hand || 0} ${p.unit || ''}`
                            : 'Non-Stock (Will Auto-Enable Tracking)'}
                        </option>
                      ))}
                    </select>

                    {selectedGrnProduct && !selectedGrnProduct.is_inventoried && (
                      <div className="mt-2 p-2.5 rounded-xl bg-blue-50 border border-blue-200 text-[11px] text-blue-800 flex items-center gap-2">
                        <Boxes className="w-4 h-4 text-blue-600 shrink-0" />
                        <span>
                          <strong>Auto-Track Stock:</strong> "{selectedGrnProduct.name || selectedGrnProduct.description}" is currently marked as Non-Stock. Confirming this GRN will automatically enable <strong>Track Inventory & Physical Stock</strong>.
                        </span>
                      </div>
                    )}

                    {selectedGrnProduct && (
                      <div className="mt-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        <div>
                          <span className="block text-[10px] text-slate-400 font-mono uppercase">On Hand</span>
                          <span className="font-bold text-slate-800">
                            {selectedGrnProduct.stock_on_hand || 0} {selectedGrnProduct.unit}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[10px] text-slate-400 font-mono uppercase">Reserved</span>
                          <span className="font-bold text-amber-600">
                            {selectedGrnProduct.stock_reserved || 0} {selectedGrnProduct.unit}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[10px] text-slate-400 font-mono uppercase">Available</span>
                          <span className="font-bold text-emerald-600">
                            {Math.max(
                              0,
                              (selectedGrnProduct.stock_on_hand || 0) - (selectedGrnProduct.stock_reserved || 0)
                            )}{' '}
                            {selectedGrnProduct.unit}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[10px] text-slate-400 font-mono uppercase">Default Bin</span>
                          <span className="font-medium text-slate-600 truncate block">
                            {selectedGrnProduct.storage_location || '—'}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Quantity & Unit Cost */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
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
                        className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2 px-3 text-xs font-semibold font-mono text-slate-800 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Landed Unit Cost (AED)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={grnUnitCost ?? ''}
                        onChange={(e) => setGrnUnitCost(e.target.value)}
                        placeholder="0.00"
                        className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2 px-3 text-xs font-semibold font-mono text-slate-800 focus:outline-none"
                      />
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-center">
                      <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
                        Total Receipt Value
                      </span>
                      <span className="text-sm font-bold font-mono text-slate-900">
                        AED{' '}
                        {((Number(grnQuantity) || 0) * (Number(grnUnitCost) || 0)).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2.5 pt-1">
                    <input
                      type="checkbox"
                      id="grnUpdateCost"
                      checked={grnUpdateCost}
                      onChange={(e) => setGrnUpdateCost(e.target.checked)}
                      className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer"
                    />
                    <label htmlFor="grnUpdateCost" className="text-xs text-slate-600 cursor-pointer select-none">
                      Update product catalog standard cost price to this unit cost (
                      {Number(grnUnitCost) > 0 ? `AED ${Number(grnUnitCost).toFixed(2)}` : 'Current'})
                    </label>
                  </div>

                  {/* Supplier & Delivery Note */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">Supplier / Vendor</label>
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
                          setGrnSupplierId(match?.id || '');
                        }}
                        placeholder="e.g. Manufacturer / Supply Partner"
                        className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2 px-3 text-xs font-semibold text-slate-800 focus:outline-none"
                      />
                      <datalist id="grn-supplier-list">
                        {companies?.map((c) => (
                          <option key={c.id} value={c.display_name || c.canonical_name} />
                        ))}
                      </datalist>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Delivery Note / PO Ref
                      </label>
                      <input
                        type="text"
                        value={grnDeliveryNote}
                        onChange={(e) => setGrnDeliveryNote(e.target.value)}
                        placeholder="e.g. DN-88192 or PO-2026-44"
                        className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2 px-3 text-xs font-semibold text-slate-800 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Warehouse Bin / Storage Location
                    </label>
                    <input
                      type="text"
                      value={grnStorageLocation}
                      onChange={(e) => setGrnStorageLocation(e.target.value)}
                      placeholder="e.g. Rack B-03, Warehouse 1"
                      className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2 px-3 text-xs font-semibold text-slate-800 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Receiving Notes & Inspection Remarks
                    </label>
                    <textarea
                      rows={2}
                      value={grnNotes}
                      onChange={(e) => setGrnNotes(e.target.value)}
                      placeholder="Optional receiving remarks, batch/lot numbers..."
                      className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2 px-3 text-xs font-medium text-slate-800 focus:outline-none resize-none"
                    />
                  </div>
                </div>

                <div className="p-4 px-6 border-t border-slate-100 bg-slate-50/60 rounded-b-2xl flex items-center justify-end space-x-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowGrnModal(false)}
                    className="px-4 py-2 border border-slate-200 hover:bg-slate-100 text-slate-600 font-semibold rounded-xl text-xs transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={grnSubmitting || activeCatalogProducts.length === 0}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-bold rounded-xl text-xs transition shadow-xs flex items-center justify-center space-x-1.5 cursor-pointer"
                  >
                    <ArrowDownToLine className="w-4 h-4" />
                    <span>{grnSubmitting ? 'Processing GRN...' : 'Confirm & Receive Stock'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Quick Stock Adjustment Modal */}
        {showAdjustModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
            <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
              <div className="p-5 px-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100">
                    <Sliders className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 font-sans">
                      Quick Stock Adjustment & Recount
                    </h3>
                    <p className="text-xs text-slate-500 font-sans">
                      Record opening balances, physical cycle recounts, or damaged stock write-offs.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAdjustModal(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmitAdjustment} className="p-6 space-y-4 overflow-y-auto font-sans">
                {adjustFeedback && (
                  <div
                    className={`p-3 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
                      adjustFeedback.type === 'success'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : 'bg-rose-50 text-rose-800 border-rose-200'
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

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
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
                    className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2.5 px-3 text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer"
                  >
                    <option value="">-- Choose Product --</option>
                    {activeCatalogProducts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name || p.description} — Current On Hand: {p.stock_on_hand || 0} {p.unit || ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Adjustment Mode Selector */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Adjustment Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        { id: 'RECOUNT', label: 'Physical Recount (Set Exact Qty)' },
                        { id: 'OPENING_STOCK', label: 'Opening Stock Balance' },
                        { id: 'ADDITION', label: '+ Manual Stock Addition' },
                        { id: 'WRITE_OFF', label: '− Damage / Write-Off Deduction' }
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
                            ? 'bg-indigo-50 border-indigo-500 text-indigo-800 shadow-2xs'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
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
                      className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2 px-3 text-sm font-mono font-bold text-slate-900 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Storage Bin / Location
                    </label>
                    <input
                      type="text"
                      value={adjustStorageLocation}
                      onChange={(e) => setAdjustStorageLocation(e.target.value)}
                      placeholder="e.g. WH-1 / Bay 4"
                      className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2 px-3 text-xs font-mono text-slate-800 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Audit Reason / Remarks <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={adjustReason}
                    onChange={(e) => setAdjustReason(e.target.value)}
                    placeholder="e.g. Monthly warehouse cycle count verification"
                    className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-none"
                  />
                </div>

                <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowAdjustModal(false)}
                    className="px-4 py-2 border border-slate-200 hover:bg-slate-100 text-slate-600 font-semibold rounded-xl text-xs transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={adjustSubmitting || !adjustProductId}
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-bold rounded-xl text-xs transition cursor-pointer"
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
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
            <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-5xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
              <div className="p-5 px-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50/50 dark:bg-slate-950/50">
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl border border-blue-100">
                    <History className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <h3 className="text-base font-bold text-slate-900 dark:text-white font-sans">
                        Inventory Stock Movement Ledger & Audit Log
                      </h3>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                        {movements.length} Records
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 font-sans mt-0.5">
                      Immutable physical inventory transaction audit trail for GRN receipts, reservations, adjustments, and dispatches.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowLedgerModal(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 px-6 border-b border-slate-100 bg-white grid grid-cols-1 sm:grid-cols-12 gap-3 shrink-0">
                <div className="sm:col-span-8 relative flex items-center">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Filter by product name, GRN / Ref #, supplier..."
                    value={movementsSearch}
                    onChange={(e) => setMovementsSearch(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-10 pr-4 text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 transition"
                  />
                </div>

                <div className="sm:col-span-4 relative flex items-center">
                  <select
                    value={movementsTypeFilter}
                    onChange={(e) => setMovementsTypeFilter(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-semibold text-slate-800 focus:outline-none focus:border-blue-500 transition cursor-pointer"
                  >
                    <option value="All">All Movement Types</option>
                    <option value="STOCK_IN">Stock In (GRN Receipts)</option>
                    <option value="STOCK_OUT">Stock Out (Dispatches)</option>
                    <option value="STOCK_RESERVE">Stock Reserved</option>
                    <option value="STOCK_RELEASE">Stock Released</option>
                    <option value="ADJUSTMENT">Adjustments & Recounts</option>
                  </select>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-0">
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
                  <table className="w-full text-left border-collapse font-sans text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500 select-none bg-slate-50/60 sticky top-0 z-10 backdrop-blur-xs">
                        <th className="py-3 px-4">Date / Time</th>
                        <th className="py-3 px-4">Type</th>
                        <th className="py-3 px-4">Reference</th>
                        <th className="py-3 px-4">Product Item</th>
                        <th className="py-3 px-4 text-right">Quantity</th>
                        <th className="py-3 px-4 text-center">On Hand (Prev → New)</th>
                        <th className="py-3 px-4 text-right">Cost (AED)</th>
                        <th className="py-3 px-4">Supplier / Context</th>
                        <th className="py-3 px-4">User</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredMovements.map((m) => {
                        const isStockIn = m.movement_type === 'STOCK_IN';
                        const isStockOut = m.movement_type === 'STOCK_OUT';
                        const isReserve = m.movement_type === 'STOCK_RESERVE';
                        const isRelease = m.movement_type === 'STOCK_RELEASE';

                        return (
                          <tr key={m.id || `${m.product_id}-${m.created_at}`} className="hover:bg-slate-50/50 transition">
                            <td className="py-3 px-4 text-slate-500 font-mono whitespace-nowrap">
                              {m.created_at ? new Date(m.created_at).toLocaleDateString() : '—'}
                              <span className="block text-[10px] text-slate-400">
                                {m.created_at
                                  ? new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                  : ''}
                              </span>
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider inline-flex items-center space-x-1 ${
                                  isStockIn
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : isStockOut
                                    ? 'bg-blue-100 text-blue-800'
                                    : isReserve
                                    ? 'bg-amber-100 text-amber-800'
                                    : isRelease
                                    ? 'bg-purple-100 text-purple-800'
                                    : 'bg-indigo-100 text-indigo-800'
                                }`}
                              >
                                <span>{m.movement_type.replace('_', ' ')}</span>
                              </span>
                            </td>
                            <td className="py-3 px-4 font-mono font-semibold text-slate-800 whitespace-nowrap">
                              {m.reference_number || m.reference_id || '—'}
                              {m.delivery_note_ref && (
                                <span className="block text-[10px] text-slate-400 font-normal">
                                  DN: {m.delivery_note_ref}
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-slate-900 font-medium max-w-[180px] truncate" title={m.product_name}>
                              {m.product_name}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-bold whitespace-nowrap">
                              <span
                                className={
                                  isStockIn || m.quantity > 0
                                    ? 'text-emerald-600'
                                    : isStockOut || m.quantity < 0
                                    ? 'text-rose-600'
                                    : 'text-slate-700'
                                }
                              >
                                {isStockIn ? `+${m.quantity}` : isStockOut ? `-${m.quantity}` : m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center font-mono text-slate-500 whitespace-nowrap">
                              <span className="text-slate-400">{m.previous_on_hand}</span>
                              <span className="mx-1 text-slate-300">→</span>
                              <span className="font-bold text-slate-800">{m.new_on_hand}</span>
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-semibold text-slate-700 whitespace-nowrap">
                              {m.total_cost !== undefined && m.total_cost > 0
                                ? `AED ${m.total_cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                : m.unit_cost !== undefined && m.unit_cost > 0
                                ? `AED ${(m.unit_cost * Math.abs(m.quantity)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                : '—'}
                            </td>
                            <td className="py-3 px-4 text-slate-500 max-w-[200px] truncate" title={m.reason_notes || m.supplier_name}>
                              <span className="font-medium text-slate-700 block truncate">
                                {m.supplier_name || m.reference_type || 'Internal'}
                              </span>
                              {m.reason_notes && (
                                <span className="text-[10px] text-slate-400 block truncate">{m.reason_notes}</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-slate-400 text-[11px] whitespace-nowrap">
                              {m.created_by_name || 'System'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="p-4 px-6 border-t border-slate-100 bg-slate-50/60 rounded-b-2xl flex items-center justify-between shrink-0">
                <span className="text-xs text-slate-400">
                  Displaying {filteredMovements.length} of {movements.length} total movement records
                </span>
                <button
                  type="button"
                  onClick={() => setShowLedgerModal(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-100 text-slate-600 font-semibold rounded-xl text-xs transition cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </PageBody>
    </>
  );
}
