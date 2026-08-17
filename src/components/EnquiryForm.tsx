import React, { useState, useEffect } from 'react';
import { PdfViewer } from './PdfViewer';
import { MarqueeLabel } from './MarqueeLabel';
import { Enquiry, Company, Contact, Salesperson, LineItem, Attachment, ProductType, UnitType, EnquirySource, EnquiryStatus, Product, ProductAttribute, CATEGORY_SUGGESTED_ATTRIBUTES, LegalSuffix, DropdownOption, Workspace } from '../types';
import { db } from '../firebase';
import { collection, writeBatch, doc } from 'firebase/firestore';
import { safeAddDoc, safeUpdateDoc, uploadAttachment, uploadAttachmentWithProgress } from '../firebase';
import { BRAND_CONFIG } from '../config';
import DuplicateMatchModal from './DuplicateMatchModal';
import GeminiKeyModal from './GeminiKeyModal';
import { findDuplicateCompany, findDuplicateContact } from '../utils/fuzzyMatch';
import { getUserWorkspaceRole } from '../utils/permissions';
import {
  FileText,
  Building,
  User,
  Plus,
  Trash2,
  Paperclip,
  Check,
  AlertTriangle,
  HelpCircle,
  TrendingUp,
  X,
  FileCheck,
  Search,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Loader2,
  Eye,
  ExternalLink,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  MoreVertical,
  FileSpreadsheet,
  Minimize2,
  Maximize2,
  Copy,
  Tag,
  Calendar,
  DollarSign,
  Layers,
  MapPin,
  Sliders,
  CheckCircle2,
  KeyRound,
  Info,
  UserPlus,
  Pencil
} from 'lucide-react';

// Cache to store generated Blob URLs from Base64 data URLs to prevent memory leaks and multiple allocations
const dataUrlBlobCache = new Map<string, string>();

/**
 * Safely converts Base64 Data URLs to Blob URLs to bypass browser sandbox, iframe, 
 * and target="_blank" about:blank blocking behaviors in modern browsers like Chrome and Opera.
 */
