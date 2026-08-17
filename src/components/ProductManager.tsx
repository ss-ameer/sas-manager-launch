import React, { useState } from 'react';
import { Product, ProductType, UnitType, ProductAttribute, CATEGORY_SUGGESTED_ATTRIBUTES, Workspace } from '../types';
import { safeAddDoc, safeUpdateDoc, safeDeleteDoc } from '../firebase';
import { generateProductSearchTerms } from '../utils/defaults';
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
  AlertTriangle,
  ChevronDown
} from 'lucide-react';
import { PageHeader, PageBody, CardPanel } from './layout/UiContainer';

interface ProductManagerProps {
  products: Product[];
  productCategories?: string[];
  units?: string[];
  user: any;
  setProducts?: React.Dispatch<React.SetStateAction<Product[]>>;
  activeWorkspace?: Workspace;
  onOpenMobileMenu?: () => void;
}

export default function ProductManager({ products, productCategories: propCategories, units: propUnits, user, setProducts, activeWorkspace, onOpenMobileMenu }: ProductManagerProps) {
  const [searchInput, setSearchInput] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');

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

  const productCategories: string[] = propCategories && propCategories.length > 0 ? propCategories : [
    'FRP Tanks',
    'FRP Vessels',
    'Pressure Vessels',
    'RO Membranes',
    'RO Housing',
    'Cartridge Filters',
    'Dosing Pumps',
    'MBBR Media',
    'Filter Media',
    'Tube Settler Media',
    'Chemicals',
    'Valves',
    'Frames/Fabrication',
    'Various',
    'Other'
  ];

  const units: string[] = propUnits && propUnits.length > 0 ? propUnits : ['Nos', 'M3', 'MT', 'Set', 'LS', 'Kg'];

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
    setShowFormModal(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!formDescription.trim()) {
      alert('Specification sheet description is required.');
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
      name: formName.trim() || undefined,
      product_type: formProductType,
      description: formDescription.trim(),
      unit: formUnit,
      unit_price: formUnitPrice !== undefined && formUnitPrice > 0 ? formUnitPrice : undefined,
      sku: formSku.trim() || undefined,
      attributes: cleanAttributes,
      search_terms: searchTerms,
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
            setProducts((prev) => prev.filter((prod) => prod.id !== targetId));
          }
          await safeDeleteDoc('products', targetId);
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
      />

      <PageBody maxWidth="max-w-7xl">

      {/* Metrics Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest block">Product Categories</span>
            <span className="text-xl font-bold font-mono text-slate-850 dark:text-white">
              {new Set(products.map((p) => p.product_type)).size} active
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 rounded-xl">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest block">Average Unit Price</span>
            <span className="text-xl font-bold font-mono text-slate-850 dark:text-white">
              AED{' '}
              {(() => {
                const pricedProducts = products.filter(p => p.unit_price !== undefined && p.unit_price > 0);
                return pricedProducts.length > 0
                  ? Math.round(pricedProducts.reduce((sum, p) => sum + (p.unit_price || 0), 0) / pricedProducts.length).toLocaleString()
                  : 0;
              })()}
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
            No products found matching your catalog search criteria.
          </div>
        )}
      </div>

      {/* FORM MODAL: Create or Edit Product */}
      {showFormModal && (
        <div id="product-form-modal" className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveProduct}
            className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg p-8 shadow-2xl relative space-y-6 animate-in fade-in zoom-in-95 duration-150"
          >
            <button
              type="button"
              onClick={() => setShowFormModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="pb-3 border-b border-slate-200">
              <h3 className="text-xl font-bold text-slate-900 font-sans">
                {editingProduct ? 'Edit Catalog Product' : 'Register New Product'}
              </h3>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-widest mb-1 font-bold">
                  Product Name (Optional)
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                  placeholder='e.g. RO Membrane (8" SWC5-LD)'
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-widest mb-1 font-bold">
                    Category *
                  </label>
                  <select
                    value={formProductType}
                    onChange={(e) => setFormProductType(e.target.value as ProductType)}
                    className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                  >
                    {productCategories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
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
                  Specification Sheet Description *
                </label>
                <textarea
                  rows={3}
                  required
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
                                const val = e.target.value;
                                if (val === '__custom__') {
                                  setFormAttributes(prev => prev.map((a, i) => i === index ? { ...a, key: '__custom_editing__' } : a));
                                } else {
                                  setFormAttributes(prev => prev.map((a, i) => i === index ? { ...a, key: val } : a));
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

              <div className="grid grid-cols-2 gap-4 font-sans">
                <div>
                  <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-widest mb-1 font-bold">
                    Standard Unit *
                  </label>
                  <select
                    value={formUnit}
                    onChange={(e) => setFormUnit(e.target.value as UnitType)}
                    className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                  >
                    {units.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-widest mb-1 font-bold">
                    Standard Price (AED, Optional)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={formUnitPrice !== undefined ? formUnitPrice : ''}
                    onChange={(e) => setFormUnitPrice(e.target.value !== '' ? Number(e.target.value) : undefined)}
                    className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500/20 font-mono"
                    placeholder="Custom Price"
                  />
                </div>
              </div>
            </div>

            <div className="flex space-x-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowFormModal(false)}
                className="w-1/2 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-500 font-semibold rounded-xl text-xs transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !activeWorkspace?.id}
                className="w-1/2 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold rounded-xl text-xs transition shadow-sm flex items-center justify-center space-x-1.5"
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
    </PageBody>
  </>
);
}
