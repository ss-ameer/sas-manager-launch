import React, { useState, useEffect, useMemo } from 'react';
import { Product, ProductType, UnitType, ProductAttribute, CATEGORY_SUGGESTED_ATTRIBUTES, Workspace, DropdownOption, Company, StockMovement, GrnReceiptData } from '../types';
import { safeAddDoc, safeUpdateDoc, safeDeleteDoc } from '../firebase';
import { generateProductSearchTerms } from '../utils/defaults';
import { UNIVERSAL_UNITS, UNIVERSAL_CATEGORIES } from '../constants';
import { processStockGrn, subscribeStockMovements } from '../services/inventoryService';
import {
  Package,
  Plus,
  Search,
  Edit2,
  Trash2,
  X,
  Layers,
  DollarSign,
  Barcode,
  ArrowUpDown,
  RotateCw,
  RotateCcw,
  AlertTriangle,
  ChevronDown,
  Boxes,
  ArrowDownToLine,
  History,
  FileText,
  CheckCircle2,
  Truck
} from 'lucide-react';
import SearchResultCounter from './common/SearchResultCounter';
import { PageHeader, PageBody, CardPanel } from './layout/UiContainer';

const DEFAULT_QUICK_ATTRIBUTES = [
  'Flow Rate',
  'Operating Pressure',
  'Connection Size',
  'Material (MOC)',
  'Power Supply',
  'Capacity / Volume'
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
  companies
}: ProductManagerProps) {
  const [searchInput, setSearchInput] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');

  // Inline Category & Unit Creation States
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const [isCreatingUnit, setIsCreatingUnit] = useState(false);
  const [newUnitInput, setNewUnitInput] = useState('');

  // Form Modal States
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formName, setFormName] = useState('');
  const [formProductType, setFormProductType] = useState<string>('');
  const [formDescription, setFormDescription] = useState('');
  const [formUnit, setFormUnit] = useState<string>('');
  const [formUnitPrice, setFormUnitPrice] = useState<number | undefined>(undefined);
  const [formSku, setFormSku] = useState('');
  const [formAttributes, setFormAttributes] = useState<ProductAttribute[]>([]);

  // Inventory & Logistics Form States
  const [formIsInventoried, setFormIsInventoried] = useState<boolean>(false);
  const [formStockOnHand, setFormStockOnHand] = useState<number | undefined>(0);
  const [formReorderLevel, setFormReorderLevel] = useState<number | undefined>(0);
  const [formStorageLocation, setFormStorageLocation] = useState<string>('');
  const [formHsCode, setFormHsCode] = useState<string>('');
  const [formCountryOfOrigin, setFormCountryOfOrigin] = useState<string>('');
  const [formGrossWeightKg, setFormGrossWeightKg] = useState<number | undefined>(undefined);
  const [formCostPrice, setFormCostPrice] = useState<number | undefined>(undefined);

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
    onConfirm: () => {},
  });

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState<number | 'All'>(25);

  const isEditable = user.role !== 'Viewer';

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

  React.useEffect(() => {
    if (!formProductType) return;
    const suggestions = CATEGORY_SUGGESTED_ATTRIBUTES[formProductType] || [];
    setFormAttributes((prev) => {
      const existingKeys = new Set(prev.map((a) => a.key.toLowerCase()));
      const updated = [...prev];
      suggestions.forEach((key) => {
        if (!existingKeys.has(key.toLowerCase())) {
          updated.push({ key, value: '' });
        }
      });
      return updated;
    });
  }, [formProductType]);

  const productCategories: string[] = React.useMemo(() => {
    const list = propCategories && propCategories.length > 0 ? propCategories : [...UNIVERSAL_CATEGORIES];
    return list.filter(c => {
      const l = c.toLowerCase();
      return l !== 'anthrecite' && l !== 'anthresite';
    });
  }, [propCategories]);

  const units: string[] = React.useMemo(() => {
    return propUnits && propUnits.length > 0 ? propUnits : [...UNIVERSAL_UNITS];
  }, [propUnits]);

  // Physical Inventory Memos & Movement Filters
  const inventoriedProducts = useMemo(() => {
    return products.filter((p) => Boolean(p.is_inventoried) && !p.is_deleted);
  }, [products]);

  const selectedGrnProduct = useMemo(() => {
    return products.find((p) => p.id === grnProductId) || null;
  }, [products, grnProductId]);

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

    if (prod && prod.is_inventoried) {
      setGrnProductId(prod.id || '');
      setGrnUnitCost(prod.cost_price !== undefined ? prod.cost_price : (prod.unit_price || ''));
      setGrnStorageLocation(prod.storage_location || '');
    } else {
      const firstInv = inventoriedProducts[0];
      if (firstInv) {
        setGrnProductId(firstInv.id || '');
        setGrnUnitCost(firstInv.cost_price !== undefined ? firstInv.cost_price : (firstInv.unit_price || ''));
        setGrnStorageLocation(firstInv.storage_location || '');
      } else {
        setGrnProductId('');
        setGrnUnitCost('');
        setGrnStorageLocation('');
      }
    }
    setShowGrnModal(true);
  };

  const handleGrnProductChange = (productId: string) => {
    setGrnProductId(productId);
    const p = products.find((item) => item.id === productId);
    if (p) {
      if (p.cost_price !== undefined && p.cost_price > 0) {
        setGrnUnitCost(p.cost_price);
      } else if (p.unit_price !== undefined && p.unit_price > 0) {
        setGrnUnitCost(p.unit_price);
      } else {
        setGrnUnitCost('');
      }
      if (p.storage_location) {
        setGrnStorageLocation(p.storage_location);
      }
    }
  };

  const handleSubmitGrn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!grnProductId) {
      setGrnFeedback({ type: 'error', message: 'Please select an inventoried product.' });
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

    const prod = products.find((p) => p.id === grnProductId);
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
      product_name: prod.name,
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
        message: `Successfully received ${qty} ${prod.unit || 'units'} into stock for ${prod.name}! (GRN: ${grnNumber})`
      });

      setTimeout(() => {
        setShowGrnModal(false);
      }, 1400);
    } else {
      setGrnFeedback({
        type: 'error',
        message: res.error || 'Failed to process GRN. Please check fields and try again.'
      });
    }
  };

  const handleConfirmNewCategory = async () => {
    const trimmed = newCategoryInput.trim();
    if (!trimmed) {
      setIsCreatingCategory(false);
      return;
    }
    const match = productCategories.find(c => c.toLowerCase() === trimmed.toLowerCase());
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
        setProductCategories(prev => [
          ...prev,
          { id: newId, name: trimmed, workspace_id: activeWorkspace?.id }
        ]);
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
    const match = units.find(u => u.toLowerCase() === trimmed.toLowerCase());
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
        setUnits(prev => [
          ...prev,
          { id: newId, name: trimmed }
        ]);
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

  const filteredProducts = React.useMemo(() => {
    return products.filter((p) => {
      if (p.is_deleted) return false;
      const q = searchInput.toLowerCase();
      const matchSearch =
        (p.name || '').toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        (p.sku || '').toLowerCase().includes(q) ||
        p.product_type.toLowerCase().includes(q);

      const matchesCategory = categoryFilter === 'All' || p.product_type === categoryFilter;

      return matchSearch && matchesCategory;
    });
  }, [products, searchInput, categoryFilter]);

  const totalActiveProducts = React.useMemo(() => {
    return products.filter((p) => !p.is_deleted).length;
  }, [products]);

  const handleClearProductFilters = () => {
    setSearchInput('');
    setCategoryFilter('All');
  };

  // Pagination details
  const totalItems = filteredProducts.length;
  const totalPages = React.useMemo(() => {
    if (itemsPerPage === 'All') return 1;
    return Math.ceil(totalItems / itemsPerPage) || 1;
  }, [totalItems, itemsPerPage]);

  const paginatedProducts = React.useMemo(() => {
    if (itemsPerPage === 'All') return filteredProducts;
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredProducts.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredProducts, currentPage, itemsPerPage]);

  // CRUD handlers
  const openAddModal = () => {
    setEditingProduct(null);
    setFormName('');
    setFormProductType(productCategories[0] || 'RO Membranes');
    setFormDescription('');
    setFormUnit(units[0] || 'Nos');
    setFormUnitPrice(undefined);
    setFormSku('');
    setFormAttributes([]);
    setFormIsInventoried(false);
    setFormStockOnHand(0);
    setFormReorderLevel(0);
    setFormStorageLocation('');
    setFormHsCode('');
    setFormCountryOfOrigin('');
    setFormGrossWeightKg(undefined);
    setFormCostPrice(undefined);
    setShowFormModal(true);
  };

  const openEditModal = (p: Product) => {
    setEditingProduct(p);
    setFormName(p.name || '');
    setFormProductType(p.product_type);
    setFormDescription(p.description);
    setFormUnit(p.unit);
    setFormUnitPrice(p.unit_price);
    setFormSku(p.sku || '');
    setFormAttributes(p.attributes || []);
    setFormIsInventoried(Boolean(p.is_inventoried));
    setFormStockOnHand(p.stock_on_hand ?? 0);
    setFormReorderLevel(p.reorder_level ?? 0);
    setFormStorageLocation(p.storage_location || '');
    setFormHsCode(p.hs_code || '');
    setFormCountryOfOrigin(p.country_of_origin || '');
    setFormGrossWeightKg(p.gross_weight_kg);
    setFormCostPrice(p.cost_price);
    setShowFormModal(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!formName.trim()) {
      alert('Product name is required.');
      return;
    }

    if (!activeWorkspace?.id) {
      setIsSubmitting(false);
      throw new Error("Critical Error: Active workspace context lost. Cannot save record.");
    }

    setIsSubmitting(true);

    const cleanAttributes: ProductAttribute[] = formAttributes
      .map(a => ({ key: a.key.trim(), value: a.value.trim() }))
      .filter(a => a.key !== '' || a.value !== '');

    const brandAttr = cleanAttributes.find(a => a.key.toLowerCase() === 'brand')?.value;
    const searchTerms = generateProductSearchTerms(formName.trim(), formProductType, formSku.trim(), brandAttr);

    const data: Partial<Product> = {
      workspace_id: activeWorkspace.id,
      name: formName.trim(),
      product_type: formProductType,
      description: formDescription.trim() || formName.trim(),
      unit: formUnit,
      unit_price: formUnitPrice !== undefined && formUnitPrice > 0 ? formUnitPrice : undefined,
      sku: formSku.trim() || undefined,
      attributes: cleanAttributes,
      search_terms: searchTerms,
      is_inventoried: formIsInventoried,
      stock_on_hand: formIsInventoried ? Number(formStockOnHand || 0) : undefined,
      stock_reserved: editingProduct ? (editingProduct.stock_reserved || 0) : 0,
      reorder_level: formIsInventoried ? Number(formReorderLevel || 0) : undefined,
      storage_location: formIsInventoried && formStorageLocation.trim() ? formStorageLocation.trim() : undefined,
      hs_code: formHsCode.trim() || undefined,
      country_of_origin: formCountryOfOrigin.trim() || undefined,
      gross_weight_kg: formGrossWeightKg !== undefined && formGrossWeightKg > 0 ? formGrossWeightKg : undefined,
      cost_price: formCostPrice !== undefined && formCostPrice > 0 ? formCostPrice : undefined,
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
          createdAt: new Date().toISOString(),
        });
        const newId = res?.id || ('prod_' + Date.now());
        const newProd: Product = { id: newId, ...data } as Product;
        if (setProducts) {
          setProducts((prev) => [newProd, ...prev.filter((p) => p.id !== newId)]);
        }
      }
      setShowFormModal(false);
    } catch (err: any) {
      alert('Failed to save product: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteProduct = async (p: Product) => {
    const targetId = p.id || (p as any)._id;
    if (!targetId) {
      alert('Error: Product ID is missing. Cannot delete.');
      return;
    }

    setConfirmDialog({
      isOpen: true,
      title: 'Delete Product',
      message: `Are you sure you want to delete "${p.name}"? This is irreversible.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      isDestructive: true,
      onConfirm: async () => {
        try {
          if (setProducts) {
            setProducts((prev) => prev.map((prod) => prod.id === targetId ? {
              ...prod,
              is_deleted: true,
              deleted_at: new Date().toISOString(),
              deleted_by_uid: user?.uid,
              deleted_by_name: user?.full_name || user?.username || 'Unknown'
            } : prod));
          }
          await safeUpdateDoc('products', targetId, {
            is_deleted: true,
            deleted_at: new Date().toISOString(),
            deleted_by_uid: user?.uid || null,
            deleted_by_name: user?.full_name || user?.username || 'Unknown'
          });
        } catch (err: any) {
          alert('Failed to delete product: ' + err.message);
        }
      }
    });
  };

  return (
    <>
      <PageHeader
        title="Product Catalog"
        subtitle="Manage quotation template products with pre-defined spec sheets and pricing."
        icon={Package}
        badge={{ text: `${products.length} Products`, variant: 'blue' }}
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

      <PageBody maxWidth="max-w-7xl">

      {/* Metrics Section */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 rounded-xl">
            <Package className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest block">Total Products</span>
            <span className="text-xl font-bold font-mono text-slate-850 dark:text-white">{products.length} registered</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 rounded-xl">
            <Boxes className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest block">Tracked Inventory</span>
            <span className="text-xl font-bold font-mono text-emerald-650 dark:text-emerald-400">
              {inventoriedProducts.length} physical SKUs
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 rounded-xl">
            <ArrowDownToLine className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest block">Total Stock on Hand</span>
            <span className="text-xl font-bold font-mono text-indigo-600 dark:text-indigo-300">
              {products.reduce((acc, p) => acc + (p.stock_on_hand || 0), 0).toLocaleString()} units
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 rounded-xl">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest block">Active Categories</span>
            <span className="text-xl font-bold font-mono text-slate-850 dark:text-white">
              {new Set(products.map((p) => p.product_type)).size} categories
            </span>
          </div>
        </div>
      </div>

      {/* Filters and Search Console */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          {/* Search bar */}
          <div className="md:col-span-7 relative flex items-center">
            <Search className="w-4 h-4 text-slate-400 absolute left-4 pointer-events-none" />
            <input
              type="text"
              placeholder="Search products by name, description, SKU..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full bg-white border border-slate-200 hover:border-slate-300 focus:border-blue-500 rounded-xl py-2 pl-11 pr-4 text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none transition h-11"
            />
          </div>

          {/* Category filter */}
          <div className="md:col-span-5 relative flex items-center bg-white border border-slate-200 hover:border-slate-300 rounded-xl shadow-sm h-11 transition">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="appearance-none w-full bg-transparent pl-4 pr-12 text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer h-full font-sans"
            >
              <option value="All">All Categories</option>
              {productCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-4 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
        </div>

        {/* Standard Search Result Counter & Filter Status Banner */}
        <SearchResultCounter
          totalCount={totalActiveProducts}
          filteredCount={filteredProducts.length}
          searchQuery={searchInput}
          entityLabel="Products"
          singularEntityLabel="Product"
          onClear={handleClearProductFilters}
          activeFilterLabels={categoryFilter !== 'All' ? [`Category: ${categoryFilter}`] : []}
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
                    <th className="py-4 px-6">Product Details</th>
                    <th className="py-4 px-6">Category</th>
                    <th className="py-4 px-6">SKU / Code</th>
                    <th className="py-4 px-6">Stock Status</th>
                    <th className="py-4 px-6">Unit</th>
                    <th className="py-4 px-6 text-right">Standard Price</th>
                    <th className="py-4 px-6 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-sans text-sm">
                  {paginatedProducts.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/50 transition duration-150 group">
                      <td className="py-4 px-6">
                        <div className="space-y-1">
                          <span className="font-semibold text-slate-900 block font-sans">
                            {p.name || p.product_type}
                          </span>
                          <span className="text-xs text-slate-500 block max-w-sm truncate" title={p.description}>
                            {p.description}
                          </span>
                          {p.attributes && p.attributes.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-1.5">
                              {p.attributes.map((attr, idx) => (
                                <span key={idx} className="text-[10px] font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">
                                  {attr.key}: {attr.value || '—'}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-blue-50 border border-blue-100 text-blue-700 uppercase">
                          {p.product_type}
                        </span>
                      </td>
                      <td className="py-4 px-6 font-mono text-xs text-slate-600 font-semibold">
                        {p.sku || '—'}
                      </td>
                      <td className="py-4 px-6">
                        {p.is_inventoried ? (
                          <div className="space-y-0.5">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                ((p.stock_on_hand || 0) - (p.stock_reserved || 0)) <= (p.reorder_level || 0)
                                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60'
                                  : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60'
                              }`}
                            >
                              Available: {(p.stock_on_hand || 0) - (p.stock_reserved || 0)}
                            </span>
                            {p.storage_location && (
                              <span className="block text-[10px] text-slate-400 dark:text-slate-500 font-mono truncate max-w-[140px]" title={p.storage_location}>
                                Loc: {p.storage_location}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                            Procured / Service
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-6 font-mono text-xs text-slate-500">
                        {p.unit}
                      </td>
                      <td className="py-4 px-6 text-right font-bold font-mono text-slate-800">
                        {p.unit_price !== undefined && p.unit_price > 0
                          ? `AED ${p.unit_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : 'Custom Price'}
                      </td>
                      <td className="py-4 px-6 text-center">
                        <div className="flex items-center justify-center space-x-2">
                          {isEditable ? (
                            <>
                              {p.is_inventoried && (
                                <button
                                  onClick={() => openGrnModal(p)}
                                  className="p-1.5 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-200 text-slate-500 hover:text-emerald-700 rounded-lg transition"
                                  title="Receive Stock (GRN)"
                                >
                                  <ArrowDownToLine className="w-4 h-4" />
                                </button>
                              )}
                              <button
                                onClick={() => openEditModal(p)}
                                className="p-1.5 hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-500 hover:text-slate-800 transition"
                                title="Edit Product"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteProduct(p)}
                                className="p-1.5 hover:bg-rose-50 border border-slate-200 hover:border-rose-100 text-slate-400 hover:text-rose-600 rounded-lg transition"
                                title="Delete Product"
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
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination controls */}
            <div className="flex flex-col sm:flex-row items-center justify-between px-6 py-4 bg-slate-50 border-t border-slate-200 gap-4">
              <div className="text-xs font-mono text-slate-500">
                Showing <span className="font-bold text-slate-950">{Math.min((currentPage - 1) * (itemsPerPage === 'All' ? totalItems : itemsPerPage) + 1, totalItems)}</span> to{' '}
                <span className="font-bold text-slate-950">{Math.min(currentPage * (itemsPerPage === 'All' ? totalItems : itemsPerPage), totalItems)}</span> of{' '}
                <span className="font-bold text-slate-950">{totalItems}</span> products
              </div>

              <div className="flex items-center space-x-4">
                {/* Select limit */}
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
            {(searchInput || categoryFilter !== 'All') && (
              <button
                type="button"
                onClick={handleClearProductFilters}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-950/50 dark:text-blue-300 transition cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset all filters and search</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* FORM MODAL: Create or Edit Product */}
      {showFormModal && (
        <div id="product-form-modal" className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveProduct}
            className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg shadow-2xl relative flex flex-col max-h-[88vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150"
          >
            {/* Pinned Modal Header */}
            <div className="p-6 pb-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h3 className="text-xl font-bold text-slate-900 font-sans">
                {editingProduct ? 'Edit Catalog Product' : 'Register New Product'}
              </h3>
              <button
                type="button"
                onClick={() => setShowFormModal(false)}
                className="text-slate-400 hover:text-slate-800 transition p-1 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Modal Body */}
            <div className="p-6 space-y-5 overflow-y-auto flex-1">
              <div>
                <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-widest mb-1 font-bold">
                  Product Name *
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                  placeholder='e.g. RO Membrane (8" SWC5-LD)'
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-widest font-bold">
                      Category *
                    </label>
                    {!isCreatingCategory && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsCreatingCategory(true);
                          setNewCategoryInput('');
                        }}
                        className="text-[10px] text-blue-600 hover:text-blue-700 font-bold flex items-center space-x-0.5 cursor-pointer hover:underline"
                      >
                        <Plus className="w-3 h-3" />
                        <span>New</span>
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
                        placeholder="New Category..."
                        className="w-full bg-white border border-blue-400 rounded-xl py-1.5 px-3 text-xs text-slate-800 focus:outline-none"
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
                        className="px-2.5 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 shrink-0 cursor-pointer"
                      >
                        Add
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsCreatingCategory(false)}
                        className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 shrink-0 cursor-pointer"
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
                      className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                    >
                      {productCategories.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                      <option value="__NEW_CATEGORY__">+ Add New Category...</option>
                    </select>
                  )}
                </div>

                <div>
                  <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-widest mb-1">
                    SKU / Product Code
                  </label>
                  <input
                    type="text"
                    value={formSku}
                    onChange={(e) => setFormSku(e.target.value)}
                    className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                    placeholder="e.g. SKU-SWC5-LD"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-widest mb-1 font-bold">
                  Specification Sheet Description (Optional)
                </label>
                <textarea
                  rows={3}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2.5 px-3.5 text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                  placeholder="Detailed standard spec sheets, size, model, manufacturer..."
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-widest font-bold">
                    Specification Attributes
                  </label>
                  <button
                    type="button"
                    onClick={() => setFormAttributes(prev => [...prev, { key: '', value: '' }])}
                    className="text-xs text-blue-600 hover:text-blue-700 font-bold flex items-center space-x-1"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add Custom</span>
                  </button>
                </div>
                {(() => {
                  const categoryPresets = CATEGORY_SUGGESTED_ATTRIBUTES[formProductType];
                  const currentPresets = categoryPresets && categoryPresets.length > 0
                    ? categoryPresets
                    : DEFAULT_QUICK_ATTRIBUTES;
                  const existingKeys = new Set(formAttributes.map(a => a.key.trim().toLowerCase()));
                  const availablePresets = currentPresets.filter(p => !existingKeys.has(p.toLowerCase()));

                  if (availablePresets.length === 0) return null;

                  return (
                    <div className="mb-2.5 flex items-center flex-wrap gap-1.5">
                      <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 font-semibold uppercase mr-0.5">
                        Quick Add:
                      </span>
                      {availablePresets.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setFormAttributes(prev => [...prev, { key: preset, value: '' }])}
                          className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 hover:bg-emerald-50 dark:bg-slate-800 dark:hover:bg-emerald-950/40 text-slate-600 hover:text-emerald-700 dark:text-slate-300 dark:hover:text-emerald-300 border border-slate-200/80 hover:border-emerald-300 dark:border-slate-700 dark:hover:border-emerald-700 transition cursor-pointer"
                        >
                          <Plus className="w-2.5 h-2.5 shrink-0 opacity-70" />
                          <span>{preset}</span>
                        </button>
                      ))}
                    </div>
                  );
                })()}
                <div className="space-y-2 max-h-40 overflow-y-auto border border-slate-200/60 p-3 rounded-xl bg-slate-50/50">
                  {formAttributes.length > 0 ? (
                    formAttributes.map((attr, index) => {
                      const suggestedKeys = CATEGORY_SUGGESTED_ATTRIBUTES[formProductType] || [];
                      const isCustom = attr.key && !suggestedKeys.includes(attr.key);
                      const showCustomInput = isCustom || attr.key === '__custom_editing__' || suggestedKeys.length === 0;

                      return (
                        <div key={index} className="flex items-center space-x-2">
                          {showCustomInput ? (
                            <div className="w-1/3 flex items-center space-x-1">
                              <input
                                type="text"
                                value={attr.key === '__custom_editing__' ? '' : attr.key}
                                placeholder="Custom Key"
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setFormAttributes(prev => prev.map((a, i) => i === index ? { ...a, key: val } : a));
                                }}
                                className="w-full bg-white border border-slate-200 rounded-lg py-1 px-2.5 text-xs text-slate-800 focus:outline-none"
                              />
                              {suggestedKeys.length > 0 && (
                                <button
                                  type="button"
                                  title="Back to suggestions"
                                  onClick={() => {
                                    setFormAttributes(prev => prev.map((a, i) => i === index ? { ...a, key: '' } : a));
                                  }}
                                  className="text-[10px] text-blue-500 hover:text-blue-700 font-semibold px-1"
                                >
                                  List
                                </button>
                              )}
                            </div>
                          ) : (
                            <select
                              value={attr.key}
                              onChange={(e) => {
                                freshSelectKey: {
                                  const val = e.target.value;
                                  if (val === '__custom__') {
                                    setFormAttributes(prev => prev.map((a, i) => i === index ? { ...a, key: '__custom_editing__' } : a));
                                  } else {
                                    setFormAttributes(prev => prev.map((a, i) => i === index ? { ...a, key: val } : a));
                                  }
                                }
                              }}
                              className="w-1/3 bg-white border border-slate-200 rounded-lg py-1 px-2 text-xs text-slate-800 focus:outline-none"
                            >
                              <option value="">Select Key...</option>
                              {suggestedKeys.map((k) => (
                                <option key={k} value={k}>{k}</option>
                              ))}
                              <option value="__custom__">+ Custom Key...</option>
                            </select>
                          )}
                          <input
                            type="text"
                            value={attr.value}
                            placeholder="Value (e.g. 1000L)"
                            onChange={(e) => {
                              const val = e.target.value;
                              setFormAttributes(prev => prev.map((a, i) => i === index ? { ...a, value: val } : a));
                            }}
                            className="w-2/3 bg-white border border-slate-200 rounded-lg py-1 px-2.5 text-xs text-slate-800 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => setFormAttributes(prev => prev.filter((_, i) => i !== index))}
                            className="p-1 hover:bg-rose-50 rounded-lg text-slate-400 hover:text-rose-600 transition"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-center text-slate-400 text-xs py-2">No specification attributes defined.</p>
                  )}
                </div>
              </div>

              {/* Standard Unit & 2-Column Pricing Grid */}
              <div className="space-y-4 font-sans">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-widest font-bold">
                      Standard Unit *
                    </label>
                    {!isCreatingUnit && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsCreatingUnit(true);
                          setNewUnitInput('');
                        }}
                        className="text-[10px] text-blue-600 hover:text-blue-700 font-bold flex items-center space-x-0.5 cursor-pointer hover:underline"
                      >
                        <Plus className="w-3 h-3" />
                        <span>New</span>
                      </button>
                    )}
                  </div>
                  {isCreatingUnit ? (
                    <div className="flex items-center space-x-1.5">
                      <input
                        type="text"
                        autoFocus
                        value={newUnitInput}
                        onChange={(e) => setNewUnitInput(e.target.value)}
                        placeholder="e.g. Barrel, Box..."
                        className="w-full bg-white border border-blue-400 rounded-xl py-1.5 px-3 text-xs text-slate-800 focus:outline-none"
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
                        className="px-2.5 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 shrink-0 cursor-pointer"
                      >
                        Add
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsCreatingUnit(false)}
                        className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 shrink-0 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
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
                      className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
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

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-widest mb-1 font-bold">
                      Standard Selling Price (AED)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={formUnitPrice !== undefined ? formUnitPrice : ''}
                      onChange={(e) => setFormUnitPrice(e.target.value !== '' ? Number(e.target.value) : undefined)}
                      className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500/20 font-mono"
                      placeholder="0.00"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-widest mb-1 font-bold">
                      Base Cost Price (AED)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={formCostPrice !== undefined ? formCostPrice : ''}
                      onChange={(e) => setFormCostPrice(e.target.value !== '' ? Number(e.target.value) : undefined)}
                      className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500/20 font-mono"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </div>

              {/* Warehouse Inventory Tracking Section */}
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3 font-sans">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2.5">
                      <Boxes className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                      <div>
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                          Track Warehouse Stock
                        </span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          Maintain live stock-on-hand count, reorder warnings, and storage bay locations.
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
                      <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 border-t border-slate-200/60 dark:border-slate-700/40 pt-2">
                    Track physical inventory counts. Leave unchecked for job-procured equipment, drop-ship orders, or site services.
                  </p>
                </div>

                {formIsInventoried && (
                  <div className="p-3.5 rounded-xl border border-blue-100 dark:border-blue-900/40 bg-blue-50/40 dark:bg-blue-950/20 space-y-3 animate-in fade-in duration-150">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-mono text-slate-500 uppercase tracking-widest mb-1 font-bold">
                          On-Hand Quantity *
                        </label>
                        <input
                          type="number"
                          min={0}
                          step="any"
                          value={formStockOnHand !== undefined ? formStockOnHand : 0}
                          onChange={(e) => setFormStockOnHand(e.target.value !== '' ? Number(e.target.value) : 0)}
                          className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:border-blue-500 rounded-xl py-2 px-3 text-xs text-slate-800 dark:text-slate-200 font-mono focus:outline-none"
                          placeholder="0"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-mono text-slate-500 uppercase tracking-widest mb-1 font-bold">
                          Low Stock Alert Threshold
                        </label>
                        <input
                          type="number"
                          min={0}
                          step="any"
                          value={formReorderLevel !== undefined ? formReorderLevel : 0}
                          onChange={(e) => setFormReorderLevel(e.target.value !== '' ? Number(e.target.value) : 0)}
                          className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:border-blue-500 rounded-xl py-2 px-3 text-xs text-slate-800 dark:text-slate-200 font-mono focus:outline-none"
                          placeholder="0"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-mono text-slate-500 uppercase tracking-widest mb-1 font-bold">
                        Storage Bay / Bin Location
                      </label>
                      <input
                        type="text"
                        value={formStorageLocation}
                        onChange={(e) => setFormStorageLocation(e.target.value)}
                        className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:border-blue-500 rounded-xl py-2 px-3 text-xs text-slate-800 dark:text-slate-200 focus:outline-none font-mono"
                        placeholder="e.g. WH-1 / Bay 4 / Shelf B"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Optional Logistics & Customs Section */}
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3 font-sans">
                <span className="block text-[10px] font-mono text-slate-400 uppercase tracking-widest font-bold">
                  Logistics & Customs (Optional)
                </span>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-mono text-slate-500 uppercase tracking-widest mb-1">
                      HS Tariff Code
                    </label>
                    <input
                      type="text"
                      value={formHsCode}
                      onChange={(e) => setFormHsCode(e.target.value)}
                      className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:border-blue-500 rounded-xl py-2 px-3 text-xs text-slate-800 dark:text-slate-200 focus:outline-none font-mono"
                      placeholder="e.g. 8421.21.00"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono text-slate-500 uppercase tracking-widest mb-1">
                      Country of Origin
                    </label>
                    <input
                      type="text"
                      value={formCountryOfOrigin}
                      onChange={(e) => setFormCountryOfOrigin(e.target.value)}
                      className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:border-blue-500 rounded-xl py-2 px-3 text-xs text-slate-800 dark:text-slate-200 focus:outline-none"
                      placeholder="e.g. United States, Germany"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-mono text-slate-500 uppercase tracking-widest mb-1">
                    Gross Weight (kg)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={formGrossWeightKg !== undefined ? formGrossWeightKg : ''}
                    onChange={(e) => setFormGrossWeightKg(e.target.value !== '' ? Number(e.target.value) : undefined)}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:border-blue-500 rounded-xl py-2 px-3 text-xs text-slate-800 dark:text-slate-200 focus:outline-none font-mono"
                    placeholder="e.g. 15.5"
                  />
                </div>
              </div>
            </div>

            {/* Pinned Modal Footer */}
            <div className="p-4 px-6 border-t border-slate-100 bg-slate-50/60 rounded-b-2xl flex items-center justify-end space-x-3 shrink-0">
              <button
                type="button"
                onClick={() => setShowFormModal(false)}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-100 text-slate-600 font-semibold rounded-xl text-xs transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !activeWorkspace?.id}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold rounded-xl text-xs transition shadow-xs flex items-center justify-center space-x-1.5 cursor-pointer disabled:cursor-not-allowed"
              >
                {isSubmitting && <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                <span>{isSubmitting ? 'Saving...' : editingProduct ? 'Save Changes' : 'Register Product'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Confirmation Dialog overlay */}
      {confirmDialog.isOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-6 overflow-hidden">
            <h3 className="text-lg font-bold text-slate-900 font-sans mb-2">{confirmDialog.title}</h3>
            <p className="text-sm text-slate-500 font-sans mb-6">{confirmDialog.message}</p>
            <div className="flex items-center justify-end space-x-3">
              <button
                type="button"
                onClick={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
                className="py-2 px-4 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 transition"
              >
                {confirmDialog.cancelText || 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => {
                  confirmDialog.onConfirm();
                  setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
                }}
                className={`py-2 px-4 rounded-xl text-xs font-bold text-white transition ${
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
            {/* Modal Header */}
            <div className="p-5 px-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50/50 dark:bg-slate-950/50">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-xl border border-emerald-100 dark:border-emerald-900/40">
                  <ArrowDownToLine className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white font-sans">
                      Inbound Goods Receipt Note (GRN)
                    </h3>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      {activeWorkspace?.name || 'Default'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-sans mt-0.5">
                    Receive vendor shipment into warehouse stock and write immutable audit movement.
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

            {/* Modal Body / Form */}
            <form onSubmit={handleSubmitGrn} className="flex flex-col flex-1 overflow-hidden">
              <div className="p-6 space-y-4 overflow-y-auto flex-1 font-sans">
                {grnFeedback && (
                  <div
                    className={`p-3.5 rounded-xl border flex items-start space-x-2.5 text-xs font-medium ${
                      grnFeedback.type === 'success'
                        ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                        : 'bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                    }`}
                  >
                    {grnFeedback.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
                    )}
                    <span className="flex-1">{grnFeedback.message}</span>
                  </div>
                )}

                {/* Intake Reference & Date */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      GRN Reference Number <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={grnNumber}
                      onChange={(e) => setGrnNumber(e.target.value)}
                      placeholder="e.g. GRN-2026-1001"
                      className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:border-blue-500 rounded-xl py-2 px-3 text-xs font-mono font-semibold text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Received Date <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={grnDate}
                      onChange={(e) => setGrnDate(e.target.value)}
                      className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:border-blue-500 rounded-xl py-2 px-3 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none transition"
                    />
                  </div>
                </div>

                {/* Product Selection */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Physical Inventory Item <span className="text-rose-500">*</span>
                  </label>
                  {inventoriedProducts.length === 0 ? (
                    <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-xl text-xs text-amber-800 dark:text-amber-300 flex items-center space-x-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>No inventoried products found. Edit a catalog product and toggle on <strong>"Track Inventory & Physical Stock"</strong> before receiving stock.</span>
                    </div>
                  ) : (
                    <select
                      required
                      value={grnProductId}
                      onChange={(e) => handleGrnProductChange(e.target.value)}
                      className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:border-blue-500 rounded-xl py-2 px-3 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none transition cursor-pointer"
                    >
                      <option value="">-- Select Inventoried Product --</option>
                      {inventoriedProducts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} {p.sku ? `(SKU: ${p.sku})` : ''} — On Hand: {p.stock_on_hand || 0} {p.unit || ''}
                        </option>
                      ))}
                    </select>
                  )}

                  {/* Selected Product Snapshot Card */}
                  {selectedGrnProduct && (
                    <div className="mt-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div>
                        <span className="block text-[10px] text-slate-400 font-mono uppercase">On Hand</span>
                        <span className="font-bold text-slate-800 dark:text-slate-100">{selectedGrnProduct.stock_on_hand || 0} {selectedGrnProduct.unit}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-slate-400 font-mono uppercase">Reserved</span>
                        <span className="font-bold text-amber-600 dark:text-amber-400">{selectedGrnProduct.stock_reserved || 0} {selectedGrnProduct.unit}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-slate-400 font-mono uppercase">Available</span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">
                          {Math.max(0, (selectedGrnProduct.stock_on_hand || 0) - (selectedGrnProduct.stock_reserved || 0))} {selectedGrnProduct.unit}
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
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Quantity Received <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      required
                      value={grnQuantity}
                      onChange={(e) => setGrnQuantity(e.target.value)}
                      placeholder="e.g. 50"
                      className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:border-blue-500 rounded-xl py-2 px-3 text-xs font-semibold font-mono text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Landed Unit Cost (AED)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={grnUnitCost}
                      onChange={(e) => setGrnUnitCost(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:border-blue-500 rounded-xl py-2 px-3 text-xs font-semibold font-mono text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none transition"
                    />
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-col justify-center">
                    <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">Total Receipt Value</span>
                    <span className="text-sm font-bold font-mono text-slate-900 dark:text-white">
                      AED {((Number(grnQuantity) || 0) * (Number(grnUnitCost) || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                {/* Checkbox for cost price sync */}
                <div className="flex items-center space-x-2.5 pt-1">
                  <input
                    type="checkbox"
                    id="grnUpdateCost"
                    checked={grnUpdateCost}
                    onChange={(e) => setGrnUpdateCost(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer"
                  />
                  <label htmlFor="grnUpdateCost" className="text-xs text-slate-600 dark:text-slate-300 cursor-pointer select-none">
                    Update product catalog standard cost price to this unit cost ({Number(grnUnitCost) > 0 ? `AED ${Number(grnUnitCost).toFixed(2)}` : 'Current'})
                  </label>
                </div>

                {/* Supplier & Delivery Note */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Supplier / Vendor
                    </label>
                    <input
                      type="text"
                      list="grn-supplier-list"
                      value={grnSupplierName}
                      onChange={(e) => {
                        const val = e.target.value;
                        setGrnSupplierName(val);
                        const match = companies?.find((c) => (c.display_name || c.canonical_name).toLowerCase() === val.toLowerCase());
                        if (match) {
                          setGrnSupplierId(match.id || '');
                        } else {
                          setGrnSupplierId('');
                        }
                      }}
                      placeholder="e.g. Acme Industrial Supplies"
                      className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:border-blue-500 rounded-xl py-2 px-3 text-xs font-semibold text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none transition"
                    />
                    <datalist id="grn-supplier-list">
                      {companies?.map((c) => (
                        <option key={c.id} value={c.display_name || c.canonical_name} />
                      ))}
                    </datalist>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Delivery Note / PO Ref
                    </label>
                    <input
                      type="text"
                      value={grnDeliveryNote}
                      onChange={(e) => setGrnDeliveryNote(e.target.value)}
                      placeholder="e.g. DN-88192 or PO-2026-44"
                      className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:border-blue-500 rounded-xl py-2 px-3 text-xs font-semibold text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none transition"
                    />
                  </div>
                </div>

                {/* Storage Location */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Warehouse Bin / Storage Location
                  </label>
                  <input
                    type="text"
                    value={grnStorageLocation}
                    onChange={(e) => setGrnStorageLocation(e.target.value)}
                    placeholder="e.g. Rack B-03, Warehouse 1, Floor Bay"
                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:border-blue-500 rounded-xl py-2 px-3 text-xs font-semibold text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none transition"
                  />
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Receiving Notes & Inspection Remarks
                  </label>
                  <textarea
                    rows={2}
                    value={grnNotes}
                    onChange={(e) => setGrnNotes(e.target.value)}
                    placeholder="Optional receiving remarks, carton conditions, lot numbers..."
                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:border-blue-500 rounded-xl py-2 px-3 text-xs font-medium text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none transition resize-none"
                  />
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-4 px-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60 rounded-b-2xl flex items-center justify-end space-x-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowGrnModal(false)}
                  className="px-4 py-2 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold rounded-xl text-xs transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={grnSubmitting || inventoriedProducts.length === 0}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-bold rounded-xl text-xs transition shadow-xs flex items-center justify-center space-x-1.5 cursor-pointer disabled:cursor-not-allowed"
                >
                  {grnSubmitting ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Processing GRN...</span>
                    </>
                  ) : (
                    <>
                      <ArrowDownToLine className="w-4 h-4" />
                      <span>Confirm & Receive Stock</span>
                    </>
                  )}
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
            {/* Modal Header */}
            <div className="p-5 px-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50/50 dark:bg-slate-950/50">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-xl border border-blue-100 dark:border-blue-900/40">
                  <History className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white font-sans">
                      Inventory Stock Movement Ledger & Audit Log
                    </h3>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      {movements.length} Records
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-sans mt-0.5">
                    Immutable physical inventory transaction audit trail for receipts, reservations, and dispatch deductions.
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

            {/* Filter Bar */}
            <div className="p-4 px-6 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 grid grid-cols-1 sm:grid-cols-12 gap-3 shrink-0">
              <div className="sm:col-span-8 relative flex items-center">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Filter by product name, GRN / Ref #, supplier..."
                  value={movementsSearch}
                  onChange={(e) => setMovementsSearch(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2 pl-10 pr-4 text-xs font-semibold text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 transition"
                />
              </div>

              <div className="sm:col-span-4 relative flex items-center">
                <select
                  value={movementsTypeFilter}
                  onChange={(e) => setMovementsTypeFilter(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-blue-500 transition cursor-pointer"
                >
                  <option value="All">All Movement Types</option>
                  <option value="STOCK_IN">Stock In (GRN Receipts)</option>
                  <option value="STOCK_OUT">Stock Out (Dispatches)</option>
                  <option value="STOCK_RESERVE">Stock Reserved</option>
                  <option value="STOCK_RELEASE">Stock Released</option>
                  <option value="ADJUSTMENT">Adjustments</option>
                </select>
              </div>
            </div>

            {/* Movements Table */}
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
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500 dark:text-slate-400 select-none bg-slate-50/60 dark:bg-slate-950/60 sticky top-0 z-10 backdrop-blur-xs">
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
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredMovements.map((m) => {
                      const isStockIn = m.movement_type === 'STOCK_IN';
                      const isStockOut = m.movement_type === 'STOCK_OUT';
                      const isReserve = m.movement_type === 'STOCK_RESERVE';
                      const isRelease = m.movement_type === 'STOCK_RELEASE';

                      return (
                        <tr key={m.id || `${m.product_id}-${m.created_at}`} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition">
                          <td className="py-3 px-4 text-slate-500 dark:text-slate-400 font-mono whitespace-nowrap">
                            {m.created_at ? new Date(m.created_at).toLocaleDateString() : '—'}
                            <span className="block text-[10px] text-slate-400">
                              {m.created_at ? new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                            </span>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider inline-flex items-center space-x-1 ${
                                isStockIn
                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                  : isStockOut
                                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                                  : isReserve
                                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                  : isRelease
                                  ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300'
                                  : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                              }`}
                            >
                              <span>{m.movement_type.replace('_', ' ')}</span>
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                            {m.reference_number || m.reference_id || '—'}
                            {m.delivery_note_ref && (
                              <span className="block text-[10px] text-slate-400 font-normal">
                                DN: {m.delivery_note_ref}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-slate-900 dark:text-white font-medium max-w-[180px] truncate" title={m.product_name}>
                            {m.product_name}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold whitespace-nowrap">
                            <span className={isStockIn ? 'text-emerald-600 dark:text-emerald-400' : isStockOut ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-300'}>
                              {isStockIn ? `+${m.quantity}` : isStockOut ? `-${m.quantity}` : m.quantity}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center font-mono text-slate-500 whitespace-nowrap">
                            <span className="text-slate-400">{m.previous_on_hand}</span>
                            <span className="mx-1 text-slate-300 dark:text-slate-600">→</span>
                            <span className="font-bold text-slate-800 dark:text-slate-200">{m.new_on_hand}</span>
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                            {m.total_cost !== undefined && m.total_cost > 0
                              ? `AED ${m.total_cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                              : m.unit_cost !== undefined && m.unit_cost > 0
                              ? `AED ${(m.unit_cost * m.quantity).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                              : '—'}
                          </td>
                          <td className="py-3 px-4 text-slate-500 dark:text-slate-400 max-w-[160px] truncate" title={m.reason_notes || m.supplier_name}>
                            <span className="font-medium text-slate-700 dark:text-slate-200 block truncate">
                              {m.supplier_name || m.reference_type || 'Internal'}
                            </span>
                            {m.reason_notes && (
                              <span className="text-[10px] text-slate-400 block truncate">
                                {m.reason_notes}
                              </span>
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

            {/* Modal Footer */}
            <div className="p-4 px-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60 rounded-b-2xl flex items-center justify-between shrink-0">
              <span className="text-xs text-slate-400">
                Displaying {filteredMovements.length} of {movements.length} total movement records
              </span>
              <button
                type="button"
                onClick={() => setShowLedgerModal(false)}
                className="px-4 py-2 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold rounded-xl text-xs transition cursor-pointer"
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