function getSafeBlobUrl(url: string): string {
  if (!url) return '';
  if (!url.startsWith('data:')) return url; // Keep remote URLs unchanged

  const cached = dataUrlBlobCache.get(url);
  if (cached) return cached;

  try {
    const arr = url.split(',');
    const mimeMatch = arr[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : '';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    const blob = new Blob([u8arr], { type: mime });
    const blobUrl = URL.createObjectURL(blob);
    dataUrlBlobCache.set(url, blobUrl);
    return blobUrl;
  } catch (e) {
    console.error("Failed to convert data URL to blob URL:", e);
    return url; // Fallback to raw data URL on any error
  }
}

interface CatalogItem {
  name?: string;
  product_type: ProductType;
  description: string;
  unit: UnitType;
  unit_price_aed?: number;
  lead_time_note?: string;
  attributes?: ProductAttribute[];
}

interface EnquiryFormProps {
  companies: Company[];
  contacts: Contact[];
  salespersons: { id?: string; initials?: string; full_name: string }[];
  products: Product[];
  enquirySources?: string[];
  productCategories?: string[];
  units?: string[];
  enquiryToEdit?: Enquiry | null;
  onClose: () => void;
  user: any;
  nextSn: number;
  triggerToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
  setEnquiries?: React.Dispatch<React.SetStateAction<Enquiry[]>>;
  setCompanies?: React.Dispatch<React.SetStateAction<Company[]>>;
  setContacts?: React.Dispatch<React.SetStateAction<Contact[]>>;
  setAuditLogs?: React.Dispatch<React.SetStateAction<any[]>>;
  setProductCategories?: React.Dispatch<React.SetStateAction<DropdownOption[]>>;
  setSalespersons?: React.Dispatch<React.SetStateAction<Salesperson[]>>;
  activeWorkspace?: Workspace;
  allowUserSalespersonSelection?: boolean;
}

export default function EnquiryForm({
  companies,
  contacts,
  salespersons,
  products,
  enquirySources = [],
  productCategories = [],
  units = [],
  enquiryToEdit,
  onClose,
  user,
  nextSn,
  triggerToast,
  setEnquiries,
  setCompanies,
  setContacts,
  setAuditLogs,
  setProductCategories,
  setSalespersons,
  activeWorkspace,
  allowUserSalespersonSelection = false
}: EnquiryFormProps) {
  const fallbackSources = ['Email', 'Phone', 'WhatsApp', 'Meeting', 'Verbal'];
  const fallbackCategories = [
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
  const fallbackUnits = ['Nos', 'M3', 'MT', 'Set', 'LS', 'Kg'];

  const [extraCategories, setExtraCategories] = useState<string[]>([]);

  const activeSources = enquirySources.length > 0 ? enquirySources : fallbackSources;
  const baseCategories = productCategories.length > 0 ? productCategories : fallbackCategories;
  const activeCategories = Array.from(new Set([...baseCategories, ...extraCategories]));
  const activeUnits = units.length > 0 ? units : fallbackUnits;

  // Sort states for dropdowns
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [categoriesSort, setCategoriesSort] = useState<'default' | 'asc' | 'desc'>('default');
  const [salespersonsSort, setSalespersonsSort] = useState<'default' | 'asc' | 'desc'>('default');
  const [sourcesSort, setSourcesSort] = useState<'default' | 'asc' | 'desc'>('default');
  const [unitsSort, setUnitsSort] = useState<'default' | 'asc' | 'desc'>('default');

  // Sorted list selectors
  const sortedSalespersons = React.useMemo(() => {
    const list = [...salespersons];
    if (salespersonsSort === 'asc') {
      return list.sort((a, b) => a.full_name.localeCompare(b.full_name));
    }
    if (salespersonsSort === 'desc') {
      return list.sort((a, b) => b.full_name.localeCompare(a.full_name));
    }
    return list;
  }, [salespersons, salespersonsSort]);

  const sortedSources = React.useMemo(() => {
    const list = [...activeSources];
    if (sourcesSort === 'asc') {
      return list.sort((a, b) => a.localeCompare(b));
    }
    if (sourcesSort === 'desc') {
      return list.sort((a, b) => b.localeCompare(a));
    }
    return list;
  }, [activeSources, sourcesSort]);

  const sortedCategories = React.useMemo(() => {
    const list = [...activeCategories];
    if (categoriesSort === 'asc') {
      return list.sort((a, b) => a.localeCompare(b));
    }
    if (categoriesSort === 'desc') {
      return list.sort((a, b) => b.localeCompare(a));
    }
    return list;
  }, [activeCategories, categoriesSort]);

  const sortedUnits = React.useMemo(() => {
    const list = [...activeUnits];
    if (unitsSort === 'asc') {
      return list.sort((a, b) => a.localeCompare(b));
    }
    if (unitsSort === 'desc') {
      return list.sort((a, b) => b.localeCompare(a));
    }
    return list;
  }, [activeUnits, unitsSort]);

  // Tiny sort micro-button helper
  const renderSortButton = (
    currentSort: 'default' | 'asc' | 'desc',
    setSort: (val: 'default' | 'asc' | 'desc') => void,
    title: string
  ) => {
    const cycleSort = () => {
      if (currentSort === 'default') setSort('asc');
      else if (currentSort === 'asc') setSort('desc');
      else setSort('default');
    };

    return (
      <button
        type="button"
        onClick={cycleSort}
        className="ml-1 p-0.5 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded transition inline-flex items-center align-middle"
        title={`Change sort order: ${title} (Current: ${currentSort})`}
      >
        {currentSort === 'default' && <ArrowUpDown className="w-3.5 h-3.5" />}
        {currentSort === 'asc' && <ArrowUp className="w-3.5 h-3.5 text-blue-600 font-bold" />}
        {currentSort === 'desc' && <ArrowDown className="w-3.5 h-3.5 text-blue-600 font-bold" />}
      </button>
    );
  };

  // Parent state fields
  const [sn, setSn] = useState(nextSn);
  const [enquiryDate, setEnquiryDate] = useState(new Date().toISOString().split('T')[0]);
  const [salesPerson, setSalesPerson] = useState('');
  const [concernedPersons, setConcernedPersons] = useState<string[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [contactId, setContactId] = useState('');
  const [country, setCountry] = useState('UAE');
  const [projectLocation, setProjectLocation] = useState('');
  const defaultEmailSource = activeSources.find(s => s.toLowerCase().includes('email')) || activeSources[0] || 'Email';
  const [enquirySource, setEnquirySource] = useState<string>(defaultEmailSource);
  const [status, setStatus] = useState<EnquiryStatus>('Active');
  const [quoteRefNo, setQuoteRefNo] = useState('');
  const [projectedOrderDate, setProjectedOrderDate] = useState('');
  const [nextFollowupDate, setNextFollowupDate] = useState('');
  const [isLumpSum, setIsLumpSum] = useState(false);
  const [manualValue, setManualValue] = useState<number>(0);
  const [remarks, setRemarks] = useState('');
  const [invoicePoNo, setInvoicePoNo] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [subject, setSubject] = useState('');
  const [customerReferenceCode, setCustomerReferenceCode] = useState('');
  const [proposalOption, setProposalOption] = useState('');

  // Submit and form sequence states
  const [submitMode, setSubmitMode] = useState<'close' | 'another'>('close');
  const submitModeRef = React.useRef<'close' | 'another'>('close');
  const updateSubmitMode = (mode: 'close' | 'another') => {
    setSubmitMode(mode);
    submitModeRef.current = mode;
  };

  const resetForm = (newSn: number) => {
    setSn(newSn);
    setConcernedPersons([]);
    setCompanyId('');
    setContactId('');
    setCompanySearch('');
    setProjectLocation('');
    setProjectedOrderDate('');
    setNextFollowupDate('');
    setIsLumpSum(false);
    setManualValue(0);
    setRemarks('');
    setInvoicePoNo('');
    setPaymentStatus('');
    setSubject('');
    setCustomerReferenceCode('');
    setProposalOption('');
    setLineItems([]);
    setAttachments([]);
    setParentId(null);
    setRevisionNumber(0);
    setAiConfidence(null);
  };

  // Line items state
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [showCatalogModal, setShowCatalogModal] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogCategory, setCatalogCategory] = useState('All');

  const combinedCatalog = React.useMemo(() => {
    return (products || []).map((p) => ({
      name: p.name || p.product_type,
      product_type: p.product_type,
      description: p.description,
      unit: p.unit,
      unit_price_aed: p.unit_price,
      lead_time_note: (p as any).lead_time_note || (p.sku ? `SKU: ${p.sku}` : undefined),
      attributes: p.attributes || [],
    }));
  }, [products]);

  const filteredCatalog = React.useMemo(() => {
    return combinedCatalog.filter((item) => {
      const matchesSearch = (item.name || '').toLowerCase().includes(catalogSearch.toLowerCase()) ||
                            item.description.toLowerCase().includes(catalogSearch.toLowerCase());
      const matchesCategory = catalogCategory === 'All' || item.product_type === catalogCategory || (catalogCategory === 'Filter Media' && item.product_type === 'Sand Media');
      return matchesSearch && matchesCategory;
    });
  }, [combinedCatalog, catalogSearch, catalogCategory]);

  // Attachments state
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setGeneratingUrl] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [currentUploadingFile, setCurrentUploadingFile] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionStatusText, setExtractionStatusText] = useState('Extracting...');
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [showGeminiKeyModal, setShowGeminiKeyModal] = useState(false);
  const [aiConfidence, setAiConfidence] = useState<{
    company_name?: 'high' | 'medium' | 'low';
    contact_name?: 'high' | 'medium' | 'low';
    project_location?: 'high' | 'medium' | 'low';
    line_items?: 'high' | 'medium' | 'low';
  } | null>(null);

  // Document preview states
  const [activePreviewUrl, setActivePreviewUrl] = useState<string | null>(null);
  const [previewFileName, setPreviewFileName] = useState<string>('');
  const [previewFileType, setPreviewFileType] = useState<string>('application/pdf');

  // Smart Paste Text Preview & Layout Sizing states
  const [pastedSourceText, setPastedSourceText] = useState<string | null>(null);
  const [pastedExtractedData, setPastedExtractedData] = useState<any | null>(null);
  const [previewMinimized, setPreviewMinimized] = useState<boolean>(false);
  const [highlightedField, setHighlightedField] = useState<string | null>(null);
  const [glowingField, setGlowingField] = useState<string | null>(null);

  // Custom Quote Ref flag to prevent auto-calculation override bug
  const [isQuoteRefCustom, setIsQuoteRefCustom] = useState<boolean>(false);

  // Multi-level Hierarchical Token Expansion for Line Items
  const [expandedLineItemsToken, setExpandedLineItemsToken] = useState<boolean>(false);
  const [expandedItemIndices, setExpandedItemIndices] = useState<number[]>([]);

  // Modal state for Confirm Entity Registration
  const [showConfirmRegistrationModal, setShowConfirmRegistrationModal] = useState<boolean>(false);

  // Custom Project Specifications & Details (Key-Value pairs)
  const [parentId, setParentId] = useState<string | null>(enquiryToEdit?.parent_id ?? null);
  const [revisionNumber, setRevisionNumber] = useState<number>(
    typeof enquiryToEdit?.revision_number === 'number'
      ? enquiryToEdit.revision_number
      : (enquiryToEdit?.parent_id ? 1 : 0)
  );
  const [customProjectDetails, setCustomProjectDetails] = useState<Array<{ key: string; value: string }>>([
    { key: 'Consultant', value: '' },
    { key: 'Main Contractor', value: '' }
  ]);

  // Detected Unregistered Entities State (Company, Contact, Sales Person)
  const [unregisteredEntities, setUnregisteredEntities] = useState<{
    companyName?: string;
    legalSuffix?: string;
    city?: string;
    country?: string;
    contactName?: string;
    contactEmail?: string;
    contactMobile?: string;
    generalPhone?: string;
    generalEmail?: string;
    salespersonName?: string;
    emailDestination: 'contact' | 'company';
    phoneDestination: 'contact' | 'company';
  } | null>(null);

  // Global keyboard paste listener (Ctrl+V / Cmd+V anywhere on form for instant autofill)
  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      // Don't intercept if user is typing in an active input, textarea, or contentEditable
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      const pastedText = e.clipboardData?.getData('text');
      if (pastedText && pastedText.trim().length > 10) {
        e.preventDefault();
        handleExtractFromRawText(pastedText);
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => {
      window.removeEventListener('paste', handleGlobalPaste);
    };
  }, []);
  const scrollToField = (fieldKey: string) => {
    setHighlightedField(fieldKey);
    setGlowingField(fieldKey);

    const idMap: Record<string, string> = {
      quote_ref_no: 'field-quote_ref_no',
      company: 'field-company',
      contact: 'field-contact',
      received_date: 'field-received_date',
      location: 'field-location',
      country: 'field-country',
      value: 'field-value',
      line_items: 'field-line_items',
      subject: 'field-subject',
      custom_project_details: 'field-custom_project_details',
      unregistered_entities: 'field-unregistered_entities'
    };

    const targetId = idMap[fieldKey] || `field-${fieldKey}`;
    const el = document.getElementById(targetId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    setTimeout(() => {
      setGlowingField(null);
    }, 2800);
  };

  // Helper for applying visual highlight rings & temporary glow on autofilled fields
  const getHighlightClasses = (field: string) => {
    if (glowingField === field) {
      return 'ring-4 ring-emerald-500/80 bg-emerald-50/90 border-emerald-500 shadow-lg scale-[1.01] transition-all duration-300 animate-pulse';
    }
    if (highlightedField === field) {
      return 'ring-2 ring-emerald-500 bg-emerald-50/50 border-emerald-400 transition-all duration-300 shadow-sm';
    }
    return '';
  };

  // Helper for bi-directional text highlighting in the raw source text preview
  const renderSourceTextWithHighlight = (text: string | null, fieldKey: string | null, data: any) => {
    try {
      if (!text || typeof text !== 'string') return null;
      if (!fieldKey || !data) return text;

      let searchStr: string | null = null;
      if (fieldKey === 'quote_ref_no' && data.quote_ref_no) searchStr = String(data.quote_ref_no);
      else if (fieldKey === 'company' && data.company_name) searchStr = String(data.company_name);
      else if (fieldKey === 'contact' && data.contact_name) searchStr = String(data.contact_name);
      else if (fieldKey === 'received_date' && data.received_date) searchStr = String(data.received_date);
      else if (fieldKey === 'location' && data.project_location) searchStr = String(data.project_location);
      else if (fieldKey === 'country' && data.country) searchStr = String(data.country);
      else if (fieldKey === 'value' && data.package_value) searchStr = String(data.package_value);
      else if (fieldKey === 'subject' && data.subject) searchStr = String(data.subject);
      else if (fieldKey.startsWith('line_item_') && Array.isArray(data.line_items)) {
        const idx = parseInt(fieldKey.replace('line_item_', ''), 10);
        const item = data.line_items[idx];
        if (item) searchStr = item.description || item.product_type;
      } else if (fieldKey === 'line_items' && Array.isArray(data.line_items) && data.line_items[0]) {
        searchStr = data.line_items[0].description || data.line_items[0].product_type;
      }

      if (!searchStr || searchStr.trim().length < 2) return text;

      const cleanSearch = searchStr.trim();
      const escapedSearch = cleanSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      const regex = new RegExp(`(${escapedSearch})`, 'gi');
      const parts = text.split(regex);

      return parts.map((part, i) => {
        if (part.toLowerCase() === cleanSearch.toLowerCase()) {
          return (
            <mark key={i} className="bg-amber-300 text-slate-950 font-bold px-1 rounded shadow-xs underline decoration-amber-600 decoration-2">
              {part}
            </mark>
          );
        }
        return part;
      });
    } catch {
      return text;
    }
  };

  // Auto-detect listener reading clipboard text with graceful fallback
  const handleAutoDetectClipboard = async () => {
    try {
      if (!navigator.clipboard || !navigator.clipboard.readText) {
        setRawTextModalOpen(true);
        if (triggerToast) triggerToast('Clipboard auto-read restricted in preview. Paste text below.', 'info');
        return;
      }
      const text = await navigator.clipboard.readText();
      if (!text || !text.trim()) {
        setRawTextModalOpen(true);
        if (triggerToast) triggerToast('Clipboard is empty. Paste text into the box below.', 'info');
        return;
      }

      if (triggerToast) triggerToast('Reading clipboard text for AI auto-detect...', 'info');
      await handleExtractFromRawText(text);
    } catch (err: any) {
      // Gracefully fall back to the Raw Text Paste Modal when browser permissions block readText
      console.warn('Clipboard read access restricted by permissions policy:', err?.message || err);
      setRawTextModalOpen(true);
      if (triggerToast) triggerToast('Clipboard read blocked by browser policy. Paste text below.', 'info');
    }
  };

  // Robust media type detection combining mimeType and file extension
  const mediaType = React.useMemo<'image' | 'pdf' | 'other'>(() => {
    const name = (previewFileName || '').toLowerCase();
    const mime = (previewFileType || '').toLowerCase();
    if (
      mime.startsWith('image/') ||
      name.endsWith('.png') ||
      name.endsWith('.jpg') ||
      name.endsWith('.jpeg') ||
      name.endsWith('.gif') ||
      name.endsWith('.webp') ||
      name.endsWith('.bmp') ||
      name.endsWith('.svg')
    ) {
      return 'image';
    }
    if (
      mime === 'application/pdf' ||
      name.endsWith('.pdf')
    ) {
      return 'pdf';
    }
    return 'other';
  }, [previewFileName, previewFileType]);

  // Admin New Product Category states
  const [newCategoryModal, setNewCategoryModal] = useState(false);
  const [companyMenuOpen, setCompanyMenuOpen] = useState(false);
  const [contactMenuOpen, setContactMenuOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [submittingCategory, setSubmittingCategory] = useState(false);
  const [initiatingLineItemIndex, setInitiatingLineItemIndex] = useState<number | null>(null);

  // Status text ticker for AI extraction phase
  useEffect(() => {
    if (!isExtracting) {
      setExtractionStatusText('Extracting...');
      return;
    }
    const stages = [
      "Analyzing document structure...",
      "Extracting text details with Gemini...",
      "Resolving companies and contacts...",
      "Decoding product categories and line items...",
      "Calibrating field confidence levels...",
      "Performing multi-tier fuzzy matching...",
      "Parsing commercial terms & currencies...",
      "Still processing, finalizing results..."
    ];
    let index = 0;
    setExtractionStatusText(stages[0]);
    const interval = setInterval(() => {
      index = (index + 1) % stages.length;
      setExtractionStatusText(stages[index]);
    }, 2500);
    return () => clearInterval(interval);
  }, [isExtracting]);

  // Client-side image downsampler to compress image attachments to sub-200KB JPEG
  const downsampleImage = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = URL.createObjectURL(blob);
      img.onload = () => {
        URL.revokeObjectURL(img.src);
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const MAX_DIM = 1200; // Optimal resolution for Gemini OCR
        if (width > MAX_DIM || height > MAX_DIM) {
          if (width > height) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          } else {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
          const base64 = dataUrl.split(',')[1];
          resolve(base64);
        } else {
          reject(new Error("Could not get canvas context"));
        }
      };
      img.onerror = (err) => reject(err);
    });
  };

  // Search/Fuzzy Company Add state
  const [companySearch, setCompanySearch] = useState('');
  const [showCompanyList, setShowCompanyList] = useState(false);
  const [newCompanyModal, setNewCompanyModal] = useState(false);

  // Raw Excel / Plain text AI paste modal states
  const [rawTextModalOpen, setRawTextModalOpen] = useState(false);
  const [rawTextInput, setRawTextInput] = useState('');

  const SAMPLE_EXCEL_ROW = `2792\t2751-300626AA\tJul-2026\t29/06/2026\tPV\tAquaEnviro Solutions\tMukesh Katara\tmukesh.katara@aquaenvirosolutions.com\t\t+971 55 267 0574\tUAE\tDubai\tEMAIL\tFRP Filter Vessels, Graded Sand Media and Frontal Piping, Fittings, Valve and Frame\t"FRP Filter Vessel
Quantity 05 Nos.

10 Weeks from Order and advance payment

Model 63” x 67” (Dia x Height)
Arrangements 04 Duty + 01 SB
Type Vertical
MOC FRP
Design Pressure 10.5 Bar
Operation Automatic
Accessories 2 x 6” Top and Bottom Distributor, 1 x Vacuum Breaker, 2 x Flange Kits 6”x3”
Manufacturing Standard: Manufactured to USA-ASME Standard
Make Aventura

Special Iron Removal Media DMI65
Quantity 5 Sets - Client Scope

Support Sand Media
Quantity 5 Sets (1300 Kg per Tank)
Sizes: Coarse Sand 1-2mm – 250Kg, Coarse Sand 2-3mm – 250Kg, Gravel 5-10mm – 800Kg
Make Aquafil (UAE)

Automatic Butterfly Valves – 3”
Quantity 15 Nos. (Duty) 4 per Vessel
Make FIP

Automatic Backwash Butterfly Valves – 4”
Quantity 10 Nos. (Duty) 2 per Vessel
Make FIP

MMF Frontal Frame
Quantity 05 Sets (Duty)
Size As per Design, Type Fabricated, MOC MSEP, Main Header 4” uPVC Pipeline Termination, Connections Flanged, Pressure Gauges 15 Nos. - Wika, Make Aventura

PRICE & COMMERCIAL TERMS
Sl. No. Description Qty Unit Price (AED) Total Amount (AED)
1 FRP Filter Vessel 63”x67” Design Pressure: 10.5 Bar Manufactured to USA-ASME Standard Brand: Aventura Ex-Works UAE Basis 05 Nos. 12,500.00 62,500.00
2 Special Iron Removal Media DMI65 (CLIENT SCOPE) 05 Set NA NA
3 Graded Sand Media Ex-Works UAE Basis 05 Set 1,500.00 7,500.00
4 Electric Actuated Butterfly Valves with uPVC Plumbing, Butterfly valves, Pressure Gauges and Frontal Frame MSEP Tubes assembled locally by Aventura 05 Set 23,100.00 115,500.00"\t195,500.00`;

  // Currency of this individual Enquiry (AED or USD)
  const [formCurrency, setFormCurrency] = useState<'AED' | 'USD'>('AED');

  // Sub-modal states for inline Company and Contact creation
  const [showNewContactModal, setShowNewContactModal] = useState(false);
  const [isEditingCompany, setIsEditingCompany] = useState(false);
  const [isEditingContact, setIsEditingContact] = useState(false);
  const [subCompanyName, setSubCompanyName] = useState('');
  const [subLegalSuffix, setSubLegalSuffix] = useState('LLC');
  const [subCountry, setSubCountry] = useState('UAE');
  const [subCity, setSubCity] = useState('');
  const [subGeneralPhone, setSubGeneralPhone] = useState('');
  const [subGeneralEmail, setSubGeneralEmail] = useState('');
  const [subNotes, setSubNotes] = useState('');

  const [subContactName, setSubContactName] = useState('');
  const [subContactDesignation, setSubContactDesignation] = useState('');
  const [subContactMobile, setSubContactMobile] = useState('');
  const [subContactEmail, setSubContactEmail] = useState('');
  const [subContactIsPrimary, setSubContactIsPrimary] = useState(false);

  // Fuzzy matches duplicate matches state inside form
  const [duplicateWarning, setDuplicateWarning] = useState<Company | null>(null);

  // Contact list filtered by company
  const companyContacts = contacts.filter((c) => c.company_id === companyId);

  // Auto-calculate suggested Quote Ref: {sn}-{DDMMYY} (only if not custom/extracted by AI)
  useEffect(() => {
    if (enquiryDate && sn && !enquiryToEdit && !isQuoteRefCustom) {
      const parts = enquiryDate.split('-'); // [YYYY, MM, DD]
      if (parts.length === 3) {
        const formattedDate = `${parts[2]}${parts[1]}${parts[0].slice(2)}`; // DDMMYY
        setQuoteRefNo(`${sn}-${formattedDate}`);
      }
    }
  }, [enquiryDate, sn, enquiryToEdit, isQuoteRefCustom]);

  // Load edit values
  useEffect(() => {
    if (enquiryToEdit) {
      setSn(enquiryToEdit.sn);
      setEnquiryDate(enquiryToEdit.enquiry_date);
      setSalesPerson(enquiryToEdit.sales_person_id || enquiryToEdit.sales_person || '');
      setConcernedPersons(enquiryToEdit.concerned_persons || (enquiryToEdit.concerned_person ? [enquiryToEdit.concerned_person] : []));
      setCompanyId(enquiryToEdit.company_id);
      setContactId(enquiryToEdit.contact_id || '');
      setCountry(enquiryToEdit.country);
      setProjectLocation(enquiryToEdit.project_location);
      setEnquirySource(e_src_fallback(enquiryToEdit.enquiry_source));
      setStatus(enquiryToEdit.status);
      setQuoteRefNo(enquiryToEdit.quote_ref_no);
      setProjectedOrderDate(enquiryToEdit.projected_order_date || '');
      setNextFollowupDate(enquiryToEdit.next_followup_date || '');
      const editCurrency = enquiryToEdit.currency || 'AED';
      setFormCurrency(editCurrency);
      setIsLumpSum(enquiryToEdit.is_lump_sum || false);
      setManualValue(editCurrency === 'USD' ? enquiryToEdit.value_aed / 3.6725 : enquiryToEdit.value_aed);
      setRemarks(enquiryToEdit.remarks || '');
      setInvoicePoNo(enquiryToEdit.invoice_po_no || '');
      setPaymentStatus(enquiryToEdit.payment_status || '');
      setSubject(enquiryToEdit.subject || '');
      setCustomerReferenceCode(enquiryToEdit.customer_reference_code || '');
      setProposalOption(enquiryToEdit.proposal_option || '');
      setParentId(enquiryToEdit.parent_id ?? null);
      setRevisionNumber(
        typeof enquiryToEdit.revision_number === 'number'
          ? enquiryToEdit.revision_number
          : (enquiryToEdit.parent_id ? 1 : 0)
      );
      if (enquiryToEdit.custom_project_details) {
        if (Array.isArray(enquiryToEdit.custom_project_details)) {
          setCustomProjectDetails(enquiryToEdit.custom_project_details);
        } else if (typeof enquiryToEdit.custom_project_details === 'object') {
          const arr = Object.entries(enquiryToEdit.custom_project_details).map(([key, value]) => ({ key, value: String(value) }));
          if (arr.length > 0) setCustomProjectDetails(arr);
        }
      }
      const parsedItems = (enquiryToEdit.line_items || []).map(item => ({
        ...item,
        attributes: item.attributes || []
      }));
      setLineItems(parsedItems);
      setAttachments(enquiryToEdit.attachments || []);
      if (enquiryToEdit.attachments && enquiryToEdit.attachments.length > 0) {
        const first = enquiryToEdit.attachments[0];
        setActivePreviewUrl(first.url);
        setPreviewFileName(first.name);
        setPreviewFileType(first.type || 'application/pdf');
      }

      const matchedComp = companies.find((c) => c.id === enquiryToEdit.company_id);
      if (matchedComp) {
        setCompanySearch(matchedComp.display_name);
      }
    } else {
      // Default Salesperson to the first initials/ID in the list
      if (salespersons.length > 0) {
        setSalesPerson(salespersons[0].id || salespersons[0].initials || '');
      }
    }
  }, [enquiryToEdit, companies, salespersons]);

  const e_src_fallback = (val: string): string => {
    return activeSources.includes(val) ? val : (activeSources[0] || 'Email');
  };

  // Auto-sum value calculation
  const computedValue = lineItems.reduce((sum, item) => sum + item.total_price, 0);
  const finalValue = isLumpSum ? manualValue : computedValue;
  const priceDiscrepancyAmount = Math.abs(manualValue - computedValue);

  const handleAddLineItem = () => {
    const suggestions = CATEGORY_SUGGESTED_ATTRIBUTES['Other'] || [];
    const defaultAttributes = suggestions.map(key => ({ key, value: '' }));

    const newItem: LineItem = {
      item_type: 'product',
      product_type: 'Other',
      description: '',
      quantity: 1,
      unit: 'Nos',
      unit_price: 0,
      total_price: 0,
      lead_time_note: '',
      attributes: defaultAttributes
    };
    setLineItems([...lineItems, newItem]);
  };

  const handleAddCatalogItem = (item: CatalogItem) => {
    const rawPrice = item.unit_price_aed !== undefined && item.unit_price_aed > 0
      ? (formCurrency === 'USD' ? item.unit_price_aed / 3.6725 : item.unit_price_aed)
      : 0;
    const price = Math.round(rawPrice * 100) / 100;

    const newItem: LineItem = {
      item_type: 'product',
      product_type: item.product_type,
      description: item.description,
      quantity: 1,
      unit: item.unit,
      unit_price: price,
      total_price: price,
      lead_time_note: item.lead_time_note || '',
      attributes: item.attributes || []
    };

    setLineItems((prev) => [...prev, newItem]);
    setShowCatalogModal(false);
  };

  const handleLineItemChange = (index: number, field: keyof LineItem, val: any) => {
    const updated = [...lineItems];
    const item = { ...updated[index] };

    if (field === 'quantity' || field === 'unit_price') {
      const q = field === 'quantity' ? Number(val) : item.quantity;
      const p = field === 'unit_price' ? Number(val) : item.unit_price;
      item[field] = Number(val) as any;
      item.total_price = Number((q * p).toFixed(2));
    } else if (field === 'total_price') {
      const tot = Number(val);
      item.total_price = tot;
      if (item.quantity > 0) {
        item.unit_price = Number((tot / item.quantity).toFixed(2));
      }
    } else if (field === 'item_type') {
      item.item_type = val;
      if (val === 'charge') {
        item.charge_type = item.charge_type || 'Transportation';
        item.product_type = 'Service / Charge';
      } else if (val === 'discount') {
        item.charge_type = 'Discount';
        item.product_type = 'Service / Charge';
      } else {
        item.charge_type = undefined;
        item.product_type = 'RO Membranes';
      }
    } else if (field === 'charge_type') {
      item.charge_type = val;
      item.product_type = 'Service / Charge';
    } else if (field === 'product_type') {
      item.product_type = val;
      const suggestions = CATEGORY_SUGGESTED_ATTRIBUTES[val] || [];
      item.attributes = suggestions.map(key => ({ key, value: '' }));
    } else {
      item[field] = val as any;
    }

    updated[index] = item;
    setLineItems(updated);
  };

  const handleRemoveLineItem = (index: number) => {
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  // Real File attachment uploading using Firebase Storage with secure Base64 fallback and progress
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setGeneratingUrl(true);
    const uploadedList: Attachment[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setCurrentUploadingFile(file.name);
        setUploadProgress(0);

        // Create unique path under proposals folder in Storage bucket
        const storagePath = `proposals/${Date.now()}_${file.name}`;
        const downloadUrl = await uploadAttachmentWithProgress(file, storagePath, (percent) => {
          setUploadProgress(percent);
        });

        const attachment: Attachment = {
          name: file.name,
          size: file.size,
          type: file.type || 'application/pdf',
          url: downloadUrl,
          uploadedAt: new Date().toISOString()
        };
        uploadedList.push(attachment);
      }
      setAttachments((prev) => {
        const next = [...prev, ...uploadedList];
        if (uploadedList.length > 0) {
          const first = uploadedList[0];
          setActivePreviewUrl(first.url);
          setPreviewFileName(first.name);
          setPreviewFileType(first.type || 'application/pdf');
        }
        return next;
      });
    } catch (err) {
      console.error("Upload error:", err);
      alert("Failed to upload file(s). Please try again.");
    } finally {
      setGeneratingUrl(false);
      setUploadProgress(null);
      setCurrentUploadingFile(null);
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(attachments.filter((_, i) => i !== index));
  };

  // Sorensen-Dice coefficient similarity matching
  const getFuzzySimilarity = (s1: string, s2: string): number => {
    const clean1 = s1.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '');
    const clean2 = s2.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '');
    if (clean1 === clean2) return 1.0;
    if (!clean1 || !clean2) return 0.0;
    if (clean1.includes(clean2) || clean2.includes(clean1)) return 0.85;

    const getBigrams = (str: string) => {
      const bigrams = new Set<string>();
      for (let i = 0; i < str.length - 1; i++) {
        bigrams.add(str.substring(i, i + 2));
      }
      return bigrams;
    };

    const b1 = getBigrams(clean1);
    const b2 = getBigrams(clean2);
    let matches = 0;
    b1.forEach(bg => {
      if (b2.has(bg)) matches++;
    });

    const total = b1.size + b2.size;
    if (total === 0) return 0;
    return (2 * matches) / total;
  };

  // Duplicate Match Dialog State for EnquiryForm registration
  const [duplicateMatchState, setDuplicateMatchState] = useState<{
    isOpen: boolean;
    type: 'company' | 'contact';
    candidateName: string;
    existingRecordName: string;
    matchReason: string;
    similarityScore: number;
    existingDetails?: {
      city?: string;
      country?: string;
      phone?: string;
      email?: string;
    };
    newDetails?: {
      city?: string;
      country?: string;
      phone?: string;
      email?: string;
    };
    onMerge: () => void;
    onKeepNew?: () => void;
    onIgnore: () => void;
  } | null>(null);

  // One-click Confirm & Register Unregistered Entities handler
  const handleConfirmRegisterEntities = async (bypassDuplicateCheck = false) => {
    if (!unregisteredEntities || !unregisteredEntities.companyName) return;

    const compName = unregisteredEntities.companyName.trim();
    const suf = (unregisteredEntities.legalSuffix || 'LLC') as LegalSuffix;
    const display_name = suf === 'None / Other' ? compName : `${compName} ${suf}`;
    const city = unregisteredEntities.city?.trim() || 'Dubai';
    const countryVal = unregisteredEntities.country?.trim() || 'UAE';
    const companyGeneralPhone = unregisteredEntities.phoneDestination === 'company' ? (unregisteredEntities.generalPhone || unregisteredEntities.contactMobile) : undefined;
    const companyGeneralEmail = unregisteredEntities.emailDestination === 'company' ? (unregisteredEntities.generalEmail || unregisteredEntities.contactEmail) : undefined;

    // Fuzzy duplicate check against existing company index
    if (!bypassDuplicateCheck && companies.length > 0) {
      const duplicateCompanyMatch = findDuplicateCompany(display_name, companies);
      if (duplicateCompanyMatch) {
        setDuplicateMatchState({
          isOpen: true,
          type: 'company',
          candidateName: display_name,
          existingRecordName: duplicateCompanyMatch.match.display_name,
          matchReason: duplicateCompanyMatch.reason,
          similarityScore: duplicateCompanyMatch.similarity,
          existingDetails: {
            city: duplicateCompanyMatch.match.city,
            country: duplicateCompanyMatch.match.country,
            phone: duplicateCompanyMatch.match.general_phone,
            email: duplicateCompanyMatch.match.general_email
          },
          newDetails: {
            city,
            country: countryVal,
            phone: companyGeneralPhone,
            email: companyGeneralEmail
          },
          onMerge: () => {
            // MERGE: Select existing company instead of creating new
            setCompanyId(duplicateCompanyMatch.match.id);
            setCompanySearch(duplicateCompanyMatch.match.display_name);
            setCountry(duplicateCompanyMatch.match.country || countryVal);
            setProjectLocation(duplicateCompanyMatch.match.city || city);
            setDuplicateMatchState(null);
            setUnregisteredEntities(null);
            if (triggerToast) {
              triggerToast(`Merged with existing client "${duplicateCompanyMatch.match.display_name}".`, 'info');
            }
          },
          onKeepNew: async () => {
            // KEEP NEW: Overwrite existing company record with new values and select it
            const targetId = duplicateCompanyMatch.match.id;
            if (targetId) {
              const updatedCompany: Partial<Company> = {
                canonical_name: compName,
                display_name,
                legal_suffix: suf,
                city,
                country: countryVal,
                general_phone: companyGeneralPhone,
                general_email: companyGeneralEmail,
              };
              await safeUpdateDoc('companies', targetId, updatedCompany);
              if (setCompanies) {
                setCompanies(prev => prev.map(c => c.id === targetId ? { ...c, ...updatedCompany } : c));
              }
              setCompanyId(targetId);
              setCompanySearch(display_name);
              setCountry(countryVal);
              setProjectLocation(city);
            }
            setDuplicateMatchState(null);
            setUnregisteredEntities(null);
            if (triggerToast) {
              triggerToast(`Updated existing client "${display_name}" with new submission details.`, 'success');
            }
          },
          onIgnore: () => {
            // IGNORE: Proceed with registration bypassing duplicate check
            setDuplicateMatchState(null);
            handleConfirmRegisterEntities(true);
          }
        });
        return;
      }
    }

    if (!activeWorkspace?.id) {
      throw new Error("Critical Error: Active workspace context lost. Cannot save record.");
    }

    try {
      // 1. Create Company account in Firestore catalog
      const newCompPayload = {
        workspace_id: activeWorkspace.id,
        canonical_name: compName,
        display_name,
        aliases: [compName],
        legal_suffix: suf,
        city,
        country: countryVal,
        general_phone: companyGeneralPhone,
        general_email: companyGeneralEmail,
        createdAt: new Date().toISOString()
      };

      const compRef = await safeAddDoc('companies', newCompPayload);
      await logAudit(compRef.id, 'company', 'create', null, newCompPayload, []);

      if (setCompanies) {
        const createdComp: Company = { id: compRef.id, ...newCompPayload };
        setCompanies(prev => [createdComp, ...prev.filter(c => c.id !== compRef.id)]);
      }

      // Update active form company state immediately
      setCompanyId(compRef.id);
      setCompanySearch(display_name);
      setCountry(countryVal);
      setProjectLocation(city);

      // 2. Create Contact Person account in Firestore catalog
      if (unregisteredEntities.contactName && unregisteredEntities.contactName.trim()) {
        const contactEmailVal = unregisteredEntities.emailDestination === 'contact' ? (unregisteredEntities.contactEmail || unregisteredEntities.generalEmail) : undefined;
        const contactMobileVal = unregisteredEntities.phoneDestination === 'contact' ? (unregisteredEntities.contactMobile || unregisteredEntities.generalPhone) : undefined;

        const newContactPayload = {
          workspace_id: activeWorkspace.id,
          company_id: compRef.id,
          full_name: unregisteredEntities.contactName.trim(),
          email: contactEmailVal,
          mobile: contactMobileVal,
          is_primary: true,
          createdAt: new Date().toISOString()
        };

        const contactRef = await safeAddDoc('contacts', newContactPayload);
        await logAudit(contactRef.id, 'contact', 'create', null, newContactPayload, []);

        if (setContacts) {
          const createdContact: Contact = { id: contactRef.id, ...newContactPayload };
          setContacts(prev => [createdContact, ...prev.filter(c => c.id !== contactRef.id)]);
        }

        setContactId(contactRef.id);
      }

      // 3. Register / Assign Salesperson if provided and unassigned
      if (unregisteredEntities.salespersonName) {
        const spName = unregisteredEntities.salespersonName.trim();
        const existingSp = salespersons.find(s => s.full_name.toLowerCase().includes(spName.toLowerCase()));
        if (existingSp) {
          setSalesPerson(existingSp.id || existingSp.initials || existingSp.full_name);
        } else {
          setSalesPerson(spName);
        }
      }

      setUnregisteredEntities(null);

      if (triggerToast) {
        triggerToast(`Successfully registered new company "${display_name}" and contact person!`, 'success');
      }
    } catch (err: any) {
      console.error('Error confirming & registering entities:', err);
      alert('Failed to register new entities: ' + err.message);
    }
  };

  // Helper to apply AI extracted JSON data to state variables
  const applyExtractedData = (data: any) => {
    // Scrub internal salesperson email and phone from client contact fields if extracted
    if (salespersons && salespersons.length > 0) {
      salespersons.forEach((spItem) => {
        const sp = spItem as Salesperson;
        const spEmail = sp.email?.trim().toLowerCase();
        const spPhoneDigits = sp.phone?.replace(/\D/g, '');

        if (spEmail) {
          if (data.contact_email && data.contact_email.trim().toLowerCase() === spEmail) {
            data.contact_email = '';
            if (!data.salesperson) data.salesperson = sp.initials || sp.full_name;
          }
          if (data.email && data.email.trim().toLowerCase() === spEmail) {
            data.email = '';
            if (!data.salesperson) data.salesperson = sp.initials || sp.full_name;
          }
        }

        if (spPhoneDigits && spPhoneDigits.length >= 7) {
          const isPhoneMatch = (val?: string) => {
            if (!val) return false;
            const digits = val.replace(/\D/g, '');
            return digits.length >= 7 && (digits.includes(spPhoneDigits) || spPhoneDigits.includes(digits));
          };

          if (isPhoneMatch(data.contact_phone)) {
            data.contact_phone = '';
            if (!data.salesperson) data.salesperson = sp.initials || sp.full_name;
          }
          if (isPhoneMatch(data.phone)) {
            data.phone = '';
            if (!data.salesperson) data.salesperson = sp.initials || sp.full_name;
          }
          if (isPhoneMatch(data.mobile)) {
            data.mobile = '';
            if (!data.salesperson) data.salesperson = sp.initials || sp.full_name;
          }
        }
      });
    }

    if (data.sn && !isNaN(Number(data.sn))) {
      setSn(Number(data.sn));
    }
    if (data.quote_ref_no) {
      setQuoteRefNo(String(data.quote_ref_no));
      setIsQuoteRefCustom(true);
    }
    if (data.received_date) {
      const dateStr = String(data.received_date).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        setEnquiryDate(dateStr);
      } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
        const parts = dateStr.split('/');
        setEnquiryDate(`${parts[2]}-${parts[1]}-${parts[0]}`);
      } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)) {
        const parts = dateStr.split('/');
        const year = parts[2].length === 5 ? parts[2].slice(0, 4) : parts[2];
        const month = parts[1].padStart(2, '0');
        const day = parts[0].padStart(2, '0');
        setEnquiryDate(`${year}-${month}-${day}`);
      } else {
        setEnquiryDate(dateStr);
      }
    }
    if (data.proposal_option) {
      setProposalOption(String(data.proposal_option));
    }
    if (data.enquiry_source) {
      const matchedSource = activeSources.find(s => s.toLowerCase() === String(data.enquiry_source).toLowerCase());
      if (matchedSource) setEnquirySource(matchedSource);
      else setEnquirySource(String(data.enquiry_source));
    }
    if (data.country) {
      setCountry(String(data.country));
    }
    if (data.project_location) {
      setProjectLocation(String(data.project_location));
    }
    if (data.subject) {
      setSubject(String(data.subject));
    }
    if (data.customer_reference_code) {
      setCustomerReferenceCode(String(data.customer_reference_code));
    }
    if (data.package_value && !isNaN(Number(data.package_value)) && Number(data.package_value) > 0) {
      setManualValue(Number(data.package_value));
      setIsLumpSum(true);
    }
    if (data.salesperson) {
      const matchedSp = salespersons.find(s =>
        s.full_name.toLowerCase().includes(String(data.salesperson).toLowerCase()) ||
        (s.initials && s.initials.toLowerCase() === String(data.salesperson).toLowerCase())
      );
      if (matchedSp) {
        setSalesPerson(matchedSp.id || matchedSp.initials || matchedSp.full_name);
      }
    }
    if (data.remarks) {
      setRemarks(prev => prev ? prev + '\n' + data.remarks : data.remarks);
    }

    // Process custom project specifications / attributes if present
    if (data.custom_project_details && Array.isArray(data.custom_project_details) && data.custom_project_details.length > 0) {
      setCustomProjectDetails(data.custom_project_details);
    } else {
      const extractedSpecs: Array<{ key: string; value: string }> = [];
      if (data.consultant) extractedSpecs.push({ key: 'Consultant', value: String(data.consultant) });
      if (data.main_contractor) extractedSpecs.push({ key: 'Main Contractor', value: String(data.main_contractor) });
      if (data.site_location) extractedSpecs.push({ key: 'Site Location', value: String(data.site_location) });
      if (data.scope_of_work) extractedSpecs.push({ key: 'Scope of Work', value: String(data.scope_of_work) });
      if (extractedSpecs.length > 0) {
        setCustomProjectDetails(extractedSpecs);
      }
    }

    // Autofill company and contact using professional fuzzy matching
    if (data.company_name) {
      let bestCompanyMatch: any = null;
      let highestCompanyScore = 0;

      companies.forEach(c => {
        const names = [c.canonical_name, c.display_name].filter(Boolean) as string[];
        names.forEach(n => {
          const score = getFuzzySimilarity(n, data.company_name);
          if (score > highestCompanyScore) {
            highestCompanyScore = score;
            bestCompanyMatch = c;
          }
        });
      });

      const companyMatched = highestCompanyScore >= 0.55 ? bestCompanyMatch : null;

      if (companyMatched && companyMatched.id) {
        setCompanyId(companyMatched.id);
        setCompanySearch(companyMatched.display_name);
        if (companyMatched.country) setCountry(companyMatched.country);
        if (companyMatched.city) setProjectLocation(companyMatched.city);

        const matchedContacts = contacts.filter(c => c.company_id === companyMatched.id);
        let bestContactMatch: any = null;
        let highestContactScore = 0;

        if (data.contact_name) {
          matchedContacts.forEach(c => {
            const score = getFuzzySimilarity(c.full_name, data.contact_name);
            if (score > highestContactScore) {
              highestContactScore = score;
              bestContactMatch = c;
            }
          });
        }

        const contactMatched = highestContactScore >= 0.55 ? bestContactMatch : (matchedContacts[0] || null);
        if (contactMatched && contactMatched.id) {
          setContactId(contactMatched.id);
        } else if (data.contact_name) {
          // Company matched, but contact is new/unregistered!
          setUnregisteredEntities({
            companyName: companyMatched.display_name,
            legalSuffix: companyMatched.legal_suffix || 'LLC',
            city: companyMatched.city || '',
            country: companyMatched.country || 'UAE',
            contactName: data.contact_name || '',
            contactEmail: data.contact_email || data.email || '',
            contactMobile: data.contact_phone || data.mobile || data.phone || '',
            generalPhone: data.contact_phone || data.phone || '',
            generalEmail: data.contact_email || data.email || '',
            salespersonName: data.salesperson || '',
            emailDestination: 'contact',
            phoneDestination: 'contact'
          });
        }
      } else {
        setSubCompanyName(data.company_name);
        setSubLegalSuffix(data.legal_suffix || 'LLC');
        setSubCountry(data.country || data.project_location || 'UAE');
        setSubCity(data.project_location || '');
        setSubContactName(data.contact_name || '');
        setSubContactEmail(data.contact_email || data.email || '');
        if (data.contact_phone || data.mobile || data.phone) setSubGeneralPhone(data.contact_phone || data.mobile || data.phone);

        setUnregisteredEntities({
          companyName: data.company_name,
          legalSuffix: data.legal_suffix || 'LLC',
          city: data.project_location || '',
          country: data.country || 'UAE',
          contactName: data.contact_name || '',
          contactEmail: data.contact_email || data.email || '',
          contactMobile: data.contact_phone || data.mobile || data.phone || '',
          generalPhone: data.contact_phone || data.phone || '',
          generalEmail: data.contact_email || data.email || '',
          salespersonName: data.salesperson || '',
          emailDestination: 'contact',
          phoneDestination: 'contact'
        });
      }
    }

    if (data.confidence_scores) {
      const scores: any = {};
      Object.keys(data.confidence_scores).forEach(key => {
        let val = data.confidence_scores[key];
        if (typeof val === 'string') {
          val = val.toLowerCase().trim();
          if (val.includes('high')) {
            scores[key] = 'high';
          } else if (val.includes('medium')) {
            scores[key] = 'medium';
          } else {
            scores[key] = 'low';
          }
        } else {
          scores[key] = 'low';
        }
      });
      setAiConfidence(scores);
    }

    if (data.line_items && Array.isArray(data.line_items)) {
      const formattedItems = data.line_items.map((item: any) => {
        const qty = Number(item.quantity) || 1;
        const rawPrice = Number(item.unit_price_aed) || Number(item.unit_price) || Number(item.price) || Number(item.unitPrice) || 0;
        const price = formCurrency === 'USD' ? rawPrice / 3.6725 : rawPrice;

        const extractedArray: ProductAttribute[] = Array.isArray(item.attributes) ? item.attributes : [];
        const extractedKeys = new Set(extractedArray.map(a => a.key.trim().toLowerCase()));

        let productType = item.product_type || 'Other';
        let itemType: 'product' | 'charge' | 'discount' = item.item_type || 'product';
        let chargeType: string | undefined = item.charge_type;

        const descLower = (item.description || '').toLowerCase();
        const prodLower = (item.product_type || '').toLowerCase();

        if (!item.item_type) {
          if (/\b(transport|transportation|freight|shipping|delivery|dispatch|courier|logistics)\b/i.test(descLower) || /\b(transport|freight|delivery)\b/i.test(prodLower)) {
            itemType = 'charge';
            chargeType = 'Transportation';
            productType = 'Service / Charge';
          } else if (/\b(installation|commissioning|testing|erection|labor|labour)\b/i.test(descLower)) {
            itemType = 'charge';
            chargeType = 'Installation';
            productType = 'Service / Charge';
          } else if (/\b(customs|duty|clearance|tax)\b/i.test(descLower)) {
            itemType = 'charge';
            chargeType = 'Customs';
            productType = 'Service / Charge';
          } else if (/\b(discount|rebate|deduction)\b/i.test(descLower)) {
            itemType = 'discount';
            chargeType = 'Discount';
            productType = 'Service / Charge';
          }
        } else if (itemType === 'charge' || itemType === 'discount') {
          productType = 'Service / Charge';
        }

        const suggestedKeys = CATEGORY_SUGGESTED_ATTRIBUTES[productType] || [];
        const mergedAttributes = [...extractedArray];

        suggestedKeys.forEach(suggestedKey => {
          if (!extractedKeys.has(suggestedKey.trim().toLowerCase())) {
            mergedAttributes.push({ key: suggestedKey, value: '' });
          }
        });

        return {
          item_type: itemType,
          charge_type: chargeType,
          product_type: productType,
          description: item.description || '',
          quantity: qty,
          unit: item.unit || 'Pcs',
          unit_price: Number(price.toFixed(2)),
          total_price: Number((qty * price).toFixed(2)),
          attributes: mergedAttributes
        };
      });
      setLineItems(formattedItems);
    }
  };

  // Ultra-fast client-side instant pre-parser for Excel tab-delimited & Email text (<5ms execution)
  const parseInstantSmartTextData = (text: string) => {
    if (!text || typeof text !== 'string') return null;

    try {
      const clean = text.trim();

      // Extract Email
      const emailMatch = clean.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      const extractedEmail = emailMatch ? emailMatch[0] : '';

      // Extract Phone
      const phoneMatch = clean.match(/(?:\+?\d{1,3}[\s-]?)?\(?\d{2,4}\)?[\s-]?\d{3,4}[\s-]?\d{3,4}/);
      const extractedPhone = phoneMatch ? phoneMatch[0] : '';

      // Extract Quote Ref
      const refMatch = clean.match(/([a-zA-Z0-9]+-[a-zA-Z0-9]{5,})/)||(clean.match(/(?:quote|ref|rfq|enquiry)(?:\s*#|\s*no\.?)?:?\s*([a-zA-Z0-9/-]+)/i));
      const extractedQuoteRef = refMatch ? (refMatch[1] || refMatch[0]) : '';

      // Extract Date
      const dateMatch = clean.match(/(\d{1,2}[/-]\d{1,2}[/-]\d{2,5}|\d{4}-\d{2}-\d{2})/);
      let extractedDate = '';
      if (dateMatch) {
        const dStr = dateMatch[1];
        if (dStr.includes('/')) {
          const parts = dStr.split('/');
          if (parts.length === 3) {
            let year = parts[2];
            if (year.length > 4) year = year.slice(-4);
            if (year.length === 2) year = '20' + year;
            extractedDate = `${year}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
          }
        } else {
          extractedDate = dStr;
        }
      }

      // Extract Country & Location
      let extractedLocation = 'Dubai';
      let extractedCountry = 'UAE';
      if (/abu dhabi/i.test(clean)) extractedLocation = 'Abu Dhabi';
      else if (/sharjah/i.test(clean)) extractedLocation = 'Sharjah';
      else if (/ajman/i.test(clean)) extractedLocation = 'Ajman';
      else if (/qatar/i.test(clean)) { extractedCountry = 'Qatar'; extractedLocation = 'Doha'; }
      else if (/saudi|ksa|riyadh|jeddah/i.test(clean)) { extractedCountry = 'Saudi Arabia'; extractedLocation = 'Riyadh'; }

      // Extract Package Value
      let extractedValue: number | null = null;
      const valMatch = clean.match(/(?:total|amount|value|budget|aed|usd)?\s*:?\s*([\d,]{4,}(?:\.\d{2})?)/i);
      if (valMatch) {
        const num = Number(valMatch[1].replace(/,/g, ''));
        if (!isNaN(num) && num > 100) extractedValue = num;
      }

      // Semantic cell parsing if tab-separated or pipe-separated
      let extractedCompany = '';
      let extractedContact = '';
      let salesperson = '';

      if (clean.includes('\t') || clean.includes('|')) {
        const delimiter = clean.includes('\t') ? '\t' : '|';
        const parts = clean.split('\n')[0].split(delimiter).map(p => p.trim());

        // Dynamic token inspection across all cells
        for (let i = 0; i < parts.length; i++) {
          const p = parts[i];
          if (!p) continue;

          // Salesperson initials (2-3 chars uppercase e.g. PV, NS, MK)
          if (!salesperson && /^[A-Z]{2,3}$/.test(p)) {
            salesperson = p;
            continue;
          }

          // Company Name (contains company keywords or legal suffixes)
          if (!extractedCompany && /\b(solutions|llc|fze|fzc|ltd|co\.|trading|est|wll|projects|services|engineering|industries|systems|group|aquaenviro)\b/i.test(p)) {
            extractedCompany = p;
            continue;
          }

          // Contact Name (2 capitalized words, not email, phone, or quote ref)
          if (!extractedContact && /^[A-[Z][a-z]+\s+[A-Z][a-z]+$/.test(p) && p !== extractedCompany && !p.includes('@')) {
            extractedContact = p;
            continue;
          }
        }
      }

      // Fallback Company & Contact parsing if not found in tab cells
      if (!extractedCompany) {
        const companyLineMatch = clean.match(/(?:company|client|customer|for|from):\s*([^\n\r]+)/i);
        if (companyLineMatch) {
          extractedCompany = companyLineMatch[1].trim();
        } else {
          const lines = clean.split(/\r?\n/);
          for (const line of lines) {
            if (/\b(llc|fze|fzc|ltd|co\.|trading|est|wll|projects|solutions|services|engineering|industries)\b/i.test(line)) {
              extractedCompany = line.trim().replace(/^(from|to|for|client|company|customer):\s*/i, '');
              break;
            }
          }
        }
      }

      if (!extractedContact) {
        const contactLineMatch = clean.match(/(?:contact|attn|attention|name|person|mr\.|ms\.|eng\.):\s*([^\n\r]+)/i);
        if (contactLineMatch) {
          extractedContact = contactLineMatch[1].trim();
        } else if (extractedEmail) {
          const emailNamePart = extractedEmail.split('@')[0];
          if (emailNamePart && emailNamePart.includes('.')) {
            extractedContact = emailNamePart.split('.').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
          }
        }
      }

      // Line items intelligent parser
      const lineItemsArr: any[] = [];
      const itemBlocks = clean.split(/(?=(?:FRP Filter|Graded Sand|Butterfly Valves|Media|Vessel|Filter|Piping|Pump|Membrane))/i);

      if (itemBlocks.length > 1) {
        itemBlocks.forEach((block) => {
          const trimmed = block.trim();
          if (trimmed.length < 5) return;

          let productType = 'General';
          if (/frp|vessel/i.test(trimmed)) productType = 'FRP Vessels';
          else if (/media|sand|gravel|pebble|anthracite|garnet/i.test(trimmed)) productType = 'Filter Media';
          else if (/valve/i.test(trimmed)) productType = 'Valves';
          else if (/membrane/i.test(trimmed)) productType = 'RO Membranes';
          else if (/housing|cartridge/i.test(trimmed)) productType = 'Cartridge Filters';

          const qtyMatch = trimmed.match(/(?:quantity|qty|nos\.?|sets?)\s*:?\s*(\d+)/i) || trimmed.match(/(\d+)\s*(?:nos|pcs|set|kg|mtr|lot)/i);
          const qty = qtyMatch ? Number(qtyMatch[1]) : 1;

          const unitMatch = trimmed.match(/(nos|pcs|set|kg|mtr|lot)/i);
          const unit = unitMatch ? (unitMatch[1].charAt(0).toUpperCase() + unitMatch[1].slice(1).toLowerCase()) : 'Nos';

          // Extract key attributes
          const attributes: { key: string; value: string }[] = [];
          const modelMatch = trimmed.match(/model\s*:?\s*([^\n,\r]+)/i);
          if (modelMatch) attributes.push({ key: 'Model', value: modelMatch[1].trim() });

          const makeMatch = trimmed.match(/make\s*:?\s*([^\n,\r]+)/i);
          if (makeMatch) attributes.push({ key: 'Make', value: makeMatch[1].trim() });

          const pressMatch = trimmed.match(/design pressure\s*:?\s*([^\n,\r]+)/i);
          if (pressMatch) attributes.push({ key: 'Design Pressure', value: pressMatch[1].trim() });

          const firstLine = trimmed.split(/\r?\n/)[0].replace(/^["'\s\t]+/, '').slice(0, 100);

          lineItemsArr.push({
            product_type: productType,
            description: firstLine,
            quantity: qty,
            unit: unit === 'Nos' ? 'Nos' : unit === 'Set' ? 'Set' : 'Nos',
            unit_price_aed: 0,
            attributes
          });
        });
      }

      if (lineItemsArr.length === 0) {
        const lines = clean.split(/\r?\n/);
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.length > 5 && (/\d+\s*(nos|pcs|set|kg|mtr|lot|unit)/i.test(trimmed) || /^\d+[\.\)]\s+/.test(trimmed))) {
            lineItemsArr.push({
              product_type: 'General',
              description: trimmed,
              quantity: 1,
              unit: 'Lot',
              unit_price_aed: extractedValue || 0,
              attributes: []
            });
          }
        }
      }

      if (extractedCompany || extractedContact || extractedEmail || extractedQuoteRef || lineItemsArr.length > 0) {
        return {
          sn: null,
          quote_ref_no: extractedQuoteRef,
          received_date: extractedDate || new Date().toISOString().split('T')[0],
          salesperson: salesperson || '',
          company_name: extractedCompany || 'Prospective Client',
          legal_suffix: 'LLC',
          contact_name: extractedContact || '',
          contact_email: extractedEmail || '',
          contact_phone: extractedPhone || '',
          country: extractedCountry,
          project_location: extractedLocation,
          enquiry_source: 'EMAIL',
          package_value: extractedValue,
          line_items: lineItemsArr,
          confidence_scores: { company_name: 'high', contact_name: 'high', project_location: 'high', line_items: 'medium' }
        };
      }
    } catch (e) {
      console.warn('Instant pre-parser exception:', e);
    }
    return null;
  };

  const handleExtractFromRawText = async (textToExtract?: string) => {
    const textContent = textToExtract || rawTextInput;
    if (!textContent || !textContent.trim()) {
      if (triggerToast) triggerToast('Please paste or enter raw text / Excel row data first.', 'error');
      return;
    }

    // 1. Instant client-side heuristic pre-fill (<5ms)
    const instantData = parseInstantSmartTextData(textContent);
    if (instantData) {
      applyExtractedData(instantData);
      setPastedSourceText(textContent);
      setPastedExtractedData(instantData);
      setActivePreviewUrl(null);
      setPreviewMinimized(false);
      setRawTextModalOpen(false);
      if (triggerToast) {
        triggerToast(`Instant Smart Fill applied in <5ms! Refining line items with AI in background...`, 'info');
      }
    }

    setIsExtracting(true);
    setExtractionStatusText('Refining extracted fields with AI...');
    const startTime = Date.now();

    // 10 second fast timeout for text AI refinement so it never freezes
    const textController = new AbortController();
    const textTimeoutId = setTimeout(() => {
      textController.abort();
    }, 10000);

    try {
      const simGeminiHeader = localStorage.getItem('omni_sim_gemini_out_of_tokens') === 'true' ? 'true' : 'false';
      const simLatencyHeader = localStorage.getItem('omni_sim_latency_ms') || '0';
      const userGeminiKey = localStorage.getItem('omni_user_gemini_api_key') || '';

      const res = await fetch('/api/gemini/extract-enquiry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-simulate-gemini-error': simGeminiHeader,
          'x-simulate-latency': simLatencyHeader,
          ...(userGeminiKey ? { 'x-user-gemini-api-key': userGeminiKey } : {})
        },
        signal: textController.signal,
        body: JSON.stringify({
          fileName: 'Pasted_Excel_Row.txt',
          mimeType: 'text/plain',
          content: textContent,
          isBase64: false
        })
      });

      clearTimeout(textTimeoutId);

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || `Server error: ${res.status}`);
      }

      applyExtractedData(data);

      setPastedSourceText(textContent);
      setPastedExtractedData(data);
      setActivePreviewUrl(null);
      setPreviewMinimized(false);

      const duration = Date.now() - startTime;
      const itemsCount = data.line_items ? data.line_items.length : 0;
      if (triggerToast) {
        triggerToast(
          `AI Autofill completed! Refined company "${data.company_name || 'N/A'}" and ${itemsCount} line items in ${duration}ms.`,
          'success'
        );
      }
      setRawTextModalOpen(false);
      setRawTextInput('');
    } catch (err: any) {
      clearTimeout(textTimeoutId);
      console.warn('Text extraction AI refinement note:', err);
      const isAuthErr = err.message?.includes('401') || err.message?.includes('UNAUTHENTICATED') || err.message?.toLowerCase().includes('api key') || err.message?.toLowerCase().includes('credentials');
      
      if (instantData) {
        if (triggerToast) {
          triggerToast(
            isAuthErr 
              ? `Instant Smart Fill applied! AI refinement skipped (Configure GEMINI_API_KEY in AI Studio Settings).`
              : `Instant Smart Fill preserved! AI refinement skipped.`, 
            'info'
          );
        }
      } else {
        const msg = isAuthErr
          ? "Gemini API key is unconfigured, deleted, or invalid (401 Unauthenticated). Please set your GEMINI_API_KEY in AI Studio Settings."
          : `Text Autofill note: ${err.message}`;
        if (triggerToast) {
          triggerToast(msg, 'info');
        } else {
          alert(msg);
        }
      }
    } finally {
      setIsExtracting(false);
    }
  };

  const handleExtractFromAttachment = async (fileData: Attachment) => {
    // Set active preview immediately so they see the file side-by-side during extraction
    setActivePreviewUrl(fileData.url);
    setPreviewFileName(fileData.name);
    setPreviewFileType(fileData.type || 'application/pdf');
    setPastedSourceText(null);
    setPastedExtractedData(null);
    setPreviewMinimized(false);

    setIsExtracting(true);
    setExtractionError(null);
    setAiConfidence(null);

    const clientStartTime = Date.now();
    let fileFetchTime = 0;
    let fileConversionTime = 0;
    let networkRequestTime = 0;
    let stateUpdateTime = 0;

    // Set up AbortController for a robust 180 seconds (3 minutes) timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 180000);

    try {
      console.log(`%c[AI Client-Side Extraction Start] Processing: ${fileData.name}`, "color: #3b82f6; font-weight: bold; font-size: 11px;");
      const isImage = fileData.type.startsWith('image/');
      const isPdf = fileData.type === 'application/pdf';
      
      let requestPayload: any = {
        fileName: fileData.name,
        mimeType: fileData.type || 'application/octet-stream',
        salespersons,
      };

      const fetchStart = Date.now();
      if (isImage || isPdf) {
        // Fetch the file blob and convert
        console.log(`[Client Phase 1/4] Fetching file blob from: ${fileData.url}`);
        const response = await fetch(fileData.url, { signal: controller.signal });
        const blob = await response.blob();
        fileFetchTime = Date.now() - fetchStart;
        console.log(`[Client Phase 1/4 Completed] Blob fetched in ${fileFetchTime}ms. Size: ${(blob.size / 1024).toFixed(2)} KB`);

        if (isPdf && blob.size > 2 * 1024 * 1024) {
          console.warn(`[Client PDF Warning] Selected PDF size is large (${(blob.size / 1024 / 1024).toFixed(2)} MB). Large files containing full catalogs or high-res layout designs can cause high extraction delays.`);
        }

        const convertStart = Date.now();
        let base64Content = '';
        if (isImage) {
          console.log(`[Client Phase 2/4] Downsampling and compressing image...`);
          base64Content = await downsampleImage(blob);
          console.log(`[Client Phase 2/4 Completed] Downsampled and compressed image.`);
        } else {
          console.log(`[Client Phase 2/4] Encoding PDF to Base64...`);
          const base64Promise = new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const result = reader.result as string;
              const base64Data = result.split(',')[1];
              resolve(base64Data);
            };
            reader.onerror = (e) => reject(e);
            reader.readAsDataURL(blob);
          });
          base64Content = await base64Promise;
        }
        fileConversionTime = Date.now() - convertStart;
        console.log(`[Client Phase 2/4 Completed] File prepared in ${fileConversionTime}ms.`);

        requestPayload.content = base64Content;
        requestPayload.isBase64 = true;
      } else {
        // Fetch and read as text
        console.log(`[Client Phase 1/4] Fetching document as text from: ${fileData.url}`);
        const response = await fetch(fileData.url, { signal: controller.signal });
        fileFetchTime = Date.now() - fetchStart;

        const convertStart = Date.now();
        const textContent = await response.text();
        fileConversionTime = Date.now() - convertStart;
        console.log(`[Client Phase 1 & 2 Completed] Text fetched in ${fileFetchTime}ms and read in ${fileConversionTime}ms. Size: ${(textContent.length / 1024).toFixed(2)} KB`);

        requestPayload.content = textContent;
        requestPayload.isBase64 = false;
      }

      console.log(`[Client Phase 3/4] Dispatching extraction payload to backend API...`);
      const networkStart = Date.now();
      const simGeminiHeader = localStorage.getItem('omni_sim_gemini_out_of_tokens') === 'true' ? 'true' : 'false';
      const simLatencyHeader = localStorage.getItem('omni_sim_latency_ms') || '0';
      const userGeminiKey = localStorage.getItem('omni_user_gemini_api_key') || '';

      const res = await fetch('/api/gemini/extract-enquiry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-simulate-gemini-error': simGeminiHeader,
          'x-simulate-latency': simLatencyHeader,
          ...(userGeminiKey ? { 'x-user-gemini-api-key': userGeminiKey } : {})
        },
        body: JSON.stringify(requestPayload),
        signal: controller.signal
      });

      const data = await res.json();
      clearTimeout(timeoutId); // Successful request, clear the timeout timer!
      networkRequestTime = Date.now() - networkStart;
      console.log(`[Client Phase 3/4 Completed] Backend response received in ${networkRequestTime}ms.`);

      if (!res.ok || data.error) {
        throw new Error(data.error || `Server returned status ${res.status}`);
      }

      const stateStart = Date.now();
      applyExtractedData(data);
      setPastedExtractedData(data);

      stateUpdateTime = Date.now() - stateStart;
      const clientTotalTime = Date.now() - clientStartTime;
      const backendPerf = data.__performance || {};

      console.log(`\n=== CLIENT-SIDE PERFORMANCE REPORT ===`);
      console.log(`- File Blob Retrieval from URL: ${fileFetchTime}ms`);
      console.log(`- Local File Base64 Conversion: ${fileConversionTime}ms`);
      console.log(`- Network Transmission Round-trip: ${networkRequestTime}ms`);
      console.log(`  └─ Backend File Prepare: ${backendPerf.filePrepareTimeMs || 0}ms`);
      console.log(`  └─ Backend Gemini API call: ${backendPerf.geminiApiTimeMs || 0}ms`);
      console.log(`  └─ Backend Output JSON Parse: ${backendPerf.resultParseTimeMs || 0}ms`);
      console.log(`- UI State Updates & Fuzzy Matching: ${stateUpdateTime}ms`);
      console.log(`- Total Client-to-Client Duration: ${clientTotalTime}ms`);
      console.log(`======================================\n`);

      if (triggerToast) {
        const itemsCount = data.line_items ? data.line_items.length : 0;
        triggerToast(
          `Autofill completed successfully! Extracted company "${data.company_name || 'N/A'}" and ${itemsCount} line items in ${clientTotalTime}ms.`,
          'success'
        );
      }

      alert(
        `Enquiry form fields extracted and autofilled successfully!\n\n` +
        `Performance Summary:\n` +
        `• File Retrieval & Base64: ${fileFetchTime + fileConversionTime}ms\n` +
        `• Gemini AI Model Call: ${backendPerf.geminiApiTimeMs || 'N/A'}ms\n` +
        `• Total Extraction Time: ${clientTotalTime}ms`
      );
    } catch (err: any) {
      clearTimeout(timeoutId);
      const clientTotalTime = Date.now() - clientStartTime;
      const userMessage = err?.message || 'Failed to extract content.';
      const msgLower = userMessage.toLowerCase();
      const isQuotaError = 
        userMessage.includes('429') || 
        msgLower.includes('quota') || 
        msgLower.includes('rate limit') || 
        msgLower.includes('prepayment') || 
        msgLower.includes('credits') || 
        msgLower.includes('resource_exhausted') || 
        msgLower.includes('depleted') || 
        msgLower.includes('exceeded');
      
      const isAuthError = 
        userMessage.includes('401') || 
        userMessage.includes('UNAUTHENTICATED') || 
        msgLower.includes('invalid authentication') || 
        msgLower.includes('api key') || 
        msgLower.includes('credentials');

      if (isQuotaError || isAuthError) {
        console.warn(`[AI Extraction Notice] ${userMessage}`);
      } else {
        console.error(`\n=== CLIENT-SIDE EXTRACTION ERROR ===`);
        console.error(`- Error occurred after: ${clientTotalTime}ms`);
        console.error(`- Details:`, err);
        console.error(`======================================\n`);
      }

      const isAbortError = err.name === 'AbortError' || 
                           err.message?.toLowerCase().includes('abort') || 
                           err.message?.toLowerCase().includes('aborted') || 
                           err.message?.toLowerCase().includes('signal is');

      let displayMsg = userMessage;
      if (isAbortError) {
        displayMsg = "AI extraction timed out (180 seconds limit exceeded). The Gemini model or network is experiencing high latency. Please retry or use Smart Paste.";
      } else if (isQuotaError) {
        displayMsg = "Gemini API Quota or Prepayment Credits Depleted. Enter your personal Gemini API key below or use Smart Paste (100% offline).";
      } else if (isAuthError) {
        displayMsg = "Gemini AI Key is missing or invalid. Enter your personal Gemini API key below or configure GEMINI_API_KEY in AI Studio Settings.";
      }

      setExtractionError(displayMsg);

      if (triggerToast) {
        triggerToast(`Autofill note: ${displayMsg}`, (isQuotaError || isAuthError) ? 'info' : 'error');
      } else {
        alert(displayMsg);
      }
    } finally {
      setIsExtracting(false);
    }
  };

  const renderConfidenceBadge = (field: 'company_name' | 'contact_name' | 'project_location' | 'line_items') => {
    if (!aiConfidence || !aiConfidence[field]) return null;
    let score = aiConfidence[field];
    if (typeof score !== 'string') return null;
    score = score.toLowerCase().trim();
    if (score !== 'high' && score !== 'medium' && score !== 'low') {
      score = 'low';
    }
    
    let bg = '';
    if (score === 'high') {
      bg = 'bg-emerald-50 text-emerald-700 border-emerald-200';
    } else if (score === 'medium') {
      bg = 'bg-amber-50 text-amber-700 border-amber-200';
    } else {
      bg = 'bg-rose-50 text-rose-700 border-rose-200';
    }

    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[9px] font-mono font-bold border ${bg} ml-2 tracking-wider whitespace-nowrap shrink-0`}>
        AI: {score.toUpperCase()} CONFIDENCE
      </span>
    );
  };

  // Submit Enquiry record save
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    // Zero-Trust Check: Ensure Viewers cannot generate or mutate proposals
    const userRole = getUserWorkspaceRole(user, activeWorkspace?.id, activeWorkspace);
    if (userRole === 'Viewer') {
      alert('Access Denied: Viewers do not have permission to create or mutate proposals.');
      return;
    }

    if (!activeWorkspace?.id) {
      alert('Critical Error: Active workspace context lost. Cannot save record.');
      throw new Error("Critical Error: Active workspace context lost. Cannot save record.");
    }

    if (!companyId) {
      alert('Please search and select a valid client company first.');
      return;
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(enquiryDate)) {
      alert('Please enter the Received Date in YYYY-MM-DD format (e.g. 2026-06-19).');
      return;
    }
    if (projectedOrderDate && !dateRegex.test(projectedOrderDate)) {
      alert('Please enter the Estimated Order Date in YYYY-MM-DD format (e.g. 2026-06-19) or clear the field.');
      return;
    }
    if (nextFollowupDate && !dateRegex.test(nextFollowupDate)) {
      alert('Please enter the Next Follow-up Date in YYYY-MM-DD format (e.g. 2026-06-19) or clear the field.');
      return;
    }

    setIsSubmitting(true);

    const cleanLineItems = lineItems.map((item) => {
      const cleanAttr: ProductAttribute[] = (item.attributes || [])
        .map((a) => ({ key: a.key.trim(), value: a.value.trim() }))
        .filter((a) => a.key !== '' || a.value !== '');
      return {
        ...item,
        attributes: cleanAttr,
      };
    });

    const selectedSp = salespersons.find(
      (s) => s.id === salesPerson || s.initials === salesPerson || s.full_name === salesPerson
    );
    const spId = selectedSp?.id || (salesPerson && salesPerson.length > 5 ? salesPerson : undefined);
    const spInitialsOrName = selectedSp?.initials || selectedSp?.full_name || salesPerson;

    const payload: Omit<Enquiry, 'id'> = {
      workspace_id: activeWorkspace.id,
      sn: Number(sn),
      enquiry_date: enquiryDate,
      sales_person_id: spId,
      sales_person: spInitialsOrName,
      concerned_persons: concernedPersons,
      company_id: companyId,
      contact_id: contactId || undefined,
      country,
      project_location: projectLocation,
      enquiry_source: enquirySource,
      status,
      quote_ref_no: quoteRefNo.trim(),
      subject: subject.trim() || undefined,
      customer_reference_code: customerReferenceCode.trim() || undefined,
      proposal_option: proposalOption || undefined,
      projected_order_date: projectedOrderDate || undefined,
      next_followup_date: nextFollowupDate || undefined,
      value_aed: formCurrency === 'USD' ? finalValue * 3.6725 : finalValue,
      currency: formCurrency,
      is_lump_sum: isLumpSum,
      remarks: remarks.trim(),
      invoice_po_no: invoicePoNo.trim() || undefined,
      payment_status: paymentStatus.trim() || undefined,
      custom_project_details: customProjectDetails.filter(d => d.key.trim() && d.value.trim()),
      line_items: cleanLineItems,
      attachments: attachments.length > 0 ? attachments : undefined,
      parent_id: parentId ?? enquiryToEdit?.parent_id ?? null,
      revision_number: typeof revisionNumber === 'number' ? revisionNumber : (enquiryToEdit?.revision_number ?? (parentId ? 1 : 0)),
      created_by_uid: enquiryToEdit?.created_by_uid || enquiryToEdit?.createdByUid || user?.uid || '',
      created_by_name: enquiryToEdit?.created_by_name || enquiryToEdit?.createdByUsername || user?.username || user?.full_name || user?.email || 'Unknown User',
      createdByUid: enquiryToEdit?.createdByUid || enquiryToEdit?.created_by_uid || user?.uid || '',
      createdByUsername: enquiryToEdit?.createdByUsername || enquiryToEdit?.created_by_name || user?.username || user?.full_name || user?.email || 'Unknown User',
      last_modified_by_uid: user?.uid || '',
      last_modified_by_name: user?.username || user?.full_name || user?.email || 'Unknown User',
      updatedByUid: user?.uid || '',
      updatedByUsername: user?.username || user?.full_name || user?.email || 'Unknown User',
      createdAt: enquiryToEdit?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      if (enquiryToEdit && enquiryToEdit.id) {
        const updatedDoc: Enquiry = { id: enquiryToEdit.id, ...payload };
        // Log update audit trail
        const changes = getDiffs(enquiryToEdit, updatedDoc);
        await safeUpdateDoc('enquiries', enquiryToEdit.id, payload);
        await logAudit(enquiryToEdit.id, 'enquiry', 'update', enquiryToEdit, updatedDoc, changes);

        // Instant local state update
        if (setEnquiries) {
          setEnquiries((prev) => prev.map((e) => (e.id === enquiryToEdit.id ? updatedDoc : e)));
        }

        if (triggerToast) {
          triggerToast(`Enquiry #${enquiryToEdit.sn} has been updated successfully.`, 'success');
        }
        onClose();
      } else {
        const res = await safeAddDoc('enquiries', payload);
        const newId = res?.id || ('enq_' + Date.now());
        const newDoc: Enquiry = { id: newId, ...payload };

        await logAudit(newId, 'enquiry', 'create', null, payload, []);

        // Instant local state update
        if (setEnquiries) {
          setEnquiries((prev) => [newDoc, ...prev.filter((e) => e.id !== newId)]);
        }

        if (triggerToast) {
          triggerToast(`Enquiry #${sn} has been registered successfully.`, 'success');
        }
        if (submitModeRef.current === 'another') {
          resetForm(Number(sn) + 1);
        } else {
          onClose();
        }
      }
    } catch (err: any) {
      if (triggerToast) {
        triggerToast('Submit failed: ' + err.message, 'error');
      } else {
        alert('Submit failed: ' + err.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const getDiffs = (b: any, a: any) => {
    const diffs: any[] = [];
    Object.keys({ ...b, ...a }).forEach((k) => {
      if (JSON.stringify(b[k]) !== JSON.stringify(a[k]) && k !== 'id' && k !== 'updatedAt') {
        diffs.push({
          field: k,
          old_value: b[k] === undefined ? null : b[k],
          new_value: a[k] === undefined ? null : a[k]
        });
      }
    });
    return diffs;
  };

  const logAudit = async (docId: string, type: 'company' | 'contact' | 'enquiry', action: 'create' | 'update' | 'delete', before: any, after: any, changes: any[]) => {
    try {
      const log = {
        id: 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        document_id: docId,
        entity_type: type,
        action,
        changed_by_uid: user.uid,
        changed_by_name: user.username,
        timestamp: new Date().toISOString(),
        before: before || {},
        after: after || {},
        changes
      };
      await safeAddDoc('audit_logs', log);
      if (setAuditLogs) {
        setAuditLogs((prev) => [log, ...prev]);
      }
    } catch (err) {
      console.error('Audit logger failed:', err);
    }
  };

  // Searching for existing companies in list
  const matchingCompanies = companies.filter((c) =>
    c.display_name.toLowerCase().includes(companySearch.toLowerCase()) ||
    c.aliases.some((a) => a.toLowerCase().includes(companySearch.toLowerCase()))
  );

  const isPreviewActive = (!!activePreviewUrl || !!pastedSourceText) && !previewMinimized;

  return (
    <div id="enquiry-form-drawer" className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 flex justify-end">
      <div className={`h-screen flex bg-white border-l border-slate-200 shadow-2xl relative animate-in slide-in-from-right duration-200 transition-all ${isPreviewActive ? 'w-[98vw] max-w-[1700px]' : 'w-full max-w-6xl lg:max-w-7xl'}`}>
        
        {/* Left Panel: File Preview or Smart Paste Text Preview (visible when isPreviewActive is true) */}
        {isPreviewActive && (
          <div className="w-[45%] border-r border-slate-200 h-full flex flex-col bg-slate-50 shrink-0 font-sans overflow-hidden">
            {/* Case 1: Document File Preview (PDF or Image) */}
            {activePreviewUrl && (
              <>
                <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-white shrink-0">
                  <div className="flex items-center space-x-2 truncate">
                    <Eye className="w-5 h-5 text-blue-600 shrink-0" />
                    <span className="font-bold text-slate-800 text-xs sm:text-sm truncate max-w-[180px] md:max-w-[280px]" title={previewFileName}>
                      {previewFileName}
                    </span>
                  </div>
                  <div className="flex items-center space-x-1.5 shrink-0">
                    <a 
                      href={getSafeBlobUrl(activePreviewUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center space-x-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[11px] font-sans rounded-lg transition border border-slate-200"
                      title="Open file in a new tab (bypasses browser iframe/adblock restrictions)"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                      <span className="hidden sm:inline">Open in New Tab</span>
                    </a>
                    <button 
                      type="button"
                      onClick={() => setPreviewMinimized(true)}
                      className="p-1.5 hover:bg-slate-100 text-slate-500 hover:text-slate-800 rounded-lg transition font-sans text-xs flex items-center gap-1 border border-slate-200"
                      title="Minimize preview & expand Register New Enquiry form to maximum width"
                    >
                      <Minimize2 className="w-3.5 h-3.5 text-slate-600" />
                      <span className="hidden sm:inline font-semibold">Minimize</span>
                    </button>
                    <button 
                      type="button"
                      onClick={() => setActivePreviewUrl(null)}
                      className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition"
                      title="Hide Preview Panel"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                
                <div className="flex-1 p-6 flex flex-col items-center justify-center overflow-auto min-h-0 relative bg-slate-50/50">
                  {mediaType === 'image' ? (
                    <img 
                      src={getSafeBlobUrl(activePreviewUrl)} 
                      alt="Source document preview" 
                      className="max-w-full max-h-full object-contain rounded-xl shadow-lg border border-slate-200 bg-white"
                      referrerPolicy="no-referrer"
                    />
                  ) : mediaType === 'pdf' ? (
                    <div className="w-full h-full flex flex-col min-h-0">
                      <PdfViewer pdfUrl={getSafeBlobUrl(activePreviewUrl)} />
                    </div>
                  ) : (
                    <div className="text-center p-8 bg-white rounded-2xl border border-slate-150 shadow-sm max-w-md">
                      <FileText className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                      <p className="text-sm font-semibold text-slate-800 font-sans">Preview not supported in-app</p>
                      <p className="text-xs text-slate-500 mt-1 mb-4 leading-relaxed font-sans">
                        This file format ({previewFileType}) cannot be rendered inside the applet. Click below to view/download it directly.
                      </p>
                      <a 
                        href={getSafeBlobUrl(activePreviewUrl)} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="inline-flex items-center space-x-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs rounded-lg transition shadow-sm"
                      >
                        <span>Open in New Tab</span>
                      </a>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Case 2: Smart Paste Raw Text Source & Field Mapping Preview */}
            {!activePreviewUrl && pastedSourceText && (
              <>
                <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-white shrink-0 shadow-2xs">
                  <div className="flex items-center space-x-2 truncate">
                    <FileSpreadsheet className="w-5 h-5 text-emerald-600 shrink-0" />
                    <div>
                      <h4 className="font-bold text-slate-800 text-xs sm:text-sm font-sans flex items-center gap-1.5">
                        <span>Smart Paste Source & Mapping</span>
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-mono rounded-full font-bold">
                          AI Mapped
                        </span>
                      </h4>
                      <p className="text-[10px] text-slate-500 font-sans">
                        Interactive autofill preview — click chips below to highlight form fields
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setPreviewMinimized(true)}
                      className="p-1.5 hover:bg-slate-100 text-slate-600 hover:text-slate-900 rounded-lg transition font-sans text-xs flex items-center gap-1 border border-slate-200"
                      title="Minimize preview & expand Register New Enquiry form to full width"
                    >
                      <Minimize2 className="w-3.5 h-3.5 text-slate-600" />
                      <span className="hidden sm:inline font-semibold">Minimize</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPastedSourceText(null);
                        setPastedExtractedData(null);
                      }}
                      className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition"
                      title="Close Smart Paste preview"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {/* Extracted Tokens Card */}
                  <div className="bg-white border border-emerald-200/80 rounded-2xl p-4 shadow-2xs space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <span className="text-xs font-bold text-slate-800 font-sans flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-emerald-600 fill-emerald-600" />
                        <span>AI Extracted Field Tokens</span>
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">
                        Hover/Click to Highlight Field
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2 text-xs">
                      {pastedExtractedData?.quote_ref_no && (
                        <button
                          type="button"
                          onMouseEnter={() => setHighlightedField('quote_ref_no')}
                          onMouseLeave={() => setHighlightedField(null)}
                          onClick={() => scrollToField('quote_ref_no')}
                          className={`px-2.5 py-1.5 rounded-xl text-left border transition flex items-center space-x-1.5 cursor-pointer ${highlightedField === 'quote_ref_no' ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs font-bold' : 'bg-emerald-50/80 hover:bg-emerald-100 text-emerald-900 border-emerald-200'}`}
                          title="Click to scroll & glowQuote Ref field"
                        >
                          <Tag className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                          <span>Quote Ref: <strong className="font-mono">{pastedExtractedData.quote_ref_no}</strong></span>
                        </button>
                      )}

                      {pastedExtractedData?.company_name && (
                        <button
                          type="button"
                          onMouseEnter={() => setHighlightedField('company')}
                          onMouseLeave={() => setHighlightedField(null)}
                          onClick={() => scrollToField(unregisteredEntities ? 'unregistered_entities' : 'company')}
                          className={`px-2.5 py-1.5 rounded-xl text-left border transition flex items-center space-x-1.5 cursor-pointer ${highlightedField === 'company' ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs font-bold' : 'bg-emerald-50/80 hover:bg-emerald-100 text-emerald-900 border-emerald-200'}`}
                          title="Click to scroll & glow Company account field"
                        >
                          <Building className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                          <span>Company: <strong>{pastedExtractedData.company_name}</strong></span>
                        </button>
                      )}

                      {pastedExtractedData?.contact_name && (
                        <button
                          type="button"
                          onMouseEnter={() => setHighlightedField('contact')}
                          onMouseLeave={() => setHighlightedField(null)}
                          onClick={() => scrollToField(unregisteredEntities ? 'unregistered_entities' : 'contact')}
                          className={`px-2.5 py-1.5 rounded-xl text-left border transition flex items-center space-x-1.5 cursor-pointer ${highlightedField === 'contact' ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs font-bold' : 'bg-emerald-50/80 hover:bg-emerald-100 text-emerald-900 border-emerald-200'}`}
                          title="Click to scroll & glow Contact field"
                        >
                          <User className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                          <span>Contact: <strong>{pastedExtractedData.contact_name}</strong></span>
                        </button>
                      )}

                      {unregisteredEntities && (
                        <button
                          type="button"
                          onMouseEnter={() => setHighlightedField('unregistered_entities')}
                          onMouseLeave={() => setHighlightedField(null)}
                          onClick={() => {
                            setShowConfirmRegistrationModal(true);
                            scrollToField('unregistered_entities');
                          }}
                          className="px-2.5 py-1.5 rounded-xl text-left border border-amber-300 bg-amber-100 hover:bg-amber-200 text-amber-950 transition flex items-center space-x-1.5 cursor-pointer font-semibold animate-pulse"
                          title="Click to open Entity Registration & Mapping Modal"
                        >
                          <Sparkles className="w-3.5 h-3.5 shrink-0 text-amber-700" />
                          <span>New Entity Registration Action Required</span>
                        </button>
                      )}

                      {pastedExtractedData?.received_date && (
                        <button
                          type="button"
                          onMouseEnter={() => setHighlightedField('received_date')}
                          onMouseLeave={() => setHighlightedField(null)}
                          onClick={() => scrollToField('received_date')}
                          className={`px-2.5 py-1.5 rounded-xl text-left border transition flex items-center space-x-1.5 cursor-pointer ${highlightedField === 'received_date' ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs font-bold' : 'bg-emerald-50/80 hover:bg-emerald-100 text-emerald-900 border-emerald-200'}`}
                          title="Click to scroll & glow Date field"
                        >
                          <Calendar className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                          <span>Date: <strong className="font-mono">{pastedExtractedData.received_date}</strong></span>
                        </button>
                      )}

                      {pastedExtractedData?.project_location && (
                        <button
                          type="button"
                          onMouseEnter={() => setHighlightedField('location')}
                          onMouseLeave={() => setHighlightedField(null)}
                          onClick={() => scrollToField('location')}
                          className={`px-2.5 py-1.5 rounded-xl text-left border transition flex items-center space-x-1.5 cursor-pointer ${highlightedField === 'location' ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs font-bold' : 'bg-emerald-50/80 hover:bg-emerald-100 text-emerald-900 border-emerald-200'}`}
                          title="Click to scroll & glow Location field"
                        >
                          <MapPin className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                          <span>Location: <strong>{pastedExtractedData.project_location}</strong></span>
                        </button>
                      )}

                      {customProjectDetails.some(d => d.value.trim() !== '') && (
                        <button
                          type="button"
                          onMouseEnter={() => setHighlightedField('custom_project_details')}
                          onMouseLeave={() => setHighlightedField(null)}
                          onClick={() => scrollToField('custom_project_details')}
                          className={`px-2.5 py-1.5 rounded-xl text-left border transition flex items-center space-x-1.5 cursor-pointer ${highlightedField === 'custom_project_details' ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs font-bold' : 'bg-emerald-50/80 hover:bg-emerald-100 text-emerald-900 border-emerald-200'}`}
                          title="Click to scroll & glow Custom Project Details field"
                        >
                          <Sliders className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                          <span>Custom Project Specs: <strong>{customProjectDetails.filter(d => d.value.trim() !== '').length} Specs</strong></span>
                        </button>
                      )}

                      {pastedExtractedData?.package_value && (
                        <button
                          type="button"
                          onMouseEnter={() => setHighlightedField('value')}
                          onMouseLeave={() => setHighlightedField(null)}
                          onClick={() => scrollToField('value')}
                          className={`px-2.5 py-1.5 rounded-xl text-left border transition flex items-center space-x-1.5 cursor-pointer ${highlightedField === 'value' ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs font-bold' : 'bg-emerald-50/80 hover:bg-emerald-100 text-emerald-900 border-emerald-200'}`}
                          title="Click to scroll & glow Package Value field"
                        >
                          <DollarSign className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                          <span>Value: <strong className="font-mono">AED {Number(pastedExtractedData.package_value).toLocaleString()}</strong></span>
                        </button>
                      )}

                      {/* Multi-Level Hierarchical Token Expander for Line Items */}
                      {Array.isArray(pastedExtractedData?.line_items) && pastedExtractedData.line_items.length > 0 && (
                        <div className="w-full space-y-2 border-t border-slate-100 pt-2">
                          <button
                            type="button"
                            onMouseEnter={() => setHighlightedField('line_items')}
                            onMouseLeave={() => setHighlightedField(null)}
                            onClick={() => {
                              setExpandedLineItemsToken(!expandedLineItemsToken);
                              scrollToField('line_items');
                            }}
                            onDoubleClick={() => setExpandedLineItemsToken(!expandedLineItemsToken)}
                            className={`w-full px-2.5 py-1.5 rounded-xl text-left border transition flex items-center justify-between cursor-pointer ${highlightedField === 'line_items' ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs font-bold' : 'bg-emerald-50/80 hover:bg-emerald-100 text-emerald-900 border-emerald-200'}`}
                            title="Click or double-click to toggle items tree expansion"
                          >
                            <div className="flex items-center space-x-1.5">
                              <Layers className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                              <span>Line Items: <strong className="font-mono">{pastedExtractedData.line_items.length} Items Parsed</strong></span>
                            </div>
                            <div className="flex items-center space-x-1 text-[10px] font-semibold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-md">
                              <span>{expandedLineItemsToken ? 'Collapse' : 'Expand Tree'}</span>
                              <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${expandedLineItemsToken ? 'rotate-180' : ''}`} />
                            </div>
                          </button>

                          {/* Level 1 & Level 2 Tree */}
                          {expandedLineItemsToken && (
                            <div className="pl-3 border-l-2 border-emerald-300 space-y-2 py-1">
                              {pastedExtractedData.line_items.map((item: any, idx: number) => {
                                const isItemExpanded = expandedItemIndices.includes(idx);
                                const attrs: ProductAttribute[] = Array.isArray(item.attributes) ? item.attributes : [];

                                return (
                                  <div key={idx} className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 space-y-2 text-xs">
                                    <div 
                                      className="flex items-center justify-between cursor-pointer hover:bg-emerald-50/60 p-1 rounded-lg transition"
                                      onClick={() => scrollToField(`line_item_${idx}`)}
                                      onDoubleClick={() => {
                                        setExpandedItemIndices(prev =>
                                          prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
                                        );
                                      }}
                                      onMouseEnter={() => setHighlightedField(`line_item_${idx}`)}
                                      onMouseLeave={() => setHighlightedField(null)}
                                    >
                                      <div className="flex items-center space-x-2 truncate">
                                        <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-900 font-mono font-bold text-[10px] rounded-md">
                                          #{idx + 1}
                                        </span>
                                        <span className="font-bold text-slate-800 truncate">
                                          {item.product_type || 'Item'}: {item.description || 'No description'}
                                        </span>
                                      </div>
                                      <div className="flex items-center space-x-2 shrink-0">
                                        <span className="font-mono text-emerald-700 font-bold text-[11px]">
                                          {item.total_price ? `AED ${Number(item.total_price).toLocaleString()}` : (item.quantity ? `Qty: ${item.quantity}` : 'Parsed')}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setExpandedItemIndices(prev =>
                                              prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
                                            );
                                          }}
                                          className="p-1 text-slate-400 hover:text-slate-700 rounded-md"
                                          title="Toggle attributes details"
                                        >
                                          <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isItemExpanded ? 'rotate-90' : ''}`} />
                                        </button>
                                      </div>
                                    </div>

                                    {/* Level 2 Attributes Tree */}
                                    {isItemExpanded && (
                                      <div className="pl-4 pt-1 border-t border-slate-200/60 space-y-1.5 text-[11px]">
                                        <span className="text-[10px] font-mono uppercase text-slate-400 font-bold block">
                                          Technical Attributes ({attrs.length}):
                                        </span>
                                        <div className="flex flex-wrap gap-1.5">
                                          {attrs.length > 0 ? (
                                            attrs.map((attr, aIdx) => (
                                              <span key={aIdx} className="bg-white border border-slate-200 px-2 py-0.5 rounded-md text-slate-700 font-sans shadow-2xs">
                                                <strong className="text-slate-900 font-semibold">{attr.key}:</strong> {attr.value || 'N/A'}
                                              </span>
                                            ))
                                          ) : (
                                            <span className="text-slate-400 italic">No custom attributes extracted.</span>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Price Discrepancy & Valuation Accuracy Validation Ping */}
                  {priceDiscrepancyAmount > 1.0 && (
                    <div className="bg-rose-50 border-2 border-rose-300 rounded-2xl p-4 shadow-2xs space-y-2">
                      <div className="flex items-center justify-between text-rose-900 font-bold text-xs">
                        <span className="flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4 text-rose-600 animate-pulse" />
                          <span>Price Discrepancy Alert</span>
                        </span>
                        <span className="font-mono text-[10px] bg-rose-100 text-rose-800 px-2 py-0.5 rounded-full font-bold">
                          Diff: AED {priceDiscrepancyAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                      <p className="text-xs text-rose-700 leading-relaxed font-sans">
                        Package Value (AED {manualValue.toLocaleString()}) does not match calculated Line Items Sum (AED {computedValue.toLocaleString()}).
                      </p>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setManualValue(computedValue);
                            setIsLumpSum(true);
                            if (triggerToast) triggerToast('Package Value synced to Line Items sum!', 'success');
                          }}
                          className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs transition shadow-2xs"
                        >
                          Sync Package Total to AED {computedValue.toLocaleString()}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (lineItems.length > 0 && manualValue > 0) {
                              const share = Number((manualValue / lineItems.length).toFixed(2));
                              setLineItems(lineItems.map(it => ({
                                ...it,
                                unit_price: it.quantity > 0 ? Number((share / it.quantity).toFixed(2)) : share,
                                total_price: share
                              })));
                              if (triggerToast) triggerToast('Package Total distributed across line items!', 'info');
                            }
                          }}
                          className="px-3 py-1.5 bg-white border border-rose-300 hover:bg-rose-100 text-rose-900 font-semibold rounded-xl text-xs transition"
                        >
                          Distribute Evenly
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Raw Source Text Display */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs space-y-2">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <span className="text-xs font-mono uppercase text-slate-400 font-semibold">
                        Original Copy-Pasted Excel / Text
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          if (pastedSourceText) {
                            try {
                              navigator.clipboard.writeText(pastedSourceText);
                              if (triggerToast) triggerToast('Copied source text to clipboard!', 'info');
                            } catch (e) {
                              if (triggerToast) triggerToast('Unable to write to clipboard in this frame', 'error');
                            }
                          }
                        }}
                        className="text-[11px] font-sans font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1"
                      >
                        <Copy className="w-3 h-3" />
                        <span>Copy Source Text</span>
                      </button>
                    </div>

                    <pre className="p-3 bg-slate-900 text-emerald-400 rounded-xl font-mono text-[11px] leading-relaxed overflow-x-auto whitespace-pre-wrap max-h-[350px]">
                      {renderSourceTextWithHighlight(pastedSourceText, highlightedField, pastedExtractedData)}
                    </pre>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Right Panel: The actual Form */}
        <div className="flex-1 flex flex-col min-w-0 h-full bg-white">
          {/* Header Block */}
          <div className="p-6 border-b border-slate-100 flex items-center justify-between shrink-0">
            <div className="flex items-center space-x-3">
              <FileCheck className="w-6 h-6 text-blue-600" />
              <h3 className="text-xl font-bold text-slate-900 font-sans">
                {enquiryToEdit ? `Edit Enquiry #${enquiryToEdit.sn}` : 'Register New Enquiry'}
              </h3>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-slate-50 text-slate-400 hover:text-slate-800 rounded-lg transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Minimized Source Preview Banner */}
          {((!!activePreviewUrl || !!pastedSourceText) && previewMinimized) && (
            <div className="bg-gradient-to-r from-blue-50 via-slate-50 to-emerald-50 border-b border-slate-200 px-6 py-2.5 flex items-center justify-between text-xs font-sans shrink-0 animate-in fade-in duration-150">
              <div className="flex items-center space-x-2 text-slate-700">
                <Sparkles className="w-4 h-4 text-emerald-600 animate-pulse" />
                <span className="font-bold text-slate-800">
                  {activePreviewUrl ? 'Document Preview Minimized' : 'Smart Paste Source Preview Minimized'}
                </span>
                <span className="text-slate-500 font-mono text-[11px] hidden sm:inline">
                  (Form expanded to maximum wide view)
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPreviewMinimized(false)}
                className="px-3 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-blue-700 font-bold rounded-xl shadow-2xs transition flex items-center space-x-1.5"
              >
                <Maximize2 className="w-3.5 h-3.5 text-blue-600" />
                <span>Expand Split-Screen Preview</span>
              </button>
            </div>
          )}

          {/* Form body */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8 space-y-6">
          
          {/* Section 1: Standard Metadata */}
          <div className="bg-slate-50 border border-slate-200 p-6 rounded-2xl space-y-4">
            <h4 className="text-xs font-mono text-slate-400 uppercase tracking-widest border-b border-slate-150 pb-2 mb-2">
              Log Metadata
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div>
                <MarqueeLabel>S/N (Legacy Ident)</MarqueeLabel>
                <input
                  type="number"
                  required
                  disabled={!!enquiryToEdit}
                  value={sn}
                  onChange={(e) => setSn(Number(e.target.value))}
                  className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2 px-3 text-sm text-slate-800 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500/20 disabled:opacity-50"
                />
              </div>

              <div id="field-received_date">
                <MarqueeLabel required title="Received Date (YYYY-MM-DD)">Received Date</MarqueeLabel>
                <input
                  type="date"
                  required
                  placeholder="YYYY-MM-DD"
                  value={enquiryDate}
                  onChange={(e) => setEnquiryDate(e.target.value)}
                  style={{ colorScheme: 'dark' }}
                  className={`[color-scheme:dark] w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500/20 font-mono ${getHighlightClasses('received_date')}`}
                />
              </div>

              <div>
                <MarqueeLabel badge={renderSortButton(salespersonsSort, setSalespersonsSort, 'Salespersons')}>Salesperson</MarqueeLabel>
                <select
                  value={salesPerson}
                  onChange={(e) => setSalesPerson(e.target.value)}
                  disabled={user?.role !== 'Admin' && !allowUserSalespersonSelection}
                  className={`w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500/20 font-sans ${
                    user?.role !== 'Admin' && !allowUserSalespersonSelection ? 'bg-slate-100/90 text-slate-500 cursor-not-allowed' : ''
                  }`}
                >
                  {sortedSalespersons.map((s) => (
                    <option key={s.id || s.initials} value={s.id || s.initials}>
                      {s.full_name}
                    </option>
                  ))}
                </select>
                {user?.role !== 'Admin' && !allowUserSalespersonSelection && (
                  <p className="text-[10px] text-amber-700 font-sans mt-1">
                    🔒 Registered automatically under your account. (Reassignment restricted by Admin)
                  </p>
                )}
              </div>

              {/* Concerned Persons / Additional Team Members Selection */}
              <div className="md:col-span-2 bg-slate-50/80 border border-slate-200 p-3 rounded-xl space-y-2">
                <MarqueeLabel>Concerned Persons / Additional Team Members</MarqueeLabel>
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-1 bg-white border border-slate-200 rounded-lg">
                  {salespersons.map((s) => {
                    const val = s.id || s.initials || s.full_name;
                    const isSelected = concernedPersons.includes(val);
                    const isPrimary = salesPerson === val;
                    return (
                      <button
                        type="button"
                        key={val}
                        onClick={() => {
                          if (isPrimary) return;
                          setConcernedPersons((prev) =>
                            prev.includes(val) ? prev.filter((p) => p !== val) : [...prev, val]
                          );
                        }}
                        disabled={isPrimary}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition flex items-center space-x-1 ${
                          isPrimary
                            ? 'bg-blue-100 text-blue-800 border-blue-300 opacity-80 cursor-not-allowed'
                            : isSelected
                            ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                            : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                        }`}
                      >
                        <span>{s.full_name} {s.initials ? `(${s.initials})` : ''}</span>
                        {isPrimary && <span className="text-[9px] font-bold uppercase tracking-wider">(Primary)</span>}
                        {!isPrimary && isSelected && <Check className="w-3 h-3 ml-1" />}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-slate-500 font-sans">
                  Click team members to tag them as concerned persons. Tagged persons get full view & access permissions to this proposal.
                </p>
              </div>

              <div>
                <MarqueeLabel badge={renderSortButton(sourcesSort, setSourcesSort, 'Enquiry Sources')}>Enquiry Source</MarqueeLabel>
                <select
                  value={enquirySource}
                  onChange={(e) => setEnquirySource(e.target.value)}
                  className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500/20 font-sans"
                >
                  {sortedSources.map((src) => (
                    <option key={src} value={src}>{src}</option>
                  ))}
                </select>
              </div>

              <div>
                <MarqueeLabel>Enquiry Currency</MarqueeLabel>
                <select
                  value={formCurrency}
                  onChange={(e) => setFormCurrency(e.target.value as 'AED' | 'USD')}
                  className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500/20 font-sans"
                >
                  <option value="AED">AED (Dirhams)</option>
                  <option value="USD">USD (Dollars)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Unregistered Entities Confirmation & One-Click Registration Card */}
          {unregisteredEntities && (
            <div 
              id="field-unregistered_entities" 
              className={`bg-gradient-to-r from-amber-50/90 via-slate-50 to-emerald-50/90 border-2 border-emerald-400 rounded-2xl p-5 shadow-sm space-y-4 transition-all duration-300 ${getHighlightClasses('unregistered_entities')}`}
            >
              <div className="flex items-start justify-between border-b border-emerald-200/60 pb-3">
                <div className="flex items-center space-x-2.5">
                  <div className="p-2 bg-emerald-600 text-white rounded-xl shadow-xs">
                    <Sparkles className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 font-sans flex items-center gap-2">
                      <span>Detected New / Unregistered Entities</span>
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-mono rounded-full font-bold">
                        AI Match Action Required
                      </span>
                    </h4>
                    <p className="text-xs text-slate-600 font-sans mt-0.5">
                      Review extracted data and click "Confirm & Register" to instantly record into Company and Contact database catalogs.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setUnregisteredEntities(null)}
                  className="p-1 hover:bg-slate-200/60 rounded-lg text-slate-400 hover:text-slate-600 transition"
                  title="Dismiss confirmation"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-sans">
                {/* Company Fields */}
                <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-2.5 shadow-2xs">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                    <span className="font-bold text-slate-800 flex items-center gap-1.5">
                      <Building className="w-4 h-4 text-blue-600" />
                      <span>New Company Account</span>
                    </span>
                    <span className="text-[10px] font-mono text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-md">
                      Unregistered
                    </span>
                  </div>
                  
                  <div className="space-y-2">
                    <div>
                      <label className="text-[10px] font-semibold text-slate-500 uppercase">Company Name</label>
                      <input
                        type="text"
                        value={unregisteredEntities.companyName || ''}
                        onChange={(e) => setUnregisteredEntities({ ...unregisteredEntities, companyName: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs text-slate-800 font-semibold focus:bg-white focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-semibold text-slate-500 uppercase">City / Location</label>
                        <input
                          type="text"
                          value={unregisteredEntities.city || ''}
                          onChange={(e) => setUnregisteredEntities({ ...unregisteredEntities, city: e.target.value })}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-slate-500 uppercase">Country</label>
                        <input
                          type="text"
                          value={unregisteredEntities.country || ''}
                          onChange={(e) => setUnregisteredEntities({ ...unregisteredEntities, country: e.target.value })}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Contact Person Fields */}
                <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-2.5 shadow-2xs">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                    <span className="font-bold text-slate-800 flex items-center gap-1.5">
                      <User className="w-4 h-4 text-emerald-600" />
                      <span>Contact Personnel</span>
                    </span>
                    <span className="text-[10px] font-mono text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-md">
                      Unregistered
                    </span>
                  </div>

                  <div className="space-y-2">
                    <div>
                      <label className="text-[10px] font-semibold text-slate-500 uppercase">Full Name</label>
                      <input
                        type="text"
                        value={unregisteredEntities.contactName || ''}
                        onChange={(e) => setUnregisteredEntities({ ...unregisteredEntities, contactName: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs text-slate-800 font-semibold focus:bg-white focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-semibold text-slate-500 uppercase">Email Address</label>
                        <input
                          type="email"
                          value={unregisteredEntities.contactEmail || ''}
                          onChange={(e) => setUnregisteredEntities({ ...unregisteredEntities, contactEmail: e.target.value })}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs text-slate-800 font-mono focus:bg-white focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-slate-500 uppercase">Phone / Mobile</label>
                        <input
                          type="text"
                          value={unregisteredEntities.contactMobile || ''}
                          onChange={(e) => setUnregisteredEntities({ ...unregisteredEntities, contactMobile: e.target.value })}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs text-slate-800 font-mono focus:bg-white focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Interactive Field Assignment Routing */}
              <div className="bg-white/80 p-3 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center space-x-2">
                    <span className="font-semibold text-slate-700 text-[11px]">Route Email To:</span>
                    <div className="inline-flex p-0.5 bg-slate-100 border border-slate-200 rounded-lg">
                      <button
                        type="button"
                        onClick={() => setUnregisteredEntities({ ...unregisteredEntities, emailDestination: 'contact' })}
                        className={`px-2.5 py-0.5 text-[11px] font-bold rounded-md transition ${unregisteredEntities.emailDestination === 'contact' ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
                      >
                        Contact Person
                      </button>
                      <button
                        type="button"
                        onClick={() => setUnregisteredEntities({ ...unregisteredEntities, emailDestination: 'company' })}
                        className={`px-2.5 py-0.5 text-[11px] font-bold rounded-md transition ${unregisteredEntities.emailDestination === 'company' ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
                      >
                        Company General
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <span className="font-semibold text-slate-700 text-[11px]">Route Phone To:</span>
                    <div className="inline-flex p-0.5 bg-slate-100 border border-slate-200 rounded-lg">
                      <button
                        type="button"
                        onClick={() => setUnregisteredEntities({ ...unregisteredEntities, phoneDestination: 'contact' })}
                        className={`px-2.5 py-0.5 text-[11px] font-bold rounded-md transition ${unregisteredEntities.phoneDestination === 'contact' ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
                      >
                        Contact Person
                      </button>
                      <button
                        type="button"
                        onClick={() => setUnregisteredEntities({ ...unregisteredEntities, phoneDestination: 'company' })}
                        className={`px-2.5 py-0.5 text-[11px] font-bold rounded-md transition ${unregisteredEntities.phoneDestination === 'company' ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
                      >
                        Company General
                      </button>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleConfirmRegisterEntities}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-md hover:shadow-lg transition flex items-center space-x-2 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-100" />
                  <span>Confirm & Register Company + Contact</span>
                </button>
              </div>
            </div>
          )}

          {/* Section 2: Account and Contact selection */}
          <div id="field-company" className={`bg-slate-50 border border-slate-200 p-6 rounded-2xl space-y-4 transition-all duration-300 ${getHighlightClasses('company')}`}>
            <h4 className="text-xs font-mono text-slate-400 uppercase tracking-widest border-b border-slate-150 pb-2 mb-2">
              Account Pairing
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 relative">
              {/* Company search */}
              <div className="relative">
                <div className="flex justify-between items-center mb-1">
                  <div className="flex-1 min-w-0 mr-2 flex items-center justify-between">
                    <MarqueeLabel badge={renderConfidenceBadge('company_name')}>
                      Search & Pair Company
                    </MarqueeLabel>
                    <button
                      type="button"
                      onClick={handleAutoDetectClipboard}
                      className="px-2 py-0.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-[10px] font-bold transition flex items-center space-x-1 shrink-0"
                      title="Read clipboard text & auto-detect unregistered companies or contacts with AI"
                    >
                      <Sparkles className="w-3 h-3 text-emerald-600 fill-emerald-600" />
                      <span>Auto-Detect Clipboard</span>
                    </button>
                  </div>
                  
                  {/* Action Menu Dropdown */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setCompanyMenuOpen(!companyMenuOpen)}
                      className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors flex items-center justify-center"
                      title="Company Actions"
                    >
                      <MoreVertical className="w-3.5 h-3.5" />
                    </button>
                    {companyMenuOpen && (
                      <>
                        <div 
                          className="fixed inset-0 z-40" 
                          onClick={() => setCompanyMenuOpen(false)} 
                        />
                        <div className="absolute right-0 mt-1 w-48 bg-white border border-slate-200 rounded-xl shadow-xl py-1.5 z-50 animate-in fade-in slide-in-from-top-1 duration-100">
                          {companyId && (
                            <button
                              type="button"
                              onClick={() => {
                                setCompanyMenuOpen(false);
                                const comp = companies.find((c) => c.id === companyId);
                                if (comp) {
                                  // Find base name (without legal suffix)
                                  let baseName = comp.display_name;
                                  if (comp.legal_suffix && comp.legal_suffix !== 'None / Other') {
                                    if (comp.display_name.endsWith(comp.legal_suffix)) {
                                      baseName = comp.display_name.slice(0, -comp.legal_suffix.length).trim();
                                    }
                                  }
                                  setSubCompanyName(baseName);
                                  setSubLegalSuffix(comp.legal_suffix || 'LLC');
                                  setSubCity(comp.city);
                                  setSubCountry(comp.country);
                                  setSubGeneralPhone(comp.general_phone || '');
                                  setSubGeneralEmail(comp.general_email || '');
                                  setSubNotes(comp.notes || '');
                                  setIsEditingCompany(true);
                                  setNewCompanyModal(true);
                                }
                              }}
                              className="w-full text-left px-3 py-2 text-xs font-sans text-emerald-750 hover:bg-slate-50 font-semibold flex items-center space-x-1.5"
                              title="Edit selected Company"
                            >
                              <span>Edit Details</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setCompanyMenuOpen(false);
                              setSubCompanyName(companySearch);
                              setSubLegalSuffix('LLC');
                              setSubCity('');
                              setSubCountry('UAE');
                              setSubGeneralPhone('');
                              setSubGeneralEmail('');
                              setSubNotes('');
                              setIsEditingCompany(false);
                              setNewCompanyModal(true);
                            }}
                            className="w-full text-left px-3 py-2 text-xs font-sans text-blue-600 hover:bg-slate-50 font-semibold flex items-center space-x-1.5"
                            title="Add new Company"
                          >
                            <span>+ Add New Company</span>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    required
                    placeholder={BRAND_CONFIG.placeholderSearchText}
                    value={companySearch}
                    onChange={(e) => {
                      setCompanySearch(e.target.value);
                      setShowCompanyList(true);
                    }}
                    onFocus={() => setShowCompanyList(true)}
                    className={`flex-1 bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500/20 ${getHighlightClasses('company')}`}
                  />
                </div>

                {showCompanyList && companySearch.trim().length > 0 && (
                  <div className="absolute top-full left-0 right-0 bg-white border border-slate-200 rounded-xl mt-1.5 max-h-48 overflow-y-auto z-50 shadow-2xl divide-y divide-slate-100">
                    {matchingCompanies.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setCompanyId(c.id!);
                          setCompanySearch(c.display_name);
                          setCountry(c.country);
                          setProjectLocation(c.city);
                          setShowCompanyList(false);
                          // Auto set primary contact if available
                          const prim = contacts.find((ct) => ct.company_id === c.id && ct.is_primary);
                          if (prim) {
                            setContactId(prim.id!);
                          } else {
                            setContactId('');
                          }
                        }}
                        className="w-full p-3 hover:bg-slate-50 text-left text-xs font-sans text-slate-700 flex items-center justify-between"
                      >
                        <span className="font-semibold text-slate-800">{c.display_name}</span>
                        <span className="text-[10px] text-slate-400 font-mono uppercase">{c.city}, {c.country}</span>
                      </button>
                    ))}
                    {matchingCompanies.length === 0 && (
                      <div className="p-3 text-xs text-slate-400 text-center font-mono">
                        No matches. Save this canonical company in the "Companies" tab first.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Contact lookup */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <div className="flex-1 min-w-0 mr-2">
                    <MarqueeLabel badge={renderConfidenceBadge('contact_name')}>
                      Account Contact Personnel
                    </MarqueeLabel>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        if (!companyId) {
                          if (triggerToast) {
                            triggerToast('Please search or select a Company first before adding a contact person.', 'info');
                          } else {
                            alert('Please search or select a Company first before adding a contact person.');
                          }
                          return;
                        }
                        setSubContactName('');
                        setSubContactDesignation('');
                        setSubContactMobile('');
                        setSubContactEmail('');
                        setSubContactIsPrimary(false);
                        setIsEditingContact(false);
                        setShowNewContactModal(true);
                      }}
                      className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200 transition-colors flex items-center space-x-1 shrink-0 shadow-2xs"
                      title="Add a new contact person for this account"
                    >
                      <UserPlus className="w-3.5 h-3.5 text-blue-600" />
                      <span>+ Add Contact</span>
                    </button>
                    {companyId && contactId && (
                      <button
                        type="button"
                        onClick={() => {
                          const ct = contacts.find((c) => c.id === contactId);
                          if (ct) {
                            setSubContactName(ct.full_name);
                            setSubContactDesignation(ct.designation || '');
                            setSubContactMobile(ct.mobile || '');
                            setSubContactEmail(ct.email || '');
                            setSubContactIsPrimary(ct.is_primary || false);
                            setIsEditingContact(true);
                            setShowNewContactModal(true);
                          }
                        }}
                        className="text-[11px] font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 px-2 py-1 rounded-lg border border-slate-200 transition-colors flex items-center space-x-1"
                        title="Edit details of selected contact"
                      >
                        <Pencil className="w-3 h-3 text-slate-500" />
                        <span>Edit</span>
                      </button>
                    )}
                  </div>
                </div>
                <select
                  value={contactId}
                  onChange={(e) => setContactId(e.target.value)}
                  disabled={!companyId}
                  className={`w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500/20 disabled:opacity-50 font-sans ${getHighlightClasses('contact')}`}
                >
                  <option value="">-- Choose Contact Manager --</option>
                  {companyContacts.map((ct) => (
                    <option key={ct.id} value={ct.id}>
                      {ct.full_name} {ct.designation ? `(${ct.designation})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Section 3: Proposal Location and identifiers */}
          <div className="bg-slate-50 border border-slate-200 p-6 rounded-2xl space-y-4">
            <h4 className="text-xs font-mono text-slate-400 uppercase tracking-widest border-b border-slate-150 pb-2 mb-2">
              Proposal & Company Location Identifiers
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div id="field-country">
                <MarqueeLabel>Company / Client Country</MarqueeLabel>
                <input
                  type="text"
                  required
                  placeholder="e.g. UAE / Oman"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className={`w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500/20 ${getHighlightClasses('country')}`}
                />
              </div>

              <div id="field-location">
                <MarqueeLabel badge={renderConfidenceBadge('project_location')}>
                  Company Location / City
                </MarqueeLabel>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dubai / Muscat"
                  value={projectLocation}
                  onChange={(e) => setProjectLocation(e.target.value)}
                  className={`w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500/20 ${getHighlightClasses('location')}`}
                />
              </div>

              <div id="field-quote_ref_no">
                <MarqueeLabel>Quote Reference Number</MarqueeLabel>
                <input
                  type="text"
                  required
                  value={quoteRefNo}
                  onChange={(e) => {
                    setQuoteRefNo(e.target.value);
                    setIsQuoteRefCustom(true);
                  }}
                  className={`w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2 px-3 text-sm text-slate-800 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500/20 ${getHighlightClasses('quote_ref_no')}`}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2 border-t border-slate-200/60">
              <div id="field-subject">
                <MarqueeLabel>Subject (Optional)</MarqueeLabel>
                <input
                  type="text"
                  placeholder="e.g. RO Supply and Commissioning"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className={`w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500/20 ${getHighlightClasses('subject')}`}
                />
              </div>

              <div>
                <MarqueeLabel>Customer Reference Code (Optional)</MarqueeLabel>
                <input
                  type="text"
                  placeholder="e.g. PO-8902-X / RFQ-2026"
                  value={customerReferenceCode}
                  onChange={(e) => setCustomerReferenceCode(e.target.value)}
                  className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500/20 font-mono"
                />
              </div>

              <div>
                <MarqueeLabel>Proposal Option Designation</MarqueeLabel>
                <select
                  value={proposalOption}
                  onChange={(e) => setProposalOption(e.target.value)}
                  className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500/20 font-sans"
                >
                  <option value="">None / Single Option</option>
                  <option value="Option A">Option A</option>
                  <option value="Option B">Option B</option>
                  <option value="Option C">Option C</option>
                  <option value="Option D">Option D</option>
                </select>
              </div>
            </div>

            {/* Custom Project Specifications & Information */}
            <div 
              id="field-custom_project_details" 
              className={`bg-white border border-slate-200 p-4 rounded-xl space-y-3 transition-all duration-300 ${getHighlightClasses('custom_project_details')}`}
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div className="flex items-center space-x-2">
                  <Sliders className="w-4 h-4 text-blue-600" />
                  <span className="text-xs font-bold text-slate-800 font-sans uppercase tracking-wider">
                    Custom Project Specifications & Information
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    ({customProjectDetails.filter(d => d.key.trim() || d.value.trim()).length} Specs Defined)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setCustomProjectDetails(prev => [...prev, { key: '', value: '' }])}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg border border-blue-200 transition flex items-center space-x-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Project Spec</span>
                </button>
              </div>

              {/* Quick Spec Presets */}
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-sans">
                <span className="text-slate-400 font-medium mr-1">Quick Add Presets:</span>
                {['Consultant', 'Main Contractor', 'Site Location', 'Tender Ref', 'Scope of Work', 'Delivery Terms', 'Payment Terms'].map((quickKey) => (
                  <button
                    key={quickKey}
                    type="button"
                    onClick={() => {
                      if (!customProjectDetails.some(d => d.key.toLowerCase() === quickKey.toLowerCase())) {
                        setCustomProjectDetails(prev => [...prev, { key: quickKey, value: '' }]);
                      }
                    }}
                    className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md border border-slate-200 transition font-medium cursor-pointer"
                  >
                    + {quickKey}
                  </button>
                ))}
              </div>

              {/* Active Key-Value Specs List */}
              <div className="space-y-2 pt-1">
                {customProjectDetails.map((detail, idx) => (
                  <div key={idx} className="flex items-center space-x-2 bg-slate-50/80 p-2 rounded-xl border border-slate-200">
                    <input
                      type="text"
                      placeholder="Attribute (e.g. Consultant)"
                      value={detail.key}
                      onChange={(e) => {
                        const next = [...customProjectDetails];
                        next[idx].key = e.target.value;
                        setCustomProjectDetails(next);
                      }}
                      className="w-1/3 bg-white border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs font-semibold text-slate-800 focus:outline-none focus:border-blue-500 font-sans"
                    />
                    <span className="text-slate-400 font-bold">:</span>
                    <input
                      type="text"
                      placeholder="Value (e.g. Khatib & Alami / Site Ref)"
                      value={detail.value}
                      onChange={(e) => {
                        const next = [...customProjectDetails];
                        next[idx].value = e.target.value;
                        setCustomProjectDetails(next);
                      }}
                      className="flex-1 bg-white border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500 font-sans"
                    />
                    <button
                      type="button"
                      onClick={() => setCustomProjectDetails(customProjectDetails.filter((_, i) => i !== idx))}
                      className="p-1 text-slate-400 hover:text-rose-600 rounded-lg transition shrink-0 cursor-pointer"
                      title="Remove Spec"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Section 4: Line Items Table */}
          <div id="field-line_items" className={`bg-slate-50 border border-slate-200 p-6 rounded-2xl space-y-4 ${getHighlightClasses('line_items')}`}>
            <div className="flex items-center justify-between border-b border-slate-150 pb-2 mb-2">
              <div className="flex items-center">
                <h4 className="text-xs font-mono text-slate-400 uppercase tracking-widest">
                  Proposal Line Items (Multi-Product breakdown)
                </h4>
                {renderConfidenceBadge('line_items')}
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setShowCatalogModal(true)}
                  className="py-1 px-3 bg-blue-50 border border-blue-200 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold font-sans transition flex items-center space-x-1 shadow-sm"
                  title="Fuzzy insert prefilled water treatment components from product catalogs"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>Quick Catalog Insert</span>
                </button>
                <button
                  type="button"
                  onClick={handleAddLineItem}
                  className="py-1 px-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 hover:text-slate-900 rounded-lg text-xs font-semibold font-sans transition flex items-center space-x-1 shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Item Line</span>
                </button>
              </div>
            </div>

            {lineItems.length > 0 ? (
              <div className="space-y-4">
                {lineItems.map((item, index) => (
                  <div key={index} className="bg-white border border-slate-200 p-4 rounded-xl space-y-3 shadow-sm">
                    {/* Card Header Bar */}
                    <div className="flex items-center justify-between pb-2.5 border-b border-slate-150">
                      <div className="flex items-center space-x-2">
                        <span className="w-5 h-5 rounded-full bg-slate-100 border border-slate-200 text-slate-600 font-mono text-[10px] font-bold flex items-center justify-center">
                          #{index + 1}
                        </span>
                        <span className="text-xs font-mono font-bold text-slate-600 uppercase tracking-wider">
                          Item Line #{index + 1}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveLineItem(index)}
                        className="px-2.5 py-1 bg-slate-50 border border-slate-200 hover:bg-rose-50 hover:border-rose-200 hover:text-rose-600 text-slate-500 rounded-lg transition-colors flex items-center space-x-1.5 text-xs font-sans font-medium"
                        title="Remove Line Item"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Remove Line</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                      <div>
                        <label className="flex items-center h-4 text-[9px] font-mono text-slate-400 uppercase tracking-wider mb-1">
                          Line Classification
                        </label>
                        <select
                          value={item.item_type || 'product'}
                          onChange={(e) => handleLineItemChange(index, 'item_type', e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs text-slate-700 focus:outline-none font-sans font-medium"
                        >
                          <option value="product">Product (Equipment)</option>
                          <option value="charge">Charge / Fee (Service)</option>
                          <option value="discount">Discount / Rebate</option>
                        </select>
                      </div>

                      {item.item_type === 'charge' || item.item_type === 'discount' ? (
                        <div>
                          <label className="flex items-center h-4 text-[9px] font-mono text-slate-400 uppercase tracking-wider mb-1">
                            Charge Type
                          </label>
                          <select
                            value={item.charge_type || 'Transportation'}
                            onChange={(e) => handleLineItemChange(index, 'charge_type', e.target.value)}
                            className="w-full bg-amber-50 border border-amber-200 rounded-lg py-1.5 px-2.5 text-xs text-amber-900 focus:outline-none font-sans font-semibold"
                          >
                            <option value="Transportation">Transportation / Freight</option>
                            <option value="Installation">Installation & Commissioning</option>
                            <option value="Customs">Customs & Clearance</option>
                            <option value="Testing">Testing & Inspection</option>
                            <option value="Discount">Discount / Rebate</option>
                            <option value="Other Charge">Other Non-Product Fee</option>
                          </select>
                        </div>
                      ) : (
                        <div>
                          <label className="flex items-center h-4 text-[9px] font-mono text-slate-400 uppercase tracking-wider mb-1">
                            <span>Product Type</span>
                            {renderSortButton(categoriesSort, setCategoriesSort, 'Product Categories')}
                          </label>
                          <select
                            value={item.product_type}
                            onChange={(e) => {
                              if (e.target.value === '__NEW_CATEGORY__') {
                                setInitiatingLineItemIndex(index);
                                setNewCategoryModal(true);
                              } else {
                                handleLineItemChange(index, 'product_type', e.target.value);
                              }
                            }}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs text-slate-700 focus:outline-none font-sans font-medium"
                          >
                            {sortedCategories.map((type) => (
                              <option key={type} value={type}>{type}</option>
                            ))}
                            {user.role === 'Admin' && (
                              <option value="__NEW_CATEGORY__" className="text-blue-600 font-bold font-sans">
                                + New Category...
                              </option>
                            )}
                          </select>
                        </div>
                      )}

                      <div>
                        <MarqueeLabel>Quantity</MarqueeLabel>
                        <input
                          type="number"
                          required
                          value={item.quantity}
                          onChange={(e) => handleLineItemChange(index, 'quantity', e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs text-slate-800 font-mono focus:outline-none"
                        />
                      </div>

                      <div>
                        <MarqueeLabel badge={renderSortButton(unitsSort, setUnitsSort, 'Unit Suffixes')}>Unit Suffix</MarqueeLabel>
                        <select
                          value={item.unit}
                          onChange={(e) => handleLineItemChange(index, 'unit', e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs text-slate-700 focus:outline-none font-sans"
                        >
                          {sortedUnits.map((u) => (
                            <option key={u} value={u}>{u}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <MarqueeLabel badge={
                          formCurrency === 'USD' ? (
                            <span className="text-blue-500 font-semibold text-[9px] shrink-0">(≈ {(item.unit_price * 3.6725).toFixed(2)} AED)</span>
                          ) : (
                            <span className="text-blue-500 font-semibold text-[9px] shrink-0">(≈ ${(item.unit_price / 3.6725).toFixed(2)} USD)</span>
                          )
                        }>
                          {`Unit Price (${formCurrency})`}
                        </MarqueeLabel>
                        <input
                          type="number"
                          required
                          step="0.01"
                          value={item.unit_price}
                          onChange={(e) => handleLineItemChange(index, 'unit_price', e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs text-slate-800 font-mono focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      <div>
                        <MarqueeLabel>Item Description / Design Specifications</MarqueeLabel>
                        <input
                          type="text"
                          placeholder="e.g. MMF 63''x67'', Design Pressure 10.5 Bar, ASME Stamped"
                          value={item.description}
                          onChange={(e) => handleLineItemChange(index, 'description', e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs text-slate-800 focus:outline-none"
                        />
                      </div>

                      <div>
                        <MarqueeLabel>Lead Time Availability</MarqueeLabel>
                        <input
                          type="text"
                          placeholder="e.g. 8–10 Weeks Ex-Factory"
                          value={item.lead_time_note || ''}
                          onChange={(e) => handleLineItemChange(index, 'lead_time_note', e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs text-slate-800 focus:outline-none"
                        />
                      </div>

                      <div>
                        <MarqueeLabel>Item Option Designation</MarqueeLabel>
                        <select
                          value={item.option || ''}
                          onChange={(e) => handleLineItemChange(index, 'option', e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs text-slate-700 focus:outline-none font-sans font-medium"
                        >
                          <option value="">Default / Included</option>
                          <option value="Option A">Option A</option>
                          <option value="Option B">Option B</option>
                          <option value="Option C">Option C</option>
                          <option value="Option D">Option D</option>
                        </select>
                      </div>
                    </div>

                    {/* Specification Attributes section */}
                    <div className="pt-2 border-t border-slate-100">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider font-bold">
                          Specification Attributes
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const updated = [...lineItems];
                            const attrList = [...(updated[index].attributes || [])];
                            attrList.push({ key: '', value: '' });
                            updated[index] = { ...updated[index], attributes: attrList };
                            setLineItems(updated);
                          }}
                          className="text-[10px] text-blue-600 hover:text-blue-700 font-bold flex items-center space-x-1"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Add Attribute</span>
                        </button>
                      </div>

                      {(item.attributes && item.attributes.length > 0) ? (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 p-2.5 rounded-lg bg-slate-50 border border-slate-200/60">
                          {item.attributes.map((attr, attrIdx) => {
                            const suggestedKeys = CATEGORY_SUGGESTED_ATTRIBUTES[item.product_type] || [];
                            const isCustom = attr.key && !suggestedKeys.includes(attr.key);
                            const showCustomInput = isCustom || attr.key === '__custom_editing__' || suggestedKeys.length === 0;

                            return (
                              <div key={attrIdx} className="flex items-center space-x-2 bg-white border border-slate-150 p-1.5 rounded-md shadow-sm">
                                {showCustomInput ? (
                                  <div className="min-w-[120px] max-w-[160px] flex-shrink-0 flex items-center space-x-1 bg-transparent">
                                    <input
                                      type="text"
                                      value={attr.key === '__custom_editing__' ? '' : attr.key}
                                      placeholder="Key"
                                      onChange={(e) => {
                                        const updated = [...lineItems];
                                        const attrList = [...(updated[index].attributes || [])];
                                        attrList[attrIdx] = { ...attrList[attrIdx], key: e.target.value };
                                        updated[index] = { ...updated[index], attributes: attrList };
                                        setLineItems(updated);
                                      }}
                                      className="w-full bg-transparent border-0 focus:ring-0 p-0 text-xs text-slate-800 font-semibold focus:outline-none truncate"
                                    />
                                    {suggestedKeys.length > 0 && (
                                      <button
                                        type="button"
                                        title="Back to suggestions"
                                        onClick={() => {
                                          const updated = [...lineItems];
                                          const attrList = [...(updated[index].attributes || [])];
                                          attrList[attrIdx] = { ...attrList[attrIdx], key: '' };
                                          updated[index] = { ...updated[index], attributes: attrList };
                                          setLineItems(updated);
                                        }}
                                        className="text-[9px] text-blue-500 hover:text-blue-700 font-bold px-0.5 shrink-0"
                                      >
                                        List
                                      </button>
                                    )}
                                  </div>
                                ) : (
                                  <select
                                    value={attr.key}
                                    title={attr.key || 'Select Attribute Key'}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      const updated = [...lineItems];
                                      const attrList = [...(updated[index].attributes || [])];
                                      if (val === '__custom__') {
                                        attrList[attrIdx] = { ...attrList[attrIdx], key: '__custom_editing__' };
                                      } else {
                                        attrList[attrIdx] = { ...attrList[attrIdx], key: val };
                                      }
                                      updated[index] = { ...updated[index], attributes: attrList };
                                      setLineItems(updated);
                                    }}
                                    className="min-w-[120px] max-w-[160px] flex-shrink-0 bg-transparent border-0 focus:ring-0 p-0 text-xs text-slate-800 font-semibold cursor-pointer focus:outline-none truncate"
                                  >
                                    <option value="">Select...</option>
                                    {suggestedKeys.map((k) => (
                                      <option key={k} value={k}>{k}</option>
                                    ))}
                                    <option value="__custom__">+ Custom...</option>
                                  </select>
                                )}
                                <span className="text-slate-300 text-xs shrink-0">:</span>
                                <input
                                  type="text"
                                  value={attr.value}
                                  placeholder="Value (e.g. 10m3)"
                                  onChange={(e) => {
                                    const updated = [...lineItems];
                                    const attrList = [...(updated[index].attributes || [])];
                                    attrList[attrIdx] = { ...attrList[attrIdx], value: e.target.value };
                                    updated[index] = { ...updated[index], attributes: attrList };
                                    setLineItems(updated);
                                  }}
                                  className="flex-1 min-w-0 bg-transparent border-0 focus:ring-0 p-0 text-xs text-slate-700 focus:outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = [...lineItems];
                                    const attrList = (updated[index].attributes || []).filter((_, i) => i !== attrIdx);
                                    updated[index] = { ...updated[index], attributes: attrList };
                                    setLineItems(updated);
                                  }}
                                  className="p-0.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded transition shrink-0"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-[10px] text-slate-400 italic">No specification attributes assigned to this item. Click 'Add Attribute' or select a category to load suggestions.</p>
                      )}
                    </div>

                    <div className="flex items-center justify-end text-right text-xs font-mono text-slate-400 space-x-1.5 flex-wrap gap-y-1">
                      <span className="shrink-0">Line Total ({formCurrency}):</span>
                      <input
                        type="number"
                        step="0.01"
                        value={item.total_price}
                        onChange={(e) => handleLineItemChange(index, 'total_price', e.target.value)}
                        className="w-28 bg-slate-50 border border-slate-200 rounded-lg py-1 px-2 text-xs font-semibold text-slate-800 text-right focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 shrink-0"
                      />
                      {formCurrency === 'USD' ? (
                        <span className="text-blue-500 font-semibold ml-1.5 whitespace-nowrap shrink-0">(≈ AED {(item.total_price * 3.6725).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</span>
                      ) : (
                        <span className="text-blue-500 font-semibold ml-1.5 whitespace-nowrap shrink-0">(≈ ${(item.total_price / 3.6725).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD)</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 border border-dashed border-slate-200 rounded-xl text-xs text-slate-400 font-mono bg-white">
                No items added. Click 'Add Item Line' to declare proposal specs.
              </div>
            )}
          </div>

          {/* Section 5: Value AED, status, follow-up dates */}
          <div className="bg-slate-50 border border-slate-200 p-6 rounded-2xl space-y-4">
            <h4 className="text-xs font-mono text-slate-400 uppercase tracking-widest border-b border-slate-150 pb-2 mb-2">
              Proposal State & Evaluation
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <MarqueeLabel>Enquiry Status</MarqueeLabel>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as EnquiryStatus)}
                  className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-none font-sans"
                >
                  {['Active', 'Order Received', 'Lost', 'Dead', 'Hold', 'Delayed', 'Cancelled PO'].map((st) => (
                    <option key={st} value={st}>{st}</option>
                  ))}
                </select>
              </div>

              <div>
                <MarqueeLabel>Estimated Order Date (YYYY-MM-DD)</MarqueeLabel>
                <input
                  type="date"
                  placeholder="YYYY-MM-DD"
                  value={projectedOrderDate}
                  onChange={(e) => setProjectedOrderDate(e.target.value)}
                  style={{ colorScheme: 'dark' }}
                  className="[color-scheme:dark] w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-none font-mono"
                />
              </div>

              <div>
                <MarqueeLabel>Next Follow-up Date (YYYY-MM-DD)</MarqueeLabel>
                <input
                  type="date"
                  placeholder="YYYY-MM-DD"
                  value={nextFollowupDate}
                  onChange={(e) => setNextFollowupDate(e.target.value)}
                  style={{ colorScheme: 'dark' }}
                  className="[color-scheme:dark] w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-none font-mono"
                />
              </div>

              {/* Package total value */}
              <div id="field-value">
                <MarqueeLabel badge={
                  formCurrency === 'USD' ? (
                    <span className="text-blue-500 font-semibold text-[9px] shrink-0">(≈ AED {((isLumpSum ? manualValue : computedValue) * 3.6725).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</span>
                  ) : (
                    <span className="text-blue-500 font-semibold text-[9px] shrink-0">(≈ ${((isLumpSum ? manualValue : computedValue) / 3.6725).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD)</span>
                  )
                }>
                  {`Package Value (${formCurrency})`}
                </MarqueeLabel>
                <div className={`p-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-blue-600 font-mono ${getHighlightClasses('value')}`}>
                  {isLumpSum ? (
                    <input
                      type="number"
                      value={manualValue}
                      onChange={(e) => setManualValue(Number(e.target.value))}
                      className="w-full bg-transparent border-none text-blue-600 focus:outline-none font-mono"
                    />
                  ) : (
                    <span>{formCurrency} {computedValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  )}
                </div>
                <div className="flex items-center space-x-1.5 mt-1.5">
                  <input
                    type="checkbox"
                    id="lump-sum-chk"
                    checked={isLumpSum}
                    onChange={(e) => setIsLumpSum(e.target.checked)}
                    className="rounded border-slate-200 text-blue-500 focus:ring-blue-500"
                  />
                  <label htmlFor="lump-sum-chk" className="text-[10px] text-slate-400 font-mono cursor-pointer uppercase">
                    Manual Lump-sum Override
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Section 6: Remarks & Payment Terms */}
          <div className="bg-slate-50 border border-slate-200 p-6 rounded-2xl space-y-4">
            <h4 className="text-xs font-mono text-slate-400 uppercase tracking-widest border-b border-slate-150 pb-2 mb-2">
              Commercial Terms & Remarks
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <MarqueeLabel>Remarks / Status Updates</MarqueeLabel>
                <textarea
                  rows={2}
                  placeholder="e.g. Quotation sent. Customer requested 5% discount."
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-none font-sans"
                />
              </div>

              <div className="space-y-3">
                <div>
                  <MarqueeLabel>Invoice PO #</MarqueeLabel>
                  <input
                    type="text"
                    placeholder="e.g. PO-4500989583"
                    value={invoicePoNo}
                    onChange={(e) => setInvoicePoNo(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl py-1.5 px-3 text-sm text-slate-800 focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <MarqueeLabel>Payment Status</MarqueeLabel>
                  <input
                    type="text"
                    placeholder="e.g. 50% Advance, 50% PDC"
                    value={paymentStatus}
                    onChange={(e) => setPaymentStatus(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl py-1.5 px-3 text-sm text-slate-800 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section 7: Proposal source document upload simulation */}
          <div className="bg-slate-50 border border-slate-200 p-6 rounded-2xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-150 pb-2 mb-2">
              <h4 className="text-xs font-mono text-slate-400 uppercase tracking-widest">
                Source PDF Proposal & Excel AI Data
              </h4>
              <button
                type="button"
                onClick={() => setRawTextModalOpen(true)}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-semibold text-xs rounded-xl border border-emerald-200 shadow-sm transition"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>Paste Excel Row / Raw Text</span>
              </button>
            </div>

            <div className="border-2 border-dashed border-slate-200 hover:border-blue-500 rounded-2xl p-6 text-center transition duration-150 cursor-pointer relative bg-slate-50/50">
              <input
                type="file"
                multiple
                accept="application/pdf,image/png,image/jpeg,text/plain"
                onChange={handleFileUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <Paperclip className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <div className="text-sm font-semibold text-slate-600 block font-sans">
                {uploading ? (
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <div className="flex items-center space-x-2">
                      <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                      <span>Stage 1/2: Syncing "{currentUploadingFile || 'file...'}"</span>
                    </div>
                    {uploadProgress !== null && (
                      <span className="text-xs font-mono text-blue-500 font-semibold">
                        {uploadProgress}% Uploaded
                      </span>
                    )}
                  </div>
                ) : (
                  <span>Drag and Drop or Click to Attach Quote Files</span>
                )}
              </div>
              <span className="text-[10px] text-slate-400 font-mono mt-1 block">
                Supports PDF, images, and text files (Real Storage Sync) • Click "Autofill Form" below to extract details with AI
              </span>

              {uploading && uploadProgress !== null && (
                <div className="w-full max-w-xs bg-slate-200 h-1.5 rounded-full mx-auto mt-3 overflow-hidden">
                  <div
                    className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              )}
            </div>

            {/* Persistent AI Extraction / API Key Notice Banner */}
            {extractionError && (
              <div className="bg-amber-50/90 border border-amber-200/90 rounded-2xl p-4 space-y-3 font-sans shadow-sm animate-in fade-in duration-200">
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-2.5">
                    <KeyRound className="w-4.5 h-4.5 text-amber-600 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <h5 className="text-xs font-bold text-amber-900 font-sans uppercase tracking-wider">
                        {extractionError.includes('401') || extractionError.includes('API Key') || extractionError.includes('invalid') || extractionError.includes('unconfigured')
                          ? 'Gemini API Key Required'
                          : 'AI Extraction Notice'}
                      </h5>
                      <p className="text-xs text-amber-800 leading-relaxed font-sans">
                        {extractionError}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setExtractionError(null)}
                    className="text-amber-500 hover:text-amber-700 p-1 rounded-lg hover:bg-amber-100/50 transition"
                    title="Dismiss notice"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {(extractionError.includes('401') || extractionError.includes('API Key') || extractionError.includes('Settings')) && (
                  <div className="bg-white/90 border border-amber-200/80 rounded-xl p-3 space-y-2 text-[11px] text-slate-700 font-sans shadow-2xs">
                    <p className="font-bold text-slate-800 flex items-center space-x-1.5">
                      <Info className="w-3.5 h-3.5 text-blue-600" />
                      <span>How to configure or update your Gemini API Key in AI Studio:</span>
                    </p>
                    <ol className="list-decimal list-inside space-y-1 text-slate-600 pl-1 leading-relaxed">
                      <li>Click <strong className="text-slate-800">Settings</strong> (gear icon) in the AI Studio header.</li>
                      <li>Select <strong className="text-slate-800">Secrets / API Keys</strong>.</li>
                      <li>Set <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono text-amber-800 border border-slate-200">GEMINI_API_KEY</code> with your active Gemini key.</li>
                    </ol>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={() => setShowGeminiKeyModal(true)}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs rounded-xl shadow-xs transition"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>Enter Personal Gemini API Key</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRawTextModalOpen(true)}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl shadow-xs transition"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>Use Smart Paste Instead (No API Key Required)</span>
                  </button>
                </div>
              </div>
            )}

            {/* Dynamic AI Extraction heartbeat / status ticker */}
            {isExtracting && (
              <div className="bg-blue-50 border border-blue-150 rounded-xl p-4 space-y-2.5 animate-pulse">
                <div className="flex items-center space-x-2.5">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-600 shrink-0" />
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider font-sans">Stage 2/2: AI Extraction Running</span>
                </div>
                <div className="pl-6.5 space-y-1">
                  <p className="text-xs text-blue-700 font-medium font-sans">
                    Status: <span className="text-blue-800 font-bold">{extractionStatusText}</span>
                  </p>
                  <p className="text-[10px] text-slate-500 font-mono">
                    Sending optimized context-aware payload to Gemini. Under high load, this may take up to 20s. A safety abort trigger is set for 40s.
                  </p>
                </div>
                <div className="w-full bg-blue-100 h-1 rounded-full overflow-hidden">
                  <div className="bg-blue-600 h-1 rounded-full animate-pulse w-full" />
                </div>
              </div>
            )}

            {attachments.length > 0 && (
              <div className="space-y-2">
                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">Attached files:</span>
                {attachments.map((file, idx) => (
                  <div key={idx} className="bg-white border border-slate-200 rounded-xl p-3.5 flex items-center justify-between text-xs font-mono text-slate-700">
                    <div 
                      onClick={() => {
                        setActivePreviewUrl(file.url);
                        setPreviewFileName(file.name);
                        setPreviewFileType(file.type || 'application/pdf');
                      }}
                      className="flex items-center space-x-2 truncate mr-2 cursor-pointer hover:text-blue-600 transition"
                      title="Click to preview side-by-side"
                    >
                      <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                      <span className="truncate font-sans font-medium text-slate-700 hover:underline">{file.name}</span>
                      <span className="text-[10px] text-slate-400 shrink-0">({(file.size / 1024).toFixed(1)} KB)</span>
                    </div>
                    <div className="flex items-center space-x-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setActivePreviewUrl(file.url);
                          setPreviewFileName(file.name);
                          setPreviewFileType(file.type || 'application/pdf');
                        }}
                        className={`flex items-center space-x-1 px-2 py-1 rounded-lg transition text-[10px] font-sans font-medium border ${
                          activePreviewUrl === file.url 
                            ? 'bg-blue-600 text-white border-blue-600' 
                            : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'
                        }`}
                        title="Open side-by-side preview panel"
                      >
                        <Eye className="w-3 h-3" />
                        <span>{activePreviewUrl === file.url ? 'Previewing' : 'View'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleExtractFromAttachment(file)}
                        disabled={isExtracting || uploading}
                        className="flex items-center space-x-1.5 px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg transition text-[10px] font-sans font-medium border border-blue-200 disabled:opacity-50"
                        title="AI Document Autofill: Extracts client company, line items, and attributes using Gemini AI"
                      >
                        {isExtracting ? (
                          <Loader2 className="w-3 h-3 animate-spin text-blue-600" />
                        ) : (
                          <Sparkles className="w-3 h-3 text-blue-500 fill-blue-500" />
                        )}
                        <span>{isExtracting ? 'Extracting...' : 'Autofill Form'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => removeAttachment(idx)}
                        disabled={isExtracting || uploading}
                        className="text-slate-400 hover:text-red-500 transition p-1 disabled:opacity-50"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 8: Save controls */}
          <div className="flex space-x-3 pt-4">
            {enquiryToEdit ? (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-1/2 py-3 border border-slate-200 hover:bg-slate-50 text-slate-600 font-semibold rounded-xl text-sm transition text-center"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  onClick={() => updateSubmitMode('close')}
                  className="w-1/2 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold rounded-xl text-sm transition shadow-sm text-center flex items-center justify-center"
                >
                  {isSubmitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  {isSubmitting ? 'Saving Changes...' : 'Save Changes'}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={onClose}
                  className="w-1/3 py-3 border border-slate-200 hover:bg-slate-50 disabled:opacity-50 text-slate-600 font-semibold rounded-xl text-sm transition text-center"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  onClick={() => updateSubmitMode('another')}
                  className="w-1/3 py-3 border border-blue-200 bg-blue-50/50 hover:bg-blue-50 disabled:opacity-50 text-blue-700 font-semibold rounded-xl text-sm transition shadow-sm text-center flex items-center justify-center"
                >
                  {isSubmitting && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}
                  {isSubmitting ? 'Saving...' : 'Register & Add Another'}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  onClick={() => updateSubmitMode('close')}
                  className="w-1/3 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold rounded-xl text-sm transition shadow-sm text-center flex items-center justify-center"
                >
                  {isSubmitting && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}
                  {isSubmitting ? 'Registering...' : 'Register & Close'}
                </button>
              </>
            )}
          </div>

        </form>
        </div>
      </div>

      {/* Inline Create New Company Modal overlay */}
      {newCompanyModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-bold text-slate-800 font-sans uppercase tracking-wider">
                {isEditingCompany ? 'Edit Company Account' : 'Create New Company Account'}
              </h3>
              <button
                type="button"
                onClick={() => setNewCompanyModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              <div>
                <MarqueeLabel required>Company Name</MarqueeLabel>
                <input
                  type="text"
                  required
                  placeholder="e.g. Al Naboodah"
                  value={subCompanyName}
                  onChange={(e) => setSubCompanyName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <MarqueeLabel>Legal Suffix</MarqueeLabel>
                  <select
                    value={subLegalSuffix}
                    onChange={(e) => setSubLegalSuffix(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-none font-sans"
                  >
                    {['LLC', 'FZE', 'FZCO', 'PJSC', 'JSC', 'Corp', 'Ltd', 'None / Other'].map((suf) => (
                      <option key={suf} value={suf}>{suf}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <MarqueeLabel required>City/State</MarqueeLabel>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Dubai"
                    value={subCity}
                    onChange={(e) => setSubCity(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <MarqueeLabel required>Country</MarqueeLabel>
                  <input
                    type="text"
                    required
                    placeholder="e.g. UAE"
                    value={subCountry}
                    onChange={(e) => setSubCountry(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-none"
                  />
                </div>
                <div>
                  <MarqueeLabel>General Phone</MarqueeLabel>
                  <input
                    type="text"
                    placeholder="e.g. +971 4 123 4567"
                    value={subGeneralPhone}
                    onChange={(e) => setSubGeneralPhone(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div>
                <MarqueeLabel>General Email</MarqueeLabel>
                <input
                  type="email"
                  placeholder="e.g. procurement@alnaboodah.com"
                  value={subGeneralEmail}
                  onChange={(e) => setSubGeneralEmail(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-none font-mono"
                />
              </div>

              <div>
                <MarqueeLabel>Internal Remarks</MarqueeLabel>
                <textarea
                  rows={2}
                  placeholder="Key relationships, legacy accounts, etc."
                  value={subNotes}
                  onChange={(e) => setSubNotes(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-none font-sans"
                />
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex space-x-3">
              <button
                type="button"
                onClick={() => setNewCompanyModal(false)}
                className="w-1/2 py-2 border border-slate-200 hover:bg-white text-slate-600 rounded-xl text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!subCompanyName.trim() || !subCity.trim() || !subCountry.trim()) {
                    alert('Please fill out Name, City, and Country fields.');
                    return;
                  }
                  
                  const display_name = subLegalSuffix === 'None / Other' ? subCompanyName.trim() : `${subCompanyName.trim()} ${subLegalSuffix}`;

                  if (isEditingCompany) {
                    if (!companyId) return;
                    try {
                      const updatePayload = {
                        display_name,
                        aliases: [subCompanyName.trim()],
                        legal_suffix: subLegalSuffix,
                        city: subCity.trim(),
                        country: subCountry.trim(),
                        general_phone: subGeneralPhone.trim() || undefined,
                        general_email: subGeneralEmail.trim() || undefined,
                        notes: subNotes.trim() || undefined,
                        last_modified_by_uid: user?.uid || '',
                        last_modified_by_name: user?.username || user?.full_name || user?.email || 'Unknown User',
                        updatedAt: new Date().toISOString()
                      };
                      await safeUpdateDoc('companies', companyId, updatePayload);
                      await logAudit(companyId, 'company', 'update', null, updatePayload, []);
                      
                      if (setCompanies) {
                        setCompanies((prev) => prev.map((c) => (c.id === companyId ? { ...c, ...updatePayload } : c)));
                      }

                      setCompanySearch(display_name);
                      setCountry(subCountry.trim());
                      setProjectLocation(subCity.trim());

                      setNewCompanyModal(false);
                      if (triggerToast) {
                        triggerToast('Company account updated successfully.', 'success');
                      }
                    } catch (err: any) {
                      console.error('Failed to update company inline:', err);
                      alert('Error updating company: ' + err.message);
                    }
                    return;
                  }

                  // Check duplicate displayName
                  const exists = companies.find(c => c.display_name.toLowerCase() === display_name.toLowerCase());
                  if (exists) {
                    alert(`An account with the name "${display_name}" already exists.`);
                    setCompanyId(exists.id!);
                    setCompanySearch(exists.display_name);
                    setCountry(exists.country);
                    setProjectLocation(exists.city);
                    setNewCompanyModal(false);
                    return;
                  }

                  try {
                    if (!activeWorkspace?.id) {
                      throw new Error("Critical Error: Active workspace context lost. Cannot save record.");
                    }
                    const newCompPayload = {
                      workspace_id: activeWorkspace.id,
                      display_name,
                      aliases: [subCompanyName.trim()],
                      legal_suffix: subLegalSuffix,
                      city: subCity.trim(),
                      country: subCountry.trim(),
                      general_phone: subGeneralPhone.trim() || undefined,
                      general_email: subGeneralEmail.trim() || undefined,
                      notes: subNotes.trim() || undefined,
                      created_by_uid: user?.uid || '',
                      created_by_name: user?.username || user?.full_name || user?.email || 'Unknown User',
                      last_modified_by_uid: user?.uid || '',
                      last_modified_by_name: user?.username || user?.full_name || user?.email || 'Unknown User',
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString()
                    };

                    const docId = await safeAddDoc('companies', newCompPayload);
                    
                    // Log audit
                    await logAudit(docId.id, 'company', 'create', null, newCompPayload, []);

                    if (setCompanies) {
                      const newCompObj: Company = { id: docId.id, canonical_name: display_name, ...newCompPayload };
                      setCompanies((prev) => [newCompObj, ...prev.filter((c) => c.id !== docId.id)]);
                    }

                    setCompanyId(docId.id);
                    setCompanySearch(display_name);
                    setCountry(subCountry.trim());
                    setProjectLocation(subCity.trim());
                    
                    // Reset fields
                    setSubCompanyName('');
                    setSubCity('');
                    setSubCountry('UAE');
                    setSubGeneralPhone('');
                    setSubGeneralEmail('');
                    setSubNotes('');
                    setNewCompanyModal(false);
                  } catch (err) {
                    console.error('Failed to create company inline:', err);
                    alert('Error creating company. Please try again.');
                  }
                }}
                className="w-1/2 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition shadow-sm"
              >
                {isEditingCompany ? 'Save Changes' : 'Create Account'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inline Create New Contact Modal overlay */}
      {showNewContactModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-bold text-slate-800 font-sans uppercase tracking-wider">
                {isEditingContact ? 'Edit Contact Personnel' : 'Add Contact Personnel'}
              </h3>
              <button
                type="button"
                onClick={() => setShowNewContactModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              <div>
                <MarqueeLabel required>Full Name</MarqueeLabel>
                <input
                  type="text"
                  required
                  placeholder="e.g. John Doe"
                  value={subContactName}
                  onChange={(e) => setSubContactName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-none"
                />
              </div>

              <div>
                <MarqueeLabel>Designation / Role</MarqueeLabel>
                <input
                  type="text"
                  placeholder="e.g. Procurement Manager"
                  value={subContactDesignation}
                  onChange={(e) => setSubContactDesignation(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <MarqueeLabel>Mobile Number</MarqueeLabel>
                  <input
                    type="text"
                    placeholder="e.g. +971 50 123 4567"
                    value={subContactMobile}
                    onChange={(e) => setSubContactMobile(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <MarqueeLabel>Email Address</MarqueeLabel>
                  <input
                    type="email"
                    placeholder="e.g. john.doe@domain.com"
                    value={subContactEmail}
                    onChange={(e) => setSubContactEmail(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <input
                  type="checkbox"
                  id="sub-contact-primary"
                  checked={subContactIsPrimary}
                  onChange={(e) => setSubContactIsPrimary(e.target.checked)}
                  className="rounded border-slate-200 text-blue-500 focus:ring-blue-500"
                />
                <label htmlFor="sub-contact-primary" className="text-xs text-slate-500 font-sans cursor-pointer">
                  Mark as Primary Contact for this Account
                </label>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex space-x-3">
              <button
                type="button"
                onClick={() => setShowNewContactModal(false)}
                className="w-1/2 py-2 border border-slate-200 hover:bg-white text-slate-600 rounded-xl text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!subContactName.trim()) {
                    alert('Please enter a full name for the contact person.');
                    return;
                  }
                  if (!companyId) {
                    alert('No company is selected.');
                    return;
                  }

                  if (isEditingContact) {
                    if (!contactId) return;
                    try {
                      const updateContactPayload = {
                        company_id: companyId,
                        full_name: subContactName.trim(),
                        designation: subContactDesignation.trim() || undefined,
                        mobile: subContactMobile.trim() || undefined,
                        email: subContactEmail.trim() || undefined,
                        is_primary: subContactIsPrimary,
                        last_modified_by_uid: user?.uid || '',
                        last_modified_by_name: user?.username || user?.full_name || user?.email || 'Unknown User',
                        updatedAt: new Date().toISOString()
                      };
                      await safeUpdateDoc('contacts', contactId, updateContactPayload);
                      await logAudit(contactId, 'contact', 'update', null, updateContactPayload, []);
                      
                      setShowNewContactModal(false);
                      if (triggerToast) {
                        triggerToast('Contact personnel updated successfully.', 'success');
                      }
                    } catch (err: any) {
                      console.error('Failed to update contact inline:', err);
                      alert('Error updating contact: ' + err.message);
                    }
                    return;
                  }

                  try {
                    if (!activeWorkspace?.id) {
                      throw new Error("Critical Error: Active workspace context lost. Cannot save record.");
                    }
                    const newContactPayload = {
                      workspace_id: activeWorkspace.id,
                      company_id: companyId,
                      full_name: subContactName.trim(),
                      designation: subContactDesignation.trim() || undefined,
                      mobile: subContactMobile.trim() || undefined,
                      email: subContactEmail.trim() || undefined,
                      is_primary: subContactIsPrimary,
                      created_by_uid: user?.uid || '',
                      created_by_name: user?.username || user?.full_name || user?.email || 'Unknown User',
                      last_modified_by_uid: user?.uid || '',
                      last_modified_by_name: user?.username || user?.full_name || user?.email || 'Unknown User',
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString()
                    };

                    const docId = await safeAddDoc('contacts', newContactPayload);
                    
                    // Log audit
                    await logAudit(docId.id, 'contact', 'create', null, newContactPayload, []);

                    const createdContactObj: Contact = {
                      id: docId.id,
                      company_id: companyId,
                      full_name: subContactName.trim(),
                      designation: subContactDesignation.trim() || undefined,
                      mobile: subContactMobile.trim() || undefined,
                      email: subContactEmail.trim() || undefined,
                      is_primary: subContactIsPrimary,
                      createdAt: new Date().toISOString()
                    };

                    if (setContacts) {
                      setContacts((prev) => [createdContactObj, ...prev]);
                    }

                    setContactId(docId.id);
                    if (triggerToast) {
                      triggerToast(`Contact "${subContactName.trim()}" added successfully.`, 'success');
                    }

                    // Reset contact states
                    setSubContactName('');
                    setSubContactDesignation('');
                    setSubContactMobile('');
                    setSubContactEmail('');
                    setSubContactIsPrimary(false);
                    setShowNewContactModal(false);
                  } catch (err) {
                    console.error('Failed to create contact inline:', err);
                    alert('Error creating contact person.');
                  }
                }}
                className="w-1/2 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition shadow-sm"
              >
                {isEditingContact ? 'Save Changes' : 'Add Personnel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inline Create New Category Modal overlay (Admin privilege protection) */}
      {newCategoryModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-bold text-slate-800 font-sans uppercase tracking-wider flex items-center gap-2">
                <Plus className="w-4 h-4 text-blue-600" />
                <span>Add Product Category</span>
              </h3>
              <button
                type="button"
                onClick={() => {
                  setNewCategoryModal(false);
                  setNewCategoryName('');
                  setInitiatingLineItemIndex(null);
                }}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              {/* Security info card to keep catalog from fragmenting */}
              <div className="p-3.5 bg-amber-50/75 border border-amber-200 rounded-xl flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-800 font-sans leading-relaxed">
                  <p className="font-semibold text-amber-900 mb-0.5">Administrator privilege</p>
                  <p>
                    Adding new product categories is restricted to prevent catalog fragmentation. Ensure this category is distinctly required and doesn't duplicate existing ones.
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-widest mb-1">
                  Category Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Aeration Systems"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-none font-sans"
                />
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex space-x-3">
              <button
                type="button"
                onClick={() => {
                  setNewCategoryModal(false);
                  setNewCategoryName('');
                  setInitiatingLineItemIndex(null);
                }}
                className="w-1/2 py-2 border border-slate-200 hover:bg-white text-slate-600 rounded-xl text-xs font-semibold transition font-sans"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submittingCategory}
                onClick={async () => {
                  const cleaned = newCategoryName.trim();
                  if (!cleaned) {
                    alert('Please enter a category name.');
                    return;
                  }

                  // Avoid duplicates
                  const lower = cleaned.toLowerCase();
                  const exists = activeCategories.some(c => c.toLowerCase() === lower);
                  if (exists) {
                    alert(`The category "${cleaned}" already exists in the catalog.`);
                    // If it exists, just update the initiating line item type to it
                    const found = activeCategories.find(c => c.toLowerCase() === lower) || cleaned;
                    if (initiatingLineItemIndex !== null) {
                      handleLineItemChange(initiatingLineItemIndex, 'product_type', found);
                    }
                    setNewCategoryModal(false);
                    setNewCategoryName('');
                    setInitiatingLineItemIndex(null);
                    return;
                  }

                  try {
                    setSubmittingCategory(true);
                    
                    // Create in Firestore dropdown options
                    const docRef = await safeAddDoc('dropdown_product_categories', { name: cleaned });
                    const newOptId = docRef?.id || ('cat_' + Date.now());
                    const newOpt: DropdownOption = { id: newOptId, name: cleaned };

                    // Sync parent App state so Settings, Product Manager, etc. immediately reflect the new category
                    if (setProductCategories) {
                      setProductCategories((prev) => {
                        if (prev.some(c => c.name.toLowerCase() === lower)) return prev;
                        return [...prev, newOpt];
                      });
                    }

                    // Sync form local state
                    setExtraCategories((prev) => prev.includes(cleaned) ? prev : [...prev, cleaned]);

                    // Log audit
                    await logAudit(cleaned, 'enquiry', 'update', null, { added_product_category: cleaned }, []);

                    // Update the active line item that requested this
                    if (initiatingLineItemIndex !== null) {
                      handleLineItemChange(initiatingLineItemIndex, 'product_type', cleaned);
                    }

                    if (triggerToast) {
                      triggerToast(`Successfully added "${cleaned}" to product categories.`, 'success');
                    }

                    // Reset and close
                    setNewCategoryModal(false);
                    setNewCategoryName('');
                    setInitiatingLineItemIndex(null);
                  } catch (err) {
                    console.error('Failed to create new product category:', err);
                    alert('Error creating product category.');
                  } finally {
                    setSubmittingCategory(false);
                  }
                }}
                className="w-1/2 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-400 text-white rounded-xl text-xs font-semibold transition shadow-sm font-sans flex items-center justify-center gap-1.5"
              >
                {submittingCategory && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Add Category</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Product Catalog Modal */}
      {showCatalogModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-4xl w-full border border-slate-200 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-lg font-bold text-slate-900 font-sans">
                  {BRAND_CONFIG.catalogTitle}
                </h3>
                <p className="text-xs text-slate-400 font-sans mt-0.5">
                  Select a pre-configured component with specs, standard pricing, and availability.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCatalogModal(false)}
                className="p-1 hover:bg-slate-100 rounded-md text-slate-400 hover:text-slate-600 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Filter and Search Bar */}
            <div className="p-4 bg-slate-50 border-b border-slate-100 flex flex-col sm:flex-row gap-3 shrink-0 font-sans">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by product name or description..."
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl py-2 px-9 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-500"
                />
                {catalogSearch && (
                  <button
                    onClick={() => setCatalogSearch('')}
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="w-full sm:w-56">
                <select
                  value={catalogCategory}
                  onChange={(e) => setCatalogCategory(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-sm text-slate-700 focus:outline-none focus:border-blue-500"
                >
                  <option value="All">All Categories</option>
                  {[
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
                  ].map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Catalog Grid/List */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50">
              {filteredCatalog.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredCatalog.map((item) => {
                    const convertedPrice = formCurrency === 'USD' ? item.unit_price_aed / 3.6725 : item.unit_price_aed;
                    return (
                      <div
                        key={item.name}
                        className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs hover:border-blue-300 hover:shadow-md transition duration-150 flex flex-col justify-between"
                      >
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span className="inline-block px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-[9px] font-mono uppercase font-bold">
                                {item.product_type}
                              </span>
                              <h4 className="text-sm font-bold text-slate-900 mt-1 font-sans">{item.name}</h4>
                            </div>
                            <div className="text-right font-mono">
                              <span className="text-xs text-slate-400 block">Prefilled Unit Price</span>
                              <span className="text-sm font-bold text-emerald-600 block">
                                {formCurrency} {convertedPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            </div>
                          </div>

                          <p className="text-xs text-slate-500 font-sans line-clamp-3">
                            {item.description}
                          </p>

                          <div className="grid grid-cols-2 gap-2 pt-2 text-[10px] border-t border-slate-100 font-mono text-slate-400">
                            <div>
                              <span className="font-semibold text-slate-500">Unit:</span> {item.unit}
                            </div>
                            {item.lead_time_note && (
                              <div className="truncate">
                                <span className="font-semibold text-slate-500">Delivery:</span> {item.lead_time_note}
                              </div>
                            )}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleAddCatalogItem(item)}
                          className="mt-4 w-full py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition shadow-xs flex items-center justify-center space-x-1"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add to Proposal</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-12 text-center text-slate-400 font-sans">
                  No products matched your filters. Try search keywords like "RO", "Vessel", "WIKA" etc.
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-100 border-t border-slate-200 flex items-center justify-between shrink-0 font-mono text-[10px] text-slate-400">
              <span>* Pricing converted in real-time from AED to USD if USD is selected.</span>
              <button
                type="button"
                onClick={() => setShowCatalogModal(false)}
                className="py-2 px-4 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-slate-700 font-semibold font-sans text-xs transition"
              >
                Close Catalog
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Raw Excel Row / RFQ Text AI Paste Modal */}
      {rawTextModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                <h3 className="text-base font-bold text-slate-800 font-sans">
                  AI Paste Raw Excel Row / RFQ Text
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setRawTextModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed font-sans">
              Copy a row directly from Excel or paste any raw RFQ text below. The AI will parse tab-delimited columns (Serial No, Quote Ref, Dates, Company, Contact Name, Email, Phone, Country, Location), specifications, and multi-line commercial pricing tables directly into structured form fields.
            </p>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-[11px] font-mono text-slate-500 uppercase font-semibold">
                  Raw Text / Tab-Delimited Excel Row
                </label>
                <button
                  type="button"
                  onClick={() => setRawTextInput(SAMPLE_EXCEL_ROW)}
                  className="text-[11px] font-sans font-semibold text-blue-600 hover:text-blue-700 hover:underline flex items-center space-x-1"
                >
                  <Sparkles className="w-3 h-3 text-blue-600" />
                  <span>Load Sample Excel Row</span>
                </button>
              </div>
              <textarea
                rows={10}
                value={rawTextInput}
                onChange={(e) => setRawTextInput(e.target.value)}
                placeholder="Paste raw Excel row or RFQ text here (e.g. 2792  2751-300626AA  Jul-2026...)"
                className="w-full bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 rounded-xl p-3 font-mono text-xs text-slate-800 focus:outline-none resize-y"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setRawTextInput('')}
                className="px-3 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 font-sans"
              >
                Clear
              </button>

              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={() => setRawTextModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 font-semibold text-xs rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleExtractFromRawText()}
                  disabled={isExtracting || !rawTextInput.trim()}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl shadow-sm transition flex items-center space-x-1.5 disabled:opacity-50"
                >
                  {isExtracting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Parsing Data...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5 text-emerald-200 fill-emerald-200" />
                      <span>Parse Excel Data with AI</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Registration Modal for Unregistered Entities */}
      {showConfirmRegistrationModal && unregisteredEntities && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white border border-amber-200 rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-gradient-to-r from-amber-500 to-amber-600 text-white p-4 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-5 h-5 text-amber-200 fill-amber-200" />
                <h3 className="text-base font-bold font-sans">
                  Confirm Entity Registration & Field Mapping
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowConfirmRegistrationModal(false)}
                className="p-1 text-amber-100 hover:text-white rounded-lg hover:bg-amber-600/50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5 bg-slate-50 flex-1">
              <p className="text-xs text-slate-600 leading-relaxed font-sans">
                The AI detected an unregistered company or contact person in the pasted text. Review and map the extracted details below to register them directly into your database catalog.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Column 1: Company Profile */}
                <div className="bg-white border border-slate-200 p-4 rounded-xl space-y-3 shadow-2xs">
                  <div className="flex items-center space-x-2 border-b border-slate-100 pb-2">
                    <Building className="w-4 h-4 text-amber-600" />
                    <span className="text-xs font-bold text-slate-800 font-sans">Company Profile</span>
                  </div>

                  <div>
                    <label className="text-[10px] font-mono uppercase text-slate-400 font-semibold block mb-1">Company Display Name</label>
                    <input
                      type="text"
                      value={unregisteredEntities.companyName || ''}
                      onChange={(e) => setUnregisteredEntities({ ...unregisteredEntities, companyName: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs text-slate-800 focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-mono uppercase text-slate-400 font-semibold block mb-1">Legal Suffix</label>
                      <input
                        type="text"
                        value={unregisteredEntities.legalSuffix || 'LLC'}
                        onChange={(e) => setUnregisteredEntities({ ...unregisteredEntities, legalSuffix: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs text-slate-800 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-mono uppercase text-slate-400 font-semibold block mb-1">Country</label>
                      <input
                        type="text"
                        value={unregisteredEntities.country || 'UAE'}
                        onChange={(e) => setUnregisteredEntities({ ...unregisteredEntities, country: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs text-slate-800 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-mono uppercase text-slate-400 font-semibold block mb-1">City / Location</label>
                    <input
                      type="text"
                      value={unregisteredEntities.city || ''}
                      onChange={(e) => setUnregisteredEntities({ ...unregisteredEntities, city: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs text-slate-800 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                {/* Column 2: Contact Person */}
                <div className="bg-white border border-slate-200 p-4 rounded-xl space-y-3 shadow-2xs">
                  <div className="flex items-center space-x-2 border-b border-slate-100 pb-2">
                    <User className="w-4 h-4 text-amber-600" />
                    <span className="text-xs font-bold text-slate-800 font-sans">Contact Person</span>
                  </div>

                  <div>
                    <label className="text-[10px] font-mono uppercase text-slate-400 font-semibold block mb-1">Full Name</label>
                    <input
                      type="text"
                      value={unregisteredEntities.contactName || ''}
                      onChange={(e) => setUnregisteredEntities({ ...unregisteredEntities, contactName: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs text-slate-800 focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-mono uppercase text-slate-400 font-semibold block mb-1">Contact Email</label>
                    <input
                      type="email"
                      value={unregisteredEntities.contactEmail || ''}
                      onChange={(e) => setUnregisteredEntities({ ...unregisteredEntities, contactEmail: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs text-slate-800 focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-mono uppercase text-slate-400 font-semibold block mb-1">Contact Mobile / Phone</label>
                    <input
                      type="text"
                      value={unregisteredEntities.contactMobile || ''}
                      onChange={(e) => setUnregisteredEntities({ ...unregisteredEntities, contactMobile: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs text-slate-800 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
              </div>

              {/* Destination Routing Controls */}
              <div className="bg-amber-50/80 border border-amber-200 p-4 rounded-xl space-y-2">
                <span className="text-xs font-bold text-amber-900 font-sans block">
                  Interactive Routing Assignments:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="flex items-center justify-between bg-white p-2.5 rounded-lg border border-amber-200">
                    <span className="font-medium text-slate-700">Route Email ({unregisteredEntities.contactEmail || 'N/A'}) to:</span>
                    <div className="flex rounded-md overflow-hidden border border-amber-300">
                      <button
                        type="button"
                        onClick={() => setUnregisteredEntities({ ...unregisteredEntities, emailDestination: 'contact' })}
                        className={`px-2 py-0.5 text-[10px] font-bold ${unregisteredEntities.emailDestination === 'contact' ? 'bg-amber-600 text-white' : 'bg-white text-slate-600'}`}
                      >
                        Contact
                      </button>
                      <button
                        type="button"
                        onClick={() => setUnregisteredEntities({ ...unregisteredEntities, emailDestination: 'company' })}
                        className={`px-2 py-0.5 text-[10px] font-bold ${unregisteredEntities.emailDestination === 'company' ? 'bg-amber-600 text-white' : 'bg-white text-slate-600'}`}
                      >
                        Company
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between bg-white p-2.5 rounded-lg border border-amber-200">
                    <span className="font-medium text-slate-700">Route Phone ({unregisteredEntities.contactMobile || 'N/A'}) to:</span>
                    <div className="flex rounded-md overflow-hidden border border-amber-300">
                      <button
                        type="button"
                        onClick={() => setUnregisteredEntities({ ...unregisteredEntities, phoneDestination: 'contact' })}
                        className={`px-2 py-0.5 text-[10px] font-bold ${unregisteredEntities.phoneDestination === 'contact' ? 'bg-amber-600 text-white' : 'bg-white text-slate-600'}`}
                      >
                        Contact
                      </button>
                      <button
                        type="button"
                        onClick={() => setUnregisteredEntities({ ...unregisteredEntities, phoneDestination: 'company' })}
                        className={`px-2 py-0.5 text-[10px] font-bold ${unregisteredEntities.phoneDestination === 'company' ? 'bg-amber-600 text-white' : 'bg-white text-slate-600'}`}
                      >
                        Company
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-100 border-t border-slate-200 flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={() => setShowConfirmRegistrationModal(false)}
                className="px-4 py-2 border border-slate-300 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition font-sans"
              >
                Skip / Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  await handleConfirmRegisterEntities();
                  setShowConfirmRegistrationModal(false);
                }}
                className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center space-x-1.5 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4 text-white" />
                <span>Confirm & Register Entities to Catalog</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Duplicate Fuzzy Match Warning Modal */}
      {duplicateMatchState && duplicateMatchState.isOpen && (
        <DuplicateMatchModal
          isOpen={duplicateMatchState.isOpen}
          type={duplicateMatchState.type}
          candidateName={duplicateMatchState.candidateName}
          existingRecordName={duplicateMatchState.existingRecordName}
          matchReason={duplicateMatchState.matchReason}
          similarityScore={duplicateMatchState.similarityScore}
          existingDetails={duplicateMatchState.existingDetails}
          newDetails={duplicateMatchState.newDetails}
          onMerge={duplicateMatchState.onMerge}
          onKeepNew={duplicateMatchState.onKeepNew}
          onIgnore={duplicateMatchState.onIgnore}
          onCancel={() => setDuplicateMatchState(null)}
        />
      )}

      {/* Personal Gemini API Key Modal */}
      <GeminiKeyModal
        isOpen={showGeminiKeyModal}
        onClose={() => setShowGeminiKeyModal(false)}
        triggerToast={triggerToast}
        onKeySaved={() => {
          setExtractionError(null);
        }}
      />

    </div>
  );
}
